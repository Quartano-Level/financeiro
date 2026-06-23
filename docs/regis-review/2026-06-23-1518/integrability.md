---
qa: Integrability
qa_slug: integrability
run_id: 2026-06-23-1518
agent: qa-integrability
generated_at: 2026-06-23T15:18:00Z
scope: backend
score: 5.5
findings_count: 9
cards_count: 9
---

# Integrability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Conexos ERP (Columbia Trading) | Primeira **escrita irreversível-por-nós** no ERP: handshake de 5 POSTs no `fin010` (criar borderô → validar invoice → validar permuta → recalcular líquido → gravar baixa) executado a partir de uma alocação `permuta_alocacao` ativa | `ConexosClient.{criarBordero,validarTituloBaixa,validarTituloPermuta,atualizarValorLiquido,gravarBaixaPermuta}` + `Fin010Baixa.ts` (wire types) + `ReconciliacaoPermutaService` (orquestração) + `legacyConexosAdapter.postGeneric` → `conexosService.authenticatedPost` (transporte legado axios+sid+`cnx-filcod`) + `business-rules/fin010-write-contract.md` (contrato derivado de **1 HAR**) | Backend Express (Render), Postgres (Supabase) com `permuta_alocacao_execucao` (write-ahead), guard-rails `CONEXOS_WRITE_ENABLED=false` + `CONEXOS_DRY_RUN=true` por padrão, homologação-first em `columbiatrading-hml.conexos.cloud` | (a) O contrato wire (`docCod`, `bxaMnyValor`, `gerNumPermuta`, `bxaCodSeq`, envelope `{messages,responseData}`) fica isolado em `ConexosClient`/`Fin010Baixa.ts`; service vê interface de domínio (`ResultadoAlocacao`, `BaixaGravada`). (b) Quirks do ERP (envelope `valid: AVISO` em 200 OK; `responseData` ausente; `400 VALIDATION` com payload válido — caso já visto no read) NÃO derrubam o handshake. (c) Substituir o lado-escrita (ex.: outra trading com Sankhya) toca apenas o client + payload do passo 5. (d) Idempotência por par adto↔invoice garante zero baixas duplicadas em re-execução. | Wire-strings (`fin010`, `bxaMnyValor`, `bxaCodSeq`, `borVldTipo`, `frontModelName`, `vldPermuta`) **só** dentro de `ConexosClient`/`Fin010Baixa.ts`/`fin010-write-contract.md`. ≥ 1 método write-side com **fixture HAR-real** persistida (`__fixtures__/conexos/fin010/*.json`). Cobertura de cenários do ERP (200+`messages.valid=AVISO`, 200 com `responseData` ausente, 400 com `responseData` válido, baixa parcial, finalização do borderô, caminho DESCONTO) ≥ 80%. 0 baixas duplicadas em produção (UNIQUE `idempotency_key`). MTTR de "ERP rejeita payload novo" < 1 dia (resposta crua é persistida em `erp_response`). |

> Hoje a Fase 3 (write-back `fin010`) acrescenta **5 métodos novos no `ConexosClient`** (linhas 992–1147), **6 tipos wire em `Fin010Baixa.ts`** e **1 service de orquestração** (`ReconciliacaoPermutaService`, 353 LOC). O contrato veio de **um único HAR** capturado em 2026-06-23 (`fin010-write-contract.md:3-5`) — três caminhos foram explicitamente declarados **não observados** no documento (baixa parcial, finalização do borderô, classificação DESCONTO). O risco arquitetural #1 (`migration-debt` O3) saiu de "inexistente" para "modelado-em-código", mas a fidelidade do modelo ao ERP em produção ainda é uma extrapolação a partir de 1 amostra.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| # de métodos write-side no `ConexosClient` | 5 (`criarBordero`, `validarTituloBaixa`, `validarTituloPermuta`, `atualizarValorLiquido`, `gravarBaixaPermuta`) | 5 (1 por passo do handshake) | ✅ | `src/backend/domain/client/ConexosClient.ts:999-1147` |
| Métodos write-side com nome genérico (`post`/`write`/`call`) | 0 — todos domain-shaped | 0 | ✅ | `grep -n "public " src/backend/domain/client/ConexosClient.ts` |
| Wire-strings `fin010` fora do `ConexosClient`/`Fin010Baixa.ts`/`ReconciliacaoPermutaService.ts` | 0 (literais `fin010`/`bxaMny*`/`borVld*` só aparecem nos 3 arquivos canônicos + ontologia) | 0 | ✅ | `grep -rn "fin010\|bxaMny\|borVldTipo" src/backend --include="*.ts" \| grep -v test \| grep -v -E '(ConexosClient.ts\|Fin010Baixa.ts\|ReconciliacaoPermutaService.ts)'` |
| Wire-strings `bxa*`/`ger*Permuta`/`pesCod` vazados no service de orquestração | 18 ocorrências em `ReconciliacaoPermutaService.ts` (campos do payload do passo 5 construídos lá) | ≤ 5 (no client/builder dedicado) | ⚠️ | `grep -nE "bxa[A-Z]\|gerNum\|gerDes\|pesCod\|dpeNomPessoa" src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts` |
| Zod no boundary dos retornos write (passos 1–5) | 0 — nem `BorderoCriado`, nem `Fin010ValidacaoResponse<TituloBaixaValidacao>`, nem `BaixaGravada` são parseados; **acessos via `?.` direto** (`val2.responseData?.bxaMnyValor`, `val4.responseData?.bxaMnyLiquido`) | ≥ 1 schema por passo do handshake (4 schemas) | ❌ | `grep -n "z\.\|zod" src/backend/domain/interface/permutas/Fin010Baixa.ts src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts` (0 hits) |
| Tratamento explícito do envelope `messages` (`valid='AVISO'`/`'ERRO'`) | 0 — `messages` está tipado em `Fin010Baixa.ts:55` mas **nunca lido** pelo service. Mock de teste devolve `valid:'SUCESSO'`/`'AVISO'` e o asserter ignora. | ≥ 1 leitura + log/abortar em `valid='ERRO'` | ❌ | `grep -n "messages\b" src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts` (0 hits); `Fin010Baixa.ts:54-57` |
| Anti-drift `\|bxaMnyValor − valorAlocado\| ≤ 0,005` (I-Write-1) | **AUSENTE** — service só checa `bxaMnyValor > 0` (`ReconciliacaoPermutaService.ts:186-192`), nunca compara contra `aloc.valorAlocado`. O contrato exige a checagem explicitamente. | implementado + teste | ❌ | `grep -n "valorAlocado\|anti-drift\|tolerância" src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts` |
| Cobertura de cenários ERP (HAR-real) no `ConexosClient.test.ts` (passos 1–5) | 6 testes (`criarBordero`, `validarTituloBaixa`, `validarTituloPermuta`, `atualizarValorLiquido`, `gravarBaixaPermuta`, `wraps write failures`) — todos felizes; **0** cenários de quirk (`messages.valid='ERRO'`, `responseData` ausente, 400 com `responseData` populado, baixa parcial, finalização do borderô, DESCONTO path) | ≥ 1 quirk por método | ⚠️ | `src/backend/domain/client/ConexosClient.test.ts:1344-1469` |
| Fixtures HAR-real do `fin010` persistidas | 0 — payloads ficam inline nos mocks do teste e no documento `fin010-write-contract.md:31-54` (JSONC com comentário) | ≥ 5 (1 por passo) em `__fixtures__/conexos/fin010/` | ❌ | `find src/backend -path '*fixtures*conexos*'` retorna 0 |
| Endpoints write versionados (URL `/v[0-9]` ou header `x-api-version`) | 0 — `fin010`, `fin010/baixas`, `fin010/baixas/validacao/*` | ≥ 1 (header opcional) | ❌ | `grep -n "/v[0-9]\|api-version" src/backend/domain/client/ConexosClient.ts` (0 hits no write) |
| Tipos write-side com `?:` (campos opcionais defensivos) | 12/20 campos opcionais em `BorderoCriado`+`TituloBaixaValidacao`+`TituloPermutaValidacao`+`BaixaGravada` — boa cobertura defensiva, mas `borCod`, `bxaCodSeq`, `bxaMnyValor`, `gerNumPermuta` permanecem **obrigatórios** sem Zod que enforce | obrigatórios devem ser parseados | ⚠️ | `src/backend/domain/interface/permutas/Fin010Baixa.ts:8-51` |
| Reuso da infra de leitura (sid + 401-retry + RetryExecutor) no write | 100% — todos os 5 métodos novos passam por `postGeneric` → `authenticatedPost` (mesma auth, mutex de login, retry) + `RetryExecutor` (2 retries, jitter 200ms) | 100% | ✅ | `ConexosClient.ts:1006-1024` |
| Guard-rail `CONEXOS_WRITE_ENABLED` + `CONEXOS_DRY_RUN` via `EnvironmentProvider` | implementado (`ReconciliacaoPermutaService.ts:87-91`) — default = dry-run; force dry-run quando `writeEnabled=false`; preview SÓ com dados locais (`buildPreviewPayload`, sem call ao ERP); idempotência `permuta:{adto}:{invoice}` | implementado | ✅ | `ReconciliacaoPermutaService.ts:87-127`; `EnvironmentVars.ts:30` |
| Dependência no transporte legado (`services/conexos.ts` axios + `process.env.CONEXOS_*`) carregada para o write | sim — `postGeneric` é uma `import('../../services/conexos.js')` dinâmica em `legacyConexosAdapter.ts:22-35` → `authenticatedPost`. Mesma camada que o read herdou (F-integrability-1 da run anterior); risco: estourar `LOGIN_ERROR_MAX_SESSIONS` no meio do handshake derruba a baixa | desejável: substituir antes do go-live em prod | ⚠️ | `legacyConexosAdapter.ts:85-96`; `services/conexos.ts:235-255` |
| Mensagem de erro do ERP capturada em `permuta_alocacao_execucao.erp_response` | sim — `extractErpData` lê `err.response.data` ou `err.cause.response.data` e persiste em `markError` (`ReconciliacaoPermutaService.ts:138-145,345-351`) | sim | ✅ | `ReconciliacaoPermutaService.ts:345-351` |
| Procedimento "finalizar borderô" implementado | **AUSENTE** — payload do passo 5 manda `borVldFinalizado:0` (borderô aberto) e nada fecha depois. `fin010-write-contract.md:89-90` reconhece como "fora do contrato observado". | abrir item ou implementar antes do go-live | ❌ | `ReconciliacaoPermutaService.ts:290`; `fin010-write-contract.md:89-90` |
| Caminho `DESCONTO` testado em E2E (não só payload) | parcial — teste unitário valida `bxaMnyJuros=0` + `bxaMnyDesconto=150` (`ReconciliacaoPermutaService.test.ts:217-234`), mas **conta gerencial `bxaCodGerDesconto`** vem do passo 2 (`val2.responseData?.bxaCodGerDesconto`) que **nunca foi probado no ERP**; HAR cobriu só JUROS (`fin010-write-contract.md:89`) | probe HAR DESCONTO antes do go-live | ⚠️ | `ReconciliacaoPermutaService.ts:234,245,300-302` |
| Per-dependency observability (taxa de falha por passo do handshake) | apenas log `BUSINESS_WARN`/`BUSINESS_INFO` por par; sem métrica por passo (1→5); sem dashboard; sem alerta proativo se 50% das baixas falham no passo 4 | `LogService.error({integration:'conexos', endpoint, step})` instrumentado + agregado | ⚠️ | `ReconciliacaoPermutaService.ts:113-118,143-147,248-252` |

