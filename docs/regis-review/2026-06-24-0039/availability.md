---
qa: Availability
qa_slug: availability
run_id: 2026-06-24-0039
agent: qa-availability
generated_at: 2026-06-24T00:39:00-03:00
scope: all
score: 6
findings_count: 7
cards_count: 7
---

# Availability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista (clique único em "Reconciliar") + integrações externas (Conexos Cloud + Supabase) | Falha transitória OU timeout-pós-sucesso durante o handshake `fin010` (5 chamadas) que executa a BAIXA/PERMUTA + ações de gestão de borderô (finalizar/estornar/cancelar/excluir) | `ReconciliacaoPermutaService`, `BorderoGestaoService`, `ConexosClient` (fin010 writes), Render (instância única, free tier, spin-down ≥50s), Conexos (cap MAX_SESSIONS=3) | Operação normal + período diário de baixas (≤50 borderôs/dia, ≤200 baixas; ações de gestão executadas dentro do mesmo dia para corrigir antes de aprovar) | (a) NUNCA gravar baixa duplicada (par já settled é skipped via idempotency key + verificação viva de borderô); (b) borCod é persistido ANTES dos POSTs do handshake para evitar baixa órfã; (c) erro irrecuperável marca `error` para reconciliação manual; (d) falha de UMA filial na listagem não derruba a tela | 0% de baixas duplicadas; 100% das execuções com `bor_cod` persistido antes do passo 2; MTTR manual ≤ 1 dia útil (tempo de o analista abrir a aba "Borderôs" e estornar/excluir). Indisponibilidade aceita por janela de spin-down ≤ 50s/cold-start, 1×/dia |

> Cenário concreto recente (sonda real 2026-06-23, base do diff): timeout no POST `fin010/baixas` após o ERP gravar → retry ingênuo geraria 2 `bxaCodSeq` na mesma invoice (super-pagamento). A escolha arquitetural é **single-attempt no write** (RetryExecutor REMOVIDO de `criarBordero` e `gravarBaixaPermuta`) + idempotência via `permuta_alocacao_execucao.idempotency_key` + auto-cura quando o borderô some/é cancelado/estornado no ERP (libera relançamento).

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Escritas `fin010` SEM RetryExecutor (anti-dupla baixa) | 7/7 writes single-attempt (`criarBordero`, `gravarBaixaPermuta`, `excluirBaixa`, `excluirBordero`, `finalizarBordero`, `cancelarBordero`, `estornarBordero`) | 100% writes não-idempotentes single-attempt | ✅ | `ConexosClient.ts:1011,1136,1160,1175,1190,1205,1381` |
| Leituras `fin010` COM RetryExecutor | 3/3 leituras retry'd (`listBaixas`, `listBorderos`, validações 2/3/4 do handshake) | Leituras retry'd; `getBordero` justificadamente sem retry (N×por linha) | ✅ | `ConexosClient.ts:1097,1227,1276,1310,1343` |
| `getBordero` sem retry (best-effort, fail-fast) | sem retry (justificado: N×por linha na listagem; relogin/timeout × N derruba a tela) | sem retry + UI mostra INDISPONIVEL + botão Atualizar | ✅ | `ConexosClient.ts:1044-1074` |
| Idempotência cross-execução do write `fin010` | chave `permuta:{adto}:{invoice}:{atualizadoEm}` + `findByIdempotencyKey` + check vivo via `borderoAindaValido` | unique key persistida ANTES do POST; libera quando borderô some no ERP | ✅ | `ReconciliacaoPermutaService.ts:125-147,476-487`; `PermutaExecucaoRepository.ts:180-213` |
| Persistência de `bor_cod` antes do handshake (anti-órfão) | `setBorCod(key, borCod)` chamado ANTES dos passos 2-5 | sempre antes do passo 2 | ✅ | `ReconciliacaoPermutaService.ts:220`; `PermutaExecucaoRepository.ts:216-223` |
| Degradação graciosa multi-filial (catch→[]) | 1 ponto: `listarBorderos` engole erro POR filial, loga `BUSINESS_WARN`, segue com outras filiais | falha parcial isolada por filial | ✅ | `BorderoGestaoService.ts:296-307` |
| % arquivos de IO externo wrapped em Executor (backend, sem testes) | 4 arquivos com Executor / 2 com axios direto (`ConexosClient`, `BcbClient`, `services/conexos.ts`, `RetryExecutor`) → 100% do IO Conexos coberto via `RetryExecutor`/legacy `authenticatedPost` | ≥80% | ✅ | `grep -l RetryExecutor src/backend` |
| Timeout explícito em clientes externos | 2/2: Conexos `40000ms` (`services/conexos.ts:81`), BCB `10000ms` (`BcbClient.ts:57`) | 100% | ✅ | grep `timeout` |
| Conexos `MAX_SESSIONS` cap + mitigation | cap=3 sessões simultâneas; `login()` com mutex `loginPromise` (anti-paralelismo) + auto-`sessionToKill` da sessão mais antiga | mutex local **POR INSTÂNCIA** — não cobre múltiplas instâncias | ⚠️ | `services/conexos.ts:73-197` |
| Topologia de redundância backend | 1 instância Render (single-AZ, free tier com spin-down ≥50s após inatividade) | ≥2 instâncias OU spin-down ≤ janela de uso | ❌ | `render.yaml:5-17`; `_shared-metrics.md` |
| Health-check endpoint | `GET /health → {status:'ok', version}` configurado em `healthCheckPath: /health` no Render | endpoint + monitor externo independente | ⚠️ | `render.yaml:22`; `src/backend/index.ts:65` |
| Pre-deploy gate (migrate + seed antes do switch) | `npm run migrate && npm run seed:admin` no `preDeployCommand`; falha NÃO promove | gate executado antes do switch | ✅ | `render.yaml:21` |
| Rate limit em rotas que disparam writes Conexos | global 100/min/IP + `heavyRouteLimiter` 10/min/IP em `/reconciliar`, `/borderos/*` | configurado | ✅ | `http/rateLimit.ts:11-25`; `routes/permutas.ts:117,387,424,453,482,511,540` |
| Concorrência fan-out limitada (Conexos) | `BoundedConcurrency` default `limit=3` — alinhado ao cap MAX_SESSIONS | ≤ MAX_SESSIONS | ✅ | `BoundedConcurrency.ts:36,40` |
| Catches silenciosos em paths críticos | 1 catch silencioso identificado: `borderoAindaValido` `catch {}` → `return true` (conservador, documentado) | catches falam alto OU justificativa explícita | ✅ | `ReconciliacaoPermutaService.ts:484-486` |
| Monitor/alarm externo (off-Render) | ausente — sem Sentry, CloudWatch, healthcheck.io ou ping externo | ≥1 monitor independente alertando | ❌ | `grep -i "sentry\|alert\|alarm" src/backend` → 0 hits |

