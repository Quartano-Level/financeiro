---
type: regis-review-kanban
run_id: 2026-06-23-1518
scope: Permutas Fase 3 — write-back fin010 (branch feat/permutas-reconciliacao)
total: 59
counts: { p0: 10, p1: 26, p2: 17, p3: 6 }
remediated_in_branch: 10
---

# Kanban — financeiro — 2026-06-23-1518

> Importável para o Kanban do time. Cada card abaixo está copiado verbatim das 8 seções de QA.
> Ordem: P0 (S → M → L → XL), depois P1, P2, P3.
> **Marca `✅ REMEDIADO` = remediado nesta branch antes do PR** (vide REPORT.md §2).

---

## P0 — Crítico

### [fault-tolerance-1] Desabilitar retry automático em `gravarBaixaPermuta` (POST não-idempotente) — ✅ REMEDIADO

**QA**: Fault Tolerance | **Tactic**: Idempotent Replay (recover) | **Esforço**: S | **Findings**: F-fault-tolerance-1, F-fault-tolerance-5

**Problema**
> O `RetryExecutor` compartilhado por todo o `ConexosClient` reenvia o POST `fin010/baixas` em qualquer erro, inclusive timeouts pós-sucesso. Como o ERP não expõe `Idempotency-Key` e cada POST gera um `bxaCodSeq` novo, o retry pode duplicar a baixa real — super-pagamento.

**Melhoria Proposta**
> Criar um `RetryExecutor` dedicado às escritas com `retries: 0` (ou `shouldRetry` que só aceite erros pré-conexão tipados como `ECONNREFUSED`/`ENOTFOUND`, NUNCA timeouts nem `ECONNRESET` durante o request body). Aplicar em `criarBordero` e `gravarBaixaPermuta` (passos 1 e 5 — os que mutam estado no ERP).

**Resultado Esperado**
> Zero double-writes provenientes de retry interno. P(double-baixa | timeout): ~1 → 0.

**Métricas de sucesso**
- retries no passo 5: 2 → 0
- shouldRetry no executor de escrita: `() => true` → função explícita que recusa timeout

**Risco de não fazer**: 1 timeout do `fin010/baixas` em produção = baixa duplicada com efeito contábil real, estornável só manualmente no ERP.
**Dependências**: nenhuma

---

### [availability-2] Diferenciar retry policy para writes — não retentar 4xx; reduzir retries no `criarBordero` — ✅ REMEDIADO

**QA**: Availability | **Tactic**: Retry, Exception Detection | **Esforço**: S | **Findings**: F-availability-2, F-availability-4

**Problema**
> `ConexosClient.retryExecutor` é uma instância única (`retries:2, delayMs:500`) sem `shouldRetry`, compartilhada entre reads e writes. Um 400/422 no `criarBordero` retenta 2 vezes, multiplicando borderôs órfãos.

**Melhoria Proposta**
> Aplicar tactic Retry corretamente: `RetryExecutor` dedicado para writes com `shouldRetry: (err) => isTransient(err)` — `true` apenas para timeout (`ECONNABORTED`), 5xx e erros de rede. 4xx nunca retenta. `criarBordero`: `retries: 0`. Backoff exponencial nos demais.

**Resultado Esperado**
> 0 retentativas em 4xx; 0 borderô duplicado por retry storm; tempo máximo de falha em `criarBordero` cai de ~120 s para ~40 s.

**Métricas de sucesso**
- borderôs órfãos criados por incidente: até 3 → 1
- tempo até erro final no criarBordero: ~120 s → ~40 s

**Risco de não fazer**: tempestade de retentativa contra o Conexos piora o incidente.
**Dependências**: combinar com [availability-1]

---

### [performance-3] Desligar retry no passo 5 (`gravarBaixaPermuta`) ou restringir a falhas pré-resposta — ✅ REMEDIADO

**QA**: Performance | **Tactic**: Limit Event Response | **Esforço**: S | **Findings**: F-performance-3

**Problema**
> `RetryExecutor` aplicado em `gravarBaixaPermuta` aceita timeout(40s) como erro retentável, mas o ERP pode TER processado a baixa antes do socket fechar — o retry vira dupla-baixa.

**Melhoria Proposta**
> `NoRetryExecutor` (ou `retries: 0`) para `gravarBaixaPermuta`. Alternativa: retry só em erros de TRANSPORTE pré-resposta.

**Resultado Esperado**
> Tentativas no passo 5: 3 → 1. Janela de dupla-baixa por retry interno: impossível.

**Métricas de sucesso**
- Retries em `gravarBaixaPermuta` (caminho feliz): 0
- Casos de dupla-baixa por retry interno: 0

**Risco de não fazer**: estorno contábil manual em incidente.
**Dependências**: cross-QA com Fault Tolerance

---

### [security-1] Implementar invariante I-Write-1 (anti-drift) antes do passo 5 do fin010 — ✅ REMEDIADO

**QA**: Security | **Tactic**: Validate Input | **Esforço**: S | **Findings**: F-security-4

**Problema**
> `ReconciliacaoPermutaService.executarBaixa` aceita `bxaMnyValor` do ERP (passo 2) sem compará-lo com `aloc.valorAlocado`. A regra `fin010-write-contract.md:75` exige `|bxaMnyValor − valorEsperadoDaAlocacao| ≤ 0.005`. Quando o em-aberto mudar entre rascunho e execução, o sistema baixa o valor novo silenciosamente.

**Melhoria Proposta**
> Após `val2.responseData?.bxaMnyValor`, comparar com `aloc.valorAlocado × taxaInvoice` com tolerância 0.005. Divergência ⇒ `throw` + `markError(key, ...)` com `erro_mensagem` explícita.

**Resultado Esperado**
> Toda baixa real aborta com mensagem de drift visível ou prossegue dentro de 0.005 BRL de tolerância.

**Métricas de sucesso**
- execuções com drift fora de tolerância sem abort: 0
- cobertura de teste do anti-drift: 0% → 100%

**Risco de não fazer**: baixa silenciosa de valor diferente do rascunho do analista.
**Dependências**: nenhuma

---

### [fault-tolerance-4] Implementar I-Write-1 anti-drift do contrato `fin010` — ✅ REMEDIADO

**QA**: Fault Tolerance | **Tactic**: Sanity Checking (detect) | **Esforço**: S | **Findings**: F-fault-tolerance-4

**Problema**
> `fin010-write-contract.md:75-76` exige `|bxaMnyValor(ERP) − valorEsperadoDaAlocacao| ≤ tolerância` antes do passo 5. Serviço só checa `> 0`.

**Melhoria Proposta**
> Em `ReconciliacaoPermutaService.executarBaixa` (após linha 186), comparar `bxaMnyValor` com `aloc.valorAlocado`. Divergência → `throw`; mensagem clara.

**Resultado Esperado**
> Garantia "valor que o analista vê no preview = valor que será baixado". Falha visível em vez de silenciosa.

**Métricas de sucesso**
- implementação da I-Write-1: 0% → 100%
- tolerância configurável documentada

**Risco de não fazer**: preview dry-run mentiroso quando invoice teve baixa parcial concorrente.
**Dependências**: nenhuma

---

### [integrability-2] Implementar invariante I-Write-1 (anti-drift) no `ReconciliacaoPermutaService` — ✅ REMEDIADO

**QA**: Integrability | **Tactic**: Manage Resource Coupling / Tailor Interface | **Esforço**: S | **Findings**: F-integrability-2, F-integrability-1

**Problema**
> Regra `fin010-write-contract.md:75-76` exige checar `|bxaMnyValor − valorEsperadoDaAlocacao| ≤ 0,005` e abortar em divergência. Serviço só checa `bxaMnyValor > 0`.

**Melhoria Proposta**
> Após capturar `bxaMnyValor` no passo 2, comparar com `aloc.valorAlocado` (mesma moeda do título); se divergir além de 0,005, lançar `ConexosWriteDriftError` (novo erro tipado).

