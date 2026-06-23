# Regis-Review follow-ups — Permutas Fase 3 (write-back fin010)

> Run: `docs/regis-review/2026-06-23-1518/` (REPORT.md / KANBAN.md). Feature: `permutas-reconciliacao`
> (ADR-0013). Os **P0 code-fixable foram remediados na própria branch** (ver abaixo). Os itens deste
> arquivo são **P1/P2/P3** — NÃO implementados nesta fatia; entram como dívida priorizada.

## P0 — REMEDIADOS nesta branch (não são follow-up)
- ✅ **double-baixa por retry** (FT-1/AV-2/PERF-2/3): escritas viraram tentativa única.
- ✅ **anti-drift I-Write-1** (SEC-4/FT-4/INT-2): guard de over-pay.
- ✅ **borderô órfão** (AV-1/3): `borCod` persistido no write-ahead.
- ✅ **envelope `messages` ERRO** (INT-3): aborta o handshake.
- ✅ **PermutaExecucaoRepository sem teste** (TEST-1): suíte nova.
- ✅ **flags fora do deploy** (DEPLOY-1/2): render.yaml + .env.example + runbook.

## P1 — priorizar antes de ligar a escrita real em produção
| Card | QA | Finding | Ação |
|------|-----|---------|------|
| int-1 | Integrability | Contrato veio de **1 HAR**; baixa parcial, DESCONTO e finalização do borderô **não observados** | Validar cada caminho em homologação antes de habilitar em prod (Task #26) |
| int-7 / av-? | Integrability/Avail | **Finalização do borderô** não implementada — toda execução deixa borderô aberto | Confirmar se a permuta exige `borVldFinalizado=1`; implementar passo de finalizar |
| ft-2 | Fault-tolerance | Sem detector de linhas presas em `reconciling` | Job/endpoint de varredura por `atualizado_em` antigo + status `reconciling` |
| ft-3 | Fault-tolerance | Sem conciliação periódica DB↔ERP (estorno manual deixa `settled` divergente) | Job de drift contra o `fin010` (lê baixas e marca divergências) |
| sec-9 | Security | `permuta_alocacao_execucao` sem coluna de tenant (cross-tenant no scale-out SaaSo) | ADR + coluna `tenant`/schema antes do multi-tenant |
| int-4 | Integrability | Zod ausente no boundary de escrita (respostas do ERP não validadas) | Zod parse de `BorderoCriado.borCod`, `BaixaGravada.bxaCodSeq`, `responseData.bxaMnyValor` |
| mod-2 | Modifiability | `ConexosClient` 1608 LOC mistura read (14) + write (5) | Extrair `ConexosFin010WriteClient` — pré-requisito sensato antes de prod |
| mod-1 | Modifiability | `reconciliar` cognitive complexity 23 (>15) | Extrair `resolveExecutionMode`/`ensureBordero`/`processarUmaAlocacao` |
| mod-3 | Modifiability | `page.tsx` 2311 LOC, 44 hooks, 4 modais | Extrair `ReconciliacaoModal.tsx` |
| test-2/3 | Testability | Modal Baixar + `reconciliarAdiantamento` sem teste | Componente test do modal + api test |
| perf-1 | Performance | `listAtivas()` full-scan filtrado em JS por adto (ignora índice existente) | Query per-adto no repositório (`WHERE adiantamento_doc_cod = $1`) |
| perf-2/7 | Performance | Sem `server.timeout`; rota síncrona sem cap de N pares | Deadline no Express + cap/streaming de progresso |
| dep-4 | Deployability | `/health` não expõe estado das flags | Incluir `writeEnabled`/`dryRun` no `/health` (verificar flip pós-deploy) |
| sec-2 | Security | Log do interceptor axios vaza `dpeNomPessoa`/`pesCod`/valores no payload `fin010/baixas` | Estender `redactBody` para campos de fornecedor/valor |

## P2/P3 — dívida menor
| Card | QA | Finding |
|------|-----|---------|
| mod-4 | Modifiability | Conta-juros `131` hardcoded — bloqueador SaaSo (plano de contas por cliente) → mover p/ EnvironmentProvider/SSM |
| mod-5/6 | Modifiability | Duplicação `buildPreviewPayload`↔`buildFinalPayload`; 12 magic numbers do payload → `Fin010Constants.ts` |
| sec-3 | Security | dry-run loga `preview` inteiro em BUSINESS_INFO (inteligência financeira desnecessária) |
| sec-4/5 | Security | flip de flag exige restart (EnvironmentProvider @singleton cache); sem boot-banner do modo de escrita |
| test-4/5 | Testability | `todayUtcMidnightMs` usa `new Date()` (sem clock seam); logs de auditoria não asseridos |
| dep-5/6 | Deployability | migrations forward-only (sem `down`) — política a instaurar; sem drift detection da UNIQUE |
| av-p1 | Availability | `CONEXOS_UPSTREAM_TIMEOUT` declarado mas nunca emitido nos catches de escrita |
| int-9 | Integrability | Sem instrumentação por-passo (1..5) do handshake |
