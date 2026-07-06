# Fase 10 — Pedido / Contrato de Câmbio ✅ (telas confirmadas)

**Narrativa.** A operação começa com o **pedido de compra** ao fornecedor do exterior e, no lado
financeiro/cambial, o **contrato de câmbio** (fechamento da moeda para pagar a importação). Esses
documentos vinculam-se depois ao Processo (`imp021`) e às invoices.

## `com043` — Pedido de Compra (tag COM_043, 110 paths) ✅ tela confirmada
**Tela:** `home → /com043` → **"Pedido de Compra - Pesquisa"**. Filtros: Código=`pedCod`, Nº Pedido=
`pedNumNumero`, Data Emissão de/até, **Processo**=`priCod`, Situação (EM CADASTRO, FINALIZADO)=`pedVldStatus`.
Grid: Código, Nº Pedido, Emissão, Previsão Entrega, Processo, Ref. Externa, Cód./Descrição Fornecedor=
`pesCod`, Documento Federal, UF/Cidade/Bairro/Logradouro (endereço do fornecedor).
`GET /api/com043/{pedCod}` → **`ComPedidos`**. Campos: `pedCod`, `pedVldTipo`, `pedDtaEmissao`,
`pedDtaSaida`, `pedVldStatus`, `pedVldFinalizado`, `pesCod` (fornecedor), `pesCodEntrega`,
`pesCodTransp`, `amzCod`, `pdcDocFederal`, `pgtCod` (condição pagto), `pctCodSeq`. Sub: `resumoInvoicesPedido/list`
(vínculo pedido↔invoice), `previsao/list`. Ver [`screens/com043.md`](../screens/com043.md).

## [`imp059`](../screens/imp059.md) — Contrato de Câmbio / Hedge (tag IMP_059 = `ImpContratoCambio`, 78 paths) ✅ (live)
`imp059` **não** é "contrato comercial" — é o **contrato de câmbio** (FX). Tela confirmada ao vivo
(`home → /imp059` → "Contrato de Câmbio - Pesquisa"). `GET /api/imp059/{imcCod}` → **`ImpContratoCambio`**.
Campos: `imcNumNumero`, `imcDtaFechamento`/`imcDtaLiquidacao`/`imcDtaDebito`, `moeCod`, **`imcFltTxFec`** (taxa
de fechamento), `pesCodExportador`/`Recebedor`, `imcEspNatureza`, `imcVldStatus`, `gerNumBaixa/Ativa/Passiva`.
⭐ O grid traz **Var. Total** e **Var. Acumulada** — a **variação cambial nativa** do ERP (taxa de fechamento vs
cotação). Sub-listas: `vinculoHedge/list`, `vinculoFinimp/list` (FINIMP = financiamento à importação). Reconcilia
com a Calculadora de Variação Cambial e com `log009/fechamentoCambio` (`ImpContratoCambioInv`).

**Ligações cronológicas.** ⬅ cadastros (fase 00, fornecedor exterior). ➡ Processo (fase 30, campo Contrato /
Plano Financeiro NF Entrada "FORNECEDORES EXTERIOR"); a taxa do contrato de câmbio entra na variação cambial.
