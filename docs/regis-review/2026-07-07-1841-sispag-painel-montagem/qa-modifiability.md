---
qa: Modifiability
qa_slug: modifiability
run_id: 2026-07-07-1841-sispag-painel-montagem
agent: qa-modifiability
generated_at: 2026-07-07T18:41:00-03:00
scope: all
score: 7.4
findings_count: 8
cards_count: 7
---

# Modifiability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Yuri / analista financeira | Fatia 3 (write/transport) precisa entrar em ≤ 4 semanas: `enviarLote` grava no `fin015`/gera remessa, adiciona estados `PROCESSANDO`/`ENVIADO`/`BAIXADO`, plumba retorno Nexxera até `com298`. Novo banco pede grouping por `banco+conta` além de `filCod`. | `LotePagamentoService`, `LotePagamentoRepository`, `ConexosSispagClient`, `routes/sispag.ts`, `frontend/app/sispag/page.tsx` | Feat/sispag-painel-montagem mergeada; SISPAG em produção read-only + montagem local. | O acréscimo de escrita ao ERP + 3 novos estados + nova chave de agrupamento cabe em 1 sprint por analista, sem quebrar a superfície read-only já em uso. | ≤ 5 arquivos tocados no backend para a fatia write; frontend continua abaixo de 400 LoC por page; nenhuma regressão de invariante (I1-I6); zero mudança em módulo cross-QA (Permutas, log, EnvironmentProvider). |

O "cost of change" para a próxima fatia é o *stress-test* real da arquitetura escolhida agora — o resto desta review mede se as decisões desta feature deixam esse orçamento factível.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| LoC max no delta (backend) | 294 (`LotePagamentoService.ts`) | ≤ 600 | ✅ | `wc -l src/backend/domain/**/*.ts` |
| LoC max no delta (frontend) | **685** (`app/sispag/page.tsx`) | ≤ 400 (p95) / ≤ 500 (max) | ❌ | `wc -l src/frontend/app/sispag/page.tsx` |
| Funções acima da complexidade cognitiva 15 (delta) | 0 | 0 | ✅ | `cd src/backend && npm run lint` — nenhum warning `noExcessiveCognitiveComplexity` em arquivo `sispag/*` |
| Cross-layer violations (routes/domain) | 0 | 0 | ✅ | `grep from '.*service/' src/backend/domain/{repository,client}` — vazio |
| Fan-in de `LotePagamentoService` | 1 (route) | ≤ 3 | ✅ | `grep -rn "from .*service/sispag/LotePagamentoService"` |
| Fan-in de `SispagPainelService` | 2 (route + probe job) | ≤ 3 | ✅ | idem |
| Fan-in de `ConexosSispagClient` | 2 serviços | ≤ 3 | ✅ | idem |
| Fan-out de imports em `sispag/page.tsx` | 15 | ≤ 12 | ⚠️ | `grep -c '^import ' src/frontend/app/sispag/page.tsx` |
| Fan-out de imports em `LotePagamentoService.ts` | 12 | ≤ 12 | ⚠️ | idem — 5 erros custom + repo + client + db + log + interface + tsyringe. Cada `Lote*Error` é 1 import; alto porém semanticamente justificado. |
| Magic-numbers em service (fora de const nomeado) | 2 (`30`, `100`) linhas 82 e 131 de `SispagPainelService.ts` | 0 | ⚠️ | `grep -nE " [0-9]{2,}[^0-9]"` |
| Componentes JSX inline em `page.tsx` (tabs, tabelas grandes) | 4 tabs × ~120 LoC cada, todas inline no default export | ≤ 1 tab inline (o resto extraído) | ❌ | `grep -n TabsContent src/frontend/app/sispag/page.tsx` (linhas 352/442/576/639) |
| Testes unitários do agregado LotePagamento | 9 casos cobrindo I2/I3/I4/I5/I6 + idempotência + reabrir/cancelar | ≥ 1 por invariante | ✅ | `src/backend/domain/service/sispag/LotePagamentoService.test.ts:85-237` |
| Duplicação de mapeamento Zod→`TituloAPagar` no client | 2 sítios (linhas 140-155 e 179-193) | 1 | ⚠️ | leitura direta de `ConexosSispagClient.ts` |
| Drift ontologia ↔ código (`state-machines/lote-pagamento.md`) | `related_files` aponta `TBD_lote_pagamento.sql`; migração real é `0023_lote_pagamento.sql`. Tipo TS documentado `'rascunho' \| ...` vs. real `'RASCUNHO' \| ...`. | 0 drift | ⚠️ | `ontology/state-machines/lote-pagamento.md:10,34` vs. `src/backend/migrations/0023_lote_pagamento.sql`, `SispagInterface.ts:98-104` |

Comparação (topo do repo, sem o delta):

