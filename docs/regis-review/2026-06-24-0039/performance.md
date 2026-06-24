---
qa: Performance
qa_slug: performance
run_id: 2026-06-24-0039
agent: qa-performance
generated_at: 2026-06-24T00:39:00-03:00
scope: all
score: 5
findings_count: 7
cards_count: 7
---

# Performance — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista financeiro abre/atualiza a tela `permutas/borderos` (após inatividade do free tier Render) | 1 request GET /permutas/borderos que dispara N=`|filiais|` calls `fin010/list` (pageSize 200/filial) e o FE renderiza 100% dos borderôs sem virtualização | `BorderoGestaoService.listarBorderos` + `ConexosClient.listBorderos` + `app/permutas/borderos/page.tsx` | Operação normal (1 filial ativa hoje) + cold-start eventual no Render free | Listagem aparece com status vivo do ERP; ações de aprovar/excluir respondem em segundos | P95 listarBorderos (warm) ≤ 1.5s; P95 reconciliar (1 par) ≤ 3s; cold-start ≤ 5s (alvo Render Starter) vs ≥50s (free atual) |
| Analista executa "Reconciliar" em 1 adto com K invoices alocadas | 1 POST → loop sequencial de pares; por par: 5 chamadas ao ERP (criar borderô só na 1ª) + 1 chamada extra `getBordero` na idempotência viva quando há prévio `settled` | `ReconciliacaoPermutaService.reconciliar` + `executarBaixa` (handshake) | Operação normal (escrita habilitada) | Cada par baixa em ≤ 3s; falha de 1 par não impede o próximo (já garantido por try/catch) | P95 reconciliar(K=1) 4–8s → 2–3s; P95 reconciliar(K=5) ≈40s → ≈12s |

> Cenário-base do escopo Fase 3.1: o usuário-painel é tipicamente 1 analista por vez (não há pico de concorrência), mas a **latência percebida** é o gargalo dominante — não throughput.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Chamadas ERP por reconciliar(K=1) | **6** (5 handshake + 1 `getBordero` idempotência) | ≤ 5 (não pagar a chamada extra quando não há prévio) | ⚠️ | `ReconciliacaoPermutaService.ts:130-147` + `executarBaixa` 223,260,281,316 + `criarBordero` 168 |
| Chamadas ERP por reconciliar(K) | 1 (criarBordero) + K×(5 ou 6) | 1 + K×5 (idempotência sem custo no caminho frio) | ⚠️ | mesmo arquivo, loop em 103 |
| Latência observada reconciliar real | ~4–8s por par (logs sessão Yuri) | P95 ≤ 3s/par (warm) | ⚠️ | `_shared-metrics.md` + relato sessão |
| pageSize `fin010/list` | **200** (constante, sem paginação real) | ≥ 1k OU paginação verdadeira com bookmark | ❌ | `ConexosClient.ts:1225,1243` |
| Chamadas ERP por `listarBorderos` | N=`|filiais|` paralelas (hoje 1; teto = filiais da trilha ∪ default) | ≤ N (já mínimo razoável; falta cache curto) | ✅ | `BorderoGestaoService.ts:296-307` |
| Rows renderizadas no FE da aba Borderôs | TODOS (observado "200 de 200") sem virtualização nem paginação cliente | ≤ 50 por página OU virtualização para > 100 | ❌ | `app/permutas/borderos/page.tsx:319-525` |
| Cache backend para `listarBorderos` | **0** (cada refresh re-bate o ERP) | TTL 5–15s (in-mem por filial) | ❌ | inexistente; `BorderoGestaoService.ts:278-353` |
| ETag / `Cache-Control` em GET `/permutas/borderos` | **ausente** | `Cache-Control: private, max-age=10` + ETag para 304 | ❌ | `grep ETag/Cache-Control` em `src/backend` → 0 hits |
| Cold-start Render free tier (spin-down) | **≥ 50s** (medido sessão) | ≤ 5s (Starter plan) ou 0 (always-on) | ❌ | `_shared-metrics.md` (linha 45) |
| Cache local `getDetalheTitulos` (intra-call) | **ausente** — comentário no código diz "caller cache by docCod" mas EleicaoPermutas não cacheia | Map por execução | ⚠️ | `ConexosClient.ts:895` (comentário) |
| `idleTimeoutMillis`/keepAlive HTTP no ERP | Não verificável no escopo (vive no `services/conexos.ts` legacy) | keep-alive HTTP agent + pool reuso | ⚠️ não medível | ver legacy `ConexosService` (fora do diff) |
| Backend `dependencies` count | 14 | ≤ 15 | ✅ | `src/backend/package.json` (shared-metrics) |
| Frontend `dependencies` count | 22 | ≤ 25 razoável p/ Next 15 | ✅ | `src/frontend/package.json` |

