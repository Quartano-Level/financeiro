---
type: regis-review-kanban
run_id: 2026-06-25-1555
feature: relatorios-export
total: 25
counts: { p0: 0, p1: 3, p2: 10, p3: 12 }
---

# Kanban — financeiro — 2026-06-25-1555

> Importável para o Kanban do time. Cada card abaixo já tem Problema / Melhoria Proposta /
> Resultado Esperado, copiado verbatim das 8 seções QA do run.
> Ordem: P0 (nenhum) · P1 (3, todos S) · P2 (10, todos S) · P3 (12, S exceto onde marcado).
> Cards `availability-1`, `integrability-1`, `security-3` e `integrability-4` ficam ABERTOS no
> Kanban mas são marcados como **subsumed-by** outros cards (mesma intervenção fecha ambos —
> ver REPORT.md §3 Cross-cutting). Não dupla-implementar.

---

## P0 — Crítico

_(Nenhum P0 levantado pelos 8 agentes. Gate Regis-Review passa sem re-loop.)_

---

## P1 — Alto

### [performance-1] Cachear o snapshot do `exporGestao()` por curta janela (request-coalescing) compartilhado entre `/gestao` e `/relatorios/:tipo`

**QA**: Performance
**Tactic alvo**: Maintain Multiple Copies of Computations / Cache strategy
**Esforço**: S (≤1d)
**Findings**: F-performance-1

**Problema**
> Cada clique em "Exportar" reexecuta os 7 reads paralelos do `/gestao` — mesmo quando o painel ACABOU de ser carregado. Baixar os 6 tipos do popover gera 42 queries idênticas em segundos. Em fechamento, 4 analistas simultâneos = ~168 reads redundantes/min no Supabase.

**Melhoria Proposta**
> Adicionar um cache curto (TTL 5–10s ou key por `last ingest_finished_at`) em `GestaoPermutasService.exporGestao()`. Alternativa equivalente: request-coalescing por `last ingest run_id` (memoiza o resultado até o próximo run de ingestão chegar). Reaproveita o já existente `snapshotRepository.findLatestIngestFinishedAt()` como cache key. Tactic alvo: **Maintain Multiple Copies of Computations** + **Reduce Overhead**.

**Resultado Esperado**
> Sequência "carregar painel + exportar todos os 6 tipos" passa de **49 reads (1 + 6×7×1)** para **7 reads** no Postgres dentro de uma janela curta. Latência percebida da pasta completa cai de ~6× para ~1×.

**Métricas de sucesso**
- Reads no Postgres por "pasta completa" (6 exports): 42 → 7 (≥85% redução)
- Hit-rate do cache quando painel é exportado logo após carregar: alvo ≥ 90%

**Risco de não fazer**: durante fechamento mensal, exports concorrentes podem saturar conexões Supabase e degradar o `/gestao` para todos os analistas simultaneamente.

**Dependências**: Nenhuma (cache local ao processo basta para Render single-instance hoje)

---

### [performance-2] Aplicar `heavyRouteLimiter` ao endpoint `GET /permutas/relatorios/:tipo`

**QA**: Performance (subsume `availability-1` + `security-3` — ver REPORT §3 CC-1)
**Tactic alvo**: Limit Event Response
**Esforço**: S (≤1d) — 1 linha de middleware + teste de rota
**Findings**: F-performance-2 (+ F-availability-1, F-security-3)

**Problema**
> A nova rota custa o MESMO que o `/gestao` (7 reads paralelos), mas só herda o `globalLimiter` (100 req/min/IP). Rotas equivalentes em fan-out (`/eleicao`, `/ingestao`, `/reconciliar`) já usam `heavyRouteLimiter` (10 req/min/IP). O endpoint de export está **10× mais permissivo** do que o padrão da casa.

**Melhoria Proposta**
> Adicionar `heavyRouteLimiter` ao middleware do `router.get('/relatorios/:tipo', ...)` em `src/backend/routes/permutas.ts:371-386`, alinhando ao padrão `/eleicao` (linha 131-134). Tactic alvo: **Limit Event Response**.

**Resultado Esperado**
> Burst máximo no endpoint: **100 → 10 req/min/IP** (alinhado ao padrão de rotas pesadas). Risco de saturar pool Postgres por export controlado.

**Métricas de sucesso**
- Limit per-IP no endpoint: 100 req/min → 10 req/min
- Cobertura do padrão "heavy route" no router de permutas: 3/4 → 4/4 rotas pesadas com `heavyRouteLimiter`

**Risco de não fazer**: um script descuidado ou popover com bug pode disparar exports em loop e esgotar conexões do Supabase, derrubando `/gestao` para todos.

**Dependências**: Nenhuma

---

### [security-1] Decidir e aplicar `requireRole` no export de relatórios (paridade com `/borderos`/`/status`)

**QA**: Security
**Tactic alvo**: Authorize Actors
**Esforço**: S (≤1d — uma linha de middleware + um teste; o trabalho real é a decisão de produto)
**Findings**: F-security-1

**Problema**
> A nova rota `GET /permutas/relatorios/:tipo` herda só o auth global, sem `requireRole`, ficando em paridade com `/gestao`. Mas no mesmo router, leituras agregadas que tocam o mesmo dataset (`/borderos`, `/status`) já exigem `requireRole('admin')`. A divergência (30% das leituras com admin gate vs export sem gate) é uma decisão de produto não-tomada: ou o painel inteiro de Permutas é "qualquer autenticado lê tudo" (e aí `/borderos`/`/status` estão excessivamente fechados) ou dados financeiros agregados são admin-only (e aí o export precisa subir para `admin`). Como o export entrega um artefato exfiltrável em um clique (vs UI que requer scraping), o vetor de risco é assimétrico — esta é a decisão a tomar antes de a feature pegar tráfego real.

