---
qa: Integrability
qa_slug: integrability
run_id: 2026-06-18-2346
agent: qa-integrability
generated_at: 2026-06-19T00:00:00Z
scope: backend
score: 8
findings_count: 3
cards_count: 3
---

# Integrability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Time de produto / dono do domínio Permutas | Conexos passa a expor um campo wire adicional no detail `com298/{docCod}` (`mnyTitPermuta` = "Valor Permutado") que precisa ser lido para distinguir `JA_PERMUTADO` de `SEM_SALDO_PERMUTAR` no Gate 2 | `ConexosClient.getDetalheTitulos` + `mapDetalheTitulos` + interface `Adiantamento` + `ElegibilidadeService` + frontend label | Backend rodando (Express hoje, Lambda alvo) com `EleicaoPermutasService` em execução por filial | Adicionar leitura defensiva do novo campo NO MAPPER, propagar como opcional pela chain (`{ valorPermutado?: number }`), sem quebrar contrato existente nem exigir mudança de schema upstream | LOC tocado ≤ 50 no client; 0 quebra em consumidores existentes (typecheck ✅); novo campo coberto por testes de fixture real (2 cases — doc 8266 presente; campo ausente) |

> "Conexos publica um novo subcampo opcional no detail; o boundary lê e parsea defensivamente; o estado de domínio ganha um novo motivo de bloqueio (`ja-permutado`) sem deprecate de campo existente; consumidores não-cientes ignoram o campo." É o caso canônico de **Tailor Interface** + **Configure Behavior** ao redor do mapper defensivo.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| LOC tocado no client p/ adicionar wire field | 5 linhas em `ConexosClient.ts` (signature 884, mapper 945, spread 951) + 2 linhas em `Adiantamento.ts` (29-36) | ≤ 20 LOC | ✅ | `grep -n valorPermutado src/backend/domain/client/ConexosClient.ts` |
| Arquivos tocados p/ propagar campo wire opcional ponta-a-ponta | 6 (ConexosClient, Adiantamento, EstadoElegibilidade, ElegibilidadeService, EleicaoPermutasService, frontend page.tsx) | ≤ 8 | ✅ | `_shared-metrics.md` diff stat |
| Generic HTTP methods vazados no client (get/post/request/call públicos) | 0 — `getDetalheTitulos` é domain-specific | 0 | ✅ | `grep -n "public " src/backend/domain/client/ConexosClient.ts` |
| Cobertura Zod no boundary do detail endpoint `com298/{docCod}` | 0 — mapper consome `Record<string, unknown>` direto via `parseOptionalNumber`; `com298RowSchema` cobre só o list | 1 schema (`com298DetailSchema`) cobrindo `mnyTitPermutar`, `mnyTitPermuta`, `mnyTitAberto` | ⚠️ | `ConexosClient.ts:893-922`, `permutas/conexosPermutasSchemas.ts` (sem schema detail) |
| Testes de fixture do mapper (`mapDetalheTitulos`) cobrindo o novo campo | 2 (doc 8266 presente — `valorPermutado=378636.28`; campo ausente — `valorPermutado=undefined`) | ≥ 2 | ✅ | `ConexosClient.test.ts:1280-1312` |
| API version pinning no client (URL/header) | 0 endpoints versionados — Conexos não expõe `/v1`/`api-version` | N/A (provider não suporta) | N/A | `grep -n "/v[0-9]\|api-version" ConexosClient.ts` (0 hits) |
| Acoplamento detail-mapper → consumidor (Service depende da forma `{ valorPermutar?, pago?, valorPermutado? }`) | 1 ponto (`EleicaoPermutasService.ts:461`) com spread defensivo `...(detalhe.valorPermutado !== undefined ? ...)` | 1 ponto, spread defensivo | ✅ | `EleicaoPermutasService.ts:461-493` |
| Errors tipados na borda (não vaza axios) | `ConexosError` lançado após retries esgotados; quirk HTTP 400 com `responseData` reaproveitado como sucesso | tipado | ✅ | `ConexosClient.ts:897-929` |

