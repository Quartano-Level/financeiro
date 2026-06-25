---
qa: Security
qa_slug: security
run_id: 2026-06-25-1713
agent: qa-security
generated_at: 2026-06-25T17:13:00-03:00
scope: backend,frontend
score: 7
findings_count: 4
cards_count: 4
---

# Security — Regis-Review

> Escopo: delta da feature `permutas-executar-automaticas` — `POST /permutas/reconciliar-lote`
> (bulk write financeiro no `fin010`), service `ReconciliacaoLotePermutaService` e o gatilho
> no front (`Executar todas` em `app/permutas/page.tsx`). Foco em CIA + blast radius dessa
> nova ação **um-clique-muitos-borderôs**.

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Usuário admin autenticado (ou insider com sessão admin / credencial admin vazada) | Clica "Executar todas" → 1 POST cria os borderôs de TODAS as automáticas do painel (sem filtro), escrevendo no `fin010` | `POST /permutas/reconciliar-lote` em `src/backend/routes/permutas.ts:426`, `ReconciliacaoLotePermutaService` em `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts` | Produção; `CONEXOS_WRITE_ENABLED=true` & `CONEXOS_DRY_RUN=false` | Endpoint exige auth + role=admin + heavyRouteLimiter; gating de escrita herdado do `reconciliar` individual; falhas isoladas (continue-on-error); borderô nasce EM CADASTRO (aprovação manual depois); evento `permuta batch reconciliation` com `executadoPor`/`requestId`/totais persistido no log | 0 escritas em ambiente sem `CONEXOS_WRITE_ENABLED`; 100% das execuções com `executadoPor`+`requestId` no log; 0 borderôs auto-finalizados (todos em EM CADASTRO); rate ≤10 req/min por IP |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Endpoints novos com authn obrigatória | 1/1 | 1/1 | ✅ | `routes/permutas.ts:426-447` (auth global + `requireRole('admin')`) |
| Endpoints novos com authz (RBAC admin) | 1/1 | 1/1 | ✅ | `routes/permutas.ts:428` (`requireRole('admin')`) |
| Endpoints novos com rate-limit | 1/1 | 1/1 | ✅ | `routes/permutas.ts:429` (`heavyRouteLimiter` = 10/min/IP — `http/rateLimit.ts:20-26`) |
| Endpoints novos com validação Zod no body | 1/1 | 1/1 | ✅ | `routes/permutas.ts:432-436` (`reconciliarBodySchema.safeParse`) |
| Hardcoded secrets no delta | 0 | 0 | ✅ | `grep -E "(password\|secret\|token\|api[_-]?key\|AKIA)" src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts src/backend/routes/permutas.ts src/frontend/app/permutas/page.tsx src/frontend/lib/api.ts` → nenhum match com credencial |
| SQL não-parametrizado no delta | 0 | 0 | ✅ | `ReconciliacaoLotePermutaService` não toca SQL (orquestra services); herda parametrização do `reconciliar` |
| XSS surface no delta (`dangerouslySetInnerHTML`/`innerHTML`) | 0 | 0 | ✅ | grep nos arquivos de UI do delta — nada |
| Gate de escrita reusado (não-bypassed) pelo lote | sim | sim | ✅ | `ReconciliacaoLotePermutaService.ts:94-99` invoca `reconciliacaoService.reconciliar(...)`, que aplica `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` em `ReconciliacaoPermutaService.ts:116-118` |
| Audit trail server-side da ação em lote | presente (1 evento agregado) | presente (1 agregado **+** por-item) | ⚠️ | `ReconciliacaoLotePermutaService.ts:129-141` loga `permuta batch reconciliation` com `executadoPor`/`requestId`/totais; cada baixa individual também é logada via `reconciliar` (`ReconciliacaoPermutaService.ts:128, 345`). Sem persistência tabular do lote (só log estruturado). |
| Cap server-side de tamanho do lote (defesa em profundidade) | ausente | presente (cap configurável; ex. 200) | ❌ | grep `MAX_LOTE\|batchSize\|ordem\.length` em `ReconciliacaoLotePermutaService.ts` → nada; `for (const docCod of ordem)` itera o que vier do `gestaoService.exporGestao` |
| Confirmação reforçada no front (typed-text para ação irreversível) | apenas clique em "Executar" | typed-text (ex.: digitar "EXECUTAR") ou 2-step explícito | ⚠️ | `frontend/app/permutas/page.tsx:2130-2166` — diálogo informa "irreversível" e mostra contagem, mas é 1 clique |
| 2ª pessoa / 4-eyes para escrita financeira em lote | ausente | desejável p/ ação irreversível em massa | ⚠️ | mesma rota — único admin clica e finaliza |
| Cookies/tokens sensíveis postos em storage pela feature | 0 | 0 | ✅ | grep `localStorage\|sessionStorage` no delta → nada (usa `withAuthHeaders` herdado) |

