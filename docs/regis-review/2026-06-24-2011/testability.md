---
qa: Testability
qa_slug: testability
run_id: 2026-06-24-2011
agent: qa-testability
generated_at: 2026-06-24T20:11:00-03:00
scope: all
score: 6
findings_count: 8
cards_count: 7
---

# Testability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Dev/CI (alguém roda `npm test`) | Mudança em regra de permuta (ex.: nova reclassificação "ultrapassa-invoice"; auto-alocação no Baixar) | Service layer permutas (`AlocacaoPermutasService`, `GestaoPermutasService`, `BorderoGestaoService`, `IngestaoPermutasService`) + rotas Express | Workstation/CI sem ERP real (Conexos mockado) | Suite verde decide se a regra está correta antes do PR; um gap de teste → bug financeiro em produção sem rede de proteção | Cobertura por método público crítico ≥ 1 caso happy + ≥ 1 caso de erro/edge; tempo p/ rodar a suite `permutas` ≤ 30s; zero leak de estado entre testes |

> Especificamente para esta PR (v0.7.0 — feature Permutas): mudanças que mexem em saldo (`AlocacaoPermutasService.autoAlocarDeCasamento/SeElegivel`), em reclassificação de invoice (`GestaoPermutasService` rule "ultrapassa-invoice"), em estado vivo do borderô (`statusPorAdiantamento`, cache), **devem** ter teste explícito porque cada uma delas é um caminho que executa `fin010` (escrita financeira no ERP).

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| **Cobertura por camada do delta — testes do delta vs métodos novos/alterados (BE)** | services: ~75% (12 services tocados, 9 com testes novos/atualizados — `EleicaoPermutasService.test` recebeu só +1 LOC mas 21 it; `Alocacao.autoAlocar*` 0; `Gestao.autoElegivel` 0; `Ingestao.todasInvoices` 0; rota `/borderos*` 0); repositories: ~30% (`PermutaExecucaoRepository.ts` +101 LOC com 8 métodos novos — `listBorderoCache`, `replaceBorderoCache`, `updateBorderoCacheSituacao`, `deleteBorderoCache`, `listComBordero`, `listByBorCod`, `countByBorCod`, `findByBorCodInvoice` — todos sem teste direto, exercitados só via mock no service); client: 100% (`ConexosClient.listInvoicesFinalizadas` +1 caso); rotas: 0% (9 novos endpoints `/borderos*` + `/status` sem teste) | services ≥ 90% / repos ≥ 80% / rotas ≥ 50% (cada rota nova ≥ 1 happy + 1 401/403) | ⚠️ | `git diff main...HEAD --stat` + `grep autoAlocar\|autoElegivel\|listBorderoCache\|/borderos /tests` |
| Backend total — test files / suites / testes ✅ (baseline) | 186 / 42 / 447 ✅ | n/a (sinal de saúde) | ✅ | `_shared-metrics.md` |
| Frontend total — test files / testes ✅ (baseline) | 196 / 51 ✅ | n/a | ✅ | `_shared-metrics.md` |
| `it()` em `BorderoGestaoService.test.ts` (cobertura do maior service tocado) | 23 it · 421 LOC · cobre `listarBorderos` (cache + live + erro best-effort), `statusPorAdiantamento` (4 casos), `listarBaixasErp`, `excluirBaixa` (3 casos), `excluirBordero`, `removerDaTrilha` (FORBIDDEN), guards de autorização, finalizar/cancelar/estornar (1 caso happy cada) | manter (≥1 caso por método público + branches) | ✅ | `grep -c '^\s*it(' BorderoGestaoService.test.ts` |
| `it()` em `GestaoPermutasService.test.ts` | 18 it · 629 LOC · cobre `tipoPermuta` (simples/multiplas/cross-over/cross-process), reclassificação ultrapassa-invoice, candidatas, alocações, detalhe | adicionar `autoElegivel` + síntese `autoCasamentos` (regra 2026-06-24) | ⚠️ | `grep -c '^\s*it(' GestaoPermutasService.test.ts` + `grep autoElegivel ...test.ts` (0) |
| `it()` em `AlocacaoPermutasService.test.ts` | 8 it · 248 LOC · cobre `buscarInvoices` (2 casos), `alocar` (5 casos: happy + 4 invariantes), MAS NÃO cobre `autoAlocarSeElegivel` nem `autoAlocarDeCasamento` (lógica nova de auto-aloc no Baixar) | adicionar 2 describe (`autoAlocarSeElegivel`: elegível múltipla, não elegível cross-over, já-alocado idempotente, sem D.I; `autoAlocarDeCasamento`: cria do casamento, idempotente, sem casamento → false) — ≥ 6 it adicionais | ❌ | `grep autoAlocar AlocacaoPermutasService.test.ts` (0 it) |
| `it()` em `ConexosClient.test.ts` | 81 it · 1628 LOC (gigante — está no limite de "testar coisa grande demais") · cobre `listInvoicesFinalizadas` (1 caso happy) | adicionar paginação + capHit p/ `listInvoicesFinalizadas` (mesma família do `listAdiantamentosProforma`) | ⚠️ | `grep listInvoicesFinalizadas ConexosClient.test.ts` |
| `it()` em `IngestaoPermutasService.test.ts` | 10 it · 517 LOC · cobre persist/casamento/sweep MAS `toInvoiceRows(todasInvoices)` (join novo c/ universo completo de invoices finalizadas) não tem assertion sobre o caminho "invoice sem adto casado entra na lista com importador" | adicionar 2 it: (a) invoice avulsa de `todasInvoices` aparece na `upsertInvoices` sem sobrescrever a casada; (b) `refreshCache` é chamado best-effort | ❌ | `grep -nE 'todasInvoices\|refreshCache.*toHaveBeen' IngestaoPermutasService.test.ts` (0) |
| `it()` em `PermutaExecucaoRepository.test.ts` (8 métodos novos no `+101 LOC`) | 7 it · 145 LOC · só cobre `beginExecution`, `markSettled`, `markError`, `setBorCod`, `findByIdempotencyKey` — **NÃO cobre** `listBorderoCache`, `replaceBorderoCache` (prune+upsert SQL), `updateBorderoCacheSituacao`, `deleteBorderoCache`, `listComBordero`, `listByBorCod`, `countByBorCod`, `findByBorCodInvoice`, `deleteByBorCodInvoice`, `deleteByBorCod`, `deleteByKey`, `renameKey`, `setRequestPayload` | ≥ 1 it por método (foco em SQL parametrizado + ordenação + prune do `replaceBorderoCache`) — alvo ≥ 14 it adicionais | ❌ | `grep -c '^\s*it(' PermutaExecucaoRepository.test.ts` + grep dos métodos no .ts |
| `it()` em `routes/permutas.test.ts` cobrindo `/borderos*` e `/status` | 0 (28 it totais, NENHUM toca os 9 endpoints novos: `GET /borderos[?live]`, `GET /borderos/:b/baixas`, `POST /borderos/:b/{finalizar,cancelar,estornar}`, `DELETE /borderos/:b`, `DELETE /borderos/:b/trilha`, `DELETE /borderos/:b/baixas/:i`, `GET /status`) | ≥ 1 happy + ≥ 1 401/403 + ≥ 1 erro-ERP-traduzido por endpoint mutador → ≥ 12 it adicionais | ❌ | `grep -E 'borderos\|/status\|trilha\|/baixas' routes/permutas.test.ts` (0) |
| FE — testes que tocam `BorderosPanel.tsx` (678 LOC) | 0 (zero test em `*.tsx` p/ a página de permutas ou o painel; só `ui-primitives.test.tsx` de smoke + `alocacao-api.test.ts`/`clientes-filtro-api.test.ts` no nível `lib/api`) | ≥ 3 it: filtros cliente/aba + render de `BorderosPanel` (com mock de `fetchBorderos`) + ação "Aprovar" dispara `finalizarBordero` + `invalidarBorderosMemo` | ❌ | `find src/frontend -name 'BorderosPanel*test*'` (vazio) |
| FE — testes p/ as 10 novas funções `lib/api.ts` (`fetchBorderos`, `excluirBaixaBordero`, `excluirBorderoInteiro`, `liberarBorderoDaTrilha`, `finalizarBordero`, `cancelarBordero`, `estornarBordero`, `fetchBaixasErp`, `fetchPermutaStatus`, `invalidarBorderosMemo`) | 0 (existem testes só p/ `clientes-filtro-api` e `alocacao-api`) | ≥ 1 it por função; foco em `invalidarBorderosMemo` + memo TTL (`Date.now` mockado) | ❌ | `grep fetchBorderos\|fetchPermutaStatus src/frontend/__tests__/*.ts` (0) |
| FE — `MoneyInput` / `maskBrl` (page.tsx:290-330) | 0 (só `lib/utils.test.ts` cobre `progressoPagamento`/`formatDate`; `MoneyInput` e `maskBrl` são util com regra contábil — vão direto p/ rascunho de alocação) | ≥ 4 it com property-based (`fast-check` opcional): qualquer input → idempotente; centavos consistentes; `numToMask(maskBrl(x))` round-trip | ❌ | `grep MoneyInput\|maskBrl src/frontend/lib/utils.test.ts` (0) |
| FE — `confirmarProcessamento` (page.tsx:702) | 0 (caminho que decide processar/marcar status — toca rota POST `/processar`) | ≥ 1 it com `fetch` mockado | ⚠️ | `grep confirmarProcessamento src/frontend/__tests__` (0) |
| Não-determinismo no source FE (`new Date()` em `page.tsx`) | 1 ocorrência (`page.tsx:840` — `new Date().toISOString().slice(0,10)` como default p/ data-base) + memo `borderosMemo` em `lib/api.ts:272-285` (Date.now) | 0 reads diretos; usar `ClockProvider` ou parâmetro injetável p/ default + `jest.useFakeTimers` no teste do memo | ⚠️ | `grep -n 'Date.now\|new Date()' src/frontend/app/permutas/page.tsx src/frontend/lib/api.ts` |
| Não-determinismo no source BE (`new Date()` em `routes/permutas.ts:78`) | 1 (`todayUtcMidnightMs()` default p/ `borDtaMvto` na rota `/reconciliar`) | injetável via `ClockProvider` (Modifiability cross) | ⚠️ | `grep 'new Date()' src/backend/routes/permutas.ts` |
| `jest.useFakeTimers()` em qualquer test BE/FE | 0 | ≥ 1 (no teste do memo de borderôs do `lib/api.ts`) | ❌ | `grep -rln 'useFakeTimers' src/backend/**/*.test.ts src/frontend/**/*.test.{ts,tsx}` (0) |
| Property-based testing (`fast-check`) | 0 (dep NÃO presente — contradiz o briefing; `package.json` BE e FE sem entry) | adotar p/ `maskBrl`/`progressoPagamento`/`AlocacaoPermutasService.alocar` (invariantes de soma) — opcional P3 | ❌ | `grep fast-check src/{backend,frontend}/package.json` (0) |
| Maior test file BE (sinal de service tangled) | `ConexosClient.test.ts` 1628 LOC / 81 it; depois `EleicaoPermutasService.test.ts` 909 LOC / 21 it | nada >1000 LOC; quebrar `ConexosClient.test` em arquivos por feature (titulos, baixas, declaracao, etc.) | ⚠️ | `wc -l src/backend/domain/**/*.test.ts \| sort -rn \| head -5` |
| CI roda `npm test` antes do merge | ✅ (workflow `.github/workflows/`; lint+typecheck+test gate) | manter | ✅ | `grep -r 'npm test' .github/workflows` |

