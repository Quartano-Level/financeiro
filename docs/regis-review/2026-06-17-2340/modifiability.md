---
qa: Modifiability
qa_slug: modifiability
run_id: 2026-06-17-2340
agent: qa-modifiability
generated_at: 2026-06-18T00:15:00Z
scope: backend
score: 7.5
findings_count: 8
cards_count: 8
---

# Modifiability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Desenvolvedor Kavex | Resolver probe P0-4 (campo wire `imp019`/`imp223` da data-base) e pluga `dataBase` real na cadeia | `ConexosClient.mapDeclaracaoDataBase` + interface `DeclaracaoImportacao` + `AgingService` + snapshot row | Fatia 1 já em produção (READ-ONLY, snapshot ativo) | Mudança ISOLADA em um ponto único; cascata para `aging`/`variacaoCambial` é dirigida por presença de `dataBase` sem novos branches | Arquivos tocados ≤ 2 (`ConexosClient.ts` + 1 schema); 0 mudanças de assinatura em services; tempo de mudança ≤ 1d (S); regressão de testes verde sem editar suites das 4 cadeias |
| Desenvolvedor Kavex (Fatia 2) | Adicionar escrita `fin010` (executar permuta — baixa PROFORMA × INVOICE 1:1) ao fluxo já existente | Nova ação `executarPermuta` em service novo + estado `EXECUTADA` na state-machine | Fatia 1 estabilizada; snapshot/audit imutáveis | Nova ação plugada como camada DEPOIS de `EleicaoPermutas` SEM modificar os 4 gates nem regra juros/desconto; reutiliza `invoiceCasada` 1:1 do snapshot | 0 mudanças em `ElegibilidadeService`/`CasamentoInvoiceService`/`VariacaoCambialPermutaService`; +1 estado em `ESTADO_ELEGIBILIDADE`; +1 motivo de bloqueio quando aplicável; novo service ≤ 200 LOC |
| Analista/Yuri | Mudar limite `valorPermutar > 0` para `≥ tolerância` (regra Gate 2) | `ElegibilidadeService.avaliarElegibilidade` | Produção com snapshot histórico | Ajuste em 1 linha + 1 constante; teste de Gate 2 atualizado | LOC tocado ≤ 5; risco de regressão isolado ao Gate 2 (4 gates desacoplados); 0 efeito colateral em casamento/aging/variação |
| Outro tenant trading (não-Columbia) | Onboarding com `priCod`/`tpdCod`/`vldStatus` diferentes | `conexosPermutasConstants.ts` | Multi-tenant SaaSo | Recalibrar 1 arquivo; nenhuma service alterada | LOC tocado ≤ 39 (todo o arquivo); 0 ocorrência de hardcode de tenant em service (`grep -rn` deve retornar 0) |

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| LOC novo código não-test (permutas delta) | 1163 | ≤ 1500 | ✅ | `_shared-metrics.md` |
| LOC do maior service do delta (`EleicaoPermutasService`) | 283 | ≤ 400 | ✅ | `wc -l src/backend/domain/service/permutas/*.ts` |
| LOC do maior repositório do delta (`PermutaSnapshotRepository`) | 177 | ≤ 300 | ✅ | `wc -l src/backend/domain/repository/permutas/*.ts` |
| Services com 1 responsabilidade pura (não orquestrador) | 4/5 (Elegibilidade, Casamento, Variação, Aging, Painel) | 100% dos services-de-regra | ✅ | inspeção `service/permutas/*.ts:1-50` |
| Orquestrador único concentrando IO Conexos | 1 (`EleicaoPermutasService`) | 1 | ✅ | `grep -c "await this.conexosClient\." EleicaoPermutasService.ts` → 5 |
| Imports no orquestrador | 13 | ≤ 15 | ✅ | `grep -c "^import " EleicaoPermutasService.ts` |
| Estados/motivos como constantes tipadas (não string crua) | 100% (`ESTADO_ELEGIBILIDADE` + `MOTIVO_BLOQUEIO` + `GATE`) | 100% | ✅ | `EstadoElegibilidade.ts:8-33`, `PermutaCandidata.ts:11-22` |
| Magic numbers em business rules | 3 (`PAGE_SIZE=500`, `MAX_PAGES=50`, `MS_PER_DAY` numa const local) | ≤ 1 (apenas conversão de unidade) | ⚠️ | `grep -n "= 500\|= 50\b\|MS_PER_DAY" service/permutas/*.ts` |
| Magic numbers em rules de negócio (cap-hit threshold) escondidos no service | `PAGE_SIZE`/`MAX_PAGES` duplicados (existem também em `ConexosClient`) | 1 fonte única externalizada | ❌ | `ConexosClient.ts:280,289` + `EleicaoPermutasService.ts:33-34` |
| Probes/literais wire isolados em ponto único (Defer Binding) | 3 (P0-4 mapper, `ADIANTAMENTO_FILTER_KEY`/`_VALUE`, doc-fonte `com308`) | ≥ 3 | ✅ | `conexosPermutasConstants.ts:30-33`, `ConexosClient.ts:mapDeclaracaoDataBase` |
| Constantes de tenant (`tpdCod`/`vldStatus`) hardcoded em service | 0 | 0 | ✅ | `grep -rn "99\|128\|'3'" service/permutas/` → 0 fora dos tests |
| Schema↔código drift (coluna `fil_cod`) | 1 (DECLARED + SELECT, mas NÃO escrita pelo INSERT) | 0 | ❌ | `migrations/0001_permuta_eleicao.sql:30` vs `PermutaSnapshotRepository.ts:138-156` |
| Cyclomatic-proxy (control-flow tokens) máximo no delta | 13 (`EleicaoPermutasService`) | ≤ 15 (Biome warn) | ✅ | `grep -cE "..."` por arquivo |
| Biome `noExcessiveCognitiveComplexity` warnings no delta | 0 | 0 | ✅ | `npm run lint` (4 warnings só em legado `services/conexos.ts`) |
| Cobertura READ-ONLY (zero write `fin010`) que preserva o caminho para Fatia 2 | 100% | 100% | ✅ | `routes/permutas.ts:18-19` + ausência de método `executarPermuta` em qualquer service |
| Camadas DDD respeitadas (Lambda/Route → Service → Repository → Client) | 100% | 100% | ✅ | `_shared-metrics.md` (PatternGuardian ✅) |
| Fan-in dos 6 services (quantos arquivos não-test importam cada um) | EleicaoPermutas=2, Painel=2, Casamento=1, Elegibilidade=1, Variacao=1, Aging=1 | ≤ 3 | ✅ | `for s in ...; do grep -rln from .*$s.js ...` |

