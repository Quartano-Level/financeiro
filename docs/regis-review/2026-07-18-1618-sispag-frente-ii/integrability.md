---
qa: Integrability
qa_slug: integrability
run_id: 2026-07-18-1618-sispag-frente-ii
agent: qa-integrability
generated_at: 2026-07-18T16:18Z
scope: backend
score: 8
findings_count: 6
cards_count: 6
---

# Integrability — Regis-Review (SISPAG / Frente II)

## 1. Cenário Geral (Bass General Scenario aplicado ao SISPAG)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Squad SISPAG (Fatia 3) | precisa ativar o pipeline completo: geração de `.REM` (fin015 write) + polling `.RET` (fin052 carregar+processar) + baixa (fin010) | `ConexosSispagWriteClient`, `ConexosSispagRetornoClient`, `RetornoOrquestracaoService`, `SispagPainelService` | Runtime prod (READ-ONLY hoje, I1) + HML (harnesses gated) | Ligar as ferramentas dormentes atrás de um orquestrador com ledger idempotente, gating `conexosWriteEnabled`/`conexosDryRun`, e (novo) reader Nexxera→pasta — sem modificar os reads em produção | Custo marginal: nova integração Nexxera adicionada em ≤ 1 client novo + 1 service novo (< 500 LOC). Zero mudança fora da fronteira. Rollback = flag off. |
| Conexos (ERP externo) | mudança de schema `fin064` (rename `dpeNomPessoa` → `dpePesNome`, dropa filtro `titDtaVencimento#GE`) | `ConexosSispagClient.tituloRowSchema` + `mapTitulo` | prod (leitura ao vivo, sem cache) | Degrada graciosamente: `passthrough()` + `.catch(default)` por campo garante que campos renomeados viram `undefined` (título permanece na carteira, sem crash); filtro recusado (400) cai no fallback sem-filtro logado como WARN | 0 % de crashs; `[SISPAG] fin064/list recusou o filtro` visível em log; latência do painel × 2 na filial afetada; tempo até detectar (via log) ≤ 1 janela de cron. |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Clients SISPAG com método HTTP leaked (`get/post/request/call` genérico) | 0 / 3 | 0 | ✅ | `grep -nE "public " src/backend/domain/client/ConexosSispag*.ts` — todos domain-named (`listTitulosAPagar`, `criarLote`, `gerarRemessa`, `carregarArquivoRetorno`, ...) |
| Uso de `axios`/`fetch` em service/repo/route SISPAG | 0 | 0 | ✅ | `grep -rn "axios\|fetch" src/backend/domain/service/sispag src/backend/domain/repository/sispag src/backend/routes/sispag.ts` → vazio |
| Uso de `process.env` em services SISPAG | 0 | 0 (Rule #8) | ✅ | `grep -n "process.env" src/backend/domain/service/sispag/*.ts` → só 1 comentário em `RetornoOrquestracaoService.ts:74` |
| Non-null assertions (`!`) sobre dados externos em SISPAG (prod) | 0 | 0 | ✅ | `grep -rn "\w!\." src/backend/domain/{client,service,repository}/sispag*` (excl. tests) → 0 |
| Zod schemas no boundary — read client (`ConexosSispagClient`) | 3 schemas (`tituloRowSchema`, `loteRowSchema`, `borderoRowSchema`) c/ `passthrough`+`catch` | 100 % das leituras | ✅ | `ConexosSispagClient.ts:42-95` |
| Zod schemas no boundary — write client (`ConexosSispagWriteClient`) | 2 schemas (`LOTE_CRIADO_SCHEMA`, `SUCESSO_SCHEMA`) | 100 % dos writes | ✅ | `ConexosSispagWriteClient.ts:20-35` |
| Zod schemas no boundary — retorno client (`ConexosSispagRetornoClient`) | 0 schemas — usa `typeof`/`Number()` sobre `Record<string, unknown>` | ≥ 1 schema por família de row (paridade com read) | ⚠️ | `ConexosSispagRetornoClient.ts:120-135, 164-186, 216-224, 248-257` (5 map fns, todas sem Zod) |
| Callers do write client em request path (prod) | 0 (só `jobs/validate-fin015-tools.ts` HML) | 0 até fluxo desenhado | ✅ | `grep -rn "ConexosSispagWriteClient" src/backend/{routes,domain/service}` → vazio |
| Callers de `carregarArquivoRetorno` em request path (prod) | 0 (`RetornoOrquestracaoService` dormente, sem rota/cron) | 0 até reader Nexxera existir | ✅ | `grep -rn "RetornoOrquestracaoService" src/backend/{routes,jobs}` → vazio |
| Callers de `list*` retorno em request path | 1 (`SispagPainelService.listRetornos` → `GET /sispag/retornos`) | wired | ✅ | `src/backend/domain/service/sispag/SispagPainelService.ts:139-190` + `routes/sispag.ts:40-48` |
| Duplicação de `describeConexosValidation` entre write ↔ retorno | ~27 linhas idênticas | 0 (extrair helper) | ⚠️ | `ConexosSispagWriteClient.ts:68-94` ≈ `ConexosSispagRetornoClient.ts:53-78`, self-acknowledged em `:51` ("duplicado por ora") |
| Contract tests: fixture-based response parsing por client | 3/3 clients (183+224+169 LOC) — todos sintéticos, nenhum recorded prod payload | ≥ 1 fixture recorded por família de endpoint | ⚠️ | `ConexosSispag{,Write,Retorno}Client.test.ts` — payloads inline nos testes |
| Versionamento explícito da API Conexos | 0 headers/paths versionados (endpoints são `fin064/list`, `fin015`, `ger015/list`) | provider não versiona a API — N/A com contrato pinado | ❌ (não-medível) | Provider closed-source; OpenAPI local em `docs/conexos-api/090-fin0.json` é único "pin" |
| Serviços SISPAG com ≥ 3 collaborators (orquestradores) | 3 (`SispagPainelService` = 9, `IngestaoPagamentosService` = 7, `LotePagamentoService` = 4) | ≤ 5 (Bass rule of thumb) | ⚠️ | `grep -n "@inject" src/backend/domain/service/sispag/*.ts` |
| Discover Service (SSM/config path) | `EnvironmentProvider.GetLambdaEnvironmentVars` lê SSM; `local` usa `.env`; SISPAG_ENABLED gate | 100 % de secrets via SSM/tenant | ✅ | `EnvironmentProvider.ts:88-118` |
| Frontend SISPAG: wrapper único vs. call sites | 1 wrapper (`src/frontend/lib/sispag.ts`, 339 LOC) + 1 `apiFetch` (`lib/http.ts`, 35 LOC) para 9 endpoints | 1 wrapper único | ✅ | `grep -rn "apiFetch\|fetch(" src/frontend/app/sispag src/frontend/lib/sispag.ts` — 100 % via `apiFetch` |
| Frontend: validação runtime do payload (Zod) | 0 schemas — só interfaces TS espelhando `SispagInterface` | ≥ schema no boundary | ❌ | `grep -n "z\." src/frontend/lib/sispag.ts` → 0 |
| Nexxera integration surface (reader pasta/SharePoint) | 0 arquivos, 0 client, 0 config — só `TODO(Ricardo/comercial)` | 1 client + 1 SSM path + fixture | ⚠️ | `RetornoOrquestracaoService.ts:79-84, 195-197`; `Fin052Retorno.ts:4-9` (só menção nos comentários) |

> ⚠️ **Não medível localmente**: erros de integração per-dependency em prod (Nexxera pasta indisponível, Conexos 5xx). Requer CloudWatch/Render logs. Hoje o `LogService.warn` grava `BUSINESS_WARN` com `data: { reason }`, mas não há métrica agregada por-dependência (rate/5min). Recomendação: instrumentar contador `sispag.integration.errors{client=conexos|nexxera,endpoint=fin064,status=5xx}` no `ConexosBaseClient.callList`.

## 3. Tactics — Cobertura no SISPAG (Frente II)

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Encapsulate** | Cada família Conexos (read / write fin015 / retorno fin052) mora num client dedicado com métodos de negócio (`listTitulosAPagar`, `criarLote`, `carregarArquivoRetorno`). `ConexosBaseClient` concentra HTTP/session/retry/pagination — sub-clients compõem por `@inject`, nunca herdam. | ✅ presente | `ConexosSispagClient.ts:99-100`, `ConexosSispagWriteClient.ts:57-60`, `ConexosSispagRetornoClient.ts:31-34`, `ConexosBaseClient.ts:135-149` |
| **Use an Intermediary** | `ConexosBaseClient` intermedia toda a session/cookie/`ensureSid`/`postGenericOnce`/`postMultipartOnce` — sub-clients não conhecem axios/adapter legacy. `LEGACY_CONEXOS_TOKEN` isola o adapter transitório. | ✅ presente | `ConexosBaseClient.ts:5, 37-86, 141-192`; `legacyConexosAdapter.ts` |
| **Restrict Communication Paths** | Só clients falam HTTP externo. Services SISPAG dependem de clients + repos + libs; nenhum importa `axios`/`fetch`. Route delega tudo por `container.resolve(<Service>)`. | ✅ presente | `grep axios,fetch` em service/repo/route SISPAG → 0 |
| **Adhere to Standards** | CNAB 240 é **nativo do Conexos** (não parseamos/geramos aqui — o `.REM` volta em `gabLngDados` como blob). Zod é o único vocabulário de validação no boundary. Interfaces agrupadas em `domain/interface/sispag/` (3 arquivos). | ⚠️ parcial | `docs/conexos-api/090-fin0.json` (OpenAPI local pin); `src/backend/domain/interface/sispag/{SispagInterface,Fin015Write,Fin052Retorno}.ts` — retorno client não segue a mesma disciplina Zod dos irmãos |
| **Abstract Common Services** | `ConexosBaseClient.runWithRetry` compartilhado pelos 3 clients (write e retorno reusam para reads); `RetryExecutor` centralizado. `describeConexosValidation` **NÃO** foi abstraído — duplicado entre Write e Retorno (self-ack). | ⚠️ parcial | `ConexosBaseClient.ts:199`; `ConexosSispagWriteClient.ts:68-94` == `ConexosSispagRetornoClient.ts:53-78` |
| **Discover Service** | `EnvironmentProvider` resolve URL/creds do Conexos por SSM (`ssm_conexos_credentials`) em Lambda ou `.env` local. `CONEXOS_BASE_URL` chaveada; `SISPAG_ENABLED` como flag de rollout. Nexxera: **path da pasta ainda não descoberto** (TODO). | ⚠️ parcial | `EnvironmentProvider.ts:62-118`; `RetornoOrquestracaoService.ts:79-84` |
| **Tailor Interface** | `ConexosSispagClient.mapTitulo` deriva `modalidadesDisponiveis` a partir dos campos brutos do `fin064` (Opção B: só formas que o favorecido tem cadastrado — barras→BOLETO, chave→PIX, banco+conta→TED/CREDITO_CONTA). Não expõe raw ao service. | ✅ presente | `ConexosSispagClient.ts:127-161` |
| **Configure Behavior** | Gating por `conexosWriteEnabled`/`conexosDryRun` (default: escrita OFF, dry-run ON); `SISPAG_ENABLED` para bloquear rota em prod (`http/sispagGate.ts`); janela de vencimento parametrizada em `listTitulosAPagar`. | ✅ presente | `EnvironmentProvider.ts:81-82,110-111`; `RetornoOrquestracaoService.ts:75-77` |
| **Manage Resources** | `BoundedConcurrency` (fan-out limit=4) evita pressionar o pool de sessões Conexos (`LOGIN_ERROR_MAX_SESSIONS`); `runWithRetry` (1 retry, 500 ms, jitter 200 ms); `postGenericOnce`/`postMultipartOnce` **sem retry** para escrita não-idempotente. | ✅ presente | `SispagPainelService.ts:28,76`; `IngestaoPagamentosService.ts:20,81`; `ConexosBaseClient.ts:143-148`; `ConexosSispagWriteClient.ts:41-56` |
| **Orchestrate** | `SispagPainelService.montarPainel` orquestra 5 leituras (títulos persistidos + última ingestão + títulos-em-rascunho + `listLotes` fan-out) + `env`; `IngestaoPagamentosService.executar` orquestra 2 leituras Conexos por filial × N filiais com fan-out limitado. Advisory-locks por processo (`PAGAMENTO_INGEST_LOCK_KEY=726354819`, `RETORNO_POLLER_LOCK_KEY=528417963`) previnem concurrent runs. | ✅ presente | `SispagPainelService.ts:54-132`; `IngestaoPagamentosService.ts:52-61,81-91`; `RetornoOrquestracaoService.ts:11,82-84` |
| **Manage Resource Coupling** | Anti-drift: ingestão persiste só BÁSICO (`titulo_a_pagar`); DETAIL (barras/chave/banco/modalidade) hidratado ao vivo no import time via `getTituloAPagar` (`I2 elegibilidade autoritativa`). Isso desacopla o snapshot persistido da mudança-de-schema no `fin064`. | ✅ presente | `LotePagamentoService.ts:176-198`; `SispagPainelService.ts:198-214` (modalidadesDisponiveisDoLote) |
| **Contract testing (moderno)** | 3 client tests exercitam mapping/drift-fallback/`ConexosError`-conversion com fixtures **sintéticas inline**. Nenhum recorded HML/PRD payload congelado como golden fixture. | ⚠️ parcial | `ConexosSispag{,Write,Retorno}Client.test.ts` (576 LOC total) |
| **Versioning strategy (moderno)** | Conexos não versiona endpoints (URLs são bare `fin064/list`). Único mecanismo de pin: cópia local do OpenAPI em `docs/conexos-api/` — não é gate automático. Contra-medida no read client: `passthrough()` + `.catch(default)` por campo. | ❌ ausente (do lado provider) | `docs/conexos-api/090-fin0.json`; `ConexosSispagClient.ts:30-40, 42-95` (mitigação client-side) |
| **Backward-compatibility shims (moderno)** | Fallback quando Conexos recusa filtro (400) em `listTitulosAPagar`: WARN + leitura sem filtro (log-como-sinal, não silent degrade). Erros transitórios (5xx/timeout) **não** caem no fallback — propagam. | ✅ presente | `ConexosSispagClient.ts:108-215` (isFilterRejected + fallback narrado) |
| **Observability of integration failures (moderno)** | `LogService.warn({ type: LOG_TYPE.BUSINESS_WARN, data: { reason } })` em toda falha per-filial (fan-out tolerante). Sem métrica agregada por-dependência (rate/latência/erro-por-endpoint). | ⚠️ parcial | `IngestaoPagamentosService.ts:108-116`; `SispagPainelService.ts:85-97, 176-186` |

## 4. Findings (achados)

### F-integrability-1: Retorno client (fin052) sem Zod no boundary — asimétrico com irmãos SISPAG

- **Severidade**: P1
- **Tactic violada**: Adhere to Standards; Abstract Common Services
- **Localização**: `src/backend/domain/client/ConexosSispagRetornoClient.ts:120-135, 164-186, 216-224, 248-257`
- **Evidência (objetiva)**:
  ```typescript
  // ConexosSispagRetornoClient.ts:120
  private mapArquivo = (r: Record<string, unknown>): ArquivoRetorno => ({
      filCod: Number(r.filCod),
      bncCod: Number(r.bncCod),
      // ... 12 campos com typeof + Number()/String(), sem schema
  });
  // vs. ConexosSispagClient.ts:42 usa tituloRowSchema (z.object + passthrough + catch)
  ```
- **Impacto técnico**: Uma rename no `fin052` (ex. `garCodSeq` → `garSeqCod`) não é detectada no boundary — vira `Number(undefined)` = `NaN`, propagando corrupção silenciosa para o painel (`listRetornos`) e para o `RetornoOrquestracaoService` (arquivo com `garCodSeq=NaN`, `listDetalhe` filtra `#EQ NaN` → 0 linhas → "processed com 0 baixas" falso).
- **Impacto de negócio**: quando o retorno automático ligar (Fatia 3), risco de "arquivos processados sem baixa" que exigem reconciliação manual. Rebaixa a confiança no fim do pipeline.
- **Métrica de baseline**: 5 map functions / 0 schemas Zod (0 % adoção) vs. 100 % no read client irmão.

### F-integrability-2: Nexxera reader (pasta/SharePoint) ainda é TODO — bloqueio de ativação da Fatia 3 retorno

- **Severidade**: P1
- **Tactic violada**: Discover Service
- **Localização**: `src/backend/domain/service/sispag/RetornoOrquestracaoService.ts:79-84, 195-197`; `src/backend/domain/interface/sispag/Fin052Retorno.ts:4-9`
- **Evidência (objetiva)**:
  ```typescript
  // RetornoOrquestracaoService.ts:195
  private listarRetNaPasta = async (): Promise<ArquivoRetPendente[]> => {
      return [];  // no-op seguro por ora — o serviço é dormente até o reader existir.
  };
  ```
- **Impacto técnico**: Toda a doutrina de irreversible-write, `postMultipartOnce`, ledger idempotente e `advisory lock RETORNO_POLLER_LOCK_KEY` já está montada, mas o **input** (arquivos `.RET`) não chega. Nenhum service novo pode ser projetado sem antes descobrir o transporte (SharePoint path, credenciais, protocolo — HTTP? SMB? MS Graph?).
- **Impacto de negócio**: Retorno automático (Fatia 3, perna 2) não pode ir ao ar. Baixa continua manual pelo analista no fin052. ROI da automação diferido até o comercial descobrir o caminho (`TODO(Ricardo/comercial)`).
- **Métrica de baseline**: 0 arquivos / 0 clients / 0 SSM paths para Nexxera. 5 TODOs no service (`ledger`, `HAR processar`, `HAR detalhe`, `status BAIXADO`, `reader pasta`).

### F-integrability-3: `describeConexosValidation` duplicado entre Write e Retorno clients

- **Severidade**: P2
- **Tactic violada**: Abstract Common Services
- **Localização**: `src/backend/domain/client/ConexosSispagWriteClient.ts:68-94` ≈ `src/backend/domain/client/ConexosSispagRetornoClient.ts:53-78`
- **Evidência (objetiva)**:
  ```
  # diff idempotente entre os dois arquivos (27 linhas)
  # Já auto-reconhecido em ConexosSispagRetornoClient.ts:51:
  # "Igual ao `ConexosSispagWriteClient` (duplicado por ora)."
  ```
- **Impacto técnico**: Mudança no formato de erro do Conexos (novo tipo `VALIDATION_LIST`) exige patch em N locais; risco de drift entre clients (Write parseia `body.type`, Retorno não). Complica o próximo write client (fin010 baixa oficial no fluxo de retorno).
- **Impacto de negócio**: retrabalho + risco de mensagem-de-erro inconsistente vista pelo analista dependendo de qual endpoint falhou.
- **Métrica de baseline**: 27 linhas duplicadas / 2 clients. Cresce para 3× quando o fin010-baixa-oficial (BAIXADO status, Fatia 3+) for adicionado.

### F-integrability-4: Contract tests só com fixtures sintéticas — nenhum recorded HML payload congelado

- **Severidade**: P2
- **Tactic violada**: Contract testing (moderno)
- **Localização**: `src/backend/domain/client/ConexosSispag*.test.ts` (576 LOC total, 3 arquivos)
- **Evidência (objetiva)**:
  ```typescript
  // ConexosSispagClient.test.ts:17
  const fin064Row = (over: Record<string, unknown> = {}) => ({
      docCod: '100',
      titCod: '1',
      dpeNomPessoa: 'ACME LTDA',
      // ... payload sintético inline
  });
  ```
  Contra os probes HML reais (`jobs/probe-sispag*.ts`, `jobs/validate-fin015-tools.ts`) que executaram e gravaram respostas reais — nada é reusado como golden.
- **Impacto técnico**: Um rename no schema real Conexos passa nos testes locais mas falha em prod. Sem golden fixtures, a única detecção é observação em prod.
- **Impacto de negócio**: janela de detecção de breaking-change do provedor = próximo cron (24h), não CI.
- **Métrica de baseline**: 0 / 8 endpoints testados com fixture recorded (fin064/list, fin015/list, fin010/list, com298/list, fin015 create, gerarRemessa, fin052 arquivosRetorno/list, ger015/list).

### F-integrability-5: Zero validação runtime no frontend — só interfaces TS espelhando o backend

- **Severidade**: P2
- **Tactic violada**: Validate Input (boundary) — cross-QA com Security e Fault Tolerance
- **Localização**: `src/frontend/lib/sispag.ts:1-100` (interfaces sem `z.object` no fetch)
- **Evidência (objetiva)**:
  ```typescript
  // src/frontend/lib/sispag.ts:101
  const res = await apiFetch(`${API}/sispag/painel`, { ... })
  // return res.json() as SispagPainel  — sem parse Zod; typecast puro.
  ```
- **Impacto técnico**: mudança no `SispagPainelResponse` do backend (rename `titulos` → `parcelas`) só quebra no runtime, dentro do render — sem mensagem clara. Cross-QA: também é vetor XSS potencial se algum campo virar user-controlled (hoje Conexos-controlled, mas o boundary de confiança deveria ser explicitado).
- **Impacto de negócio**: bugs de contrato descobertos por usuário, não por CI.
- **Métrica de baseline**: 9 chamadas `apiFetch` no `lib/sispag.ts`, 0 usam `z.parse()`. Backend faz Zod no ingress (route `criarLoteSchema` etc.) mas frontend confia cegamente no egress.

### F-integrability-6: `SispagPainelService` com 9 collaborators — orchestrator hotspot

- **Severidade**: P3
- **Tactic violada**: Restrict Communication Paths; Orchestrate (rule of thumb ≤ 5)
- **Localização**: `src/backend/domain/service/sispag/SispagPainelService.ts:40-52`
- **Evidência (objetiva)**:
  ```
  9 @inject: ConexosSispagClient, ConexosSispagRetornoClient, ConexosBaseClient,
             BoundedConcurrency, TituloAPagarRepository, PagamentoIngestaoRunRepository,
             LotePagamentoRepository, EnvironmentProvider, LogService
  ```
- **Impacto técnico**: substituir qualquer read client cascata para este service; testes precisam mockar 9 dependências (`SispagPainelService.test.ts` faz 179 linhas de setup). Sinal de sub-services faltando (ex. `SispagPainelKpisCalculator`, `SispagRetornosView` já esboçados como métodos privados/públicos).
- **Impacto de negócio**: velocity da Fatia 3 é degradada — cada mudança no painel toca um "serviço-Deus".
- **Métrica de baseline**: 9 collaborators / recomendado ≤ 5. Métodos públicos: 3 (`montarPainel`, `listRetornos`, `modalidadesDisponiveisDoLote`) — sinal claro de que o serviço acumulou responsabilidades distintas.

## 5. Cards Kanban

### [integrability-1] Adotar Zod no boundary do `ConexosSispagRetornoClient` (fin052)

- **Problema**
  > Os 5 map fns do retorno client (`mapArquivo`, `listDetalhe`, `listErros`, `listConfigsRetorno`, `carregarArquivoRetorno`) usam `Number()`/`String()` sobre `Record<string, unknown>` sem schema Zod. Um rename no `fin052` vira `NaN` silencioso, corrompendo o pipeline de retorno (falso "0 baixas").

- **Melhoria Proposta**
  > Criar `arquivoRetornoRowSchema`, `arquivoRetornoDetalheRowSchema`, `arquivoRetornoErroRowSchema`, `retornoConfigRowSchema` espelhando os schemas OpenAPI (`GerArquivosRetorno`, `GerArquivosRetDet`, `GerArquivosRetornoErro`, `GerRetornoBancos`) em `docs/conexos-api/090-fin0.json`. Aplicar `passthrough()` + `.catch()` por campo — mesmo padrão de `ConexosSispagClient.tituloRowSchema`. Tactic: **Adhere to Standards** + **Abstract Common Services**.

- **Resultado Esperado**
  > Paridade de adoção Zod entre os 3 clients SISPAG. Drift do fin052 detectado como `undefined` (mapeamento gracioso) em vez de `NaN` (corrupção). Métrica: 0 % → 100 % dos map fns retorno com schema Zod.

- **Tactic alvo**: Adhere to Standards
- **Severidade**: P1
- **Esforço estimado**: S (≤ 1 d)
- **Findings relacionados**: F-integrability-1
- **Métricas de sucesso**:
  - Schemas Zod no retorno client: 0 → 4
  - Testes de drift (rename campo → `undefined`, não `NaN`): 0 → 4 casos
- **Risco de não fazer**: quando `RetornoOrquestracaoService` ligar em prod (Fatia 3), a única detecção de rename será "arquivo processed com 0 baixas" — que exige investigação manual por incidente.
- **Dependências**: nenhuma; independente da ativação do fluxo.

### [integrability-2] Descobrir e encapsular o transporte Nexxera (`NexxeraRetornoReader`)

- **Problema**
  > `RetornoOrquestracaoService.listarRetNaPasta()` retorna `[]` — no-op. O reader da pasta/SharePoint onde o Nexxera larga `.RET` não existe; o path exato, protocolo (SMB/MS Graph/HTTP?) e credenciais estão como `TODO(Ricardo/comercial)`. Bloqueia toda a ativação da perna de retorno automatizado.

- **Melhoria Proposta**
  > Rodar `/feature-new nexxera "descobrir transporte de retorno .RET"` para modelar entrevistando o Ricardo. Criar `ontology/integrations/nexxera.md` e `src/backend/domain/client/NexxeraRetornoReaderClient.ts` (`@singleton() @injectable()`) com API mínima (`listRetPendentes(): Promise<ArquivoRetPendente[]>`, `markProcessed(fileName)`). SSM path `/tenants/{env}/columbia/nexxera_credentials`. Tactic: **Discover Service** + **Encapsulate**.

- **Resultado Esperado**
  > `RetornoOrquestracaoService.processarRetornos()` deixa de ser dormente. Custo marginal futuro de trocar Nexxera por outro transporte = trocar 1 client atrás da mesma interface.

- **Tactic alvo**: Discover Service
- **Severidade**: P1
- **Esforço estimado**: M (2–5 d — descoberta + client + fixture HML)
- **Findings relacionados**: F-integrability-2
- **Métricas de sucesso**:
  - Nexxera integration surface: 0 → 1 client + 1 config SSM + 1 fixture
  - LOC do reader ≤ 200 (medida de encapsulamento saudável)
- **Risco de não fazer**: Fatia 3 retorno automático indefinidamente adiada; baixa continua manual (tesouraria + analista) e escala com o volume mensal de `.RET`.
- **Dependências**: entrevista com Ricardo (comercial) sobre acesso à pasta.

### [integrability-3] Extrair `describeConexosValidation` para o `ConexosBaseClient` (ou libs/errors)

- **Problema**
  > 27 linhas idênticas de `describeConexosValidation` em `ConexosSispagWriteClient.ts:68-94` e `ConexosSispagRetornoClient.ts:53-78` — self-acknowledged como "duplicado por ora". Quando o fin010-baixa (Fatia 3+) for adicionado, vira 3× duplicação.

- **Melhoria Proposta**
  > Mover a função para `ConexosBaseClient` (ou `src/backend/domain/errors/parseConexosValidation.ts`). Sub-clients delegam via `this.base.describeConexosValidation(cause)`. Tactic: **Abstract Common Services**.

- **Resultado Esperado**
  > 1 fonte de verdade para o parse de erro do Conexos; adicionar um novo shape de erro (novo `type`) toca 1 arquivo.

- **Tactic alvo**: Abstract Common Services
- **Severidade**: P2
- **Esforço estimado**: S (≤ 0.5 d)
- **Findings relacionados**: F-integrability-3
- **Métricas de sucesso**:
  - Linhas duplicadas de validation-parse: 27 × 2 → 0
  - Cobertura de teste da função extraída: ≥ 90 %
- **Risco de não fazer**: divergência silenciosa entre clients sobre como reportar erro de campo obrigatório vs. regra de negócio.
- **Dependências**: nenhuma; refactor puro.

### [integrability-4] Congelar payloads reais HML como golden fixtures para contract tests

- **Problema**
  > Os 576 LOC de testes dos 3 clients SISPAG usam payloads sintéticos inline. Os probes HML reais (`jobs/probe-sispag*.ts`, `jobs/validate-fin015-tools.ts`) capturaram respostas reais mas nada é reusado como golden. Um rename no Conexos passa nos testes locais.

- **Melhoria Proposta**
  > Adicionar `src/backend/domain/client/__fixtures__/sispag/{fin064.list.json, fin015.list.json, fin052.arquivosRetorno.list.json, ...}` gravados dos probes HML. Testes carregam via `readFile` e passam pelo mesmo mapper. Tactic: **Contract testing**.

- **Resultado Esperado**
  > CI detecta breaking-change do provedor em minutos (não em produção). Bar levantado antes de Fatia 3.

- **Tactic alvo**: Contract testing
- **Severidade**: P2
- **Esforço estimado**: M (2–3 d — capturar + sanitizar + wire tests)
- **Findings relacionados**: F-integrability-4
- **Métricas de sucesso**:
  - Golden fixtures: 0 → 8 (fin064, fin015, fin010, com298, fin015 create, gerarRemessa, fin052 list, ger015 list)
  - Testes fixture-based por client: 0 → ≥ 3
- **Risco de não fazer**: cada mudança no Conexos vira incidente descoberto em prod.
- **Dependências**: acesso HML já existe (probes funcionam).

### [integrability-5] Adotar Zod no wrapper do frontend (`lib/sispag.ts`)

- **Problema**
  > 9 chamadas `apiFetch` no `src/frontend/lib/sispag.ts` retornam com typecast puro (`as SispagPainel`). Mudança de contrato do backend só quebra no runtime, dentro do render. Cross-QA com Security (defesa em profundidade) e Fault Tolerance.

- **Melhoria Proposta**
  > Definir schemas Zod compartilhados (ou copiados) das interfaces em `frontend/lib/sispag.ts`. Fazer `SispagPainelSchema.parse(await res.json())` no boundary. Tactic: **Validate Input at boundary**.

- **Resultado Esperado**
  > Contract breakage detectado com mensagem clara ("titulos: expected array, got undefined"), reportável como erro-de-integração no monitor.

- **Tactic alvo**: Encapsulate + Adhere to Standards
- **Severidade**: P2
- **Esforço estimado**: M (2–3 d — schema por endpoint + testes de contrato FE↔BE)
- **Findings relacionados**: F-integrability-5
- **Métricas de sucesso**:
  - Frontend fetch calls com Zod parse: 0/9 → 9/9
  - Erros de contrato caídos no boundary vs. no render: TBD (baseline via monitor)
- **Risco de não fazer**: bugs de contrato invisíveis no CI, descobertos por usuário; render trava com stack críptico.
- **Dependências**: alinhar com Security (F-security-*) sobre estratégia comum de schema-sharing FE↔BE.

### [integrability-6] Desmembrar `SispagPainelService` — extrair `SispagRetornosView` e `SispagKpisCalculator`

- **Problema**
  > `SispagPainelService` tem 9 dependências injetadas e 3 métodos públicos independentes (`montarPainel`, `listRetornos`, `modalidadesDisponiveisDoLote`). Cada mudança toca um serviço-Deus; testes precisam de 179 linhas de setup para mockar tudo.

- **Melhoria Proposta**
  > Extrair `SispagRetornosView` (owns `ConexosSispagRetornoClient` + `BoundedConcurrency` + `LogService`, expõe `listRetornos`) e `SispagKpisCalculator` (função pura). `SispagPainelService` fica com `montarPainel` e delega. Tactic: **Restrict Communication Paths**.

- **Resultado Esperado**
  > Nenhum service SISPAG com > 5 collaborators. Fatia 3 (novos writes) adiciona um novo service ao invés de inflar o painel.

- **Tactic alvo**: Restrict Communication Paths
- **Severidade**: P3
- **Esforço estimado**: M (2–3 d — refactor + tests)
- **Findings relacionados**: F-integrability-6
- **Métricas de sucesso**:
  - Max collaborators por service SISPAG: 9 → ≤ 5
  - LOC de test setup por service: 179 → ≤ 80
- **Risco de não fazer**: velocity degrada linearmente com a superfície do painel; sub-agentes de refactor têm menos alavanca.
- **Dependências**: nenhuma; pode ser sequenciada após [integrability-1].

## 6. Notas do agente

- Adoção do padrão "Ferramenta vs. Fluxo" (comentário canônico em `ConexosSispagWriteClient:52-56`) é excelente separation-of-concerns — clients dormentes ficam prontos sem contaminar o request path. Verificado em prod: 0 callers de write em produção, 0 callers de `carregarArquivoRetorno` em produção; único caller do read retorno é `SispagPainelService.listRetornos` (`GET /sispag/retornos`).
- Cross-QA para o consolidator: **F-integrability-1** (Zod ausente no retorno client) sobrepõe com **qa-security** (validate-input em boundary) e **qa-fault-tolerance** (drift-tolerance); **F-integrability-5** (frontend sem Zod) idem; **F-integrability-6** (Painel service com 9 deps) sobrepõe com **qa-modifiability** (God-object).
- Não tentei medir MTTR/rate-de-erro-por-dependência — requer CloudWatch/Render logs; declarado como "não medível" na tabela.
- Anti-drift design (ingestão persiste BÁSICO, DETAIL hidratado ao vivo) é sólido — `LotePagamentoService.incluirTitulo:176-198` faz re-leitura Conexos FORA do lock (excelente decisão de pool safety documentada em comentário) e a `modalidadesDisponiveisDoLote` do painel é hidratação ao vivo com fan-out limitado + tolerância a falha per-título.
