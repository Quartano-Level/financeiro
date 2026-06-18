---
qa: Integrability
qa_slug: integrability
run_id: 2026-06-17-2340
agent: qa-integrability
generated_at: 2026-06-18T00:00:00-03:00
scope: backend
score: 7.5
findings_count: 6
cards_count: 6
---

# Integrability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Probe de rede no dev tenant Conexos (Yuri) | Captura o nome wire da data-base em `imp019`/`imp223` e a chave/valor do filtro `adiantamento#EQ` em `com298` | `ConexosClient.mapDeclaracaoDataBase` + `conexosPermutasConstants.ts` (`ADIANTAMENTO_FILTER_KEY`/`_VALUE`) | Permutas Frente I, Fatia 1 em verde, sem produção; gates fechados para sair com probe pendente | Plugar o literal em ponto único; aging passa a popular sem editar service/repo/route; `EleicaoPermutasService` é re-rodado e gera novo snapshot | LOC tocada para plugar o probe ≤ 8 linhas, arquivos tocados ≤ 2, MTTR (probe → painel populado) < 1h (1 release) |

Cenário complementar (substituição de gateway Conexos v2): "Conexos sobe `/v2/com298` com payload alterado → boundary do `ConexosClient` deve absorver a mudança sem cascata no service `EleicaoPermutasService` → arquivos tocados fora de `client/` = 0; tests `EleicaoPermutasService.test.ts` continuam verdes com mock unchanged."

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Pontos únicos de plug do probe P0-4 (data-base) | **1** (`ConexosClient.mapDeclaracaoDataBase` linhas 690-696) | 1 | ✅ | `ConexosClient.ts:690` |
| Pontos únicos de plug do probe `adiantamento#EQ` | **1** (`conexosPermutasConstants.ts:30-33`) | 1 | ✅ | `conexosPermutasConstants.ts:30` |
| Constantes de tenant Columbia (`priCod=1153`) hardcoded em service | **0** (todas em `conexosPermutasConstants.ts` + ConexosClient internal consts) | 0 | ✅ | `grep TPD_PROFORMA src/backend/domain/service/permutas` (0 hits) |
| Imports de `axios`/`fetch` em service/repo/route do delta | **0** | 0 | ✅ | `grep -rn "axios\|fetch(" src/backend/domain/{service,repository}/permutas src/backend/routes/permutas.ts` |
| Métodos `ConexosClient` consumidos por `EleicaoPermutasService` (orquestrador) | **5** (`listFiliais`, `listAdiantamentosProforma`, `getMnyTitPermutar`, `listDeclaracaoByProcesso`, `listFinanceiroAPagar`, `listTitulosAPagar`) — 7 call sites | ≤ 3 | ⚠️ | `grep -c "this.conexosClient\." EleicaoPermutasService.ts` → 7 |
| Schemas Zod no boundary Conexos (delta) | 3 declarados (`com298RowSchema`, `com308RowSchema`, `declaracaoRowSchema`) | 3 aplicados | ⚠️ | `conexosPermutasSchemas.ts:28,41,62` |
| Schemas Zod APLICADOS no `ConexosClient` | **2/3** — `com298RowSchema` (`:601`), `declaracaoRowSchema` (`:662`); **`com308RowSchema` exportado mas NÃO chamado** em `listTitulosAPagar` (`:995-1009`) | 3/3 | ❌ | `grep -n "com308RowSchema" ConexosClient.ts` → 0 hits |
| Endpoints versionados (path `/v1`, `/v2`) em chamadas Conexos | **0** (Conexos não expõe `/vN` no path) | N/A (provedor) | N/A | `grep -n "/v[0-9]" ConexosClient.ts` |
| Tests com fixture-shape (response real) do `ConexosClient` no delta | **1** (`conexosPermutasSchemas.test.ts` cobre coerção wire→domain das 3 rows) | ≥1 por endpoint novo | ⚠️ | `conexosPermutasSchemas.test.ts:25-74` |
| Métodos novos no `ConexosClient` (delta) | 2 públicos (`listAdiantamentosProforma`, `listDeclaracaoByProcesso`) + 1 privado plugável (`mapDeclaracaoDataBase`) | — | ✅ | `ConexosClient.ts:577,632,690` |
| LOC do delta no `ConexosClient` | **+171 linhas** | — | ✅ | `_shared-metrics.md` |
| Acoplamento direto service → `LegacyConexosShape` (token legado) | **0** (services injetam `ConexosClient`, o token `LEGACY_CONEXOS_TOKEN` é interno do client) | 0 | ✅ | `appContainer.ts:28`, único caller |

