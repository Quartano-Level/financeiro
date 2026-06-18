---
type: regis-review-report
run_id: 2026-06-18-2039
generated_at: 2026-06-18T20:50:00-03:00
audience: technical (architects + senior devs + tech lead)
basis: Bass & Clements — Software Architecture in Practice (Availability, Deployability, Integrability, Modifiability, Performance, Fault Tolerance, Security, Testability)
mode: quick (feature-pipeline scoped — Permutas Fase B)
scope_dirs:
  - src/backend/domain/{service,repository}/permutas
  - src/backend/jobs
  - src/backend/migrations
  - src/backend/routes/permutas.ts
  - src/backend/domain/interface/permutas
  - src/frontend/{app/permutas,lib}
total_cards: 48
total_p0: 2
total_p1: 22
total_p2: 15
total_p3: 9
overall_score: 6.9
---

# Regis-Review — financeiro / Permutas Fase B — 2026-06-18-2039

Snapshot Bass & Clements aplicado ao delta da Fase B (modelo relacional + ingestão diária + processamento manual). Backend Express + Postgres Supabase + frontend Next.js. Estado-alvo Lambda/Terraform **não revisado** (não existe).

## 1. Executive scorecard

Pesos aplicados (domínio financeiro multi-tenant, SaaSo que vai mover dinheiro nas frentes II/III):

```
Security 1.5 · Fault Tolerance 1.3 · Availability 1.2 · Modifiability 1.2 ·
Testability 1.0 · Performance 1.0 · Integrability 0.9 · Deployability 0.9
total_weight = 9.0   overall = sum(score_i * w_i) / 9.0 = 6.88 ≈ 6.9
```

| QA | Score | P0 | P1 | P2 | P3 | Top finding |
|---|---|---|---|---|---|---|
| Availability | 7.0 | 2 | 4 | 1 | 0 | F-availability-1: cron `ingest-permutas` **não agendado** em produção — única fonte do `/gestao` |
| Deployability | 6.0 | 0 | 2 | 3 | 1 | F-deployability-2: cron `ingest-permutas` **não agendado** em lugar nenhum (espelha F-availability-1) |
| Integrability | 6.5 | 0 | 3 | 2 | 1 | F-integrability-1: `GestaoPermutasResponse` duplicado manualmente backend↔frontend, sem contract test |
| Modifiability | 6.5 | 0 | 3 | 1 | 2 | F-modifiability-3: `PermutaRelationalRepository` (512 LOC) mistura 4 entidades + reads + sweep |
| Performance | 6.0 | 0 | 4 | 2 | 1 | F-performance-1: `listAdiantamentosAtivos`/`listInvoicesEmAberto`/`listCasamentos` sem `LIMIT` |
| Fault Tolerance | 7.5 | 0 | 3 | 1 | 0 | F-fault-tolerance-1: `snapshotRepository.persistRun` em TX2 separada após TX1 commitar — sem compensação |
| Security | 7.5 | 0 | 1 | 2 | 2 | F-security-1: `POST /processar` aceita qualquer JWT Supabase em qualquer `docCod` (sem RBAC / sem tenant) |
| Testability | 7.5 | 0 | 3 | 3 | 1 | F-testability-1: `jobs/ingest-permutas.ts` (entrypoint do cron diário) sem nenhum teste |
| **Overall** | **6.9** | **2** | **22** | **15** | **9** | — |

**Score interpretation:**
- 0–3: risco estrutural — bloqueia escalonamento
- 4–6: dívida defensável — endereçar nesta janela de planejamento
- 7–8: saudável com oportunidades pontuais
- 9–10: estado-da-arte

A Fase B está em **6.9** — zona "dívida defensável, com 2 P0 que precisam re-entrar no loop". A arquitetura é sólida nos pontos sensíveis (atomicidade da ingestão, UPSERT-in-place por chave natural, `markStale` no lugar de DELETE, soft-ref do `permuta_processamento`, fan-out Conexos FORA do advisory lock). A penalização vem de **operação não fechada** (cron desligado, sem heartbeat, sem index, sem autorização cross-tenant).

### Veredito sobre P0 vs. follow-ups (regra `green-criteria #8` do CLAUDE.md)

**Sim, há TRUE P0 (Crítico) — exatamente 2, ambos em Availability, sobre o mesmo eixo operacional:**

