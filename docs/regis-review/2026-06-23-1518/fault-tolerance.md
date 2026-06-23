---
qa: Fault Tolerance
qa_slug: fault-tolerance
run_id: 2026-06-23-1518
agent: qa-fault-tolerance
generated_at: 2026-06-23T15:18:00Z
scope: backend
score: 5
findings_count: 7
cards_count: 7
---

# Fault Tolerance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista clica "Executar" em `/permutas/adiantamentos/:docCod/reconciliar` | Falha parcial durante o handshake de 5 chamadas ao `fin010` (timeout entre POST e resposta; processo morre; retry após sucesso silencioso) | `ReconciliacaoPermutaService` + `ConexosClient` (escrita irreversível-por-nós no ERP) | Produção multi-filial, ERP Conexos em latência variável, escrita habilitada (`CONEXOS_WRITE_ENABLED=true`) | A baixa precisa ou (a) ter sido executada exatamente uma vez no ERP **e** marcada `settled` localmente, ou (b) ter NÃO sido executada **e** estar marcada `error` reabrível, ou (c) ter falhado de modo OBSERVÁVEL (`reconciling` "presa") para reconciliação manual | 0 baixas duplicadas no `fin010`; 100% das transições `→ settled` carregam `bxaCodSeq` confirmado; linhas `reconciling` há > N min são detectadas e expostas; partial-batch coerente (par-1 settled NÃO regride se par-2 falha) |

> Cenário concreto observado no código: o analista finaliza uma permuta múltipla N:M (4 pares); a 3ª chamada `POST /fin010/baixas` sofre timeout após o ERP já ter persistido a baixa; o `RetryExecutor` reexecuta o mesmo POST; o ERP grava a baixa de novo → super-pagamento + duplicação histórica. Sem `gravarBaixaPermuta` ser idempotente do lado do ERP (que não é — não há `Idempotency-Key`), o retry de 2 tentativas no passo 5 é o vetor #1 de double-write.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Write-ahead: intent gravado ANTES do POST (`reconciling`) | Sim — `beginExecution` na linha 98 do service ANTES das 5 chamadas | Sim, obrigatório | ✅ | `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:96-105` |
| Idempotência interna por par adto↔invoice (curto-circuita re-execução) | Sim — chave UNIQUE + CASE no `ON CONFLICT` preserva `settled` | Sim | ✅ | `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:88-121`; `migrations/0015_permuta_alocacao_execucao.sql:35` |
| Anti-super-pagamento: aborta se em-aberto vivo ≤ 0 | Sim — guarda `bxaMnyValor > 0` no passo 2 | Sim, com I-Write-1 anti-drift | ⚠️ parcial | `ReconciliacaoPermutaService.ts:185-192` (sem comparação com `valorAlocado` da alocação — viola I-Write-1 do `fin010-write-contract.md:75`) |
| Retries no POST de escrita (`gravarBaixaPermuta`, NÃO-idempotente) | 2 retries (`retries: 2, delayMs: 500, jitterMs: 200`); `shouldRetry` default = `() => true` | 0 retries no passo 5 OU retry só em erros pré-conexão (DNS/connect-reset), nunca em timeout | ❌ | `ConexosClient.ts:403-408` (construtor do RetryExecutor compartilhado); `:1134-1147` (uso em `gravarBaixaPermuta`); `RetryExecutor.ts:27` (retry default sempre verdadeiro) |
| Idempotency-Key HTTP no endpoint `/reconciliar` (anti duplo-clique do analista) | Não — header não é lido (`/eleicao` lê, `/reconciliar` não) | Sim, mesma disciplina de `/eleicao` | ⚠️ | `src/backend/routes/permutas.ts:359-381` vs `:100-104` |
| Janela aberta entre POST `/fin010/baixas` e `markSettled` (processo morre → `reconciling` presa) | Existe — sequência síncrona linhas 239-247; sem detecção/recuperação | Detector batch (cron/EventBridge) que liste `reconciling` > N min e reconcilie via `bxaCodSeq` | ❌ | `ReconciliacaoPermutaService.ts:239-247`; sem job equivalente (`grep -rn "stuck\|reaper\|sweep" src/backend/domain/service/permutas/` retorna apenas o `sweep` da ingestão, NÃO da execução) |
| Reconciliação contra Conexos (verificar se `settled` local bate com `bxaCodSeq` no ERP) | Ausente | Job periódico que confronta `permuta_alocacao_execucao` com `fin010` | ❌ | `grep -rn "reconcili.*conexos\|com298.*verifica" src/backend/domain/service/permutas` — sem resultados |
| Partial-batch coerência (N alocações: 1 falha não regride as outras já settled) | Garantida por CONSTRUÇÃO (loop captura por iteração linhas 136-155; `settled` é preservado em retry) — porém **sem teste** | Comportamento testado | ⚠️ parcial | `ReconciliacaoPermutaService.ts:96-156`; `ReconciliacaoPermutaService.test.ts` — `grep -n "partial\|múltipl\|batch"` = 0 hits |
| Audit-trail per transição (quem, quando, o quê) | Parcial — `executado_por` no INSERT, `erp_response` JSONB, `criado_em`/`atualizado_em` — mas reabertura `error→reconciling` sobrescreve `erro_mensagem` (perde histórico) | Append-only de transições | ⚠️ | `PermutaExecucaoRepository.ts:142-186` (UPDATE não-versionado); `markSettled` zera `erro_mensagem` (linha 152) |
| Transação DB no `markSettled` (única escrita pós-POST) | Não necessária (uma linha, um UPDATE) — `PostgreeDatabaseClient.transaction` existe e está disponível | OK (single-statement atômico no Postgres) | ✅ | `PostgreeDatabaseClient.ts:96-115` |
| Tipagem do erro do ERP (distinguir timeout de 5xx) | Existe (`CONEXOS_UPSTREAM_TIMEOUT` vs `CONEXOS_UPSTREAM_ERROR`), MAS não é usado no `shouldRetry` (default retry-em-tudo) | Usado para gatear retry | ⚠️ | `ConexosError.ts:3`; `ConexosClient.ts:403-408` (não passa `shouldRetry`) |

