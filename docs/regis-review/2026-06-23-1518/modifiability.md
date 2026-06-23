---
qa: Modifiability
qa_slug: modifiability
run_id: 2026-06-23-1518
agent: qa-modifiability
generated_at: 2026-06-23T15:18:00-03:00
scope: backend+frontend (Permutas Fase 3 — write-back fin010)
score: 5
findings_count: 7
cards_count: 7
---

# Modifiability — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao nf-projects)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Desenvolvedor / contador da Columbia | Mudança no contrato de escrita do `fin010` (conta gerencial do juros muda, ou novo passo no handshake, ou parâmetro adicional do borderô) | `ReconciliacaoPermutaService`, `ConexosClient` (bloco WRITE), `Fin010Baixa.ts`, modal de Reconciliação em `page.tsx` | Feature já em produção em **dry-run**, prestes a virar write real (`CONEXOS_WRITE_ENABLED=true`) | Localizar mudança a 1 service + 1 client; sem tocar UI/repo | ≤ 2 arquivos por mudança típica; cognitive complexity ≤ 15 no service principal; tempo de mudança ≤ 1d (S) |

> Tradução narrativa: "Quando a equipe contábil disser 'a conta gerencial do juros agora é 132, não 131' ou 'a partir do próximo mês o juros vai para a conta gerencial vinda do título (não fixa)', a alteração deve ficar contida em um único ponto de configuração e não disparar redeploy. Hoje, ambos os cenários exigem editar código em `ReconciliacaoPermutaService.ts` e disparar o pipeline completo."

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| LOC `ReconciliacaoPermutaService.ts` | 352 | ≤ 300 | ⚠️ | `wc -l` |
| Cognitive complexity `reconciliar` (Biome) | **23** | ≤ 15 | ❌ | `npm run lint` `ReconciliacaoPermutaService.ts:71` |
| LOC `ConexosClient.ts` | **1608** | ≤ 600 | ❌ | `wc -l` |
| Métodos públicos em `ConexosClient` | 14 (read) + 5 (write) = **19 responsabilidades agregadas** | ≤ 10 ou separação read/write | ❌ | `grep -c "public " ConexosClient.ts` |
| Cognitive complexity em `ConexosClient.ts` linhas 458, 824 | 20, 24 | ≤ 15 | ❌ | `npm run lint` |
| LOC `frontend/app/permutas/page.tsx` | **2311** | ≤ 600 (componentes ≤ 300) | ❌ | `wc -l` |
| useState/useEffect/useMemo/useCallback no page.tsx | **44 hooks** numa única função `GestaoPermutasPage` | ≤ 15 por componente | ❌ | `grep -c useState\|useEffect…` |
| LOC `PermutaExecucaoRepository.ts` | 206 | ≤ 250 | ✅ | `wc -l` |
| LOC `Fin010Baixa.ts` (interfaces) | 77 | ≤ 150 | ✅ | `wc -l` |
| Duplicação `buildFinalPayload` ↔ `buildPreviewPayload` | 7 campos comuns codificados duas vezes (`filCod`, `docCod`, `bxaDocCod`, `titCod`, `bxaTitCod`, `bxaMnyJuros`, `bxaMnyDesconto`, `bxaCodGerJuros`) | ≤ 0 (extrair em `buildCommonPayloadBase`) | ⚠️ | `ReconciliacaoPermutaService.ts:285-340` |
| Magic numbers em regra de negócio | 2 constantes (`CONTA_GER_JUROS=131`, `GER_DES_JUROS`) coladas no service, comentadas como vindas do HAR | 0 (mover para SSM/EnvironmentProvider) | ❌ | `ReconciliacaoPermutaService.ts:14-16` |
| Hardcoded numeric literals no payload `fin010` | 12 (`bxaVldSistema:0`, `docTip:2`, `bxaVldCorrenteDc:1`, `borVldTipo:2`, `bxaVldAdto:1`, `titCod:1`, `bxaTitCod:1`, `bxaMnyMulta:0`, `bxaDocTip:2`, `frontModelName:'baixa'`, …) | ≤ 3 e nomeados em constants module | ❌ | `ReconciliacaoPermutaService.ts:285-318` |
| Fan-in `ConexosClient` (uses do write subset) | 1 (`ReconciliacaoPermutaService`) — write é coeso a um único consumidor | ≥ 1 (apenas confirma viabilidade de split) | ✅ | `grep -rln "criarBordero\|gravarBaixaPermuta"` |
| Fan-in `ConexosClient` global | 6 services | ≤ 8 | ✅ | `grep -rln "from.*ConexosClient"` |
| Externalização de `CONEXOS_WRITE_ENABLED`, `CONEXOS_DRY_RUN` | Via `EnvironmentProvider.getEnvironmentVars()` | runtime config | ✅ | `EnvironmentProvider.ts:69-70` |

