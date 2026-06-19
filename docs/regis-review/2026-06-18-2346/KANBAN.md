---
type: regis-review-kanban
run_id: 2026-06-18-2346
total: 23
counts: { p0: 0, p1: 3, p2: 11, p3: 9 }
---

# Kanban — financeiro — 2026-06-18-2346

> Importável para o Kanban do time. Cada card abaixo já tem Problema / Melhoria Proposta / Resultado Esperado.
> Ordem: P0 (S → XL), depois P1, P2, P3.
> **P0 = 0 nesta review.** O loop de remediação não re-entra; todos os cards descem para `ontology/_inbox/<feature>-regis-followups.md`.

---

## P0 — Crítico

*Nenhum card P0 nesta review.*

---

## P1 — Alto

### [modifiability-1] Compartilhar o enum `MotivoBloqueio` entre backend e frontend (SSOT)

**QA**: Modifiability
**Tactic alvo**: Abstract Common Services
**Esforço**: S
**Findings**: F-modifiability-1, F-modifiability-4

**Problema**
> Backend define `MOTIVO_BLOQUEIO` como const-enum tipado (10 entradas), mas o frontend duplica os 10 slugs em `MOTIVO_LABEL` e usa `motivoBloqueio?: string` no DTO `PermutaPendente`. Qualquer mudança na taxonomia exige edição manual em ≥ 3 lugares sem rede de segurança do TypeScript — exatamente a feature "já permutado" desta review já pagou esse custo (label adicionado à mão).

**Melhoria Proposta**
> Aplicar **Abstract Common Services**: criar um módulo compartilhado de tipos para o domínio Permutas no frontend (ex.: `src/frontend/lib/permutas-domain.ts`) que **espelhe** `MOTIVO_BLOQUEIO` com a mesma forma `as const` + `type MotivoBloqueio`, e tipar `PermutaPendente.motivoBloqueio?: MotivoBloqueio` em `lib/types.ts`. Ideal: extrair backend `EstadoElegibilidade.ts` para um pacote `@shared/permutas` consumido por ambos (long-term). Substituir o literal `'ja-permutado'` em `page.tsx:73,77` por `MOTIVO_BLOQUEIO.JA_PERMUTADO`.

**Resultado Esperado**
> 0 strings cruas de motivo em código de render; `tsc` rejeita qualquer slug fora da union de 10; adicionar um motivo novo no backend produz erro de compilação no frontend até que o `MOTIVO_LABEL` ganhe a entrada.

**Métricas de sucesso**
- Slugs duplicados frontend ↔ backend: 10 → 0 (via SSOT)
- Tipo de `motivoBloqueio` no DTO: `string` → `MotivoBloqueio` (cardinalidade ∞ → 10)
- Compile-time error ao adicionar motivo sem label: ausente → presente

**Risco de não fazer**
> Nas Fatias 2/3 (write-back + N:M resolvido), a taxonomia vai crescer; cada mudança gera 1 incidente potencial de "slug cru na tela" em produção até alguém notar visualmente.

**Dependências**: Nenhuma

---

### [testability-1] Adicionar teste do `StatusBadge` cobrindo o branch `ja-permutado`

**QA**: Testability
**Tactic alvo**: Specialized Interfaces / Executable Assertions
**Esforço**: S
**Findings**: F-testability-1

**Problema**
> A nova variante visual `ja-permutado` (badge info + `CheckCircle2`) só é defendida hoje pela revisão de design. Qualquer refactor do `StatusBadge` em `app/permutas/page.tsx:51-91` pode cair no `return` final e renderizar como bloqueada vermelha, induzindo o analista a tratar como erro um estado concluído (doc 8266 real).

**Melhoria Proposta**
> Extrair `StatusBadge` para `src/frontend/app/permutas/StatusBadge.tsx` (já estaria importado pelo page sem mudar a UX) e adicionar `src/frontend/app/permutas/StatusBadge.test.tsx` (React Testing Library) com 4 casos: `elegivel`, `casamento-manual`, `bloqueada + motivo='ja-permutado'`, `bloqueada + motivo='sem-saldo-permutar'`. Assertar role do `Badge`, presença do ícone (`CheckCircle2` vs `Ban`) e `title` esperado.

**Resultado Esperado**
> Refactors futuros do `StatusBadge` falham na suíte se o branch `ja-permutado` cair de volta no vermelho. Testes cobrindo `StatusBadge['ja-permutado']` 0 → ≥ 1; testes em `src/frontend/app/permutas/` 0 → ≥ 4.

**Métricas de sucesso**
- Testes cobrindo o branch `ja-permutado`: 0 → ≥ 1
- Componentes da rota `app/permutas` com teste: 0 → 1 (`StatusBadge`)

**Risco de não fazer**
> Em 6 meses, com novas variantes (`ProcessamentoBadge`, futuros motivos de SISPAG/GED), o `StatusBadge` vira lugar de regressão silenciosa; primeira reclamação vem via suporte com print do badge errado.

**Dependências**: Nenhuma

---

