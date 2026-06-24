---
qa: Fault Tolerance
qa_slug: fault-tolerance
run_id: 2026-06-24-2011
agent: qa-fault-tolerance
generated_at: 2026-06-24T20:11:00-03:00
scope: backend
score: 6.5
findings_count: 8
cards_count: 7
---

# Fault Tolerance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista (clica "Processar" na aba Automáticas com 3 adtos pendentes) | Falha no ERP `fin010` no meio do loop de baixas (3º adto retorna 500) | `confirmarProcessamento` (page.tsx) → `reconciliarAdiantamento` em série → `ReconciliacaoPermutaService.reconciliar` | Produção (escrita habilitada) | Adto 1+2: borderô EM CADASTRO; adto 3: linha `error` na trilha COM borCod registrado; analista vê toast e revisa em Borderôs sem dupla-baixa em retry | 0 duplas-baixas em retry; ≤1 borderô órfão por incidente; 100% das falhas com `bxaCodSeq` ausente são surfaceadas (não somem) |

> "Loop de 3 baixas no `confirmarProcessamento`: a 3ª falha por timeout do `fin010` → o `try/catch` externo (page.tsx:732) aborta o loop, o que deixa 2 borderôs em CADASTRO sem feedback de quais (toast genérico). A trilha (`permuta_alocacao_execucao`) preserva o estado individual; idempotência por par adto↔invoice + `bor_cod` persistido protege contra dupla-baixa em retry — mas se o analista clica de novo, ele vai abrir um NOVO borderô (não reaproveita o em CADASTRO do 1º run)."

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Idempotency por par adto↔invoice na execução fin010 | Sim (chave `permuta:<adto>:<inv>:<atualizadoEm>`) | Sim | ✅ | `ReconciliacaoPermutaService.ts:145`; `PermutaExecucaoRepository.ts:191-224` |
| Write-ahead da intenção antes do POST | `beginExecution` → `reconciling` antes do handshake | Sim | ✅ | `PermutaExecucaoRepository.ts:191-224`; `ReconciliacaoPermutaService.ts:169-176` |
| `borCod` persistido antes dos POSTs do handshake (recuperação de órfão) | `setBorCod` chamado antes do passo 2 | Sim | ✅ | `ReconciliacaoPermutaService.ts:240`; teste `ReconciliacaoPermutaService.test.ts:375-387` |
| Anti-super-pagamento (cap no em-aberto vivo do ERP) | `valorBaixaDesejado > emAbertoErp + tol ⇒ abort` | Sim | ✅ | `ReconciliacaoPermutaService.ts:269-275`; teste `:307-328` |
| Idempotência viva (borderô cancelado/estornado ⇒ libera re-baixa) | `borderoAindaValido` consulta o ERP | Sim | ✅ | `ReconciliacaoPermutaService.ts:496-507`; teste `:231-253` |
| Auto-alocação nova (`autoAlocarSeElegivel`/`autoAlocarDeCasamento`) cobertura de teste | **0 testes** (só mocked como `false` em reconcilation tests) | ≥6 cenários (idempotente, saldo cobre, saldo NÃO cobre, sem casamento, currency-mismatch, casamento stale × live) | ❌ | `AlocacaoPermutasService.test.ts:111-248` (não testa as 2 novas) |
| Compensação no loop de exclusão (`excluirBordero`: itera N `excluirBaixa` antes do `excluirBordero`) | **Sem compensação** — falha mid-loop deixa borderô parcialmente esvaziado no ERP | rollback ou clear marker | ❌ | `BorderoGestaoService.ts:170-180` |
| `updateBorderoCacheSituacao` após cada ação de borderô | Finalizar ✅; Cancelar ✅; **Estornar ❌**; Excluir-baixa ❌ (só limpa o cache se zerou) | 100% | ⚠️ | `BorderoGestaoService.ts:225, 245, 260-272` |
| Loop frontend `confirmarProcessamento` (N adtos sequenciais) com agregação parcial de erro | `try/catch` único externo: 1ª exceção aborta o loop, perde os adtos restantes | per-item try/catch + toast resumo | ⚠️ | `src/frontend/app/permutas/page.tsx:702-739` |
| `removerDaTrilha` libera a permuta sem renomear a chave de idempotência | `deleteByBorCod` (apaga linha) — próxima reconciliação cria CHAVE NOVA e NÃO checa o borderô antigo | renomear/sobrescrever chave OU bloquear se borderô ainda válido no ERP | ❌ | `BorderoGestaoService.ts:199-212`; `PermutaExecucaoRepository.ts:159-164` |
| Sanity checking de envelope ERP (`messages[valid='ERRO']`) | `assertNoErpError` em cada passo | 100% | ✅ | `ReconciliacaoPermutaService.ts:481-489` |
| DLQ / SQS | N/A (Express + Supabase, sem SQS) | — | N/A | — |

