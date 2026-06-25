---
qa: Security
qa_slug: security
run_id: 2026-06-25-1555
agent: qa-security
generated_at: 2026-06-25T15:55:00-03:00
scope: backend,frontend
score: 7
findings_count: 3
cards_count: 3
---

# Security — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Usuário autenticado de baixo privilégio (não-admin) | Faz `GET /permutas/relatorios/clientes` e baixa o snapshot inteiro em uma única requisição (.xlsx) | Endpoint `GET /permutas/relatorios/:tipo` (`routes/permutas.ts:371-386`) + `RelatorioExportService` (`src/backend/domain/service/permutas/RelatorioExportService.ts`) | Produção (Render + Supabase Auth), tenant Columbia Trading, dados reais de importadores/valores BRL/USD | Sistema valida o JWT (auth middleware global), executa a projeção READ-ONLY de `/gestao` (mesmo dataset que a UI já mostra), gera o .xlsx com 6 projeções (até `clientes`/`reconciliacao-processo` quebrando por importador) e devolve com `Content-Disposition: attachment; filename="permutas-<tipo>-<data>.xlsx"` | 100% das requisições têm `req.user` validado por `buildAuthMiddleware`; 0 segredos novos no delta; 0 SQL novo (reusa `GestaoPermutasService`); ⚠️ 0% das rotas de export passam por `requireRole` (paridade com `/gestao`, divergência das rotas de mutação que usam `requireRole('admin')`) |

> A feature é **READ-ONLY** e não cria superfície nova de injection, secret ou
> escrita no ERP. O único vetor de risco material introduzido é de
> **confidencialidade** (bulk-exfiltration de nomes de importadores + valores
> financeiros em arquivo único) versus a baseline da própria tela `/gestao`,
> que já expõe os mesmos dados via UI a qualquer usuário autenticado.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Hardcoded secrets no delta | 0 | 0 | ✅ | `grep -rEn "(password\|secret\|token\|api[_-]?key)\s*[:=]\s*['\"][^'\"]{8,}"` nos 8 arquivos do delta |
| Novas dependências (npm) | 0 (exceljs ^4.4.0 já presente) | n/a | ✅ | `_shared-metrics.md` + `src/backend/package.json` |
| Endpoints novos com auth middleware (JWT) | 1/1 (100%) | 100% | ✅ | `src/backend/index.ts:77` (`app.use(buildAuthMiddleware(...))`) cobre tudo após `/auth` e `/health` |
| Endpoints novos com `requireRole` | 0/1 (0%) | tema do F-security-1 | ⚠️ | `routes/permutas.ts:371-386` (não chama `requireRole`) |
| Paridade do role gate vs irmãos de leitura | divergente | consistente | ⚠️ | `/gestao`, `/painel`, `/runs`, `/cliente-filtro` (GET), `/importadores`, `/invoices/buscar`, `/execucoes` → SEM `requireRole` · `/borderos`, `/borderos/:borCod/baixas`, `/status` → COM `requireRole('admin')` |
| Validação Zod / type-guard no boundary | 1/1 (100%) — `isRelatorioTipo` valida `:tipo` contra enum de 6 valores antes de qualquer side-effect | 100% | ✅ | `routes/permutas.ts:376` + `domain/interface/permutas/Relatorio.ts:45-46` |
| SQL novo introduzido | 0 (reusa `GestaoPermutasService.exporGestao`, sem repos novos) | n/a | ✅ | `RelatorioExportService.ts:51` |
| `Content-Disposition` header injection | não-exploitável (filename derivado server-side: `permutas-<tipo>-<data>.xlsx`, `tipo` ∈ enum, `data` é ISO `slice(0,10)` do `geradoEm` do serviço) | sem CRLF do input do usuário | ✅ | `RelatorioExportService.ts:376-379` + `routes/permutas.ts:383` |
| `dangerouslySetInnerHTML` no delta frontend | 0 | 0 | ✅ | `grep -n "dangerouslySetInnerHTML\|innerHTML" src/frontend/app/permutas/page.tsx src/frontend/lib/api.ts` |
| Token persistido em `localStorage` no delta | 0 (export usa `withAuthHeaders()` igual aos outros fetches; download via blob+anchor é descartado com `URL.revokeObjectURL`) | 0 | ✅ | `src/frontend/lib/api.ts:429-456` |
| Audit log da exportação | presente — `logService.info({type: BUSINESS_INFO, message:'permuta relatorio exportado', data:{requestId, tipo, linhas}})` | presente | ✅ (parcial — sem identidade do usuário; ver F-security-2) | `RelatorioExportService.ts:55-59` |

