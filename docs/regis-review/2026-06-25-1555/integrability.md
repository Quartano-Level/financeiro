---
qa: Integrability
qa_slug: integrability
run_id: 2026-06-25-1555
agent: qa-integrability
generated_at: 2026-06-25T15:55:00-03:00
scope: backend,frontend
score: 8
findings_count: 4
cards_count: 4
---

# Integrability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Time de produto | Pedido para adicionar um novo relatório (ex.: `aging-detalhado`) ao painel | `RelatorioExportService` + rota `GET /permutas/relatorios/:tipo` + `RELATORIOS_DISPONIVEIS` (frontend) | Feature ativa em produção (Render/Vercel), READ-ONLY | Adicionar 1 entrada no enum backend + projeção dedicada + 1 entrada gêmea no enum frontend + descritor no menu | ≤ 3 arquivos tocados, sem alterar contrato HTTP existente; 0 regressão nos 6 relatórios existentes |

Cenário secundário (substituir biblioteca xlsx): trocar `exceljs` por outra
implementação (`xlsx`, `excel4node`, etc.) requer mexer **apenas** em
`RelatorioExportService.ts` (1 arquivo, método `serializar`). A definição
(`RelatorioDefinicao`) já isola o vendor.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Arquivos a tocar para adicionar novo `RelatorioTipo` | 3 (`Relatorio.ts` + `RelatorioExportService.ts` + `types.ts`) — opcional: `RELATORIOS_DISPONIVEIS` p/ menu | ≤ 3 | ✅ | inspeção do delta |
| Acoplamento de `exceljs` ao código | 1 arquivo (`RelatorioExportService.ts`) | 1 | ✅ | `grep -rn ExcelJS src/backend` |
| Validação de `:tipo` no boundary HTTP | `isRelatorioTipo` guard (custom, não-Zod) | guard estrito | ✅ | `routes/permutas.ts:376` |
| Duplicação de enum FE/BE (`RelatorioTipo`) | 2 declarações independentes (sem fonte única) | 0 (gerada/compartilhada) ou processo de sincronização | ⚠️ | `interface/permutas/Relatorio.ts:10-19` vs `frontend/lib/types.ts:331-337` |
| Centralização do fetch no FE | Único call-site dentro de `lib/api.ts` (`exportarRelatorio`) | wrapper único | ✅ | `frontend/lib/api.ts:429` |
| Reuso vs duplicação da leitura (`/gestao` vs export) | Reuso direto de `GestaoPermutasService.exporGestao()` (1 chamada, mesma projeção raiz) | reuso | ✅ | `RelatorioExportService.ts:51` |
| Schema/contract test de response HTTP (status, headers, body) | 3 casos (200/400/401) na rota — sem fixture xlsx assertada além de smoke `wb.xlsx.load` | ≥ 1 fixture + 1 boundary negativo | ✅ | `routes/permutas.test.ts` + `RelatorioExportService.test.ts:240-249` |
| Versionamento do endpoint (`/v1/`) | ausente (sem prefixo de versão na URL) | versão semântica explícita quando o consumidor for externo | ⚠️ | `routes/permutas.ts:372` |
| Observabilidade da integração (log estruturado por export) | `logService.info` com `tipo`, `requestId`, `linhas` | log por tipo | ✅ | `RelatorioExportService.ts:55-59` |

