---
type: regis-review-report
run_id: 2026-06-26-0058
generated_at: 2026-06-26T03:25:00-03:00
audience: technical (architects + senior devs + tech lead)
basis: Bass & Clements — Software Architecture in Practice (Availability, Deployability, Integrability, Modifiability, Performance, Fault Tolerance, Security, Testability)
total_cards: 66
total_p0: 7
total_p1: 37
total_p2: 19
total_p3: 3
overall_score: 5.35
---

# Regis-Review — financeiro — 2026-06-26-0058

> Snapshot do checkout `main` @ `4e59fec` (v0.8.3). Stack atual: Express (`src/backend` 13.228 LOC não-teste) + Next.js (`src/frontend` 6.980 LOC) + Render + Vercel + Supabase. Sem `infra/`, sem AWS, sem APM. Escrita financeira **gated** (`CONEXOS_WRITE_ENABLED` / `CONEXOS_DRY_RUN`) com idempotência write-ahead em `permuta_alocacao_execucao` + advisory lock + state-machine guard SQL. 44 suites BE / 480 testes verde; 11 suites FE / 57 testes verde.

## 1. Executive scorecard

> Pesos aplicados ao cálculo do overall (perfil multi-tenant financeiro que escreve no ERP): Security 1.5 · Fault Tolerance 1.3 · Availability 1.2 · Modifiability 1.2 · Testability 1.0 · Performance 1.0 · Integrability 0.9 · Deployability 0.9 (Σ=9.0). Overall = 48.13 / 9.0 = **5.35**.

| QA | Score (0–10) | P0 | P1 | P2 | P3 | Top finding |
|---|---|---|---|---|---|---|
| Availability | 5.0 | 0 | 3 | 4 | 0 | F-availability-1: `/health` stub estático — Render mantém tráfego com Postgres morto |
| Deployability | 4.0 | 1 | 5 | 3 | 0 | F-deployability-1: zero rollback automatizado para escrita gravada em `fin010` |
| Integrability | 5.0 | 0 | 5 | 3 | 0 | F-integrability-1: god-client `ConexosClient.ts` 1.956 LOC / 28 públicos / 5 famílias wire |
| Modifiability | 5.0 | 2 | 4 | 2 | 1 | F-modifiability-1: god-component `app/permutas/page.tsx` 2.971 LOC / 35 useState / 39 modais |
| Performance | 5.0 | 2 | 3 | 3 | 0 | F-performance-2: auto-alocação O(N²) chamadas Conexos (`N × (1+2N)`) |
| Fault Tolerance | 8.1 | 0 | 6 | 0 | 0 | F-fault-tolerance-1: re-POST de baixa entre `setBorCod` e `markSettled` (super-pagamento) |
| Security | 5.0 | 0 | 7 | 2 | 1 | F-security-1: `DEV_AUTH_BYPASS=true` aceito em `environment=production` (string mismatch) |
| Testability | 5.0 | 2 | 4 | 2 | 1 | F-testability-1: `page.tsx` 0% cobertura — threshold rebaseado a lines 20 / branches 9 |
| **Overall** | **5.35** | **7** | **37** | **19** | **3** | — |

Score interpretation:
- 0–3: estrutural — bloqueia escalonamento
- 4–6: dívida defensável — endereçar nesta janela de planejamento
- 7–8: saudável com oportunidades pontuais
- 9–10: estado-da-arte para o estágio atual

**Leitura curta**: Fault Tolerance puxa para cima (idempotência write-ahead + advisory lock + state-machine guard SQL + dry-run default = caminho feliz e erro parcial **bem cobertos**). Todos os demais empilham em torno de 5 — a média ponderada esconde que o **substrato operacional** (sem APM, sem SIGTERM, sem circuit breaker, healthcheck stub, sem rollback) e a **forma de duas estruturas god-object** (`page.tsx`, `ConexosClient`) drenam pontos em vários QAs simultaneamente. Deployability é o mais baixo (4.0) por concentrar três P1 + 1 P0 em decisões de processo que prejudicam o restante (rollback ausente, Node não pinado, sem staging, bump Windows-only).

## 2. Top 10 risks (cross-QA)

Ranking composto = severidade × business impact × leverage (quantas frentes/QAs afetadas pela mesma causa).

### R-1: God-component `app/permutas/page.tsx` (2.971 LOC) bloqueia evolução, performance e teste da única feature em produção
- **QA(s) afetados**: Modifiability (P0), Performance (P1), Testability (P0), Deployability (review/conflito)
- **Findings de origem**: F-modifiability-1 (`page.tsx:1-2971`), F-performance-5 (`page.tsx:1-2971`), F-testability-1 (`page.tsx`/`BorderosPanel.tsx` 0/0/0/0%)
- **Evidência sintetizada**: 2.971 LOC · 35 `useState` · 18 `useMemo/useCallback` · 39 menções a `Dialog`/`Modal` · 25 `TabsContent`/`TabsTrigger` · 1 `'use client'`. Cobertura `page.tsx` = 0% / 0% / 0% / 0% — `jest.config.js:35-44` rebaseado a lines **20** / branches **9** / functions **14** para manter CI verde. Tactic violada: Split Module, Limit Structural Complexity, Reduce Overhead.
- **Impacto técnico**: setState em qualquer um dos 35 hooks re-renderiza a árvore inteira (filtros + 5 tabelas + modais + banners + relatórios); merges paralelos conflitam por arquivo (v0.7.0 ingestão × borderô-cache forçados a entrar sequenciados); teste de componente impraticável.
- **Impacto de negócio**: cada feature visível para o Yuri custa 2-3× mais; bug visual em uma aba afeta outras por re-render acidental; bloqueia a entrada de SISPAG (aba própria) sem refactor; "verde" do CI é Potemkin (threshold 20% admite).
- **Card(s) Kanban relacionados**: modifiability-1 (XL · split por aba), performance-5 (L · React.memo + dynamic), testability-1 (XL · sub-componentes testáveis)
- **Custo de inação em 6 meses**: prazo de PR review para o frontend dobra (de ~4h para ≥1 dia); SISPAG entra com fork da aba ou empilha aqui; o threshold FE permanece em 20% e qualquer nova feature herda 0% coverage (efeito travador). Premissa: ritmo atual de ~1 PR/semana tocando a página.