> ⚠️ **Não medível localmente — cobertura % real (lines/branches/functions)**: o `npm test -- --coverage` não foi executado nesta rodada para preservar o tempo da revisão; as métricas acima são por contagem `it()`+arquivos vs. métodos novos. Recomendação: executar `npm test -- --coverage --silent` no PR e enforcar `coverageThreshold` em `jest.config` (Deployability cross — gate antes do deploy).

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Specialized Interfaces** | `tsyringe` + arrow methods públicos permitem instanciar service direto com mocks (`new AlocacaoPermutasService(mockConexos, ...)`); CLAUDE.md prescreve "test the service layer". Os mocks de Conexos/Repos seguem o padrão `jest.fn().mockResolvedValue(...)` consistente | ✅ presente | `AlocacaoPermutasService.test.ts:99-109`, `BorderoGestaoService.test.ts:22-59` |
| **Recordable Test Cases** | Fixtures de wire-real do Conexos embutidos nos testes (ex.: doc 26471 NÃO pago, doc 24166 pago — `mnyTitAberto`/`mnyTitPermutar` reais probed 2026-06-18) | ✅ presente | `ConexosClient.test.ts:1230-1268`, `EleicaoPermutasService.test.ts:480-600` |
| **Sandbox** | Não existe sandbox de DB nem docker-compose.test.yml; toda interação com Postgres é mockada via `selectFirst/selectMany/update`. Não há teste de integração contra Postgres real. CLAUDE.md menciona `describe('integration:')` como pattern mas não há nenhum no repo | ⚠️ parcial | `find . -name 'docker-compose*'` (vazio); `grep -r "describe.*integration:" src/backend` (vazio) |
| **Executable Assertions** | `LogService.{info,error,warn}` é mockado e os testes verificam o `type` + `data` esperado nas trilhas (FLOW_COMPLETE, BUSINESS_WARN, BUSINESS_INFO) — observabilidade testada | ✅ presente | `EleicaoPermutasService.test.ts:140-156`; `BorderoGestaoService.test.ts:50` |
| **Abstract Data Sources** | Repositórios são interfaces `@injectable()`; mockáveis por construtor. `EnvironmentProvider` abstrai `process.env` — testes substituem (`environmentProvider.getEnvironmentVars.mockResolvedValue({conexosWriteEnabled:false})`) | ✅ presente | `BorderoGestaoService.test.ts:34-38`; `ReconciliacaoPermutaService.test.ts:71-76` |
| **Limit Structural Complexity** | `BorderoGestaoService` (527 LOC) e `GestaoPermutasService` (535 LOC) cresceram nesta PR (+297 e +172 respectivamente) — tamanho ok pelo padrão local mas próximo do limite onde refatorar p/ sub-services facilita teste. `ConexosClient.test.ts` em 1628 LOC é um sinal de service tangled | ⚠️ parcial | `wc -l BorderoGestaoService.ts GestaoPermutasService.ts ConexosClient.test.ts` |
| **Limit Non-Determinism** | `new Date()` cru em 3 lugares novos: `routes/permutas.ts:78` (`todayUtcMidnightMs`), `routes/permutas.ts:430` (`new Date().toISOString()` no payload de `/borderos`), `frontend/app/permutas/page.tsx:840` (default de `dataBase`); + `Date.now()` no memo de borderôs em `lib/api.ts:277,285`. Sem `ClockProvider`. Tornar testes de memo determinísticos exigirá `jest.useFakeTimers` ou refator | ⚠️ parcial (regrediu c/ a feature) | `grep -nE 'Date\.now\(\)\|new Date\(\)' routes/permutas.ts lib/api.ts app/permutas/page.tsx` |