> ⚠️ **Não medível localmente**: drift entre o HAR de referência (2026-06-23, 1 amostra) e o tenant em homologação `columbiatrading-hml.conexos.cloud`. Requer rodada de probe real na homologação **antes** de habilitar `CONEXOS_WRITE_ENABLED=true`. Recomendação: rodar um shadow do handshake em DRY-RUN contra HML, capturar o response real, persistir em `__fixtures__/conexos/fin010/passo-{1..5}.json` e fechar o gap I-Write-1 + os 3 caminhos não observados.

## 3. Tactics — Cobertura no nf-projects

### Limit Dependencies

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Encapsulate | Os 5 métodos write são **domain-shaped** (`criarBordero({filCod,dataMovto})`, `validarTituloBaixa({filCod,borCod,invoiceDocCod,titCod})`, etc.); 0 vazamento de wire para o service via assinatura. `Fin010Baixa.ts` modela 6 wire-shapes como interfaces no boundary. **Mas**: o payload final do passo 5 é construído **no service** (`ReconciliacaoPermutaService.buildFinalPayload`, 18 chaves wire) — wire entra no service, ainda que sob disfarce de `Record<string, unknown>`. | ⚠️ parcial | `ConexosClient.ts:999-1147` (encapsulado); `ReconciliacaoPermutaService.ts:264-318` (vaza wire) |
| Use an Intermediary | `postGeneric` em `legacyConexosAdapter.ts:85-96` é o intermediary entre `ConexosClient` e o singleton `services/conexos.ts`. **Mas**: é um pass-through fino que NÃO faz tradução semântica do envelope `{messages, responseData}` — entrega bruto ao caller. Anti-corruption layer **incompleto** no boundary do write (não há `Fin010ResponseParser` que tipe o envelope, log `valid='ERRO'`, ou extraia `responseData` defensivamente). | ⚠️ parcial | `legacyConexosAdapter.ts:85-96`; `ReconciliacaoPermutaService.ts:185,201,221,234` (service navega `responseData?.X` cru) |
| Restrict Communication Paths | `ReconciliacaoPermutaService` injeta apenas `ConexosClient` (DI obrigatório, `@inject`); nenhum service importa `services/conexos.ts` direto. Caminho único de escrita: `Service → Client → Adapter → conexosService.authenticatedPost`. | ✅ presente | `ReconciliacaoPermutaService.ts:58-69`; `grep "import.*services/conexos" src/backend/domain/service` retorna 0 |
| Adhere to Standards | `fin010` viola o REST clássico (POST `/api/fin010/baixas/validacao/tituloBaixa` faz **validação**, não criação; `frontModelName:'bordero'`/`'baixa'` é literal do front legado); sem OpenAPI, sem JSONSchema. Compensação: contrato manual em `fin010-write-contract.md`. | ⚠️ parcial — limitação do fornecedor; mitigado por doc | `fin010-write-contract.md:13-25`; `ConexosClient.ts:1015,1048` |
| Abstract Common Services | Os 5 métodos reusam **mesma** `RetryExecutor` (`retries:2, jitter:200ms`), **mesmo** `ensureSid`, **mesmo** `ConexosError` do read; arquitetonicamente perfeito reuso. **Mas**: a duplicação de auth/login/mutex em `services/conexos.ts` (F-integrability-1/5 da run anterior) é herdada — o write paga o mesmo débito do read. | ✅ no top-level / ⚠️ infra herdada | `ConexosClient.ts:1007,1036,1069,1102,1140` (todos `retryExecutor.execute` + `ensureSid` + `ConexosError`) |