> ⚠️ **Não medível localmente**: tempo real (segundos) de fan-out por filial (`listAdiantamentosProforma` × N + `getMnyTitPermutar` × M). Requer ambiente dev Conexos. Não bloqueia esta avaliação (escopo `--quick`).

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Encapsulate | `ConexosClient` é o único caller do `LegacyConexosShape`; services do delta NÃO acessam `axios`/`fetch` diretamente. Métodos com formato `list<Domain>` (ex.: `listAdiantamentosProforma`), nunca `get/post` genérico exposto. | ✅ presente | `ConexosClient.ts:351-352` (legacy injetado), `:577,632`; services só importam `ConexosClient` (`EleicaoPermutasService.ts:3`) |
| Use an Intermediary | `legacyConexosAdapter` atua como intermediário entre HTTP cookie-auth legado e o `ConexosClient` domain-shaped (v0.2 plano: remover). | ✅ presente | `appContainer.ts:3,21-28` |
| Restrict Communication Paths | DDD layering respeitado no delta — service → client, repo → DB client. Zero `axios`/`fetch` em `service/`, `repository/`, `routes/`. | ✅ presente | `grep -rn "axios\|fetch(" src/backend/domain/{service,repository}/permutas` → 0 hits |
| Adhere to Standards | Zod nos boundaries (parcialmente — só 2 dos 3 schemas exportados são aplicados); SQL parametrizado via `SqlBuilder $nome`; UUID v4 nativo do Node. | ⚠️ parcial | `conexosPermutasSchemas.ts:28-67` vs `ConexosClient.ts:995-1009` (sem `.parse`) |
| Abstract Common Services | `RetryExecutor` reutilizado em todos os endpoints do `ConexosClient`; `paginate` privado central com `MAX_PAGES`/`PAGE_SIZE`. | ✅ presente | `ConexosClient.ts:353-358,1084-1142` |
| Discover Service | Configuração Conexos via `EnvironmentProvider` (SSM em prod) — URL, login, senha, filCod default. Zero `process.env.*` direto no delta. | ✅ presente | `appContainer.ts:19-26` |
| Tailor Interface | Métodos novos retornam tipos de domínio (`Adiantamento`, `DeclaracaoEntry`), nunca o row wire cru. `DeclaracaoEntry.dataBase` é opcional para isolar a probe-gate sem mudar tipo público no futuro. | ✅ presente | `ConexosClient.ts:21-25,577-618,632-677` |
| Configure Behavior | Probe-gated points são CONSTANTES TIPADAS (`as const`) num arquivo único: trocar valor não muda assinatura — só re-deploy. Mapper plugável `mapDeclaracaoDataBase` isola a extração da data sem cascata em `service/`. | ✅ presente | `conexosPermutasConstants.ts:30-33`, `ConexosClient.ts:690-696` |
| Manage Resources | `paginate` aplica `MAX_PAGES=50` (cap silencioso → `onCapHit()` → `BUSINESS_WARN`); `RetryExecutor` com 2 retries + 500ms + jitter; `chunked` (CHUNK_SIZE=50) limita batch wire. | ✅ presente | `ConexosClient.ts:272-289,353-358,1140-1141` |
| Orchestrate | `EleicaoPermutasService.executar` orquestra 5 collaborators (`ConexosClient`, `ElegibilidadeService`, `VariacaoCambialPermutaService`, `AgingService`, `PermutaSnapshotRepository`, `LogService`); orquestração linear (sem eventos/SQS — Express puro), 7 call-sites ao `ConexosClient` por candidata. | ⚠️ parcial | `EleicaoPermutasService.ts:50-58, 155-273` |
| Manage Resource Coupling | `flowId` (uuidv4) propagado por toda a run via `LogService` singleton (`LoggerMetadata.flowId`); snapshot é gravado por `runId` correlacionado a `flowId`. | ✅ presente | `LogInterface.ts:40`, `EleicaoPermutasService.ts:62-69`, `PermutaSnapshotRepository.ts:65-95` |
| Contract testing | `conexosPermutasSchemas.test.ts` cobre coerção wire→domain das 3 rows (com298/com308/declaracao); falta um teste de **integração com fixture real** (gravar resposta do dev tenant e replicar contra mock). `EleicaoPermutasService.test.ts` usa mocks artesanais. | ⚠️ parcial | `conexosPermutasSchemas.test.ts:25-74`; `EleicaoPermutasService.test.ts:29-40` |
| Versioning strategy for external API | Conexos não expõe `/vN` no path; nenhum header `api-version` capturado. **Sem estratégia explícita** se o provider quebrar com298. | ❌ ausente | `grep -n "api-version\|/v[0-9]" ConexosClient.ts` → 0 hits |
| Backward-compatibility shims | `legacyConexosAdapter` É um shim sobre o auth legado por cookie; comentário no client promete remoção em v0.2 (sem cronograma). | ⚠️ parcial | `ConexosClient.ts:336-344` (v0.2 dívida explícita) |
| Observability of integration failures | `ConexosError` carrega `endpoint` + `priCod` no cause; `LogService.error` no `FLOW_ERROR`; `BUSINESS_WARN` no cap-hit. Sem **per-endpoint error rate metric** (CloudWatch indisponível no Express). | ⚠️ parcial | `ConexosClient.ts:374, 1064-1070, 1118-1124`; `EleicaoPermutasService.ts:144-149` |

