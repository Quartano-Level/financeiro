# Relacionamentos entre Entidades

> **Frente I — Permutas (Fatia 1, 2026-06-17, ADR-0004).** Primeiras relações do domínio.
> Atualizado pelo `OntologyCurator` a cada entidade/relação aceita.

## Frente I — Permutas

| Origem | Relação | Destino | Cardinalidade |
|--------|---------|---------|---------------|
| `Adiantamento` | vinculado por `priCod` a | `Invoice` | 1—1 nesta fatia (P0-6 RESOLVIDO: 1 invoice FINALIZADA); N:M → backlog (`composto-nm`, P0-5) |
| `Adiantamento` | tem declaração (Gate 4) | `DeclaracaoImportacao` | 1—1 (D.I XOR DUIMP, I2) |
| `PermutaCandidata` | tem lado-débito | `Adiantamento` | 1—1 |
| `PermutaCandidata` | tem lado-crédito (quando casada) | `Invoice` | 1—1 (casada = exatamente 1 invoice FINALIZADA, P0-6 RESOLVIDO) |
| `PermutaCandidata` | tem data-base via | `DeclaracaoImportacao` | 1—1 (existência/XOR ok; leitura da data-base gated em P0-4) |
| `PermutaCandidata` | tem cálculo derivado | `VariacaoCambial` | 1—1 (classificação por TAXA de câmbio, P0-1 RESOLVIDO) |

> **Fatia 2 (fora de escopo):** `PermutaCandidata` → consumada → `Permuta` (escrita `fin010`).
> Não modelada aqui (caminho de write-back no ERP não validado — ADR-0002/0003 O3).
