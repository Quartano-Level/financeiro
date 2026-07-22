---
qa: Modifiability
qa_slug: modifiability
run_id: 2026-07-22-1953
agent: qa-modifiability
generated_at: 2026-07-22T19:56:05Z
scope: frontend
score: 8
findings_count: 4
cards_count: 3
---

# Modifiability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Design Reviewer / analista financeiro | Precisa truncar nomes longos de Cliente/Exportador em 2 linhas com tooltip, sem quebrar layout do grid, e propagar o padrão para outras superfícies (`AbaAutomaticas`, `VisaoGeralTable`, `AlocarDialog`) | Atom compartilhado `Campo` em `src/frontend/app/permutas/components/ui.tsx` + 3 call-sites nas telas de Permutas | Desenvolvimento (delta ainda em `fix/permutas-clamp-cliente-exportador`) | Prop opt-in aditiva (`clamp?: boolean`, `title?: string`) no `Campo`; default inalterado; call-sites tocados só nos rótulos "Cliente"/"Exportador"; testes de regressão cobrem os dois braços (com/sem clamp) | Superfície de mudança ≤ 5 arquivos; 0 breaking changes em consumers existentes; toque médio por call-site ≤ 3 linhas; propriedade default preservada (retrocompatibilidade 100%) |

> Cenário-alvo do delta: **"quando o produto pedir mais um campo com truncamento (p.ex. armador, agente),
> o custo deve ser 1 linha por call-site — hoje é."**

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Arquivos de código tocados no delta | 4 (`ui.tsx` + 3 call-sites) | ≤ 6 para tweak presentacional | ✅ | `git diff main --stat` |
| Linhas inseridas / removidas no delta | +99 / −10 (inclui 30 linhas de teste + 26 de inbox) | ≤ 200 para tweak | ✅ | `git diff main --stat` |
| Superfície de API do `Campo` (props) antes → depois | 3 → 5 (`label`, `className`, `children` → +`clamp`, `title`) | Aditiva, opt-in | ✅ | `ui.tsx:193-205` |
| Retrocompatibilidade dos consumers de `Campo` | 100% (props novas opcionais, default de classe `break-words` mantido) | 100% | ✅ | `ui.tsx:211` |
| Call-sites de `Campo` no domínio Permutas | 42 ocorrências em 6 arquivos | — (contexto) | ✅ | `grep -c "Campo " src/frontend/app/permutas/components/*.tsx` |
| Call-sites que passaram a usar `clamp title` | 6 (2 em `AbaAutomaticas`, 3 em `VisaoGeralTable`, 1 em `AlocarDialog`) | — (contexto) | ✅ | `grep -rn "clamp title" src/frontend --include="*.tsx"` |
| Fan-in do módulo `ui.tsx` (call-sites internos ao domínio) | 6 arquivos em `app/permutas/components/` | ≤ 10 para atom local | ✅ | `grep -rln "from './ui'\|components/ui'" src/frontend/app/permutas` |
| LOC de `ui.tsx` após delta | 249 | ≤ 400 (p95) / ≤ 600 (max) | ✅ | `wc -l src/frontend/app/permutas/components/ui.tsx` |
| LOC dos call-sites tocados | `VisaoGeralTable` 500 · `AlocarDialog` 310 · `AbaAutomaticas` 249 | ≤ 400 (p95) | ⚠️ `VisaoGeralTable` acima | `wc -l` |
| Import fan-out dos arquivos tocados | `ui.tsx` 8 · `VisaoGeralTable` 24 · `AbaAutomaticas` 11 · `AlocarDialog` 11 | ≤ 15 | ⚠️ `VisaoGeralTable` = 24 | `grep -c "^import"` |
| Cognitive complexity do `Campo` | trivial (1 branch: `clamp && 'line-clamp-2'`) | < 5 | ✅ | leitura de `ui.tsx:206-217` |
| Regressão automática do novo comportamento | 2 testes (`clamp=true` → `line-clamp-2` + `title`; sem props → `break-words`, sem `title`) | ≥ 1 teste por braço | ✅ | `src/frontend/__tests__/permutas-components.test.tsx:170-193` |
| Duplicação da mecânica de truncamento no FE | 1 lugar (`ui.tsx` centraliza `line-clamp-2` para o domínio Permutas) | 1 | ✅ | `grep -rn "line-clamp-2" src/frontend` |
| FE typecheck / lint / test após delta | 0 err / 0 err (8 warn pré-existentes) / 88 pass | verde | ✅ | `_shared-metrics.md` |

