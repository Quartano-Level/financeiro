---
type: regis-review-kanban
run_id: 2026-07-18-1618-sispag-frente-ii
total_original: 55
total_unique_after_merge: 53
counts: { p0: 1, p1: 19, p2: 25, p3: 8 }
merges:
  - id: xqa-conexos-timeout
    absorbs: [performance-3, fault-tolerance-7]
    reason: "Cards literalmente idênticos (adicionar timeout no axios do Conexos). Cita ambas as origens QA."
  - id: fault-tolerance-3
    absorbs: [availability-4]
    reason: "fault-tolerance-3 é superset — availability-4 (advisory lock + ledger) está totalmente contido; fault-tolerance-3 adiciona status BAIXADO + migration 0033."
---

# Kanban — SISPAG (Frente II) — 2026-07-18-1618-sispag-frente-ii

> Importável para o Kanban do time. Cada card abaixo já tem Problema / Melhoria Proposta / Resultado Esperado (pt-BR).
> Ordem: P0 (S → XL), depois P1, P2, P3. Dentro de cada bloco, esforço crescente.
> Tactics em inglês; identificadores de código em inglês; conteúdo em pt-BR.

---

## P0 — Crítico

### [fault-tolerance-1] Blindar migração 0030 (e futuras destrutivas) com env-gate e política de snapshot

**QA**: Fault Tolerance (cross: Deployability)
**Tactic alvo**: Increase Competence Set
**Esforço**: S
**Findings**: F-fault-tolerance-1

**Problema**
> `0030_remove_internacional.sql` faz `DELETE` em 3 tabelas + `DROP COLUMN` em 2, protegido apenas por `IF EXISTS` (idempotência entre re-runs), sem gate de ambiente nem exigência de snapshot. Se rodada contra a base errada em deploy misconfigured, a perda é irrecuperável (sem PITR configurado no Supavisor).

**Melhoria Proposta**
> Adicionar preambulo `DO $$ ... IF current_database() NOT IN ('financeiro_hml','financeiro_prod') THEN RAISE EXCEPTION ... END IF; END $$` em toda migração com DELETE massivo/DROP COLUMN. Instituir política: PR de migração destrutiva exige (a) `pg_dump` linkado no PR, (b) rodada em HML primeiro com diff quantitativo, (c) revisor humano diferente do autor. Documentar em `docs/migrations-runbook.md`. Tactic Bass = *Increase Competence Set*.

**Resultado Esperado**
> Migrações destrutivas param se rodadas fora do allowlist. Runbook publicado. Métrica: 0 → 100% das migrations com `DELETE`/`DROP` protegidas por env-gate.

**Métricas de sucesso**
- Migrations destrutivas com env-gate: 0/1 → 1/1
- Runbook publicado: não → sim

**Risco de não fazer**: 1 deploy misconfigured = perda irreversível de rastro histórico + retrabalho contábil semanas.
**Dependências**: nenhuma

---

## P1 — Alto

### [deployability-2] Envolver cada arquivo de migração em transação atômica no runner

**QA**: Deployability
**Tactic alvo**: Idempotent Deploys
**Esforço**: S
**Findings**: F-deployability-2

**Problema**
> `runMigrations.ts` chama `insert(sql)` sem `withTransaction`. Se a migração 0030 falhar entre o `DELETE FROM titulo_a_pagar` e o `DROP COLUMN`, o DB fica meio-migrado sem entrada em `schema_migrations`; próxima re-run passa nos guards `IF EXISTS` mas os dados já deletados não voltam. `PostgreeDatabaseClient` já tem `withTransaction` (linhas 105-120) — o runner só não usa.

**Melhoria Proposta**
> Refatorar `runMigrations.ts:44-50` para envolver cada arquivo em `databaseClient.withTransaction(async (tx) => { await tx.insert(sql); await tx.insert('INSERT INTO schema_migrations ...') })`. Assim `schema_migrations` é gravado no MESMO commit dos DDLs/DMLs — ou tudo ou nada. Adicionar teste que simula um erro DDL no meio de um arquivo e verifica que `schema_migrations` não foi gravado.

**Resultado Esperado**
> Falha parcial numa migração destrutiva deixa DB no estado pré-migração + falha do deploy no `preDeployCommand`. Operador pode simplesmente re-deployar (sem restore). Cobertura de teste do runner: 0 → 1 caso de falha atômica.

**Métricas de sucesso**
- Migrações executadas em transação: 0/7 (SISPAG) → 7/7 (100%)
- Testes do runner cobrindo falha parcial: 0 → 1

**Risco de não fazer**: se 0030 tivesse falhado no `DROP COLUMN` real (por lock), o operador estaria com dados internacionais deletados sem trilha e sem forma de re-rodar limpo.
**Dependências**: nenhuma

---

### [xqa-conexos-timeout] (merge: performance-3 + fault-tolerance-7) Timeout duro por chamada axios Conexos

**QA**: Performance + Fault Tolerance (cross: Availability)
**Tactic alvo**: Bound Execution Times / Timeout
**Esforço**: S
**Findings**: F-performance-4, F-fault-tolerance-7, F-availability-6

**Problema**
> O axios legacy do `services/conexos.ts` tem `timeout: 40000` fixo, sem knob por endpoint; `postGenericOnce`/`postMultipartOnce` em `ConexosSispagWriteClient`/`ConexosSispagRetornoClient` herdam o default axios (∞) porque rodam por caminho ligeiramente distinto. O `RetryExecutor` só limita tentativas; um Conexos travado + 2 retries pode segurar um request por 90s — muito além do timeout HTTP do Render (~30s → 504) e além do pool DB (max=5). Mesmo padrão do P1 já conhecido em Permutas "Executar Lote".

**Melhoria Proposta**
> Adicionar `axios.create({ timeout: 10_000 })` no `services/conexos.ts` (afeta reads); padronizar `timeout: 60_000` em `postGenericOnce`/`postMultipartOnce` no `legacyConexosAdapter` (afeta writes irreversíveis); expor via param opcional para caller sobrescrever. Parametrizar via `CONEXOS_HTTP_TIMEOUT_MS` no `EnvironmentProvider`. No `SispagPainelService.montarPainel/listRetornos`, adicionar orçamento total (`AbortSignal.timeout(15_000)`) e degradar para cache stale se estourar (compõe com performance-2). Escrever teste com servidor mock que não responde.

**Resultado Esperado**
> Tempo máximo de bloqueio por chamada outbound Conexos: ∞ → 10s (read) / 60s (write). Zero 504 no Render em janela de degradação Conexos com p99 ≤ 5s. POST pendurado é abortado em 60s → escrita irreversível fica em "estado desconhecido" (ledger `pending`, reconciliação manual) mas não empata processo.

**Métricas de sucesso**
- Timeout por chamada read: ∞/40s → 10s (env-driven)
- Métodos Conexos SISPAG com timeout explícito: 0/5 → 5/5
- Latência máxima real (com 2 retries): ∞ → ~32s + fallback cache stale ≤ 500ms

**Risco de não fazer**: 1 blip Conexos derruba o SISPAG inteiro por saturação do dyno. Já observado em Permutas.
**Dependências**: nenhuma. Cross-liga com availability-5 (que também parametriza timeout + adiciona /health/deep).

---

### [integrability-1] Adotar Zod no boundary do `ConexosSispagRetornoClient` (fin052)

**QA**: Integrability (cross: Fault Tolerance, Security)
**Tactic alvo**: Adhere to Standards
**Esforço**: S
**Findings**: F-integrability-1

**Problema**
> Os 5 map fns do retorno client (`mapArquivo`, `listDetalhe`, `listErros`, `listConfigsRetorno`, `carregarArquivoRetorno`) usam `Number()`/`String()` sobre `Record<string, unknown>` sem schema Zod. Um rename no `fin052` vira `NaN` silencioso, corrompendo o pipeline de retorno (falso "0 baixas").

**Melhoria Proposta**
> Criar `arquivoRetornoRowSchema`, `arquivoRetornoDetalheRowSchema`, `arquivoRetornoErroRowSchema`, `retornoConfigRowSchema` espelhando os schemas OpenAPI (`GerArquivosRetorno`, `GerArquivosRetDet`, `GerArquivosRetornoErro`, `GerRetornoBancos`) em `docs/conexos-api/090-fin0.json`. Aplicar `passthrough()` + `.catch()` por campo — mesmo padrão de `ConexosSispagClient.tituloRowSchema`.

**Resultado Esperado**
> Paridade de adoção Zod entre os 3 clients SISPAG. Drift do fin052 detectado como `undefined` (mapeamento gracioso) em vez de `NaN` (corrupção). Métrica: 0% → 100% dos map fns retorno com schema Zod.

**Métricas de sucesso**
- Schemas Zod no retorno client: 0 → 4
- Testes de drift (rename campo → `undefined`, não `NaN`): 0 → 4 casos

**Risco de não fazer**: quando `RetornoOrquestracaoService` ligar em prod (Fatia 3), a única detecção de rename será "arquivo processed com 0 baixas" — investigação manual por incidente.
**Dependências**: nenhuma; independente da ativação do fluxo.

---

### [performance-2] Cache in-memory por instância para `GET /sispag/painel` (TTL 30–60s)

**QA**: Performance (cross: Availability)
**Tactic alvo**: Maintain Multiple Copies of Computations
**Esforço**: S
**Findings**: F-performance-2

**Problema**
> Cada abertura/refresh de `/sispag` reconstrói o painel do zero: fan-out `listLotes` por filial (N chamadas Conexos) + 3 leituras DB. Não há memoização em nenhuma camada. Cinco analistas abrindo simultaneamente = 5×N chamadas Conexos em ~10s.

**Melhoria Proposta**
> Cachear o `SispagPainelResponse` em `SispagPainelService` por chave `latestRunFinishedAt` (ou timestamp de round(now/60s)) com TTL de 30s. Invalidar imediatamente após `POST /sispag/ingestao`, `POST /sispag/lotes/*` e `POST /sispag/lotes/formar`. Cross-QA com qa-availability (aumenta MTBF durante blip Conexos).

**Resultado Esperado**
> Hits com cache warm respondem sem tocar Conexos. p95 `/sispag/painel` cai de estimados 3–5s para ≤ 200ms quando cached; miss rate ≤ 50% em horário de pico.

**Métricas de sucesso**
- Cache hit-rate ≥ 50% em horário de pico
- p95 latência `/sispag/painel` (cache hit): → ≤ 200ms
- Chamadas Conexos por hit cached: N → 0

**Risco de não fazer**: pico das 08h continua a punir o Conexos e o analista.
**Dependências**: nenhuma; melhora ainda mais se combinado com performance-4.

---

### [performance-4] Cache do `listRetornos` (metadado ger015 + arquivos por (fil, cfg))

**QA**: Performance
**Tactic alvo**: Reduce Overhead
**Esforço**: S
**Findings**: F-performance-3