### Apêndice — Top 10 maiores arquivos no escopo (linhas)

| # | Arquivo | LOC |
|---|---|---|
| 1 | `src/frontend/app/permutas/page.tsx` | **2311** |
| 2 | `src/backend/domain/client/ConexosClient.ts` | **1608** |
| 3 | `src/backend/domain/service/permutas/EleicaoPermutasService.ts` | 813 |
| 4 | `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts` | 618 |
| 5 | `src/backend/domain/service/permutas/IngestaoPermutasService.ts` | 418 |
| 6 | `src/backend/domain/service/permutas/GestaoPermutasService.ts` | 413 |
| 7 | `src/backend/routes/permutas.ts` | 406 |
| 8 | `src/backend/domain/repository/permutas/PermutaSnapshotRepository.ts` | 367 |
| 9 | `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts` | **352** |
| 10 | `src/backend/services/conexos.ts` (legacy adapter) | 315 |

### Apêndice — Funções com cognitive complexity > 15 (lint)

| Arquivo:linha | Complexidade | Limite |
|---|---|---|
| `ReconciliacaoPermutaService.ts:71` (`reconciliar`) | **23** | 15 |
| `ConexosClient.ts:824` | 24 | 15 |
| `ConexosClient.ts:458` | 20 | 15 |
| `GestaoPermutasService.ts:171` | 42 | 15 (fora do escopo Fase 3, mas adjacente) |