> ⚠️ **Não medível localmente**: P95 fim-a-fim em produção (Render+Vercel) e bundle First-Load-JS por rota Next. O bundle do FE não foi rodado (`--quick` mode). Recomenda-se rodar `cd src/frontend && npm run build` em CI dedicado e capturar a tabela de bundles.
> ⚠️ **Não medível localmente**: latência ERP Conexos por chamada (depende da rede VPN-style do tenant); valor 4–8s para o reconciliar foi reportado nos logs da sessão pelo usuário.

## 3. Tactics — Cobertura no nf-projects

### Control Resource Demand

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Manage Sampling Rate | N/A para web user-facing (não há stream amostrável) | N/A | — |
| Limit Event Response | Loop sequencial por par em `reconciliar` impõe ordem; nada protege contra K explodindo | ⚠️ parcial | `ReconciliacaoPermutaService.ts:103` |
| Prioritize Events | Sem fila de prioridade — analista é único cliente | N/A | — |
| Reduce Overhead | Handshake do `fin010` exige 5 chamadas (contrato do ERP, não evitável); a 6ª (`getBordero` na idempotência viva) só dispara quando há prévio settled — porém sem cache curto vira gasto repetido | ⚠️ parcial | `ReconciliacaoPermutaService.ts:130-147` |
| Bound Execution Times | Sem `timeout` explícito no GET `/borderos` nem nas chamadas `axios` do legacy `ConexosService` no escopo da sessão — uma chamada lenta pode prender o request inteiro | ❌ ausente | grep `timeout` no `ConexosClient.ts` da sessão → 0 hits |
| Increase Resource Efficiency | `Promise.all` em `listarBorderos` é o mínimo necessário; falta cache + paginação real | ⚠️ parcial | `BorderoGestaoService.ts:296-307` |

### Manage Resources

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Introduce Concurrency | `Promise.all` por filial no list + paralelismo intra-`listFinanceiroAPagarByGerNum` | ✅ presente | `BorderoGestaoService.ts:296`; `ConexosClient.ts:794` |
| Maintain Multiple Copies of Computations | Sem replicação (single Lambda/Render) — N/A no estado atual | N/A | — |
| Maintain Multiple Copies of Data (cache) | `getDetalheTitulos` comenta que o caller deveria cachear por docCod — ninguém cacheia. Lista de borderôs sem TTL | ❌ ausente | `ConexosClient.ts:895` (comentário órfão) |
| Bound Queue Sizes | N/A (sem fila) — mas `K` de pares por reconciliar não tem teto explícito | ⚠️ parcial | `ReconciliacaoPermutaService.ts:103` |
| Schedule Resources | Sem scheduler (ingestão 3x/dia via GH Actions cron — fora do escopo desta sessão) | N/A no escopo | — |

### Modern / cross-cutting

| Facet | Implementação atual | Status | Evidência |
|---|---|---|---|
| Cold-start budget | Render free tier spin-down ≥50s mata o P95 do primeiro request do dia | ❌ ausente | `_shared-metrics.md` linha 45 |
| Cache strategy (HTTP) | Nenhum `Cache-Control` / ETag nos endpoints de leitura | ❌ ausente | grep nas rotas |
| Index discipline | Repos novos da sessão (`PermutaExecucaoRepository`) usam parametrizado; falta verificar índice em `(bor_cod)` e `(idempotency_key)` — schema em migrations sem checagem nesta sessão | ⚠️ parcial | `migrations/0016_permuta_alocacao_data_base.sql` (só essa nova) |
| Bundle leanness (FE) | Não medido na sessão (modo quick); 22 deps + lucide-react + sonner indicam volume típico, não excessivo | ⚠️ não medível | — |