## 4. Findings (achados)

### F-integrability-1: `com308RowSchema` exportado mas não aplicado no boundary `listTitulosAPagar`

- **Severidade**: P1 (alto — degrada QA mensurável)
- **Tactic violada**: Adhere to Standards (Zod no boundary)
- **Localização**: `src/backend/domain/client/permutas/conexosPermutasSchemas.ts:41-52` (schema declarado, exportado, testado) vs. `src/backend/domain/client/ConexosClient.ts:995-1009` (mapper raw, sem `.parse`)
- **Evidência (objetiva)**:
  ```
  $ grep -n "com308RowSchema" src/backend/domain/client/ConexosClient.ts
  14: import { com298RowSchema, declaracaoRowSchema } from './permutas/conexosPermutasSchemas.js';
  # NOTE: com308RowSchema NÃO está no import; nunca é chamado no client.

  # ConexosClient.ts:995-1009 (listTitulosAPagar mapper):
  return rows.map<TituloAPagar>((r) => {
      const valorNegociado = this.parseOptionalNumber(r.titMnyValorMneg);
      const taxa = this.parseOptionalNumber(r.titFltTaxaMneg);
      ...  // sem Zod no boundary
  });
  ```
- **Impacto técnico**: row malformada do `com308/financeiroAPagar/list/<docCod>` (campo extra com tipo errado, `titCod` null) passa direto pelo mapper raw e contamina `VariacaoCambialPermutaService` com `NaN`/`undefined` — propaga até `delta = principalMoeda * (taxaInvoice - taxaAdiantamento)` (calcular retorna `NaN`). Esquema existe (testes verdes), mas não está plugado — o investimento em Zod é parcial.
- **Impacto de negócio**: Variação Cambial é o número que vira lançamento contábil (conta 130/131) na Fatia 2. Um `NaN` que passa silencioso vira retrabalho contábil (analista refaz a permuta no Conexos) ou pior, lançamento com valor zerado. Em PROD, com Conexos populando às vezes `titFltTaxaMneg` como string vazia ou objeto, o boundary cede.
- **Métrica de baseline**: schemas aplicados / declarados no delta = **2/3** (target 3/3).

### F-integrability-2: `EleicaoPermutasService` resolve `ConexosClient` diretamente com 7 call-sites em 3 métodos