### R-2: God-client `ConexosClient.ts` (1.956 LOC, 28 públicos, 5 famílias wire) — pipeline de integrações serializa aqui
- **QA(s) afetados**: Integrability (P1), Modifiability (P0), Testability (P2)
- **Findings de origem**: F-integrability-1, F-modifiability-2, F-testability-9
- **Evidência sintetizada**: 1.956 LOC · 28 métodos públicos cobrindo `com298` + `com299` + `com308` + `imp019/imp223` + `fin010` (write 5-step) · teste de 1.628 LOC (maior do repo) · cobertura 100% (disciplina ✅, tamanho denuncia SUT monolítico). 4 services tocam essa classe 34 vezes. Tactic violada: Encapsulate, Increase Semantic Coherence, Limit Structural Complexity.
- **Impacto técnico**: cada `/feature-new` ou tweak entra no mesmo arquivo; merge-hell entre Permutas/SISPAG/GED garantido; mockar parcial é difícil (services recebem o cliente inteiro mesmo precisando de 2 métodos — viola ISP); replicar o anti-pattern para Nexxera/GED/SharePoint multiplica 4×.
- **Impacto de negócio**: pré-requisito para Frente II (SISPAG/Nexxera) e Frente III (Popula GED). Sem split, o template oficial vira "leia ConexosClient.ts inteiro".
- **Card(s) Kanban relacionados**: modifiability-2 (L · split por entidade), integrability-1 (L · split por família wire), testability-8 (L · sub-clients testáveis)
- **Custo de inação em 6 meses**: classe atinge ~3.000 LOC após `fin010` multi-título + SISPAG (10–15 métodos novos); time-to-first-call de cada integração cresce; débito permanente. Premissa: roadmap das duas frentes adicionais entrar em 2026-H2.

### R-3: `titCod: 1` hardcoded em 5 sites bloqueia 100% das permutas multi-título (e contamina o write-side)
- **QA(s) afetados**: Integrability (P1), Modifiability (P1), Fault Tolerance (P1)
- **Findings de origem**: F-integrability-5, F-modifiability-5, F-fault-tolerance-5
- **Evidência sintetizada**: 4 ocorrências em `ReconciliacaoPermutaService.ts:254/313/401/467` + 1 em `BorderoGestaoService.ts:111`. Caso real bloqueado documentado em `ontology/_inbox/permuta-multi-titulo-pendente.md`: invoice 4120 (2 títulos: 116.159,22 + 1.078,14) aborta com "anti-drift" porque a alocação soma N parcelas e o write toca só a 1ª. Tactic violada: Encapsulate, Increase Competence Set.
- **Impacto técnico**: anti-drift (I-Write-1) **contém** a corrupção (não dá baixa errada), mas **bloqueia** o fluxo legítimo — par fica em `error` na trilha, polui *Borderôs*; decisão de domínio (A=iterar 1..N / B=só permutáveis) pendente do Yuri.
- **Impacto de negócio**: cada invoice multi-título cai em fila manual; vira regra (não exceção) quando SISPAG entrar; decisão arquitetural #1 do produto em validação.
- **Card(s) Kanban relacionados**: integrability-5 (M), modifiability-5 (S · invariante na invoice), fault-tolerance-5 (M · com pair-review e high-risk)
- **Custo de inação em 6 meses**: hoje "minoria" das invoices Columbia; vira norma com SISPAG; cada caso polui *Borderôs* com `error`; refactor defensivo (substituir literais por `Invoice.tituloAlvoTitCod()`) custa <1d. Premissa: 1 decisão Yuri + 1 sprint.

### R-4: Re-POST de baixa entre `setBorCod` e `markSettled` (idempotência da janela cinza) — vetor de super-pagamento aberto há 3 runs
- **QA(s) afetados**: Fault Tolerance (P1), Availability (correlato — sem SIGTERM agrava), Performance (lote síncrono amplia)
- **Findings de origem**: F-fault-tolerance-1, F-fault-tolerance-3, F-availability-3 (sem SIGTERM), F-performance-4 (lote síncrono)
- **Evidência sintetizada**: sequência por par (`ReconciliacaoPermutaService.ts:176-222` + `PermutaExecucaoRepository.ts:223-256`): beginExecution → criarBordero → setBorCod → 3× validar/atualizar → gravarBaixaPermuta (IRREVERSÍVEL, sem retry) → markSettled. Crash entre passos 7 e 8 mantém status=`reconciling` com `bor_cod` mas sem `bxa_cod_seq`. `borderoAindaValido` só protege `settled`. Re-fire faz `gravarBaixaPermuta` 2× → 2 `bxaCodSeq` sobre o mesmo em-aberto. Tactic violada: Idempotent Replay (parcial).
- **Impacto técnico**: super-pagamento contábil no `fin010` (uma invoice baixada 2×); exige estorno manual. `LOTE_MAX=6` (era 10) reduz blast radius por clique mas não elimina o vetor.
- **Impacto de negócio**: divergência contábil; tempo de conciliação por par >30 min; herdado há 3 runs (`2026-06-23-1518:ft-2`, `2026-06-24-2011:F-7`, `2026-06-25-1713:F-3`).
- **Card(s) Kanban relacionados**: fault-tolerance-1 (M · detectar reconciling órfão + `listBaixas`), fault-tolerance-3 (M · reaper >30min), availability-3 (S · SIGTERM)
- **Custo de inação em 6 meses**: incidência cresce com volume diário do "Executar lote" + frequência de auto-deploy; cada deploy em horário comercial = potencial 1–5 órfãos × frequência. Premissa: ≥2 deploys/sem no horário comercial.