### [deployability-1] Coordenar deploy BE/FE para o novo `'casamento-manual'` (Render → Vercel)

**QA**: Deployability
**Tactic alvo**: Scale Rollouts, Configure Behavior
**Esforço**: S
**Findings**: F-deployability-1

**Problema**
> A nova união `StatusElegibilidade = ... | 'casamento-manual'` e o KPI `resumo.casamentoManual` viajam em janelas independentes de deploy (Render hook + Vercel auto-deploy on push). Durante a janela de skew o FE antigo recebe um literal desconhecido e o FE novo pode chegar antes do BE, mostrando KPI vazio.

**Melhoria Proposta**
> Adicionar job `deploy-frontend` no `ci.yml` com `needs: [backend, deploy-backend]` e usar Vercel CLI (`vercel deploy --prod`) com token, ao invés do auto-deploy do Vercel. Como mitigação adicional, defender o FE com fallback de render para `status` desconhecido (`default → 'bloqueada'` ou badge neutra) e KPI `casamentoManual ?? 0`.

**Resultado Esperado**
> Deploy BE termina e smoke `/health` passa antes do FE começar a publicar. Janela de skew BE→FE: **~5 min → ≤ 30s** (apenas swap atomic do Vercel). FE antigo nunca recebe `'casamento-manual'`. Skew oposto (FE novo + BE antigo) trata KPI ausente sem crash.

**Métricas de sucesso**
- Janela de skew BE→FE: ~5min → ≤30s
- % de deploys com FE/BE coordenados: hoje 0% → 100%

**Risco de não fazer**
> A cada nova união discriminada (motivos, estados) o operador vê glitch visual por minutos pós-deploy; mina confiança no rollout sequencial (Permutas → SISPAG → Popula GED previstos para 90d).

**Dependências**: Secret `VERCEL_TOKEN` provisionado.

---

## P2 — Médio

### [integrability-1] Adicionar `com298DetailSchema` (Zod) ao boundary do detail endpoint

**QA**: Integrability
**Tactic alvo**: Tailor Interface / Contract testing
**Esforço**: S
**Findings**: F-integrability-1 (também resolve F-security-1)

**Problema**
> O mapper `mapDetalheTitulos` consome `Record<string, unknown>` direto do `legacy.getGeneric` e lê 3 campos (`mnyTitPermutar`, `mnyTitPermuta`, `mnyTitAberto`) via `parseOptionalNumber`. O list já tem `com298RowSchema` em `conexosPermutasSchemas.ts`, mas o detail não — viola a regra "validate external inputs at boundaries" (CLAUDE.md). Se o Conexos publicar um shape inesperado (string "NaN", null aninhado), a regressão é silenciosa: candidatas viram `SEM_SALDO_PERMUTAR` em vez de `JA_PERMUTADO`.

**Melhoria Proposta**
> Criar `com298DetailSchema` em `src/backend/domain/client/permutas/conexosPermutasSchemas.ts` com `mnyTitPermutar`, `mnyTitPermuta`, `mnyTitAberto` como `wireNumber.optional()`, mantendo `.passthrough()`. Aplicar `safeParse` em `mapDetalheTitulos` (ConexosClient.ts:941); em caso de issues, logar `BUSINESS_WARN` com sample dos campos crus e cair no mesmo caminho atual (campos `undefined`).

**Resultado Esperado**
> Detail endpoint passa a falhar alto/observável em regressões de schema upstream. Cobertura Zod no detail = 1 schema, 3 campos pinned. Sem mudança de comportamento para os fixtures atuais.

**Métricas de sucesso**
- `# schemas Zod cobrindo detail endpoints Conexos`: 0 → 1
- `# campos do detail com contrato pinado`: 0 → 3 (`mnyTitPermutar`, `mnyTitPermuta`, `mnyTitAberto`)
- Testes existentes em `ConexosClient.test.ts:1280-1312` continuam verdes

**Risco de não fazer**
> Regressão silenciosa de shape do Conexos vira diagnóstico custoso (operador vê motivo errado no painel; só descoberto por análise manual). Em 6 meses, com SISPAG e novos campos da mesma série `mny*`, o risco escala.

**Dependências**: Nenhuma — pode ser independente do escopo "já permutado" atual.

---

### [modifiability-4] Tipar `MOTIVO_LABEL` como `Record<MotivoBloqueio, string>` (exhaustividade)

**QA**: Modifiability
**Tactic alvo**: Defer Binding (compile-time polymorphism)
**Esforço**: S
**Findings**: F-modifiability-4, F-modifiability-1

**Problema**
> `MOTIVO_LABEL: Record<string, string>` perde a verificação de exhaustividade. Um motivo novo no backend produz `undefined` em produção, não erro de compilação. O fallback `?? motivo` mascara o problema, mostrando o slug cru ao operador.

**Melhoria Proposta**
> Aplicar **Defer Binding via polymorphism (compile-time)**: trocar tipo para `Record<MotivoBloqueio, string>` (depende do card `modifiability-1` ter exposto a union no frontend). O `tsc` passa a exigir que cada novo motivo tenha rótulo antes do build verde.

