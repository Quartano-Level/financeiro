---
adr_number: 0006
title: Trigger de ingestão MANUAL no painel de Permutas (entre os crons)
date: 2026-06-20
status: accepted
type: addition
related_entities: [PermutaCandidata]
related_actions: [elegerAdiantamentos]
supersedes_decisions: []
---

# ADR 0006: Ingestão manual de Permutas (Frente I)

**Cliente:** Columbia Trading · **Entrega:** Kavex (created by Clonex)
**Relacionado:** ADR-0004 (modelagem Fatia 1), ADR-0005 (`casamento-manual`),
migration-debt **O4** (sem scheduler/job runner), **O5/O6** (Postgres + auditoria)
**Branch:** `feat/permutas-multiplas`

## Contexto

A ingestão de Permutas (`IngestaoPermutasService` — mesmo compute da eleição que
alimenta o painel `/gestao` + snapshot `/painel`) hoje só roda pelo **cron**
(GitHub Actions, 3×/dia: 06:00, 12:00, 18:00 BRT). O analista não tem como
**forçar uma rodada entre os horários** para verificar se algo mudou no Conexos
(novo adiantamento pago, invoice finalizada, etc.). O botão "Atualizar" da tela
apenas **re-lê** o banco local — não re-roda a pipeline contra o ERP.

Além disso, a trilha de auditoria de quem disparou cada rodada (`triggered_by` na
tabela `permuta_eleicao_run`) já existe mas **não é exposta** — o analista não vê
"quem rodou o quê e quando".

## Decisão

### 1. Trigger manual `POST /permutas/ingestao`
Endpoint que dispara `IngestaoPermutasService.executar` (o **mesmo** compute do
cron), espera concluir e devolve os totais. A tela aguarda no modal até terminar.
**Não é uma nova ação de domínio** — é uma **interface humana** (botão) para a
ingestão existente. *Human-in-the-loop* (I1): o analista decide quando rodar.

### 2. `triggered_by` = identidade autenticada (server-side)
A auditoria grava `triggered_by = req.user.sub` (o **username** do analista,
derivado do **token JWT verificado**, não de input do cliente — não spoofável).
O cron continua gravando `triggered_by = 'cron'`. A UI formata: `'cron'` →
"cron job"; caso contrário → "analista {username}". Reforça I5/O6 (auditoria por
execução: quem, quando, resultado).

### 3. Concorrência: BLOQUEAR rodada concorrente
Uma ingestão manual disparada enquanto **outra está em andamento** (o cron ou
outro analista) **não** dispara um segundo fan-out no Conexos. O advisory lock
existente (`INGEST_LOCK_KEY`, `pg_try_advisory_lock`) detecta a contenção; o
`persistIngestRun` lança `IngestLockBusyError` (tipado), o service o re-lança
**sem gravar uma run de erro** (contenção ≠ falha — não polui a trilha) e a rota
mapeia para **HTTP 409**. A UI mostra "já existe uma ingestão rodando" e mantém o
botão desabilitado.

### 4. Histórico no modal `GET /permutas/runs`
Lista as últimas N rodadas (cron + manuais; default 10, máx. 50) de
`permuta_eleicao_run` para a trilha de auditoria do modal: quem rodou, quando,
status e totais. READ-ONLY.

### 5. I4 preservado (zero escrita no ERP)
A ingestão é **somente leitura** no Conexos — a única escrita é o banco próprio
(snapshot + modelo relacional). O risco arquitetural #1 (write-back `fin010`,
Fatia 2) permanece **intocado**.

## Consequências

- **Visibilidade sob demanda:** o analista atualiza os dados entre os crons sem
  esperar o próximo horário; o painel reflete o Conexos no clique.
- **Auditoria exposta:** quem disparou cada rodada fica visível (analista vs cron),
  fechando a lacuna de O6 na superfície da UI.
- **Sem fan-out duplicado:** o bloqueio por lock protege o Conexos de rodadas
  concorrentes (rate-limit/sessão), e a contenção não vira ruído de auditoria.
- **Mitiga parcialmente O4:** continua sem scheduler próprio (o cron é externo,
  GitHub Actions), mas o trigger manual cobre a necessidade operacional imediata.

## Alternativas descartadas

- **Fazer o botão "Atualizar" re-rodar a pipeline:** rejeitado — confunde
  "re-ler o banco" (barato, instantâneo) com "re-ingerir do ERP" (fan-out pesado,
  segundos). Ações distintas merecem botões distintos.
- **Permitir rodadas concorrentes:** rejeitado — duplicaria o fan-out no Conexos
  e arriscaria rate-limit/sessão sem ganho (o resultado convergiria igual).
- **Confiar no nome enviado pelo cliente para `triggered_by`:** rejeitado —
  spoofável; a identidade tem de vir do token verificado server-side.
- **Modelar uma nova ação de ontologia `dispararIngestaoManual`:** rejeitado por
  ora — a ingestão não é uma ação de domínio modelada (é a infra da Fase B que
  materializa `elegerAdiantamentos`); o trigger é uma interface humana, registrado
  aqui como decisão, não como nova entidade/ação.
