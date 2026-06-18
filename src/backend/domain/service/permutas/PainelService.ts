import { inject, injectable } from 'tsyringe';
import { LOG_TYPE } from '../../interface/log/LogInterface.js';
import PermutaSnapshotRepository, {
    type PermutaCandidataSnapshotRow,
} from '../../repository/permutas/PermutaSnapshotRepository.js';
import LogService from '../LogService.js';

export interface PainelItem {
    docCod: string;
    priCod: string;
    status: 'elegivel' | 'bloqueada';
    motivoBloqueio?: string;
    /** ⏸ GATED-P0-4 — `null` ("pendente") quando a data-base não foi lida. */
    aging: number | null;
    invoiceDocCod?: string;
    variacaoClassificacao?: string;
    variacaoResultado?: number;
}

export interface PainelResponse {
    runId?: string;
    snapshotAge?: number;
    totalElegiveis: number;
    totalBloqueadas: number;
    items: PainelItem[];
}

/**
 * PainelService — ação `exporNoPainel` (READ-ONLY puro).
 *
 * Ontology: `ontology/actions/expor-no-painel.md`. Lê o ÚLTIMO snapshot
 * persistido (elegíveis + bloqueadas com motivo + aging). Ordena por aging
 * (mais antigo primeiro); itens sem aging (⏸ GATED-P0-4) ficam num bucket
 * estável ao final. Sem snapshot → resposta vazia + BUSINESS_WARN (não 500).
 * NENHUMA ação de execução (I1/I4 — execução é Fatia 2).
 */
@injectable()
export default class PainelService {
    constructor(
        @inject(PermutaSnapshotRepository)
        private snapshotRepository: PermutaSnapshotRepository,
        @inject(LogService) private logService: LogService,
    ) {}

    public exporNoPainel = async (requestId: string): Promise<PainelResponse> => {
        const snapshot = await this.snapshotRepository.findLatestSnapshot();

        if (!snapshot) {
            await this.logService.warn({
                type: LOG_TYPE.BUSINESS_WARN,
                message: 'no snapshot available',
                data: { requestId },
            });
            return { totalElegiveis: 0, totalBloqueadas: 0, items: [] };
        }

        const items = snapshot.rows.map((r) => this.toItem(r)).sort(this.byAging);
        const totalElegiveis = items.filter((i) => i.status === 'elegivel').length;
        const totalBloqueadas = items.filter((i) => i.status === 'bloqueada').length;
        const snapshotAge = Date.now() - snapshot.finishedAt.getTime();

        await this.logService.info({
            type: LOG_TYPE.BUSINESS_INFO,
            message: 'permuta painel served',
            data: { requestId, totalElegiveis, totalBloqueadas, snapshotAge },
        });

        return { runId: snapshot.runId, snapshotAge, totalElegiveis, totalBloqueadas, items };
    };

    private toItem = (r: PermutaCandidataSnapshotRow): PainelItem => ({
        docCod: r.docCod,
        priCod: r.priCod,
        status: r.status,
        ...(r.motivoBloqueio !== undefined ? { motivoBloqueio: r.motivoBloqueio } : {}),
        aging: r.agingDays ?? null,
        ...(r.invoiceDocCod !== undefined ? { invoiceDocCod: r.invoiceDocCod } : {}),
        ...(r.variacaoClassificacao !== undefined
            ? { variacaoClassificacao: r.variacaoClassificacao }
            : {}),
        ...(r.variacaoResultado !== undefined ? { variacaoResultado: r.variacaoResultado } : {}),
    });

    /** Mais antigo primeiro; itens sem aging (null) num bucket estável ao final. */
    private byAging = (a: PainelItem, b: PainelItem): number => {
        if (a.aging === null && b.aging === null) return a.docCod.localeCompare(b.docCod);
        if (a.aging === null) return 1;
        if (b.aging === null) return -1;
        return b.aging - a.aging;
    };
}