### Adapt

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Discover Service | A URL do ERP-write é a mesma do read (`CONEXOS_BASE_URL`), descoberta via `process.env` ou `EnvironmentProvider`. **Guard-rail homologação-first**: `fin010-write-contract.md:84-85` documenta que `CONEXOS_BASE_URL` deve ser `https://columbiatrading-hml.conexos.cloud` antes do go-live; runtime não enforça (não há `assertWriteAllowedOnHmlOnly` que cruze `WRITE_ENABLED && PROD_URL`). | ⚠️ parcial — convenção, não enforcement | `fin010-write-contract.md:84-85`; `EnvironmentVars.ts:30-50` |
| Tailor Interface | `Fin010Baixa.ts` traduz cada passo do handshake em um tipo TS (`BorderoCriado`, `TituloBaixaValidacao`, `TituloPermutaValidacao`, `BaixaGravada`, `Fin010ValidacaoResponse<T>`); `ExecutarBaixaPermutaInput` é a interface de **entrada de alto nível** que o caller (route/service) usa. **Mas**: o tradutor "wire → domain" para a CONFIRMAÇÃO (`BaixaGravada` → `markSettled` argumento) é inline no service (`ReconciliacaoPermutaService.ts:240-247`), não um método `ConexosClient.mapBaixaGravada`. | ⚠️ parcial | `Fin010Baixa.ts:1-77`; `ReconciliacaoPermutaService.ts:240-247` |
| Configure Behavior | `EnvironmentVars.conexosWriteEnabled` + `conexosDryRun` + `input.dryRunOverride` formam 3 níveis de guard-rail (write desligada por padrão; dry-run on; override por chamada). Conta gerencial JUROS é **constante hardcoded** (`CONTA_GER_JUROS=131`, `ReconciliacaoPermutaService.ts:15`) — não exposta a SSM por enquanto (defensável, mesmo tenant). | ✅ presente | `ReconciliacaoPermutaService.ts:87-91`; `EnvironmentVars.ts:30-50` |
| Manage Resources | Reuso de sessão (sid mutex em `services/conexos.ts:76-138`) garante que os 5 POSTs sequenciais **não** abrem 5 sessões; idempotência impede dupla execução; `RetryExecutor` por passo evita amplificar falha transitória. **Mas**: não há **timeout** explícito por passo (axios default 40s do `conexosService` é o único guard); um handshake completo em pior caso = 5 × (40s + retries) ≈ 5 min — frontal-bloqueante. | ⚠️ parcial | `services/conexos.ts:81`; `ConexosClient.ts:402-409`; `ReconciliacaoPermutaService.ts:128-156` |

### Coordinate

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Orchestrate | `ReconciliacaoPermutaService.executarBaixa` orquestra **passos 2→5** linearmente por par adto↔invoice; passo 1 (criar borderô) é feito **uma vez** por adto via lazy init (`if (borCod === undefined)`). Cada falha vira `markError` + log + próximo par. Não há SAGA — só write-ahead Postgres + idempotência. | ✅ presente para o caso 1:1 / ⚠️ para N:M | `ReconciliacaoPermutaService.ts:96-156,168-262` |
| Manage Resource Coupling | Idempotência por `idempotency_key = permuta:{adto}:{invoice}` impede dupla execução; UNIQUE em `permuta_alocacao_execucao`; write-ahead grava `reconciling` ANTES do POST — falha entre POST e `markSettled` deixa rastro reconciliável. Mas: **N:M num único borderô**: se a 2ª permuta falha, a 1ª já está `settled` e o borderô fica meio-cheio aberto (`borVldFinalizado:0`) — operacionalmente o analista terá que finalizar/estornar manualmente. | ⚠️ parcial | `idempotencia-reconciliacao.md:8-28`; `ReconciliacaoPermutaService.ts:96-156` |

### Facetas modernas

| Tactic (modern) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Contract testing | 6 testes wire-shape para os 5 métodos write (todos felizes, com `messages:[{valid:'SUCESSO'}]`/`responseData` mockados); **0 fixtures HAR-real persistidas** em `__fixtures__/`; **0 testes de quirk** (200+envelope vazio, 400+responseData válido, baixa parcial). Comparado com o read (60+ testes, fixtures de 410 adiantamentos reais), a cobertura do write é desproporcionalmente rasa para a criticidade. | ⚠️ parcial — caminho feliz coberto, ERP-reality não | `ConexosClient.test.ts:1344-1469`; `ReconciliacaoPermutaService.test.ts:115-150` |
| Versioning strategy | NENHUMA — `fin010`/`fin010/baixas`/`fin010/baixas/validacao/*` sem `/v[0-9]`/header. Sem `CONEXOS_FIN010_PROBE_DATE` no `ontology/integrations/conexos.md` para o write (read tem 13 datas de probe, write tem 1: 2026-06-23). | ❌ ausente | `fin010-write-contract.md:3`; `ConexosClient.ts:1010,1038,1072,1105,1142` |
| Backward-compatibility shims | Em `Fin010ValidacaoResponse<T>`, `messages?` e `responseData?` são opcionais — bom (200 OK pode vir sem `responseData`); **mas** o service trata `responseData?.bxaMnyValor === undefined` como erro fatal (`ReconciliacaoPermutaService.ts:186-192`) e `responseData?.bxaMnyLiquido` cai num fallback `valor+juros-desconto` (`:221`). Os caminhos divergem sem documentação de qual é mais defensivo. `bxaMnyLiquidoPermuta: null` é hardcoded no payload (`:315`) — sinal de que o HAR observou `null` mas não há comentário explicando se outro caminho pode trazer valor. | ⚠️ parcial | `Fin010Baixa.ts:54-57`; `ReconciliacaoPermutaService.ts:186-192,221,315` |
| Observability de integration failures | Por par: `BUSINESS_INFO` em settled, `BUSINESS_WARN` em erro com `erpResponse` crua em `markError`. Sem métrica POR PASSO (1→5) — se o passo 4 (`atualizaValorLiquido`) for o que mais falha em produção, não dá para saber sem `grep` no log. `ConexosError` inclui `endpoint` (e.g. `fin010/baixas/validacao/atualizaValorLiquido`), o que ajuda mas não substitui contador. | ⚠️ parcial | `ReconciliacaoPermutaService.ts:113-118,143-147,248-252`; `ConexosError.ts:14-32` |

## 4. Findings (achados)

### F-integrability-1: HAR único é a fonte do contrato `fin010` — 3 caminhos críticos (baixa parcial, finalização, DESCONTO) **declaradamente não observados** e já entregues no código

- **Severidade**: P0
- **Tactic violada**: Tailor Interface / Contract testing
- **Localização**: `ontology/business-rules/fin010-write-contract.md:3-5,87-91`; `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:217-220,290,315`; `src/backend/domain/interface/permutas/Fin010Baixa.ts` (campos opcionais sem origem observada)
- **Evidência (objetiva)**:
  ```
  fin010-write-contract.md:3-5
    "Origem: engenharia reversa de um HAR real (...) de UMA baixa/permuta manual (...)"

  fin010-write-contract.md:87-91 (Fora do contrato, a confirmar em campo)
    - Comportamento quando a invoice já tem baixa parcial anterior (passo 2 pode mudar bxaMnyValor)
    - Finalização do borderô (borVldFinalizado/borDtaFinalizado) — HAR ficou com borVldFinalizado:0
    - Estorno programático (hoje o analista estorna pela UI)

  integrations/conexos.md:135-137 (Ainda não observado no ERP — follow-up)
    - Baixa parcial (invoice compartilhada N:M); finalização do borderô; caminho DESCONTO (conta 94)
    - O HAR cobriu 1 adto → 1 invoice cheia, classificação JUROS

  ReconciliacaoPermutaService.ts:217-220 (DESCONTO branch)
    const isDesconto = aloc.variacaoClassificacao === 'DESCONTO';
    const juros = isDesconto ? 0 : valorVariacao;
    const desconto = isDesconto ? valorVariacao : 0;

  ReconciliacaoPermutaService.ts:290,315 (borderô fica aberto + liquidoPermuta hardcoded null)
    borVldFinalizado: 0,
    bxaMnyLiquidoPermuta: null,
  ```
