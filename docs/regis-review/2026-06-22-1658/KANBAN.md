---
type: regis-review-kanban
run_id: 2026-06-22-1658
total: 59
counts: { p0: 9, p1: 28, p2: 17, p3: 5 }
---

# Kanban — financeiro — 2026-06-22-1658

> Importável para o Kanban do time. Cada card abaixo já tem Problema / Melhoria Proposta / Resultado Esperado.
> Ordem: P0 (S → XL), depois P1, P2, P3.
> Cards `cc-*` são merges cross-QA explícitos (campo `merged_from`).

---

## P0 — Crítico

### [performance-2] Adicionar `timeout` explícito no `axios.create` do `ConexosClient`

**QA**: Performance (cross-cuts Availability + Fault Tolerance — CC-2)
**Tactic alvo**: Bound Execution Times
**Esforço**: S
**Findings**: F-performance-5

**Problema**
> `src/backend/domain/client/ConexosClient.ts` instancia axios SEM `timeout:` (grep retorna zero). Uma chamada Conexos lenta/parada pode segurar o handler até `tcp_keepalive` do SO — segurando o pool de 5 conexões DB e até 50 sessões Conexos simultâneas. `BcbClient.ts:57` já tem `timeout: 10_000` (modelo).

**Melhoria Proposta**
> Aplicar Bound Execution Times: `axios.create({ ..., timeout: 30_000 })` no `ConexosClient` (30s é folgado para list paginado; 15s para detail endpoints — pode ser por método). Combinar com keep-alive agent (`new https.Agent({ keepAlive: true })`) para reuso de TCP entre chamadas do mesmo handler.

**Resultado Esperado**
> Pior caso de Conexos cinza: 1 ingestão aborta em ≤ 30s × pior path (~3 round-trips por adto) ≈ 90s, com erro identificável. Hoje: pendura indefinidamente. p99 de ingestão volta a ser dominada por throughput, não por timeout.

**Métricas de sucesso**
- Timeout configurado: nenhum → 30s (list) / 15s (detail)
- Tempo máximo de ingestão pendurada: ∞ → ≤ 90s
- Handlers pendurados após Conexos cinza: até 50 → 0

**Risco de não fazer**
> 1 incidente Conexos = nosso painel indisponível por horas até reinício; cron silenciosamente perde janelas.

**Dependências**: Nenhuma

---

### [security-3] Mascarar campos sensíveis no request logger antes do `JSON.stringify`

**QA**: Security
**Tactic alvo**: Limit Access
**Esforço**: S
**Findings**: F-security-3

**Problema**
> `src/backend/index.ts:44-45` imprime o body cru de toda request. `POST /auth/login` recebe `{ username, password }` em JSON, então cada login envia `password=<texto plano>` para stdout do Render e seus log drains. Senhas dos analistas vazam para qualquer agregador conectado.

**Melhoria Proposta**
> Criar `redactBody(body, keys=['password','token','authorization','secret','api_key'])` que substitui valores por `'[REDACTED]'`. Aplicar no logger. Tactic Bass: Limit Access.

**Resultado Esperado**
> Log de `POST /auth/login` mostra `body={"username":"foo","password":"[REDACTED]"}`. Métrica: 100% → 0% de logs com senha em texto plano. Teste: snapshot do logger não contém valor de campo `password`.

**Métricas de sucesso**
- Senhas em logs: presente → ausente (teste assertando)
- Cobertura da lista de campos redacted: 0 → ≥ 5 chaves canônicas

**Risco de não fazer**
> 1 senha vazada = 1 conta de analista comprometida para uso fora de horário. LGPD: dado pessoal sensível em log indevido.

**Dependências**: Nenhuma

---

### [testability-1] Sandboxar `EnvironmentProvider.test.ts`

**QA**: Testability
**Tactic alvo**: Sandbox (Limit Non-Determinism)
**Esforço**: S
**Findings**: F-testability-1

**Problema**
> A suite passa no CI e falha no dev (`expect(Number.isNaN(env.conexosFilCod)).toBe(true)` recebe `7` do `.env` local). Causa: `GetLocalEnvironmentVars` chama `dotenv.config()` que re-popula `process.env` depois do `beforeEach` limpar. O teste perde o significado: dois ambientes, dois resultados.

**Melhoria Proposta**
> Mover `dotenv.config()` para o boot do app (`index.ts`), fora de `EnvironmentProvider`. No teste, monkey-patch `dotenv.config` para no-op (`jest.mock('dotenv', () => ({ config: jest.fn() }))`). Alternativa equivalente: injetar um `DotenvLoader` no construtor de `EnvironmentProvider` e mockar nos testes.

**Resultado Esperado**
> Suite verde em qualquer máquina, com ou sem `.env`. Sinal "verde local = verde CI" restaurado.

**Métricas de sucesso**
- Testes ambientais: 1/374 → 0/374
- `EnvironmentProvider.test.ts` passa em máquina com `CONEXOS_FIL_COD` setado no `.env`: falha → passa

**Risco de não fazer**
> Dev gasta dia debugando teste fantasma; pior, mascara regressão real assumindo ser problema local.

**Dependências**: Nenhuma

---

### [testability-3] Configurar `collectCoverageFrom` no frontend e recalibrar `coverageThreshold`

**QA**: Testability (cross-cuts Deployability)
**Tactic alvo**: Executable Assertions (no gate de CI)
**Esforço**: S
**Findings**: F-testability-3

**Problema**
> `src/frontend/jest.config.js` não tem `collectCoverageFrom`. Jest mede só o que os testes importam (~10 arquivos), reportando 82.19%. Cobertura efetiva do FE é ~16% (10/196 `.tsx`). O gate de CI é satisfeito por um subconjunto arbitrário — gerência decide risco com número falso.

**Melhoria Proposta**
> Adicionar `collectCoverageFrom: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', '!**/*.d.ts', '!**/node_modules/**']`. Rodar coverage, recalibrar `coverageThreshold.global` para o baseline real (ex.: 20/15/20) e tratar como floor a subir.

**Resultado Esperado**
> Coverage reportada = coverage real. Floors significam algo. Adicionar 100 LOC sem teste passa a baixar o número.

**Métricas de sucesso**
- `collectCoverageFrom` configurado: ❌ → ✅
- % lines reportado vs. real: 82.19% (10 arquivos) → ~16-20% (196 arquivos), com plano de subir
- Floors atuais (75/40/55) → calibrados ao real, subindo a cada PR

**Risco de não fazer**
> Decisão de risco baseada em métrica falsa por mais 6 meses; cobertura efetiva continua sumindo enquanto reportada parece estável.

**Dependências**: Nenhuma

---

### [cc-auto-ingest-coalesce] (= performance-1) Tornar a re-ingestão pós cliente-filtro assíncrona com coalescing

**QA**: Performance (CC-1 cross-cuts Availability + Security + Fault Tolerance)
**Tactic alvo**: Manage Sampling Rate + Schedule Resources
**Esforço**: M
**Findings**: F-performance-1, F-performance-4, F-performance-8, F-availability-1, F-availability-9, F-security-5, F-fault-tolerance-1 (parcial)
**merged_from**: performance-1 + availability-1 (parcial) + fault-tolerance-1 (parcial)

**Problema**
> Cada add/remove de cliente-filtro dispara `runIngestaoManual()` síncrono na UI (linhas 99 e 133 de `app/permutas/clientes-filtro/page.tsx`). Para 5 filiais × ~30 adtos × ~100 invoices, são ~1.000+ chamadas Conexos + ~30s-90s de espera. Combinado com o `heavyRouteLimiter` (10 req/min cobrindo a rota inteira), 3 cliques rápidos bateram HTTP 429 em produção.

**Melhoria Proposta**
> Aplicar Manage Sampling Rate + Schedule Resources: o `POST /cliente-filtro` apenas grava + enfileira (advisory lock) e responde 202 com `runId`. UI mostra "Roteamento agendado" e faz polling em `GET /permutas/runs` ou em um novo `GET /permutas/runs/:id`. Coalescer múltiplos adds em 1 só ingestão (debounce de 5-10s no servidor: se entrar outro add antes da ingestão começar, só uma roda). Adicionar feature flag `PERMUTAS_AUTO_INGEST_ON_FILTRO` para operador desligar sob incidente. Arquivos: `routes/permutas.ts:164-194`, `IngestaoPermutasService.ts`, `app/permutas/clientes-filtro/page.tsx:86-166`.

**Resultado Esperado**
> p95 do POST `/cliente-filtro` cai de ~30-60s (timeout/429) para ≤ 1,5s. Zero HTTP 429 por sessão de analista em fluxo de cadastro de até 10 importadores. Janela de ingestão consolidada em < 90s, mesmo que 5 adds aconteçam em 1 min. Operador pode desligar auto-ingestão em produção sem deploy.

**Métricas de sucesso**
- p95 latência `POST /cliente-filtro`: ~30-60s → ≤ 1,5s
- HTTP 429/min em sessão de cadastro: ≥ 1 → 0
- Ingestões consolidadas por janela de 5 cliques: 5 → 1 (coalescing)
- Feature flags: 0 → 1 (kill-switch)

**Risco de não fazer**
> Onboarding (cadastro de 10-20 importadores numa Columbia nova) fica praticamente inviável; suporte recebe ticket "429 ao adicionar cliente". Em ≥2 tenants, `LOGIN_ERROR_MAX_SESSIONS` regular.

**Dependências**: Nenhuma estrutural; pode usar o advisory lock existente. Sinérgico com availability-3 (idempotência) e security-5 (cota por usuário).

---

### [security-1] Introduzir RBAC server-side (`requireRole('admin')`) em rotas de mutação

**QA**: Security (cross-cuts Fault Tolerance + Availability)
**Tactic alvo**: Authorize Actors
**Esforço**: M
**Findings**: F-security-1

**Problema**
> As 12 rotas em `src/backend/routes/permutas.ts` aceitam qualquer JWT válido. `req.user?.role` está disponível (vem do `AuthService.signToken`) mas nenhuma rota o consulta. Resultado: um analista comum dispara `POST /permutas/ingestao`, cria alocações em adtos alheios e remove `cliente-filtro` cadastrado por outro usuário sem qualquer verificação.

**Melhoria Proposta**
> Criar `requireRole('admin' | 'operator')` em `src/backend/http/authz.ts`; aplicar em `POST /permutas/ingestao`, `POST /permutas/eleicao`, `POST /permutas/cliente-filtro`, `DELETE /permutas/cliente-filtro/:pesCod`, `POST/DELETE /permutas/adiantamentos/:docCod/alocacoes`. Casos de leitura continuam apenas autenticados.

**Resultado Esperado**
> Usuário não-admin recebe HTTP 403 em endpoints de mutação financeira. Métrica: 0/12 → ≥ 5/12 rotas com check de papel; teste de integração com JWT `role='viewer'` retorna 403 nessas rotas.

**Métricas de sucesso**
- Rotas com check de papel: 0 → ≥ 5
- Testes Jest com JWT `role='viewer'` recebendo 403: 0 → ≥ 5

**Risco de não fazer**
> Quando SISPAG/baixa Conexos entrar (write-back que move dinheiro), o mesmo gap autoriza qualquer analista a finalizar lotes de pagamento.

**Dependências**: Nenhuma (lê `role` já presente no JWT)

---

### [security-2] Mover credenciais reais para secret manager + rotacionar `AUTH_JWT_SECRET`

**QA**: Security (cross-cuts Integrability)
**Tactic alvo**: Limit Access + Encrypt Data
**Esforço**: M
**Findings**: F-security-2

**Problema**
> `src/backend/.env` contém senha Conexos `MPS_FRANCINEI/@Amarelo521`, connection string do Postgres Supabase e o `AUTH_JWT_SECRET`. Qualquer dev com a máquina comprometida forja JWTs HS256 com qualquer `sub`/`role` e bypassa o login. O segredo é HS256 simétrico, sem rotação, igualmente capaz de assinar quanto verificar.

