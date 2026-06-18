---
type: regis-review-kanban
run_id: 2026-06-18-2039
total: 48
counts: { p0: 2, p1: 22, p2: 15, p3: 9 }
---

# Kanban — financeiro / Permutas Fase B — 2026-06-18-2039

> Importável para o Kanban do time. Cada card abaixo já tem Problema / Melhoria Proposta / Resultado Esperado verbatim das 8 seções QA.
> Ordem: P0 (S → M), depois P1 (S → M → L), P2, P3.
> **Ajuste de severidade aplicado pelo consolidator:** `availability-2` promovido P1 → P0 (justificativa no REPORT.md §1 e §7).

---

## P0 — Crítico

### [availability-1] Ativar scheduler do job `ingest-permutas` e expor heartbeat externo

**QA**: Availability
**Tactic alvo**: Heartbeat
**Esforço**: M
**Findings**: F-availability-1, F-availability-2

**Problema**
> O job `jobs/ingest-permutas.ts` está implementado e testado, mas não tem nenhum agendador ativo em produção (Render). A linha de cron está apenas em comentário. Sem isso, a tela `/gestao` mostra fatos congelados do último disparo manual e `markStale` nunca corre.

**Melhoria Proposta**
> Adicionar um Render Cron Job (ou alternativa equivalente no Render) executando `npm run job:ingest-permutas` em `0 6 * * *`. Em paralelo, gravar `permuta_eleicao_run` mais recente (kind='ingest', status='success') como heartbeat e expor `GET /health/ingest` retornando `last_success_at` para um dead-man-switch externo (Cronitor / Healthchecks.io). Tactic Bass: **Heartbeat + Monitor**.

**Resultado Esperado**
> Ingestão diária automatizada com sinal externo. Janela de obsolescência ≤ 24h, alerta em < 26h sem sucesso.

**Métricas de sucesso**
- `# cron agendado para o job`: 0 → 1
- `# alarmes ativos sobre last_success_at`: 0 → 1
- janela máxima sem refresh do `/gestao`: ∞ → 26h

**Risco de não fazer**: analista decide sobre dados de dias atrás sem perceber; permuta executada sobre adiantamento que já foi baixado fora do sistema.

**Dependências**: nenhum bloqueio — o serviço já está pronto.

---

### [availability-2] Fechar a janela de retries do cron com `Idempotency-Key` na ingestão

**QA**: Availability
**Tactic alvo**: Increase Competence Set
**Esforço**: S
**Findings**: F-availability-3
**Severidade**: P0 (promovido pelo consolidator — originalmente P1 no agent)

**Problema**
> O job chama `IngestaoPermutasService.executar({ triggeredBy: 'cron' })` sem `Idempotency-Key`. Um retry do scheduler ou um supervisor que dispara duas execuções em sequência causa fan-out duplicado contra o Conexos.

**Melhoria Proposta**
> Derivar uma `idempotencyKey` por janela de tempo (ex.: `ingest:${YYYY-MM-DD}`) no `jobs/ingest-permutas.ts` e propagar até o `computeCandidatas` ou usar a versão `EleicaoPermutasService.executar({ idempotencyKey })` com replay quando a key já produziu uma run válida. Tactic Bass: **Increase Competence Set**.

**Resultado Esperado**
> Cron retentado no mesmo dia reaproveita a run anterior em vez de re-disparar Conexos.

**Métricas de sucesso**
- `# fan-outs duplicados em retry do cron`: 1 por retry → 0

**Risco de não fazer**: pressão em sessões Conexos em incidente; ERP rejeita login do tenant.

**Dependências**: availability-1 (sem cron, retry de cron não acontece).

---

## P1 — Alto

### [availability-3] Distinguir "indisponível" de "vazio" no fallback do `/gestao` no frontend

**QA**: Availability
**Tactic alvo**: Exception Detection
**Esforço**: S
**Findings**: F-availability-4

**Problema**
> `fetchGestaoPermutas` em `src/frontend/lib/api.ts:45-47` substitui um payload vazio do backend por um fixture de demonstração. Estado vazio legítimo (ingestão rodou e não há pendências) também é coberto pela fixture, e o usuário só percebe pelo badge "fonte: fixture".

**Melhoria Proposta**
> Separar os caminhos: (a) erro HTTP / `throw` → fixture, com toast `info` "modo demonstração"; (b) 200 vazio → renderizar EmptyState real ("Nenhuma pendência hoje"); (c) qualquer fixture exibida deve mostrar banner persistente, não apenas o badge `fonte`. Tactic Bass: **Exception Detection**.

**Resultado Esperado**
> Vazio legítimo ≠ falha; usuário não confunde fixture com banco. Eventos de fallback observáveis no console (e idealmente em uma métrica frontend).

**Métricas de sucesso**
- `# caminhos onde vazio == fallback`: 1 → 0

**Risco de não fazer**: analista opera sobre fixture acreditando ser produção (compliance / auditoria).

**Dependências**: nenhuma.

---

### [availability-5] Timeout explícito em todas as chamadas Conexos antes do RetryExecutor

**QA**: Availability
**Tactic alvo**: Retry + Timestamp
**Esforço**: S
**Findings**: F-availability-6

**Problema**
> O `ConexosClient` envolve cada chamada em `RetryExecutor`, mas não declara timeout; o axios subjacente em `LegacyConexosShape` pode pendurar a conexão indefinidamente e o retry nunca dispara.

**Melhoria Proposta**
> Garantir `timeout: 30_000ms` (ou outro acordado) no axios do legacy client, e adicionar `Promise.race` defensivo no `RetryExecutor.execute` no `ConexosClient` (não nos paths Postgres). Cobrir com teste fake-timer. Tactic Bass: **Retry pressupõe Timestamp/Timeout**.

**Resultado Esperado**
> Hang no Conexos = falha em ≤ 30s, virando retry e em seguida `ConexosError`, deixando o `BoundedConcurrency` abortar o resto.

**Métricas de sucesso**
- `# clients externos com timeout explícito`: 0 → 1

**Risco de não fazer**: job preso por horas sem alarme (composto com F-availability-2).

**Dependências**: requer leitura do `LegacyConexosShape` (fora do escopo deste review).

---

### [deployability-1] Adicionar advisory lock ao MigrationRunner e consolidar UMA origem de migrações em produção

**QA**: Deployability
**Tactic alvo**: Idempotent deploys / Logical Grouping
**Esforço**: S
**Findings**: F-deployability-1

**Problema**
> Migrations rodam tanto no passo CI `npm run migrate` quanto no `bootstrapAppContainer` do Express. O runner não usa `pg_advisory_lock` — duas instâncias subindo em paralelo (cenário blue/green ou autoscale futuro) podem disparar `MigrationRunner.run()` simultâneo e abortar boot por PK duplicada em `schema_migrations`.

**Melhoria Proposta**
> 1) Envolver `MigrationRunner.run()` em `pg_try_advisory_lock(<hash>)` + `pg_advisory_unlock` (mesmo padrão usado em `PermutaRelationalRepository.persistIngestRun`). 2) Decidir UM caminho oficial: ou só CI (`appContainer.ts` apenas `init()` o pool) ou só boot. Recomendado: manter o passo CI como gate (fail-fast pré-deploy) e remover o `MigrationRunner.run()` de `appContainer.ts` (deixando apenas o `init()` do pool) — passo CI já bloqueia o deploy hook em caso de erro.

**Resultado Esperado**
> Migrations rodam exatamente 1x por deploy, com lock impedindo corrida. 2 caminhos → 1 caminho oficial; advisory lock presente.

**Métricas de sucesso**
- caminhos de execução de migrate em produção: 2 → 1
- advisory locks protegendo migrate: 0 → 1

**Risco de não fazer**: incidente de boot quando o Render mover para multi-instância ou quando rodarmos blue/green (alvo Terraform já prevê isso).

**Dependências**: nenhuma.

---

### [deployability-2] Agendar o cron `job:ingest-permutas` em produção (Render Cron ou GitHub Actions `schedule`)

**QA**: Deployability
**Tactic alvo**: Script Deployment Commands / Physical Grouping
**Esforço**: S (Render Cron) / M (EventBridge no alvo)
**Findings**: F-deployability-2

**Problema**
> A Fase B persiste fatos relacionais (`permuta_adiantamento`, `permuta_invoice`, `permuta_casamento`) consumidos por `GET /permutas/gestao`. A ingestão é executada apenas via `npm run job:ingest-permutas`, sem scheduler. O CRON line no header do job é só documentação; nenhum agendamento ativo significa que `/gestao` mostra vazio ou stale em prod.

**Melhoria Proposta**
> Curto prazo (estado atual Render): criar um **Render Cron Job** apontando para `npm run job:ingest-permutas` (`0 6 * * *` UTC) — outra opção é GitHub Actions `schedule` invocando a mesma rota via webhook protegido. Alvo (Lambda): EventBridge Rule + Lambda dedicado em `src/backend/lambda/job/ingestPermutas.ts` (já alinhado ao roadmap do CLAUDE.md). Atualizar `CHANGELOG.md` documentando o cron ativo.

**Resultado Esperado**
> Job dispara diariamente sem intervenção humana; `/gestao` reflete dados de D-1 ao começar o expediente Columbia.

**Métricas de sucesso**
- cron agendado em prod: 0 → 1
- latência de "mudança no Conexos" → "visível em /gestao": indefinida → ≤ 24h

**Risco de não fazer**: a Fase B fica visualmente quebrada em produção; defeito percebido pelo cliente em vez da equipe.

**Dependências**: secret de conexão Postgres já existir no scheduler (já existe no Render para o web service).

---

