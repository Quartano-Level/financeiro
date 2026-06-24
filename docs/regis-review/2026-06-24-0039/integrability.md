---
qa: Integrability
qa_slug: integrability
run_id: 2026-06-24-0039
agent: qa-integrability
generated_at: 2026-06-24T00:43:32Z
scope: backend
score: 4
findings_count: 8
cards_count: 7
---

# Integrability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| ERP Conexos (terceiro proprietário, sem OpenAPI) | Upgrade do `fin010` (renomeio de campo wire, mudança de status code, alteração no envelope `{messages,responseData}`, deprecação de path) | `ConexosClient` (12 métodos fin010 — 4 R + 8 W/transição) + `ReconciliacaoPermutaService` (handshake 5-passos) + `BorderoGestaoService` (CRUD borderô) + `routes/permutas.ts` (5 rotas write + 1 read) | Produção (Render free tier; escrita gated por `CONEXOS_WRITE_ENABLED`) | Detectar drift no boundary (Zod ou contract test) ANTES de gravar baixa duplicada/inválida no ERP; preservar mensagens amigáveis pt-BR | 0 baixas duplicadas; ≥ 80% dos campos críticos do envelope validados por schema; tempo de adaptação a drift documentado ≤ 1 dia (1 arquivo) |

> O contrato `fin010` foi 100% reconstruído por **engenharia reversa de HAR**. Não há OpenAPI/Swagger, não há changelog do Conexos, e o fornecedor não notifica deprecações. Esta é a **superfície de integrabilidade mais frágil do sistema** — qualquer mudança silenciosa no `fin010` quebra escritas irreversíveis em produção.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Endpoints `fin010` modelados no client | 11 (1 POST cria, 1 GET read, 1 POST list, 3 POST validacao, 1 POST grava baixa, 3 POST transitions, 2 DELETE) | — | ℹ️ | `ConexosClient.ts:1011-1394, 1221-1265` |
| Versionamento no path (`/v1`, `/v2`) | 0/11 endpoints | ≥ 1 (Accept-Version header ou sentinela) | ❌ | `rg "/v[0-9]" src/backend/domain/client/ConexosClient.ts` → 0 hits |
| Métodos `fin010` cobertos por teste com fixture wire-real | 5/12 (`criarBordero`, `validarTituloBaixa`, `validarTituloPermuta`, `atualizarValorLiquido`, `gravarBaixaPermuta`) | 11/11 + envelope de erro | ⚠️ | `ConexosClient.test.ts:1345-1490` |
| `responseData?.` reads sem validação Zod | 5 (em `ReconciliacaoPermutaService.ts:230, 291, 311, 312, 322`) + 7 envelope sites em `ConexosClient.ts` | 0 (Zod no boundary) | ❌ | `rg "responseData\??\." src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts src/backend/domain/client/ConexosClient.ts` |
| Coerções `Number()`/`String()` em respostas do `fin010` write/transition block (ConexosClient.ts:1011-1394) | 23 | 0 (substituir por schema único de envelope) | ❌ | `awk 'NR>=1011 && NR<=1394' \| grep -c "Number(\|String(\|as string\|as number"` |
| Schemas Zod no caminho `fin010` | 0 (existem 3 schemas para LEITURA `com298/308/imp019` em `conexosPermutasSchemas.ts` — NENHUM para `fin010`) | ≥ 4 (BorderoCriado, TituloBaixaValidacao, TituloPermutaValidacao, BaixaGravada) | ❌ | `rg "z\." src/backend/domain/client/ConexosClient.ts` → 0 hits; só `com298RowSchema`, `com308RowSchema`, `declaracaoRowSchema` em `conexosPermutasSchemas.ts` |
| Códigos de erro ERP mapeados ad-hoc (duplicação) | 7 chaves em 2 locais (`ReconciliacaoPermutaService.ts:501-508`: 4 chaves; `routes/permutas.ts:44-51`: 3 chaves) | 1 fonte única (mapper compartilhado ou Zod discriminated-union) | ⚠️ | `rg -nc "FIN_010\|FIN_014\|Generic\.ERROR_MESSAGE\|CnxValidator" src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts src/backend/routes/permutas.ts` → 8 + 4 |
| Magic numbers do contrato (`docTip=2`, `borVldTipo=2`, `titCod=1`, `bxaTitCod=1`, `CONTA_GER_JUROS=131`, `bxaVldSistema=0`, etc.) repetidos no payload | 11 ocorrências literais em `ReconciliacaoPermutaService.ts` + 7 em `ConexosClient.ts` | constantes nomeadas e exportadas (`FIN010_DOC_TIP_INVOICE`, `FIN010_BORVLDTIPO_PERMUTA`, …) | ❌ | `rg "docTip\s*[:=]\s*2\|borVldTipo\s*[:=]\s*2\|titCod\s*[:=]\s*1" …` |
| Conta de serviço única para WRITE | 1 (`CONEXOS_USERNAME` global, ver `services/conexos.ts:144`) — sem `actAs` por usuário no ERP | usuário ERP = `executadoPor` (ou pelo menos N contas de serviço por papel) | ⚠️ | `services/conexos.ts:142-197` (login global; `usnCod` único capturado em `_doLogin`) |
| Ambiguidade de path resolvida via comentário (sem teste de regressão) | 1 (bug `docTip` vs `filCod` documentado em `ConexosClient.ts:1131-1135`) | 1 teste de regressão dedicado | ⚠️ | `ConexosClient.ts:1131-1135` ("a sonda inicial confundiu os dois porque na filial 2 o filCod coincide com o docTip 2") |
| Métodos públicos do `ConexosClient` (escala do God Client) | 25 | < 15 ou split por sub-cliente (`Fin010Client`, `Com298Client`, …) | ⚠️ | `rg -nc "^\s*public " src/backend/domain/client/ConexosClient.ts` → 25 |
| Services que dependem diretamente do `ConexosClient` | 7 (Eleicao, Reconciliacao, BorderoGestao, AlocacaoPermutas, Gestao, VariacaoCambial, FechamentoMensal) | < 4 (intermediar por sub-cliente) | ⚠️ | inferido do `@inject(ConexosClient)` em `domain/service/permutas/` |
| Acoplamento a `axios`/`fetch` fora do client layer | 0 em services/repositories | 0 | ✅ | `rg "axios\|fetch\(" src/backend/domain/service/ src/backend/domain/repository/` → 0 hits |
| Mensagens amigáveis pt-BR no boundary `route` | 3/N keys (`FIN_014.DELETAR_REGISTRO_ESTORNO`, `FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO`, `Generic.ERROR_MESSAGE`) — Generic é catch-all | ≥ 1 entrada por código ERP descoberto | ⚠️ | `routes/permutas.ts:44-51` |