| Métrica | Repo antes | Delta SISPAG |
|---|---|---|
| Frontend page.tsx max LoC | 685 (permutas até 46773fe → 1036, agora split em `Aba*.tsx`) | 685 (não split) — regressão sobre a convenção acordada no CC-1 |
| Backend service max LoC | 911 (`EleicaoPermutasService`) | 294 (`LotePagamentoService`) — dentro do saudável |
| Cognitive complexity warnings | ~20 em permutas | 0 no delta |

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Split Module** | Backend: 4 arquivos por feature (client, repo, service, interface), 5 erros dedicados (`Lote*Error`, `Titulo*Error`) — split saudável. Frontend: **ausente** — 4 tabs + 3 helper components (`VencimentoBadge`, `StatusLoteBadge`, `FlowStep`) + data-fetching + CRUD de lote convivem num só arquivo. | ⚠️ parcial | Backend: `src/backend/domain/{errors,service/sispag,repository/sispag,client}/*` (5 error files, cada ≤ 30 LoC). Frontend: `src/frontend/app/sispag/page.tsx:352,442,576,639` — as 4 `TabsContent` inline. |
| **Increase Semantic Coherence** | `SispagPainelService` = read-only + KPI + aging. `LotePagamentoService` = agregado LotePagamento (I2-I6). Repositório opera SÓ na raiz + item. Client SÓ read do ERP. Fronteiras conceituais consistentes. | ✅ presente | `SispagPainelService.ts:36-84` (leitura), `LotePagamentoService.ts:43-207` (comandos do agregado). Aggregate boundary sem vazamentos. |
| **Encapsulate** | Aggregate root `LotePagamento` esconde `ItemLote` — todo acesso via `LotePagamentoService`. Advisory lock e transação encapsulados no `PostgreeDatabaseClient` (`withAdvisoryLock`, `withTransaction`). Erros HTTP encapsulados em `HandlerError` (`respondLoteError` em `routes/sispag.ts:41-51`). | ✅ presente | `LotePagamentoService.ts:60-152` (encapsula I2/I3/I4 sob `incluirTitulo`); `PostgreeDatabaseClient.ts:102-158`. |
| **Use an Intermediary** | `ConexosSispagClient` é o intermediário Read-only pró ERP; `PostgreeDatabaseClient` é o intermediário pró Postgres. Nenhum service fala com axios/pg direto. | ✅ presente | `SispagPainelService.ts:47-53` (dispatches via client), `LotePagamentoService.ts:114` (transação via cliente). |
| **Restrict Dependencies** | Camadas respeitadas (route → service → repo → client). Repositório NÃO importa service; client NÃO importa repository/service. | ✅ presente | `grep from '.*service/' src/backend/domain/{repository,client}` → 0 hits. |
| **Refactor** | `transicionar` genérico consolida finalizar/reabrir/cancelar (`LotePagamentoService.ts:225-258`) — pattern bem aplicado. **Mas**: `LotePagamentoRepository.transicionarStatus` (linhas 247-248) constrói SET clause por ternário aninhado + inline `CASE WHEN`; e o mapeamento Zod→`TituloAPagar` no client aparece duas vezes (linhas 140-155 e 179-193). | ⚠️ parcial | `LotePagamentoRepository.ts:231-258`, `ConexosSispagClient.ts:136-193`. |
| **Abstract Common Services** | `respondLoteError` centraliza mapeamento `HandlerError → HTTP` na rota. Snapshot de valor/venc/credor segue a doutrina anti-drift do Permutas. | ⚠️ parcial | `routes/sispag.ts:41-51`. Faltando: `mapTitulo` privado no `ConexosSispagClient` (dedup dos dois sítios de mapeamento). |
| **Defer Binding — configuration** | `EnvironmentProvider` injetado no `SispagPainelService:32` para `conexosWriteEnabled` / `conexosDryRun` (bom). **Mas**: janela `-15d/+45d`, `TITULOS_CAP=400`, `PAGE_SIZE=200`, `borderosRaw.slice(0, 100)`, corte "30 dias" em `calcularKpis` são constantes no source. | ⚠️ parcial | `SispagPainelService.ts:15,17,45,46,82,131`; `ConexosSispagClient.ts:24,124,171,200,231`. |
| **Defer Binding — polymorphism (DI)** | `@injectable()` + tsyringe em todos os novos módulos (`LotePagamentoService`, `LotePagamentoRepository`, `ConexosSispagClient`, `SispagPainelService`). `container.resolve()` na rota (não `new`). | ✅ presente | `LotePagamentoService.ts:34-41`; `routes/sispag.ts:29,79,89,110,127`. |
| **Defer Binding — plugin/runtime registration** | `bootstrapAppContainer()` chamado por route handler. Nenhum registro condicional de token; não há multiple-impl behind interface (padrão do repo). Aceitável para o domínio bound. | ⚠️ parcial (por padrão do repo) | `routes/sispag.ts:28,73`. |
| **Defer Binding — aggregate keys (banco/conta)** | Schema `lote_pagamento(banco TEXT, conta TEXT)` e input aceita ambos opcionais; frontend hoje só passa `filCod` (`page.tsx:188`). ADR-0015 explicita: chave da Fatia 3, metadado agora. Deferido corretamente. | ✅ presente | `migrations/0023_lote_pagamento.sql:14-15`; `routes/sispag.ts:53-57`; `LotePagamentoService.ts:43-52`. |
| **Encapsulate ERP write surface (I1)** | Client é read-only por contrato explícito no comentário do módulo. Nenhum método de escrita/POST. Fatia 3 adiciona novo client OU novo método gated — sem tocar o read. | ✅ presente | `ConexosSispagClient.ts:12,15-22`. |

