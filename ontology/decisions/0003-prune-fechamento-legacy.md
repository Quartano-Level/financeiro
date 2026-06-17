# ADR 0003: Poda do legado de fechamento + reframe "Atual vs. Alvo"

**Data:** 2026-06-17
**Status:** accepted
**Autores:** Yuri (CEO), Claude Code
**Cliente:** Columbia Trading · **Entrega:** Kavex (created by Clonex)
**Relacionado:** ADR-0001 (bootstrap), ADR-0002 (propósito); PR #1 (`feat/bootstrap-template` → `main`)

## Contexto

No PR #1 (bootstrap do repositório), o revisor (Yuri) deixou duas recomendações:

1. **Limpeza do legado:** "não trazer o código de fechamento-processos ou ter um planejamento de remover
   esse código em breve, para não ficar poluindo e ter o repo mais clean possível."
2. **CLAUDE.md alvo vs. atual:** "corrigir o CLAUDE.md para ele saber que o alvo é Lambda/AWS, mas que
   atualmente a infra é Render, Vercel, Supabase — para não ter que ficar corrigindo nem olhando alteração
   em `/infra`."

Auditoria confirmou: o backend, herdado do template `fechamento-processos` (sistema de leitura/relatórios
de NF), carregava ~2,5–3k linhas de leitura específica de fechamento sem consumidor real; e o corpo do
`CLAUDE.md` descrevia AWS Lambda + Terraform como se já existisse, enquanto a infra real é Express→Render,
Next.js→Vercel, auth+Postgres→Supabase (sem `infra/`, sem Terraform).

## Decisão

### 1. Poda seletiva ("deletar só o claramente-morto")
Remover **apenas** o código inequivocamente de fechamento **e** sem reuso nas 3 frentes (Permutas, SISPAG,
Popula GED). **Preservar** os métodos de leitura que mapeiam ao lado-leitura das frentes — eles são o
scaffold de leitura que a primeira `/feature-new` de cada frente vai consumir/validar.

**`ConexosClient` — MANTIDOS** (usados ou mapeiam às frentes): `listFiliais`, `getFilCodDefault`,
`listProcessos`, `listFinanceiroAPagar`, `listFinanceiroAPagarByGerNum`, `getMnyTitPermutar`,
`listAdiantamentoFinanceiroAPagar`, `listAdiantamentoFinanceiroAReceber`, `listTitulosAPagar`, `listBaixasTitulo`.

**`ConexosClient` — REMOVIDOS** (só-fechamento, sem reuso) + seus tipos/schemas/helpers exclusivos:
`listFinanceiroAReceber`, `listIndicesByIdent`, `listCotacoes`, `listDuimpByProcess`, `getDuimpTaxa`,
`listDiByProcess`, `getDiPlanilhaTaxa`, `listLancamentosContabeisLotes`, `listLancamentosVC`,
`listBaixasSolNum`, `listTitulosNFSaida`, `listBaixasTituloNFSaida`, `listNFsSaida`, `getEncargosGerais`.

Também removidos: a interface `closing-reports/SolicitacaoNumerario.ts`, os métodos públicos mortos do
service legado `services/conexos.ts` (`getProcesses`, `getDespesasByProcessId`, `listInvoicesByProcess`,
`listEntryInvoicesByProcess`, `getEntryInvoiceProducts`, `listPayablesByProcess`, `getPayableProducts`,
`getEncargosGeraisByInvoice`) e os testes correspondentes.

**Preservados** (infra genérica / domínio das frentes): `Invoice.ts`, `Proforma.ts`,
`AdiantamentoFinanceiro.ts`; transporte do `legacyConexosAdapter` (`listGeneric`/`listGenericPaginated`/
`getGeneric`/`ensureSid`/filiais); `PostgreeDatabaseClient` (O5), `BcbClient`, `MissingFilCodError`,
`ConexosError`, `InvalidDateRangeError` (este é usado por `HandlerError.test.ts`).

### 2. Reframe "Atual vs. Alvo"
`CLAUDE.md` ganha uma seção-resumo **"Estado Atual vs. Alvo"** (espelhando `README.md`) e tags **(alvo)**
pontuais nos trechos que descrevem AWS como presente (Data Flow, DDD Layers, Client Layer/Region, Directory
Map, Commands, Handlers, linha do `AwsInfraArchitect`). A **Inviolable Rule #4** ("Lambda only / never
Express") passa a vetar Express em **código novo**, sem exigir reescrever o legado de imediato; #1/#3
(terraform) ficam condicionais a "quando a infra Terraform existir". Os agentes/comandos `.claude/` que
assumem AWS (`aws-infra-architect`, `observability-advisor`, `new-tenant`, `diagnose-tenant`, `feature-new`)
recebem um disclaimer curto "Atual: Render/Vercel/Supabase; recomendações são para o alvo".

### 3. Limite
A poda **não** modela domínio nem decide a forma final do contrato de leitura — isso é trabalho da primeira
`/feature-new` de cada frente. A regra continua: legado migrado proporcionalmente em cada `/feature-tweak`.

## Consequências

- Repo mais limpo (~2,5–3k linhas de leitura de fechamento removidas) sem perder o scaffold de leitura das
  frentes; gates (`typecheck`/`lint`/`test`) verdes.
- O risco arquitetural #1 (read→write no Conexos) **permanece** — a poda não toca nele (não havia escrita).
- `migration-debt.md` O3/B2/B3 atualizados; o pipeline deixa de tratar `infra/`/Terraform/SSM como presentes.

## Alternativas consideradas

- **Poda agressiva** (remover todos os reads não usados, reconstruir via `/feature-new`): rejeitada —
  jogaria fora o scaffold de leitura que mapeia diretamente a Permutas/SISPAG.
- **Só plano de remoção, sem deletar:** rejeitada — o Yuri pediu repo limpo; deletar o claramente-morto
  agora entrega isso sem invadir escopo de modelagem.
- **Reescrita maior do CLAUDE.md:** rejeitada — o bloco-resumo + tags pontuais resolve sem arriscar
  divergir do conteúdo já correto.
