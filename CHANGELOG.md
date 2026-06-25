# Columbia Financeiro — Changelog

## v0.7.1 (2026-06-25)

- **fix(permutas):** o seletor "Filial" passa a incluir filiais que só têm invoices (sem adiantamento
  PROFORMA) — ex.: filial 6. Antes o dropdown era derivado só dos adiantamentos, então as invoices
  dessas filiais ficavam visíveis em "Todas as filiais" mas não eram filtráveis. Agora a lista é a
  união das filiais de adiantamentos + invoices.

## v0.7.0 (2026-06-24) — Permutas: cliente, universo de invoices, ciclo de borderô e cache

- **feat(permutas):** reclassificação automática — múltiplas onde o adiantamento **cobre todas as
  invoices** do processo (adto ≥ Σ invoices) viram **AUTOMÁTICAS** (casamentos sintéticos pré-distribuídos,
  com "Processar" = baixa real auto-alocada); casamentos simples cujos adtos **ultrapassam** a invoice
  caem para manual (cross-over/múltipla).
- **feat(permutas):** **status PERMUTA→BORDERÔ** por adiantamento (`GET /permutas/status`, lazy) —
  badge Pendente / Aguardando finalização / Finalizado; borderô cancelado/estornado/excluído reabre a
  permuta para novo lançamento.
- **feat(permutas):** **busca por CLIENTE** (importador) em todas as abas + no detalhe; importador
  hidratado (imp021) para **TODAS as invoices** na ingestão.
- **feat(permutas):** ingestão lista **TODAS as invoices finalizadas** (não só as casadas) com valor em
  moeda negociada (com308) — vista "Invoices em aberto" com filtro Todas / Só casadas.
- **feat(permutas):** **aba Borderôs** in-place na Gestão de Permutas + **cache de borderôs**
  (`permuta_bordero`, populado na ingestão; "Atualizar" = refresh ao vivo) — leitura do banco (rápido),
  500 mais recentes, ações atualizam o cache na hora; detalhe (baixas do ERP) de borderôs lançados
  direto no Conexos via expand.
- **feat(ui):** input monetário com máscara pt-BR + botão "Máx"; moedas com alias ISO no KPI;
  paginação (50/pág) e ordenação mais-novo→mais-velho nos borderôs; saída "Liberar" removida.
- **fix(permutas):** remoção do botão Estorno; mensagens de erro do fin010 amigáveis.
- Migrations `0017_invoice_importador`, `0018_permuta_bordero_cache`, `0019_permuta_perf_indexes`.
- **Regis-Review (2026-06-24-2011) — remediação pré-merge dos blockers:**
  - **P0** removido o endpoint `DELETE /borderos/:borCod/trilha` (`removerDaTrilha`) — sem estorno na UI
    não há mais borderô travado; era código morto + risco de dupla-baixa.
  - **P0** testes diretos das regras de saldo automático (`autoAlocarSeElegivel`/`autoAlocarDeCasamento`,
    `GestaoPermutas.autoElegivel`).
  - **P1** auto-alocação ATÔMICA (all-or-nothing): falha parcial reverte os rascunhos (sem meia-permuta).
  - **P1** `requireRole('admin')` nos GETs `/borderos`, `/borderos/:borCod/baixas`, `/status`.
  - **P1** Zod/guard de identidade nas reads do ERP (`listInvoicesFinalizadas`/`listBorderos`/`listBaixas`)
    + log de cap-hit (truncamento de paginação).
  - **P1** índices de performance (migration 0019) p/ o hot path de borderôs.

## v0.6.1 (2026-06-24) — Regis-Review 2026-06-24-0039: remediação dos P0 de código

- **fix(security):** autorização **server-side** nas ações de borderô (confused-deputy). As ações
  (aprovar/cancelar/estornar/excluir baixa+borderô) só agem sobre borderôs **da trilha deste sistema**;
  o `filCod` vem da TRILHA, nunca do request → admin/JWT não mexe em borderô de terceiro via API.
  Erro `FORBIDDEN:` → HTTP 403 no route. Testes de autorização adicionados.
- **fix(security):** senhas **individuais** para os 4 admins kavex (eram iguais) + bcrypt cost 10→12
  (seed-admin e os 4 usuários).
- **fix(integrability):** **Zod no boundary** das escritas fin010 que viram confirmação persistida —
  `criarBordero` exige `borCod` numérico, `gravarBaixaPermuta` exige `bxaCodSeq` (senão aborta, sem
  borderô fantasma / settled errado).
- **test(integrability/testability):** **contract tests** do fin010 no `ConexosClient` (paths/payloads),
  incluindo a **regressão do bug docTip-vs-filCod** (2º segmento do DELETE baixa é o docTip).
- **chore(deploy):** flags de escrita (`CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN`/`CONEXOS_BASE_URL`)
  passam a ser **fonte única no dashboard do Render** (`sync:false`) — fim do blueprint sobrescrevendo
  o dashboard a cada deploy.

## v0.6.0 (2026-06-24) — Fase 3.1: gestão de borderôs (ciclo completo no fin010)

Aba **Borderôs** — revisão e gestão dos borderôs de permuta com **status ao vivo do ERP** (fonte:
`fin010/list`, `borVldTipo=2`), e o ciclo de vida completo automatizado via o próprio Conexos.

