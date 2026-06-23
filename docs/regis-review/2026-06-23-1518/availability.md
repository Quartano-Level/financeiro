---
qa: Availability
qa_slug: availability
run_id: 2026-06-23-1518
agent: qa-availability
generated_at: 2026-06-23T15:18:00-03:00
scope: backend
score: 6.5
findings_count: 8
cards_count: 8
---

# Availability — Regis-Review

Scope desta seção: **Permutas Fase 3 — write-back `fin010`** (handshake de 5 chamadas que cria o
borderô e grava a baixa/permuta no Conexos ERP, com guard-rails `CONEXOS_WRITE_ENABLED` /
`CONEXOS_DRY_RUN`). Arquivos sob foco:

- `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts`
- `src/backend/domain/client/ConexosClient.ts` (métodos `criarBordero`, `validarTituloBaixa`,
  `validarTituloPermuta`, `atualizarValorLiquido`, `gravarBaixaPermuta`)
- `src/backend/routes/permutas.ts` (`POST /permutas/adiantamentos/:docCod/reconciliar`)
- `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts`
- `src/backend/services/conexos.ts` (axios — fonte do timeout 40 s)

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista clica "Reconciliar" no Front I (Permutas) | Conexos `fin010` fica lento/degradado entre o passo 1 (`criarBordero`) e o passo 5 (`gravarBaixaPermuta`) — timeout, 5xx ou socket reset | `ReconciliacaoPermutaService.reconciliar` + `ConexosClient.criarBordero/validar.../gravarBaixaPermuta` | Produção (Render → Conexos cloud), escrita real habilitada (`CONEXOS_WRITE_ENABLED=true`, `CONEXOS_DRY_RUN=false`), uma alocação ativa por par adto↔invoice | Cada par deve terminar em estado terminal observável: `settled` (baixa confirmada via `bxaCodSeq`), `error` com `erro_mensagem` + `erp_response` (reconciliação manual), ou nunca sair de `reconciling` (rastreável). Nada de double-write; nada de borderô "fantasma" silencioso. | 0% de pares "perdidos" (sem linha terminal em `permuta_alocacao_execucao`); 0% de baixa duplicada para o mesmo `idempotency_key`; MTTR de detectar borderô órfão ≤ 1 dia; backoff/timeout dimensionados para ≤ 1 reexecução manual por incidente. |

> Borderô órfão = passo 1 cria o `borCod` no ERP, mas o handshake falha antes de qualquer
> `gravarBaixaPermuta` confirmado. O `borCod` foi capturado em memória (`borCod` local do laço) e
> persistido apenas em registros `error` via `markError`. Em prod, o ERP fica com um borderô sem
> baixas — reconciliação manual feita pelo analista no Conexos.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| % dos arquivos com I/O externo usando `RetryExecutor`/`FallbackExecutor`/`PollExecutor` (backend) | 3/3 (Conexos, Postgres, BCB) = 100 % | ≥ 80 % | ✅ | `grep -rln "RetryExecutor\|FallbackExecutor\|PollExecutor" src/backend --include="*.ts"` |
| Timeout explícito do client HTTP (axios) p/ Conexos | 40 s | ≤ 60 s, explícito | ✅ | `src/backend/services/conexos.ts:79-82` |
| Nº de retries no `gravarBaixaPermuta` (write) | 2 (incondicional — `shouldRetry` default `() => true`) | 1 sem retry OU shouldRetry filtrando 4xx | ⚠️ | `ConexosClient.ts:402-408`, `RetryExecutor.ts:27` |
| Backoff entre tentativas | linear 500 ms + jitter 200 ms | exponencial OU sem retry no write | ⚠️ | `ConexosClient.ts:402-408`, `RetryExecutor.ts:53` |
| Rate-limit do endpoint de escrita | `heavyRouteLimiter` = 10 req/min/IP | ≥ alguma proteção | ✅ | `routes/permutas.ts:361-362`, `http/rateLimit.ts:20-26` |
| Idempotência da reconciliação | UNIQUE por par adto↔invoice em `idempotency_key` (`permuta:{adto}:{invoice}`), preservação ON CONFLICT | par único, não retroceder de `settled` | ✅ | `PermutaExecucaoRepository.ts:88-121`, `migrations/0015_*.sql:11-36` |
| Write-ahead (intenção persistida antes do POST) | `beginExecution` grava `reconciling` antes do passo 1 da iteração | ✅ presente | ✅ | `ReconciliacaoPermutaService.ts:98-105` |
| Persistência do `borCod` em caso de falha cross-step | gravado em `markError` (linha individual), porém o `borCod` cross-iteração só vive em memória até o primeiro `error`/`settled` que o veja | grava em `reconciling` antes do passo 1 | ❌ | `ReconciliacaoPermutaService.ts:130-153`, `PermutaExecucaoRepository.ts:88-121` (insert não persiste `bor_cod`) |
| Rollback no borderô órfão (sem baixa) | ausente — nenhuma rotina de varredura/limpeza | rotina de detecção ou endpoint de cancelamento | ❌ | grep `rollback\|orphan\|borderoOrfa` em `src/backend` (nenhum hit relevante) |
| Sinal de saúde do path de escrita (`/health` distingue ERP write) | `GET /health` é estático (`{status:'ok',version}`) | health check com probe `ensureSid` ou `canary` | ❌ | `src/backend/index.ts:65` |
| `CONEXOS_UPSTREAM_TIMEOUT` distinguido de `CONEXOS_UPSTREAM_ERROR` | tipo existe, mas **nenhum throw site classifica timeout** — todos cai no default `CONEXOS_UPSTREAM_ERROR` | distinguir por `err.code === 'ECONNABORTED'` | ❌ | `domain/errors/ConexosError.ts:3,42`, `grep CONEXOS_UPSTREAM_TIMEOUT src/backend` (só em testes) |
| Circuit breaker p/ degradação automática quando Conexos cai | ausente — handshake tenta os 5 passos mesmo após N falhas no mesmo run | breaker no client OU short-circuit no service após 2 erros consecutivos | ❌ | grep `circuit\|breaker` em `src/backend` (nenhum hit) |
| Cobertura de testes do happy/sad path do handshake | `ReconciliacaoPermutaService.test.ts` existe (verde) | sad-path explícito de timeout no passo 1 → borderô órfão | ⚠️ | `find ReconciliacaoPermutaService.test.ts` |