- **Severidade**: P2 (médio — débito técnico defensável)
- **Tactic violada**: Use an Intermediary / Orchestrate (acoplamento alto entre orquestrador e gateway)
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:50, 72, 155, 179, 188, 193, 253-254`
- **Evidência (objetiva)**:
  ```
  $ grep -c "this.conexosClient\." EleicaoPermutasService.ts
  7

  # Métodos do ConexosClient consumidos pelo orquestrador:
  #   listFiliais, listAdiantamentosProforma, getMnyTitPermutar,
  #   listDeclaracaoByProcesso, listFinanceiroAPagar, listTitulosAPagar
  ```
- **Impacto técnico**: substituir ou versionar o `ConexosClient` (ex.: v0.2 sem `legacyConexosAdapter`, ou Conexos v2 com payload diferente) hoje cascateia em pelo menos 5 mudanças de chamada no orquestrador. A interface natural seria um `PermutasConexosGateway` (anti-corruption layer especializado): `listarAdiantamentosElegiveis`, `lerDataBase`, `lerVariacaoTaxas` — abstrai o fan-out atual e absorve a evolução wire sem tocar service.
- **Impacto de negócio**: na Fatia 2 (escrita: executar permuta no `fin010`) e Fatia 3 (SISPAG/Nexxera), a tendência é Eleição/Painel ganharem mais call-sites Conexos. Sem gateway dedicado, qualquer upgrade de endpoint do provider gera retrabalho cross-feature.
- **Métrica de baseline**: call-sites ao `ConexosClient` em orquestrador único = **7** (target ≤ 3 por orquestrador).

### F-integrability-3: Ausência de versioning strategy para Conexos (sem header `api-version`, sem fingerprint de schema)

- **Severidade**: P2 (médio)
- **Tactic violada**: Versioning strategy for external API
- **Localização**: `src/backend/domain/client/ConexosClient.ts` (qualquer endpoint, ex.: `:480-562, 577-618, 723-808`)
- **Evidência (objetiva)**:
  ```
  $ grep -n "api-version\|/v[0-9]\|version=" src/backend/domain/client/ConexosClient.ts
  # 0 matches.
  ```
- **Impacto técnico**: Conexos não expõe versionamento no path, mas o cliente também não captura nenhum fingerprint de resposta (ex.: presença de `mnyTitPermutar` no `list`, comportamento já mudou em 2026-06-01 segundo comentário em `:550-560`). Quando o ERP do tenant for atualizado, descobrimos por incidente — não por canary.
- **Impacto de negócio**: a feature já carrega dois precedentes empíricos no comentário: `mnyTitPermutar` passou a vir null no list; `ORA-00904` ao listar campos. Cada um desses custou um ciclo de debugging em produção do `fechamento-processos` — o padrão é reincidente em Conexos.
- **Métrica de baseline**: endpoints com fingerprint/version-pin = **0/6** (target: pelo menos detectar breaking changes via 1 fixture-test recordado por endpoint crítico).

### F-integrability-4: Probe-gated points são plugáveis em ponto único, mas valor placeholder do filtro `adiantamento#EQ` poderá entrar em PROD silenciosamente

- **Severidade**: P1 (alto — risco de payload fantasma em PROD)
- **Tactic violada**: Configure Behavior (configuração externa explícita) / Adhere to Standards
- **Localização**: `src/backend/domain/client/permutas/conexosPermutasConstants.ts:30-33`; `src/backend/domain/client/ConexosClient.ts:589`
- **Evidência (objetiva)**:
  ```
  // conexosPermutasConstants.ts:30-33
  export const ADIANTAMENTO_FILTER_KEY = 'adiantamento#EQ' as const;
  export const ADIANTAMENTO_FILTER_VALUE = 'S' as const;
  // TODO 🔬 PROBE: confirmar `ADIANTAMENTO_FILTER_KEY` e `ADIANTAMENTO_FILTER_VALUE`

  // ConexosClient.ts:589 — uso direto no filterList do com298/list
  [ADIANTAMENTO_FILTER_KEY]: ADIANTAMENTO_FILTER_VALUE,

  // conexosPermutasSchemas.test.ts:18-22 — teste só checa string não-vazia
  expect(typeof ADIANTAMENTO_FILTER_KEY).toBe('string');
  expect(ADIANTAMENTO_FILTER_KEY.length).toBeGreaterThan(0);
  ```