> ⚠️ **Não medível localmente**: taxa real de partial-state em produção e duração média entre o borderô criado e a baixa settled. Requer logs em produção (Render) — recomendação: agregar `permuta_alocacao_execucao.status='reconciling'` com `atualizado_em > now() - interval '1 hour'` num job de saúde (stuck-state reaper).

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Substitution | N/A (sem SISPAG/GED ainda — só permutas) | N/A | escopo limitado a permutas |
| Replacement | N/A | N/A | — |
| Predictive Model | Anti-drift: rejeita baixa > em-aberto vivo do ERP | ✅ | `ReconciliacaoPermutaService.ts:269-275` |
| Increase Competence Set | Live re-read da invoice antes de alocar (saldo/taxa/D.I); auto-alocação live no `Baixar` (múltipla automática) | ✅ parcial | `AlocacaoPermutasService.ts:188-200, 328-332`; mas `autoAlocarDeCasamento` usa casamento STALE (`:373-389`) |
| Sanity Checking | Envelope ERP (`valid='ERRO'`); Zod no boundary dos POSTs; round2 (CnxValidatorMny) | ✅ | `ReconciliacaoPermutaService.ts:481-489, 268`; `routes/permutas.ts:26-37` |
| Comparison | Cache de borderôs × ERP via `refreshCache` (botão "Atualizar" / live=true) | ⚠️ parcial | `BorderoGestaoService.ts:403-440` (sem reconciliação automática agendada — só on-demand) |
| Timestamp | `atualizadoEm` da alocação na chave de idempotência (re-alocar = chave nova) | ✅ | `ReconciliacaoPermutaService.ts:145` |
| Timeout | Cross-ref qa-availability — herdado do `ConexosClient` | — | fora do escopo |
| Condition Monitoring | Sem job de "stuck-state reaper" para `status='reconciling'` órfão | ❌ ausente | grep negativo: `grep -rn "reconciling\|stuck" src/backend/lambda src/backend/jobs` → 0 hits |
| Self-Test | N/A | N/A | — |
| Voting | N/A | N/A | — |
| Redundancy | Cache local + ERP (fonte da verdade); trilha local + ERP | ✅ | `permuta_bordero`; `permuta_alocacao_execucao` |
| Recovery — Rollback | N/A (ERP `fin010` não tem rollback de baixa via API; só excluir-baixa) | N/A | decisão arquitetural — forward recovery |
| Recovery — Forward | "Liberação local" via `removerDaTrilha` reabre a permuta p/ re-lançamento manual | ⚠️ parcial | `BorderoGestaoService.ts:199-212` (sem guard contra borderô AINDA VÁLIDO — F-fault-tolerance-1) |
| Reintroduction — Shadow | Dry-run gated por `CONEXOS_WRITE_ENABLED/DRY_RUN` (sem POST, payload logado) | ✅ | `ReconciliacaoPermutaService.ts:115-139` |
| Reintroduction — State Resync | `refreshCache` (live) + `statusPorAdiantamento` (consulta live a cada abertura da tela) | ✅ | `BorderoGestaoService.ts:403-440, 451-509` |
| Escalating Restart | N/A | N/A | — |
| Idempotent Replay | Chave por par adto↔invoice + `atualizadoEm` (ON CONFLICT preserva `settled`) | ✅ | `PermutaExecucaoRepository.ts:201-209` |
| Compensating Transaction | Loop `excluirBordero` SEM compensação no meio (parcial-state) | ❌ ausente | `BorderoGestaoService.ts:154-190` |
| Reconcile | Cache vs ERP só via botão; sem job automático de divergência | ⚠️ parcial | `refreshCache` é manual |
| Quarantine | `markError` registra a falha com `erp_response` cru (analista vê em Borderôs) | ✅ | `ReconciliacaoPermutaService.ts:197-215`; `PermutaExecucaoRepository.ts:280-299` |

## 4. Findings

### F-fault-tolerance-1: `removerDaTrilha` permite dupla-baixa quando o borderô ainda está válido no ERP

