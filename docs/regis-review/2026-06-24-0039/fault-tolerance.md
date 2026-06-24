---
qa: Fault Tolerance
qa_slug: fault-tolerance
run_id: 2026-06-24-0039
agent: qa-fault-tolerance
generated_at: 2026-06-24T00:39:00Z
scope: backend
score: 6
findings_count: 8
cards_count: 8
---

# Fault Tolerance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista clica "Reconciliar" ou uma ação de gestão de borderô (Aprovar / Cancelar / Estornar / Excluir baixa / Excluir borderô) | Falha PARCIAL no handshake do `fin010` — falha de rede entre os 5 POSTs da baixa, ou entre o loop de `excluirBaixa` e o `excluirBordero` final, ou `getBordero` devolve dado incoerente (`borDtaFinalizado` persistindo após estorno) | `ReconciliacaoPermutaService` + `BorderoGestaoService` + `ConexosClient.criar/finalizar/cancelar/estornar/excluirBordero` (escritas IRREVERSÍVEIS no ERP — `CONEXOS_WRITE_ENABLED=true` em prod, SEM staging) | Produção multi-filial, ERP Conexos não-transacional, escrita REAL ligada direto em produção (decisão Yuri 2026-06-24, cutover sem homologação) | (a) operação completa exatamente uma vez no ERP **e** está marcada `settled` localmente; OU (b) falha **antes** do POST de gravação **e** linha vira `error` com `erp_response` crua + `borCod` órfão rastreável; OU (c) falha **no meio** de uma sequência multi-chamada → estado parcial **expõe-se** na aba de Gestão de Borderôs para o analista resolver manualmente | 0 duplicações de `bxaCodSeq` no `fin010`; 100% das transições `→ settled` carregam `bxaCodSeq`; todo borderô criado tem `bor_cod` persistido **antes** do 1º POST do handshake; partial-borderô (criado + algumas baixas) sempre visível em `/permutas/borderos`; estado parcial de `excluirBordero` (algumas baixas removidas + borderô restante) reconciliável via re-execução do mesmo botão |

