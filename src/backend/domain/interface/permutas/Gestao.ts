import type { ProcessamentoStatus } from './Processamento.js';

/**
 * Shapes da resposta `GET /permutas/gestao` — espelham EXATAMENTE
 * `src/frontend/lib/types.ts` (a tela consome este JSON diretamente).
 */

export type StatusElegibilidade = 'elegivel' | 'bloqueada' | 'casamento-manual' | 'ja-permutado';

/**
 * Micro-informações de um adiantamento, exibidas ao expandir a linha na tela
 * (qualquer status). Campos opcionais dependem do que o modelo relacional tem:
 * `declaracao` existe se o processo tem D.I/DUIMP; `taxa*`/`variacao*` só para
 * casos COM casamento (permuta_casamento) — bloqueados/já-permutados não têm.
 */
export interface PermutaDetalhe {
    /** Processo (Conexos `priCod`) — chave de reconciliação manual no Conexos. */
    priCod: string;
    /** Totalmente pago? (Gate 3). */
    pago: boolean;
    /** Data de emissão do adiantamento (ISO). */
    dataEmissao?: string;
    /** Saldo a permutar (`mnyTitPermutar`). */
    valorPermutar?: number;
    /** D.I/DUIMP do processo (Gate 4) + data-base da variação. */
    declaracao?: { variante: 'DI' | 'DUIMP'; dataBase?: string };
    /** Taxa de fechamento do adiantamento (só p/ casados). */
    taxaAdiantamento?: number;
    /** Taxa de fechamento da invoice casada (só p/ casados). */
    taxaInvoice?: number;
    /** Classificação da variação cambial (JUROS/DESCONTO/NEUTRO) — só p/ casados. */
    variacaoClassificacao?: string;
    /** Resultado monetário da variação cambial (só p/ casados). */
    variacaoResultado?: number;
    /** Delta de taxa (adto − invoice) — só p/ casados. */
    variacaoDelta?: number;
}

export interface PermutaPendente {
    docCod: string;
    filCod: number;
    referencia: string;
    exportador: string;
    /** Valor em moeda negociada (com308). `null` quando não buscado (não-pago) → tela mostra "-". */
    valorMoedaNegociada: number | null;
    /** Valor de FACE do documento em BRL (`docMnyValor`) — base da consolidação em reais. */
    valorBrl: number | null;
    moeda: string;
    diasEmAberto: number | null;
    status: StatusElegibilidade;
    motivoBloqueio?: string;
    /** Status do analista (botão "Processar"), quando registrado. */
    processamentoStatus?: ProcessamentoStatus;
    /**
     * Invoices candidatas do casamento manual (N:M) — invoices em aberto do mesmo
     * processo (`priCod`). Preenchido só quando `status === 'casamento-manual'`
     * (ADR-0005). O analista escolhe UMA e processa.
     */
    candidatas?: InvoiceEmAberto[];
    /** Micro-informações exibidas ao expandir a linha (qualquer status). */
    detalhe?: PermutaDetalhe;
}

export interface InvoiceEmAberto {
    docCod: string;
    filCod: number;
    /** Processo (Conexos `priCod`) — código em comum com o adiantamento. */
    priCod?: string;
    referencia: string;
    exportador: string;
    valorMoedaNegociada: number | null;
    /** Valor de FACE do documento em BRL (`docMnyValor`) — base da consolidação em reais. */
    valorBrl: number | null;
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
    /**
     * Código do PROCESSO (Conexos `priCod`) — número em comum entre invoice e
     * adiantamento; chave de reconciliação manual no Conexos. Exibido no lugar do
     * código da invoice na tela.
     */
    priCod: string;
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
        /** Já permutados (pago + 100% consumido em permuta anterior) — estado CONCLUÍDO, fora de bloqueadas. */
        jaPermutado: number;
    };
}
