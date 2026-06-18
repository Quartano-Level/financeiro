---
qa: Modifiability
qa_slug: modifiability
run_id: 2026-06-18-2158
agent: qa-modifiability
generated_at: 2026-06-18T21:58:00-03:00
scope: backend+frontend (tweak `casamento-manual` apenas)
score: 7.5
findings_count: 5
cards_count: 4
---

# Modifiability — Regis-Review (tweak `casamento-manual`)

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Produto/Analista financeiro | Decide adicionar / renomear / dividir um estado da elegibilidade da PermutaCandidata (ADR-0005 acaba de introduzir `casamento-manual`; Fatia 2 já prevê novos sub-estados de "casamento manual confirmado/baixado") | Cadeia `EstadoElegibilidade → ElegibilidadeService → IngestaoPermutasService.toEstadoRow → PermutaRelationalRepository (union + CHECK) → GestaoPermutasService.toPendente → Gestao.ts (StatusElegibilidade) → frontend types.ts + page.tsx + permutas-fixture.ts + api.ts` | Tempo de desenvolvimento, com testes verdes (pipeline `/feature-tweak`) | Adicionar / alterar / remover um estado em ≤1 dia, com 1 ponto canônico de definição e migration SQL idempotente. Nenhum literal `'casamento-manual'` órfão. | Nº de arquivos tocados por mudança de estado ≤ 6; nº de string literais duplicados do mesmo estado ≤ 2 (constante backend + tipo TS frontend); zero `if/switch` de mapeamento estado→string. |

> Tradução curta: "Yuri decide que o N:M precisa virar 2 sub-estados (`casamento-manual-pendente` / `casamento-manual-em-baixa`) na Fatia 2 → quantos arquivos a mudança ressoa, e em quantos lugares o literal precisa ser editado em sintonia?"

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Arquivos não-teste tocados por este tweak | 9 (`EstadoElegibilidade.ts`, `ElegibilidadeService.ts`, `IngestaoPermutasService.ts`, `GestaoPermutasService.ts`, `PermutaRelationalRepository.ts`, `PermutaSnapshotRepository.ts`, `Gestao.ts`, `frontend/lib/types.ts`, `frontend/app/permutas/page.tsx` + fixture + api + migration 0005) | ≤ 6 | ⚠️ | `git status` |
| Ocorrências do literal `'casamento-manual'` em código não-teste | 15 em 8 arquivos | ≤ 4 (1 const backend + 1 union backend + 1 union frontend + 1 migration) | ⚠️ | `grep -rn "'casamento-manual'" src --include='*.ts' --include='*.tsx' \| grep -v test` |
| Sites com `switch/if` mapeando `EstadoElegibilidade → string-da-coluna/UI` | 4 (`IngestaoPermutasService.toEstadoRow` L219-232, `GestaoPermutasService.toPendente` L93-98, `PermutaSnapshotRepository.insertCandidataChunk` L247-250, `frontend page.tsx StatusBadge` L40-65) | ≤ 2 (1 backend collapse para snapshot legacy + 1 UI presentational) | ⚠️ | leitura dos 4 arquivos |
| Sites onde a constante `ESTADO_ELEGIBILIDADE.CASAMENTO_MANUAL` é usada (versus o literal cru) | 2 (`ElegibilidadeService.ts` L113, `IngestaoPermutasService.ts` L225 e `toCasamentoRows` L278) | ≥ 4 backend | ❌ | grep `CASAMENTO_MANUAL` |
| Backend union duplicada entre `AdiantamentoRow.estadoElegibilidade` (L20) e `listAdiantamentosAtivos.filtro` (L431) | 2 cópias literais idênticas | 1 (alias `EstadoColunaElegibilidade`) | ⚠️ | `PermutaRelationalRepository.ts:20,431` |
| Backend ↔ frontend type duplication (`StatusElegibilidade` em `Gestao.ts:8` e `frontend/lib/types.ts:25`) | 2 cópias mirroradas manualmente | 1 fonte (gerador OpenAPI / shared package) ou contrato testado | ⚠️ | `Gestao.ts:8` + comentário "espelham EXATAMENTE" |
| CHECK constraint SQL duplicando a union TS | 1 lugar (`migrations/0005_estado_casamento_manual.sql:24`) — ok, drift detectável só em runtime | 1 lugar + teste de contrato | ⚠️ | `migrations/0005_*.sql:20-24` |
| ADR registrado para a mudança | sim — `ontology/decisions/0005-estado-casamento-manual.md` (com contexto, decisão, consequências e alternativas) | obrigatório | ✅ | `ontology/decisions/0005-*.md` |
| Cobertura de teste do novo estado | 4 sites (`ElegibilidadeService.test.ts:66`, `IngestaoPermutasService.test.ts:217`, `GestaoPermutasService.test.ts:121`, `permutas-fixture.ts:102`) | ≥ 1 por site de mapeamento | ✅ | grep nos `*.test.ts` |
| Cognitive complexity dos sites tocados (Biome `noExcessiveCognitiveComplexity` = warn 15) | nenhum site tocado excede 15 — `toEstadoRow` é switch puro (≈3), `toPendente` é cadeia ternária (≈4), `StatusBadge` (≈4) | ≤ 15 | ✅ | leitura + `biome.json` |