**Resultado Esperado**
> 0 baixas silenciosas com valor divergente da alocação; analista é avisado para refazer.

**Métricas de sucesso**
- Implementação I-Write-1: ausente → presente
- Cobertura anti-drift: 0 → 2 casos (within / divergent)

**Risco de não fazer**: corrupção da fonte da verdade da reconciliação.
**Dependências**: nenhuma

---

### [availability-1] Persistir `borCod` em write-ahead e implementar compensação do borderô órfão — ✅ REMEDIADO (vetor write-ahead)

**QA**: Availability | **Tactic**: Rollback, State Resynchronization | **Esforço**: M | **Findings**: F-availability-1, F-availability-3, F-availability-5

**Problema**
> Quando o handshake `fin010` falha entre passos 1 e 5, o borderô criado no passo 1 fica órfão no ERP sem trilha automática. `borCod` só era persistido via `markError`/`markSettled`; crash do processo entre `criarBordero` e o próximo `await` perdia a referência.

**Melhoria Proposta**
> (1) Gravar `bor_cod` em `permuta_alocacao_execucao` no `beginExecution` do primeiro par (write-ahead estendido); (2) endpoint `POST /permutas/borderos/:borCod/cancelar`; (3) varredura `WHERE status='reconciling' AND atualizado_em < now()-30min`.

**Resultado Esperado**
> 100% dos `borCod` rastreáveis no DB antes do passo 2 (✅ feito); detecção do órfão ≤ 30 min (follow-up); 0 limpeza manual (follow-up).

**Métricas de sucesso**
- % borCod com write-ahead em DB: 0 % → 100 % ✅
- MTTR de detecção do borderô órfão: indefinido → ≤ 30 min (follow-up)

**Risco de não fazer**: lixo crescente no `fin010`; risco de duplicação em re-execução.
**Dependências**: nenhuma — varredura/cancelamento ficam em fault-tolerance-2/availability-4

---

### [integrability-3] Tratar envelope `messages` em `Fin010ValidacaoResponse` — extrair `valid='ERRO'` antes de seguir o handshake — ✅ REMEDIADO

**QA**: Integrability | **Tactic**: Use an Intermediary / Observability of integration failures | **Esforço**: S | **Findings**: F-integrability-3, F-integrability-9

**Problema**
> Conexos pode responder HTTP 200 com `{messages:[{valid:'ERRO', message:'...'}], responseData: null}`. Serviço ignora `messages` completamente e infere "sem em-aberto" quando o real motivo é validação semântica.

**Melhoria Proposta**
> Helper privado `assertValidacaoOk(resp, passo): T` no `ConexosClient`: (a) `messages?[*].valid === 'ERRO'` → lança `ConexosWriteValidationError`; (b) `responseData == null` → mesma exceção; (c) retorna `responseData` tipado. Usar nos passos 2, 3, 4.

**Resultado Esperado**
> Erros de validação ERP viram mensagem semântica em `erp_response`/log; MTTR de incidentes ERP cai de horas para minutos.

**Métricas de sucesso**
- `messages` lido / total de passos: 0/4 → 4/4
- Testes `valid='ERRO'`: 0 → 3

**Risco de não fazer**: troubleshooting custoso; quirks viram bugs intermitentes.
**Dependências**: nenhuma

---

### [testability-1] Adicionar teste unitário ao `PermutaExecucaoRepository` — ✅ REMEDIADO

**QA**: Testability | **Tactic**: Abstract Data Sources / Executable Assertions | **Esforço**: S | **Findings**: F-testability-1

**Problema**
> O repositório que carrega o write-ahead (`beginExecution` com `INSERT ... ON CONFLICT (idempotency_key) DO UPDATE SET status = CASE WHEN ... settled ... END`) e transições terminais não tinha teste. Service mocka 100%; bug no CASE WHEN passaria pelos 8 testes do service.

**Melhoria Proposta**
> `PermutaExecucaoRepository.test.ts` cobrindo: (a) `beginExecution` — `ON CONFLICT (idempotency_key)`, `CASE WHEN ... = 'settled'`, `alreadySettled=true`; (b) `setRequestPayload`; (c) `markSettled`; (d) `markError` — `bor_cod = COALESCE($borCod, bor_cod)`; (e) `findByIdempotencyKey` / `listByAdiantamento`.

**Resultado Esperado**
> Repositório coberto (0 → 6 testes); razão test/source 5/6 → 6/6 = 1.0.

**Métricas de sucesso**
- # testes: 0 → ≥ 6
- Asserções `ON CONFLICT` + `CASE WHEN`: 0 → ≥ 2

**Risco de não fazer**: super-pagamento detectado só na conciliação bancária.
**Dependências**: nenhuma

---

### [deployability-fase3-1] Declarar `CONEXOS_WRITE_ENABLED` e `CONEXOS_DRY_RUN` em `render.yaml`, `DEPLOY.md` e `.env.example` — ✅ REMEDIADO

**QA**: Deployability | **Tactic**: Logical Grouping (feature toggle); Script Deployment Commands | **Esforço**: S | **Findings**: F-deployability-fase3-1, F-deployability-fase3-5

**Problema**
> Flags que controlam a ESCRITA real no ERP existem só no código. Nem `render.yaml`, nem `DEPLOY.md`, nem `.env.example` mencionam.

**Melhoria Proposta**
> (1) `render.yaml` — `- key: CONEXOS_WRITE_ENABLED` (`value: 'false'`) + `- key: CONEXOS_DRY_RUN` (`value: 'true'`). (2) `DEPLOY.md` — tabela de envs com a semântica das combinações. (3) `.env.example` — bloco "Fase 3 — write-back fin010".

**Resultado Esperado**
> Operador configura o flip lendo apenas artefatos de deploy.

**Métricas de sucesso**
- Flags em `render.yaml`: 0/2 → 2/2 ✅
- Flags em `DEPLOY.md`: 0/2 → 2/2 ✅
- Flags em `.env.example`: 0/2 → 2/2 ✅

**Risco de não fazer**: feature entregue mas inoperável.
**Dependências**: nenhuma

---

### [deployability-fase3-2] Escrever runbook `docs/runbooks/permutas-fin010-cutover.md` — ✅ REMEDIADO

**QA**: Deployability | **Tactic**: Scale Rollouts (canary); Deployment observability | **Esforço**: S | **Findings**: F-deployability-fase3-3, F-deployability-fase3-4

**Problema**
> ADR-0013 descreve a estratégia mas não há procedure executável. Operador precisa cruzar 3 documentos e inferir a ordem dos 5 passos.

**Melhoria Proposta**
> Runbook com 5 etapas: (1) Pré-condição/`/health`; (2) Etapa hml — `CONEXOS_BASE_URL` para hml, flipar flags, executar baixa real, validar `bxaCodSeq`; (3) Etapa prd canary; (4) Etapa prd ativação; (5) Kill-switch.

**Resultado Esperado**
> Cutover executável por qualquer operador em ≤ 30 min sem leitura prévia de ADR.

**Métricas de sucesso**
- Runbooks em `docs/runbooks/`: 0 → ≥ 1 ✅
- Passos de cutover documentados: 0/5 → 5/5 ✅

**Risco de não fazer**: destravamento do risco arquitetural #1 vira ato heroico.
**Dependências**: deployability-fase3-1, deployability-fase3-3

---

## P1 — Alto

### [integrability-1] Probar HML antes do go-live: capturar 3 HARs adicionais (baixa parcial, DESCONTO, finalização)

**QA**: Integrability | **Tactic**: Contract testing / Tailor Interface | **Esforço**: M | **Findings**: F-integrability-1, F-integrability-6, F-integrability-7

**Problema**
> Contrato `fin010` vem de 1 HAR (JUROS-cheia). 3 caminhos críticos (baixa parcial, DESCONTO, finalização) têm código entregue mas nunca foram observados; habilitar `WRITE_ENABLED=true` cria risco de corrupção/payload rejeitado/borderô pendurado.