**Problema**
> `listRetornos` faz N + Σ configs chamadas Conexos por hit (24 chamadas com 8 filiais × 2 configs), sem cache. `ger015` (metadado de layout de retorno) muda raríssimo — cachear por hora traria enorme redução.

**Melhoria Proposta**
> Cachear `listConfigsRetorno` no `ConexosSispagRetornoClient` in-memory por `filCod` com TTL 1h; cachear `listArquivosRetorno` por chave `(filCod, bncCod, gtbCodSeq)` com TTL 30s. Alternativa: mover parte do listing para uma ingestão periódica (mesma doutrina do `titulo_a_pagar`).

**Resultado Esperado**
> Cache warm: 24 chamadas → 0. Cache cold: 24 → mesmo, mas com `AbortSignal.timeout` (xqa-conexos-timeout) evita horrores.

**Métricas de sucesso**
- Chamadas Conexos por hit `/sispag/retornos` (warm): 24 → 0
- p95 latência `/sispag/retornos` (warm): estimado 3–8s → ≤ 300ms

**Risco de não fazer**: aba fica desconfortável de usar; empurra analista a evitar verificar retornos.
**Dependências**: nenhuma; combina bem com performance-2.

---

### [security-3] Validar `.RET` (tamanho, MIME, layout CNAB) antes do upload multipart

**QA**: Security
**Tactic alvo**: Validate Input
**Esforço**: S
**Findings**: F-security-3

**Problema**
> `carregarArquivoRetorno` aceita `Buffer` de qualquer tamanho, `fileName` arbitrário e nenhuma verificação de layout. Quando wired (Fatia 3), um arquivo malformado ou nomeado errado é roteado para `(bncCod, gtbCodSeq)` pelo NOME (TODO em `RetornoOrquestracaoService:79-81`) — baixa cai em títulos errados. `postMultipartOnce` é não-idempotente.

**Melhoria Proposta**
> Adicionar `Zod` no boundary de `CarregarRetornoParams`: `conteudo.length ≤ 5MB`, `fileName` com regex de nome de retorno (`^[A-Z0-9_.-]+\.RET$` ou padrão Nexxera), header CNAB240 checado (primeiros 240 bytes começam com o código do banco esperado). Rejeitar `contentType` diferente de `application/octet-stream` ou `text/plain`. Blindar antes de qualquer `postMultipartOnce`.

**Resultado Esperado**
> Uploads malformados falham no cliente com 400 explicativo antes de tocar o ERP. `postMultipartOnce` só executa com `.RET` sane. Validações antes do upload: 0 → 3 (tamanho, nome, header CNAB).

**Métricas de sucesso**
- Validações antes do upload: 0 → 3
- `.RET` para banco errado (produção): não-medível pré-wiring → 0 após teste dedicado

**Risco de não fazer**: quando a Fatia 3 sair, um retorno adulterado ou colocado por engano na pasta dispara baixa cruzada — dinheiro do fornecedor A creditado para fornecedor B.

---

### [fault-tolerance-2] Reaper de `pagamento_ingestao_run` órfão em `status='running'`

**QA**: Fault Tolerance
**Tactic alvo**: Condition Monitoring / Repair State
**Esforço**: S
**Findings**: F-fault-tolerance-2

**Problema**
> Se o processo cai entre `createRun` (status='running') e `finishRun`, a row fica running para sempre. `findLatestSuccessFinishedAt` mascara o problema no painel, mas polui a auditoria e pode fazer confusão em troubleshoot pós-deploy.

**Melhoria Proposta**
> Adicionar coluna `runtime_expected_at` (started_at + 15min p.ex.) ou query de reaper `UPDATE pagamento_ingestao_run SET status='error', error_message='reaped: no heartbeat', finished_at=now() WHERE status='running' AND started_at < now() - INTERVAL '30 minutes'`. Rodar como cron leve pré-`POST /sispag/ingestao` (self-healing) e no boot do processo.

**Resultado Esperado**
> Nenhuma run zumbi >30min. Métrica: `pagamento_ingestao_run WHERE status='running' AND started_at < now() - INTERVAL '30 minutes'` = 0.

**Métricas de sucesso**
- Runs órfãs (>30min em 'running'): não medido → 0
- Advisory lock zombie após crash: variável → sempre liberado (pré-check no boot)

**Risco de não fazer**: Auditoria poluída degrada confiança do analista; janela de 24h de idempotency-key preso caso lock não caia com a conexão.
**Dependências**: nenhuma

---

### [testability-3] Introduzir `ClockProvider` e `IdProvider` (@singleton, @injectable) e mockar via DI

**QA**: Testability (cross: Modifiability)
**Tactic alvo**: Limit Non-Determinism
**Esforço**: S
**Findings**: F-testability-3

**Problema**
> `Date.now()` (2 hits, incluindo a janela A5 `now-15d…now+45d` em `IngestaoPagamentosService`) e `randomUUID()` (2 hits em repositórios) são chamados diretamente em source. Nenhum `jest.useFakeTimers()` na suíte SISPAG. Consequência: (a) a fronteira "pagar hoje" não pode ser fixada por teste; (b) IDs de lote/run em snapshots são não-determinísticos, forçando `expect.any(String)` no lugar de igualdade exata.

**Melhoria Proposta**
> Criar `ClockProvider` e `IdProvider` em `domain/libs/`, `@injectable() @singleton()`, com implementação padrão (`Date.now()`, `randomUUID()`) e substitutos de teste (`FakeClockProvider(fixedTs)`, `FakeIdProvider(seed)`). Injetar em `IngestaoPagamentosService`, `SispagPainelService`, `LotePagamentoRepository`, `PagamentoIngestaoRunRepository`. Reescrever ao menos 2 testes para pinar `now = 1_700_000_000_000` e assertar que a janela `[minVencimento, maxVencimento]` é exatamente `[now-15d, now+45d]`.

**Resultado Esperado**
> 4 sites de non-determinism em source → 0; testes passam a assertar sobre valores exatos de vencimento e IDs de lote; a regra A5 "pagar hoje" ganha 1 teste explícito de fronteira. Padrão fica disponível para `RetornoOrquestracaoService` quando ele acordar.

**Métricas de sucesso**
- `Date.now()` / `randomUUID()` em source SISPAG: 4 → 0
- Testes com clock/ID pinado em SISPAG: 0 → ≥ 4
- Casos explícitos de fronteira da janela A5: 0 → ≥ 2

**Risco de não fazer**: mudar a janela de vencimento (regra de negócio sensível) sem cair nenhum teste; snapshots com UUID batendo em `expect.any(String)` mascara refactor errado.
**Dependências**: nenhuma

---

### [deployability-1] Adicionar par down/backup automático à migração destrutiva 0030 e todas as próximas destrutivas

**QA**: Deployability (cross: Fault Tolerance)
**Tactic alvo**: Rollback
**Esforço**: M
**Findings**: F-deployability-1, F-deployability-2

**Problema**
> A migração `0030_remove_internacional.sql` faz `DELETE FROM titulo_a_pagar/lote_pagamento_item WHERE internacional=TRUE` + `DROP COLUMN internacional` — forward-only. Se v0.17.4 precisar ser revertida, o `Rollback` do Render restaura o binário mas o schema já perdeu a coluna: SISPAG cai em `column does not exist` no primeiro request e a trilha de auditoria dos títulos internacionais está perdida.

**Melhoria Proposta**
> Definir política "toda migração destrutiva é acompanhada por (a) um snapshot Supabase automatizado imediatamente antes do deploy [pg_dump ou snapshot manual documentado em runbook] e (b) um script `NNNN_reverse_*.sql` ou instrução PT-BR de como reconstruir, colocada no cabeçalho do arquivo destrutivo". Migrar `runMigrations.ts` para logar `[migrate] DESTRUCTIVE MIGRATION APPLIED: 0030` em nível `warn` quando o arquivo contém `DROP` / `DELETE` sem `WHERE FALSE`. Adicionar checkbox operacional no runbook (deployability-6) forçando snapshot pré-deploy.

**Resultado Esperado**
> MTTR de rollback SISPAG após migração destrutiva cai de "horas (restore + reingestão manual)" para ≤ 30 min (restore de snapshot + re-ingestão automatizada via cron). Migrações destrutivas ficam visíveis no log de deploy.

**Métricas de sucesso**
- Migrações destrutivas SISPAG com snapshot pré-deploy: 0/1 → 1/1 (100%)
- MTTR rollback pós-destrutiva: não instrumentado → ≤ 30 min documentado

**Risco de não fazer**: próximo bug regressivo em v0.17.x força restore manual sem checkpoint conhecido; analista perde lotes em construção.
**Dependências**: deployability-6 (runbook)

---

### [integrability-2] Descobrir e encapsular o transporte Nexxera (`NexxeraRetornoReader`)

**QA**: Integrability
**Tactic alvo**: Discover Service
**Esforço**: M
**Findings**: F-integrability-2

**Problema**
> `RetornoOrquestracaoService.listarRetNaPasta()` retorna `[]` — no-op. O reader da pasta/SharePoint onde o Nexxera larga `.RET` não existe; o path exato, protocolo (SMB/MS Graph/HTTP?) e credenciais estão como `TODO(Ricardo/comercial)`. Bloqueia toda a ativação da perna de retorno automatizado.

**Melhoria Proposta**
> Rodar `/feature-new nexxera "descobrir transporte de retorno .RET"` para modelar entrevistando o Ricardo. Criar `ontology/integrations/nexxera.md` e `src/backend/domain/client/NexxeraRetornoReaderClient.ts` (`@singleton() @injectable()`) com API mínima (`listRetPendentes(): Promise<ArquivoRetPendente[]>`, `markProcessed(fileName)`). SSM path `/tenants/{env}/columbia/nexxera_credentials`.

**Resultado Esperado**
> `RetornoOrquestracaoService.processarRetornos()` deixa de ser dormente. Custo marginal futuro de trocar Nexxera por outro transporte = trocar 1 client atrás da mesma interface.

**Métricas de sucesso**
- Nexxera integration surface: 0 → 1 client + 1 config SSM + 1 fixture
- LOC do reader ≤ 200 (medida de encapsulamento saudável)

**Risco de não fazer**: Fatia 3 retorno automático indefinidamente adiada; baixa continua manual (tesouraria + analista) e escala com o volume mensal de `.RET`.
**Dependências**: entrevista com Ricardo (comercial) sobre acesso à pasta.

---

### [modifiability-2] Externalizar constantes de política SISPAG (janelas, teto, fan-out)

**QA**: Modifiability (cross: Deployability, Availability)
**Tactic alvo**: Defer Binding (configuration file)
**Esforço**: M
**Findings**: F-modifiability-2

**Problema**
> 8 constantes de política de negócio (horizonte de formação, teto de títulos/lote, janela de ingestão 15/45d, teto de resposta do painel, fan-out Conexos, janelas KPI 7d/30d) estão hardcoded em 3 services. Qualquer ajuste pedido pela analista financeira exige release lockstep FE+BE + deploy Render.