## 4. Findings (achados)

### F-testability-1: `AlocacaoPermutasService.autoAlocarSeElegivel` e `autoAlocarDeCasamento` (escrita financeira automática, regra 2026-06-24) NÃO têm teste direto

- **Severidade**: P0 — toca a invariante financeira de saldo (Σ alocado ≤ saldo do adto × Σ ≤ em-aberto da invoice) E é executado AUTOMATICAMENTE no fluxo do "Baixar" (`ReconciliacaoPermutaService.reconciliar` linha 101-105). Bug aqui = baixa errada no `fin010` sem revisão humana.
- **Tactic violada**: Specialized Interfaces (existe a interface, mas não é exercitada) + Executable Assertions
- **Localização**: `src/backend/domain/service/permutas/AlocacaoPermutasService.ts:300-393` (métodos `autoAlocarSeElegivel` linhas 300-356, `autoAlocarDeCasamento` linhas 364-393); teste atual `src/backend/domain/service/permutas/AlocacaoPermutasService.test.ts:111-248` cobre só `buscarInvoices` (2 it) e `alocar` (5 it + 1 dummy).
- **Evidência (objetiva)**:
  ```
  $ grep -nE 'autoAlocar(Se|De)' src/backend/domain/service/permutas/AlocacaoPermutasService.test.ts
  (vazio — 0 ocorrências)
  $ grep -nE 'autoAlocar(Se|De)' src/backend/domain/service/permutas/ReconciliacaoPermutaService.test.ts
  79:        autoAlocarSeElegivel: jest.fn().mockResolvedValue(false),
  80:        autoAlocarDeCasamento: jest.fn().mockResolvedValue(false),
  (apenas mockados como SEMPRE FALSO — o caminho que CRIA alocações nunca é exercitado)
  ```
- **Impacto técnico**: branches não cobertas: (a) "1 adto cobre todas as invoices do processo (saldoNeg ≥ Σ invoices)" → aloca tudo automaticamente; (b) cross-over com >1 adto → segue manual (early-return); (c) idempotente quando já há alocação; (d) sem D.I → 0 alocações. Cada uma dessas é um caso de regressão financeira possível.
- **Impacto de negócio**: a Columbia Trading lança baixas no ERP. Uma auto-alocação que ultrapasse o saldo da invoice (porque o `cap` falhou silenciosamente) registra ajuste contábil incorreto — retrabalho manual ou, pior, fechamento financeiro errado. Essa é a função que justifica o ADR de auto-aloc no Baixar (2026-06-24).
- **Métrica de baseline**: cobertura nominal `autoAlocarSeElegivel` / `autoAlocarDeCasamento` = 0 / ≥ 6 casos. Há 5 branches descobertas (early-return idempotente, early-return estado≠casamento-manual, early-return cross-over, "saldo cobre" happy, "sem D.I" early-return).

