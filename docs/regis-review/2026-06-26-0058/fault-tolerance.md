---
qa: Fault Tolerance
qa_slug: fault-tolerance
run_id: 2026-06-26-0058
agent: qa-fault-tolerance
generated_at: 2026-06-26T01:10:00-03:00
scope: all
score: 8.1
findings_count: 6
cards_count: 6
---

# Fault Tolerance — Regis-Review

> **Autoral**: Fault Tolerance substituiu "Safety" (Bass & Clements) — em automação financeira
> multi-tenant a preocupação real é **consistência de estado sob falha parcial** sobre escritas
> que movem dinheiro em sistemas de terceiros (Conexos `fin010`). Tactics canônicas Bass são
> aplicadas onde transferem; o resto vem da literatura clássica (Gray & Reuter, Garcia-Molina:
> idempotency, write-ahead, compensating transactions, reconcile).

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista admin clica **"Executar lote"** (até `LOTE_MAX=6` automáticas) ou abre/cancela um borderô | (a) Render proxy corta o request DEPOIS de `setBorCod` e ANTES de `markSettled` num par; (b) duplo-clique cross-tab dispara dois POST `/reconciliar-lote` simultâneos; (c) invoice tem >1 título e a alocação extrapola o em-aberto do título 1; (d) borderô finalizado é cancelado/estornado externamente no Conexos e o sistema relança a permuta | `ReconciliacaoPermutaService` (handshake fin010 de 5 chamadas, write-ahead em `permuta_alocacao_execucao`) + `ReconciliacaoLotePermutaService` (sequencial, continue-on-error, `LOTE_MAX=6`) + `BorderoGestaoService` (finalizar/cancelar/estornar/excluir) + `AlocacaoPermutasService.remover` (trava de integridade v0.8.2/0.8.3) | Prod: Express/Render, Supabase Postgres com `withTransaction` disponível, sem SQS/DLQ (Lambda é alvo), `CONEXOS_WRITE_ENABLED=true` + `CONEXOS_DRY_RUN=false`, 26 automáticas potenciais/dia, latência ERP 250–800 ms/POST | Cada par atômico (`settled` / `error` com `erp_response` cru); falhas isoladas NÃO abortam o lote; pares já `settled` viram `skipped`; borderôs ficam **EM CADASTRO** aguardando aprovação manual; alocação em borderô vivo NÃO pode ser removida (HTTP 409); anti-drift aborta baixa que excede em-aberto do ERP | 0 baixas duplicadas em re-fire pós-timeout (idempotência write-ahead + idempotência viva); 0 borderôs aprovados sem revisão humana (checkpoint EM CADASTRO + admin + heavyRouteLimiter); 100% dos `error` visíveis na trilha; alocação consumida nunca é apagada sem cancelar/excluir o borderô primeiro |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Idempotência write-ahead nas baixas fin010 | 100% (`idempotency_key = permuta:{adto}:{invoice}:{atualizadoEm}` UNIQUE; `beginExecution` preserva `settled` no `ON CONFLICT`) | 100% | ✅ | `PermutaExecucaoRepository.ts:223-256` + `0015_permuta_alocacao_execucao.sql:36` |
| Atomicidade por par adto↔invoice (try/catch + `markError` com payload cru) | 100% | 100% | ✅ | `ReconciliacaoPermutaService.ts:190-222` |
| `setBorCod` persistido ANTES do POST (recuperação de órfão) | ✅ presente (UPDATE imediatamente após `criarBordero`, ANTES do passo 2) | presente | ✅ | `ReconciliacaoPermutaService.ts:247` + `PermutaExecucaoRepository.ts:258-266` |
| Continue-on-error no lote (falha de 1 adto não interrompe os demais) | 100% (try/catch por iteração + agregação em `resultados[]`) | 100% | ✅ | `ReconciliacaoLotePermutaService.ts:113-149` |
| Cap server-side no blast radius do lote | `LOTE_MAX=6` (bound execution time + blast radius por clique) | bounded | ✅ | `ReconciliacaoLotePermutaService.ts:14, 101-104` |
| Retry automático em escritas não-idempotentes (`criarBordero`, `gravarBaixaPermuta`) | 0 (decisão explícita: tentativa única; comentário cita Regis F-fault-tolerance-1) | 0 | ✅ | `ConexosClient.ts:1077-1080, 1473-1478` |
| Zod no boundary das escritas fin010 (resposta vira confirmação persistida) | 2/2 (`BORDERO_CRIADO_SCHEMA`, `BAIXA_GRAVADA_SCHEMA`) | 100% | ✅ | `ConexosClient.ts:396-407, 1103, 1491` |
| Sanity-checking de validações fin010 (`messages[*].valid='ERRO'`) | presente — `assertNoErpError` aborta o handshake (status 200 com erro lógico não passa) | presente | ✅ | `ReconciliacaoPermutaService.ts:491-499` |
| Guard anti-drift I-Write-1 (baixa ≤ em-aberto vivo do ERP) | presente — tolerância `max(0.01, em-aberto × 0.005)` + `Math.min(valorBaixaDesejado, emAbertoErp)` | presente | ✅ | `ReconciliacaoPermutaService.ts:269-284` |
| Idempotência viva (borderô cancelado/estornado/removido libera relançamento) | presente — `borderoAindaValido` consulta `getBordero` + `borCodEstornado`/`borVldFinalizado=2`; renomeia chave para preservar histórico | presente | ✅ | `ReconciliacaoPermutaService.ts:155-173, 506-517` |
| Trava de integridade: alocação em borderô vivo NÃO pode ser removida (v0.8.2 + ignora CANCELADO v0.8.3) | presente — `AlocacaoEmBorderoError` 409 quando `borderoDoPar` ≠ null; query exclui `bor_vld_finalizado=2` | presente | ✅ | `AlocacaoPermutasService.ts:293-303` + `PermutaExecucaoRepository.ts:102-123` |
| Transações multi-write (`withTransaction`) onde repositórios escrevem em ≥2 tabelas | 2/2 callsites de domínio (snapshot da eleição, ingestão relacional) — repositórios single-table não precisam | 100% nos casos de domínio | ✅ | `PermutaSnapshotRepository.ts:98` + `PermutaRelationalRepository.ts:196-199` |
| Idempotency-Key HTTP nas rotas de escrita financeira | 1/3 (✅ `/eleicao`, ❌ `/reconciliar-lote`, ❌ `/adiantamentos/:docCod/reconciliar`) | 3/3 | ❌ | `routes/permutas.ts:222` vs. `:518-536, :542-566` |
| Audit-trail DB-persistido das ações de borderô (finalizar/cancelar/estornar/excluir/excluir-baixa) | 0/5 (todas usam `LogService.info` que escreve **stdout** apenas; sem tabela `bordero_acao_log`) | 5/5 (persistido em DB) | ❌ | `BorderoGestaoService.ts:135-145, 184-188, 206-210, 226-230, 245-248` + `LogService.ts:19-27` |
| Audit-trail DB-persistido das baixas (par adto↔invoice) | 100% (`permuta_alocacao_execucao` grava `executado_por`, `atualizado_em`, `request_payload`, `erp_response`, `erro_mensagem`) | 100% | ✅ | `PermutaExecucaoRepository.ts:268-330` + `migrations/0015_*.sql:15-34` |
| Stuck-state reaper para `status='reconciling' AND atualizado_em < now()-interval '30 min'` | ❌ ausente (sem job runner — migration-debt O4) | presente | ❌ | grep `stuck\|reaper\|listStuckReconciling` → 0 hits |
| Reconciliação periódica trilha local ↔ ERP fin010 (drift detection) | ❌ ausente | presente | ❌ | grep `reconciliar-orfaos\|driftDetection` → 0 hits; `permutas-reconciliacao-regis-followups.md:ft-3` |
| Trata invoice com múltiplos títulos (N parcelas) | ❌ `titCod: 1` HARDCODED em 4 ocorrências — anti-drift aborta corretamente (não corrompe), mas bloqueia o caso B; documentado | decisão B/A pendente | ⚠️ | `ReconciliacaoPermutaService.ts:254, 313, 401, 467` + `_inbox/permuta-multi-titulo-pendente.md` |
| Cobertura de testes do serviço de reconciliação | `ReconciliacaoPermutaService.test.ts` (397 LOC) + `ReconciliacaoLotePermutaService.test.ts` (270 LOC) + `BorderoGestaoService.test.ts` (396 LOC) | ≥ 1 caso/cenário crítico | ✅ | `wc -l` |
| `notify.error` / `toast.error` em mutations financeiras do frontend | presente em 100% dos sites de escrita (reconciliar, lote, finalizar, cancelar, estornar, excluir, alocar, remover) | 100% | ✅ | `page.tsx:783-785, 817-818, 884-889, 901-903` (46 ocorrências de `toast.` no `page.tsx`) |
| Optimistic update com rollback | ausente (mutations chamam `load()` para refetch do servidor depois do sucesso — modelo pessimista) | N/A — modelo pessimista é correto p/ escrita financeira | ✅ | `page.tsx:782, 816, 879-885` |
| SQS / DLQ universalmente configurados | N/A — Express puro, sem SQS (Lambda é alvo, migration-debt O4) | N/A | N/A | `CLAUDE.md` (alvo) |