**Melhoria Proposta**
> Levar a Yuri/proposta a pergunta "exports do painel de Permutas são `admin`-only?". Default sugerido: SIM (`requireRole('admin')`), por simetria com `/borderos`/`/status` e por minimizar blast-radius de credencial vazada. Implementação: adicionar `requireRole('admin')` entre o path e o `asyncHandler` em `routes/permutas.ts:371-386`; replicar o gate no teste de rota (já há caso 401) acrescentando um 403 para usuário non-admin. Tactic alvo: **Authorize Actors**. Documentar a decisão no ADR de relatórios.

**Resultado Esperado**
> Endpoints de leitura agregada de `/permutas/*` consistentes quanto a role gate. Métrica: `# leituras agregadas com requireRole` / `total de leituras agregadas` = 4/4 (incluindo o export); divergência cai de 30pp para 0pp.

**Métricas de sucesso**
- Exports executados por non-admin: hoje irrestrito → 0 (rejeitado com 403)
- Paridade de role gate entre leituras agregadas: 3/10 → 4/4 entre as agregadas (`/borderos`, `/status`, `/relatorios/:tipo` e — opcional — `/gestao` revisitada)

**Risco de não fazer**: vazamento de carteira de importadores via JWT de usuário operacional comprometido / compartilhado; impossível detectar a posteriori (ver security-2) e impossível reverter (arquivo já está no disco do atacante).

**Dependências**: decisão de Yuri/produto sobre a faixa de acesso de leitura no painel de Permutas (pode endereçar `/gestao` no mesmo movimento)

---

## P2 — Médio

### [availability-1] Aplicar rate-limit dedicado na rota de export de relatórios

**QA**: Availability — **SUBSUMED-BY `performance-2`** (mesma intervenção; não duplicar PR)
**Tactic alvo**: Removal from Service
**Esforço**: S
**Findings**: F-availability-1

**Problema**
> A rota `GET /permutas/relatorios/:tipo` (`routes/permutas.ts:371-386`) é a única operação READ pesada de Permutas que **não** está protegida por `heavyRouteLimiter`. Cada chamada reusa todo o custo de `/gestao` mais serialização xlsx (CPU-bound). 4 de 5 rotas pesadas do arquivo já usam o limiter; esta ficou de fora. O guard de UI (`disabled={exportando !== null}` em `page.tsx:1185`) só protege via navegador.

**Melhoria Proposta**
> Adicionar `heavyRouteLimiter` (ou um limiter dedicado de "exports" com janela mais curta — ex.: 6 req/min/usuário, equivalente ao número de tipos disponíveis) na rota `/relatorios/:tipo`. Tactic Bass: **Removal from Service** (limitar entrada para preservar o resto do serviço). Arquivos: `routes/permutas.ts`, `http/rateLimit.ts`.

**Resultado Esperado**
> Cobertura de rate-limit nas rotas pesadas de Permutas: **4/5 (80%) → 5/5 (100%)**. Clique-em-rajada (manual ou script) é cortado com 429 antes de gerar workbook na memória.

**Métricas de sucesso**
- rotas Permutas pesadas com limiter: 4/5 → 5/5
- 429 no log quando 7+ requests/min do mesmo usuário (smoke test): 0 → ≥1

**Risco de não fazer**: durante o fechamento mensal (pico de uso do painel), um analista que abre o popover e clica nos 6 relatórios em sequência pode degradar o tempo de resposta do painel para todos.

**Dependências**: Nenhuma

---

### [availability-2] Streamar o workbook xlsx (`workbook.xlsx.write(stream)`) em vez de buffer único

**QA**: Availability — par natural com `performance-3` (mesma intervenção sob outro ângulo)
**Tactic alvo**: Degradation / Predictive Model
**Esforço**: M
**Findings**: F-availability-2

**Problema**
> `RelatorioExportService.ts:395-396` materializa o `.xlsx` inteiro em memória (`writeBuffer` → `Buffer.from`). Em Render single-process, snapshot grande de Permutas pode levar o heap perto do limite; combinado com a ausência de timeout (card availability-3), o handler pode travar o event-loop durante a serialização.

**Melhoria Proposta**
> Trocar `writeBuffer()` por `workbook.xlsx.write(res)` (exceljs suporta WritableStream) e setar `Content-Disposition`/`Content-Type` antes do `write`. Tactic Bass: **Degradation** (mantém o resto do servidor responsivo durante o export). Arquivo: `RelatorioExportService.ts` (assinatura passa a aceitar um `Writable` em vez de devolver `Buffer`) e `routes/permutas.ts` (passa `res` ao service).

**Resultado Esperado**
> Pico de heap por export: **~2× tamanho-do-arquivo → ~constante** (chunks). Tempo até o 1º byte chegar no browser: **fim-da-serialização → quase imediato** (UX percebida).

**Métricas de sucesso**
- peak `process.memoryUsage().heapUsed` durante export (instrumentar antes/depois): coletar baseline → reduzir ≥40% em snapshot de 10k linhas (teste sintético)
- TTFB do download no FE: medir baseline → reduzir ≥50%

**Risco de não fazer**: snapshot grande inesperado (backlog acumulado) causa OOM no processo Render; reinício derruba sessões em curso (incluindo ingestão manual via `IngestaoCoalescerService`).

**Dependências**: Nenhuma — porém faz par com `availability-3` (timeout) para defesa completa.