- **Severidade**: P0 (crítico — risco de incidente em produção: dupla-baixa do mesmo adto contra a mesma invoice no `fin010`)
- **Tactic violada**: Idempotent Replay; Compensating Transaction
- **Localização**: `src/backend/domain/service/permutas/BorderoGestaoService.ts:199-212`; `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:159-164`; `src/backend/routes/permutas.ts:541-560`
- **Evidência (objetiva)**:
  ```
  // BorderoGestaoService.removerDaTrilha — não consulta o ERP, não bloqueia se o borderô segue válido
  const linhasRemovidas = await this.execucaoRepository.deleteByBorCod(borCod);

  // PermutaExecucaoRepository.deleteByBorCod — DELETE puro (não renomeia)
  `DELETE FROM permuta_alocacao_execucao WHERE bor_cod = $borCod`
  ```
  Caminho de exploração: (1) analista cria borderô X (settled, EM CADASTRO no ERP); (2) chama `DELETE /borderos/X/trilha` (linha apagada); (3) a permuta reabre na UI (omitida do `statusPorAdiantamento`); (4) o analista re-clica "Baixar" → novo `reconciliar` → idempotência checa por `findByIdempotencyKey(key)` → NULL (linha foi deletada) → `beginExecution` cria CHAVE NOVA → novo borderô criado, nova baixa no `fin010`. O borderô antigo continua válido no ERP com a baixa original. **Dupla-baixa concretizada.**
- **Impacto técnico**: pareamento adto↔invoice baixado duas vezes contra o `fin010`; saldo da invoice consumido duas vezes; relatórios contábeis com lançamentos espelhados.
- **Impacto de negócio**: distorce o que aparece como "permutado" no ERP; risco de retrabalho do contábil; potencial recusa do `fin010` na 2ª baixa se já não houver em-aberto (anti-drift do gate 270 protege parcialmente — mas só DEPOIS de criar o borderô novo, deixando lixo de borderô em CADASTRO).
- **Métrica de baseline**: 0 guards contra borderô VÁLIDO no `removerDaTrilha` (mesmo bloco que `borderoAindaValido` existe — não é invocado aqui). Endpoint vivo e sem FE-caller (descoberta passiva via grep): `grep -rn "liberarBorderoDaTrilha\|/trilha" src/frontend → 1 hit em api.ts:355, 0 callers`.

### F-fault-tolerance-2: Loop `confirmarProcessamento` aborta no 1º erro e perde os adtos restantes (frontend)

- **Severidade**: P1 (alto — degrada confiabilidade do "Processar" da aba Automáticas com múltiplos adtos do mesmo processo)
- **Tactic violada**: Containment — Recovery (forward); Sanity Checking
- **Localização**: `src/frontend/app/permutas/page.tsx:702-739`
- **Evidência (objetiva)**:
  ```typescript
  for (const adto of pendentes) {
    const r = await reconciliarAdiantamento(adto.docCod, { dryRun: false })
    // ... agrega contadores ...
  }
  // ... toast ...
  } catch (err) {
    toast.error(`Falha ao processar o processo ${c.priCod}${...}`)
  }
  ```
  Um `throw` no meio do loop (rede caiu, 4xx do backend, timeout) interrompe os adtos restantes; o toast genérico não diz quais foram processados / quais ficaram pendentes; nada é salvo localmente.
- **Impacto técnico**: estado parcial no `fin010` (alguns borderôs criados, outros não); o analista precisa abrir `Borderôs` e cruzar manualmente para descobrir o que falta.
- **Impacto de negócio**: tempo perdido na conferência manual; risco de re-clicar e duplicar borderôs (mitigado pela idempotência server-side, mas confunde o usuário).
- **Métrica de baseline**: 1 único `try/catch` envolvendo N iterações; 0 agregação de erros por item.

### F-fault-tolerance-3: `autoAlocarSeElegivel` e `autoAlocarDeCasamento` sem cobertura de teste

- **Severidade**: P1 (alto — código NOVO que executa escritas DB antes da baixa, sem teste direto)
- **Tactic violada**: Sanity Checking (regression net)
- **Localização**: `src/backend/domain/service/permutas/AlocacaoPermutasService.ts:300-393`; `src/backend/domain/service/permutas/AlocacaoPermutasService.test.ts:111-248`
- **Evidência (objetiva)**:
  ```
  $ grep -rn "autoAlocarSeElegivel\|autoAlocarDeCasamento" src/backend --include="*.test.ts"
  ReconciliacaoPermutaService.test.ts:79: autoAlocarSeElegivel: jest.fn().mockResolvedValue(false),
  ReconciliacaoPermutaService.test.ts:80: autoAlocarDeCasamento: jest.fn().mockResolvedValue(false),
  ```
  Não há teste direto: idempotência (se já alocado → true sem recriar), saldo cobre vs não cobre (`saldoNeg + 1 < somaInvoices` — magic-number 1), `casamento-manual` ÚNICO vs cross-over (`casamManualDoProcesso !== 1`), comportamento quando `alocar` interno lança (loop não tem try/catch — uma falha aborta as outras alocações e deixa a rascunho parcial).