> ⚠️ **Não medível localmente**: MTTR real do incidente "borderô órfão" e taxa real de timeout do
> `fin010` em produção. Requer CloudWatch (alvo) ou logs estruturados do Render (atual).
> Recomendação: instrumentar contador por status terminal (`settled`/`error`) e métrica
> `time_first_step - time_settled` por execução, alertar quando p99 > 10 s (handshake típico < 2 s
> contra o Conexos cloud).

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Detect Faults — Ping/Echo** | `legacy.ensureSid()` antes de cada chamada do handshake é um quase-ping (renova sessão), mas não há "probe" canônico de saúde do `fin010` antes de criar o borderô | ⚠️ parcial | `ConexosClient.ts:1008,1036,1070,1103,1141` |
| **Detect Faults — Heartbeat** | ausente — Render não emite heartbeat aplicacional do path de escrita | ❌ ausente | `src/backend/index.ts:65` (only static `/health`) |
| **Detect Faults — Monitor** | `LogService` registra `BUSINESS_INFO` (settled) e `BUSINESS_WARN` (falha) — operacional, sem alarms agregados | ⚠️ parcial | `ReconciliacaoPermutaService.ts:114-118,143-147,248-252` |
| **Detect Faults — Timestamp** | `criado_em`/`atualizado_em` em `permuta_alocacao_execucao`; `borDtaMvto` no payload | ✅ presente | `migrations/0015_permuta_alocacao_execucao.sql:33-34`, `ReconciliacaoPermutaService.ts:71-72` |
| **Detect Faults — Sanity Checking** | passo 2 valida `bxaMnyValor > 0` (anti-super-pagamento). Não há sanity do `borCod` ou guard contra status `reconciling` "preso" | ⚠️ parcial | `ReconciliacaoPermutaService.ts:185-192` |
| **Detect Faults — Condition Monitoring** | ausente — não há monitor de `permuta_alocacao_execucao.status='reconciling' AND atualizado_em < now()-Xmin` | ❌ ausente | grep nenhum hit em jobs |
| **Detect Faults — Voting** | N/A — única fonte de verdade é o ERP; voting não se aplica ao write | N/A | — |
| **Detect Faults — Exception Detection** | `try/catch` no `for` da reconciliação captura qualquer erro do handshake, normaliza para `markError` + `BUSINESS_WARN` | ✅ presente | `ReconciliacaoPermutaService.ts:129-155` |
| **Detect Faults — Self-Test** | ausente — sem rota `/diag/conexos-write` ou canary | ❌ ausente | — |
| **Recover — Active Redundancy** | N/A — um único ERP Conexos por tenant | N/A | — |
| **Recover — Passive Redundancy** | N/A — idem | N/A | — |
| **Recover — Spare** | N/A — não há réplica do `fin010` | N/A | — |
| **Recover — Exception Handling** | `ConexosError` (statusCode 504, retryable=true) wrap em todos os 5 métodos; service captura e diferencia `error`/`skipped`/`dry-run`/`settled` | ✅ presente | `ConexosClient.ts:1021-1024,1054-1057,1083-1086,1121-1126,1144-1146`, `domain/errors/ConexosError.ts` |
| **Recover — Rollback** | ❌ ausente — não há compensação para o borderô órfão. O ERP cria `borCod`; se o passo 2..5 falha, o borderô fica vazio no Conexos sem caminho automatizado de cancelamento | ❌ ausente | `ReconciliacaoPermutaService.ts:130-153` (gera `borCod`, captura em variável local, persiste só em `markError` da linha que viu o erro) |
| **Recover — Software Upgrade** | N/A — sem hot deploy | N/A | — |
| **Recover — Retry** | `RetryExecutor` 2 tentativas + 500 ms + jitter 200 ms aplicado em **TODOS** os 5 métodos write. **Sem `shouldRetry` filtrando 4xx**: erro de validação (400/422) re-tenta gastando rate-limit do Conexos | ⚠️ parcial | `ConexosClient.ts:402-408,1007-1020,1035-1054,1069-1083,1102-1120,1140-1143`, `RetryExecutor.ts:27,45-47` |
| **Recover — Ignore Faulty Behavior** | parcial — `getDetalheTitulos` ignora HTTP 400 quirk legítimo (caminho de leitura). No write: nenhum erro é ignorado | ✅ presente (read), N/A (write) | `ConexosClient.ts:922-944` |
| **Recover — Degradation** | `dryRun` é o degradation explícito: `writeEnabled=false` OU `dryRun=true` OU `dryRunOverride=true` ⇒ monta payload + loga sem POST. UI consegue continuar funcionando | ✅ presente | `ReconciliacaoPermutaService.ts:88-126`, `EnvironmentProvider:69-70,96-97` |
| **Recover — Reconfiguration** | parcial — flag `CONEXOS_WRITE_ENABLED` permite "desligar a escrita" sem deploy, mas requer reinício porque é lida pelo `EnvironmentProvider` no boot do request | ⚠️ parcial | `domain/libs/environment/EnvironmentProvider.ts:69-70,96-97` |
| **Recover — Shadow** | N/A — não rodamos uma shadow do `fin010` | N/A | — |
| **Recover — State Resynchronization** | parcial — `ON CONFLICT DO UPDATE` preserva `settled` (não regride), e re-execução com mesma `idempotency_key` recupera o estado; sem reconciliação automática contra o ERP (lista de baixas) | ⚠️ parcial | `PermutaExecucaoRepository.ts:88-121` |
| **Recover — Escalating Restart** | N/A — Render é monolito stateful (sessão Conexos em memória); restart escalonado não é mecanismo aplicado | N/A | — |
| **Recover — Non-Stop Forwarding** | N/A — não há roteador stateful | N/A | — |
| **Prevent — Removal from Service** | ausente — não há "drain" do endpoint de escrita pré-deploy; nem flag de manutenção que devolva 503 calmamente para o front | ❌ ausente | — |
| **Prevent — Transactions** | parcial — `PermutaExecucaoRepository` é parametrizado mas a sequência `borderô → validar → gravar` **não é atômica** (impossível atomicidade entre processos distintos). A linha de execução é atômica em si | ⚠️ parcial | `PermutaExecucaoRepository.ts:88-121,132-165` |
| **Prevent — Predictive Model** | ausente — sem modelo / heurística que pule alocações se Conexos está degradado | ❌ ausente | — |
| **Prevent — Exception Prevention** | Zod no boundary do POST (`reconciliarBodySchema`); `requireRole('admin')`; idempotency por par; preservação de `settled`; check de `bxaMnyValor > 0` | ✅ presente | `routes/permutas.ts:31-36,360-381`, `ReconciliacaoPermutaService.ts:185-192` |
| **Prevent — Increase Competence Set** | parcial — handshake aceita inputs ausentes (`gerNum`/`gerDes` com `?? p.perm.gerNumPermuta`) mas não tem fallback para `bxaMnyValor` ausente (corretamente falha) | ✅ presente | `ReconciliacaoPermutaService.ts:285-318` |