- feat(permutas): `BorderoGestaoService` — listar (do ERP, enriquecido com a trilha), **Aprovar**
  (`finalizar`), **Cancelar**, **Estornar** (volta p/ em cadastro) e **Excluir** baixa/borderô.
  Contratos sondados por HAR: `POST /fin010/{finalizar,cancelar,estornar}/{borCod}`,
  `DELETE /fin010/{borCod}`, `DELETE /fin010/baixas/{borCod}/{docTip}/{docCod}/{titCod}/{bxaCodSeq}`
  (2º segmento é o **docTip**, não o filCod), `POST /fin010/baixas/list/{borCod}`.
- feat(frontend): aba `/permutas/borderos` — filtros (borderô, usuário, filial, situação, data),
  ações com modal de confirmação, situação ao vivo; ações só nos borderôs criados por este sistema.
- feat(permutas): **data do borderô** escolhida no modal de baixa (default = data da D.I/DUIMP),
  resolvendo `FIN_010.DATA_BLOQUEADA_PELA_CONTABILIDADE` em períodos fechados.
- feat(permutas): idempotência **viva** — borderô cancelado/estornado/removido libera o relançamento
  preservando o histórico (renomeia a chave).
- fix(permutas): erros do ERP traduzidos para PT (400 com mensagem) em vez de 500 genérico.
- chore(auth): usuários admin (francinei/grazi/simone/rogerio @kavex.com) no `app_user`.

## v0.5.0 (2026-06-23) — Fase 3: write-back fin010 (baixa/permuta efetiva no ERP)

A **primeira escrita** do sistema no Conexos — o risco arquitetural #1. A ação `reconciliarPermuta`
consome as alocações e executa a baixa no `fin010` adto a adto, via o **handshake de 5 chamadas**
descoberto por engenharia reversa de um HAR real. **Gated** (escrita desligada + dry-run por padrão,
homologação-first). ADR-0013, ontologia v0.3.0.

- feat(permutas): `ReconciliacaoPermutaService` + métodos de escrita no `ConexosClient`
  (criarBordero/validarTituloBaixa/validarTituloPermuta/atualizarValorLiquido/gravarBaixaPermuta via
  `postGeneric` → `authenticatedPost`). Rotas `POST /adiantamentos/:docCod/reconciliar` e `GET .../execucoes`.
- feat(permutas): write-ahead + idempotência por par adto↔invoice (`permuta_alocacao_execucao`, 0015).
  Guard-rails via `EnvironmentProvider` (`CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN`).
- feat(frontend): ação "Baixar" na aba cross-process → modal de preview (dry-run) + "Executar baixa".
- fix(permutas): remediação dos P0 do Regis-Review 2026-06-23-1518 (10/10):
  - escritas (criarBordero/gravarBaixaPermuta) fora do `RetryExecutor` → sem baixa duplicada;
  - anti-drift I-Write-1 (aborta se o ERP quer baixar > alocado esperado);
  - `borCod` persistido no write-ahead (recuperação de borderô órfão);
  - envelope `messages` (`valid='ERRO'` aborta); testes do `PermutaExecucaoRepository`;
  - flags em `render.yaml`/`.env.example` + runbook `docs/runbooks/fin010-write-cutover.md`.
- Pendente (P1/P2/P3 → inbox): validar contrato single-HAR em homologação (baixa parcial, DESCONTO,
  finalização do borderô) antes de `CONEXOS_WRITE_ENABLED=true` em produção; ADR multi-tenant; deadline/cap
  na rota; separar write client; extrair modal do `page.tsx`.

## v0.4.2 (2026-06-22) — hardening: coalescing da ingestão + escopo do rate limiter (Lote B do Regis)

- fix(perf): mata o HTTP 429 do fluxo de cliente-filtro (cc-auto-ingest-coalesce).
  - O `heavyRouteLimiter` (10/min) deixa de cobrir o router `/permutas` inteiro — aplicado por-rota só em
    `POST /eleicao` e `POST /ingestao`; leituras (gestao/painel/cliente-filtro/importadores) ficam no
    `globalLimiter` (100/min). Antes o `load()` + painel + ingestão dividiam 10/min → 429.
  - Novo `IngestaoCoalescerService` (`@singleton`) na frente da ingestão: cliques em sequência coalescem
    numa rodada + rerun-trailing (inclui a mudança de quem entrou no meio), em vez de disparar fan-out
    Conexos redundante. Mantém SÍNCRONO (preserva a UX do remover). Contenção cross-instância (cron) segue
    `IngestLockBusyError` → 409. ADR-0012. READ-ONLY no Conexos.
- chore(test): higiene de teste (Lote C do Regis — test-only, sem bump).
  - testability-1: sandbox do `EnvironmentProvider.test` — mocka o `dotenv` (config no-op) pra o teste
    não depender do `.env` do dev (antes `CONEXOS_FIL_COD` local contaminava o cenário "ausente" e a
    suíte tinha 1 falha ambiental). Suíte BE agora 100% verde.
  - testability-3: `collectCoverageFrom` no frontend — passa a medir TODO o código-fonte (antes ~10 de
    34 arquivos → número "Potemkin" ~82%). Baseline real ~26.8% lines; floors do `coverageThreshold`
    recalibrados logo abaixo do real (pega regressão, CI verde). Subir conforme testes forem adicionados.

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