- **Impacto técnico**: regressão silenciosa numa lógica que toca a tabela `permuta_alocacao` ANTES da baixa real; falha na 2ª invoice de uma múltipla automática deixa a primeira alocada e nenhuma das outras → o `reconciliar` continua, abre um borderô só com a primeira → dessincronização entre intenção do analista ("processar TUDO") e execução (1 baixa em vez de N).
- **Impacto de negócio**: lançamentos parciais no `fin010` que parecem completos; analista assume "processado" e o restante fica órfão.
- **Métrica de baseline**: 0 testes para 2 métodos públicos novos com ~100 linhas combinadas (`AlocacaoPermutasService.ts:300-393`).

### F-fault-tolerance-4: `autoAlocarDeCasamento` usa o casamento STALE (não re-lê live antes de criar alocação)

- **Severidade**: P1 (alto — diverge da disciplina de "live re-read" do `autoAlocarSeElegivel` e do `alocar` manual)
- **Tactic violada**: Increase Competence Set (uso de dado stale em decisão de escrita)
- **Localização**: `src/backend/domain/service/permutas/AlocacaoPermutasService.ts:364-393`
- **Evidência (objetiva)**:
  ```typescript
  const casamentos = (await this.relationalRepository.listCasamentos()).filter(
      (c) => c.adiantamentoDocCod === adiantamentoDocCod,
  );
  // ...
  for (const c of casamentos) {
      const valor = c.valorASerUsado;  // ← veio do snapshot da ingestão (pode ser horas atrás)
      if (valor !== undefined && valor > 0) {
          await this.alocar({ ... valorAlocado: valor, ... });
      }
  }
  ```
  O `valorASerUsado` foi computado pelo greedy da eleição usando o em-aberto da invoice **no momento da ingestão**. Se entre a ingestão e o "Processar" o ERP recebeu uma outra baixa (manual no Conexos), o `valorASerUsado` é mais alto que o em-aberto vivo. O `alocar` interno re-lê live (good) e capa o saldo da invoice — mas isso joga o erro do `AlocacaoSaldoError` para o loop, que **não tem try/catch**, e aborta as outras alocações.
- **Impacto técnico**: o gate anti-drift do `ReconciliacaoPermutaService` (linha 269-275) é a última rede; antes dele, a divergência produz `error` no loop e estado parcial na tabela `permuta_alocacao`.
- **Impacto de negócio**: o "Processar" da Automáticas pode falhar parcialmente para um processo cuja invoice acabou de receber baixa no Conexos — sem mensagem clara.
- **Métrica de baseline**: 0 chamadas a `buscarInvoices` (live) no caminho `autoAlocarDeCasamento` (vs. ≥1 em `autoAlocarSeElegivel:329`); 0 try/catch ao redor do `await this.alocar` no for-loop.

### F-fault-tolerance-5: `excluirBordero` (loop de N `excluirBaixa` no ERP) sem compensação

- **Severidade**: P1 (alto — deixa o borderô parcialmente esvaziado no ERP se uma baixa intermediária falhar)
- **Tactic violada**: Compensating Transaction; Recovery — Forward
- **Localização**: `src/backend/domain/service/permutas/BorderoGestaoService.ts:154-190`
- **Evidência (objetiva)**:
  ```typescript
  for (const b of baixas) {
      await this.conexosClient.excluirBaixa({ filCod, borCod, ... });
      // falha aqui ⇒ throw, sai do for, NÃO reverte as anteriores nem chama excluirBordero
  }
  await this.conexosClient.excluirBordero({ filCod, borCod });
  await this.execucaoRepository.deleteByBorCod(borCod);
  await this.execucaoRepository.deleteBorderoCache(borCod);
  ```