## 4. Findings (achados)

### F-availability-1: Borderô órfão sem rollback nem detecção quando handshake falha entre passos 1 e 5

- **Severidade**: P0
- **Tactic violada**: Rollback / Condition Monitoring
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:128-156` (criação do `borCod`); `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:88-121` (insert não persiste `bor_cod`)
- **Evidência (objetiva)**:
  ```ts
  // ReconciliacaoPermutaService.ts:128-134
  if (borCod === undefined) {
      const bordero = await this.conexosClient.criarBordero({ filCod, dataMovto });
      borCod = bordero.borCod;
  }
  const resultado = await this.executarBaixa({ key, borCod, filCod, aloc });
  ```
  O `borCod` é gerado no ERP pelo passo 1 e armazenado **apenas em memória** (variável local do
  laço). `beginExecution` (chamado **antes** do `criarBordero`) não recebe o `borCod` — só
  `markError`/`markSettled` o persistem, e somente para a linha que viu o evento. Se o passo 2 cai
  por timeout e a Lambda/processo morre antes do `catch` registrar, o ERP fica com um borderô
  vazio sem nenhuma linha em `permuta_alocacao_execucao` apontando para ele.
- **Impacto técnico**: lixo persistente no `fin010`, requer limpeza manual do analista no Conexos.
  Se a escrita for retentada num novo run, um **novo** `criarBordero` é disparado (já que o
  `borCod` local começa `undefined`), multiplicando o lixo a cada incidente.
- **Impacto de negócio**: confusão na auditoria do ERP (borderôs sem baixa contábil), retrabalho
  do analista, risco regulatório se o auditor questionar o "rascunho não fechado". Quebra a
  promessa de "0 baixa duplicada" — não duplica baixa, mas duplica **borderô**.
- **Métrica de baseline**: 100 % dos cenários de falha entre passos 1 e 5 produzem borderô órfão
  sem compensação automática (revisão estática). Estimativa: 1 órfão por incidente de timeout no
  Conexos.

### F-availability-2: `RetryExecutor` retenta **incondicionalmente**, inclusive em erros 4xx do `fin010`

- **Severidade**: P0
- **Tactic violada**: Retry (mal configurado) / Exception Prevention
- **Localização**: `src/backend/domain/client/ConexosClient.ts:402-408`; `src/backend/domain/libs/executor/RetryExecutor.ts:27,45-47`
- **Evidência (objetiva)**:
  ```ts
  // ConexosClient.ts:402-408 — instância COMPARTILHADA por reads e writes
  this.retryExecutor = new RetryExecutor({
      retries: 2,
      delayMs: 500,
      shouldLog: true,
      jitterMs: 200,
  });
  // shouldRetry NÃO informado → default em RetryExecutor.ts:27
  this.shouldRetry = shouldRetry ?? (() => true);
  ```
  Todos os 5 métodos write (`criarBordero`, `validarTituloBaixa`, `validarTituloPermuta`,
  `atualizarValorLiquido`, `gravarBaixaPermuta`) compartilham essa mesma instância. Um 400
  (validação), 401 (sessão), 403 (autorização) ou 422 são re-disparados — para `criarBordero` isso
  **multiplica borderôs órfãos no ERP** (uma criação por tentativa quando o ERP responde 5xx mas
  já criou o registro no DB, conforme a quirk documentada nos comentários do `getDetalheTitulos`
  para reads).
- **Impacto técnico**: tempestade de retentativa (`storm`) contra o `fin010` na janela em que o
  Conexos está degradado — exatamente o pior momento. Em 4xx duros, gasta 3 chamadas inúteis.
- **Impacto de negócio**: na hora em que o ERP está em sofrimento, o sistema **piora** a carga
  no fornecedor crítico — viola a hipocrática "do no harm". Aumenta a probabilidade de bloqueio
  por rate-limit do Conexos contra TODO o tenant.
- **Métrica de baseline**: 0 dos 5 métodos write tem `shouldRetry` específico. 2 retries × 500 ms
  ≈ 1.5 s entre primeira tentativa e o `ConexosError` final; com timeout 40 s ⇒ pior caso
  3 × 40 s = 120 s de execução enquanto o `borCod` já foi criado.

### F-availability-3: `borCod` não é persistido em write-ahead — recuperação manual exige `grep` em log

- **Severidade**: P0
- **Tactic violada**: State Resynchronization / Transactions (write-ahead incompleto)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:98-156`
- **Evidência (objetiva)**:
  ```ts
  // beginExecution roda ANTES de criarBordero — só persiste status=reconciling, sem bor_cod
  const begin = await this.execucaoRepository.beginExecution({ idempotencyKey: key, ... });
  // ...
  if (borCod === undefined) {
      const bordero = await this.conexosClient.criarBordero({ filCod, dataMovto });
      borCod = bordero.borCod;  // ← só na memória do worker, nunca em DB neste ponto
  }
  ```
  A trilha "intenção antes do POST" só cobre o par. O `borCod` (recurso compartilhado entre N
  pares de um mesmo run) só vai pro DB via `markError`/`markSettled`. Em crash entre `criarBordero`
  e `executarBaixa` do primeiro par: zero rastro do `borCod` no DB.