### F-testability-2: `GestaoPermutasService.autoElegivel` (sinaliza múltipla automática) e a síntese `autoCasamentos` (regra 2026-06-24) NÃO têm teste

- **Severidade**: P0 — esse flag governa a APRESENTAÇÃO ("Automáticas" vs "Manuais") E o "Processar" automático na UI. Falso-positivo aqui = a UI sugere ação automática para um caso que precisava de revisão humana.
- **Tactic violada**: Executable Assertions
- **Localização**: `src/backend/domain/service/permutas/GestaoPermutasService.ts:145-164` (síntese `autoCasamentos`), `:322-335` (cálculo `autoElegivel` com tolerância USD ±1); `GestaoPermutasService.test.ts` (629 LOC, 18 it) sem nenhuma asserção sobre `autoElegivel` ou casamentos sintéticos.
- **Evidência (objetiva)**:
  ```
  $ grep -n autoElegivel src/backend/domain/service/permutas/GestaoPermutasService.test.ts
  (vazio)
  $ grep -n autoCasamentos src/backend/domain/service/permutas/GestaoPermutasService.test.ts
  (vazio)
  $ grep -nc autoElegivel src/backend/domain/service/permutas/GestaoPermutasService.ts
  3   # source-side: 3 ocorrências (cálculo + payload + filtragem de autoCasamentos)
  ```
- **Impacto técnico**: 4 branches descobertas: (a) múltipla c/ saldo ≥ Σ → autoElegivel:true (caso novo "Processar" 1-click); (b) múltipla c/ saldo < Σ → undefined (segue manual); (c) cross-over nunca é autoElegível (mesmo c/ saldo); (d) reclassificado-ultrapassa-invoice nunca é autoElegível.
- **Impacto de negócio**: a aba "Automáticas" passa a mostrar casos que NÃO são automáticos (ou esconde casos que são) — analista perde confiança e cai no Excel paralelo, que é o problema-raiz que a feature resolve.
- **Métrica de baseline**: cobertura `autoElegivel` = 0 / 4 branches; cobertura `autoCasamentos` synthesis = 0 / 2 (invoice única, múltiplas invoices do processo).

### F-testability-3: `PermutaExecucaoRepository` — 8 métodos novos do cache de borderôs sem teste direto, incluindo SQL com prune (`DELETE WHERE NOT IN`) sensível

- **Severidade**: P1 — `replaceBorderoCache` faz um INSERT…ON CONFLICT DO UPDATE seguido de um `DELETE FROM permuta_bordero WHERE bor_cod NOT IN (...)` sintetizado com placeholders dinâmicos `$bor_0, $bor_1, …`. SQL parametrizado correto, mas a construção do `IN (...)` é um vetor histórico de bug (pareceres da PR security já marcaram cache como invariante crítica). Sem teste de unidade.
- **Tactic violada**: Specialized Interfaces (existe seam, não é exercitado) + Limit Non-Determinism (ordem de chaves no `params`)
- **Localização**: `src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts:305-389` (métodos `listBorderoCache`, `replaceBorderoCache`, `updateBorderoCacheSituacao`, `deleteBorderoCache`) + `:93-172` (`listComBordero`, `findByBorCodInvoice`, `deleteByBorCodInvoice`, `listByBorCod`, `countByBorCod`, `deleteByBorCod`, `deleteByKey`, `renameKey`, `setRequestPayload`). Teste atual `PermutaExecucaoRepository.test.ts` (145 LOC, 7 it) cobre `beginExecution`, `markSettled`, `markError`, `setBorCod`, `findByIdempotencyKey` apenas.
- **Evidência (objetiva)**:
  ```
  $ grep -c '^\s*it(' src/backend/domain/repository/permutas/PermutaExecucaoRepository.test.ts
  7
  $ grep -nE '^    public (list|replace|update|delete|count|find|rename|set)' src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts | wc -l
  18    # 18 métodos públicos — só 5 testados
  ```
- **Impacto técnico**: bug silencioso em `replaceBorderoCache` (ex.: prune apaga TUDO porque o `inList` ficou vazio) → tela de borderôs vazia; bug em `countByBorCod` (cast `Number(string)`) → falsa "última baixa", o que dispara `excluirBordero` no ERP sem haver baixa.
- **Impacto de negócio**: cache local de borderôs é a fonte de leitura da gestão de borderôs (Fase 3.1) — se zera/inconsistente, a tela perde dado real e o analista não consegue aprovar/excluir.
- **Métrica de baseline**: 5/18 métodos com teste (≈28%); SQL mais sensível (`replaceBorderoCache` prune) sem teste.

### F-testability-4: 9 endpoints novos em `routes/permutas.ts` + tradutor de erro do ERP — zero teste de rota

- **Severidade**: P1 — toda autorização (`requireRole('admin')`, FORBIDDEN do BorderoGestaoService → 403, demais erros → 400 com mensagem traduzida) só funciona se passar pelo route layer. Sem teste, é fácil regredir (ex.: esquecer `requireRole`, mudar status code, perder a tradução do `FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO`).
- **Tactic violada**: Executable Assertions
- **Localização**: `src/backend/routes/permutas.ts:421-595` (9 endpoints: `GET /borderos[?live]`, `GET /borderos/:b/baixas`, `POST /borderos/:b/finalizar|cancelar|estornar`, `DELETE /borderos/:b`, `DELETE /borderos/:b/trilha`, `DELETE /borderos/:b/baixas/:i`) + `:44-74` (`erpErrorMessage`/`respondActionError`). Teste atual `routes/permutas.test.ts` (694 LOC, 28 it) cobre eleição/ingestão/runs/painel/cliente-filtro/alocação/gestão/processar/RBAC, NADA de borderôs nem `/status`.
- **Evidência (objetiva)**:
  ```
  $ grep -cE 'borderos|/status|trilha|/baixas' src/backend/routes/permutas.test.ts
  0
  $ grep -c '^\s*it(' src/backend/routes/permutas.test.ts
  28
  ```