> ⚠️ **Não medível localmente**: # de execuções `reconciling` órfãs em prod, MTTR médio para
> conciliar manual uma baixa em `error`, taxa real de timeout do proxy Render no caminho do lote,
> # de borderôs vazios criados por re-clique cross-tab. Requer query ad-hoc no Postgres de prod
> (`SELECT count(*) FROM permuta_alocacao_execucao WHERE status='reconciling' AND atualizado_em < now()-interval '30 min'`) + acesso aos logs Render (sem CloudWatch/X-Ray pois não há AWS).
>
> ⚠️ **Não medível localmente**: latência fim-a-fim do `POST /reconciliar-lote` em prod. No
> pior caso (cold ERP, 6 adtos × 5 chamadas × 800 ms ≈ 24 s) ainda fica dentro do default Render
> (100 s), mas o cap `LOTE_MAX=6` (vs. 26 originalmente) reduz drasticamente a janela cinza de
> timeout-pós-sucesso vs. a run anterior.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Substitution | N/A — uma baixa fin010 não tem "fallback de baixa" silencioso | N/A | — |
| Replacement | N/A — sem componentes redundantes ativos (Render single-instance) | N/A | — |
| Predictive Model | Dry-run via `CONEXOS_DRY_RUN` / `dryRunOverride` valida o payload sem POST (preview montado SÓ com dados locais) | ✅ presente | `ReconciliacaoPermutaService.ts:124-146, 459-484` |
| Increase Competence Set | `friendlyErpMessage` traduz códigos do fin010 (`FIN_010.DATA_BLOQUEADA_PELA_CONTABILIDADE`, `CnxValidatorMny`, `CnxValidatorDescr`); rota `respondActionError` enriquece `requestId` + `erpDetail` cru pro analista | ✅ presente | `ReconciliacaoPermutaService.ts:528-541` + `routes/permutas.ts:110-156` |
| Sanity Checking | Zod no boundary (`BORDERO_CRIADO_SCHEMA`, `BAIXA_GRAVADA_SCHEMA`); `assertNoErpError` em status 200+ERRO; **anti-drift I-Write-1** (`bxaMnyValor > emAbertoErp+tolerância → aborta`); `round2` em todo monetário (rejeita >2 casas no ERP) | ✅ presente (forte) | `ConexosClient.ts:396-407, 1103, 1491` + `ReconciliacaoPermutaService.ts:269-284, 31, 491-499` |
| Comparison | `borderoAindaValido` compara estado local (`settled`) com estado vivo do borderô no ERP antes de bloquear re-baixa (idempotência viva); `borderoDoPar` exclui `bor_vld_finalizado=2` (trava integridade ignora cancelado, v0.8.3) | ✅ presente | `ReconciliacaoPermutaService.ts:155-173, 506-517` + `PermutaExecucaoRepository.ts:102-123` |
| Timestamp | `atualizado_em` integra a chave idempotente (`permuta:{adto}:{invoice}:{atualizadoEm}`) — re-alocar gera chave NOVA, libera relançamento sem perder histórico | ✅ presente | `ReconciliacaoPermutaService.ts:152` |
| Timeout | axios 40s/chamada Conexos (intra-call); `heavyRouteLimiter` na rota; **sem timeout HTTP fim-a-fim explícito** no fetch do frontend (herda default browser/proxy) | ✅ presente intra-call · ⚠️ ausente fim-a-fim | `services/conexos.ts` + `frontend/lib/api.ts:280-290` |
| Condition Monitoring | Logs estruturados por par (`'permuta reconciliacao SETTLED'`, `'... FALHOU'`); agregação no lote (`'permuta batch reconciliation'`); rota loga resposta crua do ERP em ação de borderô | ✅ presente · ⚠️ stdout-only | `ReconciliacaoPermutaService.ts:134-144, 351-355` + `routes/permutas.ts:122-145` |
| Self-Test | `validarTituloBaixa` (passo 2) confirma o em-aberto vivo do ERP ANTES de calcular `bxaMnyValor`; `validarTituloPermuta` (passo 3) confirma os dados do adto | ✅ presente | `ReconciliacaoPermutaService.ts:250-296` |
| Voting | N/A — sem replicação de cálculo (single source of truth = ERP) | N/A | — |
| Redundancy (DLQ/replicas) | N/A no estado atual — Express puro, sem SQS/DLQ (alvo Lambda; migration-debt O4) | N/A documentado | `CLAUDE.md` |
| Recovery — Rollback (backward) | N/A — fin010 não suporta undo limpo de baixa; política é forward-recovery + checkpoint humano em *Borderôs* | N/A documentado | `business-rules/fin010-write-contract.md` |
| Recovery — Forward / Repair State | `markError` grava `erp_response` cru; baixa fica visível na aba *Borderôs* e em `/adiantamentos/:docCod/execucoes`; analista usa `excluirBaixa`/`excluirBordero`/`cancelarBordero` para limpar e re-tentar; UI sugere "retry" no toast (`'baixas falharam — os casos seguem pendentes para retry'`) | ✅ presente | `ReconciliacaoPermutaService.ts:203-222` + `routes/permutas.ts:684-735` + `page.tsx:812` |
| Reintroduction — Shadow / State Resync / Escalating Restart | Shadow ✓ (dry-run com mesmo payload); State Resync ✓ (re-fire idempotente pula `settled`); Escalating Restart ✗ (sem) | ✅ parcial | `ReconciliacaoPermutaService.ts:124-146, 152-187` |
| Idempotent Replay | Chave write-ahead UNIQUE + `beginExecution` UPSERT que preserva `settled`; `setBorCod` antes do POST garante que um crash entre passos não perde o rastro; **janela cinza `reconciling` órfão** ainda re-posta no re-fire (F-1) | ✅ presente · ⚠️ janela cinza aberta | `PermutaExecucaoRepository.ts:223-256` + `ReconciliacaoPermutaService.ts:152-187, 247` |
| Compensating Transaction | N/A documentado — fin010 não suporta undo limpo; política = forward-recovery + checkpoint humano (analista revê EM CADASTRO antes de aprovar) | N/A documentado | `ReconciliacaoPermutaService.ts:57` (comentário) |
| Reconcile | ❌ ausente — sem job periódico que compare trilha local (`permuta_alocacao_execucao` + `permuta_bordero`) com o ERP (silent drift) | ❌ ausente | grep `reconciliar-orfaos\|driftDetection` → 0 hits; `permutas-reconciliacao-regis-followups.md:ft-3` |
| Quarantine | `status='error'` + `erp_response` cru = quarentena efetiva (par fica fora do `listAtivas`); borderô EM CADASTRO = quarentena soft do borderô antes da aprovação; **trava de integridade v0.8.2/0.8.3** = quarentena explícita (HTTP 409) de alocação consumida | ✅ presente (forte) | `ReconciliacaoPermutaService.ts:203-222` + `AlocacaoPermutasService.ts:293-303` |

