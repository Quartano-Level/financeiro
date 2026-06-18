---
qa: Integrability
qa_slug: integrability
run_id: 2026-06-18-2039
agent: qa-integrability
generated_at: 2026-06-18T20:39:00-03:00
scope: all
score: 6.5
findings_count: 6
cards_count: 6
---

# Integrability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Time financeiro (Fase B) integra nova fonte (modelo relacional Postgres) entre `ConexosClient` (read-only) e frontend `lib/api.ts` | Mudança de shape em `GET /permutas/gestao` (novo campo `referencia`, `processamentoStatus`, semântica `fonte:'banco'\|'fixture'`) + ingestão diária que precisa enriquecer `valorMoedaNegociada` via fan-out `listTitulosAPagar` | Boundary triplo: `interface/permutas/Gestao.ts` (backend) ↔ `routes/permutas.ts` (wire) ↔ `frontend/lib/types.ts` + `lib/api.ts` (consumer) | Dev local + dev tenant Columbia (Conexos vivo, Postgres semeado em transição) | Frontend renderiza `pendentes/invoicesEmAberto/casamentos` sem `undefined` runtime; fallback `fixture` ativa apenas em falha real do backend; campo novo (`referencia`) flui do Conexos `com298.docEspNumero` até a UI sem quebra | 100% das tuplas exibidas com `referencia` definida (≠ docCod) quando o título tem `docEspNumero`; 0 erros de schema mismatch no console; tempo de integrar próximo campo Conexos < 1 dia (1 mapper + 1 coluna SQL + 1 sync de types) |

> Cenário aplicado: a "integração nova" não é um sistema externo — é o **modelo relacional Postgres** alimentado pela ingestão diária, sentado entre o `ConexosClient` (read-only) e o frontend. A Fase B introduz uma 2ª borda de contrato (`GET /permutas/gestao`) cujo shape em `interface/permutas/Gestao.ts` precisa casar **bit-a-bit** com `frontend/lib/types.ts` — não há geração de tipos, é convenção manual.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| `# clients com método HTTP genérico exposto` (Encapsulate) | 0 (ConexosClient só expõe `list*`/`get*` de domínio) | 0 | ✅ | `grep -n "^\s*public " src/backend/domain/client/ConexosClient.ts` |
| `# services Permutas que importam axios/fetch diretamente` | 0 | 0 | ✅ | `grep -rn "axios\|fetch" src/backend/domain/service/permutas` |
| `# wrappers HTTP no frontend` | 1 (`lib/api.ts`) com 3 call-sites diretos `fetch()` dentro dele | 1 wrapper, sem `fetch()` espalhado | ⚠️ | `grep -rn "fetch(" src/frontend/lib src/frontend/app` |
| `# call-sites frontend → backend fora de `lib/api.ts`` | 0 | 0 | ✅ | `grep -rn "fetch(" src/frontend/app` |
| Validação de schema **na resposta** `GET /permutas/gestao` (consumer-side) | 0 (frontend faz `as Partial<GestaoPermutasResponse>` + `??` defensivos) | Zod parse no boundary do `fetchGestaoPermutas` | ❌ | `src/frontend/lib/api.ts:44` |
| Validação de schema **no request** `POST /processar` | ✅ Zod `processarBodySchema` | Zod | ✅ | `src/backend/routes/permutas.ts:14-17` |
| Validação de schema **na resposta** `com298/list` (backend ↔ Conexos) | parcial (`com298RowSchema.parse` em `listAdiantamentosProforma`; ausente em `listFinanceiroAPagar` e `listTitulosAPagar`) | Zod em todos os mappers do Conexos | ⚠️ | `src/backend/domain/client/ConexosClient.ts:602,1051` |
| `referencia` cobertura em `pendentes` (Conexos → UI) | 100% (mapper cai em `docCod` como fallback no service, mas o wire vem do `mapDocPagar:1260`) | 100% quando `docEspNumero` ou `priEspRefcliente` existem | ✅ | `src/backend/domain/client/ConexosClient.ts:1260-1265` |
| `valorMoedaNegociada` cobertura em `pendentes` quando candidata é **bloqueada** | 0% (campo só é hidratado dentro de `if (estadoElegibilidade === ELEGIVEL && invoiceCasada)`) | UX previsível: campo definido (0 ou número) também para bloqueadas | ❌ | `src/backend/domain/service/permutas/EleicaoPermutasService.ts:522` |
| `# integrações com versão explícita no URL/header` | 0 (Conexos não expõe versão; Supabase via SDK) | best-effort onde provider suporta | ⚠️ N/A justificado | `grep -rn "/v[0-9]" src/backend/domain/client/ConexosClient.ts` |
| Contract test com fixture-based parsing (resposta do `GET /permutas/gestao` parseada por `lib/types.ts` no frontend) | 0 testes E2E backend↔frontend; tests unitários ok dos dois lados isolados | 1 test cross que carregue uma fixture do `Gestao.ts` e valide via tipos do frontend | ❌ | `find src/frontend -name "*.test.*" | xargs grep -l "Gestao"` (vazio) |
| Frontmatter "fonte" no contrato | backend só emite `'banco'`; frontend aceita `'banco' \| 'fixture'` | union alinhada (frontend pode emitir `'fixture'` localmente) | ✅ | `interface/permutas/Gestao.ts:49` + `frontend/lib/types.ts:75` |