### Apêndice — Top arquivos por LOC (delta non-test)

| Rank | LOC | Arquivo |
|---|---|---|
| 1 | 283 | `src/backend/domain/service/permutas/EleicaoPermutasService.ts` |
| 2 | 177 | `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts` |
| 3 | 168 | `src/backend/domain/service/permutas/ElegibilidadeService.ts` |
| 4 | 91  | `src/backend/domain/service/permutas/PainelService.ts` |
| 5 | 68  | `src/backend/domain/client/permutas/conexosPermutasSchemas.ts` |
| 6 | 55  | `src/backend/migrations/runMigrations.ts` |
| 7 | 55  | `src/backend/domain/interface/permutas/PermutaCandidata.ts` |
| 8 | 53  | `src/backend/routes/permutas.ts` |
| 9 | 53  | `src/backend/domain/service/permutas/VariacaoCambialPermutaService.ts` |
| 10 | 42 | `src/backend/migrations/0001_permuta_eleicao.sql` |

### Apêndice — Fan-in por service do delta

| Service | Fan-in (arquivos que importam) | Risco se mudar |
|---|---|---|
| `CasamentoInvoiceService` | 1 (`ElegibilidadeService`) | baixo |
| `ElegibilidadeService` | 1 (`EleicaoPermutasService`) | baixo |
| `VariacaoCambialPermutaService` | 1 (`EleicaoPermutasService`) | baixo |
| `AgingService` | 1 (`EleicaoPermutasService`) | baixo |
| `EleicaoPermutasService` | 2 (`routes/permutas.ts` + futura Lambda job) | baixo (orquestrador é um nó-folha de leitura externa) |
| `PainelService` | 2 (`routes/permutas.ts` + tests) | baixo |

### Não-medíveis neste run

> ⚠️ **Não medível localmente**: tempo médio real de mudança (lead time) para cada cenário acima. Requer telemetria histórica do time (Linear/PR cycle). Recomendação: começar a marcar PRs com `mod:S/M/L/XL` para calibrar estimativas.