| Card | Severidade | Por que é P0 (não apenas P1) |
|---|---|---|
| `availability-1` (cron + heartbeat) | **P0 Crítico** | A Fase B inteira depende de uma ingestão diária. Sem scheduler, `/gestao` mostra fatos congelados desde o último disparo manual; sem heartbeat, ninguém percebe. É **regressão funcional silenciosa em produção** — a feature parece pronta mas serve dado morto. |
| `availability-2` (Idempotency-Key na ingestão) | **P0 Crítico** | Conjugado com `availability-1`: ativar cron sem dedup expõe Conexos a fan-out duplicado em qualquer retry do scheduler, e o ERP recusa por `LOGIN_ERROR_MAX_SESSIONS`. Tem que entrar **junto** com `availability-1` para evitar criar incidente ao fechar o anterior. |

> Nota: o agente Availability marcou `availability-1` como P0 e `availability-2` como P1 no `findings_count`; o consolidator promove `availability-2` para P0 **operacional** porque ele é pré-requisito de segurança para ativar `availability-1`. Os dois entram no mesmo re-loop.

**Todos os outros 46 cards (incluindo P1 de Security, Fault Tolerance, Modifiability, Performance, Integrability, Testability, Deployability) viram inbox follow-ups** em `ontology/_inbox/permutas-fase-b-regis-followups.md` por regra `green-criteria #8` — não re-entram no AutoLoop desta feature. A defesa em reunião é: "os P1 são dívida que mapeamos e priorizamos para as próximas 2-4 sprints, não bloqueador deste merge".

## 2. Top 10 risks (cross-QA)

Ranking composto = severidade × business impact × leverage.

### R-1: Tela `/gestao` serve dados congelados em produção (P0 operacional)
- **QA(s) afetados**: Availability, Deployability, Fault Tolerance (indireto)
- **Findings de origem**: F-availability-1, F-availability-2, F-deployability-2
- **Evidência sintetizada**: `jobs/ingest-permutas.ts:15-17` tem cron documentado em comentário; `_shared-metrics.md` confirma "Job (cron-ready, not scheduled)". Não há `render.yaml` cron, nem GitHub Actions `schedule`, nem heartbeat externo. Sem disparo, `markStale` nunca corre e os índices parciais `WHERE NOT stale` apontam para registros velhos sem sinal.
- **Impacto técnico**: feature deploy verde, app responde 200 OK, dados congelados desde o último disparo manual.
- **Impacto de negócio**: analista da Columbia toma decisão de permuta sobre adiantamento já baixado fora do sistema. Risco direto a SLA operacional e a reconciliação financeira.
- **Card(s) Kanban**: `availability-1`, `availability-2`, `availability-7`, `deployability-2`
- **Custo de inação em 6 meses**: incidente real assim que o piloto começar a usar — descoberto pelo cliente, não pelo time.

### R-2: Hang infinito no Conexos sem timeout + sem heartbeat = job morre sem alarme (P0 operacional latente)
- **QA(s) afetados**: Availability, Performance, Fault Tolerance
- **Findings de origem**: F-availability-6, F-availability-2, F-performance-3
- **Evidência sintetizada**: `ConexosClient.ts:341-358` envolve cada chamada em `RetryExecutor(retries:2, delayMs:500, jitterMs:200)` mas **não declara timeout**; axios subjacente em `LegacyConexosShape` vive fora do escopo. `PostgreeDatabaseClient.ts:51-73` não aplica `statement_timeout`/`lock_timeout`/`idle_in_transaction_session_timeout`.
- **Impacto técnico**: TCP pendurada na chamada Conexos prende o processo do job indefinidamente; o advisory lock fica adquirido; segunda execução cai em "advisory lock busy" sem que ninguém ataque a primeira.
- **Impacto de negócio**: erosão silenciosa do SLA; MTTR depende de operador abrir log Render por curiosidade.
- **Card(s) Kanban**: `availability-5`, `performance-3`
- **Custo de inação em 6 meses**: 1+ incidente "ingestão não rodou e ninguém soube" — exige `pg_terminate_backend` manual.

