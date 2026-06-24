---
qa: Modifiability
qa_slug: modifiability
run_id: 2026-06-24-0039
agent: qa-modifiability
generated_at: 2026-06-24T00:39:00-03:00
scope: backend
score: 5
findings_count: 9
cards_count: 8
---

# Modifiability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Analista financeiro / Yuri | Mudança de regra de borderô (ex.: novo `borVldFinalizado`, nova conta gerencial além da 131, nova mensagem traduzida do `fin010`, novo botão de ação no borderô) | `ConexosClient` + `BorderoGestaoService` + `routes/permutas.ts` + `frontend/app/permutas/borderos/page.tsx` (e o mapa `ERP_MESSAGE_PT`/`friendlyErpMessage`) | Em desenvolvimento, sem produção em escala (Render free tier) | Localizar a mudança em **um** módulo do domínio; tests + lint + typecheck verdes; sem ripple em outras camadas | < 3 arquivos tocados por mudança *de uma única regra de domínio* (hoje uma regra como "traduzir nova msg do ERP" exige 2 arquivos; "novo status" exige 4 — backend serviço + rota + 2 lugares no FE) |

> Fase 3.1 introduziu uma quantidade desproporcional de superfície (~2.348 LOC adicionados em uma sessão), concentrando responsabilidade em três pontos de hot-spot: `ConexosClient.ts` (1.855 LOC, +236 nesta sessão), `routes/permutas.ts` (582 LOC, +176, 11 handlers) e `frontend/app/permutas/page.tsx` (2.385 LOC, +126). O cenário típico de "ajustar a regra de borderô" hoje ricocheta entre 3–4 camadas — exatamente o que Bass chama de baixa modifiability.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| LOC `ConexosClient.ts` | **1.855** (+236 nesta sessão) | ≤ 600 por arquivo de client (Bass: Split Module > 600) | ❌ | `wc -l src/backend/domain/client/ConexosClient.ts` |
| Métodos públicos em `ConexosClient` | **22 métodos públicos** (cobrindo filiais, processos, financeiro a pagar, adiantamentos, DI/DUIMP, titulos, baixas, borderôs CRUD, valida título permuta/baixa, atualiza líquido, grava baixa, lista baixas título) | ≤ 8 (1 cliente = 1 contrato externo coeso) | ❌ | `grep -n "public " src/backend/domain/client/ConexosClient.ts` |
| Fan-in de `ConexosClient` | **9 importadores diretos** (5 services de permutas + 1 adapter + 1 errors + 1 route + 1 schemas) | ≤ 4 (clients raramente devem ser importados fora de services) | ⚠️ | `grep -rln "ConexosClient" src/backend --include='*.ts'` |
| LOC `frontend/app/permutas/page.tsx` | **2.385** | ≤ 400 (Next.js page como composição, não monólito) | ❌ | `wc -l src/frontend/app/permutas/page.tsx` |
| LOC `frontend/app/permutas/borderos/page.tsx` | **595** (NEW) | ≤ 400 | ❌ | `wc -l` |
| LOC `routes/permutas.ts` | **582** com 11 endpoints | ≤ 250 por arquivo de rota | ❌ | `wc -l src/backend/routes/permutas.ts` |
| LOC `ReconciliacaoPermutaService.ts` | **512** | ≤ 400 | ❌ | `wc -l` |
| LOC `BorderoGestaoService.ts` | **366** | ≤ 400 | ✅ | `wc -l` |
| Funções com cognitive complexity > 15 (Biome) | **17 warnings** no backend (2 novas nesta sessão: `BorderoGestaoService.ts:278` complexidade **25**, `BorderoGestaoService.ts:314` complexidade **16**; sessão também herdou `ReconciliacaoPermutaService.ts:78` complexidade **20**+) | 0 (target Biome configurado a 15) | ❌ | `cd src/backend && npm run lint 2>&1 \| grep noExcessiveCognitiveComplexity` |
| Duplicação dos 4 handlers de ação de borderô (`finalizar`/`cancelar`/`estornar`/`excluir`) | **4 blocos quase idênticos** (parse `borCod`, parse `filCod`, `try`/`catch` com `erpErrorMessage(err)`) — `routes/permutas.ts:420-533` | 0 (1 helper) | ❌ | `grep -c "borCod = Number(req.params.borCod)" src/backend/routes/permutas.ts` → 5 |
| Duplicação de mapas `ERP_MESSAGE_PT` ↔ `friendlyErpMessage` | **2 mapas** com chaves divergentes (`routes/permutas.ts:44` `FIN_014.*` + `Generic.ERROR_MESSAGE`; `ReconciliacaoPermutaService.ts:498` `FIN_010.*` + `CnxValidatorMny`/`CnxValidatorDescr`). NENHUMA chave em comum. | 1 (`ConexosErpMessageTranslator`) | ❌ | `grep -n "ERP_MESSAGE_PT\|friendlyErpMessage" ...` |
| Magic numbers de domínio no código (`docTip=2`, `titCod=1`, `borVldTipo=2`, conta `131`) | **`docTip=2`: 6 ocorrências** entre `ConexosClient.ts` (linhas 1112, 1145, 1282), `ReconciliacaoPermutaService.ts` (linhas 365, 389) e `BorderoGestaoService.ts` (linha 164). **`titCod=1`: 7 ocorrências** (`BorderoGestaoService.ts:101`, `ReconciliacaoPermutaService.ts:227, 285, 377`, `ConexosClient.ts` x3). **`borVldTipo=2`: 4 ocorrências** (`ConexosClient.ts:1023, 1241, 1287, 1319`; `ReconciliacaoPermutaService.ts:371`). **`CONTA_GER_JUROS=131`** centralizada em UMA constante (`ReconciliacaoPermutaService.ts:15`) — único caso bem feito. | 0 magic numbers fora de `permutas/conexosPermutasConstants.ts` | ❌ | `grep -rn "docTip\|titCod\|borVldTipo" src/backend --include='*.ts'` |
| Cross-layer violations (route → repository, pulando service) | **5 violações** em `routes/permutas.ts`: `ClienteFiltroRepository`, `PermutaProcessamentoRepository`, `PermutaExecucaoRepository`, `PermutaRelationalRepository`, `PermutaSnapshotRepository` importados direto pela route | 0 (CLAUDE.md "Lambda → Service → Repository → Client"; PatternGuardian deveria barrar) | ❌ | `grep -rn "from '.*domain/repository/" src/backend/routes` |
| Acoplamento da regra "situação do borderô" (`borVldFinalizado` → `FINALIZADO`/`CANCELADO`/`EM_CADASTRO`) | A **mesma regra vive em 2 camadas**: BE `BorderoGestaoService.situacaoDoItem` (`:361-365`) + FE `SITUACAO_LABEL` (`borderos/page.tsx:51-58`) + FE `situacaoBadge` (`:60-70`) — qualquer estado novo exige editar 3 lugares | 1 lugar (BE produz `situacao` + `label`+`variant`; FE renderiza) | ❌ | `grep -n "SITUACAO_LABEL\|situacaoBadge\|situacaoDoItem"` |
| DI tokens / polimorfismo runtime | **1 token nomeado** (`LEGACY_CONEXOS_TOKEN` em `ConexosClient.ts:36`) — usado SÓ para isolar o adapter HTTP legado. Zero `container.register(...)` no domínio (tudo `@injectable()`/`@singleton()` resolvido por classe) | OK para domain-bound; documentado | ✅ | `grep -rn "container.register\|TOKEN" src/backend` |
| Ontology drift (`_index.json` / `_coverage.json`) | Sincronizada na sessão anterior (commit c51d6d0 "sincroniza ontologia com o código deployado v0.2.8"). Esta sessão adiciona código (Fase 3.1) mas a ontologia foi atualizada no commit imediatamente anterior — não validei diff item-a-item | ≤ 5 entradas drift | ⚠️ não medida aqui | `cat ontology/_index.json ontology/_coverage.json` |