- **Impacto técnico**: regressão silenciosa em (a) RBAC nas mutações de borderô; (b) tradução PT do erro do ERP (mostra `FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO` cru para o usuário); (c) `FORBIDDEN` → 403 (sem teste, vira 400 numa refactor).
- **Impacto de negócio**: analista vê erro em inglês técnico do Conexos, abre chamado, dev investiga; OU pior, admin consegue mexer em borderô que não é da trilha (confused-deputy — já marcado P0 security na review anterior).
- **Métrica de baseline**: 9 endpoints / 0 testes = 0%.

### F-testability-5: FE — `BorderosPanel.tsx` (678 LOC, 100% novo) + 10 funções `lib/api.ts` novas sem teste; `MoneyInput`/`maskBrl` (regra contábil) também sem teste

- **Severidade**: P1 — o `BorderosPanel` tem toda a interação de aprovar/excluir/estornar borderô; `maskBrl` faz conversão centavos↔string que vai direto no rascunho de alocação manual. Bug aqui = analista digita 1.000,00 e o backend recebe 100,00.
- **Tactic violada**: Specialized Interfaces (componente direto, não testado)
- **Localização**: `src/frontend/app/permutas/BorderosPanel.tsx:87` (678 LOC); `src/frontend/app/permutas/page.tsx:290-330` (`maskBrl`, `numToMask`, `MoneyInput`); `src/frontend/app/permutas/page.tsx:702` (`confirmarProcessamento`); `src/frontend/lib/api.ts:276-401` (`fetchBorderos`, `invalidarBorderosMemo`, `fetchBaixasErp`, `fetchPermutaStatus`, `excluirBaixaBordero`, `excluirBorderoInteiro`, `liberarBorderoDaTrilha`, `finalizarBordero`, `cancelarBordero`, `estornarBordero`).
- **Evidência (objetiva)**:
  ```
  $ grep -rn "BorderosPanel\|fetchBorderos\|fetchPermutaStatus\|MoneyInput\|maskBrl\|confirmarProcessamento" src/frontend/__tests__ src/frontend/lib/utils.test.ts
  (vazio — 0 ocorrências)
  $ wc -l src/frontend/app/permutas/BorderosPanel.tsx
  678 src/frontend/app/permutas/BorderosPanel.tsx
  ```
- **Impacto técnico**: regressões silenciosas em (a) memo de 30s do `fetchBorderos` (esquece de invalidar após `finalizarBordero` → tela mostra estado velho); (b) `maskBrl(maskBrl(x))` não idempotente (caractere extra escapa); (c) `BorderosPanel` mostra borderô estornado como ativo (filtro errado de `situacao`).
- **Impacto de negócio**: analista usa cache fantasma → toma decisão financeira sobre dado velho de ≤30s. `maskBrl` errado → valor de alocação errado → baixa errada no ERP.
- **Métrica de baseline**: 0/13 superfícies novas FE (BorderosPanel + 10 lib/api + MoneyInput + maskBrl) com teste.

### F-testability-6: Não-determinismo regrediu na PR — `new Date()`/`Date.now()` adicionados no source sem injeção; memo de borderôs em módulo-global

- **Severidade**: P2 — não quebra hoje, mas o memo de `borderosMemo` em `lib/api.ts:272` é estado de módulo mutável compartilhado entre testes. Qualquer teste que chame `fetchBorderos` vai "vazar" para o seguinte. `Date.now()` torna o teste do TTL impossível sem `jest.useFakeTimers`.
- **Tactic violada**: Limit Non-Determinism
- **Localização**:
  - `src/frontend/lib/api.ts:272-273` (módulo-global `borderosMemo` + TTL `30_000`)
  - `src/frontend/lib/api.ts:277, 285` (`Date.now()`)
  - `src/frontend/app/permutas/page.tsx:840` (`new Date().toISOString().slice(0,10)` default)
  - `src/backend/routes/permutas.ts:77-80` (`todayUtcMidnightMs()` lê `new Date()` direto)
  - `src/backend/routes/permutas.ts:430` (`new Date().toISOString()` no payload de `GET /borderos`)
- **Evidência (objetiva)**:
  ```
  $ grep -rn "useFakeTimers\|jest.useFakeTimers" src/backend src/frontend --include="*.test.*"
  (vazio em todo o repo — 0 testes determinizam tempo)
  ```
- **Impacto técnico**: testes do memo de borderôs precisam de `jest.useFakeTimers()` ou refator (parâmetro `now: () => number`); cross-test pollution se duas suites importarem o mesmo módulo.
- **Impacto de negócio**: zero hoje. Vira problema quando alguém escrever o teste do memo e descobrir que precisa hackear.
- **Métrica de baseline**: 5 reads de tempo no source (3 BE + 2 FE) sem abstração; 0 testes com fake-timers.

### F-testability-7: `IngestaoPermutasService.toInvoiceRows(todasInvoices)` (universo completo de invoices finalizadas, regra 2026-06-24) sem assertion

- **Severidade**: P2 — o teste existente (10 it) cobre o fluxo principal (persist + casamento + sweep + cliente-filtro) MAS não cobre o caminho NOVO em que uma invoice de `todasInvoices` (sem adto casado) é adicionada à lista de upsert, e a regra "não sobrescrever a casada" (`byDocCod.has` early-return em `IngestaoPermutasService.ts:331`).
- **Tactic violada**: Executable Assertions
- **Localização**: `src/backend/domain/service/permutas/IngestaoPermutasService.ts:282-352` (`toInvoiceRows`); teste `IngestaoPermutasService.test.ts:10 it` sem caso de `todasInvoices` com invoice avulsa.
- **Evidência (objetiva)**:
  ```
  $ grep -nE 'todasInvoices' src/backend/domain/service/permutas/IngestaoPermutasService.test.ts
  (vazio)
  ```