> ⚠️ **Não medível localmente**: tempo médio de geração do xlsx em payloads
> reais de produção (depende do volume de `pendentes`/`invoices`). Requer
> Render logs / instrumentação em produção (histograma de duração por `tipo`).

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Encapsulate | `RelatorioExportService` esconde `exceljs` por completo; `RelatorioDefinicao` é a fronteira testável independente de vendor. | ✅ | `RelatorioExportService.ts:382-396` |
| Use an Intermediary | Service intermediário entre a rota HTTP e `GestaoPermutasService`/`exceljs`. A rota não conhece o vendor xlsx. | ✅ | `routes/permutas.ts:380-384` |
| Restrict Communication Paths | Frontend chama o backend exclusivamente via `lib/api.ts:exportarRelatorio`; backend chama `exceljs` exclusivamente via `RelatorioExportService.serializar`. | ✅ | `frontend/lib/api.ts:429`; `RelatorioExportService.ts:382` |
| Adhere to Standards | `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` correto; `Content-Disposition: attachment; filename="..."` padrão RFC 6266 (forma simples, sem `filename*`). | ✅ parcial | `routes/permutas.ts:382-383` |
| Abstract Common Services | `montarDefinicao` separada de `serializar`: novo formato (CSV, ODS) reusaria a definição sem retocar projeções. | ✅ | `RelatorioExportService.ts:64-91, 382-396` |
| Discover Service | N/A — endpoint estático sob a mesma origem do `lib/api.ts:API`. | N/A | — |
| Tailor Interface | `RelatorioDescritor` (label + descricao + tipo) adapta o enum técnico para o menu UX; `nomeArquivo` formata sufixo por data. | ✅ | `frontend/lib/types.ts:340-378`; `RelatorioExportService.ts:376-379` |
| Configure Behavior | Enum + `TITULO_POR_TIPO` + projeção por `case` no `switch` em `montarDefinicao` — adicionar tipo é 1 case + 1 método. | ✅ | `RelatorioExportService.ts:23-30, 69-90` |
| Manage Resources | Buffer 100% em memória — não há throttle/limit para payloads gigantes; aceitável agora (snapshot do `/gestao`) mas vira P2 se o universo crescer. | ⚠️ parcial | `RelatorioExportService.ts:382-396` |
| Orchestrate | Linear: rota → `RelatorioExportService.exportar` → `GestaoPermutasService.exporGestao` + `serializar`. Sem fan-out/coordination cross-service. | ✅ | `RelatorioExportService.ts:47-61` |
| Manage Resource Coupling | Reusa a leitura raiz (`exporGestao`) — substituir o source raiz propaga automaticamente; substituir `exceljs` é mudança local. | ✅ | `RelatorioExportService.ts:51` |
| Contract Testing | 3 casos de rota (200 happy, 400 tipo inválido, 401 unauth) + smoke test que reabre o buffer xlsx — basta para um endpoint READ-ONLY interno. | ✅ | `routes/permutas.test.ts` (+~55 LOC); `RelatorioExportService.test.ts:240-264` |
| Versioning Strategy | Sem `/v1/` na URL nem header `api-version`. Aceitável enquanto FE+BE são mesmo monorepo (lockstep), mas vira débito se a feature for exposta a 3rd parties. | ⚠️ | `routes/permutas.ts:372` |
| Backward-Compatibility Shims | Remover/renomear um `RelatorioTipo` é breaking change para o FE; não há shim. Aceitável dado o lockstep do monorepo. | ⚠️ N/A defensável | enum em 2 lugares |
| Observability of Integration Failures | `logService.info` no sucesso (com `tipo` + `requestId` + nº linhas). Falha cai no `asyncHandler` → log de erro genérico, sem métrica por `tipo`/duração. | ⚠️ parcial | `RelatorioExportService.ts:55-59` |

## 4. Findings (achados)

### F-integrability-1: Enum `RelatorioTipo` duplicado entre FE e BE (drift risk)

- **Severidade**: P2
- **Tactic violada**: Adhere to Standards / Backward-Compatibility Shims
- **Localização**: `src/backend/domain/interface/permutas/Relatorio.ts:10-19` e `src/frontend/lib/types.ts:331-337`
- **Evidência (objetiva)**:
  ```
  backend  : RELATORIO_TIPOS = ['adiantamentos','invoices','ja-permutado','bloqueadas','reconciliacao-processo','clientes'] as const
  frontend : type RelatorioTipo = 'adiantamentos' | 'invoices' | 'ja-permutado' | 'bloqueadas' | 'reconciliacao-processo' | 'clientes'
  ```
  Duas declarações independentes — não há tipo gerado nem teste que falhe se uma divergir.
- **Impacto técnico**: adicionar/remover um `tipo` em só um dos lados quebra silenciosamente o menu (FE manda `tipo` inexistente → 400) ou orfana opções (BE oferece `tipo` que o menu não lista).
- **Impacto de negócio**: bug invisível em refactor — usuário clica "Exportar X" e recebe "invalid report type" sem causa óbvia.
- **Métrica de baseline**: 2 fontes da verdade · 0 testes cross-package.

### F-integrability-2: Endpoint sem versionamento explícito (`/v1/`)

- **Severidade**: P3
- **Tactic violada**: Versioning Strategy
- **Localização**: `src/backend/routes/permutas.ts:372`
- **Evidência (objetiva)**:
  ```
  router.get('/relatorios/:tipo', asyncHandler(async (req, res) => { ... }))
  ```
  URL final: `GET /permutas/relatorios/:tipo` (sem prefixo de versão).
- **Impacto técnico**: se algum dia o relatório for exposto a script externo / planilha de BI / outro tenant, qualquer mudança de schema é breaking change sem caminho de transição.
- **Impacto de negócio**: aceitável enquanto FE+BE são lockstep no mesmo monorepo (Render+Vercel deployados juntos); vira débito quando a feature sair do MVP.
- **Métrica de baseline**: 0% das rotas `/permutas/*` carregam prefixo de versão.

### F-integrability-3: Sem métrica/log de falha por `tipo` de relatório