**Melhoria Proposta**
> Antes do toggle de produção: rodar manualmente cada um dos 3 caminhos em `columbiatrading-hml.conexos.cloud`, capturar HARs, persistir em `__fixtures__/conexos/fin010/{passo,cenario}.json`, atualizar `Fin010Baixa.ts`, cobrir com testes.

**Resultado Esperado**
> Caminhos cobertos passam de 1/4 → 4/4.

**Métricas de sucesso**
- Cenários HAR-real cobertos: 1/4 → 4/4
- Fixtures: 0 → 15
- Itens "fora do contrato": 3 → 0

**Risco de não fazer**: dupla baixa lateral por borderô fantasma; baixa em valor errado; payload DESCONTO rejeitado.
**Dependências**: nenhuma — **pré-requisito do `WRITE_ENABLED=true`**

---

### [integrability-4] Adicionar schemas Zod no boundary write (`Fin010Baixa.ts`)

**QA**: Integrability | **Tactic**: Encapsulate / Contract testing | **Esforço**: S | **Findings**: F-integrability-4, F-integrability-6

**Problema**
> Tipos write (`BorderoCriado`, `BaixaGravada`, `Fin010ValidacaoResponse<T>`) são puramente TS — sem parse no boundary. `bxaCodSeq` pode chegar como string, `borCod` como `null`.

**Melhoria Proposta**
> `src/backend/domain/client/permutas/fin010Schemas.ts` com 5 schemas (`borderoCriadoSchema`, `tituloBaixaValidacaoSchema`, etc.) com `.passthrough()`. Parsear nos 5 métodos do `ConexosClient` ANTES de retornar.

**Resultado Esperado**
> Wire shape inesperado é detectado em segundos no boundary.

**Métricas de sucesso**
- Métodos write com Zod parse: 0/5 → 5/5
- Schemas Zod definidos: 0 → 5

**Risco de não fazer**: corrupção silenciosa de `permuta_alocacao_execucao`.
**Dependências**: idealmente alinha com integrability-1

---

### [integrability-5] Mover `buildFinalPayload` para o `ConexosClient` (encapsulamento do passo 5)

**QA**: Integrability | **Tactic**: Encapsulate / Tailor Interface | **Esforço**: S | **Findings**: F-integrability-5

**Problema**
> 18 wire-keys vivem no service de orquestração. Constantes obscuras sem comentário. Substituir o ERP exige rewrite do service.

**Melhoria Proposta**
> Mover `buildFinalPayload` para método privado do `ConexosClient` (ou pure function em `Fin010Baixa.ts`). Service passa apenas insumo de domínio.

**Resultado Esperado**
> Service fica com 0 wire-keys; cost-of-change de "swap ERP" cai.

**Métricas de sucesso**
- Wire-keys em `ReconciliacaoPermutaService.ts`: 18 → 0
- Wire-keys em `ConexosClient.ts`/`Fin010Baixa.ts`: +18

**Risco de não fazer**: cada feature write futura replica o anti-padrão.
**Dependências**: ideal após integrability-4

---

### [integrability-6] Persistir fixtures HAR-real do `fin010` e fazer CI diff contra payload de referência

**QA**: Integrability | **Tactic**: Contract testing / Versioning strategy | **Esforço**: S | **Findings**: F-integrability-6, F-integrability-1

**Problema**
> Payload canônico vive em `fin010-write-contract.md` como JSONC (não parseável). Cada teste duplica o shape.

**Melhoria Proposta**
> Persistir HARs como `__fixtures__/conexos/fin010/passo-{1..5}.{json,response.json}`. Substituir mocks inline por `JSON.parse(fs.readFileSync(fixturePath))`. Estender `scripts/conexos-probe.ts` com modo `--write-dry` para diff em CI nightly.

**Resultado Esperado**
> Contrato vira código + dado parseável. CI nightly detecta drift em ≤24h.

**Métricas de sucesso**
- Fixtures: 0 → 15
- Testes parseando fixture vs inline mock: 0 → 6
- CI nightly drift-check: ausente → presente

**Risco de não fazer**: upgrade do ERP vira surto.
**Dependências**: integrability-1

---

### [integrability-7] Implementar finalização do borderô

**QA**: Integrability | **Tactic**: Orchestrate / Manage Resource Coupling | **Esforço**: M | **Findings**: F-integrability-7, F-integrability-1

**Problema**
> Cada `reconciliar` cria um borderô com `borVldFinalizado:0` e NUNCA chama um passo 6 de finalização. Borderôs ficam pendurados; auditoria/fiscal precisa de borderô fechado.

**Melhoria Proposta**
> Após o último par adto↔invoice settled, chamar `ConexosClient.finalizarBordero({filCod, borCod, borDtaFinalizado})` (wire a confirmar em HML). Se ALGUM par falhou, manter aberto e emitir `BUSINESS_WARN`.

**Resultado Esperado**
> 0 borderôs abertos por execuções 100% sucesso; analista usa Conexos só para resolver erros.

**Métricas de sucesso**
- Borderôs abertos pós-sucesso completo: 100% → 0%
- `finalizarBordero`: ausente → presente + testado

**Risco de não fazer**: automação "80%"; ROI Fase 3 reduzido.
**Dependências**: integrability-1

---

### [integrability-8] Bloquear `WRITE_ENABLED=true` quando `BASE_URL` apontar para produção sem ACK

**QA**: Integrability | **Tactic**: Discover Service / Restrict Communication Paths | **Esforço**: S | **Findings**: F-integrability-8

**Problema**
> A regra `I-Write-5` (homologação-first) é convenção, não enforcement. Deploy errado leva o write para produção sem ninguém perceber.

**Melhoria Proposta**
> No `EnvironmentProvider`, validar no boot: se `conexosWriteEnabled === true` E `conexosBaseUrl !~ /^https?:\/\/.*-hml\.conexos\.cloud/` E `CONEXOS_PROD_WRITE_ACK !== 'I-have-read-fin010-write-contract'` → lançar `WriteEnabledInProdWithoutAckError`.

**Resultado Esperado**
> Deploy errado em produção falha rápido e ruidoso no boot.

**Métricas de sucesso**
- Enforcement "WRITE_ENABLED ⇒ HML or ACK": ausente → presente
- Boot falha se inconsistente: implementado + testado

**Risco de não fazer**: baixa irreversível em produção sem testes prévios em HML.
**Dependências**: alinha com internalização do transporte

---

### [availability-3] Classificar `CONEXOS_UPSTREAM_TIMEOUT` no client

**QA**: Availability | **Tactic**: Exception Detection, Monitor | **Esforço**: S | **Findings**: F-availability-4

**Problema**
> Tipo `CONEXOS_UPSTREAM_TIMEOUT` está declarado mas nenhum throw site classifica timeout — todos caem em `CONEXOS_UPSTREAM_ERROR`.

**Melhoria Proposta**
> Helper `classifyConexosCause(err)` que devolve `'CONEXOS_UPSTREAM_TIMEOUT'` quando `err?.code === 'ECONNABORTED'` ou similar; caso contrário `'CONEXOS_UPSTREAM_ERROR'`. Aplicar nos 5 catches de write.

**Resultado Esperado**
> 100% dos timeouts ECONNABORTED rotulados como `CONEXOS_UPSTREAM_TIMEOUT`.

**Métricas de sucesso**
- % erros classificados como timeout: 0% → > 80%

**Risco de não fazer**: dashboards futuros mascaram duas naturezas sob mesmo rótulo.
**Dependências**: nenhuma

---

### [availability-4] Job de varredura de execuções presas em `reconciling`

**QA**: Availability | **Tactic**: Condition Monitoring, State Resynchronization | **Esforço**: M | **Findings**: F-availability-5, F-availability-3

**Problema**
> Linhas `permuta_alocacao_execucao.status='reconciling'` que ficam "presas" (crash, lambda recycle, timeout) nunca evoluem.

**Melhoria Proposta**
> Cron 15 min: `WHERE status = 'reconciling' AND atualizado_em < now() - INTERVAL '15 minutes'`. Para cada hit, reconciliar contra ERP via `bor_cod`; baixa existe → `markSettled`; não → `markError`.