> ⚠️ **Não medível localmente**: rate de drift do `fin010` (quantos campos wire mudaram nos últimos 12 meses). Requer histórico de HAR/probe em produção. Recomendação: instrumentar um job semanal que dispara o handshake em filial sandbox e diff'a a resposta vs. fixture commitada.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Encapsulate** | `ConexosClient` expõe métodos de domínio (`criarBordero`, `gravarBaixaPermuta`, `excluirBaixa`, …) — não vaza `postGeneric`/`request` para fora. Mas o adaptador `legacyConexosAdapter` mantém `postGeneric`/`getGeneric`/`deleteGeneric` em seu próprio shape (necessário para os endpoints novos sem refactor). | ⚠️ parcial | `ConexosClient.ts:1011-1394` (domain methods OK); `legacyConexosAdapter.ts:94-105` (passthrough genérico — uso interno apenas, mas perto da fronteira pública) |
| **Use an Intermediary** | `legacyConexosAdapter` é o intermediário entre `ConexosClient` (novo) e `services/conexos.ts` (legacy axios). Resolve um problema (não duplicar sessão) mas adiciona uma camada que ainda devolve `Record<string, unknown>` para serem casted no client. | ⚠️ parcial | `legacyConexosAdapter.ts:1-117` |
| **Restrict Communication Paths** | Routes → Services → Client. Nenhum serviço importa `axios`/`fetch` direto (medido: 0 hits em `domain/service/`). | ✅ presente | `rg "axios\|fetch" src/backend/domain/service` → vazio |
| **Adhere to Standards** | Conexos NÃO segue um padrão público (sem OpenAPI). Internamente o projeto adere a Zod nos boundaries de LEITURA (`conexosPermutasSchemas.ts`) mas **não no WRITE** `fin010`. | ❌ ausente p/ fin010 | `conexosPermutasSchemas.ts:1-67` (só leitura); `Fin010Baixa.ts:1-104` (só TS interfaces, sem Zod) |
| **Abstract Common Services** | `RetryExecutor`, `EnvironmentProvider`, `LogService` são abstrações compartilhadas. Pero NÃO há **envelope-validator comum** para o padrão `{messages, responseData}` do `fin010` — cada serviço chama `responseData?.…` cru. | ⚠️ parcial | `RetryExecutor` reusado em `ConexosClient.ts:407-412, 1276, 1310, 1343`; envelope sem helper único |
| **Discover Service** | URL Conexos é hardcoded com fallback (`services/conexos.ts:80`: `process.env.CONEXOS_BASE_URL \|\| 'https://columbiatrading.conexos.cloud/api'`). Sem SSM, sem service registry. Aceitável no template Express; será revisitado na migração Lambda. | ⚠️ parcial | `services/conexos.ts:78-83` |
| **Tailor Interface** | `ConexosClient` "achata" o handshake de 5 passos em 5 métodos discretos + 1 método-fachada `gravarBaixaPermuta` que recebe `payload: Record<string, unknown>` cru. O serviço (`ReconciliacaoPermutaService.buildFinalPayload`, `RecocnciliacaoPermutaService.ts:342-398`) monta o payload. Vaza acoplamento do contrato wire (`bxaVldSistema`, `bxaDocTip`, `bxaVldCorrenteDc`, `frontModelName`) para a camada de serviço. | ⚠️ parcial | `ReconciliacaoPermutaService.ts:342-398` (24 campos wire-shape construídos no service) |
| **Configure Behavior** | Escrita gated por `CONEXOS_WRITE_ENABLED` + `CONEXOS_DRY_RUN` via `EnvironmentProvider` — bem feito. Filial default por env (`CONEXOS_FIL_COD`), com falha alta se ausente (`MissingFilCodError`). | ✅ presente | `ReconciliacaoPermutaService.ts:94-98`; `services/conexos.ts:315-323` |
| **Manage Resources** | Sessão Conexos com mutex (`loginPromise`) impede logins paralelos; 401-retry interno reaproveita a sessão. Único `usnCod` (conta de serviço) — todas as escritas aparecem como o mesmo usuário no ERP. | ⚠️ parcial | `services/conexos.ts:73-77, 125-197`; `usnCod` único 142-171 |
| **Orchestrate** | `ReconciliacaoPermutaService.reconciliar` orquestra o handshake (criarBordero → 4 chamadas por par → gravarBaixaPermuta) em série, COM persistência de progresso (`setBorCod` antes do POST). Sem máquina de estado formal, mas com `status` (`reconciling`/`settled`/`error`) na trilha. | ✅ presente | `ReconciliacaoPermutaService.ts:78-205, 207-339` |
| **Manage Resource Coupling** | A LEITURA do `getBordero` durante `excluirBordero` foi REMOVIDA (comentário em `BorderoGestaoService.ts:152-156`: incoerente após estorno) — agora confia na ação atômica do ERP. Bom. Mas a idempotência ainda depende de polling pós-fato (`borderoAindaValido`), não de um lock no ERP. | ⚠️ parcial | `BorderoGestaoService.ts:152-156`; `ReconciliacaoPermutaService.ts:476-487` |
| **Contract testing** | 5 testes wire-shape no `ConexosClient.test.ts` (criarBordero, validarTituloBaixa, validarTituloPermuta, gravarBaixaPermuta, no-retry-on-irreversible-writes). Cobertura parcial — `excluirBaixa`, `excluirBordero`, `finalizarBordero`, `cancelarBordero`, `estornarBordero`, `listBaixas`, `listBorderos`, `getBordero`, `atualizarValorLiquido` NÃO têm fixture-based test. | ⚠️ parcial | `ConexosClient.test.ts:1345-1490` |
| **Versioning strategy** | NENHUMA. Não há pinning de versão (path/header), não há detector de mudança no contrato, não há CI scheduled probe contra o ERP de sandbox. | ❌ ausente | grep `version=\|/v[0-9]\|api-version` no client → 0 hits |
| **Backward-compatibility shims** | N/A — o contrato nunca foi versionado, então não há shim. O risco de regressão silenciosa é integral. | ❌ ausente | — |
| **Observability of integration failures** | `LogService.error/warn` com `LOG_TYPE.BUSINESS_WARN` para falhas no boundary. Trilha `permuta_alocacao_execucao` grava `erp_response` cru em `error`. Sem métrica/contador por tipo de erro do ERP (não há `metrics`/Prometheus). | ⚠️ parcial | `ReconciliacaoPermutaService.ts:178-187, 325-329`; `BorderoGestaoService.ts:114-122` |

