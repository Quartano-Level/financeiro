---
qa: Modifiability
qa_slug: modifiability
run_id: 2026-06-18-1441
agent: qa-modifiability
generated_at: 2026-06-18T14:41:00-03:00
scope: backend
score: 8
findings_count: 1
cards_count: 1
---

# Modifiability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Desenvolvedor mantendo Gate 3 da elegibilidade de Permutas | Conexos passa a expor `mnyTitAberto` no detail (não mais no list) e a definição de "totalmente pago" precisa ser hidratada por candidata | `ConexosClient.getMnyTitPermutar` (cliente) + `EleicaoPermutasService.buildCandidata` (consumidor único) | Build-time; gate de feature-tweak (Fatia 1) | Renomear o método para refletir que ele agora devolve um agregado (`valorPermutar`+`pago`) derivado do mesmo payload de detalhe; consumidor único atualizado em um único commit | Ripple ≤ 2 arquivos de produção tocados (cliente + service); 0 call-sites órfãos; cohesion mantida (1 endpoint físico → 1 método → 1 DTO). |

> Escopo do gate: APENAS o delta de Fatia 1 (`gate-3-pago-via-detail`). Modifiabilidade do restante do `ConexosClient.ts` (1361 LOC, pré-existente) e do `EleicaoPermutasService.ts` (527 LOC, pré-existente) está fora deste gate — esses arquivos já são candidatos a **Split Module** em revisões anteriores, mas o delta atual não piora a métrica.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Arquivos de produção tocados pelo delta | 2 | ≤ 3 (mudança localizada num seam) | ✅ | `git diff --stat` (em `_shared-metrics.md`) |
| Call-sites do método renomeado fora de tests/comments | 1 (`EleicaoPermutasService.ts:418`) | 1 (fan-in baixo, consumer único declarado no docstring) | ✅ | `grep -rn "getDetalheTitulos" src/backend --include="*.ts" \| grep -v ".test.ts"` |
| Símbolos órfãos do nome antigo (`getMnyTitPermutar`) no código de produção | 0 | 0 | ✅ | `grep -rn "getMnyTitPermutar" src/backend --include="*.ts" \| grep -v ".test.ts"` |
| Símbolos órfãos do nome antigo em tests/comentários | 1 (comentário em `EleicaoPermutasService.test.ts:441`) | 0 | ⚠️ | mesmo grep, sem `--exclude` |
| LOC do método público (`getDetalheTitulos`) | 51 LOC (linhas 844–894) | ≤ 80 LOC | ✅ | leitura direta |
| LOC do helper privado (`mapDetalheTitulos`) | 11 LOC (linhas 902–912) | ≤ 30 LOC (helper puro) | ✅ | leitura direta |
| Imports adicionados ao client pelo delta | 0 | 0 (sem novo acoplamento) | ✅ | `git diff src/backend/domain/client/ConexosClient.ts` (mesmo header de import) |
| Distintas responsabilidades expostas pelo retorno do método | 2 (`valorPermutar`, `pago`) — derivadas do MESMO payload `com298/{docCod}` | 2 (se ambas derivam do mesmo recurso físico) | ✅ | docstring linhas 815–842 |
| ConexosClient.ts LOC total | 1361 | n/a — pré-existente, fora do escopo do delta | ⚠️ | `wc -l` |
| Cognitive-complexity warnings introduzidas pelo delta | 0 (4 warnings pré-existentes, inalteradas) | 0 | ✅ | `npm run lint` (em `_shared-metrics.md`) |

> ⚠️ **Não medível localmente**: latência real do GET `com298/{docCod}` em produção e a taxa de fallback pelo branch `400 VALIDATION → responseData` (linhas 860–882). Modifiabilidade aqui é função do número de quirks empíricos do Conexos; só a observabilidade em prod (CloudWatch) revelaria se essa segunda branch é frequente o bastante para justificar extrair um `DetailFetcher` separado.

## 3. Tactics — Cobertura no delta

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Split Module | Helper privado `mapDetalheTitulos` extraído do método público para separar parsing/mapping da orquestração de retry/quirk-400 | ✅ presente | `ConexosClient.ts:902-912` |
| Increase Semantic Coherence | Método único devolve agregado coerente (`{ valorPermutar?, pago? }`) — ambas as derivações vêm do **mesmo** `com298/{docCod}` (mesma fetch, mesma RetryExecutor, mesma janela de consistência); NÃO é god-method | ✅ presente | docstring `ConexosClient.ts:815-843` ("Why fan-out") + helper `mapDetalheTitulos` que parsa **um único payload** |
| Encapsulate | A regra "TOTALMENTE PAGO ⟺ `mnyTitAberto === 0`" está encapsulada no client (linha 907), não vaza para o service. Service apenas consome `detalhe.pago` | ✅ presente | `mapDetalheTitulos:907` + `EleicaoPermutasService.ts:449` |
| Use an Intermediary | `RetryExecutor` segue como intermediário; quirk-400 do Conexos isolado dentro do `try/catch` interno (linhas 860–882), não vaza para o caller | ✅ presente | `ConexosClient.ts:853-886` |
| Restrict Dependencies | Fan-in do método renomeado: 1 consumer (`EleicaoPermutasService.buildCandidata`). Declarado explicitamente no docstring ("Consumers:" linha 837) | ✅ presente | `grep` fan-in = 1 call-site |
| Refactor | Rename `getMnyTitPermutar → getDetalheTitulos` e mudança de retorno (`number \| undefined → { valorPermutar?, pago? }`) feita atomicamente; nome agora reflete o recurso (detalhe) em vez do campo (mnyTitPermutar), suportando a 2ª responsabilidade `pago` sem mentir | ✅ presente | diff do PR |
| Abstract Common Services | N/A — não há outro client que precise abstrair `getDetalheTitulos`. O endpoint `com298/{docCod}` é específico de Conexos | N/A | — |
| Defer Binding (configuration) | A regra de "pago" (`mnyTitAberto === 0`) é uma constante de domínio (não config). Apropriado: é invariante da ontologia, não setting de tenant | N/A justificada | `mapDetalheTitulos:907` |
| Defer Binding (polymorphism) | Cliente continua `@singleton() @injectable()`; service injeta interface `ConexosClient` — variabilidade de teste preservada (mocks no test file) | ✅ presente | `EleicaoPermutasService.test.ts:42` mocka `getDetalheTitulos` |

