---
type: regis-review-kanban
run_id: 2026-06-25-1713
total: 35
counts: { p0: 0, p1: 9, p2: 19, p3: 7 }
---

# Kanban — financeiro — 2026-06-25-1713

Feature: `permutas-executar-automaticas` — botão **"Executar todas"** que dispara `POST /permutas/reconciliar-lote` para baixar em LOTE todas as automáticas elegíveis no `fin010`.

> Importável para o Kanban do time. Cada card abaixo já tem Problema / Melhoria Proposta / Resultado Esperado.
> Ordem: P0 (nenhum) → P1 (S → L) → P2 (S → M) → P3 (todos S).

---

## P0 — Crítico

_Nenhum achado P0 neste run. A feature é aprovada para merge/deploy nas condições atuais._

---

## P1 — Alto

### [security-1] Cap server-side de tamanho do lote `/reconciliar-lote`

**QA**: Security
**Tactic alvo**: Limit Exposure
**Esforço**: S
**Findings**: F-security-1

**Problema**
> Hoje o lote itera N adiantamentos sem teto: 1 clique de admin pode disparar dezenas/centenas de escritas no `fin010`. Combinado com `CONEXOS_WRITE_ENABLED=true`, o blast radius é todo o `gestao.casamentos` da janela. O `heavyRouteLimiter` (10 req/min) não ajuda porque é 1 request só.

**Melhoria Proposta**
> Adicionar `MAX_LOTE` (via `EnvironmentProvider`, default 200) em `ReconciliacaoLotePermutaService`. Se `ordem.length > MAX_LOTE`, abortar com erro tipado (HTTP 413) **antes** de chamar o primeiro `reconciliar` e logar a tentativa com `executadoPor`. Tactic: **Limit Exposure**.

**Resultado Esperado**
> Toda execução com universo > MAX_LOTE é rejeitada server-side. Métrica: `# cap server-side`: 0 → 1.

**Métricas de sucesso**
- cap configurável: ausente → presente
- rejeições com `413` quando estourado: 0 → mensurável no log

**Risco de não fazer**
> Um admin (legítimo ou não) cria de uma vez muito mais borderôs do que o financeiro consegue revisar/cancelar; janela de exposição financeira aumenta com o painel.

**Dependências**: Nenhuma

---

### [deployability-1] Introduzir kill-switch sem redeploy para o botão "Executar todas"

**QA**: Deployability
**Tactic alvo**: Feature flag / Surge Protection
**Esforço**: S
**Findings**: F-deployability-1

**Problema**
> O botão que cria borderôs em lote no ERP é governado por `const PROCESSAMENTO_HABILITADO = true` hardcoded no `page.tsx`. Em incidente, a única alternativa é redeploy do FE (minutos) ou desligar `CONEXOS_WRITE_ENABLED` (martelo que paralisa também a baixa individual). MTTR alto para o pior cenário (ação de escrita em lote).

**Melhoria Proposta**
> Adicionar feature flag por env var lida pelo endpoint `GET /permutas/config` (ou similar já existente) e consumida pelo FE no carregamento: e.g., `PERMUTAS_LOTE_ENABLED` (default `true`). Frontend lê na inicialização e desabilita o botão se `false`. Operação de emergência: setar a env var no Render e disparar reload — sem redeploy. Manter `PROCESSAMENTO_HABILITADO` como salvaguarda local para casos em que o backend está fora.

**Resultado Esperado**
> Desligar a ação em prd em ≤1 min, sem redeploy, sem impactar a baixa individual. Botão fica desabilitado com tooltip "Temporariamente indisponível".

**Métricas de sucesso**
- MTTR para desligar botão: ~5 min (redeploy FE) → ≤1 min (toggle env var)
- Impacto colateral em baixa individual ao desligar lote: alto (hoje, via `CONEXOS_WRITE_ENABLED`) → nulo

**Risco de não fazer**
> No primeiro incidente de produção desta ação, o plantonista é forçado a escolher entre "esperar redeploy" e "paralisar toda a escrita do ERP" — ambas custosas.

**Dependências**: Nenhuma

---

### [availability-1] Capar tempo da request de lote (Bound Execution Times) + streaming de progresso via SSE

**QA**: Availability
**Tactic alvo**: Bound Execution Times + Heartbeat + Degradation
**Esforço**: M
**Findings**: F-availability-1, F-availability-5

**Problema**
> A rota `POST /permutas/reconciliar-lote` executa N×~5 chamadas Conexos síncronas, sem cap de tempo agregado nem `Bound Execution Times` por item — o pior caso são 200s por adto. O proxy do Render corta o socket antes do backend terminar (janela não documentada localmente; estimativa 5–10min), e o front fica órfão da resposta. Sem progresso visível, o analista não sabe quantos adtos foram concluídos e re-clica, dobrando o fan-out ao Conexos.

**Melhoria Proposta**
> (1) Adicionar `AbortController` no handler com `setTimeout` baseado em `LOTE_DEADLINE_MS` (env, default 240_000) — quando estourar, parar de iterar, gravar resumo parcial e devolver `{ truncated: true, ... }`. (2) Adicionar uma rota irmã `GET /permutas/reconciliar-lote/stream` que use o `SseProgressReporter` (`src/backend/domain/libs/progress/SseProgressReporter.ts`) já implementado: emitir `event: progress` por adto, `event: result` no fim com o agregado, `event: end` para fechar. O front consome via `EventSource`. Heartbeat de progresso mantém o socket vivo no proxy.

**Resultado Esperado**
> Lote de 26 adtos termina em ≤ deadline declarado (default 4min) OU devolve resumo parcial com `truncated=true`. Front mostra barra "X/N processados" em real-time. Proxy não corta o socket. Métrica: 0 `502/504` em lotes de até 50 adtos.

**Métricas de sucesso**
- Cap agregado da request: ausente → ≤ 240s (configurável)
- Eventos de progresso por adto: 0/lote → 1/adto
- Taxa de timeout do proxy em lote ≥ 30 adtos: não medível hoje → 0%

**Risco de não fazer**
> À medida que o volume cresce (Permutas atinge regime estável em 50–100 adtos/dia projetado), a feature vira inutilizável em prod no Render — analista vai voltar a clicar adto-a-adto.

**Dependências**: medir 1 run real cronometrada em prod para fixar o `LOTE_DEADLINE_MS` (sem isso, é chute).

---

### [fault-tolerance-1] Bloquear re-POST de baixa quando a execução está em `reconciling` órfã (idempotência da janela cinza)

**QA**: Fault Tolerance
**Tactic alvo**: Idempotent Replay + Reconcile
**Esforço**: M
**Findings**: F-fault-tolerance-1, F-fault-tolerance-3

**Problema**
> O wrapper de lote herda a idempotência write-ahead por par, mas a chave bloqueia apenas pares `settled`. Pares que crasharam entre `setBorCod` e `markSettled` (status `reconciling` com `bor_cod` mas sem `bxa_cod_seq`) NÃO bloqueiam um re-fire: `beginExecution` faz UPSERT mantendo `reconciling` e o serviço segue para `executarBaixa` → re-POST de `gravarBaixaPermuta` cria SEGUNDA baixa no mesmo título do mesmo borderô (ou em borderô novo, pois `borCod` é local ao request). Blast radius cresce com o lote (até N pares órfãos por request).

