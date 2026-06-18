import type { ProcessamentoStatus } from './Processamento.js';

/**
 * Shapes da resposta `GET /permutas/gestao` — espelham EXATAMENTE
 * `src/frontend/lib/types.ts` (a tela consome este JSON diretamente).
 */

export type StatusElegibilidade = 'elegivel' | 'bloqueada' | 'casamento-manual';

export interface PermutaPendente {
    docCod: string;
    filCod: number;
    referencia: string;
    exportador: string;
    valorMoedaNegociada: number;
    moeda: string;
    diasEmAberto: number | null;
    status: StatusElegibilidade;
    motivoBloqueio?: string;
    /** Status do analista (botão "Processar"), quando registrado. */
    processamentoStatus?: ProcessamentoStatus;
}

export interface InvoiceEmAberto {
    docCod: string;
    filCod: number;
    referencia: string;
    exportador: string;
    valorMoedaNegociada: number;
    moeda: string;
}

export interface CasamentoAdiantamento {
    docCod: string;
    referencia: string;
    valorASerUsado: number;
    moeda: string;
    /** Status do analista (botão "Processar"), quando registrado. */
    processamentoStatus?: ProcessamentoStatus;
}

export interface CasamentoSugerido {
    invoice: InvoiceEmAberto;
    adiantamentos: CasamentoAdiantamento[];
}

export interface GestaoPermutasResponse {
    geradoEm?: string;
    fonte: 'banco';
    pendentes: PermutaPendente[];
    invoicesEmAberto: InvoiceEmAberto[];
    casamentos: CasamentoSugerido[];
    totais: {
        pendentes: number;
        invoicesEmAberto: number;
        elegiveis: number;
        bloqueadas: number;
        /** N:M que passaram os 4 gates, aguardando escolha de invoice (ADR-0005). */
        casamentoManual: number;
    };
}
