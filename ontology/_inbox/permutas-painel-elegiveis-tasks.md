# Tasks: permutas-painel-elegiveis

**Feature:** Permutas Frente I — Fatia 1 · "Painel de pendências elegíveis" (READ-ONLY)
**Spec source:** `ontology/_inbox/permutas-painel-elegiveis-interview.md` (interview, P0-4 OPEN)
**Worktree:** `/private/tmp/permutas-painel-wt/` · **Branch:** `feat/permutas-painel-elegiveis`
**Ontology diff:** yes — `entities/{adiantamento,invoice,declaracao-importacao,variacao-cambial,permuta-candidata}.md`,
`actions/{eleger-adiantamentos,avaliar-elegibilidade,casar-invoice,calcular-variacao-cambial,expor-no-painel}.md`,
`business-rules/{elegibilidade-permuta,di-xor-duimp,classificacao-juros-desconto,aging-anchor}.md`,
`state-machines/elegibilidade-permuta-candidata.md`, `integrations/conexos.md`, `decisions/0004-...md`,
`_index.json` (v0.2.1). **entity_changed: true** (diff já presente e aprovado).
**Estimated scope:** **L** (1 client extension + 5 services + 1 repository + 2 Postgres tables + 2 endpoints; frontend opcional separado).
**ObservabilityAdvisor:** chamado (novo "job" `elegerAdiantamentos` + 2 endpoints). Guidance dobrada nas AC das Tasks 8/9/10/11. Agente: `a8d151e69094e218e`.

---

## Convenções de arquitetura (valem para todas as tasks de código)

> O código novo nasce **DDD/Lambda-ready** mesmo no runtime Express atual (migration-debt B1/O4).
> Não migrar o Express inteiro nesta fatia — só o código novo cumpre o alvo.