**Melhoria Proposta**
> (1) Rotacionar `AUTH_JWT_SECRET` em produção hoje (invalidando sessões — aceitar como custo). (2) Migrar credenciais sensíveis (Conexos, DB, JWT secret) do `.env` local para 1Password/Doppler/AWS SSM ParameterStore. (3) Trocar HS256 por chave assimétrica (ES256/EdDSA) — só o backend assina, qualquer leitor com a pública verifica.

**Resultado Esperado**
> `.env` local contém apenas referências (`AUTH_JWT_SECRET_REF=op://vault/jwt`) que são resolvidas no boot. Métrica: # de credenciais de prod em texto plano em disco de dev = N → 0; algoritmo JWT = HS256 → ES256.

**Métricas de sucesso**
- Senhas/segredos prod em `.env` dev: 4 → 0
- Algoritmo JWT: HS256 → ES256
- Rotação documentada: ad hoc → procedimento + agenda

**Risco de não fazer**
> Quando SISPAG/Nexxera entrar, o mesmo modelo de segredo move remessa bancária real. Insider/dev comprometido = remessa fraudulenta auditada com `sub` de terceiro.

**Dependências**: Nenhuma

---

### [deployability-1] Isolar Supabase por ambiente (dev vs prd)

**QA**: Deployability (cross-cuts Security + Fault Tolerance)
**Tactic alvo**: Manage Deployed System — Logical Grouping
**Esforço**: M
**Findings**: F-deployability-1, F-deployability-5, F-deployability-9

**Problema**
> O cron `ingest-permutas` roda 3×/dia o HEAD de `main` contra o MESMO Supabase que o dev usa em `.env`. Advisory lock evita corrida, mas dados de teste/manual e dados de cron ficam misturados; auditoria perde a fronteira; mudança de schema em dev expõe prd a estado inconsistente.

**Melhoria Proposta**
> Criar projeto Supabase `financeiro-dev` separado do `financeiro-prd`. Trocar o secret `DATABASE_CONNECTION_STRING` no GitHub Actions para apontar só ao prd; documentar em `DEPLOY.md` que `.env` local usa `financeiro-dev`. Adicionar `vars.ENVIRONMENT_LABEL` (dev/prd) que o backend exibe no `/health`.

**Resultado Esperado**
> Dev e prd isolados; `/health` indica em qual ambiente está; auditoria por `triggered_by='cron'` volta a representar só execuções reais. Métrica: 1 banco compartilhado → 2 bancos isolados.

**Métricas de sucesso**
- DBs compartilhados dev/prd: 1 → 0
- `/health` expõe ambiente: ausente → presente

**Risco de não fazer**
> Contaminação dev↔prd em incidente de auditoria fiscal; rollback de schema em prd reverte dado de dev junto.

**Dependências**: Nenhuma (custo Supabase de um projeto extra é trivial)

---

### [deployability-2] Implementar rollback de 1 comando + política de migration reversível

**QA**: Deployability (cross-cuts Availability)
**Tactic alvo**: Manage Deployment Pipeline — Rollback
**Esforço**: M
**Findings**: F-deployability-2, F-deployability-7

**Problema**
> Não há rollback documentado (`grep` por "rollback" em `.github/`/`DEPLOY.md` retorna 0); todas as 14 migrations são forward-only. Em incidente, operador precisa entrar no painel Render manualmente e reverter DDL na mão.

**Melhoria Proposta**
> Adicionar `scripts/rollback.sh` que: (a) chama Render API para promover deploy anterior; (b) opcionalmente aplica `migrations/*_down.sql` correspondente. Estabelecer política expand-contract documentada (toda DDL nova é additive; remoção vem em deploy posterior).

**Resultado Esperado**
> MTTR de rollback ≤ 5 min; runbook descreve o comando único. Métrica: 0 migrations reversíveis → política aplicada às próximas (sem retroatividade obrigatória).

**Métricas de sucesso**
- Rollback de 1 comando: ausente → presente
- Política expand-contract documentada: ausente → presente em `DEPLOY.md`

**Risco de não fazer**
> Incidente fora-de-horário leva > 30 min para mitigar; equipe noturna sem playbook.

**Dependências**: deployability-1

---

### [integrability-8] Modelar e probar o write-side `fin010` antes de Permutas Fatia 2

**QA**: Integrability (cross-cuts Fault Tolerance)
**Tactic alvo**: Tailor Interface (lado-escrita) + Use an Intermediary + Manage Resource Coupling
**Esforço**: L
**Findings**: F-integrability-8, F-integrability-3

**Problema**
> `ConexosClient` é 100% read-only. Frente I Fatia 2 (alocação manual N:M → executar permuta) e Frente II (SISPAG → conciliar baixa) ambas precisam escrever no Conexos (`fin010`). Não há contrato wire validado, não há erro tipado, não há idempotência de escrita, não há rollback shim. Documentado como risco arquitetural #1 em `migration-debt.md:42`.

**Melhoria Proposta**
> Disparar `/feature-new permutas-write "executar permuta na fin010 do Conexos via ConexosClient.executePermuta"`. OfficeHoursInterviewer deve cobrir: (1) endpoint wire exato e método HTTP, (2) payload mínimo de execução, (3) shape do response (sucesso/falha tipada), (4) chave de idempotência (Conexos aceita request-id?), (5) reversão / chamada inversa. Probe contra dev tenant com docCod sintético. Saída: novo método `executePermuta({docCodAdto, docCodInvoice, valor, filCod, idempotencyKey})` no `ConexosClient`, schema Zod do response, fixture pinned.

**Resultado Esperado**
> Métodos públicos de escrita: 0 → 1 (`executePermuta`); erros tipados de escrita: 0 → ≥2 (`CONEXOS_WRITE_REJECTED`, `CONEXOS_WRITE_CONFLICT`). Permutas Fatia 2 destrava.

**Métricas de sucesso**
- Métodos write em `ConexosClient`: 0 → 1
- Schemas Zod de write: 0 → 1
- Fixture de write pinned em `__fixtures__/conexos/`: ausente → presente
- Erros tipados de write: 0 → ≥2

**Risco de não fazer**
> Frente I Fatia 2 e Frente II (SISPAG) bloqueadas; ROI da Frente I parado no painel read-only; analista mantém execução manual no portal Conexos. Risco arquitetural #1 segue aberto.

**Dependências**: integrability-1 (transporte interno) MUITO recomendado antes; integrability-4 (Zod universal) recomendado depois.

---

## P1 — Alto

### [availability-3] Adotar Idempotency-Key em POST /permutas/ingestao (paridade com /eleicao)

**QA**: Availability (cross-cuts Fault Tolerance)
**Tactic alvo**: Transactions / State Resynchronization
**Esforço**: S
**Findings**: F-availability-7

**Problema**
> `/permutas/ingestao` não aceita `Idempotency-Key`. O advisory lock (`INGEST_LOCK_KEY`) só evita concorrência; um duplo-clique após o lock liberar dispara dois fan-outs reais. A rota irmã `/eleicao` já implementa o pattern (`EleicaoPermutasService.executar` com hash djb2 do header).

**Melhoria Proposta**
> Replicar o pattern de `EleicaoPermutasService` em `IngestaoPermutasService`. Header `Idempotency-Key` → lookup em `permuta_eleicao_run` por jsonb `idempotency_key` (ou nova tabela) → replay se TTL 24h. Tocar: `src/backend/domain/service/permutas/IngestaoPermutasService.ts`, `routes/permutas.ts:104-131`, migration nova para índice.

**Resultado Esperado**
> Replay seguro (zero fan-out adicional) em duplo-click ou retry de cliente. Pré-requisito para a Fase 3 (write-back fin010) ser P0-safe.

**Métricas de sucesso**
- Idempotência em rotas mutantes: 1/2 (50%) → 2/2 (100%)
- Fan-outs Conexos em duplo-click: 2 → 1 (replay)

**Risco de não fazer**
> Na Fase 3, duplo-click vira double-permuta no Conexos `fin010` — irreversível.

**Dependências**: Nenhuma

---

### [availability-4] Configurar retry no GitHub Actions cron + alerta em falha

**QA**: Availability (cross-cuts Deployability)
**Tactic alvo**: Heartbeat / Monitor
**Esforço**: S
**Findings**: F-availability-5

**Problema**
> `.github/workflows/ingest-permutas.yml` agenda 3 cron-runs/dia. Se uma falha (Conexos 5xx, segredo expirado), a próxima é 6h depois. Sem `if: failure()` notification, ninguém é avisado — MTTD pode chegar a 24h.

**Melhoria Proposta**
> (1) Adicionar `continue-on-error: false` + step `if: failure()` que abre uma issue (`gh issue create`) ou dispara webhook para Slack/Discord; (2) retry imediato no MESMO workflow via `nick-fields/retry@v3` (3 tentativas, 15min back-off); (3) cron auxiliar `0 */1 * * *` que executa um "ping" leve em `/health` e abre issue se 3 falhas consecutivas.

**Resultado Esperado**
> Falha de cron é descoberta em ≤ 1h; retry automático cobre falhas transientes; backlog stale fica limitado a 1 janela perdida.

**Métricas de sucesso**
- MTTD cron failure: ~24h → < 1h
- Janelas perdidas consecutivas: até 4 (24h) → ≤ 1 (6h, aceitável)

**Risco de não fazer**
> Em fim de mês, analista descobre que o painel está com dados de ontem na manhã do fechamento.

**Dependências**: availability-2 (sink de alerta)

---

### [deployability-3] Portar `bump-version.ps1` para Node ou shell POSIX

**QA**: Deployability
**Tactic alvo**: Manage Deployment Pipeline — Script Deployment Commands
**Esforço**: S
**Findings**: F-deployability-3