## 4. Findings (achados)

### F-performance-1: Reconciliar paga 6 chamadas ERP por par quando há prévio `settled` (idempotência viva)

- **Severidade**: P1
- **Tactic violada**: Reduce Overhead / Maintain Multiple Copies of Data (cache)
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:130-147` (chamada `borderoAindaValido` → `getBordero`), `476-487`
- **Evidência (objetiva)**:
  ```ts
  // linha 130
  const existente = await this.execucaoRepository.findByIdempotencyKey(key);
  if (existente?.status === 'settled') {
      const baixaAindaValida = await this.borderoAindaValido(filCod, existente.borCod);
      // ↑ chamada extra getBordero (HTTP ERP) ANTES de decidir skip
  ```
  e `borderoAindaValido` (linha 479) faz `await this.conexosClient.getBordero(...)`.
- **Impacto técnico**: Latência adicional de 1 round-trip ERP por par já settled. Em reconciliações repetidas (usuário clica "Reconciliar" 2x) cada par paga 6 calls em vez de 5; em K=5 pares isso vira **K calls extras** dentro do loop sequencial.
- **Impacto de negócio**: Analista percebe que "reexecutar não é instantâneo" — fica em ~K segundos mesmo quando tudo seria skipped. Esconde a vantagem da idempotência.
- **Métrica de baseline**: 6 calls/par com prévio vs. 5 sem; K=5 → 30 calls em vez de 25 (latência observada 4–8s/par → ~5s extras totais).

### F-performance-2: pageSize fixo 200 em `fin010/list` sem paginação real

- **Severidade**: P1
- **Tactic violada**: Limit Event Response / Bound Queue Sizes
- **Localização**: `src/backend/domain/client/ConexosClient.ts:1225` (`pageSize = 200`), `1243` (uso); `1099-1108` (`listBaixas` também `pageSize: 200`, mas escopo restrito a 1 borderô)
- **Evidência (objetiva)**:
  ```ts
  // linha 1221
  public listBorderos = async (params: {
      filCod: number;
      pageSize?: number;
  }): Promise<BorderoListaItem[]> => {
      const { filCod, pageSize = 200 } = params;
  ```
  Sem loop `paginate` (presente no resto da classe para `imp021`/`com298`) — só `pageNumber: 1`. Se o ERP tem mais de 200 borderôs de permuta na filial, os mais antigos **somem da tela** silenciosamente.
- **Impacto técnico**: Volume cresce monotonicamente; quando ultrapassar 200 borderôs por filial, a lista decapita os mais antigos (ordenação DESC por borCod) sem aviso. Tanto a FE quanto o backend assumem "lista completa".
- **Impacto de negócio**: Borderô antigo torna-se invisível na tela de gestão → auditoria/estorno passa a precisar abrir o ERP direto. Quando explodir, ninguém vai notar imediatamente.
- **Métrica de baseline**: hoje "200 de 200" observado pelo Yuri = lista bate o teto em produção mas a Columbia tem 1 filial ativa e a frente é nova (sem confirmação se já há > 200 borderôs de permuta históricos). **Mensurável agora**: contar borderôs no ERP por filial via curl manual.

### F-performance-3: Frontend renderiza todos os borderôs sem virtualização / paginação cliente

- **Severidade**: P2
- **Tactic violada**: Limit Event Response / Reduce Overhead (lado cliente)
- **Localização**: `src/frontend/app/permutas/borderos/page.tsx:319-525` (`{lista.map(...)}` sem `react-window`/virtualização nem paginação)
- **Evidência (objetiva)**:
  ```tsx
  // linha 335
  {lista.map((b) => {
      const aberto = expandido === b.borCod
      return ( <React.Fragment ...> <TableRow ...> ...
  ```
  Cada linha contém Badges, 5 botões de ação, expandível com sub-tabela. 200 linhas = ~200 × (Table cells + Buttons + Badge + ConditionalChevron) no DOM.
- **Impacto técnico**: Tempo de render inicial cresce linear com `lista.length`. Em 200 linhas com a complexidade atual da row (5 botões + sub-tabela renderizada quando expandido), o React reconcile fica notável. Filtros mudam frequentemente — cada change re-renderiza a lista inteira (filter rodando em todos os campos).
- **Impacto de negócio**: UX trava quando a lista cresce (> 500 itens). No teto atual (200) o sintoma é mascarado — débito que só aparece quando a frente envelhecer.
- **Métrica de baseline**: 200 rows × estimativa ~15ms first paint → ~3s. Hoje não é problema; em 1k linhas vira P95 ≥ 8s no browser.

### F-performance-4: Sem cache backend nem ETag em `GET /permutas/borderos` — cada refresh re-bate o ERP

- **Severidade**: P1
- **Tactic violada**: Maintain Multiple Copies of Data (cache) / Reduce Overhead
- **Localização**: `src/backend/routes/permutas.ts:411-417` (rota); `BorderoGestaoService.ts:278-353` (sem cache); grep `Cache-Control|ETag` em `src/backend` = 0 hits
- **Evidência (objetiva)**:
  ```ts
  // routes/permutas.ts ~411
  router.get('/borderos', async (req, res) => {
      const borderos = await service.listarBorderos();
      res.json({ borderos, geradoEm: new Date().toISOString(), requestId: req.requestId });
  });
  ```
  Cada `setLoading(true); fetchBorderos()` do FE (botão "Atualizar" + montagem do componente) dispara N chamadas paralelas ao ERP + 1 query `listComBordero` no Postgres.
- **Impacto técnico**: Analista que clica "Atualizar" 5x em 30s consome 5× a carga do ERP — sem motivo (o ERP muda lento). Não há header `Cache-Control: private, max-age=10` nem ETag para 304.
- **Impacto de negócio**: Pressão desnecessária no ERP Conexos (compartilhado com `fechamento-processos` no mesmo tenant). Em horário de pico (fechamento mensal) competimos com leituras pesadas do FM.
- **Métrica de baseline**: hoje N=1 chamada ERP/refresh; alvo: ≤ 1 chamada ERP a cada 10s por filial (TTL 10s in-mem) — economia ≈ 80% em sessões de revisão típicas (5–6 refreshes em < 1min).

### F-performance-5: Cold-start Render free tier ≥50s degrada P95 do primeiro acesso

- **Severidade**: P1
- **Tactic violada**: Bound Execution Times / cold-start budget
- **Localização**: `render.yaml` (free tier — não verificado nesta sessão mas declarado em `_shared-metrics.md`); aplicação inteira
- **Evidência (objetiva)**:
  ```
  _shared-metrics.md linha 45:
  Render (backend free tier, spin-down após inatividade)
  Sessão: cold start ≥50s já medido
  ```
- **Impacto técnico**: Primeiro request após período de inatividade espera o container subir; navegador desiste (timeout default fetch alguns segundos? FE usa `fetch` sem `signal: AbortSignal.timeout(...)` aparente). Toast de erro genérico esconde a causa real.
- **Impacto de negócio**: Analista abre a tela pela manhã, vê erro/spinner por 50s, perde confiança no sistema. P95 fim-a-fim do primeiro request do dia = inaceitável.
- **Métrica de baseline**: cold start ≥50s observado → alvo ≤ 5s (Render Starter, ~7 USD/mês) ou ≤ 1s (Background worker keep-alive de 10min via cron-ping interno).

### F-performance-6: Loop sequencial em `reconciliar` paga K × latência ERP em vez de poder paralelizar

- **Severidade**: P2
- **Tactic violada**: Introduce Concurrency
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:103-196` (`for (const aloc of alocacoes)`)
- **Evidência (objetiva)**:
  ```ts
  for (const aloc of alocacoes) {
      // ... idempotência viva ...
      // ... criar borderô só na 1ª iteração ...
      const resultado = await this.executarBaixa({ key, borCod, filCod, aloc });
  ```
  Cada par é executado em série; com K=5 pares e 4–8s/par o total fica 20–40s. O contrato do `fin010` exige que `criarBordero` aconteça **antes** dos pares — mas as 4 chamadas do handshake (validar título, validar permuta, atualizar líquido, gravar) **dentro** de um par podem ficar em paralelo entre pares (compartilham `borCod` mas são por `invoiceDocCod`).
- **Impacto técnico**: Latência percebida cresce linear com K. O risco é o contrato do ERP `fin010` não suportar paralelismo (lock no `borCod`) — precisa probe antes de paralelizar.
- **Impacto de negócio**: Reconciliação em lote (que é o caminho realmente útil) demora "K vezes uma baixa" — análise sente que escala mal.
- **Métrica de baseline**: K=5 sequencial ≈ 30s; com paralelismo (se ERP aceitar) ≈ 6–10s. **Pré-requisito**: probe do `fin010` confirmando que múltiplas baixas concorrentes no mesmo borderô não falham.

### F-performance-7: `getDetalheTitulos` documenta um cache que ninguém implementa

- **Severidade**: P3
- **Tactic violada**: Maintain Multiple Copies of Data (cache)
- **Localização**: `src/backend/domain/client/ConexosClient.ts:895` (comentário: "Caller is expected to cache by `docCod` per execution to avoid redundant calls"); `EleicaoPermutasService` (não cacheia)
- **Evidência (objetiva)**:
  ```ts
  // linha 895 (ConexosClient.ts)
  * **Consumers:** `EleicaoPermutasService` (Gate 2 ... + Gate 3 `pago`).
  * One call per PROFORMA candidate. Caller is expected to cache by `docCod` per
  * execution to avoid redundant calls.
  ```
- **Impacto técnico**: Quando um docCod aparece em múltiplos contextos numa mesma execução (ex.: re-eleição), o detail endpoint é re-chamado. Hoje é tangencial à Fase 3.1 (a sessão atual não toca a eleição), mas é dívida explícita no contrato.
- **Impacto de negócio**: Pequena pressão extra no ERP na elegibilidade diária. Custo invisível enquanto a frente é pequena.
- **Métrica de baseline**: N candidatos PROFORMA por elegibilidade × duplicações ≈ 5–20% (estimativa); alvo: 0 dupes via Map intra-execução.

## 5. Cards Kanban

### [performance-1] Cachear estado do borderô na idempotência viva do reconciliar

- **Problema**
  > Cada par já `settled` chama `getBordero` no ERP antes de decidir skip (`ReconciliacaoPermutaService.ts:130-147`). Em re-execuções com K pares, são K calls extras desnecessárias dentro do loop sequencial.
- **Melhoria Proposta**
  > Memoizar o resultado de `borderoAindaValido` por `(filCod, borCod)` dentro do escopo de UMA chamada `reconciliar` (Map local, não atravessa requests). Tactic Bass: **Maintain Multiple Copies of Data**. Risco zero (escopo de request). Arquivos: `ReconciliacaoPermutaService.ts`.
- **Resultado Esperado**
  > Re-reconciliação de K pares todos `settled` em ≤ 1 call `getBordero` em vez de K. K=5: latência 4–8s → ≤ 1.5s.
- **Tactic alvo**: Maintain Multiple Copies of Data (cache)
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-performance-1
- **Métricas de sucesso**:
  - Calls ERP `getBordero` em reconciliar(K=5) repetido: 5 → 1
  - Latência reconciliar(K=5) totalmente settled: 4–8s → ≤ 1.5s
- **Risco de não fazer**: Analistas evitam clicar "Reconciliar" duas vezes por medo da lentidão, perdendo o valor da idempotência.
- **Dependências**: nenhuma.

### [performance-2] Implementar paginação real em `listBorderos` (sair do pageSize fixo 200)

- **Problema**
  > `ConexosClient.listBorderos` pede apenas `pageNumber: 1` com `pageSize: 200` (linhas 1225,1243). Quando a frente passar de 200 borderôs por filial, os mais antigos somem da tela de gestão sem aviso (ordenação DESC por borCod).
- **Melhoria Proposta**
  > Reusar o helper `paginate` (já existente na classe para `imp021`/`com298`) com `MAX_PAGES` e cap explícito; OU adicionar paginação no FE (carregar mais sob demanda). Tactic Bass: **Limit Event Response**. Logar warning quando `capHit` (igual `listAdiantamentosProforma`).
- **Resultado Esperado**
  > Lista nunca decapita silenciosamente. Quando passar de 200 borderôs, ou paginamos no ERP (até cap defensivo de 2k) ou a UI pagina cliente. Métrica: `# borderôs invisíveis` por filial = 0.
- **Tactic alvo**: Limit Event Response
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-performance-2
- **Métricas de sucesso**:
  - `capHit` flag exposta na resposta: false sempre OU paginação real
  - Borderôs invisíveis por filial: 0
- **Risco de não fazer**: Em 6–18 meses (dependendo do volume real) borderôs antigos desaparecem da tela sem erro; auditoria começa a divergir do ERP.
- **Dependências**: nenhuma (helper `paginate` já existe).

### [performance-3] Cachear `listarBorderos` no backend (TTL curto) + emitir ETag

- **Problema**
  > GET `/permutas/borderos` re-bate o ERP a cada refresh (rotas/permutas.ts:411). Analistas clicam "Atualizar" várias vezes em uma sessão de revisão; sem cache nem ETag, cada clique consome N calls ERP + 1 query no Postgres.
- **Melhoria Proposta**
  > Cache in-memory por filial em `BorderoGestaoService` com TTL 10–15s + `Cache-Control: private, max-age=10` + ETag baseado em hash da lista. Tactic Bass: **Maintain Multiple Copies of Data** + **Reduce Overhead**. Invalidar TTL após mutações (finalizar/cancelar/estornar/excluir).
- **Resultado Esperado**
  > 5–6 refreshes em < 1min consomem 1 call ERP em vez de 5–6. Pressão no ERP Conexos reduzida proporcionalmente.
- **Tactic alvo**: Maintain Multiple Copies of Data (cache)
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-performance-4
- **Métricas de sucesso**:
  - Calls ERP por minuto durante revisão típica: ~5 → ~1 (80% economia)
  - Header `Cache-Control` + ETag presentes em GET `/permutas/borderos`
- **Risco de não fazer**: Stress desnecessário no ERP compartilhado com FM/JVE em horário de fechamento.
- **Dependências**: garantir invalidação após cards `performance-2` (paginação).

### [performance-4] Eliminar cold-start ≥50s do free tier Render

- **Problema**
  > Render free tier dorme após inatividade; primeiro request da manhã espera ≥50s (`_shared-metrics.md`). Browser/usuário desistem; toast de erro genérico esconde a causa.
- **Melhoria Proposta**
  > Decisão de negócio: (a) Render Starter (~7 USD/mês, always-on); OU (b) cron de health-ping a cada 8min (GH Actions já existe para ingestão); OU (c) migrar p/ Vercel Functions + Neon. Tactic Bass: **Bound Execution Times** (cold-start budget). Documentar em ADR.
- **Resultado Esperado**
  > Primeiro request do dia ≤ 5s (Starter) ou ≤ 1s (always-on). P95 fim-a-fim deixa de ter outlier de cold-start.
- **Tactic alvo**: Bound Execution Times (cold-start budget)
- **Severidade**: P1
- **Esforço estimado**: S (decisão+config) | M (se migrar runtime)
- **Findings relacionados**: F-performance-5
- **Métricas de sucesso**:
  - Cold-start p99: ≥50s → ≤ 5s
  - Toast de erro por timeout no 1º request do dia: ocorrências/semana → 0
- **Risco de não fazer**: Confiança do usuário no produto continua erodindo; impressão de "sistema fora do ar" persiste.
- **Dependências**: trade-off cross-QA com Deployability (`render.yaml`).

### [performance-5] Avaliar (com probe) paralelismo no handshake `fin010` entre pares de um mesmo borderô

- **Problema**
  > `reconciliar` executa pares em série (`for` em linha 103). Com K=5 pares × 4–8s/par o total fica 20–40s. As 4 chamadas DENTRO do par são sequenciais por contrato do ERP, mas o ERP pode aceitar pares concorrentes no mesmo borderô.
- **Melhoria Proposta**
  > Probe: enviar 2 pares em paralelo no mesmo `borCod` em dev tenant. Se o ERP aceita, paralelizar com `pLimit(N=2..3)` (não desfilar handshake). Tactic Bass: **Introduce Concurrency**. Se o ERP rejeitar (lock), documentar em ADR como restrição.
- **Resultado Esperado**
  > Se probe verde: K=5 sequencial 20–40s → 8–16s (pLimit=3). Latência reconciliar deixa de ser linear em K.
- **Tactic alvo**: Introduce Concurrency
- **Severidade**: P2
- **Esforço estimado**: M (probe + impl + rollback)
- **Findings relacionados**: F-performance-6
- **Métricas de sucesso**:
  - P95 reconciliar(K=5): 30s → ≤ 15s (caso probe positivo)
  - ADR registrando comportamento do ERP (independente do resultado)
- **Risco de não fazer**: Reconciliação em lote (caminho de maior valor) sofre crescimento linear em K — escala mal quando volumes crescerem.
- **Dependências**: probe em dev tenant; coordenar com card `performance-1` (cache idempotência) para medir baseline limpo.

### [performance-6] Paginar / virtualizar a tabela de borderôs no FE

- **Problema**
  > `app/permutas/borderos/page.tsx` renderiza 100% da lista sem virtualização (linhas 319-525); cada row carrega 5 botões + chevron + sub-tabela quando expandida. Hoje "200 de 200" no DOM; quando a lista crescer, render trava.
- **Melhoria Proposta**
  > Paginação cliente (50/página, controles infinite-scroll OU pages) ou `react-window` se infinite-scroll preferido. Tactic Bass: **Limit Event Response** (do lado cliente). Manter filtros aplicados antes do slice.
- **Resultado Esperado**
  > Tempo de first-paint independente do volume total da lista. P95 render lista ≤ 200ms para qualquer N.
- **Tactic alvo**: Limit Event Response
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-performance-3
- **Métricas de sucesso**:
  - Render rows visíveis: hoje N=lista.length → ≤ 50
  - First-paint da aba Borderôs em N=500: ~6s → ≤ 300ms
- **Risco de não fazer**: UX trava quando a frente envelhecer; débito só "ativa" daqui a meses, mas o usuário sente de uma vez.
- **Dependências**: alinhar com card `performance-2` (paginação backend).

### [performance-7] Cachear `getDetalheTitulos` por execução em `EleicaoPermutasService`

- **Problema**
  > Comentário em `ConexosClient.ts:895` documenta um cache que o caller deveria fazer — `EleicaoPermutasService` não cacheia. Re-eleições ou docCod duplicado pagam call extra ao ERP.
- **Melhoria Proposta**
  > Map por execução (`new Map<string, Promise<Detalhe>>()` na service) — chave `docCod`. Tactic Bass: **Maintain Multiple Copies of Data**. Não atravessa requests (idempotente, sem invalidação necessária).
- **Resultado Esperado**
  > Duplicações de detail call dentro de 1 elegibilidade caem para 0.
- **Tactic alvo**: Maintain Multiple Copies of Data (cache)
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-performance-7
- **Métricas de sucesso**:
  - Calls `getDetalheTitulos` duplicadas por elegibilidade: 5–20% → 0
- **Risco de não fazer**: Pressão pequena mas crescente no ERP enquanto a frente escalar. Dívida documentada que envelhece.
- **Dependências**: fora do diff da Fase 3.1; tratar quando a próxima `/feature-tweak` tocar `EleicaoPermutasService`.

## 6. Notas do agente

- Não rodei `npm run build` do FE (modo `--quick`); bundle por rota fica como "Não medível" — pedir ao CI quando este card for priorizado.
- Probes externos ao ERP (Conexos `fin010` aceita paralelismo intra-borderô?) ficam como pré-requisito explícito do card `performance-5`. Não decidi nada — só apontei o caminho.
- Cross-QA detectado para o consolidator:
  - **Cold-start (F-perf-5)** ↔ Deployability (escolha de tier Render / runtime).
  - **Cache TTL + ETag (F-perf-4)** ↔ Availability (reduz acoplamento ao ERP em outage do Conexos).
  - **pageSize fixo 200 (F-perf-2)** ↔ Modifiability (silencia o futuro: ninguém vê quando estourar).
  - **Loop sequencial em reconciliar (F-perf-6)** ↔ Fault Tolerance (paralelismo aumenta superfície de falha parcial; precisa coordenar com a estratégia de markError já existente).