> ⚠️ **Não medível localmente**: taxa de presença do campo `mnyTitPermuta` em produção (cardinalidade real do estado `JA_PERMUTADO`). Requer CloudWatch logs após deploy ou amostragem manual via curl real. Recomendação: instrumentar contador `permuta.detail.valorPermutado_presente=true|false` em `EleicaoPermutasService` para validar a hipótese de que o campo aparece em ≥X% dos pagos.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Encapsulate | `ConexosClient` expõe métodos de domínio (`getDetalheTitulos`); shape do wire (`mnyTitPermuta`) não vaza para Service — só `valorPermutado` cruza a fronteira | ✅ presente | `ConexosClient.ts:881-953`; `EleicaoPermutasService.ts:461` consome `{ valorPermutado?: number }` |
| Use an Intermediary | `mapDetalheTitulos` é o intermediário entre wire e domain — concentra `parseOptionalNumber` e a regra de `pago` derivado de `mnyTitAberto` | ✅ presente | `ConexosClient.ts:941-953` |
| Restrict Communication Paths | Único consumidor de `getDetalheTitulos` é `EleicaoPermutasService.electCandidato` (uma chamada por candidata, cache implícito no caller) | ✅ presente | `EleicaoPermutasService.ts:461-483` |
| Adhere to Standards | Conexos não publica OpenAPI/JSON-Schema versionado; convenção interna `mny*` camelCase respeitada | ⚠️ parcial | `ConexosClient.ts:944-946` |
| Abstract Common Services | `parseOptionalNumber` (1275-1279) é o utilitário compartilhado para wire→number defensivo; reutilizado no novo campo sem duplicação | ✅ presente | `ConexosClient.ts:944-946` reusa 1275 |
| Discover Service | SSM segue `/tenants/{env}/{client}/{name}` (sem impacto desta mudança) | N/A | fora do delta |
| Tailor Interface | Campo wire `mnyTitPermuta` renomeado para `valorPermutado` (domínio em pt-BR) e exposto como **opcional** — clientes antigos não precisam saber dele | ✅ presente | `ConexosClient.ts:884, 945, 951`; `Adiantamento.ts:36` |
| Configure Behavior | `ElegibilidadeService` ramifica em `valorPermutado > 0` (`JA_PERMUTADO`) vs `0/ausente` (`SEM_SALDO_PERMUTAR`) — regra ligada por presença do campo, sem feature-flag | ✅ presente | `ElegibilidadeService.ts:140-153` |
| Manage Resources | `RetryExecutor` envolve a chamada; quirk HTTP 400 com `responseData` é absorvido sem retry desnecessário | ✅ presente | `ConexosClient.ts:887-923` |
| Orchestrate | `EleicaoPermutasService.electCandidato` orquestra: detail → hidrata → ElegibilidadeService (síncrono linear, ≤4 colaboradores) | ✅ presente | `EleicaoPermutasService.ts:440-499` |
| Manage Resource Coupling | Spread condicional `...(detalhe.valorPermutado !== undefined ? { valorPermutado: detalhe.valorPermutado } : {})` evita acoplar Adiantamento ao "sempre presente" | ✅ presente | `EleicaoPermutasService.ts:491-493` |
| **Contract testing** | Mapper coberto por 2 fixtures realísticas no detail (doc 8266 com `mnyTitPermuta=378636.28`; campo ausente). Sem schema pinned via Zod no detail. | ⚠️ parcial | `ConexosClient.test.ts:1280-1312` (fixtures ✅); `conexosPermutasSchemas.ts` (sem detail schema ❌) |
| **Versioning strategy** | Conexos legacy não suporta versionamento de API; estratégia atual = ler defensivo + feature-detect por presença | ⚠️ parcial — limitação do provider, não do código | `parseOptionalNumber` 1275-1279 |
| **Backward-compatibility shims** | Novo campo é opcional ponta-a-ponta (`valorPermutado?: number`); ausência ⇒ comportamento legado preservado (`SEM_SALDO_PERMUTAR`) | ✅ presente | `Adiantamento.ts:36`; `ElegibilidadeService.ts:152` |
| **Observability of integration failures** | `ConexosError` tipado + `DETAIL_INDISPONIVEL` distinto de `falha-gate`; warn estruturado `BUSINESS_WARN` no `EleicaoPermutas` | ✅ presente | `EleicaoPermutasService.ts:467-481` |