> ⚠️ **Não medível localmente**: error-rate por dependência (Conexos vs Postgres vs SharePoint/GED não existentes). Requer CloudWatch metrics por client (`ConexosError` count, pool errors). Recomendação: instrumentar contador por `endpoint` no `ConexosError.catch` e exportar como métrica dedicada.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Encapsulate | `ConexosClient` expõe apenas métodos de domínio (`listAdiantamentosProforma`, `listTitulosAPagar`, `getDetalheTitulos`, …) — nenhum `request/post/call` genérico vazado | ✅ presente | `ConexosClient.ts:367-1106` (13 métodos `list*`/`get*`) |
| Use an Intermediary | `GestaoPermutasService` intermedia frontend ↔ `PermutaRelationalRepository` + `PermutaProcessamentoRepository`, montando o DTO `GestaoPermutasResponse` (anti-corruption layer entre modelo relacional e wire) | ✅ presente | `GestaoPermutasService.ts:36-85` |
| Restrict Communication Paths | Frontend só atinge backend via `lib/api.ts` (3 funções públicas: `fetchFiliais`, `fetchGestaoPermutas`, `processarAdiantamento`). Components não fazem `fetch()` direto | ✅ presente | `grep -rn "fetch(" src/frontend/app` → 0 hits |
| Adhere to Standards | HTTP JSON com Bearer Supabase; sem versionamento explícito no path `/permutas/gestao` (provider Conexos também não versiona) | ⚠️ parcial | `routes/permutas.ts:63` (sem `/v1/`) |
| Abstract Common Services | Auth no frontend via `withAuthHeaders()`; backend reusa `RetryExecutor`/`BoundedConcurrency`. **Mas** o boilerplate `if (!res.ok) {...} catch{} throw new Error(...)` é duplicado 3x em `lib/api.ts` | ⚠️ parcial | `src/frontend/lib/api.ts:16-23,43-44,84-91` |
| Discover Service | `process.env.NEXT_PUBLIC_API_URL` no frontend (default localhost:3001); backend lê SSM (alvo) — convenção `/tenants/{env}/{client}/{name}` ainda não materializada (estado atual = Supabase/Render) | ⚠️ parcial | `lib/api.ts:5` |
| Tailor Interface | `Gestao.ts` (backend) tailored como DTO mínimo da tela; deduplicado em `frontend/lib/types.ts` por cópia manual | ⚠️ parcial — duplicação manual | `Gestao.ts:1-59` vs `frontend/lib/types.ts:25-85` |
| Configure Behavior | Fixture fallback ligado via runtime check (não env-flag) — `fetchGestaoPermutas` cai em `gestaoPermutasFixture` ao receber arrays vazios | ⚠️ parcial (lógica acoplada, não configurável) | `lib/api.ts:45-47` |
| Manage Resources | `BoundedConcurrency` no fan-out Conexos (`ADIANTAMENTOS_CONCURRENCY`); advisory lock `INGEST_LOCK_KEY=918273645` serializa ingestão | ✅ presente | `EleicaoPermutasService.ts:357-366` + `IngestaoPermutasService.ts:37,94` |
| Orchestrate | `IngestaoPermutasService.executar` orquestra `EleicaoPermutasService.computeCandidatas` → repositório relacional (upsert × 4 + replace + markStale) → snapshot back-compat; tudo em uma transação | ✅ presente | `IngestaoPermutasService.ts:64-152` |
| Manage Resource Coupling | Repositórios injetam via tsyringe; `GestaoPermutasService` resolve 3 colaboradores (relational + processamento + log) — abaixo do limite de 3 | ✅ presente | `GestaoPermutasService.ts:28-34` |
| Contract Testing | Backend: `ConexosClient.test.ts` existe (mock); **inexistente** entre `Gestao.ts` (backend) e `lib/types.ts` (frontend) — nada garante que os dois shapes não derivem | ❌ ausente | `find src -name "*.test.*" -path "*gestao*"` → só testes unitários isolados |
| Versioning Strategy | Endpoint `/permutas/gestao` sem versão; campo novo (`processamentoStatus`) entrou como opcional (compatível). Sem ADR de política | ⚠️ parcial | `routes/permutas.ts:63` |
| Backward-Compatibility Shims | Ingestão escreve **dois** modelos (relacional + snapshot back-compat `/painel`) — preserva consumer antigo enquanto Fase B amadurece. Bom shim local; custo: dupla escrita | ✅ presente | `IngestaoPermutasService.ts:116-128` |
| Observability of Integration Failures | `ConexosError` carrega `endpoint`+`priCod`; logs `BUSINESS_WARN`/`FLOW_ERROR` no `LogService`. Sem métrica agregada por integração (Postgres pool vs Conexos vs futuro Nexxera) | ⚠️ parcial | `EleicaoPermutasService.ts:466-478` |