> ⚠️ **Não medível localmente**: ripple efetivo do `mapDeclaracaoDataBase` quando o P0-4 for resolvido. Requer um exercício real (pull a branch e medir LOC tocado). Recomendação: registrar como case study quando acontecer.

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Split Module | 6 services (Elegibilidade / Casamento / Variação / Aging / Eleição / Painel) com 1 responsabilidade cada; `casarInvoice` extraído como service separado para preservar caminho 1:1→N:M | ✅ presente | `service/permutas/*.ts` (todos < 300 LOC, 4 deles < 100 LOC) |
| Increase Semantic Coherence | Cada service espelha 1 ação da ontologia (`avaliarElegibilidade`, `casarInvoice`, `calcularVariacaoCambial`, `compute` (aging), `executar` (orquestrador), `exporNoPainel`). Sem cross-talk entre regras. | ✅ presente | `ElegibilidadeService.ts:46-118`, `CasamentoInvoiceService.ts:20-31` |
| Encapsulate | (a) Probe wire P0-4 isolado em `mapDeclaracaoDataBase`; (b) literais ADIANTAMENTO_FILTER em arquivo dedicado; (c) Postgres atrás de `PostgreeDatabaseClient`; (d) Conexos atrás de `ConexosClient`; (e) snapshot row schema escondido do `PainelService` via `PermutaCandidataSnapshotRow`. | ✅ presente | `ConexosClient.ts:684-700`, `conexosPermutasConstants.ts:30-33`, `PainelService.ts:8-26` |
| Use an Intermediary | `EleicaoPermutasService` é o ÚNICO intermediário entre Conexos+Repo e as 4 regras puras (`Elegibilidade`/`Casamento`/`Variação`/`Aging`). Regras NÃO importam `ConexosClient`. | ✅ presente | `grep "ConexosClient" service/permutas/*.ts` → só `EleicaoPermutasService.ts` |
| Restrict Dependencies | Regras puras não importam repository/client. `PainelService` lê só do repo; `EleicaoPermutasService` orquestra. Camadas DDD são respeitadas (PatternGuardian ✅). | ✅ presente | `grep "from .*client\|from .*repository" service/permutas/{Elegibilidade,Casamento,Variacao,Aging}Service.ts` → 0 hits |
| Refactor | `paginate` ganhou `onCapHit` callback (telemetria SEM acoplar caller à interna de paginação); CasamentoInvoiceService extraído de Elegibilidade para preservar caminho 1:1→N:M sem branch interno. | ✅ presente | `ConexosClient.ts:1086-1099`, `CasamentoInvoiceService.ts` |
| Abstract Common Services | `paginate` é abstração comum para todos os list-endpoints do Conexos; `wireNumber`/`wireId` no schema-zod são abstrações comuns para coação numérica/identidade. | ✅ presente | `conexosPermutasSchemas.ts:12-22`, `ConexosClient.ts:1077-1140` |
| Defer Binding — configuration | Tenant Columbia (`TPD_PROFORMA=99`, `TPD_INVOICE=128`, `VLD_STATUS_FINALIZADO=['3']`) isolado em `conexosPermutasConstants.ts`. Outro trading → recalibra 1 arquivo. | ⚠️ parcial | `conexosPermutasConstants.ts:10-16` — mas ainda em código (não em SSM/env); aceitável p/ Fatia 1, débito p/ multi-tenant SaaSo |
| Defer Binding — polymorphism | `MOTIVO_BLOQUEIO` é discriminator tipado: a UI/painel decide rendering por motivo sem `if/else` no service. `ESTADO_ELEGIBILIDADE`/`GATE` idem. | ✅ presente | `EstadoElegibilidade.ts:20-31`, `PermutaCandidata.ts:11-22` |
| Defer Binding — plugin / runtime registration | `mapDeclaracaoDataBase` é um plug-point: hoje devolve `undefined`; quando o probe resolver, troca-se a implementação no MESMO ponto sem tocar nas 4 regras nem no orquestrador. | ✅ presente | `ConexosClient.ts:684-700` |
| Defer Binding — DI container | `tsyringe` `@injectable()` em todos os 6 services + repo + client; `bootstrapAppContainer` registra tudo idempotente. | ✅ presente | `appContainer.ts:1-45`, todo `service/permutas/*.ts` |

## 4. Findings

### F-modifiability-1: Schema↔código drift em `fil_cod` quebra auditoria multi-filial (I6)

- **Severidade**: P0 (crítico — produção emite snapshot sem `fil_cod`, audit trail multi-filial fica em branco para SEMPRE; rollback de dado exige migration corretiva)
- **Tactic violada**: Increase Semantic Coherence (schema é fonte da verdade, código deve casar) + Encapsulate (column declarado mas não populado é abstração quebrada)
- **Localização**: `src/backend/migrations/0001_permuta_eleicao.sql:30` declara `fil_cod INTEGER`; `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts:138-156` INSERT NÃO inclui `fil_cod`; `:116` SELECT inclui `fil_cod` (sempre `NULL`); `:30` interface `PermutaCandidataSnapshotRow.filCod?: number` é opcional sem nunca popular
- **Evidência (objetiva)**:
  ```
  -- migration 0001:
  fil_cod INTEGER,
  -- repository INSERT:
  INSERT INTO permuta_candidata_snapshot (
      run_id, doc_cod, pri_cod, status, motivo_bloqueio,
      aging_days, invoice_doc_cod, variacao_classificacao, variacao_resultado
  ) VALUES (...)
  -- ↑ fil_cod ausente do INSERT, mas o orquestrador conhece o filCod por candidata
  -- (EleicaoPermutasService.ts:169 → buildCandidata(adiantamento, filCod))
  ```
- **Impacto técnico**: cada snapshot row nasce com `fil_cod = NULL`. Re-rodar uma run com filtro por filial é impossível sem refazer query do zero contra Conexos. Quando a Fatia 2 (escrita `fin010`) chegar e precisar reconciliar uma elegível por filial, falta a chave de partição. SELECT lê coluna que sempre virá `null` (waste de I/O + falsa expectativa para o leitor).
- **Impacto de negócio**: auditoria O6 (rastrear quem disparou + o que rodou + sobre QUAL filial) entrega só 2/3. Multi-filial (I6) declarado na ontologia, não rastreado no snapshot. Em incidente, time não consegue isolar uma filial específica sem re-executar a eleição inteira.
- **Métrica de baseline**: 100% dos rows do snapshot atual terão `fil_cod = NULL` em produção (0% preenchimento esperado para coluna NOT NULL ausente do INSERT).

### F-modifiability-2: `PAGE_SIZE`/`MAX_PAGES` duplicados em `EleicaoPermutasService` e `ConexosClient` — divergência futura é certa