### R-5: `DEV_AUTH_BYPASS=true` aceito em produção real — defesa em profundidade quebrada por string mismatch
- **QA(s) afetados**: Security (P1), Deployability (config drift entre código e Render)
- **Findings de origem**: F-security-1
- **Evidência sintetizada**: `http/authEnv.ts:52` checa `DEPLOYED_ENVIRONMENTS = ['prd','stg','hml']`; `render.yaml:25-26` declara `environment=production`. O guard de boot só dispara para os três nomes — em produção real (`'production'`) o `.includes()` falha e o crash **não acontece**. Tactic violada: Change Default Settings, Limit Exposure.
- **Impacto técnico**: basta um operador setar `DEV_AUTH_BYPASS=true` no dashboard Render para o backend subir SEM verificação de JWT. API financeira (finalizar borderô, reconciliar lote, ingestão Conexos) ficaria publicamente acessível em `onrender.com`.
- **Impacto de negócio**: qualquer pessoa com a URL poderia mover dinheiro no `fin010`. Vetor improvável (exige operator error no dashboard) mas o blast radius é total.
- **Card(s) Kanban relacionados**: security-1 (S · inverter para whitelist `local`-only + teste de boot)
- **Custo de inação em 6 meses**: latente até alguém errar a env — uma única configuração mal feita derruba todas as outras defesas. Premissa: defesa em profundidade existe justamente para não depender de "ninguém errar".

### R-6: Zero APM/observabilidade — todos os erros morrem no stdout do Render (retenção 7d, sem busca)
- **QA(s) afetados**: Availability (P1), Performance (P0 dependente), Fault Tolerance (P1 audit-trail), Security (P1 audit auth)
- **Findings de origem**: F-availability-2, F-fault-tolerance-4 (5 ações de borderô só stdout), F-security-4 (eventos auth não persistem), métricas declaradas como "não medíveis" em Performance/Availability
- **Evidência sintetizada**: `Logger.ts:1-11` = `console.log/error` puro. `package.json` (`grep Sentry|datadog|opentelemetry`) = 0. `LogService.writeLog:19-27` = `process.stdout.write`. Render Starter rotaciona logs em ~7d sem busca estruturada. Auth (`routes/auth.ts:25-43`) não chama `LogService`; rejeições 401 = `console.warn`. 5/5 ações de borderô (finalizar/cancelar/estornar/excluir/excluir-baixa) sem trilha DB. Tactic violada: Monitor, Audit Trail, Predictive Model.
- **Impacto técnico**: MTTD heurístico (>30min via reclamação do usuário); sem trilha histórica para post-mortem; sem capacity/timeout decisions baseadas em dados; impossível responder forense ("quem aprovou borderô 14918?").
- **Impacto de negócio**: regressão silenciosa chega à retro do mês seguinte sem dado para defender investimento; compliance fraca (SOX-like, LGPD); descoberta de CVE/incidente por notícia.
- **Card(s) Kanban relacionados**: availability-2 (S · Sentry @sentry/node), fault-tolerance-4 (M · migration `bordero_acao_log`), security-4 (M · `app_audit_auth`)
- **Custo de inação em 6 meses**: MTTD continua >30 min, MTTR sobe com volume; sem dado quantitativo, qualquer investimento em resiliência é debatido. Premissa: Sentry free plan + 2 migrações.

### R-7: Auto-alocação O(N²) chamadas Conexos — `criarRascunhosAtomico` re-busca invoices a cada `alocar`
- **QA(s) afetados**: Performance (P0), Integrability (Conexos MAX_SESSIONS), Availability (operação não-funcional)
- **Findings de origem**: F-performance-2, F-performance-1 (`buscarInvoices` uncapped)
- **Evidência sintetizada**: `AlocacaoPermutasService.ts:171-291` (alocar) + `:344-405` (criarRascunhosAtomico). Loop: `for (const it of itens) await this.alocar(...)`; `alocar` faz `buscarInvoices` LIVE (1+2N chamadas Conexos). Total: `N × (1+2N)`. N=10 → 210 chamadas; N=30 → 1.830 (estoura sessão garantidamente). Tactic violada: Increase Resource Efficiency.
- **Impacto técnico**: regra "Baixar = auto-aloca múltipla automática" (2026-06-24, v0.7.0) inviável além de poucas invoices; operação atômica reverte tudo no estouro de sessão.
- **Impacto de negócio**: feature de produto não funciona para processos médios; analista forçado ao caminho manual no ERP; v0.7.0 vendida e parcialmente quebrada.
- **Card(s) Kanban relacionados**: performance-2 (M · `validarEAlocar(input, invoice)` puro), performance-1 (S · `BoundedConcurrency` em `buscarInvoices`)
- **Custo de inação em 6 meses**: cresce com complexidade dos processos Columbia; reclamação direta do Yuri assim que a UX virar realidade. Premissa: 1 sprint de refactor.