- **Impacto técnico**: O caminho DESCONTO (conta gerencial 94) tem **código já em produção dry-run** (`ReconciliacaoPermutaService.ts:217-220,300-302`) que depende de `val2.responseData?.bxaCodGerDesconto` — campo cujo *contrato real* nunca foi observado. Se o ERP devolve `bxaCodGerDesconto: null` no caminho DESCONTO (plausível porque o passo 2 só foi probado em JUROS), `bxaCodGerDesconto: null` vai para o payload do passo 5 com risco de o ERP rejeitar (HTTP 400) OU pior, aceitar e contabilizar errado. Baixa parcial: se o passo 2 retorna `bxaMnyValor` DIFERENTE do valor alocado (em-aberto mudou no ERP), o anti-drift I-Write-1 **não está implementado** (ver F-2) — o service segue e baixa um valor não previsto pelo analista. Finalização do borderô: 0 implementação; cada execução deixa um borderô aberto no ERP.
- **Impacto de negócio**: a Fase 3 é a primeira escrita irreversível-por-nós no ERP. Habilitar `CONEXOS_WRITE_ENABLED=true` antes de probar os 3 caminhos no HML pode (a) deixar pendurados borderôs abertos exigindo limpeza manual pelo analista; (b) baixar valor errado em permutas parciais; (c) crashar o caminho DESCONTO em produção, derrubando 100% das baixas com variação cambial favorável. ROI da automação Fase 3 vira negativo se o analista precisa abrir o Conexos a cada baixa para "ver se entrou direito".
- **Métrica de baseline**: 1 HAR observado / 4 cenários relevantes (JUROS-cheia, JUROS-parcial, DESCONTO-cheia, DESCONTO-parcial) → 25% de cobertura empírica do contrato; 3/3 caminhos não observados já têm código.

### F-integrability-2: Invariante I-Write-1 (anti-drift) declarada no contrato mas **não implementada** no service

- **Severidade**: P0
- **Tactic violada**: Tailor Interface / Manage Resource Coupling
- **Localização**: `ontology/business-rules/fin010-write-contract.md:75-76`; `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:178-192`
- **Evidência (objetiva)**:
  ```
  fin010-write-contract.md:75-76
    "I-Write-1 (anti-drift): antes do passo 5, |bxaMnyValor(passo 2) − valorEsperadoDaAlocacao| deve
     estar dentro da tolerância (≤ 0,005 na moeda do título); divergência ⇒ abortar (em-aberto mudou
     no ERP)."

  ReconciliacaoPermutaService.ts:185-192
    const bxaMnyValor = val2.responseData?.bxaMnyValor;
    if (bxaMnyValor === undefined || !(bxaMnyValor > 0)) {
        throw new Error(
            `título ${invoiceDocCod} sem valor em aberto no ERP (bxaMnyValor=${String(bxaMnyValor)})`,
        );
    }
    // ← falta: if (Math.abs(bxaMnyValor − aloc.valorAlocado) > 0.005) throw ...
    // passo 3 …
  ```
- **Impacto técnico**: O service só verifica `bxaMnyValor > 0`; não compara contra `aloc.valorAlocado`. Cenário concreto: o analista monta uma alocação com `valorAlocado = 7.800 USD`; entre a alocação e o `reconciliar`, alguém da Columbia executa uma baixa parcial via UI do ERP no mesmo título; o passo 2 agora retorna `bxaMnyValor = 3.200 USD`. O service segue, recalcula líquido com 3.200, grava baixa de 3.200 — mas a alocação no nosso banco diz 7.800 settled. Sistema fica inconsistente com o ERP **silenciosamente**; o analista vê "settled" e arquiva.
- **Impacto de negócio**: corrupção da fonte da verdade. Em N:M, isso pode liberar saldo de adiantamento "fantasma" no nosso sistema, causando duplo uso. Audit-trail engana o financeiro. Em homologação isso é trivial de detectar; em produção, com cron rodando 3×/dia, vira backlog de reconciliação manual em poucos dias.
- **Métrica de baseline**: 0 testes contemplam drift (`ReconciliacaoPermutaService.test.ts` só testa `bxaMnyValor=0`); regra documentada / regra implementada = 0/1.

### F-integrability-3: Envelope `{messages, responseData}` modelado em `Fin010Baixa.ts` mas o array `messages` **nunca é lido** — `valid='ERRO'` em 200 OK passa despercebido

- **Severidade**: P1
- **Tactic violada**: Use an Intermediary / Tailor Interface
- **Localização**: `src/backend/domain/interface/permutas/Fin010Baixa.ts:53-57`; `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:179-221`
- **Evidência (objetiva)**:
  ```
  Fin010Baixa.ts:53-57
    /** Envelope `{ messages, responseData }` das rotas de validação do `fin010`. */
    export interface Fin010ValidacaoResponse<T> {
        messages?: Array<{ valid?: string; message?: string; vars?: Record<string, unknown> }>;
        responseData?: T;
    }

  grep "messages\b" src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts → 0 hits
  grep "messages\b" src/backend/domain/client/ConexosClient.ts:1027-1147 → 0 hits

  ConexosClient.test.ts:1394, 1415 (mocks reconhecem que `messages` existe)
    messages: [{ valid: 'SUCESSO' }] / [{ valid: 'AVISO' }]   ← mas nenhum teste com valid='ERRO'
  ```
- **Impacto técnico**: o Conexos pode responder HTTP 200 com `{messages:[{valid:'ERRO', message:'TÍTULO JÁ BAIXADO'}], responseData: null}` (padrão observado no read em `ConexosClient.ts:920-948` para o `getDetalheTitulos`, que **trata** o caso). O service trata `responseData?.bxaMnyValor === undefined` como "sem valor em aberto", confundindo erro de validação com título já baixado. Mensagem do ERP nunca chega ao log nem a `markError`.
- **Impacto de negócio**: troubleshooting em produção precisa de tail no log do Render + correlação manual; a mensagem semântica do ERP (que diria exatamente por que rejeitou) fica em `messages[0].message` e é descartada. MTTR em erros de validação ERP fica horas em vez de minutos.
- **Métrica de baseline**: 4 endpoints write retornam o envelope `{messages, responseData}`; 0/4 têm leitura/log de `messages`; 0 testes cobrem `valid='ERRO'`.

### F-integrability-4: Zod ausente no boundary write — `BorderoCriado.borCod`, `BaixaGravada.bxaCodSeq`, `responseData.bxaMnyValor` são consumidos sem parse