**Melhoria Proposta**
> Em `ReconciliacaoPermutaService.reconciliar`, ANTES de chamar `executarBaixa`, checar se a linha existente tem `bor_cod` preenchido sem `bxa_cod_seq` e idade > THRESHOLD (ex.: 5 min). Nesse caso: (a) consultar `getBordero` + `listarBaixasErp` do borderô existente para descobrir se a baixa já caiu no ERP; (b) se caiu, fazer `markSettled` com o `bxaCodSeq` real (reconcile forward); (c) se não caiu, prosseguir SOMENTE com `borCod` reutilizado (não criar borderô novo); (d) se for o MESMO request (proteção curta), bloquear `skipped`. Documentar em `business-rules/fin010-write-contract.md`. Tactic Bass = Idempotent Replay + Reconcile.

**Resultado Esperado**
> Re-fire do lote pós-timeout NUNCA cria baixa duplicada para um par órfão. Métrica observável: # de pares em `status='reconciling'` órfãos por >10 min que viram baixa duplicada num re-fire = 0 (vs. risco aberto hoje).

**Métricas de sucesso**
- # de baixas duplicadas em re-fire pós-timeout: indefinido (não medido) → 0 (com teste de unidade simulando crash entre passos 7 e 8)
- Cobertura de teste do cenário "reconciling órfão + re-fire": 0 hoje → ≥ 1 caso

**Risco de não fazer**
> Super-pagamento contábil no fin010 a cada vez que o proxy cortar o request bulk; problema escala linearmente com N de automáticas (hoje 26, crescendo).

**Dependências**: idealmente convive com `fault-tolerance-3` (reaper) — mas não depende dele.

---

### [fault-tolerance-2] Honrar `Idempotency-Key` no `POST /reconciliar-lote` (e no `/reconciliar` individual)

**QA**: Fault Tolerance
**Tactic alvo**: Idempotent Replay
**Esforço**: M
**Findings**: F-fault-tolerance-2

**Problema**
> Rota de escrita financeira em lote não lê o header `Idempotency-Key`; só o frontend protege contra duplo-clique (`disabled` no botão). Duplo-fetch (retry interno do navegador, F5, dois browser tabs) cria dois lotes que disputam os mesmos adtos. Combinado com F-fault-tolerance-1, agrava o blast radius.

**Melhoria Proposta**
> Replicar o padrão do `POST /eleicao` (`permutas.ts:139-146`) em `/reconciliar-lote` e em `/adiantamentos/:docCod/reconciliar`. Persistir o request-id + payload-hash em uma tabela curta (ex.: `request_idempotency`) com TTL de 24 h; em re-request com a MESMA key + payload, devolver a resposta cacheada. Frontend já está pronto para gerar a key (pode usar `crypto.randomUUID()` por clique no modal). Tactic Bass = Idempotent Replay no boundary.

**Resultado Esperado**
> 2/2 rotas de escrita financeira aceitam Idempotency-Key (vs. 1/2 hoje); duplo-clique cross-tab ou retry HTTP nunca dispara dois lotes. Métrica: # de borderôs vazios criados por re-request = 0.

**Métricas de sucesso**
- % rotas state-mutating do permutas que honram Idempotency-Key: 1/2 (50%) → 2/2 (100%) para escrita financeira
- Teste e2e cobrindo "duplo POST com a MESMA key responde idem-cache": 0 hoje → 1

**Risco de não fazer**
> Incidentes recorrentes de "executei 2× sem querer" — observado em fluxos manuais análogos, agora amplificado pelo lote.

**Dependências**: Nenhuma

---

### [fault-tolerance-3] Stuck-state reaper para execuções `reconciling` órfãs (re-priorizar do inbox)

**QA**: Fault Tolerance
**Tactic alvo**: Condition Monitoring + Reconcile
**Esforço**: M
**Findings**: F-fault-tolerance-3, F-fault-tolerance-1 (mitigação parcial)

**Problema**
> Já registrado como `F-fault-tolerance-7` na run anterior e como card `fault-tolerance-7` no inbox `permutas-reconciliacao-regis-followups.md`, ainda **aberto**. O lote eleva a probabilidade de criação de órfãos (N pares por request em vez de 1) e a probabilidade de re-fire (analista re-clica quando o request cai). Sem um sweep que enxergue `status='reconciling' AND atualizado_em < now()-interval '30 min'`, a divergência entre trilha local e ERP é silenciosa.

**Melhoria Proposta**
> Implementar `PermutaExecucaoRepository.listStuckReconciling(thresholdMinutes)`. Implementar `StuckReconciliacaoReaperService` que, para cada órfão, consulta `getBordero` + `listarBaixasErp` no ERP e (a) `markSettled` se a baixa caiu (com `bxaCodSeq` real) ou (b) `markError("órfão >30 min — provável timeout do request bulk")` para visibilidade. Quando houver job runner (migration-debt O4, EventBridge alvo), rodar de 10 em 10 min; até lá, expor como rota admin `POST /permutas/reconciliar-orfaos` que o analista chama sob demanda (mesmo padrão do `/ingestao` manual). Tactic = Condition Monitoring + Reconcile.

**Resultado Esperado**
> MTTD (mean-time-to-detect) de um par órfão cai de "indefinido (humano)" para ≤ 10 min (ou ≤ 1 clique admin no provisório). 0 pares órfãos não-visíveis após o run do reaper.

**Métricas de sucesso**
- Jobs/rotas detectores presentes: 0 → 1
- MTTD de órfão: indefinido → ≤ 10 min (com cron) ou ≤ 1 clique admin (provisório)

**Risco de não fazer**
> Drift permanente entre trilha local e fin010 que só vira incidente quando o usuário compara manualmente; com o lote, escala mais rápido.

**Dependências**: convive com `fault-tolerance-1` (a estratégia recomendada lá usa a mesma consulta `getBordero+listarBaixasErp`); pode compartilhar código.

---

### [modifiability-1] Compartilhar contrato `ReconciliarLote*` entre BE e FE (não duplicar à mão)

**QA**: Modifiability
**Tactic alvo**: Abstract Common Services
**Esforço**: M
**Findings**: F-modifiability-1

**Problema**
> Os tipos `ReconciliarLoteResult`/`ReconciliarLoteItem`/`LoteAdiantamentoStatus` estão definidos manualmente nos dois lados (BE `…LotePermutaService.ts:10-36` e FE `types.ts:274-295`). Já é a 4ª iteração de Permutas em que reviews anteriores apontam drift FE↔BE no contrato. Em feature de escrita financeira em lote, divergência de status pode mascarar erros parciais.

**Melhoria Proposta**
> Adotar uma das opções (decisão do Yuri): (a) extrair `src/contracts/permutas.ts` consumido pelos dois package.json via path alias; (b) gerar tipos FE a partir de schemas Zod do BE (`z.infer`); (c) snapshot test que garante shape-equality entre os tipos. Aplica tactic **Abstract Common Services**. Tocar `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts`, `src/frontend/lib/types.ts`, e (se opção a/b) configurar paths/tsconfig.

**Resultado Esperado**
> 1 única definição do contrato do lote (e dos contratos análogos existentes). Mudanças de contrato passam a quebrar typecheck em ambos lados.

**Métricas de sucesso**
- Tipos duplicados FE↔BE em rotas Permutas: 3 (lote) + N (existentes) → 0
- Bugs por drift de contrato Permutas nos últimos 90d (registro no inbox): N → 0

**Risco de não fazer**
> Cada nova rota de Permutas/SISPAG/GED adiciona +3~5 tipos duplicados. Drift silencioso continua aparecendo em prod.

**Dependências**: decisão do Yuri sobre estratégia (path alias × Zod-derived × snapshot).

---

### [performance-1] Quebrar o lote em job assíncrono + endpoint de progresso (poll/SSE)

