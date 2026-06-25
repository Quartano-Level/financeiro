---
qa: Fault Tolerance
qa_slug: fault-tolerance
run_id: 2026-06-25-1713
agent: qa-fault-tolerance
generated_at: 2026-06-25T17:55:00-03:00
scope: backend,frontend
score: 8.2
findings_count: 4
cards_count: 4
---

# Fault Tolerance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista admin clica **"Executar todas (N)"** na aba *Automáticas* | Lote de N adiantamentos é enviado num único POST `/permutas/reconciliar-lote`; durante a iteração server-side o ERP `fin010` rejeita 1+ pares, ou a conexão Render→Conexos morre no meio | `ReconciliacaoLotePermutaService` (orquestrador sequencial, continue-on-error) + `ReconciliacaoPermutaService.reconciliar` (handshake atômico por par, write-ahead em `permuta_alocacao_execucao`) | Produção: `CONEXOS_WRITE_ENABLED=true`, `CONEXOS_DRY_RUN=false`, ~26 automáticas hoje, latência ERP ≈ 250–800 ms/POST | Cada par adto↔invoice é atômico (settled / error com payload cru); falhas individuais NÃO interrompem o lote; pares já `settled` ficam `skipped` num re-fire; borderôs criados ficam **EM CADASTRO** (sem auto-finalize) aguardando aprovação manual em *Borderôs* | 0 baixas duplicadas em re-fire pós-timeout (idempotência write-ahead); ≥ 90% dos pares settled mesmo com 1+ falhas no batch; 100% dos falhos visíveis na trilha (`status=error` com `erp_response`); 0 borderôs aprovados sem revisão humana (checkpoint EM CADASTRO) |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Idempotência write-ahead no caminho do lote | 100% (lote reusa `reconciliar` adto-a-adto; chave `permuta:{adto}:{invoice}:{atualizadoEm}` validada em `beginExecution` + `findByIdempotencyKey`) | 100% | ✅ | `ReconciliacaoPermutaService.ts:145-180` + `PermutaExecucaoRepository.ts:191-224` |
| Atomicidade por par adto↔invoice (try/catch por iteração) | 100% (`try` interno do `for (const aloc of alocacoes)` + `markError` com `erpResponse` cru) | 100% | ✅ | `ReconciliacaoPermutaService.ts:183-216` |
| Continue-on-error no wrapper de lote | 100% (try/catch por adto + agregação em `resultados[]`) | 100% | ✅ | `ReconciliacaoLotePermutaService.ts:91-127` |
| Cobertura de testes do wrapper (cenários distintos) | 5/5 — dedup+agg, continue-on-error, dry-run, vazio, skipped/idempotência | ≥ 4 | ✅ | `ReconciliacaoLotePermutaService.test.ts:105-226` |
| Auto-finalize de borderô no caminho do lote | 0 calls a `finalizarBordero` ou `borVldFinalizado=1` (borderô fica EM CADASTRO; aprovação em rota separada `/borderos/:borCod/finalizar`) | 0 (checkpoint humano obrigatório) | ✅ | grep `finalizar` em `ReconciliacaoLotePermutaService.ts` + `ReconciliacaoPermutaService.ts` → 0 hits; `permutas.ts:482-501` (rota separada) |
| Timeout em chamadas externas no caminho | 40 s no `services/conexos.ts` (axios.create timeout: 40000) | presente | ✅ | `src/backend/services/conexos.ts:79-81` |
| Validação de shape da resposta do ERP (Zod) em escritas | 2/2 — `BORDERO_CRIADO_SCHEMA` no `criarBordero`, `BAIXA_GRAVADA_SCHEMA` no `gravarBaixaPermuta` | 100% | ✅ | `ConexosClient.ts:396-407, 1103, 1491` |
| Retry automático em escritas não-idempotentes (`criarBordero`, `gravarBaixaPermuta`) | 0 (decisão explícita: tentativa única — comentário cita F-fault-tolerance-1) | 0 | ✅ | `ConexosClient.ts:1074-1080, 1468-1477` |
| Idempotency-Key HTTP honrado em `POST /reconciliar-lote` | ❌ ausente (rota não lê header; `/eleicao` lê, `/reconciliar-lote` e `/reconciliar` individual não) | presente (defesa contra duplo-clique cross-request) | ⚠️ | `permutas.ts:426-447` vs. `permutas.ts:139-146` |
| Trilha de auditoria de execução (who/when/what por par) | 100% — `permuta_alocacao_execucao` (`executado_por`, `atualizado_em`, `status`, `erp_response`, `request_payload`) gravada no mesmo serviço | 100% | ✅ | `PermutaExecucaoRepository.ts:191-299` + `ReconciliacaoPermutaService.ts:169-345` |
| Stuck-state reaper para `status='reconciling'` órfão (POST após `setBorCod`, antes de `markSettled`/`markError`) | ❌ ausente (já era F-fault-tolerance-7 da run anterior, ainda no inbox) | presente (job que detecta orfãos > N min) | ⚠️ Não-medível em prod localmente (sem cron job runner — migration-debt O4) | grep `stuck\|orphan\|reaper` em `src/backend/` → 0 hits; `permutas-reconciliacao-regis-followups.md` |
| Reconciliação periódica cache `permuta_bordero` vs. ERP | ❌ ausente (F-fault-tolerance-8 herdada; sem cron) | presente | ⚠️ Não-medível em prod localmente | `permutas-reconciliacao-regis-followups.md` |
| Idempotência de re-fire pós-timeout do bulk HTTP (re-clique do analista) | ✅ Segura POR PAR: pares já settled retornam `skipped`; pares que crasharam entre `setBorCod` e `markSettled` ficam órfãos (status=reconciling) e re-firam como `'reconciling'` reaberto pelo `beginExecution` (UPDATE no ON CONFLICT, exceto se settled) | seguro em 100% dos casos | ⚠️ parcial — pares órfãos podem re-postar a baixa no fin010, pois `beginExecution` re-marca `reconciling` e o serviço segue para `executarBaixa` (re-POST do `criarBordero` cria borderô NOVO; re-POST de `gravarBaixaPermuta` cria baixa NOVA com novo `bxaCodSeq`) | `PermutaExecucaoRepository.ts:201-209` + `ReconciliacaoPermutaService.ts:183-216` |
| % de novas escritas externas introduzidas pelo wrapper de lote | 0 (o wrapper só itera e agrega; nenhuma chamada nova ao ERP, nenhum novo INSERT/UPDATE no Postgres) | 0 | ✅ | `ReconciliacaoLotePermutaService.ts:91-152` |
| Blast radius amplificado pelo lote (N borderôs criados num único request) | N adtos hoje ≈ 26 → ≈ 26 borderôs potenciais por clique (vs. 1 no fluxo individual) | mitigado por: confirmação modal + checkpoint EM CADASTRO + admin + heavyRouteLimiter (10/min) | ✅ controlado (não eliminado) | `page.tsx:2130-2166` + `permutas.ts:426-432` |