> ⚠️ **Não medível localmente**: taxa de tentativas de export por usuário não-admin, e
> volume agregado de bytes exfiltrados por mês. Requer instrumentação CloudWatch /
> dashboard de uso por usuário. Recomendação: capturar `req.user.sub` no log já
> emitido por `RelatorioExportService.exportar()` (ver F-security-2) e criar métrica
> `permuta_relatorio_export_total{tipo,role}` no Prometheus / OTEL exporter da app.

## 3. Tactics — Cobertura no financeiro (delta da feature)

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Identify Actors | JWT HS256 da própria app identifica `sub`/`email` em todo request autenticado | ✅ presente | `src/backend/http/auth.ts:96+` |
| Authenticate Actors | `buildAuthMiddleware` aplicado globalmente após `/auth` e `/health`; rota nova herda | ✅ presente | `src/backend/index.ts:77` |
| Authorize Actors | RBAC server-side via `requireRole('admin')` existe e é usado nas mutações **e em 2 leituras sensíveis** (`/borderos`, `/status`); a leitura nova de export **não invoca** `requireRole`, mantendo paridade com `/gestao` | ⚠️ parcial | `routes/permutas.ts:371-386` vs `:448`, `:604` |
| Limit Access | Auth global + rate limit (`globalLimiter` 100/min) cobre `/permutas/*`; `heavyRouteLimiter` (10/min) NÃO se aplica ao export — apropriado (não há fan-out Conexos), mas o export é o-(KB→MB) de I/O síncrono e pode ser usado para enumeração se executado em loop | ⚠️ parcial | `src/backend/index.ts:82,92` (export fora do `heavyRouteLimiter`) |
| Limit Exposure | Endpoint só responde 200 com `req.user` populado; tipos válidos = 6 (enum fechado); `:tipo` inválido → 400 sem revelar estado | ✅ presente | `routes/permutas.ts:376-378` |
| Encrypt Data | TLS na borda (Render/Vercel); .xlsx não-cifrado em repouso no browser do usuário (esperado para download) | ✅ presente | n/a (entrega ao browser) |
| Separate Entities | Service `@injectable` separado da rota; projeção (`montarDefinicao`) separada da serialização (`serializar`) — facilita auditar o que entra na planilha sem ler bytes do xlsx | ✅ presente | `RelatorioExportService.ts:64,382` |
| Change Default Settings | n/a — feature não introduz config nova; `creator='Columbia Financeiro'` é cosmético, não-sensível | N/A | `RelatorioExportService.ts:384` |
| Validate Input | `isRelatorioTipo` é type-guard sobre `RELATORIO_TIPOS as const`; sem SQL, sem path traversal (não há filesystem); sem header injection (filename server-side) | ✅ presente | `domain/interface/permutas/Relatorio.ts:45-46` |
| Detect Intrusion | `console.warn('[auth] rejected request to ...')` no auth middleware loga 401/403 com método + URL | ⚠️ parcial | `src/backend/http/auth.ts:167-170,192-194` (sem alarme agregado — fora do delta) |
| Detect Service Denial | Rate limit global 100/min protege contra burst de export, mas sem alarme dedicado para volume de export | ⚠️ parcial | `src/backend/index.ts` (limiter está em outro arquivo) |
| Verify Message Integrity | JWT assinado (HS256) garante integridade do contexto do usuário; `.xlsx` é binário gerado server-side, sem assinatura | ⚠️ parcial | aceita para feature READ-ONLY de relatório |
| Detect Message Delay | n/a — request/response síncrono, não há fila/timestamp | N/A | — |
| Revoke Access | n/a no delta — herdada do mecanismo de revogação de token da app (fora do escopo da feature) | N/A | — |
| Lock Computer | n/a | N/A | — |
| Inform Actors | 4xx do endpoint propaga JSON `{error}` ao caller; UI mostra toast (`exportarRelatorio` lança `Error`) | ✅ presente | `src/frontend/lib/api.ts:433-440` |
| Audit Trail | `logService.info(BUSINESS_INFO, 'permuta relatorio exportado', {requestId,tipo,linhas})` registra a ação; **não inclui `req.user.sub`/`email`** — não dá para responder "quem exportou a lista de clientes na quarta passada" | ⚠️ parcial | `RelatorioExportService.ts:55-59` |
| Restore | n/a — operação de leitura, sem estado a restaurar | N/A | — |