## 4. Findings (achados)

### F-modifiability-1: `frontend/app/sispag/page.tsx` reintroduz o padrão monolítico que o repo acabou de eliminar em Permutas

- **Severidade**: P1
- **Tactic violada**: Split Module + Increase Semantic Coherence
- **Localização**: `src/frontend/app/sispag/page.tsx:1-685`
- **Evidência (objetiva)**:
  - 685 LoC contra alvo p95 ≤ 400.
  - 4 `TabsContent` inline (linhas 352, 442, 576, 639), cada uma com 90-135 LoC próprios.
  - 3 sub-componentes (`VencimentoBadge` L54, `StatusLoteBadge` L71, `FlowStep` L91) definidos no mesmo arquivo.
  - Data-fetching (`fetchSispagPainel` + `fetchLotes`), estado de seleção multi-título, 3 fluxos de mutação (`criarLoteComSelecionados`, `acaoLote`, `incluirTitulo` per-item loop) — tudo no default export.
  - Comparativo direto do commit `46773fe refactor(permutas): split page.tsx em componentes por aba (CC-1)`: Permutas migrou de 1036 → menor via `AbaAutomaticas.tsx`, `AbaCrossOver.tsx`, `AbaCrossProcess.tsx`, `AbaHistorico.tsx`, `AbaMultiplas.tsx`. Convenção estabelecida `src/frontend/app/permutas/components/Aba*.tsx` **não foi seguida** aqui.
- **Impacto técnico**: Fatia 3 (envio ao banco + retorno) adiciona ≥ 1 tab (Envios/Remessas) e enriquece "Lotes candidatos" com status `PROCESSANDO`/`ENVIADO`/`BAIXADO`, badges de erro do banco, botões de reenvio. Sem split, o arquivo entra em zona onde cada change conflita com PRs simultâneas (o próprio time viu isso em Permutas).
- **Impacto de negócio**: retrabalho previsível — ao invés de adicionar a Fatia 3 num arquivo novo (S), fará split + Fatia 3 na mesma PR (M/L). Custo estimado 3-5 dias extras contra o baseline "Permutas Aba* pattern".
- **Métrica de baseline**: 685 LoC (target ≤ 400 p95). Convention adopted 2026-06 (commit `46773fe`).

### F-modifiability-2: `LotePagamentoRepository.transicionarStatus` mistura SQL estático e dinâmico via ternário aninhado

- **Severidade**: P2
- **Tactic violada**: Refactor
- **Localização**: `src/backend/domain/repository/sispag/LotePagamentoRepository.ts:231-258`
- **Evidência (objetiva)**:
  ```typescript
  finalizado_por = ${setFinal ? '$finalizadoPor' : "CASE WHEN $para = 'RASCUNHO' THEN NULL ELSE finalizado_por END"},
  finalizado_em  = ${setFinal ? 'now()' : "CASE WHEN $para = 'RASCUNHO' THEN NULL ELSE finalizado_em END"}
  ```
  E o spread condicional dos params: `...(setFinal ? { finalizadoPor: params.finalizadoPor ?? null } : {})` (L255). São 3 caminhos ortogonais (FINALIZADO / RASCUNHO / CANCELADO) codificados via duas dimensões escondidas (`setFinal` + `$para` runtime). Sem risco de SQL-injection (interpolação é `boolean`), mas alta carga cognitiva.
- **Impacto técnico**: Fatia 3 adicionará estados `PROCESSANDO`/`ENVIADO`/`BAIXADO` (state-machine já marca `out_of_scope_states`). Cada novo estado exige repensar as duas ternárias + spread condicional. Alta probabilidade de bug silencioso (ex.: esquecer o `NULL` de `finalizado_por` ao voltar de `ENVIADO` para `RASCUNHO` num rollback).
- **Impacto de negócio**: erro nessa branch = auditoria financeira corrompida (`finalizado_por`/`finalizado_em` inconsistentes com o histórico).
- **Métrica de baseline**: 1 função, 3 caminhos, 2 dimensões implícitas. Alvo: 1 função por transição semântica OU tabela de mapping declarativa.

### F-modifiability-3: Constantes de política de leitura hard-coded em `SispagPainelService`

