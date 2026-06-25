# Feature: Relatórios — exportação Excel (.xlsx) do painel de Permutas

**Slug:** `relatorios-export` · **Branch:** `feat/relatorios-export` · **Base:** `main`
**entity_changed:** `false` (projeção READ-ONLY de entidades existentes — sem nova entidade,
estado ou invariante; nenhum diff de ontologia exigido). Definições dos relatórios documentadas
como referência em `ontology/reference/relatorios.md`.

## Intenção

Permitir que o time exporte os KPIs do painel de Permutas para planilhas Excel, no nível de
detalhe de cada documento. Além dos 4 KPIs, dois relatórios analíticos derivados.

## Decisões (entrevista 2026-06-25)

- **Empacotamento:** um botão por KPI/relatório → cada um gera seu próprio arquivo `.xlsx`.
- **Escopo:** sempre o snapshot completo (ignora filtros da tela). O export reusa
  `GestaoPermutasService.exporGestao()`, então o conteúdo casa 1:1 com o que o painel mostra.
- **Acesso:** mesma faixa de `/gestao` (auth global, sem `requireRole`) — analistas exportam o
  que veem. Dados sensíveis (importador/valores) já são visíveis em `/gestao`.

## Relatórios (6)

| tipo (slug) | Fonte | Grão | Colunas-chave |
|---|---|---|---|
| `adiantamentos` | `gestao.pendentes` (todos) | 1 linha / adiantamento | docCod, filial, processo, referência, exportador, importador, status, motivoBloqueio, tipoPermuta, valorMoedaNegociada, moeda, valorBrl, diasEmAberto, pago, dataEmissao, valorPermutar, valorTotal, valorAberto, D.I/DUIMP + dataBase, taxaAdto, taxaInvoice, variação (classif./resultado/delta), autoElegivel, saldoRestante |
| `invoices` | `gestao.invoicesEmAberto` | 1 linha / invoice | docCod, filial, processo, dataEmissao, referência, exportador, importador, valorMoedaNegociada, moeda, valorBrl, taxa |
| `ja-permutado` | `pendentes` filtrados `status==='ja-permutado'` | 1 linha / adiantamento | mesmas colunas de `adiantamentos` |
| `bloqueadas` | `pendentes` filtrados `status==='bloqueada'` | 1 linha / adiantamento | mesmas colunas de `adiantamentos` (motivoBloqueio em destaque) |
| `reconciliacao-processo` | agregação por `priCod` | 1 linha / processo | processo, importador, #adtos, #invoices, cardinalidade, saldoNeg USD, Σ invoices USD, % alocado/cobertura, #elegiveis/#bloqueadas/#manual, aging médio/máx |
| `clientes` | agregação por importador/`pesCod` | 1 linha / cliente | importador, pesCod, #adtos, #invoices, valor adtos BRL/USD, valor invoices USD, #bloqueadas, #elegiveis, #permuta-manual, aging médio |

## Tarefas + Acceptance Criteria

1. **`RelatorioExportService`** (`domain/service/permutas/RelatorioExportService.ts`)
   - `@injectable()`, injeta `GestaoPermutasService` + `LogService`; métodos arrow; modificadores explícitos.
   - `exportar(tipo, requestId): Promise<{ filename; buffer }>` — chama `exporGestao` 1×, despacha por tipo.
   - Projeção pura (`RelatorioDefinicao = { titulo; colunas[]; linhas[] }`) separada da serialização exceljs (testável sem ler bytes).
   - Serializa com `exceljs` (1 aba, header em negrito, colunas com largura). Filename `permutas-<tipo>-<data-ingestao>.xlsx`.
   - **AC:** cada tipo retorna colunas/linhas corretos; contagens batem com os filtros de `pendentes`; buffer relê em exceljs com a aba e o header esperados.

2. **Rota** `GET /permutas/relatorios/:tipo` (`routes/permutas.ts`)
   - Zod enum no `:tipo` (400 em valor inválido). Headers `Content-Type` xlsx + `Content-Disposition: attachment; filename="…"`. `res.send(buffer)`.
   - **AC:** 200 com content-type xlsx + filename; 400 em tipo inválido; 401 sem auth (middleware global).

3. **Testes backend** — `RelatorioExportService.test.ts` (projeções + buffer) mantendo o piso de cobertura de `domain/service/`; casos de rota em `permutas.test.ts`.

4. **Frontend** — `api.ts` `exportarRelatorio(tipo)` (fetch com auth → blob → download, filename do header); `types.ts` `RelatorioTipo` + descritores; `page.tsx` popover "Exportar" no header com 6 itens (loading por item + `toast` no erro).
   - **AC:** clicar baixa o `.xlsx`; erro vira toast; DesignSystemReviewer verde.

5. **Gates** — typecheck/lint/test (BE+FE) verdes; PatternGuardian (BE); DesignSystemReviewer (FE); Regis-Review (remedia só P0); bump de versão (feat) + PR.

## Definition of Done
- 6 relatórios exportam `.xlsx` com detalhe; gates verdes; Regis-Review rodado (P0 zerado);
  versão bumpada (FE==BE) e PR aberto após rebase de `main`.