**Problema**
> `scripts/bump-version.ps1` é PowerShell num projeto que roda em darwin/Linux; reviewer (darwin 25.5.0) precisa de `pwsh` instalado, não declarado em `package.json`. Quebra a portabilidade do gate obrigatório do `AutoLoopRunner` (Green criteria #10).

**Melhoria Proposta**
> Reescrever como `scripts/bump-version.mjs` (Node nativo, já é a runtime do repo) — mesma lógica: lê commits, deriva semver, atualiza FE+BE+CHANGELOG. Atualizar referências em `CLAUDE.md` e pipeline.

**Resultado Esperado**
> Bump roda em qualquer dev sem dependência externa; `node scripts/bump-version.mjs` é a invocação canônica.

**Métricas de sucesso**
- Deps externas não-declaradas para bump: 1 (pwsh) → 0
- Dev `npm ci` && roda bump: hoje quebra → roda

**Risco de não fazer**
> PRs sem `chore(release):` virarem norma em macOS/Linux; `/health` deixa de refletir versão.

**Dependências**: Nenhuma

---

### [fault-tolerance-2] Envelopar `AlocacaoPermutasService.alocar` em transação + lock por invoice

**QA**: Fault Tolerance
**Tactic alvo**: Atomic Transaction + Mutual Exclusion
**Esforço**: S
**Findings**: F-fault-tolerance-2

**Problema**
> `alocar` faz 4 reads (1 SELECT + 3 chamadas Conexos + 2 SUMs) seguidos de 1 UPSERT, tudo sem `withTransaction`. Dois analistas alocando contra a mesma invoice ao mesmo tempo podem exceder o saldo (race-condition entre `sumByInvoice` e `upsertAlocacao`).

**Melhoria Proposta**
> Envelopar a fase "validar saldo + upsert" em `withTransaction` + advisory lock por `invoiceDocCod` derivado de hash djb2 (mesma técnica já usada para Idempotency-Key da eleição) para serializar alocações concorrentes na MESMA invoice. Tocar `AlocacaoPermutasService.ts:167-284` e adicionar `PermutaAlocacaoRepository.upsertAlocacaoTx(tx, ...)`.

**Resultado Esperado**
> Σ por invoice nunca excede saldo, mesmo sob concorrência. Teste de carga com 10 requests paralelos na mesma invoice → no máximo 1 sucesso, demais retornam 422 ou esperam.

**Métricas de sucesso**
- Caminhos mutativos sem `withTransaction`: 1 (atual) → 0
- Testes de concorrência: 0 → 1 (10 paralelos contra mesma invoice)

**Risco de não fazer**
> Over-allocation silenciosa; quando Fase 3 chegar = baixa dupla.

**Dependências**: Nenhuma

---

### [fault-tolerance-3] Job reaper para runs de ingestão "stuck"

**QA**: Fault Tolerance (cross-cuts Deployability)
**Tactic alvo**: Stuck-State Reaper + Condition Monitoring
**Esforço**: S
**Findings**: F-fault-tolerance-6

**Problema**
> Nenhum job varre `permuta_eleicao_run.started_at < now() - 30min AND finished_at IS NULL` para marcar runs órfãs como `error`. Em deploy mid-run / OOM, a trilha de auditoria mostra "em andamento" indefinidamente.

**Melhoria Proposta**
> Adicionar `src/backend/jobs/reap-stuck-runs.ts` que executa `UPDATE permuta_eleicao_run SET status='error', finished_at=now(), error_message='reaped: stuck > 30min' WHERE finished_at IS NULL AND started_at < now() - interval '30 minutes'`. Agendar no GitHub Actions cron a cada 15min.

**Resultado Esperado**
> Runs órfãs detectadas e fechadas dentro de ≤45 min do crash. Trilha de auditoria consistente: status final sempre `success` ou `error`.

**Métricas de sucesso**
- Jobs reaper existentes: 0 → 1
- Runs com `finished_at IS NULL AND started_at < now() - 1h`: tendência observável → 0

**Risco de não fazer**
> Auditoria suja; suspeita acumulativa nos logs de prod.

**Dependências**: Nenhuma

---

### [modifiability-2] Extrair helper `AdiantamentoSaldoCalculator` (4 cópias de `valorPermutar/taxa`)

**QA**: Modifiability
**Tactic alvo**: Abstract Common Services
**Esforço**: S
**Findings**: F-modifiability-3

**Problema**
> A fórmula "saldo do adiantamento em moeda negociada = `valorPermutar(BRL) / taxa`" está reimplementada em 4 sítios (`IngestaoPermutasService:324`, `GestaoPermutasService:204` e `:396`, `AlocacaoPermutasService:219`), com semânticas de fallback divergentes (`?? 0` no Ingestao vs `undefined` nos demais). Qualquer ajuste contratual exige edição em 4 lugares — risco real de divergência entre tela e ingestão.

**Melhoria Proposta**
> Criar `src/backend/domain/service/permutas/AdiantamentoSaldoCalculator.ts` (`@injectable()`) com método único `saldoEmMoedaNegociada(adto, opts?: { fallback: 'zero' | 'undefined' }): number | undefined`. Substituir as 4 cópias por chamadas ao helper. Adicionar teste canônico para os edge cases (taxa=0, valorPermutar=0, taxa undefined).

**Resultado Esperado**
> 1 definição da regra "saldo em moeda negociada" no domínio. Mudança contratual = 1 PR, 1 arquivo. Testes consolidam o comportamento de fallback.

**Métricas de sucesso**
- Cópias da fórmula `valorPermutar/taxa`: 4 → 1
- `business_rules.saldo-em-moeda-negociada.has_test`: false → true

**Risco de não fazer**
> 5ª cópia aparece na Fase 3; divergência silenciosa de centavos entre Ingestão e Alocação Manual.

**Dependências**: Nenhuma — pré-requisito para modifiability-3 e Fase 3

---

### [modifiability-3] Decompor `IngestaoPermutasService.toCasamentoRows` (cogn. 43)

**QA**: Modifiability
**Tactic alvo**: Refactor
**Esforço**: S
**Findings**: F-modifiability-2, F-modifiability-3

**Problema**
> `toCasamentoRows` (linha 340) carrega 4 responsabilidades entrelaçadas: agrupar candidatas por invoice, calcular teto, ordenar (saldo→aging→dataEmissao), distribuir greedy com `restante`/`usado` e recalcular variação cambial. Cognitive complexity = 43 (Biome max: 15). Foi introduzido no PR #4 (ADR-0010) e implementa a regra mais sensível da Frente I (fix do bug 1408 ZNSHINE).

**Melhoria Proposta**
> Extrair 4 métodos privados — `agruparPorInvoice(candidatas)`, `calcularTetoInvoice(invoice)`, `ordenarParaGreedy(grupo)`, `distribuirGreedy({ ordenado, teto, calcularVariacao })`. `toCasamentoRows` vira o orquestrador (≈ 15 LOC). Usar o helper de modifiability-2 para `saldoDisponivelNeg`.

**Resultado Esperado**
> `toCasamentoRows` cogn. 43 → ≤ 15; 4 métodos privados de cogn. ≤ 8 cada. Mudança no critério de desempate edita 1 método.

**Métricas de sucesso**
- Cogn. complexity `toCasamentoRows`: 43 → ≤ 15
- Cobertura de teste da regra greedy mantida em 100%

**Risco de não fazer**
> Bug de super-permuta (ADR-0010) retorna via regressão silenciosa.

**Dependências**: modifiability-2

---

### [modifiability-7] Introduzir camada de service para rotas que chamam repositório/client direto

**QA**: Modifiability
**Tactic alvo**: Restrict Dependencies + Use an Intermediary
**Esforço**: S
**Findings**: F-modifiability-7

**Problema**
> `routes/permutas.ts` resolve 4 repositórios direto (linhas 145, 156, 174, 190, 202, 312) e `routes/conexos.ts:4` importa `ConexosClient`. Quando regra de negócio for adicionada (auditar quem cadastrou, validar SLA), handler de rota terá que carregar inline.

**Melhoria Proposta**
> Criar `ClienteFiltroService`, `PermutaImportadoresService`, `PermutaSnapshotQueryService`, `PermutaProcessamentoQueryService`. `routes/permutas.ts` passa a só falar com services. Atualizar PatternGuardian para policiar `routes/ → domain/repository|client`.

**Resultado Esperado**
> 0 imports diretos de repositório/client em `routes/`. Cada rota tem 1 ponto canônico de regra de negócio.

**Métricas de sucesso**
- Imports `routes → repository`: 4 → 0
- Imports `routes → client`: 1 → 0

**Risco de não fazer**
> Regras de negócio acumulam em routes (anti-DDD), Frente II copia o pattern.

**Dependências**: Nenhuma

---

### [performance-3] Granularizar `heavyRouteLimiter` — só nas escritas pesadas

**QA**: Performance (cross-cuts Security)
**Tactic alvo**: Prioritize Events
**Esforço**: S
**Findings**: F-performance-1, F-performance-4

**Problema**
> `app.use('/permutas', heavyRouteLimiter)` (10 req/min/IP) cobre `GET /gestao`, `GET /runs`, `GET /cliente-filtro`, `GET /invoices/buscar` (leituras) e `POST /ingestao`, `POST /eleicao` (escritas pesadas) no mesmo bucket. Refresh de painel + uma busca de invoice consomem o orçamento da ingestão.

**Melhoria Proposta**
> Manter `globalLimiter` (100/min) nas leituras e aplicar `heavyRouteLimiter` somente em: `POST /permutas/eleicao`, `POST /permutas/ingestao`. Considerar limiter por-usuário (não por-IP) para escritórios atrás de NAT. Tocar: `index.ts:80-88`, `routes/permutas.ts:73-131`.

**Resultado Esperado**
> Limit de 10/min só nas escritas pesadas. Leituras voltam a 100/min. 2 analistas no mesmo IP fazendo trabalho normal nunca disparam 429.

**Métricas de sucesso**
- HTTP 429 em `GET /gestao` por dia: > 0 → 0
- Bucket consumido por refresh de painel: 1 → 0

**Risco de não fazer**
> Contramedida de proteção do Conexos vira gargalo de UX permanente.

**Dependências**: Nenhuma

---

### [performance-5] `buscarInvoices`: bound concurrency + bulk `getDetalheTitulos`

**QA**: Performance
**Tactic alvo**: Reduce Overhead
**Esforço**: S
**Findings**: F-performance-3, F-performance-5

**Problema**
> `AlocacaoPermutasService.buscarInvoices` faz `Promise.all` SEM bound (linhas 105-158) com 2 Conexos + 1 DB query por invoice — para 8 invoices num processo, 16 round-trips + 8 SELECTs sequenciais. Endpoint chamado a cada digitação no modal de alocação. Sem timeout no axios (performance-2), uma invoice lenta segura o handler.

**Melhoria Proposta**
> (1) Usar `BoundedConcurrency.map(invoices, ..., ADIANTAMENTOS_CONCURRENCY)` em vez de `Promise.all`; (2) substituir o `sumByInvoice` por-invoice por 1 `selectMany` agregado `WHERE invoice_doc_cod = ANY($docCods)`; (3) reaproveitar `valorMoedaNegociada` cacheado quando `stale=false`. Tocar: `AlocacaoPermutasService.ts:87-159`, `PermutaAlocacaoRepository.ts:116-128`.

**Resultado Esperado**
> p95 latência de `GET /permutas/invoices/buscar` (8 invoices típicas): estimado ~2-3s → ≤ 800ms. Round-trips DB: 8 → 1. Concorrência Conexos contida.

**Métricas de sucesso**
- DB round-trips em `buscarInvoices(N)`: N+2 → 3
- Conexos concorrência simultânea: ilimitada → ≤ 10
- p95 latência endpoint: ~2-3s → ≤ 800ms

**Risco de não fazer**
> UX do modal de alocação degrada com processos com muitas invoices; risco contínuo de MAX_SESSIONS.

**Dependências**: Nenhuma

---

### [availability-2] Instrumentar dashboard de runs (duração, taxa de erro, hidratação parcial)

**QA**: Availability (cross-cuts Performance + Integrability)
**Tactic alvo**: Monitor / Predictive Model
**Esforço**: M
**Findings**: F-availability-2, F-availability-5, F-availability-8

**Problema**
> `durationMs`, `status`, `totalCandidatas/Elegiveis/Bloqueadas/Stale` são logados via `LogService` mas não há export para Datadog/Logtail/Prometheus. Após PR #4 introduzir +1 `getDetalheTitulos` por invoice casável, não há série temporal para comparar latência pré-/pós. Catches silenciosos em hidratação `com308` (F-availability-8) também não contam para a trilha.

**Melhoria Proposta**
> (1) Adicionar export estruturado via `pino` ou JSON line + sidecar para a plataforma escolhida (Logtail é o caminho mais barato em Render); (2) gravar contador `hidratacaoParcialCount` no cabeçalho `permuta_eleicao_run` (nova coluna ou jsonb `metrics`); (3) alerta quando 2 runs consecutivas têm `status=error` OU `durationMs > p95_baseline × 2`.

**Resultado Esperado**
> p95/p99 da run e taxa de erro visíveis em dashboard; alerta dispara antes que o analista perceba. Comparativo PR-a-PR de performance da ingestão fica viável.

**Métricas de sucesso**
- Métricas exportadas (duração, erro, hidratação parcial): 0 → 3
- MTTD de cron failure: ~24h → < 1h

**Risco de não fazer**
> Regressões de performance só aparecem em outage; impossível defender investimento sem números.

**Dependências**: Nenhuma

---

### [deployability-4] Criar job `deploy` formal no CI

**QA**: Deployability
**Tactic alvo**: Manage Deployment Pipeline — Deployment Pipeline
**Esforço**: M
**Findings**: F-deployability-4

**Problema**
> `render.yaml` confia em "GitHub branch protection" como gate; CI não tem job `deploy`. Histórico de "quando foi deployado o quê" vive apenas no painel do Render — fora do GitHub Actions e fora de auditoria do repo.

**Melhoria Proposta**
> Acrescentar job `deploy-backend` em `ci.yml` que, em push para `main` (após `backend`/`frontend` verdes), chama a Render Deploy Hook API e aguarda o status. Análogo para `deploy-frontend` via Vercel API. Resultado: `gh run list` mostra deploy junto com tests.

**Resultado Esperado**
> Cada deploy tem um GitHub Actions run vinculado; `tag-release` passa a usar o `run_id` desse job na release notes.

**Métricas de sucesso**
- Jobs de deploy no CI: 0 → 2 (BE + FE)
- Audit trail no repo: ausente → presente

**Risco de não fazer**
> Desconfig de branch protection (humano) destrava deploy direto; nenhuma trilha no repo.

**Dependências**: deployability-1

---

### [deployability-5] Drift detection diária: comparar `schema_migrations` × `information_schema`

**QA**: Deployability
**Tactic alvo**: Drift detection
**Esforço**: M
**Findings**: F-deployability-5

**Problema**
> Não há rotina que detecte schema drift; DDL ad-hoc no Supabase (ou Supabase Auth aplicando suas próprias migrations) deixa o repo descrevendo um estado fictício.

**Melhoria Proposta**
> Workflow `drift-detect.yml` cron diário (06:00 UTC) que (a) `SELECT name FROM schema_migrations` e compara com `migrations/*.sql`; (b) usa `pg_dump --schema-only` e diff contra um snapshot commitado em `migrations/_schema-snapshot.sql`. Falha do job abre issue automaticamente.

**Resultado Esperado**
> Drift detectado em ≤ 24h; alerta GitHub Issue automático com diff.

**Métricas de sucesso**
- Rotinas de drift: 0 → 1
- Schema snapshot commitado: ausente → presente

**Risco de não fazer**
> Surpresa em deploy futuro com `relation already exists` ou pior — sucesso com schema fora do controle.

**Dependências**: deployability-1

---

### [deployability-9] Criar branch/ambiente `stg` para o cron antes do `main`

**QA**: Deployability
**Tactic alvo**: Manage Deployment Pipeline — Scale Rollouts (stage gating)
**Esforço**: M
**Findings**: F-deployability-9

**Problema**
> Cron `ingest-permutas` só executa a partir de `main`; toda mudança em `IngestaoPermutasService` que sobreviva ao unit test vai a prd no próximo 09/15/21 UTC sem validação contra Conexos real intermediária.

**Melhoria Proposta**
> Duplicar workflow para `ingest-permutas-stg.yml` no branch `stg` apontando ao Supabase `financeiro-stg`. Promotion `stg → main` requer 1 ciclo completo (24h ou manual aprovação).

**Resultado Esperado**
> Bug em greedy/cliente-filtro pego em stg antes de prd.

**Métricas de sucesso**
- Ambientes de cron: 1 (main→prd) → 2 (stg + prd)
- Bugs de ingestão pegos em stg: 0 → ≥ 1/trimestre

**Risco de não fazer**
> Regressão de cron afeta auditoria do dia seguinte; analista descobre pelo dado errado.

**Dependências**: deployability-1

---

### [fault-tolerance-1] Mover compensação cliente-filtro para o servidor (saga durável)

**QA**: Fault Tolerance (cross-cuts CC-1)
**Tactic alvo**: Compensating Transaction + Atomic Transaction
**Esforço**: M
**Findings**: F-fault-tolerance-1, F-fault-tolerance-6

**Problema**
> A remoção de cliente-filtro com auto-ingest é uma saga client-side de 3 passos sem persistência durável: se o operador fecha a aba ou o re-ADD client-side falha, cadastro e painel divergem sem ninguém para reconciliar. Não há fila server-side de "compensação pendente".

**Melhoria Proposta**
> Substituir a sequência DELETE→ingest→on-fail-re-ADD do `clientes-filtro/page.tsx` por um endpoint server-side único `POST /permutas/cliente-filtro/:pesCod/remover-com-reroteamento` que, dentro de uma única transação no servidor, faz: `SOFT-DELETE` (marca `ativo=false`) → dispara ingest síncrono → em falha, marca `pending_compensation=true`. Um job reaper varre `pending_compensation=true` e retenta.

**Resultado Esperado**
> Compensação durável: 1 fonte de verdade no servidor; UI passa a apenas refletir o estado. Métrica: divergências cadastro × painel observadas → 0; tempo médio de reconciliação após falha de ingest → minutos.

**Métricas de sucesso**
- Saga client-side em `clientes-filtro/page.tsx`: 1 → 0
- Endpoints servidor com compensação durável: 0 → 1
- Tabela / coluna `pending_compensation`: ausente → presente

**Risco de não fazer**
> Em Fase 3, mesma topologia client-side aplicada a fluxos de baixa real vira P0 — permuta executada com roteamento que o cadastro acha que removeu.

**Dependências**: fault-tolerance-3 (reaper) deve existir antes para fechar o loop

---

### [fault-tolerance-4] Estender Idempotency-Key aos demais POSTs mutativos

**QA**: Fault Tolerance (cross-cuts Availability + Performance)
**Tactic alvo**: Idempotent Replay
**Esforço**: M
**Findings**: F-fault-tolerance-4

**Problema**
> Só `/permutas/eleicao` honra Idempotency-Key. Duplo-clique / retry de fetch / replay de Service Worker em `/ingestao`, `/alocacoes` ou `/processar` pode sobrescrever observação ou valorAlocado já gravado. Hoje a invariante é entity-level (UPSERT por chave natural), o que basta para "mesmo payload" mas não para "mesma intenção, payload mudou no retry".

**Melhoria Proposta**
> Generalizar `permuta_eleicao_idempotency` para uma tabela `idempotency_request` (chave: `key + endpoint`, TTL 24h) e adicionar middleware Express que: 1) lê `Idempotency-Key`; 2) se já existe, devolve a resposta gravada; 3) senão, executa handler e GRAVA a resposta antes de retornar. Aplicar nos 4 endpoints.

