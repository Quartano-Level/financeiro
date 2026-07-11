# SISPAG fin015 — caixa de ferramentas de ESCRITA (Fatia 3, perna de IDA)

> Branch `feat/sispag-fin015-write-tools`, 2026-07-11. Constrói as **ferramentas** de
> integração com a tela `fin015` (Geração de Lotes SISPAG / remessa `.REM`) — NÃO o fluxo
> de orquestração, que é decidido com o analista (segunda 13/07): como ele monta o lote a
> partir do nosso elegível + exceções (Santander×Itaú, internacional). Depois da reunião,
> o fluxo real só **encaixa** estas peças já prontas. É a 1ª superfície de ESCRITA do
> SISPAG no Conexos (quebra I1); espelha a doutrina de `ConexosBaixaClient` (fin010).

## Entregue
- **`domain/client/ConexosSispagWriteClient.ts`** — o client de escrita (`@singleton @injectable`,
  composição de `ConexosBaseClient`). 7 ferramentas, doutrina de escrita irreversível.
- **`domain/interface/sispag/Fin015Write.ts`** — DTOs (ContaPagadora, CriarLoteParams, etc.).
- **`domain/client/ConexosSispagWriteClient.test.ts`** — 11 testes unitários (shape/Zod/erro).
- **`jobs/validate-fin015-tools.ts`** — harness de validação HML (guard anti-PRD + opt-in `FIN015_WRITE=1`).

## As 7 ferramentas (cada uma = 1 chamada da tela fin015)
| # | Ferramenta | Endpoint | Tipo | Doutrina | Prova HML |
|---|-----------|----------|------|----------|-----------|
| 1 | `criarLote` | `POST /fin015` | escrita não-idempotente | `postGenericOnce`, Zod exige `flpCod` | ✅ criou flp 18 (2026-07-09) |
| 2 | `listarTitulosPendentes` | `POST finItemSispag/titulosPendentes/list/{fil}/{bnc}/{flp}` | leitura | `runWithRetry` | ✅ (grid) |
| 3 | `importarTitulos` | `POST finItemSispag/titulosPendentes/importar` | escrita | `postGenericOnce`, shape `{items:[...]}` | ⚠️ wrapper/endpoint provado; **item exato = gap** (precisa modalidade+destino, não vem no list) |
| 4 | `finalizarLote` | `GET finalizarLote/{fil}/{bnc}/{flp}` | transição | tentativa única; parseia R1/R2 | ✅ (400 VALIDATION_LIST com R1/R2) |
| 5 | `gerarRemessa` | `POST gerArquivosBancos/gerarRemessa` | escrita não-idempotente | `postGenericOnce`, Zod SUCESSO | ✅ 200 + `.REM` (2026-07-09) |
| 6 | `listarArquivosRemessa` | `POST gerArquivosBancos/list/{fil}` | leitura | `runWithRetry`; traz `.REM` em `gabLngDados` | ✅ (salvou o `.REM`) |
| 7 | `baixarRemessa` | `GET gerArquivosBancos/download/{gabCod}` | leitura (octet-stream) | `runWithRetry` | ✅ 200 |

## Decisões de construção (para o serviço de orquestração pós-analista)
- **Gating NÃO está no client** (igual `ConexosBaixaClient`): `conexosWriteEnabled`/`conexosDryRun`,
  idempotência (ledger write-ahead com idempotency-key UNIQUE), audit persistida e a checagem de
  filial do usuário são do **SERVIÇO** de orquestração — a construir com o fluxo real.
- **Todas as 3 escritas usam `postGenericOnce`** (mais conservador que o `criarBordero`, que tolera
  401-retry): sem ledger ainda, tentativa única evita duplicar lote/remessa por re-POST silencioso.
- **Conta pagadora default = Itaú `AG:0641/CT:55795-4`** (empírico, 8/8 lotes PRD). Santander = exceção
  (roteamento a definir com o analista). Modelado como `ContaPagadora` (parametrizável).
- **Data débito**: regra R1 (≥ hoje) + R2 (≤ menor vencimento) é **validada pelo ERP no `finalizarLote`**
  e o motivo vem em `ConexosError.message` (parse do `VALIDATION_LIST`). A política "data débito = hoje"
  (empírica) fica no serviço.
- **Internacional**: NÃO entra no fin015 (é câmbio, rail separado). A Fatia 3 nacional usa estas ferramentas;
  o papel dos lotes internacionais é decisão de segunda.