### Apêndice A — Top-10 maiores arquivos do frontend (contexto de módulo)

| # | LOC | Arquivo |
|---|---|---|
| 1 | 1036 | `src/frontend/app/permutas/page.tsx` |
| 2 | 832 | `src/frontend/app/sispag/page.tsx` |
| 3 | 752 | `src/frontend/app/permutas/BorderosPanel.tsx` |
| 4 | **500** | `src/frontend/app/permutas/components/VisaoGeralTable.tsx` ← **tocado no delta** |
| 5 | 362 | `src/frontend/app/sispag/components/LoteCard.tsx` |
| 6 | **310** | `src/frontend/app/permutas/components/AlocarDialog.tsx` ← **tocado no delta** |
| 7 | 275 | `src/frontend/app/permutas/clientes-filtro/page.tsx` |
| 8 | **249** | `src/frontend/app/permutas/components/ui.tsx` ← **tocado no delta** |
| 9 | **249** | `src/frontend/app/permutas/components/AbaAutomaticas.tsx` ← **tocado no delta** |
| 10 | 224 | `src/frontend/lib/auth/AuthProvider.tsx` |

### Apêndice B — Top fan-in dos átomos de `ui.tsx` (contexto de acoplamento)

| Símbolo | Consumers em `app/permutas/components/` | Papel |
|---|---|---|
| `Campo` | 6 arquivos (`AbaAutomaticas`, `VisaoGeralTable`, `AlocarDialog`, `ConfirmarLoteDialog`, `ConfirmarProcessamentoDialog`, `ui.tsx` self) | Atom rótulo/valor — o mais compartilhado do domínio |
| `StatusBadge`/`ProcessamentoBadge`/`PermutaBorderoBadge` | 3–4 cada | Badges de estado |
| `Moeda` / `MoneyInput` | 3–4 cada | Formatação monetária |
| `KpiFooter` / `BotaoAtualizar` | 1–2 cada | Utilitários de header |

> `Campo` é o hub de UI mais reutilizado do domínio Permutas — qualquer mudança nele tem 6 pontos
> de ripple. O delta atende exatamente o cenário de Bass "Change existing feature" com resposta
> aditiva/opt-in, o que mantém o custo em O(consumers-que-querem-a-nova-feature), não em
> O(consumers-existentes).

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Split Module | `ui.tsx` (249 LOC) agrega 8 átomos (`RunStatusBadge`, `StatusBadge`, `ProcessamentoBadge`, `PermutaBorderoBadge`, `Moeda`, `MoneyInput`, `Campo`, `KpiFooter`, `BotaoAtualizar`). Coesão temática forte (UI atoms do domínio), tamanho ainda saudável. Não é candidato a split. | ✅ | `ui.tsx:18-249` |
| Increase Semantic Coherence | `Campo` continua uma peça semanticamente coerente: rótulo + valor + variação visual opt-in. `clamp` + `title` são **duas facetas da mesma preocupação** (truncar texto longo e expor o texto completo por acessibilidade). Não estão desalinhadas. | ✅ | `ui.tsx:184-217` |
| Encapsulate | A mecânica de `line-clamp-2` + tooltip está **encapsulada no atom**, não vazada para call-sites (grep confirma 1 único lugar com `line-clamp-2` no domínio Permutas). Consumers passam `clamp title` sem conhecer a classe Tailwind. | ✅ | `grep -rn "line-clamp-2" src/frontend` retorna só `ui.tsx` + testes |
| Use an Intermediary | Não aplicável a atom de UI direto. Um `TruncatedText`/`ClampedText` molecule seria um intermediary — hoje o padrão só existe em 1 tipo de campo (nome de entidade); introduzi-lo agora seria over-engineering. Já registrado como FUP-1 no inbox. | ⚠️ parcial | `ontology/_inbox/permutas-clamp-followups.md:7-14` |
| Restrict Dependencies | Delta não introduziu dependências novas (nem `npm i`, nem imports cruzando fronteira). `Campo` continua puro (`React`, `cn`). | ✅ | `git diff main -- src/frontend/package.json` (vazio) |
| Refactor | Delta é **aditivo puro**: nenhum call-site existente foi alterado no comportamento, nenhuma prop foi renomeada, nenhum tipo foi virado. Retrocompatibilidade 100%. | ✅ | `ui.tsx:193-217` (props opcionais; `clamp && …` só ativa quando pedido) |
| Abstract Common Services | O padrão "truncar nome de entidade em N linhas + mostrar tooltip" ainda é local ao domínio Permutas (6 call-sites em 3 arquivos). Um `TruncatedText` global no `components/ui/` faria sentido se o padrão surgisse em SISPAG/GED. Ainda não surgiu — abstrair agora violaria "Rule of Three". | ⚠️ parcial (por design) | FUP-1 no inbox aguarda 2º domínio para promover ao DS |
| Defer Binding | Prop `clamp?: boolean` **é** um binding deferido ao call-site: quem quer truncar decide no consumer, sem alterar o atom. Combinado com o default `break-words`, mantém a variabilidade em runtime/consumer, não em compile-time do atom. | ✅ | `AbaAutomaticas.tsx:184`, `VisaoGeralTable.tsx:139,147,264,267`, `AlocarDialog.tsx:111` |