## 4. Findings (achados)

### F-integrability-1: Shape de `GestaoPermutasResponse` duplicado manualmente entre backend e frontend (sem contract test)

- **Severidade**: P1
- **Tactic violada**: Contract Testing, Tailor Interface
- **Localização**: `src/backend/domain/interface/permutas/Gestao.ts:1-59` ↔ `src/frontend/lib/types.ts:25-85`
- **Evidência (objetiva)**:
  ```
  Backend Gestao.ts:8       export type StatusElegibilidade = 'elegivel' | 'bloqueada';
  Frontend types.ts:25      export type StatusElegibilidade = 'elegivel' | 'bloqueada'

  Backend Gestao.ts:49      fonte: 'banco';
  Frontend types.ts:75      fonte: 'banco' | 'fixture'      ← divergência intencional, sem teste
  ```
  Há **8 interfaces idênticas** copiadas (`PermutaPendente`, `InvoiceEmAberto`, `CasamentoAdiantamento`, `CasamentoSugerido`, `GestaoPermutasResponse`, `ProcessamentoStatus`, `StatusElegibilidade`) e uma divergência aceita (`fonte`). Nenhum teste detecta drift quando um dos lados muda um campo.
- **Impacto técnico**: Próxima vez que um campo for adicionado/removido (ex.: `valorPermutar` na coluna), o lado esquecido continuará compilando; a quebra só aparece em runtime no navegador (campo `undefined` no JSX). O `lib/api.ts:48-59` mascara a quebra com `?? 0` / `?? []` — silencioso, difícil de diagnosticar.
- **Impacto de negócio**: Risco de regressão silenciosa quando Fase C/D adicionarem colunas (valor BRL, taxa, observação do analista). Time perde 1–2h diagnosticando "por que a tela está em branco" em vez de feature work.
- **Métrica de baseline**: 8 interfaces duplicadas; 0 testes cross. Tempo estimado de drift detection hoje = manual review (≥ 1 review/PR que mexa nos types).