> ⚠️ **Não medível localmente**: MTTR real e taxa real de falha por endpoint do `fin010`. Requer instrumentação em produção (Render Logs query OU APM). Recomendação: emitir uma métrica de "permuta_exec_outcome{status=settled|error|skipped}" via `LogService` e plugar um pipeline (Render Log Stream → BetterStack/Logtail ou Sentry) que conte falhas em janela de 15 min — alertar quando `error_rate > 5%` por mais de 2 janelas seguidas, e quando `bor_cod IS NULL AND status='reconciling'` durar > 15min (órfão).

> ⚠️ **Não medível localmente**: SLO real de uptime do backend (free tier Render dorme após inatividade). Recomendação: instrumentar ping externo a cada 4 min em horário comercial (UptimeRobot/cron-job.org gratuito) — basta `GET /health` para manter quente.

## 3. Tactics — Cobertura no nf-projects

### Detect Faults

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Ping/Echo | `GET /health` retorna `{status, version}`; Render usa como `healthCheckPath` durante o switch | ⚠️ parcial | `src/backend/index.ts:65`; `render.yaml:22` (sem monitor externo após o deploy) |
| Heartbeat | ausente — sem heartbeat backend→Conexos (não existe canal pull-only do ERP) | N/A | escrita é triggered-by-user; não há fluxo subscrito |
| Monitor | ausente (sem Sentry/CloudWatch/Logtail) — só `console.log/error` no Render dashboard | ❌ ausente | `grep -i sentry/alarm src/backend → 0` |
| Timestamp | `criado_em`/`atualizado_em` em `permuta_alocacao_execucao`; `borDtaMvto`/`borDtaFinalizado` lidos do ERP | ✅ presente | `PermutaExecucaoRepository.ts:290-309`; `ConexosClient.ts:1057-1067` |
| Sanity Checking | `assertNoErpError` lê envelope `{messages:[{valid:'ERRO'}]}` (HTTP 200 com ERRO passaria batido); anti-drift "baixa > em-aberto vivo do ERP" aborta em vez de super-pagar; `assertWriteEnabled` bloqueia escrita por flag | ✅ presente | `ReconciliacaoPermutaService.ts:230-254,461-469`; `BorderoGestaoService.ts:238-243` |
| Condition Monitoring | `borderoAindaValido` confirma estado VIVO (em cadastro/finalizado vs. cancelado/estornado/removido) antes de bloquear/liberar relançamento | ✅ presente | `ReconciliacaoPermutaService.ts:476-487` |
| Voting | N/A — não há réplicas concorrentes para comparar | N/A | arquitetura single-instance |
| Exception Detection | `ConexosError` tipado com `endpoint`/`priCod`/`cause`; `friendlyErpMessage` traduz códigos do ERP (`FIN_IMPOSSIVEL_ALTERAR_REGISTRO` etc.); rota tem `erpErrorMessage` separado | ✅ presente | `ConexosClient.ts:428,1031,1072,1392`; `ReconciliacaoPermutaService.ts:498-511`; `routes/permutas.ts:44-61` |
| Self-Test | ausente — sem self-test de boot do client Conexos (login dry-run) | ❌ ausente | sem hits |