### R-8: Zero rollback automatizado para o caminho de escrita financeira (`fin010`)
- **QA(s) afetados**: Deployability (P0), Fault Tolerance (correlato — sem recovery), Availability (sem reconfiguration rápida)
- **Findings de origem**: F-deployability-1
- **Evidência sintetizada**: `render.yaml:14-22` (`autoDeploy: true`, sem alias/versioning); `docs/runbooks/fin010-write-cutover.md:36-40` ("Imediato: `CONEXOS_DRY_RUN=true` + restart" / "Baixa já gravada: estornar manualmente no fin010 UI"). Rollback de código = `git revert` + rebuild (~5 min). Rollback de baixa gravada >30 min/par (UI Conexos). Tactic violada: Rollback.
- **Impacto técnico**: regressão em `reconciliarPermuta` (habilitado em prd em v0.6.0/v0.8.0) não tem reversão programática; cada baixa errada precisa de estorno manual; MTTR em horas.
- **Impacto de negócio**: sistema **acabou** de habilitar escrita financeira em produção; janela de incidente expõe a dupla baixa e descasamento contábil.
- **Card(s) Kanban relacionados**: deployability-1 (L · `rollback.yml` + `EstornoLoteService` programático)
- **Custo de inação em 6 meses**: incidência atrelada à frequência do "Executar lote"; cada bug que escapar do teste vira incidente operacional de horas. Premissa: SISPAG e Popula GED entram → 3 escritas no ERP em rotação.

### R-9: Single role `admin` + único JWT 12h em `localStorage` sem revogação server-side
- **QA(s) afetados**: Security (P1 × 2), Fault Tolerance (audit de quem fez)
- **Findings de origem**: F-security-2 (revogação ausente, 12h), F-security-3 (single role)
- **Evidência sintetizada**: `AuthService.ts:24` (`TOKEN_EXPIRATION = '12h'`); `lib/auth/token.ts:5,19` (`localStorage.getItem('auth_token')`); `AuthProvider.tsx:77-84` (`signOut` = `localStorage.removeItem` apenas); `migrations/0007_app_user.sql:8` (`role DEFAULT 'admin'`); `routes/permutas.ts` (14× `requireRole('admin')`). Sem `jti`, sem denylist, sem rotação. Tactic violada: Revoke Access, Authorize Actors (granularidade), Limit Exposure.
- **Impacto técnico**: token roubado por XSS/dump/laptop comprometido = 12h válido; logout não invalida server-side; single role = qualquer credencial vazada abre toda a superfície destrutiva (finalize, lote, estorno, exclusão); sem 4-eyes / maker-checker.
- **Impacto de negócio**: incompatível com a promessa SaaSo financeira (compliance SOX-like, LGPD). Janela de 12h para um JWT comprometido executar dezenas de baixas no `fin010`.
- **Card(s) Kanban relacionados**: security-2 (M · `jti` denylist + TTL 4h), security-3 (L · viewer/analyst/approver/admin + 4-eyes), security-4 (M · `app_audit_auth`)
- **Custo de inação em 6 meses**: bloqueia onboarding do segundo cliente; compliance falha em auditoria. Premissa: 1 sprint para `jti` + denylist; 2 para RBAC granular.

### R-10: Cobertura crítica baixa onde o produto move dinheiro — `PermutaExecucaoRepository` 49% lines / 30% branches
- **QA(s) afetados**: Testability (P0), Fault Tolerance (idempotência write-ahead é a guarda principal)
- **Findings de origem**: F-testability-2
- **Evidência sintetizada**: `PermutaExecucaoRepository.ts:1-441` = 21 métodos públicos (write-ahead da baixa no `fin010`). `PermutaExecucaoRepository.test.ts` = 10 `it()` blocks. Cobertura: stmts 49.36% · branches 30.76% · funcs 28.57% · lines 51.42%. Métodos sem teste: `deleteByBorCod`, `updateBorderoCacheSituacao`, `replaceBorderoCache`, `renameKey` — todos escrita destrutiva. Threshold por diretório `domain/service/` em 88 lines **não cobre** `domain/repository/`. Tactic violada: Executable Assertions, Specialized Interfaces.
- **Impacto técnico**: regressão de UPSERT/RETURNING/WHERE corrompe silenciosamente a tabela de idempotência → dupla-baixa no Conexos.
- **Impacto de negócio**: dupla-baixa = duplicação de lançamento financeiro no ERP da Columbia; auditoria contábil reabre exercício.
- **Card(s) Kanban relacionados**: testability-2 (M · 1 `it()` por método público + threshold `domain/repository/`)
- **Custo de inação em 6 meses**: probabilidade aumenta com cada PR que toca o repo; bug silencioso na invariante mais crítica do produto. Premissa: <1 sprint para fechar.

## 3. Cross-cutting findings

### CC-1: God-component `src/frontend/app/permutas/page.tsx` (2.971 LOC)
- **Aparece em**: Modifiability (F-modifiability-1, P0), Performance (F-performance-5, P1), Testability (F-testability-1, P0)
- **Findings**: F-modifiability-1, F-performance-5, F-testability-1
- **Diagnóstico unificado**: um único `'use client'` concentra 5 abas + filtros + 39 modais + ingestão + relatórios. 35 useState forçam re-render da árvore inteira a cada interação; bundle de rota único (TBT alto); cobertura impossível porque "a unidade é o app inteiro". Threshold Jest FE rebaseado para lines 20 / branches 9 admitindo o problema — CI verde virou Potemkin.
- **Recomendação consolidada**: card único multi-QA = **modifiability-1 + performance-5 + testability-1 fundidos** num plano por aba: extrair `app/permutas/{automaticas,manual,ingestao,borderos,relatorios}/page.tsx`, `app/permutas/layout.tsx` (shell), modais em `_modals/`, estado compartilhado em `PermutasFiltroProvider`, `next/dynamic` no `BorderosPanel` (683 LOC), `React.memo` em linhas de tabela. Após o split: subir threshold em 3 etapas (20→35 → 50 → 60 em 90 dias).

