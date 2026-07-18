# SISPAG fin052 — exploração (perna de RETORNO / ingestão do `.RET` → baixa)

> Base: OpenAPI `docs/conexos-api/090-fin0.json` (tag `fin-052-controller`) + `120-ger0.json`
> (`ger-015-controller`, config de layout) + sondagem READ-ONLY ao vivo em HML 2026-07-11
> (`jobs/probe-fin052-hml.ts`). É o par da perna de IDA (fin015 → `.REM`): o banco devolve
> um `.RET`, o Nexxera larga na pasta/SharePoint, o robô-poller sobe no `fin052`
> (`carregar` → `processar`), que parseia e dá as **baixas** no `fin010`.

## O que é o fin052 — "Retorno de Bancos Pagfor"
Tela que ingere arquivos de retorno bancário. **Chave composta do arquivo:** `(filCod, bncCod, gtbCodSeq, garCodSeq)`.
- `gtbCodSeq` = config de **layout de retorno** (FK p/ `ger015`; o parse do CNAB mora no `gtbLngSql`).
- `garCodSeq` = sequencial do arquivo carregado (`gar*` = **G**er **AR**quivos de retorno).
- `garVldStatus` / `garVldProcStatus` = status do arquivo (carregado / processado / cancelado).

## Fluxo de ingestão endpoint-a-endpoint (OpenAPI, tag `fin-052-controller`)
1. **LIST** grid: `POST /api/fin052/arquivosRetorno/list` (`CnxListRequest` → `GerArquivosRetorno[]`).
2. **CARREGAR** (upload do `.RET`, **multipart/form-data**): `POST /api/fin052/arquivosRetorno/carregar/{bncCod}/{gtbCodSeq}?fileName=` — body `multipart/form-data { file: binary }`. Aloca `garCodSeq`.
3. **PROCESSAR** (parseia → gera baixas): `PUT /api/fin052/arquivosRetorno/processar` (headers-only no OpenAPI — **body não documentado**).
4. **LIBERAR títulos**: `PUT /api/fin052/arquivosRetornoLiberacaoTitulos/liberar` (**body não documentado**) + list `POST .../arquivosRetornoLiberacaoTitulos/list/{bnc}/{gtb}/{gar}`.
5. **CANCELAR**: `PUT .../arquivosRetorno/cancelar` e `PUT .../cancelar/{bnc}/{gtb}/{gar}`.

## Leitura (mapa)
- `POST arquivosRetorno/list` — grid. **EXIGE filtros `bncCod` E `gtbCodSeq`** (400 sem eles, confirmado ao vivo).
- `GET arquivosRetorno/{bnc}/{gtb}/{gar}` — header do arquivo.
- `POST arquivosRetornoDetalhe/list` — **detalhe linha-a-linha; é a PONTE com o fin010** (carrega `bxaCodSeq` + `borCod` + `titCod`/`docCod`). ⚠️ exige filtro(s) além da chave — `REQUIRED_FILTER_ERROR` ao vivo (precisa HAR).
- `POST arquivosRetorno/erro/list` — erros de parse (`GerArquivosRetornoErro`: `areCodLine`, `areEspErro`). NÃO tem `filCod`.
- `POST ger015/list` — configs de layout de retorno (descobre os `(bncCod, gtbCodSeq)` válidos).

## DTOs (campos-chave)
- **`GerArquivosRetorno`** (grid): `filCod, bncCod, gtbCodSeq, garCodSeq, garEspArquivo, garVldStatus, garVldProcStatus, gtbDesNome, bncDesNome, erro, titulosRejeitados` (retorno parcial/rejeitado), timestamps.
- **`GerArquivosRetDet`** (detalhe — ponte fin010): `filCod, bncCod, gtbCodSeq, garCodSeq, ardCodSeq, flpCod, itsCodSeq, docTip, docCod, titCod, borCod, borVldTipo, `**`bxaCodSeq`**`, fbeEspCod/Descricao (evento bancário), dpeNomPessoa, titDtaVencimento, itsMnyVlrPgto`.
- **`GerArquivosRetornoErro`**: `bncCod, gtbCodSeq, garCodSeq, areCodSeq, areCodLine, areEspErro`.
- **`GerRetornoBancos`** (ger015): `bncCod, gtbCodSeq, gtbDesNome, gtbVldStatus, grbEspIdent, gtbLngSql` (script de parse).

