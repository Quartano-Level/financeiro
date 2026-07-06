# Fase 70 — Fechamento de Processo (débito × crédito, margem) ✅ (fontes confirmadas)

**Narrativa.** No fim do ciclo, o processo é **fechado** em três dimensões — **Operacional**, **Financeiro**
e **Contábil** (as 3 datas vistas no [`imp021`](../screens/imp021.md), fase 30) — e apura-se o **resultado**
(débito × crédito, margem). É o objeto do `MODELO DASHBOARD` (aba CONCILIAÇÃO/DASHBOARD) e do app
`columbia-expense-analysis`.

## Débito × Crédito ao vivo — Conta Corrente do processo ([`imp021`](../screens/imp021.md))
A visão **débito × crédito por parceiro** do processo já existe no ERP: `imp021 → Mais Ações → Conta Corrente`
(`POST /api/imp021/ContaCorrente` → `ViewCcPessoas`; modal "CONTA CORRENTE DO PROCESSO - IMP_040"). Mostra
**Crédito** (NF/ICMS) × **Débito** (valores pagos a forwarders/despachante) × **Diferença**. No modelo conta e
ordem, o débito é o que a Columbia adiantou pelo encomendante e cobra de volta via ODF de serviço (`imp002`).
Esta é a base operacional do fechamento; o contábil consolida no plano de contas [`ctb002`](../screens/ctb002.md).

## Fechamento por tipo — `imp021/fechProcesso`
```
POST /api/imp021/fechProcesso/list/{vldTipoFechamento}/{priCod}   → CnxListResponseImpProcessoFechamento
```
Linha **`ImpProcessoFechamento`**: `pfeVldTipo` (tipo: operacional/financeiro/contábil), `pfeDtaFechamento`,
`pfeVldStatus`, `pfeEspObs`, `vldExisteFechamento`, `usnDesNomeCadastro`/`usnDesNomeStatus`. `vldTipoFechamento`
no path seleciona a dimensão. As datas consolidadas também ficam no cabeçalho `ImpProcesso` (campos
`priDtaFechamento`, `tipoFechamento` + bloco FECHAMENTO Operacional/Financeiro/Contábil da tela).

## Resultado / Margem — `com099/resultadoFaturamento`
```
GET  /api/com099/resultadoFaturamento/{pedCod}/{pprCod}
GET  /api/com099/resultadoFaturamentoLote/list/{pprCodLoteNf}   → CnxListResponseComPedidosResultadoFaturamentoDTO
```
`ComPedidosResultadoFaturamentoDTO`: `pedCod`, `docCod`/`docTip`, `fisNumDocumento`, `dtaEmissao`/`dtaSaida`,
`pesCod`/`dpeNomPessoa`, `vldStatus`. Liga pedido→NF→resultado (a "MARGEM" do dashboard).

## Variação cambial nativa — `log009/fechamentoCambio` (vínculo invoice↔contrato de câmbio)
```
POST /api/log009/fechamentoCambio/list   → CnxListResponseImpContratoCambioInv
```
`ImpContratoCambioInv`: liga `invCod` (invoice) a `imcCod` (contrato de câmbio, fase 10), com
**`vlrVariacaoCambial`** e **`vlrVariacaoCambialAntec`** (variação cambial do ERP), `imcFltTxFec` (taxa de
fechamento do câmbio), `iciFltTaxa`, `fltTaxaDi`, `iciMnyValor`. É a fonte nativa para reconciliar a
"CALCULADORA DE VARIAÇÃO CAMBIAL" do modelo. Ver também `com308`/`com311 varCambial/list` (fase 60).
O próprio **Contrato de Câmbio** ([`imp059`](../screens/imp059.md), fase 10) já exibe **Var. Total** e
**Var. Acumulada** no grid — a variação cambial nativa, a cotejar com a taxa de baixa (`bxaFltTxconv`, fase 60).
A **cotação** de referência vem do PTAX ([`cmn156`](../screens/cmn156.md)).

## Conciliação contábil/bancária (correlatos)
`ctb009/fechamento`, `ctb066/conciliacao`, `fin020/conciliacao`, `fin133/geraConciliacao/{gerNum}` —
conciliação contábil e de extrato (fase contábil do fechamento).

**Síntese do ciclo (CONCILIAÇÃO ↔ ERP):** mercadoria/FOB/frete/seguro/impostos = `com017/encargosGerais`
(fase 40) · despesas FOB/financeiras = `imp021/DespesasProcesso` (fase 30) · variação cambial =
`log009/fechamentoCambio`+`com308/varCambial` · margem/resultado = `com099/resultadoFaturamento` ·
datas de fechamento = `imp021/fechProcesso` + cabeçalho `ImpProcesso`.

**Ligações cronológicas.** ⬅ encargos (40), financeiro (60). É o **fim** do ciclo do processo.