## 4. Findings (achados)

### F-integrability-1: Envelope `{messages, responseData}` lido SEM Zod — drift do `fin010` quebra escritas em produção

- **Severidade**: P0
- **Tactic violada**: Adhere to Standards (validate at boundary) · Contract testing
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:230, 291, 311, 312, 322`; `src/backend/domain/client/ConexosClient.ts:1273-1394` (4 métodos POST `fin010/baixas/validacao/*` + `gravarBaixaPermuta`)
- **Evidência (objetiva)**:
  ```ts
  // ReconciliacaoPermutaService.ts:229-235
  this.assertNoErpError(val2, 'tituloBaixa');
  const emAbertoErp = val2.responseData?.bxaMnyValor;   // <-- cast TS, sem schema
  if (emAbertoErp === undefined || !(emAbertoErp > 0)) { ... }
  // ReconciliacaoPermutaService.ts:311-312
  descontoGerCod: val2.responseData?.bxaCodGerDesconto, // <-- cast TS
  descontoGerDes: val2.responseData?.gerDesDesconto,    // <-- cast TS
  ```
  `Fin010Baixa.ts:42-83` declara `interface TituloBaixaValidacao` / `TituloPermutaValidacao` / `BaixaGravada` mas SÃO PUROS TIPOS TS, sem runtime check. Comparar com `conexosPermutasSchemas.ts:28-34` (`com298RowSchema = z.object({docCod, priCod}).passthrough()`) — leitura tem Zod; escrita não.
- **Impacto técnico**: Se o ERP renomear `bxaMnyValor` → `bxaMnyValorBaixa`, `emAbertoErp` vira `undefined`, a guarda `> 0` falha com mensagem genérica ("título sem valor em aberto") em vez de "contrato `fin010` mudou — parar e investigar". Se renomear `gerNumPermuta`, o payload do passo 5 vai com `null` e o ERP grava lixo (ou rejeita silenciosamente via `valid='AVISO'` que o `assertNoErpError` deixa passar — ver F-integrability-3).
- **Impacto de negócio**: Baixa errada/duplicada no `fin010` afeta variação cambial (`gerNum=131`, conta hardcoded — F-integrability-5), conciliação contábil mensal e auditoria fiscal. O custo de reverter UMA baixa fantasma é processo manual no ERP (`fin010/estornar/{borCod}`) + nota explicativa para a contabilidade.
- **Métrica de baseline**: 5 reads `responseData?.` sem validação no service + 7 sites de envelope no client → 12 pontos de drift latente. 0 schemas Zod cobrindo o caminho `fin010` (vs. 3 schemas no caminho de leitura `com298/308/imp019`).

### F-integrability-2: Contrato `fin010` modelado por engenharia reversa de HAR — sem versionamento, sem detector de drift

- **Severidade**: P0
- **Tactic violada**: Versioning strategy · Backward-compatibility shims · Discover Service
- **Localização**: `src/backend/domain/client/ConexosClient.ts:1011-1394` (11 endpoints `fin010`); `ontology/business-rules/fin010-write-contract.md` (referenciado, documenta a engenharia reversa)
- **Evidência (objetiva)**:
  ```ts
  // ConexosClient.ts:1077-1080
  // Lista as baixas de um borderô — `POST /fin010/baixas/list/{borCod}` (sonda HAR). Fonte da
  // verdade do que está DENTRO do borderô (mesmo os não criados por nós). …

  // ConexosClient.ts:1131-1135
  // `DELETE /fin010/baixas/{borCod}/{docTip}/{docCod}/{titCod}/{bxaCodSeq}` — o 2º segmento é o
  // **docTip** (tipo do documento, 2 = invoice), NÃO o filCod (este vai no header `cnx-filcod`).
  // A sonda inicial confundiu os dois porque na filial 2 o filCod coincide com o docTip 2.
  ```
  `rg "/v[0-9]" src/backend/domain/client/ConexosClient.ts` → 0 ocorrências. Nenhum header `Accept-Version`, nenhum `api-version` query, nenhum probe agendado.
- **Impacto técnico**: O bug `docTip-vs-filCod` foi descoberto por acidente (filial diferente da 2 quebraria silenciosamente — `DELETE` numa baixa que não existe responde 404, mas o DELETE noutra estrutura responde 200 e apaga algo errado). É o **padrão arquetípico** do que vai acontecer com qualquer outro path `fin010/*/{x}/{y}` quando entrarmos em mais filiais.
- **Impacto de negócio**: Cada filial nova é um sítio potencial de bug "funciona em homologação, quebra em produção". A área financeira tem 4+ filiais ativas no ERP — escalonamento para todas multiplica o blast radius.
- **Métrica de baseline**: 0 endpoints versionados, 0 fixtures HAR commitadas em `__fixtures__/`, 0 testes de regressão para a ambiguidade de path. 1 bug pré-existente descoberto na sessão de 2026-06-23 só pela auditoria manual.

### F-integrability-3: Códigos de erro do ERP mapeados ad-hoc em DOIS lugares (drift de mensagem amigável)

- **Severidade**: P1
- **Tactic violada**: Abstract Common Services · Encapsulate
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:497-511` (mapa de 4 chaves); `src/backend/routes/permutas.ts:44-51` (mapa de 3 chaves, **interseção parcial**)
- **Evidência (objetiva)**:
  ```ts
  // ReconciliacaoPermutaService.ts:501-508 — chaves cobertas:
  //   FIN_010.DATA_BLOQUEADA_PELA_CONTABILIDADE
  //   FIN_010.FIN_IMPOSSIVEL_ALTERAR_REGISTRO
  //   CnxValidatorMny / CnxValidatorDescr
  //
  // routes/permutas.ts:44-51 — chaves cobertas:
  //   FIN_014.DELETAR_REGISTRO_ESTORNO
  //   FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO   <-- mesmo verbo, prefixo distinto (FIN_010 vs FIN_014)
  //   Generic.ERROR_MESSAGE                      <-- catch-all "estado incompatível"
  ```
  São duas tabelas paralelas, mantidas em arquivos diferentes (service vs route), com **chaves disjuntas** e **um único verbo duplicado com prefixo diferente** (`FIN_IMPOSSIVEL_ALTERAR_REGISTRO`).