---

### [availability-3] Timeout explícito + log de duração no handler de export

**QA**: Availability
**Tactic alvo**: Exception Prevention / Monitor
**Esforço**: S
**Findings**: F-availability-3, F-availability-2

**Problema**
> Não há timeout no handler `GET /permutas/relatorios/:tipo` nem no `RelatorioExportService.exportar`. Se `exporGestao()` ou `writeBuffer` travarem, o handler aguarda o timeout default do Render sem logar "deadline excedido", consumindo uma conexão do worker e potencialmente um cursor de DB.

**Melhoria Proposta**
> Envolver `service.exportar(...)` em `Promise.race([fn(), deadline(30_000)])` (ou usar `AbortController` se exceljs/pg suportar) e responder `504 {error:"export deadline exceeded"}` quando exceder. Instrumentar `logService.info({duracaoMs, linhas, heapUsed})` ao final (o log atual já tem `linhas`, falta tempo e memória). Tactic Bass: **Exception Prevention** (timeout = circuit breaker de operação cara) + **Monitor**. Arquivos: `RelatorioExportService.ts`, opcional helper em `domain/libs/executor/`.

**Resultado Esperado**
> Endpoints Permutas com timeout explícito declarado: **0/14 → 1/14** (estabelece o padrão). Surgem logs com `duracaoMs` por export para sustentar SLO futuro.

**Métricas de sucesso**
- rotas com timeout declarado em código: 0 → 1 (e adota como padrão para próximas)
- métrica `duracaoMs` no log do export: ausente → presente em 100% das execuções
- 504 explícito visível no FE quando teste sintético atrasa `exporGestao` por 31s: ausente → presente

**Risco de não fazer**: falha "pendurada" continua silenciosa; defesa de SLO de export na reunião é palpite, sem número.

**Dependências**: Nenhuma; emparelha bem com `availability-2` (streaming).

---

### [deployability-1] Adicionar feature flag para o botão "Exportar"

**QA**: Deployability
**Tactic alvo**: Scale Rollouts
**Esforço**: S (≤1d)
**Findings**: F-deployability-1

**Problema**
> A rota `GET /permutas/relatorios/:tipo` e o popover "Exportar" são sempre ativos. Em caso de falha em prd (ex.: snapshot grande estourando memória do `exceljs`), a única recuperação é `git revert` + redeploy (≤10 min). Não há kill-switch em runtime nem mecanismo de canary parcial.

**Melhoria Proposta**
> Introduzir uma flag (env var `EXPORT_RELATORIOS_ENABLED` no backend + `NEXT_PUBLIC_EXPORT_RELATORIOS_ENABLED` no frontend, lidos via `EnvironmentProvider` no BE) que esconda o popover e devolva 404 na rota quando `false`. Tactic alvo: **Scale Rollouts**. Arquivos: `src/backend/routes/permutas.ts`, `src/frontend/app/permutas/page.tsx`, `src/frontend/lib/api.ts` (já checa flag para esconder UI).

**Resultado Esperado**
> Operador consegue desativar a feature em ≤1 min sem redeploy de código (apenas redeploy de env), reduzindo MTTR de 10 min → 1 min em incidente runtime.

**Métricas de sucesso**
- Feature flags ativos sobre a rota: 0 → 1
- MTTR esperado em incidente runtime: ~10 min (revert) → ≤1 min (flag)

**Risco de não fazer**: durante a estabilização da v0.8 a feature será exercitada por usuários reais; uma falha de geração de XLSX expõe o botão a todos até que um revert seja feito.

**Dependências**: Nenhuma

---

### [integrability-1] Unificar `RelatorioTipo` em uma fonte única FE↔BE

**QA**: Integrability — **SUBSUMED-BY `modifiability-1`** (mesma raiz; um único PR fecha ambos)
**Tactic alvo**: Adhere to Standards / Backward-Compatibility Shims
**Esforço**: S (≤1d)
**Findings**: F-integrability-1

**Problema**
> O enum `RelatorioTipo` existe duas vezes: em `backend/domain/interface/permutas/Relatorio.ts:10-19` (array `as const`) e em `frontend/lib/types.ts:331-337` (union literal). Não há mecanismo que garanta paridade — adicionar/renomear/remover um tipo só em um dos lados quebra o export silenciosamente (FE manda `tipo` inexistente → 400, ou BE expõe `tipo` invisível no menu).

**Melhoria Proposta**
> Aplicar a tactic **Adhere to Standards**: ou (a) extrair `RelatorioTipo` para um package compartilhado (`packages/shared-types`), ou (b) gerar o tipo TS do FE a partir do enum BE (script em `scripts/`), ou (c) adicionar 1 teste de paridade que importe ambos arquivos (via path relativo) e compare arrays — escolha mais barata dado o monorepo. Documentar a decisão num comentário no arquivo do FE apontando para a fonte da verdade.

**Resultado Esperado**
> Drift impossível silenciosamente: PR que adicionar `tipo` em só um lado falha no CI. Métrica: 1 fonte da verdade · 1 teste de paridade verde.

**Métricas de sucesso**
- Fontes da verdade para `RelatorioTipo`: 2 → 1 (ou 2 + 1 teste de paridade)
- Cenário de regressão (adicionar `tipo` em só um lado): falha silenciosa → erro de build/teste

**Risco de não fazer**: bug intermitente após cada refactor de menu; tempo de debug desproporcional ao escopo do bug.

**Dependências**: Nenhuma

---

### [integrability-2] Adicionar log estruturado de falha por `tipo` no `RelatorioExportService`