**Resultado Esperado**
> Esquecer de adicionar o label para um motivo novo deixa de ser bug de runtime e vira erro de typecheck.

**Métricas de sucesso**
- Tipo do índice de `MOTIVO_LABEL`: `string` → `MotivoBloqueio`
- Detecção de label faltando: runtime (operador relata) → compile-time (CI bloqueia)

**Risco de não fazer**
> A próxima taxonomia silenciosamente cai no fallback `?? motivo`; UX degrada sem alerta.

**Dependências**: modifiability-1

---

### [testability-2] Travar `MOTIVO_LABEL` no front-end ao enum `MOTIVO_BLOQUEIO` do back-end

**QA**: Testability
**Tactic alvo**: Executable Assertions / Limit Structural Complexity
**Esforço**: S
**Findings**: F-testability-2

**Problema**
> `src/frontend/app/permutas/page.tsx:37-49` declara `MOTIVO_LABEL: Record<string, string>`. Um motivo novo no back-end (próxima feature) pode chegar à UI como string crua (`'ja-permutado'` em vez de `'Já permutado'`) sem nada reprovar — drift invisível.

**Melhoria Proposta**
> Compartilhar um tipo `MotivoBloqueio` (já existe em `src/backend/domain/interface/permutas/EstadoElegibilidade.ts`) com o front via export pelo pacote de tipos (ou colocar `MOTIVO_LABEL: Record<MotivoBloqueio, string>` no front). Adicionar teste `MOTIVO_LABEL.test.ts` que itera as chaves do enum e exige label não-vazio.

**Resultado Esperado**
> Adicionar um motivo no back sem espelhar no front quebra typecheck **ou** teste. Cobertura exhaustiva motivos × label parcial (string-loose) → 100% tipada.

**Métricas de sucesso**
- Chaves `MOTIVO_LABEL` cobertas por enum tipado: 0/10 → 10/10
- Testes garantindo bijeção motivo↔label: 0 → 1

**Risco de não fazer**
> Cada nova frente (SISPAG, GED) trará motivos novos; drift acumulado entre back-end e front-end de UX.

**Dependências**: Nenhuma (sinergia com modifiability-1)

---

### [deployability-2] Smoke test de contrato Permutas pós-deploy (`/permutas/gestao?dry-run`)

**QA**: Deployability
**Tactic alvo**: Deployment observability, Script Deployment Commands
**Esforço**: S
**Findings**: F-deployability-2

**Problema**
> O smoke pós-deploy só toca `/health`. Esta mudança adiciona 1 campo opcional e 4 literais de enum à `GestaoPermutasResponse`. Um deploy que sobe mas devolve payload com typo (`'ja-permutado'` vs. `'já-permutado'`) ou `resumo.casamentoManual` faltando passa pelo CI e atinge o operador.

**Melhoria Proposta**
> Acrescentar passo após `/health` que bate `GET /permutas/gestao?filial=<dev>&dryRun=1` e valida o payload com Zod (mesmo schema usado em runtime). Idealmente reusar o `gestaoPermutasResponseSchema` (criar se não existir).

**Resultado Esperado**
> Smoke cobre **≥ 50% dos endpoints críticos de Permutas** (1/3 → 2/3 com gestão). Regressão de contrato detectada no CI antes do FE consumir.

**Métricas de sucesso**
- Endpoints do domínio Permutas no smoke: 0 → 1 (gestão)
- Detecção de contrato quebrado: pós-deploy via observação humana → pré-tráfego no CI

**Risco de não fazer**
> A próxima mudança de enum (`SISPAG`, `Popula GED`) repete a mesma exposição em escala maior.

**Dependências**: Necessita rota `gestao` aceitar `dryRun=1` (ou um tenant `dev` no Render acessível à action).

---

### [deployability-3] Falhar (não pular) o smoke quando `RENDER_BACKEND_URL` ausente

**QA**: Deployability
**Tactic alvo**: Deployment observability
**Esforço**: S
**Findings**: F-deployability-3

**Problema**
> Quando o secret `RENDER_BACKEND_URL` não está setado o smoke devolve `exit 0` com warning, declarando deploy verde sem nenhuma verificação. Esta release é deployada nesse regime.

**Melhoria Proposta**
> Provisionar o secret `RENDER_BACKEND_URL` no repositório (one-time) e trocar `exit 0` por `exit 1` no branch sem secret.

**Resultado Esperado**
> 100% dos deploys executam smoke. Deploy quebrado falha CI e dispara revert manual antes do tráfego real chegar.

**Métricas de sucesso**
- % releases com smoke executado: 0% (enquanto secret faltar) → 100%

**Risco de não fazer**
> Deploy quebrado chega ao operador sem sinal; MTTR explode pela latência humana.

**Dependências**: Acesso ao Settings → Secrets do repo (Yuri).

---

### [availability-1] Diferenciar `valorPermutado` ausente de `valorPermutado=0` no rótulo e no log