> ⚠️ **Não medível localmente sem rodar suite**: tempo real de execução do `/feature-tweak` para este tweak. Recomendação: cronometrar o próximo tweak similar (split de estado) e comparar com o baseline observado nas mudanças deste PR.

## 3. Tactics — Cobertura no nf-projects (escopo: `casamento-manual`)

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Split Module** | Não aplicável a este tweak — nenhum arquivo cresceu acima do teto (max=529 em `PermutaRelationalRepository.ts`, já era esse tamanho antes; o tweak adicionou ≈4 linhas). | N/A — o tweak não criou problema de tamanho. | `wc -l` nos arquivos tocados |
| **Increase Semantic Coherence** | `ElegibilidadeService` permanece coerente: avalia gates + casamento → estado. O ADR-0005 reforça a coerência ao separar "reprovado por mérito" (`bloqueada`) de "pronto, aguardando humano" (`casamento-manual`). | ✅ presente | `ElegibilidadeService.ts:102-117` + `0005-estado-casamento-manual.md` §Contexto |
| **Encapsulate** (estado-como-constante) | Constantes tipadas `ESTADO_ELEGIBILIDADE.CASAMENTO_MANUAL` existem (`EstadoElegibilidade.ts:18`) — mas só 2 sites de mapeamento as usam; os outros 13 usam o literal cru `'casamento-manual'`. **Encapsulamento parcial**: o token existe mas o domínio "vaza" para strings em vários seams. | ⚠️ parcial | `IngestaoPermutasService.ts:225` usa a constante; `GestaoPermutasService.ts:96-97`, `PermutaSnapshotRepository.ts:247-250`, `frontend/page.tsx:47,110,223-224` usam o literal. |
| **Use an Intermediary** | Mapeamento estado-de-domínio → coluna SQL / DTO está em 3 funções privadas inline (`toEstadoRow`, `toPendente`, `insertCandidataChunk`'s status ternary), todas privadas a serviços/repositórios distintos. Não há um `EstadoElegibilidadeCodec` único. | ⚠️ parcial | 3 sites listados acima |
| **Restrict Dependencies** | Camadas DDD respeitadas no tweak: o frontend importa de `lib/types.ts`, não de `domain/`. Backend não tem layer-skip. PatternGuardian permanece verde. | ✅ presente | `frontend/app/permutas/page.tsx:10` importa de `@/lib/types` |
| **Refactor** | `GestaoPermutasService.toPendente` (L93-98) usa ternário aninhado para 3 estados. Aceitável agora; se Fatia 2 adicionar 2-3 sub-estados, vira **Refactor candidate** (substituir por `Record<EstadoColuna, StatusElegibilidade>` ou um codec). | ⚠️ parcial — aceitável hoje, frágil amanhã | `GestaoPermutasService.ts:93-98` |
| **Abstract Common Services** | Sem codec compartilhado entre backend/frontend. `StatusElegibilidade` é mirrorado manualmente (`Gestao.ts:8` + `frontend/lib/types.ts:25`); o comentário "espelham EXATAMENTE" reconhece a duplicação. | ❌ ausente | `Gestao.ts:3-5` (comentário) + `types.ts:24-25` |
| **Defer Binding — configuration files** | Não aplicável: o conjunto de estados é parte do **modelo de domínio**, não de configuração externa. Mapeamento de **rótulos UI** (`MOTIVO_LABEL`, `FILTRO_VAZIO_LABEL`) está externalizado em consts dentro do componente — ok para Fatia 1, mas se i18n entrar vira refactor. | ✅ presente (consts) / N/A (config externa) | `page.tsx:30-37, 107-111` |
| **Defer Binding — polymorphism / runtime registration** | tsyringe é usado, mas não há polimorfismo runtime sobre `EstadoElegibilidade` — não cabe a este eixo. | N/A | — |

## 4. Findings (achados)

### F-modifiability-1: Mapeamento `EstadoElegibilidade → string-da-coluna/DTO` espalhado em 4 sites com literal cru

- **Severidade**: P2 (médio — débito técnico defensável; o type-system já previne typo, mas a "mesma decisão" mora em 4 lugares)
- **Tactic violada**: *Abstract Common Services* / *Use an Intermediary*
- **Localização**:
  - `src/backend/domain/service/permutas/IngestaoPermutasService.ts:219-232` — `toEstadoRow` (switch — usa a constante, mas a string-alvo é literal)
  - `src/backend/domain/service/permutas/GestaoPermutasService.ts:93-98` — `toPendente` (ternário, usa literal cru em ambos lados)
  - `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts:247-250` — colapso `casamento-manual → 'bloqueada'` para o snapshot legacy (literal cru)
  - `src/frontend/app/permutas/page.tsx:40-65, 107-111, 223-224` — `StatusBadge`, `FILTRO_VAZIO_LABEL`, filtro
- **Evidência (objetiva)**:
  ```ts
  // IngestaoPermutasService.ts:223-228
  case ESTADO_ELEGIBILIDADE.ELEGIVEL:    return 'elegivel';
  case ESTADO_ELEGIBILIDADE.CASAMENTO_MANUAL: return 'casamento-manual';
  case ESTADO_ELEGIBILIDADE.BLOQUEADA:  return 'bloqueada';

  // GestaoPermutasService.ts:93-98 — NÃO usa a constante
  const status: StatusElegibilidade =
      a.estadoElegibilidade === 'elegivel'      ? 'elegivel'
    : a.estadoElegibilidade === 'casamento-manual' ? 'casamento-manual'
    : 'bloqueada';

  // PermutaSnapshotRepository.ts:247-250 — collapse explícito legacy
  const status = candidata.estadoElegibilidade === ESTADO_ELEGIBILIDADE.ELEGIVEL
      ? 'elegivel'
      : 'bloqueada';
  ```
- **Impacto técnico**: a próxima alteração de estado (Fatia 2 prevê isso) precisará tocar **4 sites de mapeamento + 2 unions + 1 CHECK SQL** sintonizados. Se algum for esquecido, o type-system pega 3 (unions); o **collapse do snapshot** (P0-4) é **invisível** ao compilador — esquecer de mapear o novo estado lá grava `'bloqueada'` silenciosamente, exatamente o problema que ADR-0005 tentou evitar.
- **Impacto de negócio**: KPI honesto na `/gestao` depende da consistência dos 3 sites; o `/painel` legacy depende do collapse. Inconsistência → "Casamento manual" some da UI ou aparece como bloqueada em uma das telas → analista vê 2 números diferentes para a mesma realidade.
- **Métrica de baseline**: 4 sites de mapeamento, 15 literais `'casamento-manual'` em código não-teste, 2 unions backend duplicadas (`PermutaRelationalRepository.ts:20` e `:431`).

### F-modifiability-2: Backend ↔ frontend `StatusElegibilidade` mirrorado manualmente

- **Severidade**: P2 (médio — assumido como dívida deliberada no comentário; risco real só quando a primeira tela divergir)
- **Tactic violada**: *Abstract Common Services*
- **Localização**: `src/backend/domain/interface/permutas/Gestao.ts:3-8` ↔ `src/frontend/lib/types.ts:19-25`
- **Evidência (objetiva)**:
  ```ts
  // Gestao.ts:3-5 — o próprio código admite a duplicação
  /**
   * Shapes da resposta `GET /permutas/gestao` — espelham EXATAMENTE
   * `src/frontend/lib/types.ts` (a tela consome este JSON diretamente).
   */
  export type StatusElegibilidade = 'elegivel' | 'bloqueada' | 'casamento-manual';
  ```
- **Impacto técnico**: cada novo estado obriga edição em DOIS arquivos sem nenhum mecanismo automatizado garantindo paridade. Type-check não detecta drift (cada lado compila isolado). Detecção só na primeira execução E2E.
- **Impacto de negócio**: regressão silenciosa de contrato API → frontend = bug que só aparece em produção (badge ausente, filtro quebrado).
- **Métrica de baseline**: 2 cópias do union, 2 cópias da interface `PermutaPendente`, 2 cópias da interface `GestaoPermutasResponse.totais`. Este tweak já tocou ambas, comprovando que a duplicação NÃO é teórica.

### F-modifiability-3: Union literal `'descoberta' | 'elegivel' | 'bloqueada' | 'casamento-manual'` duplicada dentro do mesmo repositório

- **Severidade**: P3 (baixo — extração trivial, sem risco em runtime; mas é literalmente um copy-paste no mesmo arquivo)
- **Tactic violada**: *Encapsulate*
- **Localização**: `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts:20` (em `AdiantamentoRow`) e `:431` (em `listAdiantamentosAtivos.filtro`)
- **Evidência (objetiva)**:
  ```ts
  // L20
  estadoElegibilidade: 'descoberta' | 'elegivel' | 'bloqueada' | 'casamento-manual';
  // L431
  estadoElegibilidade?: 'descoberta' | 'elegivel' | 'bloqueada' | 'casamento-manual';
  ```
- **Impacto técnico**: adicionar um estado obriga editar duas posições no MESMO arquivo. TS permite que fiquem dessincronizadas.
- **Impacto de negócio**: nenhum direto; é higiene. Mas cada incidente de drift adiciona ~30min de debug.
- **Métrica de baseline**: 2 ocorrências do union idêntico no mesmo arquivo.

### F-modifiability-4: CHECK constraint SQL fora-de-banda da union TS — drift detectável só em runtime

- **Severidade**: P2 (médio — drift entre código e schema é classe conhecida de bug; mitigação parcial via ADR + migration idempotente)
- **Tactic violada**: *Abstract Common Services* (entre código TS e schema SQL)
- **Localização**: `src/backend/migrations/0005_estado_casamento_manual.sql:20-24` ↔ `PermutaRelationalRepository.ts:20,431` ↔ `EstadoElegibilidade.ts:8-19`
- **Evidência (objetiva)**:
  ```sql
  -- 0005_estado_casamento_manual.sql:20-24
  ALTER TABLE permuta_adiantamento
      DROP CONSTRAINT IF EXISTS permuta_adiantamento_estado_elegibilidade_check;
  ALTER TABLE permuta_adiantamento
      ADD CONSTRAINT permuta_adiantamento_estado_elegibilidade_check
          CHECK (estado_elegibilidade IN ('descoberta', 'elegivel', 'bloqueada', 'casamento-manual'));
  ```
- **Impacto técnico**: TS compila feliz mesmo se um novo estado for adicionado em código e a migration esquecida → INSERT explode em runtime com erro 23514. Não há teste de contrato comparando a constante TS com a CHECK efetiva.
- **Impacto de negócio**: regressão durante ingestão diária → cabeçalho `error` + zero ROWS persistidas → `/gestao` mostra dia velho. Sem alarme imediato (a tabela last-good ainda funciona).
- **Métrica de baseline**: 1 lugar de definição em SQL, 3 lugares de definição em TS (constante + 2 unions), zero teste assertando paridade.

### F-modifiability-5: Sem `EstadoElegibilidadeCodec` único — Encapsulate parcial

- **Severidade**: P3 (baixo — refactor incremental; o tweak atual foi feito em ≤1d, mostrando que o sistema ainda é modificável)
- **Tactic violada**: *Encapsulate* / *Use an Intermediary*
- **Localização**: ausência — não existe `src/backend/domain/service/permutas/EstadoElegibilidadeCodec.ts` (ou nome equivalente)
- **Evidência (objetiva)**: as funções `toEstadoRow` e `toPendente` reconstroem mapeamentos `domain ↔ coluna ↔ DTO` inline em serviços diferentes. Nenhuma vive em um lugar canônico.
- **Impacto técnico**: cada novo seam (e.g., novo endpoint de export Excel, fila SQS) reinventa o mapeamento.
- **Impacto de negócio**: dívida acumulável; isolada hoje, dolorosa em ≥3 seams futuros.
- **Métrica de baseline**: 4 mapeamentos vivendo em 4 funções privadas; alvo = 1 codec + 1 collapse de snapshot legacy explicitamente nomeado.

## 5. Cards Kanban

### [modifiability-1] Extrair codec único `EstadoElegibilidadeCodec` para mapear domínio ↔ coluna SQL ↔ DTO

- **Problema**
  > A regra "como o estado de domínio vira string na coluna/DTO" mora hoje em 4 funções privadas distintas (`IngestaoPermutasService.toEstadoRow`, `GestaoPermutasService.toPendente`, `PermutaSnapshotRepository.insertCandidataChunk` ternary, frontend `StatusBadge`). 15 ocorrências do literal `'casamento-manual'` em 8 arquivos. Type-system pega typos de chave (constante `as const`), mas não detecta a regra "esqueci de mapear esse estado em um seam". O collapse `casamento-manual → 'bloqueada'` no snapshot legacy (ADR-0005 §4) é INVISÍVEL ao compilador e foi a motivação direta do ADR.

- **Melhoria Proposta**
  > Criar `src/backend/domain/service/permutas/EstadoElegibilidadeCodec.ts` `@injectable()` com 3 métodos: `toRelationalColumn(estado): AdiantamentoRow['estadoElegibilidade']`, `toSnapshotColumnLegacy(estado): 'elegivel' | 'bloqueada'` (colapso explícito, com JSDoc apontando para ADR-0005 §4), `toStatusDto(coluna): StatusElegibilidade`. Substituir `toEstadoRow`, o ternário de `toPendente` e o ternário inline de `insertCandidataChunk` por chamadas ao codec. Tactic: **Use an Intermediary**.

- **Resultado Esperado**
  > 1 lugar canônico de mapeamento; `Ctrl-F` no literal `'casamento-manual'` cai de 15 para ≤6 (constante + union backend + union frontend + 2 testes de codec + migration). Adicionar um estado novo passa a tocar: constante + codec (1 método cada) + union do repositório + migration. Métrica: sites de mapeamento 4 → 1, ocorrências do literal não-teste 15 → ≤6.

- **Tactic alvo**: Use an Intermediary / Encapsulate
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-1, F-modifiability-5
- **Métricas de sucesso**:
  - Sites com switch/if mapeando estado→string: 4 → 1
  - Ocorrências de `'casamento-manual'` em não-teste: 15 → ≤6
  - Testes diretos do codec: 0 → ≥3 (cobrindo cada método)
- **Risco de não fazer**: na Fatia 2 (sub-estados de casamento-manual), a probabilidade de drift entre os 4 sites cresce linearmente; mais cedo ou mais tarde alguém esquece o collapse do snapshot e quebra o `/painel` legacy silenciosamente.
- **Dependências**: nenhuma — refactor puro, não toca contrato externo.

### [modifiability-2] Garantir paridade backend ↔ frontend de `StatusElegibilidade` por contrato testado

- **Problema**
  > `StatusElegibilidade` é definido em `src/backend/domain/interface/permutas/Gestao.ts:8` E em `src/frontend/lib/types.ts:25`. O comentário em `Gestao.ts:3-5` admite que os dois "espelham EXATAMENTE" — mas nada garante isso. Este próprio tweak comprovou a duplicação: a mesma alteração teve que ser feita em dois arquivos não-relacionados. Drift = bug silencioso de produção (badge ausente, filtro quebrado).

- **Melhoria Proposta**
  > Caminho mais leve: adicionar um teste de contrato (`Gestao.contract.test.ts`) que importe a union backend e compare `Object.keys` / valores com uma constante exportada do frontend (via path relativo ou um snapshot JSON intermediário gerado no build). Tactic: **Abstract Common Services**. Caminho mais pesado (futuro): mover os DTOs de `permutas/Gestao` para um pacote shared `src/shared/permutas-types.ts` consumido por backend e frontend, OU gerar tipos via OpenAPI do `GET /permutas/gestao`.

- **Resultado Esperado**
  > Drift entre `Gestao.ts` e `frontend/lib/types.ts` falha o CI ANTES do PR mergeable. Esforço marginal de manutenção = 0 (o teste roda automaticamente).

- **Tactic alvo**: Abstract Common Services
- **Severidade**: P2
- **Esforço estimado**: S (≤1d para o teste de contrato); M (2–5d para shared package)
- **Findings relacionados**: F-modifiability-2
- **Métricas de sucesso**:
  - Cópias de `StatusElegibilidade` não-cobertas por teste de paridade: 2 → 0
  - PRs que tocaram um lado sem tocar o outro: hoje impossível detectar; alvo = visibilidade total no CI
- **Risco de não fazer**: o primeiro tweak que tocar só um lado (e.g., refactor frontend que renomeie um estado) introduz contrato quebrado que só pega em smoke manual.
- **Dependências**: nenhuma (versão "teste de contrato"); a versão "shared package" exige refactor de imports.

### [modifiability-3] Teste de paridade union TS ↔ CHECK SQL

- **Problema**
  > O conjunto de estados aceitos pela coluna `permuta_adiantamento.estado_elegibilidade` vive em 4 lugares: `EstadoElegibilidade.ts:8-19` (constante), `PermutaRelationalRepository.ts:20` (union), `PermutaRelationalRepository.ts:431` (union duplicada), `migrations/0005_estado_casamento_manual.sql:24` (CHECK). Adicionar um estado e esquecer a migration → INSERT 23514 em produção, ingestão diária aborta, `/gestao` mostra dia velho sem alarme imediato.

- **Melhoria Proposta**
  > Teste de integração (já há suite contra Postgres real para este repositório) que faça `SELECT pg_get_constraintdef(oid)` da `permuta_adiantamento_estado_elegibilidade_check` e compare com `Object.values(ESTADO_ELEGIBILIDADE)`. Falha o teste se houver drift em qualquer direção. Tactic: **Abstract Common Services** (entre código e schema).

- **Resultado Esperado**
  > Esquecer migration ao adicionar estado vira erro de CI determinístico. Custo de manutenção do teste = ~5 linhas.

- **Tactic alvo**: Abstract Common Services
- **Severidade**: P2
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-modifiability-4
- **Métricas de sucesso**:
  - Cobertura de drift TS ↔ SQL: 0 → 100% para `estado_elegibilidade`
  - Tempo médio para detectar drift: pós-deploy/runtime → CI
- **Risco de não fazer**: Fatia 2 vai mexer nessa CHECK; alta probabilidade de drift se não houver gate.
- **Dependências**: precisa do harness de teste contra Postgres já presente (`IngestaoPermutasService.test.ts` indica que existe).

### [modifiability-4] Deduplicar union `AdiantamentoRow.estadoElegibilidade` dentro do repositório

- **Problema**
  > `PermutaRelationalRepository.ts:20` e `:431` carregam o mesmo union literal copiado. Trivial — mas é dívida higiênica que cresce a cada estado.

- **Melhoria Proposta**
  > Extrair `export type EstadoColunaElegibilidade = 'descoberta' | 'elegivel' | 'bloqueada' | 'casamento-manual'` no topo do arquivo (ou em `EstadoElegibilidade.ts` ao lado da constante, exportado a partir da constante via `(typeof ESTADO_ELEGIBILIDADE)[keyof typeof ESTADO_ELEGIBILIDADE] | 'descoberta'`). Substituir as duas posições. Tactic: **Encapsulate**.

- **Resultado Esperado**
  > 1 declaração; impossível ficarem dessincronizadas.

- **Tactic alvo**: Encapsulate
- **Severidade**: P3
- **Esforço estimado**: S (≤1d, ~10min real)
- **Findings relacionados**: F-modifiability-3
- **Métricas de sucesso**:
  - Cópias do union no `PermutaRelationalRepository.ts`: 2 → 1
- **Risco de não fazer**: cosmético; mas pode ser feito junto com o card 1 sem custo extra.
- **Dependências**: nenhuma; idealmente bundle com card 1.

## 6. Notas do agente

- **Decisão de escopo (auto-mode):** review limitada exatamente aos arquivos do diff `feat/permutas-painel-elegiveis` do tweak `casamento-manual`. Não foi rodado scan de complexidade no repositório inteiro nem ranking de fan-in/LOC global — o consolidator deve juntar com a review de modifiability "full" se ela existir. Os requisitos de "top-10 largest files / top-10 fan-in" do prompt original NÃO se aplicam a uma review escopada ao tweak; declarado explicitamente em vez de fabricar dados.
- **Veredito do KEY CONCERN:** o mapeamento estado→string duplicado em ~4 sites é **P2, NÃO P0**. Justificativa: (i) `ESTADO_ELEGIBILIDADE` é `as const` + type-system pega typos de chave; (ii) cobertura de teste do novo estado está nos 4 sites (`ElegibilidadeService.test:66`, `IngestaoPermutas.test:217`, `GestaoPermutas.test:121`, fixture FE); (iii) Biome cognitive complexity ok; (iv) o tweak inteiro coube em <1d com gates verdes. Não é crítico — é dívida concreta que vai morder na Fatia 2 (sub-estados de casamento-manual). Card 1 (codec) endereça em ≤1d.
- **Cross-QA links para o consolidator:**
  - **Testability:** o card 3 (paridade TS ↔ CHECK SQL) e o card 2 (paridade backend ↔ frontend) são contratos testáveis — sinal positivo para qa-testability; se a sugestão de teste E2E aparecer em outra QA, casar.
  - **Integrability:** o backend ↔ frontend mirror manual (F-modifiability-2) é um problema de Integrability tanto quanto de Modifiability (ausência de contrato unificado). Sinalizar à qa-integrability.
  - **Deployability:** migration `0005` é idempotente e segue o padrão da `0001` — não há acoplamento código↔schema redeploy aqui além do CHECK; nenhum magic-number novo introduzido. Nada para reportar como défice de Deployability neste tweak.
  - **Fault-tolerance:** o collapse explícito `casamento-manual → 'bloqueada'` no snapshot legacy (`PermutaSnapshotRepository.ts:247-250`) é **back-compat consciente** documentada em ADR-0005 §4 — ponto positivo, não finding.