> Cenário concreto desta fatia (Fase 3.1 — gestão de borderô): analista clica "Excluir borderô" num borderô com 4 baixas; o ERP processa `excluirBaixa` para 2 delas; a rede cai antes do 3º DELETE; o borderô fica com 2 baixas remanescentes **e** a trilha local também fica com essas 2 (deletes vão por baixa e o `deleteByBorCod` só roda após o `excluirBordero` final). Re-clicar "Excluir borderô" relista as baixas do ERP (fonte da verdade — `listBaixas`) e completa idempotentemente — caminho de **forward recovery sem compensação** documentado como decisão explícita.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Write-ahead: intent gravado ANTES do POST (`reconciling`) | Sim — `beginExecution` antes do handshake | Obrigatório | ✅ | `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:149-160` |
| Persistência de `borCod` órfão (recuperação) | Sim — `setBorCod` chamado IMEDIATAMENTE após `criarBordero`, antes dos demais POSTs | Obrigatório | ✅ | `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:219-220` + repo `PermutaExecucaoRepository.ts:215-223`; teste em `ReconciliacaoPermutaService.test.ts:362-373` |
| Persistência de `borCod` em CAMINHO DE ERRO (markError com borCod) | Sim — `markError` inclui `borCod` quando já criado; ON CONFLICT do UPDATE usa `COALESCE($borCod, bor_cod)` | Obrigatório | ✅ | `ReconciliacaoPermutaService.ts:178-182`; `PermutaExecucaoRepository.ts:269-288` (`COALESCE` evita perda de `bor_cod` previamente gravado) |
| Idempotência interna por par adto↔invoice (estado-da-alocação) | Sim — chave inclui `atualizadoEm` da alocação; `ON CONFLICT` preserva `settled`; viva-check (borderô cancelado/estornado/removido renomeia chave) | Sim | ✅ | `ReconciliacaoPermutaService.ts:121-147`; `PermutaExecucaoRepository.ts:180-213` |
| Idempotência VIVA: re-baixa quando borderô anterior cancelado/estornado/removido | Sim — `borderoAindaValido` lê `getBordero`; estornado / cancelado / removido (404) → libera; ERRO de leitura → CONSERVADOR (bloqueia) | Sim | ✅ | `ReconciliacaoPermutaService.ts:476-487`; teste em `ReconciliacaoPermutaService.test.ts:218-240` |
| Erros do ERP traduzidos em 400 com mensagem amigável (não 500) | Sim — `erpErrorMessage` no route + `friendlyErpMessage` no serviço de reconciliação | Sim | ⚠️ parcial | `routes/permutas.ts:44-61, 443-554`; **MAS** `Generic.ERROR_MESSAGE` cai num literal genérico ("ERP recusou esta operação") que esconde a causa raiz |
| Atomicidade do handshake de 5 chamadas (criarBordero + N×{val2,val3,val4,gravar}) | NÃO É TRANSACIONAL no ERP — se falhar no meio, fica borderô parcial em `fin010` | Compensação automática (rollback) **ou** exposição explícita | ⚠️ — escolha forward: aba "Borderôs" expõe `EM_CADASTRO` para o analista descartar/aprovar | `ReconciliacaoPermutaService.ts:162-205`; recuperação via `BorderoGestaoService.listarBorderos` (`BorderoGestaoService.ts:278-353`) |
| Atomicidade de `excluirBordero` (loop `excluirBaixa` → `excluirBordero`) | NÃO É TRANSACIONAL — se falhar no meio, sobram baixas no ERP + borderô órfão | Re-execução idempotente do mesmo botão (lista do ERP é a fonte) | ⚠️ — funciona mas exige clique humano para concluir | `BorderoGestaoService.ts:159-170` (loop sem compensação); `ConexosClient.ts:1081-1153` (`listBaixas` é a fonte da verdade no retry) |
| Best-effort no auto-delete do borderô vazio (`excluirBaixa` last) | Sim — falha do `excluirBordero` final é logada como WARN e a operação principal segue (a baixa já saiu) | OK (ação principal não regride por uma limpeza acessória) | ✅ | `BorderoGestaoService.ts:108-122` |
| Caso de `getBordero` retornar dado incoerente (`borDtaFinalizado` persiste após estorno) | TRATADO — removido o pré-guard que confiava no GET; transições escrevem direto e o ERP é a autoridade (recusa transições inválidas com mensagem clara) | OK — política documentada | ✅ | `BorderoGestaoService.ts:151-156, 261-266` (comentários explicam por quê) |
| Anti-drift (I-Write-1): baixa = round2(valorAlocado × taxa), capada no em-aberto vivo; aborta se excede | Sim — incluindo tolerância `max(0.01, em-aberto × 0.5%)` e `Math.min` final | Sim | ✅ | `ReconciliacaoPermutaService.ts:243-257`; teste em `ReconciliacaoPermutaService.test.ts:294-315` |
| Retries em escritas (POST/DELETE não-idempotentes ao ERP) | **Removidos** das escritas (`criarBordero`, `gravarBaixaPermuta`, `excluirBordero`, `excluirBaixa`, `finalizarBordero`, `cancelarBordero`, `estornarBordero`) — tentativa única, falha sobe para `error` na trilha | Sim — escolha correta (sem `Idempotency-Key` no `fin010`) | ✅ | `ConexosClient.ts:1011-1033, 1136-1198, 1381-1394` (todos os writes sem `retryExecutor`) |
| `getBordero` SEM retry (best-effort, lista N×) | Sim — falha rápido, marca INDISPONIVEL na UI | OK em leitura best-effort N-vezes | ✅ | `ConexosClient.ts:1044-1074` |
| Audit-trail per transição (quem, quando, o quê) | Parcial — `executado_por` + `erp_response` + timestamps; `markSettled` ZERA `erro_mensagem`; sem versionamento append-only | Append-only de transições | ⚠️ | `PermutaExecucaoRepository.ts:234-288` (UPDATE in-place destrói histórico de tentativas) |
| Detector de linhas `reconciling`/`error` "presas" (cron/sweep) | **Ausente** — sem job que liste `reconciling > N min` ou `error` há > N min e alerte | Reaper batch (mesmo padrão do sweep da ingestão) | ❌ | `grep -rn "stuck\|reaper\|sweep" src/backend/domain/service/permutas/` → só `IngestaoCoalescerService` (compute, não execução); a aba `/borderos` mostra estado mas só quando o analista entra |
| Reconciliação periódica contra `fin010` (verificar se `settled` local bate com baixa viva no ERP) | **Ausente** | Job de reconciliação diário (forward-only — divergência → exception queue / alerta) | ❌ | sem hits para `reconcili.*conexos`/`verifica.*baixa` |
| Cutover de produção SEM staging (`CONEXOS_WRITE_ENABLED=true` em prod, dry-run desligado) | Confirmado: `render.yaml:39-42` fixa os 2 flags em prod | Pelo menos: feature-flag por adiantamento OU `canary` por filial nas primeiras 48h | ⚠️ risco operacional **alto** — 1 bug = perda monetária real | `render.yaml:37-42`; `CHANGELOG.md` (v0.6.0) anuncia "ESCRITA REAL LIGADA" |
| Partial-batch coerência (N alocações: 1 falha não regride as já settled) | Garantido por construção (loop captura por iteração; idempotência preserva `settled`); **tem teste** | Comportamento testado | ✅ | `ReconciliacaoPermutaService.ts:103-196` + `ReconciliacaoPermutaService.test.ts:242-260` |