### [fault-tolerance-1] Unir TX relacional + snapshot back-compat na mesma transação (ou registrar compensação documentada)

**QA**: Fault Tolerance
**Tactic alvo**: Compensating Transaction; Recovery — Backward
**Esforço**: M (opção A) / S (opção B)
**Findings**: F-fault-tolerance-1, F-fault-tolerance-2

**Problema**
> Hoje, `IngestaoPermutasService.executar` commita o relacional (TX1, L114) e depois inicia `snapshotRepository.persistRun` (TX2, L128). Se TX2 falhar, o relacional fica `success` mas o catch grava um SEGUNDO header `error` no mesmo `flow_id`, e o `/painel` continua servindo a versão anterior — divergência silenciosa entre `/gestao` e `/painel` sobre o mesmo conjunto financeiro.

**Melhoria Proposta**
> Opção A (preferida): expor `withTransaction` reentrante ou um `persistRunInTx` em `PermutaSnapshotRepository` para que `IngestaoPermutasService` chame ambos os repos dentro do mesmo `persistIngestRun` (uma única TX cobre o cabeçalho + fatos relacionais + casamento + sweep + snapshot back-compat). Opção B (interina): tratar a falha do snapshot como cenário aceito de forward-recovery — não emitir `throw`, logar `BUSINESS_WARN` estruturado com `flowId`/`ingestRunId` e NÃO inserir cabeçalho `error` (o relacional está consistente). Em ambos os casos, esclarecer no docstring que o snapshot é back-compat e tem semântica de eventual consistency.

**Resultado Esperado**
> Após uma falha de TX2 (ou TX combinada), o estado do DB é binário: ou ambos os modelos refletem o run, ou nenhum. `permuta_eleicao_run` não terá `flow_id` com headers `success` E `error` simultâneos.

**Métricas de sucesso**
- Cenários de teste cobrindo "TX1 commitou + TX2 falha": 0 → ≥1
- Drift `count(/gestao) ≠ count(/painel)` observado em produção: indefinido → 0

**Risco de não fazer**: em 6 meses, com volume aumentando, a probabilidade de uma falha intermediária entre TX1 e TX2 acumula — analista pega case na tela errada e executa permuta sobre invoice obsoleta.

**Dependências**: nenhuma — refator local a `IngestaoPermutasService` + `PermutaSnapshotRepository`.

---

### [fault-tolerance-2] Adicionar `UNIQUE(flow_id, kind)` em `permuta_eleicao_run` (migration 0005)

**QA**: Fault Tolerance
**Tactic alvo**: Sanity Checking
**Esforço**: S
**Findings**: F-fault-tolerance-2, F-fault-tolerance-1

**Problema**
> `permuta_eleicao_run.flow_id` é `TEXT NOT NULL` sem unicidade. O catch da ingestão (e simetricamente o catch da eleição) podem produzir 2 headers para o mesmo run lógico (`success` + `error`), e a invariante O6 "1 run = 1 registro auditável" é violável sem que o DB se oponha.

**Melhoria Proposta**
> Criar `migrations/0005_permuta_eleicao_run_unique.sql` adicionando `ALTER TABLE permuta_eleicao_run ADD CONSTRAINT uq_run_flow_kind UNIQUE (flow_id, kind);`. Antes, executar uma query de auditoria/saneamento manual para deduplicar headers órfãos pré-existentes (estratégia: manter o mais recente por `finished_at`, mover os antigos para tabela de quarentena). Tactic alvo: **Sanity Checking** (no nível de constraint DB).

**Resultado Esperado**
> Qualquer caminho de código que tentar persistir um header duplicado falha com erro Postgres de violação de UNIQUE, surfaceando o bug em vez de mascará-lo. Auditoria O6 ganha garantia formal de unicidade.

**Métricas de sucesso**
- Rows com `flow_id, kind` duplicado em `permuta_eleicao_run`: indefinido (sem query) → 0 (constraint impede)
- Falhas de catch que mascarariam o segundo header agora explícitas no log: → 100%

**Risco de não fazer**: auditoria sobre runs específicas vira ambígua; consultas `WHERE flow_id=$x` retornam N rows sem aviso.

**Dependências**: depende do levantamento prévio de duplicados existentes (one-shot, idempotente).

---

### [fault-tolerance-4] Adicionar job de reconciliação relacional × snapshot + detector de duplo header

**QA**: Fault Tolerance
**Tactic alvo**: Reconcile
**Esforço**: M
**Findings**: F-fault-tolerance-4, F-fault-tolerance-1, F-fault-tolerance-2

**Problema**
> Enquanto `/painel` (back-compat) e `/gestao` (Fase B) coexistirem, qualquer falha intermediária entre as duas escritas produz drift silencioso. Não há job que (a) compare contagem de candidatas ativas no relacional × snapshot do último `success`, ou (b) detecte `permuta_eleicao_run` com >1 header por `flow_id`.

**Melhoria Proposta**
> Criar `src/backend/jobs/reconcile-permutas.ts` rodando após `ingest-permutas` (cron defasado): (a) `SELECT flow_id, COUNT(*) FROM permuta_eleicao_run GROUP BY flow_id, kind HAVING COUNT(*) > 1` → se >0, `logService.error` com `type=BUSINESS_ERROR` e listar `flow_id`s; (b) comparar `count(*) FROM permuta_adiantamento WHERE NOT stale` com a contagem do último snapshot `success` — se delta > tolerância documentada, `logService.warn`. Job é READ-ONLY. Tactic alvo: **Reconcile**.

**Resultado Esperado**
> Drift entre `/gestao` e `/painel` deixa de ser silencioso: vira log estruturado consumível por alerta (CloudWatch após primeira tenancia, ou Render logs no atual). MTTR de "a tela mente" cai de "quando o analista notar" para "no próximo ciclo do job".

**Métricas de sucesso**
- Jobs de reconciliação ativos: 0 → 1
- Drift médio detectado e alertado: indefinido → instrumentado

**Risco de não fazer**: se F-1/F-2 não forem corrigidos ANTES, o drift acumula silenciosamente. Job é o salvo-conduto de detecção mesmo se as causas-raiz demorarem.

**Dependências**: melhor após F-2 (UNIQUE constraint reduz superfície), mas independente.

---

### [integrability-2] Tornar `valorMoedaNegociada` consistentemente disponível (ou explicitamente `null`) para candidatas bloqueadas

**QA**: Integrability
**Tactic alvo**: Tailor Interface
**Esforço**: S
**Findings**: F-integrability-2

**Problema**
> `EleicaoPermutasService.computeVariacao` só chama `listTitulosAPagar` para candidatas `elegivel + invoiceCasada`. Bloqueadas chegam ao DTO com `valorMoedaNegociada` undefined → renderizadas como `USD 0` na tela, indistinguíveis de "valor real é zero". Analista não consegue diferenciar "não consultado" de "zero".

**Melhoria Proposta**
> Tomar uma das duas decisões e documentar no `Gestao.ts`:
> 1. **Always-fetch**: chamar `listTitulosAPagar(adiantamento.docCod)` também para bloqueadas (custo: +N chamadas Conexos por run, mitigado por `BoundedConcurrency`); OU
> 2. **Explicit null**: trocar `valorMoedaNegociada: number` por `number | null` no contrato e renderizar `—` na UI quando `null`. Mais barato e honesto.
> Opção 2 é a escolha recomendada pelo risco/custo. Update em `interface/permutas/Gestao.ts:15,29`, `GestaoPermutasService.ts:99,113` (remover `?? 0`), `frontend/lib/types.ts`, e `lib/permutas-fixture.ts` para usar `null` em pelo menos 1 bloqueada.

**Resultado Esperado**
> `pendentes` bloqueadas mostram `—` na coluna "Valor Moeda Negociada" em vez de `USD 0`. UX previsível e sem inferência ambígua.

**Métricas de sucesso**
- Linhas bloqueadas com `valorMoedaNegociada: 0` "fake": 100% → 0%
- Tempo de resposta de "por que está zerado?" em treino: medido após release

**Risco de não fazer**: analista interpreta valores como zerados, confunde decisões de baixa e cria tickets de suporte recorrentes.

**Dependências**: integrability-1 (alinha o contrato em um único schema).

---

### [integrability-3] Parse Zod na resposta de `GET /permutas/gestao` no frontend (e flag de fallback explícito)

**QA**: Integrability
**Tactic alvo**: Encapsulate, Configure Behavior
**Esforço**: S
**Findings**: F-integrability-3, F-integrability-6

**Problema**
> `lib/api.ts:44` faz `as Partial<GestaoPermutasResponse>` e mascara qualquer divergência via `?? 0`/`?? []`. Pior, o fallback para `gestaoPermutasFixture` dispara em qualquer JSON com arrays vazios, sem aviso — corre-se risco real de demo rodar com fixture achando que é produção.

**Melhoria Proposta**
> 1. Reusar o schema do card integrability-1 para `gestaoPermutasResponseSchema.parse(json)`. Se falhar → `throw` (não cair para fixture);
> 2. Promover o fallback fixture a flag explícita `NEXT_PUBLIC_USE_FIXTURE_FALLBACK=true` (default `false`). Quando `false` e o backend falhar, mostrar `EmptyState`/`ErrorState` em vez de fixture;
> 3. `console.warn` quando o fixture for usado, com motivo concreto.

**Resultado Esperado**
> Demo de produção não pode silenciosamente usar dados sintéticos. Drift de shape vira erro visível na tela com mensagem do Zod.

**Métricas de sucesso**
- Chamadas Zod no boundary frontend: 0 → ≥ 1 por endpoint
- Fallback fixture ativado sem flag: sim → não

**Risco de não fazer**: demo de aceite com sponsor pode rodar com fixture e validar feature falsamente.