- **Severidade**: P1
- **Tactic violada**: Encapsulate (validate at boundary) / Contract testing
- **Localização**: `src/backend/domain/interface/permutas/Fin010Baixa.ts` (0 schemas); `src/backend/domain/client/ConexosClient.ts:999-1147` (todos retornos via `postGeneric<T>`); `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:131,185,201,221,239`
- **Evidência (objetiva)**:
  ```
  grep "z\.\|zod\|ZodSchema" src/backend/domain/interface/permutas/Fin010Baixa.ts → 0 hits
  grep "z\.\|zod" src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts → 0 hits

  ReconciliacaoPermutaService.ts:131
    const bordero = await this.conexosClient.criarBordero({ filCod, dataMovto });
    borCod = bordero.borCod;          // ← number coerced, não validado

  ReconciliacaoPermutaService.ts:239
    const baixa = await this.conexosClient.gravarBaixaPermuta({ filCod, payload });
    await this.execucaoRepository.markSettled(key, {
        borCod, bxaCodSeq: baixa.bxaCodSeq,  // ← se vier null, vira "null" no Postgres
        ...
    });
  ```
  Compare com o read: `com298RowSchema.parse(row)` em `ConexosClient.ts:652,718`.
- **Impacto técnico**: o read evoluiu para Zod (`com298RowSchema`, `declaracaoRowSchema`) depois do incidente de Adiantamento sem identidade; o write **regrediu** o padrão. Se o ERP devolve `{bxaCodSeq: "1"}` (string) em vez de número (perfeitamente possível em outra versão do Conexos), o TS dispara coerção implícita: o `markSettled` recebe string num campo `INTEGER` do Postgres e quebra com erro genérico de driver. Pior: se vier `{bxaCodSeq: null}` mascarado por um `BaixaGravada.bxaCodSeq: number` (não-opcional), o `null` chega ao banco e a baixa "settled" sem confirmação — viola I-Recon-2.
- **Impacto de negócio**: confiabilidade da fonte da verdade do estado de baixa. Sem Zod boundary, a única defesa é o teste unitário com mock — e os mocks atuais (`ConexosClient.test.ts:1347-1456`) sempre devolvem o formato canônico, nunca os 5 desvios plausíveis.
- **Métrica de baseline**: 0/6 wire-types em `Fin010Baixa.ts` têm schema Zod; 0/5 métodos write fazem parse; 2/9 readers fazem (read foi 22%, write 0%).

### F-integrability-5: Payload final do passo 5 construído **no service**, com 18 wire-keys; service conhece `bxaCodGerJuros`, `gerNumPermuta`, `dpeNomPessoa`, `bxaVldCorrenteDc`, etc.

- **Severidade**: P1
- **Tactic violada**: Encapsulate / Tailor Interface
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:264-318` (`buildFinalPayload`, 50 LOC, 18 chaves wire)
- **Evidência (objetiva)**:
  ```
  ReconciliacaoPermutaService.ts:285-318 (buildFinalPayload)
    return {
        bxaVldSistema: 0, docTip: 2, bxaVldCcorrente: 0, bxaVldCorrenteDc: 1, borVldFinalizado: 0,
        filCod: p.filCod, borCod: p.borCod, borVldTipo: 2,
        gerNum: p.perm.gerNum ?? p.perm.gerNumPermuta,
        gerDes: p.perm.gerDes ?? p.perm.gerDesPermuta ?? null,
        bxaVldAdto: 1, frontModelName: 'baixa', docCod: p.invoiceDocCod, titCod: 1,
        bxaMnyDesconto: p.desconto, bxaCodGerDesconto: p.descontoGerCod ?? null,
        gerDesDesconto: p.descontoGerDes ?? null,
        bxaMnyValor: p.bxaMnyValor, bxaMnyMulta: 0,
        bxaMnyJuros: p.juros, bxaCodGerJuros: CONTA_GER_JUROS, gerDesJuros: GER_DES_JUROS,
        bxaMnyLiquido: p.bxaMnyLiquido, bxaDocTip: 2, bxaDocCod: p.adiantamentoDocCod, bxaTitCod: 1,
        gerDesPermuta: p.perm.gerDesPermuta ?? null, dpeNomPessoa: p.perm.dpeNomPessoa ?? null,
        gerNumPermuta: p.perm.gerNumPermuta, bxaMnyLiquidoPermuta: null,
        pesCod: p.perm.pesCod ?? null, bxaMnyValorPermuta: p.perm.bxaMnyValorPermuta ?? null,
    };
  ```
- **Impacto técnico**: substituir o Conexos por outro ERP (futuro multi-tenant — Sankhya, Protheus) força reescrita do `buildFinalPayload` dentro do service de orquestração, não no client. Constantes wire (`bxaVldSistema:0`, `bxaVldCorrenteDc:1`, `frontModelName:'baixa'`, `bxaVldAdto:1`) ficam dispersas no service; nenhuma explicação do que cada flag faz no ERP. Quebra a simetria com o read, onde os mappers (`mapDocPagar`, `mapDetalheTitulos`) ficam no client.
- **Impacto de negócio**: cost-of-change da migração para Lambda/multi-tenant cresce; o `ConexosClient` deveria ser substituível por um `SankhyaClient` com a mesma interface (`gravarBaixaPermuta({filCod, payload})`), mas o payload é construído fora — quebra a abstração. Frente SISPAG (write em conexos via Nexxera retorno) vai querer um `buildFinalPayload` próprio e o padrão se replica.
- **Métrica de baseline**: 18 wire-keys no service / 5 wire-keys deveriam ser passadas (`filCod`, `borCod`, `invoiceDocCod`, `adiantamentoDocCod`, `juros + classificacao`).

### F-integrability-6: 0 fixtures HAR-real persistidas; payload do contrato vive em **comentário JSONC** no `.md`

- **Severidade**: P1
- **Tactic violada**: Contract testing / Versioning strategy
- **Localização**: `ontology/business-rules/fin010-write-contract.md:31-57`; `src/backend/domain/client/ConexosClient.test.ts:1344-1469`; `src/backend/__fixtures__/` (não existe)
- **Evidência (objetiva)**:
  ```
  find src/backend -path '*fixtures*conexos*' → 0 hits
  find src/backend -name 'fin010*.json'        → 0 hits

  fin010-write-contract.md:31-54   ← contrato vive em ```jsonc``` (com comentários — NÃO parseável)
  ConexosClient.test.ts:1347-1453  ← payloads inline nos mocks (duplicados se mudarem)
  ```
- **Impacto técnico**: o documento canônico do contrato é JSONC com comentários — não pode ser carregado em CI para validar. Cada teste duplica o shape do payload. Quando o Conexos quebrar o shape (nova versão), descobrir "qual era o shape conhecido" exige `git log fin010-write-contract.md` e leitura manual. Comparado com o read (que tem `__fixtures__/com298/...json` referenciados no test), o write é uma regressão de prática.
- **Impacto de negócio**: incapaz de diff-against-last-known-good em CI nightly (card integrability-2 da run anterior). Cada upgrade do ERP do tenant é um surto sem alerta.
- **Métrica de baseline**: 0 fixtures HAR-real; 1 referência JSONC; 6 testes com payload inline.

### F-integrability-7: Finalização do borderô **não implementada** — cada `reconciliar` deixa borderô aberto no ERP

- **Severidade**: P1
- **Tactic violada**: Orchestrate / Manage Resource Coupling
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:290,128-156`; `ontology/business-rules/fin010-write-contract.md:89-90`
- **Evidência (objetiva)**:
  ```
  ReconciliacaoPermutaService.ts:290
    borVldFinalizado: 0,                ← passo 1 cria aberto; passo 5 mantém aberto

  grep "finalizarBordero\|borVldFinalizado: 1" src/backend → 0 hits (nada finaliza)

  fin010-write-contract.md:89-90 (Fora do contrato — a confirmar)
    Finalização do borderô (borVldFinalizado/borDtaFinalizado) — o HAR ficou com borVldFinalizado:0
    (borderô aberto); confirmar se a permuta exige um passo de "finalizar".
  ```