**QA**: Integrability
**Tactic alvo**: Observability of Integration Failures
**Esforço**: S (≤1d)
**Findings**: F-integrability-3

**Problema**
> `RelatorioExportService.exportar` loga **sucesso** com `{ tipo, requestId, linhas }`, mas falhas caem no `asyncHandler` genérico da rota — perdendo a dimensão `tipo`. Em incidente, é impossível dizer rapidamente "`reconciliacao-processo` está quebrando há 1h, mas `adiantamentos` está OK" sem reproduzir manualmente.

**Melhoria Proposta**
> Aplicar a tactic **Observability of Integration Failures**: envolver `gestaoService.exporGestao` + `serializar` em try/catch e emitir `logService.error({ tipo, requestId, etapa: 'exporGestao'|'serializar' })` antes de re-lançar. Manter o `asyncHandler` como rede de segurança. Quando houver métricas em produção, expor contador `exports_total{tipo,status}`.

**Resultado Esperado**
> Logs dimensionados permitem alertar por `tipo` (ex.: alerta se taxa de erro de `clientes` > 5% em 15min). Métrica: 0 → 1 log de erro estruturado por export quebrado.

**Métricas de sucesso**
- Logs de erro com `tipo` dimensionado: 0 → 100% das falhas no service
- MTTR estimado em incidente por `tipo`: desconhecido → mensurável via filtro de log

**Risco de não fazer**: cegueira de operação quando 1 relatório quebra e os outros não.

**Dependências**: Nenhuma

---

### [modifiability-1] Unificar `RelatorioTipo` BE↔FE em fonte única

**QA**: Modifiability (fecha CC-2 — subsume `integrability-1`)
**Tactic alvo**: Defer Binding — configuration
**Esforço**: S (≤1d)
**Findings**: F-modifiability-1 (+ F-integrability-1)

**Problema**
> O union `RelatorioTipo` está duplicado em `src/frontend/lib/types.ts:331-337` e em `RELATORIO_TIPOS` no `src/backend/domain/interface/permutas/Relatorio.ts:10-19`. Qualquer mudança de catálogo (novo tipo ou rename) exige editar nos dois lados; o typecheck não detecta drift. Risco: FE oferece tipo que BE rejeita com 400 (ou vice-versa).

**Melhoria Proposta**
> Gerar o tipo do FE a partir do BE: (a) extrair `RELATORIO_TIPOS` (e `RelatorioDescritor` se quisermos descrição compartilhada) para um pacote leve `@financeiro/shared-contracts` consumido por FE e BE, ou (b) script `scripts/sync-relatorio-types.ts` que regenera `src/frontend/lib/types.ts` (bloco demarcado) a partir do BE no `prebuild`. Tactic: **Defer Binding — configuration** + **Abstract Common Services**.

**Resultado Esperado**
> Adicionar `aging-detalhado` ao BE quebra o build do FE automaticamente se a sincronização falhar. Drift FE↔BE = 0 strings divergentes.

**Métricas de sucesso**
- Strings duplicadas `RelatorioTipo`: 12 → 0
- Arquivos tocados ao adicionar relatório novo: 5 → 4

**Risco de não fazer**: Em 6 meses, com 8–10 relatórios e múltiplas iterações, alta probabilidade de uma release nascer com FE/BE dessincronizado — sintoma é 400 silencioso ou item de menu morto.

**Dependências**: Nenhuma (escolha entre pacote shared vs script é trivial)

---

### [performance-3] Migrar serialização xlsx para streaming (`workbook.xlsx.write(res)`)

**QA**: Performance — par natural com `availability-2`
**Tactic alvo**: Increase Resource Efficiency / Bound Execution Times
**Esforço**: S (≤1d)
**Findings**: F-performance-3

**Problema**
> Hoje o workbook é totalmente bufferizado em memória (`workbook.xlsx.writeBuffer()` + `res.send(buffer)`). Na escala atual (~509 adtos × 27 colunas) o pico é baixo (~5–15 MB por request), mas em concorrência durante fechamento e à medida que o backlog cresce (novas filiais/frentes) o heap escala linearmente.

**Melhoria Proposta**
> Substituir `writeBuffer()` por `workbook.xlsx.write(res)` (API streaming do exceljs), escrevendo direto no `Response` do Express após setar os headers. Manter `montarDefinicao` separado para preservar testes. Tactic alvo: **Increase Resource Efficiency** + **Bound Execution Times**.

**Resultado Esperado**
> Pico de heap por request de export: estabiliza independente do tamanho do dataset (overhead constante do exceljs writer). Bytes começam a fluir antes da última linha ser projetada. Hoje (~509 linhas): impacto baixo. Cenário 5k linhas: heap por request **~50 MB → ~5 MB** (estimativa exceljs).

**Métricas de sucesso**
- Pico de heap por export concorrente: estável em função do dataset (não-linear → linear→constante)
- Time-to-first-byte do download: cai de "tempo total da serialização" para "tempo da 1ª chunk"

**Risco de não fazer**: à medida que o backlog crescer (mais filiais, mais frentes), N exports concorrentes podem saturar heap da instância Render.

**Dependências**: Nenhuma; teste atual do service valida `montarDefinicao` (projeção) — não quebra ao trocar a serialização.

---

### [performance-4] Definir deadline explícito (timeout) para o handler de export

**QA**: Performance — par natural com `availability-3`
**Tactic alvo**: Bound Execution Times
**Esforço**: S (≤1d)
**Findings**: F-performance-4