**Melhoria Proposta**
> Criar `SispagPolicyProvider` (`@singleton()`) que lê de `EnvironmentProvider` (SSM em prod) com defaults tipados. Migrar `FormacaoLotesService.HORIZONTE_DIAS`, `MAX_TITULOS_POR_LOTE`, `SispagPainelService.TITULOS_CAP`, `CONEXOS_FANOUT_LIMIT`, `FANOUT_LIMIT` (unificar nome), `IngestaoPagamentosService` janela 15/45d, KPIs `aVencer7d/30d`. Documentar cada valor em `ontology/business-rules/`. Chaves SSM: `/financeiro/{env}/sispag/policy/*`.

**Resultado Esperado**
> Mudança de janela de 7d → 3d = update em 1 valor no SSM, `restart` do serviço (ou hot-reload no próximo `getEnvironmentVars()`), 0 deploys de código.

**Métricas de sucesso**
- Magic policy numbers em `service/sispag/`: 8 → 0
- Deploys por mudança de política: 1 full lockstep → 0
- Ontology `business-rules` com valor default versionado: +3

**Risco de não fazer**: continuar bumpando versão do app por parâmetro de tuning. Cada bump = ciclo Vercel + Render = ~10 min de janela de indisponibilidade parcial.
**Dependências**: nenhuma; pode rodar em paralelo.

---

### [performance-1] Batch server-side de `modalidadesDisponiveisDoLote` + memo client

**QA**: Performance
**Tactic alvo**: Reduce Overhead + Maintain Multiple Copies of Computations
**Esforço**: M
**Findings**: F-performance-1

**Problema**
> Ao expandir um card de lote em rascunho, o backend faz uma chamada `fin064/list?docCod#EQ` por título do lote (N+1 clássico, até 25 chamadas). O `useEffect` do `LoteCard.tsx` refaz o fetch a cada abrir/fechar. Em Conexos degradado, a expansão de UM card demora 5–14s.

**Melhoria Proposta**
> Opção A (barata): memoizar por `loteId` no client com `React.useRef`/`useSWR` (revalidar apenas ao mudar `l.versao`). Opção B (mais correta): trocar `getTituloAPagar` por uma leitura em lote usando `fin064/list` filtrado por `docCod#IN [...]` (uma chamada por lote), se o Conexos aceitar; se não aceitar, cachear no service com TTL 60s por `(filCod, docCod, titCod)`. Arquivos: `SispagPainelService.modalidadesDisponiveisDoLote`, `ConexosSispagClient.getTituloAPagar`, `LoteCard.tsx`.

**Resultado Esperado**
> Chamadas Conexos por expansão de card: de `K` (K ≤ 25) → 1 (batch) ou 0 (cache warm). p95 expansão de card ≤ 1500ms (baseline estimado 3–5s).

**Métricas de sucesso**
- Chamadas Conexos por expansão: `K` → 1 (Opção B) ou 0 (cache warm)
- p95 latência `/modalidades-disponiveis`: ~4000ms (estimado) → ≤ 1500ms

**Risco de não fazer**: revisão do lote (etapa crítica antes do gate) sente cada blip Conexos; analista abandona lotes maiores.
**Dependências**: nenhuma

---

### [security-1] Persistir trilha de auditoria de todas as transições de lote em tabela imutável

**QA**: Security (cross: Fault Tolerance)
**Tactic alvo**: Audit Trail
**Esforço**: M
**Findings**: F-security-1 (implementar junto com fault-tolerance-5)

**Problema**
> Só `criado_por` e `finalizado_por` na raiz do lote são persistidos; as demais transições (`reabrir`, `cancelar`, `retorno`, `atualizarConta`, `atualizarModalidade`, `incluir/remover item`) e a formação automática só emitem `LogService.info`. Em stdout do Render, os logs expiram e não são queryable — perícia forense pós-incidente ("quem cancelou o lote LT-42?") depende do drain estar quente. Para um domínio que move dinheiro, é insustentável.

**Melhoria Proposta**
> Criar migração `00XX_sispag_audit_log.sql` com tabela `sispag_audit_log` (id, lote_id, acao, ator, ocorrido_em, detalhes JSONB, request_id). Substituir `LotePagamentoService.audit()` por um `SispagAuditRepository.registrar()` chamado dentro da mesma transação da mutação (mesma `tx` que muda o estado — atômico com o `transicionarStatus`). Manter o log estruturado para tail; a tabela é a fonte de verdade. Escrever para `IngestaoPagamentosService` e `FormacaoLotesService` (que hoje também só logam) o mesmo padrão.

**Resultado Esperado**
> 100% das mutações SISPAG rastreadas em tabela imutável, com `ator` (username) e `request_id` (correlacionável ao log). Consulta "quem tocou este lote e quando" vira `SELECT * FROM sispag_audit_log WHERE lote_id = $1 ORDER BY ocorrido_em`. Cobertura: 2/8 → 8/8 tipos de transição.

**Métricas de sucesso**
- Tipos de mutação com registro persistido: 2/8 → 8/8
- Consulta forense "quem cancelou lote X": impossível (stdout) → 1 query SQL

**Risco de não fazer**: auditoria externa/compliance pergunta "quem autorizou o pagamento" e a resposta é "stdout dos últimos 7 dias" — inaceitável em contrato SaaSo financeiro.
**Dependências**: alinhar com fault-tolerance-5 — a mesma tabela `sispag_audit_log` é insumo forense pós-incidente.

---

### [security-2] Blindar toolboxes de escrita SISPAG (`fin015`, `fin052/carregar`) com gate interno + teste ratchet

**QA**: Security (cross: Fault Tolerance, Availability, Deployability)
**Tactic alvo**: Limit Exposure
**Esforço**: M
**Findings**: F-security-2

**Problema**
> `ConexosSispagWriteClient.criarLote`/`gerarRemessa`/`importarTitulos` e `ConexosSispagRetornoClient.carregarArquivoRetorno` são "ferramentas dormentes" que dependem do serviço de orquestração futuro chamar `env.conexosWriteEnabled` ANTES do POST. Um `/feature-new sispag` mal-executado que esqueça essa checagem dispara `.REM` real para o banco — não-idempotente, sem desfazer. Hoje o único guardião é um comentário no código.

**Melhoria Proposta**
> Duas camadas: (a) internalizar o gate na base — cada método de escrita desses clients recebe o `EnvironmentProvider` injetado e, se `conexosWriteEnabled=false || conexosDryRun=true`, retorna um resultado stub e loga `WRITE_SKIPPED`; (b) escrever um teste PatternGuardian que reprova qualquer serviço que resolva o WriteClient/RetornoClient sem antes chamar `getEnvironmentVars().conexosWriteEnabled` (grep AST). Espelhar a doutrina que `ConexosBaixaClient` já usa em Permutas.

**Resultado Esperado**
> `WRITE_SKIPPED` como default; escrita real só quando duas flags concordam. Bug de wiring nunca chega ao banco. Toolboxes com gate interno: 0/3 → 3/3.

**Métricas de sucesso**
- Toolboxes com gate interno: 0/3 → 3/3
- Teste ratchet que reprova wiring sem gate: 0 → 1 (falha o CI)

**Risco de não fazer**: primeira feature de escrita SISPAG em produção pode disparar `.REM` real por descuido — dinheiro sai da conta antes que alguém veja o log.
**Dependências**: coordenar com o card `deployability` de feature-flag por tenant (mesma raiz de config).

---

### [testability-1] Extrair `SispagPainelClient`/`RetornoTabela` do `page.tsx` e cobrir com Testing Library

**QA**: Testability (cross: Modifiability)
**Tactic alvo**: Specialized Interfaces + Limit Structural Complexity
**Esforço**: M
**Findings**: F-testability-1, F-testability-8

**Problema**
> Frontend SISPAG (`app/sispag/**` + `lib/sispag.ts`, ~1834 LOC) não tem NENHUM teste. `page.tsx` cresceu para 832 LOC com paginação de `.RET` recém-adicionada, 4 abas, filtro por filial e `useTabelaFiltro`. Qualquer regressão de UX (paginação, filtro, tab-switching) só vai aparecer em produção com analista financeiro reclamando.

**Melhoria Proposta**
> Quebrar `page.tsx` em `RetornosTab.tsx`, `LotesTab.tsx`, `TitulosTab.tsx` (subcomponentes puros, props-in) + hook `useSispagPainel()`. Escrever 3 test files iniciais: `RetornosTab.test.tsx` (paginação, filtro por filial, estado vazio), `LotesTab.test.tsx` (tabs RASCUNHO vs FINALIZADO/RETORNADO), `lib/sispag.test.ts` (parse do JSON do backend, tratamento de 403 do gate). Mockar `apiFetch` com jest.mock. Depois subir o floor `./app/sispag/` no jest.config para `lines: 40, branches: 25`.

**Resultado Esperado**
> SISPAG frontend passa de 0 test files / 0% cobertura para ≥ 3 test files e ≥ 40% lines na pasta `app/sispag/`. Regressão em paginação `.RET` ou filtro de filial passa a ser detectável no CI (não em prod).

**Métricas de sucesso**
- Test files frontend SISPAG: 0 → ≥ 3
- Cobertura `app/sispag/` (lines): ~0% → ≥ 40%
- LOC do maior arquivo `app/sispag/`: 832 → ≤ 400

**Risco de não fazer**: a próxima feature de frontend (baixa manual, edição de modalidade inline, atalhos por analista) empilha em `page.tsx` e vira intratável.
**Dependências**: —

---

### [testability-2] Adicionar testes de rota (supertest) para `routes/sispag.ts` — 14 endpoints

**QA**: Testability
**Tactic alvo**: Specialized Interfaces
**Esforço**: M
**Findings**: F-testability-2, F-testability-7

**Problema**
> `routes/sispag.ts` (361 LOC, 14 endpoints, incluindo criar/finalizar/reabrir/cancelar lote e atualizar conta pagadora/modalidade) não tem teste. O `respondLoteError()` mapeia 8 erros tipados para HTTP (409 vs 422 vs 500); se qualquer mapping regredir, os tests de serviço passam sem detectar. Zod schemas (`criarLoteSchema`, `incluirTituloSchema`) também não são exercitados.

**Melhoria Proposta**
> Instalar `supertest`; criar `src/backend/routes/sispag.test.ts` com fábrica que monta um `express()` mínimo, injeta service mocks via `container.register(SispagPainelService, { useValue: mock })`, e testa: (a) 200 no happy-path de cada endpoint (smoke), (b) 400 no Zod-fail dos POST/DELETE, (c) mapping de `LoteVersaoConflitoError → 409`, `LoteEstadoInvalidoError → 422`, `IngestLockBusyError → 429`. Adicionar floor por subdiretório `./routes/` no `jest.config.cjs`.