- **Severidade**: P2
- **Tactic violada**: Defer Binding (configuration)
- **Localização**: `src/backend/domain/service/sispag/SispagPainelService.ts:15-17,45-46,82,131`
- **Evidência (objetiva)**:
  - `TITULOS_CAP = 400` (L17)
  - Janela `-15d/+45d` (L45-46)
  - `borderosRaw.slice(0, 100)` (L82) — não constante nomeada
  - Corte "30 dias" em `calcularKpis` inline (L131)
  - `ConexosSispagClient.ts:24` `PAGE_SIZE = 200`, e 3 páginas magic (1000, 200, 100)
- **Impacto técnico**: quando a Flávia pedir "e agora quero ver vencidos há 60 dias" ou "quero KPI de a-vencer-60d" (previsível — a régua muda com a rotina bancária), cada mudança = novo deploy. Regra de negócio "quantos dias conta como aging" está distribuída entre `SispagPainelService` (KPI) e `ConexosSispagClient` (query ao ERP).
- **Impacto de negócio**: ajustar cadence/aging exige PR + review + deploy Render. Cliente típico espera "ajuste a régua no painel". Custo por mudança: 0.5-1d.
- **Métrica de baseline**: 6 constantes de policy espalhadas entre 2 módulos.

### F-modifiability-4: Mapeamento Zod→`TituloAPagar` duplicado em `ConexosSispagClient`

- **Severidade**: P2
- **Tactic violada**: Abstract Common Services
- **Localização**: `src/backend/domain/client/ConexosSispagClient.ts:136-155` (`listTitulosAPagar`) e `174-193` (`getTituloAPagar`)
- **Evidência (objetiva)**: os dois métodos fazem `tituloRowSchema.safeParse(row)` seguido do mesmo objeto literal `{ docCod, titCod, filCod, credor, valor, moeda, vencimento, liberado, pago, banco, numRemessa }` — 12 campos, mesma ordem, mesma lógica de fallback. Se um campo mudar (ex.: adicionar `contaCorrente` ou renomear `credor`), é preciso alterar em dois sítios.
- **Impacto técnico**: divergência silenciosa entre "título individual" e "título na lista" — bug clássico. Já visível como risco: se um dev extrair um campo novo do `dpeNomPessoaFor` numa consulta e esquecer no outro.
- **Impacto de negócio**: dados inconsistentes entre a tela do painel (lista) e a validação de inclusão no lote (leitura pontual). Analista vê valor X, sistema valida valor Y.
- **Métrica de baseline**: 2 sítios, 12 campos duplicados. Alvo: 1 sítio (private `mapTituloRow`).

### F-modifiability-5: `SispagInterface.ts` agrega duas fatias (Painel + LotePagamento) num só arquivo

- **Severidade**: P3
- **Tactic violada**: Increase Semantic Coherence
- **Localização**: `src/backend/domain/interface/sispag/SispagInterface.ts:1-155`
- **Evidência (objetiva)**: linhas 1-91 = Fatia 1 (`TituloAPagar`, `LoteSispag`, `BorderoAPagar`, `SispagKpis`, `SispagPainelResponse`). Linhas 93-155 = Fatia 2 (`LOTE_STATUS`, `LotePagamentoStatus`, `ItemLote`, `LotePagamento`, `CriarLoteInput`, `IncluirTituloInput`, `ListarLotesFiltro`). Delimitado por comentário divisor. Duas fontes de mudança independentes (leitura ERP vs. persistência local) coabitam.
- **Impacto técnico**: qualquer mudança na fatia de painel força re-compilar/re-testar quem só depende do LotePagamento (e vice-versa). No import-graph, `LotePagamentoService.ts` importa `TituloAPagar` daqui — vazamento aceitável (leitura autoritativa) porém acopla os arquivos além do necessário.
- **Impacto de negócio**: baixo isoladamente; contribui para `page.tsx` importar 15 símbolos (F-modifiability-6).
- **Métrica de baseline**: 1 arquivo × 2 slices. Alvo: `PainelInterface.ts` + `LotePagamentoInterface.ts`.

### F-modifiability-6: `sispag/page.tsx` importa 15 símbolos de `lib/sispag.ts` — fan-out alto

- **Severidade**: P3
- **Tactic violada**: Reduce Coupling (Restrict Dependencies)
- **Localização**: `src/frontend/app/sispag/page.tsx:35-47`
- **Evidência (objetiva)**: 8 funções (`cancelarLote`, `criarLote`, `fetchLotes`, `fetchSispagPainel`, `finalizarLote`, `incluirTitulo`, `reabrirLote`, `removerItem`) + 3 tipos (`LotePagamento`, `SispagPainel`, `TituloAPagar`) num único import block. Consequência direta de F-1: as 4 tabs consomem toda a superfície.
- **Impacto técnico**: adicionar uma ação (ex.: `enviarLote` na Fatia 3) obriga tocar o mesmo default export monolítico; extração diminui isso naturalmente.
- **Impacto de negócio**: baixo (cascata do F-1).
- **Métrica de baseline**: 15 imports; após split (por AbaXxx), cada Aba importa ≤ 5. Alvo p50 imports/aba ≤ 5.