- **Impacto técnico**: Quando o Conexos retornar `FIN_010.FIN_IMPOSSIVEL_ALTERAR_REGISTRO` na rota de bordero (não na reconciliação), o route map não tem entrada → cai no fallback `err.message` (raw `Error: fin010 ... retornou ERRO: FIN_010.FIN_IMPOSSIVEL...`), que vaza nome técnico para o usuário final.
- **Impacto de negócio**: Operadores do financeiro veem mensagens ora amigáveis ora técnicas dependendo de QUAL rota chamou — perda de confiança no sistema; mais tickets para o suporte ("o que é Generic.ERROR_MESSAGE?").
- **Métrica de baseline**: 2 tabelas independentes, 7 chaves distintas, 0 fonte única. Cada novo código descoberto = 2 mudanças (uma em cada arquivo).

### F-integrability-4: `assertNoErpError` só barra `valid='ERRO'` — `valid='AVISO'` passa silencioso e pode ser materialmente importante

- **Severidade**: P1
- **Tactic violada**: Encapsulate · Observability of integration failures
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:461-469`
- **Evidência (objetiva)**:
  ```ts
  // ReconciliacaoPermutaService.ts:461-469
  private assertNoErpError = (resp: { messages?: Array<{...}> }, passo: string): void => {
      const erro = resp.messages?.find((m) => m.valid === 'ERRO');
      if (erro) { throw new Error(`fin010 ${passo} retornou ERRO: ${erro.message ?? 'sem detalhe'}`); }
  };
  // Comentário 458-460: "AVISO (ex.: PESSOA_POSSUI_ADIANTAMENTO) é informativo e segue;
  //                       ERRO aborta o handshake."
  ```
  Decisão arquitetural sem evidência: o catálogo completo de `valid='AVISO'` nunca foi enumerado. O AVISO é registrado? Não — não há `logService.warn` no path do assert. Se o ERP introduzir um novo `valid='WARN_BLOCKING'`, a escrita segue sem ninguém saber.
- **Impacto técnico**: Avisos "informativos" podem mudar de semântica no ERP (típico em sistemas legados — um WARN vira ERR no minor release). Sem captura, perdemos o sinal e descobrimos pelo efeito (baixa torta, conciliação fora).
- **Impacto de negócio**: O caso `PESSOA_POSSUI_ADIANTAMENTO` é exatamente o sinal de que o usuário escolheu um adto válido — bom. Mas se o ERP adicionar um aviso "ADIANTAMENTO_PARCIAL_NAO_RECOMENDADO" e mudarmos comportamento de baixa parcial sem saber, criamos divergência financeira difícil de reconciliar.
- **Métrica de baseline**: 0 avisos capturados em `BUSINESS_WARN`, 0 catálogo de `valid='AVISO'` documentado.

### F-integrability-5: Magic numbers do contrato `fin010` (docTip=2, borVldTipo=2, titCod=1, conta 131) espalhados em 18+ sites

- **Severidade**: P1
- **Tactic violada**: Encapsulate · Adhere to Standards
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:15, 227, 264, 285, 322, 365, 371, 377, 384, 391, 438, 445`; `src/backend/domain/client/ConexosClient.ts:1023, 1112, 1114, 1145, 1241, 1282-1287, 1319-1320, 1349-1352`
- **Evidência (objetiva)**:
  ```ts
  // ReconciliacaoPermutaService.ts:15
  const CONTA_GER_JUROS = 131;  // <-- só constante existente; única OK.

  // ReconciliacaoPermutaService.ts:227, 285  →  titCod: 1,
  // ReconciliacaoPermutaService.ts:264, 391  →  bxaTitCod: 1,
  // ReconciliacaoPermutaService.ts:365      →  docTip: 2,
  // ReconciliacaoPermutaService.ts:371      →  borVldTipo: 2,
  // ConexosClient.ts:1023, 1287, 1319, 1352 →  borVldTipo: 2,
  // ConexosClient.ts:1282, 1349             →  docTip: 2,
  // ConexosClient.ts:1145                   →  const docTip = params.docTip ?? 2;
  ```
  Apenas `CONTA_GER_JUROS = 131` foi extraída para constante. Os demais discriminantes do contrato (tipo-do-documento INVOICE=2, tipo-do-bordero PERMUTA=2, titulo único=1) são literais repetidos.