**Problema**
> Não há timeout no handler nem cancelamento via `AbortController` quando o cliente desiste. Se o Postgres ficar lento, o request pendura até o handler concluir naturalmente, ocupando conexão e potencialmente sendo retriado pelo analista (efeito tempestade).

**Melhoria Proposta**
> Envolver `service.exportar(...)` em um `Promise.race` com timeout (~30s) ou usar `req.on('close')` + `AbortController` para cancelar a serialização quando o cliente desconectar. Retornar 504 com mensagem clara em caso de timeout. Tactic alvo: **Bound Execution Times**.

**Resultado Esperado**
> p99 do handler limitado por construção a 30s (vs ilimitado hoje). Conexões Postgres liberadas se o cliente abortar. Mensagem clara para o analista em vez de "spinner infinito".

**Métricas de sucesso**
- Timeout máximo do handler: ∞ → 30s
- Conexões pg vazadas por exports abandonados: alvo 0

**Risco de não fazer**: durante incidente no Supabase, exports pendurados agravam a saturação do pool e pioram o sintoma para todos.

**Dependências**: idealmente após `performance-1` (cache) para reduzir a chance de timeout legítimo.

---

### [security-2] Incluir identidade do ator (`req.user.sub`/`email`) no audit log do export

**QA**: Security
**Tactic alvo**: Audit Trail
**Esforço**: S (≤1d — assinatura do método + teste; o serviço já recebe `requestId`)
**Findings**: F-security-2

**Problema**
> O `RelatorioExportService.exportar()` loga `{requestId, tipo, linhas}` mas não a identidade de quem fez a exportação, divergindo de todas as 9 ações mutadoras do mesmo router (`/eleicao`, `/ingestao`, `/processar`, `/reconciliar`, `/cliente-filtro` POST, `/borderos/*`) que já capturam `triggeredBy = req.user?.sub ?? req.user?.email`. Sem isso, incidentes de exfiltração ("quem baixou o relatório de clientes ontem?") só podem ser correlacionados via log de auth-middleware (método+URL+timestamp), que não é determinístico sob concorrência.

**Melhoria Proposta**
> Adicionar parâmetro `triggeredBy: string` em `RelatorioExportService.exportar()` (ou passar o `req.user` inteiro) e incluí-lo em `logService.info({...data: {requestId, tipo, linhas, triggeredBy}})`. Atualizar o handler em `routes/permutas.ts:371-386` para derivar `req.user?.sub ?? req.user?.email ?? 'unknown'` (idêntico aos irmãos). Tactic alvo: **Audit Trail**.

**Resultado Esperado**
> Cada execução de export tem rastro `quem + quando + o quê + tamanho`. Métrica: ações sensíveis de Permutas com `triggeredBy` no log: 9/10 → 10/10 (100%).

**Métricas de sucesso**
- Cobertura de `triggeredBy` em ações sensíveis (mutações + exports) de `/permutas/*`: 9/10 → 10/10
- Tempo médio para responder "quem exportou X em Y?" via grep no log de produção: indeterminado → O(1)

**Risco de não fazer**: investigação forense de vazamento fica restrita a logs de infra (auth-middleware sem `sub`); responder a auditoria de compliance vira trabalho manual de correlação por janela de tempo.

**Dependências**: Nenhuma (alteração local no service + handler)

---

## P3 — Baixo

### [availability-4] Classificar erros do export (4xx-input / 503-transient / 500-permanent) com toast acionável

**QA**: Availability
**Tactic alvo**: Exception Detection / Retry
**Esforço**: S
**Findings**: F-availability-4

**Problema**
> Hoje qualquer falha do export vira `500 {error:"Internal server error"}` no BE (`errorMiddleware.ts:35`) e `toast.error("Falha ao exportar … API 500")` no FE (`api.ts:439`, `page.tsx:688`). Analista não tem como saber se vale clicar de novo ou abrir chamado — e o time não consegue plotar alarme específico por causa raiz.

**Melhoria Proposta**
> No handler do export, capturar explicitamente:
> - `ZodError`/validação → `400 {code:"INVALID_TYPE"}` (já feito);
> - erros transitórios do pool pg (`ECONNRESET`/`timeout`) → `503 {code:"TRANSIENT", retryable:true}`;
> - exceções do exceljs / projeção → `500 {code:"EXPORT_FAILURE", retryable:false}`.
>
> FE diferencia toast: `retryable=true` mostra `toast.error(... , { action: { label: "Tentar de novo", onClick } })`. Tactic Bass: **Exception Detection** (granularidade) + **Retry** (opt-in pelo usuário, sem retry implícito que mascara causa).

**Resultado Esperado**
> Categorias de erro visíveis ao operador: **1 (500 genérico) → 3+ (400/503/500 com `code`)**. Métrica plotável por categoria.

**Métricas de sucesso**
- códigos de erro distintos retornados pelo export: 1 → ≥3
- toast com ação "Tentar de novo" em erros `retryable=true`: 0 → presente

**Risco de não fazer**: analista perde tempo (e arquivos) em erros não retriáveis; time perde sinal de monitoração quando o export começar a falhar consistentemente.

**Dependências**: card `availability-3` ajuda (timeout dedicado classifica como 504/transient).

---

### [deployability-2] Smoke test post-deploy da rota de export

**QA**: Deployability
**Tactic alvo**: Deployment Observability
**Esforço**: S (≤1d)
**Findings**: F-deployability-2

**Problema**
> O CI termina em build/tag; não há verificação automatizada pós-redeploy (Render/Vercel) de que a nova rota `GET /permutas/relatorios/:tipo` responde 200 com `Content-Type` correto. Regressões de runtime (env, dependência transitiva, build do Render) só aparecem quando o time financeiro tenta usar.

