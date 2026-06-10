# Template — Seção por Quality Attribute

Toda saída de agent QA **deve** seguir este schema. O `qa-consolidator` depende desta estrutura para costurar o REPORT.md e o KANBAN.md sem ambiguidade.

Salvar em: `docs/regis-review/{run-id}/{qa-slug}.md`
- `{run-id}`: timestamp `YYYY-MM-DD-HHMM` definido pelo slash command `/regis-review`
- `{qa-slug}`: `availability` | `deployability` | `integrability` | `modifiability` | `performance` | `fault-tolerance` | `security` | `testability`

---

```markdown
---
qa: <Nome do Quality Attribute>
qa_slug: <slug>
run_id: <YYYY-MM-DD-HHMM>
agent: qa-<slug>
generated_at: <ISO-8601>
scope: <all | backend | frontend | infra>
score: <0-10>            # nota geral do QA, autoavaliada com base em métricas + tactics
findings_count: <N>
cards_count: <N>
---

# <QA> — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

Tabela canônica das 6 colunas de Bass & Clements:

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| <quem origina> | <evento que estressa o QA> | <parte do sistema afetada> | <estado operacional> | <comportamento esperado> | <métrica de sucesso> |

Exemplo (não copiar literalmente — adaptar à realidade do nf-projects):
> "Pico de 5k mensagens SQS na fila accounting durante fechamento mensal → API Conexos retorna 503 → sistema deve reter as mensagens, retentar com backoff e marcar PENDING após N falhas → 0% de NFs perdidas, MTTR < 15min."

## 2. Métricas observadas

Cada métrica precisa de **valor coletado**, **alvo** (defendível por benchmark/literatura), **status** (✅ / ⚠️ / ❌) e **fonte** (comando ou arquivo que produziu o número).

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| <nome> | <valor> | <alvo> | <status> | <comando ou path> |

Se uma métrica não puder ser medida com os comandos disponíveis localmente, declarar explicitamente:
> ⚠️ **Não medível localmente**: <métrica>. Requer <CloudWatch / produção / ferramenta X>. Recomendação: <como instrumentar>.

## 3. Tactics — Cobertura no nf-projects

Mapa completo das tactics do Bass para este QA. Para cada uma:

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| <nome da tactic> | <o que existe no repo, ou "ausente"> | ✅ presente / ⚠️ parcial / ❌ ausente | <file:line ou comando> |

Não pular tactics. Se uma tactic é genuinamente irrelevante para o contexto, marcar `N/A` com **justificativa de uma linha**.

## 4. Findings (achados)

Cada finding é uma evidência objetiva de que uma tactic está ausente, mal implementada ou degradada. Findings são insumo para os Cards Kanban — **todo card vem de pelo menos um finding**.

### F-<slug>-<N>: <título curto e específico>

- **Severidade**: P0 (crítico — risco de incidente em produção) | P1 (alto — degrada QA mensurável) | P2 (médio — débito técnico defensável) | P3 (baixo — melhoria opcional)
- **Tactic violada**: <nome da tactic Bass>
- **Localização**: `path/to/file.ts:LN-LN` (ou múltiplos paths)
- **Evidência (objetiva)**:
  ```
  <trecho de código, output de comando, ou métrica>
  ```
- **Impacto técnico**: <o que pode quebrar, em que cenário>
- **Impacto de negócio**: <perda de receita, SLA, compliance, retrabalho — em linguagem de stakeholder técnico+>
- **Métrica de baseline**: <valor atual da métrica que demonstra o problema>

Numerar sequencialmente por QA: `F-availability-1`, `F-availability-2`, etc.

## 5. Cards Kanban

Um card por melhoria acionável. Cada card **deve** ser derivável diretamente para um ticket de Kanban (Linear, Jira, GitHub Projects, etc.) sem retrabalho.

### [<slug>-<N>] <título imperativo curto>

- **Problema**
  > 1–3 frases descrevendo o problema observado, o impacto e o cenário onde ele se manifesta. Linguagem técnica, evidência embutida.

- **Melhoria Proposta**
  > Ação concreta. Mencionar tactic Bass alvo. Listar arquivos/módulos a tocar quando óbvio. Não prescrever solução genérica — adaptar ao stack do nf-projects.

- **Resultado Esperado**
  > Estado do sistema após implementação. Incluir métrica observável (valor atual → valor alvo).

- **Tactic alvo**: <Bass tactic>
- **Severidade**: P0 / P1 / P2 / P3
- **Esforço estimado**: S (≤1d) | M (2–5d) | L (1–2sem) | XL (>2sem)
- **Findings relacionados**: F-<slug>-N, F-<slug>-M
- **Métricas de sucesso**:
  - <métrica observável 1>: <valor atual> → <valor alvo>
  - <métrica observável 2>: ...
- **Risco de não fazer**: <consequência concreta se ignorado por 6 meses>
- **Dependências**: <outros cards/decisões que precisam vir antes, se houver>

Numerar sequencialmente por QA: `availability-1`, `availability-2`, etc. Nome do card é estável e referenciável.

## 6. Notas do agente

Espaço livre (≤ 5 linhas) para o agent registrar:
- Decisões de escopo que tomou
- Métricas que tentou coletar e falharam (e por quê)
- Conexões cross-QA detectadas (alertar o consolidator)
```

---

## Regras invioláveis do schema

1. **Frontmatter obrigatório** — `qa-consolidator` parseia o frontmatter para construir o scorecard.
2. **Nada de prosa solta fora das seções numeradas** — exceto a seção 6 (Notas).
3. **Findings → Cards** — todo card referencia ≥1 finding em `Findings relacionados`. Findings sem card associado devem ter justificativa explícita.
4. **Métricas não-medíveis** declaradas explicitamente, nunca omitidas.
5. **Tactic name = nome canônico Bass & Clements** (em inglês), não traduzir.
6. **Cards são em pt-BR** — vão para reunião e Kanban do time.
7. **Severidade P0/P1 exige métrica de baseline** numérica no finding correspondente. P0 sem número é palpite — rejeitar e rebaixar para P2.