- **Impacto técnico**: borderôs ficam pendurados; auditoria fiscal da Columbia vai querer cada borderô fechado. Em N:M, se 2 de 3 pares foram `settled` e o 3º deu erro, o borderô tem 2 baixas + 1 buraco — analista precisa logar no fin010 manualmente e finalizar ou estornar. O service não expõe (a) "fechar borderô agora", (b) "estornar este par".
- **Impacto de negócio**: vira "automação 80%" — analista ainda precisa entrar no ERP toda execução. ROI da Fase 3 (~tempo de tela analista/mês) cai pela metade. Risco fiscal se o borderô aberto contiver baixas finalizadas mas o relatório do ERP listar como pendente.
- **Métrica de baseline**: 0 implementação / 1 caso de uso documentado; 100% das execuções reais deixarão borderô aberto até confirmação do contrato.

### F-integrability-8: Acoplamento ao transporte legado herda Rule #4/#8 violations — falha de auth no meio do handshake corrompe baixa

- **Severidade**: P1
- **Tactic violada**: Encapsulate / Use an Intermediary / Restrict Communication Paths (cross-finding F-integrability-1 da run anterior 2026-06-22-1658)
- **Localização**: `src/backend/domain/client/legacyConexosAdapter.ts:22-35,85-96`; `src/backend/services/conexos.ts:235-255,289-312`
- **Evidência (objetiva)**:
  ```
  legacyConexosAdapter.ts:22-35
    const { conexosService } = (await import('../../services/conexos.js')) as { ... };
    // postGeneric = pass-through para conexosService.authenticatedPost
    return conexosService.authenticatedPost<T>(`/${path}`, body, opts);

  services/conexos.ts:244-254 (401 retry pode disparar NO MEIO do handshake)
    try { return resp.data; }
    catch (err) {
        if (status !== 401) throw err;
        await this.login();   ← se houver LOGIN_ERROR_MAX_SESSIONS, retry pode quebrar
        const resp = await this.client.post<T>(...);
        return resp.data;
    }

  services/conexos.ts:80,144-145
    baseURL: process.env.CONEXOS_BASE_URL || 'https://columbiatrading.conexos.cloud/api'
    const username = process.env.CONEXOS_USERNAME;
    const password = process.env.CONEXOS_PASSWORD;
  ```
- **Impacto técnico**: cenário 1 — passo 1 (criar borderô) sucesso → sid expira → passo 2 dispara 401 → re-login esbarra em `LOGIN_ERROR_MAX_SESSIONS` (concorrência com outro fan-out) → passo 2 falha → `markError` sem `bxaCodSeq` mas borderô EXISTE no ERP → próxima execução cria NOVO borderô para o mesmo adto (a chave de idempotência é por par adto↔invoice, não por borderô). Cenário 2 — `CONEXOS_BASE_URL` muda em deploy: write começa apontando para produção sem ninguém perceber (não há `assertWriteAllowedOnHmlOnly`). Cenário 3 — credenciais via env globais → sem segregação por tenant (esperado SaaSo).
- **Impacto de negócio**: bloqueia o go-live em produção até o transporte ser internalizado (integrability-1 da run anterior é pré-requisito do `CONEXOS_WRITE_ENABLED=true`). Sem isso, há risco real de dupla escrita lateral via borderô fantasma.
- **Métrica de baseline**: 3 `process.env.CONEXOS_*` raw no transporte; 0 enforcement de "WRITE_ENABLED ⇒ HML"; 1 retry 401 que pode disparar no meio do handshake sem mecanismo de "abort handshake e marcar inconsistent".

### F-integrability-9: Sem instrumentação per-passo — taxa de falha do `validarTituloPermuta` vs. `gravarBaixaPermuta` é invisível