**QA**: Availability
**Tactic alvo**: Condition Monitoring
**Esforço**: S
**Findings**: F-availability-1

**Problema**
> Quando `mnyTitPermuta` está ausente no payload do detalhe, `valorPermutado` chega `undefined` e o `ElegibilidadeService` classifica a candidata como `SEM_SALDO_PERMUTAR`, indistinguível de um caso em que o campo veio explicitamente `0`. Não há sinal observável dessa indistinguibilidade — se o Conexos parar de retornar o campo, o produto vira silenciosamente "sem saldo" para o operador.

**Melhoria Proposta**
> Aplicar a tactic **Condition Monitoring**: no `EleicaoPermutasService.buildCandidata` (após `getDetalheTitulos`), emitir `LogService.info` com flag `valorPermutadoAusente: detalhe.valorPermutado === undefined` quando o Gate 2 reprovar; opcionalmente expor um sub-motivo informativo (`SEM_SALDO_PERMUTAR` + `subdetalhe: 'campo ausente'` no `gatesAvaliados[].detail`) sem criar novo motivo na taxonomia. Não muda a UX — só amplia a observabilidade.

**Resultado Esperado**
> Operador continua vendo "Sem saldo a permutar" na UI, mas o time consegue medir `% candidatas bloqueadas com mnyTitPermuta ausente` por run. Presença de log com `valorPermutadoAusente` flag: 0% → 100% das candidatas Gate 2-reprovadas instrumentadas.

**Métricas de sucesso**
- logs com flag `valorPermutadoAusente`: 0 → 1 por candidata Gate-2-reprovada
- sinal observável para drift de wire Conexos: ausente → presente

**Risco de não fazer**
> Mudança silenciosa no payload do Conexos vira regressão de rótulo invisível na UI por semanas.

**Dependências**: Nenhuma

---

### [availability-2] Agregar contagem de `DETAIL_INDISPONIVEL` e `JA_PERMUTADO` por run/filial

**QA**: Availability
**Tactic alvo**: Monitor (+ Predictive Model)
**Esforço**: S (resumo no log) / M (alarme + dashboard no alvo CloudWatch)
**Findings**: F-availability-2, F-availability-1

**Problema**
> Hoje cada candidata `DETAIL_INDISPONIVEL` emite um `BUSINESS_WARN`, mas o sinal não é agregado nem comparado entre runs. Degradação parcial do Conexos pode esvaziar a eleição de uma filial sem disparar nenhum sinal acionável; e drift de `JA_PERMUTADO` (que indica saúde do detalhe real) não é monitorado.

**Melhoria Proposta**
> Aplicar a tactic **Monitor** + degrau para **Predictive Model**: no fim do `EleicaoPermutasService.elegerCandidatas` (por filial), emitir um log de resumo `{ flowId, filCod, totalAvaliadas, porMotivo: { DETAIL_INDISPONIVEL, JA_PERMUTADO, SEM_SALDO_PERMUTAR, ... } }`. Estado-atual (Render): consumível pela ferramenta de log do destino. Estado-alvo: vira métrica CloudWatch + alarme `DETAIL_INDISPONIVEL > 30% por 2 runs consecutivas`.

**Resultado Esperado**
> Detecção de degradação Conexos < 1 run após o incidente. Drift de `JA_PERMUTADO` (queda abrupta = Conexos parou de popular o campo) visível em série temporal.

**Métricas de sucesso**
- log de resumo por (`flowId`, `filCod`): 0 → 1 por run
- alarme sobre taxa de `DETAIL_INDISPONIVEL`: 0 → 1 (post-migração para CloudWatch)

**Risco de não fazer**
> Incidente Conexos passa um dia inteiro de operação sem ser detectado; recuperação só na próxima run, mas time descobre via reclamação.

**Dependências**: ObservabilityAdvisor (cross-QA) para fechar o loop com dashboard.

---

### [fault-tolerance-2] Test de borda dedicado: `valorPermutado` ausente → `SEM_SALDO_PERMUTAR`

**QA**: Fault Tolerance
**Tactic alvo**: Sanity Checking
**Esforço**: S
**Findings**: F-fault-tolerance-2

**Problema**
> A regra `(adiantamento.valorPermutado ?? 0) > 0 ? JA_PERMUTADO : SEM_SALDO_PERMUTAR` em `ElegibilidadeService.motivoDoGateFalho` é uma defesa crítica contra mislabel da UX. Não há teste explícito que falhe se alguém inverter `> 0` para `>= 0` ou trocar `??` por `||`.

**Melhoria Proposta**
> Adicionar caso em `ElegibilidadeService.test.ts` (e/ou `EleicaoPermutasService.test.ts`) que monte um adiantamento com `valorPermutar=0`, `pago=true`, `valorPermutado=undefined` e exija `motivoBloqueio === SEM_SALDO_PERMUTAR`. Espelhar com `valorPermutado=0` (mesmo resultado) e `valorPermutado=undefined`/`null` no client (`ConexosClient.test.ts`).