### F-integrability-2: `valorMoedaNegociada` é hidratado SÓ para candidatas elegíveis — `pendentes` bloqueadas exibem 0 (ou undefined coerced para 0)

- **Severidade**: P1
- **Tactic violada**: Tailor Interface, Encapsulate (campo não-uniformemente disponível através do boundary)
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:522-541` ; consequência em `GestaoPermutasService.ts:99` (`a.valorMoedaNegociada ?? 0`)
- **Evidência (objetiva)**:
  ```ts
  // EleicaoPermutasService.ts:522
  if (result.estadoElegibilidade === ESTADO_ELEGIBILIDADE.ELEGIVEL && result.invoiceCasada) {
      const enriched = await this.computeVariacao(...);
      if (enriched.valorMoedaNegociadaAdto !== undefined) {
          candidata.adiantamento = {
              ...candidata.adiantamento,
              valorMoedaNegociada: enriched.valorMoedaNegociadaAdto,
          };
      }
      // ...
  }
  ```
  Para uma candidata **bloqueada** (qualquer Gate reprovado: sem declaração, sem invoice casada, `valorPermutar=0`, etc.) o `listTitulosAPagar` NUNCA é chamado → `valorMoedaNegociada` permanece `undefined` no `AdiantamentoRow` ingerido. A tela mostra `R$ 0,00` (via `?? 0` no service e no formatter) lado-a-lado com `motivoBloqueio` — analista lê como "valor zerado" quando na verdade é "valor não consultado".
- **Impacto técnico**: Não dá pra distinguir "valor=0" de "valor desconhecido" na coluna. Trade-off de performance (evitar fan-out de `listTitulosAPagar` em bloqueadas) está implícito no código sem documentação no DTO.
- **Impacto de negócio**: Analista decide com base na coluna "Valor Moeda Negociada". Bloqueadas aparecendo como "USD 0" induzem dúvida ("é elegível? não casou? por que zero?"). Suporte/treino consome 1–2 perguntas/semana segundo o padrão de fechamento-processos.
- **Métrica de baseline**: 100% das candidatas `bloqueada` exibem `valorMoedaNegociada: 0` no DTO; só `elegivel + invoiceCasada` recebem o valor real. No fixture o problema não aparece porque o fixture preenche tudo (`permutas-fixture.ts:25`).

### F-integrability-3: `lib/api.ts` consome `GET /permutas/gestao` sem validação de schema na resposta (Zod só no request)

- **Severidade**: P1
- **Tactic violada**: Encapsulate (boundary leak), Contract Testing
- **Localização**: `src/frontend/lib/api.ts:38-64`
- **Evidência (objetiva)**:
  ```ts
  const json = (await res.json()) as Partial<GestaoPermutasResponse>
  if (!json?.pendentes?.length && !json?.invoicesEmAberto?.length) {
      return gestaoPermutasFixture
  }
  return {
      fonte: 'banco',
      geradoEm: json.geradoEm,
      pendentes: json.pendentes ?? [],
      // ...
  }
  ```
  O cast `as Partial<>` engole qualquer desvio de shape (campo renomeado, tipo trocado). Pior: se o backend retornar `{}` (ou um erro 500 com body JSON), a UI cai para o **fixture** sem alerta — analista vê dados de demo achando que é produção. O CLAUDE.md exige "validate external inputs with Zod at boundaries" mas o frontend não tem schema Zod aqui.
- **Impacto técnico**: O fixture fallback (`fonte:'fixture'`) deveria ser flagged claramente; hoje a única evidência é o badge `fonte`. Se o JSON do backend tiver shape errado, a UI **não detecta** — segue renderizando com `?? 0`/`?? []`.
- **Impacto de negócio**: Demo/review podem rodar com dados de fixture sem ninguém perceber, levando o sponsor a achar que o backend está vivo. Risco direto na cerimônia de aceite.
- **Métrica de baseline**: 0 chamadas Zod no `src/frontend/lib`; 3 `fetch()` boilerplates duplicados (`api.ts:13,40,76`).

### F-integrability-4: Mappers do `ConexosClient` para `valorMoedaNegociada` e `referencia` sem Zod (regressão de campo passa silenciosa)

- **Severidade**: P2
- **Tactic violada**: Encapsulate, Contract Testing (boundary externo)
- **Localização**: `src/backend/domain/client/ConexosClient.ts:1051-1066` (`listTitulosAPagar`) e `:1242-1265` (`mapDocPagar`)
- **Evidência (objetiva)**:
  ```ts
  // listTitulosAPagar - sem schema parse, só parseOptionalNumber
  return rows.map<TituloAPagar>((r) => {
      const valorNegociado = this.parseOptionalNumber(r.titMnyValorMneg);
      const taxa = this.parseOptionalNumber(r.titFltTaxaMneg);
      // ...
  });
  ```
  `listAdiantamentosProforma` valida via `com298RowSchema.parse` (linha 602), mas `listFinanceiroAPagar` (linha 543) e `listTitulosAPagar` (linha 1051) só fazem coerção defensiva. Se o Conexos renomear `titMnyValorMneg`, o `valorNegociado` vira `undefined` silenciosamente — propaga até `valorMoedaNegociada: undefined` no DTO → `0` na UI (já é o estado de F-integrability-2 para bloqueadas).
- **Impacto técnico**: Risco de regressão silenciosa em upgrade de Conexos (já pago em `Eleicao Fatia 1` com o probe de `cdiDtaCi`). Sem Zod, a única defesa é o teste unitário ou o probe manual.
- **Impacto de negócio**: Recurso "Valor Moeda Negociada" cego a mudanças do ERP. Custo de detecção = "fixture parece com produção"; reprodução exige acesso ao tenant dev.
- **Métrica de baseline**: 1 de 3 mappers do `com298/list` usa Zod (33%). Alvo CLAUDE.md ≥ 80% nos boundaries externos.

### F-integrability-5: Boilerplate de `fetch()` triplicado em `lib/api.ts` (Abstract Common Services parcial)

- **Severidade**: P3
- **Tactic violada**: Abstract Common Services
- **Localização**: `src/frontend/lib/api.ts:13-29, 38-64, 72-92`
- **Evidência (objetiva)**:
  ```ts
  // padrão repetido 3x:
  const res = await fetch(`${API}/...`, { headers: await withAuthHeaders(...) })
  if (!res.ok) {
      let detail = ''
      try { const j = await res.json(); detail = j?.error ? ` — ${j.error}` : '' } catch {}
      throw new Error(`API ${res.status}${detail}`)
  }
  const json = await res.json()
  ```
  O bloco `if (!res.ok) { try/catch detail }` aparece literalmente em `fetchFiliais` e `processarAdiantamento`; a variante em `fetchGestaoPermutas` engole o erro e cai para fixture (parte do F-integrability-3).
- **Impacto técnico**: Próxima chamada (ex.: `confirmarCasamento`, `desfazerProcessamento`) replicará o mesmo boilerplate. Mudar política de erro (ex.: 401 → re-login Supabase) exige edit em N pontos.
- **Impacto de negócio**: Custo marginal de adicionar endpoint sobe linearmente com a quantidade — incompatível com a meta da pipeline (`/feature-new` rápido).
- **Métrica de baseline**: 3 cópias de ~7 linhas cada; com 1 helper `httpJson()` cairia para ~1 linha por endpoint.

### F-integrability-6: `gestaoPermutasFixture` ainda referencia `priEspRefcliente` reais — risco PII em commit + fallback silencioso

- **Severidade**: P2
- **Tactic violada**: Configure Behavior (fallback não-configurável), cross-Security (PII)
- **Localização**: `src/frontend/lib/permutas-fixture.ts:24-39` (DBP PIPING, NORMET OY etc. — exportadores reais)
- **Evidência (objetiva)**:
  ```ts
  // permutas-fixture.ts:23-27
  referencia: 'CT012-016-021/2',
  exportador: 'DBP PIPING CO.,LTD',
  valorMoedaNegociada: 72343.66,
  ```
  O fixture entrou no repo com referências/valores reais (cf. cabeçalho do arquivo: "ancorados no que foi sondado contra o Conexos real, dev tenant Columbia, filCod=2, 2026-06-18"). E o `fetchGestaoPermutas` cai nele **automaticamente** sem env-flag, sem badge dedicado fora do `fonte`, sem log no console.
- **Impacto técnico**: Cross-link com Security (PII em VCS) e com Testability (testes podem depender do fixture sem perceber). Configurar fallback por env (`NEXT_PUBLIC_USE_FIXTURE_FALLBACK`) explicitaria a intenção.
- **Impacto de negócio**: Risco de exposição interna (nomes de exportadores do cliente) e de confusão demo-vs-prod em apresentação.
- **Métrica de baseline**: 1 fixture com dados de cliente real comitado; 1 path de fallback ativado por `(!pendentes?.length && !invoicesEmAberto?.length)` (sem flag).

## 5. Cards Kanban

### [integrability-1] Compartilhar contrato `GestaoPermutasResponse` entre backend e frontend (gerar OU validar com Zod compartilhado)

- **Problema**
  > Backend `interface/permutas/Gestao.ts` e frontend `lib/types.ts` mantêm 8 interfaces idênticas, copiadas manualmente. Já existe uma divergência aceita (`fonte`) sem nenhum teste que detecte drift. Próximo campo adicionado vai quebrar em runtime no JSX, silenciado por `?? 0`/`?? []` no `lib/api.ts`.

- **Melhoria Proposta**
  > Definir o contrato em **um único lugar**: criar `src/shared/contracts/permutas/gestao.ts` com schemas Zod (`gestaoPermutasResponseSchema`) e exportar os types via `z.infer`. Backend e frontend importam o mesmo arquivo (ou via pacote npm interno, se o monorepo não permitir import cruzado direto — então gerar `.d.ts` no build). Adicionar test `gestao.contract.test.ts` que: (a) carrega uma fixture canônica, (b) faz `gestaoPermutasResponseSchema.parse`, (c) confere que o tipo casa com o que `GestaoPermutasService.exporGestao` produz (snapshot test).

- **Resultado Esperado**
  > Drift de shape backend↔frontend é capturado no `npm test` antes do PR. 0 interfaces duplicadas.

- **Tactic alvo**: Contract Testing, Tailor Interface
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-integrability-1, F-integrability-3
- **Métricas de sucesso**:
  - Interfaces duplicadas: 8 → 0
  - Tests de contrato: 0 → ≥ 1 (parse-and-compare)
  - Tempo de detecção de drift: manual review → CI fail
- **Risco de não fazer**: Em 6 meses, com Fase C/D adicionando colunas (valor BRL, observação, status do analista expandido), pelo menos 1 incidente de "tela em branco em produção" por drift silenciado.
- **Dependências**: Definir convenção do monorepo para shared code (hoje `src/backend` e `src/frontend` são packages separados sem alias compartilhado).

### [integrability-2] Tornar `valorMoedaNegociada` consistentemente disponível (ou explicitamente `null`) para candidatas bloqueadas

- **Problema**
  > `EleicaoPermutasService.computeVariacao` só chama `listTitulosAPagar` para candidatas `elegivel + invoiceCasada`. Bloqueadas chegam ao DTO com `valorMoedaNegociada` undefined → renderizadas como `USD 0` na tela, indistinguíveis de "valor real é zero". Analista não consegue diferenciar "não consultado" de "zero".

- **Melhoria Proposta**
  > Tomar uma das duas decisões e documentar no `Gestao.ts`:
  > 1. **Always-fetch**: chamar `listTitulosAPagar(adiantamento.docCod)` também para bloqueadas (custo: +N chamadas Conexos por run, mitigado por `BoundedConcurrency`); OU
  > 2. **Explicit null**: trocar `valorMoedaNegociada: number` por `number | null` no contrato e renderizar `—` na UI quando `null`. Mais barato e honesto.
  > Opção 2 é a escolha recomendada pelo risco/custo. Update em `interface/permutas/Gestao.ts:15,29`, `GestaoPermutasService.ts:99,113` (remover `?? 0`), `frontend/lib/types.ts`, e `lib/permutas-fixture.ts` para usar `null` em pelo menos 1 bloqueada.

- **Resultado Esperado**
  > `pendentes` bloqueadas mostram `—` na coluna "Valor Moeda Negociada" em vez de `USD 0`. UX previsível e sem inferência ambígua.

- **Tactic alvo**: Tailor Interface
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-integrability-2
- **Métricas de sucesso**:
  - Linhas bloqueadas com `valorMoedaNegociada: 0` "fake": 100% → 0%
  - Tempo de resposta de "por que está zerado?" em treino: medido após release
- **Risco de não fazer**: Analista interpreta valores como zerados, confunde decisões de baixa e cria tickets de suporte recorrentes.
- **Dependências**: integrability-1 (alinha o contrato em um único schema)

### [integrability-3] Parse Zod na resposta de `GET /permutas/gestao` no frontend (e flag de fallback explícito)

- **Problema**
  > `lib/api.ts:44` faz `as Partial<GestaoPermutasResponse>` e mascara qualquer divergência via `?? 0`/`?? []`. Pior, o fallback para `gestaoPermutasFixture` dispara em qualquer JSON com arrays vazios, sem aviso — corre-se risco real de demo rodar com fixture achando que é produção.

- **Melhoria Proposta**
  > 1. Reusar o schema do card integrability-1 para `gestaoPermutasResponseSchema.parse(json)`. Se falhar → `throw` (não cair para fixture); 
  > 2. Promover o fallback fixture a flag explícita `NEXT_PUBLIC_USE_FIXTURE_FALLBACK=true` (default `false`). Quando `false` e o backend falhar, mostrar `EmptyState`/`ErrorState` em vez de fixture; 
  > 3. `console.warn` quando o fixture for usado, com motivo concreto.

- **Resultado Esperado**
  > Demo de produção não pode silenciosamente usar dados sintéticos. Drift de shape vira erro visível na tela com mensagem do Zod.

- **Tactic alvo**: Encapsulate, Configure Behavior
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-integrability-3, F-integrability-6
- **Métricas de sucesso**:
  - Chamadas Zod no boundary frontend: 0 → ≥ 1 por endpoint
  - Fallback fixture ativado sem flag: sim → não
- **Risco de não fazer**: Demo de aceite com sponsor pode rodar com fixture e validar feature falsamente. Caro de descobrir depois.
- **Dependências**: integrability-1

### [integrability-4] Aplicar Zod nos mappers `mapDocPagar` e `listTitulosAPagar` do `ConexosClient`

- **Problema**
  > `listAdiantamentosProforma` já usa `com298RowSchema.parse` (boa prática). Mas `listFinanceiroAPagar` (invoices) e `listTitulosAPagar` (origem do `valorMoedaNegociada`) coagem campos sem validar shape. Se o Conexos renomear `titMnyValorMneg` ou `docEspNumero`, o campo cai para `undefined` e propaga até a UI como `0` ou docCod.

- **Melhoria Proposta**
  > Criar `com308TituloRowSchema` e `com298DocRowSchema` em `domain/client/schemas/permutas/` (ou no próprio `ConexosClient.ts` perto dos outros). Aplicar `.parse(row)` no início de `listTitulosAPagar:1051` e `mapDocPagar:1242`. Em caso de parse fail, `ConexosError` carregando `endpoint` + amostra do campo violado (sem PII de exportador).

- **Resultado Esperado**
  > Mudança de schema do Conexos vira erro claro com `endpoint` na trilha, em vez de regressão silenciosa.

- **Tactic alvo**: Encapsulate, Contract Testing (provider)
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-integrability-4, F-integrability-2
- **Métricas de sucesso**:
  - Cobertura Zod em mappers do `com298`/`com308`: 33% → 100%
  - `# de regressões detectadas em probe vs. em produção`: monitorar
