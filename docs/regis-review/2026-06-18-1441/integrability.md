---
qa: Integrability
qa_slug: integrability
run_id: 2026-06-18-1441
agent: qa-integrability
generated_at: 2026-06-18T14:41:00-03:00
scope: backend
score: 8
findings_count: 2
cards_count: 2
---

# Integrability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Equipe de produto (gate-3-pago-via-detail) | Necessidade de hidratar `pago` da PROFORMA junto com `valorPermutar` a partir do MESMO endpoint detail (`GET /com298/{docCod}`), evitando 2ª chamada por candidata | `ConexosClient.getDetalheTitulos` (boundary do ERP) + único consumer `EleicaoPermutasService.buildCandidata` | Operação normal, READ-ONLY no Conexos; orquestrador roda fan-out por PROFORMA | Renomear método e ampliar o contrato de retorno (`number \| undefined` → `{ valorPermutar?, pago? }`) sem espalhar acoplamento dos wire-fields `mnyTitAberto`/`mnyTitPermutar` para fora do client; manter retry/quirk HTTP-400 e `ConexosError` na exaustão | 0 referências dangling ao nome antigo no `src/`; 0 leakage dos wire-fields fora do `ConexosClient`; 1 call site consumindo o agregado; full backend suite 266/266 verde |

> Esta fatia é uma **mudança de superfície local** no boundary Conexos: 1 método rebatizado + 1 mapper privado adicionado. O grau de "explosão de raio" da mudança é baixo (single consumer) — exatamente o que a tactic **Encapsulate** prevê.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Call sites do nome antigo (`getMnyTitPermutar`) em `src/` | 0 produção / 1 comentário stale em teste | 0 | ⚠️ | `grep -rn "getMnyTitPermutar" src` → `EleicaoPermutasService.test.ts:441` (comentário) |
| Call sites do novo nome (`getDetalheTitulos`) em `src/backend/domain/service` | 1 (`EleicaoPermutasService.buildCandidata`) | 1 (single consumer) | ✅ | `grep -rn "getDetalheTitulos" src/backend/domain/service` → `EleicaoPermutasService.ts:418` |
| Wire-fields Conexos (`mnyTitAberto`/`mnyTitPermutar`) referenciados FORA do `ConexosClient.ts` | 0 em código de produção (referências restantes: docstrings + asserts de teste) | 0 | ✅ | `grep -rn "mnyTitAberto\|mnyTitPermutar" src/backend/domain/service src/backend/lambda` → só comentários explicativos |
| Derivação de `pago` confinada ao client | sim, em `mapDetalheTitulos` (priv) | sim | ✅ | `ConexosClient.ts:902-912` |
| Cobertura de fixture na nova superfície | 5 cenários (`>0`, `===0`, ausente, retry esgotado, quirk HTTP-400 ) | ≥ 3 | ✅ | `ConexosClient.test.ts:1185-1270` |
| Cobertura de fan-in (single-consumer) | 4 cenários novos em `EleicaoPermutasService.test.ts` (pago=false, pago=true, pago=undefined → false, falha → DETAIL_INDISPONIVEL) | ≥ 3 | ✅ | `EleicaoPermutasService.test.ts:240-345` |
| Tratamento de erro preservado | `RetryExecutor` + quirk HTTP-400 + `ConexosError` na exaustão | mantido | ✅ | `ConexosClient.ts:850-893` |
| `parseOptionalNumber` reuse no mapper | sim (mesmo helper de `mapAdiantamentoProforma`) | sim (no duplication) | ✅ | `ConexosClient.ts:905-906` + `1234` |
| Validação Zod do `Record<string, unknown>` no boundary | ausente — `getGeneric<Record<string, unknown>>` consumido cru | recomendado por CLAUDE.md ("validate external inputs … Zod at boundaries") | ⚠️ | `ConexosClient.ts:856-859` |

