---
qa: Modifiability
qa_slug: modifiability
run_id: 2026-06-25-1555
agent: qa-modifiability
generated_at: 2026-06-25T15:55:00Z
scope: backend,frontend
score: 8
findings_count: 4
cards_count: 4
---

# Modifiability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Time de produto (Yuri) | Pedido para adicionar um novo relatório exportável (ex.: `aging-detalhado`) ou trocar/colunar/renomear coluna em relatório existente | `RelatorioExportService.ts` (projeções `def*`), `Relatorio.ts` (enum `RELATORIO_TIPOS`), `types.ts` (union `RelatorioTipo` + `RELATORIOS_DISPONIVEIS`) | Dev/main durante ciclo regular (sem hotfix) | Adicionar/alterar a definição num único lugar coeso, sem ripple para frontend/handler/teste fora do necessário | Adicionar 1 relatório novo: ≤ 3 arquivos tocados, ≤ 1 hora dev, 0 testes pré-existentes precisam mudar |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| LOC `RelatorioExportService.ts` | 398 | ≤ 400 (limite p95 do repo) | ✅ | `_shared-metrics.md` |
| LOC `Relatorio.ts` (interface) | 46 | ≤ 150 | ✅ | `_shared-metrics.md` |
| Métodos públicos do service | 2 (`exportar`, `montarDefinicao`) | ≤ 5 | ✅ | `RelatorioExportService.ts:47,64` |
| Projeções `def*` privadas | 4 (`defAdiantamentos`, `defInvoices`, `defReconciliacaoProcesso`, `defClientes`) | — | ✅ | `RelatorioExportService.ts:95,165,200,293` |
| Fan-in `RelatorioExportService` | 2 (rota `permutas.ts` + teste) | — | ✅ | `Grep "RelatorioExportService"` |
| Fan-out imports do service | 5 (ExcelJS, tsyringe, 3 interfaces locais) | ≤ 15 | ✅ | `RelatorioExportService.ts:1-15` |
| Dependências de serviço injetadas | 2 (`GestaoPermutasService`, `LogService`) | ≤ 4 | ✅ | `RelatorioExportService.ts:41-44` |
| Duplicação de `RelatorioTipo` FE↔BE | 1 ocorrência (union FE) duplica `RELATORIO_TIPOS` BE | 0 (fonte única) | ⚠️ | `types.ts:331-337` vs `Relatorio.ts:10-19` |
| Duplicação de rótulo humano | `TITULO_POR_TIPO` (BE) ≠ `RELATORIOS_DISPONIVEIS.label` (FE) — duas tabelas paralelas para o mesmo conceito | 1 fonte (cliente decide rótulo OU contrato compartilhado) | ⚠️ | `RelatorioExportService.ts:23-30` + `types.ts:347-378` |
| Magic numbers em service | 2 (`LARGURA_PADRAO=18`, `MAX_NOME_ABA=31`) — ambos **nomeados como constantes** | nomeadas | ✅ | `RelatorioExportService.ts:18,20` |
| Cognitive complexity (Biome `noExcessiveCognitiveComplexity`) na feature | 0 warnings | 0 | ✅ | `npm run lint` (delta limpo conforme `_shared-metrics.md`) |
| Cross-layer violations introduzidas | 0 (service só lê `gestaoService.exporGestao`, sem ir a repository/client) | 0 | ✅ | inspeção de `RelatorioExportService.ts:51` |