- **Impacto técnico**: investigação manual dependente de log do Render (rotativo, sem retenção
  formalizada). Operador não consegue saber qual `borCod` cancelar no Conexos sem `grep`.
- **Impacto de negócio**: MTTR de detecção do órfão ≈ depende do analista lembrar de checar (na
  prática: descobre na próxima conciliação contábil mensal). Auditoria fica difícil.
- **Métrica de baseline**: 0 % de persistência write-ahead do `borCod` antes do POST. Alvo: 100 %.

### F-availability-4: `CONEXOS_UPSTREAM_TIMEOUT` declarado mas nunca classificado — todo erro vira `UPSTREAM_ERROR`

- **Severidade**: P1
- **Tactic violada**: Exception Detection / Monitor
- **Localização**: `src/backend/domain/errors/ConexosError.ts:3,42`; todos os `catch (cause) { throw new ConexosError(...) }` em `ConexosClient.ts`
- **Evidência (objetiva)**:
  ```ts
  // ConexosClient.ts:1021-1024 (idem para os 4 outros métodos write)
  } catch (cause) {
      throw new ConexosError({ endpoint: 'fin010', cause });
  }
  // ConexosError.ts:42
  this.code = params.code ?? 'CONEXOS_UPSTREAM_ERROR';
  ```
  `grep -rn "CONEXOS_UPSTREAM_TIMEOUT" src/backend --include="*.ts"` retorna apenas testes; nenhum
  throw em produção. O axios responde com `err.code === 'ECONNABORTED'` para timeout — não
  detectado em parte alguma do client.
