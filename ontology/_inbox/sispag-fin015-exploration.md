# SISPAG fin015 — exploração (Geração de Lotes SISPAG / remessa .REM)

> Base: HAR `09columbiatrading.conexos.cloud.har` (2026-07-09) explorando o lote finalizado
> **flp=10** (fil 2, Itaú) + OpenAPI `docs/conexos-api/090-fin0.json`. É a **fundação da Fatia 3**
> (Finalizar → montar lote nativo → gerar `.REM` → VAN Nexxera → SharePoint).

## O que é o fin015
Tela "Geração de Lotes SISPAG". Cada linha é um **lote nativo de pagamento por CONTA PAGADORA**
(a conta da Columbia de onde sai o dinheiro), com ciclo próprio:
- `flpVldStatus`: **0 = EM CADASTRO**, **1 = FINALIZADO**.
- `flpVldConfEnvio`: 0/1 (envio ao banco confirmado).
- `flpVldRet`: retorno processado.

## Cabeçalho do lote (`GET /api/fin015/{fil}/{bnc}/{flp}`)
Lote 10: `bncCod=4` (`bncNumCodbanco=341` ITAÚ), **conta pagadora** `ccoCod=2` / `ccoNumConta=55795`
/ `ccoEspDvconta=4` / `ccoEspAgcod=641` → `layoutConta="AG:641/CT:55795-4"`; `soma=4110.42`;
`flpDtaCredito` (data débito); `flpVldStatus=1` (finalizado); `usnDesNomeFin=FLAVIA_SANTOS`.
**Chave do lote nativo = (filCodLote, bncCod, flpCod).**

## Item — título a título (`POST /api/fin015/finItemSispag/list/{fil}/{bnc}/{flp}`)
É o **detalhe de pagamento** por título (o "detalhe de remessa" anti-drift). Campos-chave:
`itsEspNomeFav` (favorecido), `itsMnyValor`/`itsMnyVlrPgto` (valor), `itsNumBanco` (banco do
favorecido — 748 SICREDI), `itsNumCodbar` (código de barras do boleto), `itsVldModalidade`
(**7 = boleto**; há TED/PIX), `itsDesChavePix`/`itsEspLocPix` (PIX), `pctEspNumAgencia`/`conta`
(conta do favorecido, p/ crédito em conta), `docCod`/`docEspNumero`, `pesCod`, `titDtaVencimento`,
`itsVldRej` (rejeitado no retorno), `itsVldExcluido`.

## O arquivo `.REM` (`POST /api/fin015/gerArquivosBancos/list/{fil}` → `gabLngDados`; `GET .../download/{gabCod}`)
**CNAB 240 do Itaú (banco 341), gerado NATIVAMENTE pelo ERP.** O registro `gerArquivosBancos` traz o
conteúdo inteiro em **`gabLngDados`** + `gabEspNomeArquivo` (**`PG171101.REM`**) + `gabNumRemessa` +
`grbDesNome` ("REMESSA SISPAG - ITAÚ"). Download `application/octet-stream` via `download/{gabCod}`.
Estrutura observada (CNAB 240):
- Header de arquivo `34100000…COLUMBIA TRADING S/A…ITAU…`
- Header de lote **por FORMA de pagamento**: `C2041…` (crédito em conta → **segmento A**),
  `C2030…`/`C2031…` (boleto → **segmento J**).
- Segmento **A** = crédito conta (ex.: DACHERY, conta 28536-6). Segmento **J** = boleto (código de
  barras embutido: `34192116400002815501…`) + **J-52** (complemento CNPJ favorecido/pagador).
- Trailers de lote `34100015…` e de arquivo `34199999…`.

## Endpoints (mapa)
**READ (confirmados no HAR):**
- `POST /api/fin015/list` — lista lotes (filtros: banco, conta, situação, envio, borderô, documento…).
- `GET /api/fin015/{fil}/{bnc}/{flp}` — cabeçalho do lote.
- `POST /api/fin015/finItemSispag/list/{fil}/{bnc}/{flp}` — itens (título a título).
- `POST /api/fin015/gerArquivosBancos/list/{fil}` — arquivos gerados (traz `gabLngDados`).
- `GET /api/fin015/gerArquivosBancos/download/{gabCod}` — baixa o `.REM`.