- **Risco de não fazer**: Próximo upgrade Conexos repete o ciclo do probe `cdiDtaCi` (P0-4) — detecção custosa, manual.
- **Dependências**: nenhuma

### [integrability-5] Extrair `httpJson()` em `lib/api.ts` (Abstract Common Services)

- **Problema**
  > O boilerplate `if (!res.ok) { try {detail} catch{}; throw }` é repetido 3x em `lib/api.ts`. Cada endpoint novo replica ~7 linhas. Política de erro (401 → re-login Supabase, 5xx → toast) tem que ser editada em N pontos.

- **Melhoria Proposta**
  > Criar `src/frontend/lib/http.ts` com `httpJson<T>(url, init, schema?: ZodSchema<T>)`. Centralizar: auth header, parse JSON, error detail, schema parse. Refatorar as 3 funções existentes para usar.

- **Resultado Esperado**
  > Cada endpoint novo passa a custar ~3 linhas em vez de ~12. Política de erro centralizada (preparada para refresh token / re-login).

- **Tactic alvo**: Abstract Common Services
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-integrability-5, F-integrability-3 (integra Zod parse)
- **Métricas de sucesso**:
  - LOC duplicado de error-handling: ~21 → ~7
  - Custo marginal de adicionar endpoint: medir em próximo `/feature-new`