- **Impacto técnico**: (a) `docTip=2` e `borVldTipo=2` são valores DIFERENTES com o mesmo número — o bug `DELETE /fin010/baixas/{borCod}/{docTip}/...` (F-integrability-2) é exatamente o resultado desse alias. (b) Quando o Conexos suportar baixar título de NF (`docTip=3`?) ou borderô não-permuta, há 18+ sites para atualizar com risco de esquecer um. (c) `titCod=1` assume "título único por documento" — quando aparecer parcelamento, a regra muda em N lugares.
- **Impacto de negócio**: Roadmap de SISPAG (frente II — `com298` write) provavelmente reusa parte do contrato `fin010`, mas com `docTip` diferente. Sem constantes nomeadas, o copy-paste vai propagar o erro.
- **Métrica de baseline**: 1 constante extraída / 18+ literais repetidos = 5% taxa de extração. Comentário "filial 2 coincidiu com docTip 2" já é evidência de incidente real.

### F-integrability-6: Conta de serviço Conexos ÚNICA — toda escrita aparece como `CONEXOS_USERNAME` no ERP (perda de auditoria de identidade)

- **Severidade**: P1
- **Tactic violada**: Discover Service · Manage Resources · Restrict Communication Paths
- **Localização**: `src/backend/services/conexos.ts:142-197` (single login global, `usnCod` único capturado em `_doLogin`); `defaultHeaders(filCod?)` cravando `cnx-usncod` único
- **Evidência (objetiva)**:
  ```ts
  // services/conexos.ts:144-152
  const username = process.env.CONEXOS_USERNAME;
  const password = process.env.CONEXOS_PASSWORD;
  // ... resp.data.usnCod  →  this.usnCod = String(resp.data.usnCod);
  //                       (única captura — todo defaultHeaders usa esse usnCod)
  ```
  No ERP, TODAS as baixas/permutas/finalizações aparecem com o mesmo `usnDesNomeCad`/`usnDesNomeFin`. A trilha LOCAL (`permuta_alocacao_execucao.executado_por`) sabe quem foi (`req.user.sub` em `routes/permutas.ts:432, 461, 490, 519, 549`) — mas o ERP NÃO.
- **Impacto técnico**: Auditoria do ERP (`fin010/list` mostra `usnDesNomeCad`) não distingue um operador de outro. Compliance/regulatório (SOX-like / Receita) costuma exigir matriz de responsabilidades — não temos no lado ERP.
- **Impacto de negócio**: Investigação de baixa errônea ("quem aprovou o borderô 12345?") exige cruzar a trilha local com o evento do ERP por timestamp — não é trivial e quebra se a trilha for perdida. Auditor externo provavelmente exigirá usuário ERP por operador no próximo audit.
- **Métrica de baseline**: 1 conta para N operadores. 5 routes de escrita (`/reconciliar`, `/finalizar`, `/cancelar`, `/estornar`, `/borderos/{borCod}` DELETE, `/borderos/{borCod}/baixas/{invoiceDocCod}` DELETE) — 0 propagam identidade real para o ERP.

### F-integrability-7: Cobertura de teste do `fin010` é parcial — 5/12 métodos têm fixture; ações destrutivas (DELETE, finalizar, estornar) NÃO

- **Severidade**: P1
- **Tactic violada**: Contract testing
- **Localização**: `src/backend/domain/client/ConexosClient.test.ts:1345-1490`
- **Evidência (objetiva)**:
  ```text
  Cobertos por fixture wire-shape (ConexosClient.test.ts:1345-1490):
    - criarBordero, validarTituloBaixa, validarTituloPermuta,
      gravarBaixaPermuta, no-retry-on-irreversible-writes
  NÃO cobertos:
    - atualizarValorLiquido (passo 4 do handshake)
    - excluirBaixa, excluirBordero  (DELETE — irreversíveis)
    - finalizarBordero, cancelarBordero, estornarBordero  (state-transitions)
    - listBaixas, listBorderos, getBordero  (reads que alimentam a tela de gestão)
  ```
  Métodos write/state-transition têm tentativa única (sem RetryExecutor) por design — qualquer regressão no path ou body chega direto à produção.
- **Impacto técnico**: O bug `docTip-vs-filCod` (F-integrability-2) NÃO seria pego pela suite atual — `excluirBaixa` não tem teste de path.
- **Impacto de negócio**: Risco de ação destrutiva (apagar baixa errada, finalizar borderô errado) chegar em produção sem rede de proteção.
- **Métrica de baseline**: 5/12 = 42% cobertura de método `fin010`. Para escritas IRREVERSÍVEIS o alvo deve ser 100%.