> ⚠️ **Não medível localmente**: custo real de mudança (tempo dev para "adicionar um relatório") — requer telemetria de PR ou cronometragem. Estimado a partir da forma do código: ~30–60 min por relatório novo (3 arquivos: BE enum + BE `def*` + FE descritor).

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Split Module | Service já está numa pasta `service/permutas/`, fora do `GestaoPermutasService`; serialização (`serializar`) separada da projeção (`montarDefinicao`). Não precisa quebrar agora (398 LOC, coeso). | ✅ presente | `RelatorioExportService.ts:47-91, 382-397` |
| Increase Semantic Coherence | Cada `def*` projeta **um** tipo de relatório; `serializar` é genérico sobre `RelatorioDefinicao`; helpers (`soma`, `cardinalidade`, `soData`) são puros. O service tem uma responsabilidade única: "projeção+xlsx do snapshot do painel". | ✅ presente | `RelatorioExportService.ts:95-355` |
| Encapsulate | `RelatorioDefinicao` esconde detalhes de exceljs do caller; rota só consome `{filename, buffer}`. `isRelatorioTipo` encapsula a validação do path-param. | ✅ presente | `Relatorio.ts:36-46`, `RelatorioExportService.ts:47-61` |
| Use an Intermediary | `GestaoPermutasService.exporGestao()` é o intermediário entre o service de export e a leitura do Conexos — service nunca chama repository/client direto. | ✅ presente | `RelatorioExportService.ts:51` |
| Restrict Dependencies | DDD layers respeitados; sem import de `lambda/`/`routes/` no service; sem `process.env` (LogService injetado). | ✅ presente | imports em `RelatorioExportService.ts:1-15` |
| Abstract Common Services | `defAdiantamentos` é **reusado** para 3 tipos (`adiantamentos`, `ja-permutado`, `bloqueadas`) via filtro — evita duplicar 27 colunas. | ✅ presente | `RelatorioExportService.ts:70-83, 95-163` |
| Refactor | N/A para a feature (nasce nova). Helpers (`soma`, `soData`, `cardinalidade`) já extraídos. | ✅ presente | `RelatorioExportService.ts:359-379` |
| Defer Binding — configuration | Rótulos humanos do BE (`TITULO_POR_TIPO`) são tabela centralizada, fácil de mudar. Larguras de coluna estão inline em cada `def*` — fácil de ajustar mas dispersas. | ⚠️ parcial | `RelatorioExportService.ts:23-30` (tabela) vs colunas inline |
| Defer Binding — polymorphism / plugin | Adicionar novo relatório exige tocar: (a) `RELATORIO_TIPOS` (BE), (b) `switch` em `montarDefinicao`, (c) novo `def*`, (d) `RelatorioTipo` union (FE), (e) `RELATORIOS_DISPONIVEIS` (FE). 5 lugares para 1 conceito. Não há registry/Map<tipo, defFn>. | ⚠️ parcial | `RelatorioExportService.ts:69-90`, `types.ts:331-378` |
| Defer Binding — runtime registration | N/A — domínio fechado (catálogo de relatórios é decisão de produto, não plugin de terceiro). Custo de não ter é baixo. | N/A | — |

## 4. Findings

### F-modifiability-1: `RelatorioTipo` duplicado entre backend e frontend (drift latente)

- **Severidade**: P2 (médio — débito técnico defensável; sem fonte única)
- **Tactic violada**: Defer Binding — configuration / Abstract Common Services
- **Localização**: `src/backend/domain/interface/permutas/Relatorio.ts:10-19` e `src/frontend/lib/types.ts:331-337`
- **Evidência (objetiva)**:
  ```ts
  // backend
  export const RELATORIO_TIPOS = [
      'adiantamentos','invoices','ja-permutado','bloqueadas',
      'reconciliacao-processo','clientes',
  ] as const;
  export type RelatorioTipo = (typeof RELATORIO_TIPOS)[number];

  // frontend
  export type RelatorioTipo =
    | 'adiantamentos' | 'invoices' | 'ja-permutado'
    | 'bloqueadas' | 'reconciliacao-processo' | 'clientes'
  ```