### R-3: Drift silencioso entre `/gestao` (relacional) e `/painel` (snapshot) — "a tela mente sobre dinheiro"
- **QA(s) afetados**: Fault Tolerance, Integrability, Modifiability
- **Findings de origem**: F-fault-tolerance-1, F-fault-tolerance-2, F-fault-tolerance-4
- **Evidência sintetizada**: `IngestaoPermutasService.ts:114` commita TX1 (relacional). `:128` inicia TX2 separada (`snapshotRepository.persistRun`). Falha de TX2 deixa o relacional em `success`, mas o catch insere SEGUNDO header com mesmo `flow_id` e status `error`; `permuta_eleicao_run.flow_id` é `TEXT` sem `UNIQUE` (migrations 0001:11 + 0003:13-23). `/painel` (lê `WHERE status='success'`) e `/gestao` (lê `NOT stale`) divergem sem alerta.
- **Impacto técnico**: dois dashboards afirmam verdades distintas sobre o mesmo conjunto de PROFORMAs candidatas.
- **Impacto de negócio**: analista pode executar permuta sobre versão errada do casamento sugerido. Em sistema financeiro, "tela mente" = ticket P0 retroativo + retrabalho de baixa.
- **Card(s) Kanban**: `fault-tolerance-1`, `fault-tolerance-2`, `fault-tolerance-4`
- **Custo de inação em 6 meses**: incidente acumula proporcional a volume; sem reconciliador, descoberta pelo cliente.

### R-4: Autorização cross-tenant ausente — qualquer JWT processa qualquer `docCod`
- **QA(s) afetados**: Security, Modifiability (decisão de RBAC), Availability (blast radius)
- **Findings de origem**: F-security-1
- **Evidência sintetizada**: `routes/permutas.ts:75-98` só exige `req.user` populado. Nenhum check de role; nenhuma coluna `tenant_id` em `permuta_processamento` (migration `0004_permuta_processamento.sql:11`). Hoje há um único Postgres (Supabase) — não vira incidente porque há um cliente. **Na primeira fatia multi-tenant vira P0 retroativo.**
- **Impacto técnico**: UPSERT sobre `permuta_processamento` aceita qualquer `docCod`; cria a linha se não existir.
- **Impacto de negócio**: vetor para incidente de compliance no Day 1 de multi-tenant; reescrita do schema sob pressão é mais cara que adicionar `tenant_id` agora.
- **Card(s) Kanban**: `security-1`
- **Custo de inação em 6 meses**: zero risk hoje (1 cliente); P0 retroativo no momento em que o 2º cliente entrar.

### R-5: `PermutaRelationalRepository` carrega 4 entidades + reads + writes em 512 LOC — paga em cada feature nova
- **QA(s) afetados**: Modifiability, Testability (custo de teste replicado)
- **Findings de origem**: F-modifiability-1, F-modifiability-2, F-modifiability-3, F-modifiability-4
- **Evidência sintetizada**: o repo concentra 9 métodos públicos e 4 entidades (`adiantamento`, `invoice`, `declaracao`, `casamento`); helper `chunked<T>` duplicado entre Relational e Snapshot (idem constante `=500`); 4 funções repetem o template "tuples + params + INSERT…ON CONFLICT"; mappers row↔objeto idioma `...(x !== undefined ? { y: x } : {})` repetido ~55× somando os dois lados.
- **Impacto técnico**: adicionar 5ª entidade ingerida (SISPAG, Popula GED) custa ~50 LOC de copy-paste; mudança transversal (adicionar `tenant_id` — ver R-4!) tem que ser feita em 4 lugares.
- **Impacto de negócio**: encarece cada feature de ingestão futura em ~1d; aumenta risco de drift quando R-4 for endereçado.
- **Card(s) Kanban**: `modifiability-1`, `modifiability-2`, `modifiability-3`, `modifiability-4`
- **Custo de inação em 6 meses**: cada uma das 3 frentes futuras (Fase C, SISPAG, GED) paga 1-2d em copy-paste + revisão.

### R-6: `GET /permutas/gestao` sem `LIMIT` + `DELETE FROM permuta_casamento` full-table no lock + sem índice em `last_ingest_run_id`
- **QA(s) afetados**: Performance, Availability (lock-hold cresce)
- **Findings de origem**: F-performance-1, F-performance-2, F-performance-4
- **Evidência sintetizada**: `PermutaRelationalRepository.ts:413-449` retorna 100% da base ativa por hit (sem `LIMIT/OFFSET`); `:340-349` faz `DELETE FROM permuta_casamento` sem WHERE seguido de re-INSERT total dentro do advisory lock + tx (gera dead tuples = 100% da tabela por run, força autovacuum); nenhum índice em `last_ingest_run_id` para suportar o predicado do `markStale` (`migrations/0003_permuta_relational.sql:51-98`).
- **Impacto técnico**: cada run aumenta lock-hold linearmente com base; cada hit `/gestao` transfere toda a base e prende 1 client do pool=5.
- **Impacto de negócio**: a tela vira inutilizável quando a base cruzar ~5k adiantamentos ativos; pool saturado bloqueia ingestão; bloat de índice exige `REINDEX` manual.
- **Card(s) Kanban**: `performance-1`, `performance-2`, `performance-4`
- **Custo de inação em 6 meses**: degradação contínua perceptível ao analista no segundo trimestre de uso.