- **Impacto técnico**: borderô no ERP com algumas baixas removidas, outras intactas; trilha local intacta (`deleteByBorCod` só roda no final); cache local desatualizado; o operador precisa retomar manualmente. Em retry, o loop tenta de novo as `excluirBaixa` já feitas → ERP responde "não existe" → throw novamente. Caminho de saída: clicar "Excluir baixa" individualmente para cada uma que sobrou.
- **Impacto de negócio**: operação de "excluir borderô inteiro" pode deixar lixo contábil incoerente; analista precisa intervenção manual via Conexos.
- **Métrica de baseline**: 1 loop com 0 try/catch interno em ação que pode ter N=10+ baixas (`BorderoGestaoService.ts:170-180`).

### F-fault-tolerance-6: `estornarBordero` não atualiza o cache (drift visível na UI)

- **Severidade**: P2 (médio — UX degrada por alguns segundos até o próximo refresh; sem risco de dupla-execução)
- **Tactic violada**: State Resync (consistência cache↔ERP)
- **Localização**: `src/backend/domain/service/permutas/BorderoGestaoService.ts:260-272`
- **Evidência (objetiva)**:
  ```typescript
  await this.conexosClient.estornarBordero({ filCod, borCod: params.borCod });
  // ⚠️ falta: updateBorderoCacheSituacao({ borCodEstornado: <novoId> })
  await this.logService.info({ ... });
  ```
  `finalizarBordero` (`:225`) e `cancelarBordero` (`:245`) atualizam o cache. `estornarBordero` é assimétrico.
- **Impacto técnico**: a tela mostra o borderô como FINALIZADO até o próximo "Atualizar"; `statusPorAdiantamento` (que lê live) já reflete, mas a aba de Borderôs (que lê cache) não.
- **Impacto de negócio**: confusão visual; risco do analista clicar duas vezes em "Estornar" → o ERP rejeita o 2º com erro traduzido (mitiga, mas adiciona ruído).
- **Métrica de baseline**: 2 de 3 ações de mutação (finalizar+cancelar) atualizam cache; estornar não. 67% cobertura — alvo 100%.

### F-fault-tolerance-7: Ausência de stuck-state reaper para execuções `reconciling` órfãs

- **Severidade**: P1 (alto — invariante "no work item stuck mid-flow indefinitely" da pauta)
- **Tactic violada**: Condition Monitoring
- **Localização**: `src/backend/` (ausência — grep negativo)
- **Evidência (objetiva)**:
  ```
  $ grep -rn "reconciling.*stuck\|stuck.*reconciling\|find.*reconciling.*older" src/backend
  (sem resultados)
  ```
  Se o processo morrer entre `beginExecution` (status=`reconciling`) e `markSettled`/`markError`, a linha fica indefinidamente em `reconciling` com `bor_cod` set (graças ao `setBorCod` write-ahead). Nada hoje detecta isso (não há job, não há cron). O `statusPorAdiantamento` só considera `status='settled'` (`BorderoGestaoService.ts:458`) → a permuta aparece como pendente, mas se o analista re-baixa, a idempotência **não pula** (a chave existe mas com status `reconciling`, e `beginExecution` faz UPSERT que regrava `reconciling` — não pula).
- **Impacto técnico**: linha `reconciling` órfã + borderô em CADASTRO no ERP (sem baixa concluída pelo nosso fluxo, ou com baixa concluída cuja confirmação se perdeu). Risco de dupla-baixa se a baixa do ERP de fato completou antes do crash (rede caiu na resposta do passo 5) — nesse caso `markSettled` nunca rodou, a chave continua "reconciling", retry vai abrir baixa NOVA contra o mesmo par. Mitigado em parte pelo anti-drift (rejeita se em-aberto já 0), mas não bloqueia se a invoice tem múltiplas parcelas.
- **Impacto de negócio**: incidentes silenciosos que só aparecem na conferência contábil semanal.
- **Métrica de baseline**: 0 jobs de saúde para `status='reconciling' AND atualizado_em < now() - interval '15 minutes'`.

### F-fault-tolerance-8: Cache `permuta_bordero` sem deteção automática de divergência com o ERP

- **Severidade**: P2 (médio — defendível enquanto o usuário tem botão "Atualizar"; piora silenciosamente com o tempo)
- **Tactic violada**: Comparison; Reconcile
- **Localização**: `src/backend/domain/service/permutas/BorderoGestaoService.ts:317-378`
- **Evidência (objetiva)**: a tela carrega do cache local (`listBorderoCache`); refresh ao vivo só com `live=true` (botão manual) ou na ingestão diária (cron). Borderô lançado direto no Conexos (sem trilha) só aparece após o próximo refresh. Cache desatualizado pode esconder estornos feitos diretamente no ERP.
- **Impacto técnico**: a Comparison "cache vs ERP" depende da disciplina humana de clicar "Atualizar"; nada compara periodicamente.
- **Impacto de negócio**: dashboard que "mente" sobre o estado dos borderôs por janelas de 24h.
- **Métrica de baseline**: 1 refresh por ingestão diária + on-demand humano. Alvo: refresh automático em cada navegação para Borderôs (defendível) OU job de reconciliação a cada N horas.