- **Impacto técnico**: Adicionar/remover um tipo exige editar dois arquivos em repositórios lógicos distintos. Se um for esquecido, o FE acaba enviando um `tipo` que o BE rejeita com 400 (ou pior, deixa de oferecer um relatório válido). O typecheck FE não detecta drift contra o BE — só o teste de rota (`permutas.test.ts`) acusa, e apenas para tipos que ele exercita.
- **Impacto de negócio**: Risco baixo (catálogo cresce 1–2x/ano), mas custo de mudança dobra desnecessariamente e abre janela para bug silencioso em release com FE/BE desincronizado.
- **Métrica de baseline**: 1 union duplicado (FE), 6 literais por lado = 12 strings que precisam casar à mão.

### F-modifiability-2: Adicionar relatório novo toca 5 pontos (sem registry/Map)

- **Severidade**: P3 (baixo — melhoria opcional; forma atual com `switch` é legível e o typecheck do TS força exaustividade)
- **Tactic violada**: Defer Binding — polymorphism / plugin pattern
- **Localização**: `src/backend/domain/service/permutas/RelatorioExportService.ts:69-90` (switch), `Relatorio.ts:10-19` (enum), `src/frontend/lib/types.ts:331-378` (union + descritores)
- **Evidência (objetiva)**: Para adicionar `aging-detalhado` hoje: (1) inserir em `RELATORIO_TIPOS`; (2) novo `case 'aging-detalhado'` no `switch`; (3) novo `defAgingDetalhado`; (4) entrada em `TITULO_POR_TIPO`; (5) atualizar union FE; (6) item em `RELATORIOS_DISPONIVEIS`.
- **Impacto técnico**: Custo de cada novo relatório ≈ constante (não cresce com o catálogo), mas a coesão de "o que é um relatório" está espalhada em 4 tabelas paralelas. Uma alternativa seria `Map<RelatorioTipo, { titulo: string; build: (g: GestaoPermutasResponse) => RelatorioDefinicao }>` — single source para BE.
- **Impacto de negócio**: Insignificante no curto prazo (≤ 6 relatórios). Vira P2 se o catálogo passar de ~10 ou se algum cliente puder customizar quais relatórios aparecem.
- **Métrica de baseline**: 5 arquivos tocados por relatório novo; 4 tabelas paralelas (`RELATORIO_TIPOS`, switch, `TITULO_POR_TIPO`, `RELATORIOS_DISPONIVEIS`) representando o mesmo conceito.

### F-modifiability-3: Rótulos humanos vivem em duas tabelas (BE `TITULO_POR_TIPO` × FE `RELATORIOS_DISPONIVEIS`)

- **Severidade**: P3 (baixo — convenção de UI bilíngue/diferente é defensável)
- **Tactic violada**: Defer Binding — configuration
- **Localização**: `RelatorioExportService.ts:23-30` (BE: nome da aba + nome do arquivo) e `src/frontend/lib/types.ts:347-378` (FE: label do menu)
- **Evidência (objetiva)**:
  ```ts
  // BE
  'ja-permutado': 'Ja permutado',           // sem acento (compat. nome de aba xlsx)
  // FE
  { tipo: 'ja-permutado', label: 'Já permutado', ... }   // com acento (UI humana)
  ```
- **Impacto técnico**: Aceitável — BE precisa de ASCII para nome de aba (limite 31 chars do Excel) e nome de arquivo; FE quer pt-BR completo. Mas se um cliente pedir "renomear relatório", o time toca dois lugares.
- **Impacto de negócio**: Negligível hoje. Fica como nota para o consolidator.
- **Métrica de baseline**: 6 labels em cada tabela — 12 strings com semântica acoplada.

### F-modifiability-4: Larguras de coluna inline em cada `def*` (dispersas)