### F-modifiability-7: Drift entre `state-machines/lote-pagamento.md` e o código

- **Severidade**: P3
- **Tactic violada**: (metodológica — Defer Binding via docs vivos)
- **Localização**: `ontology/state-machines/lote-pagamento.md:10,34`
- **Evidência (objetiva)**:
  - `related_files: - src/backend/migrations/TBD_lote_pagamento.sql` → migração real é `0023_lote_pagamento.sql` (aliás correta a lógica no `.sql:1-53`).
  - `LotePagamentoStatus = 'rascunho' | 'finalizado' | 'cancelado'` (lowercase) → real é `'RASCUNHO' | 'FINALIZADO' | 'CANCELADO'` (uppercase, `SispagInterface.ts:98-104` e CHECK constraint em `0023_lote_pagamento.sql:17-18`).
- **Impacto técnico**: `/retro-ontology` e `_index.json` derivam do ontology; drift cria retrabalho em cada review.
- **Impacto de negócio**: nenhum imediato.
- **Métrica de baseline**: 2 divergências em 1 doc. Alvo: 0.

### F-modifiability-8: Loop sequencial `incluirTitulo` no frontend cria ripple UX/API sob multi-título

- **Severidade**: P3
- **Tactic violada**: (borderline Reduce Coupling — dispersa transações sobre a fronteira do agregado)
- **Localização**: `src/frontend/app/sispag/page.tsx:189-198`
- **Evidência (objetiva)**:
  ```typescript
  for (const t of selTitulos) {
    try {
      await incluirTitulo(lote.id, { filCod: t.filCod, docCod: t.docCod, titCod: t.titCod })
      ok += 1
    } catch (e) {
      falhas.push(`${t.docCod}/${t.titCod}: ${e instanceof Error ? e.message : 'erro'}`)
    }
  }
  ```
  Cada título vira 1 POST + 1 advisory-lock + 1 re-leitura no ERP (`getTituloAPagar`). Selecionar 50 títulos = 50 round-trips serializados.
- **Impacto técnico**: quando a Fatia 3 mover para lotes grandes (>100 títulos, cenário Flávia), a UX degrada linearmente. A superfície certa seria uma API bulk (`POST /lotes/:id/itens/bulk`) que agrupa a re-leitura por página. Cada mudança futura na regra de inclusão precisa ser feita 2 vezes: single-title e bulk.
- **Impacto de negócio**: latência percebida na tela cresce com o volume; retrabalho previsível para adicionar bulk.
- **Métrica de baseline**: 1 POST por título; alvo (após bulk): 1 POST + 1 páginação de re-leitura por até 200 títulos.

## 5. Cards Kanban

### [modifiability-1] Extrair as 4 tabs de `sispag/page.tsx` em `components/Aba*.tsx`, espelhando o CC-1 de Permutas

- **Problema**
  > `src/frontend/app/sispag/page.tsx` tem 685 LoC com 4 `TabsContent` inline, 3 helpers e todo o data-fetching + CRUD de lote no default export. Reintroduz o padrão monolítico eliminado semanas atrás em Permutas (commit `46773fe refactor(permutas): split page.tsx em componentes por aba (CC-1)`) — a Fatia 3 (write/transport) adiciona ≥ 1 tab (Envios/Remessas) + badges de PROCESSANDO/ENVIADO, e o custo de mudança já entra elevado no dia 1.

- **Melhoria Proposta**
  > Extrair para `src/frontend/app/sispag/components/`:
  > - `AbaTitulos.tsx` (seleção + filtro + tabela, ~135 LoC) — expõe `onCriarLote(selecionados)` como prop.
  > - `AbaLotesCandidatos.tsx` (cards de lote + finalizar/reabrir/cancelar/remover, ~155 LoC) — recebe `lotes`, `onAcao`.
  > - `AbaLotesSISPAG.tsx` (tabela read-only nativa, ~65 LoC) — recebe `painel.lotes`.
  > - `AbaBorderos.tsx` (tabela + KPI residual, ~50 LoC) — recebe `painel.borderos`, `painel.kpis`.
  > - `VencimentoBadge.tsx`, `StatusLoteBadge.tsx`, `FlowStep.tsx` como arquivos próprios (viraram compartilháveis com Permutas).
  > - Hooks `useSispagPainel` e `useLotesCandidatos` para o data-fetching (mesmo shape do `usePermutasData.ts`).
  > - `page.tsx` fica ~150 LoC: layout, header, warning banner, KPIs, mount dos `Tabs`.

- **Resultado Esperado**
  > Fatia 3 é adicionada tocando 2 arquivos (novo `AbaEnvios.tsx` + 1 linha no mount de `page.tsx`), não 1 monolito.
  > - `sispag/page.tsx` LoC: 685 → ≤ 200.
  > - `AbaXxx.tsx` p95 LoC: ≤ 160.
  > - Fan-out de `page.tsx` sobre `lib/sispag`: 15 → ≤ 3 (só carregar painel; mutations vão para dentro das Abas).