**Melhoria Proposta**
> Adicionar job opcional `post-deploy-smoke` no `.github/workflows/ci.yml` (ou um cron leve) que, com credencial de service account, faça `HEAD /permutas/relatorios/<tipo>` em prd após o redeploy e abra issue automática em caso de falha. Alternativa low-cost: um check do tipo `curl -fI` no `health` endpoint existente como bare-minimum. Tactic alvo: **Deployment Observability**.

**Resultado Esperado**
> Falha de runtime na rota nova detectada em ≤5 min após deploy, sem depender de usuário-relatador.

**Métricas de sucesso**
- Smoke tests post-deploy executados: 0 → 1
- Lead-time-to-detect regressão de runtime: manual (horas/dias) → ≤5 min

**Risco de não fazer**: regressões silenciosas continuam descobertas por usuário; baixo impacto enquanto o produto é único-tenant, cresce quando multi-tenant chegar.

**Dependências**: requer um endpoint/credencial de service account válido em prd (pode usar o token estável usado pelo Yuri).

---

### [integrability-3] Versionar a rota de relatórios (`/v1/permutas/relatorios/:tipo`) antes de expor a 3rd parties

**QA**: Integrability
**Tactic alvo**: Versioning Strategy
**Esforço**: S (≤1d) (decisão + ADR; implementação ocorre na primeira rota externa)
**Findings**: F-integrability-2

**Problema**
> A rota `GET /permutas/relatorios/:tipo` não carrega prefixo de versão (`/v1/`) nem header `api-version`. Hoje é aceitável (FE+BE lockstep no monorepo), mas qualquer expansão para consumo externo (script Power BI, planilha do cliente, Make/Zapier) congela o schema atual sem caminho de evolução.

**Melhoria Proposta**
> Aplicar a tactic **Versioning Strategy**: definir convenção (`/api/v1/...` ou header `X-Api-Version`) **na próxima feature** que expuser uma rota a fora-do-monorepo. Para esta feature, registrar a decisão no ADR (a rota atual fica como v0/interna).

**Resultado Esperado**
> Política explícita de versionamento documentada. Métrica: 0% → 100% das rotas externas com versão.

**Métricas de sucesso**
- ADR de versionamento de API publicado
- Convenção `/v1/` aplicada a 100% das rotas com consumidor não-monorepo (alvo futuro)

**Risco de não fazer**: breaking change forçado em integração externa quando o primeiro consumidor 3rd-party aparecer.

**Dependências**: alinhar com qa-modifiability (mesma decisão alimenta a evolução de schema).

---

### [integrability-4] Definir limite de tamanho (linhas/bytes) para export xlsx

**QA**: Integrability — overlap com `availability-2` + `performance-3` (mesma raiz; intervenções complementares)
**Tactic alvo**: Manage Resources
**Esforço**: S (≤1d)
**Findings**: F-integrability-4

**Problema**
> O export materializa o workbook inteiro em memória via `workbook.xlsx.writeBuffer()` e responde com `res.send(buffer)` — sem streaming nem teto. Hoje o universo do `/gestao` é pequeno, mas se o histórico crescer (>50k linhas) ou múltiplos exports rodarem concorrentes, há risco de OOM no host (Render hoje, Lambda no alvo).

**Melhoria Proposta**
> Aplicar a tactic **Manage Resources**: (a) limitar `definicao.linhas.length` por tipo (constante `MAX_LINHAS_EXPORT`) com 413/422 se exceder, e/ou (b) trocar `writeBuffer()` por `write(stream)` quando o tamanho passar de um teto. Documentar o limite no ADR e na descrição do menu.

**Resultado Esperado**
> Export degrada graciosamente (erro com mensagem clara) em vez de derrubar o host. Métrica: 0 → 1 limite explícito; 0 → 1 alerta de memória dimensionado por export.

**Métricas de sucesso**
- Limite máximo de linhas por export: ∞ → constante explícita (ex.: 100k)
- Resposta a payload acima do limite: OOM silencioso → 413/422 com mensagem

**Risco de não fazer**: incidente de produção difícil de reproduzir quando o universo crescer (OOM em host compartilhado).

**Dependências**: alinhar com qa-performance (mesma evidência alimenta o card de carga).

---

### [modifiability-2] Registry `Map<RelatorioTipo, ProjecaoDefinicao>` (opcional, post-MVP)

**QA**: Modifiability
**Tactic alvo**: Defer Binding — polymorphism
**Esforço**: S (≤1d) — **adiar até trigger** (catálogo >10 relatórios)
**Findings**: F-modifiability-2

**Problema**
> Adicionar um relatório novo hoje requer 5 mudanças coordenadas (enum, switch, def*, título, FE descritor). O `switch` em `montarDefinicao` (`RelatorioExportService.ts:69-90`) cresce 1 case por relatório e o `TITULO_POR_TIPO` cresce 1 entrada — duas tabelas paralelas a manter.

**Melhoria Proposta**
> Substituir `switch` + `TITULO_POR_TIPO` por um único `REGISTRY: Record<RelatorioTipo, { titulo: string; build: (g: GestaoPermutasResponse) => RelatorioDefinicao }>` colocado próximo às projeções. `montarDefinicao` vira `REGISTRY[tipo].build(gestao)`. Tactic: **Defer Binding — polymorphism** + **Increase Semantic Coherence**.

**Resultado Esperado**
> Adicionar relatório = adicionar 1 entrada no registry BE (+ sincronização FE coberta pelo card modifiability-1).