- **Severidade**: P3 (baixo — não há padrão emergente que justifique extrair ainda)
- **Tactic violada**: Defer Binding — configuration
- **Localização**: `RelatorioExportService.ts:102-130, 172-184, 273-288, 340-352`
- **Evidência (objetiva)**: 60+ literais `width: <N>` espalhados por 4 projeções. Já há `LARGURA_PADRAO=18`, mas a maioria das colunas declara explicitamente.
- **Impacto técnico**: Mudar política de largura (ex.: "todas as colunas monetárias = 20") exige caçar literais em 4 lugares.
- **Impacto de negócio**: Nenhum no curto prazo — colunas são detalhe de UX da planilha.
- **Métrica de baseline**: ~60 literais `width:` em 4 funções.

## 5. Cards Kanban

### [modifiability-1] Unificar `RelatorioTipo` BE↔FE em fonte única

- **Problema**
  > O union `RelatorioTipo` está duplicado em `src/frontend/lib/types.ts:331-337` e em `RELATORIO_TIPOS` no `src/backend/domain/interface/permutas/Relatorio.ts:10-19`. Qualquer mudança de catálogo (novo tipo ou rename) exige editar nos dois lados; o typecheck não detecta drift. Risco: FE oferece tipo que BE rejeita com 400 (ou vice-versa).
- **Melhoria Proposta**
  > Gerar o tipo do FE a partir do BE: (a) extrair `RELATORIO_TIPOS` (e `RelatorioDescritor` se quisermos descrição compartilhada) para um pacote leve `@financeiro/shared-contracts` consumido por FE e BE, ou (b) script `scripts/sync-relatorio-types.ts` que regenera `src/frontend/lib/types.ts` (bloco demarcado) a partir do BE no `prebuild`. Tactic: **Defer Binding — configuration** + **Abstract Common Services**.
- **Resultado Esperado**
  > Adicionar `aging-detalhado` ao BE quebra o build do FE automaticamente se a sincronização falhar. Drift FE↔BE = 0 strings divergentes.
- **Tactic alvo**: Defer Binding — configuration
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-1
- **Métricas de sucesso**:
  - Strings duplicadas `RelatorioTipo`: 12 → 0
  - Arquivos tocados ao adicionar relatório novo: 5 → 4
- **Risco de não fazer**: Em 6 meses, com 8–10 relatórios e múltiplas iterações, alta probabilidade de uma release nascer com FE/BE dessincronizado — sintoma é 400 silencioso ou item de menu morto.
- **Dependências**: nenhuma (escolha entre pacote shared vs script é trivial)

### [modifiability-2] Registry `Map<RelatorioTipo, ProjecaoDefinicao>` (opcional, post-MVP)

- **Problema**
  > Adicionar um relatório novo hoje requer 5 mudanças coordenadas (enum, switch, def*, título, FE descritor). O `switch` em `montarDefinicao` (`RelatorioExportService.ts:69-90`) cresce 1 case por relatório e o `TITULO_POR_TIPO` cresce 1 entrada — duas tabelas paralelas a manter.
- **Melhoria Proposta**
  > Substituir `switch` + `TITULO_POR_TIPO` por um único `REGISTRY: Record<RelatorioTipo, { titulo: string; build: (g: GestaoPermutasResponse) => RelatorioDefinicao }>` colocado próximo às projeções. `montarDefinicao` vira `REGISTRY[tipo].build(gestao)`. Tactic: **Defer Binding — polymorphism** + **Increase Semantic Coherence**.
- **Resultado Esperado**
  > Adicionar relatório = adicionar 1 entrada no registry BE (+ sincronização FE coberta pelo card modifiability-1).
- **Tactic alvo**: Defer Binding — polymorphism
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-2
- **Métricas de sucesso**:
  - Tabelas paralelas para "o que é um relatório" (BE): 2 (`switch` + `TITULO_POR_TIPO`) → 1 (`REGISTRY`)
  - Linhas tocadas para adicionar relatório novo no service: ~30 → ~10
- **Risco de não fazer**: Baixo até ~10 relatórios. Acima disso o `switch` fica visualmente pesado e o risco de esquecer um lugar cresce.
- **Dependências**: pode ser feito antes ou depois de modifiability-1; ortogonal.