**QA**: Performance
**Tactic alvo**: Bound Execution Times + Limit Event Response
**Esforço**: M
**Findings**: F-performance-1, F-performance-2, F-performance-4

**Problema**
> Um único `POST /permutas/reconciliar-lote` faz ~130 chamadas síncronas ao Conexos (26 adtos × 5) em uma só request HTTP. Banda projetada 39s (p50) a 195s (p95) — acima do que o proxy do Render aceita sem cortar (~100s). Hoje a idempotência write-ahead torna o sintoma "falha aparente, sucesso parcial real": o analista não sabe quais borderôs ficaram prontos.

**Melhoria Proposta**
> Manter o endpoint atual como **modo síncrono** apenas para `dryRun=true` (rápido — sem chamadas ERP) e introduzir um modo **assíncrono** para a baixa real:
> 1. `POST /permutas/reconciliar-lote` retorna `202 Accepted` com `{ runId }` e dispara o loop em background (no estado-alvo será EventBridge+Lambda; **no atual Express**, usar processo background com persistência em `permuta_execucao` que já existe + um novo `permuta_lote_run` para o agregado).
> 2. `GET /permutas/reconciliar-lote/:runId` devolve `{ status: 'running'|'done'|'error', processados, total, resultados[] }` — o frontend faz polling a cada 2s.
> 3. Frontend mostra "X de N processados" + lista parcial à medida que avança.
> Reusar `ReconciliacaoPermutaService.reconciliar` por adto, exatamente como hoje (continue-on-error + idempotência intactas).

**Resultado Esperado**
> Wall-clock percebido pelo cliente HTTP: 200–400ms (ack do job). Tempo total da execução não muda, mas deixa de bloquear conexão; o analista vê progresso contínuo e nunca recebe "falha de rede" em sucesso parcial real.

**Métricas de sucesso**
- Wall-clock do request HTTP do cliente: ~40–200s (atual) → ≤ 1s (ack)
- % de runs em que o cliente perde a resposta após sucesso parcial: hoje não medido (mas > 0 esperado a partir de N≈40) → 0%
- Feedback de progresso ao usuário: 0 eventos → ≥ 1 a cada 2s

**Risco de não fazer**
> Quando N crescer (onboarding de novas filiais/importadores — roadmap declarado nos resumes), a feature passa a falhar visualmente de forma rotineira; suporte vira gargalo.

**Dependências**: alinhar com qa-availability (mesma raiz: long-running request em proxy com timeout) — coordenar com o card de availability sobre timeout.

---

### [modifiability-2] Quebrar `page.tsx` (2669 LOC) em sub-componentes por aba do painel

**QA**: Modifiability
**Tactic alvo**: Split Module
**Esforço**: L
**Findings**: F-modifiability-2

**Problema**
> `src/frontend/app/permutas/page.tsx` tem 2669 LOC. A cada feature (cliente-filtro, alocação, ingestão, executar-lote) o arquivo ganha mais estado/handler/dialog. Sintoma de god-component. **Pré-existente**, mas o delta deste run agrava (botão "Executar" + estado + dialog).

**Melhoria Proposta**
> Extrair em sub-componentes por responsabilidade: `PermutasAbaAutomaticas`, `PermutasAbaCasamentoManual`, `PermutasAbaPermutaManual`, `PermutasAbaBloqueadas`, `PermutasBarraDeAcoes` (onde mora "Executar todas"). Aplica tactic **Split Module** + **Increase Semantic Coherence**. Mover estado local de cada aba para o sub-componente.

**Resultado Esperado**
> `page.tsx` ≤ 400 LOC (orquestra layout/tabs e providers); cada sub-componente ≤ 500 LOC.

**Métricas de sucesso**
- LOC `page.tsx`: 2669 → ≤ 400
- Conflitos de merge em `page.tsx` por mês: alto → ≤ 1

**Risco de não fazer**
> Feature SISPAG/GED reusará o mesmo padrão → god-component multiplica. Modificar UI vira tarefa de 1d para 3d em 6 meses.

**Dependências**: Cobertura de testes da página antes do refator (cross-link Testability).

---

## P2 — Médio

### [availability-2] Suportar Idempotency-Key na rota de lote (espelho do `/eleicao`)

**QA**: Availability
**Tactic alvo**: Exception Prevention
**Esforço**: S
**Findings**: F-availability-2

**Problema**
> `POST /permutas/reconciliar-lote` não lê o header `Idempotency-Key`, embora o padrão JÁ exista no repositório em `POST /permutas/eleicao` (`routes/permutas.ts:138-147`). Duplo-clique no botão "Executar todas" dispara dois lotes paralelos. A idempotência por-par dentro do serviço evita dupla baixa, mas ambos os lotes fazem N chamadas Conexos cada um e consomem 2/10 da quota do `heavyRouteLimiter` por minuto.

**Melhoria Proposta**
> Replicar em `POST /permutas/reconciliar-lote` o trecho idêntico ao de `/eleicao`: ler header, normalizar, passar para o serviço como `idempotencyKey?: string`. Manter um cache `Map<key, Promise<ReconciliarLoteResult>>` em memória do `ReconciliacaoLotePermutaService` (escopo singleton tsyringe) que reaproveite a Promise em vôo da mesma key. Frontend envia `Idempotency-Key: crypto.randomUUID()` por clique.

**Resultado Esperado**
> Duplo-clique não dobra fan-out Conexos. Métrica observável: chamadas Conexos por clique = N (não 2N).

**Métricas de sucesso**
- Leituras de `Idempotency-Key` em `routes/permutas.ts` reconciliar-lote: 0 → 1
- Fan-out Conexos sob duplo-clique: 2N → N

**Risco de não fazer**
> Invisível hoje (26 adtos, 1 analista); vira P1 quando 3+ analistas operarem em paralelo no fim do mês.

**Dependências**: Nenhuma

---

### [availability-4] `AbortController` no front + botão "Cancelar lote" no diálogo

**QA**: Availability
**Tactic alvo**: Removal from Service
**Esforço**: S
**Findings**: F-availability-4

**Problema**
> `reconciliarLoteAutomaticas` em `src/frontend/lib/api.ts:276-296` faz `fetch` sem `signal`, e o diálogo de confirmação não oferece "Cancelar" depois que o lote inicia. Fechar a aba/recarregar NÃO cancela o trabalho no backend. Em caso de "Conexos travado", a única ação do operador é esperar o timeout do browser (~5min default).

**Melhoria Proposta**
> Adicionar `signal?: AbortSignal` no `reconciliarLoteAutomaticas`. No `executarLote` (`page.tsx:751-776`), criar um `AbortController` por execução, propagar para o fetch, e expor um botão "Cancelar lote" enquanto `executandoLote=true`. Backend: adicionar `req.on('close', () => abortFlag = true)` no handler e checar `abortFlag` no início de cada iteração do laço (`ReconciliacaoLotePermutaService.ts:91`) — termina o lote no próximo limite de adto (não corta a baixa em curso, para preservar atomicidade por par).

**Resultado Esperado**
> Operador pode cancelar uma run que travou em ≤ 1 clique. Métrica: tempo para "abortar lote travado" do operador = ~Inf → ≤ 5s.

**Métricas de sucesso**
- `AbortController` em `lib/api.ts` reconciliar-lote: 0 → 1
- Botão "Cancelar lote" disponível no diálogo durante execução: ausente → presente

**Risco de não fazer**
> Ferramenta percebida como "frágil" — analista evita usar com filtro errado por medo de não conseguir abortar.