### F-integrability-8: `ConexosClient` aproxima do anti-padrão God Client (25 métodos públicos, 7 services dependem dele)

- **Severidade**: P2
- **Tactic violada**: Restrict Communication Paths · Use an Intermediary
- **Localização**: `src/backend/domain/client/ConexosClient.ts` (1856 linhas, 25 métodos públicos abrangendo `imp021`, `com298`, `com299`, `com308`, `com311`, `imp019`, `imp223`, `fin010`)
- **Evidência (objetiva)**:
  ```bash
  $ rg -nc "^\s*public " src/backend/domain/client/ConexosClient.ts
  25
  $ rg -l "@inject(ConexosClient)" src/backend/domain/service/
  → 7 services
  ```
- **Impacto técnico**: Cada mudança no client recompila/retesta 7 services. Trocar o backend de auth (ADR-0006 substituir o legacy) força rebase de TODOS. Substituir o ERP (cenário Bass de "swap a provider") significa reimplementar uma única classe gigante.
- **Impacto de negócio**: Custo marginal de adicionar a frente II (SISPAG — escrita `com298`) e III (Popula GED) tende a ser absorvido no mesmo arquivo, agravando o problema.
- **Métrica de baseline**: 25 métodos públicos, 1856 LOC, 7 consumidores. Alvo razoável: < 12 métodos por sub-client (split em `Fin010Client`, `Com298Client`, `Imp021Client`).

## 5. Cards Kanban

### [integrability-1] Validar envelopes `fin010` com Zod no boundary (write-path)

- **Problema**
  > Os 5 endpoints write/validacao do `fin010` (validarTituloBaixa, validarTituloPermuta, atualizarValorLiquido, gravarBaixaPermuta) leem `responseData?.bxaMnyValor`/`gerNumPermuta`/`bxaCodGerDesconto`/etc. como cast TS sem validação runtime (`ReconciliacaoPermutaService.ts:230, 291, 311, 312, 322` + 7 sites no client). Qualquer renomeação de campo wire no Conexos passa silenciosamente e contamina a baixa gravada no ERP.

- **Melhoria Proposta**
  > Estender `conexosPermutasSchemas.ts` com 4 schemas Zod (`borderoCriadoSchema`, `tituloBaixaValidacaoSchema`, `tituloPermutaValidacaoSchema`, `baixaGravadaSchema`) cobrindo os campos canônicos consumidos (lista finita: 7 campos no agregado). Aplicar `.parse(resp.responseData)` no `ConexosClient.ts` ANTES de retornar para o service, transformando drift em erro tipado (`ConexosError({ endpoint, cause: ZodError })`). Falha de schema → log `BUSINESS_WARN` + abort do handshake (a baixa NÃO é gravada).

- **Resultado Esperado**
  > Drift de campo wire detectado no boundary com mensagem específica ("campo `bxaMnyValor` ausente na resposta do `fin010/baixas/validacao/tituloBaixa`") em vez de "título sem valor em aberto". 0 escritas com `null`/`undefined` em campo obrigatório do payload do passo 5.

- **Tactic alvo**: Adhere to Standards (validate at boundary)
- **Severidade**: P0
- **Esforço estimado**: M (2–3d)
- **Findings relacionados**: F-integrability-1, F-integrability-4
- **Métricas de sucesso**:
  - Schemas Zod no caminho `fin010`: 0 → 4
  - Reads `responseData?.` sem validação no service: 5 → 0
  - Coerções `Number()`/`String()` no block fin010 do client: 23 → ≤ 5
- **Risco de não fazer**: 1 baixa irreversível torta em produção custa horas de investigação contábil + retrabalho manual no ERP por par adto↔invoice afetado.
- **Dependências**: nenhuma (extensão de padrão já existente em `conexosPermutasSchemas.ts`).

### [integrability-2] Pinning de contrato + scheduled drift probe contra sandbox Conexos

- **Problema**
  > Contrato `fin010` reconstruído por engenharia reversa de HAR (11 endpoints), sem versionamento (0 ocorrências de `/v[N]`/header `Accept-Version`), sem detector de drift. O bug `docTip` vs `filCod` (`ConexosClient.ts:1131-1135`) só foi descoberto por acaso porque filial 2 coincidia com docTip 2 — o mesmo padrão existe latente em outros paths.

- **Melhoria Proposta**
  > (1) Commitar fixtures HAR canônicas em `src/backend/domain/client/__fixtures__/fin010/` (uma por endpoint, mascaradas). (2) Criar workflow GitHub Actions semanal `fin010-drift-probe` que roda o handshake CRIAR→VALIDAR→CANCELAR num borderô descartável da filial sandbox e diff'a a resposta vs. a fixture. (3) Header `X-Client-Version` (nosso) em cada request — facilita o suporte do Conexos quando reclamarmos de mudança. (4) Documentar em `ontology/integrations/conexos.md` (criar) a tabela completa de paths + magic numbers + envelope.

- **Resultado Esperado**
  > Mudança de campo wire detectada em < 7 dias automaticamente (vs. "descobre quando uma baixa quebra"). Bug "filial X tem padrão de path diferente" coberto por teste de regressão.

- **Tactic alvo**: Versioning strategy · Discover Service
- **Severidade**: P0
- **Esforço estimado**: L (1–2sem — inclui filial sandbox + GH Actions secrets)
- **Findings relacionados**: F-integrability-2, F-integrability-7
- **Métricas de sucesso**:
  - Fixtures HAR commitadas: 0 → 11
  - Endpoints com teste de path-regression: 0 → 11
  - Tempo médio de detecção de drift: ∞ → ≤ 7 dias