## 4. Findings (achados)

### F-fault-tolerance-1: Janela de re-POST de baixa quando o request bulk crasha entre `setBorCod` e `markSettled` (carregado da run anterior, persiste)

- **Severidade**: P1 (alto — pode gerar borderô duplicado / baixa duplicada num re-fire do MESMO lote pós-timeout do proxy)
- **Tactic violada**: Idempotent Replay (parcial)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:176-222` + `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:223-256`
- **Evidência (objetiva)**:
  ```
  Sequência por par no caminho real:
    1. beginExecution(key)             → INSERT/UPDATE status='reconciling'  (PermutaExecucaoRepository.ts:223)
    2. criarBordero (1ª iteração)      → POST fin010 (sem retry)             (ConexosClient.ts:1082)
    3. setBorCod(key, borCod)          → UPDATE                              (ReconciliacaoPermutaService.ts:247)
    4. validarTituloBaixa              → POST fin010
    5. validarTituloPermuta            → POST fin010
    6. atualizarValorLiquido           → POST fin010
    7. gravarBaixaPermuta              → POST fin010 IRREVERSÍVEL (sem retry)
    8. markSettled(key, bxaCodSeq)     → UPDATE

  Crash do request entre (7) e (8) num adto K:
    - linha K fica em status='reconciling' com bor_cod preenchido, sem bxa_cod_seq.

  Re-fire do lote:
    - beginExecution: ON CONFLICT mantém 'reconciling' (não regride; alreadySettled=false).
    - O serviço segue para executarBaixa → re-POST gravarBaixaPermuta → 2ª baixa,
      2º bxaCodSeq sobre o MESMO em-aberto.
    - O guard borderoAindaValido só protege quando status='settled'.
  ```
- **Impacto técnico**: super-pagamento contábil no fin010 — uma invoice baixada 2× gera 2 `bxaCodSeq` distintos sobre o mesmo em-aberto; exige estorno manual e conciliação reversa.
- **Impacto de negócio**: divergência contábil entre nosso painel ("baixado") e o ERP ("baixado 2×"); analista perde tempo conciliando; com o cap `LOTE_MAX=6` (atual), o blast radius por clique caiu de ~26 para ≤6 pares, mas o vetor permanece aberto.
- **Métrica de baseline**: 0 execuções órfãs medidas localmente (sem acesso a prod); 0 jobs/rotas detectores. **Mitigação relativa**: `LOTE_MAX` baixou de 10 para 6 entre runs, reduzindo o blast radius por clique, mas não elimina o vetor.

### F-fault-tolerance-2: `POST /reconciliar-lote` e `POST /adiantamentos/:docCod/reconciliar` não honram `Idempotency-Key` HTTP (carregado da run anterior)

- **Severidade**: P1 (alto — duplo-clique cross-tab / retry HTTP cria dois lotes concorrentes sobre os mesmos adtos)
- **Tactic violada**: Idempotent Replay (defesa no boundary)
- **Localização**: `src/backend/routes/permutas.ts:514-536, 542-566` (vs. `:222-228` no `/eleicao`)
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
- **Impacto técnico**: dois lotes concorrentes para os MESMOS adtos. Idempotência por-par protege pares já `settled`, mas **dois `criarBordero` paralelos no mesmo adto criam DOIS borderôs distintos** (ERP não dedupa borderôs por origem); um fica vazio EM CADASTRO. Combinado com F-1, agrava o re-fire pós-timeout.
- **Impacto de negócio**: ruído operacional (borderôs vazios poluindo a lista); analista perde tempo limpando; risco de aprovar o borderô errado.
- **Métrica de baseline**: 1/3 rotas de escrita financeira honram `Idempotency-Key` hoje (`/eleicao` sim; `/reconciliar-lote` e `/reconciliar` individual não). Frontend mitiga só duplo-clique no MESMO tab via `setExecutandoLote(true) + disabled` no botão.

### F-fault-tolerance-3: Sem stuck-state reaper para execuções `reconciling` órfãs (P1 herdada há 3 runs — não fechada)

- **Severidade**: P1 (alto — drift silencioso entre trilha e ERP cresce com cada timeout)
- **Tactic violada**: Condition Monitoring + Reconcile
- **Localização**: ausência sistêmica — `PermutaExecucaoRepository.ts` não expõe `listStuckReconciling`; nenhum job em `src/backend/jobs/` faz sweep
- **Evidência (objetiva)**:
  ```
  $ grep -rn "stuck\|reaper\|listStuckReconciling\|reconciliar-orfaos" src/backend/ \
      --include=*.ts | grep -v test | grep -v dist
  → 0 hits no caminho de produção (só os comentários da run anterior em ReconciliacaoPermutaService.ts:246)

  $ ls src/backend/jobs/
  → ingest-permutas.ts   (único job — ingestão)
  ```
  Aberto desde `docs/regis-review/2026-06-23-1518` (`ft-2`); confirmado em `2026-06-24-2011` (`F-7`) e `2026-06-25-1713` (`F-3`); inbox `permutas-reconciliacao-regis-followups.md:ft-2`.
- **Impacto técnico**: linhas `reconciling` com `bor_cod` sem `bxa_cod_seq` ficam invisíveis. Sem query, sem alerta, sem job. Cada uma é candidato silencioso ao re-POST de F-1.
- **Impacto de negócio**: o painel "tudo o que tentamos foi confirmado" é ilusório; divergência só vira incidente quando o analista compara manualmente.
- **Métrica de baseline**: 0 jobs detectores presentes; MTTD (mean-time-to-detect) de par órfão = indefinido (depende de inspeção humana).

### F-fault-tolerance-4: Ações de borderô (finalizar/cancelar/estornar/excluir/excluir-baixa) NÃO têm audit-trail DB-persistido — só `LogService.info → stdout`

- **Severidade**: P1 (alto — invariante cross-cutting da proposta: toda ação que mexe em dinheiro deve ter trilha DB-persistida — quem/quando/o-quê)
- **Tactic violada**: Condition Monitoring + Quarantine (visibilidade forense)
- **Localização**: `src/backend/domain/service/permutas/BorderoGestaoService.ts:135-145, 184-188, 206-210, 226-230, 245-248` + `src/backend/domain/service/LogService.ts:19-27`
- **Evidência (objetiva)**:
  ```typescript
  // BorderoGestaoService.finalizarBordero  (BorderoGestaoService.ts:196-211)
  await this.conexosClient.finalizarBordero({ filCod, borCod: params.borCod });
  await this.execucaoRepository.updateBorderoCacheSituacao(params.borCod,
      { borVldFinalizado: 1 });
  await this.logService.info({                  // ←  stdout-only
      type: LOG_TYPE.BUSINESS_INFO,
      message: 'borderô finalizado/aprovado (fin010)',
      data: { borCod: params.borCod, executadoPor: params.executadoPor },
  });

  // LogService.writeLog  (LogService.ts:19-27)
  private writeLog = async (input: CreateLogInput): Promise<void> => {
      const logBody: LogInterface = { ...input, ...this.metadata, timestamp: ... };
      process.stdout.write(`${JSON.stringify(logBody)}\n`);   // ← só stdout (Render logs)
  };
  ```
  Cobertura DB: 0/5 ações de borderô persistem em tabela; 5/5 só escrevem em stdout. Em contraste, a **baixa em si** TEM trilha completa (`permuta_alocacao_execucao`) — o gap é só na **gestão do ciclo de vida do borderô** depois da baixa.
- **Impacto técnico**: Render rota logs por TTL (~7 dias no Free); um analista que aprovou/cancelou um borderô há 30 dias é invisível para qualquer query SQL — exige caçar nos logs do Render (sem ferramenta de query). Não há "who finalized borderô 14918 e quando" via consulta direta.
- **Impacto de negócio**: compliance financeiro — exigência típica de auditoria sobre quem finalizou/cancelou cada borderô é frágil; em contestação ("não foi eu que aprovei essa baixa") não há prova durável.
- **Métrica de baseline**: 5/5 ações de borderô sem persistência DB (0% de cobertura); 0 migrations criam tabela `bordero_acao_log` ou equivalente; `LogService.writeLog` (linha 26) escreve só `process.stdout.write`.

### F-fault-tolerance-5: Invoice com múltiplos títulos (parcelas) → `titCod: 1` HARDCODED bloqueia a baixa (gap conhecido, documentado)

- **Severidade**: P1 (alto — bloqueia 100% das permutas de invoice multi-parcela; anti-drift aborta corretamente, então NÃO corrompe estado, mas suspende o fluxo até decisão de domínio)
- **Tactic violada**: Increase Competence Set (cobertura incompleta do domínio) + Sanity Checking (anti-drift FUNCIONA → contém)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:254, 313, 401, 467` + `ontology/_inbox/permuta-multi-titulo-pendente.md`
- **Evidência (objetiva)**:
  ```
  $ grep -n "titCod" src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts
  254:    titCod: 1,         // validarTituloBaixa
  313:    titCod: 1,         // atualizarValorLiquido
  401:    titCod: 1,         // payload final (gravarBaixaPermuta)
  467:    titCod: 1,         // preview dry-run

  $ cat ontology/_inbox/permuta-multi-titulo-pendente.md | head -25
  Sintoma: invoice 4120 (adto 4061) recebe error:
    "anti-drift: baixa 117237.36 (BRL) > em-aberto do ERP 116159.22
     (alocado 22313.5 × taxa 5.2541) — alocação maior que o saldo vivo da invoice"
  Causa raiz confirmada: invoice tem 2 títulos (116.159,22 + 1.078,14), a soma é o
  valorMoedaNegociada que a UI deixa alocar (22.313,5 USD), mas titCod:1 só baixa
  o título 1 → diferença = exatamente o título 2.
  Decisão pendente: (A) iterar titCod 1..N OU (B) baixar só título permutável.
  ```