**Dependências**: combina com [availability-1] (no SSE, o `EventSource.close()` é o canal natural de aborto).

---

### [security-2] Confirmação reforçada (typed-text) para "Executar todas" quando o lote é grande

**QA**: Security
**Tactic alvo**: Inform Actors
**Esforço**: S
**Findings**: F-security-2

**Problema**
> O botão "Executar todas as automáticas" hoje executa após 1 clique no diálogo, ainda que a descrição diga "irreversível". Em ação irreversível de escrita financeira em massa, 1 clique acidental cria N borderôs cujo reverso é manual.

**Melhoria Proposta**
> No diálogo `confirmLoteOpen` (`frontend/app/permutas/page.tsx:2130`), quando `loteResumo.adtos > 10`, exigir que o usuário digite a palavra "EXECUTAR" (case-sensitive) em um input antes de habilitar o botão. Manter o 1-clique p/ lotes pequenos. Tactic: **Inform Actors** (reforço de UX como controle compensatório de **Limit Exposure**).

**Resultado Esperado**
> Execuções de lote grande passam por 2 etapas (clique + typed-text). Métrica: cliques para acionar > 10 borderôs: 1 → 2.

**Métricas de sucesso**
- typed-confirmation para lote > 10: ausente → presente
- cliques acidentais com efeito > 10 borderôs: possível → improvável

**Risco de não fazer**
> Incidente de "mouse-slip" cria dezenas de borderôs em produção; reverso manual queima horas do financeiro.

**Dependências**: card `security-1` (o limiar e o cap devem conversar entre si)

---

### [performance-2] Paralelizar o lote com pool controlado (p-limit) entre adtos

**QA**: Performance
**Tactic alvo**: Increase Concurrency + Schedule Resources
**Esforço**: S
**Findings**: F-performance-3

**Problema**
> Loop `for...of await` em `ReconciliacaoLotePermutaService.reconciliarLote` processa um adto por vez. Como cada adto é independente (borderô e par adto↔invoice próprios), há oportunidade de rodar 2–4 em paralelo, dividindo o wall-clock proporcionalmente sem mudar a arquitetura.

**Melhoria Proposta**
> Aplicar concorrência limitada (ex.: lib leve `p-limit` ou um pequeno pool manual) no laço de adtos do `reconciliarLote`. Validar **primeiro** com o time/Yuri o nº máximo de sessões simultâneas que o Conexos tolera (sonda real, não chute) — começar conservador (2) e medir. Manter a ordem de logs / agregação determinística por requestId.

**Resultado Esperado**
> Wall-clock do lote: ~40–200s (p50/p95 atual) → ~10–50s (p50/p95) com paralelismo 4. Combinado com performance-1, o tempo de espera percebido pelo analista cai 4× ainda mais.

**Métricas de sucesso**
- Paralelismo dentro do lote: 1 → 2–4 (configurável)
- Wall-clock p50 (N=26): ~39s → ~10–20s

**Risco de não fazer**
> À medida que N cresce, o tempo de execução do lote vira linearmente proporcional a N (vs. ~N/4 com paralelismo).

**Dependências**: confirmar com o Yuri / sonda Conexos o limite de sessões simultâneas. Vale combinar com performance-1 (paralelismo dentro do job assíncrono).

---

### [performance-3] Instrumentar duração por chamada Conexos (`duration_ms` + p50/p95 por endpoint)

**QA**: Performance
**Tactic alvo**: (meta) telemetria — pré-requisito para qualquer outra tactic de Performance
**Esforço**: S
**Findings**: F-performance-5

**Problema**
> Toda a análise desta seção está chutando a latência por chamada Conexos com base em literatura (300ms p50 / 1500ms p95) porque o `ConexosClient` não loga `duration_ms`. Sem o número real, qualquer decisão (deadline, paralelismo, alarme) é palpite.

**Melhoria Proposta**
> Envolver `ConexosClient.postGeneric` / `getGeneric` / `deleteGeneric` em um wrapper que mede `performance.now()` por chamada e loga `{ path, duration_ms, status, requestId }` via `LogService`. Em uma fase 2, agregar p50/p95 por endpoint em CloudWatch/Logflare/qualquer destino que já receba os logs.

**Resultado Esperado**
> 100% das chamadas Conexos com `duration_ms` no log. Dashboard simples mostrando p50/p95 por endpoint do fin010 — input para dimensionar o card performance-2 e para alertar quando p95 degrada.

**Métricas de sucesso**
- Cobertura de telemetria de duração nas chamadas ao Conexos: 0% → 100%
- p50/p95 por endpoint do fin010: indefinido → conhecido (publicado no log estruturado)

**Risco de não fazer**
> Continuamos cegos ao gargalo real; qualquer regressão de latência no Conexos passa despercebida até o usuário reclamar.

**Dependências**: Nenhuma

---

### [performance-4] Bound de execução duro no lote (deadline + cancellation no `req.on('close')`)

**QA**: Performance
**Tactic alvo**: Bound Execution Times
**Esforço**: S
**Findings**: F-performance-4

**Problema**
> O loop do lote não tem deadline próprio. Um adto patológico (5 chamadas no timeout máximo de 40s do `ConexosClient` = 200s sozinho) ou um cliente que fechou a aba não interrompem o processamento. Sem bound, o request gasta sessão do Conexos depois do cliente ter desistido.

**Melhoria Proposta**
> Combinar duas guardas:
> 1. **Deadline duro** por request (ex.: 90s no modo síncrono atual; deixa de fazer sentido se performance-1 for adotado — neste caso, deadline vira do job em si, ex.: 30min).
> 2. **Cancellation** — escutar `req.on('close')` (Express) e marcar uma flag `aborted` no loop; checar a flag antes de cada `await reconciliacaoService.reconciliar(...)` e abortar com graceful "interrompido pelo cliente — N adtos processados".

**Resultado Esperado**
> Nenhuma chamada Conexos ocorre após o cliente fechar a aba. Wall-clock máximo por request limitado e previsível.

**Métricas de sucesso**
- Chamadas Conexos após `req.on('close')`: indefinido → 0
- Wall-clock máximo por request: ilimitado → ≤ 90s (síncrono) / ≤ 30min (job)

**Risco de não fazer**
> Desperdício de recursos do ERP em runs canceladas; runs patológicas sem teto de tempo.

**Dependências**: idealmente posterior a performance-1 (se virar job, o desenho do deadline muda).

---

### [performance-5] Aplicar `heavyRouteLimiter` também no modo "job" (anti-duplo-clique no startJob)

**QA**: Performance
**Tactic alvo**: Limit Event Response
**Esforço**: S
**Findings**: F-performance-1 (pré-requisito para o modo assíncrono ser robusto)

**Problema**
> Hoje o endpoint do lote já tem `heavyRouteLimiter` (10/min por IP) — correto. Ao adotar performance-1 (modo assíncrono), o `POST /reconciliar-lote` vira "leve" (retorna 202 em ms) e pode tentar-se afrouxar o limiter. **Não afrouxar** — manter o limiter porque cada start dispara fan-out pesado no Conexos. Adicionalmente, derivar uma `Idempotency-Key` (mesmo padrão de `/permutas/ingestao` já presente em `routes/permutas.ts:140-147`) para coalescer duplo-cliques no startJob.

**Melhoria Proposta**
> No endpoint `POST /reconciliar-lote` (modo assíncrono) aceitar o header `Idempotency-Key`; se o mesmo `runId` já existe e está `running`, devolver o `runId` existente em vez de iniciar outro lote. Manter o `heavyRouteLimiter` 10/min mesmo no modo assíncrono.