> ⚠️ **Não medível localmente**: taxa real de timeout dos 5 POSTs do handshake em produção e taxa de chegada de `Generic.ERROR_MESSAGE` (vs códigos específicos). Requer instrumentação no `legacy.postGeneric` + dashboard agregado (CloudWatch / Render logs com agregação). Recomendação: contador por endpoint (`fin010`, `fin010/baixas`, `fin010/finalizar/...`, `fin010/cancelar/...`, `fin010/estornar/...`, `fin010/{bor}`) × {sucesso, 400-traduzido, 400-generic, timeout, 5xx}.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Substitution (avoid: dry-run) | Default `dryRun` quando `CONEXOS_WRITE_ENABLED=false` OU `CONEXOS_DRY_RUN=true` OU `dryRunOverride`; preview consolidado sem POST | ✅ presente | `ReconciliacaoPermutaService.ts:95-119` |
| Increase Competence Set (avoid) | Validação do em-aberto vivo do ERP (passo 2); anti-drift cap no `Math.min(desejado, em-aberto)` | ✅ presente | `ReconciliacaoPermutaService.ts:223-257` |
| Predictive Model (avoid) | N/A — integração síncrona com ERP single-tenant; não cabe predição | N/A | — |
| Replacement (avoid) | N/A — não há instância secundária do `fin010` para failover | N/A | — |
| Sanity Checking (detect) | `assertNoErpError` lê envelope `{ messages }` mesmo em HTTP 200 (Regis F-integrability-3); `bxaMnyValor > 0`; round2 forçado em todos os money fields | ✅ presente | `ReconciliacaoPermutaService.ts:229-236, 271-292, 461-469`; teste `ReconciliacaoPermutaService.test.ts:317-334` |
| Comparison (detect — reconciliation com ERP) | **Ausente** — nenhum job confronta `settled` local com baixa viva no `fin010` | ❌ ausente | sem hits `grep` para reconciliação periódica |
| Timestamp (detect — stale work) | Coluna `atualizado_em` existe; **sem consumidor** que detecte `reconciling > N min` ou `error > N h` | ⚠️ parcial | `PermutaExecucaoRepository.ts:218, 197` (escrita); sem leitura |
| Timeout (detect) | Implícito no `legacy.postGeneric`; sem timeout per-endpoint visível neste escopo | ⚠️ parcial | `ConexosClient.ts:1381-1394` |
| Condition Monitoring (detect) | Log estruturado `BUSINESS_INFO`/`BUSINESS_WARN` em cada transição (incluindo best-effort warn do auto-delete de borderô vazio); **sem métrica agregada** | ⚠️ parcial | `ReconciliacaoPermutaService.ts:325-329, 183-187`; `BorderoGestaoService.ts:114-122, 124-134, 192-197, 209-215, 228-234` |
| Self-Test (detect) | N/A — sem health-check ativo do `fin010` (`/health` cobre o backend, não a integração) | N/A | — |
| Voting (detect) | N/A — fonte única (Conexos) | N/A | — |
| Redundancy (contain) | N/A — Conexos é fonte única | N/A | — |
| Recovery: forward — quarantine `error` (contain) | `markError` persiste `erro_mensagem` + `erp_response` crua + `borCod` (via COALESCE); aparece em `GET /execucoes` e na linha do borderô | ✅ presente | `PermutaExecucaoRepository.ts:269-288`; `routes/permutas.ts:560-569` |
| Recovery: backward — rollback / compensating txn (contain) | **Ausente por desenho** — handshake do `fin010` não é transacional; recuperação via aba "Borderôs" (analista vê o parcial e Aprova/Cancela/Exclui) | ✅ decisão consciente | `BorderoGestaoService.ts:48-55` (comentário "AÇÕES … aqui só listamos para revisão"); `ReconciliacaoPermutaService.ts:162-205` (sem `try-rollback`) |
| Reintroduction: state resync (contain) | Parcial — `excluirBordero` re-enumera baixas do ERP (`listBaixas`) cada vez → retry humano converge; idempotência viva reabre re-baixa quando borderô foi cancelado/estornado/removido | ✅ presente | `BorderoGestaoService.ts:159-170`; `ReconciliacaoPermutaService.ts:130-147` |
| Reintroduction: shadow (contain) | N/A — não há replay shadow contra cópia do ERP | N/A | — |
| Reintroduction: escalating restart (contain) | N/A — não-aplicável a processos transacionais financeiros | N/A | — |
| Rollback (recover) | N/A para baixa individual — escrita irreversível por nós (correto); para borderô EM CADASTRO existe `cancelarBordero`/`excluirBordero` como **rollback assistido pelo analista** (não automático) | ⚠️ parcial — não-automático | `BorderoGestaoService.ts:203-235` |
| Repair State (recover) | **Ausente** — sem endpoint "marcar `reconciling` como `settled` dado o `bxaCodSeq` ex-post" para recuperar processo morto após POST de gravação | ❌ ausente | — |
| Idempotent Replay (recover) | Sim NO NÍVEL local (chave `permuta:adto:invoice:atualizadoEm`); reforçada por viva-check do borderô (cancelado/estornado/removido) — replay seguro **enquanto não há retry interno** no passo 5 (que foi removido do `RetryExecutor`) | ✅ presente | `ReconciliacaoPermutaService.ts:121-147`; `ConexosClient.ts:1381-1394` |
| Compensating Transaction (recover) | Escolhido NÃO automatizar (estorno requer julgamento humano em valores reais); `estornarBordero` existe como ação manual | ✅ presente como decisão | `BorderoGestaoService.ts:218-235` |
| Reconcile (recover) | **Ausente** — sem confronto periódico com `fin010` | ❌ ausente | — |
| Quarantine (recover) | `error` é a quarentena lógica; visível em `GET /execucoes` e como linha amarela na aba `/borderos` | ✅ presente | `routes/permutas.ts:560-569`; `BorderoGestaoService.ts:309-353` |

## 4. Findings (achados)

### F-fault-tolerance-1: Cutover de produção SEM staging — `CONEXOS_WRITE_ENABLED=true` direto em PRD