### Apêndice — Top-10 maiores arquivos do `src/backend` (não-teste)

| # | Arquivo | LOC |
|---|---|---|
| 1 | `domain/client/ConexosClient.ts` | **1.855** |
| 2 | `domain/service/permutas/EleicaoPermutasService.ts` | 813 |
| 3 | `domain/repository/permutas/PermutaRelationalRepository.ts` | 618 |
| 4 | `routes/permutas.ts` | 582 |
| 5 | `domain/service/permutas/ReconciliacaoPermutaService.ts` | 512 |
| 6 | `domain/service/permutas/IngestaoPermutasService.ts` | 418 |
| 7 | `domain/service/permutas/GestaoPermutasService.ts` | 413 |
| 8 | `domain/repository/permutas/PermutaSnapshotRepository.ts` | 367 |
| 9 | `domain/service/permutas/BorderoGestaoService.ts` | 366 |
| 10 | `services/conexos.ts` (legacy adapter, alvo: deletar) | 341 |

### Apêndice — Top fan-in (no escopo de permutas + clients)

| # | Símbolo | Importadores | Risco |
|---|---|---|---|
| 1 | `ConexosClient` | **9** (5 services + 1 adapter + 1 errors + 1 route + 1 schemas) | God-client. Mudar uma assinatura = recompilar metade do domínio. |
| 2 | `EnvironmentProvider` | (singleton ubíquo) | OK — é a tactic Defer Binding já bem usada. |
| 3 | `LogService` | (ubíquo, singleton) | OK. |
| 4 | `PermutaExecucaoRepository` | 3 (services Reconciliação/BorderoGestao + 1 route — **violação layer**) | Médio. |

### Apêndice — Top-5 frontend (LOC) — escopo desta sessão

| # | Arquivo | LOC |
|---|---|---|
| 1 | `app/permutas/page.tsx` | **2.385** |
| 2 | `app/permutas/borderos/page.tsx` | 595 (NEW) |
| 3 | `lib/api.ts` | 404 |
| 4 | `lib/types.ts` | 318 |
| 5 | `app/permutas/clientes-filtro/page.tsx` | 270 |