- **Impacto técnico**: anti-drift (F-2 anterior) impede a corrupção (a baixa nunca excede o em-aberto vivo), mas o lote NÃO completa enquanto a alocação fica em estado de erro irrecuperável sem revisão manual. O par fica `error` na trilha e aparece em *Borderôs* com payload cru.
- **Impacto de negócio**: toda invoice com >1 parcela no Financeiro a Pagar fica bloqueada para permuta automática até a decisão de domínio (A vs. B) ser tomada e implementada. Inteligente que NÃO corrompe; ruim que bloqueia.
- **Métrica de baseline**: 4 ocorrências `titCod: 1` hardcoded; 0 alocação multi-título passa pelo lote hoje; gap aberto **em inbox desde 2026-06-26**, pendente de decisão Yuri.

### F-fault-tolerance-6: Sem reconciliação periódica trilha local ↔ ERP `fin010` (drift detection ausente — P1 herdada)

- **Severidade**: P1 (alto — sem detecção de divergência silenciosa de estado externo)
- **Tactic violada**: Reconcile
- **Localização**: ausência sistêmica — sem job/endpoint que percorra `permuta_alocacao_execucao` + `permuta_bordero` confrontando com `fin010/list` ou `fin010/baixas/list`
- **Evidência (objetiva)**:
  ```
  $ grep -rn "reconciliar-orfaos\|driftDetect\|drift_check\|sweep" src/backend --include=*.ts
  → 0 hits

  $ ls src/backend/jobs/
  ingest-permutas.ts             # (único job — ingestão, NÃO drift)
  ```
  Aberto desde `2026-06-23-1518` (`ft-3`); inbox `permutas-reconciliacao-regis-followups.md:ft-3`. Hoje a trilha confia no caminho do clique do analista; um borderô estornado **fora do sistema** (direto no Conexos) só é detectado quando o analista olha a tela de Borderôs e o status vivo é reconsultado por `getBordero` no `live=true` (botão "Atualizar").