## 4. Findings (achados)

### F-modifiability-1: Comentário em test ainda referencia o nome antigo `getMnyTitPermutar`

- **Severidade**: P3 — *intencionalmente listado fora do filtro P0/P1 deste gate; documentado para o consolidator não interpretar a ausência como descuido*
- **Tactic violada**: Refactor (consistência de nomenclatura pós-rename)
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.test.ts:441`
- **Evidência (objetiva)**:
  ```
  // = 4 for A=200,F=1. (Detail `getMnyTitPermutar` is per-doc by nature
  ```
- **Impacto técnico**: futuro grep por `getMnyTitPermutar` retorna 1 hit estéril; risco de confusão pequeno (não há método com esse nome — typecheck protege).
- **Impacto de negócio**: nenhum direto.
- **Métrica de baseline**: 1 referência stale no nome antigo (em comentário de test, fora do código de produção).

> **Nenhum finding P0 ou P1 introduzido pelo delta.** A análise verificou explicitamente: (a) cohesion do método remodelado (✅ — ambas as concerns derivam do mesmo payload, consumer único e per-doc por natureza); (b) ripple do reshape do retorno (✅ — fan-in = 1, atualizado no mesmo PR); (c) clareza do novo nome (`getDetalheTitulos` ✅ — nomeia o recurso, não um campo, e suporta as duas derivações honestamente).

## 5. Cards Kanban

### [modifiability-1] Limpar referência stale a `getMnyTitPermutar` no comentário do test

- **Problema**
  > Após o rename do método público no client, restou 1 comentário em `EleicaoPermutasService.test.ts:441` mencionando o nome antigo. Não quebra nada (typecheck cobre), mas polui grep e narrativa do código.

- **Melhoria Proposta**
  > Trocar `getMnyTitPermutar` por `getDetalheTitulos` no comentário (linha 441). Tactic alvo: **Refactor** (consistência de nomenclatura).

- **Resultado Esperado**
  > `grep -rn "getMnyTitPermutar" src/backend` retorna 0 hits (atualmente 1).

- **Tactic alvo**: Refactor
- **Severidade**: P3
- **Esforço estimado**: S (≤ 5 min)
- **Findings relacionados**: F-modifiability-1
- **Métricas de sucesso**:
  - Referências stale ao nome antigo: 1 → 0
- **Risco de não fazer**: trivial; ruído residual em buscas por símbolo.
- **Dependências**: nenhuma.

> Este card é P3 e está fora do filtro P0/P1 do gate. Listado apenas por exigência de schema (toda métrica com `status: ⚠️` precisa de um card derivável). Não bloqueia merge.

## 6. Notas do agente

- Escopo respeitado: NÃO auditei o ConexosClient.ts (1361 LOC) nem o EleicaoPermutasService.ts (527 LOC) como um todo — ambos já são candidatos a Split Module historicamente, mas o delta atual **não piora** essas métricas (LOC adicionado é pequeno e localizado em métodos coesos).
- Avaliação central pedida no prompt — *"god-method smell?"* — resolvida assim: o método é coeso porque ambas as derivações (`valorPermutar` e `pago`) vêm do MESMO payload (`com298/{docCod}`), com a MESMA janela de consistência e a MESMA retry policy. Separá-las em dois métodos públicos forçaria 2 round-trips por candidata (regressão de Performance) sem ganho de modifiabilidade — o consumer único já trata o retorno como agregado. Nome `getDetalheTitulos` é honesto: nomeia o recurso, não um campo, então suporta futuras extensões (ex.: data-base, dpeNomPessoa) sem novo rename.
- Cross-QA: o reshape do retorno reduz N+1 latente (Performance — cada candidata podia precisar 1 call para valor + 1 para pago se o split fosse feito) e aumenta testabilidade (1 mock injeta os dois campos — visível em `EleicaoPermutasService.test.ts:42`). Sem overlap com Deployability/Integrability neste delta.