### CC-2: God-client `src/backend/domain/client/ConexosClient.ts` (1.956 LOC, 5 famílias wire)
- **Aparece em**: Integrability (F-integrability-1, P1), Modifiability (F-modifiability-2, P0), Testability (F-testability-9, P2)
- **Findings**: F-integrability-1, F-modifiability-2, F-testability-9
- **Diagnóstico unificado**: 28 métodos públicos cobrindo `com298` (proforma+invoice+detail), `com299` (crédito), `com308` (títulos+baixas), `imp019/imp223` (declaração), `fin010` (borderô + write 5-step). Teste 1.628 LOC. Cada `/feature-new` serializa aqui; mock parcial impossível; SISPAG/GED/SharePoint multiplicarão o débito 4× se copiarem o pattern.
- **Recomendação consolidada**: card único = **integrability-1 + modifiability-2 + testability-8 fundidos**: extrair `ConexosBaseClient` (auth+retry+error+transport) e dividir em `ConexosFinDocClient` (com298/com308/com299), `ConexosImportClient` (imp019/imp223), `ConexosBorderoClient` (fin010 read+write). Manter fachada deprecada até o último `/feature-tweak` migrar. **Pré-requisito** para Frente II/III.

### CC-3: `titCod: 1` hardcoded em 5 sites — multi-título no `fin010` indefinido
- **Aparece em**: Integrability (F-integrability-5, P1), Modifiability (F-modifiability-5, P1), Fault Tolerance (F-fault-tolerance-5, P1)
- **Findings**: F-integrability-5, F-modifiability-5, F-fault-tolerance-5
- **Diagnóstico unificado**: anti-drift (I-Write-1) impede corrupção mas bloqueia 100% das invoices multi-parcela; decisão de domínio A vs B (iterar 1..N vs só permutáveis) pendente do Yuri há 3+ runs.
- **Recomendação consolidada**: 1 reunião de domínio + 1 card único = **modifiability-5 (S, defensivo) + integrability-5 (M, contrato) + fault-tolerance-5 (M, teste fixture + pair-review --high-risk)**: introduzir `Invoice.tituloAlvoTitCod()` no domínio, substituir 5 literais, atualizar `business-rules/fin010-write-contract.md`, cobrir com fixture sintética multi-título.

### CC-4: Zero observabilidade externa (APM/SIEM/audit-trail DB)
- **Aparece em**: Availability (F-availability-2, P1), Fault Tolerance (F-fault-tolerance-4, P1), Security (F-security-4, P1), Performance (p95/p99 declarados "não medíveis"), Modifiability (time-to-change não instrumentado)
- **Findings**: F-availability-2, F-fault-tolerance-4, F-security-4
- **Diagnóstico unificado**: `Logger.ts` = `console.log/error`; `LogService.writeLog` = `process.stdout.write`; Render Starter retém logs ~7d sem busca; `app_audit_auth` não existe; `bordero_acao_log` não existe. Sem APM = sem MTTD, sem p95, sem alerta, sem forense.
- **Recomendação consolidada**: 2 cards complementares = **availability-2 (S · Sentry @sentry/node + cron checkin) + 2 migrations DB (`bordero_acao_log` da fault-tolerance-4 + `app_audit_auth` da security-4)**. Custo S+M+M; resolve MTTD heurístico, forense em SQL, alerta automático sobre incremento de erro.

### CC-5: `process.env.X` cru fora do `EnvironmentProvider` (25 sites BE)
- **Aparece em**: Modifiability (F-modifiability-7, P2), Integrability (F-integrability-8, P2), Security (correlato — secrets `CONEXOS_*` lidos por 2 caminhos)
- **Findings**: F-modifiability-7, F-integrability-8
- **Diagnóstico unificado**: legado `services/conexos.ts:80,142-145` lê `CONEXOS_BASE_URL/USERNAME/PASSWORD` direto; `BcbClient.ts:123` lê `BCB_CDI_FALLBACK`. Viola Inviolable Rule #8. Bloqueia migração para SSM/multi-tenant; dupla fonte de verdade para credenciais Conexos.
- **Recomendação consolidada**: 1 card único = **integrability-2 + modifiability-7 + integrability-8 fundidos**: migrar `ConexosService` (axios + sid + mutex + 401-retry) para dentro de `ConexosBaseClient` (consumindo `EnvironmentProvider`); apagar `services/conexos.ts` (~342 LOC) + `legacyConexosAdapter.ts` (~120 LOC); adicionar regra `PatternGuardian` que bloqueia `process\.env\.` em `client/**` e `service/**`. Pré-requisito SaaSo.

### CC-6: Ausência de fixtures HAR/contract tests do Conexos (e validação Zod a 14%)
- **Aparece em**: Integrability (F-integrability-3 14%, F-integrability-7 sem fixture, P1+P2), Testability (F-testability-6, P1)
- **Findings**: F-integrability-3, F-integrability-7, F-testability-6
- **Diagnóstico unificado**: 4/28 métodos do `ConexosClient` validam resposta com Zod (write fin010 passos 2/3/4 usam `cast` sem `.parse`); 81 `it()` usam `jest.fn()` com shape inline; HARs reais ficaram em `ontology/_inbox/` em prosa. Contrato real do ERP só vive na cabeça do Yuri e nos comentários.
- **Recomendação consolidada**: 2 cards combinados = **integrability-3 (M · Zod boundary 100%) + testability-5 (M · fixtures gravadas via QaCoach)**. Resultado: cada endpoint write-side com `.parse()` + fixture JSON real validando o schema; quirks anotados (`// QUIRK: conexos@2026-06-25`) e rastreáveis.