- **Impacto técnico**: divergência permanente possível — par `settled` na nossa trilha cujo borderô foi estornado externamente no ERP só é "visto" quando alguém abre a tela. Sem alerta proativo. `borderoAindaValido` cobre o caso só no *próximo* relançamento da permuta, não na chegada da divergência.
- **Impacto de negócio**: o dashboard mente passivamente sobre o que foi baixado; descoberta tardia atrasa o fechamento contábil mensal.
- **Métrica de baseline**: 0 jobs de drift; tempo médio de detecção de divergência cross-system = "próximo refresh da tela de Borderôs" (humano).

## 5. Cards Kanban

### [fault-tolerance-1] Bloquear re-POST de baixa quando a execução está em `reconciling` órfã (idempotência da janela cinza)

- **Problema**
  > Re-fire do lote após o proxy cortar entre `setBorCod` e `markSettled` faz `beginExecution` reabrir o par em `reconciling` sem bloquear; o serviço segue para `executarBaixa` e re-POSTA `gravarBaixaPermuta` → segunda baixa no MESMO título do MESMO borderô (ou em borderô novo se `borCod` não foi preservado na sessão). Idempotência viva (`borderoAindaValido`) só cobre `settled`.

- **Melhoria Proposta**
  > Em `ReconciliacaoPermutaService.reconciliar`, ANTES de chamar `executarBaixa`: detectar linha pré-existente com `status='reconciling' AND bor_cod IS NOT NULL AND bxa_cod_seq IS NULL`. Para esse caso: (a) reaproveitar o `borCod` (não criar borderô novo); (b) consultar `ConexosClient.listBaixas({borCod})` para descobrir se a baixa caiu no ERP; (c) se caiu, `markSettled` com o `bxaCodSeq` real (forward-recovery); (d) se NÃO caiu, prosseguir do passo 4 (validarTituloBaixa) reutilizando o borderô. Documentar em `business-rules/fin010-write-contract.md`. Tactic Bass = Idempotent Replay + Reconcile.