## 4. Findings (achados)

### F-security-1: Export bulk de KPIs financeiros aberto a qualquer usuário autenticado (paridade com `/gestao`, divergente de `/borderos` e `/status`)

- **Severidade**: P1 (alto — degrada confidencialidade mensurável)
- **Tactic violada**: Authorize Actors
- **Localização**: `src/backend/routes/permutas.ts:371-386` (rota nova `GET /permutas/relatorios/:tipo`)
- **Evidência (objetiva)**:
  ```ts
  // routes/permutas.ts — rota nova, sem requireRole:
  router.get(
      '/relatorios/:tipo',
      asyncHandler(async (req, res) => { ... }),  // ← sem requireRole entre o handler e o asyncHandler
  );

  // Baseline no MESMO router (rotas de leitura que JÁ exigem admin):
  router.get('/borderos',                  requireRole('admin'), asyncHandler(...));  // :447
  router.get('/borderos/:borCod/baixas',   requireRole('admin'), asyncHandler(...));  // :461
  router.get('/status',                    requireRole('admin'), asyncHandler(...));  // :603

  // Baseline no MESMO router (rotas de leitura que NÃO exigem admin — paridade do export):
  router.get('/gestao',   asyncHandler(...));  // :358
  router.get('/painel',   asyncHandler(...));  // :614
  router.get('/runs',     asyncHandler(...));  // :200
  router.get('/cliente-filtro', asyncHandler(...));  // :217  (GET)
  ```
  Contagem no router: **3 leituras GET com `requireRole('admin')`** vs **7 leituras GET sem `requireRole`** (incluindo o export novo). O export devolve `permutas-clientes-<data>.xlsx` (até 11 colunas com nomes de importadores + valores agregados BRL/USD) em arquivo único, baixável com um clique.
- **Impacto técnico**: Qualquer usuário com JWT válido (inclusive contas de menor privilégio futuras, quando o RBAC for granularizado para além de `admin`) pode disparar `GET /permutas/relatorios/clientes` e capturar o **snapshot inteiro** do painel em formato estruturado, fora da UI (e da telemetria que rastreia páginas vistas). A UI `/gestao` já mostra os mesmos dados, mas (a) requer interação por linha — scraping é detectável, (b) não produz um artefato portável.
- **Impacto de negócio**: vazamento de **carteira de importadores + valores em aberto** em um único arquivo. Em uma trading, esse dataset é insumo direto para inteligência competitiva (clientes ativos, ticket médio, aging). A divergência com `/borderos`/`/status` (que JÁ são `admin`) é o sinal mais forte de que a decisão de role gate ainda não foi feita conscientemente para leituras agregadas — a paridade com `/gestao` é uma escolha técnica, não uma decisão de produto.
- **Métrica de baseline**: 0/1 (0%) endpoints de export com `requireRole`; 3/10 (30%) das leituras GET de `/permutas/*` têm `requireRole('admin')`, divergência de 70 pontos percentuais entre rotas que tocam o mesmo dataset.