### CC-7: Família de idempotência cross-system (`Idempotency-Key` + stuck-state reaper + drift detection)
- **Aparece em**: Fault Tolerance (F-fault-tolerance-1/2/3/6 todos P1), Availability (correlato — sem visibilidade de stuck), Security (anti-replay)
- **Findings**: F-fault-tolerance-1, F-fault-tolerance-2, F-fault-tolerance-3, F-fault-tolerance-6
- **Diagnóstico unificado**: 1/3 rotas honram `Idempotency-Key` (`/eleicao` sim, `/reconciliar-lote` e `/reconciliar` não); sem reaper para `reconciling AND atualizado_em < now()-30min` (aberto há 3 runs); sem drift detection trilha local ↔ `fin010`. Os 4 vetores compartilham infra: `ConexosClient.listBaixas`, query em `permuta_alocacao_execucao`, padrão write-ahead.
- **Recomendação consolidada**: 4 cards executados na mesma task force reusando a mesma infra: **fault-tolerance-1 + fault-tolerance-2 + fault-tolerance-3 + fault-tolerance-6**. Compartilham `listBaixas` + `listStuckReconciling` + tabela curta de cache idempotente. Provisório = rota admin `POST /permutas/conferir-drift` + `POST /permutas/reconciliar-orfaos`.

## 4. Quick wins (≤5 dias úteis)

Cards de esforço **S** com severidade ≥ P2.

| Card | QA | Esforço | Severidade | Resultado esperado |
|---|---|---|---|---|
| availability-1 | Availability | S | P1 | `/ready` separado de `/health` probando Postgres + Env; Render para de rotear em ≤30s em incidente Supabase |
| availability-2 | Availability | S | P1 | Sentry no backend + cron checkin; MTTD >30min → <5min; deps APM 0→1, alertas ≥2 |
| availability-3 | Availability | S | P1 | SIGTERM handler com drenagem 25s; borderôs órfãos por deploy → ~0 |
| availability-5 | Availability | S | P2 | Self-test no boot (PG + Conexos); deploy com config inválida nunca promove |
| availability-6 | Availability | S | P2 | Cron de ingestão com retry + alerta `if: failure()`; MTTD → ≤5min |
| deployability-2 | Deployability | S | P1 | Smoke test pós-deploy assertando `/health.version == tag`; MTTD de "deploy errado" → ≤10min |
| deployability-3 | Deployability | S | P1 | `.nvmrc` + `engines` unificando Node 22/24 → 1 versão; bug Node-only em cron sumir |
| deployability-7 | Deployability | S | P2 | `npm audit --audit-level=high` no FE espelhando BE; resolver `ws` HIGH atual |
| deployability-9 | Deployability | S | P2 | `/ready` no backend validando Postgres + última migration + Conexos HEAD |
| integrability-7 | Integrability | S | P2 | `wire_contract_observed_at` em `ontology/integrations/<name>.md`; quirks anotados com `// QUIRK: provider@date` |
| integrability-8 | Integrability | S | P2 | Banir `process.env.X` em service/client (lint custom); `BcbClient.BCB_CDI_FALLBACK` → `EnvironmentVars` |
| modifiability-5 | Modifiability | S | P1 | `Invoice.tituloAlvoTitCod()` substitui 5 literais; multi-título coberto por teste defensivo |
| modifiability-6 | Modifiability | S | P1 | `CONTA_GER_JUROS/DESCONTO` (130/131) → `EnvironmentVars`; SaaSo viável sem fork |
| modifiability-7 | Modifiability | S | P2 | `services/conexos.ts` para `EnvironmentProvider`; Rule #8 100% em service |
| performance-1 | Performance | S | **P0** | `BoundedConcurrency.map(10)` em `buscarInvoices`; `MaxSessions` da rota → 0 |
| performance-3 | Performance | S | P1 | `findByAdiantamento(docCod)` indexado substitui `listAtivas` full-scan no lote |
| performance-6 | Performance | S | P2 | `httpsAgent` keep-alive no axios Conexos; overhead 90–150ms → ~5–10ms |
| performance-7 | Performance | S | P2 | `LIMIT` defensivo em 7 hot reads + warn "limit hit" como alarme |
| performance-8 | Performance | S | P2 | `fetchWithTimeout(url, opts, 15_000)` cobre 25 fetches FE; spinner infinito sumir |
| security-1 | Security | S | P1 | Whitelist `local`-only para bypass + 3 testes de boot; `DEV_AUTH_BYPASS` em prd → crash |
| security-6 | Security | S | P1 | `npm audit --audit-level=high` no FE + resolver `ws` HIGH atual; gate equivalente BE/FE |
| security-8 | Security | S | P2 | `helmet()` no Express; ≥5 security headers; nota de `securityheaders.com` F→A |
| security-9 | Security | S | P2 | Remover `credentials: true` do CORS enquanto Bearer-only; sem superfície CSRF latente |

**23 cards quick-win**. A maioria são wrappers/configurações descobertos faltando — refactor real só começa nos strategic.

## 5. Strategic moves (M / L / XL)