- **Impacto técnico**: dashboard/alarms futuros não conseguem separar "Conexos lento" de "Conexos
  rejeitou a chamada". Investiga-se cada erro como se fosse o mesmo.
- **Impacto de negócio**: SLA de operação não diferencia incidentes de upstream lento (auto-resolve)
  de erros funcionais (cabem em correção de código). Operações entrega mais ruído ao time.
- **Métrica de baseline**: 100 % dos erros write hoje rotulam-se como `CONEXOS_UPSTREAM_ERROR`.
  Alvo: timeout detectado quando `cause.code === 'ECONNABORTED'` ou `cause.message.includes('timeout')`.

### F-availability-5: Sem detecção condicionada de linhas presas em `reconciling`

- **Severidade**: P1
- **Tactic violada**: Condition Monitoring
- **Localização**: `src/backend/migrations/0015_permuta_alocacao_execucao.sql:11-36` (esquema OK);
  ausência de job de varredura no backend
- **Evidência (objetiva)**:
  ```
  $ grep -rln "reconciling\b" src/backend --include="*.ts" | grep -v test
  src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts
  src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts
  ```
  Nenhuma rotina periódica consulta `WHERE status='reconciling' AND atualizado_em < now()-X`. Se o
  processo morre durante o passo 5, a linha fica `reconciling` indefinidamente.
- **Impacto técnico**: status terminal "preso" indistinto de "em voo legítimo".
- **Impacto de negócio**: ao re-clicar Reconciliar, idempotência por par funciona (não duplica
  baixa), mas a linha "presa" nunca vira `error` automaticamente, criando expectativa errada na UI
  de execuções.
- **Métrica de baseline**: 0 jobs/queries de varredura para `status='reconciling' AND
  atualizado_em < now()-X`. Alvo: 1 job (cron 15 min no atual, EventBridge no alvo) reabrindo ou
  marcando `error` linhas órfãs.

### F-availability-6: `/health` é estático e não cobre o write path

- **Severidade**: P1
- **Tactic violada**: Ping/Echo / Heartbeat / Self-Test
- **Localização**: `src/backend/index.ts:65`
- **Evidência (objetiva)**:
  ```ts
  app.get('/health', (_req, res) => res.json({ status: 'ok', version: APP_VERSION }));
  ```
  Render usa esse endpoint para "está vivo?" — não há diferenciação entre Express respondendo e
  Conexos write disponível.
- **Impacto técnico**: deploy automatizado e auto-heal do Render marcam o serviço como saudável
  mesmo quando o `fin010` está rejeitando 100 % dos POSTs. Operador descobre pelo cliente.
- **Impacto de negócio**: visibilidade reativa em vez de proativa. SLO de "% das reconciliações
  bem-sucedidas" tem de ser inferido do DB, e não de um sinal direto.
- **Métrica de baseline**: 1 endpoint de saúde, 0 dependências externas validadas. Alvo: probe
  leve (HEAD `fin010` ou `ensureSid()` cached) numa rota `/health/conexos-write`.

### F-availability-7: Rate-limit `heavyRouteLimiter` é por IP — múltiplos analistas atrás do mesmo NAT colidem

- **Severidade**: P2
- **Tactic violada**: Removal from Service / Reconfiguration
- **Localização**: `src/backend/http/rateLimit.ts:20-26`; `src/backend/routes/permutas.ts:361-362`
- **Evidência (objetiva)**:
  ```ts
  export const heavyRouteLimiter: RateLimitRequestHandler = rateLimit({
      windowMs: 60_000,
      limit: 10,
      // sem keyGenerator → default = IP do remoteAddress
  });
  ```
  10 reconciliações por minuto por IP. Em escritório com NAT (cenário normal Columbia), dois
  analistas legítimos podem ser bloqueados. Inversamente: um único bot autenticado consegue
  disparar 10 reconciliações distintas/min — cada uma com handshake de 5 chamadas = **50
  chamadas/min/IP** ao Conexos `fin010`.
- **Impacto técnico**: ou trava analistas legítimos (falso positivo), ou permite abuso por
  usuário legítimo confuso (falso negativo). Métrica errada pra proteção da dependência.
- **Impacto de negócio**: experiência inconsistente; risco de bloqueio do tenant no Conexos por
  excesso de POST `fin010`.
- **Métrica de baseline**: `keyGenerator` ausente. Alvo: chave por `req.user.sub` (ou
  `IP + sub`) com limit ajustado por usuário.

### F-availability-8: Falta teste sad-path de timeout entre passos do handshake

