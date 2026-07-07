# SISPAG — O ERP nativo já resolve? (análise "precisa Nexxera ou não") + evidência de sondagem

> **Status:** análise de diagnóstico com **evidência empírica de produção** (Conexos PRD,
> read-only, 2026-07-06). Insumo para debate com os analistas e para **defender** a decisão de
> arquitetura do Escopo II. Complementa [`sispag-context-map.md`](./sispag-context-map.md).
>
> **Método:** probe read-only `src/backend/jobs/probe-sispag.ts` (allowlist de verbos de leitura;
> zero escrita) contra `https://columbiatrading.conexos.cloud`. Saída bruta em `/tmp/sispag-probe/`.

---

## TL;DR (a tese defensável — versão precisa)

**O Conexos executa o fluxo SISPAG inteiro nativamente HOJE, em produção — EXCETO um único elo: o
transporte do arquivo banco⇄Conexos.** Confirmado em dois níveis: (a) **dados de produção** (17 lotes
`fin015` reais, Itaú/Santander, com envio confirmado); (b) **specs OpenAPI** (o ERP gera o arquivo
`gabLngDados`, baixa o retorno via `fin052` e grava a baixa `fin010` — mas **não existe endpoint nativo
que entregue a remessa de pagamento ao banco nem que busque o retorno**; o arquivo é *baixado* e
*re-enviado* por algo externo). Logo:

- **NÃO se deve construir um gerador de remessa CNAB próprio, nem reimplementar montagem de lote /
  processamento de retorno / baixa** — o ERP faz tudo isso nativamente e **em uso massivo** (17 lotes,
  17k+ borderôs). Refazer = retrabalho de alto risco (homologação de leiaute) duplicando função existente.
- **O único ponto que exige um canal externo é o "salto de transporte"** (passos 6–7 do §2): mover o
  arquivo Conexos→banco e banco→Conexos. É *aí, e só aí*, que "precisa Nexxera?" faz sentido.
- **A pergunta que decide tudo:** *como esse transporte é feito HOJE?* O probe mostra `flpVldConfEnvio=1`
  em lotes de produção — ou seja, **alguém já entrega**. Se é o **robô Nexxera** (automático) → Kavex
  **orquestra + monitora**, não integra nada do zero. Se é **upload manual** da analista no portal do
  banco → o gap de automação é *só* esse hop, não o motor SISPAG inteiro.
- **O valor da Kavex é ORQUESTRAÇÃO + VISIBILIDADE + CADÊNCIA sobre o motor nativo** (painel diário,
  montagem assistida, gate de finalização, monitoramento de envio/retorno, auditoria, scheduler) —
  **dirigindo `fin015`/`fin052`/`fin064`**, não competindo com eles.

> ⚠️ **Correção de premissa dupla:** (1) a proposta assume "integração Nexxera **do zero**" — mas o motor
> de remessa/retorno **já existe no ERP**; só o transporte pode precisar de canal. (2) O `fin143`
> ("Importação Nexxera") é **importador de EXTRATOS bancários**, *não* transmissor de remessa de
> pagamento — e o campo `conVldEnviaNexxera` é do lado **cobrança/receber (`fin085`)**, não do a-pagar.
> Então "Nexxera já resolve pagamento" **não** está provado; o que está provado é que o **motor SISPAG
> nativo resolve tudo menos o transporte**. Ver §2.5 e §5.

---

## 1. Evidência empírica de produção (probe read-only, Conexos PRD)