- **`.REM` → pasta/SharePoint** (VAN Nexxera) e a **perna de RETORNO** (poller + `fin052`) NÃO estão aqui:
  dependem do caminho da pasta (Ricardo) e de um `.RET` de exemplo (pedir à analista segunda).

## Validação HML AO VIVO (2026-07-11, pelo client real — `jobs/validate-fin015-tools.ts`)
Rodado em `columbiatrading-hml.conexos.cloud`. Resultado por ferramenta:
- **1 `criarLote` ✅** — `POST /fin015 → 200`, criou flp 19/20/21 (lotes de teste em HML).
- **2 `listarTitulosPendentes` ✅** — `→ 200 count=320`. **NOVIDADE:** o HML agora TEM 320 títulos
  pendentes (o dado que faltava em 09/07). Primeiro = docCod 18.
- **3 `importarTitulos` ⚠️** — wrapper `{items:[...]}` + endpoint OK, mas o item **400** mesmo enriquecido
  com `{filCodLote,bncCod,flpCod}`. **Motivo:** o item de import precisa de `itsVldModalidade` (boleto/TED/PIX)
  + destino de pagamento, que **NÃO vêm** no `titulosPendentes/list` — são do cadastro do favorecido / escolha
  do analista. Erro do ERP não veio em VALIDATION_LIST (msg default). → **GAP genuíno p/ o fluxo de segunda:**
  capturar um HAR de um import com SUCESSO na tela real, ou o analista definir a modalidade por título.
- **4 `finalizarLote` ✅** — tool + parser OK: `400` surfacou *"ESTE REGISTRO NÃO PODE SER FINALIZADO. O LOTE
  ESTÁ VAZIO"* (o `describeConexosValidation` extraiu a msg). Vazio porque o import não fechou.
- **5 `gerarRemessa` ✅** — tool + parser OK: `400` surfacou *"LOTE_DEVE_SER_FINALIZADO_PARA_GERACAO_REMESSAS"*.
  (Foi **200 + `.REM`** em 09/07 com um lote finalizado — mecânica provada.)
- **6 `listarArquivosRemessa` ✅** — `→ 200`, trouxe `.REM` em `gabLngDados` (flp 6 tinha 2 arquivos).
- **7 `baixarRemessa` ✅** — `GET download/40 → 200`, baixou um `.REM` real (1210 chars, CNAB 240).

**Inventário dos campos do `titulosPendentes/list`** (p/ montar o item de import no fluxo real):
`ctrCod, docCod, docDtaEmissao, docEspNumero, docMnyValor, docTip, docVldSituacao, docVldTipo,
docVldTipoAdto, dpeNomPessoa, espPago, filCod, itemy, mnyAberto, pesCod, pgtDesNome, priCod,
priEspRefcliente, titCod, titDtaVencimento, titEspCodbar, titEspNumero, titMnyDesconto, titMnyJuros,
titMnyTotPago, titMnyUsaAdto, titMnyValor, titTim1libera, titTim2libera, titTim3libera…`
→ **tem** `titEspCodbar` (barras) e as chaves; **falta** `itsVldModalidade` (setada no import).

## Como rodar de novo
Rodar (leitura+escrita, deixa artefatos de teste em HML como as sondas):
```
cd src/backend
CONEXOS_BASE_URL=https://columbiatrading-hml.conexos.cloud/api FIN015_WRITE=1 npx tsx jobs/validate-fin015-tools.ts
```
Guard: recusa se a base não for `-hml`. Sem `FIN015_WRITE=1` = no-op (só bootstrap+login).

## O que falta (pós-reunião)
1. **Fluxo real de montagem** do lote nativo a partir do nosso `lote_pagamento` FINALIZADO (como o analista faz).
2. **Exceções**: roteamento título→conta (Santander), papel do internacional.
3. **Serviço de orquestração** `RemessaService`: gating + idempotência (ledger) + audit + mapeamento das
   chaves nativas (`native_flp_cod`/`native_gab_cod`) no `lote_pagamento` (migration) + transição de status.
4. **Fechar `importar` com dado real** (HML com título nacional a-vencer com modalidade, ou na 1ª execução PRD gated).
5. Perna de **RETORNO** (`.RET` → `fin052` → baixa) — depende do `.RET` de exemplo.
