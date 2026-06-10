import { z } from 'zod';

/**
 * AdiantamentoFinanceiro — financial advance document of type
 * `IMPLANTAÇÃO DE SALDO FINANCEIRO (EFEITO CONTÁBIL)` in Conexos.
 *
 * Sourced via:
 *   - com298 (lado-débito): `tpdCod=TPD_IMPLANTACAO_SALDO + gerNum=GER_ADTO_FORN_INT`
 *   - com299 (lado-crédito): `tpdCod=TPD_IMPLANTACAO_SALDO + gerNum#IN [GER_ADTO_CLIENTE_EXT, GER_ADTO_CLIENTE_NAC]`
 *
 * Wire-field correction: Conexos exposes the accounting class on `gerNum`
 * (NOT `gerCod`); `FinDocCab` does not have a `gerCod` column. See
 * `ontology/_inbox/implantacao-saldo-financeiro-conexos-ids.md` for the
 * empirical evidence (probe priCod=1153, 2026-05-11).
 *
 * The discriminated union (`direcao + tipo`) prevents débito/crédito
 * confusion at compile time. See ADR-0013 for why adto enters the FIFO
 * as a first-class layer (not pareamento documento).
 *
 * `dataBaixa` is hydrated post-fetch via:
 *   - DEBITO  → `com308/financeiroAPagar/baixas/list/<docCod>/1/0`
 *   - CREDITO → `com309/baixas/list/<docCod>/1/0`
 * (same endpoints as INVOICE/PROFORMA and SolNum respectively).
 * Without baixa, invariant I4 of `exposicao-fifo-saldo-aberto` filters
 * the camada out of the FIFO — it remains in the payload for diagnostic.
 */
export type AdiantamentoDirecao = 'debito' | 'credito';

export type AdiantamentoTipo = 'ADTO_FORN_INT' | 'ADTO_CLIENTE_EXT' | 'ADTO_CLIENTE_NAC';

/**
 * Discriminated union over `direcao`. The `tipo` field is constrained per
 * side at the type level so a `direcao: 'debito'` row cannot accidentally
 * carry `tipo: 'ADTO_CLIENTE_EXT'`.
 */
export type AdiantamentoFinanceiroInterface =
    | {
          direcao: 'debito';
          // Yuri 2026-05-12: com298 (lado-débito) tem DOIS planos financeiros
          // possíveis para `IMPLANTAÇÃO DE SALDO FINANCEIRO`:
          //   - ADTO_FORN_INT     (gerNum=198, Adto Fornecedor Internacional)
          //   - ADTO_CLIENTE_NAC  (gerNum=233, Adto Cliente Nacional — débito)
          tipo: 'ADTO_FORN_INT' | 'ADTO_CLIENTE_NAC';
          docCod: string;
          priCod: string;
          dataEmissao: Date;
          dataBaixa?: Date;
          valor: number;
          moeda: string;
          /** Conexos filial code that owns the lançamento. */
          filCod: number;
          /** vldStatus = '3' (FINALIZADO) — enforced at fetch time. */
          vldStatus: '3';
          /** Optional counterparty name (Conexos `dpeNomPessoa`). */
          pessoa?: string;
          /** Valor residual a permutar (`mnyTitPermutar` no detail endpoint). */
          valorPermutar?: number;
      }
    | {
          direcao: 'credito';
          tipo: 'ADTO_CLIENTE_EXT' | 'ADTO_CLIENTE_NAC';
          docCod: string;
          priCod: string;
          dataEmissao: Date;
          dataBaixa?: Date;
          valor: number;
          moeda: string;
          filCod: number;
          vldStatus: '3';
          pessoa?: string;
          valorPermutar?: number;
      };

/**
 * Zod schema for boundary validation. Mirrors the discriminated union via
 * `z.discriminatedUnion('direcao', …)` so parsing surfaces a clear error
 * when an upstream mapper produces a mismatched `direcao + tipo` pair.
 */
const baseShape = {
    docCod: z.string(),
    priCod: z.string(),
    dataEmissao: z.date(),
    dataBaixa: z.date().optional(),
    valor: z.number(),
    moeda: z.string(),
    filCod: z.number(),
    vldStatus: z.literal('3'),
    pessoa: z.string().optional(),
    valorPermutar: z.number().optional(),
};

export const AdiantamentoFinanceiroSchema = z.discriminatedUnion('direcao', [
    z.object({
        ...baseShape,
        direcao: z.literal('debito'),
        tipo: z.union([z.literal('ADTO_FORN_INT'), z.literal('ADTO_CLIENTE_NAC')]),
    }),
    z.object({
        ...baseShape,
        direcao: z.literal('credito'),
        tipo: z.union([z.literal('ADTO_CLIENTE_EXT'), z.literal('ADTO_CLIENTE_NAC')]),
    }),
]);

export default AdiantamentoFinanceiroInterface;