- **Impacto técnico**: o universo completo de invoices alimenta a busca por cliente do front (`importadorFiltro`). Sem teste, mudar o early-return ou o cliente preferido (linha 313 vs 347) pode esconder/duplicar invoice.
- **Impacto de negócio**: a tela "Permutas Manuais" não acha a invoice esperada (porque a Ingestão a deixou de fora) — bug visível p/ o analista.
- **Métrica de baseline**: 0 it cobrindo o ramo `todasInvoices`.

### F-testability-8: `ConexosClient.test.ts` está em 1628 LOC / 81 it — sinal de service "tangled" demais p/ testar com confiança

- **Severidade**: P3 — o teste roda verde e cobre bem, mas o tamanho deixa caro adicionar/encontrar casos. Já é o maior arquivo de teste do repo.
- **Tactic violada**: Limit Structural Complexity
- **Localização**: `src/backend/domain/client/ConexosClient.test.ts` 1628 LOC; `ConexosClient.ts` cresceu 60 LOC nesta PR (`listInvoicesFinalizadas` + `listBorderos.borCods` + `excluirBordero`/`cancelarBordero`/`estornarBordero`/`finalizarBordero` etc.).
- **Evidência (objetiva)**:
  ```
  $ wc -l src/backend/domain/**/*.test.ts | sort -rn | head -3
  1628 ConexosClient.test.ts
   909 EleicaoPermutasService.test.ts
   694 routes/permutas.test.ts
  ```
- **Impacto técnico**: cada nova feature do Conexos exige caçar onde colocar o teste; risco de descobrir tarde a sobreposição com outro caso.
- **Impacto de negócio**: lento; não bloqueia entrega.
- **Métrica de baseline**: 1628 LOC; alvo < 1000 LOC por arquivo de teste de cliente.

## 5. Cards Kanban

### [testability-1] Cobrir `AlocacaoPermutasService.autoAlocarSeElegivel` e `autoAlocarDeCasamento`

- **Problema**
  > As duas funções de auto-alocação (regra 2026-06-24, escrita financeira automática no Baixar) não têm um único teste direto. O teste do `ReconciliacaoPermutaService` mocka ambas como `false` — o caminho que efetivamente CRIA alocações nunca é exercitado em CI. Bug aqui aciona baixa errada no `fin010` sem revisão humana.

- **Melhoria Proposta**
  > Adicionar bloco `describe('autoAlocarSeElegivel')` e `describe('autoAlocarDeCasamento')` em `src/backend/domain/service/permutas/AlocacaoPermutasService.test.ts`. Reusar os builders `buildConexos`/`buildAlocacaoRepo`/`buildRelational` (Specialized Interfaces). Casos mínimos:
  > 1. `autoAlocarSeElegivel`: (a) múltipla com saldo cobrindo Σ invoices → cria N alocações (uma por invoice); (b) cross-over (>1 adto casamento-manual no priCod) → false; (c) saldo < Σ invoices → false; (d) idempotente (já há alocação) → true sem criar; (e) sem D.I em nenhuma invoice → false.
  > 2. `autoAlocarDeCasamento`: (a) cria do casamento existente; (b) idempotente; (c) sem casamento → false.

- **Resultado Esperado**
  > Cobertura `autoAlocarSeElegivel` 0/5 → 5/5 branches; `autoAlocarDeCasamento` 0/3 → 3/3 branches; suite `permutas` ganha ≥ 8 it.

- **Tactic alvo**: Executable Assertions + Specialized Interfaces
- **Severidade**: P0
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-1
- **Métricas de sucesso**:
  - `grep -c autoAlocar AlocacaoPermutasService.test.ts`: 0 → ≥ 8
  - branches cobertas: 0 → 8
- **Risco de não fazer**: auto-alocação cria baixa errada (saldo ultrapassado, invoice sem D.I, cross-over indevido), descoberto só em produção pelo time financeiro com já-fechamento errado no `fin010`.
- **Dependências**: nenhuma

### [testability-2] Cobrir `GestaoPermutasService.autoElegivel` e a síntese `autoCasamentos`

- **Problema**
  > O flag `autoElegivel` decide se a UI mostra o caso como Automática (com botão "Processar" 1-click) ou Manual (Alocar/Baixar). Não tem teste. A síntese `autoCasamentos` (pré-distribuição adto→invoices p/ a aba Automáticas) também não tem teste — uma vai junto da outra na regra 2026-06-24.

- **Melhoria Proposta**
  > Adicionar 4 it em `GestaoPermutasService.test.ts`: (a) múltipla c/ saldo ≥ Σ invoices → `autoElegivel:true` + `res.casamentos` contém 1 grupo sintético por invoice do processo; (b) múltipla c/ saldo < Σ → `autoElegivel` undefined + nada em `casamentos` (continua manual); (c) cross-over (>1 adto casamento-manual) → nunca `autoElegivel:true`; (d) reclassificado por ultrapassa-invoice (já testado p/ status) NÃO ganha `autoElegivel`.

- **Resultado Esperado**
  > Cobertura `autoElegivel` 0/4 branches → 4/4; cobertura `autoCasamentos synthesis` 0/2 → 2/2; suite ganha 4 it.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P0
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-2
- **Métricas de sucesso**:
  - `grep -c autoElegivel GestaoPermutasService.test.ts`: 0 → ≥ 4
  - branches `autoElegivel` cobertas: 0 → 4
- **Risco de não fazer**: a aba "Automáticas" mostra/esconde casos errados; analista perde confiança e volta ao Excel paralelo — o problema-raiz que a feature resolve.
- **Dependências**: nenhuma

### [testability-3] Cobrir os 13 métodos não-testados de `PermutaExecucaoRepository` (foco: cache de borderôs + prune SQL)

- **Problema**
  > O repositório ganhou +101 LOC nesta PR (8 métodos novos do cache de borderôs + helpers de borderô). Existem 18 métodos públicos no `.ts` e só 5 cobertos por teste direto. O `replaceBorderoCache` faz INSERT…ON CONFLICT seguido de `DELETE … NOT IN (...)` com placeholders dinâmicos — SQL parametrizado correto, mas zero teste prova a forma do prune (vetor de bug clássico).