**Dependências**: integrability-1.

---

### [integrability-1] Compartilhar contrato `GestaoPermutasResponse` entre backend e frontend (gerar OU validar com Zod compartilhado)

**QA**: Integrability
**Tactic alvo**: Contract Testing, Tailor Interface
**Esforço**: M
**Findings**: F-integrability-1, F-integrability-3

**Problema**
> Backend `interface/permutas/Gestao.ts` e frontend `lib/types.ts` mantêm 8 interfaces idênticas, copiadas manualmente. Já existe uma divergência aceita (`fonte`) sem nenhum teste que detecte drift. Próximo campo adicionado vai quebrar em runtime no JSX, silenciado por `?? 0`/`?? []` no `lib/api.ts`.

**Melhoria Proposta**
> Definir o contrato em **um único lugar**: criar `src/shared/contracts/permutas/gestao.ts` com schemas Zod (`gestaoPermutasResponseSchema`) e exportar os types via `z.infer`. Backend e frontend importam o mesmo arquivo (ou via pacote npm interno, se o monorepo não permitir import cruzado direto — então gerar `.d.ts` no build). Adicionar test `gestao.contract.test.ts` que: (a) carrega uma fixture canônica, (b) faz `gestaoPermutasResponseSchema.parse`, (c) confere que o tipo casa com o que `GestaoPermutasService.exporGestao` produz (snapshot test).

**Resultado Esperado**
> Drift de shape backend↔frontend é capturado no `npm test` antes do PR. 0 interfaces duplicadas.

**Métricas de sucesso**
- Interfaces duplicadas: 8 → 0
- Tests de contrato: 0 → ≥ 1 (parse-and-compare)
- Tempo de detecção de drift: manual review → CI fail

**Risco de não fazer**: em 6 meses, com Fase C/D adicionando colunas (valor BRL, observação, status do analista expandido), pelo menos 1 incidente de "tela em branco em produção" por drift silenciado.

**Dependências**: definir convenção do monorepo para shared code (hoje `src/backend` e `src/frontend` são packages separados sem alias compartilhado).

---

### [modifiability-1] Extrair `chunked<T>` e `UPSERT_CHUNK` para uma lib compartilhada de repositório

**QA**: Modifiability
**Tactic alvo**: Abstract Common Services
**Esforço**: S
**Findings**: F-modifiability-1, F-modifiability-7

**Problema**
> O helper `chunked<T>(items, size)` e a constante de chunk-size (500) estão duplicados literalmente entre `PermutaRelationalRepository.ts:80-87` e `PermutaSnapshotRepository.ts:52-59`. Qualquer ajuste de teto do wire Postgres exige tocar 2 arquivos com risco de divergência silenciosa.

**Melhoria Proposta**
> Criar `src/backend/domain/libs/db/chunked.ts` com a função `chunked<T>` (Abstract Common Services) e a constante `DEFAULT_UPSERT_CHUNK_SIZE` (com comentário explicando o cálculo `500 × cols ≈ placeholders` e o teto wire Postgres). Importar nos dois repositórios; remover as duas cópias locais. Manter a possibilidade de cada repo passar um override de tamanho ao chamar o helper.

**Resultado Esperado**
> 1 única definição de `chunked` no codebase. Constante única, comentada. Próxima entidade ingerida (Popula GED) reusa sem copy-paste.

**Métricas de sucesso**
- Cópias do helper `chunked`: 2 → 1
- Constantes de chunk-size duplicadas: 2 → 1

**Risco de não fazer**: cada nova entidade ingerida copia a função; chance de divergência cresce.

**Dependências**: nenhuma.

---

### [modifiability-2] Introduzir helper `bulkUpsert` declarativo e reduzir 4 funções de upsert chunk a especificações

**QA**: Modifiability
**Tactic alvo**: Abstract Common Services
**Esforço**: M
**Findings**: F-modifiability-2, F-modifiability-3

**Problema**
> `PermutaRelationalRepository` repete 4× o idioma "build tuples → build params nomeados `$col_i` → `INSERT…ON CONFLICT…DO UPDATE`" para Adiantamento, Invoice, Declaracao e Casamento (linhas 172-383). Cada nova entidade da ingestão (Fase C, SISPAG, GED) força ~50 LOC de copy-paste, e mudanças transversais (ex.: adicionar `tenant_id`, trocar `now()` por timestamp explícito) precisam ser feitas em 4 lugares.