- **Resultado Esperado**
  > Re-fire pós-timeout NUNCA cria baixa duplicada para par órfão. Métrica: # de baixas duplicadas em re-fire = 0 (validado por teste com mock simulando crash entre passos 7 e 8).

- **Tactic alvo**: Idempotent Replay + Reconcile
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-fault-tolerance-1, F-fault-tolerance-3, F-fault-tolerance-6
- **Métricas de sucesso**:
  - # de baixas duplicadas em re-fire pós-timeout: indefinido (não medido) → 0 (com teste unitário)
  - Cobertura de teste do cenário "reconciling órfão + re-fire": 0 hoje → ≥ 1 caso novo em `ReconciliacaoPermutaService.test.ts`
- **Risco de não fazer**: super-pagamento contábil no fin010 cada vez que o proxy cortar; problema convive indefinidamente, agora 3 runs aberto.
- **Dependências**: convive com `fault-tolerance-3` (mesma query `listBaixas`); pode compartilhar código.

### [fault-tolerance-2] Honrar `Idempotency-Key` em `POST /reconciliar-lote` e `POST /adiantamentos/:docCod/reconciliar`

- **Problema**
  > 1/3 rotas de escrita financeira aceita `Idempotency-Key` hoje (`/eleicao`); `/reconciliar-lote` e o reconciliar individual NÃO leem o header. Duplo-fetch (retry HTTP, F5, dois browser tabs) dispara dois lotes para os mesmos adtos. Combinado com F-1, agrava blast radius.

- **Melhoria Proposta**
  > Replicar o padrão de `/eleicao` (`routes/permutas.ts:222-228`) em `/reconciliar-lote` (linha 542) e `/adiantamentos/:docCod/reconciliar` (linha 514). Persistir `(idempotency_key, payload_hash, response_json, created_at)` em tabela curta com TTL 24h; em re-request com a MESMA key + payload, devolver a resposta cacheada. Frontend pode gerar a key com `crypto.randomUUID()` por clique no modal. Tactic Bass = Idempotent Replay (boundary).

- **Resultado Esperado**
  > 3/3 rotas de escrita financeira honram `Idempotency-Key` (vs. 1/3 hoje); duplo-clique cross-tab não dispara dois lotes. Métrica: # de borderôs vazios criados por re-request = 0.

- **Tactic alvo**: Idempotent Replay
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-fault-tolerance-2
- **Métricas de sucesso**:
  - % rotas state-mutating de escrita fin010 com `Idempotency-Key`: 33% → 100%
  - Teste e2e cobrindo "duplo POST mesma key responde idem-cache": 0 → 1