## 3. Tactics — Cobertura no nf-projects

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| **Split Module** | `ReconciliacaoPermutaService` mistura: (a) orquestração da iteração, (b) handshake do par, (c) build de 2 payloads, (d) extração de erro do axios. `ConexosClient` mistura read (14 métodos) com write fin010 (5 métodos) num único arquivo de 1608 LOC. `page.tsx` agrega 4 modais (ingestão, alocação simples, alocação cross-process/permuta múltipla, **reconciliação fin010**) num componente único de 2311 LOC. | ❌ ausente em 3 pontos | `ReconciliacaoPermutaService.ts:71-352`, `ConexosClient.ts:1-1608`, `page.tsx:497-2298` |
| **Increase Semantic Coherence** | A coerência semântica do `ReconciliacaoPermutaService` é alta (tudo gira em torno do par adto→invoice), mas `ConexosClient` perde: as 5 novas escritas só existem para a Fase 3 e não compartilham nada com `listProcessos`/`listAdiantamentosProforma`. Coerência do `page.tsx` está mais quebrada: o componente é o ponto de junção UI para todo o domínio Permutas. | ❌ ausente em `ConexosClient` / `page.tsx`; ✅ presente em `ReconciliacaoPermutaService` | `ConexosClient.ts:990-1147` (bloco WRITE isolado por comentário, sugere split limpo) |
| **Encapsulate** | Tipos de boundary `Fin010Baixa.ts` encapsulam o contrato do ERP com nomenclatura local (`BorderoCriado`, `TituloBaixaValidacao`, `BaixaGravada`). Bom. Mas a **conta gerencial do juros (`131`)** e a **descrição (`VARIAÇÃO CAMBIAL PASSIVA REALIZADA`)** não estão encapsuladas atrás de um plano de contas configurável: estão como `const` no topo do service. | ⚠️ parcial | `Fin010Baixa.ts:1-77` (bom); `ReconciliacaoPermutaService.ts:14-16` (ruim) |
| **Use an Intermediary** | `legacy.postGeneric` já serve como intermediário entre `ConexosClient` e o adapter de auth — boa contenção do "lado HTTP". Não há intermediário entre **regra contábil** (conta de juros, classificação juros vs desconto) e o payload `fin010` — o service decide e escreve direto. | ⚠️ parcial | `ConexosClient.ts:1009`, falta intermediário em `ReconciliacaoPermutaService.ts:206-209` |
| **Restrict Dependencies** | Camadas DDD respeitadas: o service só fala com `ConexosClient`, `EnvironmentProvider`, 3 repositories e `LogService`. Não há layer-skip. `page.tsx` chama `reconciliarAdiantamento` via fetch wrapper (camada `lib/`), sem importar tipos do backend. | ✅ presente | `ReconciliacaoPermutaService.ts:60-69` (DI limpa) |
| **Refactor** | `reconciliar` (cognitive 23) é candidato direto a refactor: extrair `(a) resolveExecutionMode(input,env)`, `(b) ensureBordero(borCod, params)`, `(c) processarAlocacaoUnica()` para baixar a função-mãe a ≤ 15. | ❌ ausente | `ReconciliacaoPermutaService.ts:71-165` (lint warning ativo) |
| **Abstract Common Services** | `buildPreviewPayload` (l.321-340) e `buildFinalPayload` (l.265-318) **duplicam** 8 campos: `filCod`, `docCod`, `bxaDocCod`, `titCod`, `bxaTitCod`, `bxaMnyJuros`, `bxaMnyDesconto`, `bxaCodGerJuros`. Não há `buildPayloadBase` compartilhado. Risco direto: quando o ERP exigir um novo campo, esquecer no preview → preview engana o usuário. | ❌ ausente | `ReconciliacaoPermutaService.ts:265-340` |
| **Defer Binding — Configuration files** | Guard-rails `CONEXOS_WRITE_ENABLED` / `CONEXOS_DRY_RUN` corretamente via `EnvironmentProvider` (Rule #8 honrada). **Mas** a conta gerencial do juros (`131`) é um valor de **negócio** (plano de contas do cliente), não de **infra/segurança** — está colado no código. Trocar conta = redeploy. | ⚠️ parcial | `EnvironmentProvider.ts:69-70` (ok para flags); `ReconciliacaoPermutaService.ts:15` (ruim para regra contábil) |
| **Defer Binding — Polymorphism** | Não há `IFin010Writer` com implementação `LiveFin010Writer` vs `DryRunFin010Writer`. O dry-run é controlado por `if (dryRun)` dentro do mesmo método. | ❌ ausente | `ReconciliacaoPermutaService.ts:111-126` (branching), `ConexosClient.ts:1009-1147` (sem interface) |
| **Defer Binding — Plugin patterns / Runtime registration** | tsyringe registra os clients globalmente; sem tokens nomeados para múltiplas impls de `ConexosClient`. Aceitável (mono-tenant por ora). | N/A (mono-tenant inicial — documentar quando virar SaaSo) | `container.resolve(ConexosClient)` |

## 4. Findings (achados)

### F-modifiability-1: `reconciliar` excede cognitive complexity 23 (limite 15)

- **Severidade**: P1
- **Tactic violada**: Refactor / Split Module
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:71-165`
- **Evidência (objetiva)**:
  ```
  domain/service/permutas/ReconciliacaoPermutaService.ts:71:86
  ! Excessive complexity of 23 detected (max: 15).
  > 71 │ public reconciliar = async (input: ReconciliarInput): Promise<ReconciliarResult> => {
  ```
  O método mistura: validação de input (l.74-85), resolução de modo dry-run/real (l.88-91), loop sobre alocações (l.96-156), branching dry-run (l.111-126), criação preguiçosa de borderô (l.130-133), happy-path de execução (l.134-135), e catch com markError + log + push (l.136-155).
- **Impacto técnico**: Cada mudança no contrato do ERP (novo passo, novo campo, nova classificação além de JUROS/DESCONTO) força quem altera a navegar 95 linhas de orquestração misturada. Próximas mudanças tenderão a inflar o método (cada `if` novo é mais 1 ponto de complexidade) até que o lint vire bloqueante.
- **Impacto de negócio**: A Fase 3 é o **risco arquitetural #1** do roadmap (write no ERP, dinheiro real). Função difícil de ler = bug contábil mais provável = baixa errada no `fin010` exige reconciliação manual com o Conexos.
- **Métrica de baseline**: cognitive complexity = 23 (target ≤ 15).

### F-modifiability-2: `ConexosClient.ts` em 1608 LOC mistura read (legado) com write (Fase 3)

- **Severidade**: P1
- **Tactic violada**: Split Module / Increase Semantic Coherence
- **Localização**: `src/backend/domain/client/ConexosClient.ts:1-1608` (bloco write em 992-1147)
- **Evidência (objetiva)**:
  ```
  $ grep -c "^    public " ConexosClient.ts → 17 métodos públicos
  $ wc -l ConexosClient.ts → 1608
  Linhas 992-997 já isolam um banner-comentário "WRITE — fin010 baixa/permuta (Fase 3)"
  reconhecendo a fronteira semântica.
  ```
- **Impacto técnico**: Qualquer mudança em métodos read (ex.: paginação do `listFinanceiroAPagar`) força o teste e o re-deploy do cliente que também contém a escrita no ERP. Concorrência de mudanças entre devs aumenta risco de merge conflict no mesmo arquivo. Lint reporta 2 funções com cognitive 20 e 24 no read; manutenção no read pode regredir o write sem que ninguém perceba (mesmo arquivo, mesmos imports).
- **Impacto de negócio**: A separação read/write é **blast-radius**: bug em método read não pode parar o caminho de write quando o write virar produção. Dividir agora (antes do `CONEXOS_WRITE_ENABLED=true`) é barato; depois é custoso.
- **Métrica de baseline**: 1608 LOC (target ≤ 600); 19 métodos (target ≤ 10 por classe).

### F-modifiability-3: `frontend/app/permutas/page.tsx` em 2311 LOC, 44 hooks, 4 modais num único componente

- **Severidade**: P1
- **Tactic violada**: Split Module / Increase Semantic Coherence
- **Localização**: `src/frontend/app/permutas/page.tsx:497-2298` (corpo do componente `GestaoPermutasPage`)
- **Evidência (objetiva)**:
  ```
  $ wc -l page.tsx → 2311
  $ grep -c "useState\|useEffect\|useMemo\|useCallback" page.tsx → 44
  $ grep -n "<Dialog" page.tsx → 4 Dialogs aninhados no mesmo retorno JSX:
      - ingestão manual
      - alocação simples (1:1)
      - permuta múltipla manual (cross-process, ADR-0007/0008)
      - reconciliação fin010 (Fase 3 — adicionado nesta feature, l.2174-2293)
  ```
- **Impacto técnico**: O componente tem 44 hooks no escopo da mesma função. Adicionar um quinto modal (provável: confirmação de erro/reversão da baixa) tende a transformar isso em 50+ hooks com dependencies array compartilhadas. Re-render se propaga por toda a página a cada `setReconcil*`. Toda mudança no modal de reconciliação trafega pelo mesmo arquivo onde mora a tabela de pendentes — pull request gigante = revisão superficial.
- **Impacto de negócio**: Velocidade de mudança da UI Permutas cai a cada feature; tempo de onboarding de novo dev frontend dispara; risco de regressão visual em modais não relacionados ao escopo do PR.
- **Métrica de baseline**: 2311 LOC (target ≤ 600); 44 hooks no mesmo componente (target ≤ 15).

### F-modifiability-4: Conta gerencial do juros (`131`) hardcoded como `const` no service

- **Severidade**: P1
- **Tactic violada**: Defer Binding / Encapsulate
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:14-16, 245, 306, 336`
- **Evidência (objetiva)**:
  ```typescript
  /** Conta gerencial do juros = VARIAÇÃO CAMBIAL PASSIVA REALIZADA (HAR + ontologia). */
  const CONTA_GER_JUROS = 131;
  const GER_DES_JUROS = 'VARIAÇÃO CAMBIAL PASSIVA REALIZADA';
  ```
  Aparece em 3 sites: linha 245 (`markSettled.contaJuros`), 306 (`buildFinalPayload.bxaCodGerJuros`), 336 (`buildPreviewPayload.bxaCodGerJuros`).
- **Impacto técnico**: Quando o plano de contas Columbia mudar (reorganização contábil — evento comum em fechamento de ano fiscal), trocar o valor exige PR + review + redeploy do backend. Quando o sistema virar SaaSo (CLAUDE.md Overview — multi-tenant, uma conta AWS por cliente), **cada cliente vai ter um plano de contas próprio** e o `131` ficará errado em todos os tenants exceto Columbia.
- **Impacto de negócio**: Cada mudança de conta gerencial = redeploy do backend (downtime breve, fila de PR). No SaaSo, é um bloqueador arquitetural — sem externalização, não dá para onboardar um segundo cliente sem fork de código.
- **Métrica de baseline**: 1 constante de regra contábil em código (target: 0); 0 testes que verificam que o valor vem de SSM/env (target: ≥ 1).

### F-modifiability-5: Duplicação entre `buildFinalPayload` e `buildPreviewPayload` — 8 campos repetidos

- **Severidade**: P2
- **Tactic violada**: Abstract Common Services
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:265-340`
- **Evidência (objetiva)**:
  ```
  Campos presentes em ambos os payloads (literalmente codificados duas vezes):
    filCod, docCod, bxaDocCod, titCod, bxaTitCod,
    bxaMnyJuros, bxaMnyDesconto, bxaCodGerJuros
  E a regra "isDesconto ? 0 : valorVariacao" também aparece nos dois lugares (l.208 e l.334).
  ```
- **Impacto técnico**: O preview existe para o operador ver o que vai ser enviado **antes** do POST real. Se o final divergir do preview (campo novo só no `buildFinalPayload`), o usuário aprova X e o sistema envia Y. Hoje a divergência é controlada por leitura humana das duas funções; com mais 2-3 PRs a chance de descasamento é alta.
- **Impacto de negócio**: Risco direto de confiança operacional — a UI promete "preview honesto" da baixa fin010 e a divergência silenciosa quebra essa promessa. O dry-run é a única barreira entre o write real e um erro contábil; precisa ser fiel.
- **Métrica de baseline**: 8 campos duplicados, 1 regra de classificação duplicada (target: 0 duplicações; 1 função `buildBasePayload` compartilhada).

### F-modifiability-6: 12 magic numbers no payload `fin010` (`docTip:2`, `borVldTipo:2`, `titCod:1`, …)

- **Severidade**: P2
- **Tactic violada**: Encapsulate (named constants) / Defer Binding
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:285-318` (e espelhados em `ConexosClient.ts:1040-1117`)
- **Evidência (objetiva)**:
  ```typescript
  bxaVldSistema: 0,   docTip: 2,   bxaVldCcorrente: 0,
  bxaVldCorrenteDc: 1, borVldTipo: 2, bxaVldAdto: 1,
  titCod: 1, bxaTitCod: 1, bxaMnyMulta: 0,
  bxaDocTip: 2, frontModelName: 'baixa', ...
  ```
- **Impacto técnico**: Esses valores são **enum-like** do ERP (`docTip=2 → 'PROFORMA/INVOICE'`, `borVldTipo=2 → 'PERMUTA'`). Sem nome, qualquer leitor precisa ir ao HAR para entender. Quando o ERP introduzir um terceiro `docTip` (ex.: nota de débito), a busca-substituição vai pegar todos os `2:` sem contexto.
- **Impacto de negócio**: Custo de onboarding alto; baixa quality bar para revisão de PR (revisor não consegue distinguir `2` correto de `2` errado).
- **Métrica de baseline**: 12 literais numéricos não-nomeados (target: ≤ 3, em constants module compartilhado com `Fin010Baixa.ts`).

### F-modifiability-7: Sem polimorfismo de modo (dry-run vs live) — branching imperativo

- **Severidade**: P3
- **Tactic violada**: Defer Binding — Polymorphism
- **Localização**: `src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts:111-126`
- **Evidência (objetiva)**:
  ```typescript
  if (dryRun) {
      const preview = this.buildPreviewPayload(aloc, filCod);
      await this.execucaoRepository.setRequestPayload(key, preview);
      ...
      continue;
  }
  // ── Escrita real: handshake de 5 chamadas ...
  ```
- **Impacto técnico**: Quando precisar de um terceiro modo (ex.: "simulação com chamada real ao passo 2/3 mas sem POST final" — útil para validar credenciais sem gravar), o `if/else` vira `switch`/cascata. Polimorfismo (`IFin010Writer` com 2-3 impls) facilita testar cada modo isoladamente.
- **Impacto de negócio**: Defensável manter como está enquanto só houver 2 modos. Subir prioridade quando o escopo de write crescer (segundo handshake, ex.: reversão).
- **Métrica de baseline**: 1 interface `IFin010Writer` ausente; 0 polimorfismos para defer binding de write (target: 1 interface com ≥ 2 impls).

## 5. Cards Kanban

### [modifiability-1] Quebrar `reconciliar` em sub-métodos (cognitive 23 → ≤ 15)

- **Problema**
  > A função `reconciliar` em `ReconciliacaoPermutaService.ts:71` tem cognitive complexity 23 (lint warn ativo, alvo Biome = 15). Mistura validação de adto, resolução de modo dry-run/real, loop sobre alocações, criação preguiçosa do borderô e tratamento de erro num único bloco de 95 linhas. Próxima mudança no contrato `fin010` tende a empurrar para 30+.

- **Melhoria Proposta**
  > Refactor (Bass) extraindo 3 métodos privados:
  > - `resolveExecutionMode(input, env): { dryRun, writeEnabled }` (linhas 88-91)
  > - `ensureBordero(borCod, filCod, dataMovto): Promise<number>` (lazy, l.130-133)
  > - `processarUmaAlocacao({ aloc, adto, dryRun, borCod, executadoPor }): Promise<{ resultado, borCod }>` (corpo do for, l.96-156)
  > Manter `reconciliar` como orquestrador puro (≤ 30 linhas, complexity ≤ 10).

- **Resultado Esperado**
  > Cognitive complexity de `reconciliar`: 23 → ≤ 10. Lint sem warning para esse arquivo. Cada sub-método testável em isolamento.

- **Tactic alvo**: Refactor / Split Module
- **Severidade**: P1
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-modifiability-1
- **Métricas de sucesso**:
  - Cognitive complexity de `reconciliar`: 23 → ≤ 10
  - Warnings Biome em `ReconciliacaoPermutaService.ts`: 1 → 0
  - Cobertura de teste por sub-método: 0 → 3 testes unitários novos
- **Risco de não fazer**: Em 6 meses, a função vira intocável; cada nova classificação contábil (multa, IRRF) adiciona +5 complexity; eventualmente o lint vira bloqueante e o PR atrasa o fechamento mensal.
- **Dependências**: nenhuma

### [modifiability-2] Separar `ConexosFin010WriteClient` do `ConexosClient` (read/write split)

- **Problema**
  > `ConexosClient.ts` tem 1608 LOC com 17 métodos públicos misturando 14 leituras (legado, usadas por 6 services) com 5 escritas `fin010` (usadas só pela Fase 3). O banner-comentário em `ConexosClient.ts:992` reconhece a fronteira mas o split não foi feito. Mudanças no read podem instabilizar o write antes de `CONEXOS_WRITE_ENABLED=true` virar produção.

- **Melhoria Proposta**
  > Split Module (Bass): criar `src/backend/domain/client/ConexosFin010WriteClient.ts` `@singleton() @injectable()` recebendo o mesmo `LegacyConexosShape` por DI. Mover os 5 métodos write (`criarBordero`, `validarTituloBaixa`, `validarTituloPermuta`, `atualizarValorLiquido`, `gravarBaixaPermuta`) + tipos de `Fin010Baixa.ts`. Atualizar `ReconciliacaoPermutaService` para injetar o novo client. Manter `ConexosClient` só com read.

- **Resultado Esperado**
  > `ConexosClient.ts`: 1608 → ~1200 LOC (só read). Novo `ConexosFin010WriteClient.ts`: ~250 LOC, coeso. Fan-in do write client = 1 (`ReconciliacaoPermutaService`); blast-radius isolado.

- **Tactic alvo**: Split Module / Increase Semantic Coherence
- **Severidade**: P1
- **Esforço estimado**: M (2–3d)
- **Findings relacionados**: F-modifiability-2
- **Métricas de sucesso**:
  - LOC `ConexosClient.ts`: 1608 → ≤ 1200
  - LOC `ConexosFin010WriteClient.ts` (novo): ~250
  - Tempo de feedback do test runner em mudança write: -30% (arquivo isolado)
- **Risco de não fazer**: Quando o write virar produção e quiser revogar/reverter uma baixa, qualquer regressão no read pode forçar rollback que também derruba a leitura — bloqueador operacional para o time financeiro.
- **Dependências**: nenhuma (pré-requisito recomendado antes de `CONEXOS_WRITE_ENABLED=true` em prod)

### [modifiability-3] Extrair modais de `page.tsx` em componentes próprios — começar pelo `ReconciliacaoModal`

- **Problema**
  > `frontend/app/permutas/page.tsx` tem 2311 LOC e 44 hooks num único componente `GestaoPermutasPage`. O modal de reconciliação (Fase 3, l.2174-2293, 120 linhas + estado em l.709-748) foi adicionado a este arquivo; mais 1 modal e o componente passa de 2500 LOC. Re-render se propaga por toda a UI Permutas a cada `setReconcil*`.

- **Melhoria Proposta**
  > Split Module / Increase Semantic Coherence (Bass): extrair `components/permutas/ReconciliacaoModal.tsx` recebendo `{ adto, open, onClose, onSettled }` como props. Mover o `useCallback abrirReconciliar`/`executarReconciliar` + 3 `useState` reconcil* para dentro do componente. Repetir o padrão para `IngestaoManualModal`, `AlocacaoSimplesModal`, `PermutaMultiplaModal` em PRs seguintes.

- **Resultado Esperado**
  > `page.tsx`: 2311 → ~1900 LOC (este PR). 3 hooks a menos no escopo da página. Próximas mudanças no fluxo de baixa fin010 trafegam em arquivo de ~150 LOC.

- **Tactic alvo**: Split Module
- **Severidade**: P1
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-modifiability-3
- **Métricas de sucesso**:
  - LOC `page.tsx`: 2311 → ≤ 2000 (este PR) / ≤ 1200 (após extrair todos 4 modais)
  - Hooks no `GestaoPermutasPage`: 44 → 41 (este PR) / ≤ 20 (após 4 extrações)
  - Re-renders do `<Table>` principal por interação no modal de reconciliação: hoje N (página inteira); alvo: 0
- **Risco de não fazer**: Próximo modal (provável: confirmação de reversão da baixa) leva o arquivo a 2500+ LOC; revisão de PR vira superficial; bugs visuais cross-modal escapam.
- **Dependências**: card #modifiability-1 e #modifiability-2 (não bloqueia, mas dá segurança no contrato BE)

### [modifiability-4] Externalizar `CONTA_GER_JUROS` para `EnvironmentProvider` / config-by-tenant

- **Problema**
  > A conta gerencial `131` (`VARIAÇÃO CAMBIAL PASSIVA REALIZADA`) está como `const` no topo de `ReconciliacaoPermutaService.ts`. Mudança de plano de contas = redeploy. No futuro SaaSo (CLAUDE.md), cada cliente terá plano de contas próprio — bloqueia onboarding sem fork.

- **Melhoria Proposta**
  > Defer Binding via configuration files (Bass): adicionar `permutaContaGerJuros: number` e `permutaContaGerJurosDesc: string` ao `EnvironmentVars` model, lidos de SSM em prod (`/tenants/{env}/{client}/permuta-conta-ger-juros`) e env-var em dev. Service consome via `await this.environmentProvider.getEnvironmentVars()` (já em uso para `conexosWriteEnabled`). Manter default 131 só em dev como fallback explícito.

- **Resultado Esperado**
  > Trocar conta gerencial = atualizar SSM + reset cache do EnvironmentProvider; zero redeploy. Pré-requisito do SaaSo desbloqueado para Permutas.

- **Tactic alvo**: Defer Binding — Configuration files / Encapsulate
- **Severidade**: P1
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-modifiability-4
- **Métricas de sucesso**:
  - Magic numbers em regras contábeis no service: 1 → 0
  - Tempo de mudança de conta gerencial: ~1d (PR+deploy) → ~5min (SSM put)
  - Bloqueador SaaSo "plano de contas por tenant": presente → resolvido (mínimo: 1 chave)
- **Risco de não fazer**: Em qualquer cenário SaaSo (≥ 2 clientes), o `131` quebra silenciosamente o segundo tenant até que alguém perceba a baixa errada via auditoria contábil.
- **Dependências**: nenhuma

### [modifiability-5] Extrair `buildBasePayload` compartilhado entre preview e final

- **Problema**
  > `buildPreviewPayload` (l.321-340) e `buildFinalPayload` (l.265-318) duplicam 8 campos (`filCod`, `docCod`, `bxaDocCod`, `titCod`, `bxaTitCod`, `bxaMnyJuros`, `bxaMnyDesconto`, `bxaCodGerJuros`) e a regra `isDesconto ? 0 : valorVariacao` aparece nos dois. Risco: campo novo entra só no final → preview engana o operador → confiança operacional quebra.

- **Melhoria Proposta**
  > Abstract Common Services (Bass): criar `private buildPayloadBase(aloc, filCod): PayloadBase` retornando os 8 campos comuns + a classificação juros/desconto. `buildFinalPayload` faz `...base, ...erpFields` (passos 2/3/4); `buildPreviewPayload` faz `...base, _nota, taxaAdiantamento, taxaInvoice, moeda`. Teste novo: snapshot que garante que todos os campos do base aparecem em ambos.

- **Resultado Esperado**
  > 0 campos duplicados; 0 chance de drift silencioso entre preview e final.

- **Tactic alvo**: Abstract Common Services
- **Severidade**: P2
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-modifiability-5, F-modifiability-6
- **Métricas de sucesso**:
  - Campos duplicados entre preview/final: 8 → 0
  - Teste snapshot "base ⊂ preview ∩ final": 0 → 1
- **Risco de não fazer**: Próximo campo (provável: `bxaCodGerJurosPermuta` quando o ERP exigir conta separada) entra só no final; operador aprova preview pensando que conta é X, sistema envia Y.
- **Dependências**: nenhuma; recomendável fazer junto com card #modifiability-1

### [modifiability-6] Nomear constantes do payload `fin010` em `Fin010Constants.ts`

- **Problema**
  > 12 literais numéricos não-nomeados (`docTip:2`, `borVldTipo:2`, `titCod:1`, `bxaTitCod:1`, `bxaVldAdto:1`, `frontModelName:'baixa'`, …) espalhados entre `ReconciliacaoPermutaService.ts:285-318` e `ConexosClient.ts:1040-1117`. Cada um é um enum-like do ERP; quem lê o código precisa do HAR para decodificar.

- **Melhoria Proposta**
  > Encapsulate (Bass — named constants): criar `domain/interface/permutas/Fin010Constants.ts` com `export const FIN010 = { DOC_TIP_INVOICE: 2, BOR_VLD_TIPO_PERMUTA: 2, TIT_COD_PADRAO: 1, BXA_VLD_ADTO_PERMUTA: 1, FRONT_MODEL_BAIXA: 'baixa' }`. Importar nos 2 sites de uso. Documentar a fonte (HAR + `business-rules/fin010-write-contract.md`) no JSDoc do módulo.

- **Resultado Esperado**
  > Magic numbers em payloads `fin010`: 12 → 0 nomeados. Quando ERP introduzir `DOC_TIP_NOTA_DEBITO=3`, ficar óbvio onde mexer.

- **Tactic alvo**: Encapsulate
- **Severidade**: P2
- **Esforço estimado**: S (≤ 1d)
- **Findings relacionados**: F-modifiability-6
- **Métricas de sucesso**:
  - Literais numéricos não-nomeados no payload `fin010`: 12 → ≤ 3
  - Pontos de definição da semântica `docTip=2`: 2 (duplicada) → 1 (única no Constants module)
- **Risco de não fazer**: Buscar/substituir errado quando ERP adicionar `docTip=3` — bug silencioso na baixa.
- **Dependências**: pode ser feito junto com card #modifiability-5

### [modifiability-7] (Defer) Polimorfismo `IFin010Writer` — dry-run vs live

- **Problema**
  > O modo dry-run vs live é decidido por `if (dryRun)` dentro do `reconciliar` (l.111). Aceitável hoje com 2 modos; vira ruim quando entrar um terceiro (validação real sem POST final).

- **Melhoria Proposta**
  > Defer Binding via Polymorphism (Bass): introduzir `interface IFin010Writer { executar(par): Promise<ResultadoAlocacao> }` com impls `LiveFin010Writer` (handshake real) e `DryRunFin010Writer` (só monta preview). Resolver em runtime via tsyringe token (`Fin010WriterToken`) baseado em `env.conexosDryRun`. Só executar quando o terceiro modo aparecer.

- **Resultado Esperado**
  > Adicionar um novo modo = 1 nova classe + 1 entry no factory; 0 branching adicional no `reconciliar`.

- **Tactic alvo**: Defer Binding — Polymorphism
- **Severidade**: P3
- **Esforço estimado**: M (2–3d)
- **Findings relacionados**: F-modifiability-7
- **Métricas de sucesso**:
  - Modos de escrita: 2 (if/else) → N (factory polimórfico)
  - Branching de modo dentro de `reconciliar`: 1 → 0
- **Risco de não fazer**: Defensável manter; só promover a P1 se entrar 3º modo no roadmap.
- **Dependências**: card #modifiability-1 (refactor primeiro)

## 6. Notas do agente

- **Cross-QA — Testability**: F-1 (cognitive 23 em `reconciliar`) e F-3 (44 hooks em `page.tsx`) atrapalham testabilidade direta — funções difíceis de quebrar em fixtures unitárias. Sinalizar ao consolidator que cards `modifiability-1` e `modifiability-3` também melhoram Testability.
- **Cross-QA — Deployability**: F-4 (`CONTA_GER_JUROS=131` hardcoded) é literalmente "cada mudança contábil = redeploy" — alvo da Deployability. Card `modifiability-4` aparece nos dois reviews; consolidar como uma única ação.
- **Cross-QA — Integrability**: F-2 (split do `ConexosClient`) toca a fronteira de Integrability (read vs write são integrações com sub-contratos diferentes do ERP, com risco operacional distinto). Alinhamento com Integrability é recomendável.
- **Cross-QA — Fault-tolerance**: F-5 (duplicação preview vs final) é também risco de Fault-tolerance — divergência silenciosa quebra invariante "o que o operador aprovou == o que o sistema enviou".
- **Escopo deliberado**: Não revisei `PermutaExecucaoRepository.ts` (206 LOC, dentro do alvo) nem `Fin010Baixa.ts` (77 LOC, encapsulamento exemplar). Estão limpos.