**Melhoria Proposta**
> Extrair um helper `bulkUpsert(tx, { table, columns, conflictTarget, updateColumns, rows, toParams })` em `src/backend/domain/libs/db/bulkUpsert.ts` (Abstract Common Services + Encapsulate). Cada método público de `PermutaRelationalRepository` vira uma chamada declarativa: declara a tabela, as colunas, o `ON CONFLICT`, a função que extrai params do row, e invoca o helper — o helper cuida do chunking, da montagem de tuples e do SQL final. Mantém SQL parametrizado (Rule #5) e o teste atual continua válido.

**Resultado Esperado**
> `PermutaRelationalRepository.ts` cai de 512 LOC para ~250 LOC. Adicionar uma 5ª entidade vira ~30 LOC (1 spec + 1 mapper). Mudanças transversais (auditoria, multi-tenant) tocam 1 lugar.

**Métricas de sucesso**
- LOC `PermutaRelationalRepository.ts`: 512 → ≤ 300
- Cópias do padrão "tuples + params + INSERT…ON CONFLICT": 4 → 0 (1 helper)
- Esforço para adicionar uma nova entidade ingerida: ~50 LOC → ~30 LOC

**Risco de não fazer**: dívida endurece quando SISPAG/GED replicarem o template; cada feature futura paga ~1d a mais.

**Dependências**: idealmente após [modifiability-1].

---

### [modifiability-3] Dividir `PermutaRelationalRepository` em writes (ingestão) e reads (gestão)

**QA**: Modifiability
**Tactic alvo**: Split Module, Increase Semantic Coherence
**Esforço**: M
**Findings**: F-modifiability-3

**Problema**
> `PermutaRelationalRepository.ts:100-512` mistura 4 entidades, sweep stale, recompute de casamento e leituras da tela Gestão. PRs de ingestão e PRs de gestão colidem no mesmo arquivo; localização de mudança é difusa.

**Melhoria Proposta**
> Dividir em dois repositórios coesos (Split Module + Increase Semantic Coherence): (1) `PermutaIngestaoRepository` — `persistIngestRun`, `insertIngestRunHeader`, `upsert*`, `replaceAutoCasamentos`, `markStale`; (2) `PermutaGestaoReadRepository` — `listAdiantamentosAtivos`, `listInvoicesEmAberto`, `listCasamentos`, `findAdiantamento` + mappers row→obj. Os tipos de row (Row interfaces) podem ficar num arquivo `types.ts` compartilhado.

**Resultado Esperado**
> Mudanças em writes não tocam reads. Cada repositório vira mais simples de testar isoladamente. Localização do "onde mexer" fica óbvia pela URL do PR.

**Métricas de sucesso**
- Maior arquivo do escopo Permutas Fase B: 512 LOC → ≤ 300 LOC
- Entidades por repositório: 4 → ≤ 2 (writes) e ≤ 0 entidades de write no repo de reads
- Colisões de merge esperadas entre PRs de ingestão vs. gestão: alta → baixa

**Risco de não fazer**: o arquivo continua crescendo cada vez que a Gestão pede uma nova view ou a ingestão ganha uma entidade.

**Dependências**: melhor após [modifiability-2].

---

### [performance-1] Paginar `GET /permutas/gestao` e cap-ar listas no repositório

**QA**: Performance
**Tactic alvo**: Limit Event Response
**Esforço**: M
**Findings**: F-performance-1, F-performance-7

**Problema**
> `listAdiantamentosAtivos`, `listInvoicesEmAberto` e `listCasamentos` rodam sem `LIMIT`. Cada hit em `/gestao` carrega 100% da base ativa, junta em memória e serializa o JSON inteiro. Vai degradar p95 e travar o pool de 5 conexões com poucos refreshes simultâneos quando a base crescer.

**Melhoria Proposta**
> Adicionar `LIMIT $limit OFFSET $offset` (default 200, max 1000) nos três `selectMany` de leitura em `PermutaRelationalRepository`; expor paginação no contrato `/permutas/gestao` (`?page=&pageSize=`) e devolver `totais.totalRows`. Paralelo: adicionar índices de cobertura para o `ORDER BY` (`permuta_adiantamento` por `(aging_days DESC NULLS LAST, doc_cod)` já parcialmente coberto pelo índice parcial; revisar com EXPLAIN).

**Resultado Esperado**
> Cada hit transfere ≤ 200 rows × 3 listas em vez do total. p95 de `/gestao` 800 ms → ≤ 300 ms na base atual e independe do crescimento futuro.

**Métricas de sucesso**
- Rows transferidas em 1 hit `/gestao`: full-base → ≤ 200 × 3
- p95 `/gestao`: baseline atual → ≤ 300 ms
- Pool utilization durante refresh concorrente: 100% em request única → ≤ 20%

**Risco de não fazer**: tela vira inutilizável quando a base cruzar ~5 k adiantamentos ativos; pool saturado bloqueia ingestão.

**Dependências**: alinhar contrato com frontend (`src/frontend/app/permutas/gestao`).

---

### [performance-2] Trocar `DELETE FROM permuta_casamento` por `TRUNCATE` ou recompute incremental

**QA**: Performance
**Tactic alvo**: Reduce Overhead, Increase Resource Efficiency
**Esforço**: S (TRUNCATE) / M (delta incremental)
**Findings**: F-performance-2

**Problema**
> `replaceAutoCasamentos` faz `DELETE FROM permuta_casamento` (full-table) seguido de re-INSERT de tudo, **dentro do advisory lock + tx**. Gera dead tuples = 100% da tabela por run, força autovacuum constante, e estende o lock-hold proporcional ao volume. O `DELETE` não é `TRUNCATE`-equivalente em uso de espaço.

**Melhoria Proposta**
> Curto prazo: substituir o `DELETE` por `TRUNCATE permuta_casamento RESTART IDENTITY` (recicla páginas direto, zero dead tuples, locks de tabela em vez de row-locks). Médio prazo: recompute por delta — comparar `(invoice_doc_cod, adiantamento_doc_cod)` da run atual com a tabela e fazer `INSERT ... ON CONFLICT DO NOTHING` para novos + `DELETE WHERE NOT IN (set atual)` para órfãos, evitando reescrever casamentos imutáveis.

**Resultado Esperado**
> Fase write de casamento ≤ 500 ms (baseline a medir). Dead tuples na `permuta_casamento` após run: 100% → 0% (TRUNCATE) ou ≤ 10% (delta).

**Métricas de sucesso**
- Lock-hold da fase write: medir baseline → −30% mínimo após TRUNCATE
- `n_dead_tup` em `permuta_casamento` (pg_stat_user_tables) pós-run: ~totalCasamentos → 0

**Risco de não fazer**: ingestão diária fica progressivamente mais lenta; lock-hold cresce; bloat de índice exige `REINDEX` manual.

**Dependências**: instrumentação de `durationMs` por fase.

---

### [performance-3] Aplicar `statement_timeout` / `lock_timeout` / `idle_in_transaction_session_timeout` nas sessões do pool

**QA**: Performance
**Tactic alvo**: Bound Execution Times
**Esforço**: S
**Findings**: F-performance-3

**Problema**
> `withAdvisoryLock` libera o lock no `finally`, mas se o `write` ficar pendurado (rede, deadlock no autovacuum, query lenta), o lock permanece adquirido até o cliente terminar. Não há timeout defensivo. Segunda ingestão concorrente cai em `permuta ingest advisory lock busy` e a primeira pode ficar indefinidamente travada.

**Melhoria Proposta**
> No `PostgreeDatabaseClient.init`, configurar `Pool` com hook de pós-conexão que executa `SET statement_timeout = '60s'; SET lock_timeout = '5s'; SET idle_in_transaction_session_timeout = '30s';` em cada novo client. Especificamente para a sessão do advisory lock, aplicar um cap explícito (ex.: 120 s).

**Resultado Esperado**
> Ingestão "stuck" aborta automaticamente em ≤ 60 s e libera o lock. MTTR de `advisory lock busy` em produção: manual (kill sessão) → 0 (auto-abort).

**Métricas de sucesso**
- Worst-case lock-hold: ilimitado → ≤ 120 s
- Sessões `idle in transaction` > 30s: possíveis → 0

**Risco de não fazer**: incidente de produção exige acesso ao DB para `pg_terminate_backend`.

**Dependências**: alinhar com Availability (cross-QA).

---

### [performance-4] Adicionar índice em `last_ingest_run_id` para acelerar o sweep `markStale`

**QA**: Performance
**Tactic alvo**: Reduce Overhead
**Esforço**: S
**Findings**: F-performance-4

**Problema**
> `markStale` faz 3× `UPDATE ... WHERE last_ingest_run_id IS DISTINCT FROM $runId AND NOT stale` dentro do lock+tx. Não existe índice em `last_ingest_run_id` nas três tabelas; é seq scan. Custo baixo hoje, linear no crescimento.

**Melhoria Proposta**
> Em nova migration `0005_permuta_relational_indexes.sql`, criar índice parcial `CREATE INDEX idx_<tabela>_run_active ON <tabela> (last_ingest_run_id) WHERE NOT stale` para `permuta_adiantamento`, `permuta_invoice` e `permuta_declaracao_importacao`. O predicado parcial casa diretamente com o WHERE do UPDATE.

**Resultado Esperado**
> Cada `UPDATE` do sweep usa index scan em vez de seq scan; latência do sweep ≤ 100 ms total no volume atual (baseline a medir).

**Métricas de sucesso**
- `markStale` durationMs: baseline → ≤ 100 ms
- Plan de EXPLAIN: Seq Scan → Index Scan em `idx_*_run_active`

**Risco de não fazer**: lock-hold cresce com base; `/gestao` é mais lento ao lado de ingestão grande.

**Dependências**: cross-QA com Modifiability.

---

### [security-1] Adicionar autorização (RBAC/tenant) no `POST /processar` e na tabela `permuta_processamento`

**QA**: Security
**Tactic alvo**: Authorize Actors, Separate Entities
**Esforço**: M
**Findings**: F-security-1

**Problema**
> Hoje, qualquer JWT Supabase válido com `aud=authenticated` consegue marcar qualquer `docCod` como `processado`. Não há check de role, perfil ou tenant. No estado-alvo (uma conta AWS por cliente) sem coluna `tenant_id`, a primeira fatia multi-tenant herda um ator A capaz de mexer no fato do ator B. O endpoint UPSERTa em chave natural compartilhada por todos os clientes.

**Melhoria Proposta**
> Tactic: **Authorize Actors** + **Separate Entities**. Adicionar (a) claim de role/perfil no JWT Supabase (`role`/`app_metadata.permutas_role`); (b) middleware `requirePermutasRole(['analista','supervisor'])` aplicado ao `POST /processar`; (c) coluna `tenant_id`/`client_id` em `permuta_processamento` (e nos fatos), populada a partir do JWT, validada server-side antes do UPSERT. Arquivos: `routes/permutas.ts`, novo `http/authz.ts`, migration `0005_*_tenant_scope.sql`.

**Resultado Esperado**
> Endpoints com autorização: 0/2 → 2/2. UPSERT no `permuta_processamento` falha (403/404) quando o `docCod` não pertence ao tenant do JWT. Trilha de auditoria distingue ator legítimo de ator transversal.

**Métricas de sucesso**
- Endpoints da Fase B com check de role: 0/2 → 2/2
- Colunas de tenant nos fatos da Fase B: 0/4 tabelas → 4/4

**Risco de não fazer**: na primeira fatia multi-tenant, um analista do cliente A consegue alterar o estado do cliente B. O incidente vira ticket P0 retroativo + reescrita do schema sob pressão.

**Dependências**: alinhar com a decisão de SSO/RBAC da proposta (institucional).

---

### [testability-1] Adicionar teste de unidade para `jobs/ingest-permutas.ts`

**QA**: Testability
**Tactic alvo**: Specialized Interfaces
**Esforço**: S
**Findings**: F-testability-1

**Problema**
> O entrypoint do cron diário (`jobs/ingest-permutas.ts`) é o único caminho de ingestão em produção e não tem nenhum teste. Mudanças no `triggeredBy: 'cron'`, no log line, ou no `process.exit` só são detectadas via observação de logs.

**Melhoria Proposta**
> Extrair `main()` para função exportada (sem `process.exit`) e testar com `IngestaoPermutasService` mockado via `container.registerInstance` (mesmo padrão de `routes/permutas.test.ts`). Validar: (a) chama `executar({ triggeredBy: 'cron' })`; (b) loga `[ingest-permutas] run …` com os totais; (c) re-lança erro do service (deixa o wrapper decidir o exit code). Tactic Bass alvo: **Specialized Interfaces**.

**Resultado Esperado**
> `jobs/ingest-permutas.test.ts` com ≥ 3 casos (happy / compute fail / advisory-lock-busy). Test ratio `jobs/`: **0.00 → 1.00**.

**Métricas de sucesso**
- Testes em `jobs/`: 0 → ≥ 3
- Test-file ratio `jobs/`: 0.00 → 1.00

**Risco de não fazer**: regressão no cron daily só descoberta via fatos relacionais defasados; analista decide permuta com snapshot velho.

**Dependências**: nenhuma.

---

### [testability-2] Suite de integração SQL para `PermutaRelationalRepository` (Postgres efêmero)

**QA**: Testability
**Tactic alvo**: Sandbox
**Esforço**: M
**Findings**: F-testability-2

**Problema**
> As migrations 0003/0004 só são exercidas em produção via `npm run migrate` do CI. UPSERT semantics, `ON CONFLICT (doc_cod) DO UPDATE`, `CHECK (kind IN ('eleicao','ingest'))`, advisory lock e ROLLBACK do `withTransaction` são fé — não verificação. Uma DDL incompatível com o SQL do repository quebra o deploy, não o PR.

**Melhoria Proposta**
> Criar `PermutaRelationalRepository.integration.test.ts` usando `Testcontainers` ou um `docker-compose.test.yml` minimal (postgres:16-alpine). Rodar `runMigrations.ts` no `beforeAll`, exercer: (1) `persistIngestRun` happy → `permuta_adiantamento.stale=false`; (2) segundo `persistIngestRun` com `withAdvisoryLock` ocupado → erro tipado; (3) `markStale` muda apenas linhas com `last_ingest_run_id` distinto; (4) ROLLBACK em falha do `write` deixa fatos last-good intactos. Habilitar via job CI separado (`backend-integration`). Tactic Bass: **Sandbox + Executable Assertions**.

**Resultado Esperado**
> 0 → ≥ 5 casos integrados; CI passa a falhar em PR quando a migration diverge do SQL do repository.

**Métricas de sucesso**
- Testes integrados na fatia: 0 → ≥ 5
- Migrations cobertas por execução em CI (não-prod): 0/4 → 4/4

**Risco de não fazer**: deploy bloqueado por erro de DDL pego apenas pelo `npm run migrate` antes do Render redeploy.

**Dependências**: image Docker Postgres no runner CI.

---

### [testability-3] Introduzir `ClockProvider` injetável para zerar `new Date()` em services

**QA**: Testability
**Tactic alvo**: Limit Non-Determinism
**Esforço**: S
**Findings**: F-testability-3

**Problema**
> 7 chamadas a `new Date()` em sources da fatia (4 só em `IngestaoPermutasService.executar`) impedem que testes afirmem invariantes exatas sobre `startedAt`/`finishedAt`/`geradoEm`/`processadoEm`. Os testes hoje contornam com `typeof === 'string'` e `expect.any(Date)` — auditoria O6 fica fora de gate.

**Melhoria Proposta**
> Criar `domain/libs/ClockProvider.ts` (`@singleton @injectable`) com `now(): Date`. Injetar em `IngestaoPermutasService`, `GestaoPermutasService`, `EleicaoPermutasService`, `PermutaProcessamentoRepository`. Testes passam a usar `{ now: () => new Date('2026-06-18T12:00Z') }` como mock. Tactic Bass: **Limit Non-Determinism**.

**Resultado Esperado**
> `new Date()` direto em sources da fatia: **7 → 0**. Testes asseguram igualdade exata de timestamps em `IngestRunHeader` e `geradoEm`.

**Métricas de sucesso**
- `new Date()` em `src/backend/domain/{service,repository}/permutas/`: 7 → 0
- Casos com assert exato de timestamp em `IngestaoPermutasService.test.ts`: 0 → ≥ 2

**Risco de não fazer**: bug de timezone/format chegando em produção; reconciliação `permuta_eleicao_run.finished_at` × `permuta_processamento.processado_em` divergente.

**Dependências**: nenhuma.

---

### [availability-4] Compartilhar o advisory lock entre ingest e eleicao para evitar fan-out Conexos paralelo

**QA**: Availability
**Tactic alvo**: Transactions
**Esforço**: M
**Findings**: F-availability-5

**Problema**
> A ingestão (`INGEST_LOCK_KEY=918273645`) e a eleição manual (`advisoryLockKey(idempotencyKey)`) usam keys diferentes; nada impede que cron e analista disparem fan-outs simultâneos contra o mesmo Conexos.

**Melhoria Proposta**
> Introduzir um lock-key adicional `CONEXOS_FANOUT_LOCK` adquirido por AMBOS os caminhos (ingest e eleicao) ANTES de chamar `computeCandidatas`. Em "lock busy", o segundo caminho retorna a última run como replay. Tactic Bass: **Transactions / Prevent Faults**.

**Resultado Esperado**
> No máximo 1 fan-out Conexos em voo por tenant; pool de sessões Conexos protegido em coexistência cron × botão.

**Métricas de sucesso**
- `# fan-outs simultâneos possíveis`: 2 → 1

**Risco de não fazer**: incidente cumulativo se Conexos rate-limit reduzir; baixa probabilidade enquanto Render é single-instance.

**Dependências**: availability-1.

---

## P2 — Médio

### [availability-6] Retry transacional para a ingestão em falha transitória de conexão Postgres

**QA**: Availability
**Tactic alvo**: Retry
**Esforço**: M
**Findings**: F-availability-7

**Problema**
> `withTransaction` no `PostgreeDatabaseClient` não tem `RetryExecutor` — só o `query` plano (linhas `196-201`) tem. Uma queda de conexão durante a tx de ingestão (Supavisor transaction mode) força o operador a reagendar manualmente.

**Melhoria Proposta**
> Envolver `IngestaoPermutasService.executar` (ou o `persistIngestRun` no repositório) num `RetryExecutor` com 1 tentativa adicional e backoff, **mas só** para erros transientes (`isTransientConnectionError`). NÃO retentar `ConexosError` originado fora da tx — isso já é função da run seguinte. Tactic Bass: **Retry + State Resynchronization**.

**Resultado Esperado**
> Falha transitória de Postgres não desperdiça o fan-out Conexos já executado nesta run.

**Métricas de sucesso**
- `# falhas de Postgres transientes que viram fan-out perdido`: 100% → 0

**Risco de não fazer**: depende da estabilidade do Supavisor; aceitar por enquanto e revisar pós-monitoramento.

**Dependências**: availability-1.

---

### [availability-7] Métrica de saúde: stale-ratio e idade do último run em painel operacional

**QA**: Availability
**Tactic alvo**: Condition Monitoring
**Esforço**: S
**Findings**: F-availability-1, F-availability-2

**Problema**
> Não há gauge externo que mostre quantos fatos estão `stale=true` nem quando foi o último `permuta_eleicao_run` com `kind='ingest'` e `status='success'`. A saúde do sistema é hoje inferida lendo o banco direto.

**Melhoria Proposta**
> Endpoint `GET /health/ingest` (read-only) devolvendo: `lastRunId`, `lastRunFinishedAt`, `stalePercentByEntity`, `totalAdiantamentosAtivos`. Plugar no fixture de monitor (UptimeRobot/Cronitor) e no header da tela `/gestao` (badge "atualizado em…"). Tactic Bass: **Condition Monitoring**.

**Resultado Esperado**
> Operador e analista veem a frescura do dado sem abrir o banco; alerta automático quando stale > X% ou idade > 26h.

**Métricas de sucesso**
- `# painéis de saúde do job`: 0 → 1
- `# campos de frescura na tela`: 0 → 1

**Risco de não fazer**: incidente prolongado descoberto pelo usuário em vez de pelo time.

**Dependências**: nenhuma.

---

### [deployability-3] Escrever runbook de rollback da Fase B no CHANGELOG/docs

**QA**: Deployability
**Tactic alvo**: Rollback
**Esforço**: S
**Findings**: F-deployability-3

**Problema**
> 0003 e 0004 são forward-only e aditivas. O app v0.2.0 (Fase A) ainda funciona após aplicar essas migrations porque o `/painel` segue lendo o snapshot legado. Mas isso não está documentado em lugar nenhum, então em incidente o operador pode reagir mal (ex.: `DROP TABLE permuta_casamento` durante pânico → quebra o próximo deploy).

**Melhoria Proposta**
> Adicionar seção "Rollback" em `CHANGELOG.md` para v0.3.0 da Fase B descrevendo: (a) redeploy do app anterior é seguro sem reverter schema; (b) se reversão de schema for exigida por compliance/limpeza, fornecer script `migrations/down/0003_permuta_relational_down.sql` (DROP em ordem inversa, com `IF EXISTS`). Adicionar `docs/runbooks/permutas-rollback.md` com passo-a-passo Render.

**Resultado Esperado**
> Operador tem instruções em 1 clique; MTTR de incidente reduzido.

**Métricas de sucesso**
- runbooks Permutas Fase B: 0 → 1

**Risco de não fazer**: incidente prolongado por hesitação do operador (ou pior: dano colateral por DDL improvisada).

**Dependências**: nenhuma.

---

### [deployability-4] Aplicar bump de versão lockstep (v0.2.0 → v0.3.0) + entrada no CHANGELOG antes de mergear a Fase B

**QA**: Deployability
**Tactic alvo**: Reproducible builds / Deployment observability
**Esforço**: S
**Findings**: F-deployability-4

**Problema**
> Esta Fase B é `feat` em `src/` (novo serviço, novas rotas, novas migrations). Pelas green-criteria #10 do CLAUDE.md, o pipe exige bump lockstep FE/BE para v0.3.0 + entrada no CHANGELOG no commit `chore(release): v0.3.0`. Hoje ambos `package.json` ainda estão em 0.2.0; o `/health` reportará versão errada em prod.

**Melhoria Proposta**
> Rodar `scripts/bump-version.ps1 -Execute -Bump minor` (ou equivalente), gerar commit `chore(release): v0.3.0` + atualizar `CHANGELOG.md` com a seção da Fase B (modelo relacional + ingestão + processamento + cron documentado). Garantir `ci.yml:tag-release` crie tag `v0.3.0` no push para main.

**Resultado Esperado**
> `/health.version` = `0.3.0` ≠ `0.2.0`; tag GitHub Releases `v0.3.0` criada; bisect e audit-trail viáveis.

**Métricas de sucesso**
- versão FE/BE: 0.2.0 → 0.3.0
- entradas no CHANGELOG.md: 2 → 3
- tags publicadas: `v0.2.0` → `v0.2.0` + `v0.3.0`

**Risco de não fazer**: a Inviolable Rule é violada; futuras releases ficam com numeração esticada/ambígua.

**Dependências**: nenhuma — é gate de PR.

---

### [deployability-5] Tornar o smoke test pós-deploy mandatório (falhar o job se `RENDER_BACKEND_URL` ausente)

**QA**: Deployability
**Tactic alvo**: Deployment observability
**Esforço**: S
**Findings**: F-deployability-5

**Problema**
> O step "Smoke test deployed backend (/health)" usa `exit 0` quando o segredo está vazio, gerando apenas warning. Em uma feature como a Fase B que altera schema, smoke é o único sentinela pós-deploy — se for skipado, um erro de boot por migration pode passar batido até o cliente.

**Melhoria Proposta**
> Trocar o `exit 0` por `exit 1` quando o segredo faltar (no mínimo `::error::`). Documentar no `README.md` ou `docs/deploy.md` qual o nome do segredo. Opcionalmente, adicionar smoke test específico de Fase B: `GET /permutas/gestao` retornando 200/401 (não 500) — para confirmar que a query do novo repositório casa com o schema 0003.

**Resultado Esperado**
> Smoke test sempre roda; CI falha se segredo estiver ausente; opcionalmente endpoint Fase B é validado.

**Métricas de sucesso**
- smoke obrigatório: ⚠️ skipa → ✅ mandatório

**Risco de não fazer**: deploy verde com app quebrado; cliente reporta antes do dashboard.

**Dependências**: provisionar `RENDER_BACKEND_URL`.

---

### [fault-tolerance-3] Logar a falha do header de erro engolido pelo `catch` interno

**QA**: Fault Tolerance
**Tactic alvo**: Condition Monitoring
**Esforço**: S
**Findings**: F-fault-tolerance-3

**Problema**
> No catch externo de `IngestaoPermutasService.executar`, o `insertIngestRunHeader` está envolto em `try { … } catch { /* engole */ }` (linhas 159-174). Se o INSERT do header falhar, NENHUM sinal estruturado é emitido — o log subsequente cobre só o erro original. Operador investigando perde tempo procurando por um runId vazio.

**Melhoria Proposta**
> Substituir o `catch {}` por um catch que chama `logService.warn({ type: LOG_TYPE.BUSINESS_WARN, message: 'permuta ingest audit header write failed', data: { flowId, originalError: message, headerError: ... } })`. Não re-lançar — preservar o comportamento de "o erro original ganha prioridade". Tactic alvo: **Condition Monitoring**.

**Resultado Esperado**
> Falhas duplas (compute falhou + audit header falhou) deixam dois logs estruturados correlacionados pelo `flowId`, encurtando o MTTR de incidentes onde o DB ficou indisponível.

**Métricas de sucesso**
- % de cenários de falha dupla com 2 logs correlacionados: 0% → 100%
- Linhas perdidas (`catch {}` vazio) no `IngestaoPermutasService`: 1 → 0

**Risco de não fazer**: em incidente real de DB indisponível, troubleshooting depende de adivinhar — debt de observabilidade.

**Dependências**: nenhuma.

---

### [integrability-4] Aplicar Zod nos mappers `mapDocPagar` e `listTitulosAPagar` do `ConexosClient`

**QA**: Integrability
**Tactic alvo**: Encapsulate, Contract Testing (provider)
**Esforço**: S
**Findings**: F-integrability-4, F-integrability-2

**Problema**
> `listAdiantamentosProforma` já usa `com298RowSchema.parse` (boa prática). Mas `listFinanceiroAPagar` (invoices) e `listTitulosAPagar` (origem do `valorMoedaNegociada`) coagem campos sem validar shape. Se o Conexos renomear `titMnyValorMneg` ou `docEspNumero`, o campo cai para `undefined` e propaga até a UI como `0` ou docCod.

**Melhoria Proposta**
> Criar `com308TituloRowSchema` e `com298DocRowSchema` em `domain/client/schemas/permutas/` (ou no próprio `ConexosClient.ts` perto dos outros). Aplicar `.parse(row)` no início de `listTitulosAPagar:1051` e `mapDocPagar:1242`. Em caso de parse fail, `ConexosError` carregando `endpoint` + amostra do campo violado (sem PII de exportador).

**Resultado Esperado**
> Mudança de schema do Conexos vira erro claro com `endpoint` na trilha, em vez de regressão silenciosa.

**Métricas de sucesso**
- Cobertura Zod em mappers do `com298`/`com308`: 33% → 100%
- `# de regressões detectadas em probe vs. em produção`: monitorar

**Risco de não fazer**: próximo upgrade Conexos repete o ciclo do probe `cdiDtaCi` (P0-4) — detecção custosa, manual.

**Dependências**: nenhuma.

---

### [integrability-6] Tornar fallback fixture explícito por env-flag e limpar PII (exportadores reais) do `permutas-fixture.ts`

**QA**: Integrability
**Tactic alvo**: Configure Behavior (cross-link Security)
**Esforço**: S
**Findings**: F-integrability-6, F-integrability-3

**Problema**
> `permutas-fixture.ts` foi semeado com nomes de exportadores reais ("DBP PIPING CO.,LTD", "NORMET OY", "QINGDAO COVENANT", "CENTENO INTERNATIONAL") e referências reais sondadas no dev tenant Columbia. Está versionado e dispara automaticamente sempre que `fetchGestaoPermutas` vê arrays vazios. Risco PII + risco demo silencioso.

**Melhoria Proposta**
> 1. Substituir nomes/referências reais por fictícios óbvios ("ACME EXPORTERS", `CT-DEMO-001`). O fixture continua útil como demo; perde a aparência de produção;
> 2. Casar com integrability-3 (flag `NEXT_PUBLIC_USE_FIXTURE_FALLBACK`);
> 3. Adicionar comentário no topo do arquivo lembrando: "este arquivo NUNCA recebe dados de tenant real".

**Resultado Esperado**
> PII fora do VCS. Fallback usado intencionalmente, com tela diferenciada.

**Métricas de sucesso**
- Nomes reais de cliente em fixture: ≥ 4 → 0
- Fallback acionável só com flag explícita

**Risco de não fazer**: cross-flag para `qa-security` — risco persistente de PII em VCS + risco de demo falsa.

**Dependências**: integrability-3.

---

### [modifiability-4] Consolidar mappers `*Row` ↔ objeto num utilitário `pickDefined`

**QA**: Modifiability
**Tactic alvo**: Abstract Common Services
**Esforço**: S
**Findings**: F-modifiability-4

**Problema**
> O idioma `...(x !== undefined ? { y: x } : {})` aparece ~30× em `IngestaoPermutasService.ts:186-286` (objeto→row) e o simétrico `...(r.x != null ? { y: T(r.x) } : {})` aparece ~25× em `PermutaRelationalRepository.ts:459-511` (row→objeto). Cada novo campo nullable é adicionado em 2 lugares com risco de drift entre TS e schema.

**Melhoria Proposta**
> Extrair um helper `pickDefined<T>(spec)` em `src/backend/domain/libs/object/pickDefined.ts` (Abstract Common Services) que recebe um mapa `{ chave: valor | undefined }` e devolve só os pares definidos. Reescrever os mappers em 1-3 linhas cada. Opcional: helper análogo `pickNonNull` para o lado row→obj.

**Resultado Esperado**
> Cada mapper vira ~10 LOC em vez de ~30. Adicionar campo nullable toca 1 linha no spec.

**Métricas de sucesso**
- Repetições do idioma `...(x !== undefined ? { y: x } : {})`: ~55 → ≤ 10

**Risco de não fazer**: cada novo campo da ontologia adiciona ~30 min de copy-paste.

**Dependências**: nenhuma.

---

### [modifiability-6] Quebrar `EleicaoPermutasService` em orquestrador + colaborador `PermutaFanoutService`

**QA**: Modifiability
**Tactic alvo**: Split Module, Increase Semantic Coherence
**Esforço**: M
**Findings**: F-modifiability-5

**Problema**
> `EleicaoPermutasService.ts` está em 599 LOC reunindo idempotency-replay (`executar`, `loadRunAsResult`, `advisoryLockKey`), persistência de run (`runEleicao`), fan-out Conexos (`computeCandidatas`, `processFilial`, `fetchDeclaracoesBatched`, `fetchInvoicesBatched`, `buildCandidata`) e auxiliares. À medida que SISPAG/GED replicarem o padrão `computeCandidatas`-like, o serviço continuará crescendo.

**Melhoria Proposta**
> Extrair um `PermutaFanoutService` (Split Module) com `computeCandidatas`, `processFilial`, `fetchDeclaracoesBatched`, `fetchInvoicesBatched`, `buildCandidata`, `countByMotivo`. O `EleicaoPermutasService` fica apenas com `executar` / `runEleicao` / `loadRunAsResult` / `advisoryLockKey`. `IngestaoPermutasService` passa a depender do `PermutaFanoutService` diretamente (a relação `Ingestao → Eleicao` some — ela já é só para reusar `computeCandidatas`).

**Resultado Esperado**
> `EleicaoPermutasService` cai de 599 → ~280 LOC. Acoplamento direto `Ingestao → Eleicao` (semanticamente estranho — ingestão não depende de eleição, depende do fan-out) some.

**Métricas de sucesso**
- LOC `EleicaoPermutasService.ts`: 599 → ≤ 300
- Fan-in de `EleicaoPermutasService` em código non-test: 2 → 1
- Fan-in de novo `PermutaFanoutService`: 2 (Eleicao + Ingestao)

**Risco de não fazer**: o serviço continua ganhando massa; testes de Eleicao já estão em 652 LOC, vão ficar mais lentos e quebradiços.

**Dependências**: nenhuma; pode rodar em paralelo aos cards de repositório.

---

### [performance-5] Compartilhar o MESMO PoolClient entre advisory lock e transação na fase write

**QA**: Performance
**Tactic alvo**: Increase Resource Efficiency
**Esforço**: M
**Findings**: F-performance-5

**Problema**
> `withAdvisoryLock` adquire 1 client e, dentro dele, `withTransaction` adquire OUTRO. Durante a fase write da ingestão, 2 dos 5 clients do pool ficam presos. Carga concorrente moderada em `/gestao` esgota o restante.

**Melhoria Proposta**
> Expor variante `withAdvisoryLockAndTransaction(lockKey, fn)` no `PostgreeDatabaseClient` que pega UM client, faz `pg_try_advisory_lock` + `BEGIN` + `fn(tx)` + `COMMIT` + `pg_advisory_unlock` no mesmo client. `PermutaRelationalRepository.persistIngestRun` chama essa variante.

**Resultado Esperado**
> Ingestão segura 1 client (em vez de 2) durante a write window; pool de 5 mantém 4 disponíveis para `/gestao` concorrente.

**Métricas de sucesso**
- Clients in-use durante ingestão: 2 → 1
- p95 `/gestao` em paralelo com ingestão: baseline → ≤ +20% (vs. baseline isolado)

**Risco de não fazer**: pool saturado em pico → requests `/gestao` esperam `connectionTimeoutMillis` e falham com `connection acquisition timeout`.

**Dependências**: refator no client é compartilhado com outros consumidores; cross-QA com Modifiability.

---

### [performance-7] Cache HTTP em `/permutas/gestao` baseado em `last_ingest_run_id`

**QA**: Performance
**Tactic alvo**: Reduce Overhead, Maintain Multiple Copies of Data
**Esforço**: M
**Findings**: F-performance-7

**Problema**
> Cada refresh de `/gestao` re-executa 4 queries e re-monta payload, mesmo sem ingestão nova entre os hits. Não há `ETag`/`Cache-Control` no response.

**Melhoria Proposta**
> Selecionar o `last_ingest_run_id` da run de ingestão mais recente (ou um hash composto `runId + max(updated_at) de permuta_processamento`) e emitir como `ETag` no response do `/gestao`. Cliente envia `If-None-Match`; backend devolve 304 sem refazer as 4 queries (apenas a query de versão).

**Resultado Esperado**
> Refresh em estado-estável: 4 queries → 1 (a de versão). p95 do refresh sem mudança: baseline → ≤ 50 ms (apenas check de versão).

**Métricas de sucesso**
- Queries por refresh sem mudança de estado: 4 → 1
- p95 `/gestao` em modo refresh: baseline → ≤ 50 ms

**Risco de não fazer**: custo persistente; refresh agressivo do frontend amplifica carga sobre DB.

**Dependências**: contrato com frontend; cross-QA com Modifiability.

---

### [security-2] Validar `:docCod` no boundary (Zod + CHECK no schema)

**QA**: Security
**Tactic alvo**: Validate Input
**Esforço**: S
**Findings**: F-security-2

**Problema**
> `POST /permutas/adiantamentos/:docCod/processar` aceita qualquer string como `docCod` — `String(req.params.docCod)` sem regex, sem maxLength. SQL está parametrizado, então não há SQLi, mas o endpoint UPSERTa lixo arbitrário na tabela (PK natural `TEXT` sem `CHECK`). Em log, body inteiro é serializado, então um `docCod` gigante polui stdout.

**Melhoria Proposta**
> Tactic: **Validate Input**. (a) Definir `docCodSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/)` e validar no handler antes de chamar o repositório; (b) adicionar `CHECK (length(adiantamento_doc_cod) BETWEEN 1 AND 64 AND adiantamento_doc_cod ~ '^[A-Za-z0-9._-]+$')` em migration nova; (c) responder 400 com mensagem clara quando inválido. Arquivos: `routes/permutas.ts`, `migrations/0006_*_docCod_check.sql`.

**Resultado Esperado**
> `docCod` validado em 2 camadas (HTTP + DB). Tentativa de UPSERT com payload >64 bytes ou charset inválido é rejeitada antes de tocar o repositório.

**Métricas de sucesso**
- Endpoints da Fase B com validação de path param: 0/1 → 1/1
- Linhas com `docCod` fora do padrão Conexos: ? → 0 (CHECK garante)

**Risco de não fazer**: poluição silenciosa da tabela; relatórios futuros precisam filtrar lixo; debugging de "porque há linhas com `docCod` UUID v4 aleatório?" consome ciclos de operação.

**Dependências**: nenhuma.

---

### [security-3] Trilha de auditoria do "Processar" como append-only (`permuta_processamento_audit`)

**QA**: Security
**Tactic alvo**: Audit Trail
**Esforço**: M
**Findings**: F-security-3

**Problema**
> `upsertProcessamento` faz `ON CONFLICT DO UPDATE` em `processado_por` e `processado_em`. Quando o `docCod` é re-processado, a coluna passa a refletir apenas o último ator. O histórico de quem aprovou primeiro é descartado — a única trilha sobrevivente está nos logs Express stdout do Render, com retenção limitada e sem grep estruturado.

**Melhoria Proposta**
> Tactic: **Audit Trail**. (a) Manter o UPSERT em `permuta_processamento` como "estado atual" (necessário para a tela `/gestao`); (b) adicionar `permuta_processamento_audit (id SERIAL, adiantamento_doc_cod, status, processado_por, processado_em, observacao, created_at)` com INSERT a cada POST — append-only, sem UPDATE/DELETE; (c) `GET /permutas/adiantamentos/:docCod/historico` opcional para consultar. Arquivos: `PermutaProcessamentoRepository.ts`, `migrations/0007_*_processamento_audit.sql`, `routes/permutas.ts`.

**Resultado Esperado**
> Cada POST escreve 2 linhas: 1 UPSERT no estado atual + 1 INSERT no audit. Histórico de actor é recuperável sem depender de stdout. Aplica-se o mesmo padrão preventivamente para frentes futuras (SISPAG/Popula GED).

**Métricas de sucesso**
- Eventos `processar` capturados em DB: 0% → 100%
- Retenção de trilha: stdout Render (~30d) → DB persistente (ilimitado)

**Risco de não fazer**: investigação ex-post (auditoria interna, contestação de cliente) sem evidência objetiva de quem aprovou. Quando SISPAG entrar em produção, o mesmo gap vira P0.

**Dependências**: nenhuma.

---

### [testability-4] Introduzir `IdProvider` injetável (`randomUUID` via DI)

**QA**: Testability
**Tactic alvo**: Limit Non-Determinism
**Esforço**: S
**Findings**: F-testability-4

**Problema**
> `randomUUID()` é chamado direto em 3 sources (`PermutaRelationalRepository.insertIngestRunHeader`, `PermutaSnapshotRepository.persistRun`, `EleicaoPermutasService.executar`). Testes que cobrem `persistIngestRun` precisam consumir o `runId` gerado para depois afirmar — barulho que multiplica.

**Melhoria Proposta**
> `domain/libs/IdProvider.ts` (`@singleton @injectable`) com `uuid(): string`. Mockar nos testes para retornar `'run-1'` previsível. Tactic Bass: **Limit Non-Determinism**.

**Resultado Esperado**
> Sources com `randomUUID()` direto na fatia: **3 → 0**. Testes afirmam `runId === 'run-1'` diretamente em vez de via callback capture.

**Métricas de sucesso**
- `randomUUID()` direto em fontes da fatia: 3 → 0

**Risco de não fazer**: persistência de teste fica mais ruidosa conforme novas runs são adicionadas (SISPAG).

**Dependências**: testability-3.

---

### [testability-5] Elevar `coverageThreshold` em `domain/service/` (branches 60 → 75; lines 88 → 92)

**QA**: Testability
**Tactic alvo**: Executable Assertions
**Esforço**: S
**Findings**: F-testability-6

**Problema**
> O piso de cobertura no `jest.config.cjs` é calibrado por comentário como "just below current". Defende contra regressão maior, mas não força progressão — e 60% de branches em um service que decide auto-casamento financeiro é frouxo.

**Melhoria Proposta**
> Após implementar cards testability-1/2/3, recalibrar `coverageThreshold['./domain/service/']` para `{ lines: 92, branches: 75 }`. Adicionar chave dedicada para `./domain/service/permutas/` em `{ lines: 95, branches: 80 }`. Tactic Bass: **Executable Assertions** (gate).

**Resultado Esperado**
> Branch floor em `domain/service/permutas/`: **60% → 80%**. CI bloqueia PR em qualquer remoção de ramo do hot path.

**Métricas de sucesso**
- Branch threshold `./domain/service/permutas/`: indefinido → 80
- Lines threshold `./domain/service/permutas/`: indefinido → 95

**Risco de não fazer**: ramo de erro / advisory-lock-busy / compute-fail sai do gate sem ninguém notar.

**Dependências**: cards 1-4 que primeiro elevam a cobertura real.

---

### [testability-6] Extrair fixtures Permutas para helper compartilhado e trocar `app.listen(0)` por `supertest(app)`

**QA**: Testability
**Tactic alvo**: Limit Structural Complexity
**Esforço**: M
**Findings**: F-testability-5, F-testability-7

**Problema**
> `EleicaoPermutasService.test.ts` (652 LOC) e `IngestaoPermutasService.test.ts` (224 LOC) duplicam fixtures `PermutaCandidata`. `routes/permutas.test.ts` abre/fecha socket por caso (`app.listen(0)` × 7) — caro e suscetível a flake em runner lento.

**Melhoria Proposta**
> (a) Criar `domain/service/permutas/__fixtures__/candidatas.ts` exportando `elegivelFixture`, `bloqueadaFixture`, `casamentoFixture`. (b) Migrar `routes/permutas.test.ts` para `supertest(app).get('/permutas/painel')` — sem socket. Tactic Bass: **Limit Structural Complexity**.

**Resultado Esperado**
> LOC do maior arquivo de teste da fatia: **652 → ≤ 500**. Sockets abertos em `routes/permutas.test.ts`: **7 → 0**.

**Métricas de sucesso**
- Top test file LOC na fatia: 652 → ≤ 500
- Sockets bound em route tests: 7 → 0

**Risco de não fazer**: drift de fixture entre eleição e ingestão; tempo de CI cresce com cada nova rota.

**Dependências**: nenhuma.

---

## P3 — Baixo

### [deployability-6] Proteger rotas Fase B com feature flag (`enable_permutas_fase_b`)

**QA**: Deployability
**Tactic alvo**: Scale Rollouts (canary)
**Esforço**: S
**Findings**: F-deployability-6

**Problema**
> `GET /permutas/gestao` e `POST /permutas/adiantamentos/:docCod/processar` são exibidas para 100% dos usuários no deploy. Não há toggle para liberar para um piloto antes — rollback exige redeploy do Render (~2 min).

**Melhoria Proposta**
> Adicionar flag `ENABLE_PERMUTAS_FASE_B` ao `EnvironmentProvider` e gatear o mount no `routes/permutas.ts`. Default = `true` em prd quando a feature for sancionada; ligar para 1 analista por vez no piloto. Quando a infra alvo (Terraform multi-tenant) chegar, esta flag vira `has_permutas_fase_b` por tenant — alinhado ao roadmap de 90 dias e ao padrão "Configure Behavior" do Bass.

**Resultado Esperado**
> Rollback de minutos → segundos; canary explicitamente possível por tenant/usuário.

**Métricas de sucesso**
- feature flags governando módulos novos: 0 → 1
- tempo de rollback de feature: ~2min (redeploy) → segundos (toggle)

**Risco de não fazer**: zero canary; cada release vira "tudo ou nada" para a Columbia.

**Dependências**: idealmente aguardar [deployability-2].

---

### [integrability-5] Extrair `httpJson()` em `lib/api.ts` (Abstract Common Services)

**QA**: Integrability
**Tactic alvo**: Abstract Common Services
**Esforço**: S
**Findings**: F-integrability-5, F-integrability-3

**Problema**
> O boilerplate `if (!res.ok) { try {detail} catch{}; throw }` é repetido 3x em `lib/api.ts`. Cada endpoint novo replica ~7 linhas. Política de erro (401 → re-login Supabase, 5xx → toast) tem que ser editada em N pontos.

**Melhoria Proposta**
> Criar `src/frontend/lib/http.ts` com `httpJson<T>(url, init, schema?: ZodSchema<T>)`. Centralizar: auth header, parse JSON, error detail, schema parse. Refatorar as 3 funções existentes para usar.

**Resultado Esperado**
> Cada endpoint novo passa a custar ~3 linhas em vez de ~12. Política de erro centralizada (preparada para refresh token / re-login).

**Métricas de sucesso**
- LOC duplicado de error-handling: ~21 → ~7
- Custo marginal de adicionar endpoint: medir em próximo `/feature-new`

**Risco de não fazer**: Fase C/D vai precisar de 5+ novos endpoints; cada um replica o boilerplate.

**Dependências**: integrability-3.

---

### [modifiability-5] Externalizar `INGEST_LOCK_KEY` e chunk-size via `EnvironmentProvider` com defaults

**QA**: Modifiability
**Tactic alvo**: Defer Binding (configuration files + runtime registration)
**Esforço**: S
**Findings**: F-modifiability-6, F-modifiability-7

**Problema**
> `INGEST_LOCK_KEY = 918273645` está hardcoded em `IngestaoPermutasService.ts:37` sem registry central de lock-keys. O chunk-size de UPSERT é `const = 500` em 2 lugares (`PermutaRelationalRepository.ts:80`, `PermutaSnapshotRepository.ts:52`). Mudar qualquer um exige redeploy (overlap com Deployability).

**Melhoria Proposta**
> (1) Criar `src/backend/domain/libs/locks/AdvisoryLockRegistry.ts` com constantes nomeadas e comentário garantindo unicidade no namespace; manter `INGEST_LOCK_KEY` lá, com espaço pra `SISPAG_LOCK_KEY` etc. (2) Permitir override do chunk-size via `EnvironmentProvider` com default 500 (Defer Binding via configuration files). Não precisa mudar para SSM já; pode viver como env.

**Resultado Esperado**
> Adicionar novo lock-key documentado em 1 lugar; ajustar chunk-size por ambiente sem release.

**Métricas de sucesso**
- Magic numbers de regra de coordenação em services: 1 → 0
- Constantes de chunk-size com valor hardcoded: 2 → 0 (vira default no provider)

**Risco de não fazer**: namespace de lock-keys vira tribal knowledge quando SISPAG/GED entram; ajuste de chunk vira release.

**Dependências**: melhor depois de [modifiability-1].

---

### [performance-6] Consolidar `markStale` em uma CTE WITH para reduzir round-trips no lock

**QA**: Performance
**Tactic alvo**: Reduce Overhead
**Esforço**: S
**Findings**: F-performance-6

**Problema**
> 3 UPDATEs sequenciais dentro do lock+tx: 3 round-trips, 3 planejamentos. Marginal no volume atual mas degrada com escala.

**Melhoria Proposta**
> Reescrever `markStale` como UPDATE composta via CTE: `WITH a AS (UPDATE permuta_adiantamento ... RETURNING 1), i AS (UPDATE permuta_invoice ... RETURNING 1), d AS (UPDATE permuta_declaracao_importacao ... RETURNING 1) SELECT (SELECT count(*) FROM a) + (SELECT count(*) FROM i) + (SELECT count(*) FROM d) AS total`. Um round-trip único.

**Resultado Esperado**
> Round-trips do sweep dentro do lock: 3 → 1. Lock-hold ≤ −20 ms (depende da latência rede DB).

**Métricas de sucesso**
- Round-trips por sweep: 3 → 1

**Risco de não fazer**: nenhum a curto prazo; otimização defensiva.

**Dependências**: depende de [performance-4] (índice) para ver benefício real.

---

### [security-4] Honrar `Idempotency-Key` também no `POST /processar` (paridade com `/eleicao`)

**QA**: Security
**Tactic alvo**: Detect Message Delay
**Esforço**: S
**Findings**: F-security-4

**Problema**
> `POST /eleicao` já lê `Idempotency-Key` do header e dedupe a run. `POST /processar` regrediu — não lê o header, depende apenas da chave natural do UPSERT. Hoje não causa dano (UPSERT é idempotente), mas o handler vai crescer (ex.: disparar permuta no Conexos), e nesse momento o replay vira side-effect.

**Melhoria Proposta**
> Tactic: **Detect Message Delay**. Ler `req.header('Idempotency-Key')` no handler; quando presente, persistir em tabela `permuta_processamento_idempotency (key, doc_cod, response_hash)` para curto-circuitar replays. Frontend (`processarAdiantamento`) gera UUID v4 a cada clique. Arquivos: `routes/permutas.ts`, `frontend/lib/api.ts`, migration nova.

**Resultado Esperado**
> Replays do mesmo `Idempotency-Key` retornam a mesma resposta sem re-executar side-effects. Padrão alinhado com `POST /eleicao`.

**Métricas de sucesso**
- Endpoints mutantes com Idempotency-Key: 1/2 → 2/2

**Risco de não fazer**: quando o handler `/processar` evoluir para tocar Conexos/Nexxera, o replay deixa de ser inofensivo. Refatorar sob pressão depois é mais caro.

**Dependências**: card security-3 (audit) define o canal para registrar replays detectados.

---

### [security-5] Redaction de PII no middleware de log (`req.body`)

**QA**: Security
**Tactic alvo**: Encrypt Data
**Esforço**: S
**Findings**: F-security-5

**Problema**
> O middleware Express em `index.ts:32-50` faz `console.log('[REQ] ... body=' + JSON.stringify(body))` sem mascarar campos. O body do `POST /processar` carrega `invoiceDocCod` e `observacao` (livre — analista pode escrever PII do exportador). Em produção (Render stdout), qualquer pessoa com acesso ao deploy lê. Frentes futuras (SISPAG: conta, CNPJ; GED: dados do exportador) vão herdar o mesmo logger.

**Melhoria Proposta**
> Tactic: **Encrypt Data** (princípio: minimizar PII em logs em claro). Substituir o `console.log` por um logger estruturado com lista de campos sensíveis a redactar (`email`, `observacao`, `cnpj`, `accountNumber`, `body.processadoPor`); truncar bodies >2KB; aplicar `pino` ou expandir o `LogService` já existente. Arquivos: `src/backend/index.ts`, `src/backend/middleware/requestLogger.ts` (novo).

**Resultado Esperado**
> Campos sensíveis aparecem como `[REDACTED]` em stdout; `requestId` continua presente para correlação. Auditoria continua via `permuta_processamento_audit` (card security-3).

**Métricas de sucesso**
- Campos sensíveis vazando em stdout: vários → 0
- Tamanho médio de log por request: ? → ≤2KB

**Risco de não fazer**: cresce a superfície de exposição à medida que SISPAG/Popula GED entram. Compliance/regulação financeira (LGPD) torna isso uma multa potencial.

**Dependências**: nenhuma; é pré-requisito antes das frentes que carregam CNPJ/conta.

---

### [testability-7] Assert de audit-log em 401/422 nas rotas Permutas

**QA**: Testability
**Tactic alvo**: Executable Assertions
**Esforço**: S
**Findings**: F-testability-8

**Problema**
> Os casos 401 em `routes/permutas.test.ts:95-103,250-260` só verificam status code. Nenhum assert de que tentativa não-autenticada foi auditada (`logService.warn`/`error`). Auditoria O6 fica abaixo do declarado na ontologia.

**Melhoria Proposta**
> Mockar `LogService` via `container.registerInstance(LogService, { warn: jest.fn(), error: jest.fn(), info: jest.fn() } as never)` e asserir `warn`/`error` foi chamado com `requestId` + path no caso 401. Idem para 422 (Zod fail no body do `POST /processar`). Tactic Bass: **Executable Assertions**.

**Resultado Esperado**
> Casos 401/422 com assert de log: **0 → ≥ 4** (2 endpoints × {401, 422}).

**Métricas de sucesso**
- Asserts de log em paths de erro nas rotas Permutas: 0 → ≥ 4

**Risco de não fazer**: auditoria de tentativa de processar adiantamento sem auth pode silenciosamente parar de logar.

**Dependências**: nenhuma.
