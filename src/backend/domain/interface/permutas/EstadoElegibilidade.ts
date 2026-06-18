/**
 * Constantes tipadas de estado/motivo da elegibilidade de uma PermutaCandidata.
 *
 * Ontology: `ontology/state-machines/elegibilidade-permuta-candidata.md`.
 * Estados como CONSTANTES TIPADAS — nunca strings cruas (P3 / Domain State
 * Machines). `EXECUTADA` está FORA DE ESCOPO (Fatia 2).
 */
export const ESTADO_ELEGIBILIDADE = {
    DESCOBERTA: 'descoberta',
    ELEGIVEL: 'elegivel',
    BLOQUEADA: 'bloqueada',
} as const;

export type EstadoElegibilidade = (typeof ESTADO_ELEGIBILIDADE)[keyof typeof ESTADO_ELEGIBILIDADE];

/**
 * Taxonomia de motivos do estado BLOQUEADA (P0-5/P0-6/P0-8 RESOLVIDO).
 * Toda candidata `bloqueada` carrega um motivo.
 */
export const MOTIVO_BLOQUEIO = {
    /** Várias proformas/invoices no processo — N:M (backlog nesta fatia). */
    COMPOSTO_NM: 'composto-nm',
    /** 0 INVOICE FINALIZADA no processo (aguardando emissão). */
    SEM_INVOICE: 'sem-invoice',
    /** >1 INVOICE FINALIZADA — distinguível do composto N:M (mesma família). */
    MULTIPLAS_INVOICES: 'multiplas-invoices',
    /** Falhou algum dos gates 1–4. */
    FALHA_GATE: 'falha-gate',
    /** Gate 4 sem D.I nem DUIMP — sem âncora de data-base. */
    DATA_BASE_INDISPONIVEL: 'data-base-indisponivel',
    /**
     * Leitura do DETALHE da PROFORMA (`getDetalheTitulos`) indisponível após
     * retries — blip transiente do Conexos, NÃO uma reprovação legítima de gate
     * (P0-3). Distingue "não consegui ler o valor a permutar" de `falha-gate`
     * ("li e o gate reprovou"), para não enterrar uma candidata possivelmente
     * elegível como bloqueada por mérito. Re-avaliável na próxima run.
     */
    DETAIL_INDISPONIVEL: 'detail-indisponivel',
} as const;

export type MotivoBloqueio = (typeof MOTIVO_BLOQUEIO)[keyof typeof MOTIVO_BLOQUEIO];