### Recover from Faults — Preparation and Repair

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Active Redundancy | ausente — instância única Render free tier (spin-down ≥50s) | ❌ ausente | `render.yaml`; shared-metrics |
| Passive Redundancy | ausente — sem standby | ❌ ausente | mesmo |
| Spare | `preDeployCommand` roda migrate+seed e só switcha se passar (o "spare" é a release anterior, que continua no ar até o gate verde) | ⚠️ parcial | `render.yaml:21` (sem health-gate explícito após o switch) |
| Exception Handling | `try/catch → throw new ConexosError`; `markError(key, ...)` persiste a falha + payload cru para reconciliação manual | ✅ presente | `ConexosClient.ts:1031,1072,...`; `ReconciliacaoPermutaService.ts:176-195` |
| Rollback | parcial: trilha local sobe pra `error` (não regride `settled`); o ESTORNO é uma ação 1-clique na aba Borderôs (chama `fin010/estornar/{borCod}`), volta o borderô finalizado para `EM_CADASTRO`. Sem rollback ATÔMICO multi-baixa (se a 3ª de 5 baixas falha, as 2 anteriores ficam settled — analista estorna no front) | ⚠️ parcial | `BorderoGestaoService.ts:222-235`; `ConexosClient.ts:1205-1214` |
| Software Upgrade | Render auto-deploy on push to `main` + gate `pre-deploy`; CHANGELOG.md mantido; sem canary | ⚠️ parcial | `render.yaml:17-21` |
| Retry | retries só em LEITURAS (`RetryExecutor` 2 retries / 500ms / jitter 200ms) — explicitamente PROIBIDO em writes `fin010` (decisão arquitetural Regis 2026-06-23) | ✅ presente | `ConexosClient.ts:407-412,1097,1227,1276,1310,1343`; comentário em `ConexosClient.ts:1005-1010,1375-1380` |
| Ignore Faulty Behavior | `listarBorderos` engole erro POR filial e segue (1 filial fora ≠ tela vazia) | ✅ presente | `BorderoGestaoService.ts:296-307` |
| Degradation | `BorderoGestaoService.excluirBaixa` segue mesmo se o `excluirBordero` best-effort falhar (a baixa já saiu, só fica um borderô vazio no ERP); `borderoAindaValido` cai em "conservador=válido" se a leitura falha | ✅ presente | `BorderoGestaoService.ts:109-122`; `ReconciliacaoPermutaService.ts:484-486` |
| Reconfiguration | `CONEXOS_WRITE_ENABLED=false` / `CONEXOS_DRY_RUN=true` permite degradar o sistema para read-only sem deploy (já validado: env-var no Render dashboard) | ✅ presente | `render.yaml:36-39`; `BorderoGestaoService.ts:238-243`; `ReconciliacaoPermutaService.ts:96-98` |

### Recover from Faults — Reintroduction

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Shadow | ausente — `DRY-RUN` é shadow de payload (loga sem POST), não de tráfego | ⚠️ parcial | `ReconciliacaoPermutaService.ts:104-118` |
| State Resynchronization | `borderoAindaValido` re-sincroniza o estado local com o vivo do ERP (settled stale + borderô removido → libera relançamento); `listarBorderos` é fonte autoritativa = ERP | ✅ presente | `ReconciliacaoPermutaService.ts:127-147,476-487`; `BorderoGestaoService.ts:278-307` |
| Escalating Restart | ausente — Render free tier reinicia o processo (cold start ≥50s) e ponto | ❌ ausente | infra |
| Non-Stop Forwarding | N/A — sem balanceador/instâncias paralelas | N/A | single-instance |