**Resultado Esperado**
> 0 linhas `reconciling` ficam presas > 30 min.

**Métricas de sucesso**
- tempo p99 de linha em `reconciling`: indefinido → < 30 min
- linhas `reconciling > 1h`: 0 estável

**Risco de não fazer**: trilha de auditoria apodrece.
**Dependências**: [availability-1]

---

### [availability-5] Health check com probe do path de escrita Conexos

**QA**: Availability | **Tactic**: Ping/Echo, Self-Test, Degradation | **Esforço**: S | **Findings**: F-availability-6

**Problema**
> `GET /health` devolve `{status:'ok'}` mesmo quando `fin010` está rejeitando 100% dos POSTs.

**Melhoria Proposta**
> `GET /health/conexos` que reusa `conexosService.ensureSid()` e devolve `{conexos: 'ok' | 'degraded'}` com `cause` quando degraded.

**Resultado Esperado**
> Operador sabe em < 1 min que Conexos está fora.

**Métricas de sucesso**
- MTTD do incidente Conexos: minutos → < 1 min

**Risco de não fazer**: continua descobrindo outage por canal humano.
**Dependências**: nenhuma

---

### [deployability-fase3-3] Expor estado das flags em `/health` (ou `/health/flags`)

**QA**: Deployability | **Tactic**: Deployment observability | **Esforço**: S | **Findings**: F-deployability-fase3-5, F-deployability-fase3-1

**Problema**
> Pós-flip de `CONEXOS_WRITE_ENABLED` o operador só sabe se pegou olhando o log de startup.

**Melhoria Proposta**
> Estender `/health` (ou criar `/health/flags`) para devolver `{ version, conexosWriteEnabled, conexosDryRun, conexosBaseUrl }`. Lê do `EnvironmentProvider` (refletindo cache).

**Resultado Esperado**
> Operador confirma o flip em 1 curl. Auditor consegue carimbar timestamp do estado da flag.

**Métricas de sucesso**
- Chaves de flag expostas em `/health`: 0 → 4
- Teste de contrato: ausente → presente

**Risco de não fazer**: confirmação do flip permanece em log volátil.
**Dependências**: nenhuma

---

### [deployability-fase3-4] Permitir flip de `CONEXOS_BASE_URL` sem redeploy (`sync: false`)

**QA**: Deployability | **Tactic**: Scale Rollouts (blue/green) | **Esforço**: S | **Findings**: F-deployability-fase3-4

**Problema**
> `render.yaml:31-32` declara `CONEXOS_BASE_URL` com `value:` literal — alternar hml↔prd exige PR + autoDeploy (2 deploys por ciclo).

**Melhoria Proposta**
> (1) `render.yaml:31-32` para `sync: false`. (2) Garantir `EnvironmentProvider` lê no boot e documentar restart necessário.

**Resultado Esperado**
> Ciclo de validação em hml cai de 2 deploys para 1 restart.

**Métricas de sucesso**
- `CONEXOS_BASE_URL`: `value: hard-coded` → `sync: false`
- Ciclo hml: 2 deploys → 1 restart

**Risco de não fazer**: validação em hml fica cara → tentação de pular.
**Dependências**: nenhuma

---

### [deployability-fase3-5] Política de migration reversível — começar pela `0015`

**QA**: Deployability | **Tactic**: Rollback | **Esforço**: S | **Findings**: F-deployability-fase3-2

**Problema**
> 0/15 migrations têm `down`. `0015` é trivialmente reversível — desperdício de oportunidade barata.

**Melhoria Proposta**
> (1) `migrations/down/0015_permuta_alocacao_execucao_down.sql` com `DROP TABLE IF EXISTS`. (2) Documentar política no ADR-0013. (3) Estender `MigrationRunner` com método `down(name)` opcional.

**Resultado Esperado**
> Política instaurada com custo S.

**Métricas de sucesso**
- Migrations com `down`: 0/15 → 1/15
- Política documentada: 0 → 1 menção

**Risco de não fazer**: pressão futura para reverter em incidente exige SQL ad-hoc.
**Dependências**: nenhuma

---

### [modifiability-1] Quebrar `reconciliar` em sub-métodos (cognitive 23 → ≤ 15)

**QA**: Modifiability | **Tactic**: Refactor / Split Module | **Esforço**: S | **Findings**: F-modifiability-1

**Problema**
> `reconciliar` tem cognitive complexity 23 (lint warn ativo, alvo 15). Mistura validação, resolução de modo, loop, criação preguiçosa de borderô, tratamento de erro em 95 linhas.

**Melhoria Proposta**
> Extrair 3 métodos: `resolveExecutionMode(input,env)`, `ensureBordero(borCod, filCod, dataMovto)`, `processarUmaAlocacao(...)`. Manter `reconciliar` como orquestrador puro.

**Resultado Esperado**
> Cognitive de `reconciliar`: 23 → ≤ 10. Lint sem warning. Cada sub-método testável.

**Métricas de sucesso**
- Cognitive: 23 → ≤ 10
- Warnings Biome: 1 → 0
- Testes por sub-método: 0 → 3

**Risco de não fazer**: em 6 meses vira intocável.
**Dependências**: nenhuma

---

### [modifiability-2] Separar `ConexosFin010WriteClient` do `ConexosClient`

**QA**: Modifiability | **Tactic**: Split Module / Increase Semantic Coherence | **Esforço**: M | **Findings**: F-modifiability-2

**Problema**
> `ConexosClient.ts` tem 1608 LOC com 17 métodos misturando 14 leituras com 5 escritas. Banner-comentário l.992 já reconhece a fronteira.

**Melhoria Proposta**
> `src/backend/domain/client/ConexosFin010WriteClient.ts` `@singleton() @injectable()`. Mover 5 métodos write + tipos de `Fin010Baixa.ts`.

**Resultado Esperado**
> `ConexosClient.ts`: 1608 → ~1200 LOC; novo client: ~250 LOC.

**Métricas de sucesso**
- LOC `ConexosClient.ts`: 1608 → ≤ 1200
- LOC `ConexosFin010WriteClient.ts`: ~250
- Tempo de feedback test runner em write: -30%

**Risco de não fazer**: regressão no read pode forçar rollback que derruba a leitura.
**Dependências**: nenhuma — **pré-requisito recomendado antes de `WRITE_ENABLED=true`**

---

### [modifiability-3] Extrair modais de `page.tsx` — começar pelo `ReconciliacaoModal`

**QA**: Modifiability | **Tactic**: Split Module | **Esforço**: S | **Findings**: F-modifiability-3

**Problema**
> `frontend/app/permutas/page.tsx` tem 2311 LOC e 44 hooks num único componente. Modal de reconciliação adicionado a este arquivo; mais 1 modal e passa de 2500 LOC.

**Melhoria Proposta**
> Extrair `components/permutas/ReconciliacaoModal.tsx` recebendo `{adto, open, onClose, onSettled}`. Mover `useCallback abrirReconciliar`/`executarReconciliar` + 3 `useState` reconcil* para dentro.

**Resultado Esperado**
> `page.tsx`: 2311 → ~1900 LOC. 3 hooks a menos.

**Métricas de sucesso**
- LOC `page.tsx`: 2311 → ≤ 2000
- Hooks no `GestaoPermutasPage`: 44 → 41
- Re-renders do `<Table>` por interação no modal: N → 0

**Risco de não fazer**: próximo modal leva a 2500+ LOC.
**Dependências**: nenhuma

---

### [modifiability-4] Externalizar `CONTA_GER_JUROS` para `EnvironmentProvider` / config-by-tenant

**QA**: Modifiability | **Tactic**: Defer Binding — Configuration files | **Esforço**: S | **Findings**: F-modifiability-4

**Problema**
> Conta gerencial `131` está como `const` no topo de `ReconciliacaoPermutaService.ts`. Bloqueia onboarding SaaSo sem fork.

