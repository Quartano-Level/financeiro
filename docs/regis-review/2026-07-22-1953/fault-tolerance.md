---
qa: Fault Tolerance
qa_slug: fault-tolerance
run_id: 2026-07-22-1953
agent: qa-fault-tolerance
generated_at: 2026-07-22T19:56:14Z
scope: frontend
score: 8.5
findings_count: 2
cards_count: 1
---

# Fault Tolerance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

Escopo do delta: `Campo` (rótulo/valor do painel de detalhe em Permutas) recebe props opt-in
`clamp?: boolean` e `title?: string`, e três consumidores (`AbaAutomaticas`, `VisaoGeralTable` 2x,
`AlocarDialog`) passam a marcar Cliente/Exportador com `clamp title`. Mudança puramente
presentacional — os fluxos financeiros de escrita (Conexos `fin010`, Nexxera, GED) **não são
tocados**, portanto os cenários canônicos de fault-tolerance backend (idempotência SQS,
transação dual-write, DLQ, reconciliação, audit-trail, stuck-state reaper) são **fora de escopo**.

O cenário aplicável ao delta é **frontend rendering under dirty/absent data**:

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| API `/api/permutas/*` (backend Conexos) | Payload com `importador = null` (invoice sem cliente resolvido) ou nomes muito longos (≥ 60 chars com quebra) | `Campo` renderizado nas seções expandidas de `AbaAutomaticas`, `VisaoGeralTable`, `AlocarDialog` | Analista abre o painel de detalhe de uma linha em produção multi-tenant | Renderiza `—` para null; trunca em 2 linhas com reticências; expõe texto completo via `title` (tooltip nativo); grid não invade coluna vizinha (`min-w-0 + break-words`) | 0 exceções client-side por null/undefined; 0 casos de overflow visual invadindo coluna ao lado; 100% dos nomes ≥ 60 chars mostram tooltip completo |

Este é o cenário estreito que a mudança precisa satisfazer. Cenários financeiros end-to-end
(no double-execution, DLQ→exception queue, reconciliação com Conexos) **permanecem inalterados
por este delta** — não são medidos aqui.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Consumidores de `Campo` para Cliente/Exportador que passam `clamp title` | 3/3 arquivos, 5/5 usos (Aba: 2, VisaoGeral: 4, Alocar: 1) | 100% dos usos com risco de nome longo | ✅ | `git diff main -- src/frontend/app/permutas/components/{AbaAutomaticas,VisaoGeralTable,AlocarDialog}.tsx` |
| Tratamento de `null` no valor renderizado antes do clamp | 3/3 callsites de `importador` usam `?? '—'` no children **e** `?? undefined` no title | 100% (nunca renderizar `null` como texto nem como atributo `title="null"`) | ✅ | `AbaAutomaticas.tsx:184-186`, `VisaoGeralTable.tsx:136-142`, `VisaoGeralTable.tsx:264-266` |
| Coerção defensiva do `title` (não emitir `title="undefined"`) | `Campo` só seta `title` quando `clamp` é true (`title={clamp ? title : undefined}`) | Sempre — atributos com string `"undefined"` são bug de UX | ✅ | `ui.tsx:210` |
| Encolhimento do grid (`min-w-0`) mantido no default | `min-w-0` no wrapper garantido; consumidores mantêm `sm:col-span-2` onde já havia | Regressão zero de layout | ✅ | `ui.tsx:207` + teste `min-w-0` |
| Testes de regressão para o cenário null/absent + clamp | 2 novos casos: clamp aplica line-clamp-2 + title; sem clamp mantém break-words e não seta title | ≥ 1 caso por comportamento novo | ✅ | `src/frontend/__tests__/permutas-components.test.tsx:167-192` |
| FE test suite (regressão global) | 88/88 passed | 100% | ✅ | `_shared-metrics.md` |
| FE typecheck | 0 erros | 0 | ✅ | `_shared-metrics.md` |
| ErrorBoundary envolvendo o painel de detalhe (contenção de exceção em runtime) | Não medível localmente sem execução do app; grep no repositório não é conclusivo neste QA quick | Presente ao nível de rota `permutas/` | ⚠️ | Escopo `--quick` |

Métricas não medíveis (declaração explícita):

> ⚠️ **Não medível neste gate**: idempotência SQS, transação dual-write DB+ERP, DLQ→exception queue,
> reconciliação contra Conexos `fin010`, audit-trail persistido, stuck-state reaper. Requer
> inspeção do backend, que está **fora de escopo** (scope=frontend). Estas métricas são
> inalteradas por este delta (nenhum arquivo backend tocado).