**Resultado Esperado**
> Branch coverage explícito sobre o fallback conservador; refator futura quebra o teste antes de chegar a produção.

**Métricas de sucesso**
- Testes cobrindo `valorPermutado=undefined → SEM_SALDO_PERMUTAR`: ausente → ≥1 caso dedicado
- Mutation-test survivors para essa linha: não medido → 0

**Risco de não fazer**
> Em 6 meses, alguma refator de tipos pode trocar `??` por `||` e mislabel "novo adiantamento sem permuta" como "já permutado" — analista perde tempo, mas nenhum write financeiro é executado por engano (fatia read-only).

**Dependências**: Nenhuma

---

### [modifiability-2] Refatorar `StatusBadge` para tabela `motivo → variante visual`

**QA**: Modifiability
**Tactic alvo**: Increase Semantic Coherence (com Defer Binding via polymorphism leve)
**Esforço**: S
**Findings**: F-modifiability-2

**Problema**
> `StatusBadge` mistura mapping por status (`elegivel`, `casamento-manual`) com regra de exceção por motivo (`if (motivo === 'ja-permutado')`). Cada novo "motivo benigno" empilha mais um `if`, em vez de uma entrada de tabela.

**Melhoria Proposta**
> Aplicar **Increase Semantic Coherence**: extrair `const MOTIVO_VARIANT: Record<MotivoBloqueio, {variant, icon, label}>` (junto com `MOTIVO_LABEL` do card #1) e fazer `StatusBadge` ser data-driven. A regra "JA_PERMUTADO = info + check" vira uma linha de tabela, não uma branch.

**Resultado Esperado**
> `StatusBadge` reduzido a um único lookup + fallback; complexidade cognitiva permanece ≤ 5 mesmo com 5 motivos benignos futuros.

**Métricas de sucesso**
- Ramos `if` em `StatusBadge`: 3 → 1 (status mapping) + 1 (fallback) (-33%)
- Custo de adicionar novo motivo benigno: edição de função → 1 linha em tabela

**Risco de não fazer**
> Vira warning de `noExcessiveCognitiveComplexity` em 2–3 motivos novos; manutenção do painel desacelera.

**Dependências**: modifiability-1

---

### [modifiability-3] Quebrar `app/permutas/page.tsx` em sub-componentes coesos

**QA**: Modifiability
**Tactic alvo**: Split Module + Reduce Size of Module
**Esforço**: M
**Findings**: F-modifiability-3

**Problema**
> Página única com 680 LOC concentrando: rótulos, badges (Status + Processamento), tabelas (pendentes, casamento manual, casamento sugerido), filtros, paginação e skeleton. Excede em 70% o alvo p95 de 400 LOC. Cada mudança do painel exige ler o arquivo inteiro.

**Melhoria Proposta**
> Aplicar **Split Module**: extrair `PendentesTable`, `CasamentoManualTable`, `CasamentoSugeridoTable`, `PermutasFiltros` (filial+status+exportador+paginação) para `src/frontend/app/permutas/_components/`. `MOTIVO_LABEL`/`StatusBadge`/`Moeda` para um módulo de apresentação local. `page.tsx` fica como composer (≤ 200 LOC).

**Resultado Esperado**
> `page.tsx` ≤ 200 LOC; cada sub-componente ≤ 200 LOC; PRs futuros tocam 1–2 arquivos focados em vez do mega-arquivo.

**Métricas de sucesso**
- LOC `page.tsx`: 680 → ≤ 200
- p95 LOC do diretório `app/permutas/`: 680 → ≤ 300
- Símbolos top-level em `page.tsx`: 8 → ≤ 3 (composer + skeleton + page export)

**Risco de não fazer**
> Fatias 2/3 vão empurrar para ~900–1100 LOC; conflitos de merge ficam frequentes entre PRs paralelos no painel.

**Dependências**: modifiability-1 (idealmente)

---

### [testability-3] Quebrar `ConexosClient.test.ts` por capability

**QA**: Testability
**Tactic alvo**: Limit Structural Complexity
**Esforço**: M
**Findings**: F-testability-3

**Problema**
> `ConexosClient.test.ts` chegou a 1333 LOC (quase 1:1 com o source de 1414 LOC). O describe `getDetalheTitulos` agrega retry, ConexosError, 400-quirk, `valorPermutar`, `pago` e agora `valorPermutado` — 5 facetas em 8 it's. Em 3 sprints, com Nexxera/GED, tende a explodir.

**Melhoria Proposta**
> Fatiar em `ConexosClient.list.test.ts`, `ConexosClient.detalheTitulos.test.ts`, `ConexosClient.retryAndErrors.test.ts` mantendo o factory `buildLegacy()` compartilhado em `ConexosClient.testUtils.ts`. Cada arquivo ≤ 500 LOC.

**Resultado Esperado**
> Diff de novas quirks toca apenas um arquivo de teste. Maior arquivo de teste em `domain/client/` 1333 LOC → ≤ 500 LOC; nº de facetas por describe ≤ 2.

**Métricas de sucesso**
- LOC do maior teste do client: 1333 → ≤ 500
- Facetas por describe: 5 → ≤ 2

**Risco de não fazer**
> Cada nova integração de cliente externo (Nexxera, GED, banco SISPAG) tende a copiar esse padrão monolítico — débito que escala linearmente com frentes.

**Dependências**: Nenhuma

---

## P3 — Baixo

### [integrability-2] Extrair `DetalheTituloAggregate` para type alias em `interface/permutas/`

**QA**: Integrability
**Tactic alvo**: Abstract Common Services
**Esforço**: S
**Findings**: F-integrability-2

**Problema**
> A shape `{ valorPermutar?: number; pago?: boolean; valorPermutado?: number }` aparece literal em 3 lugares (`ConexosClient.ts:884`, `:943`, `EleicaoPermutasService.ts:461`). Cada adição futura ao aggregate (provável: `descontoFin`, `multaJuros`) força tocar 3 sítios.

**Melhoria Proposta**
> Criar `src/backend/domain/interface/permutas/DetalheTitulo.ts` exportando `DetalheTituloAggregate = { valorPermutar?: number; pago?: boolean; valorPermutado?: number }`. Trocar as 3 cópias por importação.

**Resultado Esperado**
> 1 fonte da verdade do shape; adicionar campo futuro = 1 sítio (interface) + 1 sítio (mapper). Sem mudança runtime.

**Métricas de sucesso**
- Declarações literais do shape: 3 → 0 (todas via alias)
- LOC para adicionar próximo campo: ~6 → ~3

**Risco de não fazer**
> Drift de type entre sítios quando o aggregate crescer (acontecerá ao migrar `com298/{docCod}` para conciliação de baixa em Fatia 2).

**Dependências**: Idealmente combinado com integrability-1 (Zod schema vira fonte do tipo via `z.infer`).

---

### [integrability-3] Teste de "absence tolerance" do campo opcional `valorPermutado`

**QA**: Integrability
**Tactic alvo**: Backward-compatibility shims
**Esforço**: S
**Findings**: F-integrability-3

**Problema**
> `Adiantamento.valorPermutado` é opcional em type, mas não há teste guardando contra um futuro PR tornar o campo required (todos os builders de teste recentes já o preenchem). O contrato opcional ponta-a-ponta (snapshot row, painel) não é exercido com o campo omitido.

**Melhoria Proposta**
> Adicionar 1 teste em `EleicaoPermutasService.test.ts` que monta uma candidata sem `valorPermutado` e confere: (a) snapshot row gerado não inclui a chave; (b) `ElegibilidadeService` cai em `SEM_SALDO_PERMUTAR` (path legado).

**Resultado Esperado**
> Compatibilidade do campo opcional pinada por teste. Refactors futuros que tornem o campo required quebram CI.

**Métricas de sucesso**
- Testes de "absence tolerance" para campos opcionais novos do `Adiantamento`: 0 → 1

**Risco de não fazer**
> Baixo individualmente; agrava quando o `Adiantamento` ganhar mais 3-4 campos opcionais nas próximas fatias (SISPAG/Popula GED).

**Dependências**: Nenhuma

---

### [performance-1] Instrumentar contador `conexos.com298.detail.calls_per_doccod_per_run`

**QA**: Performance
**Tactic alvo**: Maintain Multiple Copies of Computations (memoização) + Reduce Overhead (observabilidade)
**Esforço**: S
**Findings**: F-performance-3

**Problema**
> O comentário em `ConexosClient.ts:870-872` declara que o caller deve cachear `getDetalheTitulos` por `docCod` na execução, mas o contrato não é mensurado. Hoje só há um consumer (`EleicaoPermutasService.fetchDetailAndEvaluate`) e ele cumpre. Qualquer caller futuro (telas Gestão / N:M / GED) pode regredir o contrato sem alarme.

**Melhoria Proposta**
> Adicionar contador no `ConexosClient.getDetalheTitulos` chaveado por `(runId, docCod)` (passar `runId` pelo `flowId` que o caller já carrega — ver `EleicaoPermutasService.ts:441`). Emitir `logService.warn` quando o counter exceder 1. Quando a infra-alvo (CloudWatch EMF) entrar, publicar como métrica.

**Resultado Esperado**
> Visibilidade de regressões silenciosas onde calls duplicados/PROFORMA/run aparecem. Contagem auditada ≤ 1 com warn em caso contrário.

**Métricas de sucesso**
- `com298.detail.calls_per_doccod_per_run` p95: não medido → ≤ 1
- Warns por run com chamadas duplicadas: não medido → 0

**Risco de não fazer**
> Se uma feature futura (ex.: re-hidratação na tela Gestão) reler o detail por PROFORMA, Conexos será sobrecarregado silenciosamente. Detecção via logs custaria grep ad-hoc em incidente.

**Dependências**: Nenhuma; pode ser feito antes da migração para Lambda. Cross-QA: alinhar com availability/integrability (mesma log/metric pipeline).

---

### [performance-2] Publicar p95 do `getDetalheTitulos` por filial (deferred — pós-Lambda/CloudWatch)

**QA**: Performance
**Tactic alvo**: Bound Execution Times
**Esforço**: M
**Findings**: F-performance-2

**Problema**
> Hoje não há sentinela em produção que detecte regressão de p95 no detail-fetch — argumentamos formalmente que esta feature não regride latência (zero novo I/O), mas não confirmamos com número. Em Render, métricas por endpoint são limitadas.

**Melhoria Proposta**
> Quando o handler migrar para Lambda (alvo), emitir EMF com `endpoint=com298_detail`, `filCod`, `duration_ms`. Publicar dashboard com p50/p95/p99 e alarme em desvio > 30% vs. baseline 7d. Diferido até a migração — entra no follow-up do bootstrap Lambda.

**Resultado Esperado**
> p95 `com298_detail` observável. Baseline atual não medível → alvo: p95 ≤ 1500ms com alarme em +30%.

**Métricas de sucesso**
- p95 `com298_detail`: não medido → ≤ 1500ms
- Cobertura de alarme p95 em endpoint Conexos: 0/8 → 8/8

**Risco de não fazer**
> Cegueira a degradação Conexos. Hipóteses como "Conexos sempre retorna `mnyTitPermuta` no detail" não ganham confirmação empírica continuada.

**Dependências**: Migração para Lambda + EventBridge + CloudWatch (target architecture).

---

### [fault-tolerance-1] Logar `DETAIL_AUSENTE` quando `mnyTitAberto` for `undefined`

**QA**: Fault Tolerance
**Tactic alvo**: Sanity Checking + Condition Monitoring
**Esforço**: S
**Findings**: F-fault-tolerance-1

**Problema**
> Quando o detalhe Conexos não devolve `mnyTitAberto`, o serviço força `pago=false` e o `ElegibilidadeService` classifica como `NAO_PAGO`. Indistinguível de um adiantamento legitimamente não pago — o analista perde tempo investigando. Cenário: blip parcial de payload em `com298/{docCod}`.

**Melhoria Proposta**
> Em `EleicaoPermutasService.buildCandidata`, quando `detalhe.pago === undefined` E `detalhe.valorPermutar === undefined` E `detalhe.valorPermutado === undefined`, emitir `BUSINESS_WARN` com tag `detalhe-vazio` e considerar classificar como `DETAIL_INDISPONIVEL` (em vez do fallback `pago=false`). Manter o default conservador, só melhorar o sinal de telemetria.

**Resultado Esperado**
> Telemetria distingue "candidata não paga de verdade" de "candidata cujo detalhe veio vazio". Sem mudança no comportamento de classificação.

**Métricas de sucesso**
- Linhas de log com tag `detalhe-vazio`: 0 (não instrumentado) → contagem rastreável
- Falsos `NAO_PAGO` por payload vazio: indistinguível hoje → identificável

**Risco de não fazer**
> Ruído operacional baixo. Em 6 meses, possivelmente 0 incidentes — é higiene de telemetria.

**Dependências**: Nenhuma

---

### [fault-tolerance-3] Documentar o ciclo `JA_PERMUTADO → ELEGIVEL` na state-machine + 1 teste de regressão

**QA**: Fault Tolerance
**Tactic alvo**: Reintroduction (State Resync) + Idempotent Replay
**Esforço**: S
**Findings**: F-fault-tolerance-3

**Problema**
> A classificação `JA_PERMUTADO` é derivada do estado atual do Conexos (`mnyTitPermuta>0`). Se o Conexos estornar a permuta (`mnyTitPermuta` volta a 0 / null), a próxima run reclassifica corretamente — mas isso não está documentado na ontologia da state-machine nem coberto por teste explícito.

**Melhoria Proposta**
> (1) Adicionar nota na state-machine de PermutaCandidata na ontologia explicitando que `JA_PERMUTADO` é derivado, não persistido, e que cada run recomputa do zero. (2) Adicionar teste que simula run-1 com `mnyTitPermuta>0` → `JA_PERMUTADO`, depois run-2 com `mnyTitPermuta=0` → `SEM_SALDO_PERMUTAR` (ou `ELEGIVEL` se demais gates passarem).

**Resultado Esperado**
> Garantia operacional explícita do giro reverso. Ontologia atualizada com a invariante "classificação derivada, idempotente por run".

**Métricas de sucesso**
- Documentação da invariante na state-machine: ausente → presente
- Testes do giro reverso: ausente → ≥1

**Risco de não fazer**
> Confusão operacional rara, mas possível. Sem write financeiro envolvido.

**Dependências**: Ontologia da state-machine de PermutaCandidata.

---

### [security-1] Adicionar Zod schema para payload `detail` do Conexos (`com298/{docCod}`)

**QA**: Security
**Tactic alvo**: Verify Message Integrity
**Esforço**: S
**Findings**: F-security-1

> **Nota do consolidator**: este card é a face Security do mesmo trabalho de integrability-1. Resolver `integrability-1` resolve este simultaneamente. Mantido aqui por rastreabilidade do QA Security.

**Problema**
> Hoje o `extractPermutaFromDetail` cast'a o payload como `Record<string, unknown>` e confia em `parseOptionalNumber` em três campos (`mnyTitPermutar`, `mnyTitPermuta`, `mnyTitAberto`). Se o Conexos mudar o nome de um campo, a fatia "já permutado" degrada silenciosamente para `SEM_SALDO_PERMUTAR`, sem erro logado. Já existe precedente no list (`com298RowSchema.parse(row)`) que prova que o esforço é trivial.

**Melhoria Proposta**
> Criar `com298DetailSchema` no mesmo módulo do `com298RowSchema`, descrever `mnyTitPermutar?`, `mnyTitPermuta?`, `mnyTitAberto?` com `z.union([z.number(), z.string()]).optional()` (espelhando o que `parseOptionalNumber` aceita) e fazer `safeParse` em `getPermuta` antes de chamar `extractPermutaFromDetail`. Em falha de schema, logar `warn` com `docCod` e prosseguir com `{ valorPermutar: undefined, pago: undefined, valorPermutado: undefined }` (preserva comportamento seguro).

**Resultado Esperado**
> Mudança de contrato upstream gera `warn` rastreável em vez de degradação silenciosa. Cobertura do payload `detail` por Zod sobe de 0% para 100% dos campos consumidos pela fatia.

**Métricas de sucesso**
- % campos do `detail` consumidos validados via Zod: 0% → 100%
- Eventos `warn` "com298 detail schema mismatch" por dia em produção: instrumentado (alvo: 0)

**Risco de não fazer**
> Mudança não-comunicada do Conexos derruba a distinção `JA_PERMUTADO` vs. `SEM_SALDO_PERMUTAR` sem alarme; analista reabre tentativa de permuta indevida e descobre só no Gate 3.

**Dependências**: Nenhuma — Zod já está no projeto e o `list` já tem schema paralelo. **Consolidar com integrability-1 (mesma implementação).**

---

### [testability-4] Promover payloads reais do Conexos para `__fixtures__/`

**QA**: Testability
**Tactic alvo**: Recordable Test Cases
**Esforço**: S
**Findings**: F-testability-4, F-testability-3

**Problema**
> Payloads dos docs reais 8266, 26471, 24166, 21841 vivem inline em `mockResolvedValue` espalhados pelo teste. Outros consumidores (services de permutas, futuro SISPAG) vão duplicar.

**Melhoria Proposta**
> Criar `src/backend/domain/client/__fixtures__/conexos/detalheTitulos.ts` com `export const detalheTitulosDoc8266 = { ... }` (e companheiros) e referenciar tanto em `ConexosClient.test.ts` quanto em `ElegibilidadeService.test.ts` quando precisar simular o adiantamento com `valorPermutado`.

**Resultado Esperado**
> Schema change do `getGeneric` toca **um** lugar. Payloads "doc real" centralizados 0 → 4; sites de duplicação inline 4 → 0.

**Métricas de sucesso**
- Fixtures centralizadas em `__fixtures__/`: 0 → 4
- Duplicações inline do payload Conexos: 4 → 0

**Risco de não fazer**
> Cada frente (II SISPAG, III GED) replica o padrão inline; débito de manutenção cresce.

**Dependências**: testability-3 (faz sentido juntar com o fatiamento do test file)

---

### [testability-5] Injetar `ClockProvider` em `IngestaoPermutasService` / `EleicaoPermutasService`

**QA**: Testability
**Tactic alvo**: Limit Non-Determinism
**Esforço**: M
**Findings**: F-testability-5

**Problema**
> `IngestaoPermutasService` e `EleicaoPermutasService` leem `new Date()` direto em 8 sites (incluindo `durationMs`, `startedAt`, `finishedAt`). `AgingService.compute` já demonstrou o padrão correto recebendo `now` como parâmetro. A frente II (SISPAG) terá janelas temporais (lote do dia, retorno, conciliação) — entrar nelas com clock implícito é débito conhecido.

**Melhoria Proposta**
> Criar `domain/libs/ClockProvider.ts` (`@singleton() @injectable()`) com `now(): Date`, injetar nos services e usar nos testes via mock.

**Resultado Esperado**
> Tests de duração e timestamps determinísticos sem `jest.useFakeTimers` global. Leituras de `new Date()` em `service/permutas/` 8 → 0; services com clock injetado 1/4 → 4/4.

**Métricas de sucesso**
- Sites `new Date()` em services permutas: 8 → 0
- Services com clock injetado: 1 (`AgingService`) → 4

**Risco de não fazer**
> Ao chegar SISPAG/Nexxera com janelas temporais e D+1, débito vira flake recorrente; cross-QA com Modifiability (mudar política de timeout exige reescrever testes).

**Dependências**: Idealmente combinado com a primeira `/feature-new` que tocar `IngestaoPermutasService` ou `EleicaoPermutasService`.