> ⚠️ **Não medível localmente**: a taxa real de timeout do `fin010/baixas` em produção (Conexos via Render→cloud). Requer telemetria CloudWatch / log do legacy `authenticatedPost`. Recomendação: instrumentar tempo de resposta do passo 5 e contar timeouts vs 5xx vs sucessos.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Substitution (avoid: dry-run / homologação-first) | Default `CONEXOS_DRY_RUN=true`; `dryRunOverride` no body; preview consolidado sem POST | ✅ presente | `ReconciliacaoPermutaService.ts:88-126`; `idempotencia-reconciliacao.md` I-Recon-4 |
| Increase Competence Set (avoid) | Validação do em-aberto vivo do ERP (passo 2) — fonte da verdade externa | ✅ presente | `ReconciliacaoPermutaService.ts:179-192` |
| Predictive Model (avoid) | N/A — sem ML/health-predict para o ERP. Justificativa: integração síncrona com ERP single-tenant, não cabe predição | N/A | — |
| Sanity Checking (detect) | `bxaMnyValor > 0` (passo 2); Zod nos boundaries de leitura | ⚠️ parcial | falta I-Write-1 anti-drift: `|bxaMnyValor − valorAlocado| ≤ ε` (contrato `fin010-write-contract.md:75-76`) — NÃO implementado em `ReconciliacaoPermutaService.ts:185-192` |
| Comparison (detect — reconciliation) | Ausente — nenhum job confronta `settled` local com o ERP | ❌ ausente | sem hits para `reconciliacao-conexos`/`verifica-baixa-fin010` |
| Timestamp (detect — stale work) | Coluna `atualizado_em` existe, mas ninguém consulta para detectar `reconciling > N min` | ⚠️ parcial | `migrations/0015_permuta_alocacao_execucao.sql:34`; sem consumidor |
| Timeout (detect) | Implícito no `legacy.postGeneric` (axios default) | ⚠️ parcial — timeout não-tipado/não-configurável visível neste escopo | `ConexosClient.ts:1134-1147` |
| Condition Monitoring (detect) | Log estruturado em `LogService` (BUSINESS_INFO / BUSINESS_WARN); sem métrica agregada | ⚠️ parcial | `ReconciliacaoPermutaService.ts:114-118, 143-147, 248-252` |
| Self-Test (detect) | N/A — sem health-check ativo do `fin010` | N/A | — |
| Voting (detect) | N/A — fonte única (Conexos) | N/A | — |
| Redundancy (contain) | N/A — Conexos é fonte única | N/A | — |
| Recovery: forward — quarantine `error` (contain) | `markError` persiste `erro_mensagem` + `erp_response` crua; aparece em `GET /execucoes` | ✅ presente | `PermutaExecucaoRepository.ts:167-186`; `routes/permutas.ts:384-393` |
| Recovery: backward — rollback / compensating txn (contain) | Ausente por desenho explícito (estorno = manual na UI `fin010`) — documentado em `idempotencia-reconciliacao.md` | ✅ presente (forward recovery escolhido, documentado) | `idempotencia-reconciliacao.md:51-55` |
| Reintroduction: state resync (contain) | Manual — operador checa `fin010` e marca `settled`. Sem endpoint dedicado de "marcar settled retroativamente" | ⚠️ parcial | `idempotencia-reconciliacao.md:53-55` (declarado mas sem ferramenta) |
| Rollback (recover) | N/A para a baixa — escrita irreversível-por-nós (correto) | N/A | — |
| Repair State (recover) | Ausente — não há "marcar `reconciling` como `settled` dado o `bxaCodSeq` ex-post" | ❌ ausente | — |
| Idempotent Replay (recover) | Sim no NÍVEL local (chave `permuta:adto:invoice` curto-circuita re-execução), MAS o passo 5 NÃO é idempotente do lado do ERP | ⚠️ parcial — depende de o orquestrador local sempre interceptar antes; em retry interno do `RetryExecutor` o curto-circuito local NÃO atua | ver finding F-fault-tolerance-1 |
| Compensating Transaction (recover) | Escolhido NÃO implementar (estorno manual). Documentado. | ✅ presente como decisão | `idempotencia-reconciliacao.md:5,38` |
| Reconcile (recover) | Ausente — sem confronto periódico com `fin010` | ❌ ausente | ver F-fault-tolerance-3 |
| Quarantine (recover) | `error` é a quarentena lógica; `GET /execucoes` expõe; sem rota DLQ porque o fluxo é síncrono HTTP | ✅ presente | `routes/permutas.ts:384-393` |