| Controller nativo | O que é | Achado na PRD (contagem real) | Leitura |
|---|---|---|---|
| **`fin015`** Lote SISPAG | monta lote + gera remessa | **17 lotes** (fil1=3, fil2=11, fil4=2, fil6=1). Bancos **ITAÚ (341)** e **SANTANDER (33)**, contas reais, `layoutConta="AG:641/CT:55795-4"`, `soma` R$ 4k–56k, `flpVldConfEnvio=1` (**envio confirmado**), analistas reais (FLAVIA_SANTOS, RENE_DUARTE), datas **jan–abr/2026** | **Montagem+finalização+envio de lote SISPAG É USADO NATIVAMENTE, agora.** |
| **`fin143`** Importação Nexxera | integração Nexxera | **151 requisições/filial**, `lebEspRoboExecCod` (**robô Nexxera**, hash de execução), `lebVldServico=1`, `lebVldSituacao` 1/2, datas dez/2025 | **Nexxera JÁ está integrada ao ERP** (robô ativo) — não "parte do zero". |
| **`fin064`** Gestão de Pagamentos | carteira de pagamento | **2.100 (fil1) / 18.234 (fil2)** títulos; campos **`conVldEnviaNexxera`**, `conVldLayout`, **`enviadoBanco`**, `titNumRemessa`, `borCod`, `itsVldModalidade` | O ERP **modela nativamente "esta conta envia via Nexxera"** e o estado enviado-ao-banco. |
| **`fin061`** Envio de Pagamentos | envio | 2.100 / 18.234 | Superfície de envio nativa existe e é volumosa. |
| **`fin010`** Borderô a-pagar (baixa) | quita o título | **1.821 (fil1) / 15.589 (fil2)**; campo **`vldHasRemessaPgto`**, `borVldTipo`, `borVldFinalizado` | A **baixa via borderô** é o mecanismo padrão, massivo. Elo lote↔baixa via `vldHasRemessaPgto`. |
| **`com298`** doc a-pagar | documento | **2.981** FINALIZADO (só fil6); `vldAutorizado`, `vldProcLiberado`, `docVldSituacao`, `taxaCambio` | Base de leitura dos "a pagar" (já usada em Permutas). |
| **`com308`** título a-pagar | detalhe/alçada | flags **`titVld1libera=1, titVld2libera=1, titVld3libera=1`** (+`Tim/Usn/usnDesNomel`), `titVldEnviaBanco`, `titDtaEnvioBanco`, `titVldRetBanco`, `titNumRemessa`, `vldBordero`, `titVldStatus` | **"Aprovado para baixa" = as flags de alçada de liberação (1–3 níveis).** ✅ confirmado. |

Dados brutos: `/tmp/sispag-probe/` (`10-fin015-lotes-ALL.json`, `30-fin143-nexxera-*.json`,
`50-fin064-*.json`, `71-com308-*.json`, `summary.md`).

## 2. O fluxo NATIVO end-to-end (reconstruído da evidência)

```
com298 (doc a-pagar) → com311/com308 (títulos/parcelas)
        │
        ▼   alçada de liberação (titVld1/2/3libera) ─ governada por fin102/103/106, fin007/liberar
   TÍTULO APROVADO PARA BAIXA
        │
        ▼   fin015: monta LOTE por banco/conta/layout (FinLoteSispag: bncCod, ccoCod, layoutConta)
   LOTE (flpVldStatus: rascunho→finalizado; flpVldConfEnvio; titulosCount; soma)
        │
        ▼   fin015/gerArquivosBancos/gerarRemessa → arquivo CNAB (gabLngDados) por layoutConta
   REMESSA gerada  ──(transporte ao banco)──►  [Nexxera: fin143 robô / conVldEnviaNexxera]
        │
        ▼   fin052: carrega/processa RETORNO do banco (Pagfor) → libera títulos
   RETORNO conciliado (flpVldRet, itensRetorno)
        │
        ▼   fin010: BAIXA via borderô (vldHasRemessaPgto, borVldFinalizado) → título quitado
   PAGO E BAIXADO
```

**Todos os elos existem nativamente e têm volume de produção.** O único elo que a evidência ainda não
fecha 100% é **como a remessa sai do Conexos e chega ao banco** — automático via robô Nexxera ou upload
manual da analista no portal do banco. É a pergunta-chave do §5.

## 2.5. O GAP REAL: o transporte banco⇄Conexos (specs OpenAPI confirmam)

A varredura dos specs (`090-fin0.json`/`100-fin1.json`) mapeia a cadeia nativa endpoint-a-endpoint e
isola **exatamente onde o Conexos para**:

| # | Passo | Endpoint nativo | Fronteira |
|---|-------|-----------------|-----------|
| 1 | Monta lote + importa títulos | `POST /api/fin015` → `.../finItemSispag/titulosPendentes/importar` → `.../finItemSispag` | dentro |
| 2 | Libera títulos (alçada) | `PUT /api/fin007/liberar/...`, `PUT /api/fin061`, fin103/fin106 | dentro |
| 3 | Finaliza lote | `PUT /api/fin015/finalizarLote/{filCodLote}/{bncCod}/{flpCod}` | dentro |
| 4 | **Gera arquivo do banco** | `POST /api/fin015/gerArquivosBancos/gerarRemessa` → conteúdo em `GerArquivosBancos.gabLngDados` | dentro |
| 5 | **Baixa o arquivo** | `GET /api/fin015/gerArquivosBancos/download/{gabCod}` (octet-stream) | **ARQUIVO SAI** |
| 6 | **Entrega ao banco** | *(nenhum endpoint Conexos)* — Nexxera / portal / SFTP manual | **EXTERNO — o gap** |
| 7 | **Busca o retorno no banco** | *(nenhum endpoint Conexos)* — Nexxera / portal / manual | **EXTERNO — o gap** |
| 8 | **Sobe o retorno** | `POST /api/fin052/arquivosRetorno/carregar/{bncCod}/{gtbCodSeq}` (multipart `file`) | **ARQUIVO ENTRA** |
| 9 | Processa retorno | `PUT /api/fin052/arquivosRetorno/processar` | dentro |
| 10 | Libera/trata rejeitados | `PUT /api/fin052/arquivosRetornoLiberacaoTitulos/liberar` | dentro |
| 11 | **Grava a baixa** (`bxaCodSeq` em `GerArquivosRetDet`) → `fin010` | (efetivado no passo 9) | dentro |

**Achados que corrigem o entendimento ingênuo:**
- Conexos **gera** o CNAB (`gabLngDados`, download octet-stream) e **ingere** o retorno (`fin052`
  multipart → `bxaCodSeq` → `fin010`) nativamente. Passos 1–5 e 8–11 são todos internos.
- **NÃO há endpoint nativo de transmissão de remessa de PAGAMENTO** (fin015/fin022/fin052 não têm
  SFTP/host-to-host/API-banco). Passos **6–7 são um vazio estrutural** — o desenho do ERP *pressupõe*
  que algo externo move o arquivo.
- A **única** maquinaria de transmissão nativa (`transmitir`/`geraTaskEnvio`, `confirmarEnvioBanco`,
  credenciais de robô `GerBancosLogin`, flag `conVldEnviaNexxera`) é **do lado COBRANÇA/receber
  (`fin085`)** — **não cobre o a-pagar (SISPAG)**.
- **`fin143` "Importação Nexxera" = importador de EXTRATOS** (`ImpLoteExtBanc`: `lebEspRoboExecCod`,
  `feaEspFilename`) — lista lotes de extrato que um robô já buscou; **sem endpoint de write/transmit**.
  Alimenta o pipeline de extratos (`fin134`), **não** o envio de remessa SISPAG.

> **Consequência para a decisão:** o "precisa Nexxera?" **não é sobre gerar arquivo** (o ERP gera) —
> é **exclusivamente sobre os passos 6–7** (entregar a remessa ao banco e trazer o retorno). Qualquer
> canal serve: robô Nexxera, portal do banco (manual) ou SFTP/host-to-host. **Como isso é feito hoje
> é a pergunta central** — e o `flpVldConfEnvio=1` nos lotes prova que *já é feito de algum jeito*.

## 2.6. Sondagem #2 — QUANTIFICAÇÃO (o fluxo SISPAG nativo é usado?)

Probe refinado (`src/backend/jobs/probe-sispag-2.ts`, out `/tmp/sispag-probe2/`) para medir adoção:

- **Q1 — o fluxo de remessa SISPAG é a EXCEÇÃO, não a norma.** Amostra grande de borderôs a-pagar
  (`borVldTipo=2`, 500/filial; totais fil1=1.821, fil2=15.594, fil3=232): **`vldHasRemessaPgto=0` em
  100%** (0/500, 0/500, 0/232). Com apenas **17 lotes `fin015`** no total, a conclusão é forte:
  **>99% das baixas a-pagar são DIRETAS, sem passar por remessa SISPAG.** A operação real de pagamento
  é a **baixa direta** no borderô (`fin010`/`fin064`), não o lote+remessa.
- **Q5 — quando usado, o motor nativo FECHA o loop.** Um lote enviado (`fin015/2/4/3`, fil2, ITAÚ,
  R$ 36.658,69, finalizado por RENE_DUARTE): `flpVldConfEnvio=1` (**envio confirmado**) e
  **`itensRetorno=16`** (há itens de retorno vinculados). O nome do arquivo de remessa nativo é
  `PG060701.REM` (`gabNumRemessa=12`, via `initialValues`). Ou seja, o fin015 gera `PG*.REM`, o envio é
  confirmado e o retorno é associado — **o fluxo funciona; só é pouco adotado.**
