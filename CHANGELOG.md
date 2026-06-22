# Columbia Financeiro — Changelog

## v0.4.2 (2026-06-22) — hardening: coalescing da ingestão + escopo do rate limiter (Lote B do Regis)

- fix(perf): mata o HTTP 429 do fluxo de cliente-filtro (cc-auto-ingest-coalesce).
  - O `heavyRouteLimiter` (10/min) deixa de cobrir o router `/permutas` inteiro — aplicado por-rota só em
    `POST /eleicao` e `POST /ingestao`; leituras (gestao/painel/cliente-filtro/importadores) ficam no
    `globalLimiter` (100/min). Antes o `load()` + painel + ingestão dividiam 10/min → 429.
  - Novo `IngestaoCoalescerService` (`@singleton`) na frente da ingestão: cliques em sequência coalescem
    numa rodada + rerun-trailing (inclui a mudança de quem entrou no meio), em vez de disparar fan-out
    Conexos redundante. Mantém SÍNCRONO (preserva a UX do remover). Contenção cross-instância (cron) segue
    `IngestLockBusyError` → 409. ADR-0012. READ-ONLY no Conexos.

## v0.4.1 (2026-06-22) — hardening de API (Lote A dos P0 do Regis-Review)

- fix(security): RBAC server-side nas rotas de mutação de permutas (security-1).
  - Middleware `requireRole('admin')` (`http/auth.ts`) gateia `POST /eleicao`, `/ingestao`,
    `POST/DELETE /cliente-filtro`, `POST/DELETE /alocacoes`, `POST /processar`; leituras seguem abertas a
    qualquer usuário autenticado. Role vem do JWT (`app_user.role`, default `admin`). 401 sem sessão, 403
    sem role. ADR-0011. Tactic Bass: Authorize Actors.
- fix(security): redação de campos sensíveis no request/response logger (security-3).
  - `redactBody()` (`http/redact.ts`) mascara password/token/authorization/secret/api_key antes do
    `JSON.stringify` — para de vazar a senha do `POST /auth/login` no stdout/log drains. Tactic Bass: Limit Access.
- nota: o timeout HTTP do Conexos (performance-2) já existia (`services/conexos.ts` `timeout: 40000`) — finding
  rebaixado (medira o wrapper DDD). Demais P0 (auto-ingest coalescing, sandbox de teste, coverage FE,
  isolamento Supabase, rollback, rotação de segredos) → Lotes B/C e ops.

## v0.4.0 (2026-06-22) — permutas: distribuição greedy Simples + refinos de cliente-filtro/painel

- feat(permutas): distribuição greedy N:1 com teto na permuta Simples (auto-casamento parcial, READ-ONLY).
  - A aba Simples (1 invoice : N adiantamentos) deixa de usar o valor cheio de cada adto: distribui o
    em-aberto VIVO da invoice (`getDetalheTitulos.valorAberto`/taxa, novo `Invoice.valorAbertoNegociado`)
    entre os adtos casados — maior saldo primeiro, desempate por aging, com saldo residual quando sobra
    (caso 1408: "usa 260.064" em vez de 743.040, 11566 com residual 408.672).
  - Variação cambial recalculada sobre o valor PARCIAL. `GestaoPermutasService` expõe `saldoRestante` no
    casamento Simples; frontend ganha a coluna "Saldo restante". Ontologia v0.2.9 (ADR-0010). Baixa real
    em `fin010` segue Fase 3.
- feat(permutas): cliente-filtro roteia automaticamente ao adicionar E ao remover.
  - Adicionar/remover um importador dispara a ingestão (mesmo compute do cron) para alinhar o painel na
    hora. No remover, o item só sai da lista após a re-ingestão concluir (spinner até o fim); se a
    ingestão falhar, o filtro é mantido (cadastro coerente com o painel). 409/429 tratados.
