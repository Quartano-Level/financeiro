/**
 * Constantes de tenant Columbia (`priCod=1153`) para a eleição de permutas.
 *
 * P6 / Inviolable Rule #2: estes IDs são da instalação Columbia — manter como
 * CONSTANTES TIPADAS, nunca hardcode de tenant em service. Outra trading (outro
 * `priCod`) recalibra os IDs. Ontology: `ontology/integrations/conexos.md`.
 */

/** `tpdCod` do documento PROFORMA (Adiantamento). */
export const TPD_PROFORMA = 99 as const;

/** `tpdCod` do documento INVOICE (Fatura). */
export const TPD_INVOICE = 128 as const;

/** `vldStatus` FINALIZADO (`'3'`). */
export const VLD_STATUS_FINALIZADO = ['3'] as const;

/**
 * 🔬 BUILD-PROBE (P0-3): chave wire EXATA do filtro booleano "Adiantamento=SIM"
 * na tela `com298`. O caminho está resolvido (PROFORMA + filtro `adiantamento`);
 * só falta capturar o LITERAL da chave num probe de rede no dev tenant.
 *
 * Valor provisório isolado — NÃO inventar. Quando o probe capturar o nome real
 * (ex.: `adiantamento#EQ`), trocar AQUI (ponto único). A presença da chave no
 * body é testada; o literal de produção fica pendente do probe.
 *
 * TODO 🔬 PROBE: confirmar `ADIANTAMENTO_FILTER_KEY` e `ADIANTAMENTO_FILTER_VALUE`
 * contra o dev tenant Conexos (screenshot mostra o campo, falta o wire).
 */
export const ADIANTAMENTO_FILTER_KEY = 'adiantamento#EQ' as const;

/** 🔬 BUILD-PROBE (P0-3): valor do filtro `adiantamento` (provisório). */
export const ADIANTAMENTO_FILTER_VALUE = 'S' as const;

/** Endpoint wire da D.I (data CI). */
export const ENDPOINT_DI_LIST = 'imp019/list' as const;

/** Endpoint wire da DUIMP (data de desembaraço). */
export const ENDPOINT_DUIMP_LIST = 'imp223/list' as const;
