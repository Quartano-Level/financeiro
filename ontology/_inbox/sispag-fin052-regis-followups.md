# SISPAG fin052 (retorno) — follow-ups (Regis quick)

> Branch `feat/sispag-fin052-retorno-tools`, 2026-07-11. Regis **quick** (PatternGuardian +
> qa-security no delta da infra multipart). **Zero P0/P1.** PatternGuardian PASS (doutrina de
> escrita irreversível aplicada ao upload). Segurança confirmou: `fileName` protegido por
> `encodeURIComponent`; `delete content-type` case-sensitive preserva a auth (Cookie/cnx-filcod/
> cnx-usncod); **o `.RET` NÃO vaza em log** (o interceptor roda `redactSensitive` sobre o `FormData`
> → `Object.entries(FormData)===[]` → `body={}`); isolamento por filial preservado (cnx-filcod do
> `opts.filCod`; `MissingFilCodError` se ausente).

## Follow-ups (→ tickets, P3 — não implementados)
| id | prio | finding | nota |
|----|------|---------|------|
| f052-1 | P3 | teste-regressão de `redactSensitive(new FormData())` → `"{}"` | congela o não-vazamento do `.RET` no log; se um refactor futuro de `redactValue` iterar `.entries()`/`Symbol.iterator`, o multipart passaria a vazar PII silenciosamente. Add em `conexos.test.ts`. |
| f052-2 | P3 | cap de tamanho no `carregarArquivoRetorno` do serviço futuro | validar `conteudo.byteLength` contra teto (~5 MB) antes do `postMultipartOnce`; `.RET` maior = anomalia (fail-closed). Fora do delta (dormente). |
| f052-3 | P3 | canonizar `fileName` no orquestrador futuro | `encodeURIComponent` já cobre injeção; ainda assim `path.basename` + regex `^[A-Za-z0-9._-]{1,64}$` evita nome com caractere de controle por bug de caller. |
| f052-4 | P3 | anotar na doutrina: `postMultipartOnce` é o ÚNICO caminho de upload do stack | qualquer endpoint multipart novo deve seguir o padrão (single-attempt, sem 401-retry cego, `defaultHeaders` menos `content-type`, `cnx-filcod` explícito). |

## Lacunas de EXPLORAÇÃO (bloqueadas até segunda — ver `sispag-fin052-exploration.md`)
- **`.RET` de exemplo** (analista) — sem ele não valida `carregar`/`processar`.
- **HAR de `processar`/`liberar`** (bodies não documentados) e do **`arquivosRetornoDetalhe/list`** (`REQUIRED_FILTER_ERROR` — filtro exigido desconhecido).
- Decidir se `processar` dá a baixa nativa vs. montar baixa `fin010` à mão; tratar retorno rejeitado/parcial.