- **Impacto técnico**: o boundary é ENCAPSULADO bem (ponto único, sem vazamento), o que satisfaz a tática **Tailor Interface**. PORÉM, o valor placeholder `'adiantamento#EQ' / 'S'` é sintaticamente válido — se ninguém capturar o probe e a feature for promovida, o Conexos provavelmente IGNORA filtros desconhecidos (comportamento empírico Hibernate) e retorna TODOS os PROFORMA, não só os adiantamentos. Não há guard de runtime para "valor é placeholder" (ex.: env var obrigatória, flag `probeConfirmed: boolean`).
- **Impacto de negócio**: pior caso, painel mostra PROFORMA não-adiantamento como elegível, gera ruído operacional gigantesco e perde a confiança da analista no piloto. A correção é P1: o isolamento é exemplar, mas falta um **guard explícito** (fail-loud ou flag) até o probe ser captado.
- **Métrica de baseline**: probes confirmados / probes em uso = **0/2** (target 2/2 antes do GO PROD; ou guard de bypass com warning até confirmação).

### F-integrability-5: Sem contract test com fixture real do `com298/list` / `imp019/list` / `imp223/list`

- **Severidade**: P2 (médio)
- **Tactic violada**: Contract testing
- **Localização**: `src/backend/domain/client/permutas/conexosPermutasSchemas.test.ts:25-74` (testes unitários com payload sintético); falta `ConexosClient.permutas.test.ts` com fixture
- **Evidência (objetiva)**:
  ```
  $ ls src/backend/domain/client/permutas/
  conexosPermutasConstants.ts
  conexosPermutasSchemas.test.ts
  conexosPermutasSchemas.ts
  # Sem fixture (.json) gravado; sem teste que rode `listAdiantamentosProforma`
  # contra resposta capturada do dev tenant.
  ```
- **Impacto técnico**: o teste atual valida que o schema aceita um payload bem-formado escrito à mão. Não detecta se o Conexos, em alguma instalação Columbia, retorna `docCod` em campo aninhado (ex.: `data.docCod`), `null` no `priCod`, ou string com leading zero. Quando o probe trouxer a resposta real, o teste atual continuará verde sem cobrir o shape capturado.
- **Impacto de negócio**: regressão silenciosa entre releases do Conexos = retrabalho de plantão. A correção é cheap: gravar uma resposta `.json` do dev tenant e rodar o mapper contra ela. Casa diretamente com o trabalho do probe P0-3/P0-4.
- **Métrica de baseline**: fixtures wire reais gravadas no repo = **0**; testes com fixture = **0** (target: ≥1 por endpoint novo).

### F-integrability-6: `LegacyConexosShape` (auth cookie) sem cronograma de remoção e sem health-check ao bootstrap

- **Severidade**: P3 (baixo)
- **Tactic violada**: Backward-compatibility shims (não devem virar permanentes)
- **Localização**: `src/backend/domain/client/ConexosClient.ts:336-344` (comentário "v0.2 will replace this adapter"); `src/backend/domain/appContainer.ts:21-28`
- **Evidência (objetiva)**:
  ```
  // ConexosClient.ts:336-344
  /**
   * Domain-shaped Conexos adapter. v0.1 wraps the legacy `ConexosService`
   * exported from `services/conexos.ts` so we don't duplicate the cookie
   * session handling. v0.2 will own the HTTP layer directly.
   ```
- **Impacto técnico**: shim de auth cookie permanente desde v0.1; cada `ensureSid()` adiciona acoplamento implícito. `appContainer.ts` não testa conectividade ao Conexos no bootstrap (fail-fast existe só para Postgres, e ainda em best-effort `console.warn`). Substituir o shim na v0.2 sem health-check expõe a primeira run à falha de auth na 1ª chamada do `EleicaoPermutasService.executar`.
- **Impacto de negócio**: aceitável enquanto o bootstrap é manual, mas a Fatia 2 e o EventBridge cron (O4) vão precisar de readiness probe — melhor antecipar.
- **Métrica de baseline**: tempo entre comentário "v0.2 will replace" e remoção do shim = **indeterminado** (sem cronograma no ADR).