- **Risco de não fazer**: incidentes recorrentes de "executei 2× sem querer" (já observado em fluxos manuais análogos da v0.6.0).
- **Dependências**: nenhuma.

### [fault-tolerance-3] Stuck-state reaper para execuções `reconciling` órfãs (3ª re-priorização)

- **Problema**
  > Aberto há 3 runs (`2026-06-23-1518:ft-2`, `2026-06-24-2011:F-7`, `2026-06-25-1713:F-3`). Sem job que detecte `status='reconciling' AND atualizado_em < now()-interval '30 min'` AND `bor_cod IS NOT NULL`. Toda divergência entre trilha local e ERP cresce silenciosamente.

- **Melhoria Proposta**
  > (1) `PermutaExecucaoRepository.listStuckReconciling(thresholdMinutes)`. (2) `StuckReconciliacaoReaperService` — para cada órfão, consultar `getBordero` + `listBaixas`; (a) `markSettled` se a baixa caiu (com `bxaCodSeq` real); (b) `markError("órfão >30 min — provável timeout do request bulk")` se não caiu, com `request_payload` preservado para o analista re-tentar. (3) Provisório (sem cron): rota admin `POST /permutas/reconciliar-orfaos` que o analista chama sob demanda (mesmo padrão do `/ingestao` manual). (4) Alvo Lambda: EventBridge a cada 10 min. Tactic = Condition Monitoring + Reconcile.

- **Resultado Esperado**
  > MTTD de par órfão cai de "indefinido" para ≤ 10 min (com cron) ou ≤ 1 clique admin (provisório). 0 órfãos invisíveis após o run.

- **Tactic alvo**: Condition Monitoring + Reconcile
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) — incluindo testes dos 3 cenários (caiu / não-caiu / incerto)
- **Findings relacionados**: F-fault-tolerance-3, F-fault-tolerance-1 (mitigação parcial)
- **Métricas de sucesso**:
  - Jobs/rotas detectores: 0 → 1
  - MTTD: indefinido → ≤ 10 min (cron) ou ≤ 1 clique admin (provisório)
- **Risco de não fazer**: 4ª re-priorização na próxima run; drift permanente; quanto mais tempo aberto, mais órfãos silenciosos acumulam.
- **Dependências**: nenhuma; convive com `fault-tolerance-1` (mesma query `listBaixas`).

### [fault-tolerance-4] Persistir audit-trail DB das ações de borderô (finalizar/cancelar/estornar/excluir/excluir-baixa)

- **Problema**
  > As 5 ações de gestão de borderô em `BorderoGestaoService` (finalizar, cancelar, estornar, excluir borderô, excluir baixa) só escrevem via `LogService.info → process.stdout.write` (LogService.ts:26). Sem tabela DB-persistida. Render rotaciona logs por TTL; "quem aprovou o borderô 14918 e quando" não é consultável via SQL após o ciclo de logs.

- **Melhoria Proposta**
  > Migration nova: `0020_bordero_acao_log.sql` com `(id, bor_cod, fil_cod, acao TEXT CHECK IN ('finalizar','cancelar','estornar','excluir','excluir-baixa'), invoice_doc_cod NULL, executado_por, payload_request JSONB, erp_response JSONB, erro_mensagem NULL, criado_em)`. Cada método de `BorderoGestaoService` registra a ação ANTES de chamar o ERP (write-ahead) e atualiza com o resultado após. Espelhar o padrão de `permuta_alocacao_execucao` (write-ahead → resultado). Tactic Bass = Condition Monitoring + Quarantine (forense).

- **Resultado Esperado**
  > 5/5 ações de borderô têm trilha DB consultável (vs. 0/5 hoje). Métrica: `SELECT count(*) FROM bordero_acao_log WHERE bor_cod=X` retorna a linha-do-tempo completa do borderô.

- **Tactic alvo**: Condition Monitoring + Quarantine
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) — migration + repository + 5 callsites + testes
- **Findings relacionados**: F-fault-tolerance-4
- **Métricas de sucesso**:
  - Ações de borderô com trilha DB: 0/5 → 5/5
  - Cobertura de testes asserindo a gravação da trilha: 0 → 5 (1 por ação)
- **Risco de não fazer**: compliance fraca em contestação ("não fui eu que finalizei essa baixa"); auditor pede e o time só pode mostrar logs voláteis do Render.
- **Dependências**: nenhuma.

### [fault-tolerance-5] Implementar baixa de invoice multi-título (decisão A vs. B + iteração `titCod`)

- **Problema**
  > Toda invoice com >1 parcela é bloqueada hoje: `titCod:1` está HARDCODED em 4 pontos de `ReconciliacaoPermutaService.ts` (254, 313, 401, 467). Anti-drift aborta corretamente (contém a corrupção), mas o par fica permanentemente em `error` até intervenção manual ou release. Documentado em `ontology/_inbox/permuta-multi-titulo-pendente.md`.

- **Melhoria Proposta**
  > (1) **Decisão de domínio** (precisa Yuri): A = iterar `titCod` 1..N e baixar cada título contra seu `bxaMnyValor` próprio; B = baixar só o(s) título(s) com moeda negociada / variação cambial. Hipótese atual = B. (2) Após decisão: refletir em `AlocacaoPermutasService.somaValorNegociado` / `buscarInvoices` (valor permutável por título) E em `ReconciliacaoPermutaService` (iterar ou escolher o permutável). (3) Validar em homologação antes de prod (escrita gated; considerar `--high-risk` / pair-review). Tactic Bass = Increase Competence Set.

