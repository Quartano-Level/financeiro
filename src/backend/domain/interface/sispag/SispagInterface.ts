/**
 * SISPAG (Escopo II) — interfaces do painel READ-ONLY (spike / semente da Fatia 1).
 *
 * DTOs mapeados a partir dos reads confirmados em produção (Conexos PRD, probe
 * read-only `jobs/probe-sispag.ts`): fin064 (carteira a pagar), fin015 (lote
 * SISPAG nativo), fin010 (borderô a-pagar). NENHUMA escrita — o painel só lê,
 * exibe e SIMULA o fluxo (montar → finalizar → enviar → retorno → baixa).
 */

/** Um título a pagar (parcela) — fonte `fin064/list` (Gestão de Pagamentos). */
export interface TituloAPagar {
    docCod: string;
    titCod: string;
    filCod: number;
    /** Nome do credor/favorecido (`dpeNomPessoa`); pode faltar no list. */
    credor?: string;
    valor: number;
    moeda?: string;
    /** Vencimento (epoch-ms) — `titDtaVencimento`. */
    vencimento?: number;
    /** Dias até o vencimento (negativo = vencido). Derivado. */
    diasAteVencimento?: number;
    /** Liberado para pagamento (alçada) — `vldLib`. */
    liberado: boolean;
    /** Já pago — `vldPago`. */
    pago: boolean;
    banco?: string;
    /** Nº da remessa se já entrou num lote — `titNumRemessa`. */
    numRemessa?: string;
}

/** Um lote SISPAG nativo — fonte `fin015/list`. */
export interface LoteSispag {
    filCod: number;
    flpCod: number;
    banco?: string;
    conta?: string;
    layoutConta?: string;
    /** flpVldStatus: 0=rascunho, 1=finalizado, 2=cancelado (heurística). */
    status: number;
    /** flpVldConfEnvio — envio ao banco confirmado. */
    envioConfirmado: boolean;
    /** flpVldRet — retorno processado. */
    retornoProcessado: boolean;
    titulosCount: number;
    soma: number;
    itensRetorno: number;
    finalizadoPor?: string;
    dataCredito?: number;
}

/** Um borderô a-pagar (baixa) — fonte `fin010/list` (borVldTipo=2). */
export interface BorderoAPagar {
    borCod: number;
    filCod: number;
    descricao?: string;
    valor: number;
    data?: number;
    /** borVldFinalizado. */
    finalizado: number;
    /** vldHasRemessaPgto — a baixa passou por remessa SISPAG? (quase sempre 0). */
    temRemessa: boolean;
    temBaixa: boolean;
}

/** KPIs agregados do painel. */
export interface SispagKpis {
    titulosAVencer7d: number;
    titulosAVencer30d: number;
    titulosVencidos: number;
    valorAVencer30d: number;
    lotesAbertos: number;
    lotesEnviados: number;
    borderosViaRemessa: number;
    borderosTotalAmostra: number;
}

/** Resposta do painel SISPAG (read-only). */
export interface SispagPainelResponse {
    geradoEm: string;
    /** Guard-rails do ambiente (para o banner de segurança na UI). */
    modo: {
        somenteLeitura: true;
        conexosWriteEnabled: boolean;
        conexosDryRun: boolean;
    };
    kpis: SispagKpis;
    titulos: TituloAPagar[];
    lotes: LoteSispag[];
    borderos: BorderoAPagar[];
}

// ============================================================ Fatia 2 — LotePagamento
// Lote candidato LOCAL montado pela analista (ADR-0015). NENHUMA escrita no ERP.
// Ver ontology/state-machines/lote-pagamento.md e entities/lote-pagamento.md.

/** Estados do lote candidato — constantes tipadas (nunca strings cruas). */
export const LOTE_STATUS = {
    RASCUNHO: 'RASCUNHO',
    FINALIZADO: 'FINALIZADO',
    CANCELADO: 'CANCELADO',
} as const;

export type LotePagamentoStatus = (typeof LOTE_STATUS)[keyof typeof LOTE_STATUS];

/** Um título incluído num lote — snapshot de valor/venc/credor no momento da inclusão. */
export interface ItemLote {
    loteId: string;
    filCod: number;
    docCod: string;
    titCod: string;
    credor?: string;
    valor?: number;
    vencimento?: number;
    incluidoPor: string;
    incluidoEm?: string;
}

/** Lote candidato (raiz do agregado). */
export interface LotePagamento {
    id: string;
    filCod: number;
    banco?: string;
    conta?: string;
    status: LotePagamentoStatus;
    criadoPor: string;
    finalizadoPor?: string;
    finalizadoEm?: string;
    versao: number;
    criadoEm?: string;
    itens: ItemLote[];
}

/** Entrada — criar lote. */
export interface CriarLoteInput {
    filCod: number;
    banco?: string;
    conta?: string;
    ator: string;
}

/** Entrada — incluir título no lote (identidade; valores autoritativos vêm do ERP no serviço). */
export interface IncluirTituloInput {
    loteId: string;
    filCod: number;
    docCod: string;
    titCod: string;
    ator: string;
}

/** Filtros de listagem de lotes. */
export interface ListarLotesFiltro {
    status?: LotePagamentoStatus;
    filCod?: number;
}