## 4. Findings (achados)

### F-fault-tolerance-1: `RetryExecutor` retenta o POST não-idempotente `fin010/baixas` em qualquer erro (incluindo timeout pós-sucesso) → vetor de double-write

- **Severidade**: **P0** (crítico — duplica baixa real no ERP em cenário de timeout)
- **Tactic violada**: Idempotent Replay (recover) — o replay NÃO é idempotente no ERP
- **Localização**: `src/backend/domain/client/ConexosClient.ts:403-408` (instância única do `RetryExecutor` para reads e writes) + `:1134-1147` (`gravarBaixaPermuta` usa o mesmo `retryExecutor`); `src/backend/domain/libs/executor/RetryExecutor.ts:27` (default `shouldRetry = () => true`)
- **Evidência (objetiva)**:
  ```
  ConexosClient.ts:403-408
    this.retryExecutor = new RetryExecutor({
        retries: 2,
        delayMs: 500,
        shouldLog: true,
        jitterMs: 200,
    });   // sem shouldRetry → retenta TUDO

  ConexosClient.ts:1134-1147
    public gravarBaixaPermuta = async (...) => {
        return await this.retryExecutor.execute(async () => {
            await this.legacy.ensureSid();
            return this.legacy.postGeneric<BaixaGravada>('fin010/baixas', payload, { filCod });
        });
    };

  fin010-write-contract.md:19  → "POST /api/fin010/baixas | Grava a baixa/permuta"
  idempotencia-reconciliacao.md:8-11 → idempotência é GARANTIDA POR NÓS via permuta_alocacao_execucao
                                       (NÃO pelo ERP — chave nossa, header Idempotency-Key inexistente no fin010)
  ```
- **Impacto técnico**: cenário canônico — POST envia, ERP grava `bxaCodSeq=N`, conexão cai antes de responder; RetryExecutor entende como erro retentável e re-envia o mesmo payload; ERP grava `bxaCodSeq=N+1` (segunda baixa para o mesmo par). Nosso `markSettled` registra só o segundo `bxaCodSeq` — a primeira baixa fica órfã. Idempotência interna NÃO ajuda porque o segundo POST sai de DENTRO do mesmo `retryExecutor.execute`, antes de a chave local ser consultada de novo.
- **Impacto de negócio**: super-pagamento real no `fin010` (a baixa é o evento financeiro que liquida o título). Reverter exige estorno manual de UMA das duas baixas no ERP, com risco de o operador estornar a errada. Em permuta múltipla com 4 pares, basta 1 timeout para gerar 1 baixa duplicada — cenário recorrente, não exótico.
- **Métrica de baseline**: 2 retries × `gravarBaixaPermuta`; janela de timeout = não explicitamente configurada (axios default ≈ 0 = nenhum); probabilidade de double-write ≈ P(timeout-pós-sucesso) × 1 (já que retry é incondicional).

### F-fault-tolerance-2: Não há detector de linhas `reconciling` "presas" — processo morto entre POST e `markSettled` permanece invisível