## 5. Cards Kanban

### [fault-tolerance-1] Endurecer `removerDaTrilha` contra dupla-baixa quando o borderô ainda é válido

- **Problema**
  > O endpoint `DELETE /permutas/borderos/:borCod/trilha` apaga a linha da `permuta_alocacao_execucao` sem checar se o borderô ainda está válido no `fin010`. Como a chave de idempotência é deletada (não renomeada), a próxima baixa do mesmo adto cria uma chave nova e o sistema NÃO bloqueia — gerando uma segunda baixa real no ERP contra o mesmo par adto↔invoice. Endpoint vivo, sem caller no FE atual; admin (ou JWT vazado) consegue acionar via curl.
- **Melhoria Proposta**
  > Antes do `deleteByBorCod`, chamar `borderoAindaValido(filCod, borCod)` (já existe em `ReconciliacaoPermutaService.ts:496-507`, extrair para libs). Se VÁLIDO → recusar 409 com "borderô ainda em cadastro/finalizado no ERP — cancele/exclua lá antes". Se INVÁLIDO (cancelado/estornado/removido) → renomear (não deletar) a chave para `:rmtrilha:<borCod>` para preservar histórico e ainda assim impedir dupla-baixa por anti-replay. Adicionar teste cobrindo (a) borderô válido → recusa, (b) borderô cancelado → renomeia, (c) dupla-baixa bloqueada.
- **Resultado Esperado**
  > Cenários de dupla-baixa via `removerDaTrilha`: 1 (atual, lógico) → 0 (impossível por contrato). Chave de idempotência preservada para auditoria pós-evento.
- **Tactic alvo**: Idempotent Replay; Compensating Transaction
- **Severidade**: P0
- **Esforço estimado**: S
- **Findings relacionados**: F-fault-tolerance-1
- **Métricas de sucesso**:
  - Caminhos lógicos de dupla-baixa via `removerDaTrilha`: 1 → 0
  - Cobertura de teste do `removerDaTrilha`: 2 cenários (atuais) → 5 cenários
- **Risco de não fazer**: incidente real de baixa duplicada quando o "modo emergência" for usado em produção; lançamento contábil espelhado que precisa ser estornado manualmente.
- **Dependências**: nenhuma

### [fault-tolerance-2] Loop `confirmarProcessamento` (FE) com per-item try/catch + agregação de erros

- **Problema**
  > O frontend `confirmarProcessamento` (page.tsx:702-739) chama `reconciliarAdiantamento` em série dentro de um único `try/catch`. A 1ª falha (rede, 4xx do backend, timeout) aborta o restante e o toast genérico não diferencia o que foi e o que faltou. Adtos posteriores ficam sem feedback.
- **Melhoria Proposta**
  > Envolver cada `await reconciliarAdiantamento` em try/catch individual; agregar `{settled, erros: [{docCod, mensagem}], dryRun, borderos}` e renderizar um `toast.error` com a lista dos que falharam + `toast.success` com os que passaram (já é o padrão para o resultado settled vs erros, falta para a EXCEÇÃO da chamada).
- **Resultado Esperado**
  > Processar 3 adtos com falha no 2º: 1 settled + 1 erro reportado por nome + 1 NÃO interrompido → 2 settled + 1 erro. Cobertura: todos os adtos sempre tentados; estado parcial sempre visível ao analista.
- **Tactic alvo**: Containment — Forward Recovery; Sanity Checking
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-fault-tolerance-2
- **Métricas de sucesso**:
  - Adtos processados / adtos pendentes em runs com falha intermediária: parcial → 100%
  - Toasts informativos por adto com erro: 0 → 1 por item
- **Risco de não fazer**: na primeira vez que o `fin010` der hiccup no meio de uma rodada, o analista perde 30+ min reconciliando manualmente.

### [fault-tolerance-3] Testar `autoAlocarSeElegivel` e `autoAlocarDeCasamento` (cobertura zero)

- **Problema**
  > Os dois novos métodos públicos (`AlocacaoPermutasService.ts:300-393`) que criam alocações automaticamente antes da baixa não têm um único teste direto — só são mockados como `false` nos testes de reconciliação. Lógica delicada (idempotência, saldo cobre vs não, único casamento-manual do processo) não validada.