- **Tactic alvo**: Split Module + Increase Semantic Coherence
- **Severidade**: P1
- **Esforço estimado**: M (2-3d — mecânico, guiado pelo espelho de Permutas)
- **Findings relacionados**: F-modifiability-1, F-modifiability-6
- **Métricas de sucesso**:
  - LoC de `sispag/page.tsx`: 685 → ≤ 200
  - LoC max por Aba: — → ≤ 160
  - Imports em `page.tsx` de `lib/sispag`: 15 → ≤ 3
- **Risco de não fazer**: em 6 meses, `page.tsx` cruza 1000 LoC (Permutas fez isso em 6 semanas); PRs paralelas de tabs distintas conflitam; a Fatia 3 vira PR gigante em vez de acréscimo cirúrgico.
- **Dependências**: nenhuma. Pode entrar em paralelo à Fatia 3.

### [modifiability-2] Refatorar `LotePagamentoRepository.transicionarStatus` para tabela declarativa de transição

- **Problema**
  > Linhas 231-258 do `LotePagamentoRepository.ts` codificam 3 caminhos de transição (FINALIZADO/RASCUNHO/CANCELADO) via `setFinal` + `CASE WHEN $para = 'RASCUNHO'` inline + spread condicional de params. O comportamento correto está aí — mas a Fatia 3 adiciona 3 estados (`PROCESSANDO`, `ENVIADO`, `BAIXADO`) que multiplicariam as ternárias para 6 combinações não-ortogonais.

- **Melhoria Proposta**
  > Substituir o SQL condicional por um mapa `TransitionEffect` no início do módulo:
  > ```ts
  > const EFFECTS: Record<LotePagamentoStatus, { setFinalizadoPor: 'input' | 'null' | 'keep'; setFinalizadoEm: 'now' | 'null' | 'keep' }> = {
  >   FINALIZADO: { setFinalizadoPor: 'input', setFinalizadoEm: 'now' },
  >   RASCUNHO:   { setFinalizadoPor: 'null',  setFinalizadoEm: 'null' },
  >   CANCELADO:  { setFinalizadoPor: 'keep',  setFinalizadoEm: 'keep' },
  > };
  > ```
  > Construir o SQL como três branches independentes (uma por `para`) OU manter um SQL único cujos SETs são resolvidos SÓ pela tabela — nunca por ternário aninhado no template. Preserva Rule #5 (parametrizado).

- **Resultado Esperado**
  > Adicionar `PROCESSANDO`/`ENVIADO`/`BAIXADO` = adicionar 3 linhas ao map. Zero mudança na cláusula SQL.
  > - Caminhos ortogonais explicitados: 3 → 3, mas visíveis num só sítio.
  > - Grep-ability de "quando `finalizado_em` é resetado?": ternário oculto → 1 linha do map.

- **Tactic alvo**: Refactor
- **Severidade**: P2
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-modifiability-2
- **Métricas de sucesso**:
  - Complexidade cognitiva de `transicionarStatus`: — → ≤ 5
  - Dimensões escondidas (`setFinal` + `$para` runtime): 2 → 0
- **Risco de não fazer**: bug silencioso na Fatia 3 quando ENVIADO→RASCUNHO (rollback) tentar resetar `finalizado_em`; `finalizado_por` fica dessincronizado da série `finalizado_em` — auditoria financeira corrompida.
- **Dependências**: nenhuma.

### [modifiability-3] Externalizar policy de janela/aging/paginação do painel SISPAG

- **Problema**
  > `TITULOS_CAP=400`, janela `-15d/+45d`, `borderosRaw.slice(0, 100)`, corte "30 dias" em `calcularKpis`, e paginação 1000/200/100 em `ConexosSispagClient` estão hard-coded em 2 módulos. A régua diária de "quantos dias conta como aging" muda com a rotina bancária — cada ajuste = PR + deploy.

- **Melhoria Proposta**
  > Criar `SispagPolicy` (interface + provider `@singleton()`) com:
  > ```ts
  > interface SispagPolicy {
  >   janelaVencidosDias: number;   // 15
  >   janelaAVencerDias: number;    // 45
  >   agingCorteDias: number;       // 30
  >   titulosCap: number;           // 400
  >   borderosCap: number;          // 100
  >   erpPageSizes: { fin064List: number; fin064Ponto: number; fin015: number; fin010: number };
  > }
  > ```
  > Default no provider; override via `EnvironmentProvider` (`SISPAG_*` env vars). Injetar em `SispagPainelService` e `ConexosSispagClient`. Move a régua para o EnvironmentProvider (mesmo lock-in do `conexosWriteEnabled`/`conexosDryRun`).

- **Resultado Esperado**
  > Mudança de régua = mudar 1 env var + restart (não redeploy). Fica alinhado com o padrão Bass "configuration files ↔ Defer Binding".
  > - Constantes de policy espalhadas: 6 → 0 (todas via `SispagPolicy`).
  > - Módulos afetados por mudança de régua: 2 → 0.

