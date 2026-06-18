---
type: regis-review-kanban
run_id: 2026-06-18-1441
mode: --quick (scoped)
scope: feature-tweak gate — Permutas Frente I, Fatia 1 (gate-3-pago-via-detail)
qas_covered: [Integrability, Fault Tolerance, Modifiability, Testability]
qas_out_of_scope: [Availability, Deployability, Performance, Security]
total: 7
counts: { p0: 0, p1: 6, p2: 0, p3: 1 }
gate_result: PASS — 0 P0; route P1/P2/P3 to ontology/_inbox/permutas-painel-elegiveis-regis-followups.md
---

# Kanban — financeiro — 2026-06-18-1441 (gate-3-pago-via-detail)

> Importável para o Kanban do time. Cards copiados **verbatim** das seções dos 4 agents QA.
> Ordem: P0 (S → XL), depois P1 (S → XL), P2, P3. Como o gate é `--quick` e o delta é restrito a
> 2 diretórios read-only, **não há P0 nem P2 — apenas 6 P1 (todos S) e 1 P3 (cosmético)**.
>
> Política do pipeline: P0 reentra no AutoLoopRunner; P1/P2/P3 vão para
> `ontology/_inbox/permutas-painel-elegiveis-regis-followups.md` (não bloqueiam merge).

---

## P0 — Crítico

_Nenhum P0 introduzido pelo delta. **Gate APROVADO sem re-loop.**_

---

## P1 — Alto

### [testability-2] Pinar também `valorPermutar` do detail nos testes de Gate 3

**QA**: Testability
**Tactic alvo**: Executable Assertions (Bass)
**Esforço**: S (≤1d) — alteração trivial nos testes, sem mudar produção
**Findings**: F-testability-2

**Problema**
> `buildCandidata` foi alterado para hidratar do detail **dois** campos: `pago` (foco da feature) e `valorPermutar`. Os três novos testes asseguram só o primeiro. Como `valorPermutar` é o número que entra no `fin010` (núcleo monetário da Frente I — Permutas), e a literatura é a mesma do bug original (lista mente, detalhe é verdade), o invariante precisa estar pinado pelo mesmo `describe`.

**Melhoria Proposta**
> Em cada um dos três casos do `describe('Gate 3 ... hydrated from the DETAIL')` adicionar `expect(result.candidatas[0].valorPermutar).toBe(<valor do mock do detail>)`. Custo marginal (uma linha por teste); o mock já carrega o número correto, só falta o assert. Bonus: variar o `valorPermutar` da lista vs. do detail num quarto caso explicitamente desenhado para verificar o override (mesmo padrão da técnica Recordable Test Cases que o delta já usa para `pago`).

**Resultado Esperado**
> Casos no `describe` de Gate 3 que afirmam `result.candidatas[0].valorPermutar` do detail: 0/3 → 3/3 (ou 4/4 com o caso de override explícito). Refatoração futura que regrida `valorPermutar` para a fonte da lista falha CI imediatamente.

**Métricas de sucesso**
- Linhas de teste pinando `valorPermutar` no resultado da candidata: 0 → ≥3
- Cobertura do contrato `{valorPermutar, pago}` do detail no serviço: parcial → total

**Risco de não fazer**
> Próxima refatoração no `buildCandidata` pode coalescer `valorPermutar` da lista por descuido — sem teste vermelho, o erro chega ao fechamento `fin010` no ERP.

**Dependências**: Nenhuma; todos os mocks já carregam `valorPermutar`, é só adicionar o `expect`.

---

### [testability-1] Adicionar assertion de divergência (log/contador) no override list→detail

**QA**: Testability
**Tactic alvo**: Executable Assertions + Internal Monitoring (Bass)
**Esforço**: S (≤1d)
**Findings**: F-testability-1

**Problema**
> Os três testes do novo `describe('Gate 3 ... hydrated from the DETAIL')` pinam o **resultado** do gate, mas não pinam o **fato** de que houve override quando a lista mentiu. O bug que motivou a feature em prod era invisível justamente porque ninguém media a divergência; o fix conserta a verdade, mas não cria o sinal — então a próxima vez que Conexos mudar o contrato do `mnyTitAberto` o time descobre pelo financeiro errado, não pelo log.

