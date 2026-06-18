import { inject, injectable } from 'tsyringe';
import type { DeclaracaoEntry } from '../../client/ConexosClient.js';
import type Adiantamento from '../../interface/permutas/Adiantamento.js';
import type DeclaracaoImportacao from '../../interface/permutas/DeclaracaoImportacao.js';
import {
    ESTADO_ELEGIBILIDADE,
    MOTIVO_BLOQUEIO,
    type MotivoBloqueio,
} from '../../interface/permutas/EstadoElegibilidade.js';
import type Invoice from '../../interface/permutas/Invoice.js';
import { GATE, type GateResult } from '../../interface/permutas/PermutaCandidata.js';
import type PermutaCandidata from '../../interface/permutas/PermutaCandidata.js';
import CasamentoInvoiceService from './CasamentoInvoiceService.js';

export interface AvaliarElegibilidadeInput {
    adiantamento: Adiantamento;
    /** Declarações do processo (D.I/DUIMP) — XOR decidido aqui (Gate 4). */
    declaracoes: DeclaracaoEntry[];
    /** INVOICEs FINALIZADAS do processo (casamento P0-6). */
    invoices: Invoice[];
}

/**
 * Avaliação de elegibilidade de uma PermutaCandidata.
 * Estado + motivo + casamento + declaração resolvida (sem aging/variação — esses
 * são compostos pelo orquestrador). `aging` fica para o `EleicaoPermutasService`.
 */
export type ElegibilidadeResult = Pick<
    PermutaCandidata,
    | 'priCod'
    | 'adiantamento'
    | 'invoiceCasada'
    | 'declaracaoImportacao'
    | 'estadoElegibilidade'
    | 'motivoBloqueio'
    | 'gatesAvaliados'
>;

/**
 * ElegibilidadeService — ação `avaliarElegibilidade` (regra `elegibilidade-permuta`).
 *
 * Ontology: `ontology/business-rules/elegibilidade-permuta.md` + state-machine.
 * Aplica os 4 gates (PROFORMA / valorPermutar>0 / TOTALMENTE PAGO / D.I XOR DUIMP)
 * e o casamento 1:1. ELEGIVEL ⇔ 4 gates verdes E exatamente 1 invoice casada.
 * Caso contrário → BLOQUEADA com motivo. Estados como constantes tipadas (P3).
 */
@injectable()
export default class ElegibilidadeService {
    constructor(
        @inject(CasamentoInvoiceService)
        private casamentoInvoiceService: CasamentoInvoiceService,
    ) {}

    public avaliarElegibilidade = (input: AvaliarElegibilidadeInput): ElegibilidadeResult => {
        const { adiantamento, declaracoes, invoices } = input;

        const gate4 = this.evaluateDeclaracaoXor(declaracoes);
        const gatesAvaliados: GateResult[] = [
            // Gate 1 — tipo PROFORMA: garantido pela eleição (caminho PROFORMA +
            // adiantamento=SIM). Registrado para auditoria (I5).
            { gate: GATE.PROFORMA, passed: true, detail: 'eleito via path PROFORMA' },
            // Gate 2 — valorPermutar > 0.
            {
                gate: GATE.VALOR_PERMUTAR,
                passed: (adiantamento.valorPermutar ?? 0) > 0,
                detail: `valorPermutar=${adiantamento.valorPermutar ?? 0}`,
            },
            // Gate 3 — TOTALMENTE PAGO.
            { gate: GATE.TOTALMENTE_PAGO, passed: adiantamento.pago === true },
            // Gate 4 — D.I XOR DUIMP.
            { gate: GATE.DI_XOR_DUIMP, passed: gate4.passed, detail: gate4.detail },
        ];

        const base = {
            priCod: adiantamento.priCod,
            adiantamento,
            ...(gate4.declaracao !== undefined ? { declaracaoImportacao: gate4.declaracao } : {}),
            gatesAvaliados,
        };

        // Gate 4 sem D.I nem DUIMP → motivo dedicado `data-base-indisponivel`.
        if (gate4.motivo === MOTIVO_BLOQUEIO.DATA_BASE_INDISPONIVEL) {
            return {
                ...base,
                estadoElegibilidade: ESTADO_ELEGIBILIDADE.BLOQUEADA,
                motivoBloqueio: MOTIVO_BLOQUEIO.DATA_BASE_INDISPONIVEL,
            };
        }

        // Qualquer gate (1–4) falho → `falha-gate`.
        const algumGateFalhou = gatesAvaliados.some((g) => !g.passed);
        if (algumGateFalhou) {
            return {
                ...base,
                estadoElegibilidade: ESTADO_ELEGIBILIDADE.BLOQUEADA,
                motivoBloqueio: MOTIVO_BLOQUEIO.FALHA_GATE,
            };
        }

        // Casamento de invoice (P0-6): 1 → casada; 0 → sem-invoice; >1 → composto-nm.
        const casamento = this.casamentoInvoiceService.casarInvoice(invoices);
        if (casamento.motivoBloqueio !== undefined) {
            return {
                ...base,
                estadoElegibilidade: ESTADO_ELEGIBILIDADE.BLOQUEADA,
                motivoBloqueio: casamento.motivoBloqueio,
            };
        }

        // 4 gates verdes E 1 invoice casada → ELEGIVEL (I3 / T1).
        return {
            ...base,
            ...(casamento.invoiceCasada !== undefined
                ? { invoiceCasada: casamento.invoiceCasada }
                : {}),
            estadoElegibilidade: ESTADO_ELEGIBILIDADE.ELEGIVEL,
        };
    };

    /**
     * Gate 4 — D.I XOR DUIMP (regra `di-xor-duimp`, I2):
     *   - exatamente 1 variante → passa, resolve a declaração.
     *   - nenhuma → bloqueia (`data-base-indisponivel`).
     *   - ambas → anomalia XOR → bloqueia (`falha-gate`).
     */
    private evaluateDeclaracaoXor = (
        declaracoes: DeclaracaoEntry[],
    ): {
        passed: boolean;
        detail: string;
        declaracao?: DeclaracaoImportacao;
        motivo?: MotivoBloqueio;
    } => {
        const temDi = declaracoes.some((d) => d.variante === 'DI');
        const temDuimp = declaracoes.some((d) => d.variante === 'DUIMP');

        if (temDi !== temDuimp) {
            const entry = declaracoes.find((d) => d.variante === (temDi ? 'DI' : 'DUIMP'));
            const declaracao: DeclaracaoImportacao | undefined = entry
                ? {
                      variante: entry.variante,
                      priCod: entry.priCod,
                      ...(entry.dataBase !== undefined ? { dataBase: entry.dataBase } : {}),
                  }
                : undefined;
            return {
                passed: true,
                detail: temDi ? 'DI' : 'DUIMP',
                ...(declaracao !== undefined ? { declaracao } : {}),
            };
        }

        if (!temDi && !temDuimp) {
            return {
                passed: false,
                detail: 'sem D.I nem DUIMP',
                motivo: MOTIVO_BLOQUEIO.DATA_BASE_INDISPONIVEL,
            };
        }

        // ambas → anomalia XOR.
        return {
            passed: false,
            detail: 'D.I e DUIMP presentes (anomalia XOR)',
            motivo: MOTIVO_BLOQUEIO.FALHA_GATE,
        };
    };
}