- **Melhoria Proposta**
  > Adicionar ≥ 14 it em `src/backend/domain/repository/permutas/PermutaExecucaoRepository.test.ts`, no mesmo padrão dos 7 existentes (mock `databaseClient` com `selectFirst/selectMany/update` e asserção `(db.update as jest.Mock).mock.calls[0][0]` contém `'DELETE FROM permuta_bordero WHERE bor_cod NOT IN'`, params têm `$bor_0..$bor_n`). Casos: (1-2) `listBorderoCache` ordering + limit clamp; (3-5) `replaceBorderoCache` upsert + prune + no-op no vazio; (6) `updateBorderoCacheSituacao`; (7) `deleteBorderoCache`; (8) `listComBordero` order/filter; (9-10) `listByBorCod` + `countByBorCod` cast; (11) `findByBorCodInvoice`; (12-13) `deleteByBorCod` + `deleteByBorCodInvoice`; (14) `renameKey` + `deleteByKey`.

- **Resultado Esperado**
  > Cobertura métodos públicos `PermutaExecucaoRepository` 5/18 (≈28%) → 18/18 (100%); SQL do prune coberto explicitamente.

- **Tactic alvo**: Specialized Interfaces + Executable Assertions
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-testability-3
- **Métricas de sucesso**:
  - `grep -c '^\s*it(' PermutaExecucaoRepository.test.ts`: 7 → ≥ 21
  - métodos públicos com teste direto: 5 → 18
- **Risco de não fazer**: prune do cache apaga tudo (lista de borderôs em branco); `countByBorCod` retorna 0 errado → dispara `excluirBordero` no ERP sem haver baixa pendente.
- **Dependências**: nenhuma

### [testability-4] Cobrir os 9 endpoints novos de `routes/permutas.ts` (borderôs + status) + tradutor de erro ERP

- **Problema**
  > 9 endpoints novos foram adicionados nesta PR (`GET /borderos[?live]`, `GET /borderos/:b/baixas`, `POST /borderos/:b/{finalizar,cancelar,estornar}`, `DELETE /borderos/:b`, `DELETE /borderos/:b/trilha`, `DELETE /borderos/:b/baixas/:i`, `GET /status`) e o tradutor `erpErrorMessage`/`respondActionError` (mapeia FIN_014, FORBIDDEN→403). Zero teste de rota. Regressão silenciosa em RBAC, status code, mensagem PT.

- **Melhoria Proposta**
  > Estender `src/backend/routes/permutas.test.ts` (já tem o setup supertest + container override pronto). Para cada endpoint mutador, ≥ 3 it: (a) happy 200 c/ admin; (b) 401 sem auth; (c) 403 não-admin OU FORBIDDEN do service (mock que joga `Error('FORBIDDEN: ...')`). Para os endpoints de escrita ERP, ≥ 1 it que injeta um erro com `cause.response.data.messages[0].message = 'FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO'` e assere que `res.body.error` é a mensagem PT traduzida.

- **Resultado Esperado**
  > Cobertura endpoints `/borderos*` + `/status` 0/9 (0%) → 9/9 (100%); ≥ 12 it adicionais em `routes/permutas.test.ts`.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-testability-4 + F-security-* (RBAC) + F-fault-tolerance-* (tradução de erro)
- **Métricas de sucesso**:
  - `grep -cE '/borderos|/status|trilha|/baixas' routes/permutas.test.ts`: 0 → ≥ 24
  - `grep -c '^\s*it(' routes/permutas.test.ts`: 28 → ≥ 40
- **Risco de não fazer**: admin consegue mexer em borderô que não é da trilha (confused-deputy regressa); usuário vê `FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO` cru em vez da mensagem PT.
- **Dependências**: nenhuma (infra de teste de rota já existe)

### [testability-5] Cobrir o front: `BorderosPanel`, 10 funções `lib/api.ts` novas, `MoneyInput`/`maskBrl`, `confirmarProcessamento`

- **Problema**
  > A PR adicionou 678 LOC em `BorderosPanel.tsx`, ~150 LOC de funções API novas em `lib/api.ts` e os utilitários contábeis `MoneyInput`/`maskBrl` (page.tsx:290-330). Nenhum teste. `maskBrl` errado vira valor errado de alocação manual; memo de 30s de `fetchBorderos` sem invalidação correta vira decisão financeira sobre dado velho.

- **Melhoria Proposta**
  > Criar:
  > 1. `src/frontend/__tests__/borderos-api.test.ts` — Specialized Interfaces sobre `lib/api.ts`. ≥ 10 it (1 por função nova + 1 dedicado ao memo TTL com `jest.useFakeTimers` + `invalidarBorderosMemo`).
  > 2. `src/frontend/__tests__/money-input.test.tsx` — Testing Library. ≥ 4 it para `maskBrl` (`'0'`→`'0,00'`, `'12345'`→`'123,45'`, idempotência `maskBrl(maskBrl(x))===maskBrl(x)`, round-trip `numToMask(parse(maskBrl(x)))`).
  > 3. `src/frontend/__tests__/borderos-panel.test.tsx` — mock `fetchBorderos`/`finalizarBordero`/etc. ≥ 3 it: render com dados, ação Aprovar dispara `finalizarBordero` + `invalidarBorderosMemo`, situação ESTORNADO esconde ações.
  > 4. `src/frontend/__tests__/permutas-processar.test.tsx` — ≥ 1 it para `confirmarProcessamento` (mock fetch, asserção URL+body).

- **Resultado Esperado**
  > Cobertura FE superfícies novas: 0/13 → ≥ 13; FE testes totais 51 → ≥ 69 (+ ~18).

- **Tactic alvo**: Specialized Interfaces + Limit Non-Determinism (memo TTL com fake timers)
- **Severidade**: P1
- **Esforço estimado**: M
- **Findings relacionados**: F-testability-5 + F-testability-6
- **Métricas de sucesso**:
  - `find src/frontend/__tests__ -name 'borderos*'`: 0 → ≥ 2 arquivos
  - testes cobrindo `maskBrl`: 0 → ≥ 4
  - testes cobrindo `fetchBorderos` (inclui memo TTL): 0 → ≥ 2