### R-7: Contrato `GestaoPermutasResponse` duplicado manualmente backend↔frontend + Zod ausente no boundary do frontend
- **QA(s) afetados**: Integrability, Testability, Fault Tolerance (fallback silencioso)
- **Findings de origem**: F-integrability-1, F-integrability-3, F-integrability-6
- **Evidência sintetizada**: `interface/permutas/Gestao.ts:1-59` (backend) e `frontend/lib/types.ts:25-85` mantêm 8 interfaces copiadas. Frontend faz `as Partial<GestaoPermutasResponse>` (`lib/api.ts:44`) e cai para `gestaoPermutasFixture` (com nomes de exportadores **reais** — "DBP PIPING CO.,LTD", "NORMET OY") sempre que o backend devolve arrays vazios. Sem env-flag governando o fallback nem badge persistente.
- **Impacto técnico**: drift de campo só aparece em runtime no JSX; vazio legítimo confundido com indisponível.
- **Impacto de negócio**: cerimônia de aceite com sponsor pode rodar com fixture; PII real (nomes de exportadores do cliente) em VCS.
- **Card(s) Kanban**: `integrability-1`, `integrability-3`, `integrability-6`
- **Custo de inação em 6 meses**: pelo menos 1 incidente "tela em branco em produção" no Fase C; risco contínuo de demo silenciosamente falsa.

### R-8: Migrations 0003/0004 sem teste integrado + job `ingest-permutas` sem teste
- **QA(s) afetados**: Testability, Deployability
- **Findings de origem**: F-testability-1, F-testability-2, F-deployability-1
- **Evidência sintetizada**: `jest.config.cjs:7` ignora `*.integration.test.ts`; nenhum existe. UPSERT semantics + `CHECK (kind IN …)` + advisory lock + ROLLBACK são fé em produção. Entrypoint do cron (`jobs/ingest-permutas.ts`) tem zero teste — o único caminho da ingestão em produção não tem gate. Migrations rodam em 2 lugares (passo CI + `bootstrapAppContainer`) sem advisory lock no MigrationRunner — corrida em qualquer cenário multi-instância futuro.
- **Impacto técnico**: erro de DDL pego apenas pelo `npm run migrate` antes do redeploy Render; entrypoint regredido só descoberto via logs.
- **Impacto de negócio**: deploy bloqueado em janela de manutenção; MTTR alto.
- **Card(s) Kanban**: `testability-1`, `testability-2`, `deployability-1`
- **Custo de inação em 6 meses**: a próxima migration não-aditiva (e.g. card `security-1`) vai descobrir incompatibilidade na produção.

### R-9: Não-determinismo de tempo (`new Date()` × 7) viola auditoria O6
- **QA(s) afetados**: Testability, Security (audit trail)
- **Findings de origem**: F-testability-3, F-security-3
- **Evidência sintetizada**: 7 chamadas a `new Date()` em fontes Permutas (`IngestaoPermutasService` ×4, `GestaoPermutasService`, `EleicaoPermutasService`, `PermutaProcessamentoRepository`); testes contornam com `typeof === 'string'` e `expect.any(Date)`. Audit trail `permuta_processamento.processado_por`/`processado_em` é UPSERT-on-conflict (sobrescreve histórico).
- **Impacto técnico**: regressão em formato/timezone passa em verde; investigação ex-post de "quem aprovou" depende de stdout do Render (~30 dias).
- **Impacto de negócio**: invariante O6 não é gateável; quando SISPAG entrar (de fato move dinheiro), a mesma postura vira P0 de compliance LGPD.
- **Card(s) Kanban**: `testability-3`, `security-3`
- **Custo de inação em 6 meses**: débito que dobra cada vez que uma frente nova entra; remediar depois custa migrações de dados.