### F-security-2: Audit trail do export não registra a identidade de quem exportou

- **Severidade**: P2 (médio — débito de auditabilidade)
- **Tactic violada**: Audit Trail
- **Localização**: `src/backend/domain/service/permutas/RelatorioExportService.ts:55-59`
- **Evidência (objetiva)**:
  ```ts
  await this.logService.info({
      type: LOG_TYPE.BUSINESS_INFO,
      message: 'permuta relatorio exportado',
      data: { requestId, tipo, linhas: definicao.linhas.length },
      // ← sem `userSub`/`userEmail` no payload do log
  });
  ```
  Comparar com a baseline já vigente no mesmo router para outras ações: `triggeredBy = req.user?.sub ?? req.user?.email ?? 'unknown'` é capturado em `/eleicao`, `/ingestao`, `/cliente-filtro` (POST), `/processar`, `/reconciliar`, `/borderos/:borCod/finalizar|cancelar|estornar` (`routes/permutas.ts:139,173,238,401,432,488,510,532,554,578`) — i.e., todas as ações mutadoras já carregam identidade. O export é uma ação de exfiltração de dados sensíveis e deveria carregar também.
- **Impacto técnico**: incidentes de vazamento ("quem baixou o relatório de clientes na sexta às 17h?") são inrastreáveis a partir do log de aplicação. Cruzamento com logs de auth-middleware (que tem método+URL+timestamp, mas não o `sub`) é frágil e não-determinístico em produção com múltiplos requests por segundo.
- **Impacto de negócio**: em uma área financeira de trading, audit trail "quem viu/exportou o quê" é requisito de compliance interno e externo. CLAUDE.md lista auditabilidade entre os P3s da ontologia ("Cada transição é uma ação nomeada com regra explícita"); este endpoint exporta a foto agregada e deveria seguir a mesma regra.
- **Métrica de baseline**: 1/1 (100%) ação de leitura "pesada" instrumentada **sem** identidade de ator vs 9/9 (100%) ações de mutação no `permutas.ts` **com** identidade.

### F-security-3: Endpoint de export reusa o rate-limit global (100/min), sem teto específico para exfiltração

- **Severidade**: P3 (baixo — hardening)
- **Tactic violada**: Limit Access / Detect Service Denial
- **Localização**: `src/backend/routes/permutas.ts:371-386` + `src/backend/index.ts:82,92`
- **Evidência (objetiva)**:
  ```ts
  // index.ts — globalLimiter (100/min) cobre /permutas/*; heavyRouteLimiter
  // (10/min) é per-route nas rotas pesadas (eleicao/ingestao/reconciliar/...).
  app.use('/permutas', permutasRouter);  // → globalLimiter

  // routes/permutas.ts — export NÃO adiciona heavyRouteLimiter:
  router.get('/relatorios/:tipo', asyncHandler(...));  // sem heavyRouteLimiter
  ```
  A escolha é defensável (export não dispara fan-out Conexos — só lê 1× `GestaoPermutasService.exporGestao` que tem cache próprio), mas significa que um cliente pode pedir até **100 exports/min** (ex: 100× `clientes` em sequência) que multiplicam o I/O do `exporGestao` e produzem 100 arquivos .xlsx no log de saída.
- **Impacto técnico**: amplificador potencial de exfiltração e de pressão de CPU (`exceljs.writeBuffer` é síncrono em userland). Não-crítico hoje porque a feature é nova e o tráfego é baixo; vira P2 se a base de usuários crescer.
- **Impacto de negócio**: degradação de UX da própria tela `/gestao` (mesmo pool) sob abuse; sem dashboard hoje para detectar.
- **Métrica de baseline**: teto efetivo = 100 req/min (globalLimiter); teto recomendado para export bulk = 6 req/min (1 por tipo de relatório por minuto) ou `heavyRouteLimiter` (10/min) por paridade com as rotas de fan-out.