**Métricas de sucesso**
- Tabelas paralelas para "o que é um relatório" (BE): 2 (`switch` + `TITULO_POR_TIPO`) → 1 (`REGISTRY`)
- Linhas tocadas para adicionar relatório novo no service: ~30 → ~10

**Risco de não fazer**: Baixo até ~10 relatórios. Acima disso o `switch` fica visualmente pesado e o risco de esquecer um lugar cresce.

**Dependências**: pode ser feito antes ou depois de `modifiability-1`; ortogonal.

---

### [modifiability-3] Consolidar rótulos humanos (BE aba/arquivo × FE label)

**QA**: Modifiability
**Tactic alvo**: Defer Binding — configuration
**Esforço**: S (≤1d, junto com `modifiability-1`)
**Findings**: F-modifiability-3

**Problema**
> BE tem `TITULO_POR_TIPO` (ASCII puro, usado em nome de aba e arquivo .xlsx) e FE tem `RELATORIOS_DISPONIVEIS[].label` (pt-BR com acento, usado no menu). São dois conjuntos de 6 strings com semântica acoplada — renomeação exige tocar os dois.

**Melhoria Proposta**
> Se o card `modifiability-1` for via pacote compartilhado: incluir `{ tipo, label, slug }` no descritor único, com `label` pt-BR para UI e `slug` ASCII para nome de aba/arquivo. Tactic: **Defer Binding — configuration**.

**Resultado Esperado**
> Renomear "Quebra por cliente" → "Visão por cliente" toca 1 lugar.

**Métricas de sucesso**
- Strings de rótulo: 12 (6 BE + 6 FE) → 6 (descritor único com `label`+`slug`)

**Risco de não fazer**: Mínimo. Inconsistências cosméticas eventuais em xlsx vs UI (já existe: "Ja permutado" vs "Já permutado").

**Dependências**: melhor casado com `modifiability-1`.

---

### [modifiability-4] Extrair política de largura de coluna (post-MVP)

**QA**: Modifiability
**Tactic alvo**: Defer Binding — configuration
**Esforço**: S (≤1d, quando o trigger aparecer) — **adiar até segunda mudança de política de largura**
**Findings**: F-modifiability-4

**Problema**
> Larguras de coluna estão inline em ~60 literais em 4 projeções (`RelatorioExportService.ts:102-352`). Mudar política (ex.: padronizar coluna monetária = 20) exige caçar literais.

**Melhoria Proposta**
> Quando uma segunda mudança de largura aparecer, extrair `LARGURAS = { documento: 16, processo: 14, moeda: 8, valorMoeda: 18, valorBrl: 16, ... }` e referenciar nas colunas. Tactic: **Defer Binding — configuration**. **Adiar até segunda mudança** — extrair agora é overengineering.

**Resultado Esperado**
> Política de largura num único objeto.

**Métricas de sucesso**
- Literais `width:` em projeções: ~60 → ~30 (apenas overrides)

**Risco de não fazer**: Nenhum hoje. Vira incômodo se o time mudar padrão de largura mais de uma vez.

**Dependências**: aguardar segundo pedido de "ajustar coluna X em todos os relatórios".

---

### [fault-tolerance-1] Sanitizar mensagem de erro do toast de exportação

**QA**: Fault Tolerance
**Tactic alvo**: Sanity Checking
**Esforço**: S (≤1d)
**Findings**: F-fault-tolerance-1

**Problema**
> O `catch` da exportação concatena `err.message` direto no toast (`page.tsx:687-690`). Hoje o `errorMiddleware` devolve sempre `{ error: 'Internal server error' }`, então não há vazamento; mas o acoplamento UX ↔ payload técnico é frágil: qualquer evolução no contrato de erro do backend pode passar a expor detalhe interno ao analista.

**Melhoria Proposta**
> Mapear no helper `exportarRelatorio` (e/ou na função `exportar` da página) os status HTTP conhecidos para mensagens humanas estáveis em pt-BR ("Sessão expirada", "Falha temporária no serviço, tente novamente", "Tipo de relatório inválido"), e omitir o sufixo técnico quando não houver mensagem de domínio. Tactic alvo: **Sanity Checking** na fronteira UI.

**Resultado Esperado**
> Toasts de export passam a exibir 100% mensagens curadas em pt-BR; nenhum `err.message` cru visível ao usuário final.

**Métricas de sucesso**
- `toast.error` exibindo `err.message` cru no fluxo de export: 1 → 0
- Códigos HTTP mapeados explicitamente (401/400/500): 0 → 3

**Risco de não fazer**: baixo — apenas regressão de UX se um futuro endpoint de relatório passar a devolver erros mais detalhados sem sanitização.

**Dependências**: Nenhuma

---

### [security-3] Aplicar `heavyRouteLimiter` (ou limiter dedicado) no export de relatórios

**QA**: Security — **SUBSUMED-BY `performance-2`** (mesma intervenção; não duplicar PR)
**Tactic alvo**: Limit Access
**Esforço**: S (≤1d — um decorator no router + um teste de 429)
**Findings**: F-security-3

**Problema**
> O endpoint de export usa só o `globalLimiter` (100/min), permitindo até 100 .xlsx por minuto por cliente. Cada export executa 1× `GestaoPermutasService.exporGestao` + serialização `exceljs.writeBuffer` (CPU-bound síncrono em userland). Tráfego abusivo (script, credencial vazada) tanto amplifica exfiltração quanto pressiona CPU/memória da própria instância, degradando UX de quem está usando `/gestao` na UI.