> ⚠️ **Não medível localmente**: tempo médio de feature (lead time) e nº de PRs que tocaram >3 camadas — requer análise histórica de commits + GitHub Insights. Recomendação: instrumentar via `git log --name-only` agregando últimos 30 dias.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Split Module** (Reduce Size) | `ConexosClient` cresceu para 1.855 LOC absorvendo CRUD de borderô + validações de título + listagem fin010 + adiantamentos + DI/DUIMP + processos + filiais. NÃO foi dividido por sub-domínio (ex.: `ConexosFin010Client`, `ConexosCom298Client`, `ConexosBaseClient`). | ❌ ausente | `wc -l src/backend/domain/client/ConexosClient.ts` → 1855 |
| **Increase Semantic Coherence** (Increase Cohesion) | `ConexosClient` mistura *leitura de processo* (ERP read-side) com *escrita transacional do fin010* (borderô handshake) — dois sub-domínios distintos do ERP. `routes/permutas.ts` mistura endpoints de ingestão, eleição, cliente-filtro, alocação manual, reconciliação, gestão de borderôs. `frontend/app/permutas/page.tsx` (2.385 LOC) reúne dashboard + tabs + modais + handlers — múltiplas responsabilidades em um único componente. | ❌ ausente | `grep -c "public " src/backend/domain/client/ConexosClient.ts` → 22; `grep -c "^router\." src/backend/routes/permutas.ts` → 11 |
| **Encapsulate** (Reduce Coupling) | Boa para `EnvironmentProvider` (gate `CONEXOS_WRITE_ENABLED` encapsulado). RUIM para *magic numbers do fin010*: `docTip=2`, `titCod=1`, `borVldTipo=2` aparecem cruamente em 6+, 7+, 4+ lugares. RUIM para mensagens de erro do ERP: a tradução está duplicada (2 mapas com chaves disjuntas). | ⚠️ parcial | `grep -rn "docTip: 2\|titCod: 1\|borVldTipo: 2" src/backend --include='*.ts'` |
| **Use an Intermediary** (Reduce Coupling) | `LegacyConexosShape` (interface `:74-108` de `ConexosClient.ts`) é exemplar — abstrai a auth/cookie do legado para permitir mock em testes. PORÉM as 4 ações de borderô (`finalizar`/`cancelar`/`estornar`/excluir) NÃO têm um intermediário compartilhado — os handlers Express recriam o boilerplate inteiro (parse `borCod` + parse `filCod` + try/catch + `erpErrorMessage`). | ⚠️ parcial | `ConexosClient.ts:74-108`; `routes/permutas.ts:420-533` |
| **Restrict Dependencies** (Reduce Coupling) | DDD enforced no CLAUDE.md ("Lambda → Service → Repository → Client") e o `PatternGuardian` é o guard — mas hoje há **5 imports route→repository** em `routes/permutas.ts:10-14` (cliente-filtro, processamento, execucao, relational, snapshot). Significa que as 5 rotas correspondentes não passam por service, contornando regras de negócio. | ❌ ausente | `grep -rn "from '.*domain/repository/" src/backend/routes` |
| **Refactor** (Reduce Coupling) | Sessão NÃO refatorou nada — só adicionou. `ConexosClient` cresceu 14% (+236/1855). `routes/permutas.ts` cresceu 43% (+176/582). FE `permutas/page.tsx` ficou em 2.385 LOC sem extração. | ❌ ausente | diff `30d5700..HEAD` |
| **Abstract Common Services** (Reduce Coupling) | A função `erpErrorMessage` foi extraída no topo do `routes/permutas.ts` (bom!), MAS uma cópia paralela (`friendlyErpMessage`) vive em `ReconciliacaoPermutaService.ts:498`. As 4 actions de borderô poderiam compartilhar um `executarAcaoBordero(req, res, fn)` — não fazem. | ⚠️ parcial | `routes/permutas.ts:53-61` vs `ReconciliacaoPermutaService.ts:498-511` |
| **Defer Binding — Configuration files** | `EnvironmentProvider` + SSM (alvo) + flags `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN`/`conexosFilCod` — excelente. Toggle `PROCESSAMENTO_HABILITADO` no FE é hard-coded (`page.tsx:82`), não configurável. | ⚠️ parcial | `BorderoGestaoService.ts:238-243`; `frontend/app/permutas/page.tsx:82` |
| **Defer Binding — Polymorphism** | `@injectable()`/`@singleton()` em tudo (excelente), mas zero `container.register(token)` com múltiplas implementações. 1 token Symbol (`LEGACY_CONEXOS_TOKEN`). Domain-bound, sem necessidade de runtime variability — aceitável. | ✅ presente (mínimo viável) | `ConexosClient.ts:36`; `grep -rn "container.register"` |
| **Defer Binding — Plugin / Runtime registration** | N/A — sistema mono-tenant ainda; tactic vira relevante quando o roadmap multi-tenant (1 conta AWS/cliente) materializar. | N/A | CLAUDE.md |

## 4. Findings (achados)

### F-modifiability-1: `ConexosClient` virou God-client (1.855 LOC, 22 métodos públicos, 4 sub-domínios)

- **Severidade**: P1
- **Tactic violada**: Split Module + Increase Semantic Coherence
- **Localização**: `src/backend/domain/client/ConexosClient.ts:401-1855`
- **Evidência (objetiva)**:
  ```
  $ wc -l src/backend/domain/client/ConexosClient.ts
  1855
  $ grep -c "^\s*public " src/backend/domain/client/ConexosClient.ts
  22
  # sub-domínios cobertos em um único arquivo:
  #  - filiais/processos: listFiliais, getFilCodDefault, listProcessos
  #  - financeiro a pagar: listFinanceiroAPagar, listFinanceiroAPagarByGerNum, listAdiantamentoFinanceiroAPagar/Receber, listTitulosAPagar
  #  - adiantamentos/proforma: listAdiantamentosProforma
  #  - DI/DUIMP: listDeclaracaoByProcesso
  #  - títulos: getDetalheTitulos, listBaixasTitulo
  #  - fin010 borderô CRUD: criarBordero, getBordero, listBorderos, excluirBordero, finalizarBordero, cancelarBordero, estornarBordero
  #  - fin010 baixa CRUD: listBaixas, excluirBaixa
  #  - fin010 validações: validarTituloBaixa, validarTituloPermuta, atualizarValorLiquido, gravarBaixaPermuta
  ```
- **Impacto técnico**: 9 importadores diretos → qualquer mudança de assinatura (ex.: renomear param de `excluirBaixa`) recompila/quebra meio domínio. Carregamento do arquivo no IDE é lento, code review difícil (não cabe em uma tela). Mais grave: testes do client são monolíticos — um mock setup serve para 22 métodos.
- **Impacto de negócio**: cada nova rota do ERP adicionada cresce o God-client; lead time de feature cresce com a superfície do arquivo. Em 6 meses, com SISPAG (Frente II) e Popula GED (Frente III) chegando ao mesmo client (ou tendo que decidir entre criar outros), o custo de orientação para novo dev sobe drasticamente.
- **Métrica de baseline**: 1.855 LOC / 22 métodos públicos / 9 importadores / +236 LOC apenas na Fase 3.1.

### F-modifiability-2: 4 handlers de ação de borderô em `routes/permutas.ts` duplicam o mesmo template (parse + try/catch + erpErrorMessage)