> ⚠️ **Não medível neste gate**: distribuição real de tamanhos de `importador`/`exportador` em
> produção. Requer amostra do Conexos. A justificativa da mudança é o incidente reportado
> (nomes ≥ ~60 chars quebravam o layout); teste de regressão usa `HUBNER COMPONENTES E SISTEMAS
> PARA IMPLEMENTOS RODOVIÁRIOS` (58 chars sem espaços) como caso representativo.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Sanity Checking | `Campo` normaliza `null → '—'` no children e `null → undefined` no title, evitando renderização de `"null"` como texto ou `title="null"` como atributo | ✅ presente | `AbaAutomaticas.tsx:184`, `VisaoGeralTable.tsx:139,141,264-266`, `ui.tsx:210` |
| Substitution (fallback presentacional) | Placeholder `'—'` quando o dado esperado está ausente (padrão consistente com `Moeda` que já fazia isso para `valor == null`) | ✅ presente | `ui.tsx:134`, `AbaAutomaticas.tsx:184`, `VisaoGeralTable.tsx:139` |
| Redundancy (informação completa via tooltip quando o principal foi truncado) | `title={x}` expõe texto integral no hover quando `line-clamp-2` esconde parte — o clamp não é perda de informação, é redundância graceful | ✅ presente | `ui.tsx:210-211` + testes 167-183 |
| Condition Monitoring | Testes de regressão asseguram que `clamp` produz `line-clamp-2 + title + min-w-0` e o default mantém `break-words` sem `title` — monitora a condição do contrato | ✅ presente | `permutas-components.test.tsx:167-192` |
| Recovery — Rollback (frontend, notify.error em mutação falha) | Fora do delta — este PR não introduz mutação nem toca callsite de `useMutation`. Não regride nenhuma tactic existente. | N/A — puramente presentacional | — |
| Idempotent Replay | N/A — não há mutação/chamada de rede tocada | N/A | — |
| Timeout / Retry / Fallback executors | N/A — sem I/O tocado | N/A | — |
| Compensating Transaction | N/A — sem escrita financeira | N/A | — |
| Reconcile (contra Conexos) | N/A escopo — inalterado por este delta | N/A | — |
| Quarantine (DLQ → exception queue) | N/A escopo — backend, inalterado por este delta | N/A | — |
| Voting / Comparison / Timestamp / Self-Test | N/A neste delta — não há redundância replicada, versionamento nem check de invariante temporal em jogo | N/A | — |
| Escalating Restart / Shadow / State Resync | N/A neste delta | N/A | — |

## 4. Findings (achados)

### F-fault-tolerance-1: Coerção defensiva de `null` no title do `Campo` está correta e testada

- **Severidade**: P3 (positivo — sem ação necessária; registrado para o consolidador)
- **Tactic violada**: — (tactic **cumprida**: Sanity Checking + Substitution)
- **Localização**: `src/frontend/app/permutas/components/ui.tsx:210-211`, consumidores em
  `AbaAutomaticas.tsx:184-186`, `VisaoGeralTable.tsx:139-142,264-266`, `AlocarDialog.tsx:111-113`
- **Evidência (objetiva)**:
  ```tsx
  // ui.tsx — Campo só emite title quando clamp está ativo, evitando title="undefined"
  title={clamp ? title : undefined}
  className={cn('text-sm font-medium tabular-nums break-words', clamp && 'line-clamp-2')}

  // AbaAutomaticas.tsx — dupla coerção: children ?? '—' e title ?? undefined
  <Campo label="Cliente" clamp title={c.invoice.importador ?? undefined}>
    {c.invoice.importador ?? '—'}
  </Campo>
  ```
- **Impacto técnico**: nenhum problema. O `?? undefined` no title garante que React não emita
  `title="null"` no DOM, e o `?? '—'` no children evita render de string vazia/`"null"`.
- **Impacto de negócio**: analista vê `—` (não `"null"`) quando o importador não veio da API —
  UX consistente com o padrão já usado em `Moeda`.
- **Métrica de baseline**: 3/3 callsites de `importador` (potencialmente null) usam o padrão de dupla
  coerção. 100%.

### F-fault-tolerance-2: ErrorBoundary do painel de detalhe não verificado neste gate

- **Severidade**: P2 (débito defensável — não introduzido por este delta, e o delta não aumenta o
  risco; downgrade obrigatório: P1/P0 exige baseline numérico, e não medi ausência real)
