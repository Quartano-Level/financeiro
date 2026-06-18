# Regis-Review follow-ups — fix: moeda NEGOCIADA na coluna "Valor Moeda Negociada" (Gestão de Permutas)

Gate: Regis-Review `--quick` (modifiability), escopado ao delta do fix. **Nenhum P0** —
não re-entra no AutoLoop. P2/P3 registrados aqui (não implementados neste fix).

Contexto: o fix plumba `moedaNegociada` (sigla da moeda negociada do título `com308`,
220→USD / `moedaNome`) ponta-a-ponta para que a coluna rotule "1.100,00 USD" em vez de "BRL".

## P2 — refatorar quando EUR/GBP ou uma 4ª superfície de UI aparecer

- **F1 — `siglaMoedaNegociada` mora em `ConexosClient.ts`** mas é uma função pura de
  formatação (sem I/O). `EleicaoPermutasService` a importa do client (acopla serviço à
  superfície do client). Mover para `domain/libs/` ou um `MoedaCatalog`/`MoedaService`.
- **F2 — `MOEDA_COD_SIGLA` é const privada sem dono único nem plug-point.** Adicionar
  EUR/GBP exige editar o client. Defer-binding miss (ok para v0.5 USD/BRL).
- **F3 — fallback `'BRL'` dentro de `siglaMoedaNegociada` curto-circuita a cadeia do
  caller.** Quando o título existe mas não traz `moedaCod`/`moedaNome`, o helper devolve
  `'BRL'`, então o `?? adto.moeda` do caller nunca roda. Empiricamente as linhas elegíveis
  do `com308` populam ao menos `moedaNome`, mas a precondição é frágil. Opção: devolver
  `undefined` nesse ramo e deixar o caller escolher. (Comportamento atual é o **especificado**
  no fix — `moedaNome ?? 'BRL'`; mudar é decisão de produto, não bug travante.)
- **F4 — hidratação de `moedaNegociada` mora dentro de `computeVariacao`** (nome é do
  cálculo cambial). Extrair `hydrateTituloMoeda(adto, invoice, filCod)` — ambos chamam
  `listTitulosAPagar`, então o caller ainda paraleliza.
- **F6 — cadeia `moedaNegociada ?? moeda ?? 'USD'` duplicada em 3 sítios do
  `GestaoPermutasService`** (`toPendente`, `toInvoiceEmAberto`, `toCasamentos`). Extrair
  `pickMoedaLabel({ moedaNegociada?, moeda? })`.
- **F8 — dois defaults competindo** para "moeda desconhecida": `'USD'` (Gestao ×4) e
  `'BRL'` (helper). Centralizar `DEFAULT_MOEDA_NEGOCIADA = 'USD'`.

## P3 — polish / defer-binding

- **F5 — bloco de hidratação em `buildCandidata`** repete ~30 linhas (adto vs invoice).
  Helper `mergeMoedaFields(target, valor, moeda)`.
- **F7 — `casamentoMoeda(c)` chamado 2× na mesma linha** (`IngestaoPermutasService` L303).
  Cachear num const.
- **F9 — migration 0006 `moeda_negociada TEXT` sem CHECK/normalização.** Se `moedaNome`
  literal ("DOLAR DOS EUA") vazar pelo fallback, a UI renderiza o nome longo. Normalizar
  `moedaNome` → sigla ISO no `MoedaCatalog` (mesma raiz de F2/F3).
- **F10 — `siglaMoedaNegociada` é `export const`** consumida direto por um `@injectable()`,
  inconsistente com o grafo DI. Defensável (helper puro).
- **F11 — 1 campo conceitual tocou 7 arquivos + migration.** Intrínseco à camada; um value
  object `TituloMoedaContext { moedaCod, moedaNome, moedaNegociada, valorNegociado }`
  amortizaria adições futuras de campos do `com308`.

## Recomendação consolidada

Um único follow-up — **extrair `MoedaCatalog` + `pickMoedaLabel`** — resolve F1, F2, F3,
F6, F8 de uma vez. Cross-QA: F1/F2 ↔ Integrability; F8 ↔ Deployability; F4/F5 ↔ Testability.