### R-10: Smoke test pós-deploy skipa silenciosamente + sem rollback runbook + versão não bumpada
- **QA(s) afetados**: Deployability
- **Findings de origem**: F-deployability-3, F-deployability-4, F-deployability-5
- **Evidência sintetizada**: `ci.yml:118-132` faz `exit 0` quando `RENDER_BACKEND_URL` ausente (só `::warning::`); `package.json` FE+BE ainda em `0.2.0` enquanto a Fase B é `feat` em `src/` (deveria ser `0.3.0` por `green-criteria #10`); migrations 0003/0004 são forward-only sem DOWN ou runbook.
- **Impacto técnico**: `/health.version` reporta versão errada (impossível bisectar incidente); operador inexperiente pode tentar DDL de rollback e quebrar idempotência.
- **Impacto de negócio**: audit trail quebrado; MTTR alongado em incidente; sponsor não consegue saber qual release corresponde a qual binário.
- **Card(s) Kanban**: `deployability-3`, `deployability-4`, `deployability-5`
- **Custo de inação em 6 meses**: ambíguo qual commit é qual versão; segredo `RENDER_BACKEND_URL` pode ter caído e ninguém percebe.

## 3. Cross-cutting findings

### CC-1: Cron de ingestão é a fundação operacional ausente
- **Aparece em**: Availability (F-1, F-2, F-3, F-7), Deployability (F-2), Performance (cron schedule ⚠️ parcial)
- **Diagnóstico unificado**: a Fase B entrega DDL + serviço + endpoint, mas o ciclo de vida operacional (cron + heartbeat + idempotency + alarme) **não foi fechado**. O job está pronto para rodar, todos os mecanismos defensivos existem (`withTransaction`, `withAdvisoryLock`, `RetryExecutor`, `BoundedConcurrency`, soft-ref `permuta_processamento`), mas nenhum agendador acionando.
- **Recomendação consolidada**: bundle `availability-1` (cron Render + heartbeat `/health/ingest`) + `availability-2` (Idempotency-Key) + `deployability-2` (idêntico a availability-1, redundante por desenho) **em uma única sprint pós-aprovação**.

### CC-2: Boundary externo do Conexos não tem timeout + boundary interno do Postgres não tem statement_timeout
- **Aparece em**: Availability (F-6), Performance (F-3), Fault Tolerance (lock-hold ilimitado)
- **Diagnóstico unificado**: dois clients (`ConexosClient` legacy axios, `PostgreeDatabaseClient` pool) operam sem cap defensivo de tempo. `RetryExecutor` sem timeout = não é Retry, é "espera infinita com 2 tentativas". `withAdvisoryLock` libera no `finally`, mas se o `write` pendurar, o lock fica adquirido até `pg_terminate_backend` manual.
- **Recomendação consolidada**: 1 card por client — `availability-5` (timeout axios + `Promise.race` defensivo) + `performance-3` (`SET statement_timeout / lock_timeout / idle_in_transaction_session_timeout` por sessão no pool). Esforço S em cada.

### CC-3: Duplicação de modelo (snapshot back-compat × relacional) sem coordenação atômica
- **Aparece em**: Fault Tolerance (F-1, F-2, F-4), Integrability (F-1 — shape compartilhado)
- **Diagnóstico unificado**: a Fase B é intencionalmente uma escrita dupla (relacional para `/gestao`, snapshot para `/painel` back-compat). As duas escritas vivem em transações separadas e o cabeçalho `permuta_eleicao_run.flow_id` não tem `UNIQUE` para impedir duplo-header — qualquer falha intermediária produz drift silencioso.
- **Recomendação consolidada**: `fault-tolerance-1` (unir TX1+TX2 ou aceitar compensação documentada como warn) + `fault-tolerance-2` (`UNIQUE(flow_id, kind)` em migration 0005) + `fault-tolerance-4` (reconciliador). Bundle de M de esforço total — fecha o vetor de drift inteiro.

### CC-4: Falta de seam de não-determinismo (Clock + Id providers) cascateia para Security e Modifiability
- **Aparece em**: Testability (F-3, F-4), Security (F-3 — audit), Modifiability (clock como seam reutilizável)
- **Diagnóstico unificado**: `new Date()` e `randomUUID()` chamados direto em 10 sites na fatia. Sem `ClockProvider`/`IdProvider`, testes não conseguem asserir invariantes exatos de auditoria; quando audit trail tem que virar append-only (`security-3`), o seam fica ainda mais necessário.
- **Recomendação consolidada**: `testability-3` (`ClockProvider`) + `testability-4` (`IdProvider`) ANTES de `security-3` (audit trail append-only). Padrão reutilizável por SISPAG/GED.

