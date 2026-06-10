import axios, { type AxiosInstance } from 'axios';
import { injectable, singleton } from 'tsyringe';
import { BcbUnavailableError, CdiNaoDisponivelError } from '../errors/BcbUnavailableError.js';
import RetryExecutor from '../libs/executor/RetryExecutor.js';

export interface CdiSnapshot {
    cdiAnual: number;
    fonte: string;
}

const SGS_BASE_URL = 'https://api.bcb.gov.br/dados/serie';
const CDI_ANUAL_SERIES = 4389; // CDI anualizado (taxa over linkada anualizada)
/**
 * Series 4389 publishes only on the days the rate changes (not daily).
 * To find the rate effective at `dataBase` we query the previous N days
 * and pick the latest entry whose date is on or before `dataBase`.
 */
const LOOKBACK_DAYS = 30;

const formatYmd = (d: Date): string => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const formatBcbDate = (d: Date): string => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${day}/${m}/${y}`;
};

/**
 * BCB SGS read-only client for CDI fetches. Stateless in v0.1 (Q4.4):
 * every call hits the BCB endpoint inside a RetryExecutor wrapper. v0.2
 * will introduce a TTL cache (DynamoDB) — until then, hard error on
 * outage propagates to the caller (INV-6).
 *
 * Auditability: `fonte` always carries the series id and the dataBase
 * the caller asked for, e.g. `BCB:SGS:4389@2026-04-30`. This string is
 * persisted alongside the snapshot so downstream readers know exactly
 * which day's index was used.
 *
 * **PTAX removed (ADR-0020 Addendum #12 / `vc-moedas-cmn156`, 2026-06-07).**
 * The Variação Cambial cotação path migrated from BCB SGS PTAX to the
 * Conexos `cmn156` route, so `getPtaxVenda` and the PTAX series map were
 * deleted (G3). Only the CDI path (series 4389) remains here.
 */
@singleton()
@injectable()
export default class BcbClient {
    private http: AxiosInstance;
    private retryExecutor: RetryExecutor;

    constructor() {
        this.http = axios.create({ baseURL: SGS_BASE_URL, timeout: 10_000 });
        this.retryExecutor = new RetryExecutor({
            retries: 2,
            delayMs: 500,
            shouldLog: true,
        });
    }

    public getCdiAnualSnapshot = async (dataBase: Date): Promise<CdiSnapshot> => {
        const dataIso = formatYmd(dataBase);
        const dataBr = formatBcbDate(dataBase);
        const lookbackStart = new Date(dataBase);
        lookbackStart.setUTCDate(lookbackStart.getUTCDate() - LOOKBACK_DAYS);
        const lookbackBr = formatBcbDate(lookbackStart);
        // BCB SGS uses `bcdata.sgs.<seriesId>` (dot, not slash) as path segment.
        const url = `/bcdata.sgs.${CDI_ANUAL_SERIES}/dados`;

        try {
            const data = await this.retryExecutor.execute(async () => {
                const res = await this.http.get<Array<{ data: string; valor: string }>>(url, {
                    params: {
                        formato: 'json',
                        dataInicial: lookbackBr,
                        dataFinal: dataBr,
                    },
                });
                return res.data;
            });

            if (!Array.isArray(data) || data.length === 0) {
                throw new CdiNaoDisponivelError(
                    `BCB SGS series ${CDI_ANUAL_SERIES} returned no rows for lookback ` +
                        `${formatYmd(lookbackStart)} → ${dataIso}`,
                );
            }

            // Series 4389 only publishes on rate-change days. Pick the most
            // recent entry whose date is on or before dataBase.
            const dataBaseMs = dataBase.getTime();
            const eligible = data.filter((entry) => {
                const [d, m, y] = entry.data.split('/').map(Number);
                return Date.UTC(y, m - 1, d) <= dataBaseMs;
            });
            const chosen =
                eligible.length > 0 ? eligible[eligible.length - 1] : data[data.length - 1];

            const valor = Number.parseFloat(chosen.valor);
            if (!Number.isFinite(valor)) {
                throw new CdiNaoDisponivelError(
                    `BCB SGS series ${CDI_ANUAL_SERIES} returned non-numeric value: ${chosen.valor}`,
                );
            }

            // `fonte` carries the ISO date that was effective for this snapshot.
            // When the chosen entry is older than `dataBase` (rate hasn't
            // changed since), we still report `dataBase` as the snapshot
            // anchor — auditability "what CDI applied at this point".
            return {
                cdiAnual: valor,
                fonte: `BCB:SGS:${CDI_ANUAL_SERIES}@${dataIso}`,
            };
        } catch (error) {
            if (error instanceof CdiNaoDisponivelError) throw error;
            // Resilience: env-var fallback quando BCB SGS está fora (503/504).
            // Útil em dev e em outages prolongadas do upstream. Em produção,
            // deixar a env var unset preserva o comportamento de hard-error.
            const fallback = process.env.BCB_CDI_FALLBACK;
            if (fallback) {
                const fallbackValue = Number.parseFloat(fallback);
                if (Number.isFinite(fallbackValue)) {
                    return {
                        cdiAnual: fallbackValue,
                        fonte: `BCB_FALLBACK_ENV@${dataIso}`,
                    };
                }
            }
            throw new BcbUnavailableError(
                `BCB SGS unavailable for ${dataIso}: ${(error as Error).message}`,
                error,
            );
        }
    };
}