## Ponte RETORNO → BAIXA (fin010)
O `arquivosRetornoDetalhe` traz `bxaCodSeq` + `borCod` + `titCod`/`docCod` — o link direto para a **baixa** gravada no `fin010` (`POST fin010/baixas` devolve `bxaCodSeq`). Ou seja: o `processar` (ou o `liberar`) provavelmente dá as baixas **nativamente em lote** (paralelo a como o fin015 gera o `.REM` nativo) — a decidir com HAR se é o `processar` que baixa ou se estagia p/ o `liberar`.

## Validação HML AO VIVO (2026-07-11, `jobs/probe-fin052-hml.ts`, READ-ONLY)
- **`ger015/list` ✅** — 4 configs de retorno (todas `gtbCodSeq=1`): **BB (bnc3)**, **Itaú (bnc4, "ITAÚ PADRÃO")**, **Bradesco (bnc7)**, **Santander (bnc10)**. É o par `(bncCod, gtbCodSeq)` que o `carregar` precisa.
- **`arquivosRetorno/list` ✅** — **exige `bncCod` E `gtbCodSeq`** (descoberto: 400 "O filtro 'X' é requerido"). HML tem **1 arquivo de retorno real** (Itaú): `gar1 · PG121102.REM · status 1/1 · 0 rejeitados · 0 erros`.
- **`arquivosRetorno/erro/list` ✅** — 0 erros no arquivo limpo (filtro = bnc/gtb/gar, **sem** filCod).
- **`arquivosRetornoDetalhe/list` ⚠️** — `REQUIRED_FILTER_ERROR` mesmo com a chave `(filCod,bnc,gtb,gar)`. **Precisa de HAR** p/ o conjunto exato de filtros exigidos (provável `flpCod`/`ardCodSeq` ou nome de filtro específico).

## Ferramentas entregues (`ConexosSispagRetornoClient`)
Leitura (validadas em HML): `listConfigsRetorno` (ger015), `listArquivosRetorno` (exige bnc+gtb), `listErros`, `getArquivoRetorno`. Leitura mapeada mas bloqueada por filtro: `listDetalhe` (HAR). Escrita: `carregarArquivoRetorno` (multipart, **não validada** — precisa `.RET`). Infra net-new: `postMultipartOnce` (`ConexosBaseClient` + `services/conexos.ts` `authenticatedPostMultipart`, FormData nativo, tentativa única).

## Lacunas / perguntas para o analista (segunda 2026-07-13)
1. **Pedir um `.RET` de exemplo** (retorno CNAB real do banco) — sem ele não há como validar `carregar`/`processar`.
2. **HAR de `processar` e `liberar`** — os bodies dos PUT não estão no OpenAPI.
3. **HAR do `arquivosRetornoDetalhe/list`** — o conjunto de filtros exigidos (o nosso `REQUIRED_FILTER_ERROR`).
4. **`processar` dá a baixa ou estagia p/ `liberar`?** (define se dirigimos o nativo ou montamos baixa fin010 à mão).
5. **Retorno rejeitado/parcial** — `titulosRejeitados` + `arquivosRetorno/erro`: como o analista trata hoje?
6. Enums de `tipoProcessamentoRetornoArquivo` / `fChkOutrasFiliais` (só filtros de UI).

## Como rodar
```
cd src/backend
# leitura (sonda exploratória):
CONEXOS_BASE_URL=https://columbiatrading-hml.conexos.cloud/api npx tsx jobs/probe-fin052-hml.ts
# leitura via client (harness):
CONEXOS_BASE_URL=https://columbiatrading-hml.conexos.cloud/api npx tsx jobs/validate-fin052-tools.ts
# upload do .RET (quando houver): + FIN052_WRITE=1 RET_FILE=/caminho/x.RET BNC=4 GTB=1
```

## Depois da reunião (Fatia 3 retorno completa)
`processar`/`liberar` (com HAR) → serviço de orquestração + **robô-poller** (lê a pasta/SharePoint de retorno, sobe o `.RET`, processa, confirma a baixa) → transição de status (`RETORNADO`→`BAIXADO`) → tratar rejeitado/parcial. Ver [[sispag-fin015-exploration]] (perna de ida) e a doutrina de escrita irreversível.
