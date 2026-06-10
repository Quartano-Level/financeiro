# ADR 0001: Bootstrap do repositório `financeiro` a partir do template `fechamento-processos`

**Data:** 2026-06-10
**Status:** accepted
**Autores:** Yuri (CEO), Claude Code
**Feature:** bootstrap-template

## Contexto

A Columbia Trading tem duas propostas/produtos distintos sob `clonex/`:
`fechamento-processos` (análise de fechamento de processos de importação, maduro, v0.10.2)
e `financeiro` (nova proposta, repositório virgem). As duas compartilham **a mesma stack**
(TypeScript, Express→Lambda alvo, Next.js, Supabase, Tailwind/shadcn), **o mesmo pipeline de
desenvolvimento dirigido por IA** (`.claude/` + `ontology/`) e **a mesma integração com o ERP
Conexos** (mesmo tenant `columbiatrading.conexos.cloud`).

Em vez de recriar a fundação do zero, o `financeiro` foi materializado como um **template
"virgem porém rodável"** copiado do `fechamento-processos` e podado das features de domínio.

## Decisão

1. **Escopo:** meta-camada (`.claude/`, `ontology/`, `CLAUDE.md`, configs) **+ esqueleto
   rodável** (backend Express/DDD com health, auth Supabase, container tsyringe, libs, cliente
   Conexos; frontend Next.js com shell, login, Design System), **sem nenhuma feature de
   fechamento**.
2. **Ontologia vazia:** o domínio financeiro é modelado incrementalmente via `/feature-new`.
   `_index.json` / `_coverage.json` zerados; pastas de domínio vazias (`.gitkeep`).
3. **Conexos reaproveitado como está:** `ConexosClient` + `legacyConexosAdapter` +
   `EnvironmentProvider` + os 4 DTOs de payload do ERP (`AdiantamentoFinanceiro`, `Invoice`,
   `Proforma`, `SolicitacaoNumerario`) foram portados verbatim (mesmo tenant). Os métodos
   específicos de fechamento permanecem como "biblioteca de endpoints" reaproveitável.
4. **Deploy/stack igual ao fechamento:** Render + GitHub Actions + Supabase + Postgres.
   Domínio em PT-BR; código, agentes e commits em inglês.
5. **Versão do app reiniciada em `0.1.0`** (FE+BE lockstep).

## Consequências

- O esqueleto sobe e passa todos os gates (typecheck/lint/test/build em BE e FE) no commit de
  bootstrap — ver `/CHANGELOG.md` v0.1.0.
- Uma rota de exemplo `GET /conexos/filiais` prova a integração ERP viva.
- Dívida arquitetural herdada (Express→Lambda, sem Terraform) registrada em
  `_inbox/migration-debt.md` — paga proporcionalmente em cada `/feature-tweak`.
- Os agentes/comandos em `.claude/` ainda contêm **exemplos de domínio do fechamento**; eles
  são identidade-adaptados no bootstrap e refinados pelo pipeline conforme features nascem.

## Alternativas consideradas

- **Recriar do zero:** rejeitado — desperdiça a fundação testada (libs, DI, auth, Design System).
- **Clonar o app inteiro e adaptar:** rejeitado — mais código morto e limpeza do que valor.
- **Só a meta-camada (sem esqueleto):** rejeitado — o usuário quer um template que já roda.