## 5. Cards Kanban

### [security-1] Decidir e aplicar `requireRole` no export de relatórios (paridade com `/borderos`/`/status`)

- **Problema**
  > A nova rota `GET /permutas/relatorios/:tipo` herda só o auth global, sem `requireRole`, ficando em paridade com `/gestao`. Mas no mesmo router, leituras agregadas que tocam o mesmo dataset (`/borderos`, `/status`) já exigem `requireRole('admin')`. A divergência (30% das leituras com admin gate vs export sem gate) é uma decisão de produto não-tomada: ou o painel inteiro de Permutas é "qualquer autenticado lê tudo" (e aí `/borderos`/`/status` estão excessivamente fechados) ou dados financeiros agregados são admin-only (e aí o export precisa subir para `admin`). Como o export entrega um artefato exfiltrável em um clique (vs UI que requer scraping), o vetor de risco é assimétrico — esta é a decisão a tomar antes de a feature pegar tráfego real.

- **Melhoria Proposta**
  > Levar a Yuri/proposta a pergunta "exports do painel de Permutas são `admin`-only?". Default sugerido: SIM (`requireRole('admin')`), por simetria com `/borderos`/`/status` e por minimizar blast-radius de credencial vazada. Implementação: adicionar `requireRole('admin')` entre o path e o `asyncHandler` em `routes/permutas.ts:371-386`; replicar o gate no teste de rota (já há caso 401) acrescentando um 403 para usuário non-admin. Tactic alvo: **Authorize Actors**. Documentar a decisão no ADR de relatórios.

- **Resultado Esperado**
  > Endpoints de leitura agregada de `/permutas/*` consistentes quanto a role gate. Métrica: `# leituras agregadas com requireRole` / `total de leituras agregadas` = 4/4 (incluindo o export); divergência cai de 30pp para 0pp.

- **Tactic alvo**: Authorize Actors
- **Severidade**: P1
- **Esforço estimado**: S (≤1d — uma linha de middleware + um teste; o trabalho real é a decisão de produto)
- **Findings relacionados**: F-security-1
- **Métricas de sucesso**:
  - Exports executados por non-admin: hoje irrestrito → 0 (rejeitado com 403)
  - Paridade de role gate entre leituras agregadas: 3/10 → 4/4 entre as agregadas (`/borderos`, `/status`, `/relatorios/:tipo` e — opcional — `/gestao` revisitada)
- **Risco de não fazer**: vazamento de carteira de importadores via JWT de usuário operacional comprometido / compartilhado; impossível detectar a posteriori (ver security-2) e impossível reverter (arquivo já está no disco do atacante)
- **Dependências**: decisão de Yuri/produto sobre a faixa de acesso de leitura no painel de Permutas (pode endereçar `/gestao` no mesmo movimento)

### [security-2] Incluir identidade do ator (`req.user.sub`/`email`) no audit log do export

- **Problema**
  > O `RelatorioExportService.exportar()` loga `{requestId, tipo, linhas}` mas não a identidade de quem fez a exportação, divergindo de todas as 9 ações mutadoras do mesmo router (`/eleicao`, `/ingestao`, `/processar`, `/reconciliar`, `/cliente-filtro` POST, `/borderos/*`) que já capturam `triggeredBy = req.user?.sub ?? req.user?.email`. Sem isso, incidentes de exfiltração ("quem baixou o relatório de clientes ontem?") só podem ser correlacionados via log de auth-middleware (método+URL+timestamp), que não é determinístico sob concorrência.

- **Melhoria Proposta**
  > Adicionar parâmetro `triggeredBy: string` em `RelatorioExportService.exportar()` (ou passar o `req.user` inteiro) e incluí-lo em `logService.info({...data: {requestId, tipo, linhas, triggeredBy}})`. Atualizar o handler em `routes/permutas.ts:371-386` para derivar `req.user?.sub ?? req.user?.email ?? 'unknown'` (idêntico aos irmãos). Tactic alvo: **Audit Trail**. Cross-QA: Fault-Tolerance/Observability (consolidator: ver overlap com card de audit trail no fault-tolerance).