- **Q4 — `fin143` (Nexxera) é conciliação de EXTRATO, não transporte de pagamento.** Os detalhes
  (`fin143/detalhes/list`) são arquivos **`EXT_*.RET`** (extratos bancários), com erros do tipo *"A CONTA
  CORRENTE DESSE EXTRATO NÃO ESTÁ CADASTRADA — CONTA 5480 AGÊNCIA 1913 BANCO 1"*. Bancos 001/033/707,
  datados 03/12/2025. **Confirma:** o robô Nexxera traz **extratos** para conciliação (`fin134`), não
  transmite a remessa de pagamento. Reforça o Fato 4.
- **Q2 — retorno via API ficou inconclusivo:** `fin052/arquivosRetorno/list` (e cabec/detalhe) retornam
  400 sem um parâmetro que não dá para adivinhar por leitura. **Não bloqueia** a tese: o `itensRetorno=16`
  no lote enviado já prova que o retorno é exercido nativamente. Fechar via HAR da UI quando necessário.

> **A pergunta muda de figura.** Não é mais "gerar remessa ou usar Nexxera" — é **"por que o motor
> SISPAG nativo (que funciona) é quase não-usado, e a Columbia baixa 99% dos pagamentos direto?"** Duas
> hipóteses a testar na reunião: (H1) o fin015 é trabalhoso/pouco visível → analistas pagam manual (portal/
> PIX) e só registram a baixa direta no ERP; (H2) só certos bancos/contas usam remessa, o resto é manual
> por decisão. A resposta define se a Kavex **torna o fin015 usável/diário** (aumentando adoção do nativo)
> ou **orquestra o caminho de baixa direta** que já é o real.

## 3. Por que isto reordena o Escopo II

A proposta assumiu **construir**: "gera o arquivo de remessa, sobe no diretório Nexxera, monitora o
retorno". A realidade: **o ERP já gera a remessa e a Nexxera já está plugada.** Então o desenho correto
provavelmente é a **Opção A/C** do `sispag-context-map.md` (dirigir `fin015`/`fin052`/`fin064` +
Nexxera nativa), **não a Opção B** (CNAB próprio + Nexxera do zero).

**Reframe do que a Kavex entrega** (o gargalo real não é gerar remessa — é orquestração/visibilidade):
- **Painel diário** dos títulos aprovados a vencer (o que hoje exige garimpo no `fin064`/`com308`).
- **Montagem assistida do lote** (o analista inclui/remove) → **dirige `fin015`** em vez de refazer.
- **Gate de finalização** (a analista finaliza) → **dispara** a geração/envio nativos.
- **Monitoramento** de `flpVldConfEnvio`/`flpVldRet`/retorno + **alertas** (o RNF de observabilidade).
- **Cadência diária** (scheduler — migration-debt O4) que hoje não existe: monta o lote candidato todo dia.
- **Auditoria** ponta-a-ponta (quem aprovou/ajustou/finalizou).

Isso é **muito menos risco** (não reimplementa CNAB nem homologa leiaute) e entrega o outcome da
proposta ("zero pagamentos perdidos por falha de processo") atacando a **causa real** (falta de
visibilidade/cadência), não a geração de arquivo.

## 4. "Aprovado para baixa" — RESOLVIDO empiricamente

Era o item "a confirmar no diagnóstico". **Confirmado:** no `com308`/`FinTituloFin`, aprovação = as
flags de **alçada de liberação** `titVld1libera` / `titVld2libera` / `titVld3libera` (= 1), com
`titTim*libera`/`titUsn*libera`/`usnDesNomel*` registrando quando/quem em cada nível. Governadas por
`fin102` (regras de bloqueio), `fin103` (liberação), `fin106` (alçadas), `fin007/liberar`. Downstream:
`titVldEnviaBanco` / `titDtaEnvioBanco` / `titVldRetBanco` / `titNumRemessa` / `vldBordero` rastreiam
remessa→envio→retorno→baixa. Exemplo real: doc 100 título 1, R$ 135.724,80, `titVld1/2/3libera=1`,
`titVldEnviaBanco=0`, `vldBordero=1` (aprovado nos 3 níveis, ainda não enviado, já em borderô).

## 5. Ressalvas honestas (para não superdefender) — as 3 perguntas que fecham o caso