## 4. Findings (achados)

### F-modifiability-1: `line-clamp-2` só é acessível por hover (tooltip nativo), não por teclado

- **Severidade**: P2 (débito de acessibilidade + modificabilidade — mudar para `Tooltip` do DS depois força tocar todos os 6 call-sites de novo se a API atual não for compatível)
- **Tactic violada**: Encapsulate (parcial — encapsula o CSS mas escolhe uma API que pode não sobreviver ao próximo requisito)
- **Localização**: `src/frontend/app/permutas/components/ui.tsx:209-212`
- **Evidência (objetiva)**:
  ```tsx
  <dd
      title={clamp ? title : undefined}
      className={cn('text-sm font-medium tabular-nums break-words', clamp && 'line-clamp-2')}
  >
  ```
- **Impacto técnico**: se o Design System pedir `Tooltip` (Radix) com suporte a `:focus` por teclado, a assinatura pode continuar `title: string` (sem breaking), mas a mecânica interna mudará. Nesse cenário o custo já está protegido pela API atual — o risco é só se um dev futuro adicionar `title` fora do padrão. Já registrado em `ontology/_inbox/permutas-clamp-followups.md#FUP-1`.
- **Impacto de negócio**: baixo hoje (Cliente/Exportador são metadados, não a ação primária). Aumenta se auditoria de acessibilidade WCAG entrar no roadmap.
- **Métrica de baseline**: 6 call-sites com `title` HTML nativo; 0 com `Tooltip` do DS.

### F-modifiability-2: `VisaoGeralTable.tsx` já em 500 LOC e 24 imports após o delta

- **Severidade**: P2 (não introduzido pelo delta, mas o delta adiciona +14 linhas úteis em um arquivo já grande — próximo tweak em Permutas provavelmente encosta em 550+ LOC)
- **Tactic violada**: Split Module (borderline)
- **Localização**: `src/frontend/app/permutas/components/VisaoGeralTable.tsx` (500 LOC, 24 imports, 24 usos de `Campo`)
- **Evidência (objetiva)**:
  ```
  500 src/frontend/app/permutas/components/VisaoGeralTable.tsx
  24 imports; 24 Campos; 4 blocos `clamp title` adicionados
  ```
- **Impacto técnico**: p95 de tamanho de arquivo do FE é ~400 LOC (Apêndice A); `VisaoGeralTable` está 25% acima. Tocar layout de linhas de tabela + painel de detalhe expandido no mesmo módulo aumenta o risco de merge conflict em features paralelas.
- **Impacto de negócio**: baixo/médio — Permutas é a frente mais viva; feature-tweaks nessa área ficarão mais lentos progressivamente.
- **Métrica de baseline**: LOC = 500 (alvo p95 = 400); fan-out = 24 imports (alvo = 15).

### F-modifiability-3: padrão "truncar nome de entidade + tooltip" replicado em 3 arquivos sem molecule dedicado

- **Severidade**: P3 (Rule of Three ainda não disparou — 1 padrão, 1 tipo de campo)
- **Tactic violada**: Abstract Common Services (proativamente diferida — correto por ora)
- **Localização**: `AbaAutomaticas.tsx:184,187`, `VisaoGeralTable.tsx:139,147,264,267`, `AlocarDialog.tsx:111`
- **Evidência (objetiva)**:
  ```
  6 call-sites usando `<Campo … clamp title={…}>` para Cliente/Exportador
  ```