**Resultado Esperado**
> Cobertura de `routes/sispag.ts` passa de ~0% → ≥ 70% lines; os 14 endpoints têm pelo menos 1 smoke test cada; o mapping erro → HTTP passa a ser verificável. CI trava merge se algum novo endpoint SISPAG não tiver teste.

**Métricas de sucesso**
- Route tests SISPAG: 0 → ≥ 14 smoke + 8 mapping
- Cobertura `routes/sispag.ts` (lines): ~0% → ≥ 70%
- Jest coverage floor `./routes/` (lines): ausente → 60

**Risco de não fazer**: regressão silenciosa no contrato HTTP do SISPAG — o frontend passa a receber 500 em lugar de 409, retry loop indevido, analista bloqueado no lote.
**Dependências**: —

---

### [fault-tolerance-8] Job de reconciliação diária DB↔Conexos (drift detector)

**QA**: Fault Tolerance (cross: Integrability)
**Tactic alvo**: Reconcile
**Esforço**: M
**Findings**: F-fault-tolerance-8

**Problema**
> A única sanity DB↔ERP é a re-leitura no `incluirTitulo`. Sem job periódico que verifique se títulos marcados `pago=false` local ainda estão a pagar no ERP → drift silencioso na janela até a próxima ingestão bem-sucedida por filial.

**Melhoria Proposta**
> Novo job `reconcile-carteira.ts` (cron horário) que amostra N títulos aleatórios `ativo=true, pago=false` e re-checa via `ConexosSispagClient.getTituloAPagar`. Divergências → grava em `titulo_a_pagar_drift` (nova tabela) + alerta LogService `BUSINESS_WARN`. Métrica no painel.

**Resultado Esperado**
> Drift detectado em <1h após ocorrer no ERP. Métrica: janela de drift p95 < 1h.

**Métricas de sucesso**
- Job de reconciliação: 0 → 1
- Janela de drift p95: até 24h → <1h

**Risco de não fazer**: Painel/relatório mentindo silenciosamente sobre "títulos a pagar"; analista pode montar lote com título já pago fora.
**Dependências**: nenhuma (I2 no `incluirTitulo` continua sendo o gate autoritativo em runtime)

---

### [fault-tolerance-3] Construir ledger `retorno_execucao` + advisory lock + status BAIXADO antes de ativar RetornoOrquestracaoService (**absorve availability-4**)

**QA**: Fault Tolerance + Availability (merged) + Security
**Tactic alvo**: Idempotent Replay / Recovery — Forward
**Esforço**: L
**Findings**: F-fault-tolerance-3, F-availability-4

**Problema**
> `RetornoOrquestracaoService` está pronto no formato (client `postMultipartOnce`, dry-run default) mas com 4 TODOs de correção obrigatória: ledger write-ahead por idempotency_key (hash do `.RET`), advisory lock do poller, run de auditoria persistida, e o status `BAIXADO` + correlação lote↔arquivo_retorno. Sair do DRY-RUN sem essas peças = risco de dupla baixa no fin010.

**Melhoria Proposta**
> Antes de ligar `CONEXOS_WRITE_ENABLED=true` para o poller: (1) migration `0032_retorno_execucao` com `UNIQUE(idempotency_key)` espelhando `PermutaExecucaoRepository`; (2) `withAdvisoryLock(RETORNO_POLLER_LOCK_KEY)` no corpo; (3) `RetornoIngestaoRunRepository` espelhando `PagamentoIngestaoRunRepository`; (4) migration `0033_lote_baixado` adicionando o status + FK lote↔arquivo. Gravar `pending → settled|error` write-ahead antes do `carregarArquivoRetorno`.

**Resultado Esperado**
> Reprocessar o mesmo `.RET` = no-op (retorna a execução prévia); poller nunca roda 2× simultâneo; audit trail persistido. Métrica: 0 `.RET` processados 2× por hash.

**Métricas de sucesso**
- Ledger `retorno_execucao` existe: não → sim
- Advisory lock do poller: TODO → implementado
- Baixa dupla por `.RET` reprocessado: potencial → 0
- Cobertura de teste do lock + ledger: 0 → ≥3 casos (lock busy, duplicate key, retry pós-crash)

**Risco de não fazer**: Fatia 3 sai para produção com dupla baixa possível → reconciliação contábil manual pesada. Um único deploy com 2 réplicas ou 1 restart mid-upload causa baixa duplicada no `fin010`.
**Dependências**: HAR do `arquivosRetorno/processar` (ver `ontology/_inbox/sispag-fin052-exploration.md`); `PostgreeDatabaseClient` já injetável.

---

### [modifiability-1] Fatiar o `SispagPanel` em componentes por tab

**QA**: Modifiability (cross: Testability)
**Tactic alvo**: Split Module + Increase Semantic Coherence
**Esforço**: L
**Findings**: F-modifiability-1, F-modifiability-5, F-modifiability-6

**Problema**
> `src/frontend/app/sispag/page.tsx` é um god-component de 832 LOC, 5 tabs e 15 useStates que mistura fetch, orquestração de negócio e render. Cada nova coluna/filtro obriga a re-testar as 5 tabs manualmente (não há testes frontend). Frente III (Popula GED) tende a repetir o padrão se este continuar de referência.

**Melhoria Proposta**
> Aplicar Split Module + Increase Semantic Coherence: extrair 5 componentes irmãos (`TitulosTab`, `LotesCandidatosTab`, `LotesFinalizadosTab`, `LotesNativosTab`, `RetornosTab`), cada um dono do próprio state local e do próprio `useTabelaFiltro`. `SispagPanel` fica só com shell (header + KPIs + `<Tabs>`) e uma hook `useSispagData()` (React Query ou reducer) que expõe `painel`, `lotes`, `refetch()` aos filhos. Mover `criarLoteComSelecionados`/`acaoLote`/`ingerir`/`formar` para hooks nomeados (`useCriarLote`, `useLoteActions`, `useIngestao`).

**Resultado Esperado**
> page.tsx ≤ 200 LOC; cada tab-componente ≤ 250 LOC; useState do shell ≤ 6.

**Métricas de sucesso**
- `page.tsx` LOC: 832 → ≤ 200
- useStates no shell: 15 → ≤ 6
- Warnings `setState-in-effect` SISPAG: 2 → 0

**Risco de não fazer**: com Fatia 3 (envio + retorno reais + tela de baixa) o arquivo cresce para 1.100+ LOC; ciclo de PR sobe > 1d por mudança.
**Dependências**: testability-1 antes ou lockstep — sem net, o split é refactor às cegas.

---

## P2 — Médio

### [availability-2] Sinalizar degradação parcial no `SispagPainelResponse`

**QA**: Availability
**Tactic alvo**: Degradation
**Esforço**: S
**Findings**: F-availability-2

**Problema**
> Quando uma das ~5 filiais falha no fan-out do painel, `SispagPainelService.montarPainel` continua e devolve KPIs/lista de títulos/lotes calculados sobre o subconjunto que respondeu, sem informar o frontend. O BUSINESS_WARN fica só nos logs Render; o analista vê números completos.

**Melhoria Proposta**
> Adicionar `SispagPainelResponse.degradacao: { filiaisSemDados: number[], reasons?: string[] }` (não-vazio ⇒ painel degradado). Frontend exibe banner "Dados parciais — filial X não respondeu". Tactic Bass: Degradation (com sinalização) + Monitor. Arquivo `src/frontend/app/sispag/page.tsx` renderiza o banner.

**Resultado Esperado**
> 100% das degradações do painel visíveis ao analista sem depender do log-back-end. KPIs continuam sendo computados, mas com contexto.

**Métricas de sucesso**
- Cobertura de sinalização parcial no `SispagPainelResponse`: 0% → 100%
- Testes que asseguram `degradacao.filiaisSemDados` populado quando `bounded.run` devolve `rejected`: 0 → ≥2

**Risco de não fazer**: incidente de "aprovei lote errado / esqueci de pagar" difícil de reconstituir; suporte precisa correr atrás do log Render.
**Dependências**: nenhuma

---

### [availability-3] Wire do cron + heartbeat/alarm da ingestão SISPAG

**QA**: Availability
**Tactic alvo**: Heartbeat / Monitor
**Esforço**: S
**Findings**: F-availability-3

**Problema**
> Os jobs `ingest-pagamentos` e `formar-lotes` estão implementados e testados, mas o cron não está agendado (comentário `NÃO configurado — documentado`). Além disso, nenhum consumidor externo alerta quando `pagamento_ingestao_run.finished_at` fica velho — o `SispagPainelResponse` só devolve o carimbo cru.

**Melhoria Proposta**
> (a) Configurar o cron no Render (`render.yaml` cron worker) para `0 6 * * *` (ingest) e `10 6 * * *` (formação); (b) expor `/health/sispag` que retorna 503 se `now - ultimaRunEm > 30h`; (c) documentar o alarme em `docs/regis-review/*` referenciando o endpoint.

**Resultado Esperado**
> Cron rodando diariamente; probe externo (UptimeRobot / cron-monitor) alerta em ≤ 6h após uma ingestão perdida.

**Métricas de sucesso**
- Cron agendado (render.yaml crons): 0 → 2
- Endpoint `/health/sispag` implementado + testado: ausente → presente
- Tempo entre `ultimaRunEm > 30h` e alerta: ∞ → ≤ 6h (probe externo)

**Risco de não fazer**: painel serve carteira defasada por dias; analista opera às cegas.
**Dependências**: decisão sobre monitor externo (UptimeRobot já existe no stack? confirmar com o Yuri)

---

### [fault-tolerance-4] Frontend passa a emitir Idempotency-Key em POST /sispag/ingestao

**QA**: Fault Tolerance
**Tactic alvo**: Idempotent Replay
**Esforço**: S
**Findings**: F-fault-tolerance-4

**Problema**
> Backend aceita `Idempotency-Key` em `/sispag/ingestao`, mas nenhum caller frontend emite. Duplo click com >run_duration entre eles dispara duas runs distintas (o advisory lock só protege contra concorrência simultânea).

**Melhoria Proposta**
> No `frontend/lib/sispag.ts`, gerar `crypto.randomUUID()` por clique da ação (guardar no state até resolve/erro) e passar no header. Espelhar padrão que Permutas já tem no `runEleicao` (se houver) ou o mesmo padrão do ledger de execução.

**Resultado Esperado**
> 2 cliques no mesmo botão resultam em 1 run + 1 resposta idempotente (mesmo runId). Métrica: rows `pagamento_ingestao_run` por sessão de clique = 1.

**Métricas de sucesso**
- Callers frontend com Idempotency-Key: 0/1 → 1/1

**Risco de não fazer**: Baixo hoje (ingestão idempotente por UPSERT); dívida arma armadilha quando `/formar` virar mutativo.
**Dependências**: nenhuma

---

### [fault-tolerance-6] Endurecer `SUCESSO_SCHEMA` do `gerarRemessa` para exigir `valid='SUCESSO'`