- **Severidade**: P1
- **Tactic violada**: Abstract Common Services + Refactor
- **Localização**: `src/backend/routes/permutas.ts:420-533` (finalizar `:421-447`, cancelar `:450-476`, estornar `:479-505`, excluirBordero `:508-533`)
- **Evidência (objetiva)**:
  ```
  $ grep -c "borCod = Number(req.params.borCod)" src/backend/routes/permutas.ts
  5
  $ grep -c "erpErrorMessage(err)" src/backend/routes/permutas.ts
  5
  # cada handler tem 25-30 linhas com o MESMO esqueleto:
  #   await bootstrapAppContainer();
  #   const borCod = Number(req.params.borCod);
  #   if (!Number.isFinite(borCod)) { res.status(400).json({error: 'borCod inválido'}); return; }
  #   const executadoPor = req.user?.sub ?? req.user?.email ?? 'unknown';
  #   const filCod = Number(req.body?.filCod);
  #   const service = container.resolve(BorderoGestaoService);
  #   try { res.json(await service.XYZ({...})); }
  #   catch (err) { res.status(400).json({error: erpErrorMessage(err)}); }
  ```
- **Impacto técnico**: adicionar uma nova ação (ex.: "reabrir borderô") = copy-paste de 25 linhas, propenso a desvios sutis (typo no body, esquecimento de `heavyRouteLimiter`). Mudar a forma como `filCod` é resolvida = 4 edições.
- **Impacto de negócio**: Frente II (SISPAG) terá fluxo análogo (lote pagamento → enviar/cancelar/estornar). Sem extração, o boilerplate dobra.
- **Métrica de baseline**: 4 handlers x ~28 LOC = ~112 LOC redundantes; 5 `borCod = Number(req.params.borCod)`; 5 `erpErrorMessage(err)`.

### F-modifiability-3: Mapa de tradução de mensagens do ERP duplicado em 2 lugares com chaves disjuntas

- **Severidade**: P1
- **Tactic violada**: Abstract Common Services + Encapsulate
- **Localização**: `src/backend/routes/permutas.ts:44-51` (`ERP_MESSAGE_PT`, chaves `FIN_014.*` + `Generic.ERROR_MESSAGE`) **vs.** `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:498-511` (`friendlyErpMessage`, chaves `FIN_010.*` + `CnxValidatorMny` + `CnxValidatorDescr`)
- **Evidência (objetiva)**:
  ```
  routes/permutas.ts:44  const ERP_MESSAGE_PT: Record<string, string> = {
      'FIN_014.DELETAR_REGISTRO_ESTORNO': 'Não é possível excluir...',
      'FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO': 'Não é possível alterar: borderô finalizado...',
      'Generic.ERROR_MESSAGE': 'O ERP recusou esta operação...',
  };

  ReconciliacaoPermutaService.ts:498  private friendlyErpMessage = (err: unknown): string => {
      const map: Record<string, string> = {
          'FIN_010.DATA_BLOQUEADA_PELA_CONTABILIDADE': '...',
          'FIN_010.FIN_IMPOSSIVEL_ALTERAR_REGISTRO': 'Borderô finalizado — não é possível alterar.',
          CnxValidatorMny: 'Valor monetário inválido...',
          CnxValidatorDescr: 'Descrição/comentário inválido...',
      };
  ```
  **Nota:** `FIN_010.FIN_IMPOSSIVEL_ALTERAR_REGISTRO` ↔ `FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO` são DUAS chaves diferentes para a MESMA causa raiz ("borderô finalizado"). Tradução depende de qual camada pegou o erro primeiro → UX inconsistente.
- **Impacto técnico**: adicionar uma nova validação `CnxValidator*` requer escolher qual mapa atualizar; ninguém vai lembrar dos dois. Já há divergência: `FIN_010.DATA_BLOQUEADA_PELA_CONTABILIDADE` SÓ aparece no service — se o erro borbulhar pelo `excluirBaixa` (rota), o usuário recebe a chave crua.
- **Impacto de negócio**: mensagens de erro inconsistentes = retrabalho do analista (não sabe se "finalizado" no service e "borderô finalizado" na rota são o mesmo problema). Risco de mensagens em inglês/código vazarem para a UI.
- **Métrica de baseline**: 2 mapas, 7 chaves total, 0 chaves em comum (1 mesma causa raiz com keys diferentes).

### F-modifiability-4: `routes/permutas.ts` faz 5 imports diretos de `repository/` — viola DDD layer enforcement (Inviolable Rule)

- **Severidade**: P1
- **Tactic violada**: Restrict Dependencies
- **Localização**: `src/backend/routes/permutas.ts:10-14`
- **Evidência (objetiva)**:
  ```
  $ grep -n "from '.*domain/repository/" src/backend/routes/permutas.ts
  10: import ClienteFiltroRepository       from '../domain/repository/permutas/ClienteFiltroRepository.js';
  11: import PermutaProcessamentoRepository from '../domain/repository/permutas/PermutaProcessamentoRepository.js';
  12: import PermutaExecucaoRepository     from '../domain/repository/permutas/PermutaExecucaoRepository.js';
  13: import PermutaRelationalRepository   from '../domain/repository/permutas/PermutaRelationalRepository.js';
  14: import PermutaSnapshotRepository     from '../domain/repository/permutas/PermutaSnapshotRepository.js';

  # exemplos de uso direto na rota:
  :194 const repository = container.resolve(PermutaSnapshotRepository); ...
  :253 const repository = container.resolve(PermutaRelationalRepository); ...
  :366 const repository = container.resolve(PermutaProcessamentoRepository); ...
  :565 const repository = container.resolve(PermutaExecucaoRepository); ...
  ```
- **Impacto técnico**: 5 endpoints (`/runs`, `/cliente-filtro` GET/POST/DELETE, `/importadores`, `/processar`, `/execucoes`) pulam a camada de service. Mudanças de regra de negócio (ex.: invalidar processamento expirado, validar pesCod) só podem ser aplicadas duplicadamente. Quebra o invariante que o `PatternGuardian` deveria garantir; futuro multi-tenant precisará re-injetar contexto em cada handler.
- **Impacto de negócio**: regra de negócio ficou na borda HTTP — qualquer reuso (job EventBridge no alvo, CLI) precisará reimplementar. Aumenta risco de inconsistência entre canais.
- **Métrica de baseline**: 5 violações em 1 arquivo de rota.