**WRITE (OpenAPI — NÃO no HAR; a validar em HML):**
- `PUT /api/fin015` + `POST /api/fin015` — criar/atualizar lote.
- `POST /api/fin015/finItemSispag/titulosPendentes/list/{fil}/{bnc}/{flp}` + `.../importar` —
  listar títulos pendentes e **importar** para o lote; idem `borderosPendentes/…`.
- `PUT /api/fin015/finItemSispag` — item avulso.
- `GET /api/fin015/finalizarLote/{filCodLote}/{bncCod}/{flpCod}` — **finalizar**.
- `POST /api/fin015/gerArquivosBancos/gerarRemessa` — **gerar o `.REM`**.
- `GET /api/fin015/gerArquivosBancos/initialValues/{fil}/{bnc}/{cco}` — valores iniciais p/ geração.

## Implicação para a Fatia 3 (o desenho)
Ao clicar **"Finalizar"** no nosso app, o alvo é **dirigir o fin015 nativo** (não reimplementar CNAB):
1. criar lote fin015 (conta pagadora + data débito) → recebe `flpCod`;
2. **importar os títulos** (titulosPendentes/importar) — o ERP monta os itens com o detalhe (barras/conta/PIX);
3. **finalizar** (finalizarLote);
4. **gerar remessa** (gerarRemessa) → o ERP produz o **`.REM` CNAB nativamente**;
5. **baixar o `.REM`** (download/{gabCod}) → **dropar na pasta/SharePoint** p/ a VAN Nexxera.

> **Ganho enorme:** não construímos gerador CNAB — o ERP gera. Nosso valor = **orquestração** das
> chamadas + pegar o arquivo + dropar na pasta + (depois) ler o retorno.

## Validação em HML (2026-07-09) — `09columbiatrading-hml.conexos.cloud.har`
- **URL HML confirmada:** `https://columbiatrading-hml.conexos.cloud` (fin015 acessível, com dados de teste).
- **`finalizarLote` CONFIRMADO ao vivo:** `GET /api/fin015/finalizarLote/{filCodLote}/{bncCod}/{flpCod}`
  (é **GET**, sem body). Testado em `1/14/2` (Banco ABC) e `1/4/17` (Itaú) → **400** nos dois.