- **Severidade**: **P0** (crítico — qualquer regressão escreve dinheiro real no `fin010` sem rede de segurança)
- **Tactic violada**: Substitution (avoid) — homologação/canary inexistente como camada antes do cliente final
- **Localização**: `render.yaml:37-42`; `CHANGELOG.md` (v0.6.0)
- **Evidência (objetiva)**:
  ```
  render.yaml:37-42
    # Fase 3 (ADR-0013) — ESCRITA no fin010 LIGADA em produção (decisão do Yuri 2026-06-24:
    # baixa real direto em PRD, sem homologação). CONEXOS_BASE_URL fica no dashboard (sync:false)
    # e DEVE apontar para a produção. Runbook: docs/runbooks/fin010-write-cutover.md.
    - key: CONEXOS_WRITE_ENABLED
      value: 'true'
    - key: CONEXOS_DRY_RUN
      value: 'false'
  ```
- **Impacto técnico**: o único gate entre um bug e uma baixa duplicada/errada no `fin010` é o `requireRole('admin')` + a UI. Não há ambiente de "staging Conexos" para reproduzir comportamento ERP real fora de produção; cada deploy é também o primeiro teste do contrato `fin010` para a versão. A janela de detecção é o próprio analista descobrir no relatório de variação cambial.
- **Impacto de negócio**: 1 regressão em código que mude payload da baixa = N baixas reais erradas até alguém perceber. Em permuta múltipla (4 pares), o blast radius por execução é multiplicado. Reverter requer estorno manual de borderôs no ERP — recuperável, mas custoso e exposto a erro de operador.
- **Métrica de baseline**: 100% das requisições admin `/reconciliar` escrevem em PRD; 0% em staging. Backstop: dry-run override no body (`dryRun: true`) — depende do analista lembrar de marcar.

### F-fault-tolerance-2: Sem detector de linhas `reconciling`/`error` presas — sweep/reaper inexistente para a execução

- **Severidade**: **P1** (alto — falhas silenciosas dependem do analista entrar na aba certa)
- **Tactic violada**: Timestamp (detect) — `atualizado_em` existe mas não é consultado
- **Localização**: `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:215-223, 269-288`; sem job consumidor
- **Evidência (objetiva)**:
  ```
  $ grep -rn "stuck\|reaper\|sweep" src/backend/domain/service/permutas/
  → só IngestaoCoalescerService (sweep da ingestão — outro fluxo)
  ```
- **Impacto técnico**: se o processo morrer entre o POST `fin010/baixas` e o `markSettled`, a linha fica `reconciling` indefinidamente. Hoje só aparece se o analista voltar ao mesmo adiantamento (e mesmo assim ele só vê via `GET /execucoes` — sem destaque). O write-ahead já registra o `borCod` (recuperação artesanal possível), mas sem cron alertando, a janela de descoberta é "quando alguém olhar".
- **Impacto de negócio**: divergência silenciosa entre trilha local (mostra `reconciling`) e ERP (já tem `bxaCodSeq` gravado) → o operador pode tentar relançar a permuta e cair no caminho de "borderô ainda válido" (bloqueado), porém sem entender por quê. Tempo médio de descoberta hoje = horas a dias (depende do hábito do analista).
- **Métrica de baseline**: número de linhas `reconciling` com `atualizado_em < now() − 10min` hoje = 0 (sistema novo); alvo após reaper = alertar em P95 < 5min.

### F-fault-tolerance-3: Sem reconciliação periódica contra o `fin010` — divergência local↔ERP não é detectada

- **Severidade**: **P1** (alto — para um sistema financeiro, divergência silenciosa = relatório que mente)
- **Tactic violada**: Comparison (detect) / Reconcile (recover)
- **Localização**: ausência; sem `grep` hits para reconciliação com Conexos
- **Evidência (objetiva)**:
  ```
  $ grep -rn "reconcili.*conexos\|verifica.*baixa.*fin010" src/backend/domain/service/permutas
  → sem resultados
  ```
- **Impacto técnico**: a fonte da verdade do estado da baixa é o `fin010`. Se uma baixa for estornada/cancelada DIRETO no Conexos (fora do nosso sistema), nossa trilha `settled` permanece — a aba "Borderôs" hidrata o estado vivo só quando o usuário abre, e a tela de adiantamentos NÃO re-pergunta. A idempotência viva (`borderoAindaValido`) só roda **quando o analista tenta relançar** — não há varredura proativa.
- **Impacto de negócio**: relatórios e painéis derivados (% pago, falta-pagar, eligible-list) podem refletir um mundo que não existe mais no ERP. Em meses de fechamento, isso vira retrabalho de auditoria.
- **Métrica de baseline**: 0 reconciliações automatizadas hoje; alvo = 1 run/dia + alerta em divergência ≥ 1 par.

### F-fault-tolerance-4: `Generic.ERROR_MESSAGE` traduzido como literal genérico mascara causa raiz

- **Severidade**: **P2** (médio — mensagem amigável mas opaca; aumenta MTTR humano)
- **Tactic violada**: Sanity Checking / Condition Monitoring (detect)
- **Localização**: `src/backend/routes/permutas.ts:49-51`
- **Evidência (objetiva)**:
  ```
  routes/permutas.ts:49-51
    'Generic.ERROR_MESSAGE':
        'O ERP recusou esta operação para o borderô (estado incompatível com a ação).',
  ```
