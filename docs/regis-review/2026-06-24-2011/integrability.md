---
qa: Integrability
qa_slug: integrability
run_id: 2026-06-24-2011
agent: qa-integrability
generated_at: 2026-06-24T20:11:00-03:00
scope: backend+frontend
score: 7
findings_count: 6
cards_count: 6
---

# Integrability — Regis-Review

> Escopo: PR v0.7.0 (`main...HEAD`) — feature Permutas. Integração crítica: **Conexos ERP** (read
> `com298/com308/imp019/imp223/imp021` + write `fin010`). FE↔BE: contrato HTTP via `lib/api.ts`.

## 1. Cenário Geral (Bass General Scenario)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Conexos ERP (provedor externo, sem contrato versionado) | Mudança de wire — filtro renomeado, payload de `fin010/list` ganha novo campo, `bxaCodSeq` muda de tipo, `com298/list` passa a NÃO popular `mnyTitAberto` | `ConexosClient` (1941 LOC) + `BorderoGestaoService` (528 LOC) + tela `BorderosPanel.tsx` | Produção em Render, integração read+write recém-habilitada (`fin010`), borderô = escrita IRREVERSÍVEL | Falha local detectada no boundary (Zod) ou no mapper; serviço aborta antes de gravar lixo na trilha; mensagem do ERP traduzida no route | Tempo de detecção < 1 run; nº de arquivos a tocar para um upgrade de campo wire ≤ 3 (constant + schema + mapper); `bxaCodSeq` confirmado por Zod antes de marcar `settled` |