**QA**: Fault Tolerance
**Tactic alvo**: Sanity Checking
**Esforço**: S
**Findings**: F-fault-tolerance-6

**Problema**
> O schema Zod atual aceita `{}` como resposta válida e devolve `sucesso: false` sem lançar. Escrita irreversível já rolou (`.REM` gerado); um caller ingênuo re-tenta e gera outro `.REM` → risco de duplo pagamento se o banco não deduplica pelo `seqNum`.

**Melhoria Proposta**
> `SUCESSO_SCHEMA = z.object({ valid: z.string() /*required*/, message: z.string().optional() }).refine(o => o.valid.toUpperCase() === 'SUCESSO', 'gerarRemessa não retornou SUCESSO')`. Falha do parse vira `ConexosError` com "resposta inesperada", que o orquestrador trata como *reconciliação manual obrigatória* (não retry).

**Resultado Esperado**
> Resposta ambígua do fin015/gerarRemessa vira erro explícito, não silent-false. Métrica: 1/1 endpoint de escrita com resposta obrigatoriamente validada.

**Métricas de sucesso**
- Schemas de resposta em escritas com todos os campos required: 1/2 → 2/2

**Risco de não fazer**: Duplo `.REM` em prod quando Fatia 3 ativar; duplo pagamento no Nexxera.
**Dependências**: fault-tolerance-3 (o orquestrador chamador tem que existir)

---

### [integrability-3] Extrair `describeConexosValidation` para o `ConexosBaseClient` (ou libs/errors)

**QA**: Integrability (cross: Modifiability)
**Tactic alvo**: Abstract Common Services
**Esforço**: S
**Findings**: F-integrability-3

**Problema**
> 27 linhas idênticas de `describeConexosValidation` em `ConexosSispagWriteClient.ts:68-94` e `ConexosSispagRetornoClient.ts:53-78` — self-acknowledged como "duplicado por ora". Quando o fin010-baixa (Fatia 3+) for adicionado, vira 3× duplicação.

**Melhoria Proposta**
> Mover a função para `ConexosBaseClient` (ou `src/backend/domain/errors/parseConexosValidation.ts`). Sub-clients delegam via `this.base.describeConexosValidation(cause)`.

**Resultado Esperado**
> 1 fonte de verdade para o parse de erro do Conexos; adicionar um novo shape de erro (novo `type`) toca 1 arquivo.

**Métricas de sucesso**
- Linhas duplicadas de validation-parse: 27 × 2 → 0
- Cobertura de teste da função extraída: ≥ 90 %

**Risco de não fazer**: divergência silenciosa entre clients sobre como reportar erro de campo obrigatório vs. regra de negócio.
**Dependências**: nenhuma; refactor puro. (Pode aterrissar junto de modifiability-3.)

---

### [modifiability-3] Refatorar `ConexosSispagRetornoClient.listDetalhe` (complexidade 36) antes de wire-up da Fatia 3

**QA**: Modifiability (cross: Integrability)
**Tactic alvo**: Refactor + Abstract Common Services
**Esforço**: S
**Findings**: F-modifiability-3

**Problema**
> `ConexosSispagRetornoClient.listDetalhe` tem cognitive complexity 36 (o único warning cognitivo SISPAG — max 15) por causa de 20 ternários inline no `.map()`. Além disso, `describeConexosValidation` está duplicado entre `ConexosSispagRetornoClient` e `ConexosSispagWriteClient`. Este é o seam da Fatia 3 (poller de retorno) e hoje tem fan-in zero em produção — janela ideal.

**Melhoria Proposta**
> (a) Extrair `mapArquivoRetornoDetalhe(r, fallback)` para módulo próprio ou tabela `[campo, coercer]`; reutilizar em `listErros` e `mapArquivo`. (b) Mover `describeConexosValidation` para `ConexosBaseClient` (ou `ConexosErrorMapper` compartilhado) — os 3 clients SISPAG usam a mesma lógica. (Sobrepõe com integrability-3.)

**Resultado Esperado**
> `listDetalhe` complexidade ≤ 15; duplicação `describeConexosValidation` = 0; toolbox pronto antes de `RetornoOrquestracaoService` sair do dormant.

**Métricas de sucesso**
- Warnings cognitivos SISPAG backend: 1 → 0
- Duplicação `describeConexosValidation`: 2 arquivos × ~42 LOC → 1 arquivo × 42 LOC

**Risco de não fazer**: fazer o mesmo refactor **depois** que o `RetornoOrquestracaoService` acordar custa ~3× mais.
**Dependências**: nenhuma; deve preceder qualquer PR que ligue o poller.

---

### [security-5] Redigir campos sensíveis (banco, conta, docCod, titCod) nos logs de auditoria de negócio

**QA**: Security
**Tactic alvo**: Limit Access
**Esforço**: S
**Findings**: F-security-5

**Problema**
> `LotePagamentoService.audit()` chama `LogService.info({ data: { banco, conta, docCod, titCod, ... } })` sem passar por `redactBody`. O `redact.ts` só cobre `password/token/secret/authorization` no request/response logger. Drain de logs (Render → S3/Datadog) leva número de conta corporativa e identidade de títulos em claro.

**Melhoria Proposta**
> Estender `redactBody` (ou criar `redactBusinessLog`) com uma segunda lista para chaves financeiras (`banco`, `conta`, `contaCorrente`, `pix`, `barCode`, `linhaDigitavel`, `cnpj`, `cpf`) — mascarar mantendo os últimos 4 dígitos (`****4242`). Aplicar em `LogService` para todos os `type = BUSINESS_INFO/BUSINESS_WARN`. Preservar `docCod`/`titCod` no audit trail persistido (security-1) — logs ficam com hash.

**Resultado Esperado**
> Nenhum número de conta bancária ou identidade completa de título no drain de logs. Ocorrências de dados sensíveis não-mascarados em stdout: 6+ → 0.

**Métricas de sucesso**
- Chaves financeiras em stdout sem máscara: 6+ pontos → 0
- Cobertura de `redactBody`: 6 chaves → 15+ chaves

**Risco de não fazer**: um leaked drain (credencial Datadog vazada em log de outro projeto @kavex) expõe agenda de pagamentos da Columbia; falso boleto direcionado.

---

### [security-6] Fechar deny-by-default em `DEV_AUTH_BYPASS` — exigir `environment` explícita

**QA**: Security
**Tactic alvo**: Authenticate Actors, Change Default Settings
**Esforço**: S
**Findings**: F-security-6

**Problema**
> `authEnv.ts:93-101` trata `environment=''` (unset) como "local", permitindo `DEV_AUTH_BYPASS=true` a passar em qualquer container onde a var falte. Um render.yaml de um novo tenant que esqueça `environment` + herança do `.env.example` liga o bypass — leituras SISPAG (sem `requireRole`) ficam abertas ao mundo (quando `SISPAG_ENABLED=true`).

**Melhoria Proposta**
> Inverter o guard: `DEV_AUTH_BYPASS=true` exige `environment ∈ {local, dev, development, test}` — se `environment` estiver vazia, CRASHA no boot. O único caminho seguro de bypass é setar EXPLICITAMENTE `environment=local`. Adicionar teste que garante isso.

**Resultado Esperado**
> Bypass silencioso em prod = impossível. Bootar sem `environment` + bypass = crash. Caminhos de missetup para auth-off: 1 → 0.

**Métricas de sucesso**
- Caminhos de config drift → bypass silencioso: 1 → 0

**Risco de não fazer**: durante o rollout do primeiro cliente SaaSo, uma janela de missetup expõe carteira de pagamentos sem auth.

---

### [testability-4] Ancorar contrato do `RetornoOrquestracaoService` com `it.todo()` e testes de esqueleto para dry-run/erro

**QA**: Testability
**Tactic alvo**: Executable Assertions
**Esforço**: S
**Findings**: F-testability-4

**Problema**
> `RetornoOrquestracaoService.ts` (198 LOC) tem 0% de cobertura e nenhum teste — é esqueleto dormente (Fatia 3). Quando for wired ao reader de SharePoint, é fácil esquecer de cobrir as decisões que JÁ estão no código.

**Melhoria Proposta**
> Criar `RetornoOrquestracaoService.test.ts` com (a) 1 caso happy de dry-run, (b) 1 caso happy pós-write, (c) 1 caso de erro por arquivo, (d) `it.todo(...)` para os TODOs (advisory lock, ledger, status BAIXADO, reader real). Isso ativa o gate mesmo antes da Fatia 3.

**Resultado Esperado**
> `RetornoOrquestracaoService.ts` sobe de 0% → ≥ 60% lines; TODOs viram `it.todo(...)` visíveis no relatório de testes.

**Métricas de sucesso**
- Cobertura `RetornoOrquestracaoService.ts` (lines): 0% → ≥ 60%
- `it.todo` ancorados em decisões pendentes: 0 → ≥ 5

**Risco de não fazer**: Fatia 3 vai wire, o serviço vira caminho crítico de baixa automática, e ninguém percebe que a única lógica testada é "no-op".
**Dependências**: (bloqueia a Fatia 3 se combinada com `--no-regis-review`)

---

### [testability-6] Capturar fixtures HAR de Conexos (fin064/fin015/fin052) e alimentar testes de client

**QA**: Testability (cross: Integrability)
**Tactic alvo**: Recordable Test Cases
**Esforço**: S
**Findings**: F-testability-6

**Problema**
> Nenhum arquivo `__fixtures__/` ou `*.fixture.json` — os 3 clients são testados com `jest.fn().mockResolvedValue({...})` sintético. Se a Conexos alterar payload (`bxaCodSeq` vira `bxaCod`, `titulosRejeitados` snake_case), o teste passa com dados fictícios.

**Melhoria Proposta**
> Capturar 1 HAR real por endpoint em HML. Salvar em `src/backend/domain/client/__fixtures__/{fin064-titulos.json, fin015-lote.json, fin052-arquivo-ret.json, ...}`. Reescrever testes de client para carregar a fixture (`readFileSync`) como resposta mockada.

**Resultado Esperado**
> Fixtures capturadas: 0 → ≥ 6 (2 por client). Regressão de shape do Conexos passa a quebrar teste em vez de quebrar produção.

**Métricas de sucesso**
- Fixtures HAR/JSON: 0 → ≥ 6
- Endpoints Conexos com fixture real: 0 → ≥ 6

**Risco de não fazer**: Fatia 3 wire, Conexos altera schema em um patch, parser do `.RET` quebra silenciosamente na primeira execução real de baixa.
**Dependências**: acesso HML Conexos (já existe para os `probe-*.ts`).

---

### [testability-7] Adicionar coverage floor por subdiretório para `routes/`, `jobs/`, `http/` (backend) e `app/sispag/` (frontend)

**QA**: Testability
**Tactic alvo**: Executable Assertions (CI gate)
**Esforço**: S
**Findings**: F-testability-7