**Resultado Esperado**
> Duplo-clique no botão "Executar todas" reaproveita a run existente — 0 fan-outs Conexos duplicados.

**Métricas de sucesso**
- Runs duplicadas por duplo-clique no botão: indefinido → 0

**Risco de não fazer**
> 2 lotes simultâneos consumindo 2× sessão do Conexos sem necessidade.

**Dependências**: depois de performance-1.

---

### [fault-tolerance-4] Timeout HTTP explícito + heartbeat no `reconciliar-lote` (proteção da janela cinza)

**QA**: Fault Tolerance
**Tactic alvo**: Timeout + Condition Monitoring
**Esforço**: S (para FE+listener; M para a versão start-job)
**Findings**: F-fault-tolerance-4 (e indireto: F-fault-tolerance-1/2)

**Problema**
> O `fetch` do frontend não tem `AbortController`/`signal` — herda o default do browser ou o teto do proxy Render. Para N=26 automáticas, o lote pode levar > 60 s no pior caso (frio do ERP) e ser cortado pelo proxy enquanto o backend continua iterando (sem `req.on('close')` listener). Analista vê "Falha ao executar o lote" e tende a re-clicar, disparando F-fault-tolerance-1/F-fault-tolerance-2.

**Melhoria Proposta**
> Curto prazo: (a) frontend usa `AbortController` com timeout de ~120 s para alinhar com o teto do proxy + mensagem clara "lote demorando — consulte aba Borderôs antes de re-executar"; (b) backend instala `req.on('close', () => { ... })` no handler de `/reconciliar-lote` para abortar a iteração restante quando o cliente desistir (não cancela o adto em voo, mas evita continuar criando borderôs sem o cliente saber). Médio prazo: trocar a resposta síncrona por start-job + polling (`/reconciliar-lote/runs/:runId`) — alinha com o padrão do `/ingestao` manual (ADR-0012). Tactic = Timeout (fim-a-fim) + Condition Monitoring.

**Resultado Esperado**
> Timeout fim-a-fim explícito e consistente entre FE e proxy; mensagem clara reduz re-cliques. Métrica: % de re-cliques pós-timeout cai (medível via log do `executadoPor` no `BUSINESS_INFO` `'permuta batch reconciliation'`).

**Métricas de sucesso**
- Timeout HTTP explícito no `reconciliarLoteAutomaticas`: 0 → 1 (com `AbortController`)
- `req.on('close')` listener no `/reconciliar-lote`: ausente → presente

**Risco de não fazer**
> Re-cliques humanos pós-corte do proxy seguem disparando o caminho de risco de F-fault-tolerance-1.

**Dependências**: cross-ref qa-performance/qa-availability (mesma causa raiz — request síncrono longo); convive com `fault-tolerance-1` e `fault-tolerance-2`.

---

### [integrability-1] Garantir paridade do shape `ReconciliarLoteResult` entre FE e BE

**QA**: Integrability
**Tactic alvo**: Adhere to Standards / Contract testing
**Esforço**: S
**Findings**: F-integrability-1, F-integrability-2

**Problema**
> Tipos `ReconciliarLoteResult`/`ReconciliarLoteItem`/`LoteAdiantamentoStatus` são definidos manualmente nos dois lados (BE `ReconciliacaoLotePermutaService.ts:10-36`, FE `lib/types.ts:275-295`). Risco de drift silencioso em uma ação de escrita financeira em lote.

**Melhoria Proposta**
> Opção S (preferida agora): extrair os tipos do lote para um Zod schema no BE e gerar (ou exportar) o tipo TS consumido pelo FE — ou ao menos adicionar 1 contract test que valide via Zod a resposta real contra o tipo do FE (`safeParse` no fixture). Tactic Bass: Adhere to Standards. Arquivos: `ReconciliacaoLotePermutaService.ts` (extrair schema), `routes/permutas.ts:426-447` (parse na borda de saída se viável), `frontend/lib/types.ts:275-295` (importar/regerar).

**Resultado Esperado**
> Adicionar campo no shape do lote requer mudança em 1 lugar canônico ou quebra teste de espelhamento. Métrica: arquivos com a definição literal de `LoteAdiantamentoStatus` 2 → 1 (ou 2 com teste de paridade green).

**Métricas de sucesso**
- Definições literais do tipo: 2 → 1 (ou 0 drift sob teste)
- Contract test cobrindo `/permutas/reconciliar-lote`: 0 → 1

**Risco de não fazer**
> Regressão silenciosa no diálogo "Executar todas" — analista lê feedback errado sobre baixa real.

**Dependências**: Nenhuma

---

### [integrability-2] Adicionar fixture/contract test do wire-shape `/permutas/reconciliar-lote`

**QA**: Integrability
**Tactic alvo**: Contract testing
**Esforço**: S
**Findings**: F-integrability-2, F-integrability-1

**Problema**
> Testes da rota validam só status code (200/401/403); testes do service usam mocks tipados; FE usa o tipo TS por contrato. Nenhum teste prova que o JSON serializado bate com o tipo consumido. (Cross-QA: Testability.)

**Melhoria Proposta**
> Adicionar 1 caso em `routes/permutas.test.ts` (ou novo `*.contract.test.ts`) que monta um cenário com 2 adtos (1 settled, 1 erro) e valida o body via Zod schema da Card 1. Tactic Bass: Contract testing.

**Resultado Esperado**
> Quebrar o shape do lote no BE causa teste vermelho local antes do PR.

**Métricas de sucesso**
- Contract tests p/ `/reconciliar-lote`: 0 → ≥1

**Risco de não fazer**
> Drift FE/BE só capturado em prod / smoke manual.

**Dependências**: idealmente roda depois ou junto com Card 1.

---

### [integrability-4] Log estruturado per-adto falho no lote

**QA**: Integrability
**Tactic alvo**: Observability of integration failures
**Esforço**: S
**Findings**: F-integrability-4

**Problema**
> `ReconciliacaoLotePermutaService` loga só o agregado (`totalCasos/totalSettled/totalErros/borderos`); erros per-adto saem só no body da resposta. Sem taxonomia, dashboards/alertas de integração com Conexos não enxergam o pico do lote nem distinguem transient vs validation vs lock.

**Melhoria Proposta**
> Adicionar 1 `logService.warn` (ou `error` com `LOG_TYPE.INTEGRATION_*`) por adto falho com `{requestId, adiantamentoDocCod, priCod, kind: 'transient|validation|lock|unknown', message}`. Manter o agregado final. Tactic Bass: Observability of integration failures.

**Resultado Esperado**
> Para cada lote, N falhas geram N linhas de log estruturadas, queryáveis por `requestId`. Métrica: erros per-adto logados / erros per-adto na resposta = 100%.

**Métricas de sucesso**
- Cobertura de log per-adto: 0% → 100% dos falhos
- Campos taxonomizados (`kind`) presentes em 100% dos logs de erro do lote.

**Risco de não fazer**
> Degrada MTTR e dificulta aprendizado sobre falhas reais do `fin010` em escala.

**Dependências**: nenhuma. Cross-QA: Fault Tolerance (observability per-failure) e Testability.

---

### [deployability-3] Escrever runbook de incidente para "Executar todas as automáticas"

**QA**: Deployability
**Tactic alvo**: Rollback + Deployment observability
**Esforço**: S
**Findings**: F-deployability-3

**Problema**
> Não há documento de incidente para a ação mais arriscada do módulo. On-call vai improvisar no pior momento.