### F-modifiability-5: Magic numbers do fin010 (`docTip=2`, `titCod=1`, `borVldTipo=2`) espalhados em 17+ ocorrências sem constante

- **Severidade**: P2
- **Tactic violada**: Encapsulate (defer binding via constante semântica)
- **Localização**: `src/backend/domain/client/ConexosClient.ts:1023, 1112, 1114, 1145, 1241, 1282, 1287, 1291, 1319`; `src/backend/domain/service/permutas/BorderoGestaoService.ts:101, 164, 166`; `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:227, 285, 365, 371, 377`
- **Evidência (objetiva)**:
  ```
  $ grep -rn "docTip: 2\|titCod: 1\|borVldTipo: 2" src/backend --include='*.ts' | grep -v ".test.ts" | grep -v dist/ | wc -l
  (cerca de 17 ocorrências)

  # exemplos do que significa cada literal:
  ReconciliacaoPermutaService.ts:227  titCod: 1,         # = TIT_COD_INVOICE
  ReconciliacaoPermutaService.ts:365  docTip: 2,         # = DOC_TIP_INVOICE
  ReconciliacaoPermutaService.ts:371  borVldTipo: 2,     # = BOR_VLD_TIPO_PERMUTA
  BorderoGestaoService.ts:101         titCod: 1,
  ConexosClient.ts:1145               const docTip = params.docTip ?? 2; // 2 = título de invoice
  ```
  **Contraste:** `CONTA_GER_JUROS = 131` está bem encapsulado (`ReconciliacaoPermutaService.ts:15`); `GER_PERMUTA_ARECEBER`/`GER_PERMUTA_APAGAR`/`GER_CLIENTES_DIVERSOS_OP_PROPRIA` também (`ConexosClient.ts:313-324`). O contrato fin010 NÃO está.
- **Impacto técnico**: se o ERP redefinir um código (improvável mas possível em outro cliente/tenant — relembrar SaaSo alvo de 1 conta AWS/cliente), preciso varrer 17+ ocorrências. Não tem cobertura semântica: `2` em `borVldTipo` ≠ `2` em `docTip`. Já gerou um bug histórico documentado na linha 1133: "A sonda inicial confundiu os dois porque na filial 2 o filCod coincide com o docTip 2."
- **Impacto de negócio**: alto risco de regressão silenciosa em mudanças do contrato fin010; onboarding de dev precisa decorar o significado de cada número.
- **Métrica de baseline**: 17+ literais; 0 constantes em `permutas/conexosPermutasConstants.ts` para esses códigos do fin010 (só existem para os endpoints DI/DUIMP).

### F-modifiability-6: Regra "situação do borderô" duplicada em backend + 2 lugares no frontend

- **Severidade**: P2
- **Tactic violada**: Increase Semantic Coherence + Use an Intermediary (o BE deveria devolver a vista pronta, não o código)
- **Localização**: BE `src/backend/domain/service/permutas/BorderoGestaoService.ts:361-365` (`situacaoDoItem`); FE `src/frontend/app/permutas/borderos/page.tsx:51-58` (`SITUACAO_LABEL`) + `:60-70` (`situacaoBadge` mapeando para classes Tailwind)
- **Evidência (objetiva)**:
  ```
  # BE — derivação do código wire:
  BorderoGestaoService.ts:361
    private situacaoDoItem = (item: { borVldFinalizado?: number }): BorderoSituacao => {
        if (item.borVldFinalizado === 1) return 'FINALIZADO';
        if (item.borVldFinalizado === 2) return 'CANCELADO';
        return 'EM_CADASTRO';
    };

  # FE — label PT-BR + cor:
  borderos/page.tsx:51
    const SITUACAO_LABEL: Record<BorderoSituacao, string> = {
      EM_CADASTRO: 'Em aberto', FINALIZADO: 'Finalizado', CANCELADO: 'Cancelado',
      ESTORNADO: 'Estornado', REMOVIDO: 'Removido', INDISPONIVEL: 'Indisponível',
    }
  borderos/page.tsx:60
    const situacaoBadge = (s) => { /* if/else triple-aninhado mapeando para classes */ }
  ```
  Adicionar um estado novo (ex.: `PENDENTE_APROVACAO_FINANCEIRO` para o roadmap) = editar o type union (`BorderoGestaoService.ts:12-18`), o `situacaoDoItem`, `SITUACAO_LABEL` e o `situacaoBadge` ternário aninhado (FE). **4 edições em 3 arquivos** para uma "nova situação".
- **Impacto técnico**: regra de domínio sangra para a UI; testes do FE precisam re-validar tradução; risco de "rótulo incoerente" como já vimos no comentário do código ("Estornado" devolve `EM_CADASTRO` no `situacaoDoItem` por design — FE precisa saber dessa nuance).
- **Impacto de negócio**: cada estado novo no fin010 vira retrabalho duplicado entre BE e FE.
- **Métrica de baseline**: 1 regra de negócio implementada em 3 pontos (BE service + FE label + FE badge).

### F-modifiability-7: `frontend/app/permutas/page.tsx` com 2.385 LOC absorve dashboard + 4 tabs + 4+ modais

- **Severidade**: P1
- **Tactic violada**: Split Module + Increase Semantic Coherence
- **Localização**: `src/frontend/app/permutas/page.tsx` (todo)
- **Evidência (objetiva)**:
  ```
  $ wc -l src/frontend/app/permutas/page.tsx
  2385
  $ grep -c "^import " src/frontend/app/permutas/page.tsx
  20 (linhas) — múltiplos imports agrupados; >40 símbolos importados
  $ grep -cE "if |else |switch |case |for |while |\?\?|&&|\|\|" src/frontend/app/permutas/page.tsx
  133  # densidade de controle de fluxo
  ```
