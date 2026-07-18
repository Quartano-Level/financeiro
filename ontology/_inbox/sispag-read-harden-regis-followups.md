# SISPAG read-path hardening — follow-ups (Regis quick)

> Branch `fix/sispag-read-harden`, 2026-07-11. Tweak que fechou os cards Regis
> **integrability-1** e **availability-sispag-1** da Fatia 1+2 (KANBAN
> `docs/regis-review/2026-07-07-1841-sispag-painel-montagem/`). Regis **quick**
> (PatternGuardian + qa-availability + qa-integrability + qa-fault-tolerance no delta).
> **Zero P0.** Os três QA convergiram: o delta é melhoria estrita.

## Remediado nesta tweak ✅
- **integrability-1** — `listTitulosAPagar` tinha `catch {}` cru que engolia qualquer erro
  (500/timeout/rede) e caía para leitura **sem filtro** de milhares de linhas. Agora o método
  privado `isFilterRejected(err)` (`err.response?.status === 400`) só reconhece a recusa de filtro
  do Conexos como fallback legítimo; erro transitório é **re-lançado** (`throw err`).
- **availability-sispag-1** — os 6 reads SISPAG (`listTitulosAPagar`, `getTituloAPagar`,
  `isDocInternacional`, `listExteriorDocCods`, `listLotes`, `listBorderosAPagar`) agora envolvem
  `listGenericPaginated` em `this.base.runWithRetry(...)` → paridade de retry (2 tentativas/500ms/
  jitter200) com os demais `Conexos*Client`.
- **P1 observabilidade (parcial da integrability-1)** — o braço de fallback agora emite
  `Logger.warn` (não-silencioso), para que um drift sistemático do filtro no `fin064` vire sinal em
  vez de degrade oculto (o próprio modo de falha que o card fecha).

## Follow-ups (→ tickets, NÃO implementados)
| id | prio | finding | nota |
|----|------|---------|------|
| rh-1 | P1 | `isFilterRejected` casa QUALQUER 400, não só "filtro recusado" — se o `fin064` devolver 400 por outra causa (filCod/body malformado/schema drift), cai no fallback sem filtro e retorna dados semanticamente amplos | mitigado em parte pelo `Logger.warn` (agora não-silencioso). Endurecer: capturar um 400 real do `fin064` (fixture em pré-prod/Regis) e apertar o predicado contra `body.type`/`messages` conhecido. Precisa do fixture — por isso vira ticket, não foi implementado. |
| rh-2 | P3 | `RetryExecutor` compartilhado usa `shouldRetry` default (`() => true`) → um 400 determinístico é retentado 2× (~1s morto) antes de cair no fallback | cross-cutting (afeta todos os `Conexos*Client`, não só SISPAG). Adicionar `shouldRetry` que não retenta 4xx no `ConexosBaseClient`. Fora do escopo desta tweak (mudaria a política global). |
| rh-3 | P3 | sem métrica de retries-por-endpoint (`ConexosRetryCount{endpoint}`) → Conexos degradado só vira alarme via Log Insights manual | soma-se ao backlog Regis de observabilidade (era v0.9.2); não abrir card novo isolado. |
| rh-4 | P3 | timeout do axios (40s) + `retries:2` amplifica o tempo total antes de propagar se o Conexos pendurar | herdado do base client; fora do delta. |

> **Confirmado pelos gates:** I1 (read-only ao ERP) 100% (nenhuma escrita adicionada); PatternGuardian
> PASS (DDD/tsyringe/acesso/Zod OK); consumidores a montante (`IngestaoPagamentosService` anti-fantasma
> por `filiaisLidas`, `LotePagamentoService.incluirTitulo` fail-closed) tratam a propagação corretamente.