**Melhoria Proposta**
> Adicionar `permutaContaGerJuros: number` + `permutaContaGerJurosDesc: string` ao `EnvironmentVars`, lidos de SSM em prod (`/tenants/{env}/{client}/permuta-conta-ger-juros`).

**Resultado Esperado**
> Trocar conta = SSM put + reset cache; zero redeploy.

**Métricas de sucesso**
- Magic numbers em regras contábeis: 1 → 0
- Tempo de mudança: ~1d → ~5min
- Bloqueador SaaSo: presente → resolvido

**Risco de não fazer**: `131` quebra silenciosamente o 2º tenant.
**Dependências**: nenhuma

---

### [performance-1] Substituir `listAtivas()` + filter por `listByAdiantamento`

**QA**: Performance | **Tactic**: Reduce Overhead | **Esforço**: S | **Findings**: F-performance-1, F-performance-5

**Problema**
> Reconciliação carrega TODAS as alocações ativas do tenant para depois filtrar em JS. Índice `idx_permuta_alocacao_adto` existe mas não é usado.

**Melhoria Proposta**
> `listByAdiantamento(adiantamentoDocCod: string)` em `PermutaAlocacaoRepository` com `WHERE adiantamento_doc_cod = $1 ORDER BY criado_em`. Refatorar `ReconciliacaoPermutaService:81-82`. NÃO remover `listAtivas`.

**Resultado Esperado**
> Linhas lidas: O(total ativas) → O(N do adto) ≈ ≤ 10.

**Métricas de sucesso**
- Rows lidas por reconciliar: total ativas → ≤ 10
- Latência DB-prep: depende-tamanho → ≤ 20ms p95

**Risco de não fazer**: regressão linear silenciosa.
**Dependências**: nenhuma

---

### [performance-2] Aplicar deadline global na rota `/reconciliar`

**QA**: Performance | **Tactic**: Bound Execution Times | **Esforço**: M | **Findings**: F-performance-2, F-performance-7

**Problema**
> Sem `server.timeout` no Express; worst-case ~480s/par. Proxy Render corta em 60s, mas serviço CONTINUA escrevendo. Analista pode refazer e gerar dupla execução.

**Melhoria Proposta**
> (a) `server.setTimeout(60_000)` no `index.ts`. (b) `AbortController` com deadline configurável (`PERMUTA_RECONCILIAR_DEADLINE_MS`, default 45000). Antes de cada par, checar `deadlineRemaining`; se insuficiente → encerrar laço, marcar `error` nos remanescentes, retornar 207.

**Resultado Esperado**
> Worst-case: 480s × N → ≤ 45s. Cliente nunca recebe socket-cut sem estado.

**Métricas de sucesso**
- Latência p95 da rota: ilimitada → ≤ 45s
- % requests cortados sem estado autoritativo: indeterminado → 0%

**Risco de não fazer**: dupla-baixa quando Conexos degradar ou N ≥ 3.
**Dependências**: cross-QA Availability + Fault Tolerance

---

### [performance-5] Cap de N pares síncrono + caminho 202+job para N grande

**QA**: Performance | **Tactic**: Limit Event Response, Bound Queue Sizes | **Esforço**: M | **Findings**: F-performance-7, F-performance-2

**Problema**
> Rota síncrona sem cap. Fase 2 (N:M cross-process) habilita reconciliações com dezenas de pares; qualquer N > ~3 fura o proxy.

**Melhoria Proposta**
> Validar `N ≤ MAX_SYNC_PAIRS` (env, default 5). Acima: 202 com `executionId` e handshake em background.

**Resultado Esperado**
> Rota síncrona limitada a casos com p95 ≤ 45s.

**Métricas de sucesso**
- p95 do POST `/reconciliar` síncrono: ilimitado → ≤ 45s
- % reconciliações terminadas no request: depende-N → 100% para N ≤ 5

**Risco de não fazer**: feature funciona em demo, quebra em uso N:M.
**Dependências**: combinar com performance-2

---

### [fault-tolerance-2] Job detector de linhas `reconciling` presas

**QA**: Fault Tolerance | **Tactic**: Timestamp (detect) | **Esforço**: M | **Findings**: F-fault-tolerance-2

**Problema**
> Se o processo morre entre o POST do passo 5 e o `markSettled`, a linha fica em `reconciling` indefinidamente.

**Melhoria Proposta**
> Job/cron que liste `WHERE status='reconciling' AND atualizado_em < now() - interval '5 minutes'`. Para cada uma, tentar reconciliar contra `fin010`; mínimo: alerta + endpoint `/admin/execucoes/stuck`.

**Resultado Esperado**
> MTTD de uma `reconciling` presa: ∞ → ≤ 5 min.

**Métricas de sucesso**
- cobertura: 0% → 100% das linhas `reconciling > 5min` são reportadas
- tempo médio para detectar: ∞ → ≤ 5 min

**Risco de não fazer**: divergência DB↔ERP cresce silenciosamente.
**Dependências**: nenhuma

---

### [fault-tolerance-3] Reconciliação periódica `permuta_alocacao_execucao` ↔ `fin010`

**QA**: Fault Tolerance | **Tactic**: Reconcile (recover) + Comparison (detect) | **Esforço**: M | **Findings**: F-fault-tolerance-3

**Problema**
> `settled` local nunca é re-verificado contra o `fin010`. Se o analista estornar a baixa manualmente no ERP, nosso painel continua mostrando "settled" indefinidamente.

**Melhoria Proposta**
> Job diário que, para cada linha `settled` com `bxa_cod_seq` recente, confirma via endpoint Conexos que a baixa ainda existe. Divergência → `markError` com `erro_mensagem='estornado no ERP'`.

**Resultado Esperado**
> Invariante "DB ≡ ERP" verificada todo dia. Divergências em ≤ 24h.

**Métricas de sucesso**
- frequência: 0 → 1×/dia
- tempo máximo de divergência: ∞ → 24h

**Risco de não fazer**: relatório mensal usa dado local errado.
**Dependências**: definir endpoint Conexos com Yuri

---

### [security-9] Decidir esquema multi-tenant da `permuta_alocacao_execucao` antes do scale-out

**QA**: Security | **Tactic**: Separate Entities | **Esforço**: M | **Findings**: F-security-9

**Problema**
> Migration `0015` não tem coluna `tenant_id`. Single-tenant OK hoje; multi-tenant SaaSo sem ADR cria janela de cross-tenant leak.

**Melhoria Proposta**
> ADR `ontology/decisions/0014-tenant-isolation-permuta-execucao.md`. Recomendação: schema-per-tenant alinhado com "1 conta AWS por cliente".

**Resultado Esperado**
> ADR aprovada documentando o padrão; próxima migration nasce coerente.

**Métricas de sucesso**
- ADR registrada: 0 → 1
- Tabelas write-audit com plano multi-tenant: 0/N → N/N

**Risco de não fazer**: cross-tenant leak no scale-out — pior incidente possível em SaaSo financeira.
**Dependências**: alinhamento com `infra/`

---

### [testability-2] Component test do modal Baixar (`app/permutas/page.tsx`)

**QA**: Testability | **Tactic**: Sandbox / Limit Structural Complexity | **Esforço**: M | **Findings**: F-testability-2

**Problema**
> Modal de baixa é a única UX que dispara escrita real no `fin010` e não tem teste. `dryRun: undefined` em vez de `false` faz o backend cair em dry-run silencioso; analista pensa que executou.

**Melhoria Proposta**
> Extrair `frontend/components/permutas/ReconciliarModal.tsx`. `__tests__/permutas-reconciliar-modal.test.tsx` com Testing Library: preview, confirmar baixa com `{dryRun: false}` exato, toast com `borCod`/`bxaCodSeq`, caminho de erro.

**Resultado Esperado**
> Modal testado (0 → 4+ testes); page.tsx reduzido.

**Métricas de sucesso**
- # testes modal: 0 → ≥ 4
- LOC `page.tsx`: 2311 → ≤ 2250
- Assert "Confirmar dispara `reconciliarAdiantamento({dryRun:false})`": ausente → presente