**Resultado Esperado**
> Todos os POST/DELETE mutativos do PR #4 são request-idempotentes. Retry de uma requisição que já foi processada devolve a MESMA resposta, sem efeito colateral.

**Métricas de sucesso**
- Endpoints com Idempotency-Key honrada: 1/5 (20%) → 5/5 (100%)
- Tabela `idempotency_request`: ausente → presente

**Risco de não fazer**
> Bloqueia a Fase 3 (write-back `fin010`); double-execution é P0 nesse contexto.

**Dependências**: Nenhuma (mas precede a Fase 3)

---

### [fault-tolerance-5] Consolidar `IngestaoPermutasService.executar` em UMA transação

**QA**: Fault Tolerance
**Tactic alvo**: Atomic Transaction
**Esforço**: M
**Findings**: F-fault-tolerance-3

**Problema**
> `persistIngestRun` (relacional) e `snapshotRepository.persistRun` (snapshot back-compat) rodam em transações distintas — sem chave de correlação obrigatória entre os dois `runId`s além do `flow_id`. Janela de tempo entre os dois commits gera divergência `/gestao` vs. `/painel` em caso de crash.

**Melhoria Proposta**
> Opção A (preferida): mover o snapshot pra DENTRO da mesma transação do `persistIngestRun`, reusando o `runId` (escreve dois cabeçalhos `permuta_eleicao_run` com `kind in ('ingest','snapshot')` apontando ao mesmo `flow_id`). Opção B: gravar `snapshot_run_id` no cabeçalho do `ingest` como FK referenciando o cabeçalho snapshot.

**Resultado Esperado**
> Crash mid-execução nunca deixa `/gestao` fresco com `/painel` stale.

**Métricas de sucesso**
- Transações por ingestão: 2 → 1
- Drift `/gestao` vs. `/painel` em crash test: observado → 0

**Risco de não fazer**
> Telas divergentes em incidente; analista decide com base na tela errada.

**Dependências**: Nenhuma

---

### [integrability-1] Internalizar o transporte Conexos no `domain/client/`

**QA**: Integrability (cross-cuts Security + Modifiability)
**Tactic alvo**: Encapsulate / Use an Intermediary / Restrict Communication Paths
**Esforço**: M
**Findings**: F-integrability-1, F-integrability-5

**Problema**
> O transporte real (`services/conexos.ts`) vive fora de `domain/client/`, importa axios direto, lê `process.env.CONEXOS_*` em vez de `EnvironmentProvider` e expõe um singleton de módulo que viola DI. Bloqueia migração Lambda multi-tenant e bloqueia o desenho do write-side `fin010`.

**Melhoria Proposta**
> Promover o transporte para `src/backend/domain/client/conexos/ConexosTransport.ts` `@singleton @injectable`. Mover `process.env.CONEXOS_*` para `EnvironmentProvider.conexosLogin/conexosPassword/conexosApiUrl`. Deletar `services/conexos.ts` e `legacyConexosAdapter.ts`. Substituir `LEGACY_CONEXOS_TOKEN` por `@inject(ConexosTransport)`.

**Resultado Esperado**
> 0 imports `axios` fora de `domain/client/`; 0 `process.env.CONEXOS_*` fora de `EnvironmentProvider`. Testes integration podem mockar o transporte por DI normal. Caminho aberto para o write-side `fin010`.

**Métricas de sucesso**
- Arquivos `services/conexos.ts`: existe → deletado
- `grep "import axios" src/backend ... | grep -v "domain/client"`: 2 → 0
- `process.env.CONEXOS_*` outside `EnvironmentProvider`: 3 → 0

**Risco de não fazer**
> Cada nova integração stateful (Nexxera, GED) copia o anti-pattern; SaaSo multi-tenant fica inviável; write-side `fin010` herda 310 linhas de débito.

**Dependências**: Nenhuma; é pré-requisito de integrability-8

---

### [integrability-2] Contract probe + alerta de drift de shape para Conexos

**QA**: Integrability (cross-cuts Testability)
**Tactic alvo**: Versioning strategy + Contract testing
**Esforço**: M
**Findings**: F-integrability-2, F-integrability-4

**Problema**
> Conexos não versiona a API; quebras de contrato (renaming `mnyTitAberto`, mudança de `serviceName`) são detectadas só por relato de analista, em produção. PR #4 já adicionou 2 novos pontos de contato sem versionamento upstream.

**Melhoria Proposta**
> Criar `scripts/conexos-probe.ts` que executa em CI nightly contra o dev tenant: chama os 13 endpoints públicos, valida com schemas Zod E diffs contra fixtures JSON em `src/backend/__fixtures__/conexos/`. Alerta no Slack/email quando o diff inclui campo novo/removido/tipo-trocado.

**Resultado Esperado**
> MTTD de quebra de contrato: dias → minutos. Probes empíricos datados passam de "lembrança" para "fixture que CI compara".

**Métricas de sucesso**
- % de endpoints com fixture pinned em `__fixtures__/conexos/`: 0 → 100%
- Schemas Zod usados / definidos: 2/3 → 3/3
- CI nightly job: ausente → presente

**Risco de não fazer**
> Frente II (SISPAG) e III (Popula GED) entram em produção com o mesmo blind spot.

**Dependências**: Nenhuma

---

### [modifiability-1] Quebrar `permutas/page.tsx` em sub-componentes por aba e modal

**QA**: Modifiability (cross-cuts Performance + Testability)
**Tactic alvo**: Split Module
**Esforço**: M
**Findings**: F-modifiability-1

**Problema**
> `src/frontend/app/permutas/page.tsx` tem 2127 LOC, 10 componentes locais, 26 useStates e 9 useCallbacks num único arquivo. Cada aba (Simples, Múltiplas, Cross-over, Cross-process) e cada modal re-renderiza a página inteira. Já houve conflito de merge entre branches paralelas.

**Melhoria Proposta**
> Criar `src/frontend/app/permutas/_components/` e mover cada aba como `<TabaSimples/>`, `<TabaMultiplas/>`, etc.; cada modal como `<ModalAuditoriaRuns/>`, `<ModalAlocacaoManual/>`; badges e formatters para `src/frontend/components/permutas/`. A página raiz fica como orquestrador de tabs + dispatcher de modal (alvo: ≤ 400 LOC). Cada aba detém seu próprio `useState` local.

