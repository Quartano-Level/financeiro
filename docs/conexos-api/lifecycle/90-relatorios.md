# Fase 90 — Relatórios / Pesquisas transversais (`psq*`) ✅ (psq015 confirmado)

**Narrativa.** Os controllers `psq*` são as **consultas/relatórios** que cruzam o domínio (financeiro,
títulos, adiantamentos) — usados pelo backend do `columbia-calc-encargos`/`columbia-expense-analysis`.

> **Roteabilidade:** a maioria dos `psq*` **não abre por URL direta** (`/psq012` → 404). São acessados por um
> **menu de relatórios/pesquisas** dentro do contexto. A exceção verificada é [`psq015`](../screens/psq015.md),
> que abre standalone. Ao mapear, prefira navegar pelo menu ou confirmar via `permissoes/new/<ctrl>`.

| Controller | Paths | Uso conhecido |
|---|---|---|
| `psq015` | 11 | **Documentos a Receber / Títulos** (`/list`, `/documento/list`, `baixasTitulo`) — juros perdidos, datas de baixa |
| `psq014` | 15 | Títulos a receber / adiantamentos (`/list`, `documento/list`, `dadosBancarios/list`) — usado no Rel. Adiantamento; ⚠️ ignora filtro server-side (ver memória) |
| `psq017` | 27 | Catálogo de produtos / OPEX (`listCatalogoProduto/...`) |
| `psq026` | 4 | Remessas por tela (`{telaOrigin}/remessa/list`) |
| `psq012` | 2 | Agendamentos |
| `psq031` | 1 | `/list` |

**Padrão:** todos POST `…/list` com `CnxListRequest`. ⬜ capturar telas ao vivo e mapear colunas↔campos
por relatório (psq015/psq014 primeiro, por serem os que o app já consome).

### `psq015` — tela confirmada ao vivo: "Pesquisa de Documentos a Receber"
Filtros: Exibir Renegociados (NÃO), Vencimento de / Data Vencimento até, Nome da Pessoa, Situação Documento
(FINALIZADO), Previsão (NÃO). Grid: Operação, Filial, **Processo**, Ref. Externa, Cód. Documento, Vencimento,
Cód./Nome da Pessoa, Unidade de Negócio, **Valor Título**, **Valor Juros do Título**, Valor Desconto, … +
**TOTALIZADOR**. (Renderer lento ao carregar — colunas extras à direita a confirmar em iteração futura.)

### Cotação de moeda — [`cmn156`](../screens/cmn156.md) "PTAX" (transversal)
Cadastro de **índices/moedas e cotações** (`POST /api/cmn156/list`; rota de cotação por moeda — ver memória
`conexos-cmn156-cotacao`: `indEspIdent===moeCodMneg`, `intFltVenda`). É a **fonte de cotação cambial** que os
relatórios e a Calculadora de Variação Cambial cruzam com a taxa de fechamento do contrato de câmbio
([`imp059`](../screens/imp059.md), fase 10/70). Cotação global (sem `filCod`); filtro de data `intDtaData#LE`.

**Ligações.** Transversais — leem dados das fases 30–70 (processo, títulos, baixas) para relatórios e para
os apps de Encargos/Variação Cambial/Adiantamento.