**Problema**
> `jest.config.cjs` só tem floor granular em `./domain/service/`. Rotas, jobs e http caem no bucket global `72/54/78`, que se dilui com a massa das outras frentes — dá para adicionar rota SISPAG sem teste sem tripar CI. Frontend está pior (global 20/9/14).

**Melhoria Proposta**
> No `src/backend/jest.config.cjs`, adicionar chaves `./routes/`, `./jobs/`, `./http/` com floors calibrados ao baseline pós-testability-2 (ex.: `./routes/` lines 60, `./jobs/` lines 40, `./http/` lines 70). No `src/frontend/jest.config.js`, adicionar `./app/sispag/` com lines 40 pós-testability-1.

**Resultado Esperado**
> Coverage floors por subdiretório: backend 1 → ≥ 4; frontend 1 → ≥ 2. CI trava merge em regressão SISPAG (frontend e rotas), não só em serviço.

**Métricas de sucesso**
- Backend `coverageThreshold` chaves por diretório: 1 → ≥ 4
- Frontend `coverageThreshold` chaves por diretório: 1 → ≥ 2

**Risco de não fazer**: as melhorias de testability-1/2 são reversíveis silenciosamente na próxima feature — sem gate, cobertura regride sem alarme.
**Dependências**: testability-1, testability-2

---

### [availability-1] Introduzir walk paginado (ou cap telemetrado) nos reads SISPAG

**QA**: Availability (cross: Performance)
**Tactic alvo**: Sanity Checking / Condition Monitoring
**Esforço**: M
**Findings**: F-availability-1

**Problema**
> Todos os 11 reads Conexos do SISPAG (`ConexosSispagClient` + `ConexosSispagRetornoClient`) chamam `listGenericPaginated` (página 1), com `pageSize` variando de 100 a 5 000. Se uma filial exceder o page size, rows são descartadas silenciosamente — sem `onCapHit`, sem WARN, sem métrica. `ConexosBaseClient.paginate` já existe com essa telemetria e é usado por Permutas; SISPAG não o adotou.

**Melhoria Proposta**
> Trocar os cinco reads mais críticos (`listLotes`, `listBorderosAPagar`, `listTitulosAPagar`, `listExteriorDocCods`, `listArquivosRetorno`) por `base.paginate` com `onCapHit` emitindo BUSINESS_WARN e um counter (`sispag_paginate_cap_hit_total{endpoint}`). Onde o cap for legítimo por design, documentar explicitamente com `TITULOS_CAP`-style.

**Resultado Esperado**
> 0 rows silenciosamente descartadas em produção; WARN observável quando algum endpoint hoje truncado atinge o teto real. Base preparada para Fatia 3.

**Métricas de sucesso**
- reads SISPAG usando `paginate`: 0/11 → ≥5/11
- `sispag_paginate_cap_hit_total` observado em dashboard: N/A → ≥1 métrica exposta

**Risco de não fazer**: quando Fatia 3 sair (baixa/remessa a partir de `listLotes`), lote antigo pode não aparecer para reconciliação → baixa perdida ou duplicada.
**Dependências**: nenhuma — `paginate` já existe em `ConexosBaseClient.ts:238-296`

---

### [deployability-3] Trocar `NEXT_PUBLIC_SISPAG_ENABLED` por flag runtime lida do backend

**QA**: Deployability
**Tactic alvo**: Feature Flag
**Esforço**: M
**Findings**: F-deployability-3

**Problema**
> `NEXT_PUBLIC_SISPAG_ENABLED` é inlineado no bundle Next.js em `next build`. Trocar a env na Vercel não desliga o SISPAG no browser dos usuários até o próximo rebuild. Backend fica seguro (403 imediato após redeploy Render), mas o FE segue exibindo a UI e batendo com 403 até o novo build propagar.

**Melhoria Proposta**
> Expor um endpoint público `GET /features` no backend (respondendo `{ sispagEnabled: boolean }` a partir do `EnvironmentProvider`). Frontend faz fetch no bootstrap (server component / provider React) e propaga por context. Vercel deixa de precisar de `NEXT_PUBLIC_SISPAG_ENABLED` — flag vira runtime, cutover em segundos após um restart do serviço Render. Manter fallback build-time (default `false`) para o caso do `/features` falhar (fail-safe).

**Resultado Esperado**
> Tempo de cutover do front SISPAG: ~1-3 min (rebuild Vercel) → ≤ 30s (restart Render + próximo request do usuário). Uma fonte de verdade única para a flag.

**Métricas de sucesso**
- Tempo de cutover FE SISPAG: ~1-3 min → ≤ 30s
- Fontes de verdade da flag SISPAG: 2 (BE runtime + FE build-time) → 1 (BE runtime)

**Risco de não fazer**: incidente em SISPAG com push do produto para "desligar já" leva minutos onde o front bate 403 em cada ação.
**Dependências**: nenhuma

---

### [deployability-4] Introduzir preview environment para features SISPAG (canary de fato)

**QA**: Deployability
**Tactic alvo**: Scale Rollouts
**Esforço**: M
**Findings**: F-deployability-4

**Problema**
> Deploy é atômico em produção — todo bug pós-deploy expõe 100% dos usuários. Hoje a base é 1 analista principal (mitiga), mas cada bump que toca SISPAG (foram 6 releases em 8 dias) vai direto para prod sem testar num ambiente que **ela** possa validar antes.

**Melhoria Proposta**
> Ativar preview deploys da Vercel + criar um Render preview service (`plan: starter` também, `autoDeploy: true` em branch `staging`). Convencionar: features SISPAG grandes (nova fatia, migração destrutiva, cutover de escrita) passam por branch `staging` primeiro; PR aponta URL de preview; analista valida; merge em `main` promove. Pequenos fixes seguem direto.

**Resultado Esperado**
> Bugs de UX/regressão SISPAG são pegos por 1 par (dev + analista) antes de expor 100% dos usuários. Deploy success rate percebida (sem revert) sobe.

**Métricas de sucesso**
- Deploys SISPAG que passam por staging antes de prod: 0/6 (última semana) → ≥ 4/6 (para changes que tocam schema ou UI)

**Risco de não fazer**: com SISPAG entrando em fatia 3, a próxima release destrutiva vai direto para o analista sem homologação.
**Dependências**: deployability-6 (runbook), deployability-1 (snapshot pré-deploy fica mais fácil se houver um staging)

---

### [deployability-5] Coordenar deploy backend↔frontend (ordem determinística no push em main)

**QA**: Deployability (cross: Integrability, Availability)
**Tactic alvo**: Logical Grouping
**Esforço**: M (opção A) ou S (opção B — só documentação)
**Findings**: F-deployability-5

**Problema**
> Push em `main` dispara Render (BE) e Vercel (FE) em paralelo. Features SISPAG lockstep (ex.: v0.17.5 A2 modalidade) ficam num contrato skewed por segundos-minutos até os dois deploys terminarem, gerando toasts esporádicos de erro na janela de skew.

**Melhoria Proposta**
> Opção mínima: adicionar ao workflow `ci.yml` um job `deploy-orchestrator` que aguarda o backend Render responder `/health` com a nova build (poll HTTP) e SÓ ENTÃO chama a Vercel deploy hook para o frontend. Alternativa mais barata: documentar convenção "toda mudança de contrato /sispag/* aumenta o número da MINOR — o FE novo tolera resposta velha por 1 minor".

**Resultado Esperado**
> Janela de skew reduzida de segundos-minutos para ~0 (opção A) ou eliminada por contrato (opção B).

**Métricas de sucesso**
- Janela de skew FE↔BE em deploys lockstep: N/A (não medida) → ≤ 30s (opção A) ou tolerância contratual (opção B)

**Risco de não fazer**: com mais usuários simultâneos ou breaking changes no `/sispag/*` (fatia 3), os toasts viram incidentes reportados.
**Dependências**: nenhuma

---

### [deployability-6] Escrever runbook operacional SISPAG (cron, flag, migração, cutover fatia 3)

**QA**: Deployability (cross: Availability, Testability)
**Tactic alvo**: Script Deployment Commands
**Esforço**: M
**Findings**: F-deployability-6, F-deployability-1, F-deployability-3

**Problema**
> `docs/runbooks/` só tem `fin010-write-cutover.md` (Permutas). Não há playbook para incidentes SISPAG: falha do cron `ingest-sispag.yml`, cutover do flag `SISPAG_ENABLED`, migração destrutiva travada, cutover futuro fin015/fin052. Bus factor = 1.

**Melhoria Proposta**
> Criar 4 arquivos em `docs/runbooks/sispag/`: `cron-ingestao-falhou.md` (como consultar log GH Actions, como re-rodar via workflow_dispatch, como verificar advisory lock preso), `flag-sispag-cutover.md` (ordem: Render restart → aguardar → Vercel rebuild → validar 403 + tela bloqueio), `migracao-destrutiva-recuperacao.md` (snapshot Supabase, restore, re-ingestão, referência ao card deployability-1), `fatia-3-fin015-cutover.md` (análogo ao de fin010 — WRITE_ENABLED + DRY_RUN em HML antes de prod). Cada runbook: sintomas → diagnóstico → ação → validação.

**Resultado Esperado**
> Bus factor sobe para 2+; on-call de outro dev consegue mitigar sem escalation.

**Métricas de sucesso**
- Runbooks SISPAG: 0 → 4
- Bus factor operacional SISPAG: 1 → 2+

**Risco de não fazer**: primeiro incidente SISPAG durante férias do dev primário = trabalho parado da analista até o retorno.
**Dependências**: nenhuma (embora deployability-1 e deployability-3 façam mais sentido depois deste)

---

### [fault-tolerance-5] Auditoria persistida no mesmo `withTransaction` da mudança de estado

**QA**: Fault Tolerance (cross: Security)
**Tactic alvo**: Increase Competence Set
**Esforço**: M
**Findings**: F-fault-tolerance-5

**Problema**
> `LotePagamentoService` chama `this.audit(...)` (LogService.info) FORA do `withTransaction` de todas as transições. Hoje LogService escreve em console e falhar é raro; quando a proposta de `audit_log` persistido chegar (invariante cross-cutting), o dual-write não-atômico deixa o rastro contábil incompleto ao menor blip.

**Melhoria Proposta**
> Modelar `audit_log` via `/feature-new`, e refatorar `LotePagamentoService.audit` para aceitar um `tx?: TransactionClient` e ser chamado DENTRO do `withTransaction` das transições.

**Resultado Esperado**
> Toda mudança de estado gera ≥1 row em `audit_log` na mesma transação (commit-together ou rollback-together). Métrica: 6/6 callsites `this.audit` migrados para dentro da tx.

**Métricas de sucesso**
- Callsites `audit()` dentro de `withTransaction`: 0/6 → 6/6