> ⚠️ **Não medível localmente**: forma real do payload `GET /com298/{docCod}` sob NULL/missing field de produção (Conexos prod). Apenas a sonda real de 2026-06-18 (filCod=2, docs 26471 e 24166, citada em `_shared-metrics.md`) confirma a derivação — não foi gravada como fixture JSON contra a qual plugar o `mapDetalheTitulos`. Recomendação: gravar a resposta crua dos 2 docs (não-pago / pago) como fixture em `__fixtures__/conexos/com298_detail_*.json` e fazer o teste consumir o JSON via `fs.readFileSync` (mesmo padrão sugerido em `2026-06-17-2340/testability.md`).

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Encapsulate | Wire-fields `mnyTitAberto` / `mnyTitPermutar` são lidos exclusivamente dentro do client; mapeados para o domínio (`{ valorPermutar?, pago? }`) no `mapDetalheTitulos` privado. Service consumidor recebe agregado opaco — não sabe quais campos do ERP existem por trás. | ✅ presente | `ConexosClient.ts:902-912` (mapper privado); `EleicaoPermutasService.ts:416-421` (consumer agnóstico) |
| Use an Intermediary | `ConexosClient` continua a ser o único intermediário entre o domínio e o ERP; o rename consolidou DUAS responsabilidades de hidratação (`valorPermutar` + `pago`) em UM endpoint, evitando a tentação de criar um 2º método `getPagoStatus` que duplicaria a chamada HTTP. | ✅ presente | `ConexosClient.ts:844-894` |
| Restrict Communication Paths | `EleicaoPermutasService` é o ÚNICO call site do novo método (1 call site, single consumer). Sem fan-in oculto. | ✅ presente | `grep getDetalheTitulos src/backend/domain/service` → 1 hit |
| Adhere to Standards | Convenção do projeto: clients expõem métodos de domínio (`get<Entidade>`), não verbos HTTP genéricos. `getDetalheTitulos` segue o padrão; `mapDetalheTitulos` segue o naming convention dos demais mappers (`mapAdiantamentoProforma`, etc.). | ✅ presente | `ConexosClient.ts:844`, `902` |
| Abstract Common Services | `parseOptionalNumber` (helper compartilhado) usado para ambos os campos; `RetryExecutor` compartilhado; sem auth/refresh duplicado. | ✅ presente | `ConexosClient.ts:905-906` + `853` |
| Discover Service | N/A para esta fatia — endpoint `com298/{docCod}` já estava em uso; descoberta via SSM já existente. | N/A | — |
| Tailor Interface | Retorno do método **mudou shape** (`number \| undefined` → `{ valorPermutar?, pago? }`). É uma evolução do contrato consumida por single caller, então o "tailoring" foi feito em lockstep no único consumer; risco mínimo. **Porém**, o contrato não é exposto por interface tipada (`IConexosClient`) — caller depende da assinatura concreta. | ⚠️ parcial | `ConexosClient.ts:844-847` (retorno concreto); sem `IConexosClient` no diretório `interface/` |
| Configure Behavior | Sem nova flag/config exposta — `RetryExecutor` (config compartilhada) e o quirk HTTP-400 são policy do client. ✅ por design (não adiciona superfície de config). | ✅ presente | `ConexosClient.ts:850-883` |
| Manage Resources | N/A — a fatia não introduz nova conexão/pool; reutiliza `legacy.getGeneric` existente. | N/A | — |
| Orchestrate | Orquestração permanece em `EleicaoPermutasService.buildCandidata` — sem mudança estrutural; agora 1 chamada hidrata 2 gates (era 1 chamada hidrata 1 gate). Coordenação simplificou. | ✅ presente | `EleicaoPermutasService.ts:416-450` |
| Manage Resource Coupling | Conexos continua acoplado ao caller via instância singleton (`@injectable()`). Nada mudou. | ✅ presente (herdado) | `ConexosClient.ts` decorators |
| Contract testing | Testes `ConexosClient.test.ts:1185-1270` exercitam o mapeamento para `>0`, `===0`, ausente, quirk HTTP-400 e exaustão de retry — todos com **objetos literais inline**, não fixtures gravadas da resposta real do Conexos. Mesma limitação já apontada em `2026-06-17-2340/testability.md` para outros endpoints. | ⚠️ parcial | `ConexosClient.test.ts:1186-1268` (literais inline) |
| Versioning strategy | URL `com298/{docCod}` sem prefixo de versão. Não muda nesta fatia (limitação do provider Conexos legacy). | N/A nesta fatia | herdado |
| Backward-compatibility shims | Renome `getMnyTitPermutar` → `getDetalheTitulos` foi feito **sem shim/deprecated alias**. Justificável: single in-repo consumer + nenhum import externo / publicação npm — risco real = 0. | ✅ presente (decisão consciente) | `grep getMnyTitPermutar src` → 0 prod refs |
| Observability of integration failures | Falha pós-retries → `ConexosError({endpoint: 'com298/{docCod}', priCod, cause})` → consumer registra `LogService.warn(BUSINESS_WARN, motivo=DETAIL_INDISPONIVEL)`. Distinção entre erro de integração e reprovação de regra preservada. | ✅ presente | `ConexosClient.ts:887-893`; `EleicaoPermutasService.ts:422-436` |