**Risco de não fazer**: dry-run silencioso interpretado como execução.
**Dependências**: nenhuma

---

### [testability-3] Teste HTTP contract de `reconciliarAdiantamento` em `lib/api.ts`

**QA**: Testability | **Tactic**: Specialized Interfaces | **Esforço**: S | **Findings**: F-testability-3

**Problema**
> `reconciliarAdiantamento` (lib/api.ts:242-266) é o boundary do write para o backend. Sibling functions têm testes mockando `fetch`; a write-back **mais crítica** não tem.

**Melhoria Proposta**
> `src/frontend/__tests__/permutas-reconciliar-api.test.ts`: mockar `global.fetch`, assertar path encode, method POST, header content-type, body JSON, error path.

**Resultado Esperado**
> Boundary HTTP coberto; 0 → ≥ 3 testes.

**Métricas de sucesso**
- # testes: 0 → ≥ 3
- Cobertura `lib/api.ts` (recorte Fase 3): 0% → 100% da função

**Risco de não fazer**: bug de wire detectado em produção.
**Dependências**: nenhuma

---

## P2 — Médio

### [availability-6] Rate-limit por usuário autenticado em `/permutas/.../reconciliar`

**QA**: Availability | **Tactic**: Removal from Service | **Esforço**: S | **Findings**: F-availability-7

**Problema**
> `heavyRouteLimiter` chaveia por IP. Múltiplos analistas atrás de NAT colidem; um usuário dispara 10 reconciliações/min × 5 chamadas = 50 POSTs/min.

**Melhoria Proposta**
> `writeRouteLimiter` com `keyGenerator: (req) => req.user?.sub ?? req.ip`, `limit: 3` por minuto.

**Resultado Esperado**
> 0 falsos positivos por NAT; teto controlado.

**Métricas de sucesso**
- chamadas write/min/usuário (pior caso): 50 → ≤ 15

**Risco de não fazer**: métrica errada de proteção.
**Dependências**: nenhuma

---

### [availability-7] Reduzir blast-radius do dry-run → escrita: degradation reversível sem reboot

**QA**: Availability | **Tactic**: Reconfiguration, Degradation | **Esforço**: M | **Findings**: F-availability-6 (cross), F-availability-1

**Problema**
> `CONEXOS_WRITE_ENABLED` / `CONEXOS_DRY_RUN` lidos no boot. Virar a chave em incidente requer redeploy/restart — janela de minutos.

**Melhoria Proposta**
> Cache TTL 30s no `EnvironmentProvider` para essas flags, OU persistir em `app_config` em Postgres. Endpoint `POST /admin/write-mode/dry-run` (admin).

**Resultado Esperado**
> Tempo para "forçar dry-run em produção": minutos → < 10 s.

**Métricas de sucesso**
- tempo para dry-run forçado: ~5 min → < 10 s

**Risco de não fazer**: escritas continuam tentando subir borderô enquanto ops espera deploy.
**Dependências**: nenhuma

---

### [availability-8] Teste sad-path de timeout no handshake (passo 2/3/4/5)

**QA**: Availability | **Tactic**: Self-Test | **Esforço**: S | **Findings**: F-availability-8, F-availability-1

**Problema**
> Existe teste do happy path, mas não há cenário simulando `criarBordero` ok + um dos passos seguintes timeout. Regressão no error path passaria silenciosa.

**Melhoria Proposta**
> 4 cenários parametrizados pelo passo que falha (2, 3, 4, 5). Asserts: `markError` chamado com `borCod`, nenhuma chamada subsequente, status `error` retornado.

**Resultado Esperado**
> Cobertura do error path: < 100% → 100%.

**Métricas de sucesso**
- cenários testados: 0/4 → 4/4

**Risco de não fazer**: refatoração quebra silenciosamente o error path.
**Dependências**: facilita [availability-1]

---

### [deployability-fase3-6] Smoke test pós-deploy valida flags + `permuta_alocacao_execucao`

**QA**: Deployability | **Tactic**: Drift detection; Deployment observability | **Esforço**: M | **Findings**: F-deployability-fase3-6, F-deployability-fase3-5

**Problema**
> Nada no pipeline confirma pós-deploy que (a) `permuta_alocacao_execucao` existe com `UNIQUE (idempotency_key)` (b) flags carregaram com valores esperados.

**Melhoria Proposta**
> Step `postDeploy` (ou `npm run smoke`): consulta `information_schema.table_constraints` p/ confirmar `UNIQUE`; chama `/health/flags` e abre alerta se inconsistência.

**Resultado Esperado**
> Drift de schema vira alerta em ≤ 1 deploy.

**Métricas de sucesso**
- Verificações automatizadas pós-deploy: 0 → 2
- Tempo até detecção de drift: indefinido → ≤ 1 deploy

**Risco de não fazer**: janela de baixa duplicada em retry após drift acidental.
**Dependências**: deployability-fase3-3

---

### [security-2] Redigir `dpeNomPessoa`/`pesCod`/valores nos logs do payload `fin010`

**QA**: Security | **Tactic**: Limit Exposure | **Esforço**: S | **Findings**: F-security-2, F-security-3

**Problema**
> Interceptor de request loga `body=${redactSensitive(data)}` em todo POST. `redactSensitive` cobre password/token mas NÃO cobre `dpeNomPessoa`, `pesCod`, `bxaMnyValorPermuta`.

**Melhoria Proposta**
> Estender lista de chaves redigidas, OPCIONALMENTE quando `url` matchar `/fin010`. Alternativa: `redactFin010Payload(body)` específico.

**Resultado Esperado**
> Nome do fornecedor e CNPJ-like não saem em log em produção.

**Métricas de sucesso**
- # nomes de fornecedor em log/dia: ≈ 2/dia → 0
- chaves redigidas no `fin010`: 3 → 6+

**Risco de não fazer**: vazamento de cadeia de suprimentos via log central.
**Dependências**: nenhuma

---

### [security-3] Substituir `data:{preview}` em `logService.info` por identificadores compactos

**QA**: Security | **Tactic**: Limit Exposure | **Esforço**: S | **Findings**: F-security-3, F-security-2

**Problema**
> `ReconciliacaoPermutaService.ts:114-118` loga o `preview` inteiro (com `taxaAdiantamento`, `taxaInvoice`, `bxaMnyJuros`, `bxaDocCod`).

**Melhoria Proposta**
> `data: { adiantamentoDocCod, invoiceDocCod, classificacao, valorAlocado, moeda }`. `request_payload` completo já persiste em `permuta_alocacao_execucao.request_payload` (JSONB).

**Resultado Esperado**
> Log central com "quem fez o quê quando" sem expor taxas.

**Métricas de sucesso**
- tamanho médio do log de dry-run: ≈ 600 chars → ≤ 200 chars
- campos confidenciais em log: 9 → 0

**Risco de não fazer**: trilha de log vira corpus de inteligência financeira.
**Dependências**: nenhuma

---

### [security-4] Boot-banner explícito declarando estado das flags do `fin010` + métrica em `/health`

**QA**: Security | **Tactic**: Change Default Settings + Inform Actors | **Esforço**: S | **Findings**: F-security-1, F-security-7

**Problema**
> Sem boot-log do tipo "[Fase 3] CONEXOS_WRITE_ENABLED=true, CONEXOS_DRY_RUN=false — escrita LIVE no ERP".

**Melhoria Proposta**
> No bootstrap, resolver `EnvironmentProvider` e logar uma linha clara em warn quando `writeEnabled=true && dryRun=false`. Adicionar `writeMode: 'live' | 'dry-run' | 'disabled'` em `/health`.

**Resultado Esperado**
> Toda inicialização emite "modo de escrita ativo".

**Métricas de sucesso**
- boots com banner: 0% → 100%
- tempo até detectar config errada: "primeira baixa" → < 1 min de boot

**Risco de não fazer**: ligar escrita LIVE em ambiente errado sem alerta.
**Dependências**: nenhuma

---