- **Severidade**: **P1** (alto — divergência silenciosa entre ERP e nosso DB)
- **Tactic violada**: Timestamp (detect) + Comparison/Reconcile (recover)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:239-247` (janela síncrona POST → markSettled, ~ms mas existente); `src/backend/migrations/0015_permuta_alocacao_execucao.sql` (coluna `atualizado_em` existe mas não é consultada por nenhum job)
- **Evidência (objetiva)**:
  ```
  ReconciliacaoPermutaService.ts:239-247
    const baixa = await this.conexosClient.gravarBaixaPermuta({ filCod, payload }); // ⬅ aqui pode morrer
    await this.execucaoRepository.markSettled(key, { ... });                         // ⬅ se morrer antes, linha fica em 'reconciling'

  grep -rn "reconciling\|stuck\|reaper" src/backend/domain/service/permutas
    → apenas referências em comentários do PermutaExecucaoRepository; nenhum job reaper.

  idempotencia-reconciliacao.md:51-55
    "Linhas `reconciling` 'presas' (processo morreu no meio) exigem checagem no fin010:
     se a baixa entrou → marcar `settled` manualmente (futuro: endpoint de conciliação);
     se não → retry."
  ```
- **Impacto técnico**: o desenho declara write-ahead como CORRETO (preferir falso-positivo de "presa" a silêncio), MAS o operador só descobre via varredura ad-hoc do `GET /execucoes` por adto. Sem dashboard/cron, uma linha `reconciling` pode ficar oculta por dias enquanto a baixa real está consumindo saldo no ERP — o painel local mostra a invoice como "não baixada".
- **Impacto de negócio**: dashboard local diverge silenciosamente do ERP. Cliente vê "pendente" e re-aciona o analista, que pode disparar OUTRA reconciliação (que será curto-circuitada por idempotência apenas se for novo POST iniciado pelo endpoint — não se a linha ainda estiver `reconciling` E o operador disparar manualmente, hipótese a confirmar).
- **Métrica de baseline**: 0 jobs / 0 endpoints administrativos detectores de `status='reconciling' AND atualizado_em < now() - interval 'N minutes'`.

### F-fault-tolerance-3: Sem reconciliação periódica com o ERP — `settled` local pode mentir indefinidamente

- **Severidade**: **P1** (alto — invariante "DB ≡ ERP" não verificada)
- **Tactic violada**: Reconcile (recover) + Comparison (detect)
- **Localização**: ausência sistêmica. `grep -rn "verificaBaixa\|conferi.*fin010\|reconciliar.*ERP" src/backend/domain/service/permutas` → vazio
- **Evidência (objetiva)**:
  ```
  Não há job nem endpoint que faça:
    "para cada linha settled local com bxa_cod_seq=X, confirmar que o fin010 ainda tem essa baixa
     (não estornada manualmente pelo analista)"
  ```
- **Impacto técnico**: o analista estorna a baixa manualmente na UI do `fin010` (caminho documentado de "recuperação"). Nosso DB permanece `settled` — o painel mostra o adto como liquidado, quando na verdade está em aberto de novo. Nada detecta.
- **Impacto de negócio**: divergência permanente entre painel e ERP. Em ciclo mensal, o relatório de Variação Cambial / Fechamento Mensal usaria estado local errado (falso "baixado"). O analista perde confiança no sistema porque o painel está atrasado em relação ao `fin010`.
- **Métrica de baseline**: 0 jobs de reconciliação; intervalo mínimo recomendado pela literatura para reconciliação financeira contra fonte externa = diário (Gray & Reuter); atual = nunca.

### F-fault-tolerance-4: I-Write-1 anti-drift do contrato não é implementado — o `bxaMnyValor` do ERP entra direto na baixa sem comparar com o `valorAlocado` da alocação

- **Severidade**: **P1** (alto — quebra invariante do contrato de escrita)
- **Tactic violada**: Sanity Checking (detect)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:179-192` (valida só `> 0`, não compara com alocação); contrato em `ontology/business-rules/fin010-write-contract.md:75-76`
- **Evidência (objetiva)**:
  ```
  fin010-write-contract.md:75-76 (regra I-Write-1):
    "antes do passo 5, |bxaMnyValor(passo 2) − valorEsperadoDaAlocacao| deve estar
     dentro da tolerância (≤ 0,005 na moeda do título); divergência ⇒ ABORTAR"

  ReconciliacaoPermutaService.ts:185-192:
    const bxaMnyValor = val2.responseData?.bxaMnyValor;
    if (bxaMnyValor === undefined || !(bxaMnyValor > 0)) {
        throw new Error(`título ${invoiceDocCod} sem valor em aberto no ERP ...`);
    }
    // NÃO há "if Math.abs(bxaMnyValor - aloc.valorAlocado) > 0.005 throw"
  ```