- **Tactic violada**: Recovery — Redundancy (contenção de exceção via ErrorBoundary React)
- **Localização**: `src/frontend/app/permutas/**` (rota `permutas/page.tsx` e subcomponentes)
- **Evidência (objetiva)**:
  ```
  Gate --quick não incluiu grep exaustivo por <ErrorBoundary> na rota permutas/.
  O delta não altera o perfil de risco (não introduz nova chamada que possa lançar):
  ?? '—' e ?? undefined são operadores puros sem throw.
  ```
- **Impacto técnico**: se um subcomponente futuro lançar em render, a rota inteira quebra em vez
  de degradar por linha. Não é regressão deste PR.
- **Impacto de negócio**: um bug em uma linha derruba a tela toda para o analista, aumentando MTTR
  percebido. Cenário não observado atualmente.
- **Métrica de baseline**: **não medida neste gate** (`--quick`, scope=frontend). Por regra 7 do
  template, sem baseline numérico a severidade **não pode ser P1/P0**; fica P2 e vai para inbox
  follow-up, sem card acionável neste run.

## 5. Cards Kanban

### [fault-tolerance-1] Manter o padrão `?? '—'` + `?? undefined` como convenção do `Campo`

- **Problema**
  > O delta introduziu um padrão robusto de coerção defensiva (`children ?? '—'` no valor,
  > `title ?? undefined` no tooltip) em 3 consumidores, mas isso é convenção de callsite, não do
  > componente. Se um consumidor futuro passar um campo null-able ao `Campo` sem coagir, o `title`
  > pode virar `null` e o valor pode renderizar `""`.

- **Melhoria Proposta**
  > Documentar no JSDoc do `Campo` (`ui.tsx:192-205`) que:
  > 1. `children` deve ser string/número já coagido — quando o valor pode ser `null | undefined`,
  >    o callsite usa `?? '—'`;
  > 2. `title` aceita `string | undefined` (não `null`) — quando o valor pode ser `null`, coagir
  >    com `?? undefined`.
  > Alternativa: apertar o tipo de `title` no próprio `Campo` para aceitar `string | null | undefined`
  > e normalizar internamente. Tactic Bass alvo: **Sanity Checking** (deslocar a validação para o
  > boundary do componente, não do chamador).

- **Resultado Esperado**
  > Novo consumidor de `Campo` não consegue introduzir `title="null"` ou render de `"null"` sem
  > passar pelo padrão documentado. Sem regressão nos 88 testes atuais.

- **Tactic alvo**: Sanity Checking (Bass — Detect Faults)
- **Severidade**: P3
- **Esforço estimado**: S (≤1d — 3 linhas de JSDoc ou 5 linhas de normalização + 1 teste)
- **Findings relacionados**: F-fault-tolerance-1
- **Métricas de sucesso**:
  - Callsites de `Campo` com valor null-able que emitem `title="null"` ou `"null"` no DOM: 0 (atual: 0) → 0 (mantido)
  - Doc do contrato do `Campo` cobre `null | undefined`: ausente → presente
- **Risco de não fazer**: em 6 meses, um consumidor novo passa `campo.opcional` cru e reintroduz
  o bug de `title="null"` — pequeno impacto visual, mas contradiz o padrão que este PR estabeleceu.
- **Dependências**: nenhuma

> Nota: o finding `F-fault-tolerance-2` (ErrorBoundary não verificado) **não gera card neste run**
> porque (a) está fora do escopo do delta e (b) não tem baseline numérico coletado — vai para
> `ontology/_inbox/permutas-clamp-followups.md` como observação para futuro gate `all`.

## 6. Notas do agente

- Delta puramente presentacional em 5 arquivos + 2 testes. O QA "Fault Tolerance" aqui degenera para "frontend graceful rendering", já que os fluxos financeiros com escrita externa (Conexos/Nexxera/GED) não são tocados — declarei explicitamente as métricas backend como fora de escopo, não como omissas.
- Cross-QA: o padrão `title` no hover é acessibilidade/UX (cross com Usability); a manutenção do `min-w-0` é layout/CSS (cross com Modifiability, pois `Campo` agora tem contrato ampliado que a `qa-modifiability` deve consolidar como surface expandida).
- Não elevei nenhum finding a P0/P1 porque a regra 7 do template exige baseline numérico para essas severidades e o único candidato (ErrorBoundary) não foi medido neste `--quick`.
- P0/P1 inbox items: nenhum. Follow-up P2 (ErrorBoundary sweep na rota `permutas/`) fica em `ontology/_inbox/permutas-clamp-followups.md` para o próximo gate `all`.
