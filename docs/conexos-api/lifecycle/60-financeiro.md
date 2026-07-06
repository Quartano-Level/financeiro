# Fase 60 — Financeiro ([`com298`](../screens/com298.md) a pagar · [`com299`](../screens/com299.md) a receber · `com311` títulos · [`fin010`](../screens/fin010.md)/[`fin014`](../screens/fin014.md) baixa) ✅

**Narrativa.** A partir das notas e do processo, geram-se os **títulos financeiros** a pagar (fornecedor
exterior, frete, despachante, tributos) e a receber (cliente — no modelo conta e ordem, o **encomendante**). A
baixa dos títulos via **borderô** (`fin010`/`fin014`) registra datas de pagamento e taxas de conversão — base
para **juros perdidos** e **variação cambial**, reconciliada no fechamento (fase 70) e no contrato de câmbio
([`imp059`](../screens/imp059.md)).

## Tela: Financeiro a Pagar (`com298`) 🟡

**Como chegar.** `home → /com298#/cadastro/{docCod}` (full-load). Abas **Documentos** e **Itens**.

**Endpoints confirmados (`060-com2.json`, tag COM_298 = "Financeiro a Pagar", 37 endpoints):**

```
GET  /api/com298/{docCod}                              ← cabeçalho
POST /api/com298/comDocProdutos/list/{docCod}/{fisCod} ← aba Itens
POST /api/com298/validaDocFederalAmazonas
POST /api/com298/comDocProdutos/initialValues
GET  /api/com298/reportInfo/{docCod}
GET  /api/com298/autoConfig/{docCod}
```

**⚠️ Diferença vs com297:** na tela **Financeiro a Pagar**, a aba **Itens = "Conta do Projeto"** com as
linhas de **encargos/impostos** (ex.: `COFINS NACIONALIZAÇÃO`, `IPI NACIONALIZAÇÃO`, `PIS NACIONALIZAÇÃO`,
`TAXA DE REGISTRO SISCOMEX`). Colunas: Ordem=`?`, Valor=`dprPreTotalbruto`, Projeto=`prjCod`, Conta do
Projeto=`ctpDesNome`, Conta=`ctpEspConta`, Centro de Custos=`ccuDesNome`, Unidade de Negócio=`ungDesNome`,
CFOP=`cfoEspCod`, Complemento=`dprLngComplemento`, Moeda=`moe*`.

**Documentos (rolando):** RESUMO DO DOCUMENTO (Qtd. Itens, Valor Bruto, Valor Líquido, Situação=FINALIZADO),
RESUMO DOS TÍTULOS (Valor dos Títulos / Pago / Permutado / em Aberto / a Permutar), Endereço para Faturamento.

## `com299` — Financeiro a Receber (tag COM_299, 36 paths) 🟡 (seed)
`GET /api/com299/{docCod}` → **`FinDocCab`** (mesmo DTO de `com296`/`com298` — ver insight na ficha 50),
`POST /api/com299/list`. Lado **a receber** (cliente). Campos relevantes: `pesCod` (cliente), `docMnyValor`,
`docDtaRecebimento`, `gerNum`, `docVldTipoAdto` (adiantamento de cliente).

## `com311` — Financeiro · TÍTULOS (tag COM_311, 36 paths) 🟡 (seed)
Os **títulos** (parcelas) gerados dos documentos. `POST /api/com311/agrupamento/list`. Também
`com311/varCambial/list` e `com308/financeiroAPagar/varCambial/list` (variação cambial nativa do ERP —
ver memória `conexos-apidocs-access`). `titFltTaxaMneg` = taxa do título.

## Baixa de títulos — [`fin010`](../screens/fin010.md) (a pagar) / [`fin014`](../screens/fin014.md) (a receber) ✅ (live)
A baixa dos títulos é feita por **borderô** (`borCod` agrupa as baixas). Confirmado ao vivo (2026-06-19):
- **`fin010` "Baixa de Títulos - a Pagar"** (`POST /api/fin010/list`, `GET /api/fin010/{borCod}`,
  `permutaAutomaticaSel/list`). Filtros: Número · **Data Borderô de/até** · Cheque · Número do Banco ·
  Cód. Conta Financ. · Situação (EM CADASTRO, FINALIZADO). Grid: Número · Data Borderô · Conta Financeira ·
  Valor Total Líquido · Valor Conta/Corrente · Situação.
- **`fin014` "Baixa de Títulos - a Receber"** (espelho; `recebiveis/list`, `taxasBaixa/list`). Filtro extra:
  **Tipo do Documento Permuta**; coluna extra: Data Finalização.

A baixa registra data de pagamento e **taxa de conversão** (`bxaFltTxconv`) — base de **juros perdidos** e
**variação cambial**. `psq015/baixasTitulo` traz as datas de baixa dos títulos pagos. **Permuta** = encontro
de contas (a pagar × a receber do mesmo parceiro).

## Pendente
- ⬜ telas ao vivo `com299`/`com311`; mapear `gerNum` (labels na memória `conexos-apidocs-access`).

**Ligações cronológicas.** ⬅ faturamento (fase 50). ➡ fechamento (fase 70): saldo, juros, variação cambial.
