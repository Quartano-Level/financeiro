# Conexos — Glossário de campos (prefixos e convenções de wire)

Padrão dos atributos: `<entidade><tipo><Nome>`, ex. `dprPreTotalbruto` = (dpr) doc-produto · (Pre) preço/valor · TotalBruto.
Cresce a cada tela mapeada. Confirmados ao vivo marcados com ✅.

## Prefixos de entidade (3 letras)

| Prefixo | Entidade | Visto em |
|---|---|---|
| `fil` | Filial (filCod=2 = Columbia Itajaí) ✅ | global |
| `usn` | Usuário (usnCod=97 = MPS_FRANCINEI) ✅ | global |
| `pri` | Processo de Importação (`priEspRefcliente` = ref do cliente, ex. 0021INX/25) ✅ | imp021, com297 |
| `doc` | Documento fiscal/financeiro (`docCod`, `docTip`, `docEspNumero`) ✅ | com296/297/298 |
| `fis` | Fiscal (`fisCod` = sequência fiscal do doc) ✅ | com29x |
| `dpr` | Item de documento-produto (linha de mercadoria) ✅ | com297/298 comDocProdutos |
| `ctp` | Conta do Projeto (`ctpDesNome`, `ctpEspConta`) ✅ | comDocProdutos, encargos |
| `ccu` | Centro de Custos (`ccuDesNome`, `ccuEspConta`) ✅ | comDocProdutos |
| `prj` | Projeto (`prjCod`) ✅ | comDocProdutos |
| `ung` | Unidade de Negócio (`ungDesNome`) ✅ | comDocProdutos |
| `dtr` | Encargo/tributo do doc (`dtrNumOrdem`, `dtrPctAliquota`, `dtrMnyValormn`, `dtrMnyValorDolar`) ✅ | com017 encargosGerais |
| `imp` (campo) | Imposto/encargo (`impCod`, `impDesNome`) ✅ | com017 |
| `tit` | Título financeiro (`titFltTaxaMneg` = taxa) ✅ | psq015, com311 |
| `bxa` | Baixa de título (`bxaFltTxconv` = taxa da baixa) ✅ | baixasTitulo |
| `ger` | Gerencial / natureza (`gerNum` — ver labels na memória) ✅ | financeiro |
| `cct`/`vw` | Conta Corrente do processo (`cctMnyCredito`/`cctMnyDebito`, `vwOrigem`, `vwEvento`) ✅ | imp021 Conta Corrente |
| `prv`/`tev`/`evn`/`rev` | Evento do processo (`prvDtaPrevisao`, `prvDtaResposta`, `tevEspDescricao`, `evnDesNome`, `revEspNome`) ✅ | imp021 Eventos |
| `pid` | Item de despesa do processo (`pidMnyValormn`, `pidVldFormaReteio`) ✅ | imp021 Despesas |
| `pfe` | Fechamento do processo (`pfeVldTipo`, `pfeDtaFechamento`) ✅ | imp021 fechProcesso |
| `moe` | Moeda (`moeCod`, `moeEspNome`); `Mny`=BRL, `Mneg`=moeda negociada ✅ | contratos/títulos |
| `prd` | Produto (`prdDesNome`, `prdCod`) ✅ | cadastro/itens |
| `und` | Unidade de medida (`undDesNome`, `undEspSigla`) ✅ | itens |
| `cfo` | CFOP (`cfoEspCod`) ✅ | itens fiscais |
| `und`/`ncm` | NCM (`prdQtdNcm`, `cbiEspClassTrib...` IBS/CBS) | itens |

## Tipos (infixo)

| Infixo | Significado |
|---|---|
| `Cod` | código (id/FK) |
| `Des` | descrição/nome (`DesNome`) |
| `Esp` | "especial" — valor de exibição/identificador textual (`EspConta`, `EspNumero`, `EspRefcliente`) |
| `Pre` | preço/valor monetário (`PreTotalbruto`, `PreValorun`) |
| `Mny` | monetário em BRL |
| `Flt` | float/taxa (`FltTaxaMneg`, `FltCustoMedio`) |
| `Qtd` | quantidade |
| `Pct` | percentual/alíquota (`PctAliquota`, `PctIcms`) |
| `Vld` | validador/flag/situação (`VldVisivel`, `vldStatus`, `VldCstIcms`) |
| `Dta` | data (epoch ms no wire; datas numéricas = 00:00 UTC do dia) |
| `Num` | número/ordem (`NumOrdem`) |
| `Lng` | texto longo (`LngComplemento`, `LngDescrNf`) |

## Quirks de wire (ver memória `conexos-apidocs-access`)
- `Mny` = BRL; `Mneg` = moeda negociada; `titFltTaxaMneg` (30,12) = taxa do título.
- Datas numéricas = meia-noite UTC exata do dia-calendário (sem shift).
- Filtros `#LE`/`#GE` exigem epoch ms (ISO → 500 ECnxDataType).
- Filtros de lista na URL viram `campo!OP=valor` (ex. `priEspRefcliente!LIKE=...`, `vldStatus!IN=1`).
- Headers obrigatórios: `cnx-filcod: 2`, `cnx-usncod: 97`, `cnx-datalanguage: pt`.