- **Melhoria Proposta**
  > Adicionar `AlocacaoPermutasService.test.ts` com ≥8 cenários: idempotente quando já alocado; segue manual quando não é casamento-manual; segue manual quando há >1 casamento-manual no processo; cria N alocações quando saldo cobre; segue manual quando saldo NÃO cobre (com magic-number 1 documentado ou substituído por tolerância derivada do valor); `autoAlocarDeCasamento` sem casamento → false; `autoAlocarDeCasamento` cria alocações pelos `valorASerUsado`; uma falha do `alocar` interno é PROPAGADA (ou trata com try/catch — definir contrato).
- **Resultado Esperado**
  > Cobertura de teste dos dois métodos: 0 → ≥8 cenários. Magic-number `+ 1` em `AlocacaoPermutasService.ts:337` documentado ou substituído por tolerância derivada (`Math.max(1, somaInvoices * 0.005)`).
- **Tactic alvo**: Sanity Checking; Increase Competence Set
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-fault-tolerance-3, F-fault-tolerance-4
- **Métricas de sucesso**:
  - Cobertura: 0 → ≥8 cenários
  - Documentação ou substituição do magic-number `+ 1`: pendente → resolvido
- **Risco de não fazer**: regressão silenciosa numa lógica de pre-write; bug que só vira incidente quando a forma do casamento mudar.

### [fault-tolerance-4] `autoAlocarDeCasamento`: live re-read antes de criar alocação + try/catch no loop

- **Problema**
  > O método usa o `valorASerUsado` do snapshot (potencialmente stale por horas), e o loop não tem try/catch — falha numa invoice deixa as anteriores alocadas e aborta as restantes. Diverge da disciplina aplicada em `autoAlocarSeElegivel` (que re-lê live via `buscarInvoices`).
- **Melhoria Proposta**
  > Antes do loop, chamar `buscarInvoices(adto.priCod, adto.filCod, adto.docCod)` e ajustar `valorASerUsado` ao `min(valor, disponivelLive)` por invoice. Envolver cada `await this.alocar(...)` em try/catch — agregar erros num retorno estruturado em vez de propagar (o caller `reconciliar` decide se prossegue para a baixa só com as alocações que deram certo). Logar warn em cada divergência stale × live para visibilidade.
- **Resultado Esperado**
  > Divergências stale-snapshot × live-ERP: detectadas e capped em vez de explodir como erro. Estado parcial na `permuta_alocacao` em runs de "Processar" com Conexos lateralmente mexido: 0.
- **Tactic alvo**: Increase Competence Set; Containment — Forward Recovery
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-fault-tolerance-3, F-fault-tolerance-4
- **Métricas de sucesso**:
  - Chamadas live a `buscarInvoices` por execução de `autoAlocarDeCasamento`: 0 → 1
  - Try/catch por iteração no loop: 0 → 1
- **Risco de não fazer**: "Processar" da aba Automáticas se torna instável quando o time financeiro lança algo no Conexos entre a ingestão e o clique.

### [fault-tolerance-5] Compensação no `excluirBordero` (best-effort com marcador de estado parcial)

- **Problema**
  > O loop `for (const b of baixas) { await excluirBaixa(...) }` em `BorderoGestaoService.ts:170-180` pode falhar no meio, deixando o borderô parcialmente esvaziado no ERP e a trilha intacta (`deleteByBorCod` só roda depois). Retry repete chamadas que já passaram (ERP responde "não existe" → throw).
- **Melhoria Proposta**
  > (a) Try/catch por iteração; acumular falhas. (b) Se faltou ≥1 baixa, NÃO chamar `excluirBordero` e marcar a trilha com flag `parcial_delete_em_curso` (nova coluna opcional ou via `erro_mensagem`). (c) Retornar para o caller `{baixasExcluidas, baixasFalha}` em vez de simplesmente lançar. (d) Tornar a operação idempotente: filtrar do loop as baixas que o ERP responde 404 (tratar como já-feito) — não rethrow.
- **Resultado Esperado**
  > Falha intermediária no loop: estado parcial visível, retry seguro. Operação 100% idempotente em retry.
- **Tactic alvo**: Compensating Transaction; Idempotent Replay
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-fault-tolerance-5
- **Métricas de sucesso**:
  - Retries de `excluirBordero` em estado parcial: throw → no-op idempotente
  - Visibilidade de estado parcial: 0 → marcador na trilha + retorno estruturado