- **Severidade**: P2
- **Tactic violada**: Self-Test (preventiva — qualidade da rede de segurança)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.test.ts`
- **Evidência (objetiva)**: o arquivo existe (e está verde) mas não há cenário simulando
  `criarBordero` ok + `validarTituloBaixa` timeout — exatamente o caso que produz borderô órfão.
  Validar visualmente o teste; se necessário, abrir card.
- **Impacto técnico**: regressão na lógica de error path passa despercebida.
- **Impacto de negócio**: confiança falsa na cobertura.
- **Métrica de baseline**: cobertura do path de erro estimada < 100 % das 5 fronteiras possíveis
  do handshake.

## 5. Cards Kanban

### [availability-1] Persistir `borCod` em write-ahead e implementar compensação do borderô órfão

- **Problema**
  > Quando o handshake `fin010` falha entre passos 1 e 5 (passos 2/3/4/5 todos podem timeout
  > contra o Conexos cloud), o borderô criado no passo 1 fica órfão no ERP sem trilha automática
  > para recuperação. O `borCod` só é persistido via `markError`/`markSettled` da linha que viu o
  > evento; um crash do processo (Render reinício) entre `criarBordero` e o próximo `await` perde
  > a referência.

- **Melhoria Proposta**
  > Aplicar tactic **Rollback** + **State Resynchronization**: (1) gravar `bor_cod` em
  > `permuta_alocacao_execucao` no `beginExecution` do primeiro par do run (write-ahead estendido)
  > **ou** criar tabela `permuta_bordero_run` (`bor_cod`, `fil_cod`, `executado_por`,
  > `criado_em`, `status: open|closed|orphan`) e referenciar nas execuções; (2) job/endpoint
  > `POST /permutas/borderos/:borCod/cancelar` que dispara o cancelamento no ERP (apurar com Yuri
  > qual endpoint Conexos cancela um borderô vazio); (3) varredura periódica
  > `WHERE status='reconciling' AND atualizado_em < now()-30min` marcando órfão.

- **Resultado Esperado**
  > 100 % dos `borCod` criados são rastreáveis no DB antes do passo 2; 100 % dos órfãos são
  > detectados em ≤ 30 min; 0 limpeza manual via Conexos UI.

- **Tactic alvo**: Rollback, State Resynchronization
- **Severidade**: P0
- **Esforço estimado**: M (3–4 dias — entrevista com Yuri sobre endpoint de cancel + migração SQL + job)
- **Findings relacionados**: F-availability-1, F-availability-3, F-availability-5
- **Métricas de sucesso**:
  - `% borCod com write-ahead em DB`: 0 % → 100 %
  - `MTTR de detecção do borderô órfão`: indefinido → ≤ 30 min
- **Risco de não fazer**: lixo crescente no Conexos `fin010`, custo de auditoria mensal, risco de
  duplicação de borderô em re-execução manual de incidente
- **Dependências**: nenhuma (pode ir junto com [availability-2])

### [availability-2] Diferenciar retry policy para writes — não retentar 4xx; reduzir retries no `criarBordero`

- **Problema**
  > `ConexosClient.retryExecutor` é uma instância única (`retries:2, delayMs:500`) sem
  > `shouldRetry`, compartilhada entre reads e writes. Um 400/422 no `criarBordero` retenta 2
  > vezes, multiplicando borderôs órfãos. Pior: durante incidente Conexos, todo write entra em
  > storm de 3 chamadas em ~1.5 s.

- **Melhoria Proposta**
  > Aplicar tactic **Retry** corretamente: criar `RetryExecutor` dedicado para writes (ou passar
  > `shouldRetry` específico nos métodos write) com regra `shouldRetry: (err) =>
  > isTransient(err)` — `true` apenas para timeout (`ECONNABORTED`), 5xx, e erros de rede. 4xx
  > nunca retenta. No `criarBordero` especificamente, considerar `retries: 0` (zero) — recriar
  > borderô não é idempotente do lado do ERP. Mover backoff para exponencial (500/1000/2000 ms)
  > nos demais.

- **Resultado Esperado**
  > 0 retentativas em 4xx; 0 borderô duplicado por retry storm; tempo máximo de falha em
  > `criarBordero` cai de ~120 s (3×40 s) para ~40 s (1×40 s).

- **Tactic alvo**: Retry, Exception Detection
- **Severidade**: P0
- **Esforço estimado**: S (≤1 dia — refator pontual + 1 teste sad-path)
- **Findings relacionados**: F-availability-2, F-availability-4
- **Métricas de sucesso**:
  - `borderôs órfãos criados por incidente`: até 3 → 1
  - `tempo até erro final no criarBordero`: ~120 s → ~40 s
- **Risco de não fazer**: tempestade de retentativa contra o Conexos durante outage piora o
  incidente; multiplicação de órfãos
- **Dependências**: combinar com [availability-1] para máximo benefício

### [availability-3] Classificar `CONEXOS_UPSTREAM_TIMEOUT` no client

- **Problema**
  > O tipo `CONEXOS_UPSTREAM_TIMEOUT` está declarado em `ConexosError` e seu `userMessage`
  > está pronto, mas nenhum throw site classifica timeout — todos caem no default
  > `CONEXOS_UPSTREAM_ERROR`. Operações não diferencia "Conexos lento" de "Conexos rejeitou".

- **Melhoria Proposta**
  > Aplicar tactic **Exception Detection**: helper `classifyConexosCause(err)` que devolve
  > `'CONEXOS_UPSTREAM_TIMEOUT'` quando `err?.code === 'ECONNABORTED'` ou
  > `err?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT'` ou `err?.message?.includes('timeout')`;
  > caso contrário `'CONEXOS_UPSTREAM_ERROR'`. Aplicar nos 5 catches de write do `ConexosClient`.