- **Risco de não fazer**: Fase C/D vai precisar de 5+ novos endpoints (`confirmarCasamento`, `desfazer`, `bulkProcessar`, `executarPermuta`, …); cada um replica o boilerplate.
- **Dependências**: integrability-3 (Zod no boundary frontend)

### [integrability-6] Tornar fallback fixture explícito por env-flag e limpar PII (exportadores reais) do `permutas-fixture.ts`

- **Problema**
  > `permutas-fixture.ts` foi semeado com nomes de exportadores reais ("DBP PIPING CO.,LTD", "NORMET OY", "QINGDAO COVENANT", "CENTENO INTERNATIONAL") e referências reais sondadas no dev tenant Columbia. Está versionado e dispara automaticamente sempre que `fetchGestaoPermutas` vê arrays vazios. Risco PII + risco demo silencioso.

- **Melhoria Proposta**
  > 1. Substituir nomes/referências reais por fictícios óbvios ("ACME EXPORTERS", `CT-DEMO-001`). O fixture continua útil como demo; perde a aparência de produção; 
  > 2. Casar com integrability-3 (flag `NEXT_PUBLIC_USE_FIXTURE_FALLBACK`); 
  > 3. Adicionar comentário no topo do arquivo lembrando: "este arquivo NUNCA recebe dados de tenant real".