- **Impacto técnico**: se o padrão aparecer no SISPAG (nome do favorecido) ou no GED (razão social do fornecedor), a decisão de promover para `components/ui/TruncatedText.tsx` compartilhado precisa ser tomada — hoje o custo é O(1) por call-site, aceitável.
- **Impacto de negócio**: nenhum imediato.
- **Métrica de baseline**: `clamp title` aparece em 6 lugares; ainda dentro do mesmo domínio (Permutas).

### F-modifiability-4: `Campo` cresce por props opt-in — risco de "prop drilling accretion"

- **Severidade**: P3 (observação preventiva — 2 props opt-in é saudável, 6 seria smell)
- **Tactic violada**: Increase Semantic Coherence (preventivo)
- **Localização**: `src/frontend/app/permutas/components/ui.tsx:193-205`
- **Evidência (objetiva)**:
  ```tsx
  export function Campo({
      label, className, children,
      clamp,   // novo
      title,   // novo
  }: { label: string; className?: string; children: React.ReactNode; clamp?: boolean; title?: string })
  ```
- **Impacto técnico**: cada nova preocupação visual (ex.: `mono`, `dim`, `numeric-align`) adicionada como flag booleana vira boolean-explosion. Hoje 2 flags relacionadas é ok; a partir de 4 flags heterogêneas, virar `variant: 'text' | 'numeric' | 'truncated'` (ou compor via subcomponentes) é preferível.
- **Impacto de negócio**: nenhum imediato.
- **Métrica de baseline**: `Campo` hoje = 3 props core + 2 opt-in (5 total). Threshold de smell = ≥ 6 props opt-in ou ≥ 3 preocupações ortogonais.

## 5. Cards Kanban

### [modifiability-1] Prevenir crescimento do smell de prop-explosion no `Campo`

- **Problema**
  > `Campo` acaba de ganhar 2 props opt-in (`clamp`, `title`) coerentes entre si. Um próximo tweak que adicione uma 3ª preocupação heterogênea (p.ex. `mono`, `dim`, `align`) começa a empurrar o atom para boolean-explosion. Ainda não é problema — é um guard-rail preventivo para o próximo `/feature-tweak` em Permutas.

- **Melhoria Proposta**
  > Registrar convenção no `docs/design-system/atoms.md` (ou no próprio JSDoc de `Campo`): "≥ 3 preocupações visuais ortogonais → migrar de props booleanas para `variant`/composição de subcomponentes". Não migrar nada agora. Tactic Bass alvo: **Increase Semantic Coherence**.

- **Resultado Esperado**
  > Próximo dev que abrir `Campo` para adicionar uma 3ª preocupação lê o guard-rail e escolhe `variant` em vez de mais um `boolean`. Métrica: `# props opt-in em Campo` continua ≤ 2 até que um refactor consciente aconteça.

- **Tactic alvo**: Increase Semantic Coherence
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-4
- **Métricas de sucesso**:
  - # props opt-in em `Campo`: 2 → mantido em ≤ 2 (ou refactor para `variant` se subir)
  - JSDoc do `Campo` referencia a convenção: ausente → presente
- **Risco de não fazer**: em 3–4 tweaks, `Campo` vira `{ clamp, title, mono, dim, align, dense }` e o atom deixa de ser semanticamente coerente — refactor tardio custa L em vez de S hoje.
- **Dependências**: nenhuma

### [modifiability-2] Promover `TruncatedText` para o Design System quando surgir 2º domínio

- **Problema**
  > O padrão `<Campo clamp title={…}>` para nome longo de entidade aparece em 6 call-sites de 3 arquivos, todos dentro do domínio Permutas. Se SISPAG (favorecido) ou GED (fornecedor) pedirem o mesmo comportamento, replicar mais uma vez começa a duplicar a decisão de UX (que atributo é o texto completo, quando o tooltip aparece, comportamento de teclado). Já está registrado como FUP-1 no inbox.

- **Melhoria Proposta**
  > Quando um 2º domínio (SISPAG ou GED) pedir o mesmo padrão, criar `src/frontend/components/ui/TruncatedText.tsx` que encapsule `line-clamp-*` + `Tooltip` do DS (Radix, com gating por overflow real e suporte a `:focus`). Migrar os 6 call-sites de Permutas + os novos. Manter a prop `clamp`/`title` do `Campo` como delegação para o novo molecule. Tactic Bass alvo: **Abstract Common Services** + **Use an Intermediary**.