- **Impacto técnico**: se entre a alocação (que o analista aprovou) e a execução a INVOICE recebeu uma baixa parcial em outro lugar do ERP, o `bxaMnyValor` mudou; o serviço aceita silenciosamente o novo valor e baixa um montante DIFERENTE do que o analista revisou. Anti-super-pagamento absoluto está OK (não baixa mais do que o em-aberto), mas o usuário perde a garantia de "o valor que eu vi é o valor que vai entrar".
- **Impacto de negócio**: analista aprova baixa de R$ 41.099,90 → entre o clique e o POST, outro analista faz baixa parcial de R$ 10.000 → este serviço baixa silenciosamente R$ 31.099,90 sem alertar; o caso de uso "preview confiável" do dry-run vira mentiroso quando passa para o real.
- **Métrica de baseline**: 0 ocorrências do anti-drift no service; contrato declara obrigatoriedade explícita.

### F-fault-tolerance-5: Sem Idempotency-Key HTTP no endpoint `/reconciliar` — duplo-clique do analista é mitigado só pela chave interna (que protege APÓS o begin, não a entrada concorrente)

- **Severidade**: **P2** (médio — risco mitigado pela UNIQUE; mas duas requests simultâneas podem competir nos passos 2–4)
- **Tactic violada**: Sanity Checking (avoid double-fire na borda HTTP)
- **Localização**: `src/backend/routes/permutas.ts:355-381` (`/reconciliar`); contrastar com `:100-104` (`/eleicao` lê `Idempotency-Key`)
- **Evidência (objetiva)**:
  ```
  routes/permutas.ts:359-381  (POST /reconciliar)
    → não lê req.header('Idempotency-Key')

  routes/permutas.ts:100-104  (POST /eleicao)
    const rawKey = req.header('Idempotency-Key');
    const idempotencyKey = typeof rawKey === 'string' && rawKey.trim() ? rawKey.trim() : undefined;
  ```
- **Impacto técnico**: dois cliques rápidos do analista geram duas requisições paralelas. Ambas executam `beginExecution`; a UNIQUE garante que só uma cria a linha — a segunda recebe a linha em `reconciling` (não-settled), interpreta como retry e tenta executar os passos 2–5 EM PARALELO com a primeira. O ERP pode aceitar as duas (gerando 2 borderôs distintos, baixa duplicada).
- **Impacto de negócio**: mesmo cenário do F-1 mas iniciado pela UI, não pelo retry interno. Risco real em ambiente com WiFi instável onde o analista re-clica achando que o primeiro travou.
- **Métrica de baseline**: 0 endpoints do fluxo de reconciliação com `Idempotency-Key`; `/eleicao` já estabeleceu o padrão local.

### F-fault-tolerance-6: Audit-trail sobrescreve `erro_mensagem` ao reabrir / settled (perda de histórico de tentativas)

- **Severidade**: **P2** (médio — debugging futuro perde contexto)
- **Tactic violada**: Audit (transversal — cross-QA com Security)
- **Localização**: `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:142-186` (UPDATEs in-place, não append)
- **Evidência (objetiva)**:
  ```
  PermutaExecucaoRepository.ts:152
    UPDATE permuta_alocacao_execucao SET status='settled', ..., erro_mensagem = NULL, ...
                                                                ^^^^^^^^^^^^^^^^^^^
                                                                limpa a mensagem do erro anterior

  PermutaExecucaoRepository.ts:174
    UPDATE ... SET status='error', erro_mensagem=$..., erp_response=$..., ...
                                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                   sobrescreve a tentativa anterior sem versionar
  ```
- **Impacto técnico**: par que falhou 3 vezes e foi settled na 4ª tentativa só preserva a mensagem da última tentativa (e neste caso é zerada). Investigação post-mortem de "por que essa baixa demorou tanto?" perde dados.
- **Impacto de negócio**: cross-QA com Security (auditabilidade). Em compliance externa, "quem tentou o quê quando" tem que ser append-only. Hoje é "última instantânea ganha".
- **Métrica de baseline**: 0 colunas/tabelas de histórico de tentativas; UPDATE in-place padrão.

### F-fault-tolerance-7: Partial-batch coerência não tem teste — comportamento garantido por construção mas não verificado