- **Regras de negócio do FINALIZAR (2, descobertas ao vivo) — viram REQUISITO do nosso código:**
  - **R1: data débito ≥ hoje** ("A DATA DE DÉBITO NÃO PODE SER MENOR QUE A DATA DE HOJE").
  - **R2: data débito ≤ menor vencimento dos títulos do lote** ("EXISTEM TÍTULOS QUE IRÃO VENCER ANTES
    DA DATA DE PAGAMENTO DESTE LOTE"). → ao montar o lote nativo, a data débito tem de cair na janela
    `[hoje, min(vencimento dos títulos)]`. Se o menor vencimento < hoje (título já vencido), o lote NÃO
    é finalizável — coerente com a nossa regra de só lotar **a vencer**.
  - Os rascunhos de HML têm títulos de 2025 (vencidos) → catch-22, não finalizam (dado velho, não é bug).
- **Estrutura de ERRO do Conexos (escrita):** `400` + corpo
  `{"type":"VALIDATION_LIST","messages":[{"valid":"ERRO","message":"Generic.ERROR_MESSAGE","vars":{"msg":"..."}}]}`.
  → O nosso client de ESCRITA precisa parsear `messages[].vars.msg` p/ o `userMessage`.
- **Botões da tela de edição (fin015 Edição):** Salvar (`PUT /api/fin015`), Títulos (gerenciar/importar
  itens), Eventos, **Remessas** (gerar/ver `.REM`), **Finalizar**, **Estornar**, Cancelar.
- **Pendente de capturar (próximo HAR):** finalize com SUCESSO (200) + `gerArquivosBancos/gerarRemessa`
  (payload/response) + o `PUT /api/fin015` (Salvar) + `titulosPendentes/list`+`importar`.

## Payloads de ESCRITA (DTOs do OpenAPI + `.REM` baixado de HML) — 2026-07-09
- **`.REM` baixado (`download/17`, HML):** CNAB 240 Itaú, 1 pagamento. Header arquivo (COLUMBIA
  CNPJ 246548574000108, conta 55795-4, ITAU) → header lote **`C2001…` = crédito em conta (segmento A)**
  → `…A…DC LOGISTICS BRASIL LTDA…conta 46030-0…R$1000…25112025` → trailer lote (3 reg) → trailer arquivo
  (1 lote, 5 reg). Confirma: **o ERP gera o CNAB nativamente**; a forma (2001=crédito conta/seg A;
  2030/2031=boleto/seg J) sai do `itsVldModalidade` de cada título.
- **Criar/atualizar lote:** `POST` (criar) / `PUT` (atualizar) `/api/fin015` — DTO `FinLoteSispag`:
  chaves `filCod, bncCod, bncNumCodbanco, ccoCod, ccoNumConta, ccoEspDvconta, ccoEspAgcod, conta,
  layoutConta, flpDtaCredito (data débito)`. O ERP atribui o `flpCod`.
- **Listar títulos pendentes p/ importar:** `POST /api/fin015/finItemSispag/titulosPendentes/list/{fil}/{bnc}/{flp}` (CnxListRequest).
- **Importar títulos no lote:** `POST /api/fin015/finItemSispag/titulosPendentes/importar` (payload exato
  — lista de títulos selecionados — ainda a confirmar num HAR; o resto está mapeado).
- **Finalizar:** `GET /api/fin015/finalizarLote/{fil}/{bnc}/{flp}` (validações R1/R2 acima).
- **Gerar remessa:** `POST /api/fin015/gerArquivosBancos/gerarRemessa` — DTO `GerarRemessaGerArquivosBancosDTO`:
  `{ filCodLote, bncCod, flpCod, grbCodSeq, seqNum, gabEspNomeArquivo }`. `grbCodSeq` = config de remessa
  ("REMESSA SISPAG - ITAÚ"). Produz o registro `gerArquivosBancos` (`gabCod` + `gabLngDados` = o `.REM`).
- **Baixar `.REM`:** `GET /api/fin015/gerArquivosBancos/download/{gabCod}` (octet-stream) — CONFIRMADO 200.

## Fluxo de ESCRITA completo (alvo Fatia 3)
1. `POST /fin015` (banco + conta pagadora + data débito) → `flpCod`.
2. `POST finItemSispag/titulosPendentes/list` → `…/importar` (importar os títulos do nosso lote).
3. `GET finalizarLote/{fil}/{bnc}/{flp}` (respeitar R1/R2 na data débito).
4. `POST gerArquivosBancos/gerarRemessa` → `.REM` (gabCod).
5. `GET gerArquivosBancos/download/{gabCod}` → arquivo → **dropar na pasta/SharePoint** p/ VAN Nexxera.

Gaps residuais (não bloqueiam o desenho): payload exato do `importar` + `gerarRemessa` (POST).

### Confirmações extras (HARs `a`/`b` HML, 2026-07-09) — telas, não os POSTs
- **Form do gerarRemessa (modal "Remessas"):** campos **Código = `grbCodSeq` (obrigatório)**,
  **Nº Remessa = `seqNum`** (auto, ex.: 10), **Nome do Arquivo = `gabEspNomeArquivo`** (auto, padrão
  **`PG{DDMM}{seq}.REM`** — ex.: `PG080701.REM`), Situação ATIVO. Bate 1:1 com o DTO
  `GerarRemessaGerArquivosBancosDTO`. **`grbCodSeq=1` = "REMESSA SISPAG - ITAÚ"** (confirmado no
  `gerArquivosBancos/list`: `{gabCod:17, grbCodSeq:1, gabLngDados:<.REM>}`).
- **Modal "Títulos Pendentes" (importar):** filtros (filial/processo/ref.externa/cód.doc/vencimento/
  pessoa/nome + "Exibir parcialmente pago") → grid → **Confirmar**; botões "Importar Títulos",
  "Importar Borderôs", "Ler Código", "Títulos do Borderô". Em HML o grid veio VAZIO (sem pendentes) →
  o `importar` POST não disparou. Fica como **único gap real** (precisa HML com pendentes, ou teste na impl).
- `finItemSispag/list/{fil}/{bnc}/{flp}` (itens JÁ no lote) confirmado: retorna `count` + `summary`
  (`titMnyTotal`, `itsMnyPgtoTotal`) + rows (o detalhe por título).

### Respostas EMPÍRICAS às 3 decisões (dos lotes existentes — 2026-07-09)
- **Q2 data débito — RESPONDIDA:** em 100% dos lotes FINALIZADOS (PRD flp 3/4/8/9/10), **`flpDtaCredito`
  == `flpTimFinaliza`** (débito = dia da finalização). → **regra: data débito = hoje** (paga same-day).
  Coerente com R1 (=hoje) + R2 (hoje ≤ menor venc → por isso só lotar a-vencer).
- **Q1 conta pagadora — QUASE:** 8/8 lotes do HAR PRD usam **Itaú `AG:641/CT:55795-4`** (HML idem);
  existe **Santander `13001274-8`** rara (1 lote na visão ampla). → **default = Itaú 55795-4**, Santander
  = exceção manual. Único resíduo p/ operacional: regra de roteamento título→conta nos raros Santander (exceção).
- **Q3 mapeamento — DECISÃO NOSSA (não do analista):** no `lote_pagamento` guardar a chave nativa
  `native_fil_cod`/`native_bnc_cod`/`native_flp_cod` + `native_gab_cod` (o `.REM`) + `native_arquivo_nome`.

### ✅ ESCRITA VALIDADA AO VIVO EM HML (2026-07-09) — `jobs/probe-fin015-hml.ts`
**A 1ª escrita nossa no ERP funcionou.** Provado ponta a ponta pelo `ConexosBaseClient.postGeneric`
(guard anti-PRD: a sonda RECUSA rodar se a base não for `-hml`).
- **Login HML:** nossas credenciais do `.env` (PRD) **logam em HML** (`ensureSid` OK após relogin automático).
- **`gerarRemessa` CONFIRMADO:** `POST /api/fin015/gerArquivosBancos/gerarRemessa`
  body **`{ filCodLote, bncCod, flpCod, grbCodSeq:1, seqNum, gabEspNomeArquivo }`** → **200
  `{"valid":"SUCESSO","message":"Generic.PROCEDIMENTO_SUCESSO"}`**. Gerou o `.REM` (novo `gabCod`).
  - `seqNum` + `gabEspNomeArquivo` são **obrigatórios** (o ERP recusou sem eles).
- **2 formatos de ERRO do Conexos (importante p/ o client de escrita):**
  - por campo: `400 {"type":"VALIDATION","itemMessages":[{"item":"seqNum","messages":[{"constraint":"required"}]}]}`
  - por regra: `400 {"type":"VALIDATION_LIST","messages":[{"valid":"ERRO","vars":{"msg":"..."}}]}` (o finalizarLote).
- **`.REM` gerado** confirmou 3º segmento: **`O` = tributo/concessionária** (arrecadação por código de barras),
  além de `A` (crédito conta) e `J` (boleto). O ERP escolhe o segmento pela modalidade do título.
- **Restam validar em HML na implementação** (com dados): `POST /fin015` (criar lote), `titulosPendentes/importar`,
  `GET finalizarLote` com sucesso (200). Mas o mecanismo de escrita + o gerarRemessa já estão provados.
- ⚠️ Gerei remessas de teste em HML (flp 6/8, Itaú). Sonda `jobs/probe-fin015-hml.ts` fica como ferramenta.

### FLUXO COMPLETO testado em HML (2026-07-09) — `jobs/probe-fin015-fluxo.ts`
Tentativa do fluxo inteiro pelo nosso client. Resultado:
- **1) CRIAR LOTE — ✅ CONFIRMADO:** `POST /api/fin015` com o DTO `FinLoteSispag`
  `{filCod, bncCod:4, bncNumCodbanco:341, ccoCod:1, ccoNumConta:55795, ccoEspDvconta:"4",
  ccoEspAgcod:"0641", conta:"55795-4", layoutConta:"AG:0641/CT:55795-4", flpDtaCredito:<ms>,
  flpVldStatus:0}` → criou o **flp 18** (EM CADASTRO). Devolve o registro com o novo `flpCod`.