### CC-5: Repository monolítico + Contrato duplicado backend↔frontend = custo marginal alto de cada feature
- **Aparece em**: Modifiability (F-1, F-2, F-3, F-4), Integrability (F-1, F-5), Testability (F-5, F-6)
- **Diagnóstico unificado**: `PermutaRelationalRepository` (512 LOC, 4 entidades) e `GestaoPermutasResponse` (8 interfaces × 2 lados copy-paste) são os dois pontos onde adicionar campo/entidade/endpoint custa mais do que deveria. As 3 frentes futuras (SISPAG, Popula GED, Fase C) replicarão o template atual se nada mudar.
- **Recomendação consolidada**: `modifiability-1` + `modifiability-2` (`chunked` + `bulkUpsert` helpers) + `integrability-1` (schema Zod compartilhado backend↔frontend) + `integrability-5` (`httpJson` helper). Reduz LOC esperada de cada feature nova em ~30%.

### CC-6: Validação Zod parcial — boundary HTTP do `POST` ok, boundary HTTP do response ausente, boundary Conexos parcial
- **Aparece em**: Integrability (F-3, F-4), Security (F-2)
- **Diagnóstico unificado**: `processarBodySchema` valida o body do request (✅), `com298RowSchema.parse` valida `listAdiantamentosProforma` (✅), mas: (a) frontend não valida response com Zod (`lib/api.ts:44` faz `as Partial<>`), (b) `listFinanceiroAPagar` e `listTitulosAPagar` no `ConexosClient` coagem sem schema, (c) path param `:docCod` aceita qualquer string.
- **Recomendação consolidada**: `integrability-3` + `integrability-4` + `security-2`. Casa com `integrability-1` (schema único).

## 4. Quick wins (≤5 dias úteis)

Cards com esforço S e severidade ≥ P2.

| Card | QA | Esforço | Severidade | Resultado esperado |
|---|---|---|---|---|
| `availability-2` | Availability | S | P0 (promovido) | Idempotency-Key na ingestão; cron retentado reaproveita run anterior |
| `availability-3` | Availability | S | P1 | Distinguir vazio legítimo de fallback no `/gestao` |
| `availability-5` | Availability | S | P1 | Timeout 30s no `ConexosClient`; hang vira `ConexosError` em ≤30s |
| `availability-7` | Availability | S | P2 | `GET /health/ingest` com `last_success_at` + `stalePercent` |
| `deployability-1` | Deployability | S | P1 | Advisory lock no MigrationRunner + 1 caminho oficial |
| `deployability-2` | Deployability | S | P1 | Cron Render agendado (cobre R-1 junto com availability-1) |
| `deployability-3` | Deployability | S | P2 | Runbook de rollback Fase B |
| `deployability-4` | Deployability | S | P2 | Bump v0.2.0 → v0.3.0 + CHANGELOG |
| `deployability-5` | Deployability | S | P2 | Smoke test obrigatório (`exit 1` se segredo ausente) |
| `fault-tolerance-2` | Fault Tolerance | S | P1 | `UNIQUE(flow_id, kind)` em `permuta_eleicao_run` |
| `fault-tolerance-3` | Fault Tolerance | S | P2 | `logService.warn` no catch interno do header de erro |
| `integrability-2` | Integrability | S | P1 | `valorMoedaNegociada: number \| null` |
| `integrability-3` | Integrability | S | P1 | Zod parse no boundary do frontend + flag explícita |
| `integrability-4` | Integrability | S | P2 | Zod nos mappers `mapDocPagar` e `listTitulosAPagar` |
| `integrability-6` | Integrability | S | P2 | Limpar PII real do `permutas-fixture.ts` |
| `modifiability-1` | Modifiability | S | P1 | `chunked<T>` e `UPSERT_CHUNK` num helper único |
| `modifiability-4` | Modifiability | S | P2 | `pickDefined` helper |
| `performance-3` | Performance | S | P1 | `statement_timeout`/`lock_timeout` no pool |
| `performance-4` | Performance | S | P1 | Índice parcial `(last_ingest_run_id) WHERE NOT stale` |
| `security-2` | Security | S | P2 | Validar `:docCod` (Zod + CHECK no DB) |
| `testability-1` | Testability | S | P1 | Teste do `jobs/ingest-permutas.ts` |
| `testability-3` | Testability | S | P1 | `ClockProvider` |
| `testability-4` | Testability | S | P2 | `IdProvider` |