- **Severidade**: **P2** (médio — regressão silenciosa possível)
- **Tactic violada**: cross-QA com Testability (falta cobertura), mas o tactic Fault Tolerance é Recovery: forward (não testado)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.test.ts` (9 testes, nenhum para múltiplas alocações com falha parcial)
- **Evidência (objetiva)**:
  ```
  ReconciliacaoPermutaService.ts:96-156  (loop)
    for (const aloc of alocacoes) {
        ...
        try { ... resultados.push({status:'settled', ...}); }
        catch (err) { await markError(...); resultados.push({status:'error', ...}); }
    }
    // ✅ comportamento OK: erro em par-3 não interrompe par-4

  ReconciliacaoPermutaService.test.ts
    grep -n "partial\|múltipl\|batch" → 0 hits
    Os 9 testes existentes cobrem 1 par por vez.
  ```
- **Impacto técnico**: alguém pode mudar o loop (`for` → `Promise.all` ou um `throw` no catch) e a suíte continua verde. Em produção, falha no par-3 pode acabar abortando par-4, que fica não-executado SEM marcar `error` (continua `reconciling` ou `pending`).
- **Impacto de negócio**: regressão silenciosa em fluxo crítico. Permuta múltipla é o caso de uso #1 da Fase 3 (ADR-0007).
- **Métrica de baseline**: 0/3 cenários de partial-batch testados (sucesso-todos / falha-no-meio / falha-no-primeiro-borderô); ideal = 3/3.

## 5. Cards Kanban

### [fault-tolerance-1] Desabilitar retry automático em `gravarBaixaPermuta` (POST não-idempotente)

- **Problema**
  > O `RetryExecutor` compartilhado por todo o `ConexosClient` reenvia o POST `fin010/baixas` em qualquer erro, inclusive timeouts pós-sucesso. Como o ERP não expõe `Idempotency-Key` e cada POST gera um `bxaCodSeq` novo, o retry pode duplicar a baixa real — super-pagamento. Mitigação local (chave `permuta:adto:invoice`) não atua dentro do mesmo `retryExecutor.execute`.

- **Melhoria Proposta**
  > Criar um `RetryExecutor` dedicado às escritas com `retries: 0` (ou `shouldRetry` que só aceite erros pré-conexão tipados como `ECONNREFUSED`/`ENOTFOUND`, NUNCA timeouts nem `ECONNRESET` durante o request body). Aplicar em `criarBordero` e `gravarBaixaPermuta` (passos 1 e 5 — os que mutam estado no ERP). Passos 2/3/4 (validações, idempotentes do lado ERP) podem manter o retry atual. Alternativa: deixar `gravarBaixaPermuta` SEM `retryExecutor.execute` e tratar erro como permanente (que é a semântica correta para um POST não-idempotente).

- **Resultado Esperado**
  > Zero double-writes provenientes de retry interno. Em timeout pós-sucesso, o serviço marca `error` (linha 138) e o operador investiga em vez de o cliente disparar segundo POST. Métrica: P(double-baixa | timeout) cai de ~1 (retry incondicional) para 0.

- **Tactic alvo**: Idempotent Replay (recover) — replay só onde for seguro
- **Severidade**: P0
- **Esforço estimado**: S (≤1d) — adicionar um `RetryExecutor` separado e trocar 2 chamadas
- **Findings relacionados**: F-fault-tolerance-1, F-fault-tolerance-5
- **Métricas de sucesso**:
  - retries no passo 5: 2 → 0
  - shouldRetry no executor de escrita: `() => true` → função explícita que recusa timeout
- **Risco de não fazer**: 1 timeout do `fin010/baixas` em produção = baixa duplicada com efeito contábil real, estornável só manualmente no ERP. Em 6 meses de uso real esperam-se ≥ N incidentes (proporcional ao volume × P(timeout-de-rede)).
- **Dependências**: nenhuma

### [fault-tolerance-2] Job detector de linhas `reconciling` presas

- **Problema**
  > O write-ahead é correto, mas se o processo morre entre o POST do passo 5 e o `markSettled`, a linha fica em `reconciling` indefinidamente — invisível salvo varredura manual. A coluna `atualizado_em` existe mas nenhum consumidor a usa.

- **Melhoria Proposta**
  > Criar um job/cron (EventBridge no alvo; `setInterval` ou rota administrativa enquanto Express) que liste `permuta_alocacao_execucao WHERE status='reconciling' AND atualizado_em < now() - interval '5 minutes'`. Para cada uma, idealmente tentar reconciliar contra `fin010` (vide card 3); no mínimo, gerar alerta/notificação (LogService BUSINESS_WARN + endpoint `/admin/execucoes/stuck`).

- **Resultado Esperado**
  > MTTD (mean time to detect) de uma `reconciling` presa: hoje = indefinido → alvo ≤ 5 min. Operador descobre antes do cliente.

- **Tactic alvo**: Timestamp (detect)
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) — definir cadência, endpoint admin, notificação
- **Findings relacionados**: F-fault-tolerance-2
- **Métricas de sucesso**:
  - cobertura: 0% → 100% das linhas `reconciling` com idade > 5min são reportadas
  - tempo médio para detectar: ∞ → ≤ 5 min
- **Risco de não fazer**: divergência DB↔ERP cresce silenciosamente; operador descobre só quando cliente reclama
- **Dependências**: nenhuma; complemento natural do card 3

### [fault-tolerance-3] Reconciliação periódica `permuta_alocacao_execucao` ↔ `fin010`

- **Problema**
  > `settled` local nunca é re-verificado contra o `fin010`. Se o analista estornar a baixa manualmente no ERP (caminho de recuperação documentado), nosso painel continua mostrando "settled" indefinidamente — divergência permanente entre as duas verdades.

- **Melhoria Proposta**
  > Job diário (EventBridge no alvo) que, para cada linha `settled` com `bxa_cod_seq` recente (janela ≤ N dias), confirma via `GET /com298/{adto}` ou endpoint equivalente que a baixa ainda existe. Divergência (baixa estornada) → marcar linha como `error` com `erro_mensagem='estornado no ERP'` e expor no painel admin. Cobertura inicial = últimos 30 dias para limitar custo de fan-out.

- **Resultado Esperado**
  > Invariante "DB ≡ ERP no espaço das baixas settled recentes" verificada todo dia. Divergências surgem em ≤ 24h.

- **Tactic alvo**: Reconcile (recover) + Comparison (detect)
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) — definir endpoint Conexos de verificação + job
- **Findings relacionados**: F-fault-tolerance-3
- **Métricas de sucesso**:
  - frequência de reconciliação: 0 → 1×/dia
  - tempo máximo de divergência não-detectada: ∞ → 24h
- **Risco de não fazer**: relatório mensal (Variação Cambial / Fechamento) usa dado local errado; cliente perde confiança no sistema
- **Dependências**: definir qual endpoint Conexos retorna o status atual da baixa (entrevista com Yuri)

### [fault-tolerance-4] Implementar I-Write-1 anti-drift do contrato `fin010`

- **Problema**
  > O contrato `fin010-write-contract.md:75-76` exige que `|bxaMnyValor(ERP) − valorEsperadoDaAlocacao| ≤ tolerância` antes do passo 5. O serviço só checa `> 0`. Se o em-aberto da invoice mudou no ERP entre a alocação e a execução, o serviço baixa silenciosamente um valor diferente do que o analista revisou.

- **Melhoria Proposta**
  > Em `ReconciliacaoPermutaService.executarBaixa` (após linha 186), comparar `bxaMnyValor` com `aloc.valorAlocado` (ou `aloc.valorEsperado`, dependendo da modelagem) com tolerância de 0.005. Divergência → `throw` (cai no catch existente que marca `error`); mensagem clara "em-aberto do ERP divergiu da alocação aprovada".

- **Resultado Esperado**
  > Garantia "o valor que o analista vê no preview = o valor que vai ser baixado". Falha visível em vez de silenciosa.

- **Tactic alvo**: Sanity Checking (detect)
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-4
- **Métricas de sucesso**:
  - implementação da I-Write-1: 0% → 100%
  - tolerância configurável documentada
- **Risco de não fazer**: preview dry-run vira mentiroso quando a invoice teve baixa parcial concorrente; analista aprova R$ X e R$ Y ≠ X é baixado
- **Dependências**: nenhuma

### [fault-tolerance-5] Aceitar `Idempotency-Key` HTTP no endpoint `/reconciliar`

- **Problema**
  > `/reconciliar` não lê `Idempotency-Key`, ao contrário do irmão `/eleicao` (mesmo arquivo, linhas 100-104). Duplo-clique do analista dispara duas executions paralelas; ambas conseguem rodar passos 2–5 em paralelo no mesmo borderô, com risco de duplicação do lado do ERP.

- **Melhoria Proposta**
  > Espelhar a disciplina de `/eleicao`: ler header `Idempotency-Key`; persistir como chave de "execução" agregada (tabela existente ou nova) com TTL; segunda request com a MESMA key retorna o resultado da primeira. Frontend gera UUID per clique (já é boa prática para `useMutation`).

- **Resultado Esperado**
  > Duplo-clique no botão "Executar Baixa" produz exatamente uma execução; segunda chamada recebe o `resultado` cacheado.

- **Tactic alvo**: Sanity Checking + Idempotent Replay
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-5
- **Métricas de sucesso**:
  - `/reconciliar` honra `Idempotency-Key`: não → sim
- **Risco de não fazer**: cenário raro mas real (cliente impaciente em rede lenta); a UNIQUE da chave por par mitiga 50% — mas não a paralelização dos passos 2-5
- **Dependências**: alinhamento com frontend (gerar key per click)

### [fault-tolerance-6] Tabela de histórico append-only de tentativas (`permuta_alocacao_execucao_evento`)

- **Problema**
  > `UPDATE` in-place sobrescreve `erro_mensagem` e `erp_response`. Reabertura `error→reconciling→settled` perde o histórico das tentativas; debugging de "por que essa baixa demorou?" fica cego. Cross-QA com Security (auditabilidade).

- **Melhoria Proposta**
  > Tabela paralela `permuta_alocacao_execucao_evento (id, execucao_id, evento, payload jsonb, criado_em)`. Cada `beginExecution`, `markSettled`, `markError` insere um evento; a `permuta_alocacao_execucao` mantém o último estado (snapshot rápido), o histórico vive na tabela de eventos. Padrão event-sourcing leve.

- **Resultado Esperado**
  > Histórico completo de tentativas auditável. `GET /execucoes/:key/eventos` para o painel admin.

- **Tactic alvo**: Audit (cross-QA com Security)
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-fault-tolerance-6
- **Métricas de sucesso**:
  - colunas de auditoria com histórico: 0 → 1 tabela append-only
  - retentividade: indefinida (ou política de N dias)
- **Risco de não fazer**: post-mortem cego; cross-QA fica mais difícil
- **Dependências**: migration; opcionalmente, hook no `LogService`

### [fault-tolerance-7] Teste de partial-batch para `ReconciliacaoPermutaService.reconciliar`

- **Problema**
  > 9 testes existentes cobrem 1 par. Partial-batch (N alocações onde uma falha) está garantido por construção, mas não testado — alguém pode trocar o `for` por `Promise.all` (ou colocar um `throw` no catch) e a suíte continua verde, regredindo silenciosamente.

- **Melhoria Proposta**
  > Adicionar ao menos 3 testes:
  > 1. múltiplas alocações, todas sucesso → 1 borderô compartilhado, todas `settled`;
  > 2. múltiplas alocações, falha no meio (par-2 de 4) → par-1 `settled`, par-2 `error`, pares 3 e 4 prosseguem;
  > 3. falha no `criarBordero` (passo 1) → nenhuma alocação prossegue, mas `beginExecution` já foi chamado: linhas em `reconciling` (esperado, caso documentado de "presa" para reconciliação manual).

- **Resultado Esperado**
  > Comportamento de fault-tolerance contratado e blindado contra regressão.

- **Tactic alvo**: Recovery: forward (validar testes)
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-fault-tolerance-7
- **Métricas de sucesso**:
  - cenários partial-batch testados: 0/3 → 3/3
- **Risco de não fazer**: regressão silenciosa em fluxo de permuta múltipla (caso #1 de uso da Fase 3)
- **Dependências**: nenhuma

## 6. Notas do agente

- O write-ahead pattern está corretamente implementado (intent → POST → markSettled) e a documentação `idempotencia-reconciliacao.md` reconhece explicitamente o estado `reconciling` como "presa visível". Excelente decisão de design — mas falta o detector que torna essa visibilidade efetiva (F-2).
- O achado **F-1 (retry no POST não-idempotente)** é o vetor mais grave: a chave de idempotência local protege contra re-execuções INICIADAS PELO ORQUESTRADOR (HTTP novo / nova chamada ao service), mas NÃO contra o retry interno do `RetryExecutor`, que reenvía o mesmo POST dentro da MESMA chamada — exatamente quando o `reconciling` está vivo e a chave já foi gravada. Se o ERP grava no primeiro POST e o segundo POST vai junto, são duas baixas reais.
- Cross-QA detectados (alertar consolidator):
  - **Security/auditabilidade**: F-6 (audit append-only) é também finding de Security.
  - **Testability**: F-7 (partial-batch) é fronteira; aqui contado como FT pois o comportamento sob falha é o objeto.
  - **Availability/Performance**: o retry do `RetryExecutor` foi escolhido para tolerância a timeouts/5xx em LEITURA — o ajuste do card-1 é o exato trade-off entre availability (retry) e fault-tolerance (write seguro). Há tensão real, não erro.
- Não foi medido localmente: latência real do `fin010/baixas` e taxa de timeout — requer telemetria de produção via CloudWatch / log estruturado do legacy `authenticatedPost`.