- **Impacto técnico**: quando o `fin010` devolve `Generic.ERROR_MESSAGE` (envelope sem detalhe estruturado), o usuário vê só "estado incompatível"; o `erp_response` cru ainda está no log e na linha de execução, mas o ciclo "ler mensagem da UI → procurar log" custa tempo e cresce com a frequência.
- **Impacto de negócio**: nas primeiras semanas de produção (sem staging — ver F-fault-tolerance-1) cada erro `Generic.*` é um overhead de investigação no Yuri/analista.
- **Métrica de baseline**: contagem de `Generic.ERROR_MESSAGE` em produção = não-medida hoje; alvo = log estruturado com 100% dos erros do ERP categorizados (mesmo que o bucket seja "GENERIC + dump").

### F-fault-tolerance-5: Audit-trail destrutiva — `markSettled` zera `erro_mensagem` e cada UPDATE sobrescreve a linha anterior

- **Severidade**: **P2** (médio — perda de histórico de tentativas para forense post-mortem)
- **Tactic violada**: Audit-trail completeness (cross-cutting)
- **Localização**: `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:234-267`
- **Evidência (objetiva)**:
  ```
  PermutaExecucaoRepository.ts:246-255
    `UPDATE permuta_alocacao_execucao SET
        status = 'settled',
        ...
        erp_response = $erpResponse::jsonb,
        erro_mensagem = NULL,         ← histórico do error anterior PERDIDO
        atualizado_em = now()
     WHERE idempotency_key = $key`
  ```
- **Impacto técnico**: se um par falhou (error com mensagem X) e foi reaberto com sucesso, a evidência da 1ª tentativa some. Para uma auditoria interna ("por que essa baixa demorou 3 tentativas?"), só sobra o log estruturado (LogService) — que rotaciona em Render free tier.
- **Impacto de negócio**: dificulta forense em incidentes financeiros e a defesa de uma decisão posterior ("essa permuta foi executada após 2 tentativas falhas, motivos Y e Z"). Para a Columbia/Trading, esse histórico é defensável em revisão externa.
- **Métrica de baseline**: 0 linhas de histórico append-only por execução hoje; alvo = 1 linha por transição (`permuta_alocacao_execucao_evento` ou similar).

### F-fault-tolerance-6: `excluirBordero` (whole) — loop NÃO-transacional sobre `excluirBaixa` deixa estado parcial em falha de rede no meio

- **Severidade**: **P2** (médio — recuperável por re-clique, mas exige humano e silencioso até lá)
- **Tactic violada**: Compensating Transaction (recover)
- **Localização**: `src/backend/domain/service/permutas/BorderoGestaoService.ts:159-170`
- **Evidência (objetiva)**:
  ```
  BorderoGestaoService.ts:159-170
    const baixas = await this.conexosClient.listBaixas({ filCod, borCod });
    for (const b of baixas) {
        await this.conexosClient.excluirBaixa({ ... });   // ← se falhar no item k, itens [0..k-1] já saíram
    }
    await this.conexosClient.excluirBordero({ filCod, borCod });
    await this.execucaoRepository.deleteByBorCod(borCod);
  ```
  Sem `try-catch-rollback`; sem checkpoint per-item; sem retry tipado.
- **Impacto técnico**: cenário N=4 baixas, rede cai entre `excluirBaixa[1]` e `excluirBaixa[2]` → ERP fica com 2 baixas + borderô; trilha local intacta (deleteByBorCod só roda no fim). A próxima execução do MESMO botão funciona porque `listBaixas` é re-lida — convergência por **idempotência natural do DELETE**. **Porém** sem destaque na UI nem no log warn-level imediato, o estado parcial é invisível até o re-clique.
- **Impacto de negócio**: confusão do analista ("apaguei, mas o borderô tá lá ainda?"); risco baixo de duplicação (DELETE é idempotente no ERP); risco médio de aprovar/finalizar acidentalmente o borderô parcial restante antes de re-tentar.
- **Métrica de baseline**: número esperado de partial-deletes em produção = função da estabilidade de rede; sem instrumentação hoje. Alvo: log WARN com `borCod` + índice da baixa falhada + endpoint preservado para re-execução.

### F-fault-tolerance-7: `getBordero` em ERRO de leitura ⇒ bloqueia re-baixa (conservador) — falta janela máxima para evitar starvation