### [modifiability-3] Consolidar rótulos humanos (BE aba/arquivo × FE label)

- **Problema**
  > BE tem `TITULO_POR_TIPO` (ASCII puro, usado em nome de aba e arquivo .xlsx) e FE tem `RELATORIOS_DISPONIVEIS[].label` (pt-BR com acento, usado no menu). São dois conjuntos de 6 strings com semântica acoplada — renomeação exige tocar os dois.
- **Melhoria Proposta**
  > Se o card modifiability-1 for via pacote compartilhado: incluir `{ tipo, label, slug }` no descritor único, com `label` pt-BR para UI e `slug` ASCII para nome de aba/arquivo. Tactic: **Defer Binding — configuration**.
- **Resultado Esperado**
  > Renomear "Quebra por cliente" → "Visão por cliente" toca 1 lugar.
- **Tactic alvo**: Defer Binding — configuration
- **Severidade**: P3
- **Esforço estimado**: S (≤1d, junto com modifiability-1)
- **Findings relacionados**: F-modifiability-3
- **Métricas de sucesso**:
  - Strings de rótulo: 12 (6 BE + 6 FE) → 6 (descritor único com `label`+`slug`)
- **Risco de não fazer**: Mínimo. Inconsistências cosméticas eventuais em xlsx vs UI (já existe: "Ja permutado" vs "Já permutado").
- **Dependências**: melhor casado com modifiability-1.

### [modifiability-4] Extrair política de largura de coluna (post-MVP)

- **Problema**
  > Larguras de coluna estão inline em ~60 literais em 4 projeções (`RelatorioExportService.ts:102-352`). Mudar política (ex.: padronizar coluna monetária = 20) exige caçar literais.
- **Melhoria Proposta**
  > Quando uma segunda mudança de largura aparecer, extrair `LARGURAS = { documento: 16, processo: 14, moeda: 8, valorMoeda: 18, valorBrl: 16, ... }` e referenciar nas colunas. Tactic: **Defer Binding — configuration**. **Adiar até segunda mudança** — extrair agora é overengineering.
- **Resultado Esperado**
  > Política de largura num único objeto.
- **Tactic alvo**: Defer Binding — configuration
- **Severidade**: P3
- **Esforço estimado**: S (≤1d, quando o trigger aparecer)
- **Findings relacionados**: F-modifiability-4
- **Métricas de sucesso**:
  - Literais `width:` em projeções: ~60 → ~30 (apenas overrides)
- **Risco de não fazer**: Nenhum hoje. Vira incômodo se o time mudar padrão de largura mais de uma vez.
- **Dependências**: aguardar segundo pedido de "ajustar coluna X em todos os relatórios".

## 6. Notas do agente

- Escopo: delta da feature `relatorios-export` (READ-ONLY). Não revisitei a hierarquia DDD geral nem o catálogo completo de services (objeto da run que avalia o estado-alvo do backend — não esta).
- Coesão do `RelatorioExportService` é genuinamente boa: projeção pura separada da serialização (testável sem ler bytes de xlsx), helpers extraídos, `defAdiantamentos` reusado para 3 tipos via filtro. 398 LOC está dentro do limite p95 do repo.
- Cross-QA: (a) **Testability** — a separação projeção/serialização é uma vitória de testability já capturada; (b) **Integrability** — o card modifiability-1 (`RelatorioTipo` shared) sobrepõe com qualquer iniciativa de contrato compartilhado FE↔BE; (c) **Deployability** — não há magic numbers de regra de negócio nesta feature (só constantes de formatação `LARGURA_PADRAO`/`MAX_NOME_ABA`, nomeadas), então não há "config-out-of-code" pendente aqui.
- Score 8/10: arquitetura modificável sólida com 1 débito real (drift FE↔BE) e 3 melhorias opcionais. Sem P0/P1.