**Melhoria Proposta**
> Criar `docs/runbooks/permutas-executar-lote.md` (≤1 página) cobrindo: (1) como desligar o botão (via card 1 quando pronto; via `CONEXOS_WRITE_ENABLED=false` antes); (2) como reverter o PR no Render/Vercel (passos clicáveis); (3) consulta SQL para listar borderôs criados na janela suspeita (`permuta_alocacao_execucao` + `borderos_cache`); (4) critério de re-abertura ("DRY_RUN por 24h após rollback antes de re-habilitar").

**Resultado Esperado**
> MTTR independente do plantonista individual. Qualquer dev do time consegue mitigar em ≤5min seguindo o passo a passo.

**Métricas de sucesso**
- # de runbooks da feature: 0 → 1
- Tempo para localizar procedimento de desligamento: "depende da pessoa" → ≤2min (busca no docs)

**Risco de não fazer**
> Primeiro incidente real vira retrospectiva com "ninguém sabia o procedimento".

**Dependências**: ideal após [deployability-1] (assim o runbook já cita o toggle do botão)

---

### [modifiability-3] Expor knobs de política do lote (cap, abort-on-N-errors, opcional delay)

**QA**: Modifiability
**Tactic alvo**: Defer Binding (Configuration)
**Esforço**: S
**Findings**: F-modifiability-3

**Problema**
> A política do lote (sequencial, sem cap, sem early-abort) é hardcoded em `…LotePermutaService.ts:91-127`. Mudança operacional típica ("abortar após 5 erros consecutivos", "limitar a 50 por chamada para caber no timeout do proxy Render") exige PR + deploy.

**Melhoria Proposta**
> Adicionar campos no `ReconciliarLoteInput` (ou no `EnvironmentProvider`) para `batchMax`, `abortAfterConsecutiveErrors`, `delayBetweenAdtosMs`. Aplica tactic **Defer Binding (Configuration)**. Defaults conservadores; admin pode sobrescrever via body do POST (preferível a env, porque é decisão operacional do analista).

**Resultado Esperado**
> Ajustes de cadência/segurança do lote possíveis sem redeploy. Operador pode rodar `executar` com `abortAfterConsecutiveErrors=3` em emergência.

**Métricas de sucesso**
- Knobs configuráveis do lote: 0 → 3
- Deploys necessários para ajuste de política do lote: 1 → 0

**Risco de não fazer**
> Incidente operacional (ERP lento, falha em cascata) vira correção por deploy. Cross-link Deployability/Fault Tolerance.

**Dependências**: Card de Fault Tolerance sobre circuit-breaker (se existir) precede este.

---

### [testability-1] Cobrir o handler `executarLote` e o diálogo de confirmação no front (Testing Library)

**QA**: Testability
**Tactic alvo**: Executable Assertions
**Esforço**: S
**Findings**: F-testability-1

**Problema**
> O botão "Executar todas" dispara escrita financeira em massa (≈26 borderôs reais). O handler `executarLote` e o `Dialog` de confirmação em `app/permutas/page.tsx` (~750-776, 2129-2160) não têm um único teste. Os 4 ramos de `toast` (`dryRun` / `settled>0` / `erros>0` / `nada a executar`) + o `catch` + o `finally` que destrava o botão estão a uma mudança de regressão silenciosa de virar bug em produção.

**Melhoria Proposta**
> Criar `src/frontend/app/permutas/page.test.tsx` com Testing Library + jsdom: 4 cenários estimulando o handler com `reconciliarLoteAutomaticas` mockada (`jest.mock('@/lib/api')`) — cobre dry-run, sucesso parcial, erro de rede e "nada a executar". Asseverar `screen.getByRole('alert')` (toast/sonner) e que `setExecutandoLote(false)` libera o botão. Aproveitar `fast-check` para gerar combinações `(totalSettled, totalErros)` se vier baixo custo. Bass tactic: **Executable Assertions** + **Limit Non-Determinism**.

**Resultado Esperado**
> Coverage do handler `executarLote` 0% → 100% linhas / ≥80% branches; 0 → ≥4 testes do front no diálogo de confirmação; regressão na mensagem ao analista é detectada pelo CI.

**Métricas de sucesso**
- Testes do front em `permutas/page.tsx`: 0 → ≥4
- Branches cobertos do handler `executarLote`: 0/5 → 5/5

**Risco de não fazer**
> Refactor da UI (ou troca de `sonner` por outro toast) quebra silenciosamente o feedback do lote; analista clica 2× achando que não disparou, gera lote duplicado (mitigado por idempotência do service, mas trilha de auditoria fica suja).

**Dependências**: Nenhuma

---

### [testability-2] Adicionar caso de erro do service na rota `/reconciliar-lote` (5xx + 422)

**QA**: Testability
**Tactic alvo**: Executable Assertions
**Esforço**: S
**Findings**: F-testability-2

**Problema**
> A rota `POST /permutas/reconciliar-lote` (`routes/permutas.test.ts:697-764`) testa 200/401/403. Nenhum `mockRejectedValue` — se `ReconciliacaoLotePermutaService.reconciliarLote` lançar (DB de gestão fora, validador de input falha, race), o caminho do `errorMiddleware` não é exercitado. A rota irmã `/ingestao` cobre esse cenário (`mockRejectedValue(new Error('boom'))` → 500).

**Melhoria Proposta**
> Adicionar 2 casos no `describe('POST /permutas/reconciliar-lote')`: (1) service lança `Error` genérico → 500 + body com `error`; (2) body inválido (ex.: `dryRun: "not-a-bool"`) → 400 do Zod. Espelhar o padrão dos casos `/ingestao` (`routes/permutas.test.ts:166-177`). Bass tactic: **Executable Assertions**.

**Resultado Esperado**
> Casos na rota `/reconciliar-lote` 3 → 5; cobertura do `errorMiddleware` pelo caminho do lote 0 → 1; contrato do Zod do body é defendido por teste.

**Métricas de sucesso**
- Casos na rota: 3 → 5
- Status HTTP cobertos: {200, 401, 403} → {200, 400, 401, 403, 500}

**Risco de não fazer**
> Regressão no shape do erro vaza stack-trace para o front; troca do Zod schema passa silenciosa.

**Dependências**: Nenhuma

---

### [availability-3] Persistir `permuta_lote_run` com `lote_id` na trilha (State Resynchronization)

**QA**: Availability
**Tactic alvo**: State Resynchronization + Timestamp
**Esforço**: M
**Findings**: F-availability-3

**Problema**
> O `ReconciliacaoLotePermutaService` devolve o agregado in-memory; nem o `lote_id` nem o resumo são gravados. Se a request morre (proxy/aba fechada/OOM), os pares individuais sobrevivem em `permuta_alocacao_execucao` mas o conjunto "lote X executado às 14:32 por user Y" é irrecuperável — auditoria só responde por janela de tempo. Re-firing pode rebuscar a gestão e produzir um lote diferente em composição.

**Melhoria Proposta**
> Nova migration `permuta_lote_run` (`id uuid pk, requested_by text, requested_at timestamptz, finished_at timestamptz nullable, summary_json jsonb nullable, status text check in 'running','done','error'`). `ReconciliacaoLotePermutaService.reconciliarLote` insere `running` no início, faz `update finished_at, summary_json, status='done'` no fim. Adicionar coluna `lote_id` em `permuta_alocacao_execucao` (nullable, preenchida pelo lote; null em chamadas avulsas). Novo `GET /permutas/reconciliar-lote/:id` para re-attach.