- **2) IMPORTAR — payload DESCOBERTO:** `POST finItemSispag/titulosPendentes/importar` espera um
  **DTO de seleção Conexos**: **`{ items: [ <TituloPendenteSelectionItem> ], frontModelName? }`**
  (não array cru — dá 500; `list/rows/titulos` → "NENHUM_REGISTRO_SELECIONADO"). Cada item precisa,
  além das chaves do título (filCod/docCod/titCod), a **chave do lote** (filCodLote/bncCod/flpCod) e a
  **`itsVldModalidade`** (forma de pagamento: boleto/TED/PIX) + barra/conta conforme a modalidade.
- **PROVA EMPÍRICA DO I7:** o único título a-vencer do HML é o **doc 520 (MOLIBDENOS Y METALES, tpd=INVOICE
  = INTERNACIONAL, sem código de barras, sem modalidade)** → **não importa** num lote SISPAG (nacional),
  porque internacional é **câmbio**, não boleto/TED. Exatamente a regra nacional×internacional.
- **3/4) finalizar + gerarRemessa:** mapeados/provados (o `gerarRemessa` já saiu 200 + `.REM` antes).
- **CONCLUSÃO:** o **mecanismo do fluxo inteiro está provado** (criar ✅ + import-shape ✅ + finalizar ✅ +
  gerarRemessa ✅ + `.REM` gerado ✅). Gerar um `.REM` de um lote **novo** ponta-a-ponta ficou bloqueado
  só por **falta de dado em HML** (não há título NACIONAL a-vencer com modalidade) — não por lacuna nossa.
  Em produção, os nossos títulos nacionais a-vencer têm modalidade (cadastro do favorecido) → o import roda.