**Melhoria Proposta**
> Anexar `heavyRouteLimiter` (10/min, já existente — `src/backend/http/rateLimit.ts`) na rota nova, por paridade com as outras rotas pesadas (`/eleicao`, `/ingestao`, `/reconciliar`, `/borderos/*/finalizar|cancelar|estornar|excluir`). Avaliar criar `exportLimiter` (ex: 6/min) se 10/min for sentido frouxo para um humano (1 export por relatório por minuto). Tactic alvo: **Limit Access** + **Detect Service Denial**.

**Resultado Esperado**
> Teto de exports por minuto/cliente cai de 100 para 10 (ou 6). Sem mudança perceptível para uso humano normal (1–3 exports / sessão).

**Métricas de sucesso**
- Teto de export `.xlsx` por minuto por IP: 100 → 10
- Risco de exhausting CPU via export-loop: presente → mitigado (rate-limit cobre o vetor)

**Risco de não fazer**: hoje irrelevante (baixo tráfego); vira P2 conforme a base de usuários cresce.

**Dependências**: Nenhuma

---

### [testability-1] Adicionar smoke test ao `exportarRelatorio` (FE) cobrindo download blob + erro HTTP

**QA**: Testability
**Tactic alvo**: Specialized Interfaces · Sandbox
**Esforço**: S (≤1d, ~1h)
**Findings**: F-testability-1

**Problema**
> A função `exportarRelatorio(tipo)` em `src/frontend/lib/api.ts:429` orquestra `fetch → blob → URL.createObjectURL → <a download> click → revokeObjectURL` sem nenhum teste. Regressão em parsing de Content-Disposition ou em `revokeObjectURL` só é capturada manualmente.

**Melhoria Proposta**
> Criar `src/frontend/lib/api.test.ts` (jsdom) com dois casos: (a) sucesso — mock de `fetch` retornando `Response` com header `content-disposition`, mock de `URL.createObjectURL/revokeObjectURL`, asserts em `anchor.download === filename` e em `revokeObjectURL` chamado no finally; (b) erro — `res.ok=false` lança `Error('API 500…')`. Tactic Bass alvo: **Specialized Interfaces** (a função já é o seam, falta exercitá-lo).

**Resultado Esperado**
> Função `exportarRelatorio` passa de 0 → ≥ 2 casos. Cobertura de `src/frontend/lib/api.ts` sobe na linha da função (pelo menos +1 % no arquivo). Regressão de filename / leak de blob é detectada em CI.

**Métricas de sucesso**
- Testes para `exportarRelatorio`: 0 → 2
- Frontend suite: 51 → 53 testes

**Risco de não fazer**: regressão silenciosa no fluxo de download (nome errado, blob vazado) percebida só pelo usuário final.

**Dependências**: Nenhuma

---

### [testability-2] Smoke test do popover "Exportar" em `page.tsx` (estado `exportando` + disable concorrente)

**QA**: Testability
**Tactic alvo**: Observability · Executable Assertions
**Esforço**: S (≤1d, ~2h — montar o harness vale mais que o teste em si)
**Findings**: F-testability-2

**Problema**
> O popover de exportação introduz estado `exportando: RelatorioTipo | null` e desabilita o botão durante o request (`page.tsx:680, 1184-1212`). Não há teste; dois cliques concorrentes ou erro que escape do try/finally só seriam vistos em produção.

**Melhoria Proposta**
> Criar `src/frontend/app/permutas/page.test.tsx` (jsdom + Testing Library + msw OU mock de `exportarRelatorio`) com 1 caso mínimo: abrir popover, clicar item, asserir que botão fica `disabled` durante a promise pendente e volta a habilitar no resolve. Tactic Bass alvo: **Observability** (asserir transição de estado UI).

**Resultado Esperado**
> Página de Permutas ganha sua primeira página-test (smoke). Cobertura de `page.tsx` sai de 0 → > 0 % (apenas no fluxo do popover). Race de duplo-clique no Exportar fica defendida em CI.

**Métricas de sucesso**
- Testes para popover Exportar: 0 → 1
- `page.tsx` deixa de ser 100 % untested

**Risco de não fazer**: débito de testabilidade da página principal continua (a feature não piorou nada; só não consertou).

**Dependências**: Nenhuma; precedente útil para futuras features na mesma página.

---

### [testability-3] Fechar gap de cobertura nas linhas 233 e 369 do `RelatorioExportService`

**QA**: Testability
**Tactic alvo**: Recordable Test Cases · Executable Assertions
**Esforço**: S (≤30min)
**Findings**: F-testability-3

**Problema**
> Branches defensivos (`importador` vindo só da invoice; cardinalidade `N:M` com múltiplos adtos **e** múltiplas invoices) não estão na fixture. Coverage 98.31 % lines / 85.86 % branches.

**Melhoria Proposta**
> Acrescentar 1 invoice extra ao processo `2048` na fixture do `RelatorioExportService.test.ts` (para forçar N:M) e remover o `importador` do adto `A2` (para forçar a linha 233 — herdar de invoice). Adicionar 1 expect em `reconciliacao-processo` para `cardinalidade === 'N:M'`. Tactic Bass alvo: **Recordable Test Cases** (enriquecer a fixture canônica).

**Resultado Esperado**
> `RelatorioExportService.ts`: branches 85.86 % → ≥ 92 %; lines 98.31 % → 100 %.

**Métricas de sucesso**
- Lines uncovered no service: 2 → 0
- Branch coverage: 85.86 % → ≥ 92 %

**Risco de não fazer**: nenhum — é polimento; a feature já está bem coberta.

**Dependências**: Nenhuma