**Resultado Esperado**
> Auditoria "qual lote agrupou estes 4 borderôs?" responde por `lote_id` (1 query). Re-attach após queda de socket: front pega o último `running` do user no header da página e oferece "Continuar visualizando o lote em andamento".

**Métricas de sucesso**
- Auditoria "lote → borderôs": impossível → 1 query SQL
- Re-attach: impossível → suportado em ≤ 1 request

**Risco de não fazer**
> Explicabilidade frágil hoje, problema real quando o volume passar de 50 lotes/mês com 3+ analistas.

**Dependências**: combina bem com [availability-1] (o `lote_id` é a chave natural do SSE stream). Sobrepõe parcialmente com [security-4] — recomendado implementar como UM card único.

---

### [deployability-2] Exigir aprovação humana no deploy para prd quando a rota é de escrita financeira em lote

**QA**: Deployability
**Tactic alvo**: Scale Rollouts (deploy gating)
**Esforço**: S
**Findings**: F-deployability-2

**Problema**
> `ci.yml` faz CI + tag idempotente, e o deploy real ocorre via webhook Render/Vercel disparado pelo push em `main`. Sem gate humano para uma feature que expõe escrita em lote no `fin010`. Probabilidade de "subiu sem o ops perceber" não é zero.

**Melhoria Proposta**
> Configurar **GitHub Environment "production"** com `required_reviewers` e usar `environment: production` em um job final (`deploy-trigger`) que dispara o webhook do Render/Vercel via `curl`. Manter `dev`/`stg` automáticos. Documentar quem são os reviewers (1 pessoa basta para começar). Alternativa de menor esforço: ativar "Manual Deploy" no Render para o serviço prd (revoga o auto-deploy do webhook).

**Resultado Esperado**
> Releases em prd exigem 1 clique humano. Lead time aceitável (≤15 min de aprovação) trocado por janela de "última chance" de revisão.

**Métricas de sucesso**
- # de aprovações humanas entre `push main` e rota viva em prd: 0 → 1
- # de deploys prd "involuntários" (mergeado sem intenção de release): mensurar baseline com histórico

**Risco de não fazer**
> Em uma equipe pequena, merge precipitado vira release precipitado; a rota de escrita em lote vai pra prd sem que ops esteja monitorando.

**Dependências**: Nenhuma

---

### [security-3] Alarme agregado para anomalias de auth/limit (401/403/429)

**QA**: Security
**Tactic alvo**: Detect Intrusion / Detect Service Denial
**Esforço**: M
**Findings**: F-security-3

**Problema**
> `console.warn` em 401/403 + `429` do `heavyRouteLimiter` vão pro stdout do Render sem agregação/alarme. Burst de probing/abuse contra `/permutas/reconciliar-lote` (ou qualquer rota admin) passa despercebido até inspeção manual.

**Melhoria Proposta**
> Encaminhar logs estruturados (`LogService` BUSINESS_WARN) para um sink agregador (Logtail/Datadog/CloudWatch) e criar 1 alarme por categoria: 401 burst (>20/min), 403 burst (>10/min), 429 burst (>30/min). Notificar via canal on-call. Tactics: **Detect Intrusion**, **Detect Service Denial**.

**Resultado Esperado**
> Tentativas anômalas geram página para o on-call. Métrica: alarmes ativos para 401/403/429: 0 → 3.

**Métricas de sucesso**
- MTTD (mean time to detect) de probing: indeterminado → <15 min
- alarmes configurados: 0 → 3

**Risco de não fazer**
> Insider ou cred-stuffing investe contra o botão mais perigoso sem ser detectado.

**Dependências**: decisão de sink de logs (sai do escopo desta feature)

---

### [security-4] Persistir o lote como entidade auditável (tabela `permuta_lote_execucao`)

**QA**: Security
**Tactic alvo**: Audit Trail
**Esforço**: M
**Findings**: F-security-4

**Problema**
> A trilha agregada de "um lote rodou" só existe em log estruturado (`BUSINESS_INFO: permuta batch reconciliation`). Auditoria retroativa ("quais lotes a Maria disparou em junho? quais borderôs cada um criou?") depende de retenção/parsing de log. Por-item já temos `permuta_alocacao_execucao`, mas o agrupamento "este request criou esta lista de borderôs" se perde.

**Melhoria Proposta**
> Criar tabela `permuta_lote_execucao` (id, request_id, executado_por, iniciado_em, finalizado_em, total_casos, total_settled, total_erros, dry_run, write_enabled) + tabela filha `permuta_lote_item` (FK lote, adiantamento_doc_cod, pri_cod, status, bor_cod, erro). Gravar dentro do `ReconciliacaoLotePermutaService.reconciliarLote` (após o loop). Tactic: **Audit Trail** (cross-ref Fault Tolerance).

**Resultado Esperado**
> 100% dos lotes têm row próprio com lista de borderôs criados. Métrica: % execuções persistidas em tabela: 0% → 100%.

**Métricas de sucesso**
- execuções de lote com persistência tabular: 0 → 100%
- query "lotes por executor por janela": indisponível → 1 SELECT

**Risco de não fazer**
> Investigação de incidente financeiro empaca por falta de evidência agregada; compliance fica vulnerável.

**Dependências**: nenhuma (esquema novo isolado). Sobrepõe parcialmente com [availability-3] — recomendado implementar como UM card único.

---

## P3 — Baixo

### [availability-5] Heartbeat estruturado por-iteração no log do lote (Monitor melhorado)

**QA**: Availability
**Tactic alvo**: Monitor + Heartbeat
**Esforço**: S
**Findings**: F-availability-1 (parcial — observabilidade complementar)

**Problema**
> O lote emite 1 log estruturado no FIM (`ReconciliacaoLotePermutaService.ts:129-141`) e logs por-par dentro do serviço por-adto. Não há log por-iteração no nível do lote — quando uma run trava ou é cortada pelo proxy, não dá para responder "parou em qual adto?" sem cruzar manualmente os logs do `ReconciliacaoPermutaService`.

**Melhoria Proposta**
> Adicionar `LogService.info({ type: LOG_TYPE.BUSINESS_INFO, message: 'permuta batch iter', data: { requestId, lote_id, i, n, docCod, status } })` no fim de cada iteração do `for` em `ReconciliacaoLotePermutaService.ts:91-127`. Pareia naturalmente com [availability-3] (mesmo `lote_id`).

**Resultado Esperado**
> Operador responde "qual adto travou o lote X?" via 1 grep no log do Render. Métrica: linhas estruturadas de progresso por lote = 1 (final) → N+1 (1 por adto + 1 final).

**Métricas de sucesso**
- Logs por adto no nível do lote: 0 → 1
- Tempo para diagnosticar "parou em qual adto": grep cruzado → grep simples

**Risco de não fazer**
> Investigação reativa fica cara conforme o volume cresce.

**Dependências**: melhora muito com [availability-3] (`lote_id` na chave).

---

### [deployability-4] Emitir log estruturado de alto nível para cada execução de lote

**QA**: Deployability
**Tactic alvo**: Deployment observability
**Esforço**: S
**Findings**: F-deployability-4

**Problema**
> Service retorna agregado por response, mas não emite log estruturado dedicado (event tag + métricas) para alerta/filtro no dashboard. Difícil responder "alguém usou em prd? quanto foi criado?" pós-deploy.

**Melhoria Proposta**
> No fim de `ReconciliacaoLotePermutaService.reconciliarLote`, adicionar `logService.info('permutas.lote.executado', { totalAdtos, sucesso, falhas, duracaoMs, executadoPor, dryRun })`. Configurar (em separado) um alerta simples no Render/Sentry: "se `event=permutas.lote.executado` com `dryRun=false` aparecer fora do horário comercial, notificar". Custo zero adicional, observabilidade alta.