- **Tactic alvo**: Defer Binding (configuration)
- **Severidade**: P2
- **Esforço estimado**: S (1d)
- **Findings relacionados**: F-modifiability-3
- **Métricas de sucesso**:
  - Magic numbers em `SispagPainelService`/`ConexosSispagClient`: 6 → 0
  - Custo de mudar aging: PR+deploy → env-var+restart
- **Risco de não fazer**: 3-5 PRs previsíveis nos próximos 6 meses só para mexer em régua; cada uma toca o mesmo arquivo, competindo com features maiores.
- **Dependências**: Convém alinhar com card análogo em Permutas (integrability já flagou padrão similar).

### [modifiability-4] Extrair `mapTituloRow` privado no `ConexosSispagClient`

- **Problema**
  > O mapeamento Zod→`TituloAPagar` está duplicado em `listTitulosAPagar` (L136-155) e `getTituloAPagar` (L174-193) — 12 campos, mesmos fallbacks, dois sítios. Se um campo mudar (novo `contaCorrente`, rename de `credor`), é necessário editar duas vezes — bug silencioso pode fazer a validação de inclusão no lote divergir do painel.

- **Melhoria Proposta**
  > Extrair função privada:
  > ```ts
  > private mapTituloRow = (row: unknown, filCod: number): TituloAPagar | null => {
  >   const parsed = tituloRowSchema.safeParse(row);
  >   if (!parsed.success) return null;
  >   const r = parsed.data;
  >   return { docCod: r.docCod, titCod: r.titCod ?? '1', filCod, credor: r.dpeNomPessoa ?? r.dpeNomPessoaFor, valor: r.titMnyValor ?? 0, moeda: r.moeEspSigla, vencimento: r.titDtaVencimento, liberado: r.vldLib ?? false, pago: r.vldPago ?? false, banco: r.bncDesNome, numRemessa: r.titNumRemessa };
  > };
  > ```
  > `listTitulosAPagar` faz `rows.flatMap(r => { const t = mapTituloRow(r, filCod); return t ? [t] : []; })`; `getTituloAPagar` idem no loop.

- **Resultado Esperado**
  > 1 sítio de mapeamento; qualquer campo novo cai automaticamente nos 2 endpoints.
  > - Duplicação (bloco de 20 LoC): 2 → 1.

- **Tactic alvo**: Abstract Common Services
- **Severidade**: P2
- **Esforço estimado**: S (≤ 0.5d)
- **Findings relacionados**: F-modifiability-4
- **Métricas de sucesso**:
  - Sítios de mapeamento Zod→TituloAPagar: 2 → 1
  - LoC `ConexosSispagClient`: 252 → ~225
- **Risco de não fazer**: divergência silenciosa entre painel e validação de inclusão. Analista vê valor X, sistema aceita valor Y.
- **Dependências**: nenhuma.

### [modifiability-5] Split de `SispagInterface.ts` em `PainelInterface.ts` + `LotePagamentoInterface.ts`

- **Problema**
  > O arquivo agrega duas fatias com fontes de mudança independentes (leitura ERP × persistência local do agregado). Delimitado por comentário divisor (L93). Contribui para o fan-out do `page.tsx` (que hoje pega 3 tipos daqui via re-export do `lib/sispag.ts`).

- **Melhoria Proposta**
  > Separar em dois arquivos no mesmo diretório:
  > - `src/backend/domain/interface/sispag/PainelInterface.ts` (TituloAPagar, LoteSispag, BorderoAPagar, SispagKpis, SispagPainelResponse).
  > - `src/backend/domain/interface/sispag/LotePagamentoInterface.ts` (LOTE_STATUS, LotePagamentoStatus, ItemLote, LotePagamento, CriarLoteInput, IncluirTituloInput, ListarLotesFiltro).
  > `LotePagamentoInterface.ts` importa `TituloAPagar` de `PainelInterface` (dependência unidirecional, aceitável).

- **Resultado Esperado**
  > Cada fatia evolui em seu arquivo. Muda painel = não recompila code do lote (e vice-versa).
  > - Módulos com duas fontes de mudança independentes: 1 → 0.

- **Tactic alvo**: Increase Semantic Coherence
- **Severidade**: P3
- **Esforço estimado**: S (0.5d)
- **Findings relacionados**: F-modifiability-5
- **Métricas de sucesso**:
  - `SispagInterface.ts` deixa de existir; substituído por 2 arquivos ≤ 100 LoC cada.
- **Risco de não fazer**: acoplamento cresce à medida que Fatia 3 adiciona `EnvioLoteInput`, `RetornoBanco`, etc — chega em 300+ LoC.
- **Dependências**: convém entrar junto com **modifiability-1** (split do frontend).

### [modifiability-6] API bulk `POST /sispag/lotes/:id/itens/bulk` para inclusão em lote

