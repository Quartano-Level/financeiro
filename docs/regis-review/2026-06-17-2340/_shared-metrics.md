# Shared Metrics — Regis-Review run 2026-06-17-2340

**Scope:** backend-only, restrito ao DELTA da feature Permutas Frente I — Fatia 1 (painel de elegíveis, READ-ONLY).
**Worktree:** `/private/tmp/permutas-painel-wt` · **Branch:** `feat/permutas-painel-elegiveis` · **Base:** `feat/bootstrap-template`
**Mode:** `--quick` (skip coverage / terraform plan / npm audit deep).

## Contexto da feature (load-bearing para os agents)
- **READ-ONLY**: zero escrita em `fin010`. Só leitura Conexos + persistência própria (snapshot + auditoria).
- **DDD-ready rodando em Express** (estado ATUAL; alvo é Lambda — não presuma infra/Terraform/EventBridge).
- **Postgres recém-introduzido** (migration-debt O5/O6): 1ª migration do repo + auditoria persistida.
- **Só permutas simples 1:1**; N:M → `bloqueada(composto-nm)` (reportada, não processada).
- **Gaps gated (NÃO bloqueiam verde, isolados/plugáveis):**
  - P0-4: nome do campo wire da data-base (`imp019`/`imp223`) — `dataBase`/`aging` nascem `undefined`/null; isolado em `ConexosClient.mapDeclaracaoDataBase` (TODO).
  - build-probe: literal da chave wire do filtro `adiantamento` (`ADIANTAMENTO_FILTER_KEY/_VALUE`, provisório).
  - build-probe: doc-fonte `com308` de `taxaAdiantamento`/`taxaInvoice`/`principalMoeda` (assunção `titFltTaxaMneg`/`titMnyValorMneg`).

## Baseline (medido)
| Métrica | Valor |
|---|---|
| LOC novo código permutas (non-test) | **1163** |
| LOC testes permutas | **944** |
| Suites de teste permutas | **9** |
| Total testes da feature (loop) | **237 passing / 29 suites** (repo todo) |
| Migrations | `0001_permuta_eleicao.sql` + `runMigrations.ts` (1ª do repo) |
| ConexosClient delta | +171 linhas (2 métodos read novos + mapper plugável) |
| typecheck | ✅ `tsc --noEmit` exit 0 |
| lint (biome) | ✅ exit 0 (4 warnings só em legado `services/conexos.ts`) |
| PatternGuardian | ✅ 0 violações (DDD/tsyringe/SQL parametrizado/tenant isolation) |

## Arquivos do delta (alvo da revisão)
- `domain/interface/permutas/*` (6 entidades + estados)
- `domain/client/permutas/{conexosPermutasConstants,conexosPermutasSchemas}.ts` (+test)
- `domain/client/ConexosClient.ts` (alterado: `listAdiantamentosProforma`, `listDeclaracaoByProcesso`, `mapDeclaracaoDataBase`)
- `domain/service/permutas/{Elegibilidade,CasamentoInvoice,VariacaoCambialPermuta,Aging,EleicaoPermutas,Painel}Service.ts` (+tests)
- `domain/repository/permutas/PermutaSnapshotRepository.ts` (+test)
- `migrations/{0001_permuta_eleicao.sql,runMigrations.ts}`
- `routes/permutas.ts` (+test) — `POST /permutas/eleicao`, `GET /permutas/painel`
- `domain/appContainer.ts`, `domain/interface/log/LogInterface.ts`, `index.ts` (alterados)

## Não-medíveis neste run (`--quick`)
- Coverage % (jest --coverage não rodado).
- `npm audit` profundo.
- Terraform plan (sem `infra/`).
- Métricas de runtime/latência (sem ambiente de execução com Conexos/Postgres reais).