- feat(permutas): transparência na alocação manual e no painel.
  - Modal de alocação (múltiplas/cross-over/cross-process) mostra a CONTA do juros/desconto
    (`valor × (taxaAdto − taxaInvoice)`) e o saldo DISPONÍVEL da invoice compartilhada (líquido das
    alocações de outros adiantamentos, novo `InvoiceBuscada.jaAlocado`).
  - Painel: badge "fonte: banco" (sem "local") + carimbo "última ingestão" (último run `kind='ingest'`
    bem-sucedido) em horário de Brasília.

## v0.3.0 (2026-06-20) — permutas: ingestão manual de dados (Frente I)

- feat(permutas): botão "Ingestão de dados" no painel + modal que roda a pipeline sob demanda.
  - Backend: `POST /permutas/ingestao` (dispara `IngestaoPermutasService`, mesmo compute do cron, espera concluir) + `GET /permutas/runs` (trilha de auditoria das últimas rodadas, Zod no `?limit`).
  - Concorrência: `IngestLockBusyError` (advisory lock existente) → HTTP 409, sem fan-out duplicado nem run de erro na trilha.
  - Auditoria: `triggered_by` = username do token verificado server-side (cron = `'cron'`); exposto no modal ("analista X" vs "cron job", quando, status, totais).
  - Frontend: modal com aviso da ação, histórico das rodadas e "Rodar agora" (espera no modal com spinner → atualiza painel). Sonner para feedback.
  - READ-ONLY no Conexos (I4 preservado); risco #1 (write-back `fin010`, Fatia 2) intocado.
  - Ontologia v0.2.3 (ADR-0006). PatternGuardian + DesignSystemReviewer sem violações.
- feat(permutas): progresso de pagamento nos bloqueados por "Não totalmente pago".
  - Detalhe Conexos (`getDetalheTitulos`) passa a carregar `valorTotal` (`mnyTitValor`) + `valorAberto` (`mnyTitAberto`) — zero fan-out novo.
  - UI: campo "Progresso de pagamento" no detalhe da linha → "X% pago · falta R$ … (≈ US$ …)". Gate 3 intocado (só visibilidade).
  - migration `0010` (`valor_total`/`valor_aberto`), helper `progressoPagamento` + testes. Ontologia v0.2.4. Gates de revisão sem violações.
- feat(permutas): cliente-filtro + estado "permuta manual" (permuta múltipla manual cross-process — Fase 1).
  - Cadastro de importadores "filtro" (`/permutas/clientes-filtro`): a pipeline roteia os adtos deles (pago + saldo) para o novo estado `permuta-manual` em vez de bloqueada.
  - Importador hidratado na eleição (`imp021`) e persistido (`pes_cod`/`importador`); novo KPI/filtro/badge "Permuta manual" (token `permuta` violeta).
  - Backend: `ClienteFiltroRepository` + rotas CRUD `/cliente-filtro` + `GET /importadores`; override de roteamento em `EleicaoPermutasService`; migrations `0011`-`0013`.
  - READ-ONLY no ERP (I4); cross-process/alocação/escrita = Fases 2/3. Ontologia v0.2.5 (ADR-0007). PatternGuardian + DesignSystemReviewer sem violações.
