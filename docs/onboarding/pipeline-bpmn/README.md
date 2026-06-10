# Pipeline de Desenvolvimento — Diagramas BPMN (Onboarding)

> Material de onboarding. Diagramas **BPMN 2.0 com raias (swimlanes)** que mostram **como uma mudança
> de código nasce, é validada e vira PR** — e **qual agente faz o quê**, com os handoffs entre eles.
> Fonte normativa do pipe: `CLAUDE.md` (raiz) → seção "Development Pipeline" e os comandos em
> `.claude/commands/*.md`.

## Como ler um BPMN com raias

Cada arquivo é um **pool** (o processo inteiro) dividido em **raias horizontais (swimlanes)** — uma por
ator. **A ação fica dentro da raia de quem a executa**; o fluxo corre da esquerda → direita e as setas
**cruzam as raias** nos handoffs (ex.: o `Dev` dispara, a raia do `OfficeHoursInterviewer` conduz a
entrevista, e a seta sobe de volta para o `Dev` revisar). Mesma convenção do exemplo clássico
"Processo de Compra" (Colaborador / Fornecedor / Compra).

| Símbolo | Significado |
|---------|-------------|
| ○ círculo fino | **Início** do processo |
| ◎ círculo grosso (vermelho) | **Fim** do processo / parada |
| ▭ retângulo arredondado | **Tarefa** (ação de um ator) |
| ◇ losango | **Gateway** — decisão (segue 1 saída) |
| → seta cruzando raia | **Handoff** entre atores |

## Como abrir

Os arquivos são **BPMN 2.0 padrão** (`.bpmn`). Abra em qualquer um:

- **[demo.bpmn.io](https://demo.bpmn.io)** → ☰ → *Open BPMN diagram* (ou arraste o arquivo).
- **Camunda Modeler** (desktop) → *File → Open*.
- **draw.io / diagrams.net** → *Arquivo → Importar*.

> Não renderizam inline no GitHub (BPMN não é imagem) — por isso abra numa das ferramentas acima.
> Os diagramas são largos (fluxo horizontal); use zoom-to-fit ao abrir.

## Os 4 caminhos

Toda alteração entra por **um** destes pontos:

| # | Arquivo | Quando usar | Comando | Raias (atores) |
|---|---------|-------------|---------|----------------|
| 1 | [`01-feature-new.bpmn`](01-feature-new.bpmn) | Nova entidade / novo fluxo | `/feature-new <intent>` | Dev · OfficeHours · OntologyCurator · TaskScoper · AutoLoopRunner · Regis-Review |
| 2 | [`02-feature-tweak.bpmn`](02-feature-tweak.bpmn) | Mudar regra, corrigir bug, alterar entidade | `/feature-tweak <entity> "<intent>"` | Dev · CodebaseNavigator · OfficeHours · OntologyCurator · TaskScoper · AutoLoopRunner · Regis-Review |
| 3 | [`03-feature-tweak-urgent.bpmn`](03-feature-tweak-urgent.bpmn) | Hotfix de produção | `/feature-tweak --urgent <entity> "<intent>"` | Dev · CodebaseNavigator · AutoLoopRunner |
| 4 | [`04-investigate.bpmn`](04-investigate.bpmn) | Causa-raiz antes de corrigir | `/investigate <symptom>` | Dev/Investigador · CodebaseNavigator |

> O caminho 4 (`/investigate`) normalmente **alimenta** o caminho 2: bug que começa com `"fix: ..."`
> dispara a investigação **antes** de qualquer correção (visível como o gateway `intent 'fix:'?` no
> diagrama 02, que chama o protocolo do diagrama 04).

## Atores (raias) — o que cada um faz

| Ator / raia | Papel no pipe |
|-------------|---------------|
| **Dev / Yuri (Humano)** | Dispara o comando, cria o worktree, revisa/aprova diffs, responde gaps, resolve conflitos de rebase, faz bump+PR |
| `CodebaseNavigator` | Localiza entidade/regra e arquivos via `ontology/_index.json` |
| `OfficeHoursInterviewer` | Entrevista socrática (profunda no `new`, cirúrgica no `tweak`) |
| `OntologyCurator` | Propõe diff em `ontology/`, atualiza `integrations/*.md`, ADRs |
| `TaskScoper` | Spec → `tasks.md` com acceptance criteria |
| `AutoLoopRunner` | Loop TDD → impl → typecheck → lint → test → PatternGuardian → verde; sub-loop P0 |
| `Regis-Review` (8× `qa-*` + consolidador) | Review de arquitetura pós-verde; só **P0** re-entra no loop |

## Invariantes do pipe (valem em todos os caminhos)

1. **Worktree-first** — `/feature-new` e `/feature-tweak` rodam em git worktree dedicado
   (`C:/tmp/<slug>-wt`), nunca no checkout principal (regra #10).
2. **Regis-Review obrigatório** após o verde — só **P0 (crítico)** é remediado no loop; P1/P2/P3 viram
   follow-ups no inbox. Opt-out só com `--no-regis-review` / `--urgent`.
3. **Rebase da base antes do PR** — conflito não-trivial **pausa para o Yuri** (regra #12).
4. **Bump de versão** (FE+BE lockstep) se o delta tem `feat`/`fix`/`perf` → `chore(release): vX.Y.Z`.

## Simplificações deliberadas (para o pool não poluir)

Os diagramas focam o caminho principal. Ficam **descritos aqui**, mas **fora do desenho**:

- **`--shotgun` / DesignConsultant** (2-3 direções criativas para telas de UI) — sub-path opcional do
  `/feature-new`, antes do TaskScoper.
- **Gate QaCoach / `--high-risk` `/pair-review`** — human-in-the-loop opcional antes do PR quando a
  feature adiciona handler/job/UI novos.
- **InfoGapBroker no `/feature-tweak`** — pode pausar o AutoLoopRunner numa pergunta P0 (igual ao
  `/feature-new`, onde está desenhado como `InfoGapBroker P0?` → responder gap → resume).
- **`p0loop` (sub-loop P0)** — aparece como **uma** tarefa na raia do AutoLoopRunner; na prática é um
  mini-ciclo OfficeHours → Ontology (se a regra mudar) → TaskScoper → AutoLoop, no mesmo worktree, que
  **não** dispara novo Regis-Review (anti-recursão).