- ⚠️ Deixei o lote de teste **flp 18** (vazio) em HML. Sondas `probe-fin015-hml.ts`/`probe-fin015-fluxo.ts` ficam.

### INTERNACIONAL = CÂMBIO (rail separado — NÃO é SISPAG) — 2026-07-09
Confirmado nos módulos do Conexos: pagamento ao exterior é **câmbio**, no **Comércio Exterior**, não no fin015.
Endpoints: `log009/validaBotaoFechamentoCambio` (fecha câmbio a partir da **Invoice**), `imp059/contratoCambioProf`
(contrato de câmbio), `imp113/117/120/cambioVinc`, `imp194/dtaFechCambio`. É contrato de câmbio + SWIFT ao exterior
em moeda estrangeira — **sem CNAB/boleto**. O `fin015` (SISPAG) está na seção "Pagamentos/bancos" **doméstica**.
- **Fatia 3 (gerar .REM) = SÓ NACIONAL.** Internacional não importa no SISPAG (provado: doc 520/MOLIBDENOS/INVOICE).
- **Papel dos lotes INTERNACIONAIS do nosso app (decidir):** (A) só visibilidade/organização — o câmbio é feito
  no módulo Comex, fora da nossa remessa; Fatia 3 só age nos nacionais *(recomendado)*; (B) automação de câmbio =
  **Fatia futura separada** (log009/imp*), projeto próprio e maior; (C) não formar lotes internacionais p/ SISPAG.
