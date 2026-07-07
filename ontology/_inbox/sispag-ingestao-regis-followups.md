# SISPAG Ingestão de Pagamentos — follow-ups (Regis quick)

> Branch `feat/sispag-ingestao-pagamentos`, 2026-07-08. Regis **quick** (PatternGuardian +
> qa-fault-tolerance no delta). **Zero P0.** O P1 (partial-read inativando por engano) foi
> **remediado no loop**. Demais → tickets.

## Remediado nesta feature ✅
- **P1 (fault-tolerance Q2) — partial-read inativava títulos válidos.** Se a leitura de uma filial
  falha, a inativação anti-fantasma apagaria os títulos dessa filial. **Fix:** `marcarInativosForaDaRun`
  agora recebe `filCodsLidas` e só inativa **nas filiais lidas com sucesso** (`AND fil_cod = ANY(...)`);
  sem filial lida → no-op. Testado (`IngestaoPagamentosService.test.ts`, `TituloAPagarRepository.test.ts`).
- **P3 (fault-tolerance Q3) — blip pós-sucesso remarcava run como error.** `recordIdempotencyKey`/log
  movidos para bloco best-effort após `finishRun('success')`.
- **PT-msg (PatternGuardian) — `'filCod inválido'` → `'invalid filCod'`** (convenção EN).

## Follow-ups (→ tickets)
| id | prio | finding | nota |
|----|------|---------|------|
| ft-1 | P2 | upsert + inativação em transações separadas → over-count transitório do painel entre um crash e a próxima run | self-healing na próxima run; merge num único `withTransaction` (`applyRun`) resolve |
| ft-4 | P2 | run pode ficar `running` p/ sempre se o processo morrer (sem reaper) | só ruído de auditoria (`findLatestSuccessFinishedAt` filtra success); reaper depende de scheduler (O4) |
| pg-null-dtos | P3 | PatternGuardian sugeriu `?: T \| null` nos DTOs | **recusado (by design):** os mappers convertem null→undefined na fronteira; DTO é pós-mapeamento (consistente com CLAUDE.md e Fatia 2) |
| pg-lock-doc | P3 | doc/msg default do `IngestLockBusyError` menciona "permuta" (compartilhado) | sem impacto prod (o serviço passa msg própria); genericizar o comentário/default |
| ds-notify / deep-link | P3 | (herdados da Fatia 2) `toast`→`notify()`, filtro no URL, etc. | ver `sispag-painel-montagem-regis-followups.md` |

> **Confirmado:** I1 (read-only ao ERP) 100%; SQL param (upsert chunked com `$name`, sem interpolação);
> advisory-lock com chave própria (726354819 ≠ permutas); idempotência + lock corretos (sem race).