> ⚠️ **Não medível localmente**: presença/ausência de execuções `reconciling` órfãs em produção. Requer query ad-hoc no Postgres de prod (`SELECT count(*) FROM permuta_alocacao_execucao WHERE status='reconciling' AND atualizado_em < now()-interval '30 min'`).
>
> ⚠️ **Não medível localmente**: timeout efetivo do proxy Render no caminho fim-a-fim do request (40 s do axios é INTRA-chamada Conexos; o request HTTP do analista ao backend acumula ≈ N × 5 × 250–800 ms ≥ 26 × 2 s = 52 s em pior caso real — atravessa o limite default Render de 100 s mas pode ser cortado por proxy intermediário). Cross-ref qa-availability/qa-performance.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Substitution | N/A — fluxo financeiro não admite substituto silencioso (uma baixa não pode ter um "fallback de baixa") | N/A | — |
| Replacement | N/A — sem componentes redundantes ativos | N/A | — |
| Predictive Model | Dry-run via `CONEXOS_DRY_RUN` / `dryRunOverride` permite validar payloads sem POST antes do real | ✅ presente | `ReconciliacaoPermutaService.ts:117-138` + `ReconciliacaoLotePermutaService.ts:98` |
| Increase Competence Set | Mensagens amigáveis traduzem códigos do ERP (`friendlyErpMessage`) e o lote inteiro tolera erros mistos por adto | ✅ presente | `ReconciliacaoPermutaService.ts:518-531` + `ReconciliacaoLotePermutaService.ts:115-126` |
| Sanity Checking | Zod no boundary em respostas críticas (`BORDERO_CRIADO_SCHEMA`, `BAIXA_GRAVADA_SCHEMA`); `assertNoErpError` lê `messages[*].valid='ERRO'` (status 200 com erro lógico); guard anti-over-pay (`bxaMnyValor > emAbertoErp+tolerância → aborta`) | ✅ presente | `ConexosClient.ts:396-407, 1103, 1491` + `ReconciliacaoPermutaService.ts:269-275, 481-489` |
| Comparison | Em `borderoAindaValido` compara estado local (`settled`) com estado vivo do borderô no ERP antes de bloquear re-baixa | ✅ presente | `ReconciliacaoPermutaService.ts:496-507` |
| Timestamp | `atualizado_em` faz parte da chave idempotente (`permuta:{adto}:{invoice}:{atualizadoEm}`) → re-alocar gera chave nova; ações persistem `atualizado_em now()` | ✅ presente | `ReconciliacaoPermutaService.ts:145` + `PermutaExecucaoRepository.ts:208, 232, 290` |
| Timeout | axios.create({ timeout: 40000 }) no `conexosService`; `heavyRouteLimiter` (10/min) na rota | ✅ presente (intra-call); ⚠️ parcial fim-a-fim (sem timeout explícito no request HTTP do analista) | `src/backend/services/conexos.ts:79-81` + `permutas.ts:429` |
| Condition Monitoring | Log estruturado por adto (`'permuta reconciliacao SETTLED'`, `'permuta reconciliacao FALHOU'`); agregação `'permuta batch reconciliation'` no lote | ✅ presente | `ReconciliacaoPermutaService.ts:202-207, 345-349` + `ReconciliacaoLotePermutaService.ts:129-141` |
| Self-Test | `validarTituloBaixa` (passo 2) confirma em-aberto vivo do ERP ANTES da gravação (passo 5) — auto-checagem por par | ✅ presente | `ReconciliacaoPermutaService.ts:243-256` |
| Voting | N/A — sem replicação de cálculo | N/A | — |
| Redundancy (DLQ/replicas) | N/A — Express puro, sem SQS/DLQ (alvo Lambda) | N/A | migration-debt O4 |
| Recovery — Rollback (backward) | N/A — ERP não suporta undo limpo de baixa; a política é forward-recovery | N/A documentado | `ReconciliacaoPermutaService.ts:198-215` (markError + segue) |
| Recovery — Forward / Repair State | `markError` com `erp_response` cru para conciliação manual; falho fica visível na aba *Borderôs* e em `/adiantamentos/:docCod/execucoes`; `excluirBaixa`/`cancelarBordero` para limpar e re-tentar | ✅ presente | `ReconciliacaoPermutaService.ts:196-215` + `permutas.ts:572-591, 504-523` |
| Reintroduction — Shadow / State Resync / Escalating Restart | Dry-run = shadow (mesmo payload, sem POST); state-resync por par via re-fire idempotente (re-execução do lote pula `settled`); sem escalating restart | ✅ parcial (shadow ✓, resync ✓, escalating ✗) | `ReconciliacaoPermutaService.ts:124-138, 145-167` |
| Idempotent Replay | Chave `permuta:{adto}:{invoice}:{atualizadoEm}` + `beginExecution` UPSERT que preserva `settled`; `borderoAindaValido` libera relançamento só se borderô do `settled` foi cancelado/estornado/removido | ✅ presente | `ReconciliacaoPermutaService.ts:145-180` + `PermutaExecucaoRepository.ts:191-224` |
| Compensating Transaction | N/A documentado — fin010 não suporta undo, política é forward-recovery + checkpoint humano em *Borderôs* (analista revê/exclui/cancela antes de aprovar) | N/A documentado | `business-rules/fin010-write-contract.md` referenciado em `ReconciliacaoPermutaService.ts:57` |
| Reconcile | ❌ ausente — não há job periódico que compare cache `permuta_bordero` com o ERP (já era F-fault-tolerance-8) | ❌ ausente | `permutas-reconciliacao-regis-followups.md` |
| Quarantine | `status='error'` com `erp_response` cru funciona como quarentena (par fica fora do `listAtivas` para nova baixa até intervenção); borderô EM CADASTRO é quarentena soft do borderô antes da aprovação | ✅ presente | `ReconciliacaoPermutaService.ts:196-215` |