> ⚠️ **Não medível localmente**: contagem real de borderôs criados por execução em prod, alerta sobre execuções anômalas (X em Y min), e SIEM/CloudTrail das chamadas Conexos. Requer instrumentação no Render + dashboard em cima do `LogService` (BUSINESS_INFO `permuta batch reconciliation`).

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Identify Actors | `req.user.sub`/`email` derivado do JWT verificado por `buildAuthMiddleware` → propagado como `executadoPor` para o service e para o `reconciliar` por baixo | ✅ presente | `routes/permutas.ts:437`, `ReconciliacaoLotePermutaService.ts:68,129-141` |
| Authenticate Actors | Middleware global de auth (verifica JWT, rejeita 401 expirado/inválido) aplica-se antes da rota | ✅ presente | `http/auth.ts:160-173`, teste de rota 401 em `routes/permutas.test.ts:751-763` |
| Authorize Actors | `requireRole('admin')` server-side — 403 para `viewer` (teste cobre); rota não confia em UI | ✅ presente | `routes/permutas.ts:428`, `http/auth.ts:183-200`, teste 403 em `routes/permutas.test.ts:733-749` |
| Limit Access | RBAC admin + `heavyRouteLimiter` (10/min/IP) + endpoint server-side único (não há side-channel via loop client-side); gate de escrita por env (`CONEXOS_WRITE_ENABLED`/`DRY_RUN`) limita o efeito mesmo p/ admin autenticado | ✅ presente | `routes/permutas.ts:428-429`, `http/rateLimit.ts:20-26`, `ReconciliacaoPermutaService.ts:116-118` |
| Limit Exposure | Endpoint só aceita `dataMovto`/`dryRun` no body — não aceita lista de adtos do cliente (universo vem do `gestaoService.exporGestao` server-side); reduz a superfície de "executar coisa diferente". MAS o lote não tem **cap server-side** de quantidade (P1 — vide F-security-1). Borderô nasce EM CADASTRO (não finaliza) — aprovação manual segura como anel adicional. | ⚠️ parcial | `ReconciliacaoLotePermutaService.ts:73-82`; ausência de `MAX_LOTE` confirmada por grep |
| Encrypt Data | HTTPS no Render (herdado); JWT signed via JOSE (herdado); nada novo introduzido pela feature | ✅ presente (herdado) | `http/auth.ts` |
| Separate Entities | N/A no delta (single-tenant Express hoje; isolamento por conta AWS é alvo) | N/A | — |
| Change Default Settings | Default **dry-run**: `dryRun = !writeEnabled \|\| env.conexosDryRun \|\| input.dryRunOverride === true` → produção só escreve se *explicitamente* habilitada | ✅ presente | `ReconciliacaoPermutaService.ts:116-118` |
| Validate Input | `reconciliarBodySchema` (Zod) no boundary — `dataMovto` positivo int, `dryRun` boolean; rejeita extras implicitamente | ✅ presente | `routes/permutas.ts:33-38, 432-436` |
| Detect Intrusion | `console.warn` para 401/403 com método/URL e role observada — granular; sem alerta agregado para padrão "burst de 403 admin" | ⚠️ parcial | `http/auth.ts:167-170, 192-194` |
| Detect Service Denial | `heavyRouteLimiter` devolve 429; sem alarme/métrica agregada que dispare paging | ⚠️ parcial | `http/rateLimit.ts:20-26` |
| Verify Message Integrity | JWT signature via JOSE; HTTPS termina TLS no proxy (Render) | ✅ presente (herdado) | `http/auth.ts` |
| Detect Message Delay | N/A para esta rota síncrona | N/A | — |
| Revoke Access | Token expira (verificado em `errors.JWTExpired`); sem revocation-list server-side (mas RBAC em `req.user.role` é validado a cada request — flip imediato em qualquer refresh do role) | ⚠️ parcial | `http/auth.ts:165-173, 183-200` |
| Lock Computer | N/A — fora do escopo da feature | N/A | — |
| Inform Actors | Diálogo de confirmação no front avisa "irreversível" antes de POSTar; resposta da API traz `dryRun`/`writeEnabled` p/ a UI deixar claro o modo | ✅ presente | `app/permutas/page.tsx:2129-2166`, `ReconciliacaoLotePermutaService.ts:143-151` |
| Audit Trail | Evento agregado `permuta batch reconciliation` com `executadoPor`, `requestId`, `totalCasos`, `totalSettled`, `totalErros`, `borderos`, `dryRun`; cada baixa por par adto↔invoice já é logada e persistida na trilha de execução (`permuta_alocacao_execucao`) pelo `reconciliar` individual reaproveitado | ✅ presente (cross-ref Fault Tolerance) | `ReconciliacaoLotePermutaService.ts:129-141`, `ReconciliacaoPermutaService.ts:128,175,345` |
| Restore | Borderô EM CADASTRO permite cancelar/estornar/excluir via rotas existentes (`/borderos/:borCod/cancelar\|estornar`, `DELETE /borderos/:borCod`) — analista consegue reverter mesmo após o lote rodar | ✅ presente (cross-ref Availability) | `routes/permutas.ts:504-567` |