**Risco de não fazer**: Auditoria contábil com furos → compliance falha em SOX-lite quando SISPAG virar fonte de verdade.
**Dependências**: `/feature-new audit_log` (invariante cross-cutting). Deve ser implementado JUNTO com security-1 (mesma tabela).

---

### [integrability-4] Congelar payloads reais HML como golden fixtures para contract tests

**QA**: Integrability
**Tactic alvo**: Contract testing
**Esforço**: M
**Findings**: F-integrability-4

**Problema**
> Os 576 LOC de testes dos 3 clients SISPAG usam payloads sintéticos inline. Os probes HML reais (`jobs/probe-sispag*.ts`, `jobs/validate-fin015-tools.ts`) capturaram respostas reais mas nada é reusado como golden. Um rename no Conexos passa nos testes locais.

**Melhoria Proposta**
> Adicionar `src/backend/domain/client/__fixtures__/sispag/{fin064.list.json, fin015.list.json, fin052.arquivosRetorno.list.json, ...}` gravados dos probes HML. Testes carregam via `readFile` e passam pelo mesmo mapper.

**Resultado Esperado**
> CI detecta breaking-change do provedor em minutos (não em produção). Bar levantado antes de Fatia 3.

**Métricas de sucesso**
- Golden fixtures: 0 → 8
- Testes fixture-based por client: 0 → ≥ 3

**Risco de não fazer**: cada mudança no Conexos vira incidente descoberto em prod.
**Dependências**: acesso HML já existe (probes funcionam). Overlap com testability-6 — coordenar.

---

### [integrability-5] Adotar Zod no wrapper do frontend (`lib/sispag.ts`)

**QA**: Integrability (cross: Security, Fault Tolerance)
**Tactic alvo**: Encapsulate + Adhere to Standards
**Esforço**: M
**Findings**: F-integrability-5

**Problema**
> 9 chamadas `apiFetch` no `src/frontend/lib/sispag.ts` retornam com typecast puro (`as SispagPainel`). Mudança de contrato do backend só quebra no runtime, dentro do render. Cross-QA com Security (defesa em profundidade) e Fault Tolerance.

**Melhoria Proposta**
> Definir schemas Zod compartilhados (ou copiados) das interfaces em `frontend/lib/sispag.ts`. Fazer `SispagPainelSchema.parse(await res.json())` no boundary.

**Resultado Esperado**
> Contract breakage detectado com mensagem clara ("titulos: expected array, got undefined"), reportável como erro-de-integração no monitor.

**Métricas de sucesso**
- Frontend fetch calls com Zod parse: 0/9 → 9/9

**Risco de não fazer**: bugs de contrato invisíveis no CI, descobertos por usuário; render trava com stack críptico.
**Dependências**: alinhar com security estratégia comum de schema-sharing FE↔BE.

---

### [modifiability-4] Fatiar `SispagPainelService` em serviços por intenção

**QA**: Modifiability (cross: Integrability)
**Tactic alvo**: Increase Semantic Coherence
**Esforço**: M
**Findings**: F-modifiability-4

**Problema**
> `SispagPainelService` tem 3 métodos públicos com propósitos distintos (painel diário, arquivos de retorno, modalidades disponíveis) e 9 dependências. Screen-composer disfarçado de service.

**Melhoria Proposta**
> Quebrar em `PainelPagamentoQueryService` (só `montarPainel`), `RetornoQueryService` (só `listRetornos`, alinhado com o futuro `RetornoOrquestracaoService`) e mover `modalidadesDisponiveisDoLote` para `LotePagamentoService` (é uma leitura por lote, pertence ao agregado).

**Resultado Esperado**
> Cada novo `*QueryService` ≤ 150 LOC, ≤ 5 dependências, 1 método público por intenção.

**Métricas de sucesso**
- LOC de `SispagPainelService`: 247 → ≤ 150
- Deps injetadas no serviço de painel: 9 → ≤ 5

**Risco de não fazer**: com Fatia 3, o serviço vira ≥ 400 LOC e vira o novo hub de leituras.
**Dependências**: nenhuma

---

### [modifiability-5] Cobrir SISPAG frontend com smoke tests (`SispagPanel` + `LoteCard`)

**QA**: Modifiability (cross: Testability)
**Tactic alvo**: Refactor (habilitador)
**Esforço**: M
**Findings**: F-modifiability-5

**Problema**
> 0 testes frontend para 1.860 LOC SISPAG. Qualquer refactor (modifiability-1, modifiability-6) é feito no escuro. QaCoach manual em dev tenant já é obrigatório após alteração de UI.

**Melhoria Proposta**
> Usar `@testing-library/react` para: (a) `SispagPanel.test.tsx` — renderiza com mock de `fetchSispagPainel`, valida 5 tabs, valida `formar` desabilitado quando `formando=true`; (b) `LoteCard.test.tsx` — renderiza RASCUNHO/FINALIZADO/RETORNADO e valida botões condicionalmente habilitados; (c) `lib/sispag.test.ts` — valida `IngestaoPagamentosEmAndamentoError` em 409.

**Resultado Esperado**
> Test files SISPAG frontend: 0 → 3; ficha branca antes de fatiar `SispagPanel`. (Sobrepõe com testability-1 — coordenar.)

**Métricas de sucesso**
- Testes SISPAG frontend: 0 → 3+
- Regressões em `LoteCard` transições capturadas por CI antes do PR

**Risco de não fazer**: modifiability-1 vira uma refactor manual sem net.
**Dependências**: precede modifiability-1.

---

### [performance-5] Paginação server-side em `/sispag/lotes` e `/sispag/retornos`

**QA**: Performance
**Tactic alvo**: Reduce Overhead
**Esforço**: M
**Findings**: F-performance-5, F-performance-6

**Problema**
> O backend devolve TODA a lista de lotes (com todos os itens JOIN) e TODOS os arquivos `.RET`. O FE pagina em memória via `useTabelaFiltro`. Como o histórico só cresce, payload e parse crescem monotonicamente — hoje pequeno, débito para 6–12 meses.

**Melhoria Proposta**
> Adicionar `LIMIT $limit OFFSET $offset` em `LotePagamentoRepository.listLotes` (default 50, cap 200) e em `listArquivosRetorno` (via cursor por `garCodSeq`). Rotas aceitam `?limit&offset`. FE troca `useTabelaFiltro.slice` por chamadas paginadas.

**Resultado Esperado**
> Payload por hit constante em O(pageSize) em vez de O(histórico total). Bandwidth ≤ 200KB por página.

**Métricas de sucesso**
- Payload `/sispag/lotes` por hit: O(N_lotes × itens) → O(pageSize=50 × itens_médio)
- `SELECT ... FROM lote_pagamento`: sem LIMIT → `LIMIT 50`

**Risco de não fazer**: degradação silenciosa em 6–12 meses conforme o histórico acumula.
**Dependências**: nenhuma

---

### [security-4] RBAC granular nas leituras SISPAG (papel `sispag:read` ou tenant-scoping)

**QA**: Security
**Tactic alvo**: Limit Access, Authorize Actors
**Esforço**: M
**Findings**: F-security-4

**Problema**
> `GET /sispag/painel`, `GET /sispag/lotes`, `GET /sispag/retornos`, `GET /sispag/ingestao/runs` e `GET /sispag/lotes/:id/modalidades-disponiveis` são abertas a qualquer usuário autenticado. A carteira contém credores, valores, contas pagadoras — visível para qualquer @kavex ativo. A proposta comercial exige "SSO corporativo + RBAC granular".

**Melhoria Proposta**
> Introduzir role `sispag:read` (e `sispag:write` = superset). Aplicar `requireRole('sispag:read', 'admin')` em todas as rotas GET de `/sispag/*`. Quando multi-tenant chegar (SaaSo), acrescentar `tenantId` no JWT e filtrar no `LotePagamentoRepository` (`WHERE tenant_id = $tenantId`).

**Resultado Esperado**
> Leituras SISPAG só para quem tem role explícita. Rotas de leitura com RBAC: 0/6 → 6/6.

**Métricas de sucesso**
- Rotas de leitura SISPAG com RBAC: 0/6 → 6/6
- Usuários sem `sispag:read` que veem carteira: potencialmente toda base @kavex → 0

**Risco de não fazer**: LGPD/compliance do primeiro cliente SaaSo exige separação de leitura por área; sem RBAC granular, não fecha contrato.

---

### [security-8] Habilitar revogação server-side de token (denylist ou refresh rotation)

**QA**: Security
**Tactic alvo**: Revoke Access
**Esforço**: M
**Findings**: F-security-8

**Problema**
> JWT HS256 é stateless — revogar `role` em `app_user` NÃO invalida tokens já emitidos. Se um admin @kavex é comprometido, ele continua podendo `POST /sispag/lotes/:id/finalizar` até o TTL expirar. Sem `jti` gravado, sem denylist.

**Melhoria Proposta**
> Duas opções (pick one): (a) reduzir TTL para 15 min + refresh token rotacionado; (b) tabela `revoked_tokens (jti PRIMARY KEY, revoked_at, expires_at)` — `AuthService` inclui `jti` na emissão; `buildAuthMiddleware` faz SELECT em cada request; entrada expira por vacuum agendado. Opção (b) é mais simples.

**Resultado Esperado**
> Revogação de admin propaga em segundos, não em horas. MTTR de credencial comprometida = TTL (hoje) → <1min (revogação instantânea).

**Métricas de sucesso**
- Janela de exposição pós-revogação: TTL (horas) → <1min

**Risco de não fazer**: credencial de admin comprometida (phishing) tem janela livre para finalizar lotes durante todo o TTL do token.

---

### [testability-5] Criar `LotePagamentoRepository.integration.test.ts` contra Postgres local (docker-compose)

**QA**: Testability (cross: Fault Tolerance)
**Tactic alvo**: Sandbox
**Esforço**: M
**Findings**: F-testability-5

**Problema**
> `LotePagamentoRepository.ts` (420 LOC) está em 70.66% lines — os 30% descobertos são exatamente advisory lock cross-processo, `SELECT … FOR UPDATE`, versão otimista (`WHERE versao = $N`), e o path adopt-vira-manual. O mock de `withTransaction(fn) => fn({})` e `withAdvisoryLock(k, onA, onB) => onA()` não reproduz o comportamento real do Postgres.

**Melhoria Proposta**
> Adicionar `docker-compose.test.yml` com Postgres 15 (schema por migração), script `npm run test:integration` que sobe o container, aplica `migrations/0023..0031`, roda `*.integration.test.ts` e derruba. Cobrir 3 cenários: (a) advisory lock: 2 workers competindo pelo mesmo lote → 1 rejeita com `LoteVersaoConflitoError`, (b) versão otimista: 2 UPDATEs concorrentes → 1 falha, (c) `adicionarItem` em lote AUTOMÁTICO adota (vira MANUAL) atômico. Rodar em job separado do CI (não bloqueia PR, mas trava merge para main).