| Card | QA(s) | Esforço | Tactic alvo | Por que vale |
|---|---|---|---|---|
| modifiability-1 + performance-5 + testability-1 (CC-1) | Modifiability + Performance + Testability | XL | Split Module · Reduce Overhead · Limit Structural Complexity | `page.tsx:2971 LOC / 35 useState / 39 modais` e cobertura `0%`. Threshold FE rebaseado para lines 20 admite. Resolve 3 P0 + bloqueio SISPAG |
| modifiability-2 + integrability-1 + testability-8 (CC-2) | Modifiability + Integrability + Testability | L | Split Module · Encapsulate | `ConexosClient.ts:1956 LOC / 28 públicos / 5 famílias`; teste 1628 LOC; pré-requisito para Frente II/III |
| integrability-3 + testability-5 (CC-6) | Integrability + Testability | M | Tailor Interface · Recordable Test Cases | Zod hoje em 4/28 (14%); 0 fixtures gravadas / ~15 endpoints |
| integrability-2 + modifiability-7 + integrability-8 (CC-5) | Integrability + Modifiability + Security | M | Use an Intermediary · Configure Behavior | 462 LOC legadas; 25 `process.env` cru; pré-requisito SaaSo |
| integrability-4 | Integrability | XL | Encapsulate · Discover Service | Frente II + III = metade da proposta; **0 clients** para 3 provedores |
| performance-2 | Performance | M | Increase Resource Efficiency | `N × (1+2N)` chamadas Conexos por auto-alocação; N=30 → 1830. v0.7.0 vendida e parcialmente quebrada |
| performance-4 | Performance + Availability + FT | L | Bound Execution Times · Schedule Resources | LOTE_MAX=6 × 6 calls × 800ms = ~24s vs 30s proxy. Latência HTTP 10-25s → <500ms |
| fault-tolerance-1/2/3/6 (CC-7) | Fault Tolerance + Availability | M cada | Idempotent Replay · Reconcile · Condition Monitoring | Super-pagamento aberto há 3 runs; 1/3 rotas com Idempotency-Key; mesma infra resolve os 4 |
| fault-tolerance-4 + security-4 (CC-4 audit DB) | Fault Tolerance + Security | M cada | Audit Trail · Condition Monitoring | 0/5 ações de borderô persistidas; 0 eventos auth; retenção Render 7d |
| security-2 | Security | M | Revoke Access | TTL 12h + localStorage + logout client-only. 12h para JWT comprometido executar baixas |
| security-3 | Security | L | Authorize Actors (granularidade) | Único role `admin` para 14 endpoints; 0 com 4-eyes |
| security-5 | Security | M | Lock Computer · Detect Intrusion | Tentativas/min/username = ∞; rate-limit por IP contornável; combina dummy bcrypt no fast-path |
| security-7 | Security | XL | Separate Entities | 0 tenants provisionados; 1 Supabase/Render/Conexos compartilhado. Bloqueio comercial do 2º cliente |
| deployability-1 | Deployability + FT | L | Rollback | Rollback código ~5min→≤2min; baixa errada >30min/par→≤5min/borderô (programático) |
| deployability-4 | Deployability | M | Script Deployment Commands | Bump Windows-only; CI Ubuntu não roda; deriva entre `package.json` e tag |
| deployability-5 | Deployability | M | Scale Rollouts | 1 ambiente; "homologação" = flip em prd. Pré-requisito SISPAG/GED |
| deployability-6 | Deployability | M | Rollback (data layer) | 19 migrations UP, 0 DOWN; rename/drop futuro = incidente |
| modifiability-3 | Modifiability | M | Refactor | 20 warnings cognitive-complexity; pior = 65; ratchet decrescente no CI |
| modifiability-4 | Modifiability | M | Restrict Dependencies | 6 cross-layer imports rota→repo/client; `biome.json` sem `noRestrictedImports` |
| modifiability-8 | Modifiability | M | Split Module | `routes/permutas.ts` 25 rotas + 29 imports + 772 LOC |
| availability-4 | Availability | M | Removal from Service | Sem breaker = falha sustentada consome budget até ~990s vs 100s teto |
| availability-7 | Availability | M | Passive Redundancy · Degradation | `FallbackExecutor` declarado mas não existe. Cache `permuta_bordero` maduro |
| testability-2 | Testability + FT | M | Executable Assertions | `PermutaExecucaoRepository` 49% lines / 30% branches; 11 dos 21 métodos sem teste |
| testability-3 | Testability + Deployability | L | Sandbox | 0 integration tests; SQL complexo só testado com mock |
| testability-4 | Testability + Modifiability | M | Limit Non-Determinism | 22 `new Date()` em fonte; 0 `useFakeTimers` |
| testability-7 | Testability | M | Executable Assertions | <5% testes asseguram shape do log; MTTR sobe sem `LOG_TYPE` + `requestId` |

**40 cards strategic** (M/L/XL), 7 deles consolidáveis em task forces multi-QA (CC-1 a CC-7).

## 6. O que está bem (e por quê)