## 4. Findings (achados)

### F-security-1: Lote de baixa financeira sem cap server-side de tamanho

- **Severidade**: P1
- **Tactic violada**: Limit Exposure (defesa em profundidade)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:65-127`
- **Evidência (objetiva)**:
  ```
  for (const docCod of ordem) { ... reconciliar({...}) ... }
  ```
  Não há `MAX_LOTE`/`batchSize`/`if (ordem.length > N) throw`. O universo (`ordem`) vem de `gestaoService.exporGestao` e pode crescer arbitrariamente (hoje ~26 casos, amanhã N).
- **Impacto técnico**: um admin (legítimo, comprometido ou em erro) dispara N escritas no `fin010` em uma única chamada; combinado com `CONEXOS_WRITE_ENABLED=true` + `CONEXOS_DRY_RUN=false`, o blast radius é o `gestao.casamentos` inteiro (todos os processos que entrarem no painel naquele momento). O rate limit (10/min/IP) NÃO bloqueia isso — é 1 request só.
- **Impacto de negócio**: financeiro recebe uma enxurrada de borderôs EM CADASTRO inesperados; ainda que o estágio EM CADASTRO segure a baixa real, o reverso (cancelar/estornar) é trabalho manual N vezes; janela de auditoria pesada.
- **Métrica de baseline**: `# cap server-side`: 0 (alvo: 1 valor configurável via `EnvironmentProvider`, ex. 200; ou rejeição com `413 Payload Too Large` quando `ordem.length` ultrapassar).

### F-security-2: Confirmação irreversível com 1 clique (sem typed-text / 4-eyes)

- **Severidade**: P2
- **Tactic violada**: Inform Actors (reforço) + Limit Exposure (UX como controle compensatório)
- **Localização**: `src/frontend/app/permutas/page.tsx:2129-2166`
- **Evidência (objetiva)**:
  ```
  <DialogDescription>Cria os borderôs de todas as automáticas de uma vez (baixa real no ERP). Esta ação é irreversível...</DialogDescription>
  <Button onClick={() => void executarLote()}>Executar {loteResumo.adtos} adiantamento(s)</Button>
  ```
  O diálogo informa "irreversível" mas executa com 1 clique no botão. Não há typed-confirmation (ex.: digitar "EXECUTAR") nem segundo aprovador.
- **Impacto técnico**: clique acidental de admin (mouse-slip, multi-tab) cria N borderôs.
- **Impacto de negócio**: o ônus de reverter é grande (cancelar/estornar 1 a 1). Compliance financeiro geralmente exige 4-eyes para escritas em lote.
- **Métrica de baseline**: confirmações por execução: 1 clique (alvo: 2-step com typed-text quando `adtos > limiar`, ex. 10).

### F-security-3: Sem alarme agregado para anomalias de auth/limit (401/403/429 em burst)

- **Severidade**: P2
- **Tactic violada**: Detect Intrusion, Detect Service Denial
- **Localização**: `src/backend/http/auth.ts:167-170,192-194`, `src/backend/http/rateLimit.ts:20-26`
- **Evidência (objetiva)**:
  ```
  console.warn(`[auth] rejected request to ${req.method} ${req.originalUrl}: token expired`)
  console.warn(`[auth] forbidden ${req.method} ${req.originalUrl}: role='${role}' not in [...]`)
  ```
  Linhas vão para o stdout do Render — nenhum sink agregador, nenhum alarme em "X 403 em Y min" ou "burst 429".