**Resultado Esperado**
> `page.tsx` ≤ 400 LOC; máximo de 1 componente por arquivo; nenhum arquivo > 300 LOC em `_components/`. Conflito de merge entre features de abas independentes vai a zero.

**Métricas de sucesso**
- LOC `page.tsx`: 2127 → ≤ 400
- Componentes por arquivo: 10 → 1
- useStates por arquivo: 26 → ≤ 8 por arquivo

**Risco de não fazer**
> Em 6 meses, qualquer feature em Permutas é gargalo de merge; quando SISPAG ganhar página análoga, o pattern (2k+ LOC) é replicado.

**Dependências**: Nenhuma

---

### [modifiability-4] Decompor `EleicaoPermutasService.computeCandidatas` (cogn. 65)

**QA**: Modifiability (cross-cuts Testability)
**Tactic alvo**: Split Module + Increase Semantic Coherence
**Esforço**: M
**Findings**: F-modifiability-4

**Problema**
> `EleicaoPermutasService` tem 813 LOC e uma função em cogn. 65 (`:523`) — 4.3× o limite. Mistura paginate Conexos, idempotency-key, advisory lock, fan-out de filiais e adiantamentos, snapshot relacional, marca stale. É o coração do cron 3x/dia.

**Melhoria Proposta**
> Extrair (1) `ConexosEleicaoFetcher` (paginate + boundedConcurrency Conexos), (2) `EleicaoRunCoordinator` (idempotency-key + advisory lock + persistencia run), (3) `EleicaoCandidatasComputer` (loop por filial → ElegibilidadeService → VariacaoCambialService). `EleicaoPermutasService` vira facade fino.

**Resultado Esperado**
> Nenhum arquivo > 400 LOC nessa cadeia; cogn. máxima ≤ 15. Trocar idempotency strategy ou cron interval = 1 arquivo.

**Métricas de sucesso**
- LOC `EleicaoPermutasService.ts`: 813 → ≤ 250
- Cogn. complexity máxima: 65 → ≤ 15

**Risco de não fazer**
> Toda mudança no cron diário toca um arquivo gigante; MTTR cresce.

**Dependências**: Nenhuma

---

### [modifiability-6] Decompor `AlocacaoPermutasService.alocar` (cogn. 26) antes da Fase 3

**QA**: Modifiability (cross-cuts Fault Tolerance)
**Tactic alvo**: Refactor + Split Module
**Esforço**: M
**Findings**: F-modifiability-6, F-modifiability-3

**Problema**
> `alocar` (linha 167, cogn. 26) faz validação → re-find → escopo casamento-manual → buscarInvoices LIVE → validar D.I → calcular saldoAdtoNeg (3ª cópia da fórmula) → invariantes de saldo → recalcular variação → upsert. Fase 3 (`reconciliarPermuta` — write-back fin010) vai inserir mais um passo aqui.

**Melhoria Proposta**
> Extrair `AlocacaoInvariantsService` (valida saldo dos 2 lados, escopo casamento-manual, D.I obrigatória); reaproveitar helper de modifiability-2 para saldoAdto; `alocar` vira orquestrador linear. Mesmo tratamento para `buscarInvoices` (cogn. 23): extrair `InvoiceHydrator`.

**Resultado Esperado**
> `alocar` cogn. 26 → ≤ 15; `buscarInvoices` cogn. 23 → ≤ 15. Fase 3 entra como passo isolado.

**Métricas de sucesso**
- Cogn. `alocar`: 26 → ≤ 15
- Cogn. `buscarInvoices`: 23 → ≤ 15
- Caminho crítico Fase 3 mensurável em LOC (alvo: < 50 LOC adicionados ao service)