1. **Idempotência write-ahead em escritas ao ERP** (Idempotent Replay + Quarantine). `permuta_alocacao_execucao` com UNIQUE `idempotency_key = permuta:{adto}:{invoice}:{atualizadoEm}` + `Idempotency-Key` header em `/eleicao` + advisory lock em `IngestaoPermutasService`. `setBorCod` ANTES do POST. State-machine guard SQL. Evidência: `PermutaExecucaoRepository.ts:62-78,219-256`; migration `0015`.
2. **Anti-drift na baixa fin010** (Sanity Checking). Tolerância `max(0.01, em-aberto × 0.005)` + `Math.min(valorBaixaDesejado, emAbertoErp)` aborta baixa que excede em-aberto vivo. **Conteve** o caso multi-título. Evidência: `ReconciliacaoPermutaService.ts:269-284`.
3. **Continue-on-error com cap server-side no lote** (Degradation + Limit Event Response). `LOTE_MAX=6` (caiu de 10) + try/catch por par + agregação `totalErros`. Evidência: `ReconciliacaoLotePermutaService.ts:14,113-149`.
4. **Default seguro de escrita: dry-run ON** (Change Default Settings). `CONEXOS_WRITE_ENABLED=false` + `CONEXOS_DRY_RUN=true` por default; runbook `fin010-write-cutover.md`; ambas em `sync:false` no Render. Evidência: `EnvironmentVars.ts:30-36`, `render.yaml:32-40`.
5. **Trava de integridade na remoção de alocação** (Quarantine). v0.8.2 + v0.8.3: `AlocacaoEmBorderoError 409` quando alocação em borderô vivo; query exclui `bor_vld_finalizado=2`. Impossível descasar a trilha. Evidência: `AlocacaoPermutasService.ts:293-303`, `PermutaExecucaoRepository.ts:102-123`.
6. **SQL parametrizado, Zod nos boundaries HTTP, bcrypt rounds=12, RBAC em 14/14 mutações, CORS allow-list** (Validate Input + Authenticate/Authorize Actors + Encrypt Data). 0 SQL não-parametrizado; 100% das rotas com input validam via Zod; bcrypt acima de OWASP 2023. Evidência: `routes/permutas.ts:32-49`, `jobs/seed-admin.ts:18`, `http/cors.ts:31-55`.
7. **Backend disciplinado em DDD + DI + cobertura**. BE All Files = **88.34% lines / 67.79% branches** com 480 testes verde; 124/125 testes usam injeção por construtor; fan-in lateral entre services máximo = 6. Evidência: `npm test --coverage` + `_shared-metrics.md`.
8. **CI funcional com gates declarativos + `render.yaml` versionado** (Manage Deployment Pipeline). `npm ci` + typecheck + lint + test + `npm audit --audit-level=high` (BE); `render.yaml` declarativo; tag/release automático na main; backend builda em 2.1s / `dist` 3.3MB. Evidência: `.github/workflows/ci.yml`, `render.yaml:32-40`.

## 7. Limitações da análise

**Métricas declaradas como "não medíveis localmente"**:
- p95/p99 de latência fim-a-fim em prd; MTTR real; uptime mensal; taxa de erro p95.
- Lead-time real commit→prd; taxa de sucesso de deploy; frequência de rollback.
- # de execuções `reconciling` órfãs em prd; MTTR para conciliar `error` manual.
- MTTD de credencial vazada; taxa de 401/403 por IP; presença de WAF.
- Per-dependency error rate; p95 latency Conexos.
- Flake rate em 30 dias; MTTR de bug em prod; cobertura runtime no fluxo Conexos real.
- First Load JS por rota Next 16 (não executei `npm run build` no FE neste run).

**O que o pipe não cobre**: chaos engineering; threat modeling formal (STRIDE/PASTA); custo cloud; UX/usabilidade; acessibilidade WCAG; cyclic dependencies (sem `madge`/`dependency-cruiser`).

**Edições do consolidator**: nenhum card foi renomeado. CC-1/2/3/5/6/7 propõem **fusão de execução** (mesma task force) mas cards individuais permanecem no Kanban — fica a critério do tech lead pull-up como épico. F-availability-7 não tem card próprio (cross-ref ao performance-4); F-availability-9 sem card por escolha do agent.

**Janela temporal**: snapshot 2026-06-26 sobre `main @ 4e59fec` (v0.8.3). Reincidência de F-fault-tolerance-3 na 4ª re-priorização sinaliza que **a cadência de execução dos P1 está abaixo da cadência de feature**. Refazer trimestralmente ou após qualquer release que toque write-side do `fin010`.

## 8. Ações recomendadas

1. **Bloquear catástrofes silenciosas antes de qualquer feature nova** (semana 1):
   - security-1 (S · whitelist `local`-only no bypass — fecha R-5).
   - availability-2 (S · Sentry + cron checkin — destrava métricas runtime).
   - availability-1 + availability-5 + deployability-9 (3× S · `/ready` real + self-test no boot — fecha "deploy verde servindo 500").
   - deployability-3 (S · pin Node 22 LTS — fecha drift runtime).
   - performance-1 (S · `BoundedConcurrency` em `buscarInvoices` — fecha vetor `MaxSessions`).

2. **Endereçar 100% dos P0 + R-4 (super-pagamento)** (semanas 2–3):
   - deployability-1 (L · rollback one-command + `EstornoLoteService` — fecha R-8).
   - performance-2 (M · auto-alocação O(N²)→O(N) — fecha R-7).
   - fault-tolerance-1 + fault-tolerance-3 (M+M, task force compartilhando `listBaixas` — fecha R-4).
   - testability-2 (M · cobrir `PermutaExecucaoRepository` 49%→85% — fecha R-10).

3. **Quick-win bundle defensivo + audit trail** (semana 3 paralela):
   - availability-3 (S · SIGTERM graceful).
   - security-6 + deployability-7 (S+S · `npm audit` no FE + resolver `ws` HIGH).
   - security-8 + security-9 (S+S · `helmet()` + remover `credentials: true`).
   - fault-tolerance-4 + security-4 (M+M, mesma task force — 2 migrations + 2 repositories — fecha CC-4).

4. **Decidir e fechar multi-título** (semana 4, **bloqueio de domínio**):
   - 1 reunião Yuri (decisão A vs B em `permuta-multi-titulo-pendente.md`).
   - modifiability-5 + integrability-5 + fault-tolerance-5 (S+M+M — fecha CC-3 / R-3).

5. **Plano de 60 dias (semanas 5–8) — destrancar evolução**:
   - Iniciar CC-1 (split `page.tsx`): modifiability-1 + performance-5 + testability-1 fundidos; 1ª aba (Automáticas) em 2 sprints.
   - Iniciar CC-2 (split `ConexosClient`): modifiability-2 + integrability-1 + testability-8; `ConexosBaseClient` extraído.
   - fault-tolerance-2 + fault-tolerance-6 (M+M · completar família CC-7).
   - security-2 + security-5 (M+M · revogação JWT + lockout).
   - deployability-5 (M · staging permanente — pré-requisito SISPAG).