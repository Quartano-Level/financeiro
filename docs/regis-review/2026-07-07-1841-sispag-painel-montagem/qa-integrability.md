---
qa: Integrability
qa_slug: integrability
run_id: 2026-07-07-1841-sispag-painel-montagem
agent: qa-integrability
generated_at: 2026-07-07T18:55:00-03:00
scope: backend
score: 7.5
findings_count: 8
cards_count: 7
---

# Integrability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Time Kavex (Yuri) | Nova superfície SISPAG (fin064/fin015/fin010) precisa entrar no painel sem quebrar Permutas + preparar seam p/ escrita (fin015 remessa → pasta de rede → VAN Nexxera → fin052 retorno → baixa fin010) | `ConexosSispagClient`, `SispagPainelService`, `LotePagamentoService`, `routes/sispag.ts`, `lib/sispag.ts` | Produção (Render + Vercel), Conexos PRD `columbiatrading.conexos.cloud` autenticado por sessão compartilhada (Postgres SID) | Read-only por composição — reusa `ConexosBaseClient` (auth/retry/paginate), acrescenta métodos domain-specific (`listTitulosAPagar`, `listLotes`, `listBorderosAPagar`, `getTituloAPagar`), Zod nos boundaries, gate de escrita **deferido** para Fatia 3 | Superfície SISPAG isolada num sub-client dedicado; **0 leak** de `postGeneric`/`fetch`/`axios` fora do Client Layer; % arquivos com Zod no boundary do client = 100%; custo estimado de trocar a VAN de remessa (Nexxera → outro provedor) = **~1 novo client + 1 job**, sem alterar `LotePagamentoService`.

Este QA responde a três perguntas de Bass ch.6 aplicadas ao delta:
1. **Adição** de superfície nova (SISPAG read) — quanto código toca? R: **1 client novo + 2 services + 1 repo + 1 route + 1 lib front + 1 migration**; nenhuma alteração em código Permutas.
2. **Upgrade** do Conexos (v2 API hipotético) — o quanto do delta muda? R: filtros `docCod#EQ`/`titDtaVencimento#GE/#LE` são strings livres → alto risco de silenciamento pelo fallback catch-all (F-integrability-1).
3. **Substituição** da última milha (Nexxera VAN → outro provedor de transporte) — o seam existe? R: só documentado no ADR-0015; ainda **sem interface materializada** — F-integrability-5.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Métodos públicos de `ConexosSispagClient` que expõem verbo genérico HTTP (`get/post/list`) | 0 | 0 | ✅ | `grep -n "public " src/backend/domain/client/ConexosSispagClient.ts` (linhas 87, 109, 164, 197, 228) |
| Uso de `axios`/`fetch` em `service/sispag/**`, `repository/sispag/**`, `routes/sispag.ts` | 0 | 0 | ✅ | `grep -rn "axios\|fetch(" src/backend/domain/service/sispag src/backend/domain/repository/sispag src/backend/routes/sispag.ts` |
| Cobertura Zod no boundary do client SISPAG (schemas por row-shape) | 3/3 (titulo, lote, bordero) | 100% | ✅ | `ConexosSispagClient.ts:39-82` |
| Cobertura Zod no boundary da rota SISPAG (validate input) | 4/4 schemas (criar/listar/incluir/versao) | 100% | ✅ | `routes/sispag.ts:53-67` |
| `process.env` cru em `service/sispag/**`, `client/ConexosSispagClient.ts`, `routes/sispag.ts` | 0 | 0 | ✅ | `grep -rn "process\.env" src/backend/domain/service/sispag src/backend/domain/client/ConexosSispagClient.ts src/backend/routes/sispag.ts` |
| Serviços SISPAG que dependem de >2 clients Conexos | 1 (`SispagPainelService` injeta `ConexosSispagClient` + `ConexosBaseClient`) | 0 (base client é infra, não domain) | ⚠️ | `SispagPainelService.ts:30-32` |
| Métodos do sub-client SISPAG com fallback silencioso `catch{}` em rota de leitura | 1 (`listTitulosAPagar`) | 0 (ou `catch (e) { if (!is4xx(e)) throw; log() }`) | ❌ | `ConexosSispagClient.ts:121-135` |
| Testes unitários do `ConexosSispagClient` (fixture-based response parsing) | 0 | ≥1 fixture por row-shape (titulo/lote/bordero) | ❌ | `ls src/backend/domain/client/*Sispag*.test.ts` → vazio; nem `ConexosSubClients.test.ts` cobre SISPAG (`grep -n "ConexosSispag" ConexosSubClients.test.ts` → 0 hits) |
| Reuso de infra Conexos (auth/retry/pagination) por composição | `@inject(ConexosBaseClient)` — mesmo padrão dos 4 sub-clients de Permutas | 100% via `ConexosBaseClient` | ✅ | `ConexosSispagClient.ts:87`; espelho de `ConexosFinanceiroClient.ts:157`, `ConexosBaixaClient.ts:55`, `ConexosCadastroClient.ts:62`, `ConexosTitulosClient.ts:118` |
| Duplicação de query wire entre sub-clients Conexos | `fin010/list borVldTipo#EQ:2` está em 2 sub-clients (`ConexosSispagClient.listBorderosAPagar` + `ConexosBaixaClient.listBorderos`) com DTOs distintos | 0 (Abstract Common Services) ou explicitação de escopo | ⚠️ | `ConexosSispagClient.ts:231` vs `ConexosBaixaClient.ts:313` |
| Ratio wrappers-de-API : call-sites (frontend SISPAG) | 1 wrapper (`src/frontend/lib/sispag.ts`) → 685 LOC de UI consomem só esse | 1:1 wrapper | ✅ | `src/frontend/app/sispag/page.tsx` (linhas 38-47) |
| Version pinning do endpoint Conexos (URL/header `api-version`) | 0/4 endpoints SISPAG versionados | Adhere to Standards (v guard OU header) | ⚠️ | `grep -n "/v[0-9]\|api-version" src/backend/domain/client/ConexosSispagClient.ts` → 0 hits |
| Guard-rails de escrita SISPAG (Fatia 3) prontos | Só `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` (compartilhado c/ Permutas) — sem flag SISPAG-específico | 1 flag por integração write | ⚠️ | `EnvironmentProvider.ts:69-70,96-97`; `SispagInterface.ts:81-86` propaga o mesmo par p/ o front |
| DTOs de fronteira do painel SISPAG (backend ↔ frontend) sincronizados por *contrato manual* | 4 interfaces re-declaradas em `frontend/lib/sispag.ts` (12-76) mirror de `backend/.../SispagInterface.ts` (11-91) | contract-test ou geração automática | ⚠️ | `diff` manual — mudança de campo em backend não quebra typecheck do frontend |