## 4. Findings (achados)

### F-integrability-1: Boundary `Record<string, unknown>` sem schema Zod em `mapDetalheTitulos`

- **Severidade**: P1 (alto — degrada QA mensurável)
- **Tactic violada**: Tailor Interface + (cross-QA) Validate Input
- **Localização**: `src/backend/domain/client/ConexosClient.ts:844-912`
- **Evidência (objetiva)**:
  ```ts
  detail = await this.legacy.getGeneric<Record<string, unknown>>(
      `com298/${docCod}`,
      { filCod },
  );
  // ...
  private mapDetalheTitulos = (detail: Record<string, unknown>): { valorPermutar?: number; pago?: boolean } => {
      const valorPermutar = this.parseOptionalNumber(detail.mnyTitPermutar);
      const mnyTitAberto = this.parseOptionalNumber(detail.mnyTitAberto);
      const pago = mnyTitAberto === undefined ? undefined : mnyTitAberto === 0;
      // ...
  };
  ```
  O payload Conexos é tratado como `Record<string, unknown>` cru — CLAUDE.md prescreve "Validate external inputs (API events, DB nullables, SSM) with Zod at boundaries". `parseOptionalNumber` recupera valor por campo, mas não sinaliza **schema drift** (ex.: Conexos passa a entregar `mnyTitAberto` como string `"0,00"` localizado, ou troca o nome do campo). O resultado seria silencioso: `pago=undefined` → forçado a `false` em `buildCandidata:449` → **TODAS as PROFORMAs pagas reprovam Gate 3** e nada loga "schema drift".
- **Impacto técnico**: schema drift do Conexos vira reprovação silenciosa em massa do Gate 3 (TOTALMENTE PAGO). Indistinguível, no log, de "nenhuma proforma paga neste mês". Probe real de 2026-06-18 confirmou o shape **hoje**; não há mecanismo automático para detectar quando o shape mudar.
- **Impacto de negócio**: snapshot mensal pode passar a marcar 0 candidatas elegíveis (todas reprovam Gate 3) sem qualquer alerta — analista descobre por ausência, dias depois. Risco proporcional à criticidade do snapshot na execução financeira da Columbia.
- **Métrica de baseline**: 0% de validação Zod no boundary `com298/{docCod}`; `parseOptionalNumber` lida com `null`/missing/string-numérica mas **não distingue "campo ausente"** de "campo presente com tipo inesperado" (ambos retornam `undefined`).

### F-integrability-2: Fixtures inline em vez de payload real gravado para o detail endpoint