- **Resultado Esperado**
  > 1 fonte única para "truncar texto de entidade com tooltip acessível"; `Campo.clamp` vira delegação; call-sites em ≥ 2 domínios apontando para o mesmo molecule. Métrica: `# lugares com line-clamp de nome de entidade`: 6 (todos em Permutas) → 1 molecule + N consumers.

- **Tactic alvo**: Abstract Common Services / Use an Intermediary
- **Severidade**: P3
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-modifiability-1, F-modifiability-3
- **Métricas de sucesso**:
  - Domínios usando o padrão: 1 (Permutas) → 2+
  - Molecule `TruncatedText` em `components/ui/`: ausente → presente
  - Acessibilidade por teclado (`:focus` mostra o texto completo): não → sim
- **Risco de não fazer**: cada domínio novo reimplementa o padrão com variações sutis (title vs Tooltip, com/sem overflow gating) — divergência de UX + auditoria WCAG mais cara.
- **Dependências**: `docs/design-system/feedback.md` (`Tooltip`), FUP-1 e FUP-2 em `ontology/_inbox/permutas-clamp-followups.md`

### [modifiability-3] Colocar `VisaoGeralTable.tsx` na fila de split preventivo

- **Problema**
  > `VisaoGeralTable.tsx` está em 500 LOC e 24 imports após o delta — 25% acima do p95 de tamanho do FE (~400 LOC) e 60% acima do alvo de fan-out (15). O delta em si só adicionou +14 linhas úteis, mas empurra o arquivo para uma faixa onde o próximo tweak em Permutas provavelmente cruza 550 LOC. Ainda não é P0/P1 porque não há métrica objetiva de degradação de mudança (velocidade, conflitos), só o proxy LOC.

- **Melhoria Proposta**
  > Agendar (não fazer agora) um split de `VisaoGeralTable.tsx` em: (a) `VisaoGeralTable` (grid + paginação) e (b) `VisaoGeralRowDetalhe` (o painel expandido, que hoje é ~40% do arquivo e concentra os `Campo`s tocados). Registrar como próxima `/feature-tweak` técnica quando qualquer tweak funcional voltar a esse arquivo. Tactic Bass alvo: **Split Module**.

- **Resultado Esperado**
  > Após o split: `VisaoGeralTable.tsx` ≤ 320 LOC, `VisaoGeralRowDetalhe.tsx` ≤ 200 LOC, fan-out de cada ≤ 15. Menos merge conflicts em features paralelas na frente Permutas.

- **Tactic alvo**: Split Module
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-modifiability-2
- **Métricas de sucesso**:
  - LOC de `VisaoGeralTable.tsx`: 500 → ≤ 320
  - Imports em `VisaoGeralTable.tsx`: 24 → ≤ 15
  - # arquivos que precisam ser abertos para tocar "detalhe expandido" (proxy de conflito): 1 → 1 (o novo, isolado)
- **Risco de não fazer**: em 2–3 tweaks o arquivo cruza 600 LOC — split reativo sob pressão de deadline é mais caro e mais arriscado que agendar.
- **Dependências**: nenhuma. Fica no backlog até o próximo tweak que abra o arquivo.

## 6. Notas do agente

- Escopo aplicado: só o frontend, e dentro dele, só o delta e sua vizinhança direta em `app/permutas/components/`. Backend/infra declarados não-medíveis por scope (ver `_shared-metrics.md`).
- Nenhum finding P0/P1 foi levantado — o delta é presentacional, aditivo, com retrocompatibilidade 100% e testes de regressão. Rebaixamentos para P2/P3 seguem a regra do template: "P0/P1 exige métrica de baseline numérica" — só há baseline numérico para tamanho de arquivo (Split Module preventivo), e nesse caso não há evidência de degradação atual de velocidade de mudança, só o proxy LOC.
- Cross-QA para o consolidator:
  - `modifiability-2` (promover `TruncatedText`) sobrepõe **Usability/Accessibility** (não é um QA formal do 8-QA, mas o DesignSystemReviewer capturou em `permutas-clamp-followups.md`).
  - `modifiability-3` (split preventivo) sobrepõe **Testability** — arquivos grandes são mais caros de testar; `VisaoGeralTable` já tem cobertura via `permutas-components.test.tsx`, mas o split aliviaria futuros mocks.
  - Nenhuma sobreposição com **Deployability** neste delta (sem magic numbers, sem config externalizada faltando — é UI pura).
  - Nenhuma sobreposição com **Integrability** (sem tocar boundary de API/ERP/DB).