- **Resultado Esperado**
  > Cada execução de export tem rastro `quem + quando + o quê + tamanho`. Métrica: ações sensíveis de Permutas com `triggeredBy` no log: 9/10 → 10/10 (100%).

- **Tactic alvo**: Audit Trail
- **Severidade**: P2
- **Esforço estimado**: S (≤1d — assinatura do método + teste; o serviço já recebe `requestId`)
- **Findings relacionados**: F-security-2
- **Métricas de sucesso**:
  - Cobertura de `triggeredBy` em ações sensíveis (mutações + exports) de `/permutas/*`: 9/10 → 10/10
  - Tempo médio para responder "quem exportou X em Y?" via grep no log de produção: indeterminado → O(1)
- **Risco de não fazer**: investigação forense de vazamento fica restrita a logs de infra (auth-middleware sem `sub`); responder a auditoria de compliance vira trabalho manual de correlação por janela de tempo
- **Dependências**: nenhuma (alteração local no service + handler)

### [security-3] Aplicar `heavyRouteLimiter` (ou limiter dedicado) no export de relatórios

- **Problema**
  > O endpoint de export usa só o `globalLimiter` (100/min), permitindo até 100 .xlsx por minuto por cliente. Cada export executa 1× `GestaoPermutasService.exporGestao` + serialização `exceljs.writeBuffer` (CPU-bound síncrono em userland). Tráfego abusivo (script, credencial vazada) tanto amplifica exfiltração quanto pressiona CPU/memória da própria instância, degradando UX de quem está usando `/gestao` na UI.

- **Melhoria Proposta**
  > Anexar `heavyRouteLimiter` (10/min, já existente — `src/backend/http/rateLimit.ts`) na rota nova, por paridade com as outras rotas pesadas (`/eleicao`, `/ingestao`, `/reconciliar`, `/borderos/*/finalizar|cancelar|estornar|excluir`). Avaliar criar `exportLimiter` (ex: 6/min) se 10/min for sentido frouxo para um humano (1 export por relatório por minuto). Tactic alvo: **Limit Access** + **Detect Service Denial**.

- **Resultado Esperado**
  > Teto de exports por minuto/cliente cai de 100 para 10 (ou 6). Sem mudança perceptível para uso humano normal (1–3 exports / sessão).

- **Tactic alvo**: Limit Access
- **Severidade**: P3
- **Esforço estimado**: S (≤1d — um decorator no router + um teste de 429)
- **Findings relacionados**: F-security-3
- **Métricas de sucesso**:
  - Teto de export `.xlsx` por minuto por IP: 100 → 10
  - Risco de exhausting CPU via export-loop: presente → mitigado (rate-limit cobre o vetor)
- **Risco de não fazer**: hoje irrelevante (baixo tráfego); vira P2 conforme a base de usuários cresce
- **Dependências**: nenhuma

## 6. Notas do agente

- Escopo limitado ao delta (--quick): não revarri SSM/IAM/Terraform (não há infra/ hoje) nem `npm audit` (já coberto pela baseline; sem deps novas).
- Decisão central da seção: a feature é tecnicamente sólida (zero secret/SQL/XSS/header-injection novos). O único finding com peso é a **decisão de role gate** — é uma divergência de política entre `/gestao` e `/borderos`/`/status` que a feature herda passivamente. O card security-1 está formulado para devolver a decisão ao produto, não para forçar uma posição técnica.
- Cross-QA para o consolidator: (a) F-security-2 (Audit Trail) overlaps com o que Fault-Tolerance/Observability tipicamente sinaliza — coordenar se o consolidator vir o mesmo card sob outro QA; (b) F-security-3 (Limit Access) overlaps com Performance/Availability (rate-limit como blast-radius); (c) Validate Input no `:tipo` é compartilhado com Integrability (boundary contract). Sem violação de Inviolable Rules.