## 5. Cards Kanban

### [integrability-1] Aplicar `com308RowSchema` no boundary `ConexosClient.listTitulosAPagar`

- **Problema**
  > `com308RowSchema` está declarado, exportado e testado (`conexosPermutasSchemas.ts:41-52`) mas NUNCA é chamado em `ConexosClient.listTitulosAPagar` (`:995-1009`), que segue mapeando rows com `parseOptionalNumber` cru. Rows malformadas do `com308/financeiroAPagar/list/<docCod>` propagam `NaN` até a fórmula da Variação Cambial. O investimento em Zod nos boundaries é parcial — adesão à tactic "Adhere to Standards" fica em 2/3.

- **Melhoria Proposta**
  > Aplicar `com308RowSchema.parse(r)` (ou `.safeParse` com fallback) dentro do `rows.map<TituloAPagar>(...)` em `ConexosClient.ts:995`, antes de chamar `parseOptionalNumber`. Validar o comportamento em `ConexosClient.permutas.test.ts` (novo) com fixture mínima. Tactic Bass: **Adhere to Standards**.

- **Resultado Esperado**
  > Boundary uniforme. Schemas Zod aplicados / declarados no delta: **2/3 → 3/3**. `listTitulosAPagar` rejeita rows sem `titCod` (P1 silencioso → erro alto) e coage `titFltTaxaMneg`/`titMnyValorMneg` via schema.

- **Tactic alvo**: Adhere to Standards (Zod no boundary)
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-1
- **Métricas de sucesso**:
  - Schemas Zod aplicados / declarados = 2/3 → 3/3
  - Cobertura de teste do mapper `listTitulosAPagar` com row mal-formada: 0 → 1
- **Risco de não fazer**: NaN silencioso em VariacaoCambial vira lançamento contábil errado (conta 130/131) na Fatia 2.
- **Dependências**: nenhuma (não bloqueia merge da Fatia 1).

### [integrability-2] Extrair `PermutasConexosGateway` (anti-corruption layer) para reduzir 7 call-sites do orquestrador

- **Problema**
  > `EleicaoPermutasService` chama `this.conexosClient.*` em 7 lugares (5 métodos distintos) e codifica regras de fan-out (chunking de PROFORMA, hidratação de `valorPermutar`, leitura cruzada D.I/DUIMP). Trocar o `ConexosClient` ou subir Conexos v2 cascata o orquestrador. Acoplamento de orquestrador a gateway externo = anti-pattern de integrability.

- **Melhoria Proposta**
  > Criar `PermutasConexosGateway` em `domain/service/permutas/` ou `domain/client/permutas/` com a API mínima do orquestrador: `listarAdiantamentos(filCod): Promise<AdiantamentoEnriquecido[]>` (já com `valorPermutar` hidratado), `lerDeclaracoes(priCods, filCod)`, `lerVariacaoTaxas(adto, invoice, filCod): Promise<TaxasParaVariacao | undefined>`. Service passa a falar com o gateway; gateway encapsula `ConexosClient`. Tactic: **Use an Intermediary** + **Tailor Interface**.

- **Resultado Esperado**
  > Call-sites `EleicaoPermutasService → ConexosClient`: **7 → 0** (orquestrador só fala com gateway). Trocar `ConexosClient` afeta exclusivamente o gateway. Fatia 2 (executar permuta no `fin010`) entra pela mesma porta sem inflar o orquestrador.

- **Tactic alvo**: Use an Intermediary
- **Severidade**: P2
- **Esforço estimado**: M (2-5d)
- **Findings relacionados**: F-integrability-2
- **Métricas de sucesso**:
  - Call-sites orquestrador → `ConexosClient`: 7 → 0
  - Métodos públicos do gateway: ≤ 4
- **Risco de não fazer**: Fatia 2 inflar `EleicaoPermutasService` com mais 3-5 call-sites (executar permuta + baixa); na hora de Conexos v2 cascateia 10+ mudanças.
- **Dependências**: pode aguardar Fatia 2 para validar o shape do gateway com casos write-side.