**Melhoria Proposta**
> Em `EleicaoPermutasService.buildCandidata` (Modifiability: Increase Cohesion + Testability: Internal Monitoring), emitir um `logService.warn` ou incrementar um contador estruturado quando `adiantamento.pago !== detalhe.pago`. Adicionar no `describe` existente um quarto caso "list disse `true`, detail disse `false`" que afirma `expect(calls.some(c => c.data?.divergencia === 'pago_list_vs_detail')).toBe(true)`. Reaproveitar `buildLogService()` (já tem `calls` capturados).

**Resultado Esperado**
> Métrica observável: assertions de divergência list↔detail nos testes do `describe` de Gate 3: 0 → 1 (ou mais). Em produção, o log estruturado dá ao time o número que decide quando remover a hidratação extra (uma chamada de detail por candidata é custo de latência).

**Métricas de sucesso**
- Casos de override list→detail com assertion em `calls`: 0 → ≥1
- Sinal de divergência presente no `LogService` em prod: ausente → presente (chave estruturada estável, ex. `divergencia: 'pago_list_vs_detail'`)

**Risco de não fazer**
> Se o Conexos consertar `com298/list` no futuro, ninguém saberá; a chamada extra ao detail vira custo permanente sem dado para defender remoção. Se o Conexos quebrar a semântica de `mnyTitAberto` de novo, o time descobre via auditoria financeira do `fin010`, não via alerta.

**Dependências**: Nenhuma (a infra de `buildLogService` já existe e é usada em outros casos como `DETAIL_INDISPONIVEL`).

---

### [fault-tolerance-2] Emitir contador agregado por run para `DETAIL_INDISPONIVEL`

**QA**: Fault Tolerance
**Tactic alvo**: Condition Monitoring (Bass)
**Esforço**: S (≤1d)
**Findings**: F-fault-tolerance-2

**Problema**
> A degradação cumulativa (várias PROFORMAs presas em `DETAIL_INDISPONIVEL` ao longo de runs sucessivas) não dispara alarme. Cada candidata gera um `BUSINESS_WARN`, mas o regime degradado em si fica invisível sem agregação. Cross-ref Availability/Performance: se a próxima run não acontecer ou se o Conexos ficar degradado por > N ciclos, work items ficam stuck mid-flow indefinidamente (definição da barra de "no work item stuck mid-flow").

**Melhoria Proposta**
> No final do `EleicaoPermutasService` run, emitir um `BUSINESS_INFO` (ou métrica CloudWatch quando a infra alvo existir) com `{ flowId, filCod, total, elegiveis, bloqueadas_por_motivo: { 'detail-indisponivel': N, 'falha-gate': M, ... } }`. Tactic: Condition Monitoring agregado. Não cria estado novo — apenas sumariza o que já foi computado.

**Resultado Esperado**
> Alarme acionável quando `detail-indisponivel / total > X%` em uma única run (sinal de regime degradado de Conexos), independente da inspeção per-candidata.

**Métricas de sucesso**
- Latência de detecção de degradação prolongada do Conexos: manual / N horas → 1 run
- Cobertura de teste do sumário agregado: 0 → ≥1 cenário com mix de motivos

**Risco de não fazer**
> Regime degradado do Conexos por > 24h passa despercebido; cresce backlog de candidatas em `DETAIL_INDISPONIVEL` sem ninguém ver.

**Dependências**: Nenhuma (puro log estruturado hoje; vira métrica nativa quando a infra alvo existir).

---

### [fault-tolerance-1] Preservar distinção `pago=false` × `pago=undefined` no estado de bloqueio

**QA**: Fault Tolerance
**Tactic alvo**: Condition Monitoring (Bass)
**Esforço**: S (≤1d)
**Findings**: F-fault-tolerance-1