## 4. Findings (achados)

### F-integrability-1: Detail endpoint `com298/{docCod}` não tem schema Zod no boundary

- **Severidade**: P2 (médio — débito técnico defensável; mapper hoje é defensivo via `parseOptionalNumber`, sem crash, mas perde a oportunidade de pinar contrato)
- **Tactic violada**: Contract testing (schema-pinned) + Tailor Interface (validação de borda)
- **Localização**: `src/backend/domain/client/ConexosClient.ts:893-922, 941-953`; `src/backend/domain/client/permutas/conexosPermutasSchemas.ts` (ausência de `com298DetailSchema`)
- **Evidência (objetiva)**:
  ```ts
  // ConexosClient.ts:893
  detail = await this.legacy.getGeneric<Record<string, unknown>>(`com298/${docCod}`, { filCod });
  // ConexosClient.ts:944-946 — três parseOptionalNumber em sequência, sem Zod
  const valorPermutar = this.parseOptionalNumber(detail.mnyTitPermutar);
  const valorPermutado = this.parseOptionalNumber(detail.mnyTitPermuta);
  const mnyTitAberto = this.parseOptionalNumber(detail.mnyTitAberto);
  ```
  Existe `com298RowSchema` (`conexosPermutasSchemas.ts:28-33`) cobrindo o **list**, mas o detail consome `Record<string, unknown>` direto. CLAUDE.md: "validate external inputs (API events, DB nullables, SSM) with Zod at boundaries".
- **Impacto técnico**: se o Conexos vier a publicar `mnyTitPermuta` como string `"NaN"` ou objeto aninhado, o `parseOptionalNumber` silenciosamente devolve `undefined` (interpretado como `SEM_SALDO_PERMUTAR`), mascarando regressão de schema. Sem schema, não há aviso telemetrável.
- **Impacto de negócio**: candidatas que deveriam ser marcadas `JA_PERMUTADO` (estado concluído, não erro) podem cair em `SEM_SALDO_PERMUTAR` (motivo errado no painel) — confunde operador e potencialmente reabre re-trabalho. Probabilidade baixa hoje (probe real 2026-06-18 doc 8266 retorna number), mas custo de detecção alto.
- **Métrica de baseline**: 0 schemas Zod cobrindo o detail endpoint; 3 campos lidos defensivos sem contrato (`mnyTitPermutar`, `mnyTitPermuta`, `mnyTitAberto`). Alvo: 1 schema, 3 campos cobertos.

### F-integrability-2: Shape de retorno de `getDetalheTitulos` duplicada em 3 lugares como literal type

- **Severidade**: P3 (baixo — melhoria opcional; tipo é curto e a chain é local, mas adicionar um 4º campo replica o overhead já visto)
- **Tactic violada**: Abstract Common Services / Use an Intermediary (type aliasing)
- **Localização**: `ConexosClient.ts:884` (signature), `ConexosClient.ts:943` (mapper retorno), `EleicaoPermutasService.ts:461` (variável `detalhe`)
- **Evidência (objetiva)**:
  ```ts
  // 3 cópias do mesmo shape literal
  Promise<{ valorPermutar?: number; pago?: boolean; valorPermutado?: number }>      // 884
  { valorPermutar?: number; pago?: boolean; valorPermutado?: number }                // 943
  let detalhe: { valorPermutar?: number; pago?: boolean; valorPermutado?: number }; // 461
  ```
