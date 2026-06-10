# Migration Debt — Financeiro

> **P0 gating doc.** O esqueleto foi copiado do `fechamento-processos`, que é Express + Next.js
> puro (estado atual), enquanto o `CLAUDE.md` mira Lambda + DDD/tsyringe + Terraform multi-tenant.
> A dívida abaixo é herdada pelo `financeiro` e **paga proporcionalmente** em cada `/feature-tweak`
> que tocar o código relevante (senão o `PatternGuardian` bloqueia o merge).

**Bootstrap:** 2026-06-10 (a partir de fechamento-processos v0.10.2).

## Backend

| ID | Item | Status | Onde |
|----|------|--------|------|
| B1 | Express em vez de Lambda + API Gateway | OPEN | `src/backend/index.ts`, `routes/` |
| B2 | DDD parcial — camada `domain/` coexiste com legado `routes/`+`services/` | PARTIAL | `src/backend/` |
| B3 | Cliente Conexos legado (sessão por cookie) bridge via adapter token | PARTIAL | `domain/client/legacyConexosAdapter.ts`, `services/conexos.ts` |
| B4 | Sem observabilidade estruturada (X-Ray, métricas CloudWatch) | OPEN | backend inteiro |

## Frontend

| ID | Item | Status | Onde |
|----|------|--------|------|
| F1 | Design System replicado de nf-projects (docs presentes, primitivas shadcn) | PARTIAL | `src/frontend/components/ui/`, `docs/design-system/` |
| F2 | Sem TanStack Query — `fetch` + Zod manual | OPEN | `src/frontend/lib/` |

## Infra

| ID | Item | Status | Onde |
|----|------|--------|------|
| I1 | Sem Terraform / tenant scaffold (deploy via Render hook) | OPEN | `.github/workflows/ci.yml` |
| I2 | Credenciais via `.env` local / SSM em deploy — sem multi-tenant isolado | PARTIAL | `EnvironmentProvider` |

## Específico do bootstrap financeiro

| ID | Item | Status | Onde |
|----|------|--------|------|
| O1 | Ontologia vazia — domínio ainda não modelado | OPEN (esperado) | `ontology/` |
| O2 | Agentes/comandos `.claude/` **totalmente repassados ao propósito financeiro** (identidade + exemplos de domínio: máquina de status NF→fluxos das 3 frentes, Qive→Nexxera/GED/SharePoint, CFOP/RECOF→permuta/lote/NC-ND, métricas `NfsProcessed`→`PermutasReconciled` etc., SSM `qive_credentials`→`nexxera_credentials`). Exemplos usam conceitos da proposta e estão marcados "(a modelar via /feature-new)" — sem inventar regras. Exceção proposital: `design-system-reviewer.md:160` ("bootstrapped from nf-projects", lineage real). | RESOLVED | `.claude/agents/`, `.claude/commands/` |
| O3 | **`ConexosClient` é READ-ONLY** — 24 métodos `list*`/`get*`, transporte só com `getGeneric` (os `post` são o protocolo de *query* do Conexos, NÃO mutação). Não há insert/update/baixa. Mas Permutas (executar na `fin010`) e SISPAG (conciliar baixa) exigem **caminho de escrita no ERP que NÃO existe e nunca foi validado**. A primeira `/feature-new` de Permutas/SISPAG deve desenhar e validar o contrato de escrita. ⚠️ **Risco arquitetural #1.** (Os métodos de leitura de fechamento são reaproveitáveis; prune opcional.) | OPEN | `domain/client/ConexosClient.ts`, `services/conexos.ts`, `legacyConexosAdapter.ts` |
| O4 | Skeleton é **Express request/response** — sem runtime de job/scheduler. A "cadência diária" das 3 frentes (lote SISPAG, reconciliação Permutas, watch SharePoint) não tem onde rodar. Sem mudança estrutural ainda; mapeado para o roadmap. | OPEN | `src/backend/index.ts` |
| O5 | **Postgres cablado mas não usado** (não registrado no container, zero consumidores). Auditoria persistida, backlog/aging, estado do lote e fila de exceções exigem persistência. | OPEN | `domain/client/database/PostgreeDatabaseClient.ts` |
| O6 | **Auditoria persistida e RBAC por perfil ausentes** — exigidos pelas 3 frentes (NFR §6). Hoje só há authN (Supabase JWT) e log em console. | OPEN | `http/auth.ts`, (sem audit service/tabela) |
| O7 | Integrações **Nexxera / GED / SharePoint** inexistentes (sem client, sem config). Net-new por `/feature-new`. | OPEN | `domain/client/`, `EnvironmentVars.ts` |