- **Severidade**: P2
- **Tactic violada**: Observability of integration failures (modern facet)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:113-118,143-147,248-252`; `src/backend/domain/errors/ConexosError.ts:14-32`
- **Evidência (objetiva)**:
  ```
  ReconciliacaoPermutaService.ts:143-147   ← um log por par, sem passo
    await this.logService.error({
        type: LOG_TYPE.BUSINESS_WARN,
        message: 'permuta reconciliacao FALHOU (registrada como error)',
        data: { adiantamentoDocCod, invoiceDocCod: aloc.invoiceDocCod, mensagem },
    });
  ```
  `ConexosError` carrega `endpoint: 'fin010/baixas/validacao/atualizaValorLiquido'` mas o log do service não emite o `endpoint` separado; descobrir o passo exige `grep "endpoint"` no stdout do Render.
- **Impacto técnico**: se em produção 40% das baixas falharem no passo 4 (`atualizarValorLiquido`) por uma quirk de arredondamento e 5% no passo 5 por outra coisa, o operador só vê "40+5=45% baixas com error". Sem distinguir passo 4 vs 5, o time olha pro código errado primeiro.
- **Impacto de negócio**: MTTD ↑ e MTTR ↑ em incidentes ERP. Cron 3×/dia pode acumular erro silencioso.
- **Métrica de baseline**: 0 métricas/contadores per-passo; 1 log por par.

## 5. Cards Kanban

### [integrability-1] Probar HML antes do go-live: capturar 3 HARs adicionais (baixa parcial, DESCONTO, finalização) e cobrir caminho desconhecido com testes

- **Problema**
  > O contrato `fin010` vem de **um único HAR** (1 adto → 1 invoice cheia, JUROS). 3 caminhos críticos (baixa parcial, DESCONTO, finalização do borderô) já têm código entregue mas **nunca foram observados no ERP**; habilitar `CONEXOS_WRITE_ENABLED=true` em produção sem essa cobertura cria risco real de corrupção de baixa, payload rejeitado e borderô pendurado.

- **Melhoria Proposta**
  > Antes do toggle de produção: rodar manualmente cada um dos 3 caminhos no portal `columbiatrading-hml.conexos.cloud`, capturar HARs, persistir em `src/backend/__fixtures__/conexos/fin010/{passo,cenario}.json` (1 por passo × 3 cenários = 15 fixtures), atualizar `Fin010Baixa.ts` se algum campo novo emergir, e cobrir cada cenário com pelo menos um teste em `ConexosClient.test.ts` E em `ReconciliacaoPermutaService.test.ts`. Documentar em `fin010-write-contract.md` movendo os 3 itens de "Fora do contrato" para "Confirmado em HML 2026-MM-DD" com referência ao fixture.

- **Resultado Esperado**
  > Caminhos cobertos passam de 1/4 → 4/4. Habilitar `CONEXOS_WRITE_ENABLED=true` em produção fica safe. Próximos quirks viram apenas ajustes incrementais sob fixture pinada.

- **Tactic alvo**: Contract testing / Tailor Interface
- **Severidade**: P0
- **Esforço estimado**: M (2–5d) — depende do acesso ao HML e disponibilidade do analista para reproduzir os 3 cenários
- **Findings relacionados**: F-integrability-1, F-integrability-6, F-integrability-7
- **Métricas de sucesso**:
  - Cenários HAR-real cobertos: 1/4 → 4/4
  - Fixtures `__fixtures__/conexos/fin010/*.json`: 0 → 15
  - Itens "fora do contrato" em `fin010-write-contract.md:87-91`: 3 → 0
- **Risco de não fazer**: dupla baixa lateral por borderô fantasma; baixa em valor errado em permuta parcial; payload DESCONTO rejeitado em produção zerando 100% das baixas com variação favorável.
- **Dependências**: nenhuma — pré-requisito do `CONEXOS_WRITE_ENABLED=true`.

### [integrability-2] Implementar invariante I-Write-1 (anti-drift) no `ReconciliacaoPermutaService`

- **Problema**
  > A regra documentada em `fin010-write-contract.md:75-76` exige checar `|bxaMnyValor(passo 2) − valorEsperadoDaAlocacao| ≤ 0,005` e abortar em divergência. O service só checa `bxaMnyValor > 0`. Se uma baixa parcial entrar no ERP entre a alocação e o `reconciliar`, o sistema baixa valor diferente do alocado **silenciosamente**.

- **Melhoria Proposta**
  > Após capturar `bxaMnyValor` no passo 2, comparar com `aloc.valorAlocado` (mesma moeda do título); se divergir além de 0,005 (constante exposta em `EnvironmentVars` para tweak por moeda), lançar `ConexosWriteDriftError` (novo erro tipado) que cai no `markError` com `erro_mensagem` claro ("em-aberto divergiu: alocado 7800,00 / ERP 3200,00; refazer alocação"). Teste unitário em `ReconciliacaoPermutaService.test.ts`: case `forces error when ERP returns smaller bxaMnyValor than alocado` e `accepts within tolerance (≤0,005)`.

- **Resultado Esperado**
  > 0 baixas silenciosas com valor divergente da alocação; analista é avisado para refazer a alocação.

- **Tactic alvo**: Manage Resource Coupling / Tailor Interface
- **Severidade**: P0
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-2, F-integrability-1
- **Métricas de sucesso**:
  - Implementação da regra I-Write-1: ausente → presente
  - Cobertura de teste do anti-drift: 0 → 2 casos (within / divergent)
- **Risco de não fazer**: corrupção da fonte da verdade da reconciliação; saldo fantasma; auditoria reprovada.
- **Dependências**: nenhuma.

### [integrability-3] Tratar envelope `messages` em `Fin010ValidacaoResponse` — extrair `valid='ERRO'` antes de seguir o handshake

- **Problema**
  > O Conexos pode responder HTTP 200 com `{messages:[{valid:'ERRO', message:'...'}], responseData: null}` — observado no read (`getDetalheTitulos` trata 400+responseData válido), provável no write. Service hoje ignora `messages` completamente e infere "sem em-aberto" quando o real motivo é validação semântica.

- **Melhoria Proposta**
  > Introduzir um helper privado `assertValidacaoOk(resp: Fin010ValidacaoResponse<T>, passo: string): T` no `ConexosClient` (ou em `Fin010Baixa.ts` como function pura) que: (a) se `messages?[*].valid === 'ERRO'`, lança `ConexosWriteValidationError({passo, mensagens})` com texto agregado; (b) se `responseData == null`, mesma exceção; (c) retorna `responseData` tipado. Usar nos 3 passos de validação (2, 3, 4). Bonus: logar `valid='AVISO'` em `BUSINESS_INFO` para visibilidade.

- **Resultado Esperado**
  > Erros de validação ERP viram mensagem semântica em `erp_response`/log em vez de `bxaMnyValor=undefined`; MTTR de incidentes ERP cai de horas para minutos.

- **Tactic alvo**: Use an Intermediary / Observability of integration failures
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-3, F-integrability-9
- **Métricas de sucesso**:
  - `messages` lido / total de passos com envelope: 0/4 → 4/4
  - Testes de cenário `valid='ERRO'`: 0 → 3 (passo 2, 3, 4)
- **Risco de não fazer**: troubleshooting custoso; quirks do ERP viram bugs intermitentes sem causa raiz visível.
- **Dependências**: nenhuma; sinergia com integrability-1 (HAR de quirk).

### [integrability-4] Adicionar schemas Zod no boundary write (`Fin010Baixa.ts`) e parsear em todos os 5 métodos

- **Problema**
  > Os tipos write (`BorderoCriado`, `BaixaGravada`, `Fin010ValidacaoResponse<T>`) são puramente TS — não há parse no boundary. `bxaCodSeq` pode chegar como string, `borCod` como `null`, sem proteção. Read evoluiu para Zod (`com298RowSchema`); write regrediu o padrão.

- **Melhoria Proposta**
  > Criar `src/backend/domain/client/permutas/fin010Schemas.ts` com `borderoCriadoSchema`, `tituloBaixaValidacaoSchema`, `tituloPermutaValidacaoSchema`, `valorLiquidoResponseSchema`, `baixaGravadaSchema` (cada um com `.passthrough()` para tolerar campos extras do ERP). Parsear nos 5 métodos do `ConexosClient` ANTES de retornar. Schema errors disparam `ConexosError({endpoint, cause: zodErr})` — caller já sabe lidar via `markError`.

- **Resultado Esperado**
  > Wire shape inesperado é detectado em segundos no boundary, não horas depois numa exceção `pg`; mensagem do erro aponta exatamente o campo (`bxaCodSeq: expected number, got null`).

- **Tactic alvo**: Encapsulate / Contract testing / Backward-compatibility shims
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-4, F-integrability-6
- **Métricas de sucesso**:
  - Métodos write com Zod parse: 0/5 → 5/5
  - Schemas Zod definidos em `fin010Schemas.ts`: 0 → 5
  - Mantém compatibilidade com `.passthrough()` para futura adição de campos
- **Risco de não fazer**: corrupção silenciosa de `permuta_alocacao_execucao` quando o ERP mudar tipo de algum campo; debug por inspeção manual.
- **Dependências**: nenhuma; idealmente alinha com card integrability-1 (fixtures HAR-real validam os schemas).

### [integrability-5] Mover `buildFinalPayload` para o `ConexosClient` (encapsulamento do passo 5)

- **Problema**
  > 18 wire-keys vivem no service de orquestração (`ReconciliacaoPermutaService.buildFinalPayload`). Constantes obscuras (`bxaVldSistema:0`, `bxaVldCorrenteDc:1`, `frontModelName:'baixa'`) sem comentário. Substituir o ERP exige rewrite do service, não troca de client.

- **Melhoria Proposta**
  > Mover `buildFinalPayload` para um método privado do `ConexosClient` (ou para `Fin010Baixa.ts` como pure function `buildBaixaPermutaPayload(inputs): Record<string,unknown>` consumida pelo client). Service passa apenas o **insumo de domínio** (`{filCod, borCod, invoice, adiantamento, val2Response, val3Response, val4Response, classificacao, valorVariacao}`); client conhece o payload. Documentar cada constante wire com origem do HAR (linha do fin010-write-contract.md).

- **Resultado Esperado**
  > Service fica com 0 wire-keys (apenas chama métodos domain-shaped); cost-of-change de "swap ERP" cai. Simetria com o read restaurada (mappers no client).

- **Tactic alvo**: Encapsulate / Tailor Interface
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-5
- **Métricas de sucesso**:
  - Wire-keys em `ReconciliacaoPermutaService.ts`: 18 → 0
  - Wire-keys em `ConexosClient.ts`/`Fin010Baixa.ts`: +18 (concentrados no boundary)
- **Risco de não fazer**: cada feature write futura (SISPAG `com298 baixa`, GED upload-conexos-confirmação) replica o anti-padrão; abstração quebrada.
- **Dependências**: ideal após integrability-4 (Zod) — assim o builder fica em terreno tipado.

### [integrability-6] Persistir fixtures HAR-real do `fin010` e fazer CI diff contra payload de referência

- **Problema**
  > O payload canônico vive em `fin010-write-contract.md` como JSONC (com comentários — não parseável). Cada teste duplica o shape. Não há diff CI contra "último contrato conhecido".

- **Melhoria Proposta**
  > Persistir os HARs como `__fixtures__/conexos/fin010/passo-{1..5}.{json,response.json}` (request + response separados, sem comentário, parseáveis). Substituir mocks inline de `ConexosClient.test.ts` por `JSON.parse(fs.readFileSync(fixturePath))`. Estender `scripts/conexos-probe.ts` (card integrability-2 da run anterior) com modo `--write-dry` que executa o handshake completo em HML, captura respostas, diffa contra os fixtures, alerta no diff.

- **Resultado Esperado**
  > Contrato vira código + dado parseável. CI nightly detecta drift de shape em ≤24h. Onboard de novo dev na Fase 3 cai de "leia o .md" para "rode `npm test -- fin010`, leia os fixtures".

- **Tactic alvo**: Contract testing / Versioning strategy
- **Severidade**: P1
- **Esforço estimado**: S (≤1d) — após integrability-1 ter capturado os HARs reais
- **Findings relacionados**: F-integrability-6, F-integrability-1
- **Métricas de sucesso**:
  - Fixtures `__fixtures__/conexos/fin010/`: 0 → 15
  - Testes que parseiam fixture vs inline mock: 0 → 6
  - CI nightly drift-check: ausente → presente
- **Risco de não fazer**: upgrade do ERP da Columbia (ou de outro tenant futuro) vira surto.
- **Dependências**: integrability-1.

### [integrability-7] Implementar finalização do borderô (após N baixas no mesmo adto) ou caso de uso explícito de "manter aberto"

- **Problema**
  > Cada `reconciliar` cria um borderô com `borVldFinalizado:0` e NUNCA chama um passo 6 de finalização. Borderôs ficam pendurados; auditoria/fiscal precisa de borderô fechado.

- **Melhoria Proposta**
  > Após o último par adto↔invoice settled (loop em `reconciliar` termina), chamar um novo método `ConexosClient.finalizarBordero({filCod, borCod, borDtaFinalizado: dataMovto})` (a confirmar wire em HML — junto do card integrability-1). Se ALGUM par falhou no batch, manter aberto e emitir `BUSINESS_WARN` com `borCod` para acompanhamento operacional. Marcar status do borderô em `permuta_alocacao_execucao` (`bordero_finalizado_em`).

- **Resultado Esperado**
  > 0 borderôs abertos por execuções 100% sucesso; analista usa Conexos só para resolver erros, não para "fechar tudo".

- **Tactic alvo**: Orchestrate / Manage Resource Coupling
- **Severidade**: P1
- **Esforço estimado**: M (2–5d) — depende do probe HML
- **Findings relacionados**: F-integrability-7, F-integrability-1
- **Métricas de sucesso**:
  - Borderôs abertos pós-execução (sucesso completo): 100% → 0%
  - Implementação `finalizarBordero`: ausente → presente + testado
- **Risco de não fazer**: automação fica "80%"; ROI Fase 3 reduzido; risco fiscal.
- **Dependências**: integrability-1.

### [integrability-8] Bloquear `CONEXOS_WRITE_ENABLED=true` quando `CONEXOS_BASE_URL` apontar para produção sem assinatura explícita (homologação-first enforcement)

- **Problema**
  > A regra `I-Write-5` (homologação-first, `fin010-write-contract.md:84-85`) é **convenção**, não enforcement. Um deploy errado (env var trocada) leva o write para produção sem ninguém perceber. Combinado com a herança do transporte legado (Rule #4/#8), o risco em pré-go-live é alto.

- **Melhoria Proposta**
  > No `EnvironmentProvider`, validar a combinação no boot: se `conexosWriteEnabled === true` E `conexosBaseUrl` não bate o regex `^https?://.*-hml\.conexos\.cloud` E `CONEXOS_PROD_WRITE_ACK !== 'I-have-read-fin010-write-contract'` → lançar `WriteEnabledInProdWithoutAckError` no startup. Documentar o ack em `DEPLOY.md`. Internalizar paralelamente o transporte (`integrability-1` da run anterior) elimina o ponto de configuração frágil.

- **Resultado Esperado**
  > Deploy errado em produção falha rápido e ruidoso no boot; o ack consciente é única forma de habilitar write em prod.

- **Tactic alvo**: Discover Service / Restrict Communication Paths / Configure Behavior
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-8
- **Métricas de sucesso**:
  - Enforcement runtime de "WRITE_ENABLED ⇒ HML or ACK": ausente → presente
  - Boot falha se inconsistente: implementado + testado
- **Risco de não fazer**: write desligado-por-padrão é defesa #1; perdê-la por engano em deploy = baixa irreversível em produção sem testes prévios em HML.
- **Dependências**: alinha com integrability-1 (run anterior, internalização do transporte).

### [integrability-9] Instrumentar métrica per-passo do handshake (passo 1..5) e contador de falhas por endpoint

- **Problema**
  > Hoje a falha do handshake é logada como "permuta reconciliacao FALHOU" sem distinguir o passo. Se 40% das execuções falham em `atualizaValorLiquido` por uma quirk de arredondamento e 5% em `gravarBaixaPermuta` por outra, o operador vê só "45% erros".

- **Melhoria Proposta**
  > No `ReconciliacaoPermutaService.executarBaixa`, envolver cada `await this.conexosClient.X(...)` num try/catch que enriquece o `BUSINESS_WARN` com `step: 'validarTituloBaixa' | 'validarTituloPermuta' | 'atualizarValorLiquido' | 'gravarBaixaPermuta'`. Persistir `erro_passo` em `permuta_alocacao_execucao` (nova coluna). Curto prazo: SQL roda no Supabase produz contagem por passo. Médio prazo (após Lambda): EventBridge → CloudWatch metric.

- **Resultado Esperado**
  > Operação consegue responder "em qual passo do handshake estamos perdendo mais baixas?" sem `grep`. MTTD de quirks novos do ERP cai.

- **Tactic alvo**: Observability of integration failures
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-9, F-integrability-3
- **Métricas de sucesso**:
  - Granularidade do log de erro: 1 nível → 4 níveis (1 por passo do handshake)
  - Coluna `erro_passo` em `permuta_alocacao_execucao`: ausente → presente
- **Risco de não fazer**: incidentes ERP demoram mais para isolar; cron 3×/dia acumula erro mudo.
- **Dependências**: nenhuma; sinergia com integrability-3 (envelope `messages` enriquece o `erro_mensagem`).

## 6. Notas do agente

- O write-side da `fin010` SAIU de "ausente" (run anterior) para "modelado + dry-run pronto" — progresso significativo, mas a fidelidade do contrato a UM HAR (com 3 caminhos auto-declarados não observados) torna **F-integrability-1/2 P0**; nada mais que o probe HML mitiga isso.
- Cross-QA: F-integrability-2 (anti-drift I-Write-1) tem overlap com **Fault-Tolerance** (anti-super-pagamento) e **Modifiability** (regra documentada que não rastreou para o código — gap de pipeline). F-integrability-3 (envelope `messages`) overlaps com **Security** (mensagem ERP pode conter info sensível) e **Observability**. F-integrability-8 (homologação-first enforcement) overlaps com **Deployability** e **Security** (credenciais).
- A herança do transporte legado (`F-integrability-8`) é um findings repetido da run 2026-06-22-1658 (`F-integrability-1` lá) — o write o re-expõe com mais risco. Recomendo que o consolidator agrupe as duas como um único item de débito-arquitetural.
- Não consegui medir taxa real de drift entre o HAR de referência e o tenant HML — depende de probe na infra ERP que está fora do alcance local.