23 cards S. Em 5 dias úteis com 2 devs em paralelo, dá para fechar ~12.

## 5. Strategic moves (M / L / XL)

| Card | QA(s) | Esforço | Tactic alvo | Por que vale |
|---|---|---|---|---|
| `availability-1` | Availability | M | Heartbeat / Monitor | Janela máxima sem refresh do `/gestao`: ∞ → 26h. Sem isso, todo o resto da Fase B é teatro. |
| `availability-4` | Availability | M | Transactions / Prevent Faults | Compartilhar advisory lock entre ingest e eleicao; desenho atual permite 2 fan-outs Conexos simultâneos. |
| `availability-6` | Availability | M | Retry / State Resync | Retry transacional na ingestão — evita perder fan-out Conexos (~410 fetches) quando Supavisor cair. |
| `fault-tolerance-1` | Fault Tolerance | M | Compensating Transaction | Unir TX1+TX2 — fecha drift `/gestao` × `/painel`. 0% de testes cobrem cenário "TX1 commitou + TX2 falha". |
| `fault-tolerance-4` | Fault Tolerance | M | Reconcile | Reconciliador relacional × snapshot — salvo-conduto se F-1/F-2 não forem fechados. |
| `integrability-1` | Integrability | M | Contract Testing | 8 interfaces duplicadas → 0; CI falha em drift de shape. Endereça 3 P1 num só lugar. |
| `modifiability-2` | Modifiability | M | Abstract Common Services | `PermutaRelationalRepository.ts`: 512 → ~250 LOC. 5ª entidade ingerida vira ~30 LOC em vez de ~50. |
| `modifiability-3` | Modifiability | M | Split Module | Dividir writes/reads — destrava PRs paralelos sem colisão no maior arquivo (512 LOC). |
| `modifiability-6` | Modifiability | M | Split Module | `EleicaoPermutasService` (599 LOC) → orquestrador + `PermutaFanoutService`. |
| `performance-1` | Performance | M | Limit Event Response | Paginar `/gestao` — rows/hit: full-base → ≤200×3. p95 → ≤300ms. Indispensável >5k adiantamentos. |
| `performance-2` | Performance | S/M | Reduce Overhead | TRUNCATE em vez de DELETE — dead tuples 100% → 0%; lock-hold ~-30%. |
| `performance-5` | Performance | M | Increase Resource Efficiency | `withAdvisoryLockAndTransaction` no mesmo client — clients in-use: 2 → 1. |
| `performance-7` | Performance | M | Reduce Overhead | ETag em `/gestao` — queries por refresh: 4 → 1; p95 refresh ≤50ms. |
| `security-1` | Security | M | Authorize Actors / Separate Entities | RBAC + `tenant_id` nas 4 tabelas. Endpoints com check: 0/2 → 2/2. **Antes do 2º cliente entrar**. |
| `security-3` | Security | M | Audit Trail | `permuta_processamento_audit` append-only. Pré-requisito para SISPAG. |
| `testability-2` | Testability | M | Sandbox | Suite de integração SQL — migrations deixam de ser fé. Pré-requisito para `security-1`. |
| `testability-6` | Testability | M | Limit Structural Complexity | Fixtures compartilhados + supertest — top test file 652 → ≤500 LOC. |

## 6. O que está bem (e por quê)

1. **Atomicidade do write da ingestão** — `withTransaction(BEGIN → upserts → recompute → sweep → COMMIT)` envolvido em `withAdvisoryLock(INGEST_LOCK_KEY=918273645)`. Tactic: **Transactions + Recovery — Backward**. Evidência: `PermutaRelationalRepository.ts:153-170`, `PostgreeDatabaseClient.ts:102-123`.

2. **UPSERT-in-place por chave natural Conexos preserva last-good** — em ROLLBACK, fatos do run anterior continuam visíveis em `/gestao`. Tactic: **Degradation + State Resynchronization**. Evidência: `0003_permuta_relational.sql:28-49,103-120`.