**Problema**
> Após `pago: detalhe.pago ?? false` em `EleicaoPermutasService.ts:449`, a candidata que cai em `BLOQUEADA(FALHA_GATE)` por Gate 3 não distingue "detalhe disse explicitamente NÃO pago" de "detalhe respondeu mas `mnyTitAberto` veio ausente". A elegibilidade está correta (zero false-positives), mas uma regressão de schema do Conexos (`mnyTitAberto` sumindo) só se manifestaria como aumento silencioso de FALHA_GATE.

**Melhoria Proposta**
> Adicionar um motivo adicional ou um `gatesAvaliados[].detail` enriquecido quando `detalhe.pago === undefined` (e.g., `detail='pago=undefined: mnyTitAberto ausente no detalhe'` no GATE.TOTALMENTE_PAGO, ou ainda um sub-flag `pagoSource: 'mnyTitAberto-zero' | 'mnyTitAberto-absent-defaulted-false'`). Mantém a tactic conservadora (sem inferir pago=true), adiciona condition-monitoring sobre regressão do schema. Tocar: `EleicaoPermutasService.ts:449`, possivelmente `ElegibilidadeService.ts:69` (detail field).

**Resultado Esperado**
> Operador consegue separar `pago=false real` (~99% dos casos esperados) de `pago=undefined defaulted` (sinal de regressão Conexos). Métrica `pago_undefined_rate_per_run` rastreável.

**Métricas de sucesso**
- `% candidatas BLOQUEADA(FALHA_GATE) com gatesAvaliados[GATE.TOTALMENTE_PAGO].detail explícito sobre origem do pago`: 0% → 100%
- Taxa de detectabilidade de regressão de schema Conexos: manual → automática via contador

**Risco de não fazer**
> Regressão silenciosa do payload Conexos (`mnyTitAberto` removido/renomeado) trava a elegibilidade real por janelas inteiras sem alarme.

**Dependências**: Nenhuma.

---

### [integrability-1] Validar payload `com298/{docCod}` com Zod no boundary do `ConexosClient`

**QA**: Integrability
**Tactic alvo**: Tailor Interface (Bass) + Validate Input
**Esforço**: S (≤1d)
**Findings**: F-integrability-1

**Problema**
> `mapDetalheTitulos` consome `Record<string, unknown>` cru: schema drift do Conexos (renome de `mnyTitAberto`, troca de tipo numérico → string localizada, etc.) produz `pago=undefined` → `false` silencioso, reprovando Gate 3 em massa sem qualquer log de "boundary inválido". Mesmo padrão se aplica ao quirk HTTP-400 com `responseData` (ConexosClient.ts:874-881).

**Melhoria Proposta**
> Introduzir um `Com298DetailSchema = z.object({ mnyTitPermutar: z.coerce.number().nullable().optional(), mnyTitAberto: z.coerce.number().nullable().optional() }).passthrough()` em `ConexosClient.ts` e fazer `mapDetalheTitulos` chamar `schema.safeParse(detail)` antes de `parseOptionalNumber`. Em `success: false`, logar `LogService.warn(INTEGRATION_WARN, { endpoint: 'com298/{docCod}', issues })` e retornar `{}` (mesmo comportamento de fallback conservador — Gate 3 reprova, mas agora com rastro estruturado). Tactic Bass: **Tailor Interface** + cross-QA com **Validate Input** (Security/Fault Tolerance).

**Resultado Esperado**
> Schema drift do Conexos vira log estruturado observável (`INTEGRATION_WARN` por endpoint), não reprovação silenciosa. Métrica: 0% → 100% de validação Zod no payload do endpoint detail; rastreabilidade de drift via filtro de log no dashboard de operação.

**Métricas de sucesso**
- % de campos do payload `com298/{docCod}` validados via Zod: 0% → 100%
- # de logs `INTEGRATION_WARN` por schema drift: instrumentado (era inexistente)

**Risco de não fazer**
> Primeira mudança de schema no Conexos vira incidente de execução financeira (snapshot 0 candidatas elegíveis) detectado por business outcome, não por monitoria técnica.

**Dependências**: Nenhuma — mudança contida em `ConexosClient.ts`.

---

### [integrability-2] Gravar fixtures JSON reais do `com298/{docCod}` (pago / não-pago) e plugar nos testes do mapper

