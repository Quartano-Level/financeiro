# RESOLVIDO — Permuta de invoice com MÚLTIPLOS TÍTULOS (parcelas)

> **Status:** ✅ RESOLVIDO (2026-06-26) — **Opção A** (baixar TODOS os títulos). Decisão Yuri + HAR de
> baixa manual multi-título (4120, parcelas 1 e 2). Implementado em `ReconciliacaoPermutaService`
> (`executarBaixa` itera os títulos via `listTitulosAPagar` e chama `baixarTitulo` por parcela, no MESMO
> borderô, distribuindo o valor; variação cambial rateada; `buildFinalPayload` ganhou `titCod`). Invoice
> de título único = loop de 1 (comportamento idêntico). Teste novo cobre 2 títulos. v0.9.0.
> **Aberto em:** 2026-06-26 · **Origem:** investigação do erro anti-drift na baixa da invoice 4120 (adto 4061).

## Sintoma

Ao baixar uma permuta múltipla/cross, a invoice recebe `error` com:

```
anti-drift: baixa 117237.36 (BRL) > em-aberto do ERP 116159.22
(alocado 22313.5 × taxa 5.2541) — alocação maior que o saldo vivo da invoice; conferir manualmente
```

O anti-drift está **correto** — é uma over-alocação real, NÃO é variação cambial nem snapshot defasado.

## Causa raiz (confirmada)

A invoice (documento) pode ter **N títulos / parcelas** no Financeiro a Pagar (`com308`). Ex.: invoice 4120:

| Título | Número | Valor (BRL) | Moeda negociada |
|---|---|---|---|
| 1 | `0016EGPMONOFÁSI1` | 116.159,22 | 22.108,30 USD × 5,2541 (tem variação cambial) |
| 2 | `0016EGPMONOFÁSI2` | 1.078,14 | — (só BRL, sem variação cambial) |
| **Total** | | **117.237,36** | |

- `AlocacaoPermutasService.somaValorNegociado` **soma TODOS os títulos** → `valorMoedaNegociada = 22.313,5 USD`
  (22.108,30 + 205,2). É o valor que a UI deixa alocar (inclusive o "Máx").
- `ReconciliacaoPermutaService` baixa com **`titCod: 1` HARDCODED** (4 ocorrências: ~linhas 254, 313, 401, 467)
  → só baixa o **título 1** (`bxaMnyValor` = 116.159,22).
- Logo, alocamos a soma (117.237,36) contra o título 1 (116.159,22). A diferença = **exatamente o título 2
  (1.078,14)** → anti-drift aborta. (Invoice de título único — ex.: 4117 — passa normal.)

## Decisão de domínio pendente (precisa do time)

Quando a invoice tem múltiplos títulos, a permuta deve:

- **(A) baixar TODOS os títulos** (a permuta quita a invoice inteira) → fix: iterar `titCod` (1..N) e baixar
  cada título contra o seu próprio `bxaMnyValor`; a alocação (soma) fica correta.
- **(B) baixar só o(s) título(s) com moeda negociada / variação cambial** (título 1; o título 2 BRL é pago à
  parte) → fix: `valorMoedaNegociada` / "Máx" / alocação refletem só o(s) título(s) permutável(eis) (22.108,30).

Hipótese atual (não confirmada): **B** — só o título 1 aparece na aba *Variação Cambial* do ERP; o título 2
parece um título BRL à parte.

## Arquivos a tocar quando definido

- `src/backend/domain/service/permutas/AlocacaoPermutasService.ts` — `somaValorNegociado` /
  `buscarInvoices` (valor permutável por título).
- `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts` — `titCod` hardcoded (iterar títulos
  ou escolher o permutável).
- Front (modal de Alocar): exibir/capar pelo valor permutável correto.
- Caminho de **escrita gated no ERP** → validar em homolog; considerar `--high-risk` / pair-review.

## Não relacionado (já resolvido / descartado)

- NÃO é staleness do snapshot (o em-aberto do ERP = 117.237,36, igual ao nosso).
- NÃO é o fix do PR #16 (partial-baixa / abas) — esse é ortogonal e segue válido.
- Descartado: afrouxar a tolerância do anti-drift (mascararia esta over-alocação real).
