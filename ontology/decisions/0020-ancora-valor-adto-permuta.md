# ADR-0020 — Âncora no valor real do adiantamento na baixa/permuta (anti-resíduo de centavos)

- **Status:** Accepted
- **Data:** 2026-07-17
- **Contexto:** Permutas — Fase 3 (escrita `fin010`). Ver `business-rules/fin010-write-contract.md`
  (I-Write-6), ADR-0013 (write-back fin010).

## Contexto / problema

Na baixa/permuta de um adiantamento contra uma invoice, a variação cambial é calculada por
`USD × (taxaAdiantamento − taxaInvoice)`. A `taxa` no Conexos é arredondada a **3 casas decimais**, então
`USD × taxa` **não reproduz** o valor BRL real do adiantamento — sobra um resíduo de centavos que fica
"à permutar" no adiantamento, mesmo quando a intenção é consumi-lo por inteiro.

**Caso real (borderô 15593, filial 2):** adto 17287 (VE STAAL EOOD) → invoice 18771, 81.667,58 USD.

| Grandeza | Valor (BRL) |
|---|---|
| `bxaMnyValor` (invoice = `81.667,58 × 5,0007`) | 408.395,07 |
| juros por taxa (`81.667,58 × (5,158 − 5,0007)`) | 12.846,31 |
| líquido = valor + juros | 421.241,38 |
| `bxaMnyValorPermuta` (valor REAL do adto no ERP) | **421.241,43** |
| **resíduo "à permutar"** | **0,05** |

A variação cambial **real** é `421.241,43 − 408.395,07 = 12.846,36` — a diferença de 0,05 é puramente o
arredondamento da taxa a 3 casas. Em valores maiores o desvio escala (~`USD × 0,001`).

## Decisão

Quando a baixa **consome o adiantamento por inteiro** (`valorAlocado ≥ saldoAdtoNeg`) **e a invoice é de
título único**, ancorar o líquido no valor real do adto do ERP (`bxaMnyValorPermuta`, passo 3 do
handshake): a diferença `bxaMnyValorPermuta − (bxaMnyValor + juros − desconto)` é absorvida na **conta de
variação cambial já em uso** (131 juros / 130 desconto) — que é exatamente onde a variação real deve ser
lançada. Resultado: resíduo zero no adiantamento e variação contabilmente exata.

**Guarda de sanidade — teto ABSOLUTO (`|resíduo| ≤ R$1,00`):** o resíduo de rate-rounding é
`USD × |taxaReal − taxaExibida|`, que **escala com o USD** e, num adiantamento grande, fica
numericamente indistinguível de um saldo deliberado pequeno. Por isso o teto é **fixo** (não
proporcional): um teto tipo `USD × 0,001` absorveria um saldo real (ex.: ~R$40 num adto de R$421k) como
variação fictícia. Com teto fixo, só resíduo de centavos é absorvido; resíduo maior — arredondamento
grande raro OU saldo real — **não** é ancorado (loga `BUSINESS_WARN` para conferência manual).
Consequência aceita: permutas grandes com arredondamento de taxa perto do pior caso (resíduo > R$1)
mantêm o resíduo — preferível a mascarar um saldo real.

**Fora do escopo (mantêm o rateio por taxa):** perna **parcial** N:M (o saldo remanescente do adto é
legítimo) e invoice **multi-título** em full-consume (follow-up — o resíduo cruza títulos).

## Alternativas consideradas

1. **Corrigir só os casos já executados** (data fix) — rejeitado: novos casos continuariam surgindo.
2. **Sempre calcular a variação como `adto_real − invoice`** (ancorar em toda permuta) — rejeitado:
   `bxaMnyValorPermuta` é o valor CHEIO do adto; numa perna parcial isso jogaria variação demais na conta.
   A âncora só é correta quando o adto é consumido por inteiro.
3. **Âncora no full-consume (escolhida)** — corrige a causa-raiz (câmbio a 3 casas) exatamente onde ela se
   manifesta, preserva o rateio nas pernas parciais, e a guarda de tolerância impede mascarar divergências.

## Consequências

- Baixas 1:1 de título único (a maioria) passam a fechar sem resíduo no adiantamento.
- `bxaMnyJuros`/`bxaMnyDesconto` da baixa ancorada mudam em centavos vs. o cálculo por taxa (é a correção).
- Novo invariante **I-Write-6** no contrato de escrita; implementação em
  `ReconciliacaoPermutaService.ancorarVariacaoNoAdto` (+ `saldoNegDoAdto` gate).
- Regressão coberta em `ReconciliacaoPermutaService.test.ts` (full-consume ancora; parcial não ancora).