- **Resultado Esperado**
  > PII fora do VCS. Fallback usado intencionalmente, com tela diferenciada.

- **Tactic alvo**: Configure Behavior (cross-link Security)
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-integrability-6, F-integrability-3
- **Métricas de sucesso**:
  - Nomes reais de cliente em fixture: ≥ 4 → 0
  - Fallback acionável só com flag explícita
- **Risco de não fazer**: Cross-flag para `qa-security` — risco persistente de PII em VCS + risco de demo falsa.
- **Dependências**: integrability-3

## 6. Notas do agente

- **Escopo**: foquei na nova borda Postgres ↔ wire ↔ frontend (Fase B) conforme briefing; não revisei o boundary Nexxera/GED/SharePoint (ainda inexistentes no repo, fora do escopo Fase B).
- **Métrica não medível**: error-rate por dependência exige CloudWatch/produção; recomendei contador por `endpoint` no `ConexosError.catch`.
- **Cross-QA**:
  - **Modifiability** — F-integrability-1 (shape duplicado) e F-integrability-5 (boilerplate) são tambem débito de modificabilidade; flag joint.
  - **Security** — F-integrability-6 (PII em fixture) é primary Security, secondary Integrability.
  - **Testability** — F-integrability-1 cria a oportunidade de adicionar contract test compartilhado.
  - **Fault Tolerance** — F-integrability-3 (fallback silencioso) interage com tolerância: ocultar falha do backend como "dado válido" é antipadrão de fault containment.