- **Risco de não fazer**: Cada filial nova é um sítio potencial de bug oculto; a frente II (SISPAG) terá o mesmo problema multiplicado por outro contrato `com298` write.
- **Dependências**: filial sandbox Conexos provisionada pelo Yuri (não-trivial).

### [integrability-3] Unificar mapa de erros `fin010` numa fonte única (módulo `fin010ErrorMessages.ts`)

- **Problema**
  > Dois mapas paralelos de erro pt-BR — um em `ReconciliacaoPermutaService.ts:497-511` (4 chaves: FIN_010.*, CnxValidator*) e outro em `routes/permutas.ts:44-51` (3 chaves: FIN_014.*, Generic.*). Chaves disjuntas, um verbo duplicado (`FIN_IMPOSSIVEL_ALTERAR_REGISTRO` com prefixo `FIN_010` no service e `FIN_014` na route). Quando o ERP retorna o código "do outro lado", o usuário vê mensagem técnica.

- **Melhoria Proposta**
  > Extrair `src/backend/domain/client/permutas/fin010ErrorMessages.ts` exportando: (a) `Fin010ErrorKey` (union literal das chaves conhecidas), (b) `FIN010_PT_BR: Record<Fin010ErrorKey, string>`, (c) `humanizeFin010Error(err: unknown): string` que extrai a chave do envelope e olha no mapa. Substituir os dois call sites pelo helper. Cada nova chave descoberta = UM commit em UM arquivo + UM teste.

- **Resultado Esperado**
  > 0 chaves duplicadas/divergentes. 100% das mensagens visíveis ao usuário em pt-BR (catch-all `'O ERP recusou esta operação...'` vira fallback do mapa).

- **Tactic alvo**: Abstract Common Services · Encapsulate
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-3
- **Métricas de sucesso**:
  - Mapas de erro: 2 → 1
  - Chaves cobertas: 7 → 7 (sem regredir) + catálogo completo documentado em `ontology/integrations/conexos.md`
  - Drift cross-route futuro: bloqueado por tipo (`Fin010ErrorKey` union)
- **Risco de não fazer**: Toda nova chave descoberta exige 2 edits coordenados; com o tempo as tabelas drift'am.
- **Dependências**: nenhuma.

### [integrability-4] Capturar `valid='AVISO'` em `BUSINESS_WARN` (catálogo + telemetria)

- **Problema**
  > `assertNoErpError` em `ReconciliacaoPermutaService.ts:461-469` SÓ barra `valid='ERRO'`. `AVISO` é descartado silenciosamente — sem log, sem métrica, sem catálogo. O comentário cita `PESSOA_POSSUI_ADIANTAMENTO` mas não há lista enumerada. Se o ERP mudar a semântica de um aviso, perdemos o sinal.

- **Melhoria Proposta**
  > (1) Estender `assertNoErpError` para registrar `LOG_TYPE.BUSINESS_WARN` com `{ passo, message, vars }` para CADA item `valid='AVISO'`. (2) Criar `ontology/integrations/conexos-avisos.md` com a tabela de avisos vistos em produção + decisão (segue/bloqueia/escalável). (3) Acrescentar contador agregado por aviso no `LogService` (mesmo que sem Prometheus — tabela local `conexos_aviso_count`).

- **Resultado Esperado**
  > 100% dos avisos do ERP visíveis na trilha de log + decisões documentadas. Novo aviso → BUSINESS_WARN no Sentry/log já no primeiro disparo.

- **Tactic alvo**: Observability of integration failures
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-4
- **Métricas de sucesso**:
  - Avisos capturados em log: 0 → 100%
  - Catálogo documentado: 0 chaves → todas as vistas em 30d
- **Risco de não fazer**: ERP introduz `AVISO` "BLOQUEAR_SUGERIDO" que indica problema material — não detectamos.
- **Dependências**: nenhuma.

### [integrability-5] Extrair constantes do contrato `fin010` (FIN010_DOC_TIP_INVOICE, FIN010_BORVLDTIPO_PERMUTA, FIN010_TIT_COD_UNICO)

- **Problema**
  > Magic numbers do contrato (`docTip=2`, `borVldTipo=2`, `titCod=1`, `bxaTitCod=1`) repetem em 18+ sites entre `ConexosClient.ts` (1023, 1112, 1114, 1145, 1282-1287, 1319-1320, 1349-1352) e `ReconciliacaoPermutaService.ts` (227, 264, 285, 365, 371, 377, 391, 438). `docTip=2` e `borVldTipo=2` são valores DISTINTOS com o mesmo número — exatamente a coincidência que ocultou o bug `DELETE /fin010/baixas/{borCod}/{docTip}/...`.

- **Melhoria Proposta**
  > Criar `src/backend/domain/client/permutas/fin010Constants.ts` exportando: `FIN010_DOC_TIP_INVOICE = 2`, `FIN010_BORVLDTIPO_PERMUTA = 2`, `FIN010_TIT_COD_UNICO = 1`, `FIN010_BXATIT_COD_UNICO = 1`, `FIN010_BXAVLD_SISTEMA = 0`, `FIN010_BXAVLD_CORRENTE_DC = 1`, `FIN010_FRONT_MODEL_BAIXA = 'baixa'`, `FIN010_FRONT_MODEL_BORDERO = 'bordero'`. Substituir TODOS os literais.

- **Resultado Esperado**
  > Cada discriminante nomeado uma vez; quando o Conexos adicionar `docTip=3` (NF) ou parcelamento (`titCod>1`), a mudança é tipada (`Fin010DocTip = 2 | 3`) e o compilador acusa todos os call sites.