### [security-7] (Documentação) Anotar no ADR-0013 que `/reconciliar` deriva `idempotencyKey` server-side

**QA**: Security | **Tactic**: Separate Entities | **Esforço**: S | **Findings**: F-security-6

**Problema**
> Inconsistência: `/eleicao` e `/ingestao` aceitam header `Idempotency-Key`; `/reconciliar` ignora (chave derivada `permuta:{adto}:{invoice}`). Decisão MAIS segura, não documentada.

**Melhoria Proposta**
> Atualizar ADR-0013 com nota: "/reconciliar ignora `Idempotency-Key` por design — chave server-side garante unicidade impossível de colidir por engano". Repetir comentário no top do handler.

**Resultado Esperado**
> Padrão documentado.

**Métricas de sucesso**
- documentação: ausente → presente em 2 lugares

**Risco de não fazer**: confusão de integração futura.
**Dependências**: nenhuma

---

### [security-8] Endurecer `executadoPor`: rejeitar com 401 quando `req.user?.sub` ausente

**QA**: Security | **Tactic**: Audit Trail + Identify Actors | **Esforço**: S | **Findings**: F-security-8

**Problema**
> `routes/permutas.ts:371`: `const executadoPor = req.user?.sub ?? req.user?.email ?? 'unknown';`. Hoje o middleware impede `'unknown'`, mas o fallback aceita a string.

**Melhoria Proposta**
> Substituir `?? 'unknown'` por guard explícito: `if (!req.user?.sub) { res.status(401).json({error:'No subject'}); return; }`. Adicionar `CHECK (executado_por <> 'unknown' AND executado_por <> '')` na próxima migration.

**Resultado Esperado**
> Toda baixa executada com ator nomeado ou rejeitada com 401.

**Métricas de sucesso**
- linhas com `executado_por='unknown'`: 0 → 0 garantido por constraint

**Risco de não fazer**: baixa sem ator nomeado em caso de auditoria.
**Dependências**: nenhuma

---

### [security-5] Kill-switch dinâmico para `CONEXOS_WRITE_ENABLED` (releitura sem restart)

**QA**: Security | **Tactic**: Limit Access + Revoke Access | **Esforço**: M | **Findings**: F-security-1

**Problema**
> `EnvironmentProvider` singleton com cache. Para desligar a escrita em incidente, precisa restart Render — janela de minutos.

**Melhoria Proposta**
> Caminho A: sub-getter `getWriteFlags()` em `EnvironmentProvider` que relê `process.env.CONEXOS_*` a cada chamada. Caminho B: SSM Parameter Store + cache curto.

**Resultado Esperado**
> Tempo p/ kill-switch < 5s.

**Métricas de sucesso**
- tempo p/ flippar: restart-time → < 5s

**Risco de não fazer**: incidente com baixa erronea exige deploy — minutos extras de exposição.
**Dependências**: depende do alvo SSM se caminho B

---

### [modifiability-5] Extrair `buildBasePayload` compartilhado entre preview e final

**QA**: Modifiability | **Tactic**: Abstract Common Services | **Esforço**: S | **Findings**: F-modifiability-5, F-modifiability-6

**Problema**
> `buildPreviewPayload` e `buildFinalPayload` duplicam 8 campos + regra `isDesconto ? 0 : valorVariacao`. Campo novo só no final → preview engana o operador.

**Melhoria Proposta**
> `private buildPayloadBase(aloc, filCod): PayloadBase` retornando 8 campos comuns + classificação. `buildFinalPayload` faz `...base, ...erpFields`. Teste snapshot "base ⊂ preview ∩ final".

**Resultado Esperado**
> 0 campos duplicados; 0 chance de drift silencioso.

**Métricas de sucesso**
- Campos duplicados: 8 → 0
- Teste snapshot: 0 → 1

**Risco de não fazer**: operador aprova preview pensando que conta é X, sistema envia Y.
**Dependências**: combinar com modifiability-1

---

### [modifiability-6] Nomear constantes do payload `fin010` em `Fin010Constants.ts`

**QA**: Modifiability | **Tactic**: Encapsulate | **Esforço**: S | **Findings**: F-modifiability-6

**Problema**
> 12 literais numéricos não-nomeados (`docTip:2`, `borVldTipo:2`, `titCod:1`, `frontModelName:'baixa'`, …).

**Melhoria Proposta**
> `domain/interface/permutas/Fin010Constants.ts` com `export const FIN010 = { DOC_TIP_INVOICE: 2, BOR_VLD_TIPO_PERMUTA: 2, ... }`. Documentar fonte (HAR + `business-rules/fin010-write-contract.md`).

**Resultado Esperado**
> Magic numbers: 12 → 0 nomeados.

**Métricas de sucesso**
- Literais não-nomeados: 12 → ≤ 3
- Pontos de definição da semântica: 2 (duplicada) → 1

**Risco de não fazer**: busca/substituição errada quando ERP adicionar `docTip=3`.
**Dependências**: combinar com modifiability-5

---

### [performance-4] Instrumentar duração por passo do handshake

**QA**: Performance | **Tactic**: Bound Execution Times (precondição) | **Esforço**: S | **Findings**: F-performance-6

**Problema**
> Não há medida de latência por passo. Sem isso, dimensionar a deadline em performance-2 é chute.

**Melhoria Proposta**
> `const t0 = performance.now(); ...; logService.info({type:BUSINESS_INFO, data:{passo, durationMs, retries}})`. Adicionar `summary` com `totalMs` e `perPairMs[]`.

**Resultado Esperado**
> Visibilidade p50/p95 por passo em produção.

**Métricas de sucesso**
- Métricas emitidas por passo: 0 → 5

**Risco de não fazer**: deadlines viram folclore; SLO sem base.
**Dependências**: nenhuma

---

### [performance-6] Adicionar `LIMIT` aos `selectMany` do escopo (defesa em profundidade)

**QA**: Performance | **Tactic**: Bound Execution Times | **Esforço**: S | **Findings**: F-performance-1

**Problema**
> `listAtivas` e `listByAdiantamento` usam `selectMany` SEM `LIMIT`.

**Melhoria Proposta**
> `listByAdiantamento`: `LIMIT 200`. `listAtivas`: `LIMIT 50000` e logar warning se atingir.

**Resultado Esperado**
> Worst-case rows lidas bounded.

**Métricas de sucesso**
- SELECTs sem LIMIT: 1 → 0
- Alertas de cap-hit: instrumentado

**Risco de não fazer**: regressão sem cap = degradação do tenant.
**Dependências**: nasce junto com performance-1

---

### [fault-tolerance-5] Aceitar `Idempotency-Key` HTTP no endpoint `/reconciliar`

**QA**: Fault Tolerance | **Tactic**: Sanity Checking + Idempotent Replay | **Esforço**: S | **Findings**: F-fault-tolerance-5

**Problema**
> `/reconciliar` não lê `Idempotency-Key` ao contrário de `/eleicao`. Duplo-clique do analista dispara duas executions paralelas.

**Melhoria Proposta**
> Espelhar `/eleicao`: ler header; segunda request com mesma key retorna resultado da primeira. Frontend gera UUID per clique.

**Resultado Esperado**
> Duplo-clique produz exatamente uma execução.

**Métricas de sucesso**
- `/reconciliar` honra `Idempotency-Key`: não → sim

**Risco de não fazer**: paralelização dos passos 2-5 em rede lenta.
**Dependências**: alinhamento com frontend

---

### [fault-tolerance-6] Tabela de histórico append-only de tentativas

**QA**: Fault Tolerance | **Tactic**: Audit (cross-QA Security) | **Esforço**: M | **Findings**: F-fault-tolerance-6

**Problema**
> `UPDATE` in-place sobrescreve `erro_mensagem`/`erp_response`. Reabertura `error→reconciling→settled` perde histórico das tentativas.

**Melhoria Proposta**
> Tabela paralela `permuta_alocacao_execucao_evento (id, execucao_id, evento, payload jsonb, criado_em)`. Cada `beginExecution`/`markSettled`/`markError` insere evento.