- **Camadas:** `service @injectable` → `repository @injectable` → `client @singleton @injectable`. Resolver via `container.resolve()` — nunca `new`.
- **tsyringe:** decorators `@injectable()`/`@singleton()` em toda classe de DI; registrar `PostgreeDatabaseClient` no container (`appContainer.ts`).
- **Zod nos boundaries:** validar payloads do Conexos (rows wire) e inputs de rota. Sem `!` non-null; usar guards/Zod.
- **SQL parametrizado:** sempre via `PostgreeDatabaseClient` + `SqlBuilder` (`$nome`). Nunca interpolação de string.
- **Estilo:** classes exportadas (nunca funções soltas); métodos arrow `public x = () => {}`; modificadores de acesso explícitos; identificadores em **inglês**; campos espelho-de-DB em PT-BR OK (`priCod`, `mnyTitPermutar`).
- **Tenant (P6 / Rule #2):** `tpdCod`/`gerNum`/`vldStatus` Columbia (`priCod=1153`) como **constantes tipadas**, nunca hardcode de tenant em service.
- **READ-ONLY (I4):** zero escrita em `fin010`. Persistência própria (snapshot/auditoria) é **a única** escrita permitida, e só em Postgres.
- **Constantes de estado tipadas (P3):** `EstadoElegibilidade` (`DESCOBERTA|ELEGIVEL|BLOQUEADA`) e `MotivoBloqueio` (`composto-nm|sem-invoice|multiplas-invoices|falha-gate|data-base-indisponivel`) como enums/const — nunca strings cruas.
- **Probe/HITL:** itens marcados **🔬 PROBE** (Conexos dev tenant) ou **⏸ GATED-P0-4** **não bloqueiam o verde** — ver "Definition of Done".

> Todos os arquivos `src/...` abaixo são **a criar** salvo onde diz "(estender)". Os caminhos seguem o Directory Map do CLAUDE.md.

---

## Task list

### Task 1: Tipos de domínio + constantes tipadas (entidades + estados)
**Objetivo:** materializar as 5 entidades da ontologia como interfaces/tipos TS e as constantes de estado/motivo, base de todo o resto. Sem lógica.

**Files to change/create:**
- `src/backend/domain/interface/permutas/Adiantamento.ts`
- `src/backend/domain/interface/permutas/Invoice.ts`
- `src/backend/domain/interface/permutas/DeclaracaoImportacao.ts`
- `src/backend/domain/interface/permutas/VariacaoCambial.ts`
- `src/backend/domain/interface/permutas/PermutaCandidata.ts`
- `src/backend/domain/interface/permutas/EstadoElegibilidade.ts` (const `ESTADO_ELEGIBILIDADE` + `MOTIVO_BLOQUEIO` + tipos)

**Acceptance criteria:**
- [ ] Cada interface espelha as propriedades da entidade correspondente em `ontology/entities/*.md` (ex.: `Adiantamento` tem `docCod, priCod, dataEmissao, valor, moeda, pago, valorPermutar, exportador`).
- [ ] `DeclaracaoImportacao.dataBase` é `Date | undefined` (⏸ GATED-P0-4: declarada, populável só após probe).
- [ ] `VariacaoCambial` inclui `delta, resultado, classificacao: 'JUROS'|'DESCONTO', contaContabil: '130'|'131'`.
- [ ] `PermutaCandidata` é **shape 1:1** (`invoiceCasada?: Invoice`, não coleção) + `estadoElegibilidade`, `motivoBloqueio?`, `aging?: number`, `gatesAvaliados`.
- [ ] `ESTADO_ELEGIBILIDADE`/`MOTIVO_BLOQUEIO` são const tipadas (não string crua); valores batem com a state-machine.
- [ ] `npm run typecheck` ✅ · `npm run lint` ✅
**Dependencies:** none
**Probe/HITL:** ⏸ GATED-P0-4 só em `dataBase` (não bloqueia).

---

### Task 2: Constantes de tenant Columbia + Zod schemas wire (Conexos)
**Objetivo:** centralizar os IDs de tenant e os schemas Zod que validam as rows wire do Conexos consumidas nesta fatia.

**Files to change/create:**
- `src/backend/domain/client/permutas/conexosPermutasConstants.ts` (`TPD_PROFORMA=99`, `TPD_INVOICE=128`, `VLD_STATUS_FINALIZADO=['3']`, placeholder do filtro `adiantamento`)
- `src/backend/domain/client/permutas/conexosPermutasSchemas.ts` (Zod p/ row PROFORMA/INVOICE `com298`, título `com308`, declaração `imp019`/`imp223`)

**Acceptance criteria:**
- [ ] IDs como constantes tipadas exportadas — nenhum literal de tenant inline em service (Rule #2).
- [ ] Schema Zod rejeita row sem `docCod`/`priCod`; coage números com segurança (sem `!`).
- [ ] Há uma constante única `ADIANTAMENTO_FILTER_KEY` com **TODO 🔬 PROBE** apontando o build-probe da chave wire (ex.: `adiantamento#EQ:'S'`) — valor provisório isolável.
- [ ] Schema de declaração valida `priCod` + `variante`; o campo de `dataBase` fica **opcional** com comentário ⏸ GATED-P0-4.
- [ ] `typecheck` ✅ · `lint` ✅ · teste unit do schema (parse válido/ inválido).
**Dependencies:** Task 1
**Probe/HITL:** 🔬 PROBE (chave `adiantamento`), ⏸ GATED-P0-4 (campo data-base).

---

### Task 3: Estender `ConexosClient` — eleição PROFORMA (Adiantamento=SIM) + lista-todas
**Objetivo:** adicionar o caminho de eleição da ação `elegerAdiantamentos` ao `ConexosClient` (reuso de leitura). Hoje `listFinanceiroAPagar` **exige `priCods`** e **não** tem o filtro booleano `adiantamento`.

**Files to change/create:**
- `src/backend/domain/client/ConexosClient.ts` (estender) — novo método `listAdiantamentosProforma({ filCod })` que lista **todas** via `com298/list` com `tpdCod#EQ=99` + `vldStatus#IN=['3']` + filtro booleano `adiantamento` (P0-3), **sem** `priCod#IN` (P0-7: lista todas, multi-filial).
- `src/backend/domain/client/ConexosClient.test.ts` (estender)

**Acceptance criteria:**
- [ ] Novo método NÃO depende de `priCods` (a eleição lista todas; P0-7). Reusa `paginate` existente (`PAGE_SIZE=500`, `MAX_PAGES=50`).
- [ ] Filtro wire usa `ADIANTAMENTO_FILTER_KEY` da Task 2 (build-probe isolado num único ponto).
- [ ] Mapeia row → `Adiantamento` (Task 1) com `pago` via `isPago` (Gate 3) e `dataEmissao` via `parseDate`.
- [ ] Erros embrulhados em `ConexosError` (padrão atual); `paginate` que bate `MAX_PAGES` é detectável (ver Task 8 AC de WARN cap-hit).
- [ ] Teste: mock legacy retorna 2 páginas → método devolve união paginada; `tpdCod=99`/`vldStatus=['3']`/filtro `adiantamento` presentes no body.
- [ ] `typecheck` ✅ · `lint` ✅ · `npm test` (ConexosClient) ✅
**Dependencies:** Task 1, Task 2
**Probe/HITL:** 🔬 PROBE — o **literal** da chave `adiantamento`; com placeholder, o método e o teste fecham verde (teste assere a presença da chave, não o valor de produção).

---

### Task 4: Estender `ConexosClient` — re-introduzir leitura D.I (`imp019`) XOR DUIMP (`imp223`)
**Objetivo:** re-introduzir o lado-leitura de declaração aduaneira **podado no ADR-0003** (migration-debt O3), escopo **existência (XOR) + data-base**, para o Gate 4 e o aging.

**Files to change/create:**
- `src/backend/domain/client/ConexosClient.ts` (estender) — `listDeclaracaoByProcesso({ priCods, filCod })` retornando `{ variante, priCod, dataBase? }[]` lendo `imp019/list` (D.I) e `imp223/list` (DUIMP).
- `src/backend/domain/client/ConexosClient.test.ts` (estender)

**Acceptance criteria:**
- [ ] Retorna a **existência** por `priCod` em ambas as variantes (suficiente p/ o Gate 4 XOR **hoje** — não depende de P0-4).
- [ ] `dataBase` extraído quando o campo wire for conhecido; enquanto P0-4 aberto, `dataBase` fica `undefined` com TODO ⏸ GATED-P0-4 isolado num único mapper (não chutar nome de campo).
- [ ] Teste: processo com só D.I → `[{variante:'DI'}]`; só DUIMP → `[{variante:'DUIMP'}]`; ambos → 2 entradas (o XOR é decidido no service, Task 5); nenhum → `[]`.
- [ ] `typecheck` ✅ · `lint` ✅ · `npm test` (ConexosClient) ✅
**Dependencies:** Task 1, Task 2
**Probe/HITL:** ⏸ GATED-P0-4 — extração de `dataBase` (existência/XOR fecha verde sem o probe).

---

### Task 5: Testes falhos (TDD) — regras de elegibilidade, casamento, variação, aging
**Objetivo:** **primeiro escrever os testes** das business-rules canônicas (ainda sem impl) para fixar o comportamento antes das Tasks 6/7. Âncora: PDF processo `2048` (priCod=1153).

**Files to change/create:**
- `src/backend/domain/service/permutas/ElegibilidadeService.test.ts`
- `src/backend/domain/service/permutas/CasamentoInvoiceService.test.ts`
- `src/backend/domain/service/permutas/VariacaoCambialPermutaService.test.ts`
- `src/backend/domain/service/permutas/AgingService.test.ts`

**Acceptance criteria (casos canônicos a codificar):**
- [ ] **elegibilidade-permuta (I3):** 1 adiantamento + 1 invoice + D.I, 4 gates verdes → `ELEGIVEL`; mesma candidata sem invoice → `BLOQUEADA(sem-invoice)`; múltiplas invoices → `BLOQUEADA(composto-nm)`; `valorPermutar=0` → `BLOQUEADA(falha-gate)`; não totalmente pago → `BLOQUEADA(falha-gate)`.
- [ ] **di-xor-duimp (I2):** só D.I → válido; só DUIMP → válido; ambas → `BLOQUEADA(falha-gate)` (anomalia XOR); nenhuma → `BLOQUEADA(data-base-indisponivel)`.
- [ ] **classificacao-juros-desconto (P0-1):** `taxaInvoice>taxaAdiantamento` → JUROS, `resultado=delta`, conta **131**; `<` → DESCONTO, `resultado=|delta|`, conta **130**; iguais → sem juros/desconto. `delta = principalMoeda × (taxaInvoice − taxaAdiantamento)`.
- [ ] **aging-anchor (P0-8):** `aging = hoje − dataBase`; com `dataBase` mockada da D.I/DUIMP. **Caso ⏸ GATED-P0-4:** `dataBase` indisponível → `aging` undefined/pendente, candidata **não falha** por isso (ainda elegível se gates ok; aging só não popula).
- [ ] Os testes **falham** (vermelho) por falta de impl — confirmam o TDD.
**Dependencies:** Task 1
**Probe/HITL:** ⏸ GATED-P0-4 só no caso de aging-sem-data (codificado como "pendente", não como falha).

---

### Task 6: Service `ElegibilidadeService` + `CasamentoInvoiceService` (4 gates + casamento)
**Objetivo:** implementar `avaliarElegibilidade` (4 gates) e `casarInvoice` (1:1), fazendo os testes da Task 5 passarem.

**Files to change/create:**
- `src/backend/domain/service/permutas/ElegibilidadeService.ts` (`@injectable`)
- `src/backend/domain/service/permutas/CasamentoInvoiceService.ts` (`@injectable`)

**Acceptance criteria:**
- [ ] Gate 1 (tipo PROFORMA) e Gate 3 (`isPago`) derivados do payload já lido (Task 3). Gate 2 via `ConexosClient.getMnyTitPermutar({docCod})` (`> 0`). Gate 4 via `listDeclaracaoByProcesso` (Task 4): XOR de existência → `data-base-indisponivel` se nenhuma, `falha-gate` se ambas.
- [ ] `casarInvoice` usa `listFinanceiroAPagar({docTip:'INVOICE', priCods:[proc]})` existente; **exatamente 1** finalizada → `invoiceCasada`; 0 → `BLOQUEADA(sem-invoice)`; >1 → `BLOQUEADA(composto-nm)`.
- [ ] `gatesAvaliados` registra resultado por gate (auditoria I5).
- [ ] Estado transita `DESCOBERTA → ELEGIVEL | BLOQUEADA` conforme state-machine (T1/T2); `EXECUTADA` **não** existe (Fatia 2).
- [ ] Testes da Task 5 (elegibilidade + casamento) **passam**; `typecheck` ✅ · `lint` ✅.
- [ ] **PatternGuardian** ✅ (DDD/tsyringe/SQL/tenant) nestes arquivos.
**Dependencies:** Task 3, Task 4, Task 5

---

### Task 7: Service `VariacaoCambialPermutaService` + `AgingService`
**Objetivo:** implementar `calcularVariacaoCambial` (classificação por TAXA, P0-1) e `AgingService` (P0-8), passando os testes da Task 5.

**Files to change/create:**
- `src/backend/domain/service/permutas/VariacaoCambialPermutaService.ts` (`@injectable`)
- `src/backend/domain/service/permutas/AgingService.ts` (`@injectable`)

**Acceptance criteria:**
- [ ] Variação lê `ConexosClient.listTitulosAPagar({docCod})` existente (`titFltTaxaMneg`→taxa, `titMnyValorMneg`→principal). `delta = principalMoeda × (taxaInvoice − taxaAdiantamento)`; JUROS→131, DESCONTO→130, iguais→neutro.
- [ ] `dataBase` **não** entra na fórmula de classificação (só exibição/aging) — confirmar por teste.
- [ ] `AgingService.compute(dataBase)` = `hoje − dataBase` (dias). Se `dataBase` undefined (⏸ GATED-P0-4) → retorna `undefined` (aging "pendente"), **sem** lançar erro.
- [ ] Testes da Task 5 (variação + aging) **passam**; `typecheck` ✅ · `lint` ✅ · **PatternGuardian** ✅.
**Dependencies:** Task 5
**Probe/HITL:** 🔬 PROBE (confirmar doc-fonte com308 das taxas — não bloqueia: fórmula já testada); ⏸ GATED-P0-4 (aging-sem-data).

---

### Task 8: Orquestrador `EleicaoPermutasService` (cadeia + observabilidade do "job")
**Objetivo:** orquestrar a cadeia `elegerAdiantamentos → avaliarElegibilidade → casarInvoice → calcularVariacaoCambial → aging`, produzindo o backlog de `PermutaCandidata` (elegíveis + bloqueadas) por execução. É o "job" (sem scheduler hoje — O4).

**Files to change/create:**
- `src/backend/domain/service/permutas/EleicaoPermutasService.ts` (`@injectable`)
- `src/backend/domain/interface/log/LogInterface.ts` (estender `LogType` com const `FLOW_START|FLOW_COMPLETE|FLOW_ERROR|BUSINESS_INFO|BUSINESS_WARN`; reusar `CONEXOS_ERROR|CONEXOS_DEBUG`)
- `src/backend/domain/service/permutas/EleicaoPermutasService.test.ts`

**Acceptance criteria (incl. ObservabilityAdvisor):**
- [ ] Gera **um `flowId` (UUID) por execução**, presente em **toda** linha de log da run e propagado ao snapshot/auditoria (Task 9).
- [ ] Idempotente (P0-7): recomputa o backlog do zero a cada run; rodar 2× produz o mesmo conjunto.
- [ ] Multi-filial (I6): itera sobre todas as filiais (`listFiliais`).
- [ ] **Log de início** `FLOW_START` (`flowId`, `filiais`, `pageSize`, `maxPages`) e **resumo** `FLOW_COMPLETE` com `{totalCandidatas,totalElegiveis,totalBloqueadas,bloqueadasByMotivo,durationMs,snapshotId}` — **uma** linha-resumo (não 1 por candidata no happy path).
- [ ] **WARN cap-hit:** quando `paginate` atinge `MAX_PAGES` (truncamento silencioso), emite `BUSINESS_WARN` com `capHit:true` + `filCod`. **Teste obrigatório** desse caminho.
- [ ] **Abort:** falha do Conexos (ex.: `ensureSid`) → `FLOW_ERROR` (`flowId`, `error.message`) e a run aborta; nenhuma candidata parcial é persistida (atomicidade — ver Task 9).
- [ ] `LogType` só usa as constantes nomeadas — **nenhuma string crua** no service layer (testável por `type`).
- [ ] Testes (cadeia happy-path, cap-hit WARN, abort) **passam**; `typecheck` ✅ · `lint` ✅ · **PatternGuardian** ✅.
**Dependencies:** Task 6, Task 7

---

### Task 9: Schema Postgres (snapshot + auditoria) + `PermutaSnapshotRepository`
**Objetivo:** fechar O5 (Postgres sem uso) e O6 (auditoria) — tabela de run + snapshot de candidatas, com repository parametrizado. Registrar `PostgreeDatabaseClient` no container.

**Files to change/create:**
- `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts` (`@injectable`)
- `src/backend/migrations/0001_permuta_eleicao.sql` (ou diretório de migration equivalente — criar convenção se inexistente)
- `src/backend/domain/appContainer.ts` (estender) — registrar/`init` do `PostgreeDatabaseClient`
- `src/backend/domain/repository/permutas/PermutaSnapshotRepository.test.ts`

**Acceptance criteria:**
- [ ] Tabela `permuta_eleicao_run`: `id(uuid pk)`, `flow_id`, `started_at`, `finished_at`, `status('success'|'partial'|'error')`, `total_candidatas`, `total_elegiveis`, `total_bloqueadas`, `bloqueadas_by_motivo(jsonb)`, `triggered_by`, `error_message(null)`.
- [ ] Tabela `permuta_candidata_snapshot`: `run_id(fk)`, `doc_cod`, `fil_cod`, `pri_cod`, `status('elegivel'|'bloqueada')`, `motivo_bloqueio(null)`, `aging_days(null — ⏸ GATED-P0-4)`, `invoice_doc_cod(null)`, `variacao_classificacao(null)`, `variacao_resultado(null)`, `created_at`.
- [ ] **Todo SQL parametrizado** via `SqlBuilder` (`$nome`) — zero interpolação (Rule #5).
- [ ] **Atomicidade:** run completa ⇒ 1 row em `permuta_eleicao_run` + 1 row por candidata; run abortada ⇒ `status='error'` + `error_message`, **0** snapshot rows (transação).
- [ ] `flow_id` na DB == `flowId` dos logs (correlação — Task 8).
- [ ] `PostgreeDatabaseClient` registrado no container e `init()` chamado no bootstrap.
- [ ] Teste do repository (mock client) cobre insert da run + snapshot e o caminho de erro; `typecheck` ✅ · `lint` ✅ · **PatternGuardian** ✅.
**Dependencies:** Task 1, Task 8
**Nota infra:** apenas Postgres (cablado). **Sem Terraform/Lambda/EventBridge** nesta fatia — `infra/` **não** é tocado (ver "AwsInfraArchitect" abaixo: não acionado).

---

### Task 10: Endpoint trigger da eleição (rota protegida — substitui o cron, O4)
**Objetivo:** disparar `EleicaoPermutasService` por HTTP (manual), já que não há scheduler hoje (O4). Lambda-ready, mas montado no Express atual.

**Files to change/create:**
- `src/backend/routes/permutas.ts` (novo router; rota `POST /permutas/eleicao`)
- `src/backend/index.ts` (estender) — `app.use('/permutas', heavyRouteLimiter)` + montar router (segue o padrão de `conexos.ts`)
- `src/backend/routes/permutas.test.ts`

**Acceptance criteria:**
- [ ] `POST /permutas/eleicao` resolve `EleicaoPermutasService` via container (nunca `new`); `await bootstrapAppContainer()` no início (padrão de `conexos.ts`).
- [ ] Protegida pela auth middleware existente (`buildAuthMiddleware`) e `heavyRouteLimiter` (fan-out Conexos pesado).
- [ ] `triggered_by` da run = identidade do usuário autenticado (auditoria O6).
- [ ] Responde `{ runId, totalCandidatas, totalElegiveis, totalBloqueadas, status }` ao concluir; erro → 5xx via `errorMiddleware` (sem double-log).
- [ ] Comentário/ADR-note: **EventBridge/cron diário é dívida do alvo (O4)** — esta rota é o trigger provisório.
- [ ] Teste de rota (service mockado) cobre sucesso + auth-required; `typecheck` ✅ · `lint` ✅ · **PatternGuardian** ✅.
**Dependencies:** Task 8, Task 9

---

### Task 11: Endpoint de leitura do painel (`exporNoPainel`)
**Objetivo:** expor o backlog (elegíveis + bloqueadas c/ motivo + aging) a partir do **último snapshot** persistido — READ-ONLY puro.

**Files to change/create:**
- `src/backend/routes/permutas.ts` (estender; `GET /permutas/painel`)
- `src/backend/domain/service/permutas/PainelService.ts` (`@injectable`; lê via `PermutaSnapshotRepository`)
- `src/backend/routes/permutas.test.ts` (estender)

**Acceptance criteria:**
- [ ] `GET /permutas/painel` retorna candidatas do último run: elegíveis e **bloqueadas com `motivoBloqueio`** (ambas visíveis; bloqueada ≠ falha).
- [ ] Cada item traz `aging` quando disponível e **`aging: null/pendente`** quando ⏸ GATED-P0-4 (painel lista a candidata mesmo sem aging).
- [ ] Ordenação do backlog por aging (mais antigo primeiro) quando aging disponível; itens sem aging em bucket separado/estável.
- [ ] Sem snapshot ainda → resposta vazia + WARN `BUSINESS_WARN` (`message:'no snapshot available'`) — não 500.
- [ ] Log `BUSINESS_INFO` com `{requestId,totalElegiveis,totalBloqueadas,snapshotAge}`.
- [ ] **Nenhuma** ação de execução oferecida (I1/I4 — execução é Fatia 2).
- [ ] Teste de rota (repository mockado): com snapshot, sem snapshot; `typecheck` ✅ · `lint` ✅ · **PatternGuardian** ✅.
**Dependencies:** Task 9 (Task 10 recomendada para dados reais, não obrigatória)

---

### Task 12 (OPCIONAL — confirmar com Yuri): Frontend do painel READ-ONLY
**Objetivo:** página Next.js que consome `GET /permutas/painel`. **Recomendação do TaskScoper:** **deferir para uma Fatia 1b** — o frontend hoje só tem login/home (`src/frontend/app/{page,login}`), não há área de permutas, e a coluna **aging fica ⏸ GATED-P0-4** (UI ficaria com coluna incompleta). Incluída aqui como task separada para Yuri decidir se entra agora.

**Files to change/create (se aprovada):**
- `src/frontend/app/permutas/painel/page.tsx`
- `src/frontend/lib/api.ts` (estender; client de `GET /permutas/painel` com Zod — F2 nota: ainda `fetch`+Zod, sem TanStack)
- `src/frontend/__tests__/permutas/painel.test.tsx`

**Acceptance criteria (se aprovada):**
- [ ] Tabela READ-ONLY: processo, adiantamento, invoice casada, classificação (JUROS/DESCONTO), aging, estado/motivo. Sem botão de "executar permuta".
- [ ] Coluna aging exibe "pendente" quando `aging:null` (⏸ GATED-P0-4) — sem quebrar layout.
- [ ] Estados bloqueada exibidos com o `motivoBloqueio` legível.
- [ ] **DesignSystemReviewer gate** ✅ (toca `src/frontend/`).
- [ ] `typecheck`/`lint`/test frontend ✅.
**Dependencies:** Task 11
**Decisão pendente do Yuri:** UI entra na Fatia 1 ou vira Fatia 1b? (recomendação: 1b).

---

## Auto-triggers acionados

- **Novo "job" `elegerAdiantamentos` + 2 endpoints** → **ObservabilityAdvisor** chamado (guidance dobrada nas Tasks 8/9/10/11; follow-up de métricas/alarmes alvo → registrar em `ontology/_inbox/` junto de migration-debt B4).
- **`infra/` NÃO tocado** → **AwsInfraArchitect NÃO acionado**. EventBridge/cron (O4) e Terraform (I1) são **dívida do alvo**, fora de escopo — registrar como follow-up, não implementar.
- **`src/frontend/` tocado** → **DesignSystemReviewer gate** entra **somente se a Task 12 for aprovada**.

---

## Definition of Done

Todas as tasks (1–11; 12 se aprovada) completas **E**:
- [ ] `npm run typecheck` ✅
- [ ] `npm run lint` ✅
- [ ] `npm test` ✅
- [ ] **PatternGuardian** ✅ (DDD/tsyringe/SQL parametrizado/tenant isolation no código novo)
- [ ] **entity_changed=true** → ontology diff presente em `ontology/` ✅ (já presente, v0.2.1)
- [ ] [se Task 12 aprovada] **DesignSystemReviewer** ✅
- [ ] **ObservabilityAdvisor** review aplicado (flowId/correlação, FLOW_COMPLETE summary, WARN cap-hit, auditoria atômica, LogType constants) ✅
- [ ] **Regis-Review gate** após verde (remediar só P0) ✅
- [ ] Rebase de `main` aplicado sem conflitos pendentes ✅
- [ ] [delta tem feat em `src/`] bump de versão do app (FE==BE lockstep) via `scripts/bump-version.ps1` + `CHANGELOG.md` ✅

### Itens NÃO-bloqueantes do verde (probe / gated — não impedem Ship)

- **⏸ GATED-P0-4** (único gap P0 aberto): extração da `dataBase` wire (`imp019`/`imp223`) e, por consequência, a **coluna/valor de aging**. Modelado como `undefined`/"pendente" em todas as camadas; o resto da fatia fecha verde sem ele. Gate 4 (XOR de existência) **funciona hoje**. Quando o probe capturar o campo → um `/feature-tweak DeclaracaoImportacao "popular dataBase via probe P0-4"` liga a coluna aging.
- **🔬 BUILD-PROBE** (Conexos dev tenant — não-bloqueantes): (a) literal da chave wire do filtro `adiantamento` (Task 2/3, valor provisório isolado); (b) confirmar doc-fonte `com308` de `taxaAdiantamento`/`taxaInvoice`/`principalMoeda` (Task 7, fórmula já testada).

---

## Handoff → AutoLoopRunner

**Tasks.md path:** `/private/tmp/permutas-painel-wt/ontology/_inbox/permutas-painel-elegiveis-tasks.md`
**Ordem de execução:** 1 → 2 → (3 ∥ 4) → 5 (TDD vermelho) → (6 ∥ 7) → 8 → 9 → 10 → 11 → [12 se aprovada].
**Pausas HITL previstas:** decisão da Task 12 (UI agora ou 1b); QaCoach roteiro no dev tenant para validar o trigger `POST /permutas/eleicao` (novo handler). P0-4/build-probes **não** pausam o loop (gated/isolados).