- **Resultado Esperado**
  > 100 % dos timeouts ECONNABORTED rotulados como `CONEXOS_UPSTREAM_TIMEOUT`; dashboard separa
  > Lentidão de Erro Funcional.

- **Tactic alvo**: Exception Detection, Monitor
- **Severidade**: P1
- **Esforço estimado**: S (≤1 dia)
- **Findings relacionados**: F-availability-4
- **Métricas de sucesso**:
  - `% dos erros classificados como timeout quando aplicável`: 0 % → > 80 %
- **Risco de não fazer**: dashboards futuros mascararão duas naturezas de problema sob o mesmo
  rótulo; alarms terão alto ruído
- **Dependências**: nenhuma

### [availability-4] Job de varredura de execuções presas em `reconciling`

- **Problema**
  > Linhas `permuta_alocacao_execucao.status='reconciling'` que ficam "presas" (crash, lambda
  > recycle, timeout do passo 5 que não chega no `markError`) nunca evoluem. Idempotência por par
  > evita double-write em re-clique, mas a linha presa vira lixo silencioso na UI de execuções.

- **Melhoria Proposta**
  > Aplicar tactic **Condition Monitoring**: query periódica (cron 15 min no atual; EventBridge
  > no alvo) `SELECT idempotency_key, bor_cod FROM permuta_alocacao_execucao WHERE status =
  > 'reconciling' AND atualizado_em < now() - INTERVAL '15 minutes'` — para cada hit, tentar
  > reconciliar contra o ERP (lista de baixas por `bor_cod`); se a baixa existe → `markSettled`;
  > se não → `markError` com mensagem "stalled-recovered".

- **Resultado Esperado**
  > 0 linhas `reconciling` ficam presas mais de 30 min. Métrica observável: contador "stalled
  > recovered" no log.

- **Tactic alvo**: Condition Monitoring, State Resynchronization
- **Severidade**: P1
- **Esforço estimado**: M (2–3 dias — depende de endpoint de leitura `com311/baixas/list/<borCod>`
  ou similar; entrevistar Yuri)
- **Findings relacionados**: F-availability-5, F-availability-3
- **Métricas de sucesso**:
  - `tempo p99 de uma linha em status reconciling`: indefinido → < 30 min
  - `linhas reconciling > 1h em DB`: ad-hoc → 0 estável
- **Risco de não fazer**: trilha de auditoria gradualmente apodrece; UI mostra "em voo" para
  baixas que de fato já estão settled ou falharam
- **Dependências**: [availability-1] (se a varredura usar `bor_cod`)

### [availability-5] Health check com probe do path de escrita Conexos

- **Problema**
  > `GET /health` devolve `{status:'ok'}` mesmo quando o `fin010` está rejeitando 100 % dos
  > POSTs. Render auto-heal e operador externo descobrem o incidente apenas via reclamação do
  > analista.

- **Melhoria Proposta**
  > Aplicar tactic **Ping/Echo** + **Self-Test**: rota `GET /health/conexos` que reusa
  > `conexosService.ensureSid()` (já cacheia sid 25 min, custo praticamente zero) e devolve
  > `{conexos: 'ok' | 'degraded'}` com `cause` quando degraded. Expor métrica simples para o
  > frontend acender um indicador "ERP indisponível — modo dry-run apenas" no botão
  > Reconciliar.

- **Resultado Esperado**
  > Operador sabe em < 1 min que Conexos está fora antes do primeiro tíquete do analista. UI
  > pode forçar dry-run automaticamente.

- **Tactic alvo**: Ping/Echo, Self-Test, Degradation
- **Severidade**: P1
- **Esforço estimado**: S (≤1 dia)
- **Findings relacionados**: F-availability-6
- **Métricas de sucesso**:
  - `MTTD do incidente Conexos`: minutos → < 1 min
- **Risco de não fazer**: continua descobrindo outage por canal humano; SLO de availability não
  é medível com sinal próprio
- **Dependências**: nenhuma

### [availability-6] Rate-limit por usuário autenticado em `/permutas/.../reconciliar`