### [integrability-3] Gravar fixtures wire reais (probe outputs) e criar contract test do mapper `ConexosClient`

- **Problema**
  > Não há fixture `.json` real do `com298/list` (adiantamento), `imp019/list`, `imp223/list`, `com308/financeiroAPagar/list/<docCod>` gravada no repo. Os testes atuais (`conexosPermutasSchemas.test.ts`) validam payload sintético; o mapper do `ConexosClient` é testado indiretamente. Quando o probe do Yuri capturar a resposta, ela vira só comentário no PR, não fixture versionada.

- **Melhoria Proposta**
  > Criar `src/backend/domain/client/permutas/__fixtures__/` com 4 JSONs (com298-adiantamento, com298-invoice, imp019, imp223, com308) gravados do dev tenant. Adicionar `ConexosClient.permutas.test.ts` que rode os mappers `listAdiantamentosProforma`, `listDeclaracaoByProcesso`, `listTitulosAPagar` contra os JSONs e compare ao domínio esperado. Tactic: **Contract testing**.

- **Resultado Esperado**
  > Fixtures gravadas: **0 → 4**. Contract tests: **0 → 3 endpoints**. Próxima vez que o Conexos quebrar shape (já tem dois precedentes em comentário), o teste vermelho denuncia em CI antes da PROD.

- **Tactic alvo**: Contract testing
- **Severidade**: P2
- **Esforço estimado**: S (≤1d) condicional ao probe do Yuri estar feito
- **Findings relacionados**: F-integrability-5, F-integrability-1
- **Métricas de sucesso**:
  - Fixtures wire reais no repo: 0 → 4
  - Endpoints com contract test: 0 → 3
- **Risco de não fazer**: regressão silenciosa de schema Conexos entre releases. Já aconteceu (vide `mnyTitPermutar` null no list, `ORA-00904` em colunas listadas) — vai acontecer de novo.
- **Dependências**: aguarda probe do Yuri (P0-3 e P0-4) — casa naturalmente nessa rodada.

### [integrability-4] Guard fail-loud para placeholders dos probes P0-3 e P0-4 antes do GO PROD

- **Problema**
  > `ADIANTAMENTO_FILTER_KEY='adiantamento#EQ'` / `_VALUE='S'` são placeholders SINTATICAMENTE válidos. Se a feature for promovida sem o probe capturado, o Conexos provavelmente IGNORA o filtro desconhecido (comportamento empírico Hibernate) e retorna TODOS os PROFORMA. O isolamento em ponto único é exemplar (Tailor Interface), mas falta um **guard de runtime** distinguindo "probe confirmado" de "placeholder".

- **Melhoria Proposta**
  > Adicionar `ADIANTAMENTO_FILTER_PROBE_CONFIRMED: boolean = false` em `conexosPermutasConstants.ts` ou lê-lo do `EnvironmentProvider` (preferencial). Em `EleicaoPermutasService.executar`, antes do fan-out, gravar `BUSINESS_WARN` se `false` ("running with placeholder Conexos filter — output may include non-adiantamento PROFORMAs"). Mesmo guard para `mapDeclaracaoDataBase` (sinalizar `aging unavailable until probe`). Tactic: **Configure Behavior**.

- **Resultado Esperado**
  > Operador vê warning no painel/log antes de confiar no resultado. Guard explícito reduz risco de falso-positivo em massa no piloto. Probes confirmados / placeholders ativos visíveis no `FLOW_START`.

- **Tactic alvo**: Configure Behavior
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-4
- **Métricas de sucesso**:
  - Probe-status visível no `FLOW_START`/painel: 0 → 1
  - WARN explícito por probe pendente: 0 → 2 (P0-3 + P0-4)
- **Risco de não fazer**: 1 release antes do GO PROD sem o probe = painel popula com não-adiantamentos, derruba confiança da analista no piloto Permutas.
- **Dependências**: nenhuma; isolado do probe em si.

### [integrability-5] Cronograma explícito + ADR para retirada do `legacyConexosAdapter` (shim cookie auth)