- **Impacto técnico**: brute-force/probing/abuse passa despercebido até alguém olhar os logs manualmente.
- **Impacto de negócio**: descoberta tardia de tentativa de uso indevido do botão "Executar todas" (alvo natural de um insider).
- **Métrica de baseline**: alarmes ativos para 401/403/429: 0 (alvo: 1 alarme por categoria em Logtail/CloudWatch com threshold).

### F-security-4: Audit trail do lote vive só em log estruturado (sem tabela própria)

- **Severidade**: P2
- **Tactic violada**: Audit Trail (cross-ref Fault Tolerance)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoLotePermutaService.ts:129-141`
- **Evidência (objetiva)**:
  ```
  await this.logService.info({
      type: LOG_TYPE.BUSINESS_INFO,
      message: 'permuta batch reconciliation',
      data: { requestId, executadoPor, totalCasos, totalSettled, totalErros, borderos: borderos.size, dryRun },
  });
  ```
  Não há tabela `permuta_lote_execucao` (ou similar) que persista o lote como entidade auditável (quem, quando, parâmetros, lista dos borderôs criados). Por-item existe (`permuta_alocacao_execucao` herdado), mas o **agrupamento** "este lote foi disparado por X em T, criou estes Y borderôs" só existe no fluxo de log.
- **Impacto técnico**: investigação retroativa depende de retenção/parsing de log estruturado; se o log for rotacionado, perde-se a trilha agregada.
- **Impacto de negócio**: dificulta auditoria financeira ("liste todos os lotes executados por fulano em junho") e disputa de responsabilidade.
- **Métrica de baseline**: % de execuções em lote com row dedicado em tabela: 0% (alvo: 100%, com FK p/ os borderôs e o `requestId`).

## 5. Cards Kanban

### [security-1] Cap server-side de tamanho do lote `/reconciliar-lote`

- **Problema**
  > Hoje o lote itera N adiantamentos sem teto: 1 clique de admin pode disparar dezenas/centenas de escritas no `fin010`. Combinado com `CONEXOS_WRITE_ENABLED=true`, o blast radius é todo o `gestao.casamentos` da janela. O `heavyRouteLimiter` (10 req/min) não ajuda porque é 1 request só.
- **Melhoria Proposta**
  > Adicionar `MAX_LOTE` (via `EnvironmentProvider`, default 200) em `ReconciliacaoLotePermutaService`. Se `ordem.length > MAX_LOTE`, abortar com erro tipado (HTTP 413) **antes** de chamar o primeiro `reconciliar` e logar a tentativa com `executadoPor`. Tactic: **Limit Exposure**.
- **Resultado Esperado**
  > Toda execução com universo > MAX_LOTE é rejeitada server-side. Métrica: `# cap server-side`: 0 → 1.
- **Tactic alvo**: Limit Exposure
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-security-1
- **Métricas de sucesso**:
  - cap configurável: ausente → presente
  - rejeições com `413` quando estourado: 0 → mensurável no log
- **Risco de não fazer**: um admin (legítimo ou não) cria de uma vez muito mais borderôs do que o financeiro consegue revisar/cancelar; janela de exposição financeira aumenta com o painel.
- **Dependências**: nenhuma

### [security-2] Confirmação reforçada (typed-text) para "Executar todas" quando o lote é grande

- **Problema**
  > O botão "Executar todas as automáticas" hoje executa após 1 clique no diálogo, ainda que a descrição diga "irreversível". Em ação irreversível de escrita financeira em massa, 1 clique acidental cria N borderôs cujo reverso é manual.
- **Melhoria Proposta**
  > No diálogo `confirmLoteOpen` (`frontend/app/permutas/page.tsx:2130`), quando `loteResumo.adtos > 10`, exigir que o usuário digite a palavra "EXECUTAR" (case-sensitive) em um input antes de habilitar o botão. Manter o 1-clique p/ lotes pequenos. Tactic: **Inform Actors** (reforço de UX como controle compensatório de **Limit Exposure**).
- **Resultado Esperado**
  > Execuções de lote grande passam por 2 etapas (clique + typed-text). Métrica: cliques para acionar > 10 borderôs: 1 → 2.
- **Tactic alvo**: Inform Actors
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-security-2
- **Métricas de sucesso**:
  - typed-confirmation para lote > 10: ausente → presente
  - cliques acidentais com efeito > 10 borderôs: possível → improvável
- **Risco de não fazer**: incidente de "mouse-slip" cria dezenas de borderôs em produção; reverso manual queima horas do financeiro.
- **Dependências**: card `security-1` (o limiar e o cap devem conversar entre si)

