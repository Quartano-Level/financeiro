# Fase 40 — Encargos & Impostos do processo (`com017`) ✅

**Narrativa.** Depois que o processo é nacionalizado e faturado, o ERP consolida, por documento fiscal,
a composição de **custo/encargo** que será conciliada no fechamento: valor da mercadoria (FOB), frete e
seguro internacionais, taxas, e os tributos (II, IPI, PIS, COFINS, ICMS, Taxa Siscomex). É a fonte
"ENCARGOS GERAIS > IMPOSTOS" do `MODELO DASHBOARD` (aba CONCILIAÇÃO) para FRETE INTERNACIONAL, FOB,
TAXA CE, SEGURO e os impostos de nacionalização.

**Tela / como chegar.** A partir de uma NF (Fiscais de Saída `com297` — ver fase 50), rodapé
**Mais Ações → Encargos Gerais** abre um modal com abas; a 1ª aba é **IMPOSTOS** (grid Ordem / Encargo /
% Alíq. / Valor MN / Valor Dólar).

**Endpoint** (`040-com0.json`, controller `com-017`):

```
GET /api/com017/encargosGerais/{docTip}/{docCod}/{filCod}/{dtrVldVisivel}/{dtrVldVisivelTotal}
exemplo ao vivo: /api/com017/encargosGerais/1/5998/2/1/1     (NF docCod 5998, filCod 2)
→ 200  responses.$ref = EncargosGeraisDTO
GET /api/com017/encargosGerais/download/{docTip}/{docCod}/{filCod}   (exportação)
```

**Schema da resposta — `EncargosGeraisDTO`:**

| Campo | Tipo | Conteúdo |
|---|---|---|
| `impostos[]` | `ComDocProdtribGeral` | **a grid IMPOSTOS** (uma linha por encargo) |
| `despesas[]` | `ComDocProdutosDespesasGeral` | despesas por conta de projeto (`ctpDesNome`, `dppMnyValorMn`) |
| `totalImpostos[]` | `ComDocProdtribGeral` | totalização |
| `encargosGerais[]` | `ComDocProdtribEncargosGerais` | breakdown **por produto** (campos tipados) |
| `resumo` | `EncargosGeraisResumoDTO` | totais do documento (campos tipados) |
| `totalProdutos` | `ComDocProdutosTotalDTO` | `dprPreTotalBruto/Liquido`, custo médio/gerencial |

**Mapa rótulo da grid IMPOSTOS ↔ atributo (`ComDocProdtribGeral`):**

| Coluna UI | Atributo |
|---|---|
| Ordem | `dtrNumOrdem` |
| Encargo | `impDesNome` |
| % Alíq. | `dtrPctAliquota` |
| Valor MN | `dtrMnyValormn` |
| Valor Dólar | `dtrMnyValorDolar` |

**FRETE INTERNACIONAL — 3 leituras na mesma resposta:**
1. linha de `impostos[]` com `impDesNome == "FRETE INTERNACIONAL"` (Ordem 20) → `dtrMnyValormn` / `dtrMnyValorDolar`.
2. `resumo.freteInt` (consolidado do documento).
3. `encargosGerais[].vlrFreteIntl` (rateado por produto).

`EncargosGeraisResumoDTO` traz também: `fob`, `seguroInt`, `ii`, `ipi`, `ipiDi`, `pis`, `pisDi`,
`cofins`, `cofinsDi`, `icms`, `icmsSt`, `baseIcmsSt`, `thc`, `dumping`, `adicionalDi`, `reducaoDi`.
`ComDocProdtribEncargosGerais` (por produto) traz `vlrFob`, `vlrFreteIntl`, `vlrSeguroIntl`, `vlrIi`,
`vlrIpi`, `vlrPis`, `vlrCofins`, `vlrIcms`, `vlrMarkup`, `vlrAdvalorem`, `vlrMarMercante`, etc.

**Valor real confirmado (doc 5998, INOX-TECH):** FRETE INTERNACIONAL = R$ 9.583,91 (US$ 1.733,61);
FOB = R$ 188.007,26 (US$ 34.008,15); VALOR TOTAL NF = R$ 271.040,17.
Ficha completa: [`screens/com017.md`](../screens/com017.md).

## Origem dos tributos: a DI ([`imp019`](../screens/imp019.md)) ⮕ o doc fiscal (`com017`)
Os mesmos tributos aparecem em **dois pontos** do ciclo, e é importante não confundi-los:
- **Recolhimento na DI** (fase 35) — aba **Despesas (impostos)** da DI (`POST /api/imp019/impDiPlanilha/list`):
  o que **efetivamente foi pago** ao desembaraçar, com data de pagamento e banco. Ex. (DI 26/0702075-0):
  II(86) 977,53 · IPI(1038) 1.249,61 · PIS(5602) 114,05 · COFINS(5629) 524,06 · Siscomex(7811) 154,23.
- **Consolidação no documento fiscal** (fase 40) — `com017/encargosGerais` (`EncargosGeraisDTO`): os mesmos
  tributos **rateados por produto** + FRETE/FOB/SEGURO, na visão da NF, prontos para a conciliação/fechamento.

As **alíquotas** vêm da TEC (`imp013`) e aparecem por item já na Invoice ([`log009`](../screens/log009.md) →
Itens) e nas **Adições** da DI. A base de cálculo (CIF) = mercadoria + frete + seguro, montada na adição.

## Outras fontes de encargo (não-tributário)
Despesas do processo (AFRMM, armazenagem, forwarders, despachante) entram por
`imp021/DespesasProcesso` — a fonte "ENCARGOS GERAIS > DESPESAS" do `MODELO DASHBOARD` (ver
[fase 30](30-processo-importacao.md)). Encargos financeiros e variação cambial vêm dos apps próprios
(Calculadora de Encargos / Variação Cambial) sobre as baixas (fase 60) e o contrato de câmbio (`imp059`).

**Ligações cronológicas.** ⬅ vem do faturamento (fase 50, `com297`) e da nacionalização (fase 35, DI `imp019`).
➡ alimenta o **fechamento de processo** (fase 70) e o relatório de Variação Cambial / Encargos Financeiros.