- **Impacto técnico**: arquivo dispara o cliente Next.js como bundle pesado (RSC hidratado); refatoração de QUALQUER tab exige tocar o monólito; risco alto de merge conflict (a sessão atual já adicionou +126 LOC sem extrair nada). IIFEs no JSX (`borderos/page.tsx:359-436`) escondem regra de habilitação dos botões dentro da renderização — torna lógica de negócio invisível para testes.
- **Impacto de negócio**: feature velocity no painel de permutas cai com o tamanho do arquivo; onboarding lento.
- **Métrica de baseline**: 2.385 LOC, 133 keywords de controle de fluxo, 0 sub-componentes extraídos para `components/permutas/`.

### F-modifiability-8: Cognitive complexity warnings — 17 funções > 15 (sessão adicionou 2 novas em `BorderoGestaoService`)

- **Severidade**: P2
- **Tactic violada**: Reduce Size of Module + Refactor
- **Localização**: 17 funções totais no backend; novas desta sessão:
  - `BorderoGestaoService.ts:278` (`listarBorderos`) — complexidade **25**
  - `BorderoGestaoService.ts:314` (callback inline do `for-of`) — complexidade **16**
  - herdada/agravada: `ReconciliacaoPermutaService.ts:78` (`reconciliar`) — complexidade **20+** (não medi exato no novo diff mas Biome lista)
  Lista completa (Biome): `ConexosClient.ts:462, :828`; `RetryExecutor.ts:31`; `PermutaRelationalRepository.ts:225, :551`; `AlocacaoPermutasService.ts:106, :167`; `BorderoGestaoService.ts:278, :314`; `EleicaoPermutasService.ts:523` (complexidade **65**!); `GestaoPermutasService.ts:171, :360`; `IngestaoPermutasService.ts:197, :269, :340`; `ReconciliacaoPermutaService.ts:78`; `services/conexos.ts:142`.
- **Evidência (objetiva)**:
  ```
  $ cd src/backend && npm run lint 2>&1 | grep "noExcessiveCognitiveComplexity" | wc -l
  17
  ```
- **Impacto técnico**: Biome configurado a 15 mas o time tolera 17 warnings — sinal de que o gate virou ruído. `listarBorderos` (complexidade 25) é o coração da nova feature de gestão e tem if/optional spread/null-coalescing aninhado.
- **Impacto de negócio**: bug nessas funções demora mais para isolar; refatoração futura mais cara.
- **Métrica de baseline**: 17 warnings; sessão adicionou 2 novas; pico em `EleicaoPermutasService.ts:523` (65).

### F-modifiability-9: Toggle de produto hard-coded no FE (`PROCESSAMENTO_HABILITADO = false`)

- **Severidade**: P3
- **Tactic violada**: Defer Binding — Configuration files
- **Localização**: `src/frontend/app/permutas/page.tsx:82`
- **Evidência (objetiva)**:
  ```
  permutas/page.tsx:82
    const PROCESSAMENTO_HABILITADO = false
    // Religar para `true` quando a publicação dos dados no Conexos estiver pronta.
  ```
- **Impacto técnico**: Mudar requer build + deploy Vercel; sem possibilidade de A/B ou rollback rápido por env.
- **Impacto de negócio**: Em produção com SSO corporativo, ligar/desligar a feature de processamento exigirá novo deploy ao invés de simples flip de ENV no Vercel.
- **Métrica de baseline**: 1 toggle hard-coded; FE não consome `NEXT_PUBLIC_*` para essa flag.

## 5. Cards Kanban

### [modifiability-1] Quebrar `ConexosClient` por sub-domínio do ERP

- **Problema**
  > `ConexosClient.ts` cresceu para **1.855 LOC** com 22 métodos públicos cobrindo 4 sub-domínios distintos (processos/filiais, financeiro a pagar, fin010 borderô CRUD+validações, DI/DUIMP). Esta sessão adicionou +236 LOC sem refatorar. 9 importadores diretos — qualquer mudança ricocheta.

- **Melhoria Proposta**
  > Aplicar **Split Module** dividindo em ao menos:
  > - `ConexosFin010Client` (borderô CRUD: criar/get/list/excluir/finalizar/cancelar/estornar + baixa CRUD + validações `validarTituloBaixa`/`validarTituloPermuta`/`atualizarValorLiquido`/`gravarBaixaPermuta` + `listBorderos`/`listBaixas`)
  > - `ConexosProcessosClient` (`listFiliais`, `getFilCodDefault`, `listProcessos`, `listDeclaracaoByProcesso`)
  > - `ConexosFinanceiroAPagarClient` (`listFinanceiroAPagar*`, `listAdiantamentoFinanceiroAPagar/Receber`, `listTitulosAPagar`, `getDetalheTitulos`, `listBaixasTitulo`, `listAdiantamentosProforma`)
  > Manter `ConexosClient` como façade/composto se o consumidor precisar (delegating). Ambos `@singleton() @injectable()`. Atualizar os 5 services importadores.

- **Resultado Esperado**
  > Cada novo client ≤ 600 LOC; nenhum método público mistura sub-domínios. Mudança no contrato de borderô não recompila código de processos/DI. (1.855 LOC em 1 arquivo → 3 arquivos ≤ 700).

- **Tactic alvo**: Split Module + Increase Semantic Coherence
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-modifiability-1
- **Métricas de sucesso**:
  - LOC max do client: **1.855 → ≤ 700**
  - Métodos públicos por client: **22 → ≤ 10**
  - Importadores de qualquer client: **9 → ≤ 5**
- **Risco de não fazer**: Frente II (SISPAG/com298) e Frente III (Popula GED) vão pressionar o mesmo arquivo → 2.500+ LOC em 6 meses, time-to-onboard dobra.
- **Dependências**: nenhuma.