### [security-3] Alarme agregado para anomalias de auth/limit (401/403/429)

- **Problema**
  > `console.warn` em 401/403 + `429` do `heavyRouteLimiter` vão pro stdout do Render sem agregação/alarme. Burst de probing/abuse contra `/permutas/reconciliar-lote` (ou qualquer rota admin) passa despercebido até inspeção manual.
- **Melhoria Proposta**
  > Encaminhar logs estruturados (`LogService` BUSINESS_WARN) para um sink agregador (Logtail/Datadog/CloudWatch) e criar 1 alarme por categoria: 401 burst (>20/min), 403 burst (>10/min), 429 burst (>30/min). Notificar via canal on-call. Tactics: **Detect Intrusion**, **Detect Service Denial**.
- **Resultado Esperado**
  > Tentativas anômalas geram página para o on-call. Métrica: alarmes ativos para 401/403/429: 0 → 3.
- **Tactic alvo**: Detect Intrusion / Detect Service Denial
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-security-3
- **Métricas de sucesso**:
  - MTTD (mean time to detect) de probing: indeterminado → <15 min
  - alarmes configurados: 0 → 3
- **Risco de não fazer**: insider ou cred-stuffing investe contra o botão mais perigoso sem ser detectado.
- **Dependências**: decisão de sink de logs (sai do escopo desta feature)

### [security-4] Persistir o lote como entidade auditável (tabela `permuta_lote_execucao`)

- **Problema**
  > A trilha agregada de "um lote rodou" só existe em log estruturado (`BUSINESS_INFO: permuta batch reconciliation`). Auditoria retroativa ("quais lotes a Maria disparou em junho? quais borderôs cada um criou?") depende de retenção/parsing de log. Por-item já temos `permuta_alocacao_execucao`, mas o agrupamento "este request criou esta lista de borderôs" se perde.
- **Melhoria Proposta**
  > Criar tabela `permuta_lote_execucao` (id, request_id, executado_por, iniciado_em, finalizado_em, total_casos, total_settled, total_erros, dry_run, write_enabled) + tabela filha `permuta_lote_item` (FK lote, adiantamento_doc_cod, pri_cod, status, bor_cod, erro). Gravar dentro do `ReconciliacaoLotePermutaService.reconciliarLote` (após o loop). Tactic: **Audit Trail** (cross-ref Fault Tolerance).
- **Resultado Esperado**
  > 100% dos lotes têm row próprio com lista de borderôs criados. Métrica: % execuções persistidas em tabela: 0% → 100%.
- **Tactic alvo**: Audit Trail
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-security-4
- **Métricas de sucesso**:
  - execuções de lote com persistência tabular: 0 → 100%
  - query "lotes por executor por janela": indisponível → 1 SELECT
- **Risco de não fazer**: investigação de incidente financeiro empaca por falta de evidência agregada; compliance fica vulnerável.
- **Dependências**: nenhuma (esquema novo isolado)

## 6. Notas do agente

- Pontos positivos relevantes do delta: a rota nasceu com `requireRole('admin')` + `heavyRouteLimiter` + Zod + `executadoPor` derivado do JWT (não do corpo), e o gating de escrita NÃO é afrouxado pelo lote — o service reusa integralmente `ReconciliacaoPermutaService.reconciliar`, que ancora `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` em `EnvironmentProvider`. Testes de rota cobrem 200/401/403 e o teste-200 confirma propagação de `executadoPor`/`dryRunOverride`. Nenhum secret/SQL-inline/XSS introduzido pelo delta.
- Cross-QA: **Audit Trail** (F-security-4 / card security-4) sobrepõe-se a **Fault Tolerance** (persistência agregada do lote ajuda RCA). **Limit Exposure** (F-security-1 / card security-1) sobrepõe-se a **Availability** (limitar tamanho do lote também protege o Conexos contra fan-out enorme em 1 request). **Inform Actors** (card security-2) tem leitura conjunta com **Usability/Modifiability** (UX de confirmação reforçada).
- Não medível localmente: alertas no sink de log (não há sink); contagem real de borderôs por execução em prod; baseline de 401/403 por minuto em produção. Recomendação: instrumentar `LogService` para um sink agregador + dashboards (card security-3).
- Decisão de escopo: NÃO abrimos finding para Detect Intrusion no nível "blanket" — RBAC server-side + Zod no boundary + cap proposto (card security-1) já cobrem a maior parte; o gap restante (alarmes) virou card security-3 em vez de finding P1, porque a rota é nova e o tráfego ainda é baixo.