> ⚠️ **Não medível localmente**: taxa de erros do `fin064/list` com filtro `titDtaVencimento#GE/#LE` em produção (necessária para calibrar o valor real do fallback catch-all — hoje se algum tenant falha 100% das vezes ninguém sabe). Requer instrumentar `LogService.warn` no `catch` (F-integrability-1) + agregar em CloudWatch/Render logs por >=7 dias.

## 3. Tactics — Cobertura no nf-projects

### 3.1 Limit Dependencies

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Encapsulate | `ConexosSispagClient` é o único ponto de acoplamento ao wire SISPAG do Conexos. Métodos públicos são **domain-specific** (`listTitulosAPagar`/`getTituloAPagar`/`listLotes`/`listBorderosAPagar`) — nenhum `postGeneric`/`getGeneric` vaza. Zod normaliza row-shape na entrada. | ✅ presente | `ConexosSispagClient.ts:109,164,197,228` |
| Use an Intermediary | `ConexosBaseClient` é o intermediário compartilhado entre 5 sub-clients Conexos (Financeiro/Baixa/Cadastro/Titulos/**Sispag**) — auth + retry + paginate + parseDate ficam num só lugar. | ✅ presente | `ConexosBaseClient.ts:129-336` (composição por `@inject`) |
| Restrict Communication Paths | Regra é: `Service → sub-client Conexos` (nunca `→ ConexosBaseClient`). **`SispagPainelService` quebra** essa regra: injeta `ConexosBaseClient` só para `getFiliais()`. É o **único** service do repo que faz isso (grep) — nenhum service Permutas depende de `ConexosBaseClient`. | ⚠️ parcial | `SispagPainelService.ts:31,37`; contra-exemplo Permutas: `BorderoGestaoService.ts:70` só injeta `ConexosBaixaClient` |
| Adhere to Standards | Filtros seguem a gramática Conexos (`campo#EQ`, `campo#GE`, `campo#LE`, `campo#IN`) — mesmo padrão de `ConexosFinanceiroClient`. Nenhum "protocol drift". **Nenhum** pin de versão do Conexos (`/v1/…` ou `X-Api-Version`). | ⚠️ parcial | `ConexosSispagClient.ts:113-118,171,231`; grep de version pin = 0 hits |
| Abstract Common Services | `listBorderosAPagar` (SispagSispag) e `listBorderos` (Permutas/Baixa) **ambos** batem em `fin010/list` `borVldTipo#EQ:2` com DTOs distintos. Retry/pagination compartilhados via `ConexosBaseClient`, mas a *forma da query* está duplicada — deriva silenciosa é possível. | ⚠️ parcial | `ConexosSispagClient.ts:228-251` vs `ConexosBaixaClient.ts:286-348` |

### 3.2 Adapt

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Discover Service | Endpoint base do Conexos vem de `CONEXOS_BASE_URL` via `EnvironmentProvider`; sessão via `LegacyConexosShape.ensureSid()` (compartilhada). **Nexxera VAN**: apenas documentada no ADR-0015 §"Arquitetura-alvo do transporte" — nenhum interface skeleton p/ discovery de caminho de pasta/pickup. | ⚠️ parcial | `EnvironmentProvider.ts:53`; ADR-0015:102-113 |
| Tailor Interface | `TituloAPagar`/`LoteSispag`/`BorderoAPagar` são DTOs de domínio, distintos das row-shapes crus do ERP. Front reusa as 4 interfaces re-declaradas em `frontend/lib/sispag.ts` — divergência muda é possível (contract manual). | ⚠️ parcial | `SispagInterface.ts:11-91`; espelho `frontend/lib/sispag.ts:12-76` |
| Configure Behavior | Guard-rails de escrita usam `CONEXOS_WRITE_ENABLED` + `CONEXOS_DRY_RUN` compartilhados com Permutas — hoje é ok (SISPAG é 100% read); na Fatia 3 conflitará (ligar SISPAG write forçará ligar Permutas write junto). Modo do painel propaga esses flags para a UI (banner "somente leitura"). | ⚠️ parcial (write) / ✅ (read) | `EnvironmentProvider.ts:69-70,96-97`; `SispagPainelService.ts:74-78`; `SispagInterface.ts:81-86` |
| Manage Resources | `PAGE_SIZE=200` (base) / `1000` na leitura filtrada de `fin064` (título é caro server-side); `TITULOS_CAP=400` no serviço evita payload gigante ao front; borderôs cortados a 100 na resposta (`SispagPainelService.ts:82`); lotes cortados a `pageSize=100` na leitura. Reuso do `RetryExecutor` compartilhado. | ✅ presente | `ConexosSispagClient.ts:24,124,200,231`; `SispagPainelService.ts:17,58,82` |

### 3.3 Coordinate

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Orchestrate | `SispagPainelService.montarPainel` faz fan-out por filial com `Promise.all` + `Promise.allSettled` — falha de uma filial NÃO derruba o painel; loga `BUSINESS_WARN` e segue. Linear (nenhum SQS/EventBridge — não há scheduler ainda). `LotePagamentoService.incluirTitulo` orquestra 3 chamadas (ERP getTitulo + advisory-lock + tx) — leitura fora da tx (correto). | ✅ presente | `SispagPainelService.ts:47-53,86-105`; `LotePagamentoService.ts:60-152` |
| Manage Resource Coupling | `LotePagamentoService.incluirTitulo` usa `withAdvisoryLock` no par `(filCod, docCod, titCod)` (`lockKey` int32) + `withTransaction` + `ON CONFLICT DO NOTHING` — I3 fica na fronteira do agregado, sem lock global. | ✅ presente | `LotePagamentoService.ts:61-64,113-140,274-281`; `LotePagamentoRepository.ts:181-197` |

### 3.4 Facets modernos (fora do canon, exigidos)

| Tactic (Bass extended) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Contract testing | **Ausente** para `ConexosSispagClient`. `LotePagamentoService.test.ts` mocka `getTituloAPagar` no nível TS (`{ getTituloAPagar: jest.fn().mockResolvedValue(titulo) }`, linha 73-75) — nunca exercita `tituloRowSchema.safeParse` contra um payload real do `fin064/list`. `ConexosSubClients.test.ts` cobre outros 4 sub-clients mas não este. | ❌ ausente | `LotePagamentoService.test.ts:73-75`; ausência em `ConexosSubClients.test.ts` (grep = 0) |
| Versioning strategy | Nenhum. Endpoints são strings livres (`'fin064/list'`, `'fin015/list'`, `'fin010/list'`) sem prefixo de versão nem header `X-Api-Version`. Herdado do padrão Conexos, mas o `/feature-new` não adicionou hook. | ⚠️ parcial | `ConexosSispagClient.ts:123,170,199,230` |
| Backward-compat shims | O fallback silencioso do `listTitulosAPagar` (linha 121-135) é um shim implícito: assume-se que o ERP pode rejeitar `titDtaVencimento#GE/#LE` (400) e cai para não-filtrado. **Não** é gated por status-code — engolem 500/timeout/network também. | ❌ ausente | `ConexosSispagClient.ts:121-135` |
| Observability of integration failures | `LogService.warn` só é chamado em `SispagPainelService.gather` (filial-nível). O catch-all do `listTitulosAPagar` **não loga** — nem via `BUSINESS_WARN` nem via `LogService`. Não há métrica por-dependência (`fin064`/`fin015`/`fin010`) de taxa de erro. | ❌ ausente | `SispagPainelService.ts:95-102` só cobre uma camada; `ConexosSispagClient.ts:128` é `catch {}` mudo |

## 4. Findings (achados)

### F-integrability-1: fallback silencioso em `listTitulosAPagar` mascara qualquer erro do `fin064/list`

- **Severidade**: P1
- **Tactic violada**: Observability of integration failures + Backward-compat shims
- **Localização**: `src/backend/domain/client/ConexosSispagClient.ts:120-135`
- **Evidência (objetiva)**:
  ```typescript
  let rows: Record<string, unknown>[];
  try {
      const res = await this.base.listGenericPaginated<Record<string, unknown>>(
          'fin064/list',
          this.listBody('fin064', filtered, 1000),
          { filCod },
      );
      rows = res.rows;
  } catch {                              // ← catch-all, sem tipagem/status
      const res = await this.base.listGenericPaginated<Record<string, unknown>>(
          'fin064/list',
          this.listBody('fin064'),        // ← perde vldPago#EQ:0 E a janela
          { filCod },
      );
      rows = res.rows;
  }
  ```
  O comentário do método promete "Se o Conexos recusar o filtro (400), cai para busca sem filtro" (`:107`), mas o `catch{}` engole **qualquer** erro: 500, timeout, 401 (session expirada), rede caída. Adicionalmente, no fallback o filtro `vldPago#EQ:0` é perdido junto com a janela — passa a scanear a carteira inteira do fin064 (probes: **2.100 (fil1) / 18.234 (fil2)** títulos por filial em Columbia).
- **Impacto técnico**: (a) Upgrades do Conexos que renomeiem `titDtaVencimento#GE` (ex.: `venc#GE` na v2) ficam silenciosos — o painel continua respondendo mas com scan completo, 10-100× mais linhas. (b) Um outage de rede parcial que só derrube o filtro sofisticado é indistinguível de nenhum outage. (c) `SispagPainelService.gather` já tem `Promise.allSettled` — o `catch{}` interno impede o warn de filial de disparar. (d) O `RetryExecutor` compartilhado (2 tentativas + jitter) já roda por baixo, então o `catch{}` externo só dispara depois que **todas** as retries falharam — o fallback amplifica em outage sustentado.
- **Impacto de negócio**: Painel diário de pagamentos passa a mostrar título vencido de 2 anos atrás durante um upgrade do ERP sem que ninguém perceba; analista pode incluir em lote um título fora da janela válida — a re-leitura autoritativa no `LotePagamentoService.incluirTitulo` (`getTituloAPagar`) cobre a alçada, mas o RUÍDO no painel gera perda de confiança + retrabalho.
- **Métrica de baseline**: 1/4 leituras do cliente SISPAG (`listTitulosAPagar`) tem catch-all mudo. 0 log emitido quando cai no fallback (grep confirma). Erros mascarados: 100% dos tipos (400 + 500 + timeout + network + auth).

### F-integrability-2: `SispagPainelService` injeta `ConexosBaseClient` — service dependendo do "base" HTTP shim

- **Severidade**: P2
- **Tactic violada**: Restrict Communication Paths
- **Localização**: `src/backend/domain/service/sispag/SispagPainelService.ts:31,37`
- **Evidência (objetiva)**:
  ```typescript
  public constructor(
      @inject(ConexosSispagClient) private readonly sispag: ConexosSispagClient,
      @inject(ConexosBaseClient) private readonly base: ConexosBaseClient,  // ← service → base
      ...
  ) {}
  ...
  const filiais = await this.base.getFiliais();
  ```
  `SispagPainelService` é **o único service do repo** que injeta `ConexosBaseClient` diretamente (grep confirma: nenhum service Permutas faz isso). `ConexosBaseClient` expõe HTTP genérico (`getGeneric`/`postGeneric`/`postGenericOnce`/`deleteGeneric`/`listGenericPaginated`) — abrir esse portão para services derrota a Encapsulate.
- **Impacto técnico**: Nada impede um refactor futuro de `SispagPainelService` chamar `this.base.postGeneric(...)` direto — a superfície de escrita da Fatia 3 poderia acidentalmente entrar por aqui, contornando o gating de `CONEXOS_WRITE_ENABLED`. Também acopla o service à "identidade" do base client (mudar auth para `ConexosSessionManager` requer tocar o service).
- **Impacto de negócio**: Débito de encapsulação que barateia P0s futuros (ex.: uma escrita SISPAG acidental em produção). Custo de correção agora ≈ 4 linhas.
- **Métrica de baseline**: 1 service com dependência ilegítima em `ConexosBaseClient`; 4 sub-clients Conexos + `getFiliais` (também exposto por `ConexosCadastroClient` que já tem o `filialRepository`) — o service tem alternativa disponível.

### F-integrability-3: `fin010/list borVldTipo=2` duplicado em `ConexosSispagClient` e `ConexosBaixaClient` com DTOs distintos

- **Severidade**: P2
- **Tactic violada**: Abstract Common Services
- **Localização**: `src/backend/domain/client/ConexosSispagClient.ts:227-251` + `src/backend/domain/client/ConexosBaixaClient.ts:281-348`
- **Evidência (objetiva)**:
  ```typescript
  // ConexosSispagClient.listBorderosAPagar (linha 228)
  this.base.listGenericPaginated('fin010/list',
      this.listBody('fin010', { 'borVldTipo#EQ': 2 }, 100), { filCod })

  // ConexosBaixaClient.listBorderos (linha 286+)
  this.base.listGenericPaginated('fin010/list', {
      fieldList: ['borCod', 'filCod', 'borDtaMvto', 'borVldFinalizado', ...],
      filterList: { 'borVldTipo#EQ': 2, ... },
      pageNumber: 1, pageSize, orderList: {...}
  }, { filCod })
  ```
  A mesma tupla `(fin010/list, borVldTipo=2)` é lida por dois sub-clients com nomes semanticamente diferentes ("borderô a-pagar" vs "borderô de permuta"), row-shapes distintas (`vldHasRemessaPgto`/`vldHasBaixa` em um; `borCodEstornado`/`vlrTotalLiquido` no outro), e políticas distintas de erro (`try{}catch{}` em `ConexosBaixaClient` → `ConexosError`; propagação natural em `ConexosSispagClient`).
- **Impacto técnico**: Se o Conexos mudar a semântica de `borVldTipo=2` ou adicionar `borVldTipo=3` para SISPAG-only, dois pontos precisarão de ajuste. Cache de borderô de Permutas (`permuta_bordero`, ADR-0014) e a listagem SISPAG divergirão silenciosamente.
- **Impacto de negócio**: Débito baixo enquanto a lógica é read-only, mas na Fatia 3 (baixa via borderô) as duas leituras se tornarão fontes concorrentes da verdade da "situação do borderô".
- **Métrica de baseline**: 2 call sites para o mesmo endpoint+filtro; 0 abstração compartilhada; 0 teste que exercite as duas leituras contra a mesma fixture bruta.

### F-integrability-4: `ConexosSispagClient` sem teste de fixture-based response parsing

- **Severidade**: P2
- **Tactic violada**: Contract testing
- **Localização**: `src/backend/domain/client/ConexosSispagClient.ts` (arquivo inteiro) + ausência em `src/backend/domain/client/ConexosSubClients.test.ts`
- **Evidência (objetiva)**:
  ```
  $ grep -n "ConexosSispag" src/backend/domain/client/ConexosSubClients.test.ts
  # (vazio — 0 hits)

  $ ls src/backend/domain/client/*Sispag*.test.ts
  # (vazio — arquivo não existe)
  ```
  Os 3 schemas Zod (`tituloRowSchema:39-53`, `loteRowSchema:55-70`, `borderoRowSchema:72-82`) com coerções tolerantes (`.catch(undefined)`, `.catch(false)`, `.catch('1')`) nunca foram exercitados contra um payload real. `LotePagamentoService.test.ts:73-75` mocka `getTituloAPagar` no nível TS — pula o parsing.
- **Impacto técnico**: Se o Conexos renomear `vldPago` → `titVldPago` ou mudar o encoding numérico de `titDtaVencimento` (epoch-ms → ISO), o `.catch(false)`/`.catch(undefined)` silenciosamente vai devolver `pago: false` / `vencimento: undefined` para **todas** as linhas — o painel apaga sinal de "já pago" sem alarme. Isso é a mesma classe de bug que o Regis anterior (2026-06-26-1708) flagou como **P2 Fault Tolerance** em Permutas; SISPAG nasce com o mesmo hoop.
- **Impacto de negócio**: Regressão silenciosa de contrato ERP em upgrade v2 do Conexos. Custo de detecção reativa (analista reporta): dias. Custo de fixture: horas.
- **Métrica de baseline**: Cobertura de client tests para SISPAG = 0/5 métodos. Comparação: `ConexosSubClients.test.ts` = 1.662 LOC cobrindo os 4 outros sub-clients.

### F-integrability-5: seam para a Fatia 3 (write SISPAG) não materializado — sem interface Nexxera/transporte, gate único compartilhado com Permutas

- **Severidade**: P2
- **Tactic violada**: Configure Behavior + Discover Service + Abstract Common Services
- **Localização**: `src/backend/domain/libs/environment/EnvironmentProvider.ts:69-70,96-97` + ausência de `src/backend/domain/client/NexxeraClient.ts` (não existe) + ausência de `ontology/integrations/nexxera.md`
- **Evidência (objetiva)**:
  ```typescript
  // Único par de guard-rails — usado por Permutas HOJE, será usado por SISPAG DEPOIS
  conexosWriteEnabled: this.readEnv('CONEXOS_WRITE_ENABLED') === 'true',
  conexosDryRun:       this.readEnv('CONEXOS_DRY_RUN') !== 'false',
  ```
  ADR-0015 promete que a escrita SISPAG "reusa o gating de Permutas (`CONEXOS_WRITE_ENABLED` + `CONEXOS_DRY_RUN`)". Isso **liga simultaneamente** dois writes irreversíveis distintos (baixa `fin010` de permuta + `fin015` gerar remessa SISPAG + `fin052` retorno + baixa `fin010` a-pagar). Não existe `SISPAG_WRITE_ENABLED` nem `NEXXERA_ENABLED`. Não há esqueleto de `NexxeraTransportClient` (pasta de rede / VAN pickup); a arquitetura-alvo está só em `sispag-native-vs-nexxera.md:60-77` e `ADR-0015:102-113`.
- **Impacto técnico**: (a) Quando Fatia 3 for para HML, virar o flag on habilita **também** um caminho Permutas que talvez esteja pausado — cenário misto de release. (b) Substituir Nexxera por outro provedor VAN (Cielo, Fitbank) exigirá desenhar o client + config do zero, sem seam pré-existente — Bass mediria como "trocar integração = novo módulo, alto custo".
- **Impacto de negócio**: Impossibilidade de release gradual (canary) das duas frentes escritoras. Custo tecnicamente médio de correção antes da Fatia 3, alto depois.
- **Métrica de baseline**: 1 flag para 2 integrações escritoras futuras (0 desacoplamento). 0 arquivo de interface Nexxera. 0 esqueleto de config `NEXXERA_PICKUP_DIR`/`NEXXERA_LAYOUT`.

### F-integrability-6: nenhum version pin nos endpoints Conexos SISPAG (`fin064/list`, `fin015/list`, `fin010/list`)

- **Severidade**: P3
- **Tactic violada**: Adhere to Standards + Versioning strategy
- **Localização**: `src/backend/domain/client/ConexosSispagClient.ts:123,170,199,230`
- **Evidência (objetiva)**:
  ```
  $ grep -nE "/v[0-9]|api-version|X-Api-Version" src/backend/domain/client/ConexosSispagClient.ts
  # (vazio — 0 hits)
  ```
  Herdado: nenhum outro sub-client Conexos versiona também (`grep` idem em Financeiro/Baixa/Cadastro/Titulos = 0). É débito comum, mas a *nova* superfície não recebeu hook nem hook-comment.
- **Impacto técnico**: Se o Conexos publicar `/api/v2/fin064/list` com breaking changes coexistindo com `/fin064/list` legado, o path livre não permite negociar; upgrade vira "big bang".
- **Impacto de negócio**: Débito lento; só materializa quando o vendor publicar v2. Sem urgência.
- **Métrica de baseline**: 0/4 endpoints SISPAG com pin de versão.

### F-integrability-7: front redeclara 4 DTOs do painel SISPAG — contract manual entre backend e Next.js

- **Severidade**: P3
- **Tactic violada**: Tailor Interface (drift silencioso)
- **Localização**: `src/frontend/lib/sispag.ts:12-76` vs `src/backend/domain/interface/sispag/SispagInterface.ts:11-91`
- **Evidência (objetiva)**:
  ```typescript
  // backend
  export interface TituloAPagar { docCod: string; ... vencimento?: number; ...}
  // frontend (mirror)
  export interface TituloAPagar { docCod: string; ... vencimento?: number; ...}
  ```
  4 interfaces (`TituloAPagar`, `LoteSispag`, `BorderoAPagar`, `SispagKpis`) + wrapper `SispagPainel` são re-declaradas 1:1 em `lib/sispag.ts`. Mesmo problema em `LotePagamento`/`ItemLote` (Fatia 2).
- **Impacto técnico**: Renomear `titulosCount`→`itensCount` no backend não quebra typecheck do front — só quebra em runtime quando a UI mostra "undefined". Não há contract test nem geração de tipos.
- **Impacto de negócio**: Bugs de renomeação vão só aparecer em produção. Custo baixo por mudança, mas frequência alta se o domínio evoluir.
- **Métrica de baseline**: 6 DTOs duplicados manualmente (4 painel + 2 lote); 0 contract test; 0 geração automática.

### F-integrability-8: fallbacks Zod `.catch(undefined)` / `.catch(false)` silenciam violações de schema em produção

- **Severidade**: P3
- **Tactic violada**: Observability of integration failures
- **Localização**: `src/backend/domain/client/ConexosSispagClient.ts:27,32,37,42`
- **Evidência (objetiva)**:
  ```typescript
  const numOpt = z.coerce.number().optional().catch(undefined);
  const strOpt = z.union([...]).optional().catch(undefined);
  const boolFromFlag = z.union([...]).optional().catch(false);
  ...
  titCod: z.union([...]).optional().catch('1'),   // ← default silencioso p/ '1'
  ```
  Combinado com `.safeParse` (linhas 137, 175, 204, 235) e `if (!parsed.success) return []` — parses que falham desaparecem em silêncio (sem log). Uma migração de campo do ERP degrada linhas indivi­dualmente.
- **Impacto técnico**: Se `titCod` sumir do fin064/list, todos os títulos ficam com `titCod='1'` — colisão na chave `(filCod, docCod, titCod)` do lote, cascateando em `TituloEmOutroLoteError` incorreto.
- **Impacto de negócio**: Erro clínico do lote sem sinal claro do porquê.
- **Métrica de baseline**: 5 `.catch(...)` mudos + 4 `.safeParse` com `return []` — 0 log.

## 5. Cards Kanban

### [integrability-1] Restringir fallback de `listTitulosAPagar` a 4xx e logar transição

- **Problema**
  > `ConexosSispagClient.listTitulosAPagar` (`:121-135`) tem `try{ ... }catch{}` mudo — engole 500/timeout/401/network e cai para busca sem filtros na carteira inteira (`fin064` = 2.100 fil1 / 18.234 fil2 rows), sem log. O upgrade v2 do Conexos + qualquer outage de rede tornam-se invisíveis; painel exibe títulos fora da janela sem alarme.

- **Melhoria Proposta**
  > Estreitar o catch para status HTTP 400 do Conexos (a única razão prevista): tratar erro tipado (o `ConexosBaseClient` já produz `ConexosError`), inspecionar `status` ou `code`, e só cair para não-filtrado se for 400/422. Todo fallback dispara `LogService.warn` `{ type: BUSINESS_WARN, endpoint: 'fin064/list', filCod, reason: 'filter-rejected' }`. Injetar `LogService` no client (mesmo padrão do `ConexosBaixaClient`).

- **Resultado Esperado**
  > Fallback só na causa documentada; qualquer outra falha propaga → `SispagPainelService.gather` já loga `BUSINESS_WARN` de filial. Métrica: 0 fallbacks silenciosos; cada fallback ≥ 1 log per-request.

- **Tactic alvo**: Backward-compat shims + Observability of integration failures
- **Severidade**: P1
- **Esforço estimado**: S
- **Findings relacionados**: F-integrability-1, F-integrability-8
- **Métricas de sucesso**:
  - Fallback-triggered warn logs por request: 0 → 1 (quando dispara)
  - Tipos de erro engolidos silenciosamente: {400, 401, 500, timeout, network} → {} (nenhum)
- **Risco de não fazer**: Regressão de upgrade v2 do Conexos passa despercebida; painel mostra ruído em outage; incidente detectado só quando analista relata.
- **Dependências**: —

### [integrability-2] Extrair `getFiliais` do `SispagPainelService` para um sub-client de cadastro

- **Problema**
  > `SispagPainelService` (linha 31) é o único service do repo que injeta `ConexosBaseClient` — só para chamar `getFiliais()`. Isso expõe `postGeneric`/`getGeneric`/`deleteGeneric` para um caminho de leitura, quebrando a política "service → sub-client domain-specific" que Permutas segue à risca.

- **Melhoria Proposta**
  > Substituir `@inject(ConexosBaseClient)` por `@inject(ConexosCadastroClient)` (já existe) e delegar `getFiliais` lá — ou, se o `ConexosCadastroClient` ainda não expõe, adicionar `public getFiliais = () => this.base.getFiliais()`. Nenhum service deve depender do base client.

- **Resultado Esperado**
  > 0 services do repo dependendo diretamente de `ConexosBaseClient`. Superfície de escrita continua só acessível via `postGeneric` dentro de um sub-client dedicado (Fatia 3).

- **Tactic alvo**: Restrict Communication Paths
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-integrability-2
- **Métricas de sucesso**:
  - Services do repo dependendo de `ConexosBaseClient`: 1 → 0
- **Risco de não fazer**: Convite para escrita acidental via `postGeneric` no service; corrói o modelo mental "todo write é gated dentro do client".
- **Dependências**: —

### [integrability-3] Consolidar leitura de `fin010/list borVldTipo=2` num único método compartilhado

- **Problema**
  > Duas leituras da mesma tupla `(fin010/list, borVldTipo=2)` vivem em `ConexosSispagClient.listBorderosAPagar` e `ConexosBaixaClient.listBorderos`, com row-shapes distintas e políticas de erro distintas. O Conexos é o mesmo tenant — divergirão em silêncio.

- **Melhoria Proposta**
  > Mover a query base para `ConexosBaseClient` (`listBorderosBrutos({ filCod, extraFilters?, pageSize?, orderList? })`) que devolve rows crus; cada sub-client aplica seu Zod schema em cima. Alternativamente, `ConexosBaixaClient` passa a expor `listBorderos({ shape: 'sispag' })` para mostrar semanticamente qual DTO é retornado. Registrar o wire dentro de `conexosPermutasConstants.ts` como constante compartilhada.

- **Resultado Esperado**
  > 1 ponto de definição do wire; drift do endpoint (ex.: `borVldTipo=3`) requer alterar 1 arquivo.

- **Tactic alvo**: Abstract Common Services
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-integrability-3
- **Métricas de sucesso**:
  - Call sites do wire `fin010/list borVldTipo#EQ:2`: 2 → 1
  - Constantes compartilhadas para o filtro `borVldTipo=2`: 0 → 1
- **Risco de não fazer**: Fatia 3 (baixa a-pagar via borderô) precisa alinhar filtro; refactor tardio arrasta duas telas simultaneamente.
- **Dependências**: —

### [integrability-4] Adicionar client tests fixture-based para `ConexosSispagClient`

- **Problema**
  > 0 testes cobrem os 3 Zod schemas (`tituloRowSchema`/`loteRowSchema`/`borderoRowSchema`) do sub-client SISPAG. `.catch(undefined)`/`.catch(false)`/`.catch('1')` transformam mudanças de contrato do ERP em silêncio (bug pattern idêntico ao P2 do Regis 2026-06-26-1708 para Permutas). Nenhum arquivo `ConexosSispag*.test.ts`; `ConexosSubClients.test.ts` (1.662 LOC) não menciona SISPAG.

- **Melhoria Proposta**
  > Criar `src/backend/domain/client/ConexosSispagClient.test.ts` (espelho do `ConexosSubClients.test.ts`): fixtures reais capturadas do probe (`jobs/probe-sispag.ts` já produziu payloads em `/tmp/sispag-probe/`), casos de linhas parcialmente populadas (vldPago missing, titCod ausente, vencimento como string), e o caminho de fallback do `listTitulosAPagar` (F-integrability-1).

- **Resultado Esperado**
  > Renomeação/remoção de campo no `fin064`/`fin015`/`fin010` quebra o CI em vez de silenciar em produção.

- **Tactic alvo**: Contract testing
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-integrability-4, F-integrability-8
- **Métricas de sucesso**:
  - Row-shapes cobertas por fixture: 0/3 → 3/3
  - Cenários testados por método: 0 → ≥3 (happy + row parcial + fallback)
- **Risco de não fazer**: Regressão silenciosa de schema (bug pattern conhecido do repo) migra para SISPAG.
- **Dependências**: —

### [integrability-5] Materializar seam da Fatia 3 (`SISPAG_WRITE_ENABLED` + esqueleto `NexxeraTransportClient`)

- **Problema**
  > ADR-0015 promete que a escrita SISPAG (fin015 remessa + fin052 retorno + fin010 baixa a-pagar) e o transporte VAN Nexxera reusarão `CONEXOS_WRITE_ENABLED`. Isso liga simultaneamente 2 caminhos irreversíveis (Permutas fin010 + SISPAG fin010/fin015). Nenhum client Nexxera esqueleto existe; a arquitetura-alvo está só em prosa (`sispag-native-vs-nexxera.md`, ADR-0015).

- **Melhoria Proposta**
  > (a) Adicionar `sispagWriteEnabled` / `nexxeraEnabled` em `EnvironmentProvider`, default `false`, sem ainda consumir. (b) Criar `ontology/integrations/nexxera.md` (skeleton — direction, endpoints/pastas, discovery). (c) Criar `src/backend/domain/client/NexxeraTransportClient.ts` como `@singleton() @injectable()` com métodos `uploadRemessa(pathLocal)`, `awaitRetorno(pattern)` **stubs** que lançam `NotImplementedError('Fatia 3')`. (d) Documentar no `_inbox/sispag-briefing.md` que a Fatia 3 só liga os stubs. Zero comportamento novo, seam explícito.

- **Resultado Esperado**
  > Release gradual de write das 2 frentes é possível; substituir provedor VAN em Fatia 3 é 1 client novo, não redesenho.

- **Tactic alvo**: Configure Behavior + Discover Service + Abstract Common Services
- **Severidade**: P2
- **Esforço estimado**: M
- **Findings relacionados**: F-integrability-5
- **Métricas de sucesso**:
  - Flags de guard-rail por integração escritora: 1 (compartilhada) → 2 (SISPAG + Permutas separadas)
  - Ontology integrations declaradas: `conexos.md` → `conexos.md` + `nexxera.md`
  - Client skeletons para Fatia 3: 0 → 1 (`NexxeraTransportClient`)
- **Risco de não fazer**: Fatia 3 nasce grande e arriscada; canary release impossível; troca de VAN vira retrabalho.
- **Dependências**: Contratação da Nexxera + confirmação do caminho da pasta (pendente com Flávia/Ricardo)

### [integrability-6] Compartilhar DTOs backend↔frontend via pacote compartilhado ou snapshot-test

- **Problema**
  > 6 DTOs (`TituloAPagar`/`LoteSispag`/`BorderoAPagar`/`SispagKpis`/`LotePagamento`/`ItemLote`) são re-declarados 1:1 em `src/frontend/lib/sispag.ts` mirror de `src/backend/domain/interface/sispag/SispagInterface.ts`. Renomeação backend não quebra typecheck frontend.

- **Melhoria Proposta**
  > Opção A (baixo esforço): snapshot-test que serializa as interfaces (via `ts-morph` ou similar) e falha se divergir. Opção B (médio esforço): mover DTOs para `src/shared/sispag/dto.ts` ambos importem. Alinhar com política adotada em Permutas — hoje é o mesmo débito por lá.

- **Resultado Esperado**
  > Renomear campo backend quebra CI (frontend não compila) em vez de bug de runtime.

- **Tactic alvo**: Tailor Interface (contract sync)
- **Severidade**: P3
- **Esforço estimado**: S (opção A) / M (opção B)
- **Findings relacionados**: F-integrability-7
- **Métricas de sucesso**:
  - DTOs duplicados manualmente entre BE/FE: 6 → 0
  - Contract-tests que impedem drift: 0 → 1
- **Risco de não fazer**: Bug de renomeação chega em produção; débito compartilhado com Permutas — ganho é sistêmico.
- **Dependências**: Alinhar política com Permutas (evolução independente ou pacote comum)

### [integrability-7] Documentar politica de versão do Conexos (pin ou hook de header)

- **Problema**
  > `ConexosSispagClient` usa endpoints livres (`fin064/list`, etc.) sem pin de versão nem hook para header `X-Api-Version`. Débito herdado dos 4 outros sub-clients, mas o *novo* client não introduziu convention.

- **Melhoria Proposta**
  > Documentar em `ontology/integrations/conexos.md` a decisão explícita (hoje = pin implícito no fornecedor). Adicionar um `readonly API_VERSION = 'legacy-2024-04'` (comentário) no `ConexosBaseClient` para fixar a expectativa. Quando Conexos publicar v2, `ConexosBaseClient.callList` ganha um path prefix opcional; sub-clients migram um a um.

- **Resultado Esperado**
  > Upgrade v2 tem hook definido; decisão documentada dispensa arqueologia futura.

- **Tactic alvo**: Versioning strategy + Adhere to Standards
- **Severidade**: P3
- **Esforço estimado**: S
- **Findings relacionados**: F-integrability-6
- **Métricas de sucesso**:
  - Convenção de versão documentada: não → sim
  - Hook p/ header/api-version no `ConexosBaseClient`: 0 → 1 (opcional, no-op enquanto o fornecedor não expuser)
- **Risco de não fazer**: Débito arqueológico; upgrade v2 vira big-bang.
- **Dependências**: Confirmar com o fornecedor se há roadmap de versionamento (Yuri)

## 6. Notas do agente

- **Escopo definido**: analisei apenas o delta do branch `feat/sispag-painel-montagem` (`ConexosSispagClient`, `SispagPainelService`, `LotePagamentoService`, `LotePagamentoRepository`, `routes/sispag.ts`, `lib/sispag.ts`) + interações com `ConexosBaseClient` e o par de flags `CONEXOS_WRITE_ENABLED/DRY_RUN`. Não reavaliei sub-clients existentes.
- **Nenhum P0** encontrado: a superfície é read-only, capped por `MAX_PAGES=50`, e mesmo o worst case (F-integrability-1) é degradação — não risco de escrita indevida. O gate de write (Fatia 3) ainda **não existe**; o "risco P0" clássico de trocar bank gateway não se aplica ainda — vira P2/P3 preventivo.
- **Cross-QA — sinais para o consolidador**:
  - F-integrability-1 (fallback silencioso) tem sobreposição com **Fault Tolerance** (Detect Faults) e **Modifiability** (Encapsulate) — mesmo código.
  - F-integrability-2 (`SispagPainelService` → `ConexosBaseClient`) sobrepõe com **Modifiability** e **Security** (open door p/ postGeneric acidental).
  - F-integrability-4 (contract test ausente) sobrepõe com **Testability** e **Fault Tolerance** (mesma classe do bug já flagado no Regis 2026-06-26-1708 para Permutas).
  - F-integrability-5 (write seam / flag compartilhado) sobrepõe com **Deployability** (canary/rollback) e **Security** (blast radius do flag).
- **Métrica não medida**: taxa de erro real do `fin064/list` com `titDtaVencimento#GE/#LE` (mascarada pelo catch-all). Só medível depois de implementar o card `integrability-1` (log de fallback).
