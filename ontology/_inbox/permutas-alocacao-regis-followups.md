# Regis-Review — Permutas `alocacao` N:M cross-process (Fase 2, ADR-0008) — DISPENSADO (adiado)

**Branch:** `feat/permutas-multiplas` · **Data:** 2026-06-20 · **App:** v0.3.0 · **Ontologia:** v0.2.6

## Status do gate

Gate **Regis-Review (8-QA) adiado** (opt-out; `/plan` por fase). READ-ONLY no ERP (I4 intocado; baixa em
`fin010` é a Fase 3). Passou nas revisões direcionadas:

- **PatternGuardian:** mensagens técnicas de `Error` corrigidas para inglês (Rule X7); `userMessage` em
  pt-BR mantido (é o contrato do `HandlerError`). SQL parametrizado, DI, modifiers ok.
- **DesignSystemReviewer:** aria-label (input processo + Select) e aria-busy (Buscar/Adicionar) adicionados.
  `notify()` NÃO aplicável — não existe no repo; o padrão é `toast` (14 usos). Tokens ok.

## Pendência

`/regis-review --quick` antes do merge para `main`. Diretórios:
`src/backend/{domain/errors,domain/repository/permutas,domain/service/permutas,routes,migrations}`,
`src/frontend/{app/permutas,lib}`.

## Foco do reviewer (hipóteses)
- **Performance:** `buscarInvoices` faz fan-out por filial (listFiliais × listFinanceiroAPagar) e, por
  invoice, **getDetalheTitulos (filtro em-aberto) + listTitulosAPagar (valor/taxa)** = 2 detalhes/invoice.
  CORREÇÃO 2026-06-21: o filtro "em aberto" passou a usar o DETALHE (`getDetalheTitulos.pago`) porque o
  `pago`/`aberto` da LISTA vem null/inconfiável (mesmo problema do gate-3) — antes a busca mostrava
  invoices já liquidadas como permutáveis. Mais pesado (sob demanda, 1 processo); avaliar cache/timeout.
- **Fault-tolerance:** o saldo é re-validado no alocar, mas o write-back (Fase 3) precisará de lock/idempotência.
- **Concorrência:** dois analistas alocando a mesma invoice — a soma é checada na hora, mas sem lock; aceitável
  no rascunho (Fase 3 trava na execução).

## Delta entregue (Fase 2)
- BE: `permuta_alocacao` (migration 0014) + `PermutaAlocacaoRepository` + `AlocacaoPermutasService`
  (buscar/alocar/remover) + `AlocacaoSaldoError` (422) + rotas (`/invoices/buscar`, POST/DELETE
  `/alocacoes`) + `GestaoPermutasService` (alocacoes/saldoRestante).
- FE: modal de alocação + ação "Alocar invoice" nas linhas permuta-manual; api + types.

## Próxima fase
- **Fase 3:** write-back `fin010` (executar a permuta no ERP a partir das alocações) — risco arquitetural #1.
  `/feature-new` próprio com probe em dev tenant, idempotência, rollback, QaCoach/pair-review.