### [modifiability-2] Extrair `borderoActionHandler` para os 4 endpoints de ação de borderô

- **Problema**
  > Os 4 handlers de ação em `routes/permutas.ts:420-533` (finalizar/cancelar/estornar/excluirBordero) repetem o mesmo template de 25 linhas: bootstrap → parse `borCod`/`filCod` → try/catch com `erpErrorMessage(err)`. ~112 LOC redundantes; adicionar nova ação (ex.: "reabrir borderô" da Frente II) = copy-paste propenso a desvio.

- **Melhoria Proposta**
  > Aplicar **Abstract Common Services**: extrair `borderoActionRoute(method, path, serviceMethod)` em `routes/permutas.ts` (ou em `http/borderoAction.ts`) que recebe a função do service e cuida do parse + try/catch + tradução. Os 4 endpoints viram 1 linha cada. Se vier Frente II análoga (SISPAG lote ação), reusar.

- **Resultado Esperado**
  > 4 handlers x 28 LOC → 4 declarações x ~6 LOC + 1 helper x ~30 LOC. Nova ação de borderô = 1 linha + service method.

- **Tactic alvo**: Abstract Common Services + Refactor
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-2
- **Métricas de sucesso**:
  - LOC dos 4 handlers: **~112 → ~25**
  - `routes/permutas.ts` total: **582 → ≤ 500**
- **Risco de não fazer**: Frente II reproduzirá o mesmo boilerplate; bug de auth/limiter pode escapar em uma cópia esquecida.
- **Dependências**: nenhuma.

### [modifiability-3] Centralizar tradução de mensagens do ERP num `ConexosErpMessageTranslator`

- **Problema**
  > Dois mapas de tradução PT-BR convivem com chaves disjuntas: `ERP_MESSAGE_PT` (`routes/permutas.ts:44-51`, chaves `FIN_014.*`) e `friendlyErpMessage` (`ReconciliacaoPermutaService.ts:498-511`, chaves `FIN_010.*` + `CnxValidator*`). Pior: a MESMA causa raiz ("borderô finalizado") aparece sob `FIN_010.FIN_IMPOSSIVEL_ALTERAR_REGISTRO` num lugar e `FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO` no outro.

- **Melhoria Proposta**
  > **Encapsulate + Use an Intermediary**: criar `domain/client/permutas/ConexosErpMessageTranslator.ts` (`@singleton() @injectable()`) que centraliza o mapa e o extrator (`extractErpData` também duplica entre o service e o `erpErrorMessage` da route). Service e route consomem o mesmo singleton. Test bench único.

- **Resultado Esperado**
  > 1 fonte da verdade para tradução PT-BR; adicionar novo `FIN_XXX` = 1 linha em 1 arquivo. Mensagens uniformes entre HTTP e service.

- **Tactic alvo**: Encapsulate + Abstract Common Services
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-3
- **Métricas de sucesso**:
  - Mapas de tradução: **2 → 1**
  - Chaves duplicadas para mesma causa raiz: **2 → 0**
- **Risco de não fazer**: divergência cresce a cada feature; UX mostra strings cruas quando o erro borbulha pela rota errada.
- **Dependências**: nenhuma.

### [modifiability-4] Reintroduzir o invariante DDD (route → service → repository) eliminando os 5 imports route→repository

- **Problema**
  > `routes/permutas.ts:10-14` importa 5 repositories diretamente, pulando a camada service em 5 endpoints (`/runs`, `/cliente-filtro` x3, `/importadores`, `/processar`, `/execucoes`). Quebra o invariante "Lambda/route → Service → Repository → Client" do CLAUDE.md.

- **Melhoria Proposta**
  > **Restrict Dependencies**: criar (ou estender) services adequados — `RunsService`, `ClienteFiltroService`, `ImportadoresService`, `ProcessamentoService` (já existe parcialmente em `GestaoPermutasService`?), `ExecucoesService`. A rota só importa services. Adicionar regra no `PatternGuardian` (ou Biome rule) para barrar `from '.*domain/repository/'` em `routes/`.

- **Resultado Esperado**
  > 0 imports `routes → repository`. Regras de negócio (ex.: invalidar processamento expirado, escopo por filial) ficam reusáveis para job/CLI/Lambda alvo.

- **Tactic alvo**: Restrict Dependencies
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-modifiability-4
- **Métricas de sucesso**:
  - Imports `routes → repository`: **5 → 0**
  - Gate `PatternGuardian`: bloqueia novo `routes/* → repository/*`
- **Risco de não fazer**: cada novo canal (EventBridge job alvo, SSO+RBAC, CLI ops) duplica a regra; PatternGuardian perde credibilidade.
- **Dependências**: nenhuma.

### [modifiability-5] Encapsular os códigos wire do fin010 (`docTip`, `titCod`, `borVldTipo`) em constantes semânticas

- **Problema**
  > Literais `docTip=2`, `titCod=1`, `borVldTipo=2` aparecem em 17+ ocorrências entre `ConexosClient.ts`, `ReconciliacaoPermutaService.ts` e `BorderoGestaoService.ts`. Já gerou bug histórico documentado em `ConexosClient.ts:1133` ("A sonda inicial confundiu os dois porque na filial 2 o filCod coincide com o docTip 2").

- **Melhoria Proposta**
  > **Encapsulate**: estender `domain/client/permutas/conexosPermutasConstants.ts` (já existe e exporta `TPD_PROFORMA`, `GER_CLIENTES_DIVERSOS_OP_PROPRIA` etc.) com:
  > `DOC_TIP_INVOICE = 2`, `TIT_COD_INVOICE = 1`, `BOR_VLD_TIPO_PERMUTA = 2`. Substituir as 17+ ocorrências; manter os JSDoc semânticos no payload.

- **Resultado Esperado**
  > 0 magic numbers fin010 em services/clients; grep `docTip: 2` retorna apenas a constante. Mudança de contrato (ex.: outro tenant com `BOR_VLD_TIPO` diferente) = 1 ponto.