- **Severidade**: P1 (alto — degrada confiabilidade do contrato)
- **Tactic violada**: Contract testing
- **Localização**: `src/backend/domain/client/ConexosClient.test.ts:1185-1270`
- **Evidência (objetiva)**:
  ```ts
  legacy.getGeneric.mockResolvedValue({
      mnyTitPago: 0,
      mnyTitAberto: 384119.95,
      mnyTitPermutar: 0,
  });
  ```
  Todos os 5 cenários do `getDetalheTitulos` (incluindo o quirk HTTP-400 `responseData`) usam objetos literais escritos à mão, não snapshot da resposta real do Conexos. O `_shared-metrics.md` declara que a sonda real foi rodada em 2026-06-18 (`filCod=2`, docs `26471` e `24166`) e descartada (`throwaway probe, deleted, not committed`). Logo, o conhecimento do shape real **só sobrevive na memória institucional do desenvolvedor + nos comentários**, não em código versionado.
- **Impacto técnico**: se um campo novo aparecer no payload Conexos (ex.: `mnyTitAbertoStatus` substitui `mnyTitAberto`), os 5 testes continuam verdes porque o mock controla o input — o mapper nunca é confrontado com a forma real. Esta é a mesma classe de gap já apontada em `2026-06-17-2340/testability.md` (F-testability-X) para `listAdiantamentosProforma`, `listDeclaracaoByProcesso`, etc. — esta fatia adiciona mais um método ao mesmo bucket.
- **Impacto de negócio**: a primeira regressão por schema drift do Conexos vai aparecer em produção, não em CI. Tempo de detecção depende de monitoria de business outcome, não de unit test.
- **Métrica de baseline**: 0 fixture JSON gravada para `GET /com298/{docCod}`; 5/5 cenários do mapper testados com objetos literais inline.

## 5. Cards Kanban

### [integrability-1] Validar payload `com298/{docCod}` com Zod no boundary do `ConexosClient`

- **Problema**
  > `mapDetalheTitulos` consome `Record<string, unknown>` cru: schema drift do Conexos (renome de `mnyTitAberto`, troca de tipo numérico → string localizada, etc.) produz `pago=undefined` → `false` silencioso, reprovando Gate 3 em massa sem qualquer log de "boundary inválido". Mesmo padrão se aplica ao quirk HTTP-400 com `responseData` (ConexosClient.ts:874-881).
- **Melhoria Proposta**
  > Introduzir um `Com298DetailSchema = z.object({ mnyTitPermutar: z.coerce.number().nullable().optional(), mnyTitAberto: z.coerce.number().nullable().optional() }).passthrough()` em `ConexosClient.ts` e fazer `mapDetalheTitulos` chamar `schema.safeParse(detail)` antes de `parseOptionalNumber`. Em `success: false`, logar `LogService.warn(INTEGRATION_WARN, { endpoint: 'com298/{docCod}', issues })` e retornar `{}` (mesmo comportamento de fallback conservador — Gate 3 reprova, mas agora com rastro estruturado). Tactic Bass: **Tailor Interface** + cross-QA com **Validate Input** (Security/Fault Tolerance).
- **Resultado Esperado**
  > Schema drift do Conexos vira log estruturado observável (`INTEGRATION_WARN` por endpoint), não reprovação silenciosa. Métrica: 0% → 100% de validação Zod no payload do endpoint detail; rastreabilidade de drift via filtro de log no dashboard de operação.
- **Tactic alvo**: Tailor Interface (Bass) + Validate Input
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-1
- **Métricas de sucesso**:
  - % de campos do payload `com298/{docCod}` validados via Zod: 0% → 100%
  - # de logs `INTEGRATION_WARN` por schema drift: instrumentado (era inexistente)
- **Risco de não fazer**: primeira mudança de schema no Conexos vira incidente de execução financeira (snapshot 0 candidatas elegíveis) detectado por business outcome, não por monitoria técnica.
- **Dependências**: nenhuma — mudança contida em `ConexosClient.ts`.