- **Risco de não fazer**: analista decide sobre cache fantasma de 30s; `maskBrl` regride em refactor e vira valor errado de alocação no ERP.
- **Dependências**: nenhuma (Testing Library e Jest jsdom já configurados)

### [testability-6] Determinizar o tempo: injetar clock no memo de borderôs e nos defaults de data

- **Problema**
  > O memo de 30s de `fetchBorderos` lê `Date.now()` direto e guarda estado em variável de módulo (`borderosMemo`). Em teste, leak entre suites + impossibilidade de simular expiração sem `jest.useFakeTimers`. O backend repete o pattern em `routes/permutas.ts:78` (`todayUtcMidnightMs`) e `:430`. Front em `page.tsx:840`.

- **Melhoria Proposta**
  > Duas opções:
  > 1. (mínima) Adotar `jest.useFakeTimers` nos testes do memo + `beforeEach(() => invalidarBorderosMemo())` para isolar suites.
  > 2. (recomendada — Modifiability cross) Extrair `now: () => number` como parâmetro injetável no módulo do memo e como helper `clockNow()` no BE (resolver via tsyringe; default `Date.now`). Substituível em teste sem mexer no relógio global.

- **Resultado Esperado**
  > 5 reads de tempo no source (3 BE + 2 FE) → 0 leituras diretas (todas via clock injetável); 0 `useFakeTimers` → 1+ teste do TTL determinístico.

- **Tactic alvo**: Limit Non-Determinism (cross-com Modifiability)
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-6
- **Métricas de sucesso**:
  - `grep -nE 'Date\.now\(\)|new Date\(\)' src/backend/routes/permutas.ts src/frontend/lib/api.ts src/frontend/app/permutas/page.tsx`: 5 → 0
  - `grep -rln useFakeTimers src/{backend,frontend}/__tests__`: 0 → ≥ 1
- **Risco de não fazer**: testes do memo serão flakey ou impossíveis; cross-test pollution conforme a suite cresce.
- **Dependências**: pode coordenar com card de Modifiability sobre `ClockProvider`

### [testability-7] Cobrir o caminho `todasInvoices` do `IngestaoPermutasService.toInvoiceRows` (universo completo)

- **Problema**
  > A regra 2026-06-24 estendeu a ingestão para incluir TODAS as invoices finalizadas (mesmo sem adto casado) — base p/ a busca por cliente do front. O `toInvoiceRows` ganhou um segundo loop com early-return "não sobrescrever a casada". Zero asserção sobre esse ramo.

- **Melhoria Proposta**
  > Adicionar 2 it em `IngestaoPermutasService.test.ts`: (a) `computeCandidatas` retorna `todasInvoices` com uma invoice avulsa (não-casada) — assertion: `upsertInvoices` recebe a invoice avulsa COM `importador` resolvido; (b) `todasInvoices` traz uma invoice que TAMBÉM está casada por adto — assertion: a versão casada (com `valorMoedaNegociada`) vence (early-return no `byDocCod.has`).

- **Resultado Esperado**
  > Cobertura do ramo `todasInvoices` 0 → 2 branches; `IngestaoPermutasService.test.ts` ganha 2 it.

- **Tactic alvo**: Executable Assertions
- **Severidade**: P2
- **Esforço estimado**: S
- **Findings relacionados**: F-testability-7
- **Métricas de sucesso**:
  - `grep -c todasInvoices IngestaoPermutasService.test.ts`: 0 → ≥ 2
- **Risco de não fazer**: refator do early-return esconde/duplica invoice; tela de Permutas Manuais perde caso esperado.
- **Dependências**: nenhuma

## 6. Notas do agente

- Cross-QA detectado: F-testability-4 (rota `/borderos*` sem teste de auth) sobrepõe com Security (RBAC + confused-deputy já documentados em revisões anteriores) e Fault Tolerance (tradução de erro do ERP). Coordenar o card 4 com `qa-security` e `qa-fault-tolerance` p/ não duplicar.
- Cross-QA detectado: F-testability-6 (clock injetável) é tactic comum com Modifiability — proposta de `ClockProvider` deve nascer de lá; aqui só consumimos.
- Não rodei `npm test -- --coverage` (custo de tempo) — as métricas % são derivadas de contagem `it()` + análise estática dos diffs; recomendo o consolidator rodar `npm test -- --coverage --silent 2>&1 | tail -30` em uma rodada separada e enforcar `coverageThreshold` no `jest.config` (sinaliza p/ `qa-deployability` — gate antes do deploy).
- Briefing mencionou `fast-check` como dependência adotada — NÃO está em `package.json` nesta rev; rebaixei o card de property-based testing implicitamente (P3 opcional, não cardado).
- Decisão de escopo: foquei em GAPS NOVOS (delta PR v0.7.0). Tactics ausentes "permanentes" do repo (Sandbox/`docker-compose.test.yml`, testes de integração reais com Postgres) ficaram em `⚠️ parcial` na tabela 3 mas SEM card — são débito do template, não da feature.

## Resumo (3 linhas)

PR v0.7.0 adiciona ~2.300 LOC e 4 features-chave (auto-alocação no Baixar, reclassificação ultrapassa-invoice, cache + gestão viva de borderôs, universo completo de invoices) — as DUAS regras de saldo automático mais críticas (`AlocacaoPermutasService.autoAlocar*` e `GestaoPermutasService.autoElegivel`) entraram sem um único teste direto: P0. Repositório (`PermutaExecucaoRepository` +8 métodos), 9 endpoints novos `/borderos*` no `routes/permutas.ts` e 13 superfícies novas no FE (`BorderosPanel` + 10 lib/api + `MoneyInput`/`maskBrl`/`confirmarProcessamento`) também não têm teste: P1. Score 6/10 — boa cobertura de service principal (`BorderoGestaoService` com 23 it, `GestaoPermutasService` com 18 it) mas três buracos P0/P1 onde uma regressão silenciosa custa baixa errada no ERP.