- feat(permutas): alocação manual N:M cross-process (permuta múltipla manual — Fase 2).
  - O analista, a partir de um adto "permuta manual", busca invoices de qualquer processo (live no Conexos, valida D.I) e distribui valores parciais (N:M); rascunho editável, READ-ONLY no ERP.
  - Backend: tabela `permuta_alocacao` (migration `0014`, sobrevive à ingestão) + `PermutaAlocacaoRepository` + `AlocacaoPermutasService` (valida saldo dos 2 lados → 422, variação pela taxa da invoice) + rotas `GET /invoices/buscar` e POST/DELETE `/alocacoes`; alocações + saldo restante no `/gestao`.
  - Frontend: ação "Alocar invoice" + modal (busca por processo, distribui valor, lista alocações). Ontologia v0.2.6 (ADR-0008). Baixa no `fin010` = Fase 3 (risco #1).
- feat(permutas): tipos de permuta em abas (simples/múltiplas/cross-over/cross-process) + topo só resumo.
  - Classificação derivada `tipoPermuta` no backend (sem novo estado): por cardinalidade do processo (>1 adto casamento-manual → cross-over, senão múltiplas; permuta-manual → cross-process; elegível → simples).
  - Topo enxuto (Pendentes · Invoices em aberto · Já permutado · Bloqueadas); 4 abas na área de trabalho (cross-process com "Alocar" da ADR-0008, aba própria). Fix: busca de invoice filtra "em aberto" pelo detalhe (o `pago` da lista é null/inconfiável). Ontologia v0.2.7 (ADR-0009).
  - Cada aba ganhou filtro (filial + busca por código/exportador/processo) + paginação própria (hook `useTabelaFiltro` + `FiltroBarra`/`Paginacao`), espelhando a tabela principal.
  - Alocação N:M unificada: Múltiplas e Cross-over passaram a usar o mesmo mecanismo do Cross-process (distribuir o saldo de 1 adiantamento em VÁRIAS invoices, parcial, com saldo restante). Removido o fluxo antigo de invoice única ("Resolver"). Backend calcula `saldoRestante`/`alocacoes` também para casamento-manual.
  - Correções da busca de invoice: escopo por FILIAL (o `priCod` não é único entre filiais — `buscarInvoices(priCod, filCod)`); trava de moeda (não permuta USD × BRL); same-process para múltiplas/cross-over; "em aberto" via detalhe.

## v0.2.0 (2026-06-18) — permutas: painel de elegíveis (Frente I, Fatia 1)

- feat(permutas): painel de pendências elegíveis read-only — automação das etapas 1–5 do fluxo manual.
  - Leitura Conexos: `listAdiantamentosProforma`, `listDeclaracaoByProcesso` (D.I/DUIMP).
  - Domínio: elegibilidade (4 gates), casamento 1:1, variação cambial (juros/desconto por taxa), aging, eleição, painel.
  - Persistência: 1ª migration do repo + runner; snapshot + auditoria com transação atômica.
  - Endpoints: `POST /permutas/eleicao` (trigger manual), `GET /permutas/painel`.
  - Ontologia v0.2.1 (5 entidades, 5 ações, ADR-0004); Regis-Review `2026-06-17-2340` + 7 P0 remediados.
  - Em aberto (não-bloqueante): probe P0-4 (campo wire da data-base) liga a coluna *aging* depois.

## v0.1.0 (2026-06-10) — bootstrap

- chore(bootstrap): template virgem porém rodável a partir de `fechamento-processos` v0.10.2
  - Meta-camada: `.claude/` (19 agentes + 13 comandos), `ontology/` (charter + estrutura, domínio vazio), `CLAUDE.md`, configs (biome/tsconfig/CI).
  - Backend Express/DDD rodável: `/health`, auth Supabase, container tsyringe, libs, `ConexosClient` (mesmo tenant), rota de exemplo `GET /conexos/filiais`.
  - Frontend Next.js rodável: shell autenticado, login Microsoft (Supabase), Design System, página inicial placeholder.
  - Sem features de domínio (modeladas depois via `/feature-new`). Ver ADR `ontology/decisions/0001-bootstrap-financeiro.md`.
  - Gates verdes no bootstrap: backend (typecheck/lint/232 testes/build), frontend (typecheck/lint/34 testes/build).

> Versão **do app** (frontend + backend em **lockstep** — mesmo número nos dois `package.json`).
> Exibida na UI (badge/título, `src/frontend/app/layout.tsx`) e no `/health` do backend.
> Mantida pelo `scripts/bump-version.ps1` na fase Ship do pipeline (semver por conventional-commit).
>
> NÃO confundir com `ontology/CHANGELOG.md`, que versiona a **ontologia** (domínio/regras).