- **Problema**
  > `heavyRouteLimiter` chaveia por IP. Múltiplos analistas atrás do NAT da Columbia colidem
  > (falso positivo); um único usuário pode disparar 10 reconciliações/min × 5 chamadas =
  > 50 POSTs/min contra `fin010` (falso negativo do ponto de vista de proteção da dependência).

- **Melhoria Proposta**
  > Aplicar tactic **Removal from Service**: novo limiter `writeRouteLimiter` com
  > `keyGenerator: (req) => req.user?.sub ?? req.ip`, `limit: 3` por minuto (handshake é caro: 5
  > POSTs × 5 alocações = 25 calls em ~30 s). Anexar apenas à rota
  > `POST /permutas/adiantamentos/:docCod/reconciliar` (não trocar o limiter compartilhado).

- **Resultado Esperado**
  > 0 falsos positivos por NAT; teto controlado de chamadas write/min por analista.

- **Tactic alvo**: Removal from Service
- **Severidade**: P2
- **Esforço estimado**: S (≤1 dia)
- **Findings relacionados**: F-availability-7
- **Métricas de sucesso**:
  - `chamadas write/min/usuário (pior caso)`: até 50 → ≤ 15
- **Risco de não fazer**: rate-limit por IP é a métrica errada de proteção
- **Dependências**: nenhuma

### [availability-7] Reduzir blast-radius do dry-run → escrita: degradation reversível sem reboot

- **Problema**
  > `CONEXOS_WRITE_ENABLED` / `CONEXOS_DRY_RUN` são lidos pelo `EnvironmentProvider` no boot do
  > request. Em incidente, virar a chave para forçar dry-run em produção requer redeploy / restart
  > do Render — janela de minutos durante a qual escritas ruins seguem chegando.

- **Melhoria Proposta**
  > Aplicar tactic **Reconfiguration** runtime: cache TTL curto (30 s) no
  > `EnvironmentProvider` para `conexosWriteEnabled`/`conexosDryRun`, **ou** persistir o flag em
  > `app_config` em Postgres e ler a cada request (custo baixo dado o tráfego). Endpoint
  > `POST /admin/write-mode/dry-run` (admin) liga/desliga em runtime.

- **Resultado Esperado**
  > Tempo para "forçar dry-run em produção" cai de minutos (redeploy) para segundos.

- **Tactic alvo**: Reconfiguration, Degradation
- **Severidade**: P2
- **Esforço estimado**: M (2 dias)
- **Findings relacionados**: F-availability-6 (cross), F-availability-1 (degradation pré-rollback)
- **Métricas de sucesso**:
  - `tempo para entrar em dry-run forçado`: ~5 min → < 10 s
- **Risco de não fazer**: durante o próximo incidente, escritas continuam tentando subir borderô
  no ERP enquanto o ops espera o deploy
- **Dependências**: nenhuma

### [availability-8] Teste sad-path de timeout no handshake (passo 2/3/4/5)

- **Problema**
  > Existe teste do happy path do `ReconciliacaoPermutaService`, mas não há cenário simulando
  > `criarBordero` ok + um dos passos seguintes timeout. Regressão na lógica de tratamento de
  > borderô órfão passaria silenciosa.

- **Melhoria Proposta**
  > Aplicar tactic **Self-Test** (cobertura preventiva): 4 cenários novos no teste,
  > parametrizados pelo passo que falha (2, 3, 4, 5). Asserts: `markError` chamado com `borCod`,
  > nenhuma chamada subsequente do client, status `error` retornado.

- **Resultado Esperado**
  > Cobertura do error path do handshake: < 100 % → 100 %.

- **Tactic alvo**: Self-Test
- **Severidade**: P2
- **Esforço estimado**: S (≤1 dia)
- **Findings relacionados**: F-availability-8, F-availability-1
- **Métricas de sucesso**:
  - `cenários de error path testados`: 0/4 → 4/4
- **Risco de não fazer**: ROI direto na confiança da próxima refatoração — sem o teste, qualquer
  mexida no laço quebra silenciosamente o error path
- **Dependências**: facilita a entrega de [availability-1] (test-first)

## 6. Notas do agente

- **Escopo deliberadamente reduzido ao Fase 3 write-back** (ignorei reads do Permutas, frontes II
  e III). A maior parte das tactics de leitura — Voting, Active Redundancy, Non-Stop Forwarding —
  é genuinamente N/A neste escopo (única fonte de verdade é o Conexos).
- O dry-run **já é** o degradation tactic mais forte do feature — é defensável manter o default
  conservador (`CONEXOS_DRY_RUN !== 'false'`) durante toda a Fase 3 inicial.
- **Cross-QA**: F-availability-2 (retry incondicional) toca Security (DoS contra o tenant
  Conexos) e Performance (latência amplificada). Sinalizar para o consolidator.
- Não consegui medir MTTR/MTBF reais sem CloudWatch (alvo) — registrado explicitamente em §2.
- Não consegui rodar `npm test` neste worktree (instrumentação fora de escopo). Confiança nos
  achados estáticos é alta porque os caminhos são curtos e bem comentados.