- **Severidade**: P2
- **Tactic violada**: Observability of Integration Failures
- **Localização**: `src/backend/domain/service/permutas/RelatorioExportService.ts:55-59`
- **Evidência (objetiva)**:
  ```
  // log info no sucesso — captura tipo + linhas
  await this.logService.info({ type: LOG_TYPE.BUSINESS_INFO, message: 'permuta relatorio exportado', ... });
  // erro: cai no asyncHandler genérico, sem dimensão por `tipo`
  ```
  Não há `logService.error` específico capturando `{ tipo, requestId, etapa }` quando `exceljs` ou `exporGestao` quebram dentro de `exportar`.
- **Impacto técnico**: se `reconciliacao-processo` falhar em 100% dos casos e `adiantamentos` continuar saudável, o log agregado não distingue.
- **Impacto de negócio**: MTTR maior em incidentes de export; analista vê só "falhou" e tem que reproduzir manualmente para descobrir o `tipo` causador.
- **Métrica de baseline**: 1 log de sucesso por export · 0 logs de falha dimensionados por `tipo` · 0 contadores `exports_total{tipo,status}`.

### F-integrability-4: Buffer xlsx 100% em memória sem limite (Manage Resources parcial)

- **Severidade**: P3
- **Tactic violada**: Manage Resources
- **Localização**: `src/backend/domain/service/permutas/RelatorioExportService.ts:382-396`
- **Evidência (objetiva)**:
  ```
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
  ```
  `exceljs` materializa o workbook inteiro em RAM antes de devolver o buffer; rota faz `res.send(buffer)` sem streaming. Hoje o snapshot do `/gestao` é pequeno o suficiente, mas não há guard.
- **Impacto técnico**: se o universo de pendentes/invoices crescer >10× (anos de histórico), o Lambda/Render-instance pode estourar memória sob carga concorrente (múltiplos exports simultâneos).
- **Impacto de negócio**: degradação silenciosa em produção (OOM) — risco baixo enquanto o volume for o atual.
- **Métrica de baseline**: 0 limite de linhas declarado · 0 streaming · 0 alerta de memória dimensionado por export.

> Cross-QA: F-integrability-4 sobrepõe-se a **Performance** e **Fault Tolerance** — sinalizar ao consolidator.

## 5. Cards Kanban

### [integrability-1] Unificar `RelatorioTipo` em uma fonte única FE↔BE

- **Problema**
  > O enum `RelatorioTipo` existe duas vezes: em `backend/domain/interface/permutas/Relatorio.ts:10-19` (array `as const`) e em `frontend/lib/types.ts:331-337` (union literal). Não há mecanismo que garanta paridade — adicionar/renomear/remover um tipo só em um dos lados quebra o export silenciosamente (FE manda `tipo` inexistente → 400, ou BE expõe `tipo` invisível no menu).

- **Melhoria Proposta**
  > Aplicar a tactic **Adhere to Standards**: ou (a) extrair `RelatorioTipo` para um package compartilhado (`packages/shared-types`), ou (b) gerar o tipo TS do FE a partir do enum BE (script em `scripts/`), ou (c) adicionar 1 teste de paridade que importe ambos arquivos (via path relativo) e compare arrays — escolha mais barata dado o monorepo. Documentar a decisão num comentário no arquivo do FE apontando para a fonte da verdade.

- **Resultado Esperado**
  > Drift impossível silenciosamente: PR que adicionar `tipo` em só um lado falha no CI. Métrica: 1 fonte da verdade · 1 teste de paridade verde.

- **Tactic alvo**: Adhere to Standards / Backward-Compatibility Shims
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-1
- **Métricas de sucesso**:
  - Fontes da verdade para `RelatorioTipo`: 2 → 1 (ou 2 + 1 teste de paridade)
  - Cenário de regressão (adicionar `tipo` em só um lado): falha silenciosa → erro de build/teste
- **Risco de não fazer**: bug intermitente após cada refactor de menu; tempo de debug desproporcional ao escopo do bug.
- **Dependências**: nenhuma.

### [integrability-2] Adicionar log estruturado de falha por `tipo` no `RelatorioExportService`

- **Problema**
  > `RelatorioExportService.exportar` loga **sucesso** com `{ tipo, requestId, linhas }`, mas falhas caem no `asyncHandler` genérico da rota — perdendo a dimensão `tipo`. Em incidente, é impossível dizer rapidamente "`reconciliacao-processo` está quebrando há 1h, mas `adiantamentos` está OK" sem reproduzir manualmente.

- **Melhoria Proposta**
  > Aplicar a tactic **Observability of Integration Failures**: envolver `gestaoService.exporGestao` + `serializar` em try/catch e emitir `logService.error({ tipo, requestId, etapa: 'exporGestao'|'serializar' })` antes de re-lançar. Manter o `asyncHandler` como rede de segurança. Quando houver métricas em produção, expor contador `exports_total{tipo,status}`.