- **Problema**
  > O frontend faz um `POST` por título selecionado (`sispag/page.tsx:189-198`). Cada POST = 1 advisory-lock + 1 re-leitura Conexos + 1 transação Postgres. Selecionar 50 títulos = 50 round-trips. Regra de inclusão (I2/I3/I4) duplicar-se-á entre single-title e bulk quando a Fatia 3 pedir volumes maiores.

- **Melhoria Proposta**
  > Adicionar `LotePagamentoService.incluirTitulosBulk(loteId, itens[], ator)` — 1 advisory-lock por lote, 1 re-leitura Conexos paginada por `docCod`, 1 transação com todos os `adicionarItem`. Rota: `POST /sispag/lotes/:id/itens/bulk`. Retorna `{ lote, incluidos, rejeitados: [{titulo, motivo}] }`.
  > Manter `POST /sispag/lotes/:id/itens` (single) delegando ao bulk com 1 item — DRY na regra.

- **Resultado Esperado**
  > Custo de "incluir N títulos" no frontend: N round-trips → 1.
  > - Regra de inclusão implementada 1 sítio (single delega ao bulk).

- **Tactic alvo**: Reduce Coupling (bulk boundary) + Refactor
- **Severidade**: P3
- **Esforço estimado**: M (2-3d)
- **Findings relacionados**: F-modifiability-8
- **Métricas de sucesso**:
  - Round-trips para incluir 50 títulos: 50 → 1
  - Sítios da regra I2/I3/I4: 1 → 1 (single wraps bulk)
- **Risco de não fazer**: quando Fatia 3 subir para 100+ títulos, UX degrada; re-implementar a regra na Fatia 3 duplica lógica de invariante.
- **Dependências**: **modifiability-1** ajuda (facilita a Aba de Títulos gerenciar seleção grande).

### [modifiability-7] Sincronizar ontology `state-machines/lote-pagamento.md` com o código

- **Problema**
  > `related_files` cita `TBD_lote_pagamento.sql` (a migração real é `0023_lote_pagamento.sql`); o exemplo de tipo TS mostra valores lowercase (`'rascunho'`) mas o código usa uppercase (`'RASCUNHO'` — `SispagInterface.ts:98` e CHECK constraint). `/retro-ontology` propagará drift.

- **Melhoria Proposta**
  > Editar `ontology/state-machines/lote-pagamento.md`:
  > - Linha 10: `related_files:` → `src/backend/migrations/0023_lote_pagamento.sql`.
  > - Linha 34: `LotePagamentoStatus = 'RASCUNHO' | 'FINALIZADO' | 'CANCELADO'`.
  > Atualizar `ontology/_index.json` para apontar entidade `lote-pagamento` → `0023_lote_pagamento.sql`.

- **Resultado Esperado**
  > `_coverage.json` recomputado sem drift. `/retro-ontology` verde.
  > - Divergências ontology/código no arquivo: 2 → 0.

- **Tactic alvo**: Defer Binding via docs vivos (metodológica)
- **Severidade**: P3
- **Esforço estimado**: S (≤ 0.5d)
- **Findings relacionados**: F-modifiability-7
- **Métricas de sucesso**:
  - Divergências ontology/código no arquivo `state-machines/lote-pagamento.md`: 2 → 0
- **Risco de não fazer**: cada Regis-Review futuro registra o mesmo drift; agent `OntologyCurator` regenera com base incorreta.
- **Dependências**: nenhuma.

## 6. Notas do agente

- **Sem P0 encontrado.** Aggregate `LotePagamento` está limpo: I2-I6 na fronteira do service, aggregate root encapsula `ItemLote`, optimistic lock + advisory lock corretamente separados (durabilidade × serialização), invariantes cobertos por 9 testes unitários (`LotePagamentoService.test.ts:85-237`), zero cross-layer violations (`grep from '.*service/' domain/{repository,client}` → vazio), zero warnings de complexidade cognitiva no delta.
- **Cross-QA — Testability**: `modifiability-1` (split frontend) desbloqueia testes de componente por Aba — hoje testar a Aba de Lotes Candidatos exige montar o painel inteiro.
- **Cross-QA — Integrability**: `modifiability-3` (SispagPolicy) e `modifiability-4` (mapTituloRow) alinham com o padrão que Integrability provavelmente pediu no Painel (contratos Zod centralizados).
- **Cross-QA — Deployability**: `modifiability-3` (magic numbers → env var) elimina 3-5 redeploys previsíveis nos próximos 6 meses só para régua de aging/janela.
- **Cross-QA — Performance**: `modifiability-6` (bulk API) tem impacto direto de performance quando os lotes crescerem — flag para o agent QA de performance considerar como pré-requisito de escala.
- **Escopo declarado**: só o delta da branch. Não avaliei o resto do repo (Permutas serviu apenas de baseline comparativo — score de fan-in dos serviços Permutas ficou em 2, mas há refactor pendente registrado em runs anteriores).