1. **Se o nativo faz tudo, por que "dar baixa é trabalhoso e pouco transparente" (proposta §Problema)?**
   → Provável resposta: a **ergonomia/visibilidade** do ERP, a **falta de cadência diária** e o
   **hop manual de transporte** (passos 6–7), não a ausência de motor. *Reforça* o reframe (orquestração).
2. **[A PERGUNTA CENTRAL] O transporte da remessa (passos 6–7) é automático ou manual hoje?**
   → As specs provam que **não há transmissão nativa no a-pagar** e que a máquina de robô/transmit é do
   lado cobrança (`fin085`). Então, para pagamento, ou (a) um **robô/serviço externo** (Nexxera ou
   equivalente) já entrega/busca, ou (b) a **analista baixa o CNAB e sobe no portal do banco na mão** e
   depois sobe o retorno no `fin052`. `flpVldConfEnvio=1` prova que *acontece* — **falta saber qual dos dois.**
   Este é o item que decide se há (e qual é) o trabalho de integração de transporte.
3. **Qual o papel real do `fin143`?** → Specs: **importador de EXTRATOS bancários** (não transmissor de
   remessa). Confirmar com o analista se a Nexxera que traz extrato é a **mesma** que (se) entrega
   remessa de pagamento, ou se são canais distintos. (Opcional: sondar `fin143/detalhes/list` ao vivo.)

## 6. Pauta de defesa (se for preciso justificar "não integrar Nexxera do zero")

- **Fato 1:** há **17 lotes SISPAG nativos** (fin015) em produção, bancos Itaú/Santander, com **envio
  confirmado** (`flpVldConfEnvio=1`) e analistas reais — o motor de lote/remessa **já roda**.
- **Fato 2:** o ERP **gera o CNAB nativamente** (`gabLngDados` + download octet-stream) e **ingere o
  retorno + grava a baixa** nativamente (`fin052` → `bxaCodSeq` → `fin010`). Reimplementar isso = duplicar.
- **Fato 3:** a **baixa via borderô** (fin010) é o mecanismo massivo e padrão (17k+ em fil2), com
  `vldHasRemessaPgto` ligando lote↔baixa.
- **Fato 4 (o limite honesto):** o ERP **NÃO transmite a remessa de pagamento ao banco** — passos 6–7
  são externos por design; a única maquinaria de transmissão nativa é do lado **cobrança** (`fin085`), e
  `fin143` só **importa extratos**. Um canal de transporte (Nexxera/portal/SFTP) **é necessário para
  fechar o loop sem toque manual** — mas *só para o transporte*, não para o motor.
- **Conclusão:** reconstruir montagem/CNAB/retorno/baixa seria **retrabalho de alto risco** duplicando
  função existente e em uso. O trabalho de integração legítimo — se houver — é **só o hop de transporte
  (6–7)**, e só se hoje for manual. **Dirigir o motor nativo** + resolver/observar o hop entrega o
  outcome com fração do risco. A homologação de leiaute (a "premissa crítica") **já está paga** — o
  arquivo já é gerado e há envio confirmado em produção.
- **Trade-off assumido:** dirigir o `fin015`/`fin052`/`fin064` acopla a automação à API interna do
  Conexos (mesma classe de risco #1 já aceita em Permutas/`fin010`) — acoplamento que **já temos** e
  sabemos gerir (dry-run, HML-first, ledger idempotente).

## 7. Próximos passos de sondagem (opcional, ainda read-only)
- [ ] Refinar 2 probes que deram 400 (params): `fin052/arquivosRetorno/list` (retorno) e
  `fin015/gerArquivosBancos/list/{filCodLote}` (remessas geradas) — confirmar o elo remessa/retorno.
- [ ] `fin143/detalhes/list` — o que o robô Nexxera de fato faz.
- [ ] Ler um lote finalizado ao vivo (`GET fin015/{filCod}/{bncCod}/{flpCod}`) para ver `itensRetorno`.
- [ ] Levar os Fatos 1–3 (§6) + as 3 perguntas (§5) para a reunião de diagnóstico.

> **Como reproduzir:** `cd src/backend && PROBE_OUT=/tmp/sispag-probe CONEXOS_BASE_URL=https://columbiatrading.conexos.cloud/api npx tsx jobs/probe-sispag.ts` (read-only; allowlist bloqueia qualquer verbo mutante).