- **Problema**
  > Comentário em `ConexosClient.ts:336-344` promete substituir o `legacyConexosAdapter` em v0.2 — sem ADR, sem prazo, sem critério de saída. Shim de backward-compat sem cronograma vira permanente, e a Fatia 2 (escrita no `fin010`) provavelmente vai precisar de auth refresh mais robusta.

- **Melhoria Proposta**
  > Criar ADR `0003-conexos-client-v0.2-cutover.md` listando: (a) escopo (own HTTP + SSM-backed auth), (b) trigger (Fatia 2 OU 1ª integração com SISPAG), (c) plano de teste (fixtures da [integrability-3]), (d) backout. Adicionar TODO referenciando o ADR no comentário existente. Tactic: **Backward-compatibility shims** (controlada).

- **Resultado Esperado**
  > Cronograma versionado. Quando v0.2 for cortado, ninguém perdeu contexto. ADRs do delta: **2 (0001, 0002) → 3**.

- **Tactic alvo**: Backward-compatibility shims
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-6
- **Métricas de sucesso**:
  - ADR criado com critério de saída do shim
  - Comentário do shim aponta para o ADR
- **Risco de não fazer**: shim vira parte permanente do código; auth cookie cookie-jar polui o `appContainer.ts` indefinidamente.
- **Dependências**: depende de decisão do Yuri quanto à v0.2 (não bloqueia merge).

### [integrability-6] Readiness probe Conexos no `bootstrapAppContainer`

- **Problema**
  > `appContainer.ts:21-28` instancia o `legacyConexosAdapter` mas não chama um endpoint baratinho (ex.: `getFiliais()` ou `getFilCodDefault()`) para validar conectividade/credenciais. Postgres já tem `init()` best-effort (`:35-42`); Conexos não tem equivalente. Primeira run de `EleicaoPermutasService.executar` é também a primeira chamada Conexos — qualquer auth quebrada cai como `ConexosError` no meio do flow, não no startup.

- **Melhoria Proposta**
  > Adicionar `try { await container.resolve(ConexosClient).getFilCodDefault(); } catch (e) { console.warn(...) }` no `bootstrapAppContainer`, paralelo ao Postgres. Loga `FLOW_START` com `conexosReachable: boolean`. Tactic: **Discover Service** (health/readiness).

- **Resultado Esperado**
  > Fail-fast no startup quando Conexos está fora; analista vê erro claro no `POST /permutas/eleicao` em vez de erro a meio-fan-out.

- **Tactic alvo**: Discover Service
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-6
- **Métricas de sucesso**:
  - Bootstrap detecta Conexos indisponível antes do 1º fan-out
  - Run sem fan-out parcial em caso de auth quebrada
- **Risco de não fazer**: Fatia 2 (escrita) começa a parecer flaky por causa de problemas de auth do bootstrap.
- **Dependências**: nenhuma.

## 6. Notas do agente

- Escopo restrito ao delta da Fatia 1 (READ-ONLY) por instrução de `--quick`. Não revisei `legacyConexosAdapter` interno, `services/conexos.ts` legado (warnings biome conhecidos), nem o fan-out write-side do `fin010` (Fatia 2).
- Métrica de latência por fan-out (`listAdiantamentosProforma` × N filiais + `getMnyTitPermutar` × M candidatas) é não-medível sem dev tenant — declarada explicitamente em §2 e ecoada no card **integrability-2** (gateway absorveria batching futuro).
- **Cross-QA**: F-integrability-1 (Zod ausente em `listTitulosAPagar`) sobrepõe com **Security** (input validation) e **Fault Tolerance** (NaN propaga em VariacaoCambial) — sinalizar ao `qa-consolidator`. F-integrability-2 (orquestrador acoplado) sobrepõe com **Modifiability** (Encapsulate). F-integrability-4 (placeholder fail-silent) sobrepõe com **Fault Tolerance** e **Testability**.
- Score 7.5/10: o delta é forte em **Encapsulate / Tailor Interface / Configure Behavior** (probes isolados em ponto único é exemplar), pesa no boundary parcial do Zod (com308) e na ausência de fixture-based contract test — defeitos honestos, não estruturais.