**Resultado Esperado**
> Histórico completo auditável. `GET /execucoes/:key/eventos`.

**Métricas de sucesso**
- colunas de auditoria com histórico: 0 → 1 tabela append-only

**Risco de não fazer**: post-mortem cego.
**Dependências**: migration

---

### [fault-tolerance-7] Teste de partial-batch para `ReconciliacaoPermutaService.reconciliar`

**QA**: Fault Tolerance | **Tactic**: Recovery: forward (validar testes) | **Esforço**: S | **Findings**: F-fault-tolerance-7

**Problema**
> 9 testes cobrem 1 par. Partial-batch garantido por construção, mas não testado.

**Melhoria Proposta**
> 3 testes: (1) múltiplas alocações, todas sucesso; (2) falha no meio (par-2 de 4); (3) falha no `criarBordero` → nenhuma prossegue.

**Resultado Esperado**
> Comportamento de fault-tolerance contratado e blindado.

**Métricas de sucesso**
- cenários partial-batch testados: 0/3 → 3/3

**Risco de não fazer**: regressão silenciosa em permuta múltipla (caso #1).
**Dependências**: nenhuma

---

### [integrability-9] Instrumentar métrica per-passo do handshake

**QA**: Integrability | **Tactic**: Observability of integration failures | **Esforço**: S | **Findings**: F-integrability-9, F-integrability-3

**Problema**
> Hoje a falha do handshake é logada como "permuta reconciliacao FALHOU" sem distinguir o passo.

**Melhoria Proposta**
> Envolver cada `await this.conexosClient.X(...)` num try/catch que enriquece `BUSINESS_WARN` com `step: 'validarTituloBaixa' | ... | 'gravarBaixaPermuta'`. Persistir `erro_passo` em `permuta_alocacao_execucao`.

**Resultado Esperado**
> Operação responde "em qual passo estamos perdendo mais baixas?" sem `grep`.

**Métricas de sucesso**
- Granularidade do log: 1 nível → 4 níveis
- Coluna `erro_passo`: ausente → presente

**Risco de não fazer**: incidentes ERP demoram mais para isolar.
**Dependências**: sinergia com integrability-3

---

### [testability-4] Abstrair `todayUtcMidnightMs` para `ClockProvider`

**QA**: Testability | **Tactic**: Limit Non-Determinism | **Esforço**: S | **Findings**: F-testability-4

**Problema**
> `routes/permutas.ts:39-42` lê `new Date()` direto. Sítio de não-determinismo (Bass).

**Melhoria Proposta**
> Opção A: `useFakeTimers()` + `setSystemTime` em teste do `todayUtcMidnightMs()`. Opção B: mover para `domain/libs/clock/ClockProvider.ts` `@singleton() @injectable()` com `nowUtcMidnightMs()`.

**Resultado Esperado**
> `new Date()` em src Fase 3: 1 → 0 (Opção B) OU 1 defendido por `setSystemTime` (Opção A).

**Métricas de sucesso**
- # `new Date()` não-abstraídos: 1 → 0
- # testes com `setSystemTime`/`ClockProvider` mock: 0 → ≥ 1

**Risco de não fazer**: bug de fuso na contabilidade.
**Dependências**: cross-link Modifiability

---

### [testability-5] Adicionar assertions sobre os log-points

**QA**: Testability | **Tactic**: Built-in Monitors / Executable Assertions | **Esforço**: S | **Findings**: F-testability-5

**Problema**
> Service tem 3 log-points (DRY-RUN, SETTLED, FALHOU). Test mocka mas nunca chama `expect(logService.*).toHaveBeenCalledWith(...)`.

**Melhoria Proposta**
> `expect(logService.info).toHaveBeenCalledWith(expect.objectContaining({type, message, data: expect.objectContaining({...})}))`.

**Resultado Esperado**
> 0 → 3 asserts de log.

**Métricas de sucesso**
- # asserts de log: 0 → 3

**Risco de não fazer**: trilha de auditoria incompleta em produção.
**Dependências**: cross-link Fault Tolerance

---

### [performance-4-extra] (mesmo card que performance-4 listado em P2 acima)

---

## P3 — Baixo

### [performance-7] Validar plano de execução do `idx_permuta_alocacao_execucao_adto` (índice composto opcional)

**QA**: Performance | **Tactic**: Schedule Resources | **Esforço**: S | **Findings**: F-performance-1 (irmão)

**Problema**
> `listByAdiantamento` ordena por `criado_em` mas o índice é só em `(adiantamento_doc_cod)`.

**Melhoria Proposta**
> Avaliar índice composto `(adiantamento_doc_cod, criado_em)`. Migration 0016.

**Resultado Esperado**
> Sort em memória → index scan ordenado.

**Métricas de sucesso**
- `EXPLAIN ANALYZE`: `Sort` step → ausente

**Risco de não fazer**: nulo a curto prazo; P2 se auditoria crescer.
**Dependências**: nenhuma

---

### [modifiability-7] (Defer) Polimorfismo `IFin010Writer` — dry-run vs live

**QA**: Modifiability | **Tactic**: Defer Binding — Polymorphism | **Esforço**: M | **Findings**: F-modifiability-7

**Problema**
> Modo dry-run vs live decidido por `if (dryRun)` no `reconciliar`. Aceitável com 2 modos; ruim com 3º.

**Melhoria Proposta**
> `interface IFin010Writer { executar(par): Promise<ResultadoAlocacao> }` com impls `LiveFin010Writer`/`DryRunFin010Writer`. Resolver via tsyringe token. Executar só quando 3º modo aparecer.

**Resultado Esperado**
> Novo modo = 1 nova classe; 0 branching adicional.

**Métricas de sucesso**
- Modos: 2 (if/else) → N (factory polimórfico)
- Branching no `reconciliar`: 1 → 0

**Risco de não fazer**: defensável manter; promover a P1 se entrar 3º modo.
**Dependências**: modifiability-1

---

### [security-6] Teste explícito do guard-rail dry-run no `ReconciliacaoPermutaService.test.ts`

**QA**: Security | **Tactic**: Limit Access (defesa em profundidade) | **Esforço**: S | **Findings**: F-security-5

**Problema**
> `dryRun = !writeEnabled || env.conexosDryRun || input.dryRunOverride === true` é one-way ratchet correto, mas sem teste assertando "input.dryRunOverride=false NÃO bypassa env.dryRun=true".

**Melhoria Proposta**
> 4 testes: (1) writeEnabled=false → dry-run TRUE; (2) writeEnabled=true, dryRun=true, override=false → TRUE; (3) writeEnabled=true, dryRun=false, override=true → TRUE; (4) writeEnabled=true, dryRun=false, override=undefined → FALSE.

**Resultado Esperado**
> Regressão do guard-rail detectada em CI.

**Métricas de sucesso**
- cobertura dos 4 caminhos: 0% → 100%

**Risco de não fazer**: refatoração pode abrir bypass acidental.
**Dependências**: nenhuma

---

### [testability-6] Invariante "preview ⊆ final" entre `buildPreviewPayload` e `buildFinalPayload` (property-based)

**QA**: Testability | **Tactic**: Executable Assertions / Specialized Interfaces | **Esforço**: S | **Findings**: F-testability-6

**Problema**
> Preview e final são funções separadas. Sem teste de invariante cross-function, podem divergir silenciosamente.

**Melhoria Proposta**
> (a) Adicionar `fast-check` a devDeps do BE; (b) 1 property test gerando alocações `{variacaoClassificacao, variacaoResultado}` e assertando que 5 campos críticos são iguais entre preview e final.

**Resultado Esperado**
> `fast-check` instalado; 1 property test (100 runs).

**Métricas de sucesso**
- # property-based tests em src/backend: 0 → ≥ 1
- # invariantes preview↔final assertadas: 0 → ≥ 5 campos

**Risco de não fazer**: drift silencioso entre o que o analista vê e o que o ERP recebe.
**Dependências**: testability-1

---