- **Resultado Esperado**
  > Logs dimensionados permitem alertar por `tipo` (ex.: alerta se taxa de erro de `clientes` > 5% em 15min). Métrica: 0 → 1 log de erro estruturado por export quebrado.

- **Tactic alvo**: Observability of Integration Failures
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-3
- **Métricas de sucesso**:
  - Logs de erro com `tipo` dimensionado: 0 → 100% das falhas no service
  - MTTR estimado em incidente por `tipo`: desconhecido → mensurável via filtro de log
- **Risco de não fazer**: cegueira de operação quando 1 relatório quebra e os outros não.
- **Dependências**: nenhuma.

### [integrability-3] Versionar a rota de relatórios (`/v1/permutas/relatorios/:tipo`) antes de expor a 3rd parties

- **Problema**
  > A rota `GET /permutas/relatorios/:tipo` não carrega prefixo de versão (`/v1/`) nem header `api-version`. Hoje é aceitável (FE+BE lockstep no monorepo), mas qualquer expansão para consumo externo (script Power BI, planilha do cliente, Make/Zapier) congela o schema atual sem caminho de evolução.

- **Melhoria Proposta**
  > Aplicar a tactic **Versioning Strategy**: definir convenção (`/api/v1/...` ou header `X-Api-Version`) **na próxima feature** que expuser uma rota a fora-do-monorepo. Para esta feature, registrar a decisão no ADR (a rota atual fica como v0/interna).

- **Resultado Esperado**
  > Política explícita de versionamento documentada. Métrica: 0% → 100% das rotas externas com versão.

- **Tactic alvo**: Versioning Strategy
- **Severidade**: P3
- **Esforço estimado**: S (≤1d) (decisão + ADR; implementação ocorre na primeira rota externa)
- **Findings relacionados**: F-integrability-2
- **Métricas de sucesso**:
  - ADR de versionamento de API publicado
  - Convenção `/v1/` aplicada a 100% das rotas com consumidor não-monorepo (alvo futuro)
- **Risco de não fazer**: breaking change forçado em integração externa quando o primeiro consumidor 3rd-party aparecer.
- **Dependências**: alinhar com qa-modifiability (mesma decisão alimenta a evolução de schema).

### [integrability-4] Definir limite de tamanho (linhas/bytes) para export xlsx

- **Problema**
  > O export materializa o workbook inteiro em memória via `workbook.xlsx.writeBuffer()` e responde com `res.send(buffer)` — sem streaming nem teto. Hoje o universo do `/gestao` é pequeno, mas se o histórico crescer (>50k linhas) ou múltiplos exports rodarem concorrentes, há risco de OOM no host (Render hoje, Lambda no alvo).

- **Melhoria Proposta**
  > Aplicar a tactic **Manage Resources**: (a) limitar `definicao.linhas.length` por tipo (constante `MAX_LINHAS_EXPORT`) com 413/422 se exceder, e/ou (b) trocar `writeBuffer()` por `write(stream)` quando o tamanho passar de um teto. Documentar o limite no ADR e na descrição do menu.

- **Resultado Esperado**
  > Export degrada graciosamente (erro com mensagem clara) em vez de derrubar o host. Métrica: 0 → 1 limite explícito; 0 → 1 alerta de memória dimensionado por export.

- **Tactic alvo**: Manage Resources
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-integrability-4
- **Métricas de sucesso**:
  - Limite máximo de linhas por export: ∞ → constante explícita (ex.: 100k)
  - Resposta a payload acima do limite: OOM silencioso → 413/422 com mensagem
- **Risco de não fazer**: incidente de produção difícil de reproduzir quando o universo crescer (OOM em host compartilhado).
- **Dependências**: alinhar com qa-performance (mesma evidência alimenta o card de carga).

## 6. Notas do agente

- Escopo --quick: avaliei apenas o delta da feature `relatorios-export`. Não auditei `ConexosClient`/`PostgreeDatabaseClient` nem a "shape" geral de clients do repo.
- Pontos fortes (worth registering com o consolidator): reuso 1:1 da leitura raiz (`exporGestao`) — substituir source propaga sem retoque; `exceljs` 100% encapsulado em 1 arquivo (troca de vendor é mudança local); separação `montarDefinicao` vs `serializar` permite testar projeção sem ler bytes xlsx.
- Cross-QA detectados: **F-integrability-1** (drift FE/BE) sobrepõe a **qa-modifiability** (mesma raiz: 2 fontes da verdade). **F-integrability-4** (sem limite de bytes) sobrepõe a **qa-performance** e **qa-fault-tolerance** — mesma evidência, três ângulos.
- Métricas não medidas: tempo médio de geração do xlsx em payload real (requer prod logs).