**Resultado Esperado**
> Cobertura `LotePagamentoRepository.ts` sobe de 70.66% → ≥ 88% lines; comportamento real de locking passa a ter defesa numérica; regressão em SQL de transição é detectável.

**Métricas de sucesso**
- Integration test files SISPAG: 0 → ≥ 3
- Cobertura `LotePagamentoRepository.ts` (lines): 70.66% → ≥ 88%
- Cenários de concorrência A4 cobertos: 0 → 3

**Risco de não fazer**: dois analistas mexendo no mesmo lote em produção — race condition invisível.
**Dependências**: infra de docker no CI.

---

## P3 — Baixo

### [availability-5] Health check composto e timeout Conexos parametrizável

**QA**: Availability
**Tactic alvo**: Self-Test / Exception Prevention
**Esforço**: S
**Findings**: F-availability-5, F-availability-6

**Problema**
> `/health` retorna 200 sem validar Conexos (SID / MAX_SESSIONS) nem Postgres (pool). O timeout do axios Conexos é hardcoded 40 000 ms em `services/conexos.ts` — sem override por env, mesmo timeout para reads e writes. (Parte "timeout" absorvida por xqa-conexos-timeout.)

**Melhoria Proposta**
> (a) Endpoint `/health/deep` que faz `SELECT 1` no Postgres + `base.ensureSid()` no Conexos com timeout curto (2 s); (b) já coberto por xqa-conexos-timeout — parametrizar `axios.create({ timeout })` via `CONEXOS_HTTP_TIMEOUT_MS` no `EnvironmentProvider`, com default 40 000.

**Resultado Esperado**
> Render/monitor detecta indisponibilidade de Conexos/DB em segundos, não pela reclamação do usuário. Operador consegue baixar o timeout sob incidente sem redeploy de código.

**Métricas de sucesso**
- Endpoint `/health/deep` implementado: ausente → presente
- Timeout Conexos configurável via env: hardcoded → env-driven
- Tempo de deteção de dep down: n/a → ≤ 60 s

**Risco de não fazer**: MTTR extra em incidente de Conexos/DB — usuário reporta antes do monitor.
**Dependências**: nenhuma

---

### [deployability-7] Uniformizar versão do Node em CI, cron GH Actions e Render

**QA**: Deployability
**Tactic alvo**: Reproducible Builds
**Esforço**: S
**Findings**: F-deployability-7

**Problema**
> `ci.yml` fixa Node 24, `ingest-sispag.yml` fixa Node 22, `render.yaml` usa `runtime: node` sem `version` (default do provider muda). Cron SISPAG e produção rodam em runtimes diferentes dos que passaram no CI.

**Melhoria Proposta**
> Definir versão canônica (Node 22 LTS ou 24). Setar em: (a) `src/backend/package.json` → campo `engines.node`; (b) `.github/workflows/ci.yml` e `ingest-sispag.yml` → mesma versão; (c) `render.yaml` → `runtime: node` + criar arquivo `.node-version` OU `.nvmrc` na raiz `src/backend/` (Render lê); (d) Vercel Node version via `NODE_VERSION` env or `engines`. Um único ponto de verdade + `preinstall` script checando `process.version`.

**Resultado Esperado**
> 1 versão de Node em toda a pipeline. Bugs relacionados a runtime deixam de existir.

**Métricas de sucesso**
- Versões de Node distintas na pipeline: 3 → 1

**Risco de não fazer**: quando o Render mudar o default, algum comportamento silente da API HTTP/timers/AbortController quebra em produção sem aviso.
**Dependências**: nenhuma

---

### [modifiability-6] Eliminar warnings `setState-in-effect` no SISPAG frontend

**QA**: Modifiability
**Tactic alvo**: Refactor
**Esforço**: S
**Findings**: F-modifiability-6

**Problema**
> 2 warnings React canônicos (`page.tsx:199`, `AdicionarTituloDialog:48`) sobre `setState` sincronizado em `useEffect`. Hoje benigno; futuros polls (Fatia 3) podem exibir cascading renders.

**Melhoria Proposta**
> (a) em `page.tsx`, mover `void carregar()` para o `onOpenChange` do tab ou usar hook `useSispagData()` (ver modifiability-1); (b) em `AdicionarTituloDialog`, redefinir a chave do dialog no parent (`key={lote.id}`) e derivar `sel`/`busca` como estado inicial via `useState(() => …)`.

**Resultado Esperado**
> 2 warnings frontend SISPAG → 0.

**Métricas de sucesso**
- Warnings frontend SISPAG: 2 → 0

**Risco de não fazer**: latente; visibilidade zero em produção.
**Dependências**: cai naturalmente dentro do modifiability-1.

---

### [modifiability-7] Sincronizar state-machine `lote-pagamento` no ontology (`partial` → `implemented`)

**QA**: Modifiability
**Tactic alvo**: Defer Binding (contract with team via ontology)
**Esforço**: S
**Findings**: F-modifiability-7

**Problema**
> `ontology/_coverage.json` marca `state-machines/lote-pagamento` como `partial`, mas o código já implementa 4 status e 6+ transições (RASCUNHO/FINALIZADO/CANCELADO/RETORNADO, ADR-0019). Drift ontológico atrapalha o próximo `/feature-new` (BAIXADO da Fatia 3).

**Melhoria Proposta**
> `/retro-ontology` focado em SISPAG: atualizar `ontology/state-machines/lote-pagamento.md` com as 6 transições reais + `ontology/_coverage.json` (`state_machines_implemented: 1 → 2`). Referenciar `LotePagamentoService.finalizarLote/reabrirLote/cancelarLote/marcarRetorno/transicionar` como `resolved_by`.

**Resultado Esperado**
> `ontology/_coverage.json.state_machines_partial: 1 → 0`; `implemented: 1 → 2`.

**Métricas de sucesso**
- Drift SISPAG em `_coverage.json`: 1 → 0

**Risco de não fazer**: o próximo `OntologyCurator` "descobre" o que já existe e cria diff duplicado.
**Dependências**: nenhuma; roda em qualquer `/retro-ontology`.

---

### [performance-6] Índice `lote_pagamento (fil_cod)` + revisão de índices SISPAG

**QA**: Performance (cross: Modifiability)
**Tactic alvo**: Increase Resource Efficiency
**Esforço**: S
**Findings**: F-performance-7

**Problema**
> `LotePagamentoRepository.listLotes` filtra por `fil_cod` mas não há índice — hoje irrelevante (< 100 lotes), mas quando combinado com `LIMIT/OFFSET` (performance-5) e histórico crescente, evita seq scan.

**Melhoria Proposta**
> Nova migration `00xx_sispag_indexes.sql` adicionando `CREATE INDEX IF NOT EXISTS idx_lote_pagamento_fil_cod ON lote_pagamento (fil_cod)`. Revisar EXPLAIN de `listAtivos` e `listElegiveisParaFormacao` (parcial index `WHERE ativo AND aprovado AND NOT pago` pode valer a pena).

**Resultado Esperado**
> `listLotes(filCod=X)` deixa de fazer seq scan. Custo do plan ≈ constante conforme o histórico cresce.

**Métricas de sucesso**
- Plano de `SELECT ... FROM lote_pagamento WHERE fil_cod = X`: Seq Scan → Index Scan

**Risco de não fazer**: baixa hoje; multiplica-se se performance-5 ficar solto.
**Dependências**: idealmente aterrissa junto com performance-5.

---

### [performance-7] Trocar `com298/list pageSize=5000` por `paginate()` com log de cap-hit

**QA**: Performance
**Tactic alvo**: Bound Execution Times
**Esforço**: S
**Findings**: F-performance-8

**Problema**
> `listExteriorDocCods` faz uma única chamada com `pageSize=5000`. Se algum dia uma filial passar disso, o cap é silencioso e títulos internacionais vazam para a carteira SISPAG (contradiz ADR-0021).

**Melhoria Proposta**
> Trocar por `base.paginate({ endpoint: 'com298/list', bodyBase: {...}, opts: { filCod }, onCapHit: () => logService.warn(...) })`. Ou, no mínimo, adicionar `logService.warn` se `rows.length === pageSize`.

**Resultado Esperado**
> Sem falha silenciosa. Se algum dia o cap for atingido, aparece nos logs como `BUSINESS_WARN` com filCod.

**Métricas de sucesso**
- Cap-hits silenciosos: possíveis → 0 (todos viram log)

**Risco de não fazer**: baixo hoje; sinaliza descuido quando o volume subir.
**Dependências**: nenhuma

---

### [security-7] Adicionar `.max()` nas strings do Zod e validar `Idempotency-Key`

**QA**: Security
**Tactic alvo**: Validate Input
**Esforço**: S
**Findings**: F-security-7

**Problema**
> `banco`, `conta`, `docCod`, `titCod` usam `z.string().trim().min(1)` sem teto. `Idempotency-Key` chega como `req.header(...)` sem parse e vira PK em `pagamento_ingestao_idempotency`. Um admin malicioso pode encher o body/tabela com strings enormes.

**Melhoria Proposta**
> `banco.max(32)`, `conta.max(32)`, `docCod.max(32)`, `titCod.max(16)`. Criar `idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)` aplicado na route `/ingestao`. Rejeitar 400 quando exceder.

**Resultado Esperado**
> Todo string boundary com limite. Superfície de body-flood zerada.

**Métricas de sucesso**
- Campos string com `.max()`: 0/5 → 5/5
- `Idempotency-Key` validado: não → sim

**Risco de não fazer**: baixo hoje (rate limiter); melhor fechar antes do multi-tenant.

---

### [integrability-6] Desmembrar `SispagPainelService` — extrair `SispagRetornosView` e `SispagKpisCalculator`

**QA**: Integrability (cross: Modifiability)
**Tactic alvo**: Restrict Communication Paths
**Esforço**: M
**Findings**: F-integrability-6

**Problema**
> `SispagPainelService` tem 9 dependências injetadas e 3 métodos públicos independentes (`montarPainel`, `listRetornos`, `modalidadesDisponiveisDoLote`). Cada mudança toca um serviço-Deus; testes precisam de 179 linhas de setup para mockar tudo.

**Melhoria Proposta**
> Extrair `SispagRetornosView` (owns `ConexosSispagRetornoClient` + `BoundedConcurrency` + `LogService`, expõe `listRetornos`) e `SispagKpisCalculator` (função pura). `SispagPainelService` fica com `montarPainel` e delega. (Sobrepõe com modifiability-4 — coordenar.)

**Resultado Esperado**
> Nenhum service SISPAG com > 5 collaborators. Fatia 3 (novos writes) adiciona um novo service ao invés de inflar o painel.

**Métricas de sucesso**
- Max collaborators por service SISPAG: 9 → ≤ 5
- LOC de test setup por service: 179 → ≤ 80

**Risco de não fazer**: velocity degrada linearmente com a superfície do painel.
**Dependências**: nenhuma; pode ser sequenciada após integrability-1.
