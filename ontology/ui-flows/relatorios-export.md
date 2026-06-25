# UI Flow — Relatórios (exportação Excel do painel de Permutas)

> **Tipo:** fluxo de UI READ-ONLY (projeção). Não introduz entidade, estado ou invariante
> (`entity_changed=false`). Cada relatório é uma projeção do payload de `GET /permutas/gestao`.
> Vigência: 2026-06-25 (feature `relatorios-export`).

## Gatilho
Botão **Exportar** no header do painel de Permutas (`/permutas`) → popover com um item por
relatório. Um clique baixa o `.xlsx` daquele relatório (snapshot completo, sem aplicar os filtros
de tela — filial/busca/status são ignorados de propósito).

## Caminho
```
Botão "Exportar" (popover)
  → exportarRelatorio(tipo)                       [frontend/lib/api.ts]
  → GET /permutas/relatorios/:tipo                [backend/routes/permutas.ts] (auth global, = /gestao)
  → RelatorioExportService.exportar(tipo)         [backend/domain/service/permutas]
      → GestaoPermutasService.exporGestao()       (1 leitura — mesma fonte do painel)
      → montarDefinicao(tipo, gestao)             (projeção pura → colunas + linhas)
      → serializar(def)                           (exceljs → Buffer .xlsx)
  → download no browser (filename do Content-Disposition)
```

## Relatórios (`:tipo`)
| tipo | Grão | Conteúdo |
|---|---|---|
| `adiantamentos` | 1 linha / adiantamento (`gestao.pendentes`) | detalhe completo: status, motivo, tipoPermuta, valores (moeda neg./BRL), pago, emissão, valorPermutar/total/aberto, D.I/DUIMP + data-base, taxas, variação, auto-elegível, saldo restante |
| `invoices` | 1 linha / invoice (`gestao.invoicesEmAberto`) | doc, filial, processo, emissão, referência, exportador, importador, valor (moeda neg./BRL), taxa |
| `ja-permutado` | `pendentes` com `status='ja-permutado'` | mesmas colunas de `adiantamentos` |
| `bloqueadas` | `pendentes` com `status='bloqueada'` | mesmas colunas de `adiantamentos` (motivo em destaque) |
| `reconciliacao-processo` | agregação por `priCod` | #adtos, #invoices, cardinalidade (1:1/1:N/N:1/N:M/sem-invoice), saldo adtos × Σ invoices (moeda neg.), cobertura %, contagens por status, aging médio/máx |
| `clientes` | agregação por importador | #adtos, #invoices, valores (adtos USD/BRL, invoices USD), contagens por status, aging médio |

## Invariantes do fluxo
- **READ-ONLY:** nenhuma escrita no ERP nem no Postgres. Reusa a mesma leitura do painel → o
  conteúdo do export casa 1:1 com o que o analista vê.
- **Snapshot completo:** filtros de tela não afetam o export (decisão de produto 2026-06-25).
- **Acesso:** mesma faixa de `/gestao` (auth global; sem `requireRole`). Dados sensíveis
  (importador/valores) já são visíveis no painel.
- **`:tipo` validado** contra o enum (`isRelatorioTipo`) no boundary → 400 em valor desconhecido.

## Backlog (não nesta fatia)
Relatórios eleitos mas adiados: **variação cambial (juros×desconto)**, **aging & progresso de
pagamento**, **borderô & execução**, **exceções/blocklist**. Reaproveitam o mesmo
`RelatorioExportService` (novo `tipo` + projeção). Ver `_inbox/relatorios-export-tasks.md`.