- **Tactic alvo**: Encapsulate · Adhere to Standards
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-5, F-integrability-2
- **Métricas de sucesso**:
  - Literais inline do contrato: 18+ → 0
  - Constantes nomeadas exportadas: 1 (`CONTA_GER_JUROS`) → ≥ 8
  - Bugs futuros do tipo "alias numérico" (docTip≡filCod≡2): bloqueados por tipo nominal
- **Risco de não fazer**: O contrato vai crescer (SISPAG `com298` write reusa pattern); copy-paste vai propagar a ambiguidade.
- **Dependências**: nenhuma (refactor mecânico, coberto pelos testes existentes de gravação).

### [integrability-6] Adicionar fixture-based test para os métodos `fin010` destrutivos

- **Problema**
  > Apenas 5/12 métodos `fin010` têm teste com fixture wire-shape (`ConexosClient.test.ts:1345-1490`). Sem cobertura: `atualizarValorLiquido`, `excluirBaixa`, `excluirBordero`, `finalizarBordero`, `cancelarBordero`, `estornarBordero`, `listBaixas`, `listBorderos`, `getBordero`. O bug `docTip-vs-filCod` no path de `excluirBaixa` NÃO seria pego pela suite atual.

- **Melhoria Proposta**
  > Para cada método ausente, um teste mínimo que: (1) afirma o path EXATO (string-equal — pega o bug `docTip` vs `filCod`); (2) afirma o body (presença e valor de chaves discriminantes do contrato — `borVldTipo`, `docTip`, `bxaVldSistema`); (3) afirma o mapeamento da resposta (ex.: `listBaixas` retorna `bxaCodSeq` numérico). Cada teste consome `__fixtures__/fin010/<endpoint>.json`.

- **Resultado Esperado**
  > Cobertura `fin010` 42% → 100%. Mudança de path (renomeio do segundo segmento, troca do verbo HTTP) quebra teste antes de chegar à produção.

- **Tactic alvo**: Contract testing
- **Severidade**: P1
- **Esforço estimado**: M (2–4d — 7 métodos × ~1h de teste cada + fixtures)
- **Findings relacionados**: F-integrability-7, F-integrability-2
- **Métricas de sucesso**:
  - Cobertura de método `fin010` com fixture: 42% → 100%
  - Testes de path-regression: 0 → 11
- **Risco de não fazer**: Próximo refactor do path (motivado por nova filial ou pelo upgrade do Conexos) tem alto risco de regressão.
- **Dependências**: card `integrability-2` (fixtures HAR) pode reaproveitar arquivos.

### [integrability-7] Avaliar trade-off de conta de serviço Conexos N-para-N (compliance vs. complexidade)

- **Problema**
  > Toda escrita no ERP aparece como `CONEXOS_USERNAME` (single login global em `services/conexos.ts:142-197`). O ERP guarda `usnDesNomeCad`/`usnDesNomeFin` único; a identidade real do operador vive só na trilha local (`permuta_alocacao_execucao.executado_por`). Auditoria/compliance exige correlação por timestamp — frágil.

- **Melhoria Proposta**
  > 3 cenários a avaliar com o Yuri + compliance da Columbia: (a) N contas Conexos (1 por operador autorizado) + pool de sessões por `req.user.sub` no `ConexosClient`; (b) header `cnx-actAs` ou similar se o Conexos suportar (verificar com fornecedor); (c) ACEITAR a limitação documentadamente — adicionar um campo ERP `bxaEspComplemento` (já usado no payload) com o `executadoPor` real, prefixando o comentário gerado em `buildComentario` (`ReconciliacaoPermutaService.ts:404-427`). Decisão escalável escolhida → ADR.

- **Resultado Esperado**
  > Identidade do operador rastreável no próprio ERP, sem depender só da trilha local. Auditor externo conseguiria responder "quem gravou o `bxaCodSeq=X`?" só com o ERP.

- **Tactic alvo**: Manage Resources · Discover Service
- **Severidade**: P1
- **Esforço estimado**: M-L (depende do cenário escolhido — entrevista + decisão precede esforço)
- **Findings relacionados**: F-integrability-6
- **Métricas de sucesso**:
  - Identidade do operador refletida no ERP: 0% → 100% (na opção a/b) ou documentada explicitamente como aceita (opção c)
- **Risco de não fazer**: Próximo audit financeiro provavelmente vai exigir isso. SOX-like / Receita Federal pede matriz de responsabilidades.
- **Dependências**: entrevista com Yuri + compliance + suporte Conexos para confirmar feature de `actAs`.

## 6. Notas do agente

- Cross-QA: F-integrability-1 (Zod no envelope) é a MESMA evidência que será citada por **Fault Tolerance** (drift silencioso = `markSettled` com dados torcidos) e por **Security** (validate input). Consolidator: pode emitir UM card único compartilhado entre os 3 QAs ou marcar cross-ref.
- Cross-QA: F-integrability-5 (magic numbers) toca **Modifiability** (Bass: Generalize Module / Maintain Semantic Coherence). O card `integrability-5` resolve ambos.
- Cross-QA: F-integrability-6 (single service account) toca **Security** (audit-trail) e **Availability** (single point of session contention — F-availability-2 já citada).
- Métrica não medida: rate real de drift do `fin010` em 12 meses. Sem CI probe (card `integrability-2`) é palpite; assumi alto baseado em "ERP brasileiro sem changelog público".
- Decisão de escopo: ignorei o write side de `com298` (SISPAG frente II — ainda não existe no código deployado, apesar de modelado na ontologia) — foco foi a Fase 3.1 já mergeada.