- **Severidade**: P1 (alto — duplicação em fronteira de camada; quando o cap real do Conexos mudar, vão sair de sincronia silenciosamente)
- **Tactic violada**: Defer Binding (configuração não-externalizada e duplicada) + Abstract Common Services
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:33-34` (`const PAGE_SIZE = 500; const MAX_PAGES = 50;`) duplica `src/backend/domain/client/ConexosClient.ts:280,289`
- **Evidência (objetiva)**:
  ```ts
  // EleicaoPermutasService.ts:33-34
  const PAGE_SIZE = 500;
  const MAX_PAGES = 50;
  // ConexosClient.ts:280,289
  const PAGE_SIZE = 500;
  const MAX_PAGES = 50;
  ```
  O service usa esses valores APENAS para logar `data: { pageSize, maxPages }`. Não há autoridade — quem decide cap real é o `paginate` no client.
- **Impacto técnico**: se o cap mudar no client (ex.: `MAX_PAGES = 100`), o service segue logando `50` em FLOW_START e em BUSINESS_WARN cap-hit, com fonte aparente de verdade errada. Refactor do client não dispara sinal visível no service.
- **Impacto de negócio**: telemetria de cap-hit que stakeholder usa para decidir quando subir limite vira inconfiável; investigação de incidente vê `50` na trilha mas o sistema rodou com outro valor.
- **Métrica de baseline**: 2 ocorrências do par `PAGE_SIZE/MAX_PAGES` no codebase (deveria ser 1 ponto único exportado do client ou de um config module).

### F-modifiability-3: Constantes de tenant em código (não em config externa) atrasam SaaSo multi-tenant

- **Severidade**: P1 (alto — bloqueio para outro tenant trading; cada onboarding exige redeploy)
- **Tactic violada**: Defer Binding (configuration files)
- **Localização**: `src/backend/domain/client/permutas/conexosPermutasConstants.ts:10-16` (`TPD_PROFORMA = 99`, `TPD_INVOICE = 128`, `VLD_STATUS_FINALIZADO = ['3']`)
- **Evidência (objetiva)**:
  ```ts
  export const TPD_PROFORMA = 99 as const;
  export const TPD_INVOICE = 128 as const;
  export const VLD_STATUS_FINALIZADO = ['3'] as const;
  ```
  O comentário do arquivo reconhece a dívida: "Outra trading (outro `priCod`) recalibra os IDs". Hoje recalibração = edit + build + deploy.
- **Impacto técnico**: para suportar outro cliente trading (premissa SaaSo do CLAUDE.md), exige fork de constantes ou hardcode condicional por tenant. Quando vier o 2º cliente, refactor força bater em todos os call-sites do `ConexosClient`.
- **Impacto de negócio**: ciclo de onboarding do 2º cliente trading inclui redeploy do backend (custo de coordenação + risco de regressão para Columbia). Cross-QA com Deployability (cada mudança = redeploy).
- **Métrica de baseline**: 0 chamadas a `EnvironmentProvider` para essas constantes (todas literais `as const`). Alvo: 100% via SSM `/tenants/{env}/{client}/permutas/*`.

### F-modifiability-4: `EleicaoPermutasService` faz orquestração + IO Conexos + montagem de candidata + log — coesão alta mas tamanho aproxima do limite p/ Fatia 2

- **Severidade**: P2 (médio — orquestrador é grande mas internamente coerente; risco vira P1 quando Fatia 2 adicionar escrita `fin010`)
- **Tactic violada**: Split Module (preventivo) + Increase Semantic Coherence
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:1-283` (283 LOC, 5 chamadas a `conexosClient.*`, 4 private methods: `processFilial`, `buildCandidata`, `computeVariacao`, `countByMotivo`)
- **Evidência (objetiva)**:
  ```
  $ grep -c "await this.conexosClient\." EleicaoPermutasService.ts
  5
  $ grep -E "^(public|private)" EleicaoPermutasService.ts
  public executar
  private processFilial
  private buildCandidata
  private computeVariacao
  private countByMotivo
  ```
  `buildCandidata` (linhas 174-244) faz: hidratação de `valorPermutar`, leitura de declarações, leitura de invoices, mapeamento de invoice wire→domínio, chamada à regra, compute de aging, branch para variação. 71 LOC + 4 chamadas externas.
- **Impacto técnico**: quando a Fatia 2 (`executarPermuta` com escrita `fin010`) chegar, o caminho natural é estender `EleicaoPermutasService` ou criar um sibling — sem split de `buildCandidata` em um `CandidataAssemblyService` próprio, o segundo writer tende a inflar este arquivo para 400+ LOC.
- **Impacto de negócio**: tempo de mudança para Fatia 2 sobe (estimativa M→L) por ter que entender o orquestrador inteiro antes de plugar a escrita.
- **Métrica de baseline**: 283 LOC, 5 IO calls, 13 imports. Limite Biome de cognitive-complexity está OK hoje (control-flow proxy = 13/15), mas a margem é estreita.

### F-modifiability-5: Probe P0-4 isolado MAS `dataBase: Date | undefined` propaga branch `?? null` em 3 camadas

- **Severidade**: P2 (médio — desenho está correto, mas custo de mudança quando o probe resolver é maior que 1 arquivo)
- **Tactic violada**: Encapsulate (parcial — o probe está isolado, mas o efeito null-propagado não)
- **Localização**: `ConexosClient.ts:684-700` (mapper plug-point), `interface/permutas/DeclaracaoImportacao.ts:19` (`dataBase?: Date`), `service/permutas/AgingService.ts:17` (`compute(dataBase?: Date)`), `service/permutas/PainelService.ts:71-82` (`aging: r.agingDays ?? null`), `migrations/0001_permuta_eleicao.sql:34` (`aging_days INTEGER  -- NULL = ⏸ GATED-P0-4`)
- **Evidência (objetiva)**:
  ```
  grep -rn "GATED-P0-4\|gated-p0-4\|⏸" src/backend
  → ~12 ocorrências em 7 arquivos (mapper, interface DI, interface Variação,
    interface Candidata, AgingService, PainelService, migration SQL)
  ```
- **Impacto técnico**: quando o probe resolver e `dataBase` virar sempre populada, o `undefined`/`null` ainda fica espalhado defensivamente. Removê-lo não é uma mudança de 1 ponto — exige varredura para limpar o defensive coding.
- **Impacto de negócio**: dívida de cleanup pós-probe estimada em ~3h (cleanup spread out) em vez de zero.
- **Métrica de baseline**: 12 referências `GATED-P0-4`/`⏸` em 7 arquivos. Alvo pós-probe: 0.

### F-modifiability-6: Probes `ADIANTAMENTO_FILTER_KEY/_VALUE` testados por presença mas literal de produção é placeholder

- **Severidade**: P2 (médio — bem isolado em ponto único, mas valor wire chutado vira P0 silencioso em produção se o probe não acontecer antes do deploy)
- **Tactic violada**: Defer Binding — plugin (correta) + risco de não-rastreabilidade
- **Localização**: `src/backend/domain/client/permutas/conexosPermutasConstants.ts:30-33`
- **Evidência (objetiva)**:
  ```ts
  // TODO 🔬 PROBE: confirmar `ADIANTAMENTO_FILTER_KEY` e `ADIANTAMENTO_FILTER_VALUE`
  // contra o dev tenant Conexos (screenshot mostra o campo, falta o wire).
  export const ADIANTAMENTO_FILTER_KEY = 'adiantamento#EQ' as const;
  export const ADIANTAMENTO_FILTER_VALUE = 'S' as const;
  ```
- **Impacto técnico**: a request sai com filtro placeholder — o Conexos pode retornar todas as PROFORMA (sem filtro de adiantamento), inflando candidatas e custo de IO. Visivelmente "funciona" (200 OK, candidatas retornam), mas o filtro silenciosamente é no-op.
- **Impacto de negócio**: snapshot inicial pode incluir todas as PROFORMAs como `bloqueada(falha-gate)` em vez de só os adiantamentos. Carga inflada na primeira run; analista vê números errados; perda de confiança no painel.
- **Métrica de baseline**: 1 endpoint (`com298/list`) com filtro placeholder. Alvo: 0 placeholders em produção.

### F-modifiability-7: `MOTIVO_BLOQUEIO.MULTIPLAS_INVOICES` declarado mas inalcançável — taxonomia incoerente com o casamento 1:1

- **Severidade**: P2 (médio — falsa expectativa para o leitor; quando alguém tentar reportar "muitas invoices", o motivo certo (`COMPOSTO_NM`) é parecido mas diferente)
- **Tactic violada**: Increase Semantic Coherence (taxonomia tem 5 motivos, mas só 4 são alcançáveis)
- **Localização**: `src/backend/domain/interface/permutas/EstadoElegibilidade.ts:25` (`MULTIPLAS_INVOICES: 'multiplas-invoices'`) vs `src/backend/domain/service/permutas/CasamentoInvoiceService.ts:26-28` (>1 → `COMPOSTO_NM`)
- **Evidência (objetiva)**:
  ```ts
  // CasamentoInvoiceService.ts:25-28
  if (invoices.length > 1) {
      return { motivoBloqueio: MOTIVO_BLOQUEIO.COMPOSTO_NM };
  }
  // ↑ nunca emite MOTIVO_BLOQUEIO.MULTIPLAS_INVOICES
  grep -rn "MULTIPLAS_INVOICES" src/backend
  → só na declaração; 0 emissores
  ```
- **Impacto técnico**: leitor vê 5 motivos no enum, lê o comentário "distinguível do composto N:M (mesma família)" e infere que o sistema distingue — não distingue. Quando vier a Fatia 2 e o time tentar usar `MULTIPLAS_INVOICES` para um caso de N invoices que pertencem ao mesmo `adiantamento` (sem ser composto-nm), vai ter que decidir se a semântica original aceita ou se cria um 6º motivo.
- **Impacto de negócio**: ambiguidade na taxonomia de auditoria. Bloqueadas no painel agrupadas pelo motivo erradamente.
- **Métrica de baseline**: 1 motivo enum-only (`MULTIPLAS_INVOICES`) em 5 declarados; 0 call-sites.

### F-modifiability-8: Bootstrap do container chamado dentro de cada handler de rota (refeito a cada request)

- **Severidade**: P3 (baixo — `bootstrapped` flag guarda; só o lookup do flag por request é overhead — mas é code-smell de modificabilidade: bootstrap mistura com handler)
- **Tactic violada**: Increase Semantic Coherence (bootstrap pertence ao startup, não ao handler) + Encapsulate
- **Localização**: `src/backend/routes/permutas.ts:27` e `:46` (`await bootstrapAppContainer();` dentro de cada handler)
- **Evidência (objetiva)**:
  ```ts
  router.post('/eleicao', asyncHandler(async (req, res) => {
      await bootstrapAppContainer();   // ← por request
      const service = container.resolve(EleicaoPermutasService);
      ...
  }));
  ```
- **Impacto técnico**: mudar política de bootstrap (ex.: pré-aquecer ConexosClient, adicionar telemetria de cold-start) exige tocar em todas as rotas, não só em `index.ts`. Inversão de controle parcial.
- **Impacto de negócio**: quando migrar para Lambda (estado-alvo do CLAUDE.md), padrão repete em cada handler.
- **Métrica de baseline**: 2 call-sites de `bootstrapAppContainer` em `routes/permutas.ts`; 0 em `index.ts` (que seria o ponto natural).

## 5. Cards Kanban

### [modifiability-1] Persistir `fil_cod` no snapshot e fechar drift schema↔código

- **Problema**
  > A coluna `fil_cod` foi declarada em `migrations/0001_permuta_eleicao.sql:30` e é lida em `PermutaSnapshotRepository.ts:116` mas NÃO é gravada pelo INSERT em `:138-156`, embora o orquestrador conheça o `filCod` por candidata (`EleicaoPermutasService.ts:169`). Resultado: 100% dos rows nascem com `fil_cod = NULL`, audit trail multi-filial (I6) entrega só 2/3 — quem (`triggered_by`), o que (`status`/`motivo`), mas não em qual filial.

- **Melhoria Proposta**
  > Tactic: **Increase Semantic Coherence**. (1) Passar `filCod` para `PermutaSnapshotRepository.persistRun` via `PermutaCandidataSnapshotRow` (já existe campo `filCod?: number` na interface — propagar de `EleicaoPermutasService.buildCandidata` até o repo); (2) incluir `fil_cod` no INSERT do `insertCandidata`; (3) regression test no `PermutaSnapshotRepository.test.ts` que insere com `filCod=2` e re-lê via `findLatestSnapshot` esperando `filCod=2`.

- **Resultado Esperado**
  > 100% dos rows passam a ter `fil_cod` populado. SELECT do `findLatestSnapshot` deixa de ler coluna sempre-null. Audit trail O6 + multi-filial I6 fica completo.

- **Tactic alvo**: Increase Semantic Coherence
- **Severidade**: P0
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-1
- **Métricas de sucesso**:
  - rows com `fil_cod IS NULL` em prod: 100% → 0%
  - call-sites que passam `filCod` ao repo: 0 → 1 (orquestrador)
- **Risco de não fazer**: na Fatia 2 (escrita `fin010`), reconciliar elegíveis por filial vai exigir re-execução completa da eleição contra Conexos.
- **Dependências**: nenhuma.

### [modifiability-2] Centralizar `PAGE_SIZE` / `MAX_PAGES` num único módulo de paginação

- **Problema**
  > `const PAGE_SIZE = 500` e `const MAX_PAGES = 50` existem em DOIS lugares (`EleicaoPermutasService.ts:33-34` e `ConexosClient.ts:280,289`). O service só os usa para LOG (`pageSize`, `maxPages`), mas se o cap real mudar no client, a telemetria do service segue logando o valor antigo silenciosamente.

- **Melhoria Proposta**
  > Tactic: **Abstract Common Services** + **Defer Binding (configuration)**. Exportar as duas constantes do `ConexosClient.ts` (ou de um `paginationConfig.ts` em `domain/client/`) e importar no service. Se o team quiser dar mais um passo, mover para `EnvironmentProvider` (`CONEXOS_PAGE_SIZE`, `CONEXOS_MAX_PAGES`) — alinhado com Inviolable Rule #8.

- **Resultado Esperado**
  > 1 fonte da verdade. Mudar `MAX_PAGES` toca em 1 lugar. Telemetria do `BUSINESS_WARN cap-hit` reflete o cap real.

- **Tactic alvo**: Abstract Common Services
- **Severidade**: P1
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-2
- **Métricas de sucesso**:
  - ocorrências do par `PAGE_SIZE/MAX_PAGES` literais no codebase: 2 → 1
- **Risco de não fazer**: telemetria de cap-hit perde credibilidade quando o cap mudar; investigação de incidente lê valor errado.
- **Dependências**: nenhuma.

### [modifiability-3] Externalizar constantes de tenant Columbia via `EnvironmentProvider`/SSM

- **Problema**
  > `TPD_PROFORMA = 99`, `TPD_INVOICE = 128`, `VLD_STATUS_FINALIZADO = ['3']` em `conexosPermutasConstants.ts:10-16` são literais `as const`. O próprio comentário do arquivo reconhece: "Outra trading recalibra os IDs". Para o 2º cliente trading (premissa SaaSo do CLAUDE.md), recalibração = edit + build + deploy. Defer Binding está em compile-time, não em runtime.

- **Melhoria Proposta**
  > Tactic: **Defer Binding (configuration files)**. Mover as constantes para SSM `/tenants/{env}/{client}/permutas/tpd-proforma`, `/tpd-invoice`, `/vld-status-finalizado`, expostas via `EnvironmentProvider`. Os ENDPOINT_* e `ADIANTAMENTO_FILTER_*` podem ficar como constantes de domínio (são iguais entre tenants). Manter os tipos `as const` no boundary depois de ler do env.

- **Resultado Esperado**
  > Onboarding do 2º cliente = config no SSM, não rebuild. Tactic Defer Binding com binding-time correto (deploy → runtime).

- **Tactic alvo**: Defer Binding (configuration files)
- **Severidade**: P1
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-modifiability-3
- **Métricas de sucesso**:
  - constantes de tenant em código: 3 → 0
  - chamadas a `EnvironmentProvider.get(...)` para essas constantes: 0 → 3
- **Risco de não fazer**: 2º cliente trading entra com fork de constantes ou hardcode condicional, multiplicando débito.
- **Dependências**: ADR de naming SSM (`/tenants/{env}/{client}/permutas/*`) — provavelmente fora do escopo da Fatia 1, registrar como dívida para a Fatia 2.

### [modifiability-4] Extrair `CandidataAssemblyService` para o `buildCandidata` antes da Fatia 2

- **Problema**
  > `EleicaoPermutasService` já tem 283 LOC, 5 chamadas a `conexosClient.*` e o `buildCandidata` (71 LOC) faz hidratação + leituras + mapeamento + chamada à regra + compute de aging + branch para variação. Quando a Fatia 2 plugar escrita `fin010`, o caminho natural inflate este service para 400+ LOC.

- **Melhoria Proposta**
  > Tactic: **Split Module** (preventivo) + **Increase Semantic Coherence**. Extrair `CandidataAssemblyService` com método `assemble(adiantamento, filCod) → PermutaCandidata` cobrindo: hidratação `valorPermutar` + leituras de declaração/invoices + chamada da regra de elegibilidade + compute de aging + chamada da variação. Orquestrador (`EleicaoPermutasService`) fica responsável só por filiais + persistência + log de flow.

- **Resultado Esperado**
  > Orquestrador < 200 LOC, assembly < 150 LOC; Fatia 2 pluga o writer como sibling do assembly sem inflar nem o orquestrador nem o assembly.

- **Tactic alvo**: Split Module
- **Severidade**: P2
- **Esforço estimado**: M (2–5d)
- **Findings relacionados**: F-modifiability-4
- **Métricas de sucesso**:
  - LOC do orquestrador: 283 → ≤ 200
  - chamadas `conexosClient.*` no orquestrador: 5 → 1 (`listFiliais`) — resto migra para o `CandidataAssemblyService`
- **Risco de não fazer**: Fatia 2 entra como L em vez de M; teste do orquestrador fica cada vez mais setup-heavy.
- **Dependências**: idealmente antes do `/feature-new` da Fatia 2.

### [modifiability-5] Remover `null`-propagation defensivo após probe P0-4 resolver

- **Problema**
  > Quando o probe P0-4 capturar o campo wire da data-base, o `mapDeclaracaoDataBase` passa a sempre retornar `Date`. Mas 12 referências `⏸ GATED-P0-4` em 7 arquivos (interface, AgingService, PainelService, migration SQL, etc.) ainda tratarão `undefined`/`null` defensivamente.

- **Melhoria Proposta**
  > Tactic: **Encapsulate**. Quando o probe resolver, registrar uma tarefa única `/feature-tweak DeclaracaoImportacao "dataBase obrigatória — remover defensive null"`: (1) `DeclaracaoImportacao.dataBase: Date` (não-opcional); (2) `AgingService.compute(dataBase: Date)`; (3) `PainelItem.aging: number` (não-null); (4) migration corretiva `aging_days INTEGER NOT NULL`; (5) cleanup das tags `⏸ GATED-P0-4`.

- **Resultado Esperado**
  > 0 ocorrências de `⏸ GATED-P0-4` no codebase pós-probe. Tipagem fortalecida; Painel não precisa do bucket "sem aging".

- **Tactic alvo**: Encapsulate
- **Severidade**: P2
- **Esforço estimado**: S (≤1d, posterior ao probe)
- **Findings relacionados**: F-modifiability-5
- **Métricas de sucesso**:
  - referências `⏸ GATED-P0-4`/`GATED-P0-4`: 12 → 0
  - arquivos com defensive `?? null` para aging: 4 → 0
- **Risco de não fazer**: defensive coding apodrece; novos contributors mantêm `null`-checks que viraram dead code.
- **Dependências**: probe P0-4 resolvido (gap aberto na ontologia).

### [modifiability-6] Bloquear deploy em produção enquanto `ADIANTAMENTO_FILTER_KEY` for placeholder

- **Problema**
  > `ADIANTAMENTO_FILTER_KEY = 'adiantamento#EQ'` e `ADIANTAMENTO_FILTER_VALUE = 'S'` são valores PROVISÓRIOS isolados em ponto único (bom!), mas se o deploy acontecer antes do probe, o filtro vira no-op silencioso — Conexos retorna todas as PROFORMA, snapshot inflado, painel mostra números errados.

- **Melhoria Proposta**
  > Tactic: **Defer Binding (plugin) + guarda explícita**. Adicionar (a) flag de feature `PERMUTAS_FILTER_PROBE_CONFIRMED` no `EnvironmentProvider` (default `false`); (b) `EleicaoPermutasService.executar` lança erro de bootstrap se a flag não estiver `true` em prod (NODE_ENV='production'); (c) teste de bootstrap garante que o erro é claro ("probe `ADIANTAMENTO_FILTER_KEY` não confirmado"). Ou alternativamente: documentar o probe como gate de release no CHANGELOG.

- **Resultado Esperado**
  > Probe esquecido vira erro de boot, não snapshot inflado em produção.

- **Tactic alvo**: Defer Binding (plugin)
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-6
- **Métricas de sucesso**:
  - probes em produção sem confirmação explícita: 1 → 0
- **Risco de não fazer**: snapshot da primeira run em produção pode ser tudo `bloqueada(falha-gate)` (sem filtro), perda de confiança no painel logo na primeira impressão.
- **Dependências**: nenhuma.

### [modifiability-7] Decidir destino de `MOTIVO_BLOQUEIO.MULTIPLAS_INVOICES` (emitir ou remover)

- **Problema**
  > Enum declara 5 motivos mas só 4 são emitidos. `MULTIPLAS_INVOICES` nunca é gerado — `CasamentoInvoiceService.ts:26-28` mapeia >1 invoice para `COMPOSTO_NM`. Comentário do enum afirma "distinguível do composto N:M (mesma família)" mas o código não distingue. Taxonomia ambígua.

- **Melhoria Proposta**
  > Tactic: **Increase Semantic Coherence**. Duas opções, decidir agora: (A) implementar a distinção real (`CasamentoInvoiceService` checa se as N invoices pertencem ao mesmo PROFORMA → `MULTIPLAS_INVOICES`; caso contrário → `COMPOSTO_NM`); ou (B) remover `MULTIPLAS_INVOICES` do enum e atualizar comentário. A leitura do código sugere que a intenção era (A); decidir com o Yuri.

- **Resultado Esperado**
  > 100% dos motivos do enum têm pelo menos 1 call-site emissor. Taxonomia de bloqueio é íntegra.

- **Tactic alvo**: Increase Semantic Coherence
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-7
- **Métricas de sucesso**:
  - motivos enum-only sem emissor: 1 → 0
- **Risco de não fazer**: quando a Fatia 2 (`composto-nm` vira backlog real) for implementada, alguém decide arbitrariamente o que `MULTIPLAS_INVOICES` significa e a auditoria histórica desalinha.
- **Dependências**: 1 pergunta para o Yuri (registrar em `_inbox/`).

### [modifiability-8] Mover `bootstrapAppContainer` do handler para o startup do `index.ts`

- **Problema**
  > Cada handler de `routes/permutas.ts` chama `await bootstrapAppContainer()` antes de `container.resolve(...)`. O flag `bootstrapped` faz o trabalho ficar barato, mas mistura responsabilidade de startup com responsabilidade de request handling. Quando a próxima rota for adicionada (Fatia 2), o padrão se replica.

- **Melhoria Proposta**
  > Tactic: **Increase Semantic Coherence** + **Encapsulate**. Chamar `await bootstrapAppContainer()` UMA vez em `index.ts` antes de `app.listen` (já existe ordem de bootstrap no skeleton); remover das rotas. As rotas só fazem `container.resolve(...)`.

- **Resultado Esperado**
  > 0 chamadas a `bootstrapAppContainer` em arquivos de rota. Bootstrap centralizado, mais alinhado com migração futura para Lambda (cold-start vs handler).

- **Tactic alvo**: Increase Semantic Coherence
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-8
- **Métricas de sucesso**:
  - call-sites de `bootstrapAppContainer` em `routes/*`: 2 → 0
- **Risco de não fazer**: padrão se replica em cada nova rota; quando migrar para Lambda, cada handler herda o reboot pattern.
- **Dependências**: alinhar com a rota legada `routes/conexos.ts` (verificar se ela também chama bootstrap — se sim, refatorar junto).

## 6. Notas do agente

- Escopo limitado ao delta da Fatia 1 (READ-ONLY) conforme `_shared-metrics.md`. NÃO avaliei legado `services/conexos.ts` (única fonte dos 4 warnings de cognitive-complexity do lint).
- Cross-QA detectado para o consolidator: (i) **F-modifiability-1** (fil_cod drift) também é Testability — repository test não capturou a omissão; (ii) **F-modifiability-2** (PAGE_SIZE dup) e **F-modifiability-3** (constantes de tenant) sobrepõem com **Deployability** — cada mudança vira redeploy; (iii) **F-modifiability-4** (split preventivo do orquestrador) sobrepõe com **Testability** (orquestrador grande = setup test mais caro) e **Integrability** (Refactor/Encapsulate); (iv) **F-modifiability-6** (probe placeholder) sobrepõe com **Fault-tolerance** (snapshot inflado é falso-positivo silencioso).
- `--quick`: NÃO rodei `madge` para circular deps (não disponível). Inspeção por mão dos 13 imports do orquestrador → 0 ciclo detectado. Coverage % não medido.
- `MS_PER_DAY = 24*60*60*1000` em `AgingService.ts:3` é conversão de unidade pura — NÃO contei como magic number de regra de negócio. `PAGE_SIZE`/`MAX_PAGES` contei porque influenciam telemetria e cap real.
- Score 7.5/10: tactics estruturais (Split, Increase Cohesion, Restrict Deps, DI) estão sólidas; Defer Binding é o ponto fraco (constantes em código) + 1 bug de coerência schema↔código (P0). Sem o P0 do `fil_cod`, score subiria para 8.5.