**Risco de não fazer**
> Fase 3 (risco arquitetural #1) começa com débito acumulado no caminho crítico; bugs de write-back ficam mais difíceis de diagnosticar.

**Dependências**: modifiability-2

---

### [security-4] Migrar token de `localStorage` para cookie `HttpOnly`

**QA**: Security
**Tactic alvo**: Limit Exposure
**Esforço**: M
**Findings**: F-security-4, F-security-7

**Problema**
> O JWT vive em `localStorage` (`AuthProvider.tsx:44,68`). Qualquer XSS — incluindo via dependência transitiva — lê e exfiltra. Sem `HttpOnly`, o navegador não oferece defesa.

**Melhoria Proposta**
> Backend devolve o JWT como cookie `Set-Cookie: app_token=…; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200` no `POST /auth/login`. Frontend deixa de manipular o token. Middleware de auth lê o cookie OU o `Authorization: Bearer` (compatibilidade). Adicionar CSRF token (double-submit) para mutações.

**Resultado Esperado**
> Token inacessível a JavaScript no navegador. Métrica: 0 → 100% dos tokens em cookie `HttpOnly`.

**Métricas de sucesso**
- Token em `localStorage`: presente → ausente
- CSRF token em mutações: ausente → presente

**Risco de não fazer**
> 1 XSS = janela de 12h com identidade do usuário em prod financeiro.

**Dependências**: Nenhuma

---

### [security-5] Cota por usuário (`sub`) em `/permutas/ingestao` e `/eleicao`

**QA**: Security (cross-cuts Availability + Performance — CC-1)
**Tactic alvo**: Limit Exposure + Detect Service Denial
**Esforço**: M
**Findings**: F-security-5

**Problema**
> `heavyRouteLimiter` é por IP (10/min) — atrás de NAT corporativo, um usuário bloqueia o time todo (usuário já hit 429 em produção). Sem cota por `sub` nem teto absoluto diário.

**Melhoria Proposta**
> Adicionar `userQuotaLimiter` (Redis ou tabela `request_quota` no Postgres) chaveado por `req.user.sub` para as rotas de ingestão/eleição: N=3 runs/hora/usuário. Já existe `IngestLockBusyError` (409); expor no FE como botão desabilitado com countdown.

**Resultado Esperado**
> Usuário individual não consegue queimar fan-out Conexos do escritório inteiro. Métrica: cota = IP-only → IP + sub; 429 esperado por usuário > 3 runs/h.

**Métricas de sucesso**
- Cota por `sub` ativa nas 2 rotas: 0 → 2
- Botão de UI bloqueado por lock 409: não → sim

**Risco de não fazer**
> DoS lateral entre analistas + esgotamento do session pool Conexos (cron oficial passa a falhar).

**Dependências**: Nenhuma

---

### [security-6] Métricas + alarme de falha de autenticação e flood

**QA**: Security (cross-cuts Availability + Testability)
**Tactic alvo**: Detect Intrusion + Detect Service Denial
**Esforço**: M
**Findings**: F-security-6

**Problema**
> `auth.ts:167` só faz `console.warn` em JWT inválido. Sem agregação, sem alarme, sem painel — brute-force passa despercebido. Não há contador por IP/username no `/auth/login`.

**Melhoria Proposta**
> Emitir métrica (`auth.rejection`) com tags `{reason, ip, username?}`. Quando subir Sentry/Datadog/CloudWatch, alarmar em ≥ 20 falhas/5min/IP ou ≥ 5 falhas/5min/username. Aplicar `loginAttemptLimiter` específico em `/auth/login` (5/min/IP).

**Resultado Esperado**
> Tentativa de brute-force é detectada em ≤ 5min.

**Métricas de sucesso**
- Rate-limit dedicado de login: ausente → presente (5/min/IP)
- Alarme de falha de auth: 0 → 1

**Risco de não fazer**
> Brute-force silenciosa em horário noturno; descoberta só pós-incidente.

**Dependências**: stack de observabilidade

---

### [security-7] Revogação server-side de token (`signOut` real + denylist por `sub`)

**QA**: Security
**Tactic alvo**: Revoke Access
**Esforço**: M
**Findings**: F-security-7, F-security-4

**Problema**
> `signOut` no frontend só apaga o `localStorage`. O JWT continua válido por até 12h. Não há revogação granular — só rotação global do `AUTH_JWT_SECRET` invalida tudo.

**Melhoria Proposta**
> Criar tabela `app_session` com `(jti, sub, issued_at, revoked_at)`. `AuthService.signToken` inclui `jti` (UUID); middleware verifica `revoked_at IS NULL`. `signOut` server-side faz `UPDATE app_session SET revoked_at = now() WHERE jti = $jti`. Reduzir `TOKEN_EXPIRATION` para `2h` com refresh token de 12h.

**Resultado Esperado**
> Demissão/comprometimento revogados em ≤ 1min. Métrica: TTL efetivo 12h sem revogação → 2h com revogação ≤ 1min.

**Métricas de sucesso**
- Token revogável por `sub`: não → sim
- TTL nominal: 12h → 2h (+ refresh)

**Risco de não fazer**
> Insider que sai com token vivo executando ações até 12h.

**Dependências**: security-4 (cookie HttpOnly) idealmente antes

---

### [integrability-3] Quebrar `EleicaoPermutasService.executar` em sub-orquestradores

**QA**: Integrability (cross-cuts Modifiability — duplica modifiability-4)
**Tactic alvo**: Orchestrate + Manage Resource Coupling
**Esforço**: M
**Findings**: F-integrability-3

**Problema**
> Um service único orquestra 10 call-sites do `conexosClient.*` em sequência. Substituir o Conexos por outro ERP ou particionar leitura/escrita cascateia em 7 colaboradores. PR #4 piora o quadro.

**Melhoria Proposta**
> Extrair sub-serviços por fase do funil: `CandidatoFetcher` (Gate 1), `ElegibilidadeFetcher` (Gate 2/3), `VariacaoCambialFetcher`. Cada um recebe `conexosClient` por DI e expõe interface estável. `EleicaoPermutasService` vira composição linear sobre as 3 interfaces.

**Resultado Esperado**
> Service principal cai de 7 → 3 colaboradores; trocar `ConexosClient` por outro ERP toca apenas os 3 fetchers.

**Métricas de sucesso**
- Hits `conexosClient.` em `EleicaoPermutasService.ts`: 10 → 0
- Colaboradores `@inject` do `EleicaoPermutasService`: 7 → 4

**Risco de não fazer**
> Permutas Fatia 2 (write-side) duplica a orquestração.

**Dependências**: integrability-1 (transporte limpo)

---

### [integrability-6] Instrumentar métricas de integration health

**QA**: Integrability (cross-cuts Performance + Availability — CC-6)
**Tactic alvo**: Observability of integration failures
**Esforço**: M
**Findings**: F-integrability-6

**Problema**
> Falhas de integração são logadas em stdout (`console.log [CONEXOS ✗]`); zero agregação por endpoint, zero alerta proativo, MTTD de outage upstream é horas. PR #4 multiplicou chamadas Conexos por candidato — risco de pressão acima do `LOGIN_ERROR_MAX_SESSIONS` silenciado.

**Melhoria Proposta**
> (a) Trocar `console.log [CONEXOS ✗]` por `logService.error({type:'INTEGRATION_FAILURE', integration:'conexos', endpoint, status, durationMs, priCod})`. (b) Expor `/metrics` Prometheus no Express (lib `prom-client`) com counters `conexos_requests_total{endpoint,status}` e histogram `conexos_request_duration_seconds`. (c) Alerta no Slack em `error_rate > 5% por 5min`.

**Resultado Esperado**
> MTTD de drift Conexos: horas → minutos. Dashboard de cada endpoint na Frente I.

**Métricas de sucesso**
- Endpoints com counter Prometheus: 0 → 13
- Alerta error-rate configurado: ausente → presente
- `console.log [CONEXOS *]` calls: ~5 → 0

**Risco de não fazer**
> Permutas Fatia 1 em produção sem visibilidade; SISPAG (Nexxera) e Popula GED nascem cegos.

**Dependências**: integrability-1

---

### [performance-4] Deferir hidratação per-invoice `listTitulosAPagar` em `fetchInvoicesBatched`

**QA**: Performance
**Tactic alvo**: Increase Resource Efficiency
**Esforço**: M
**Findings**: F-performance-2

**Problema**
> PR #4 adicionou 1 `listTitulosAPagar` por invoice em aberto em `EleicaoPermutasService.ts:451-491` (dentro do fan-out de ingestão), para hidratar `valorMoedaNegociada` de TODAS as invoices (não só das casadas). Custo: ~500 chamadas Conexos extras por ingestão (5 filiais × ~100 invoices).

**Melhoria Proposta**
> Opções: (a) deferir hidratação para o momento em que a invoice é EXIBIDA na N:M (lazy via `GET /permutas/invoices/:docCod`); (b) cachear `valorMoedaNegociada` no `permuta_invoice` e re-hidratar só quando `stale=true`; (c) verificar com Conexos se existe variante batched do `com308/list` (priCods[]).

**Resultado Esperado**
> Chamadas Conexos por ingestão: ~1.115 → ~615 (-45%). Duração de ingestão estimada: ~90s → ~50s.

**Métricas de sucesso**
- Chamadas Conexos por ingestão: ~1.115 → ~615
- Duração de ingestão p95: ~90s → ~50s

**Risco de não fazer**
> Cada feature nova de hidratação multiplica o custo da ingestão linearmente; chega no MAX_SESSIONS.

**Dependências**: performance-7

---

### [testability-2] Extrair lógica testável de `app/permutas/page.tsx` para `lib/`

**QA**: Testability (cross-cuts Modifiability)
**Tactic alvo**: Limit Structural Complexity + Specialized Interfaces
**Esforço**: M
**Findings**: F-testability-2, F-testability-3

**Problema**
> O arquivo monstro contém `useTabelaFiltro` (hook genérico), `formatRunWhen` (timezone-aware), cálculo de `jaAlocadoInvoice`, distribuição greedy display — tudo testável, nada testado. Coverage real: 0% (e o jest config nem instrumenta).

**Melhoria Proposta**
> (1) Mover `formatRunWhen` para `lib/dates.ts` + teste com `Intl` fixado em UTC/BRT/JST. (2) Mover `useTabelaFiltro` para `lib/hooks/useTabelaFiltro.ts` + teste com `renderHook` cobrindo filtro/busca/paginação. (3) Mover cálculo de `jaAlocadoInvoice` para `lib/permutas/alocacaoMath.ts` puro.

**Resultado Esperado**
> `app/permutas/page.tsx`: 2127 LOC → ≤ 1400 LOC. Lógica extraída coberta a 100%.

**Métricas de sucesso**
- LOC do `page.tsx`: 2127 → ≤ 1400
- Testes para `useTabelaFiltro`/`formatRunWhen`/`jaAlocadoInvoice`: 0 → ≥ 12 cases
- Cobertura efetiva de FE: 16% → ≥ 50%

**Risco de não fazer**
> Cada `/feature-tweak` em permutas vira deploy às cegas; bug visual passa code review e quebra no demo.

**Dependências**: testability-3

---

### [testability-4] Introduzir `ClockProvider` injetável

**QA**: Testability (cross-cuts Modifiability)
**Tactic alvo**: Limit Non-Determinism
**Esforço**: M
**Findings**: F-testability-4

**Problema**
> 10 sítios em 5 services usam `new Date()` / `Date.now()` direto. Asserções sobre `durationMs`, `finishedAt`, "snapshot ≤ 24h" não podem ser exatas — só `expect.any(Number)`. Bug de cálculo de duração escapa.

**Melhoria Proposta**
> Criar `domain/libs/clock/ClockProvider.ts` (`@singleton @injectable`, método `now(): Date`). Refatorar `IngestaoPermutasService`, `EleicaoPermutasService`, `PainelService`, `AgingService`, `LogService` para receberem `ClockProvider` via DI. Nos testes, mockar com `{ now: () => new Date('2026-06-22T17:00:00Z') }`.

**Resultado Esperado**
> Asserções exatas de `durationMs` e `finishedAt`. Testes de "snapshot stale" determinísticos.

**Métricas de sucesso**
- `new Date()`/`Date.now()` em src/ (BE): 10 → 0
- Testes assertando `durationMs` exato: 0 → ≥ 5
- Suites com `useFakeTimers`: 0 → ≥ 5

**Risco de não fazer**
> Bug em `PainelService.ts:60` (snapshot age) só descoberto quando analista trabalhar com dado velho em produção; impacto financeiro direto.

**Dependências**: Nenhuma

---

### [testability-5] Gravar fixtures de payload do Conexos (Recordable Test Cases)

**QA**: Testability (cross-cuts Integrability)
**Tactic alvo**: Recordable Test Cases
**Esforço**: M
**Findings**: F-testability-5

**Problema**
> `ConexosClient.test.ts` (1342 LOC) monta payloads inline a cada teste. Sem `__fixtures__/`, mudanças de schema do `fin010` / `com298` só são percebidas em produção. Não há contrato versionável.

**Melhoria Proposta**
> Criar `domain/client/__fixtures__/conexos/` com `fin010-pendentes.json`, `fin010-baixados.json`, `com298-titulos.json` (sanitizados, ≤ 10 registros cada). Refatorar testes. Adicionar script `scripts/refresh-fixtures.ts` que regrava contra Conexos de dev.

**Resultado Esperado**
> Quando Conexos mudar um campo, atualizar 1 fixture quebra N testes na mesma direção → mudança óbvia. ConexosClient.test.ts encolhe.

**Métricas de sucesso**
- Fixtures gravadas: 0 → ≥ 3
- `ConexosClient.test.ts` LOC: 1342 → ≤ 800
- Tempo de adaptar a uma mudança de schema do Conexos: dias → ≤ 1h

**Risco de não fazer**
> SISPAG e Popula GED replicam o anti-padrão.

**Dependências**: Nenhuma

---

### [testability-6] Reativar integration tests com Postgres real para repositórios

**QA**: Testability (cross-cuts Fault Tolerance)
**Tactic alvo**: Sandbox
**Esforço**: M
**Findings**: F-testability-6

**Problema**
> `jest.config.cjs` ignora `*.integration.test.ts`, e nenhum arquivo existe. SQL ricos de `PermutaRelationalRepository` (524 LOC) e `PermutaSnapshotRepository` (320 LOC) só são validados via mock do pool. Sintaxe pode estar quebrada e o teste passa.

**Melhoria Proposta**
> (1) Criar `docker-compose.test.yml` com `postgres:16`. (2) Adicionar `npm run test:integration` que faz: `compose up → migrations → jest --testPathPattern='integration'` → `compose down`. (3) GH Actions job paralelo (`backend-integration`) usando `services: { postgres: image: postgres:16 }`. (4) Escrever 1 `*.integration.test.ts` por repository (5 mínimo).

**Resultado Esperado**
> Bug de SQL pego no CI antes do merge.

**Métricas de sucesso**
- Integration tests: 0 → ≥ 5 (1 por repository)
- Job CI `backend-integration` verde: ❌ → ✅

**Risco de não fazer**
> Bug em `UPDATE` da alocação (data loss financeiro) escapa para produção.

**Dependências**: testability-3

---

### [integrability-5] Extrair `AbstractAuthenticatedHttpClient`

**QA**: Integrability (cross-cuts Modifiability)
**Tactic alvo**: Abstract Common Services
**Esforço**: M
**Findings**: F-integrability-5, F-integrability-1

**Problema**
> `services/conexos.ts` tem 310 linhas de auth/login/mutex/401-retry/redaction sem abstração. Toda nova integração stateful (Nexxera SFTP, SharePoint Graph, GED upload) vai reimplementar do zero ou copy-paste.

**Melhoria Proposta**
> Criar `src/backend/domain/client/AbstractAuthenticatedHttpClient.ts` `@injectable abstract class` com: (1) `protected ensureAuth()` template-method, (2) `protected request(path, body, opts)` com 401-retry + `RetryExecutor` injetado, (3) `protected redactSensitive()` reutilizável, (4) `loginPromise` mutex genérico. Documentar em `ontology/integrations/_template.md`.

**Resultado Esperado**
> Criar um Client stateful novo custa ~30 LOC + schemas, não 150+.

**Métricas de sucesso**
- LOC de auth/retry/mutex em `services/conexos.ts`: 310 → 0 (deletado) + ~80 LOC em `AbstractAuthenticatedHttpClient`
- LOC estimado por novo client stateful: 150 → 30

**Risco de não fazer**
> 3 integrações novas (Nexxera, SharePoint, GED) pagam o débito 3 vezes — ~450 LOC extras evitáveis.

**Dependências**: integrability-1

---

### [availability-7] Introduzir circuit-breaker para o Conexos

**QA**: Availability (cross-cuts Modifiability)
**Tactic alvo**: Removal from Service / Reconfiguration
**Esforço**: M
**Findings**: F-availability-4

**Problema**
> Não há nenhum mecanismo para parar de bater no Conexos quando ele está claramente fora. Outage de 30min ⇒ 3 cron-runs falhando + N cliques de UI gerando lixo no log e ocupando o lock.

**Melhoria Proposta**
> Implementar um `CircuitBreakerExecutor` (irmão de `RetryExecutor`/`FallbackExecutor`) que abre após X falhas em janela Y, fica aberto Z segundos, half-open com 1 tentativa. Quando aberto, `EleicaoPermutasService.computeCandidatas` aborta cedo com `ConexosError` informativo.

**Resultado Esperado**
> Durante outage Conexos, fan-outs param em < 5s em vez de em ≥ 30s. Métrica de "circuito aberto por X minutos" alimenta o dashboard.

**Métricas de sucesso**
- Latência da chamada Conexos durante outage: ~120s (3 timeouts × 40s) → < 5s
- Cron-runs falhados durante outage prolongado: 3 ineficazes → 0–1 + 1 alerta

**Risco de não fazer**
> Outage do Conexos vira outage compartilhado.

**Dependências**: availability-2

---

### [modifiability-5] Quebrar `ConexosClient` (1432 LOC) em clients por bounded context

**QA**: Modifiability (cross-cuts Integrability)
**Tactic alvo**: Split Module
**Esforço**: L
**Findings**: F-modifiability-5

**Problema**
> `ConexosClient` agrega auth (`_doLogin` cogn. 20), read-processos (imp021), read-financeiro (com298), read-titulos (com308), parse de moedas/datas, helpers. 1432 LOC. Cogn. complexity 24 em `mapDocPagar`. Fase 3 (write-back fin010) e Frente II (SISPAG via com298 write) vão crescer esse arquivo.

**Melhoria Proposta**
> Extrair `ConexosAuthClient`, `ConexosProcessosClient`, `ConexosFinanceiroReadClient`, `ConexosFinanceiroWriteClient` (placeholder para Fase 3). `ConexosClient` mantido como facade backward-compat (para o adapter legacy) ou eliminado.

**Resultado Esperado**
> Nenhum client > 500 LOC. Auth e read-financeiro evoluem independentes. Fase 3 ganha um arquivo dedicado.

**Métricas de sucesso**
- LOC max client: 1432 → ≤ 500
- Cogn. complexity max: 24 → ≤ 15

**Risco de não fazer**
> Fase 3 fica ainda mais cara; toda mudança em auth carrega risco de quebrar reads.

**Dependências**: Nenhuma; idealmente antes da Fase 3

---

### [security-8] Introduzir `tenantId` no JWT e cláusula de escopo nos repos

**QA**: Security (cross-cuts Deployability)
**Tactic alvo**: Separate Entities
**Esforço**: L
**Findings**: F-security-8

**Problema**
> `AuthUser` (`http/auth.ts:17`) não carrega `tenantId`. Repos (`ClienteFiltroRepository`, `PermutaAlocacaoRepository`) consultam tabelas sem filtro de tenant. Estado atual: monocliente. Quando o 2º cliente vier, a aplicação não sabe filtrar — vazamento entre tenants é inevitável.

**Melhoria Proposta**
> Adicionar `tenant_id` (NOT NULL com default) em todas as tabelas mutáveis. Estender `AuthUser` com `tenantId` lido do JWT. Criar `withTenant(client, sub)` wrapper que injeta `WHERE tenant_id = $tenant` em todas as queries. PatternGuardian falha se um repo novo não usar `withTenant`.

**Resultado Esperado**
> Aplicação multi-tenant-safe antes do 2º cliente. Métrica: 0/N queries com filtro de tenant → 100%.

**Métricas de sucesso**
- Queries com `tenant_id` filtrado: 0% → 100%
- JWT carregando `tenantId`: não → sim

**Risco de não fazer**
> 2º cliente entra e a refatoração vira urgente, com risco de descobrir leak depois da entrega.

**Dependências**: alinhamento de roadmap

---

### [fault-tolerance-6] Adicionar reconciliação periódica local ↔ Conexos `fin010` (gate Fase 3)

**QA**: Fault Tolerance
**Tactic alvo**: External↔Local Reconciliation
**Esforço**: L
**Findings**: F-fault-tolerance-7

**Problema**
> Não há job que confronte o que está em `permuta_alocacao` / `permuta_casamento` com a verdade do `fin010` (Conexos). Hoje (READ-ONLY) o impacto é nulo, mas a Fase 3 (write-back) não pode entrar em produção sem isso — divergência silenciosa = baixa dupla, dashboard mentiroso.

**Melhoria Proposta**
> Criar `src/backend/jobs/reconcile-permutas.ts` executado diariamente: para cada alocação com `executada_em IS NOT NULL`, reler o `fin010` da invoice e do adto e verificar se há registro de baixa correspondente; divergência → criar linha em `divergencia_reconciliacao` (a criar) com `tipo in ('local_sem_erp', 'erp_sem_local', 'valor_divergente')` para o analista resolver.

**Resultado Esperado**
> Toda divergência permanente entre local e ERP é visível em ≤24h. Job exit code = nº divergências para alertas. Pré-requisito de produção para Fase 3.

**Métricas de sucesso**
- Jobs de reconciliação: 0 → 1
- Tabela `divergencia_reconciliacao`: ausente → presente

**Risco de não fazer**
> Fase 3 não pode subir; quando subir sem isso, expõe Columbia a baixas duplas silenciosas e auditoria fica cega.

**Dependências**: Definição das chaves canônicas no `fin010`

---

## P2 — Médio

### [availability-5] Health endpoint readiness com check DB + (opcional) Conexos

**QA**: Availability
**Tactic alvo**: Self-Test
**Esforço**: S
**Findings**: F-availability-6

**Problema**
> `GET /health` retorna 200 mesmo com pool Postgres morto, migrations pendentes ou Conexos fora. Render usa isso como readiness probe → não tira o serviço de rotação na falha de dependência.

**Melhoria Proposta**
> Split em `/health` (liveness) e `/ready` (readiness — `SELECT 1` no pool + opcional probe leve no Conexos com timeout curto e cache de 30s). `/ready` retorna 503 quando dependência crítica falha. Configurar Render para usar `/ready` como readiness e `/health` como liveness.

**Resultado Esperado**
> Render reinicia/desmarca o serviço automaticamente em falha de DB.

**Métricas de sucesso**
- Endpoints de health: 1 → 2 (liveness + readiness)
- Auto-recovery em falha de DB: manual → automático

**Risco de não fazer**
> Outage de DB vira ticket de suporte em vez de auto-cura.

**Dependências**: Nenhuma

---

### [availability-6] Classificar retry por tipo de erro + backoff exponencial para Conexos

**QA**: Availability
**Tactic alvo**: Retry
**Esforço**: S
**Findings**: F-availability-3

**Problema**
> `ConexosClient` usa `RetryExecutor` com `shouldRetry` default (`() => true`) — retenta 4xx semânticos. Delay fixo 500ms + jitter 200ms causa thundering-herd light em 50 workers concorrentes. Para 401, o retry imediato sem `login()` desperdiça as 2 tentativas.

**Melhoria Proposta**
> (1) `shouldRetry` específico para Conexos — só retenta 5xx, ECONNRESET, ETIMEDOUT; 4xx propaga imediatamente (exceção: 401 → forçar `legacy.ensureSid()` com `sessionToKill` antes do retry). (2) Backoff exponencial com cap: 500ms, 2s, cap 5s + jitter.

**Resultado Esperado**
> Picos de 504 no Conexos não amplificam; 401 recupera sessão na 1ª tentativa; ataques de thundering-herd reduzidos.

**Métricas de sucesso**
- Retries gastos em 4xx semânticos: 2 por erro → 0
- Janela de pico de retry: 700ms → 500ms + 2s + 5s

**Risco de não fazer**
> Cada outage do Conexos é amplificado pelo nosso próprio retry pattern.

**Dependências**: availability-2

---

### [fault-tolerance-7] Quarentenar invoices com falha de detalhe

**QA**: Fault Tolerance
**Tactic alvo**: Quarantine + Sanity Checking
**Esforço**: S
**Findings**: F-fault-tolerance-5

**Problema**
> Em `EleicaoPermutasService.ts:478` e `:721-723`, falha no `listTitulosAPagar` da INVOICE é silenciada com `catch {}` — sem motivo nomeado, sem telemetria, invoice aparece sem valor negociado. A PROFORMA tem tratamento explícito (`DETAIL_INDISPONIVEL`); a invoice não.

**Melhoria Proposta**
> Adicionar `MOTIVO_BLOQUEIO.INVOICE_DETAIL_INDISPONIVEL` e roteamento equivalente ao da proforma: invoice cuja com308 falhar fica num estado "quarentenado nomeado". Emitir contador `business_warn` no `logService`.

**Resultado Esperado**
> Cascata Conexos→com308 fora do ar fica visível em logs e na tela. Analista vê motivo claro.

**Métricas de sucesso**
- Catch silencioso em path de hidratação financeira: 5 → ≤2
- Motivos de bloqueio nomeados para falha externa: 1 → ≥2

**Risco de não fazer**
> Incidente "tudo aparece vazio" demora pra ser detectado em produção.

**Dependências**: Nenhuma

---

### [integrability-4] Universalizar Zod no boundary de TODOS os readers Conexos

**QA**: Integrability
**Tactic alvo**: Encapsulate (validate at boundary) + Contract testing
**Esforço**: S
**Findings**: F-integrability-4

**Problema**
> Apenas 2 dos 9 readers Conexos validam o wire com Zod (`listAdiantamentosProforma`, `listDeclaracaoByProcesso`). Os outros 7 (incluindo `getDetalheTitulos`) confiam em `String(row.docCod ?? '')` — corrupção silenciosa. `com308RowSchema` está definido e nunca importado.

**Melhoria Proposta**
> Adicionar schemas Zod faltantes (`com308DetailSchema`, `com298DetailSchema`, `com308BaixaSchema`, `imp021RowSchema`) em `domain/client/permutas/conexosPermutasSchemas.ts` e plugar `.parse(row)` no início de cada mapper. Falha de parse → `ConexosError('CONEXOS_SCHEMA_DRIFT', {endpoint, docCod})` (novo code).

**Resultado Esperado**
> Drift de shape vira erro tipado loud, não corrupção silenciosa.

**Métricas de sucesso**
- % readers com Zod no boundary: 22% (2/9) → 100% (9/9)
- `ConexosError` codes: 2 → 3 (`CONEXOS_SCHEMA_DRIFT`)
- Schemas órfãos: 1 → 0

**Risco de não fazer**
> PR-style ampliações propagam o problema; um Conexos lento devolve `docCod: undefined` e o painel mostra candidatos fantasma.

**Dependências**: Nenhuma

---

### [modifiability-8] Externalizar magic numbers de fan-out/lock via `EnvironmentProvider`

**QA**: Modifiability (cross-cuts Deployability)
**Tactic alvo**: Defer Binding (configuration files)
**Esforço**: S
**Findings**: F-modifiability-8

**Problema**
> 5 constantes top-level (`PAGE_SIZE=500`, `MAX_PAGES=50`, `FILIAIS_CONCURRENCY=5`, `ADIANTAMENTOS_CONCURRENCY=10`, `INGEST_LOCK_KEY=918273645`) são hardcoded em services. Qualquer tuning operacional exige novo deploy via Render hook.

**Melhoria Proposta**
> Estender `EnvironmentProvider` com `getPermutasIngestConfig(): { pageSize, maxPages, filiaisConcurrency, adiantamentosConcurrency, lockKey }` (defaults atuais; lê de env var `PERMUTAS_PAGE_SIZE`, etc.). Injetar nos services via construtor. Documentar em `docs-contexto/configuracao.md`.

**Resultado Esperado**
> Tuning operacional possível sem redeploy via variável de ambiente Render.

**Métricas de sucesso**
- Magic numbers configuráveis hardcoded: 5 → 0
- Documentação `configuracao.md`: nova entrada

**Risco de não fazer**
> Cada janela de fechamento apertada exige redeploy não-trivial.

**Dependências**: Nenhuma

---

### [performance-6] Mover advisory lock para ANTES do fan-out Conexos da ingestão

**QA**: Performance
**Tactic alvo**: Bound Execution Times + Schedule Resources
**Esforço**: S
**Findings**: F-performance-8

**Problema**
> `IngestaoPermutasService.executar` chama `computeCandidatas` (fan-out completo Conexos, ~30-90s) ANTES de tentar pegar o `INGEST_LOCK_KEY`. Se outro processo já segura o lock, pagamos todo o custo Conexos para depois descobrir que era trabalho em vão.

**Melhoria Proposta**
> Usar `databaseClient.withAdvisoryLock(INGEST_LOCK_KEY, ..., onBusy)` envolvendo o `computeCandidatas` — exatamente como já faz `EleicaoPermutasService.executar` com a idempotency key. Quando o lock está ocupado, devolver 409 imediato sem disparar Conexos.

**Resultado Esperado**
> Em ingestões concorrentes (cron + manual ou 2 manuais), apenas 1 fan-out Conexos é disparado por janela.

**Métricas de sucesso**
- Chamadas Conexos desperdiçadas em concorrência: ~1000 por evento → 0
- Tempo de resposta do segundo `POST /ingestao` concorrente: ~90s + 409 → ≤ 200ms + 409

**Risco de não fazer**
> Cada onda de cliques + cron simultâneo paga 2-3× o custo Conexos.

**Dependências**: cc-auto-ingest-coalesce reduz o evento, mas não substitui esse ajuste

---

### [security-9] CI gate `npm audit --audit-level=high` em backend e frontend

**QA**: Security
**Tactic alvo**: Limit Exposure
**Esforço**: S
**Findings**: F-security-9

**Problema**
> `npm audit` revela: backend 20 moderate + 1 low; frontend 1 high (ws via jsdom — dev) + 21 moderate. O alto ruído de dev-deps esconde futuras vulns de prod; CI não falha em vuln nova.

**Melhoria Proposta**
> Adicionar step no GitHub Actions: `npm audit --omit=dev --audit-level=high` (falha se vuln high+ em prod). Para dev, rodar `--audit-level=critical` separadamente (warn). Atualizar `jest`, `ts-jest`, `axios` (backend) para reduzir o ruído moderate.

**Resultado Esperado**
> Pipeline falha em qualquer vuln high+ em deps de prod.

**Métricas de sucesso**
- CI step `npm audit`: ausente → presente em backend e frontend
- High em prod: monitorado e bloqueante

**Risco de não fazer**
> CVE crítica em axios/express/jose passa um ciclo sem ninguém notar.

**Dependências**: Nenhuma

---

### [deployability-6] Subir floor de cobertura FE

**QA**: Deployability
**Tactic alvo**: Manage Deployment Pipeline — Test Harness
**Esforço**: M
**Findings**: F-deployability-6

**Problema**
> FE jest floor está em branches 40 / functions 55 — abaixo do que a literatura considera defensável para um app com lógica de filtro/alocação. Foi rebaixado em commit `cdb34f3`.

**Melhoria Proposta**
> Identificar componentes de menor cobertura via `coverage/lcov-report`; testar fluxos de alocação manual (Fase 2 de Permutas) e cliente-filtro. Subir floor progressivamente.

**Resultado Esperado**
> Floor FE: branches 40 → 60, functions 55 → 70 em 2 sprints.

**Métricas de sucesso**
- FE branches floor: 40 → 60
- FE functions floor: 55 → 70

**Risco de não fazer**
> Regressões silenciosas em UI de Permutas erodem confiança do analista.

**Dependências**: testability-3

---

### [deployability-7] Escrever runbook em `docs/runbooks/` para top-4 modos de falha

**QA**: Deployability (cross-cuts Availability)
**Tactic alvo**: Deployment observability
**Esforço**: M
**Findings**: F-deployability-7

**Problema**
> Não há runbook. Os 4 modos óbvios — DB down, Conexos down, advisory lock travado, migration falhou no preDeploy — não têm playbook documentado.

**Melhoria Proposta**
> Criar `docs/runbooks/{db-down.md, conexos-down.md, ingest-stuck.md, migration-failed.md}` com: sintoma, diagnóstico (queries/curl), mitigação, comando de rollback (referencia deployability-2).

**Resultado Esperado**
> MTTR para os 4 cenários reduz para ≤ 15 min; operador noturno autossuficiente.

**Métricas de sucesso**
- Runbooks publicados: 0 → 4
- Cobertura de modos de falha conhecidos: 0% → 100% dos 4 principais

**Risco de não fazer**
> Cada incidente vira investigação ad-hoc; conhecimento fica em mensagens de Slack.

**Dependências**: deployability-2

---

### [deployability-8] Introduzir feature flags para ativação de frentes (SISPAG, Popula GED)

**QA**: Deployability (cross-cuts Modifiability)
**Tactic alvo**: Manage Deployment Pipeline — Scale Rollouts
**Esforço**: M
**Findings**: F-deployability-8

**Problema**
> Hoje todas as rotas Permutas estão montadas em `index.ts:81-88`; sem flag. Roadmap de 3 frentes precisa deployar uma de cada vez. Sem flag, ou se deploya tudo, ou se gerencia branches longos.

**Melhoria Proposta**
> `EnvironmentProvider.featureFlags()` lê `FEATURE_SISPAG`, `FEATURE_POPULA_GED` de env. `index.ts` monta routers condicionalmente; `ingest-*` jobs verificam flag antes de rodar.

**Resultado Esperado**
> Cada frente futura pode estar em `main` em estado "dark"; operador habilita por env var sem novo deploy.

**Métricas de sucesso**
- Feature flags ativos: 0 → ≥ 2 (sispag, popula_ged)

**Risco de não fazer**
> SISPAG e Popula GED competem com Permutas pelo mesmo deploy window.

**Dependências**: Nenhuma

---

### [fault-tolerance-8] Tabela `audit_event` cross-entidade

**QA**: Fault Tolerance (cross-cuts Security)
**Tactic alvo**: Audit Trail
**Esforço**: M
**Findings**: F-fault-tolerance-8

**Problema**
> Cada entidade carrega seu campo de "quem" + `updated_at`, mas não há trilha unificada que responda "tudo que aconteceu com o adto X em ordem cronológica" sem UNION ALL de 4 tabelas. Investigar incidente vira arqueologia.

**Melhoria Proposta**
> Criar migration `0015_audit_event` com (id uuid, entity_type, entity_key, actor, action, payload jsonb, occurred_at) e helper `AuditService.record(...)` chamado em CADA mutação. Gravar dentro da mesma transação da mutação.

**Resultado Esperado**
> Query única `SELECT * FROM audit_event WHERE entity_key = $1 ORDER BY occurred_at` reconstitui história completa.

**Métricas de sucesso**
- Tabela `audit_event`: ausente → presente
- Callsites mutativos com record audit: 0 → 100% (5+ pontos)

**Risco de não fazer**
> Investigação de incidente em prod fica lenta; compliance demanda trilha unificada quando a Fase 3 entrar.

**Dependências**: Nenhuma; preferencialmente antes da Fase 3

---

### [performance-8] Adicionar `LIMIT` defensivo + paginar no frontend

**QA**: Performance (cross-cuts Modifiability)
**Tactic alvo**: Bound Queue Sizes
**Esforço**: M
**Findings**: F-performance-6, F-performance-7

**Problema**
> `GestaoPermutasService.exporGestao` faz `Promise.all` de 7 `selectMany` sem `LIMIT`. Hoje funciona porque o backlog Columbia é pequeno; cresce linearmente sem teto.

**Melhoria Proposta**
> Adicionar `LIMIT $1` (default 10.000) com `WARN` no `LogService` quando o limit é atingido. Para a UX, paginar no frontend usando o `useTabelaFiltro`.

**Resultado Esperado**
> Volume máximo retornado em 1 request: ilimitado → 10.000 rows × 5 listas. Memory peak Node por request: hoje O(backlog) → O(10k).

**Métricas de sucesso**
- `selectMany` sem LIMIT em path chamável por API: 5 → 0
- Memory peak por `GET /gestao`: O(backlog) → O(10k)
- Payload `/gestao` p95: livre → ≤ 1 MB

**Risco de não fazer**
> Produto não comporta multi-tenant; primeira Columbia grande quebra o painel.

**Dependências**: performance-7

---

### [testability-7] Quebrar test files > 500 LOC por método público

**QA**: Testability
**Tactic alvo**: Limit Structural Complexity
**Esforço**: M
**Findings**: F-testability-7, F-testability-8

**Problema**
> 5 test files > 500 LOC. `ConexosClient.test.ts` (1342), `EleicaoPermutasService.test.ts` (908), `routes/permutas.test.ts` (659). `AlocacaoPermutasService.test.ts` tem 1 único `describe` para 3 métodos públicos.

**Melhoria Proposta**
> Para cada service com > 1 método público, criar 1 `describe` por método. Quando o test file passar de 500 LOC, splittar por método em arquivos separados. Combinar com testability-5 que automaticamente encolhe `ConexosClient.test.ts`.

**Resultado Esperado**
> `--testNamePattern "alocar"` filtra com precisão. Triagem de failure → método é instantânea.

**Métricas de sucesso**
- Test files > 500 LOC: 5 → 0
- `describe`/método público ratio: ~0.3 → 1.0

**Risco de não fazer**
> Onboarding de novo dev fica em 2 dias por feature.

**Dependências**: testability-5

---

## P3 — Baixo

### [availability-8] Contar e expor hidratação parcial (`com308`) por run

**QA**: Availability
**Tactic alvo**: Monitor / Exception Detection
**Esforço**: S
**Findings**: F-availability-8

**Problema**
> 4 catches silenciosos em hidratação Conexos seguem com a candidata mas SEM `valorMoedaNegociada/moedaNegociada/taxa`. Trilha de auditoria não diferencia "10% das linhas perderam dado" de "outage Conexos parcial".

**Melhoria Proposta**
> Contador local na execução, incrementado em cada catch; gravado no cabeçalho `permuta_eleicao_run` (coluna nova `hidratacao_parcial_count INT` ou dentro de um jsonb `metrics`). `LogService.warn` ao final da run quando o contador > threshold.

**Resultado Esperado**
> Toda run carrega `hidratacaoParcialCount`; operador detecta degradação parcial sem precisar correlacionar logs manualmente.

**Métricas de sucesso**
- Runs com hidratação parcial visíveis na trilha: 0 → 100%
- Tempo p/ identificar outage parcial do Conexos: "nunca" → < 30min

**Risco de não fazer**
> Relatórios financeiros subestimam variação cambial silenciosamente.

**Dependências**: availability-2

---

### [integrability-7] Consolidar `AuthProvider.tsx:53` no wrapper `lib/api.ts`

**QA**: Integrability
**Tactic alvo**: Restrict Communication Paths
**Esforço**: S
**Findings**: F-integrability-7

**Problema**
> 12/13 chamadas frontend → backend usam `lib/api.ts`; a 13ª (`AuthProvider.tsx:53` `/auth/login`) duplica a constante `API` e bypassa o wrapper.

**Melhoria Proposta**
> Mover a chamada `/auth/login` para uma função `signIn(username, password)` em `lib/api.ts`; `AuthProvider` importa.

**Resultado Esperado**
> 100% das chamadas FE→BE no wrapper; mudança de header default acontece em 1 lugar.

**Métricas de sucesso**
- `grep "fetch(" src/frontend ... | grep -v lib/api.ts | wc -l`: 1 → 0

**Risco de não fazer**
> Padrão quebrado convida réplicas; baixo risco, mas alta facilidade de cura.

**Dependências**: Nenhuma

---

### [performance-7] Instrumentar `durationMs` por chamada Conexos no `LogService`

**QA**: Performance (cross-cuts Integrability)
**Tactic alvo**: Maintain Multiple Copies of Computations (precondição para tuning)
**Esforço**: S
**Findings**: F-performance-9, F-performance-2, F-performance-5

**Problema**
> Não há baseline numérico de p50/p95 por endpoint Conexos. Decisões de concorrência e timeout são chute. Regressões como F-performance-2 só são pegas por relato de usuário.

**Melhoria Proposta**
> Wrapper único no `axios.interceptors.response` do `ConexosClient` que mede `Date.now() - startedAt` e chama `logService.info({ type: 'CONEXOS_CALL', data: { endpoint, durationMs, status, flowId } })`. Render captura o log; o número agrega externamente.

**Resultado Esperado**
> p50/p95 por endpoint visíveis na trilha de logs. Base para calibrar timeout, concorrência e detectar regressão de PR #4 antecipadamente.

**Métricas de sucesso**
- Endpoints Conexos instrumentados: 0 → 8
- Linhas de log com durationMs por chamada: 0 → 100%

**Risco de não fazer**
> Ficamos cegos para regressões de performance.

**Dependências**: Nenhuma; precondição para o restante

---

### [testability-8] Property-based testing para invariantes monetários

**QA**: Testability
**Tactic alvo**: Executable Assertions
**Esforço**: S
**Findings**: F-testability-9

**Problema**
> Regras financeiras críticas testadas só por casos curados: greedy de `IngestaoPermutasService` (1408 case), alocação N:M com `saldoRestante`. Bug de arredondamento / off-by-one (afeta dinheiro) escaparia. `fast-check` não está sequer instalado.

**Melhoria Proposta**
> `npm i -D fast-check`. Escrever ≥ 3 properties: (a) `∀ alocações: Σ valorParcial ≤ adto.valorTotal`; (b) `∀ runs greedy(N): jaAlocado + saldoRestante = valorTotal`; (c) `∀ permutações de invoices: greedy é idempotente`.

**Resultado Esperado**
> Bug aritmético em dinheiro detectado por geração automática de cases.

**Métricas de sucesso**
- Properties escritas: 0 → ≥ 3
- `fast-check` instalado: ❌ → ✅

**Risco de não fazer**
> Bug financeiro detectável estatisticamente passa por casos curados.

**Dependências**: Nenhuma

---

### [modifiability-9] Estabelecer padrão de modularização por bounded context antes de SISPAG/GED

**QA**: Modifiability
**Tactic alvo**: Use an Intermediary + Restrict Dependencies
**Esforço**: S (ADR + esqueleto)
**Findings**: F-modifiability-9

**Problema**
> Hoje tudo da Frente I é hub-and-spoke em `routes/permutas.ts`. Não há padrão arquitetural declarado para como Frente II (SISPAG) e Frente III (GED) vão coexistir.

**Melhoria Proposta**
> Criar ADR-0011 "Modularização por bounded context (Permutas / SISPAG / Popula GED)" decidindo (1) `src/backend/routes/<frente>/index.ts` por frente, (2) `domain/service/<frente>/`, `domain/repository/<frente>/`, (3) o que é compartilhado fica em `src/backend/domain/shared/`. Espelhar no frontend.

**Resultado Esperado**
> Quando SISPAG começar, há padrão claro. Cross-frente compartilha apenas via `shared/`.

**Métricas de sucesso**
- ADR-0011 publicado e validado
- Regra PatternGuardian: imports cross-frente fora de `shared/` = 0

**Risco de não fazer**
> Time-to-market da Frente II maior; débito arquitetural se propaga por 3 frentes.

**Dependências**: modifiability-7

---