- **Impacto técnico**: cada novo subcampo do detail (provável — Conexos tem `mnyTitDescontoFin`, `mnyTitMultaJurosFin` no mesmo aggregate) exige tocar 3 sítios. Drift silencioso se um deles for atualizado e outro não.
- **Impacto de negócio**: baixo. Velocity penalty marginal em features futuras de permuta/SISPAG que também queiram subcampos do detail.
- **Métrica de baseline**: 3 declarações do mesmo shape literal; 0 type alias compartilhado. Alvo: 1 type alias em `interface/permutas/` (ex.: `DetalheTituloAggregate`).

### F-integrability-3: Type alias `Adiantamento` carrega campo opcional sem teste de retro-compatibilidade explícito

- **Severidade**: P3 (baixo)
- **Tactic violada**: Backward-compatibility shims (cobertura de teste)
- **Localização**: `src/backend/domain/interface/permutas/Adiantamento.ts:29-36`
- **Evidência (objetiva)**: 3 testes em `ElegibilidadeService.test.ts:80-130` validam `valorPermutado` presente, `=0`, e `>0` com `pago=false` (precedência `nao-pago`). Não há um teste que monta um `Adiantamento` legado (sem o campo) e confirma serialização downstream (snapshot row, painel) inalterada. Pelo type system está OK (campo opcional), mas não há red/green guard contra um futuro `valorPermutado` ser tornado required por engano.
- **Impacto técnico**: se alguém remover o `?` de `valorPermutado` em `Adiantamento` sem atualizar todos os builders de teste, ainda compila (todos os testes recentes preenchem o campo). Risco baixo; o lint não pega.
- **Impacto de negócio**: nenhum hoje. Mitigação P3.
- **Métrica de baseline**: 0 testes de "absence-tolerance" do campo opcional pela chain completa (snapshot + painel). Alvo: 1 teste de integração que omita `valorPermutado` e confira que o snapshot row não inclui a chave.

## 5. Cards Kanban

### [integrability-1] Adicionar `com298DetailSchema` (Zod) ao boundary do detail endpoint

- **Problema**
  > O mapper `mapDetalheTitulos` consome `Record<string, unknown>` direto do `legacy.getGeneric` e lê 3 campos (`mnyTitPermutar`, `mnyTitPermuta`, `mnyTitAberto`) via `parseOptionalNumber`. O list já tem `com298RowSchema` em `conexosPermutasSchemas.ts`, mas o detail não — viola a regra "validate external inputs at boundaries" (CLAUDE.md). Se o Conexos publicar um shape inesperado (string "NaN", null aninhado), a regressão é silenciosa: candidatas viram `SEM_SALDO_PERMUTAR` em vez de `JA_PERMUTADO`.

- **Melhoria Proposta**
  > Criar `com298DetailSchema` em `src/backend/domain/client/permutas/conexosPermutasSchemas.ts` com `mnyTitPermutar`, `mnyTitPermuta`, `mnyTitAberto` como `wireNumber.optional()`, mantendo `.passthrough()`. Aplicar `safeParse` em `mapDetalheTitulos` (ConexosClient.ts:941); em caso de issues, logar `BUSINESS_WARN` com sample dos campos crus e cair no mesmo caminho atual (campos `undefined`). Tactic Bass: **Tailor Interface** + **Contract testing** (schema-pinned).

- **Resultado Esperado**
  > Detail endpoint passa a falhar alto/observável em regressões de schema upstream. Cobertura Zod no detail = 1 schema, 3 campos pinned. Sem mudança de comportamento para os fixtures atuais.

- **Tactic alvo**: Tailor Interface / Contract testing
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-1
- **Métricas de sucesso**:
  - `# schemas Zod cobrindo detail endpoints Conexos`: 0 → 1
  - `# campos do detail com contrato pinado`: 0 → 3 (`mnyTitPermutar`, `mnyTitPermuta`, `mnyTitAberto`)
  - testes existentes em `ConexosClient.test.ts:1280-1312` continuam verdes
- **Risco de não fazer**: regressão silenciosa de shape do Conexos vira diagnóstico custoso (operador vê motivo errado no painel; só descoberto por análise manual). Em 6 meses, com SISPAG e novos campos da mesma série `mny*`, o risco escala.
- **Dependências**: nenhuma — pode ser independente do escopo "já permutado" atual.