3. **`markStale` no lugar de DELETE** — sweep marca `stale=TRUE` sem apagar; índices parciais `WHERE NOT stale` na leitura. Tactic: **Repair State**. Evidência: `PermutaRelationalRepository.ts:386-409`.

4. **`permuta_processamento` como soft-ref (sem FK)** — estado do analista sobrevive a qualquer re-ingestão. Tactic: **Increase Competence Set**. Evidência: `0004_permuta_processamento.sql:11-21`.

5. **Fan-out Conexos FORA do advisory lock** — `computeCandidatas` executa antes de `persistIngestRun`; só a fase write ocupa o lock. Tactic: **Increase Resource Efficiency**. Evidência: `IngestaoPermutasService.ts:70-114`.

6. **DDD respeitado em todo o delta** — 0 violações cross-layer. Tactic: **Restrict Dependencies**. Evidência: `grep` confirma 0 ocorrências.

7. **SQL parametrizado sem exceção** — `$name` em todos os repositórios novos (Inviolable Rule #5). Tactic: **Validate Input + Encapsulate**.

8. **88 testes verdes / 13 suites + padrão DB-mock via `TransactionClient`** — 100% dos métodos públicos da fatia têm `describe` correspondente. Tactic: **Specialized Interfaces**.

## 7. Limitações da análise

**Não medíveis localmente** (requerem produção/telemetria):
- MTTR real do job e da tela `/gestao`
- Tempo efetivo das chamadas Conexos / `RetryExecutor` (depende de `LegacyConexosShape` fora do escopo)
- Tempo real de lock-hold, p95 `/gestao`, `durationMs` por fase
- Frequência de falha em `snapshotRepository.persistRun` após commit do relacional
- Contagem real de `permuta_eleicao_run` com 2 headers por `flow_id`
- Error-rate por dependência (Conexos, Postgres)
- Cobertura por arquivo do `--coverage` jest (só o piso histórico foi inspecionado)
- `npm audit` profundo (pulado em `--quick`)
- `madge --circular` (não rodado; inspeção manual não revelou ciclos)
- Tempo real commit→prd / lead time / taxa de sucesso de deploy

**O pipe não cobre:**
- Chaos engineering / threat modeling formal
- Custo cloud / observabilidade de billing
- UX, acessibilidade, performance de frontend
- Infra Terraform / SSM / Lambda (não existe — estado-alvo)
- Frentes II (SISPAG) e III (Popula GED)
- RBAC institucional / SSO corporativo

**Janela temporal e escopo:**
- Snapshot do dia **2026-06-18**. Repetir trimestralmente.
- Escopo restrito ao delta Permutas Fase B (`_shared-metrics.md`).

**Cards copiados verbatim** dos arquivos QA para o `KANBAN.md`. Ajuste único: a severidade do card `availability-2` é P0 no consolidator (originalmente P1 no agent) — promoção justificada em §1.

## 8. Ações recomendadas

1. **Re-loop AutoLoop (esta feature)** — endereçar os 2 P0 antes de mergear: `availability-1` (cron Render + heartbeat) + `availability-2` (Idempotency-Key). Esforço: M + S. Sem isso, a Fase B passa em CI mas está quebrada em produção.

2. **Quick wins de fundação — Sprint 1 pós-merge (5 dias úteis)** — atacar CC-2 e CC-3: `availability-5` + `performance-3` (timeouts) + `fault-tolerance-2` (`UNIQUE(flow_id, kind)`) + `fault-tolerance-3` (`warn` no catch interno) + `performance-4` (índice) + `availability-7` (`/health/ingest`). 6 cards S.

3. **Higiene de contrato e fixture — Sprint 2 (5 dias úteis)** — atacar R-7 e R-9: `integrability-1` (schema Zod compartilhado) + `integrability-3` (Zod no frontend + flag fixture) + `integrability-6` (PII fora do fixture) + `testability-3` (`ClockProvider`) + `deployability-4` (bump v0.3.0).

4. **Refactor estrutural — Sprint 3-4 (10 dias úteis)** — atacar R-5: `modifiability-1` → `modifiability-2` → `modifiability-3` + `modifiability-4`.

5. **Antes do 2º cliente entrar** — endereçar R-4 e R-9: `security-1` (RBAC + `tenant_id`) + `security-3` (audit append-only) + `testability-2` (suite de integração SQL).