> "O Conexos finaliza o roadmap de um endpoint (`com298/list` deixar de retornar `mnyTitAberto`,
> ou `fin010/baixas` mudar o nome de `bxaCodSeq` para `bxaSeq`) → o `ConexosClient` precisa ser
> ajustado em um ponto único; o resto da app NÃO se mexe. Falha de schema em produção dispara
> log estruturado, ZERO borderô fantasma na trilha local."

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| `ConexosClient` LOC | 1941 LOC (+60 no PR) | < 1500 LOC (encapsulamento ainda compreensível) | ⚠️ | `src/backend/domain/client/ConexosClient.ts` |
| Métodos públicos do `ConexosClient` (1 client → 1 ERP) | 24 métodos domain-shaped (`listInvoicesFinalizadas`, `criarBordero`, `excluirBaixa`, `finalizarBordero`, etc.) — zero `get/post/request` genéricos | 100% domain-shaped | ✅ | `grep -n "public " ConexosClient.ts` |
| Constantes wire centralizadas (tpdCod, vldStatus, gerNum, fieldList filters) | Espalhadas: 3 fontes (`ConexosClient.ts` linhas 347-380, `permutas/conexosPermutasConstants.ts`, `permutas/conexosPermutasSchemas.ts`) — duplicação de `TPD_PROFORMA` e `VLD_STATUS_FINALIZADO` entre arquivos | 1 fonte por constante | ⚠️ | `ConexosClient.ts:21-22` vs `ConexosClient.ts:347-357` |
| Zod no boundary (writes fin010 — confirmação persistida) | 2/5 writes (`criarBordero`, `gravarBaixaPermuta`). `excluirBaixa`/`excluirBordero`/`finalizarBordero`/`cancelarBordero`/`estornarBordero` lançam direto sem validar resposta do ERP | 100% das writes que viram estado persistido | ⚠️ | `ConexosClient.ts:396-411` |
| Zod no boundary (reads — `listInvoicesFinalizadas`, `listBorderos`, `listBaixas`) | 0% nos novos endpoints — `listInvoicesFinalizadas` usa só `mapDocPagar` (coerções `String(... ?? '')`); `listBorderos` mapeia `Number(r.borCod)` sem Zod; `listBaixas` idem | ≥1 schema validando identidade (`borCod`/`bxaCodSeq`) nos reads que viram cache local | ❌ | `ConexosClient.ts:709-746`, `1330-1342`, `1181-1193` |
| Fan-out N+1 mitigado por client (chunking 50 / pageSize 500) | ✅ `chunked` + `paginate` reusado em todas as listas | manter | ✅ | `ConexosClient.ts:382-389, 1705-1763` |
| Truncamento de paginação detectado | `onCapHit` callback → `BUSINESS_WARN` em `listInvoicesFinalizadas` e `listAdiantamentosProforma`. **Mas `listBorderos`/`listBaixas` NÃO têm cap-hit** — usam `listGenericPaginated` (1 página, pageSize 1000/200) e truncam silenciosamente | cap-hit observável em TODAS as listas que possam crescer | ⚠️ | `ConexosClient.ts:1304-1347` (sem onCapHit) vs `714-729` |
| Serviços que injetam >2 clients/services (orquestrador hotspot) | `BorderoGestaoService`: 4 deps (`ConexosClient` + `EnvironmentProvider` + `PermutaExecucaoRepository` + `LogService`); `IngestaoPermutasService`: **7 deps** após a injeção do `BorderoGestaoService` (delta v0.7.0) | ≤ 4 colaboradores | ❌ | `IngestaoPermutasService.ts:59-69` |
| HTTP frameworks vazando para service/repo (Inviolable Rule #4) | 0 `axios`/raw `fetch` em `service/permutas/**` (só nomes de método `fetch*Batched` internos) | 0 | ✅ | `grep "axios\|fetch(" src/backend/domain/service/permutas` |
| Frontend: fetch centralizado em `lib/api.ts` | 22/23 chamadas `fetch(` em `lib/api.ts`; 1 fora (`AuthProvider.tsx:53`, `/auth/login`) | ≤ 1 wrapper | ✅ | `grep -rn "fetch(" src/frontend` |
| Tipos espelhados FE↔BE (manuais) | `frontend/lib/types.ts` redeclara `BorderoResumo`/`BaixaResumo`/`PermutaBorderoVinculo`/`BorderoSituacao` paralelos aos `backend/domain/service/permutas/BorderoGestaoService.ts` (não importa, não há contrato compartilhado) | tipos gerados de um schema único (OpenAPI/zod) OU pacote shared | ⚠️ | `frontend/lib/types.ts:294-339` vs `backend/.../BorderoGestaoService.ts:11-56` |
| API externa (Conexos) versionada (URL ou header) | Endpoints sem prefixo `/v1` — adapter delega para `LegacyConexosShape` que monta paths "como o Conexos espera". Sem `api-version` header | ≥1 ponto de versionamento (header OU URL); fallback documentado | ❌ | `ConexosClient.ts` (todas as chamadas `legacy.postGeneric('fin010', ...)`) |
| Contract tests por client (fixtures de resposta real) | 1/1 client: `ConexosClient.test.ts` com fixtures inline para 28 cenários incluindo os novos (`listInvoicesFinalizadas`, `criarBordero` Zod, `listBaixas` mapeamento, `excluirBaixa` regressão docTip-vs-filCod) | manter fixtures para cada novo endpoint | ✅ | `ConexosClient.test.ts` (1620+ linhas) |
| Acoplamento `IngestaoPermutasService → BorderoGestaoService.refreshCache` | NOVO no PR — ingestão chama refresh do cache de borderô best-effort. Cria dependência **cruzada** (ingestão sabe da existência do cache de borderô) sem evento; falha silenciosa via `BUSINESS_WARN` | dependência via evento/sinal (SQS/EventBridge no alvo) ou via callback de extensão | ⚠️ | `IngestaoPermutasService.ts:139-148` |
| REST consistência das novas rotas | `GET /permutas/status`, `GET /permutas/borderos?live=true`, `GET /permutas/borderos/:borCod/baixas?filCod=`, `DELETE /permutas/borderos/:borCod/trilha` — verbo + path coerentes. Único atrito: `/trilha` é **operação de domínio** sob `DELETE` (semântica "tombstone só local") — poderia ser `POST /trilha/release` | manter; `/trilha` aceitável como sub-recurso "trilha local" | ✅ | `routes/permutas.ts:541-560` |

> ⚠️ **Não medível localmente**: latência por endpoint Conexos (p50/p99) e taxa de erro por
> dependência. Requer CloudWatch/APM (não existe em Render-only). Recomendação: instrumentar
> `RetryExecutor.execute` com counter por endpoint + histograma de duração; expor `/health/clients`.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Encapsulate | Único client por sistema externo (`ConexosClient`); métodos domain-shaped (`criarBordero`, `excluirBaixa`); `LegacyConexosShape` token isola SID/auth. | ✅ | `ConexosClient.ts:37, 422-424` |
| Use an Intermediary | `LegacyConexosShape` (`legacy.postGeneric`/`getGeneric`/`deleteGeneric`) é o intermediário entre o domínio e o cliente HTTP cookie-stateful. Pronto para troca por uma implementação nativa SSM-backed (v0.2). | ✅ | `ConexosClient.ts:75-108` |
| Restrict Communication Paths | Service/Repository NÃO importam `axios`/`fetch` (Rule #4 honrada nas alterações). Toda chamada HTTP passa pelo client. | ✅ | `grep -rn "axios\|^.*fetch(" src/backend/domain/service` |
| Adhere to Standards | Endpoints REST do `routes/permutas.ts` seguem verbos HTTP idiomáticos. Mas Conexos NÃO é REST/OpenAPI — payload `fieldList`/`filterList` é específico do ERP; sem header `Accept-Version`/`api-version`. | ⚠️ | `routes/permutas.ts` (REST OK) vs Conexos wire (proprietário) |
| Abstract Common Services | `RetryExecutor` (reusado em quase todas as reads) + `BoundedConcurrency` (no `EleicaoPermutasService`) + `paginate` (helper no client). Mas `ensureSid()` é chamado em CADA método (boilerplate repetido ~20×). | ⚠️ | `ConexosClient.ts:445-465`, repetido em 1086, 1119, etc. |
| Discover Service | Endpoint Conexos é resolvido por SSM via `EnvironmentProvider` (Rule #8). Sem service registry — endpoint é um valor de config. Aceitável para 1 provedor. | ✅ | `ReconciliacaoPermutaService.ts:114` (env via Provider) |
| Tailor Interface | `LegacyConexosShape` traduz a API verbosa do Conexos (sessões SID, cookies, payloads embrulhados) para um adapter passável; o `ConexosClient` traduz para o domínio (`Adiantamento`, `BorderoListaItem`, `BaixaResumo`). Duas camadas de tailoring. | ✅ | `ConexosClient.ts:75-108`, `1330-1342` |
| Configure Behavior | `CONEXOS_WRITE_ENABLED` + `CONEXOS_WRITE_DRY_RUN` gateiam toda escrita; `borCods` opcional em `listBorderos` configura busca precisa vs. paginada. | ✅ | `BorderoGestaoService.ts:91-95`, `ConexosClient.ts:1292-1303` |
| Manage Resources | Concorrência limitada via `BoundedConcurrency` (FILIAIS_CONCURRENCY=5, ADIANTAMENTOS_CONCURRENCY=10) para não estourar `LOGIN_ERROR_MAX_SESSIONS` do Conexos. | ✅ | `EleicaoPermutasService.ts:86-88` |
| Orchestrate | `EleicaoPermutasService.computeCandidatas` orquestra 5+ clients/services em série/paralelo (filiais → adtos → declarações/invoices/processos → detalhe → variação). `IngestaoPermutasService` agora orquestra 7 deps. | ⚠️ | `EleicaoPermutasService.ts:213-324`, `IngestaoPermutasService.ts:59-69` |
| Manage Resource Coupling | Acoplamento `IngestaoPermutasService → BorderoGestaoService.refreshCache` é direto (chamada de método) e best-effort. Não há broker/evento — toda mudança no shape de `refreshCache` recompila a ingestão. | ⚠️ | `IngestaoPermutasService.ts:139-148, 67` |
| Contract testing | `ConexosClient.test.ts` cobre fixtures wire dos novos endpoints (`listInvoicesFinalizadas`, `criarBordero` zod-reject, `listBaixas`, `excluirBaixa` docTip regression, `listBorderos` borCod#IN). | ✅ | `ConexosClient.test.ts:70, 1365, 1562, 1584, 1602` |
| Versioning strategy | Sem versionamento nos endpoints Conexos (legacy ERP, fora do nosso controle). Internamente: rotas BE não-versionadas; tipos FE↔BE espelhados à mão. | ❌ | `frontend/lib/types.ts` vs `backend/.../BorderoGestaoService.ts` |
| Backward-compatibility shims | `mapDocPagar` ainda lê `row.faturada ?? row.flagFaturada` (dois nomes de campo) — shim defensivo OK. Mas `bxaMnyValor ?? 0` em `listBaixasTitulo`/`BAIXA_GRAVADA_SCHEMA` é shim que MASCARA ausência (poderia esconder bug do ERP). | ⚠️ | `ConexosClient.ts:740, 1668, 408` |
| Observability of integration failures | `ConexosError` carrega `endpoint`; logs `BUSINESS_WARN` para falhas best-effort (refreshCache por filial). Mas SEM contador por endpoint / SEM histograma de latência (Render = sem APM). | ⚠️ | `ConexosClient.ts:1196`, `BorderoGestaoService.ts:410-419` |

## 4. Findings (achados)

### F-integrability-1: Zod no boundary das reads novas (`listInvoicesFinalizadas`, `listBorderos`, `listBaixas`) — ausente

- **Severidade**: P1
- **Tactic violada**: Tailor Interface / Backward-compatibility shims
- **Localização**: `src/backend/domain/client/ConexosClient.ts:709-746`, `1292-1347`, `1152-1198`
- **Evidência (objetiva)**:
  ```typescript
  // listBorderos (1330-1342) — mapeia direto, sem Zod
  return (page.rows ?? []).map((r) => ({
      borCod: Number(r.borCod),               // se vier "null"/undefined → NaN entra na trilha
      filCod: Number(r.filCod ?? filCod),
      ...(r.borVldFinalizado != null ? { borVldFinalizado: Number(r.borVldFinalizado) } : {}),
      borCodEstornado: r.borCodEstornado != null ? Number(r.borCodEstornado) : null,
      ...
  }));
  // listBaixas (1181-1193) — Number(r.bxaCodSeq) sem floor/positive
  // listInvoicesFinalizadas (730-744) — apenas mapDocPagar com String(... ?? '')
  ```
  Compare com a regra adotada nas **writes** (linhas 396-411): `BORDERO_CRIADO_SCHEMA`/`BAIXA_GRAVADA_SCHEMA` exigem `borCod`/`bxaCodSeq` `z.coerce.number().int().positive()` — ou aborta.
- **Impacto técnico**: `listBorderos` alimenta o **cache local** `permuta_bordero` (migration 0018). Um `borCod` NaN no cache contamina a tela de Gestão de Borderôs e o `statusPorAdiantamento` (resolve `sitByBor.get(NaN)` → undefined → permuta nunca aparece como "finalizada"). `listBaixas` é input direto de `excluirBordero` → um `bxaCodSeq` corrompido tenta DELETE de baixa inexistente.
- **Impacto de negócio**: borderô fantasma ou "perdido" na tela; analista lança a permuta DUPLICADA por achar que sumiu. Possível super-pagamento ao fornecedor — risco financeiro direto.
- **Métrica de baseline**: 0 schemas Zod nas 3 reads novas vs. 2 nas writes correlatas. Δ contrato = 0/3.

### F-integrability-2: Truncamento silencioso de `listBorderos`/`listBaixas` (sem `onCapHit`)

- **Severidade**: P1
- **Tactic violada**: Observability of integration failures / Manage Resources
- **Localização**: `src/backend/domain/client/ConexosClient.ts:1292-1347`, `1152-1198`
- **Evidência (objetiva)**: ambos métodos chamam `legacy.listGenericPaginated` com `pageNumber: 1, pageSize: 200` ou `1000` — UMA página única. Compare com `paginate()` (1705-1763) que tem laço e `onCapHit?.()` quando atinge `MAX_PAGES`. O comentário em 1299-1302 reconhece o risco ("se o ERP IGNORAR o filtro, ainda assim cobre os borderôs recentes (alto borCod) da filial, evitando perder o alvo por paginação") mas trata como suficiente.
- **Impacto técnico**: a filial Columbia tem **centenas de borderôs por mês**. Quando passar de 1000, o cache não vê os mais antigos (ordenado `borCod desc`); o `statusPorAdiantamento` deixa de resolver permutas antigas → reabertura indevida → re-baixa duplicada. O `listBaixas` (pageSize 200) já está perigosamente perto do teto para borderôs com dezenas de baixas (cenário multíplas N:M).
- **Impacto de negócio**: a "saída de emergência" `/trilha` (release local) pressupõe que o status vivo é confiável. Truncamento silencioso desfaz essa garantia.
- **Métrica de baseline**: 2/2 endpoints novos sem `onCapHit`; pageSize fixo (200/1000) sem walk de páginas. `listInvoicesFinalizadas` herda o `paginate` correto (com onCapHit).

### F-integrability-3: Acoplamento direto `IngestaoPermutasService → BorderoGestaoService.refreshCache` (cross-aggregate, sem broker)

- **Severidade**: P2
- **Tactic violada**: Manage Resource Coupling / Orchestrate
- **Localização**: `src/backend/domain/service/permutas/IngestaoPermutasService.ts:67, 139-148`
- **Evidência (objetiva)**:
  ```typescript
  @inject(BorderoGestaoService) private borderoGestaoService: BorderoGestaoService,
  ...
  try {
      await this.borderoGestaoService.refreshCache();
  } catch (err) {
      await this.logService.warn({ type: LOG_TYPE.BUSINESS_WARN, ... });
  }
  ```
  Após `persistRun`, a ingestão chama o serviço de borderô para repopular o cache. A ingestão passa a ter **7 dependências injetadas** — vira hotspot orquestrador.
- **Impacto técnico**: ciclo potencial — se `BorderoGestaoService` (que injeta `ConexosClient`+`LogService`) vier a depender de algo computado pela ingestão, fechamos um anel. Hoje funciona, mas qualquer extensão do `refreshCache` (ex.: ler resultado da ingestão para invalidar entradas) explode. Além disso, no alvo Lambda essa chamada cross-service deveria ser **EventBridge fan-out** (loose coupling), não método de instância.
- **Impacto de negócio**: trocar o cache de borderô por uma fila/job futuro (alvo SQS) exige modificar 2 arquivos (`Ingestao*` + `BorderoGestao*`). Custo marginal de upgrade > 0.
- **Métrica de baseline**: 7 deps na ingestão (era 6 antes do PR); 1 chamada cross-service direta. Alvo: 0.

### F-integrability-4: Tipos FE↔BE espelhados manualmente — `BorderoResumo`/`PermutaBorderoVinculo`/`BorderoSituacao`

- **Severidade**: P2
- **Tactic violada**: Versioning strategy / Adhere to Standards
- **Localização**: `src/frontend/lib/types.ts:291-339` vs `src/backend/domain/service/permutas/BorderoGestaoService.ts:11-56`
- **Evidência (objetiva)**: ambos definem **as mesmas interfaces** sem compartilhamento:
  ```typescript
  // frontend/lib/types.ts:306-313
  export type BorderoSituacao = 'EM_CADASTRO' | 'FINALIZADO' | 'CANCELADO' | 'ESTORNADO' | 'REMOVIDO' | 'INDISPONIVEL'
  // backend/.../BorderoGestaoService.ts:12-18
  export type BorderoSituacao = 'EM_CADASTRO' | 'FINALIZADO' | 'CANCELADO' | 'ESTORNADO' | 'REMOVIDO' | 'INDISPONIVEL';
  ```
  Δ no PR: adicionou `criadoPor`, `daTrilha`, `PermutaBorderoVinculo`, `BorderoSituacao` — copy-paste em dois lugares.
- **Impacto técnico**: typo no backend → frontend compila e quebra em runtime (e.g., backend adiciona `'PROCESSANDO'` no enum, frontend não enxerga, switch cai no default). Cresce custo a cada novo campo. Custo marginal de UMA nova field = 2 arquivos.
- **Impacto de negócio**: bug "silencioso" em produção: status novo do borderô, frontend mostra "indisponível" indevidamente.
- **Métrica de baseline**: 4 tipos novos espelhados no PR (`BorderoResumo`, `BaixaResumo`, `PermutaStatusResponse`, `PermutaBorderoVinculo`). Refatoração shared/openapi tocaria 5+ arquivos.

### F-integrability-5: Constantes wire Conexos duplicadas (`TPD_PROFORMA`, `VLD_STATUS_FINALIZADO`)

- **Severidade**: P3
- **Tactic violada**: Abstract Common Services / Encapsulate
- **Localização**: `src/backend/domain/client/ConexosClient.ts:21-23` (importa `PERMUTA_TPD_PROFORMA`, `PERMUTA_VLD_FINALIZADO` de `permutas/conexosPermutasConstants.ts`) vs `ConexosClient.ts:347-357` (define `TPD_PROFORMA = 99`, `VLD_STATUS_FINALIZADO = ['3']` localmente).
- **Evidência (objetiva)**:
  ```typescript
  // linha 21-22 (PR-novo)
  import { TPD_PROFORMA as PERMUTA_TPD_PROFORMA, VLD_STATUS_FINALIZADO as PERMUTA_VLD_FINALIZADO } from './permutas/conexosPermutasConstants.js';
  // linha 347-357 (legado)
  const TPD_PROFORMA = 99;
  const TPD_INVOICE = 128;
  const VLD_STATUS_FINALIZADO = ['3'] as const;
  ```
  A ingestão usa o LITERAL legado (`TPD_INVOICE`, `VLD_STATUS_FINALIZADO`) em `listInvoicesFinalizadas` — não os do módulo de permutas. Se o Conexos mudar o ID de FINALIZADO (improvável mas possível em upgrade), a correção precisa caçar 2 lugares.
- **Impacto técnico**: refactor de wire = N file-touches. Hoje N=2 para FINALIZADO, 1 para INVOICE.
- **Impacto de negócio**: tempo de resposta a um upgrade do ERP cresce. Baixo no curto prazo; débito acumulável.
- **Métrica de baseline**: 2 fontes para `VLD_STATUS_FINALIZADO`, 2 para `TPD_PROFORMA`.

### F-integrability-6: `imp021/list` chamado para o universo COMPLETO de invoices na ingestão (acoplamento fan-out latente)

- **Severidade**: P3
- **Tactic violada**: Manage Resources / Orchestrate
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:265-294`
- **Evidência (objetiva)**:
  ```typescript
  const todasInvoicesPorFilial = await this.boundedConcurrency.map(filiais, async (filial) => {
      const { invoices } = await this.conexosClient.listInvoicesFinalizadas({ filCod: filial.filCod });
      const priCods = [...new Set(invoices.map((i) => i.priCod))];
      const processos = await this.conexosClient.listProcessos({ filCod: filial.filCod, priCods }); // ← imp021 p/ TODAS
      ...
      const hidratadas = await this.boundedConcurrency.map(invoices, (inv) => this.hidratarInvoiceNegociada(...), ADIANTAMENTOS_CONCURRENCY);
  ```
  Cada filial: 1× `listInvoicesFinalizadas` (paginado, pode estourar cap) + 1× `listProcessos` (chunked 50, mas N priCods únicos) + N× `listTitulosAPagar` (com308 — 1 chamada por invoice). Em filiais com milhares de invoices finalizadas históricas, fan-out N+M nas dezenas de milhares.
- **Impacto técnico**: `LOGIN_ERROR_MAX_SESSIONS` do Conexos pode ser atingido em produção (já mitigado por `ADIANTAMENTOS_CONCURRENCY=10`, mas com mais filiais o teto cresce linear). Ingestão começa a demorar minutos — bate o lock advisory de outras runs (`INGEST_LOCK_KEY`).
- **Impacto de negócio**: futuro upgrade da Conexos ou janela de freeze do ERP → ingestão estoura SLA. Hoje aceitável (1 filial Columbia).
- **Métrica de baseline**: 1 chamada por invoice (com308) × N invoices em aberto. Sem upper bound observável (`listInvoicesFinalizadas.capHit` é consumido pela hidratação mas não pela ingestão — `EleicaoPermutasService.ts:268` desestrutura só `invoices`).

## 5. Cards Kanban

### [integrability-1] Adicionar Zod nas reads-críticas do `ConexosClient` (`listBorderos`/`listBaixas`/`listInvoicesFinalizadas`)

- **Problema**
  > As três reads novas alimentam cache local (`permuta_bordero`), input de DELETE no ERP (`listBaixas → excluirBordero`) e a tela de Gestão. Nenhuma valida o boundary com Zod: `Number(r.borCod)` aceita `NaN` silenciosamente. As writes correlatas (`criarBordero`, `gravarBaixaPermuta`) já exigem schema (`BORDERO_CRIADO_SCHEMA`) — incoerência simétrica.

- **Melhoria Proposta**
  > Criar `BORDERO_LISTA_ROW_SCHEMA` e `BAIXA_LISTA_ROW_SCHEMA` em `client/permutas/conexosPermutasSchemas.ts` (mesmo padrão dos `com298RowSchema`). `borCod`/`bxaCodSeq` = `z.coerce.number().int().positive()`. Rejeitar row sem identidade (log + skip da row, NÃO derrubar a página). Aplicar em `listBorderos`, `listBaixas`, `listInvoicesFinalizadas`.

- **Resultado Esperado**
  > 0 NaN no cache de borderô; toda row inválida vira `BUSINESS_WARN` rastreável. Cache rebuild idempotente.

- **Tactic alvo**: Tailor Interface
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-1
- **Métricas de sucesso**:
  - Cobertura Zod nos reads críticos: 0/3 → 3/3
  - Rows inválidas observáveis em log: 0 → instrumentadas
- **Risco de não fazer**: corrupção silenciosa do cache → permuta duplicada na trilha → super-pagamento.
- **Dependências**: nenhuma.

### [integrability-2] Paginação completa + cap-hit em `listBorderos`/`listBaixas`

- **Problema**
  > Ambos chamam `listGenericPaginated` UMA vez (página 1, pageSize 200/1000). `listBorderos` ordena `borCod desc` — uma filial com >1000 borderôs perde os antigos, o `statusPorAdiantamento` deixa de resolver permutas antigas e o sistema as reabre indevidamente. `listBaixas` (pageSize 200) idem para borderôs com muitas baixas.

- **Melhoria Proposta**
  > Refatorar `listBorderos`/`listBaixas` para usarem o `paginate()` interno (laço até `MAX_PAGES`) com `onCapHit` → `BUSINESS_WARN`. Para o caso `borCods` (busca precisa), manter pageSize 1000 mas validar contra `count` do envelope.

- **Resultado Esperado**
  > Truncamento detectável: 0 cap-hits em produção significa que a hipótese é segura; >0 cap-hits dispara alerta. Cache de borderô consistente com o ERP.

- **Tactic alvo**: Manage Resources / Observability of integration failures
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-2
- **Métricas de sucesso**:
  - Endpoints com paginação completa: 1/3 (`listInvoicesFinalizadas`) → 3/3
  - Cap-hit observável em log estruturado: ❌ → ✅
- **Risco de não fazer**: re-baixa duplicada de permutas antigas após o cache cruzar 1000 entradas (estimativa: 6-12 meses de operação).
- **Dependências**: nenhuma.

### [integrability-3] Desacoplar `IngestaoPermutas → BorderoGestao.refreshCache` via evento/callback

- **Problema**
  > A ingestão passou a injetar `BorderoGestaoService` para chamar `refreshCache()` best-effort no fim da run. Vira hotspot de 7 dependências e dependência direta cross-aggregate. No alvo Lambda, isso deveria ser um `EventBridge` fan-out (loose coupling).

- **Melhoria Proposta**
  > Introduzir `IngestEventBus` (interface local; impl in-memory hoje, SNS/EventBridge no alvo). `IngestaoPermutasService.executar` emite `IngestCompleted` → `BorderoGestaoService` (ou um sub-handler `BorderoCacheRefresher`) assina. Remove o `@inject(BorderoGestaoService)` do construtor da ingestão.

- **Resultado Esperado**
  > Ingestão volta a 6 deps (era 6 pré-PR). Adicionar novo "post-ingest hook" não toca `IngestaoPermutasService`.

- **Tactic alvo**: Manage Resource Coupling / Orchestrate
- **Severidade**: P2
- **Esforço estimado**: M (2-5d)
- **Findings relacionados**: F-integrability-3
- **Métricas de sucesso**:
  - Deps injetadas em `IngestaoPermutasService`: 7 → 6
  - Acoplamentos cross-aggregate diretos no fluxo de ingestão: 1 → 0
- **Risco de não fazer**: próxima feature ("avisar Slack quando ingestão completar") adiciona uma 8ª dep direta na ingestão — ladeira escorregadia.
- **Dependências**: alinha com Modifiability (mesmo locus de mudança).

### [integrability-4] Pacote `shared/` ou OpenAPI gerado para tipos FE↔BE

- **Problema**
  > Cada novo response shape do backend é redeclarado à mão em `frontend/lib/types.ts`. PR v0.7.0 adicionou 4 tipos espelhados (`BorderoResumo`, `BaixaResumo`, `PermutaStatusResponse`, `PermutaBorderoVinculo`). Risco de divergência silenciosa cresce a cada feature.

- **Melhoria Proposta**
  > Avaliar 2 caminhos: (a) gerar OpenAPI das rotas Express (via `express-openapi` ou anotações) + `openapi-typescript` no FE; (b) extrair um pacote `shared/types` no monorepo, consumido pelos dois lados. Decisão de arquitetura — discutir com Yuri (sem prescrever a solução, alinhar com migração Lambda do alvo).

- **Resultado Esperado**
  > Mudança de shape no BE quebra o build do FE no typecheck. Custo marginal de um novo response = 1 arquivo (no BE) em vez de 2.

- **Tactic alvo**: Versioning strategy
- **Severidade**: P2
- **Esforço estimado**: L (1-2sem) — inclui decisão arquitetural
- **Findings relacionados**: F-integrability-4
- **Métricas de sucesso**:
  - Tipos duplicados FE↔BE: 4+ (este PR) → 0
  - Detecção de drift em CI: nenhuma → typecheck FE quebra
- **Risco de não fazer**: bug silencioso de enum/status em runtime; tempo de PR cresce.
- **Dependências**: roadmap de migração para Lambda (compartilha o monorepo).

### [integrability-5] Consolidar constantes wire Conexos em `client/permutas/conexosWireConstants.ts`

- **Problema**
  > `TPD_PROFORMA` e `VLD_STATUS_FINALIZADO` existem em 2 arquivos (`ConexosClient.ts` e `permutas/conexosPermutasConstants.ts`). Refactor wire = ≥2 file-touches; risco de inconsistência se só um for atualizado.

- **Melhoria Proposta**
  > Mover TODAS as constantes wire (`TPD_PROFORMA=99`, `TPD_INVOICE=128`, `VLD_STATUS_FINALIZADO=['3']`, `TPD_IMPLANTACAO_SALDO=143`, `GER_*`) para `client/conexos/wireConstants.ts`. `ConexosClient.ts` importa; `permutas/conexosPermutasConstants.ts` re-exporta para back-compat (depois remover).

- **Resultado Esperado**
  > 1 lugar para mudar o ID de FINALIZADO/PROFORMA/INVOICE. PR de upgrade Conexos toca 1 arquivo.

- **Tactic alvo**: Encapsulate
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-5
- **Métricas de sucesso**:
  - Fontes de `VLD_STATUS_FINALIZADO`: 2 → 1
  - Fontes de `TPD_PROFORMA`: 2 → 1
- **Risco de não fazer**: bug por inconsistência num upgrade futuro.
- **Dependências**: nenhuma.

### [integrability-6] Quantificar e capar fan-out de `listInvoicesFinalizadas + imp021 + com308` na ingestão

- **Problema**
  > A regra 2026-06-24 ("universo COMPLETO de invoices finalizadas") faz a ingestão chamar `listInvoicesFinalizadas` (paginado) + `listProcessos` + 1× `listTitulosAPagar` por invoice — sem upper bound observável. `capHit` não é propagado (a ingestão desestrutura só `.invoices`). Em filiais com 5k+ invoices históricas finalizadas, fan-out atinge >5k chamadas/run.

- **Melhoria Proposta**
  > (1) Propagar `capHit` de `listInvoicesFinalizadas` para a ingestão (log `BUSINESS_WARN` com `flowId`). (2) Adicionar métrica `invoicesHidratadasPerRun` no `FLOW_COMPLETE`. (3) Avaliar janela incremental ("invoices abertas nos últimos 12 meses" via filtro `docDtaEmissao#GTE`) — alinhar com PO se o universo histórico precisa MESMO ser reprocessado a cada run.

- **Resultado Esperado**
  > Ingestão com tamanho de fan-out conhecido; alertas se cap-hit. Custo marginal de adicionar uma filial = visível.

- **Tactic alvo**: Manage Resources / Observability
- **Severidade**: P3
- **Esforço estimado**: M (2-5d) — inclui conversa de produto
- **Findings relacionados**: F-integrability-6
- **Métricas de sucesso**:
  - `capHit` propagado: ❌ → log estruturado
  - Métrica de fan-out total por run: nenhuma → instrumentada
- **Risco de não fazer**: ingestão diária estourando lock window (`INGEST_LOCK_KEY`) à medida que o backlog cresce.
- **Dependências**: alinha com Performance (mesma observação).

## 6. Notas do agente

- Escopo focado no delta v0.7.0 (28 arquivos). Tactics Bass avaliadas no recorte; não revisei
  features pré-PR (variação cambial, fechamento mensal) salvo quando o mesmo arquivo foi tocado.
- Não medi latência/erro por endpoint Conexos — Render-only sem APM. Recomendação documentada
  em §2.
- **Cross-QA**: F-integrability-1 (Zod boundary) e F-integrability-2 (truncamento) sobrepõem com
  **Fault Tolerance** (validação defensiva) e **Security** (input externo). F-integrability-3
  (orquestrador de 7 deps) sobrepõe com **Modifiability** (locus of change). F-integrability-4
  (tipos espelhados) sobrepõe com **Modifiability** e **Testability**. Sinalizar ao consolidator.
- O encapsulamento do Conexos como único client e a centralização de fetch no `lib/api.ts` no FE
  estão sólidos — score 7/10. A dívida concentra-se em (a) boundary validation parcial nas reads
  e (b) tipos manuais FE↔BE.