- **Severidade**: **P2** (médio — política correta hoje, mas sem timeout vira deadlock funcional)
- **Tactic violada**: Timeout (detect) aplicada à decisão "borderô ainda válido?"
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:476-487`
- **Evidência (objetiva)**:
  ```
  ReconciliacaoPermutaService.ts:485-486
    } catch {
        return true; // incerto → conservador (bloqueia re-baixa)
    }
  ```
- **Impacto técnico**: se `getBordero` falhar consistentemente (Conexos down só nesse endpoint; permissão revogada no `cnx-filcod` do usuário), TODO relançamento de par com `settled` antigo fica BLOQUEADO indefinidamente. A política "incerto → bloqueia" é correta para evitar dupla baixa, mas precisa de uma válvula (após X tentativas com getBordero ERRO ⇒ alertar; permitir override manual rastreável).
- **Impacto de negócio**: cenário de borda; impacta a operação só se o `fin010` GET ficar degradado por horas. Quando ocorre, o analista não tem caminho automático para destravar — só ticket.
- **Métrica de baseline**: 0 starvation hoje; alvo = log WARN no 2º ERRO consecutivo do mesmo `borCod` + endpoint de override.

### F-fault-tolerance-8: `ON CONFLICT` do `beginExecution` reabre `reconciling` por cima de `error` sem registrar quantas tentativas / preservar `erp_response` anterior

- **Severidade**: **P3** (baixo — relacionado a F-5; coleta para forense post-mortem)
- **Tactic violada**: Audit-trail (cross-cutting) / Condition Monitoring (detect)
- **Localização**: `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:180-213`
- **Evidência (objetiva)**:
  ```
  PermutaExecucaoRepository.ts:190-197
    ON CONFLICT (idempotency_key) DO UPDATE SET
        status = CASE WHEN ... 'settled' THEN ... ELSE EXCLUDED.status END,
        ...
        atualizado_em = now()
    -- nenhum contador `tentativas`; `erp_response` do error fica até o próximo markError/markSettled
  ```
- **Impacto técnico**: a linha não diz "esta é a 3ª tentativa" — só `atualizado_em` mudou. Tracker de retries (humanos) precisa correlacionar manualmente via LogService.
- **Impacto de negócio**: baixo no curto prazo; relevante para auditoria/post-mortem (mesma raiz de F-5).
- **Métrica de baseline**: 0 tentativas contadas hoje; alvo = coluna `tentativas` incrementada em cada `beginExecution` que reabre.

## 5. Cards Kanban

### [fault-tolerance-1] Adicionar canary/feature-flag por filial OU por adiantamento para a escrita real no `fin010` nas primeiras 72 h

- **Problema**
  > A escrita real no `fin010` está ligada direto em produção (`render.yaml:37-42`), sem staging, sem canary, sem feature-flag granular. Qualquer regressão futura escreve dinheiro real até alguém perceber. O dry-run-override do body é defesa de profundidade ruim — depende de o analista marcar.

- **Melhoria Proposta**
  > Adicionar 1 das 2 opções (preferir a primeira):
  > 1. **Allow-list por filial** em `EnvironmentProvider` (`CONEXOS_WRITE_FIL_CODS=2,4`) — só executa `gravarBaixaPermuta` se `filCod ∈ allow-list`. Padrão: lista vazia ⇒ bloqueia (fail-closed).
  > 2. **Feature-flag por adiantamento** persistida em DB (`permuta_write_allowlist`) povoada via admin endpoint — permite "soltar" 1 par por vez nas primeiras 72 h.
  > Em ambas, manter o gate global `CONEXOS_WRITE_ENABLED` como kill-switch.

- **Resultado Esperado**
  > Blast radius de uma regressão limitado a N filiais/adiantamentos opt-in. Métrica: % de execuções reais cobertas por allow-list explícita: hoje 0% → alvo 100% nas primeiras 72 h pós-cutover.

- **Tactic alvo**: Substitution (avoid)
- **Severidade**: P0
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-fault-tolerance-1
- **Métricas de sucesso**:
  - Execuções fora da allow-list bloqueadas: 0 → 100%
  - Tempo entre push e 1ª baixa real "aberta" reduz para o tempo de o analista adicionar a filial/adto à allow-list (controle humano)
- **Risco de não fazer**: 1 deploy com regressão de payload escreve N baixas erradas no `fin010` antes da descoberta humana
- **Dependências**: nenhuma

### [fault-tolerance-2] Job de sweep que detecta execuções `reconciling > 10min` ou `error > 24h` e alerta

- **Problema**
  > Não há reaper para a tabela `permuta_alocacao_execucao`. Uma execução que morra entre `POST fin010/baixas` e `markSettled` permanece `reconciling` invisível. Linhas `error` antigas idem — dependem de o analista voltar ao adiantamento certo.

- **Melhoria Proposta**
  > Implementar `PermutaExecucaoReaperService` no padrão de `IngestaoCoalescerService` (sweep periódico). Para cada linha:
  > - `reconciling` há > 10 min: tentar reconciliar via `bxaCodSeq` (se `getBordero(borCod)` mostra baixa correspondente ⇒ marcar `settled`; senão ⇒ mover para `error` com motivo "stuck-no-baixa").
  > - `error` há > 24 h sem `atualizado_em` mudando: log WARN + métrica.
  > Trigger inicial: endpoint manual `/permutas/maintenance/sweep` (Express puro hoje); alvo cron quando EventBridge existir.

- **Resultado Esperado**
  > Latência de detecção de execução presa: dias → 10 min (P95). Métrica observável: `count(reconciling AND atualizado_em < now()-10min)` exposto no `/health` ou painel admin.

- **Tactic alvo**: Timestamp (detect) + Repair State (recover)
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-fault-tolerance-2
- **Métricas de sucesso**:
  - P95 latência detecção `reconciling` presa: hoje ∞ → alvo 10 min
  - Cobertura de teste do reaper: 0% → alvo 100% dos 3 ramos (settled-recoverable, settled-impossible, error-old)
- **Risco de não fazer**: divergência silenciosa local↔ERP cresce a cada incidente de rede; perda de confiança no painel
- **Dependências**: depende parcialmente da decisão "Express puro ou esperar Lambda+EventBridge" (alvo); endpoint manual cobre o gap

### [fault-tolerance-3] Job diário de reconciliação contra `fin010` — confronta `settled` local com baixas vivas no ERP

- **Problema**
  > Sem job que confronte a trilha `settled` com o estado vivo no `fin010`. Estornos/cancelamentos feitos direto no Conexos (fora do sistema) deixam a trilha mentindo até alguém tentar relançar.

- **Melhoria Proposta**
  > `PermutaReconciliacaoConexosService` rodando 1×/dia (manual endpoint inicial). Para cada `settled` com `bor_cod`: chama `getBordero(filCod, borCod)` + `listBaixas` para confirmar o `bxaCodSeq`. Divergência (baixa some / borderô estornado / valor difere) ⇒ marca `error` com motivo `divergencia-conexos` + alerta. Forward-only (não tenta consertar — só sinaliza).

- **Resultado Esperado**
  > Toda divergência local↔ERP é visível em ≤ 24 h. Métrica: número de pares `settled` confirmados/divergentes por dia exposto em endpoint admin.

- **Tactic alvo**: Comparison (detect) + Reconcile (recover)
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-fault-tolerance-3
- **Métricas de sucesso**:
  - % `settled` confrontados/dia: hoje 0% → alvo 100%
  - Tempo até divergência conhecida: ∞ → ≤ 24 h
- **Risco de não fazer**: relatório de variação cambial e progresso de pagamento divergem do `fin010` em fechamento — auditoria perde confiança
- **Dependências**: F-fault-tolerance-2 (mesmo padrão de sweep; reaproveitar infraestrutura)

### [fault-tolerance-4] Sub-bucket de `Generic.ERROR_MESSAGE` com dump estruturado + log + correlação

- **Problema**
  > A tradução genérica "ERP recusou esta operação" em `routes/permutas.ts:49-51` esconde a causa raiz quando o `fin010` devolve `Generic.ERROR_MESSAGE`. Aumenta MTTR humano sem acrescentar segurança.

- **Melhoria Proposta**
  > Quando `key === 'Generic.ERROR_MESSAGE'`: 1) preservar `erp_response` cru no payload de erro retornado ao FE (ou um `errorRef` que linka ao log); 2) log estruturado no LogService com o dump + correlação requestId; 3) na UI, exibir "ERP recusou (cod-Generic) — código de referência: REQ-XXXX" para o analista citar ao Yuri.

- **Resultado Esperado**
  > Tempo médio de diagnóstico de erro `Generic.*`: hoje "ler banco/log" (5-30 min) → alvo "copiar requestId da UI e buscar" (< 2 min).

- **Tactic alvo**: Sanity Checking + Condition Monitoring (detect)
- **Severidade**: P2
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-fault-tolerance-4
- **Métricas de sucesso**:
  - % erros `Generic.*` com requestId visível na UI: 0% → 100%
  - MTTR humano por erro `Generic.*`: 5-30 min → < 2 min
- **Risco de não fazer**: nas primeiras semanas de produção, esses erros vão acumular tickets sem resolução rápida (overhead Yuri)
- **Dependências**: nenhuma

### [fault-tolerance-5] Tabela append-only de eventos de execução (`permuta_alocacao_execucao_evento`)

- **Problema**
  > A linha de execução é UPDATEd in-place; `markSettled` ZERA `erro_mensagem`; reabertura de error perde a evidência da tentativa anterior. Para auditoria/forense, o histórico desaparece (apenas LogService — que rotaciona em Render free).

- **Melhoria Proposta**
  > Nova tabela `permuta_alocacao_execucao_evento` (append-only) com `(idempotency_key, seq, evento, payload jsonb, criado_em, criado_por)`. Cada transição (beginExecution / setBorCod / markSettled / markError) grava 1 linha além de atualizar o agregado. Sem DELETE; particionável por mês quando crescer.

- **Resultado Esperado**
  > 100% das transições têm rastro append-only consultável por `idempotency_key`. Métrica: linhas de evento / linhas de execução ≥ 2 (típico settled = beginExecution + setBorCod + markSettled).

- **Tactic alvo**: Audit-trail completeness (cross-cutting)
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-fault-tolerance-5, F-fault-tolerance-8
- **Métricas de sucesso**:
  - Histórico de tentativas recuperável SEM ler log: 0% → 100%
  - Tempo de forense post-mortem de uma execução: indefinido → ≤ 5 min via SQL
- **Risco de não fazer**: post-mortem de incidentes financeiros sem evidência reproduzível; defensibilidade reduzida em revisão externa
- **Dependências**: nenhuma (migration nova; serviço atualizado nas 4 chamadas)

### [fault-tolerance-6] Checkpoint + WARN log per-item no `excluirBordero` (loop de `excluirBaixa`)

- **Problema**
  > O loop `excluirBaixa[i]` + `excluirBordero` final não tem checkpoint, retry tipado, nem log WARN intermediário em falha. Re-clicar resolve (idempotência natural via `listBaixas`), mas o estado parcial fica invisível até alguém perceber.

- **Melhoria Proposta**
  > Em `BorderoGestaoService.excluirBordero`: 1) try-catch por iteração do loop com log WARN imediato (`borCod`, `bxaCodSeq` falhado, índice `k/N`); 2) parar o loop na 1ª falha; 3) retornar `{ excluido: false, baixasExcluidas: k, restantes: N-k }` (não 4xx — é estado parcial documentado); 4) FE mostra "Borderô parcialmente excluído — clique de novo para concluir".

- **Resultado Esperado**
  > Estado parcial sempre visível na resposta + log; o analista entende exatamente o que aconteceu. Métrica: 100% das execuções de `excluirBordero` que falham no meio devolvem o índice exato + têm log WARN.

- **Tactic alvo**: Compensating Transaction (recover — forward variant) + Condition Monitoring (detect)
- **Severidade**: P2
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-fault-tolerance-6
- **Métricas de sucesso**:
  - Visibilidade do estado parcial: implícita → explícita (response + log)
  - Re-clicks bem-sucedidos vs tickets confusos: ratio melhor (medível no Yuri)
- **Risco de não fazer**: confusão recorrente do analista; aprovação acidental de borderô parcial; mancha de confiança na UI de gestão
- **Dependências**: nenhuma

### [fault-tolerance-7] Válvula de escape para `borderoAindaValido` quando `getBordero` falha repetidamente

- **Problema**
  > O fallback "incerto → conservador" do `borderoAindaValido` é correto para evitar dupla baixa, mas se `getBordero` falhar consistentemente (Conexos degradado / permissão), o re-relançamento fica bloqueado indefinidamente sem alerta nem override.

- **Melhoria Proposta**
  > Em `ReconciliacaoPermutaService.borderoAindaValido`: 1) log WARN no 1º catch citando `borCod` + `endpoint`; 2) métrica/contador "getBordero_failure" persistido na linha (`getbordero_falhas_consecutivas`); 3) admin endpoint `POST /permutas/execucoes/:key/forcar-liberacao` com motivo obrigatório (gravado no append-only de F-5) — só admin, log AUDIT.

- **Resultado Esperado**
  > Bloqueio por incerteza vira observável e destravável por humano com trilha. Métrica: 0 starvations não-detectadas; override sempre rastreável.

- **Tactic alvo**: Timeout (detect) + Repair State (recover)
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-fault-tolerance-7
- **Métricas de sucesso**:
  - Linhas bloqueadas por incerteza visíveis em painel: 0 → 100%
  - Override manual rastreável: 0 → 100%
- **Risco de não fazer**: cenário de borda — ERP degrada por horas e ninguém consegue relançar nada
- **Dependências**: F-fault-tolerance-5 (append-only para registrar o override)

### [fault-tolerance-8] Contador `tentativas` na linha de execução

- **Problema**
  > A linha `permuta_alocacao_execucao` não diz "esta é a 3ª tentativa"; tracker de retries é manual via LogService.

- **Melhoria Proposta**
  > Migration: coluna `tentativas INT NOT NULL DEFAULT 0`. `beginExecution` faz `tentativas = tentativas + 1` no `ON CONFLICT DO UPDATE` (não no INSERT inicial); expor no `GET /execucoes` para a UI mostrar "tentativa N".

- **Resultado Esperado**
  > Cada linha carrega o n.º de tentativas. Métrica: 100% das execuções têm contador correto comparável ao log.

- **Tactic alvo**: Condition Monitoring (detect)
- **Severidade**: P3
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-fault-tolerance-8
- **Métricas de sucesso**:
  - Contador exposto em UI: 0% → 100%
- **Risco de não fazer**: baixo; é coleta de sinal preventivo
- **Dependências**: nenhuma

## 6. Notas do agente

- **Progresso desde a run anterior (2026-06-23-1518)**: vários P0/P1 foram fechados — retry removido das escritas (F-fault-tolerance-1 anterior), anti-drift implementado e testado (F-anterior-4), idempotência viva implementada com viva-check do borderô, write-ahead do `borCod` agora persistido **antes** do handshake (orphan recovery testada em `ReconciliacaoPermutaService.test.ts:362`), `assertNoErpError` lê `messages` mesmo em HTTP 200. A surface area de risco mudou de "double-write por retry" para "cutover sem staging + sem reaper/reconciliação".
- **Métrica de pegada do diff**: `BorderoGestaoService.ts` é novo (366 LOC) com 298 LOC de teste cobrindo os 5 caminhos (excluirBaixa, excluirBordero, finalizar, cancelar, estornar); cobertura de teste boa, mas testes de FALHA-NO-MEIO do loop são fracos (apenas o caminho feliz).
- **Cross-QA**: 
  - F-fault-tolerance-1 (cutover sem staging) impacta **Deployability** (rollback strategy) e **Security** (raio de impacto de uma supply-chain).
  - F-fault-tolerance-4 (Generic.ERROR_MESSAGE) impacta **Integrability** (contrato de erro do ERP) e **Modifiability** (manter o `ERP_MESSAGE_PT` por route não escala).
  - F-fault-tolerance-2/3 (reaper + reconciliação) cruzam com **Availability** (detecção de stuck) e **Testability** (reproduzir partial-failure exige instrumentação).
  - F-fault-tolerance-5 (audit append-only) é a versão financeiro do "audit-trail completeness" cross-cutting da proposta — relevante para **Security** (auditabilidade) e **Testability** (regression tests sobre histórico).
