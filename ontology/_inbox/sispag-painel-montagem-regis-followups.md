# SISPAG Painel+Montagem (Fatia 1+2) — follow-ups dos revisores

> Findings **não-P0** dos gates PatternGuardian + DesignSystemReviewer (branch `feat/sispag-painel-montagem`,
> 2026-07-07). Os 2 blocking legítimos já foram corrigidos (msg de erro EN em `routes/sispag.ts`;
> `text-[10px]`→`text-xs`). O resto vira ticket. Fonte: reviews inline (não persistidos como REPORT).

## PatternGuardian
| id | prio | finding | origem | nota |
|----|------|---------|--------|------|
| pg-null-dtos | P3 | Sugeriu `?: T \| null` nos DTOs de `SispagInterface.ts` | interface | **Recusado (by design):** os mappers do repo/client convertem `null → undefined` na fronteira; o DTO é pós-mapeamento, então `?: T` é correto e alinhado ao CLAUDE.md ("Optional: `property?: Type`"). Não churnar. |
| pg-pt-fields | P3 | Campos PT nos DTOs (`credor`/`valor`/`vencimento`…) | interface | Permitido pelo CLAUDE.md (campos que espelham domínio/DB podem ser PT). Alinha com Permutas. Sem ação. |

## DesignSystemReviewer
| id | prio | finding | arquivo | nota |
|----|------|---------|---------|------|
| ds-deeplink-filtro | P2 | `filtro` (a-vencer/vencidos/todos) só em state local — deveria ir p/ URL (deep-link) | `app/sispag/page.tsx` | Nicety de MVP; migrar p/ `useUrlState` quando houver o hook. |
| ds-notify | P2 | `toast.*` nas mutações deveria ser `notify()` (NotificationCenter) | `page.tsx` | `notify()` **não existe** no codebase ainda; Permutas também usa `toast`. Migrar quando `notify()` existir. |
| ds-datetime | P3 | `new Date(...).toLocaleString('pt-BR')` deveria usar `DateFormatter` | `page.tsx` | `DateFormatter` de `@/shared/lib/datetime` (verificar se existe). Consistência de timezone. |
| ds-disabled-tooltip | P3 | Botões `disabled` sem tooltip explicando o porquê | `page.tsx` | Convenção feedback.md; adicionar `Tooltip` nos "Criar lote"/"Finalizar" desabilitados. |
| ds-datatable | P3 | Tabela de títulos manual em vez de `DataTable` | `page.tsx` | Trade-off consciente de MVP; migrar p/ `DataTable.Client` (sort/filtro/paginação server) numa evolução. |
| ds-kpi-filtro | P3 | KPIs não clicáveis (padrão "KPI→filtra tabela") | `page.tsx` | Evolução de UX; clicar "A vencer 7d" poderia setar filtro. |
| ds-icon-aria | P3 | Ícones decorativos sem `aria-hidden`; Lock informativo sem `aria-label` | `page.tsx` | A11y menor; adicionar `aria-hidden`/`aria-label`. |

> **Confirmado pelos gates:** I1 (read-only ao Conexos) 100%; DDD/tsyringe/SQL-param/concorrência (I3 advisory-lock+tx, I6 optimistic) OK; design-system 85% (sem violação estrutural). Nenhum P0 aqui.

## Regis-Review completo (8 QA agents) — run `docs/regis-review/2026-07-07-1841-sispag-painel-montagem/`

Overall **6.47/10**. **3 P0 remediados nesta feature** (cobertura de testes 77.72%→89.29%;
`BoundedConcurrency` no fan-out do painel; bump 0.12.0) + 1 P1 relacionado (pool-hold no include).
**P1/P2/P3 → ver `KANBAN.md` do run** (não repico aqui). Destaques P1 pendentes: batch-include,
reads sem retry, painel parcial-silencioso, `catch{}` mudo, loop multi-título não-atômico, audit
persistida, split `page.tsx`, testes de rota. **Bombas da Fatia 3** (viram P0 na escrita): I3 sem
constraint DB, audit persistida (SOX), Idempotency-Key, redação de PII. Ver `REPORT.md`/`KANBAN.md`.
