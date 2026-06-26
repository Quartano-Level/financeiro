---
qa: Fault Tolerance
qa_slug: fault-tolerance
run_id: 2026-06-26-1708
agent: qa-fault-tolerance
generated_at: 2026-06-26T18:10:00-03:00
scope: all
score: 8.6
findings_count: 6
cards_count: 6
---

# Fault Tolerance — Regis-Review

> **Autoral**: Fault Tolerance substituiu "Safety" (Bass & Clements) — em automação financeira
> multi-tenant a preocupação real é **consistência de estado sob falha parcial** sobre escritas
> que movem dinheiro em sistemas de terceiros (Conexos `fin010`). Tactics canônicas Bass são
> aplicadas onde transferem; o resto vem da literatura clássica (Gray & Reuter, Garcia-Molina:
> idempotency, write-ahead, compensating transactions, reconcile, fail-closed).
>
> **Delta vs. run `2026-06-26-0058`**: (1) R-4 fail-closed (in-doubt detection na execução
> `reconciling` órfã, `ReconciliacaoPermutaService.ts:178-212`) **fecha F-1** da run anterior —
> re-fire pós-crash não re-POSTa mais (vira `error` para conciliação manual). (2) Baixa de invoice
> **multi-título** (PR #22, v0.9.0) iterando `titCod 1..N` no MESMO borderô — **fecha F-5** da run
> anterior. (3) Novos achados nascem do loop multi-título (forensics granular por par adto↔invoice)
> e do `try/catch` silencioso ao listar títulos.

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista admin clica **"Executar lote"** (até `LOTE_MAX=6` automáticas) ou abre/cancela um borderô | (a) processo morre entre `baixarTitulo 1` (POST `gravarBaixaPermuta` IRREVERSÍVEL) e `baixarTitulo 2` numa invoice com N parcelas; (b) duplo-clique cross-tab dispara dois POST `/reconciliar-lote` simultâneos; (c) `listTitulosAPagar` cai (auth/rede) e o serviço usa o fallback título único silenciosamente; (d) borderô finalizado é cancelado/estornado externamente no Conexos | `ReconciliacaoPermutaService` (handshake fin010 por par adto↔invoice + loop por titCod) + `ReconciliacaoLotePermutaService` (sequencial, `LOTE_MAX=6`, continue-on-error) + `BorderoGestaoService` (finalizar/cancelar/estornar/excluir) + `AlocacaoPermutasService.remover` (trava de integridade) + `PermutaExecucaoRepository` (chave write-ahead UNIQUE por par) | Prod: Express/Render, Supabase Postgres com `withTransaction` disponível, sem SQS/DLQ (Lambda é alvo), `CONEXOS_WRITE_ENABLED=true` + `CONEXOS_DRY_RUN=false`, `LOTE_MAX=6`, latência ERP 250–800 ms/POST, **R-4 fail-closed** ativo, **multi-título** ativo (loop por `titCod` no MESMO borderô) | (a) crash mid-loop → próxima execução vê `reconciling+borCod` e **fail-closed** marca `error` SEM re-POSTar (não há super-pagamento); (b) duplo-clique abre 2 borderôs distintos (sem dedup HTTP); (c) silently falls back para `titCod=1` (anti-drift por título mata se sobrar valor); (d) idempotência viva (`borderoAindaValido`) libera relançamento; pares já `settled` viram `skipped` | 0 baixas duplicadas em re-fire pós-timeout (R-4 fail-closed garante); 0 borderôs aprovados sem revisão humana (checkpoint EM CADASTRO); 100% dos `error` visíveis na trilha; multi-título: cada `titCod` vira uma baixa própria no mesmo borderô, anti-drift por título intercepta over-pay |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Idempotência write-ahead nas baixas fin010 (chave UNIQUE) | 100% (`idempotency_key = permuta:{adto}:{invoice}:{atualizadoEm}` UNIQUE; `beginExecution` preserva `settled` no `ON CONFLICT`) | 100% | ✅ | `PermutaExecucaoRepository.ts:223-256` + `migrations/0015_permuta_alocacao_execucao.sql:36` |
| **Fail-closed em `reconciling` órfão (R-4 — fecha F-1 da run anterior)** | presente — re-fire de par com `status='reconciling' AND bor_cod IS NOT NULL` aborta SEM re-POSTar (`markError + BUSINESS_WARN 'IN-DOUBT'`) | presente | ✅ | `ReconciliacaoPermutaService.ts:178-212` |
| `setBorCod` persistido ANTES do POST (recuperação de órfão) | ✅ presente — `setBorCod(key, borCod)` é a 1ª chamada de `executarBaixa`, ANTES de qualquer `validarTituloBaixa`/`gravarBaixaPermuta` | presente | ✅ | `ReconciliacaoPermutaService.ts:291` + `PermutaExecucaoRepository.ts:259-266` |
| Atomicidade por par adto↔invoice (try/catch + `markError` com payload cru do ERP) | 100% | 100% | ✅ | `ReconciliacaoPermutaService.ts:228-260` |
| **Baixa de invoice MULTI-TÍTULO** (fecha F-5 da run anterior) | presente — `executarBaixa` itera `titulos` (lidos via `listTitulosAPagar`) chamando `baixarTitulo` por `titCod` no MESMO borderô; fallback título único quando o ERP não devolve títulos | presente | ✅ | `ReconciliacaoPermutaService.ts:299-351, 384-483` + teste `ReconciliacaoPermutaService.test.ts:222-267` |
| Anti-drift POR TÍTULO (cada `baixarTitulo` confirma o em-aberto vivo da parcela) | presente — `validarTituloBaixa({titCod})` + `valorBaixaDesejado > emAbertoErp + tolerância → throw` | presente | ✅ | `ReconciliacaoPermutaService.ts:404-426` |
| Continue-on-error no lote (falha de 1 adto não interrompe os demais) | 100% (try/catch por iteração + agregação em `resultados[]`) | 100% | ✅ | `ReconciliacaoLotePermutaService.ts:113-149` |
| Cap server-side no blast radius do lote | `LOTE_MAX=6` (bound execution time + blast radius por clique) | bounded | ✅ | `ReconciliacaoLotePermutaService.ts:14, 101-104` |
| Sanity-checking de validações fin010 (`messages[*].valid='ERRO'`) | presente — `assertNoErpError` aborta o handshake (status 200 com erro lógico não passa) | presente | ✅ | `ReconciliacaoPermutaService.ts:410, 445, 460, 611-619` |
| Idempotência viva (borderô cancelado/estornado/removido libera relançamento) | presente — `borderoAindaValido` consulta `getBordero`; renomeia chave para preservar histórico | presente | ✅ | `ReconciliacaoPermutaService.ts:156-176, 626-637` |
| Trava de integridade: alocação em borderô vivo NÃO pode ser removida (ignora CANCELADO) | presente — `AlocacaoEmBorderoError` 409 quando `borderoDoPar` ≠ null; query exclui `bor_vld_finalizado=2` | presente | ✅ | `AlocacaoPermutasService.ts` + `PermutaExecucaoRepository.ts:102-123` |
| Transações multi-write (`withTransaction`) onde repositórios escrevem em ≥2 tabelas | 2/2 callsites de domínio (snapshot da eleição, ingestão relacional) — repositórios single-table não precisam | 100% nos casos de domínio | ✅ | `PermutaSnapshotRepository.ts:98` + `PermutaRelationalRepository.ts:201` |
| **`Idempotency-Key` HTTP nas rotas de escrita financeira** (carry da run anterior) | 1/3 (✅ `/eleicao` linha 222, ❌ `/reconciliar-lote` linha 542, ❌ `/adiantamentos/:docCod/reconciliar` linha 514) | 3/3 | ❌ | `routes/permutas.ts:211-228, 514-536, 542-566` |
| **Audit-trail DB-persistido das ações de borderô** (carry da run anterior) | 0/5 (finalizar/cancelar/estornar/excluir/excluir-baixa só `LogService.info → stdout`; sem tabela `bordero_acao_log`) | 5/5 | ❌ | `BorderoGestaoService.ts:137-147, 186-191, 208-213, 228-233, 246-249` + `ls migrations/` (sem `bordero_acao_log`) |
| Audit-trail DB-persistido das baixas (par adto↔invoice) | 100% (`permuta_alocacao_execucao` grava `executado_por`, `atualizado_em`, `request_payload`, `erp_response`, `erro_mensagem`); **mas só `bxa_cod_seq` único** — N parcelas → só a 1ª na coluna, resto em `erp_response.bxaCodSeqs` (JSON) | 100% (com bxas[]) | ⚠️ | `PermutaExecucaoRepository.ts:277-310` + `ReconciliacaoPermutaService.ts:353-360` + `migrations/0015_*.sql:24` |
| **`setRequestPayload` sob multi-título** | sobrescreve — chamado uma vez por título (linha 480), perde os payloads das parcelas anteriores; só o payload do ÚLTIMO título sobrevive na coluna `request_payload` | preservar todos | ⚠️ | `ReconciliacaoPermutaService.ts:480` |
| **Stuck-state reaper** para `status='reconciling' AND atualizado_em < now()-interval '30 min'` (carry da run anterior) | ❌ ausente (sem job runner — migration-debt O4; só `jobs/ingest-permutas.ts` e `jobs/seed-admin.ts`) | presente | ❌ | grep `stuck\|reaper\|listStuckReconciling` → 0 hits; `ls src/backend/jobs/` |
| **Reconciliação periódica trilha local ↔ ERP fin010** (drift detection — carry da run anterior) | ❌ ausente | presente | ❌ | grep `reconciliar-orfaos\|driftDetect\|drift_check\|sweep` → 0 hits |
| **Silent catch em `listTitulosAPagar`** (novo na PR #22) | `try { … } catch { /* segue no fallback */ }` — qualquer erro do ERP (timeout, auth, 5xx) cai para fallback `titCod=1` sem `LogService.warn`, sem distinguir invoice de título único vs. falha de leitura | log explícito do fallback | ⚠️ | `ReconciliacaoPermutaService.ts:318-320` |
| Cobertura de testes do serviço de reconciliação | `ReconciliacaoPermutaService.test.ts` (474 LOC, +77 vs. anterior) + cenário multi-título (`titCod 1+2` no mesmo borderô) + `ReconciliacaoLotePermutaService.test.ts` (270 LOC) + `BorderoGestaoService.test.ts` (396 LOC) | ≥ 1 caso/cenário crítico | ✅ | `wc -l src/backend/domain/service/permutas/*.test.ts` |
| `notify.error` / `toast.error` em mutations financeiras do frontend | presente em 100% dos sites de escrita (reconciliar, lote, finalizar, cancelar, estornar, excluir, alocar, remover) | 100% | ✅ | componentes pós-split CC-1 (carry da run anterior) |
| Optimistic update com rollback | ausente (mutations chamam `load()` para refetch — modelo pessimista) | N/A — modelo pessimista é correto p/ escrita financeira | ✅ | carry da run anterior |
| SQS / DLQ universalmente configurados | N/A — Express puro, sem SQS (Lambda é alvo, migration-debt O4) | N/A | N/A | `CLAUDE.md` (alvo) |

> ⚠️ **Não medível localmente**: # de execuções `reconciling` órfãs em prod, MTTR médio para
> conciliar manualmente um par em `IN-DOUBT` (R-4 fail-closed), # de invoices multi-título
> baixadas com sucesso na 1ª tentativa vs. abortadas por anti-drift, taxa real de timeout do
> proxy Render no caminho do lote, # de borderôs vazios criados por re-clique cross-tab.
> Requer query ad-hoc no Postgres de prod
> (`SELECT count(*) FROM permuta_alocacao_execucao WHERE status='reconciling' AND atualizado_em < now()-interval '30 min'`)
> + acesso aos logs Render (sem CloudWatch/X-Ray pois não há AWS).
>
> ⚠️ **Não medível localmente**: latência fim-a-fim do `POST /reconciliar-lote` em prod sob
> multi-título. Pior caso conservador (6 adtos × invoice 3-parcelas × 5 chamadas × 800 ms ≈ 72 s)
> ainda fica dentro do default Render (100 s), mas a janela cinza de timeout-pós-sucesso é maior
> com multi-título do que era com título único.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Substitution | N/A — uma baixa fin010 não tem "fallback de baixa" silencioso | N/A | — |
| Replacement | N/A — sem componentes redundantes ativos (Render single-instance) | N/A | — |
| Predictive Model | Dry-run via `CONEXOS_DRY_RUN` / `dryRunOverride` valida o payload sem POST (preview montado SÓ com dados locais) | ✅ presente | `ReconciliacaoPermutaService.ts:124-148, 578-604` |
| Increase Competence Set | Multi-título agora coberto (loop `titCod` no MESMO borderô) — **fecha F-5 anterior**; `friendlyErpMessage` traduz códigos do fin010; `respondActionError` enriquece `requestId + erpDetail` cru pro analista | ✅ presente (forte) | `ReconciliacaoPermutaService.ts:299-351, 647-661` + `routes/permutas.ts:110-156` |
| Sanity Checking | Zod no boundary (`BORDERO_CRIADO_SCHEMA`, `BAIXA_GRAVADA_SCHEMA`); `assertNoErpError` em status 200+ERRO; **anti-drift I-Write-1 POR TÍTULO** (`bxaMnyValor > emAbertoErp+tolerância → aborta` no loop); `round2` em todo monetário | ✅ presente (forte) | `ReconciliacaoPermutaService.ts:418-426, 31-32, 611-619` |
| Comparison | `borderoAindaValido` compara estado local (`settled`) com estado vivo do borderô no ERP; `borderoDoPar` exclui `bor_vld_finalizado=2` (trava integridade ignora cancelado) | ✅ presente | `ReconciliacaoPermutaService.ts:156-176, 626-637` + `PermutaExecucaoRepository.ts:102-123` |
| Timestamp | `atualizado_em` integra a chave idempotente (`permuta:{adto}:{invoice}:{atualizadoEm}`) — re-alocar gera chave NOVA, libera relançamento sem perder histórico | ✅ presente | `ReconciliacaoPermutaService.ts:154` |
| Timeout | axios 40s/chamada Conexos (intra-call); `heavyRouteLimiter` na rota; **sem timeout HTTP fim-a-fim explícito** no fetch do frontend (herda default browser/proxy) | ✅ presente intra-call · ⚠️ ausente fim-a-fim | `services/conexos.ts` + `frontend/lib/api.ts` |
| Condition Monitoring | Logs estruturados por par (`'permuta reconciliacao SETTLED'`, `'IN-DOUBT'`, `'FALHOU'`); agregação no lote; rota loga resposta crua do ERP em ação de borderô | ✅ presente · ⚠️ stdout-only | `ReconciliacaoPermutaService.ts:195-203, 361-372` + `routes/permutas.ts` |
| Self-Test | `validarTituloBaixa` (passo 2) confirma em-aberto vivo do título; `validarTituloPermuta` (passo 3) confirma dados do adto — agora roda **por título** no multi-título | ✅ presente | `ReconciliacaoPermutaService.ts:404-449` |
| Voting | N/A — sem replicação de cálculo (single source of truth = ERP) | N/A | — |
| Redundancy (DLQ/replicas) | N/A — Express puro, sem SQS/DLQ (alvo Lambda; migration-debt O4) | N/A documentado | `CLAUDE.md` |
| Recovery — Rollback (backward) | N/A — fin010 não suporta undo limpo de baixa; política é forward-recovery + checkpoint humano em *Borderôs* | N/A documentado | `business-rules/fin010-write-contract.md` (alvo) |
| Recovery — Forward / Repair State | `markError` grava `erp_response` cru; par fica visível na aba *Borderôs* e em `/adiantamentos/:docCod/execucoes`; analista usa `excluirBaixa`/`excluirBordero`/`cancelarBordero` para limpar e re-tentar; **R-4 fail-closed** marca IN-DOUBT explicitamente e instrui conferência manual no ERP | ✅ presente (forte) | `ReconciliacaoPermutaService.ts:190-212, 241-260` + `routes/permutas.ts:684-735` |
| Reintroduction — Shadow / State Resync / Escalating Restart | Shadow ✓ (dry-run); State Resync ✓ (re-fire idempotente pula `settled`); Escalating Restart ✗ (sem) | ✅ parcial | `ReconciliacaoPermutaService.ts:134-148, 156-176` |
| **Idempotent Replay** | Chave write-ahead UNIQUE por par + `beginExecution` UPSERT que preserva `settled`; `setBorCod` antes do POST; **R-4 fail-closed fecha a janela cinza F-1** (linha 184-212) — re-fire de par órfão NÃO re-POSTa | ✅ presente (forte; **upgrade vs. run anterior**) | `PermutaExecucaoRepository.ts:223-256` + `ReconciliacaoPermutaService.ts:178-212, 291` |
| Compensating Transaction | N/A documentado — fin010 não suporta undo limpo; política = forward-recovery + checkpoint humano | N/A documentado | `ReconciliacaoPermutaService.ts:57` (comentário) |
| **Reconcile** | ❌ ausente — sem job periódico que compare trilha local (`permuta_alocacao_execucao` + `permuta_bordero`) com o ERP (silent drift) | ❌ ausente | grep `reconciliar-orfaos\|driftDetection` → 0 hits |
| Quarantine | `status='error'` + `erp_response` cru = quarentena efetiva (par fica fora do `listAtivas`); R-4 IN-DOUBT = quarentena explícita aguardando inspeção humana; trava de integridade = quarentena de alocação consumida | ✅ presente (forte) | `ReconciliacaoPermutaService.ts:190-212, 243-260` + `AlocacaoPermutasService.ts` |

## 4. Findings (achados)

### F-fault-tolerance-1: Multi-título — partial commit no loop entre `baixarTitulo` N e N+1: trilha agrega só `bxaCodSeqs[0]` e `request_payload` sobrescreve por título

- **Severidade**: P2 (médio — não causa super-pagamento por causa de R-4 fail-closed; o problema é **forense**: a trilha não consegue distinguir granularmente qual parcela foi baixada quando crash mid-loop, e qual o payload exato enviado por título)
- **Tactic violada**: Condition Monitoring (forense por parcela) + Idempotent Replay (parcial — granularidade no nível do par adto↔invoice, não da parcela)
- **Localização**:
  - `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:332-360` (loop + agregação)
  - `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:480` (`setRequestPayload` chamado por título, sobrescreve)
  - `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:277-310` (`markSettled` aceita só um `bxaCodSeq` escalar)
  - `src/backend/migrations/0015_permuta_alocacao_execucao.sql:24` (coluna `bxa_cod_seq BIGINT` — não array/json)
- **Evidência (objetiva)**:
  ```
  Sequência por par (invoice multi-título com 3 parcelas):
    1. beginExecution(key)            → status='reconciling'
    2. setBorCod(key, borCod)         → bor_cod gravado
    3. baixarTitulo(titCod=1)         → POST gravarBaixaPermuta (bxa1)  ← IRREVERSÍVEL
                                      → setRequestPayload(payload do titCod=1)
    4. baixarTitulo(titCod=2)         → POST gravarBaixaPermuta (bxa2)  ← IRREVERSÍVEL
                                      → setRequestPayload(payload do titCod=2)  ← SOBRESCREVE
    5. baixarTitulo(titCod=3)         → POST gravarBaixaPermuta (bxa3)  ← IRREVERSÍVEL
                                      → setRequestPayload(payload do titCod=3)  ← SOBRESCREVE
    6. markSettled(key, { bxaCodSeq: bxaCodSeqs[0], erpResponse: { bxaCodSeqs: [bxa1,bxa2,bxa3] } })

  Coluna escalar `bxa_cod_seq` recebe SÓ bxa1; bxa2 e bxa3 vivem em erp_response (JSON).
  Coluna `request_payload` retém SÓ o payload do titCod=3 (último); os anteriores se perdem.

  Crash entre passos 3 e 4 (processo morto):
    - bxa1 EXISTE no ERP, sem nenhum bxa_cod_seq na trilha (markSettled ainda não rodou).
    - bxa2, bxa3 NÃO foram POSTados.
    - request_payload na trilha = payload do titCod=1 (último setRequestPayload antes do crash).
    - Re-fire: R-4 fail-closed pega (linha 184-212) → vira 'error' SEM re-POSTar
      → MAS o analista precisa abrir o borderô no Conexos e descobrir manualmente que titCod=1
        foi baixado e titCod=2/3 não — a trilha não conta isso.
  ```
  (`grep -n "setRequestPayload\|markSettled" src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts` confirma uma única gravação agregada no final.)
- **Impacto técnico**: forense degradado em multi-título — `bxa_cod_seq` (coluna canônica) só representa a 1ª parcela; uma reconciliação manual pós-crash exige cruzar com `erp_response.bxaCodSeqs` (JSON) e abrir o borderô no Conexos para distinguir o que caiu e o que não caiu. `setRequestPayload` perde 2/3 dos payloads em invoice 3-parcelas.
- **Impacto de negócio**: o analista que enfrenta um IN-DOUBT em invoice multi-título precisa caçar manualmente quais parcelas já caíram no ERP — fricção operacional, não risco contábil. Risco contábil está contido por R-4 (não há super-pagamento) e por anti-drift por título (não há over-pay numa parcela).
- **Métrica de baseline**: 1/N (1 `bxa_cod_seq` na coluna escalar vs. N parcelas baixadas); 1/N payloads preservados em `request_payload` (último sobrescreve anteriores); 0 cobertura de teste do cenário "crash mid-loop multi-título".

### F-fault-tolerance-2: `POST /reconciliar-lote` e `POST /adiantamentos/:docCod/reconciliar` não honram `Idempotency-Key` HTTP (carry da run anterior — abertura confirmada)

- **Severidade**: P1 (alto — duplo-clique cross-tab / retry HTTP cria dois lotes concorrentes sobre os mesmos adtos)
- **Tactic violada**: Idempotent Replay (defesa no boundary)
- **Localização**: `src/backend/routes/permutas.ts:514-536, 542-566` (vs. `:211-228` no `/eleicao`)
- **Evidência (objetiva)**:
  ```typescript
  // /reconciliar-lote (permutas.ts:542)
  router.post('/reconciliar-lote', requireRole('admin'), heavyRouteLimiter,
      asyncHandler(async (req, res) => {
          // …não lê req.header('Idempotency-Key')…
          const result = await service.reconciliarLote({ executadoPor, dataMovto, requestId, … });
          res.json(result);
      }),
  );

  // Comparar com /eleicao (permutas.ts:222):
  const rawKey = req.header('Idempotency-Key');
  ```
- **Impacto técnico**: dois lotes concorrentes para os MESMOS adtos. Idempotência por-par (chave UNIQUE) protege contra re-POST de par já `settled`, mas **dois `criarBordero` paralelos no mesmo adto criam DOIS borderôs distintos** (ERP não dedupa borderôs por origem); um fica vazio EM CADASTRO. Sob multi-título, o blast radius aumenta: cada borderô paralelo pode ter N parcelas distribuídas conforme a corrida de `validarTituloBaixa` em-aberto.
- **Impacto de negócio**: ruído operacional (borderôs vazios poluindo a lista); analista perde tempo limpando; risco de aprovar o borderô errado. Sem mitigação no caminho HTTP — só `setExecutandoLote(true)+disabled` no frontend (cobre 1 tab).
- **Métrica de baseline**: 1/3 rotas de escrita financeira honram `Idempotency-Key` hoje (`/eleicao` sim; `/reconciliar-lote` e `/reconciliar` individual não). Aberto desde `2026-06-26-0058` (`F-fault-tolerance-2`) — segue follow-up explícito do R-4.

### F-fault-tolerance-3: Sem stuck-state reaper para execuções `reconciling` órfãs (4ª run aberta — escalando)

- **Severidade**: P1 (alto — R-4 fail-closed protege contra super-pagamento, mas pares IN-DOUBT continuam invisíveis até alguém olhar a tela)
- **Tactic violada**: Condition Monitoring + Reconcile
- **Localização**: ausência sistêmica — `PermutaExecucaoRepository.ts` não expõe `listStuckReconciling`; nenhum job em `src/backend/jobs/` faz sweep
- **Evidência (objetiva)**:
  ```
  $ grep -rn "stuck\|reaper\|listStuckReconciling\|reconciliar-orfaos" src/backend/ \
      --include=*.ts | grep -v test | grep -v dist
  → 0 hits no caminho de produção

  $ ls src/backend/jobs/
  → ingest-permutas.ts   (ingestão)
    seed-admin.ts         (bootstrap)
  ```
  Aberto desde `docs/regis-review/2026-06-23-1518` (`ft-2`); confirmado em `2026-06-24-2011` (`F-7`), `2026-06-25-1713` (`F-3`) e `2026-06-26-0058` (`F-fault-tolerance-3`). É follow-up explícito do R-4 (citado no prompt).
- **Impacto técnico**: agora que R-4 fail-closed evita o re-POST, a janela cinza vira IN-DOUBT silenciosamente. Sem reaper, ninguém é avisado proativamente — o painel mostra os pares como "em processamento" indefinidamente, mas eles estão de fato precisando de inspeção humana. Pior em invoice multi-título: o reaper precisaria também ler `erp_response.bxaCodSeqs` para dar pistas de quais parcelas caíram.
- **Impacto de negócio**: o painel "tudo o que tentamos foi confirmado" é ilusório; divergência só vira incidente quando o analista compara manualmente. MTTD permanece "indefinido".
- **Métrica de baseline**: 0 jobs detectores presentes; MTTD de par órfão = indefinido (depende de inspeção humana); 4 runs sem fechamento.

### F-fault-tolerance-4: Ações de borderô (finalizar/cancelar/estornar/excluir/excluir-baixa) NÃO têm audit-trail DB-persistido — só `LogService.info → stdout` (carry da run anterior)

- **Severidade**: P1 (alto — invariante cross-cutting da proposta: toda ação que mexe em dinheiro deve ter trilha DB-persistida — quem/quando/o-quê)
- **Tactic violada**: Condition Monitoring + Quarantine (visibilidade forense)
- **Localização**: `src/backend/domain/service/permutas/BorderoGestaoService.ts:137-147, 186-191, 208-213, 228-233, 246-249` + `src/backend/domain/service/LogService.ts:19-27`
- **Evidência (objetiva)**:
  ```typescript
  // BorderoGestaoService.finalizarBordero  (BorderoGestaoService.ts:198-213)
  await this.conexosBaixaClient.finalizarBordero({ filCod, borCod: params.borCod });
  await this.execucaoRepository.updateBorderoCacheSituacao(filCod, params.borCod,
      { borVldFinalizado: 1 });
  await this.logService.info({                  // ← stdout-only (LogService.ts:26)
      type: LOG_TYPE.BUSINESS_INFO,
      message: 'borderô finalizado/aprovado (fin010)',
      data: { borCod: params.borCod, executadoPor: params.executadoPor },
  });

  $ ls src/backend/migrations/ | grep -i 'acao_log\|audit'
  → (vazio — sem tabela)
  ```
  Cobertura DB: 0/5 ações de borderô persistem em tabela; 5/5 só escrevem em stdout. Em contraste, a **baixa em si** TEM trilha completa (`permuta_alocacao_execucao`) — o gap é só na **gestão do ciclo de vida do borderô** depois da baixa.
- **Impacto técnico**: Render rotaciona logs por TTL (~7 dias no Free); um analista que aprovou/cancelou um borderô há 30 dias é invisível para qualquer query SQL. Não há "who finalized borderô 14918 e quando" via consulta direta.
- **Impacto de negócio**: compliance financeiro — exigência típica de auditoria sobre quem finalizou/cancelou cada borderô é frágil; em contestação ("não fui eu que aprovei essa baixa") não há prova durável.
- **Métrica de baseline**: 5/5 ações de borderô sem persistência DB (0% de cobertura); 0 migrations criam tabela `bordero_acao_log` ou equivalente; `LogService.writeLog` escreve só `process.stdout.write`.

### F-fault-tolerance-5: Sem reconciliação periódica trilha local ↔ ERP `fin010` (drift detection ausente — carry da run anterior)

- **Severidade**: P1 (alto — sem detecção de divergência silenciosa de estado externo)
- **Tactic violada**: Reconcile
- **Localização**: ausência sistêmica — sem job/endpoint que percorra `permuta_alocacao_execucao` + `permuta_bordero` confrontando com `fin010/list` ou `fin010/baixas/list`
- **Evidência (objetiva)**:
  ```
  $ grep -rn "reconciliar-orfaos\|driftDetect\|drift_check\|sweep" src/backend --include=*.ts \
      | grep -v test
  → 0 hits no caminho de produção
    (sweep aparece só em IngestaoPermutasService.ts — staleness da ingestão, não drift cross-system)

  $ ls src/backend/jobs/
  ingest-permutas.ts             # (único job de domínio — ingestão, NÃO drift)
  seed-admin.ts
  ```
  Aberto desde `2026-06-23-1518` (`ft-3`). Hoje a trilha confia no caminho do clique do analista; um borderô estornado **fora do sistema** (direto no Conexos) só é detectado quando o analista olha a tela de Borderôs e `live=true` reconsulta via `getBordero`.
- **Impacto técnico**: divergência permanente possível — par `settled` na nossa trilha cujo borderô foi estornado externamente no ERP só é "visto" quando alguém abre a tela. Sem alerta proativo. `borderoAindaValido` cobre o caso só no *próximo* relançamento da permuta, não na chegada da divergência. Agravado por multi-título: um borderô com N baixas pode ser parcialmente estornado em alguma parcela específica — drift mais sutil.
- **Impacto de negócio**: o dashboard "mente passivamente" sobre o que foi baixado; descoberta tardia atrasa o fechamento contábil mensal.
- **Métrica de baseline**: 0 jobs de drift; tempo médio de detecção de divergência cross-system = "próximo refresh humano da tela de Borderôs".

### F-fault-tolerance-6: Silent catch em `listTitulosAPagar` esconde falha de leitura e degrada para fallback título único sem aviso

- **Severidade**: P2 (médio — risco contábil contido por anti-drift por título; risco operacional é regredir invoice multi-título a baixa título-único quando o ERP estiver instável)
- **Tactic violada**: Sanity Checking (parcial) + Condition Monitoring (silent failure)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:299-323`
- **Evidência (objetiva)**:
  ```typescript
  // ReconciliacaoPermutaService.executarBaixa (linhas 299-323)
  let titulos: Array<{ titCod: number; usd: number; taxa: number }> = [];
  try {
      const raw = await this.conexosTitulosClient.listTitulosAPagar({
          docCod: String(invoiceDocCod),
          filCod,
      });
      titulos = raw
          .map((t) => ({ titCod: Number(t.titCod), usd: t.valorNegociado, taxa: t.taxa }))
          .filter(...)
          .sort((a, b) => a.titCod - b.titCod);
  } catch {
      // segue no fallback                          ← SEM logService.warn, SEM telemetry
  }
  if (titulos.length === 0) {
      titulos = [{ titCod: 1, usd: aloc.valorAlocado, taxa: aloc.taxaInvoice }];
  }
  ```
- **Impacto técnico**: se o ERP cair, retornar 5xx, ou retornar resposta vazia/malformada (Zod do client rejeita), a baixa silenciosamente regride para `titCod=1` com o valor cheio da alocação. Se a invoice for, de fato, multi-título: o anti-drift do passo 2 (linha 421) abortará o título 1 com over-pay (`bxaMnyValor > emAbertoErp + tolerância`) — não corrompe, mas o operador vê "anti-drift" em vez de "ERP não devolveu títulos", confundindo o diagnóstico.
- **Impacto de negócio**: diagnóstico errado em incidente — analista olha "anti-drift" achando que é problema de cálculo de alocação, quando na verdade é o ERP que não respondeu. Tempo de incidente cresce.
- **Métrica de baseline**: 0 logs explícitos de fallback (silent catch); cenário diagnostável só correlacionando o `error` da baixa com o `axios` log do client (que vive em stdout do Render).

## 5. Cards Kanban

### [fault-tolerance-1] Granularidade forense por parcela no multi-título (`bxa_cod_seq` array + `request_payload` array)

- **Problema**
  > Com a baixa multi-título (PR #22), `executarBaixa` faz N POSTs irreversíveis (`gravarBaixaPermuta`) num único par adto↔invoice, mas a trilha (`permuta_alocacao_execucao`) tem só `bxa_cod_seq BIGINT` escalar e `request_payload jsonb` único. `markSettled` grava só `bxaCodSeqs[0]` na coluna escalar e o array completo vai pra `erp_response` (JSON). `setRequestPayload` é chamado por título e sobrescreve. Sob crash mid-loop, o analista não distingue qual parcela caiu — R-4 fail-closed evita super-pagamento, mas o forense é manual.

- **Melhoria Proposta**
  > (1) Migração `0022_permuta_alocacao_execucao_multi_titulo.sql`: adicionar `bxa_cod_seqs JSONB DEFAULT '[]'::jsonb` (todos os bxaCodSeq do par) e `request_payloads JSONB DEFAULT '[]'::jsonb` (payloads na ordem do loop). Manter `bxa_cod_seq` escalar como compatibilidade (1ª parcela). (2) `PermutaExecucaoRepository.appendBxaSeq(key, bxaSeq, payload)` chamado após CADA `baixarTitulo` (write-ahead por parcela). (3) `markSettled` agrega o array de `bxaCodSeqs` + total. (4) Teste novo: cenário "crash entre baixarTitulo 1 e 2 → trilha contém bxa1 + payload1, R-4 reconhece estado parcial e instrui conferência granular". Tactic Bass = Condition Monitoring + Idempotent Replay.

- **Resultado Esperado**
  > Trilha consegue responder "quais parcelas da invoice X caíram no borderô Y e quais payloads foram enviados" via SQL direto, sem precisar abrir o Conexos. Métrica: # de parcelas baixadas representadas na trilha = N/N (vs. 1/N hoje); # de payloads preservados = N/N (vs. 1/N hoje, último sobrescreve).

- **Tactic alvo**: Condition Monitoring + Idempotent Replay
- **Severidade**: P2
- **Esforço estimado**: M (2–5d) — migração + repo + service + 1 teste novo
- **Findings relacionados**: F-fault-tolerance-1
- **Métricas de sucesso**:
  - Parcelas representadas na trilha: 1/N → N/N
  - Payloads preservados: 1/N → N/N
  - Cobertura de teste "crash mid-loop multi-título": 0 → ≥ 1
- **Risco de não fazer**: cada incidente em invoice multi-título exige cross-reference manual com o ERP; tempo de conciliação cresce com a fração de invoices multi-título no portfólio.
- **Dependências**: nenhuma; convive com `fault-tolerance-2/3` (todos tocam `permuta_alocacao_execucao`).

### [fault-tolerance-2] Honrar `Idempotency-Key` em `POST /reconciliar-lote` e `POST /adiantamentos/:docCod/reconciliar` (follow-up explícito do R-4)

- **Problema**
  > 1/3 rotas de escrita financeira aceita `Idempotency-Key` hoje (`/eleicao`); `/reconciliar-lote` e o reconciliar individual NÃO leem o header. Duplo-fetch (retry HTTP, F5, dois browser tabs) dispara dois lotes para os mesmos adtos. Com multi-título ativo, o blast radius aumenta — cada borderô paralelo pode incluir N parcelas distribuídas conforme corrida de `validarTituloBaixa`. R-4 fail-closed protege par já em `reconciling`, mas dois POST simultâneos podem AMBOS chegar ao `beginExecution` sem ver o conflito.

- **Melhoria Proposta**
  > Replicar o padrão de `/eleicao` (`routes/permutas.ts:222-228`) em `/reconciliar-lote` (linha 542) e `/adiantamentos/:docCod/reconciliar` (linha 514). Persistir `(idempotency_key, payload_hash, response_json, created_at)` em tabela curta com TTL 24h; em re-request com a MESMA key + payload, devolver a resposta cacheada. Frontend gera a key com `crypto.randomUUID()` por clique no modal. Tactic Bass = Idempotent Replay (boundary).

- **Resultado Esperado**
  > 3/3 rotas de escrita financeira honram `Idempotency-Key` (vs. 1/3 hoje); duplo-clique cross-tab não dispara dois lotes. Métrica: # de borderôs vazios criados por re-request = 0.

- **Tactic alvo**: Idempotent Replay
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-fault-tolerance-2
- **Métricas de sucesso**:
  - % rotas state-mutating de escrita fin010 com `Idempotency-Key`: 33% → 100%
  - Teste e2e cobrindo "duplo POST mesma key responde idem-cache": 0 → 1
- **Risco de não fazer**: incidentes recorrentes de "executei 2× sem querer"; com multi-título ativo, blast radius cresce.
- **Dependências**: nenhuma.

### [fault-tolerance-3] Stuck-state reaper para execuções `reconciling` órfãs (4ª re-priorização — follow-up explícito do R-4)

- **Problema**
  > Aberto há 4 runs (`2026-06-23-1518:ft-2`, `2026-06-24-2011:F-7`, `2026-06-25-1713:F-3`, `2026-06-26-0058:F-fault-tolerance-3`). R-4 fail-closed (linha 184-212) AGORA protege contra super-pagamento, mas sem reaper os pares IN-DOUBT (`status='reconciling' AND bor_cod IS NOT NULL AND bxa_cod_seq IS NULL AND atualizado_em < now()-30 min`) continuam invisíveis. Citado explicitamente no prompt como follow-up ABERTO.

- **Melhoria Proposta**
  > (1) `PermutaExecucaoRepository.listStuckReconciling(thresholdMinutes)`. (2) `StuckReconciliacaoReaperService` — para cada órfão, consultar `getBordero` + `listBaixas`; (a) `markSettled` se a baixa caiu (com `bxaCodSeq` real e, sob multi-título, `bxaCodSeqs[]`); (b) `markError("órfão >30 min — provável timeout/crash do request bulk; conferir no Conexos")` se não caiu, com `request_payload` preservado; (c) IN-DOUBT (R-4 já marcou error) → reconfirmar via `listBaixas` e enriquecer mensagem. (3) Provisório: rota admin `POST /permutas/reconciliar-orfaos` (mesmo padrão do `/ingestao` manual). (4) Alvo Lambda: EventBridge a cada 10 min. Tactic = Condition Monitoring + Reconcile.

- **Resultado Esperado**
  > MTTD de par órfão cai de "indefinido" para ≤ 10 min (com cron) ou ≤ 1 clique admin (provisório). 0 órfãos invisíveis após o run.

- **Tactic alvo**: Condition Monitoring + Reconcile
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) — incluindo testes dos 3 cenários (caiu / não-caiu / multi-título parcial)
- **Findings relacionados**: F-fault-tolerance-3, F-fault-tolerance-1 (multi-título amplia o que o reaper precisa diagnosticar)
- **Métricas de sucesso**:
  - Jobs/rotas detectores: 0 → 1
  - MTTD: indefinido → ≤ 10 min (cron) ou ≤ 1 clique admin (provisório)
- **Risco de não fazer**: 5ª re-priorização na próxima run; cresce a backlog de IN-DOUBTs silenciosos; com multi-título, o universo de pares precisando inspeção forense aumenta.
- **Dependências**: idealmente compartilha repo com `fault-tolerance-1` (multi-bxa).

### [fault-tolerance-4] Persistir audit-trail DB das ações de borderô (finalizar/cancelar/estornar/excluir/excluir-baixa)

- **Problema**
  > As 5 ações de gestão de borderô em `BorderoGestaoService` (finalizar, cancelar, estornar, excluir borderô, excluir baixa) só escrevem via `LogService.info → process.stdout.write` (LogService.ts:26). Sem tabela DB-persistida. Render rotaciona logs por TTL; "quem aprovou o borderô 14918 e quando" não é consultável via SQL após o ciclo de logs.

- **Melhoria Proposta**
  > Migration nova: `0023_bordero_acao_log.sql` com `(id, bor_cod, fil_cod, acao TEXT CHECK IN ('finalizar','cancelar','estornar','excluir','excluir-baixa'), invoice_doc_cod NULL, executado_por, payload_request JSONB, erp_response JSONB, erro_mensagem NULL, criado_em)`. Cada método de `BorderoGestaoService` registra a ação ANTES de chamar o ERP (write-ahead) e atualiza com o resultado após. Espelhar o padrão de `permuta_alocacao_execucao` (write-ahead → resultado). Tactic Bass = Condition Monitoring + Quarantine (forense).

- **Resultado Esperado**
  > 5/5 ações de borderô têm trilha DB consultável (vs. 0/5 hoje). Métrica: `SELECT count(*) FROM bordero_acao_log WHERE bor_cod=X` retorna a linha-do-tempo completa do borderô.

- **Tactic alvo**: Condition Monitoring + Quarantine
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) — migration + repository + 5 callsites + testes
- **Findings relacionados**: F-fault-tolerance-4
- **Métricas de sucesso**:
  - Ações de borderô com trilha DB: 0/5 → 5/5
  - Cobertura de testes asserindo a gravação da trilha: 0 → 5 (1 por ação)
- **Risco de não fazer**: compliance fraca em contestação; auditor pede e o time só pode mostrar logs voláteis do Render.
- **Dependências**: nenhuma.

### [fault-tolerance-5] Reconciliação periódica trilha ↔ fin010 (drift detection)

- **Problema**
  > Sem job/rota que confronte `permuta_alocacao_execucao` (linhas `settled`) e `permuta_bordero` (cache) com o `fin010` real. Aberto desde `2026-06-23-1518` (`ft-3`). Um borderô estornado externamente só é "visto" quando alguém abre a tela com `live=true`. `borderoAindaValido` cobre só no *próximo* relançamento.

- **Melhoria Proposta**
  > `DriftReconciliacaoService` que, em loop (ou rota admin provisória `POST /permutas/conferir-drift`), para cada `settled` da trilha consulta o estado vivo do borderô no ERP: (a) se foi CANCELADO/ESTORNADO/REMOVIDO no Conexos sem passar pelo nosso fluxo, marca o `settled` como `error` com mensagem "divergência detectada" e libera o relançamento; (b) sob multi-título, comparar `bxa_cod_seqs[]` (array) com `listBaixas({borCod})` para detectar parcela estornada individualmente; (c) gera relatório de drift do dia para o analista revisar. Mesmo job pode reaproveitar `BorderoGestaoService.refreshCache`. Quando houver job runner (alvo Lambda + EventBridge), rodar 1×/dia. Tactic = Reconcile.

- **Resultado Esperado**
  > Divergência cross-system detectada em ≤ 24h (vs. "próximo refresh humano da tela"). Métrica: # de `settled` na trilha cuja situação no ERP diverge = 0 após o job.

- **Tactic alvo**: Reconcile
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) provisório (rota admin); L incluindo cron alvo
- **Findings relacionados**: F-fault-tolerance-5, F-fault-tolerance-3 (mesma família — varredura)
- **Métricas de sucesso**:
  - Jobs/rotas de drift: 0 → 1
  - Tempo máximo de detecção: humano → ≤ 24h (cron) ou ≤ 1 clique admin (provisório)
- **Risco de não fazer**: dashboard "mente passivamente"; descoberta tardia atrasa fechamento contábil mensal; volta como `ft-3` na próxima run.
- **Dependências**: idealmente reaproveita a infra de varredura do `fault-tolerance-3` e o array `bxa_cod_seqs[]` do `fault-tolerance-1`.

### [fault-tolerance-6] Trocar o silent catch de `listTitulosAPagar` por fallback explícito com `logService.warn` + flag de origem

- **Problema**
  > `ReconciliacaoPermutaService.executarBaixa` (linhas 318-320) tem `try { … } catch { /* segue no fallback */ }` ao listar títulos da invoice. Falha do ERP (5xx, timeout, Zod) cai silenciosamente para `titCod=1` com valor cheio. Se a invoice for de fato multi-título, anti-drift do passo 2 (linha 421) aborta com "anti-drift > em-aberto" — diagnóstico errado: parece problema de alocação, mas é leitura do ERP que falhou.

- **Melhoria Proposta**
  > (1) `logService.warn` no catch com `LOG_TYPE.BUSINESS_WARN`, mensagem `'listTitulosAPagar falhou — usando fallback titCod=1; conferir invoice'`, data `{ invoiceDocCod, filCod, error }`. (2) Carregar uma flag local `titulosOrigem: 'erp' | 'fallback'` e propagá-la no `markError` da baixa para o analista enxergar a origem do fallback. (3) Teste: mockar `listTitulosAPagar` lançando → asserir que o warn é gravado e a flag aparece na mensagem do `markError` quando anti-drift dispara. Tactic Bass = Sanity Checking + Condition Monitoring.

- **Resultado Esperado**
  > Diagnóstico claro em incidente: o analista enxerga "ERP não devolveu títulos (fallback)" ao invés de "anti-drift". Métrica: # de erros `anti-drift` em invoice multi-título cuja causa raiz era `listTitulosAPagar` falhada e foi diagnosticada errado: > 0 hoje (sem instrumentação) → 0 com a flag.

- **Tactic alvo**: Sanity Checking + Condition Monitoring
- **Severidade**: P2
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-fault-tolerance-6
- **Métricas de sucesso**:
  - Logs explícitos de fallback: 0 → todo catch
  - Cobertura de teste do caminho fallback: 0 → 1
- **Risco de não fazer**: incidentes de leitura do ERP confundidos com erros de alocação; tempo de incidente cresce; ainda mais relevante porque multi-título acabou de entrar em produção.
- **Dependências**: nenhuma.

## 6. Notas do agente

- **Mudanças desde a run anterior (2026-06-26-0058)**: **fechou F-1 (re-POST janela cinza)** via R-4 fail-closed na linha 184-212 de `ReconciliacaoPermutaService.ts` — re-fire de par `reconciling+borCod` agora aborta com `markError + BUSINESS_WARN 'IN-DOUBT'` SEM re-POSTar. **Fechou F-5 (multi-título bloqueado)** via PR #22 (commit `32ed3e2`, v0.9.0) — `executarBaixa` itera `titCod 1..N` chamando `baixarTitulo` no MESMO borderô, com anti-drift POR título. Adicionei dois novos achados nascidos do loop multi-título: F-1 (granularidade forense por parcela — `bxa_cod_seq` escalar + `setRequestPayload` sobrescreve, mitigado por R-4 mas degrada o forense) e F-6 (silent catch em `listTitulosAPagar` que silenciosamente degrada para título único). Mantive F-2/3/4/5 (Idempotency-Key, reaper, audit-trail borderô, reconcile) — todos confirmados via grep/ls como ainda abertos; os dois que o prompt cita explicitamente como follow-ups do R-4 (Idempotency-Key + reaper) seguem abertos sem regressão.
- **Score 8.6 (vs. 8.1 anterior)**: o fechamento de F-1 (P1) e F-5 (P1) por código de produção verificável vale +0.5 cada na minha escala. Os novos F-1/F-6 são P2 (não causam super-pagamento; R-4 + anti-drift por título cobrem o vetor financeiro — o débito é forense/diagnóstico). Os 4 P1 herdados (Idempotency-Key, reaper, audit-trail borderô, reconcile) continuam pesando — especialmente o reaper que entra na 4ª run. Caminho feliz + erro parcial + crash mid-loop multi-título estão **muito bem cobertos** (R-4 + anti-drift por título são a peça-chave). O débito está concentrado em (a) granularidade forense por parcela no multi-título (novo, P2) e (b) instrumentação de detecção/audit-trail (herdado, P1).
- **Cross-QA**: F-2 (`Idempotency-Key`) overlap direto com qa-security (anti-replay) e qa-availability (anti duplo-fan-out). F-4 (audit trail) overlap direto com qa-security (auditabilidade) e qa-testability (asserir gravação). F-3 + F-5 (sweepers/reconcile) overlap com qa-availability (visibilidade de stuck-state) e qa-testability (cobertura cenários órfãos + multi-título parcial). F-1 (bxa_cod_seqs[]) overlap com qa-modifiability (mudança de schema da tabela canônica). F-6 (silent catch) overlap com qa-integrability (contrato fin010) e qa-testability (cenário de degradação). Sinalizar ao `qa-consolidator` para evitar contagem dupla.
- **Não medível localmente**: # de pares IN-DOUBT em prod (R-4 fail-closed), MTTR conciliação manual, # de invoices multi-título baixadas com sucesso vs. abortadas por anti-drift, latência fim-a-fim real do lote sob multi-título — exige Postgres prod + Render logs (não há CloudWatch/X-Ray; Lambda é alvo). Reportei só o caminho de código + métricas estáticas.