- **Tactic alvo**: Encapsulate
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-5
- **Métricas de sucesso**:
  - Literais `docTip:|titCod:|borVldTipo:` fora de `conexosPermutasConstants.ts`: **17+ → 0**
- **Risco de não fazer**: SaaSo multi-tenant (alvo) eventualmente terá tenant com config fin010 distinta; sem constante, vai virar bug-by-bug.
- **Dependências**: nenhuma.

### [modifiability-6] Mover a tradução "situação do borderô" para o BE (com `label` + `tone`) e simplificar o FE

- **Problema**
  > A regra que mapeia `borVldFinalizado → BorderoSituacao` vive em `BorderoGestaoService.situacaoDoItem` (`:361`). O FE replica `SITUACAO_LABEL` (`borderos/page.tsx:51`) + `situacaoBadge` (`:60`, ternário aninhado para classes Tailwind). Estado novo = 3 lugares para editar.

- **Melhoria Proposta**
  > **Increase Semantic Coherence + Use an Intermediary**: o BE devolve `{ situacao, label, tone }` (`tone: 'success'|'warning'|'destructive'|'neutral'`). O FE só renderiza, sem if/else. Para estados específicos de UI (ex.: `INDISPONIVEL`), manter um fallback FE pequeno.

- **Resultado Esperado**
  > 1 lugar para adicionar nova situação (BE). FE = puro mapeamento `tone → className`.

- **Tactic alvo**: Increase Semantic Coherence + Use an Intermediary
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-6
- **Métricas de sucesso**:
  - Lugares para adicionar nova situação: **3 → 1**
  - `situacaoBadge` ternário aninhado: **eliminado**
- **Risco de não fazer**: estado novo da Frente II/III replicará o mesmo anti-padrão; lookup-table sangra para a UI.
- **Dependências**: nenhuma.

### [modifiability-7] Quebrar `frontend/app/permutas/page.tsx` (2.385 LOC) em sub-componentes por tab/modal

- **Problema**
  > `page.tsx` virou monólito de 2.385 LOC com 4 tabs, ≥4 modais e 133 keywords de controle de fluxo. `borderos/page.tsx` (595 LOC) tem IIFEs no JSX (`:359-436`) escondendo regra de habilitação de botão dentro do render — invisível para teste.

- **Melhoria Proposta**
  > **Split Module + Increase Semantic Coherence**: extrair por feature/tab para `src/frontend/components/permutas/`:
  > - `PermutasIngestaoModal.tsx`, `PermutasReconciliacaoModal.tsx`, `PermutasAlocacaoManualModal.tsx`
  > - `PermutasTabPendentes.tsx`, `PermutasTabAlocadas.tsx`, etc.
  > - `BorderoActionButtons.tsx` (substitui o IIFE em `borderos/page.tsx`)
  > Cada sub-componente: ≤ 250 LOC, exportado como named, testável isoladamente.

- **Resultado Esperado**
  > `permutas/page.tsx` ≤ 500 LOC (composição); cada sub ≤ 250. Velocidade de feature dobra.

- **Tactic alvo**: Split Module + Increase Semantic Coherence
- **Severidade**: P1
- **Esforço estimado**: L (1–2sem) — alto risco de regressão visual, exigir suite de teste FE antes
- **Findings relacionados**: F-modifiability-7, F-modifiability-6
- **Métricas de sucesso**:
  - LOC `permutas/page.tsx`: **2.385 → ≤ 500**
  - Sub-componentes em `components/permutas/`: **0 → ≥ 6**
  - LOC `borderos/page.tsx`: **595 → ≤ 350**
- **Risco de não fazer**: cada nova tab triplica o tempo de PR; merge conflicts garantidos em desenvolvimentos paralelos.
- **Dependências**: cobertura de teste FE razoável (51 testes hoje — provavelmente ampliar antes).

### [modifiability-8] Externalizar o toggle `PROCESSAMENTO_HABILITADO` para env do FE

- **Problema**
  > `permutas/page.tsx:82` tem `PROCESSAMENTO_HABILITADO = false` hard-coded. Ligar/desligar exige build+deploy Vercel.

- **Melhoria Proposta**
  > **Defer Binding — Configuration files**: trocar por `process.env.NEXT_PUBLIC_PERMUTAS_PROCESSAMENTO_HABILITADO === 'true'`. Documentar no `.env.example` do FE.

- **Resultado Esperado**
  > Flip de feature = mudar env Vercel + rebuild (~30s) em vez de PR + revisão.

- **Tactic alvo**: Defer Binding (Configuration files)
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-9
- **Métricas de sucesso**:
  - Toggles de produto hard-coded em `frontend/app/`: **1 → 0**
- **Risco de não fazer**: convivendo bem hoje; vira atrito quando o write-back habilitar.
- **Dependências**: nenhuma.

## 6. Notas do agente

- Escopo estrito: arquivos do diff `30d5700..HEAD` da sessão de Fase 3.1 (mas medi a dimensão completa dos arquivos tocados — não só o delta — porque modifiability se manifesta no estado, não no diff).
- **Cross-QA**:
  - F-modifiability-2/3 (extrair `borderoActionHandler` + centralizar tradução ERP) também atende **Integrability** (Encapsulate) e **Testability** (1 lugar para testar).
  - F-modifiability-1 (Split `ConexosClient`) e F-modifiability-7 (split `page.tsx`) atendem **Testability** — God-module é hard-to-test by definition.
  - F-modifiability-9 (`PROCESSAMENTO_HABILITADO`) é também **Deployability** (toggle externalizável = sem redeploy por flip).
  - F-modifiability-4 (route→repository) é também **Security** (regras de auth/escopo por filial ficam dispersas se cada rota fala com o repo direto).
- Não medi ontology drift item-a-item — commit `c51d6d0` da sessão anterior já fez a sincronização; recomendo `/retro-ontology` antes do próximo `/feature-new`.
