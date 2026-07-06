# Ponte Ontologia ↔ Conexos (telas + endpoints + schema)

Liga cada **entidade da `ontology/`** à **tela do ERP**, ao **endpoint do swagger** e ao **DTO/atributo**
de resposta documentados em `lifecycle/`. As entidades da ontologia já trazem `source: "Conexos <ctrl>"`
nas propriedades; esta ponte acrescenta a camada que faltava: **endpoint exato + DTO + rótulo de tela**.

> ⚠️ Não edito os arquivos de `ontology/entities/*.md` (governados pelo OntologyCurator + aprovação do Yuri).
> A coluna "Sugestão p/ Curator" são **candidatos** de refino, não mudanças aplicadas.

| Entidade (ontology) | Fase | Tela (UI) | Endpoint | DTO / campos-chave | Sugestão p/ Curator |
|---|---|---|---|---|---|
| `ProcessoImportacao` (`imp021`) | 30 | Processos - Edição (`/imp021#/cadastro/{filCod}/{priCod}`) | `GET /api/imp021/{priCod}` | `ImpProcesso` (priCod, priEspRefcliente, pesCod, priDtaAbertura, priFltTxDolar, tipoFechamento) | confirmar `pesCod` (já marcado `implemented:false`) — presente no DTO |
| `DespesaProcesso` (`imp021`) | 30 | Processo → botão **Despesas** | `POST /api/imp021/DespesasProcesso/{priCod}` | `ImpProcessoDespesas` (impDesNome, pidMnyValormn, ctpDesNome) — **bate 1:1 com a ontologia** | endpoint exato = `DespesasProcesso/{priCod}` (registrar) |
| `EncargoNF` (`com017`) | 40 | NF → Mais Ações → **Encargos Gerais** → IMPOSTOS | `GET /api/com017/encargosGerais/{docTip}/{docCod}/{filCod}/{v}/{v}` | `EncargosGeraisDTO`: `impostos[]`=`ComDocProdtribGeral`(dtrMnyValormn/dtrMnyValorDolar), `despesas[]`=`ComDocProdutosDespesasGeral`(dppMnyValorMn) | ontologia usa `dppMnyValorMn` (=array `despesas[]`); IMPOSTOS usam `dtrMnyValormn` — distinguir as 2 listas |
| `Invoice` (`log009`) | 20 | Invoice - Pesquisa (`/log009`) | `GET /api/log009/{invCod}` | `PrcInvoice` (invEspNumero, invCodExportador, invPreVlrtotal, **invVldTipoFrete**=incoterms) | entidade está `planned` c/ nomes genéricos → mapear p/ campos reais `PrcInvoice` |
| `ContratoCambio` (`imp059`) | 10 | Contrato de Câmbio - Pesquisa (`/imp059`) ✅ | `GET /api/imp059/{imcCod}` · `vinculoHedge/list` · `vinculoFinimp/list` | `ImpContratoCambio` (imcNumNumero, imcDtaFechamento, **imcFltTxFec**, moeCod) + grid **Var. Total/Var. Acumulada** | ✅ confirmado FX (não comercial); VC nativa no grid |
| `VariacaoCambial` | 70 | (fechamento de câmbio) | `POST /api/log009/fechamentoCambio/list` · `com308/varCambial/list` | `ImpContratoCambioInv` (**vlrVariacaoCambial**, vlrVariacaoCambialAntec, imcFltTxFec) | fonte nativa de VC no ERP — referenciar p/ reconciliação |
| `NotaFiscalSaida` (`com297`) | 50 | Fiscais de Saída (`/com297`) | `POST /api/com297/list` · `comDocProdutos/list/{docCod}/{fisCod}` | `FinDocCab` (cabeçalho) · `ComDocProdutosFisFin` (itens=mercadoria) | itens da NF = mercadoria; encargos via com017 |
| `NotaFiscal` (entrada, `com296`) | 50 | Fiscais de Entrada (`/com296`) | `POST /api/com296/list` · `GET /api/com296/{docCod}` | `FinDocCab` (compartilhado com com298/com299) | registrar DTO comum `FinDocCab` (com296/298/299) |
| `Cfop` (`cmn023`) | 00 | CFOP | `GET /api/cmn023/{cfoEspCod}` | `CmnCfop` (cfoDesNome, cfoVldTratFisIpi/Icms) | — |
| `Produto` (`com006`) | 00 | Cadastro de Produtos | `GET /api/com006/{prdCod}` | `ComProdutos` (prdDesNome, tecEspCod=NCM) | — |
| `Ncm` (`imp013`) | 00 | Mercadorias na TEC (`/imp013`) ✅ | `POST /api/imp013/list` | Código NCM + EX-tarifário + alíquotas II/IPI/PIS/COFINS | ✅ fonte das alíquotas; herdada via `tecEspCod` |
| `Fornecedor` / pessoa (`cmn025`) | 00 | Cadastro de Pessoas | `POST /api/cmn025/list` | (pessoa: pesCod/dpeCodSeq) | — |
| `SolicitacaoNumerario` (`imp038`) | 35 | Sub-tela SN (rodapé processo) | `imp038/*` | (schema a capturar) | sub-tela contextual; gera títulos (fase 60) |
| `Di` / `AdicaoDi` (`imp019`) | 35 | Cadastro de DI/DSI - Edição (`/imp019#/cadastro/{fil}/{cdi}/{seq}`) ✅ | `GET /api/imp019/{...}` · **`impDiAdicao/list`** (adições) · **`impDiPlanilha/list`** (tributos) | DI: Capa/Adições(NCM,Regime,Método valoração,CIF)/Itens/Despesas(II/IPI/PIS/COFINS/Siscomex)/Planilha-imp026 | ✅ **`imp019`=DI importação** (≠ imp190=DU-E export); AdicaoDi=`impDiAdicao` |
| `Du-e` (export) (`imp190`) | 35 | Registro de DU-E (`/imp190`) ✅ | `POST /api/imp190/list` | RUC, URF despacho/embarque, chave de acesso | ✅ DU-E = exportação (Portal Único) |
| `OrdemFaturamento` (`imp002`) | 50 | Ordem de Faturamento (`/imp002#/cadastro/{fil}/{pri}/{odf}`) ✅ | `GET /api/imp002/{fil}/{pri}/{odf}` · `impOrdFatRelac/list` · `grid/.../ImpItensOrdFat` | ODF: Dados(CFOP/Tipo Op/Série NF)/Serviços; Config OF (ENTRADA IMPORTAÇÃO/REMESSA C&O/PRESTAÇÃO SERVIÇOS) | ⭐ orquestra NFs; modelo conta-e-ordem; candidata a entidade nova |
| `PresencaCarga` (`imp237`) | 35 | Presença de Carga (`/imp237`) ✅ | `POST /api/imp237/list` | `ImpPresencaCarga` (CE-Mercante, recinto, SRF; Transmitir Siscomex) | ✅ precede DI; CE-Mercante de log012 |
| `BaixaTitulo` (`fin010`/`fin014`) | 60 | Baixa de Títulos a Pagar/Receber (`/fin010`,`/fin014`) ✅ | `GET /api/fin010/{borCod}` · `fin014/taxasBaixa/list` | borderô (borCod); data + **taxa conversão** (bxaFltTxconv) | ✅ base de juros perdidos/var.cambial; permuta=encontro de contas |
| `Proforma` (`log003`/`log111`) | 20 | Cadastro de Proforma imp/export (`/log003`,`/log111`) ✅ | `POST /api/log003/list` | PO, valor seguro, origem | ✅ antecede Invoice (log009/log091) |
| `AnaliseFechamento` / `FechamentoMensal` | 70 | Fechamento | `imp021/fechProcesso`, `com099/resultadoFaturamento` | `ImpProcessoFechamento`, `ComPedidosResultadoFaturamentoDTO` | datas op/fin/contábil + margem |

## Padrões transversais úteis p/ a ontologia
- **`FinDocCab`** é o DTO único de documento financeiro/fiscal: `com296` (entrada), `com298` (a pagar),
  `com299` (a receber) — diferenciados por `docVldTipo`/`docTip`. Candidato a entidade-base na ontologia.
- **Glossário de prefixos** (`_glossary.md`) padroniza os nomes de campo (`pri*`, `dpr*`, `ctp*`, `dtr*`,
  `pid*`, `tit*`) — útil para nomear propriedades novas de forma consistente com o wire do ERP.
- As **2 fontes de "ENCARGOS GERAIS"** (impostos `com017` vs despesas `imp021`) explicam por que
  `EncargoNF` e `DespesaProcesso` são entidades distintas com chave de agregação `ctpDesNome` comum.