**QA**: Integrability
**Tactic alvo**: Contract testing
**Esforço**: S (≤1d, requer acesso ao Conexos dev)
**Findings**: F-integrability-2

**Problema**
> Os 5 testes do `getDetalheTitulos` (`ConexosClient.test.ts:1185-1270`) usam objetos literais inline. O conhecimento do shape real do payload (capturado em sonda 2026-06-18 contra `filCod=2`, docs `26471` e `24166`) foi descartado (throwaway probe, não comitado). Schema drift do Conexos não é capturado por nenhum teste — mesma gap já presente em outros endpoints (`2026-06-17-2340/testability.md`).

**Melhoria Proposta**
> Re-executar a sonda contra `filCod=2` (docs `26471` não-pago + `24166` pago) e gravar a resposta crua como `src/backend/domain/client/__fixtures__/conexos/com298_detail_nao_pago.json` e `..._pago.json`. Refatorar os 5 cenários atuais para carregar o JSON via `fs.readFileSync` em vez de literais inline. Para os cenários sintéticos (`mnyTitAberto` ausente, retry esgotado, quirk HTTP-400), partir do JSON real e remover/sobrescrever o campo. Tactic Bass: **Contract testing** (consumer-driven, schema-pinned).

**Resultado Esperado**
> Forma real do payload Conexos vira código versionado, não conhecimento tácito. Métrica: 0 → 2 fixtures JSON reais; 5/5 cenários do mapper alimentados a partir de fixture real (mesmo padrão recomendado para os demais endpoints em `2026-06-17-2340/testability.md`).

**Métricas de sucesso**
- # de fixtures JSON reais do `com298/{docCod}` no repo: 0 → 2 (pago + não-pago)
- % de testes do `getDetalheTitulos` ancorados em fixture real: 0% → 100%

**Risco de não fazer**
> Primeira regressão por mudança de Conexos vira incidente em produção, indistinguível de comportamento legítimo (Gate 3 reprova). Sem fixture real, nem o mapper nem o teste defendem contra drift.

**Dependências**: Acesso ao Conexos dev (mesmo usado para a sonda original em 2026-06-18); idealmente complementar ao [testability-X] equivalente do run anterior se ainda em backlog.

---

## P2 — Médio

_Nenhum P2 introduzido pelo delta._

---

## P3 — Baixo

### [modifiability-1] Limpar referência stale a `getMnyTitPermutar` no comentário do test

**QA**: Modifiability
**Tactic alvo**: Refactor
**Esforço**: S (≤ 5 min)
**Findings**: F-modifiability-1

**Problema**
> Após o rename do método público no client, restou 1 comentário em `EleicaoPermutasService.test.ts:441` mencionando o nome antigo. Não quebra nada (typecheck cobre), mas polui grep e narrativa do código.

**Melhoria Proposta**
> Trocar `getMnyTitPermutar` por `getDetalheTitulos` no comentário (linha 441). Tactic alvo: **Refactor** (consistência de nomenclatura).

**Resultado Esperado**
> `grep -rn "getMnyTitPermutar" src/backend` retorna 0 hits (atualmente 1).

**Métricas de sucesso**
- Referências stale ao nome antigo: 1 → 0

**Risco de não fazer**
> Trivial; ruído residual em buscas por símbolo.

**Dependências**: Nenhuma.

> Este card é P3 e está fora do filtro P0/P1 do gate. Listado apenas por exigência de schema (toda métrica com `status: ⚠️` precisa de um card derivável). Não bloqueia merge.

---

## Resumo de roteamento

- **P0 (0 cards)**: nenhum re-loop no AutoLoopRunner.
- **P1 (6 cards)**: rotear para `ontology/_inbox/permutas-painel-elegiveis-regis-followups.md`. Recomendação: atacar em sprint pós-merge — todos são esforço S, e o feixe testability-1 + fault-tolerance-2 + fault-tolerance-1 + integrability-1 resolve CC-1/CC-2 simultaneamente.
- **P2 (0 cards)**: n/a.
- **P3 (1 card)**: rotear para o mesmo inbox; resolver oportunisticamente no próximo `/feature-tweak` que tocar `EleicaoPermutasService.test.ts`.