## 4. Findings (achados)

### F-fault-tolerance-1: Janela de re-POST de baixa quando o request bulk crasha entre `setBorCod` e `markSettled`

- **Severidade**: P1 (alto — pode gerar borderô duplicado/baixa duplicada num re-fire do MESMO lote pós-timeout do proxy)
- **Tactic violada**: Idempotent Replay (parcial)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:169-216` + `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:191-224`
- **Evidência (objetiva)**:
  ```
  Sequência por par no caminho real:
    1. beginExecution(key) → INSERT/UPDATE status='reconciling'
    2. criarBordero (1ª iteração) → POST fin010 (sem retry, OK)
    3. setBorCod(key, borCod)
    4. validarTituloBaixa (POST fin010 — não-idempotente no protocolo)
    5. validarTituloPermuta (POST fin010)
    6. atualizarValorLiquido (POST fin010)
    7. gravarBaixaPermuta (POST fin010 — IRREVERSÍVEL, sem retry)
    8. markSettled(key, bxaCodSeq)

  Cenário do batch: o lote itera N adtos sequencialmente num único request HTTP do analista.
  Se o proxy (Render) cortar o request DEPOIS de (7) e ANTES de (8) num adto K, o adto K fica em
  status='reconciling' com bor_cod preenchido mas SEM bxaCodSeq.

  Re-fire (analista re-clica "Executar todas"):
   - `beginExecution` no UPSERT mantém status='reconciling' (não regride, mas também não bloqueia —
     `alreadySettled` é false).
   - O serviço segue para `executarBaixa` e RE-POSTA `gravarBaixaPermuta` no fin010 → 2ª baixa,
     2º bxaCodSeq, sobre o MESMO borderô.
   - A 2ª chamada a `criarBordero` foi pulada porque o borCod já existe em memória do request... mas
     este é um request NOVO: o `borCod` da memória anterior morreu → o re-fire cria outro borderô
     para o adto K (pois `borCod` é variável local da função `reconciliar`), enquanto o borderô
     antigo (já com baixa) fica órfão na trilha.
  ```
- **Impacto técnico**: par órfão em `status='reconciling'` pode gerar (a) borderô duplicado e (b) baixa duplicada no mesmo título quando o analista re-fire o lote após timeout do proxy. O guard `borderoAindaValido` só protege quando o par já está `settled`, não quando está `reconciling`.
- **Impacto de negócio**: super-pagamento contábil — uma invoice baixada 2× no fin010 gera 2 `bxaCodSeq` distintos sobre o mesmo em-aberto, exigindo estorno manual e conciliação reversa. O blast radius é amplificado pelo lote (1 timeout = N pares potencialmente afetados, hoje N ≈ 26).
- **Métrica de baseline**: 0 execuções órfãs *medidas* localmente (sem acesso a prod), mas o caminho de código permite o re-POST — F-fault-tolerance-7 da run 2026-06-24-2011 já documentou a ausência do reaper que mitigaria isso; com o **lote**, a janela ficou maior em proporção (1 request → N pares em vez de 1 par).

### F-fault-tolerance-2: Endpoint `POST /reconciliar-lote` não honra `Idempotency-Key` HTTP

- **Severidade**: P1 (alto — duplo-clique acidental ou retry do cliente HTTP cria DOIS lotes concorrentes/sequenciais)
- **Tactic violada**: Idempotent Replay (defesa no boundary)
- **Localização**: `src/backend/routes/permutas.ts:426-447` (vs. `permutas.ts:139-146` no `/eleicao`)
- **Evidência (objetiva)**:
  ```typescript
  router.post(
      '/reconciliar-lote',
      requireRole('admin'),
      heavyRouteLimiter,
      asyncHandler(async (req, res) => {
          await bootstrapAppContainer();
          const parsed = reconciliarBodySchema.safeParse(req.body ?? {});
          // …não lê req.header('Idempotency-Key')…
          const result = await service.reconciliarLote({ executadoPor, dataMovto, requestId, … });
          res.json(result);
      }),
  );
  ```
  Comparar com `/eleicao` (permutas.ts:141): `const rawKey = req.header('Idempotency-Key');`
- **Impacto técnico**: dois lotes concorrentes/quase-concorrentes do MESMO usuário disputam os mesmos adtos. A idempotência por-par (F-fault-tolerance-1 caso settled) protege na maior parte, mas **dois `criarBordero` paralelos para o mesmo adto criam DOIS borderôs distintos** (o ERP não dedupa borderôs por origem); só um deles vai ter as baixas, o outro fica vazio EM CADASTRO precisando ser excluído. Combinado com F-fault-tolerance-1, agrava o re-fire pós-timeout.
- **Impacto de negócio**: ruído operacional (borderôs vazios poluindo a lista *Borderôs*); analista perde tempo conciliando borderôs órfãos; risco real de aprovar o borderô errado.
- **Métrica de baseline**: 1/2 rotas de fan-out pesado honra `Idempotency-Key` hoje (`/eleicao` sim; `/reconciliar-lote` e `/reconciliar` individual não). Frontend mitiga via `setExecutandoLote(true)` + `disabled` no botão (`page.tsx:1841, 2158`), mas isso só cobre o duplo-clique no MESMO browser tab — não cobre retry do `fetch`, F5 do usuário no meio, ou dois browser tabs abertos.

### F-fault-tolerance-3: Sem stuck-state reaper para execuções `reconciling` órfãs (herdada e AGRAVADA pelo lote)

- **Severidade**: P1 (alto — pré-existente, mas o lote amplifica a probabilidade de ocorrência)
- **Tactic violada**: Condition Monitoring + Reconcile
- **Localização**: ausência sistêmica — `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts` não tem `listByStatus('reconciling')` nem cron consumindo; nenhum job em `src/backend/` faz sweep
- **Evidência (objetiva)**:
  ```
  $ grep -rn "stuck\|orphan\|reaper\|status.*=.*'reconciling'" src/backend/ --include=*.ts | grep -v test
  → 0 hits no lado produção (só usos internos no Service/Repository do happy-path)
  ```
  Já registrado como `F-fault-tolerance-7` em `docs/regis-review/2026-06-24-2011/fault-tolerance.md:183-197` e como card `fault-tolerance-7` no inbox `permutas-reconciliacao-regis-followups.md`. Permanece **aberto**.
- **Impacto técnico**: linhas `reconciling` com `bor_cod` mas sem `bxa_cod_seq` permanecem indefinidamente. Não há query, não há alerta, não há job que as enxergue. Cada uma é um candidato silencioso a F-fault-tolerance-1 num re-fire.
- **Impacto de negócio**: divergência permanente entre a trilha local e o ERP que só será notada se um analista olhar manualmente para a tabela de execução; sem o reaper, o controle de "tudo o que tentamos foi confirmado" é ilusório.
- **Métrica de baseline**: 0 jobs detectores presentes; tempo médio de detecção de um par órfão hoje = indefinido (depende de inspeção humana).

### F-fault-tolerance-4: Sem timeout HTTP explícito no request bulk (estourar o teto do proxy é silencioso para o cliente)

- **Severidade**: P2 (médio — não corrompe estado por si só, mas amplifica a janela de F-fault-tolerance-1)
- **Tactic violada**: Timeout (fim-a-fim)
- **Localização**: `src/frontend/lib/api.ts:279-286` + ausência de `setTimeout` / `AbortController`
- **Evidência (objetiva)**:
  ```typescript
  const res = await fetch(`${API}/permutas/reconciliar-lote`, {
      method: 'POST',
      headers: await withAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ … }),
  });
  // sem AbortController, sem signal: o fetch herda o timeout default do browser (~5 min) ou
  // o que o proxy Render impuser primeiro (default 100 s no Render Web Services).
  ```
  Lado backend: `axios.create({ timeout: 40000 })` protege CADA chamada Conexos, mas o request HTTP do analista acumula N × 5 chamadas ≈ N × ~1–2 s. Para N=26, no pior caso (cold ERP), o request pode passar de 60 s e ser cortado pelo proxy → o backend continua a iteração até o fim (sem `req.on('close')` listener), mas o frontend já errou.
- **Impacto técnico**: o analista vê "Falha ao executar o lote" enquanto o backend ainda está rodando — re-clique é a reação natural e dispara F-fault-tolerance-1 / F-fault-tolerance-2.
- **Impacto de negócio**: UX confusa (status do lote desconhecido durante a janela cinza); incentivo à reentrância humana que vira incidente.
- **Métrica de baseline**: 0 timeout explícito no fetch do frontend; 0 listener `req.on('close')` no backend; 1 timeout 40 s por chamada Conexos no axios (`services/conexos.ts:79-81`).

## 5. Cards Kanban

### [fault-tolerance-1] Bloquear re-POST de baixa quando a execução está em `reconciling` órfã (idempotência da janela cinza)

- **Problema**
  > O wrapper de lote herda a idempotência write-ahead por par, mas a chave bloqueia apenas pares `settled`. Pares que crasharam entre `setBorCod` e `markSettled` (status `reconciling` com `bor_cod` mas sem `bxa_cod_seq`) NÃO bloqueiam um re-fire: `beginExecution` faz UPSERT mantendo `reconciling` e o serviço segue para `executarBaixa` → re-POST de `gravarBaixaPermuta` cria SEGUNDA baixa no mesmo título do mesmo borderô (ou em borderô novo, pois `borCod` é local ao request). Blast radius cresce com o lote (até N pares órfãos por request).

- **Melhoria Proposta**
  > Em `ReconciliacaoPermutaService.reconciliar`, ANTES de chamar `executarBaixa`, checar se a linha existente tem `bor_cod` preenchido sem `bxa_cod_seq` e idade > THRESHOLD (ex.: 5 min). Nesse caso: (a) consultar `getBordero` + `listarBaixasErp` do borderô existente para descobrir se a baixa já caiu no ERP; (b) se caiu, fazer `markSettled` com o `bxaCodSeq` real (reconcile forward); (c) se não caiu, prosseguir SOMENTE com `borCod` reutilizado (não criar borderô novo); (d) se for o MESMO request (proteção curta), bloquear `skipped`. Documentar em `business-rules/fin010-write-contract.md`. Tactic Bass = Idempotent Replay + Reconcile.

- **Resultado Esperado**
  > Re-fire do lote pós-timeout NUNCA cria baixa duplicada para um par órfão. Métrica observável: # de pares em `status='reconciling'` órfãos por >10 min que viram baixa duplicada num re-fire = 0 (vs. risco aberto hoje).

- **Tactic alvo**: Idempotent Replay + Reconcile
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-fault-tolerance-1, F-fault-tolerance-3
- **Métricas de sucesso**:
  - # de baixas duplicadas em re-fire pós-timeout: indefinido (não medido) → 0 (com teste de unidade simulando crash entre passos 7 e 8)
  - Cobertura de teste do cenário "reconciling órfão + re-fire": 0 hoje → ≥ 1 caso
- **Risco de não fazer**: super-pagamento contábil no fin010 a cada vez que o proxy cortar o request bulk; problema escala linearmente com N de automáticas (hoje 26, crescendo).
- **Dependências**: idealmente convive com `fault-tolerance-3` (reaper) — mas não depende dele.

### [fault-tolerance-2] Honrar `Idempotency-Key` no `POST /reconciliar-lote` (e no `/reconciliar` individual)

- **Problema**
  > Rota de escrita financeira em lote não lê o header `Idempotency-Key`; só o frontend protege contra duplo-clique (`disabled` no botão). Duplo-fetch (retry interno do navegador, F5, dois browser tabs) cria dois lotes que disputam os mesmos adtos. Combinado com F-fault-tolerance-1, agrava o blast radius.

- **Melhoria Proposta**
  > Replicar o padrão do `POST /eleicao` (`permutas.ts:139-146`) em `/reconciliar-lote` e em `/adiantamentos/:docCod/reconciliar`. Persistir o request-id + payload-hash em uma tabela curta (ex.: `request_idempotency`) com TTL de 24 h; em re-request com a MESMA key + payload, devolver a resposta cacheada. Frontend já está pronto para gerar a key (pode usar `crypto.randomUUID()` por clique no modal). Tactic Bass = Idempotent Replay no boundary.

- **Resultado Esperado**
  > 2/2 rotas de escrita financeira aceitam Idempotency-Key (vs. 1/2 hoje); duplo-clique cross-tab ou retry HTTP nunca dispara dois lotes. Métrica: # de borderôs vazios criados por re-request = 0.

- **Tactic alvo**: Idempotent Replay
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-fault-tolerance-2
- **Métricas de sucesso**:
  - % rotas state-mutating do permutas que honram Idempotency-Key: 1/2 (50%) → 2/2 (100%) para escrita financeira
  - Teste e2e cobrindo "duplo POST com a MESMA key responde idem-cache": 0 hoje → 1
- **Risco de não fazer**: incidentes recorrentes de "executei 2× sem querer" — observado em fluxos manuais análogos, agora amplificado pelo lote.
- **Dependências**: nenhuma.

### [fault-tolerance-3] Stuck-state reaper para execuções `reconciling` órfãs (re-priorizar do inbox)

- **Problema**
  > Já registrado como `F-fault-tolerance-7` na run anterior e como card `fault-tolerance-7` no inbox `permutas-reconciliacao-regis-followups.md`, ainda **aberto**. O lote eleva a probabilidade de criação de órfãos (N pares por request em vez de 1) e a probabilidade de re-fire (analista re-clica quando o request cai). Sem um sweep que enxergue `status='reconciling' AND atualizado_em < now()-interval '30 min'`, a divergência entre trilha local e ERP é silenciosa.

- **Melhoria Proposta**
  > Implementar `PermutaExecucaoRepository.listStuckReconciling(thresholdMinutes)`. Implementar `StuckReconciliacaoReaperService` que, para cada órfão, consulta `getBordero` + `listarBaixasErp` no ERP e (a) `markSettled` se a baixa caiu (com `bxaCodSeq` real) ou (b) `markError("órfão >30 min — provável timeout do request bulk")` para visibilidade. Quando houver job runner (migration-debt O4, EventBridge alvo), rodar de 10 em 10 min; até lá, expor como rota admin `POST /permutas/reconciliar-orfaos` que o analista chama sob demanda (mesmo padrão do `/ingestao` manual). Tactic = Condition Monitoring + Reconcile.

- **Resultado Esperado**
  > MTTD (mean-time-to-detect) de um par órfão cai de "indefinido (humano)" para ≤ 10 min (ou ≤ 1 clique admin no provisório). 0 pares órfãos não-visíveis após o run do reaper.

- **Tactic alvo**: Condition Monitoring + Reconcile
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) — incluindo testes do reaper isolando os 3 cenários (caiu/não-caiu/incerto)
- **Findings relacionados**: F-fault-tolerance-3, F-fault-tolerance-1 (mitigação parcial)
- **Métricas de sucesso**:
  - Jobs/rotas detectores presentes: 0 → 1
  - MTTD de órfão: indefinido → ≤ 10 min (com cron) ou ≤ 1 clique admin (provisório)
- **Risco de não fazer**: drift permanente entre trilha local e fin010 que só vira incidente quando o usuário compara manualmente; com o lote, escala mais rápido.
- **Dependências**: convive com `fault-tolerance-1` (a estratégia recomendada lá usa a mesma consulta `getBordero+listarBaixasErp`); pode compartilhar código.

### [fault-tolerance-4] Timeout HTTP explícito + heartbeat no `reconciliar-lote` (proteção da janela cinza)

- **Problema**
  > O `fetch` do frontend não tem `AbortController`/`signal` — herda o default do browser ou o teto do proxy Render. Para N=26 automáticas, o lote pode levar > 60 s no pior caso (frio do ERP) e ser cortado pelo proxy enquanto o backend continua iterando (sem `req.on('close')` listener). Analista vê "Falha ao executar o lote" e tende a re-clicar, disparando F-fault-tolerance-1/F-fault-tolerance-2.

- **Melhoria Proposta**
  > Curto prazo: (a) frontend usa `AbortController` com timeout de ~120 s para alinhar com o teto do proxy + mensagem clara "lote demorando — consulte aba Borderôs antes de re-executar"; (b) backend instala `req.on('close', () => { ... })` no handler de `/reconciliar-lote` para abortar a iteração restante quando o cliente desistir (não cancela o adto em voo, mas evita continuar criando borderôs sem o cliente saber). Médio prazo: trocar a resposta síncrona por start-job + polling (`/reconciliar-lote/runs/:runId`) — alinha com o padrão do `/ingestao` manual (ADR-0012). Tactic = Timeout (fim-a-fim) + Condition Monitoring.

- **Resultado Esperado**
  > Timeout fim-a-fim explícito e consistente entre FE e proxy; mensagem clara reduz re-cliques. Métrica: % de re-cliques pós-timeout cai (medível via log do `executadoPor` no `BUSINESS_INFO` `'permuta batch reconciliation'`).

- **Tactic alvo**: Timeout + Condition Monitoring
- **Severidade**: P2
- **Esforço estimado**: S (≤1d) para FE+listener; M (2–5d) para a versão start-job
- **Findings relacionados**: F-fault-tolerance-4 (e indireto: F-fault-tolerance-1/2)
- **Métricas de sucesso**:
  - Timeout HTTP explícito no `reconciliarLoteAutomaticas`: 0 → 1 (com `AbortController`)
  - `req.on('close')` listener no `/reconciliar-lote`: ausente → presente
- **Risco de não fazer**: re-cliques humanos pós-corte do proxy seguem disparando o caminho de risco de F-fault-tolerance-1.
- **Dependências**: cross-ref qa-performance/qa-availability (mesma causa raiz — request síncrono longo); convive com `fault-tolerance-1` e `fault-tolerance-2`.

## 6. Notas do agente

- O wrapper de lote é **fault-tolerance-positive**: adiciona zero escritas novas, reusa 100% das salvaguardas do `reconciliar` individual (idempotência write-ahead, atomicidade por par, sanity-checking Zod nas respostas, guard anti-over-pay, sem retry em escritas não-idempotentes, sem auto-finalize do borderô). O score 8.2 reflete que o caminho feliz e os erros parciais estão bem cobertos; os 4 findings são todos casos de borda (re-fire pós-timeout, duplo-clique cross-tab, órfãos pré-existentes amplificados, timeout fim-a-fim) — e 3 deles (F-1, F-3) já eram conhecidos individualmente e ganharam *blast radius* com o lote.
- O checkpoint **EM CADASTRO** (analista aprova manualmente em *Borderôs* depois) é o anteparo central de safety contra qualquer dos finds — nenhum borderô criado pelo lote vai para `finalizado` sem intervenção humana, e a aprovação re-valida em tela.
- Cross-QA: F-fault-tolerance-2 (Idempotency-Key) overlap direto com qa-security (anti-replay) e qa-availability (proteção contra duplo-fan-out). F-fault-tolerance-4 (timeout fim-a-fim) é o mesmo eixo de qa-performance/qa-availability (request síncrono longo). F-fault-tolerance-3 (reaper) overlap com qa-testability (cobertura de cenário órfão). Alertar o `qa-consolidator` para evitar contagem dupla nos cards.
- Não medível localmente: # de órfãos em prod, latência fim-a-fim real do lote em prod, taxa real de timeout do proxy Render. Requereria CloudWatch/observabilidade em prod (alvo Lambda); hoje só logs do `LogService` em Render.