**Resultado Esperado**
> Pós-deploy, dá pra responder em segundos: "quantas execuções de lote rodaram nas últimas 24h, com qual taxa de sucesso, quem disparou".

**Métricas de sucesso**
- # de campos estruturados emitidos por execução de lote: 0 → 5
- Tempo para descobrir "rodou em prd?": "varrer logs do request" → consulta filtrada por tag (≤30s)

**Risco de não fazer**
> Decisão "está estável, libera o gate" continua sendo gut-feel.

**Dependências**: Nenhuma

---

### [integrability-3] Pinning de versão na API HTTP interna (rastrear, não bloquear)

**QA**: Integrability
**Tactic alvo**: Versioning strategy
**Esforço**: S
**Findings**: F-integrability-3

**Problema**
> Nenhuma rota `/permutas/*` (incluindo a nova `/reconciliar-lote`) tem prefixo `/v1` ou header `Accept-Version`. Hoje FE+BE deployam lockstep — risco baixo, mas o débito cresce quando 3ª frente (SISPAG/Nexxera, GED) compartilhar a API ou integrar app mobile interno.

**Melhoria Proposta**
> Registrar a decisão (manter sem versão enquanto FE/BE lockstep) numa ADR curta ou nota em `migration-debt.md`. Quando abrir consumidor externo, introduzir `/v1` retroativo + alias. Tactic Bass: Versioning strategy.

**Resultado Esperado**
> Decisão documentada; gatilho explícito para introdução de versão.

**Métricas de sucesso**
- 1 ADR/nota referenciando a decisão sobre versionamento.

**Risco de não fazer**
> Quando precisar versionar, vira retrabalho retroativo.

**Dependências**: Nenhuma

---

### [modifiability-4] Colocalizar derivação `statusDoAdto` com o `ResultadoAlocacao.status` (fonte da verdade)

**QA**: Modifiability
**Tactic alvo**: Generalize Module
**Esforço**: S
**Findings**: F-modifiability-4

**Problema**
> A função `statusDoAdto` em `…LotePermutaService.ts:155-165` deriva o status agregado a partir do `ReconciliarResult`. Se o unitário ganhar um novo status, o lote silenciosamente caí no `'skipped'` em vez de propagar o novo valor.

**Melhoria Proposta**
> Mover `statusDoAdto` para `ReconciliacaoPermutaService` (ou um helper colocalizado com `ReconciliarResult`), exigir exhaustiveness check com `never` no `switch`. Aplica tactic **Generalize Module** / **Abstract Common Services**. Test: novo status no unitário deve quebrar TS no lote.

**Resultado Esperado**
> Adicionar status novo a `ResultadoAlocacao` força atualização explícita no lote (typecheck quebra). Zero drift silencioso.

**Métricas de sucesso**
- Pontos de derivação de status duplicados: 2 → 1
- Exhaustiveness check (`never`) presente no switch: não → sim

**Risco de não fazer**
> Bug latente quando o unitário evoluir; analista vê "skipped" em vez do status real.

**Dependências**: Nenhuma

---

### [performance-6] Padrão de batch-paginated para `resultados[]` quando N for grande

**QA**: Performance
**Tactic alvo**: Reduce Overhead
**Esforço**: S
**Findings**: F-performance-6

**Problema**
> A resposta do lote agrega `resultados[]` (1 item por adto). Hoje N=26 e o payload é pequeno (~5KB). Em onboarding de novas filiais/importadores (roadmap declarado), N pode crescer a 200+ — payload de ~80KB e render pesado no toast/log do frontend.

**Melhoria Proposta**
> Quando o modo assíncrono (performance-1) estiver no ar, o `GET /reconciliar-lote/:runId` deve aceitar `?offset=&limit=` para `resultados[]`. O agregado (`totalSettled`, `totalErros`, `borderos[]`) continua small; só a lista detalhada é paginada.

**Resultado Esperado**
> Payload máximo de qualquer response do progresso ≤ 20KB independente de N.

**Métricas de sucesso**
- Tamanho máximo do payload do progresso: O(N) → O(página)

**Risco de não fazer**
> Somente vira problema com N > 100.

**Dependências**: performance-1.

---

### [testability-3] Asseverar o log de auditoria do lote (executadoPor + agregado)

**QA**: Testability
**Tactic alvo**: Executable Assertions
**Esforço**: S
**Findings**: F-testability-3

**Problema**
> `ReconciliacaoLotePermutaService` emite `logService.info({ type: BUSINESS_INFO, message: 'permuta batch reconciliation', data: { requestId, executadoPor, totalCasos, totalSettled, totalErros, borderos, dryRun } })` como única trilha forense pós-fato. O mock de log existe em `test:9` mas nunca é asseverado. Um refactor que troque `executadoPor` por `userId` quebra a auditoria sem alarme.

**Melhoria Proposta**
> Adicionar `expect(logSpy.info).toHaveBeenCalledWith(expect.objectContaining({ type: LOG_TYPE.BUSINESS_INFO, data: expect.objectContaining({ executadoPor, totalSettled, totalErros, borderos }) }))` em pelo menos 2 dos 5 cenários do `describe` (sucesso + continue-on-error). Bass tactic: **Executable Assertions** (Observability).

**Resultado Esperado**
> Asserts em `logService.info` no lote 0 → ≥2; mudança no shape do log (campo dropado/renomeado) é detectada pelo CI; trilha forense de quem disparou o lote é contrato testado.

**Métricas de sucesso**
- Asserts sobre `logService.info`: 0 → ≥2

**Risco de não fazer**
> Drift entre o log e o dashboard de auditoria; em incidente real, o `executadoPor` some e a investigação fica cega.

**Dependências**: Nenhuma

---

### [testability-4] Fechar branches frios do service (`dryRunOverride`, fallback de erro não-Error)

**QA**: Testability
**Tactic alvo**: Executable Assertions
**Esforço**: S
**Findings**: F-testability-4

**Problema**
> Branch coverage do `ReconciliacaoLotePermutaService` em 80.76%. Linhas frias: `L98` (`dryRunOverride !== undefined`, a alavanca de "preview sem POST" do lote) e `L119-122` (`err instanceof Error ? err.message : String(err)`, o fallback para throws não-Error). O `dryRunOverride` é o contrato com a rota — sem teste, mudar a semântica passa silenciosamente.

**Melhoria Proposta**
> Adicionar 2 casos no `describe`: (1) `reconciliarLote({ ..., dryRunOverride: true })` → verificar que o spy `reconciliar` recebeu `dryRunOverride: true`; (2) um adto onde o stub `throw 'string-cru'` → verificar que `resultados[0].erro === 'string-cru'` (cobre o branch `String(err)`). Bass tactic: **Executable Assertions** + **Limit Non-Determinism**.

**Resultado Esperado**
> Branch coverage de `ReconciliacaoLotePermutaService.ts` 80.76% → ≥95%; contrato do `dryRunOverride` (alavanca de preview) defendido por teste 0 → 1.

**Métricas de sucesso**
- Branch coverage no service: 80.76% → ≥95%
- Casos no `describe`: 5 → 7

**Risco de não fazer**
> Refactor que troque a interface de `dryRunOverride` (renomeia, vira `mode: 'preview'`) passa verde; perde-se a alavanca de preview do lote em produção sem ninguém notar até o próximo dry-run real.

**Dependências**: Nenhuma