### Prevent Faults

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Removal from Service | implícito: `CONEXOS_WRITE_ENABLED=false` tira a escrita de circulação sem derrubar o serviço | ✅ presente | `render.yaml:36-39` |
| Transactions | escritas no `fin010` NÃO são transacionais (5 POSTs sequenciais sem 2PC); no Postgres local: cada `markSettled`/`markError`/`setBorCod` é update atômico, MAS sem transação cross-step do handshake. Persistir `bor_cod` ANTES do passo 2 mitiga, não elimina | ⚠️ parcial | `ReconciliacaoPermutaService.ts:208-339`; `PermutaExecucaoRepository.ts:216-288` |
| Predictive Model | ausente — sem modelo preditivo de falha (esperado p/ o estágio) | N/A | nada de ML/SRE-preditivo |
| Exception Prevention | `MissingFilCodError` ao montar headers (Rule #8); validação Zod no boundary (`reconciliarBodySchema`, `processarBodySchema`); `round2` em todo valor monetário (anti-`CnxValidatorMny`); UPPERCASE em descrição (anti-`CnxValidatorDescr`) | ✅ presente | `services/conexos.ts:320-323`; `routes/permutas.ts:26-37`; `ReconciliacaoPermutaService.ts:22-23,426` |
| Increase Competence Set | `friendlyErpMessage` mapeia códigos do ERP para mensagens PT acionáveis (analista entende sem ler trace) | ✅ presente | `ReconciliacaoPermutaService.ts:498-511`; `routes/permutas.ts:44-61` |

## 4. Findings (achados)

### F-availability-1: Sem monitor/alarm externo — falhas no `fin010` só aparecem se o analista vier reclamar

- **Severidade**: P1
- **Tactic violada**: Monitor (Detect Faults); Ping/Echo (sem health-check externo)
- **Localização**: ausente — `grep -i "sentry\|alarm\|cloudwatch\|logtail" src/backend → 0` ; `render.yaml` sem `notifications:` configuradas
- **Evidência (objetiva)**:
  ```
  $ grep -rn "monitor\|alert\|alarm\|Slack\|sentry" src/backend --include="*.ts" | grep -v test
  # 0 hits relevantes (1 match em comentário de seed-admin)
  $ render.yaml não declara monitor externo nem notification channels
  ```
- **Impacto técnico**: erros `error` na trilha de execução, `bxaMnyValor` rejeitado por precisão, indisponibilidade do Conexos em batch de baixas — todos invisíveis até o analista checar a aba "Borderôs" no dia seguinte. Pior: spin-down do Render (free tier) faz a 1ª request da manhã esperar ≥50s e pode falhar por timeout do front (axios default 0 / fetch default browser ~300s, ok; mas timeout do `axios.create` interno = 40s pra Conexos pode disparar antes do cold start estabilizar pool).
- **Impacto de negócio**: SLA implícito da operação financeira é "baixas do dia, mesmo dia". Sem monitor, um dia inteiro de baixas pode ficar `error` e só ser percebido na conciliação do dia seguinte (D+1) — retrabalho manual no ERP + risco de fechamento contábil bloqueado.
- **Métrica de baseline**: 0 alertas configurados; 0 dashboards de erro; tempo médio até detecção (TMTD) ≈ ciclo de revisão do analista = 1 dia útil.

### F-availability-2: Render free tier — instância única, spin-down ≥50s, sem redundância

- **Severidade**: P1
- **Tactic violada**: Active Redundancy / Passive Redundancy (Recovery — Preparation and Repair)
- **Localização**: `render.yaml:5-17` (1 service, plan starter declarado mas operação em free tier conforme `_shared-metrics.md`)
- **Evidência (objetiva)**:
  ```
  services:
    - type: web
      name: financeiro-backend
      plan: starter        # operado como free tier — vide _shared-metrics.md L46
  # 1 instância, single-region, sem standby. healthCheckPath define gate de switch, não failover.
  ```
- **Impacto técnico**: durante o cold-start (≥50s), 100% das requisições enfileiram OU falham. Um deploy ou reinício durante o expediente trava toda a operação por 1-2 min. Não há failover — se o nó do Render cai, o serviço cai junto.
- **Impacto de negócio**: janelas de indisponibilidade visíveis ao analista (ele vê a tela quebrada, abre chamado). Em pico de fechamento (último dia útil do mês — várias baixas), 1 min de fila no cold start pode disparar timeouts no axios (40s) ou no front (rede do cliente).
- **Métrica de baseline**: 1 instância; ≥50s de cold-start observado; 0 réplicas; janela diária de spin-down ocorre toda noite (≥6h sem tráfego).

### F-availability-3: Mutex `MAX_SESSIONS=3` é por instância — vira P0 quando houver mais de uma

- **Severidade**: P2 (hoje 1 instância; viraria P0 se escalarmos para 2+ sem mover o mutex pra fora do processo)
- **Tactic violada**: Reconfiguration (limite de recurso compartilhado fora do reach do código)
- **Localização**: `src/backend/services/conexos.ts:73-197` (mutex `loginPromise` em memória)
- **Evidência (objetiva)**:
  ```
  // Linha 76: private loginPromise: Promise<void> | null = null;
  // Linha 128-138: if (this.loginPromise && !sessionToKill) return this.loginPromise;
  // → mutex local; 2 instâncias = 2 mutexes independentes → ambos logam → MAX_SESSIONS=3 vira corrida
  ```
- **Impacto técnico**: ao escalar pra 2+ instâncias (saída do free tier OU Render scale), o cap=3 do Conexos vira gargalo: cada instância pode abrir 3 sessões, mas o cap é por usuário. O auto-`sessionToKill` da sessão mais antiga vira ping-pong (instância A mata sessão de B, B mata de A).
- **Impacto de negócio**: bloqueio cruzado de baixas no momento em que mais precisamos escalar (pico de fechamento mensal). Hoje convive porque é 1 instância — risco materializa no exato dia em que tirarmos o free tier.
- **Métrica de baseline**: 1 mutex/instância × N instâncias × cap=3 sessões = ⌊3/N⌋ sessões úteis por instância (= 1 ou 0 quando N≥3).

### F-availability-4: Handshake `fin010` (5 POSTs) sem transação — partial-success possível

- **Severidade**: P1
- **Tactic violada**: Transactions (Prevent Faults); Rollback (Recovery)
- **Localização**: `ReconciliacaoPermutaService.ts:208-339` (loop `for (const aloc of alocacoes)` chama `criarBordero` 1× + `executarBaixa` N× cada com 4 POSTs)
- **Evidência (objetiva)**:
  ```
  for (const aloc of alocacoes) {
      if (borCod === undefined) { borCod = (await criarBordero(...)).borCod }
      try { await executarBaixa({ key, borCod, filCod, aloc }); }
      catch (err) { markError(...); continue; }
  }
  // Cenário: 5 alocações, 3 settled, 4ª dá ConexosError no passo 5 → 3 baixas dentro do borderô + 2 erradas
  ```
- **Impacto técnico**: o ERP NÃO oferece rollback atômico do borderô + baixas. Quando a 4ª de 5 falha, o borderô tem 3 baixas settled — para o analista corrigir, precisa abrir a aba Borderôs, identificar a alocação errada, excluir a baixa OU estornar o borderô inteiro e refazer.
- **Impacto de negócio**: trabalho manual de conciliação proporcional à taxa de falha do handshake. A boa notícia: a Fase 3.1 (este diff) FORNECE essa UI; a má é que ela depende do analista perceber. Sem dashboard de "borderôs com erro no dia", uma falha parcial pode ficar dias até ser conciliada.
- **Métrica de baseline**: 0% de transação atômica multi-baixa; 100% das falhas multi-baixa requerem conciliação manual. (Não-medível localmente: taxa real de partial-success — requer query da prod ou simulação.)

### F-availability-5: `borderoAindaValido` cai em "válido=true" quando a leitura falha (decisão correta, mas oculta deriva)

- **Severidade**: P2
- **Tactic violada**: Exception Detection (decisão conservadora documentada — risco residual de stale lock infinito)
- **Localização**: `ReconciliacaoPermutaService.ts:484-486`
- **Evidência (objetiva)**:
  ```typescript
  } catch {
      return true; // incerto → conservador (bloqueia re-baixa)
  }
  ```
- **Impacto técnico**: se o `getBordero` falha persistentemente (rede off ou bug no `fin010/{filCod}/{borCod}`), uma alocação com `settled` antigo NUNCA libera relançamento — o usuário vê "skipped" sem entender por quê. A escolha é correta (evita dupla baixa), mas precisa de OBSERVABILIDADE (log estruturado + métrica de "skipped por borderoAindaValido falhou").
- **Impacto de negócio**: deriva silenciosa. Em jornadas longas (semanas) sem revisão da trilha de execução, baixas legítimas ficam represadas como `skipped`.
- **Métrica de baseline**: 0 logs neste catch (catch silencioso); contador atual da deriva = "não observável".

### F-availability-6: `gravarBaixaPermuta` sem retry deliberado — bom; mas timeout-pós-sucesso ainda pode acontecer e cria órfão

- **Severidade**: P2
- **Tactic violada**: State Resynchronization (cobertura parcial — `bor_cod` persistido, mas `bxa_cod_seq` não-sabido fica como `reconciling` indefinido)
- **Localização**: `ReconciliacaoPermutaService.ts:316-329`; `ConexosClient.ts:1381-1394`
- **Evidência (objetiva)**:
  ```typescript
  // ConexosClient.ts:1006-1010: SEM RetryExecutor (correto). MAS:
  // Cenário: POST /fin010/baixas → ERP processa e grava bxaCodSeq → timeout do client antes do 200 chegar
  // → trilha fica em 'reconciling' com bor_cod setado mas bxa_cod_seq=null PARA SEMPRE
  // → idempotency_key bloqueia relançamento (já existe linha)
  ```
- **Impacto técnico**: o registro fica em `reconciling` órfão até intervenção manual. A função `borderoAindaValido` só roda quando há `settled`; `reconciling` órfão não é re-checado.
- **Impacto de negócio**: baixa REALMENTE foi gravada no ERP, mas a UI mostra como "em andamento" / o analista não consegue concluir o adto via UI. Manual: DBA/admin precisa abrir psql, identificar a linha, decidir manualmente settled vs. error.
- **Métrica de baseline**: 0 mecanismo automatizado de re-check para status `reconciling` mais antigo que X minutos. Tempo de espera até intervenção = não-monitorado.

### F-availability-7: Sem self-test de boot do client Conexos (descoberta tarde de credencial expirada)

- **Severidade**: P3
- **Tactic violada**: Self-Test (Detect Faults)
- **Localização**: `services/conexos.ts:199-203` (`ensureSid` lazy — só chama `login` na primeira request)
- **Evidência (objetiva)**:
  ```typescript
  async ensureSid() {
      if (!this.sid || (this.sidExpiresAt && Date.now() > this.sidExpiresAt)) {
          await this.login();
      }
  }
  // → 1ª request do dia descobre se a senha do ERP expirou (e falha)
  ```
- **Impacto técnico**: senha rotacionada no ERP sem atualizar `CONEXOS_PASSWORD` no Render → 1ª request da manhã do analista falha com 401.
- **Impacto de negócio**: 1ª baixa do dia trava + suporte é acionado. Detectável proativamente com um boot probe.
- **Métrica de baseline**: 0 self-test; tempo médio até detectar credencial expirada = janela até a 1ª request do dia.

## 5. Cards Kanban

### [availability-1] Plugar monitor externo + alerta de "fin010 error rate"

- **Problema**
  > Falhas do handshake `fin010` (status `error` em `permuta_alocacao_execucao`), spin-down do Render, e cold-start lento só são percebidos quando o analista abre a aba "Borderôs" — TMTD ≈ 1 dia útil. Sem Sentry/Logtail/CloudWatch ligado, um dia inteiro de baixas pode falhar silenciosamente.
- **Melhoria Proposta**
  > Tactic: **Monitor** (Detect Faults). Plugar Sentry SDK (`@sentry/node`) no `index.ts` para capturar `ConexosError` + `Error` não tratado; adicionar Render Log Stream → Logtail/BetterStack (free tier serve) com regra de alerta `"BUSINESS_WARN.*permuta reconciliacao FALHOU"` em janela de 15 min → Slack/e-mail. Ping externo `cron-job.org` GET `/health` a cada 4 min em horário comercial (8h-19h BRT) para manter quente e detectar 5xx.
- **Resultado Esperado**
  > TMTD (tempo médio até detecção) de falha em produção: 1 dia útil → ≤ 15 min. Alertas de cold-start visíveis. Dashboard de "borderôs com erro/dia" sem precisar abrir DB.
- **Tactic alvo**: Monitor, Ping/Echo
- **Severidade**: P1
- **Esforço estimado**: M (2-5d)
- **Findings relacionados**: F-availability-1, F-availability-2
- **Métricas de sucesso**:
  - TMTD de erro `fin010`: ~1 dia útil → ≤ 15 min
  - Cobertura de exceções não tratadas: 0% → 100% via Sentry
  - Alertas configurados: 0 → ≥3 (error rate, latência p95, cold-start)
- **Risco de não fazer**: 6 meses ⇒ a operação financeira aprende a "checar manualmente" toda manhã; falha grave (ex.: senha Conexos expirada) passa um dia inteiro despercebida.
- **Dependências**: nenhuma (independente)

### [availability-2] Mover o backend para um plano com instância sempre-quente (saída do free tier)

- **Problema**
  > Backend opera em free tier do Render — 1 instância, spin-down ≥50s após inatividade, sem failover. A 1ª request da manhã pode esperar 50s e disparar timeout do axios interno (40s). Não há redundância: se o nó cai, a operação financeira para.
- **Melhoria Proposta**
  > Tactic: **Active Redundancy** + **Removal from Service**. Subir o backend para Render Standard ($25/mo, sem spin-down) ou equivalente; idealmente 2 instâncias atrás do load balancer nativo do Render (failover automático). Antes de escalar para 2, mover o mutex de `loginPromise` para um lock distribuído (Postgres advisory lock já em uso pelo `IngestaoCoalescerService` é o caminho natural).
- **Resultado Esperado**
  > Disponibilidade percebida pelo analista 24/7 sem cold-start; instância única vira pelo menos N=2 com failover; mutex distribuído evita que `MAX_SESSIONS=3` vire gargalo.
- **Tactic alvo**: Active Redundancy, Reconfiguration
- **Severidade**: P1
- **Esforço estimado**: S (upgrade de plano = clique) + M (mover mutex)
- **Findings relacionados**: F-availability-2, F-availability-3
- **Métricas de sucesso**:
  - Cold-start na 1ª request: ≥50s → 0s
  - Instâncias backend: 1 → ≥2
  - Mutex `loginPromise`: in-memory → Postgres advisory lock (`pg_advisory_lock(hash)`)
- **Risco de não fazer**: 6 meses ⇒ no 1º fechamento mensal com volume real, cold-start trava a 1ª baixa do dia + sem failover, qualquer manutenção do Render derruba a operação.
- **Dependências**: card [availability-1] (monitor já no ar antes do upgrade, pra medir efeito)

### [availability-3] Distribuir o mutex de login Conexos (advisory lock) antes de escalar instâncias

- **Problema**
  > `services/conexos.ts:76` mantém `loginPromise` em memória. Em 1 instância (hoje) funciona. Ao escalar pra 2+ (e o cap MAX_SESSIONS=3 do Conexos é por usuário, não por instância), cada instância pode abrir 3 sessões → `sessionToKill` da sessão mais antiga vira ping-pong cruzado entre instâncias.
- **Melhoria Proposta**
  > Tactic: **Reconfiguration**. Substituir o mutex local por `pg_try_advisory_lock(hash('conexos_login'))` no Postgres compartilhado (mesmo padrão já usado em `IngestaoCoalescerService.request`). Quem perder o lock espera com poll curto até a sessão ser publicada num cache compartilhado (mesmo Postgres ou tabela `conexos_session(sid, expires_at)`).
- **Resultado Esperado**
  > Cap de 3 sessões respeitado globalmente (não por instância). Pré-requisito para o card [availability-2].
- **Tactic alvo**: Reconfiguration
- **Severidade**: P2 (P0 caso o card 2 seja executado sem este)
- **Esforço estimado**: M
- **Findings relacionados**: F-availability-3
- **Métricas de sucesso**:
  - Mutex de login: in-memory por instância → 1 mutex global via advisory lock
  - Sessões Conexos abertas simultaneamente (medido na prod): ≤3
- **Risco de não fazer**: 6 meses ⇒ se escalarmos antes deste card, vira incidente no 1º dia de tráfego paralelo.
- **Dependências**: bloqueia o card [availability-2] (precisa entrar JUNTO ou antes do upgrade que abre N>1).

### [availability-4] Dashboard "Borderôs com erro no dia" + alerta de partial-success

- **Problema**
  > O handshake `fin010` (5 POSTs) não é transacional. Quando a 4ª de 5 alocações falha (`error`), as 3 anteriores ficam `settled` no mesmo borderô — válidas, mas exigem que o analista perceba e concilie manualmente via aba Borderôs.
- **Melhoria Proposta**
  > Tactic: **Rollback** (parcial — aceitando que o ERP não oferece atomicidade). Criar uma página `/permutas/borderos/erros` (ou seção na atual) que lista TODA execução com `status='error'` E `status='reconciling' MAIS DE 15 MIN`. Notificação Slack diária 19h "ainda há N borderôs com baixas em erro". Botão "estornar borderô + relançar" em 1 clique reusa o que a Fase 3.1 já entregou.
- **Resultado Esperado**
  > Tempo médio até conciliação de partial-success ≤ mesmo dia útil; nenhuma execução `reconciling` órfã > 24h sem alerta.
- **Tactic alvo**: Rollback, State Resynchronization
- **Severidade**: P1
- **Esforço estimado**: S (a infra já existe; é UI + query)
- **Findings relacionados**: F-availability-4, F-availability-6
- **Métricas de sucesso**:
  - Tempo até detecção de partial-success: indefinido → ≤ 4h (notificação 19h)
  - Linhas órfãs `reconciling > 15min`: indefinido → 0 (alerta dispara)
- **Risco de não fazer**: 6 meses ⇒ acúmulo de borderôs com baixas erradas no ERP; conciliação contábil mensal vira pesadelo.
- **Dependências**: card [availability-1] (monitor externo é pré-requisito do alerta)

### [availability-5] Reaper automático de execuções `reconciling` órfãs (>15 min)

- **Problema**
  > Cenário: POST `fin010/baixas` → ERP grava `bxaCodSeq` → timeout do client antes da resposta chegar. A trilha fica `reconciling` com `bor_cod` setado e `bxa_cod_seq=null` indefinidamente. A idempotency key bloqueia relançamento; ninguém detecta.
- **Melhoria Proposta**
  > Tactic: **State Resynchronization**. Job (mesma EventBridge planejada / cron Render) a cada 10 min: para cada linha `status='reconciling' AND atualizado_em < now() - interval '15 minutes'`, chamar `listBaixas(filCod, bor_cod)` e reconciliar: achou a baixa pelo par `(docCod, adto)` → `markSettled(bxaCodSeq da resposta)`; não achou → `markError("timeout-pós-sucesso suspeito; verificar manualmente")`.
- **Resultado Esperado**
  > Nenhuma linha em `reconciling` por mais de 15 min sem decisão automática; 0 órfãos silenciosos.
- **Tactic alvo**: State Resynchronization, Sanity Checking
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-availability-6
- **Métricas de sucesso**:
  - Linhas `reconciling > 15min`: ≥0 (não-monitorado) → 0
  - Auto-recuperação de timeout-pós-sucesso: 0% → ≥95% (medido pós-deploy)
- **Risco de não fazer**: 6 meses ⇒ acumula linhas mortas; debug manual no psql vira rotina.
- **Dependências**: card [availability-1] (precisa de log estruturado para verificar o efeito)

### [availability-6] Logar o catch silencioso de `borderoAindaValido` (observabilidade da decisão conservadora)

- **Problema**
  > `ReconciliacaoPermutaService.ts:484-486` faz `catch { return true; }` — decisão correta (não arrisca dupla baixa), mas invisível. Se o `getBordero` falha persistentemente, alocações ficam `skipped` sem trilha do "por que".
- **Melhoria Proposta**
  > Tactic: **Exception Detection**. Substituir `catch {}` por `catch (err) { await this.logService.warn({ type: BUSINESS_WARN, message: 'borderoAindaValido: leitura falhou — conservador=true', data: { filCod, borCod, erro: ... } }); return true; }`. Métrica derivada plotada no dashboard do card [availability-1].
- **Resultado Esperado**
  > Catch silencioso → catch logado; deriva (skipped por leitura falha) deixa de ser invisível.
- **Tactic alvo**: Exception Detection
- **Severidade**: P3
- **Esforço estimado**: S (≤1h)
- **Findings relacionados**: F-availability-5
- **Métricas de sucesso**:
  - Catches silenciosos no path crítico: 1 → 0
- **Risco de não fazer**: 6 meses ⇒ deriva silenciosa segue. Baixo risco, mas pegadinha de manutenção.
- **Dependências**: nenhuma

### [availability-7] Boot-time self-test do client Conexos (`login` dry-run no `bootstrapAppContainer`)

- **Problema**
  > `ensureSid` é lazy: a 1ª request do dia descobre se a senha do Conexos foi rotacionada (401 ou LOGIN_ERROR) ou se o cap MAX_SESSIONS está estourado.
- **Melhoria Proposta**
  > Tactic: **Self-Test**. No `bootstrapAppContainer` (uma vez por boot do processo, idempotente), disparar `conexosService.ensureSid()` num timeout curto. Logar `BUSINESS_INFO` em sucesso e `BUSINESS_ERROR` em falha — o alerta do card [availability-1] já cobre.
- **Resultado Esperado**
  > Falha de credencial expirada detectada no boot, antes da 1ª request real do analista.
- **Tactic alvo**: Self-Test
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-availability-7
- **Métricas de sucesso**:
  - Tempo até detectar credencial expirada: ≤ próximo deploy → ≤ próximo boot
- **Risco de não fazer**: 6 meses ⇒ 1× por trimestre, na rotação de senha, alguém perde a 1ª baixa do dia.
- **Dependências**: card [availability-1]

## 6. Notas do agente

- Decisão arquitetural deliberada e bem documentada: **writes single-attempt no `fin010`** (ConexosClient.ts:1006-1010, 1375-1380) — alinhado ao Bass "Retry só faz sentido quando idempotência está garantida". A idempotência VIVA via `borderoAindaValido` + `findByIdempotencyKey` é o que dá robustez a esse trade-off; o ponto fraco residual é o estado `reconciling` órfão (card [availability-5]).
- Render plan declarado `starter` em `render.yaml:10`, mas `_shared-metrics.md:46` confirma operação em "free tier, spin-down". Tratei como free tier para os findings; se passar a starter sem spin-down, F-availability-2 cai para P2 (mantém-se single-instance).
- Cross-QA: F-availability-1 (monitor) overlap com **observability** e **deployability**; F-availability-3 (mutex distribuído) overlap com **fault-tolerance** e **performance**; F-availability-4 (partial-success) overlap com **integrability** (contrato fin010 não-transacional) e **fault-tolerance**. Sinalizar ao consolidator.
- Score 6/10: as decisões de single-attempt + idempotência VIVA + degradação por filial são fortes; o que puxa pra baixo é a ausência de monitor externo (F-1), single-instance free tier (F-2) e ausência de reaper para `reconciling` órfão (F-6).