- **Resultado Esperado**
  > Invoices multi-título seguem o lote (ou auto-alocação) sem erro. Métrica: # de pares `error` com causa = "anti-drift > em-aberto" para invoice multi-título: > 0 hoje → 0 pós-fix.

- **Tactic alvo**: Increase Competence Set
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) caminho A; L (1–2 sem) com pair-review do caminho B
- **Findings relacionados**: F-fault-tolerance-5
- **Métricas de sucesso**:
  - `titCod: 1` hardcoded: 4 ocorrências → 0 (lista vinda da invoice)
  - Teste unitário cobrindo invoice multi-título: 0 → ≥ 1
- **Risco de não fazer**: a feature segue funcional para 1-título (maioria) mas falha consistentemente para multi-título; cada caso novo polui a aba *Borderôs* com `error`.
- **Dependências**: decisão de domínio Yuri (precede o código).

### [fault-tolerance-6] Reconciliação periódica trilha ↔ fin010 (drift detection)

- **Problema**
  > Sem job/rota que confronte `permuta_alocacao_execucao` (linhas `settled`) e `permuta_bordero` (cache) com o `fin010` real. Aberto desde `2026-06-23-1518` (`ft-3`). Um borderô estornado externamente só é "visto" quando alguém abre a tela com `live=true`. `borderoAindaValido` cobre só no *próximo* relançamento.

- **Melhoria Proposta**
  > `DriftReconciliacaoService` que, em loop (ou rota admin provisória `POST /permutas/conferir-drift`), para cada `settled` da trilha consulta o estado vivo do borderô no ERP: (a) se foi CANCELADO/ESTORNADO/REMOVIDO no Conexos sem passar pelo nosso fluxo, marca o `settled` como `error` com mensagem "divergência detectada" e libera o relançamento; (b) gera relatório de drift do dia para o analista revisar. Mesmo job pode reaproveitar `BorderoGestaoService.refreshCache`. Quando houver job runner (alvo Lambda + EventBridge), rodar 1×/dia. Tactic = Reconcile.

- **Resultado Esperado**
  > Divergência cross-system detectada em ≤ 24h (vs. "próximo refresh humano da tela"). Métrica: # de `settled` na trilha cuja situação no ERP diverge (`CANCELADO`/`ESTORNADO`/`REMOVIDO`) = 0 após o job.

- **Tactic alvo**: Reconcile
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) provisório (rota admin); L incluindo cron alvo
- **Findings relacionados**: F-fault-tolerance-6, F-fault-tolerance-3 (mesma família)
- **Métricas de sucesso**:
  - Jobs/rotas de drift: 0 → 1
  - Tempo máximo de detecção de divergência cross-system: humano → ≤ 24h (cron) ou ≤ 1 clique admin (provisório)
- **Risco de não fazer**: dashboard "mente passivamente"; descoberta tardia atrasa fechamento contábil mensal; volta como `ft-3` na próxima run.
- **Dependências**: nenhuma; convive com `fault-tolerance-3` (compartilham infra de varredura).

## 6. Notas do agente

- **Mudanças desde a run anterior (2026-06-25-1713)**: trava de integridade v0.8.2/0.8.3 (`AlocacaoEmBorderoError` + `borderoDoPar` ignorando `bor_vld_finalizado=2`) é positiva — **adiciona Quarantine forte** ao caminho de remoção de alocação (impossível descasar a trilha do que foi baixado). `LOTE_MAX` baixou de 10 para 6 entre runs, reduzindo blast radius do F-1 por clique. Os 4 findings da run anterior persistem e foram consolidados em F-1/F-2/F-3 desta; adicionei F-4 (audit trail de borderô — invariante cross-cutting da proposta, novo) e F-5 (multi-título, já documentado em inbox mas escalado a finding formal aqui). Removi o F-4 anterior (timeout HTTP fim-a-fim) por ter perdido prioridade com `LOTE_MAX=6` (24s pior caso vs. 100s teto Render) — segue como nota.
- **Score 8.1 (vs. 8.2 anterior)**: o trabalho de integridade da remoção (v0.8.2/0.8.3) compensa, mas o audit-trail incompleto das ações de borderô (F-4 novo, P1) e os 3 P1s herdados ainda abertos (F-1, F-2, F-3) pesam. A reincidência (F-3 em 4ª run) é o que mais arrasta. Caminho feliz + erro parcial seguem **muito bem cobertos**; o débito está todo na janela cinza pós-crash e na auditoria forense.
- **Cross-QA**: F-2 (`Idempotency-Key`) overlap direto com qa-security (anti-replay) e qa-availability (anti duplo-fan-out). F-4 (audit trail) overlap direto com qa-security (auditabilidade) e qa-testability (asserir gravação). F-3 + F-6 (sweepers/reconcile) overlap com qa-availability (visibilidade de stuck-state) e qa-testability (cobertura cenários órfãos). F-5 (multi-título) overlap com qa-integrability (contrato fin010 incompleto). Sinalizar ao `qa-consolidator` para evitar contagem dupla.
- **Não medível localmente**: # de órfãos em prod, MTTR conciliação manual, latência fim-a-fim real do lote — exige Postgres prod + Render logs (não há CloudWatch/X-Ray; Lambda é alvo). Reportei só o caminho de código + métricas estáticas.
