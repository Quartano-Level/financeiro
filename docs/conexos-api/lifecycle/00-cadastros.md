# Fase 00 — Cadastros base ✅ (telas confirmadas)

**Narrativa.** Antes de qualquer processo existem os cadastros-mestre: **pessoas** (clientes, fornecedores
exterior, despachantes, transportadoras, armazéns), **produtos**, **mercadorias na TEC** (classificação
fiscal/NCM) e tabelas fiscais (**CFOP**). Tudo o que vem depois referencia esses códigos (`pesCod`,
`prdCod`, `cfoEspCod`).

## [`cmn025`](../screens/cmn025.md) — Cadastro de Pessoas (tag CMN_025, 278 paths) ✅ tela confirmada
**Tela:** `home → /cmn025` → **"Cadastro de Pessoas - Pesquisa"**. Filtros: Cód. Pessoa=`pesCod`,
Cód. Alteração=`dpeCodSeq`, Razão Social, Nome Fantasia, E-mail, Registro Vigente (SIM), Tipo de Pessoa,
Situação (ATIVO, EM CADASTRO), Documento Federal (CNPJ/CPF). Grid: Cód. Pessoa, Cód. Alteração, Razão
Social, Nome Fantasia, E-mail, Home Page, Validade, Nº Documento Identidade, Telefone/Fax/Celular,
Registro Vigente, Situação, Tipo. Entidade central de qualquer parte (`pesCod`/`dpeCodSeq`). Sub-listas:
tributos por pessoa (`tributoPessoasTproc/Prod/Ncm`), endereços, contatos, classificadores.

## [`com006`](../screens/com006.md) — Cadastro de Produtos (tag COM_006, 128 paths) ✅
`GET /api/com006/{prdCod}` → **`ComProdutos`**. Campos: `prdDesNome`, `prdEspCodExterno`, `prdVldTipo`,
`prdPreVlrvenda`/`prdPreVldminimo`/`prdPreVldmaximo`, `undCod` (unidade), **`tecEspCod`** (NCM/TEC),
`prdCodExportador`/`prdCodImportador`/`prdCodFabricante`, `prjCod`/`ctpCod`. Sub: tipoImportacao,
similarCorrelatos. O produto referencia a NCM/TEC (`tecEspCod`) → herda as alíquotas de `imp013`.

## [`imp013`](../screens/imp013.md) — Cadastro de Mercadorias na TEC (tag IMP_013, 51 paths) ✅
**Classificação NCM/TEC com EX-tarifário** — fonte das **alíquotas de importação** (II/IPI/PIS/COFINS por NCM)
e do flag "S/ Similar Nacional". Tela confirmada (`home → /imp013` → "Mercadorias na TEC - Pesquisa"; filtros
Código/Seq/EX NCM/Descrição/Situação). Sub-listas: `tecaco`, `orgao`.
⭐ **Cadeia de alíquotas:** `imp013` (TEC, alíquotas por NCM) → **Itens da Invoice** ([`log009`](../screens/log009.md),
% por item) → **Adições da DI** ([`imp019`](../screens/imp019.md), valoração) → **tributos recolhidos**
(DI Despesas) → **encargos** ([`com017`](../screens/com017.md), fase 40).

## [`cmn023`](../screens/cmn023.md) — CFOP (tag CMN_023, 48 paths) ✅
`GET /api/cmn023/{cfoEspCod}` → **`CmnCfop`**. Campos: `cfoDesNome`, `cfoVldTipo`, `cfoVldFiscal`,
`cfoVldTratFisIpi`/`cfoVldTratFisIcms` (tratamento fiscal), `gerNum`, `plaNum`. Define como cada operação
de entrada/saída é tributada e contabilizada — os CFOPs das ODFs (`imp002`, fase 50) saem daqui.

**Ligações cronológicas.** ➡ alimentam Pedido (fase 10), Processo (fase 30), Itens das NFs/ODFs (fase 50),
e a cadeia de tributos do despacho (fase 35/40).