- **Analista:** p/ Fatia 3 nacional NÃO precisa. P/ automatizar câmbio SIM, mas é escopo separado ("como fecham o
  câmbio hoje? Invoice/log009, contrato, portal?").

### A PEDIR À ANALISTA (segunda) — arquivo `.RET` de exemplo (perna do RETORNO / fin052)
Pedir à analista um **`.RET`** (arquivo de retorno CNAB do banco) de exemplo — o par do `.REM`. É o que o
**Nexxera larga na pasta/SharePoint de retorno**, e que o nosso **robô-poller vai SUBIR no `fin052`**
(`arquivosRetorno/carregar` → `processar`) para dar a **baixa** dos pagamentos. Precisamos do `.RET` real
para mapear o parse/upload e testar a integração do retorno em HML (assim como fizemos o `.REM` na ida).

### PARADA (2026-07-09) — retomar segunda 2026-07-13
Exploração fin015 suficiente p/ desenhar a Fatia 3. Faltam só os 2 request-bodies (import + gerarRemessa),
fecháveis num teste rápido de HML na implementação. Antes de codar: 3 decisões de negócio com o analista
operacional (conta pagadora / regra data débito / mapeamento lote↔nativo).

## Riscos / decisões em aberto ⚠️
- **É a PRIMEIRA ESCRITA no Conexos** — quebra a invariante I1 (read-only) do SISPAG. Precisa da doutrina
  de escrita irreversível de Permutas Fatia 3: **HML-first**, gating `conexosWriteEnabled`/`DryRun`,
  idempotência (não gerar 2 lotes pro mesmo conjunto), `postGenericOnce` sem retry cego, ledger write-ahead.
- **Conta pagadora:** o lote nativo é **por conta** (Itaú 55795-4, Santander…). Como escolher qual conta
  paga cada lote? (hoje nosso agrupamento é filial×classe, não por conta.) → reconciliar: talvez 1 conta
  pagadora por lote nativo, ou dividir nosso lote por conta na hora de montar o fin015.
- **Mapeamento** nosso `lote_pagamento` (FINALIZADO) ↔ lote nativo fin015 (guardar o `flpCod`/`gabCod` no nosso lote).
- **Modalidade por título:** boleto (segmento J) vs. crédito em conta/TED (segmento A) vs. PIX — o ERP decide
  pelo cadastro do favorecido (`itsVldModalidade`). Nosso `pronto_para_remessa` sinaliza o que falta.
- **Retorno rejeitado** (`itsVldRej=1`) — o achado anterior (rejeições de cadastro) segue valendo: sanear antes.

## RESPOSTAS DA ANALISTA (secundária) — 2026-07-16
> A analista PRINCIPAL (monta os lotes no fin015 + sobe o `.RET`) está de **férias**; validamos pontos
> pontuais com a secundária. Ainda FALTAM: o HAR do fluxo fin015 (A1), o `.RET` de exemplo e o HAR do
> processar (perna de retorno) — dependem da principal voltar.

- **A2 — Modalidade (forma de pagamento):** alguns fornecedores só aceitam **boleto**; se o boleto vence,
  às vezes aceitam **PIX**. **Boleto exige o código de barras.** → Decisão de forma de pagamento é do
  ANALISTA (informar/validar antes de lançar o lote). **AUTOMAÇÃO PARCIAL possível:** títulos que já são
  **boleto** dá pra detectar por **`titEspCodbar`** (código de barras — já vem no `fin064`) e auto-classificar
  como boleto; o resto (TED/PIX/crédito conta) o analista decide. → `itsVldModalidade=boleto` quando há `titEspCodbar`.
- **A3 — Conta pagadora: TUDO pelo ITAÚ.** Exceção **única e rara**: um fornecedor que **não aceita BOLETO
  via Itaú** (TED/PIX por Itaú tanto faz) → nesse caso paga pela conta alinhada p/ receber. → **default Itaú
  sempre**; a exceção Santander é essa (por FORNECEDOR `pesCod`, só p/ boleto, rara). Roteamento por fornecedor.
- **A4 — INTERNACIONAL FORA DO ESCOPO SISPAG.** Hoje a **tesouraria** manda um **e-mail** com um valor X e a
  analista **transfere da conta Itaú para o Banco do Brasil** (manual). Não passa por fin015/remessa. →
  **CONFIRMA a opção A:** SISPAG automatizado = **SÓ NACIONAL**; internacional é câmbio/tesouraria manual.
  Decisão pendente: os "lotes internacionais" do nosso app viram só visibilidade OU paramos de formá-los.
- **A5 — Data de débito = HOJE, SEMPRE, sem agendamento.** Ela paga o boleto **hoje** e sai da conta no dia,
  mesmo que vença 20 dias à frente (nunca agenda). → confirma `flpDtaCredito=hoje` (R1/R2 ok). ⚠️ implica que
  o título é pago BEM ANTES do vencimento → nossa janela de formação "a-vencer ≤7d" pode ser estreita demais
  (eles pagam adiantado); revisar a política de elegibilidade (talvez "aprovado + não-pago", venc. mais largo).