- **Risco de não fazer**: lixo contábil no ERP que requer intervenção manual; suporte recorrente.

### [fault-tolerance-6] `estornarBordero` deve atualizar o cache local (simetria com finalizar/cancelar)

- **Problema**
  > `BorderoGestaoService.estornarBordero` (`:260-272`) é a única ação de mutação que NÃO chama `updateBorderoCacheSituacao` após o POST no ERP. A tela mostra o borderô como FINALIZADO até o próximo refresh manual.
- **Melhoria Proposta**
  > Após o POST do estorno, chamar `updateBorderoCacheSituacao(borCod, { borCodEstornado: <retornoDoErp ?? -1> })` (o `-1` como sentinela "estornado, id desconhecido" é suficiente porque o `situacaoDoItem` só checa `!= null`). Adicionar teste cobrindo a chamada do `updateBorderoCacheSituacao`.
- **Resultado Esperado**
  > Estornar reflete imediatamente na lista (UI mostra ESTORNADO sem refresh). Simetria com finalizar/cancelar restaurada.
- **Tactic alvo**: State Resync
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-fault-tolerance-6
- **Métricas de sucesso**:
  - Ações de mutação que atualizam o cache: 2/3 → 3/3
- **Risco de não fazer**: confusão visual recorrente; suporte intermitente.

### [fault-tolerance-7] Stuck-state reaper: job que detecta `permuta_alocacao_execucao.status='reconciling'` órfão

- **Problema**
  > Não há job que detecte execuções deixadas em `reconciling` por mais de N minutos (crash, timeout no passo 5 do handshake antes do `markSettled`). Em retry, a chave existe mas com `status='reconciling'` → `beginExecution` faz UPSERT (não pula) → risco de dupla-baixa se o `gravarBaixaPermuta` original tiver completado no ERP mas a resposta foi perdida.
- **Melhoria Proposta**
  > Job/endpoint que: (1) busca rows `status='reconciling' AND atualizado_em < now() - interval '15 minutes' AND bor_cod IS NOT NULL`; (2) consulta no ERP `getBordero(bor_cod)` e `listBaixas({borCod})` para ver se a baixa do par já existe; (3a) se a baixa existe no ERP → `markSettled` com o `bxaCodSeq` do ERP (cura idempotência); (3b) se NÃO existe e o borderô está EM CADASTRO → `markError` com "execução abandonada — re-execute"; (3c) emite log/alerta. Frequência: 15min (Express atual = endpoint admin chamado por cron externo / botão).
- **Resultado Esperado**
  > Execuções órfãs em `reconciling`: até janela de 15min, automaticamente curadas. Cenário de dupla-baixa "resposta perdida no passo 5": eliminado.
- **Tactic alvo**: Condition Monitoring; Reconcile
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-fault-tolerance-7
- **Métricas de sucesso**:
  - MTTR para execução em `reconciling` órfã: indefinido → ≤30min
  - Cenários de dupla-baixa cobertos pela idempotência: + 1 (resposta perdida no passo 5)
- **Risco de não fazer**: o primeiro hiccup de rede entre o passo 5 e o nosso `markSettled` cria uma janela de dupla-baixa silenciosa.
- **Dependências**: pode ser implementado como endpoint admin invocado por cron externo (Render → /admin/permutas/health) até que haja jobs nativos.

## 6. Notas do agente

- Não há card específico para F-fault-tolerance-8 (cache vs ERP drift): coberto operacionalmente pela cadência diária de ingestão + botão "Atualizar". Promover a card só se virar uma queixa recorrente.
- Cross-QA: **F-fault-tolerance-1** sobrepõe-se a **qa-security** (endpoint vivo sem caller no FE é confused-deputy potencial — alertar o consolidator). **F-fault-tolerance-3 e 4** sobrepõem-se a **qa-testability** (cobertura nula em métodos públicos novos). **F-fault-tolerance-7** sobrepõe-se a **qa-availability** (stuck-state = ausência de health-check operacional).
- Métrica não medível localmente: taxa real de execuções `reconciling` órfãs em produção — depende de logs do Render; recomendação no card 7.
- O write-ahead (`beginExecution` antes do POST) + `setBorCod` antes do handshake + idempotência viva (`borderoAindaValido`) cobre MUITO bem o caminho feliz e a maior parte dos erros — o score 6.5 reflete a maturidade desse core, descontando a regressão pontual do `removerDaTrilha` (F-1, P0) e a cobertura nula dos novos métodos auto-alocação (F-3/4, P1).