### [integrability-2] Extrair `DetalheTituloAggregate` para type alias em `interface/permutas/`

- **Problema**
  > A shape `{ valorPermutar?: number; pago?: boolean; valorPermutado?: number }` aparece literal em 3 lugares (`ConexosClient.ts:884`, `:943`, `EleicaoPermutasService.ts:461`). Cada adição futura ao aggregate (provável: `descontoFin`, `multaJuros`) força tocar 3 sítios.

- **Melhoria Proposta**
  > Criar `src/backend/domain/interface/permutas/DetalheTitulo.ts` exportando `DetalheTituloAggregate = { valorPermutar?: number; pago?: boolean; valorPermutado?: number }`. Trocar as 3 cópias por importação. Tactic Bass: **Abstract Common Services** (type aliasing).

- **Resultado Esperado**
  > 1 fonte da verdade do shape; adicionar campo futuro = 1 sítio (interface) + 1 sítio (mapper). Sem mudança runtime.

- **Tactic alvo**: Abstract Common Services
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-2
- **Métricas de sucesso**:
  - declarações literais do shape: 3 → 0 (todas via alias)
  - LOC para adicionar próximo campo: ~6 → ~3
- **Risco de não fazer**: drift de type entre sítios quando o aggregate crescer (acontecerá ao migrar `com298/{docCod}` para conciliação de baixa em Fatia 2).
- **Dependências**: melhor fazer junto com `integrability-1` (Zod schema vira fonte do tipo via `z.infer`).

### [integrability-3] Teste de "absence tolerance" do campo opcional `valorPermutado`

- **Problema**
  > `Adiantamento.valorPermutado` é opcional em type, mas não há teste guardando contra um futuro PR tornar o campo required (todos os builders de teste recentes já o preenchem). O contrato opcional ponta-a-ponta (snapshot row, painel) não é exercido com o campo omitido.

- **Melhoria Proposta**
  > Adicionar 1 teste em `EleicaoPermutasService.test.ts` que monta uma candidata sem `valorPermutado` e confere: (a) snapshot row gerado não inclui a chave; (b) `ElegibilidadeService` cai em `SEM_SALDO_PERMUTAR` (path legado). Tactic Bass: **Backward-compatibility shims** (test coverage).

- **Resultado Esperado**
  > Compatibilidade do campo opcional pinada por teste. Refactors futuros que tornem o campo required quebram CI.

- **Tactic alvo**: Backward-compatibility shims
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-3
- **Métricas de sucesso**:
  - testes de "absence tolerance" para campos opcionais novos do `Adiantamento`: 0 → 1
- **Risco de não fazer**: baixo individualmente; agrava quando o `Adiantamento` ganhar mais 3-4 campos opcionais nas próximas fatias (SISPAG/Popula GED).
- **Dependências**: nenhuma.

## 6. Notas do agente

- Score 8: a mudança "já permutado" é exemplar em Tailor Interface, Backward-compatibility e Use an Intermediary — boundary defensivo, campo opcional ponta-a-ponta, 0 generic HTTP vazado, retry envelopado, error tipado. Único débito real (P2) é o detail endpoint não estar coberto por Zod como o list já está; isso é o ponto onde a feature poderia ter "puxado para cima" o padrão de validação de borda.
- Cross-QA: F-integrability-1 (Zod no detail) overlaps com **Security** (input validation) e **Fault Tolerance** (boundary defensive parsing). F-integrability-2 (type alias) overlaps com **Modifiability** (Encapsulate). Sinalizar ao consolidator.
- Não medível em --quick: distribuição empírica de `mnyTitPermuta` presente/ausente em produção (precisa CloudWatch após deploy ou amostragem manual). Recomendado contador `permuta.detail.valorPermutado_presente` no EleicaoPermutas.
- `valorPermutado` está em `MOTIVO_LABEL` no frontend (`page.tsx:41,73,77`) e renderiza badge "Já permutado" — surface integrada.