### [integrability-2] Gravar fixtures JSON reais do `com298/{docCod}` (pago / não-pago) e plugar nos testes do mapper

- **Problema**
  > Os 5 testes do `getDetalheTitulos` (`ConexosClient.test.ts:1185-1270`) usam objetos literais inline. O conhecimento do shape real do payload (capturado em sonda 2026-06-18 contra `filCod=2`, docs `26471` e `24166`) foi descartado (throwaway probe, não comitado). Schema drift do Conexos não é capturado por nenhum teste — mesma gap já presente em outros endpoints (`2026-06-17-2340/testability.md`).
- **Melhoria Proposta**
  > Re-executar a sonda contra `filCod=2` (docs `26471` não-pago + `24166` pago) e gravar a resposta crua como `src/backend/domain/client/__fixtures__/conexos/com298_detail_nao_pago.json` e `..._pago.json`. Refatorar os 5 cenários atuais para carregar o JSON via `fs.readFileSync` em vez de literais inline. Para os cenários sintéticos (`mnyTitAberto` ausente, retry esgotado, quirk HTTP-400), partir do JSON real e remover/sobrescrever o campo. Tactic Bass: **Contract testing** (consumer-driven, schema-pinned).
- **Resultado Esperado**
  > Forma real do payload Conexos vira código versionado, não conhecimento tácito. Métrica: 0 → 2 fixtures JSON reais; 5/5 cenários do mapper alimentados a partir de fixture real (mesmo padrão recomendado para os demais endpoints em `2026-06-17-2340/testability.md`).
- **Tactic alvo**: Contract testing
- **Severidade**: P1
- **Esforço estimado**: S (≤1d, requer acesso ao Conexos dev)
- **Findings relacionados**: F-integrability-2
- **Métricas de sucesso**:
  - # de fixtures JSON reais do `com298/{docCod}` no repo: 0 → 2 (pago + não-pago)
  - % de testes do `getDetalheTitulos` ancorados em fixture real: 0% → 100%
- **Risco de não fazer**: primeira regressão por mudança de Conexos vira incidente em produção, indistinguível de comportamento legítimo (Gate 3 reprova). Sem fixture real, nem o mapper nem o teste defendem contra drift.
- **Dependências**: acesso ao Conexos dev (mesmo usado para a sonda original em 2026-06-18); idealmente complementar ao [testability-X] equivalente do run anterior se ainda em backlog.

## 6. Notas do agente

- Escopo respeitado: avaliei apenas o delta gate-3-pago-via-detail (`ConexosClient.getDetalheTitulos` + `EleicaoPermutasService.buildCandidata`). Findings de Integrability pré-existentes (e.g. ausência de `IConexosClient` interface, contagem de métodos do client consumidos pelo orquestrador) já estão em `2026-06-17-2340/integrability.md` e **não foram repetidos aqui**.
- Pontos positivos do delta: encapsulação dos wire-fields `mnyTitAberto`/`mnyTitPermutar` está limpa (0 leakage fora do client); rename foi feito sem shim porque é single-consumer in-repo (justificável); 1 chamada HTTP hidrata 2 gates (Tailor Interface aplicada bem). Comentário stale em `EleicaoPermutasService.test.ts:441` mencionando `getMnyTitPermutar` é cosmético — não vale card.
- Cross-QA: F-integrability-1 (Zod no boundary) toca **Security** (Validate Input) e **Fault Tolerance** (schema drift = falha silenciosa). F-integrability-2 (fixtures reais) toca **Testability** — mesmo gap já apontado no run 2026-06-17-2340 para outros endpoints; consolidator pode mesclar com card de testability se ainda em backlog.
- Não medível localmente: shape real do payload sob NULL/missing field só pode ser confirmado via Conexos dev — declarado em §2 e ecoado no card [integrability-2].
