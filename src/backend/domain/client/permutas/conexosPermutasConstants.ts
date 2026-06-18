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
 * Filtro wire "Adiantamento=SIM" na tela `com298`. CONFIRMADO empiricamente no
 * dev tenant Columbia (probe 2026-06-18): o campo é `docVldTipoAdto` (modelo
 * `FinDocCab`), valor numérico `1` (adiantamento). O placeholder anterior
 * (`adiantamento#EQ`/`'S'`) retornava HTTP 500 `adiantamento (FinDocCab)` —
 * campo inexistente. Evidência: PROFORMA finalizadas com `docVldTipoAdto=1`
 * carregam `gerNum=198` (ADTO FORNECEDOR INTERNACIONAIS) e
 * `gcdDesNome="ADIANTAMENTO PROFORMA"`.
 */
export const ADIANTAMENTO_FILTER_KEY = 'docVldTipoAdto#EQ' as const;

/** Valor do filtro `docVldTipoAdto` para adiantamento (numérico — coluna numérica). */
export const ADIANTAMENTO_FILTER_VALUE = 1 as const;

/** Endpoint wire da D.I (data CI). */
export const ENDPOINT_DI_LIST = 'imp019/list' as const;

/** Endpoint wire da DUIMP (data de desembaraço). */
export const ENDPOINT_DUIMP_LIST = 'imp223/list' as const;
