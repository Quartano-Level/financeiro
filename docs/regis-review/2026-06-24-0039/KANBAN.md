---
type: regis-review-kanban
run_id: 2026-06-24-0039
total: 49
counts: { p0: 7, p1: 22, p2: 14, p3: 6 }
---

# Kanban — financeiro — 2026-06-24-0039

> Importável para o Kanban do time. Cada card abaixo já tem Problema / Melhoria Proposta / Resultado Esperado verbatim das seções QA.
> Ordem: P0 (S → L), depois P1, P2, P3.

---

## P0 — Crítico

### [fault-tolerance-1] Adicionar canary/feature-flag por filial OU por adiantamento para a escrita real no `fin010` nas primeiras 72h
**QA**: Fault Tolerance · **Tactic alvo**: Substitution (avoid) · **Esforço**: S · **Findings**: F-fault-tolerance-1

**Problema**
> A escrita real no `fin010` está ligada direto em produção (`render.yaml:37-42`), sem staging, sem canary, sem feature-flag granular. Qualquer regressão futura escreve dinheiro real até alguém perceber. O dry-run-override do body é defesa de profundidade ruim — depende de o analista marcar.

**Melhoria Proposta**
> Adicionar 1 das 2 opções (preferir a primeira): (1) **Allow-list por filial** em `EnvironmentProvider` (`CONEXOS_WRITE_FIL_CODS=2,4`) — só executa `gravarBaixaPermuta` se `filCod ∈ allow-list`. Padrão: lista vazia ⇒ bloqueia (fail-closed). (2) **Feature-flag por adiantamento** persistida em DB (`permuta_write_allowlist`) povoada via admin endpoint. Em ambas, manter o gate global `CONEXOS_WRITE_ENABLED` como kill-switch.

**Resultado Esperado**
> Blast radius de uma regressão limitado a N filiais/adiantamentos opt-in. % de execuções reais cobertas por allow-list: hoje 0% → alvo 100% nas primeiras 72h pós-cutover.

**Métricas de sucesso**
- Execuções fora da allow-list bloqueadas: 0 → 100%

**Risco de não fazer**: 1 deploy com regressão de payload escreve N baixas erradas no `fin010` antes da descoberta humana.
**Dependências**: nenhuma · **Cross-QA**: Deployability (F-deployability-1)

---

### [deployability-2] Mover flags de risco para única fonte da verdade (dashboard + drift check)
**QA**: Deployability · **Tactic alvo**: Drift detection · **Esforço**: S · **Findings**: F-deployability-2

**Problema**
> `CONEXOS_WRITE_ENABLED`/`CONEXOS_DRY_RUN` em `render.yaml` como `value:` + dashboard sobrescreveu → operador não soube qual valor vence; o push do yaml deveria ter desligado/ligado e não teve efeito visível (sessão).

**Melhoria Proposta**
> Trocar essas duas chaves para `sync: false` (gerenciadas só pelo dashboard) **e** criar workflow noturno `gh actions` que (a) consulta Render API `GET /v1/services/{id}/env-vars`, (b) compara com snapshot versionado em `infra/expected-envs.json`, (c) abre issue se divergir.

**Resultado Esperado**
> Apenas 1 lugar para configurar a flag (dashboard, com auditoria do painel). Drift detectável em ≤ 24h.

**Métricas de sucesso**
- # flags em dois lugares: 2 → 0
- Tempo até detectar drift: ∞ → ≤ 24h

**Risco de não fazer**: próximo flip de flag falha em silêncio → escrita continua quando deveria parar.
**Dependências**: token Render API com escopo read-only em GitHub Secrets

---

### [deployability-3] Automatizar deploy do frontend e fixar wildcard em `ALLOWED_ORIGINS`
**QA**: Deployability · **Tactic alvo**: Script Deployment Commands · **Esforço**: S · **Findings**: F-deployability-3

**Problema**
> `npx vercel --prod` é manual; alias gerado nem sempre bate com o `ALLOWED_ORIGINS` cravado no Render → CORS quebra login. Custo: 1 incidente / sessão.

**Melhoria Proposta**
> Adicionar job `frontend-deploy` no `ci.yml` (`needs: [frontend]`, `if: ref == main`) usando `vercel-action` com `--prod`. Em paralelo, normalizar `ALLOWED_ORIGINS` em PRD para `https://kavex-financeiro.vercel.app,https://*.vercel.app` (o suporte a wildcard já existe em `cors.ts:31-37`).

**Resultado Esperado**
> Push para `main` ⇒ FE em PRD com alias estável; nenhum alias da Vercel é capaz de bypassar a CORS allow-list.

**Métricas de sucesso**
- Steps automáticos commit→FE PRD: 0 → ≥ 3 (build, deploy, verify)
- Incidentes de CORS por release: 1 → 0

**Risco de não fazer**: toda release implica risco de login quebrado por minutos.
**Dependências**: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` em GitHub Secrets

---

### [security-1] Validar escopo do borderô server-side antes de qualquer ação (finalizar/cancelar/estornar/DELETE)
**QA**: Security · **Tactic alvo**: Authorize Actors / Audit Trail · **Esforço**: M · **Findings**: F-security-1, F-security-6

**Problema**
> A lista `GET /permutas/borderos` traz todos os ~200 borderôs do ERP (inclusive criados por outros usuários do Conexos). O gating "ações só nos nossos" hoje vive APENAS no front (`daTrilha` desabilita o botão). O backend aceita qualquer `borCod`+`filCod` no body e executa a ação no ERP usando a conta de serviço `MPS_FRANCINEI`. Qualquer admin (ou JWT roubado) chama via `curl` e age sobre borderô de terceiro.

**Melhoria Proposta**
> Adicionar guard em `BorderoGestaoService` (antes de `finalizar/cancelar/estornar/excluirBordero/excluirBaixa`): consultar `permuta_alocacao_execucao` por `borCod`; se NÃO houver trilha local, rejeitar com `403 'borderô fora do escopo deste sistema'` (a menos que role nova `superadmin` autorize, registrando motivo). Não confiar no `filCod` enviado — derivar **apenas** da trilha ou da env. Persistir cada decisão em tabela `bordero_acao_audit(borCod, filCod, acao, executado_por, da_trilha, decisao, motivo, ts)`.

**Resultado Esperado**
> 0% das chamadas de mutação executam sobre `borCod` fora da trilha local (sem opt-in explícito). Linha de auditoria em TODA ação.

**Métricas de sucesso**
- Rotas de mutação de borderô com check de escopo: 0/5 → 5/5
- Ações persistidas em `bordero_acao_audit`: 0% → 100%

**Risco de não fazer**: estorno/finalização indevida de borderô de terceiro → desconciliação não rastreável; fraude por admin malicioso plausível em < 1min.
**Dependências**: nova migration `bordero_acao_audit` + decisão de produto sobre `superadmin`

---

### [security-2] Forçar senha única por usuário no bootstrap + troca obrigatória + política mínima
**QA**: Security · **Tactic alvo**: Authenticate Actors · **Esforço**: S · **Findings**: F-security-2, F-security-4

**Problema**
> Os 4 usuários novos (francinei/grazi/simone/rogerio @kavex.com) foram seedados com a mesma string `Admin@user2406`. Sem flag de troca no primeiro login, sem MFA, sem política mínima. Comprometer 1 conta = comprometer as 4. Combinado com login sem rate-limit dedicado, basta phishing direcionado.

**Melhoria Proposta**
> (1) Estender `app_user` com `must_change_password BOOLEAN DEFAULT FALSE` e middleware que bloqueia qualquer rota não-`/auth/change-password` enquanto `true`. (2) Gerar 4 senhas aleatórias distintas (24+ chars) entregues fora-de-banda e rodar reset agora. (3) Aplicar política no `AuthService` (mínimo 12 chars, 1 número, 1 símbolo) com zxcvbn. (4) Roadmap: SSO Microsoft + MFA — eliminar `app_user` como source-of-truth.

**Resultado Esperado**
> 4 contas com senhas distintas, flag de troca limpa após reset, política mínima ativa.

**Métricas de sucesso**
- Contas com senha única + must_change_password=false após reset: 4/4
- bcrypt cost 10 → 12 (`seed-admin.ts:18`)

**Risco de não fazer**: phishing de 1 conta = comprometer 4 admins simultaneamente, todos com poder de finalizar/estornar `fin010` em PRD.
**Dependências**: comunicação coordenada com os 4 usuários

---

### [testability-1] Adicionar contract tests aos 8 métodos novos do `ConexosClient` (path + payload do `fin010`)
**QA**: Testability · **Tactic alvo**: Executable Assertions, Record/Playback · **Esforço**: S · **Findings**: F-testability-1, F-testability-5

**Problema**
> O bug docTip-vs-filCod nasceu porque os métodos novos do `ConexosClient` (`excluirBaixa`, `excluirBordero`, `finalizar/cancelar/estornarBordero`, `getBordero`, `listBorderos`, `listBaixas`) NÃO têm teste assertando o `path` HTTP nem o `opts.filCod` enviados ao `legacy.deleteGeneric/postGeneric/listGenericPaginated`. O teste de serviço passa com qualquer reordenação do path interno.

**Melhoria Proposta**
> Em `ConexosClient.test.ts`, criar `describe('fin010 write/list (Fase 3.1)')` com 1 teste por método: cada um assere `expect(legacy.X).toHaveBeenCalledWith(EXPECTED_PATH, EXPECTED_BODY, { filCod })`. Especialmente para `excluirBaixa`, fixar `path === 'fin010/baixas/14707/2/18780/1/1'` (com `docTip` no 2º segmento — protege contra a regressão concreta já vivida).

**Resultado Esperado**
> Contract tests para 100% dos 8 métodos novos. Qualquer regressão de path quebra o `npm test` em < 8s, **antes** do deploy.

**Métricas de sucesso**
- Contract tests dos novos métodos: 0 → 8
- Tests `it` em `ConexosClient.test.ts`: 71 → 79+
- Bugs de path em `fin010` em PRD: 1 (baseline) → 0

**Risco de não fazer**: próximo método WRITE/LIST adicionado herda o mesmo gap; cada bug consome ~1 dia de loop com Yuri.
**Dependências**: nenhuma · **Cross-QA**: Integrability (F-integrability-7 — mesma rede de regressão)

---

### [testability-2] Cobrir as 6 rotas novas de borderos com supertest + asserir `requireRole('admin')` e tradução de erro
**QA**: Testability · **Tactic alvo**: Executable Assertions, Sandbox · **Esforço**: M · **Findings**: F-testability-2, F-testability-4

**Problema**
> 6 endpoints novos em `routes/permutas.ts:410-557` sem cobertura. Middleware `requireRole('admin')` + `heavyRouteLimiter` e tradutor `erpErrorMessage` (mapa `ERP_MESSAGE_PT` com 3 chaves) podem regredir silenciosamente. `Number(req.params.borCod)` + `Number.isFinite` também não tem teste.

**Melhoria Proposta**
> Em `routes/permutas.test.ts`, criar `describe('borderos (Fase 3.1)')` cobrindo: (1) happy-path por rota (200 com payload esperado, mock do `BorderoGestaoService`); (2) `requireRole('admin')` retorna 403 sem role; (3) `borCod` inválido retorna 400; (4) erro do ERP com `cause.response.data.messages[0].message === 'FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO'` retorna 400 com mensagem pt-BR amigável.

**Resultado Esperado**
> 6/6 rotas com pelo menos 1 happy-path + 1 cenário de erro ERP; mapa `ERP_MESSAGE_PT` exercitado nas 3 chaves; `requireRole('admin')` defendido.

**Métricas de sucesso**
- Rotas de borderos cobertas: 0/6 → 6/6
- Chaves de `ERP_MESSAGE_PT` testadas: 0/3 → 3/3
- Cobertura camada `routes/`: 33% → 50%+

**Risco de não fazer**: regressão na guarda `requireRole('admin')` permite analista comum cancelar/estornar borderô finalizado.
**Dependências**: pattern de teste com supertest (já presente em `routes/permutas.test.ts`)

---

## P1 — Alto

### [availability-1] Plugar monitor externo + alerta de "fin010 error rate"
**QA**: Availability · **Tactic alvo**: Monitor, Ping/Echo · **Esforço**: M · **Findings**: F-availability-1, F-availability-2

**Problema**
> Falhas do handshake `fin010` (status `error` em `permuta_alocacao_execucao`), spin-down do Render, e cold-start lento só são percebidos quando o analista abre a aba "Borderôs" — TMTD ≈ 1 dia útil. Sem Sentry/Logtail/CloudWatch ligado, um dia inteiro de baixas pode falhar silenciosamente.

**Melhoria Proposta**
> Plugar Sentry SDK (`@sentry/node`) no `index.ts` para capturar `ConexosError` + `Error` não tratado; adicionar Render Log Stream → Logtail/BetterStack (free tier) com regra de alerta `"BUSINESS_WARN.*permuta reconciliacao FALHOU"` em janela 15min → Slack/e-mail. Ping externo `cron-job.org` GET `/health` a cada 4min em horário comercial (8h-19h BRT).

**Resultado Esperado**
> TMTD de falha em PRD: 1 dia útil → ≤ 15 min. Alertas de cold-start visíveis. Dashboard de "borderôs com erro/dia".

**Métricas de sucesso**
- TMTD erro `fin010`: ~1d → ≤ 15 min
- Cobertura de exceções não tratadas: 0% → 100% via Sentry
- Alertas configurados: 0 → ≥ 3

**Risco de não fazer**: operação aprende a "checar manualmente"; falha grave (ex.: senha Conexos expirada) passa um dia despercebida.
**Dependências**: nenhuma · **Cross-QA**: Deployability, Fault Tolerance

---

### [availability-2] Mover o backend para um plano com instância sempre-quente (saída do free tier)
**QA**: Availability · **Tactic alvo**: Active Redundancy, Reconfiguration · **Esforço**: S (upgrade) + M (mutex) · **Findings**: F-availability-2, F-availability-3

**Problema**
> Backend opera em free tier do Render — 1 instância, spin-down ≥50s após inatividade, sem failover. A 1ª request da manhã pode esperar 50s e disparar timeout do axios interno (40s). Não há redundância: se o nó cai, a operação financeira para.

**Melhoria Proposta**
> Subir para Render Standard ($25/mo, sem spin-down) ou equivalente; idealmente 2 instâncias atrás do load balancer (failover automático). **Antes de escalar para 2**, mover o mutex de `loginPromise` para Postgres advisory lock (mesmo padrão já em uso por `IngestaoCoalescerService`).

**Resultado Esperado**
> Disponibilidade 24/7 sem cold-start; instância única vira ≥2 com failover; mutex distribuído evita que `MAX_SESSIONS=3` vire gargalo.

**Métricas de sucesso**
- Cold-start na 1ª request: ≥50s → 0s
- Instâncias backend: 1 → ≥ 2
- Mutex `loginPromise`: in-memory → Postgres advisory lock

**Risco de não fazer**: no 1º fechamento mensal com volume real, cold-start trava a 1ª baixa do dia; sem failover, manutenção do Render derruba a operação.
**Dependências**: card `availability-1` (medir efeito) + `availability-3` (mutex)

---

### [availability-4] Dashboard "Borderôs com erro no dia" + alerta de partial-success
**QA**: Availability · **Tactic alvo**: Rollback, State Resynchronization · **Esforço**: S · **Findings**: F-availability-4, F-availability-6

**Problema**
> O handshake `fin010` (5 POSTs) não é transacional. Quando a 4ª de 5 alocações falha (`error`), as 3 anteriores ficam `settled` no mesmo borderô — válidas, mas exigem que o analista perceba e concilie manualmente via aba Borderôs.

**Melhoria Proposta**
> Criar página `/permutas/borderos/erros` (ou seção na atual) listando TODA execução com `status='error'` E `status='reconciling' MAIS DE 15 MIN`. Notificação Slack diária 19h "ainda há N borderôs com baixas em erro". Botão "estornar borderô + relançar" em 1 clique reusa o que a Fase 3.1 já entregou.

**Resultado Esperado**
> Tempo até conciliação de partial-success ≤ mesmo dia útil; nenhuma execução `reconciling` órfã > 24h sem alerta.

**Métricas de sucesso**
- Tempo até detecção de partial-success: indefinido → ≤ 4h
- Linhas órfãs `reconciling > 15min`: indefinido → 0

**Risco de não fazer**: acúmulo de borderôs com baixas erradas; conciliação contábil mensal vira pesadelo.
**Dependências**: card `availability-1`

---

### [deployability-1] Subir ambiente de homologação antes da próxima feature de escrita
**QA**: Deployability · **Tactic alvo**: Scale Rollouts · **Esforço**: M · **Findings**: F-deployability-1, F-deployability-5

**Problema**
> Não existe HML; `WRITE_ENABLED=true` foi para PRD sem validação intermediária. A baixa `fin010` é irreversível por nós. Primeira regressão = estorno contábil manual na Columbia.

**Melhoria Proposta**
> Duplicar o serviço Render como `financeiro-backend-hml` (`branch: hml`, `CONEXOS_BASE_URL=...columbiatrading-hml...`, `WRITE_ENABLED=true`, `DRY_RUN=false`). Projeto Vercel paralelo com `NEXT_PUBLIC_API_URL` para HML. `main` só recebe merge se `hml` rodou a feature de escrita pelo menos 1× verde.

**Resultado Esperado**
> 100% das features que tocam `ConexosClient.postGeneric/authenticatedPost` rodam em HML antes da PRD. # ambientes: 1 → 2.

**Métricas de sucesso**
- # ambientes não-PRD: 0 → ≥ 1
- # features de escrita validadas em HML antes do flip: 0% → 100%

**Risco de não fazer**: primeiro bug de write em PRD = estorno manual no `fin010`; em SISPAG/GED, blast-radius cresce.
**Dependências**: acesso ao ambiente HML Conexos (URL já no runbook)

---

### [deployability-4] Proibir migrations "à mão" em PRD — só `MigrationRunner`
**QA**: Deployability · **Tactic alvo**: Idempotent deploys · **Esforço**: M · **Findings**: F-deployability-4

**Problema**
> Sessão admitiu rodar SQL direto no Supabase; `0015`/`0016` foram escritas idempotentes para sobreviver à próxima reaplicação. Risco real na primeira migration *não* idempotente (`INSERT seed`, `BACKFILL`).

**Melhoria Proposta**
> (a) Política escrita no `DEPLOY.md`: "qualquer SQL em PRD passa pelo runner; emergências exigem `INSERT INTO schema_migrations` retroativo + ADR". (b) Validação no CI: workflow que aplica todas as migrations num Postgres efêmero e compara checksum com o que está em `schema_migrations` em PRD via Supabase API.

**Resultado Esperado**
> 100% das migrations passam pelo runner; drift checksum → alerta.

**Métricas de sucesso**
- Migrations fora do runner por mês: 2 (sessão) → 0
- Coluna `applied_at`/checksum auditável: ausente → presente

**Risco de não fazer**: backfill futuro duplica/corrompe dado de permuta — em cima de write-back real para o ERP.
**Dependências**: coluna `checksum TEXT` em `schema_migrations`

---

### [deployability-5] Runbook + botão de rollback de código (Render "Previous deploy")
**QA**: Deployability · **Tactic alvo**: Roll Back · **Esforço**: S · **Findings**: F-deployability-6

**Problema**
> Não há runbook descrevendo como reverter v0.6.0 → v0.5.0; o único runbook (`fin010-write-cutover.md`) cobre a flag, não o código. MTTR esperado num rollback de pânico = improvisação.

**Melhoria Proposta**
> Criar `docs/runbooks/rollback.md` cobrindo: (i) Render → service → Manual Deploy → "Deploy previous commit"; (ii) Vercel → "Promote previous deployment"; (iii) DB → política: migrations forward-only, rollback de schema só com migration aditiva + ADR. Treinar 1× por trimestre (game day).

**Resultado Esperado**
> Rollback executável em ≤ 5 min por qualquer pessoa do time, com passos numerados.

**Métricas de sucesso**
- # runbooks de rollback: 0 → 1
- MTTR estimado (auto-reportado em game day): ? → ≤ 5 min

**Risco de não fazer**: próxima regressão prolonga a janela de incidente proporcional à improvisação.
**Dependências**: nenhuma

---

### [integrability-1] Validar envelopes `fin010` com Zod no boundary (write-path)
**QA**: Integrability · **Tactic alvo**: Adhere to Standards (validate at boundary) · **Esforço**: M · **Findings**: F-integrability-1, F-integrability-4

**Problema**
> Os 5 endpoints write/validacao do `fin010` (validarTituloBaixa, validarTituloPermuta, atualizarValorLiquido, gravarBaixaPermuta) leem `responseData?.bxaMnyValor`/`gerNumPermuta`/etc. como cast TS sem validação runtime. Qualquer renomeação de campo wire passa silenciosamente e contamina a baixa gravada no ERP.

**Melhoria Proposta**
> Estender `conexosPermutasSchemas.ts` com 4 schemas Zod (`borderoCriadoSchema`, `tituloBaixaValidacaoSchema`, `tituloPermutaValidacaoSchema`, `baixaGravadaSchema`) cobrindo os campos canônicos consumidos. Aplicar `.parse(resp.responseData)` no `ConexosClient.ts` ANTES de retornar para o service, transformando drift em erro tipado (`ConexosError({ endpoint, cause: ZodError })`). Falha de schema → log `BUSINESS_WARN` + abort do handshake (a baixa NÃO é gravada).

**Resultado Esperado**
> Drift de campo wire detectado no boundary com mensagem específica ("campo `bxaMnyValor` ausente na resposta do `fin010/baixas/validacao/tituloBaixa`") em vez de "título sem valor em aberto". 0 escritas com `null`/`undefined` em campo obrigatório do payload do passo 5.

**Métricas de sucesso**
- Schemas Zod no caminho `fin010`: 0 → 4
- Reads `responseData?.` sem validação no service: 5 → 0
- Coerções `Number()`/`String()` no block fin010: 23 → ≤ 5

**Risco de não fazer**: 1 baixa irreversível torta em PRD custa horas de investigação contábil + retrabalho no ERP.
**Dependências**: nenhuma · **Cross-QA**: Fault Tolerance, Security

---

### [integrability-2] Pinning de contrato + scheduled drift probe contra sandbox Conexos
**QA**: Integrability · **Tactic alvo**: Versioning strategy · Discover Service · **Esforço**: L · **Findings**: F-integrability-2, F-integrability-7

**Problema**
> Contrato `fin010` reconstruído por engenharia reversa de HAR (11 endpoints), sem versionamento (0 ocorrências de `/v[N]`/header `Accept-Version`), sem detector de drift. O bug `docTip` vs `filCod` só foi descoberto por acaso porque filial 2 coincidia com docTip 2.

**Melhoria Proposta**
> (1) Commitar fixtures HAR canônicas em `src/backend/domain/client/__fixtures__/fin010/`. (2) Criar workflow GitHub Actions semanal `fin010-drift-probe` que roda o handshake CRIAR→VALIDAR→CANCELAR num borderô descartável da filial sandbox e diff'a a resposta vs. fixture. (3) Header `X-Client-Version` em cada request. (4) Documentar em `ontology/integrations/conexos.md` a tabela completa de paths + magic numbers + envelope.

**Resultado Esperado**
> Mudança de campo wire detectada em < 7 dias automaticamente. Bug "filial X tem padrão de path diferente" coberto por teste de regressão.

**Métricas de sucesso**
- Fixtures HAR commitadas: 0 → 11
- Endpoints com teste de path-regression: 0 → 11
- Tempo médio de detecção de drift: ∞ → ≤ 7 dias

**Risco de não fazer**: cada filial nova é sítio potencial de bug oculto; SISPAG terá o mesmo problema com `com298`.
**Dependências**: filial sandbox Conexos provisionada pelo Yuri (não-trivial)

---

### [integrability-3] Unificar mapa de erros `fin010` numa fonte única (módulo `fin010ErrorMessages.ts`)
**QA**: Integrability · **Tactic alvo**: Abstract Common Services · Encapsulate · **Esforço**: S · **Findings**: F-integrability-3

**Problema**
> Dois mapas paralelos de erro pt-BR — um em `ReconciliacaoPermutaService.ts:497-511` (4 chaves: FIN_010.*, CnxValidator*) e outro em `routes/permutas.ts:44-51` (3 chaves: FIN_014.*, Generic.*). Chaves disjuntas, um verbo duplicado (`FIN_IMPOSSIVEL_ALTERAR_REGISTRO` com prefixo `FIN_010` no service e `FIN_014` na route). Quando o ERP retorna o código "do outro lado", o usuário vê mensagem técnica.

**Melhoria Proposta**
> Extrair `src/backend/domain/client/permutas/fin010ErrorMessages.ts` exportando: (a) `Fin010ErrorKey` (union literal), (b) `FIN010_PT_BR: Record<Fin010ErrorKey, string>`, (c) `humanizeFin010Error(err: unknown): string`. Substituir os dois call sites pelo helper.

**Resultado Esperado**
> 0 chaves duplicadas/divergentes. 100% das mensagens visíveis ao usuário em pt-BR (catch-all `'O ERP recusou esta operação...'` vira fallback do mapa).

**Métricas de sucesso**
- Mapas de erro: 2 → 1
- Chaves cobertas: 7 → 7 (sem regredir) + catálogo completo em `ontology/integrations/conexos.md`

**Risco de não fazer**: toda nova chave descoberta exige 2 edits coordenados; tabelas drift'am.
**Dependências**: nenhuma · **Cross-QA**: Modifiability (overlap com `modifiability-3` — mesma causa-raiz; escolher 1 implementação)

---

### [integrability-4] Capturar `valid='AVISO'` em `BUSINESS_WARN` (catálogo + telemetria)
**QA**: Integrability · **Tactic alvo**: Observability of integration failures · **Esforço**: S · **Findings**: F-integrability-4

**Problema**
> `assertNoErpError` em `ReconciliacaoPermutaService.ts:461-469` SÓ barra `valid='ERRO'`. `AVISO` é descartado silenciosamente — sem log, sem métrica, sem catálogo. Se o ERP mudar a semântica de um aviso, perdemos o sinal.

**Melhoria Proposta**
> (1) Estender `assertNoErpError` para registrar `LOG_TYPE.BUSINESS_WARN` com `{ passo, message, vars }` para CADA item `valid='AVISO'`. (2) Criar `ontology/integrations/conexos-avisos.md` com a tabela de avisos vistos em produção + decisão (segue/bloqueia/escalável). (3) Acrescentar contador agregado por aviso no `LogService` (tabela local `conexos_aviso_count`).

**Resultado Esperado**
> 100% dos avisos do ERP visíveis na trilha de log + decisões documentadas. Novo aviso → BUSINESS_WARN já no primeiro disparo.

**Métricas de sucesso**
- Avisos capturados em log: 0 → 100%
- Catálogo documentado: 0 chaves → todas as vistas em 30d

**Risco de não fazer**: ERP introduz `AVISO` "BLOQUEAR_SUGERIDO" que indica problema material — não detectamos.
**Dependências**: nenhuma

---

### [integrability-5] Extrair constantes do contrato `fin010` (FIN010_DOC_TIP_INVOICE, FIN010_BORVLDTIPO_PERMUTA, FIN010_TIT_COD_UNICO)
**QA**: Integrability · **Tactic alvo**: Encapsulate · Adhere to Standards · **Esforço**: S · **Findings**: F-integrability-5, F-integrability-2

**Problema**
> Magic numbers do contrato (`docTip=2`, `borVldTipo=2`, `titCod=1`, `bxaTitCod=1`) repetem em 18+ sites. `docTip=2` e `borVldTipo=2` são valores DISTINTOS com o mesmo número — exatamente a coincidência que ocultou o bug `DELETE /fin010/baixas/{borCod}/{docTip}/...`.

**Melhoria Proposta**
> Criar `src/backend/domain/client/permutas/fin010Constants.ts` exportando: `FIN010_DOC_TIP_INVOICE = 2`, `FIN010_BORVLDTIPO_PERMUTA = 2`, `FIN010_TIT_COD_UNICO = 1`, `FIN010_BXATIT_COD_UNICO = 1`, `FIN010_BXAVLD_SISTEMA = 0`, `FIN010_BXAVLD_CORRENTE_DC = 1`, `FIN010_FRONT_MODEL_BAIXA = 'baixa'`, `FIN010_FRONT_MODEL_BORDERO = 'bordero'`. Substituir TODOS os literais.

**Resultado Esperado**
> Cada discriminante nomeado uma vez; quando o Conexos adicionar `docTip=3` (NF) ou parcelamento (`titCod>1`), a mudança é tipada (`Fin010DocTip = 2 | 3`) e o compilador acusa todos os call sites.

**Métricas de sucesso**
- Literais inline do contrato: 18+ → 0
- Constantes nomeadas exportadas: 1 (`CONTA_GER_JUROS`) → ≥ 8
- Bugs futuros do tipo "alias numérico" (docTip≡filCod≡2): bloqueados por tipo nominal

**Risco de não fazer**: contrato vai crescer (SISPAG `com298` write reusa pattern); copy-paste propaga ambiguidade.
**Dependências**: nenhuma · **Cross-QA**: Modifiability (`modifiability-5` — mesma solução)

---

### [integrability-6] Adicionar fixture-based test para os métodos `fin010` destrutivos
**QA**: Integrability · **Tactic alvo**: Contract testing · **Esforço**: M · **Findings**: F-integrability-7, F-integrability-2

**Problema**
> Apenas 5/12 métodos `fin010` têm teste com fixture wire-shape. Sem cobertura: `atualizarValorLiquido`, `excluirBaixa`, `excluirBordero`, `finalizarBordero`, `cancelarBordero`, `estornarBordero`, `listBaixas`, `listBorderos`, `getBordero`. O bug `docTip-vs-filCod` no path de `excluirBaixa` NÃO seria pego pela suite atual.

**Melhoria Proposta**
> Para cada método ausente, um teste mínimo que: (1) afirma o path EXATO (string-equal — pega o bug `docTip` vs `filCod`); (2) afirma o body (presença e valor de chaves discriminantes: `borVldTipo`, `docTip`, `bxaVldSistema`); (3) afirma o mapeamento da resposta. Cada teste consome `__fixtures__/fin010/<endpoint>.json`.

**Resultado Esperado**
> Cobertura `fin010` 42% → 100%. Mudança de path quebra teste antes de chegar à produção.

**Métricas de sucesso**
- Cobertura de método `fin010` com fixture: 42% → 100%
- Testes de path-regression: 0 → 11

**Risco de não fazer**: próximo refactor do path tem alto risco de regressão.
**Dependências**: card `integrability-2` (fixtures HAR) pode reaproveitar arquivos · **Cross-QA**: Testability (overlap forte com `testability-1`+`testability-4`)

---

### [integrability-7] Avaliar trade-off de conta de serviço Conexos N-para-N (compliance vs. complexidade)
**QA**: Integrability · **Tactic alvo**: Manage Resources · Discover Service · **Esforço**: M-L · **Findings**: F-integrability-6

**Problema**
> Toda escrita no ERP aparece como `CONEXOS_USERNAME` (single login global em `services/conexos.ts:142-197`). O ERP guarda `usnDesNomeCad`/`usnDesNomeFin` único; a identidade real do operador vive só na trilha local. Auditoria/compliance exige correlação por timestamp — frágil.

**Melhoria Proposta**
> 3 cenários a avaliar com o Yuri + compliance da Columbia: (a) N contas Conexos (1 por operador autorizado) + pool de sessões por `req.user.sub` no `ConexosClient`; (b) header `cnx-actAs` ou similar se o Conexos suportar (verificar com fornecedor); (c) ACEITAR a limitação documentadamente — adicionar campo ERP `bxaEspComplemento` com `executadoPor` real, prefixando o comentário gerado em `buildComentario`. Decisão escolhida → ADR.

**Resultado Esperado**
> Identidade do operador rastreável no próprio ERP, sem depender só da trilha local. Auditor externo conseguiria responder "quem gravou o `bxaCodSeq=X`?" só com o ERP.

**Métricas de sucesso**
- Identidade do operador refletida no ERP: 0% → 100% (opção a/b) ou documentada explicitamente (opção c)

**Risco de não fazer**: próximo audit financeiro provavelmente vai exigir isso. SOX-like / Receita pede matriz de responsabilidades.
**Dependências**: entrevista Yuri + compliance + suporte Conexos · **Cross-QA**: Security (`security-5` complementar)

---

### [modifiability-1] Quebrar `ConexosClient` por sub-domínio do ERP
**QA**: Modifiability · **Tactic alvo**: Split Module + Increase Semantic Coherence · **Esforço**: M · **Findings**: F-modifiability-1

**Problema**
> `ConexosClient.ts` cresceu para **1.855 LOC** com 22 métodos públicos cobrindo 4 sub-domínios distintos (processos/filiais, financeiro a pagar, fin010 borderô CRUD+validações, DI/DUIMP). Esta sessão adicionou +236 LOC sem refatorar. 9 importadores diretos — qualquer mudança ricocheta.

**Melhoria Proposta**
> Aplicar **Split Module** dividindo em ao menos: `ConexosFin010Client` (borderô CRUD + validações), `ConexosProcessosClient` (filiais/processos/DI), `ConexosFinanceiroAPagarClient`. Manter `ConexosClient` como façade composto. Ambos `@singleton() @injectable()`. Atualizar os 5 services importadores.

**Resultado Esperado**
> Cada novo client ≤ 600 LOC; nenhum método público mistura sub-domínios. (1.855 LOC em 1 arquivo → 3 arquivos ≤ 700).

**Métricas de sucesso**
- LOC max do client: 1.855 → ≤ 700
- Métodos públicos por client: 22 → ≤ 10
- Importadores de qualquer client: 9 → ≤ 5

**Risco de não fazer**: SISPAG e GED vão pressionar o mesmo arquivo → 2.500+ LOC em 6 meses.
**Dependências**: card `testability-1` PRIMEIRO (precisa de rede de contract tests antes do split) · **Cross-QA**: Testability `testability-5` (mesma decisão)

---

### [modifiability-2] Extrair `borderoActionHandler` para os 4 endpoints de ação de borderô
**QA**: Modifiability · **Tactic alvo**: Abstract Common Services + Refactor · **Esforço**: S · **Findings**: F-modifiability-2

**Problema**
> Os 4 handlers de ação em `routes/permutas.ts:420-533` (finalizar/cancelar/estornar/excluirBordero) repetem o mesmo template de 25 linhas: bootstrap → parse `borCod`/`filCod` → try/catch com `erpErrorMessage(err)`. ~112 LOC redundantes; adicionar nova ação = copy-paste propenso a desvio.

**Melhoria Proposta**
> Extrair `borderoActionRoute(method, path, serviceMethod)` em `routes/permutas.ts` (ou em `http/borderoAction.ts`) que recebe a função do service e cuida do parse + try/catch + tradução. Os 4 endpoints viram 1 linha cada.

**Resultado Esperado**
> 4 handlers x 28 LOC → 4 declarações x ~6 LOC + 1 helper x ~30 LOC. Nova ação de borderô = 1 linha + service method.

**Métricas de sucesso**
- LOC dos 4 handlers: ~112 → ~25
- `routes/permutas.ts` total: 582 → ≤ 500

**Risco de não fazer**: Frente II reproduzirá o mesmo boilerplate; bug de auth/limiter pode escapar em uma cópia esquecida.
**Dependências**: nenhuma

---

### [modifiability-3] Centralizar tradução de mensagens do ERP num `ConexosErpMessageTranslator`
**QA**: Modifiability · **Tactic alvo**: Encapsulate + Abstract Common Services · **Esforço**: S · **Findings**: F-modifiability-3

**Problema**
> Dois mapas de tradução PT-BR convivem com chaves disjuntas: `ERP_MESSAGE_PT` (`routes/permutas.ts:44-51`, chaves `FIN_014.*`) e `friendlyErpMessage` (`ReconciliacaoPermutaService.ts:498-511`, chaves `FIN_010.*` + `CnxValidator*`). Pior: a MESMA causa raiz ("borderô finalizado") aparece sob `FIN_010.FIN_IMPOSSIVEL_ALTERAR_REGISTRO` num lugar e `FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO` no outro.

**Melhoria Proposta**
> Criar `domain/client/permutas/ConexosErpMessageTranslator.ts` (`@singleton() @injectable()`) que centraliza o mapa e o extrator. Service e route consomem o mesmo singleton. Test bench único.

**Resultado Esperado**
> 1 fonte da verdade para tradução PT-BR; adicionar novo `FIN_XXX` = 1 linha em 1 arquivo.

**Métricas de sucesso**
- Mapas de tradução: 2 → 1
- Chaves duplicadas para mesma causa raiz: 2 → 0

**Risco de não fazer**: divergência cresce a cada feature; UX mostra strings cruas quando o erro borbulha pela rota errada.
**Dependências**: nenhuma · **Cross-QA**: **DUPLICATA FUNCIONAL de `integrability-3`** — escolher uma das duas implementações e fechar a outra como "ver card X"

---

### [modifiability-4] Reintroduzir o invariante DDD (route → service → repository) eliminando os 5 imports route→repository
**QA**: Modifiability · **Tactic alvo**: Restrict Dependencies · **Esforço**: M · **Findings**: F-modifiability-4

**Problema**
> `routes/permutas.ts:10-14` importa 5 repositories diretamente, pulando a camada service em 5 endpoints (`/runs`, `/cliente-filtro` x3, `/importadores`, `/processar`, `/execucoes`). Quebra o invariante "Lambda/route → Service → Repository → Client" do CLAUDE.md.

**Melhoria Proposta**
> Criar (ou estender) services adequados — `RunsService`, `ClienteFiltroService`, `ImportadoresService`, `ProcessamentoService`, `ExecucoesService`. A rota só importa services. Adicionar regra no `PatternGuardian` (ou Biome rule) para barrar `from '.*domain/repository/'` em `routes/`.

**Resultado Esperado**
> 0 imports `routes → repository`. Regras de negócio (ex.: invalidar processamento expirado, escopo por filial) ficam reusáveis para job/CLI/Lambda alvo.

**Métricas de sucesso**
- Imports `routes → repository`: 5 → 0
- Gate `PatternGuardian`: bloqueia novo `routes/* → repository/*`

**Risco de não fazer**: cada novo canal (EventBridge job alvo, SSO+RBAC, CLI ops) duplica a regra; PatternGuardian perde credibilidade.
**Dependências**: nenhuma · **Cross-QA**: Security (regras de auth/escopo dispersas)

---

### [modifiability-7] Quebrar `frontend/app/permutas/page.tsx` (2.385 LOC) em sub-componentes por tab/modal
**QA**: Modifiability · **Tactic alvo**: Split Module + Increase Semantic Coherence · **Esforço**: L · **Findings**: F-modifiability-7, F-modifiability-6

**Problema**
> `page.tsx` virou monólito de 2.385 LOC com 4 tabs, ≥4 modais e 133 keywords de controle de fluxo. `borderos/page.tsx` (595 LOC) tem IIFEs no JSX escondendo regra de habilitação de botão dentro do render — invisível para teste.

**Melhoria Proposta**
> Extrair por feature/tab para `src/frontend/components/permutas/`: `PermutasIngestaoModal.tsx`, `PermutasReconciliacaoModal.tsx`, `PermutasAlocacaoManualModal.tsx`, `PermutasTabPendentes.tsx`, `PermutasTabAlocadas.tsx`, `BorderoActionButtons.tsx` (substitui o IIFE). Cada sub-componente: ≤ 250 LOC, exportado como named, testável isoladamente.

**Resultado Esperado**
> `permutas/page.tsx` ≤ 500 LOC (composição); cada sub ≤ 250. Velocidade de feature dobra.

**Métricas de sucesso**
- LOC `permutas/page.tsx`: 2.385 → ≤ 500
- Sub-componentes em `components/permutas/`: 0 → ≥ 6
- LOC `borderos/page.tsx`: 595 → ≤ 350

**Risco de não fazer**: cada nova tab triplica o tempo de PR; merge conflicts garantidos em desenvolvimentos paralelos.
**Dependências**: cobertura de teste FE razoável (51 testes hoje — ampliar antes) · **Cross-QA**: Testability `testability-3`

---

### [performance-1] Cachear estado do borderô na idempotência viva do reconciliar
**QA**: Performance · **Tactic alvo**: Maintain Multiple Copies of Data (cache) · **Esforço**: S · **Findings**: F-performance-1

**Problema**
> Cada par já `settled` chama `getBordero` no ERP antes de decidir skip (`ReconciliacaoPermutaService.ts:130-147`). Em re-execuções com K pares, são K calls extras desnecessárias dentro do loop sequencial.

**Melhoria Proposta**
> Memoizar o resultado de `borderoAindaValido` por `(filCod, borCod)` dentro do escopo de UMA chamada `reconciliar` (Map local, não atravessa requests). Risco zero (escopo de request).

**Resultado Esperado**
> Re-reconciliação de K pares todos `settled` em ≤ 1 call `getBordero` em vez de K. K=5: latência 4–8s → ≤ 1.5s.

**Métricas de sucesso**
- Calls ERP `getBordero` em reconciliar(K=5) repetido: 5 → 1
- Latência reconciliar(K=5) totalmente settled: 4–8s → ≤ 1.5s

**Risco de não fazer**: analistas evitam clicar "Reconciliar" duas vezes por medo da lentidão.
**Dependências**: nenhuma

---

### [performance-2] Implementar paginação real em `listBorderos` (sair do pageSize fixo 200)
**QA**: Performance · **Tactic alvo**: Limit Event Response · **Esforço**: M · **Findings**: F-performance-2

**Problema**
> `ConexosClient.listBorderos` pede apenas `pageNumber: 1` com `pageSize: 200`. Quando a frente passar de 200 borderôs por filial, os mais antigos somem da tela de gestão sem aviso.

**Melhoria Proposta**
> Reusar o helper `paginate` (já existente para `imp021`/`com298`) com `MAX_PAGES` e cap explícito; OU adicionar paginação no FE (carregar mais sob demanda). Logar warning quando `capHit`.

**Resultado Esperado**
> Lista nunca decapita silenciosamente. Métrica: `# borderôs invisíveis` por filial = 0.

**Métricas de sucesso**
- `capHit` flag exposta na resposta: false sempre OU paginação real
- Borderôs invisíveis por filial: 0

**Risco de não fazer**: em 6–18 meses borderôs antigos desaparecem da tela sem erro; auditoria começa a divergir do ERP.
**Dependências**: nenhuma

---

### [performance-3] Cachear `listarBorderos` no backend (TTL curto) + emitir ETag
**QA**: Performance · **Tactic alvo**: Maintain Multiple Copies of Data (cache) · **Esforço**: S · **Findings**: F-performance-4

**Problema**
> GET `/permutas/borderos` re-bate o ERP a cada refresh. Analistas clicam "Atualizar" várias vezes em uma sessão; sem cache nem ETag, cada clique consome N calls ERP + 1 query no Postgres.

**Melhoria Proposta**
> Cache in-memory por filial em `BorderoGestaoService` com TTL 10–15s + `Cache-Control: private, max-age=10` + ETag baseado em hash da lista. Invalidar TTL após mutações.

**Resultado Esperado**
> 5–6 refreshes em < 1min consomem 1 call ERP em vez de 5–6. Pressão no ERP reduzida proporcionalmente.

**Métricas de sucesso**
- Calls ERP por minuto durante revisão típica: ~5 → ~1 (80% economia)
- Header `Cache-Control` + ETag presentes em GET `/permutas/borderos`

**Risco de não fazer**: stress desnecessário no ERP compartilhado com FM/JVE em horário de fechamento.
**Dependências**: invalidação após card `performance-2`

---

### [performance-4] Eliminar cold-start ≥50s do free tier Render
**QA**: Performance · **Tactic alvo**: Bound Execution Times · **Esforço**: S (config) / M (migração) · **Findings**: F-performance-5

**Problema**
> Render free tier dorme após inatividade; primeiro request da manhã espera ≥50s. Browser/usuário desistem; toast de erro genérico esconde a causa.

**Melhoria Proposta**
> Decisão: (a) Render Starter (~7 USD/mês, always-on); OU (b) cron de health-ping a cada 8min (GH Actions já existe para ingestão); OU (c) migrar p/ Vercel Functions + Neon. Documentar em ADR.

**Resultado Esperado**
> Primeiro request do dia ≤ 5s (Starter) ou ≤ 1s (always-on). P95 fim-a-fim deixa de ter outlier de cold-start.

**Métricas de sucesso**
- Cold-start p99: ≥50s → ≤ 5s
- Toast de erro por timeout no 1º request do dia: ocorrências/semana → 0

**Risco de não fazer**: confiança do usuário no produto continua erodindo; impressão de "sistema fora do ar" persiste.
**Dependências**: trade-off cross-QA com Deployability (`render.yaml`)

---

### [fault-tolerance-2] Job de sweep que detecta execuções `reconciling > 10min` ou `error > 24h` e alerta
**QA**: Fault Tolerance · **Tactic alvo**: Timestamp (detect) + Repair State · **Esforço**: M · **Findings**: F-fault-tolerance-2

**Problema**
> Não há reaper para a tabela `permuta_alocacao_execucao`. Uma execução que morra entre `POST fin010/baixas` e `markSettled` permanece `reconciling` invisível. Linhas `error` antigas idem — dependem de o analista voltar ao adiantamento certo.

**Melhoria Proposta**
> Implementar `PermutaExecucaoReaperService` no padrão de `IngestaoCoalescerService`. Para cada linha: `reconciling` há > 10 min → tentar reconciliar via `bxaCodSeq` (se `getBordero(borCod)` mostra baixa correspondente ⇒ marcar `settled`; senão ⇒ mover para `error` com motivo "stuck-no-baixa"). `error` há > 24h sem `atualizado_em` mudando → log WARN + métrica. Trigger inicial: endpoint manual `/permutas/maintenance/sweep`.

**Resultado Esperado**
> Latência de detecção de execução presa: dias → 10 min (P95). Métrica observável: `count(reconciling AND atualizado_em < now()-10min)` exposto no `/health` ou painel admin.

**Métricas de sucesso**
- P95 latência detecção `reconciling` presa: hoje ∞ → alvo 10 min
- Cobertura de teste do reaper: 0% → alvo 100% dos 3 ramos

**Risco de não fazer**: divergência silenciosa local↔ERP cresce a cada incidente de rede; perda de confiança no painel.
**Dependências**: decisão "Express puro ou esperar Lambda+EventBridge" · **Cross-QA**: Availability (`availability-5`)

---

### [fault-tolerance-3] Job diário de reconciliação contra `fin010` — confronta `settled` local com baixas vivas no ERP
**QA**: Fault Tolerance · **Tactic alvo**: Comparison (detect) + Reconcile (recover) · **Esforço**: M · **Findings**: F-fault-tolerance-3

**Problema**
> Sem job que confronte a trilha `settled` com o estado vivo no `fin010`. Estornos/cancelamentos feitos direto no Conexos (fora do sistema) deixam a trilha mentindo até alguém tentar relançar.

**Melhoria Proposta**
> `PermutaReconciliacaoConexosService` rodando 1×/dia (manual endpoint inicial). Para cada `settled` com `bor_cod`: chama `getBordero(filCod, borCod)` + `listBaixas` para confirmar o `bxaCodSeq`. Divergência (baixa some / borderô estornado / valor difere) ⇒ marca `error` com motivo `divergencia-conexos` + alerta. Forward-only (não tenta consertar — só sinaliza).

**Resultado Esperado**
> Toda divergência local↔ERP é visível em ≤ 24h. Métrica: número de pares `settled` confirmados/divergentes por dia exposto em endpoint admin.

**Métricas de sucesso**
- % `settled` confrontados/dia: hoje 0% → alvo 100%
- Tempo até divergência conhecida: ∞ → ≤ 24h

**Risco de não fazer**: relatório de variação cambial e progresso de pagamento divergem do `fin010` em fechamento.
**Dependências**: F-fault-tolerance-2 (mesmo padrão de sweep)

---

### [security-3] Rate-limit dedicado e agressivo em `/auth/login` + alarme de falhas
**QA**: Security · **Tactic alvo**: Limit Access / Detect Intrusion · **Esforço**: S · **Findings**: F-security-4

**Problema**
> `POST /auth/login` herda apenas o `globalLimiter` (100/min/IP). Não há lockout, captcha, nem alarme em N falhas. Combinado com F-security-2, é convite a dicionário direcionado contra a senha conhecida.

**Melhoria Proposta**
> Criar `loginRateLimiter` em `http/rateLimit.ts` (windowMs=60_000, limit=5, key generator por IP+`username`); aplicar diretamente em `routes/auth.ts`. Contador Prometheus `auth_login_failures_total{username,outcome}` e alarme acima de 10 falhas/usuário/hora.

**Resultado Esperado**
> 5 tentativas/min/IP+user (vs 100/min/IP hoje); 1 alarme por escalada.

**Métricas de sucesso**
- Tentativas/min permitidas por usuário: 100 → 5
- Alarmes de bruteforce: 0 → 1 ativo

**Risco de não fazer**: bruteforce silencioso com 144k tentativas/dia/IP indetectado.
**Dependências**: nenhuma

---

### [security-4] Substituir wildcard CORS por whitelist literal + revisar `credentials:true`
**QA**: Security · **Tactic alvo**: Limit Access · **Esforço**: S · **Findings**: F-security-3

**Problema**
> `ALLOWED_ORIGINS` aceita entradas com `*` (proposto `*-kavex.vercel.app`) e ainda envia `credentials: true`. Qualquer subdomínio Vercel com sufixo correspondente consegue navegar com cookies/credenciais.

**Melhoria Proposta**
> Limitar `originMatches` a casamento exato; manter no máximo 1-2 entradas explícitas (produção + 1 alias de preview controlado por env). Documentar em `DEPLOY.md` o procedimento de adicionar nova URL Vercel à lista literal. Considerar política mais estrita: `SameSite=Strict` + cookie HttpOnly (depende de `security-7`).

**Resultado Esperado**
> 0 wildcards em `ALLOWED_ORIGINS` com `credentials:true`.

**Métricas de sucesso**
- Entradas wildcard em produção: 1 → 0

**Risco de não fazer**: CSRF/CORS reflexivo + sessão admin = ações fin010 disparadas por front malicioso.
**Dependências**: nenhuma

---

### [security-5] Persistir audit-trail de mutação de borderô em tabela dedicada
**QA**: Security · **Tactic alvo**: Audit Trail · **Esforço**: M · **Findings**: F-security-1, F-security-5, F-security-6

**Problema**
> As 5 ações novas (`finalizar/cancelar/estornar/DELETE bordero/DELETE baixa`) usam apenas `logService.info` (stdout do Render free tier, sem retenção longa). Para borderôs de terceiro (sem trilha) NÃO há nenhuma linha em Postgres. Investigação forense impossível.

**Melhoria Proposta**
> Migration `bordero_acao_audit(id, bor_cod, fil_cod, acao, executado_por, da_trilha, request_id, request_body_redacted, erp_response_summary, ts)`. Repositório dedicado. `BorderoGestaoService` grava ANTES da chamada ao ERP (pre-commit row, status `requested`) e ATUALIZA depois (`status: settled|failed` + erro). Combina com `security-1`.

**Resultado Esperado**
> 100% das ações têm linha persistida com `before`/`after`.

**Métricas de sucesso**
- Ações persistidas: 0% → 100%
- Retenção: stdout Render → Postgres Supabase (≥ 90 dias)

**Risco de não fazer**: incidente em produção sem rastro acionável; auditoria interna do Columbia sem evidência.
**Dependências**: combina com `security-1` (mesma tabela)

---

### [testability-3] Adicionar teste FE para `app/permutas/borderos/page.tsx` (render + 1 ação + 1 erro)
**QA**: Testability · **Tactic alvo**: Executable Assertions, Specialized Interfaces · **Esforço**: M · **Findings**: F-testability-3

**Problema**
> A página `borderos/page.tsx` (595 LOC NEW) é uma UI complexa com 4 ações de mutação (finalizar/cancelar/estornar/excluir) + estado otimista, sem nenhum teste. O coverage gate FE (lines 25%) não força cobertura.

**Melhoria Proposta**
> Criar `src/frontend/app/permutas/borderos/page.test.tsx` com pelo menos 3 cenários usando Testing Library + jest-environment-jsdom: (1) render inicial com mock da `api.listBorderos()` mostra borderô FINALIZADO + ação Estornar visível; (2) clique em "Estornar" chama `api.estornarBordero()` e atualiza otimisticamente; (3) erro do backend (`fetch` mock rejeitando com mensagem traduzida) é mostrado para o usuário.

**Resultado Esperado**
> FE ratio sobe (27.5% → 30%+); página crítica ganha rede de regressão; bug em `lib/api.ts` é pego antes do operador.

**Métricas de sucesso**
- Tests FE para borderos: 0 → 3+
- FE test files: 11 → 12+
- FE ratio (test/source): 27.5% → 30%+

**Risco de não fazer**: regressão de URL/método HTTP em `lib/api.ts` passa pelo CI e quebra a UI em prod silenciosamente.
**Dependências**: idealmente quebrar `page.tsx` em sub-componentes (`modifiability-7`)

---

## P2 — Médio

### [availability-3] Distribuir o mutex de login Conexos (advisory lock) antes de escalar instâncias
**QA**: Availability · **Tactic alvo**: Reconfiguration · **Esforço**: M · **Severidade**: P2 (P0 se card `availability-2` rodar sem este) · **Findings**: F-availability-3

**Problema**
> `services/conexos.ts:76` mantém `loginPromise` em memória. Em 1 instância funciona. Ao escalar pra 2+ (cap MAX_SESSIONS=3 do Conexos é por usuário), cada instância pode abrir 3 sessões → `sessionToKill` da sessão mais antiga vira ping-pong cruzado.

**Melhoria Proposta**
> Substituir o mutex local por `pg_try_advisory_lock(hash('conexos_login'))` no Postgres compartilhado (mesmo padrão já usado em `IngestaoCoalescerService.request`). Quem perder o lock espera com poll curto até a sessão ser publicada num cache compartilhado (tabela `conexos_session(sid, expires_at)`).

**Resultado Esperado**
> Cap de 3 sessões respeitado globalmente. Pré-requisito para o card `availability-2`.

**Métricas de sucesso**
- Mutex de login: in-memory por instância → 1 mutex global via advisory lock
- Sessões Conexos abertas simultaneamente (medido na prod): ≤ 3

**Risco de não fazer**: se escalarmos antes deste card, vira incidente no 1º dia de tráfego paralelo.
**Dependências**: bloqueia card `availability-2`

---

### [availability-5] Reaper automático de execuções `reconciling` órfãs (>15 min)
**QA**: Availability · **Tactic alvo**: State Resynchronization, Sanity Checking · **Esforço**: M · **Findings**: F-availability-6

**Problema**
> Cenário: POST `fin010/baixas` → ERP grava `bxaCodSeq` → timeout do client antes da resposta chegar. A trilha fica `reconciling` com `bor_cod` setado e `bxa_cod_seq=null` indefinidamente. A idempotency key bloqueia relançamento; ninguém detecta.

**Melhoria Proposta**
> Job (mesma EventBridge planejada / cron Render) a cada 10 min: para cada linha `status='reconciling' AND atualizado_em < now() - interval '15 minutes'`, chamar `listBaixas(filCod, bor_cod)` e reconciliar: achou a baixa pelo par `(docCod, adto)` → `markSettled(bxaCodSeq)`; não achou → `markError("timeout-pós-sucesso suspeito")`.

**Resultado Esperado**
> Nenhuma linha em `reconciling` por mais de 15 min sem decisão automática; 0 órfãos silenciosos.

**Métricas de sucesso**
- Linhas `reconciling > 15min`: ≥0 (não-monitorado) → 0
- Auto-recuperação de timeout-pós-sucesso: 0% → ≥95% (medido pós-deploy)

**Risco de não fazer**: acumula linhas mortas; debug manual no psql vira rotina.
**Dependências**: card `availability-1` · **Cross-QA**: Fault Tolerance (`fault-tolerance-2` — combina)

---

### [deployability-6] Portar `bump-version.ps1` para Node/TS (executável em Darwin/Linux)
**QA**: Deployability · **Tactic alvo**: Script Deployment Commands · **Esforço**: S · **Findings**: F-deployability-7

**Problema**
> Host atual = Darwin; `pwsh` não é default no macOS. Bumps acabam sendo manuais ⇒ FE/BE podem divergir de versão sem detecção.

**Melhoria Proposta**
> Reescrever em `scripts/bump-version.ts` (executado por `tsx`), reaproveitando a lógica conventional-commit → semver. Adicionar step `node scripts/bump-version.ts --check` no CI que falha se FE.version ≠ BE.version.

**Resultado Esperado**
> Bump rodável em qualquer dev/CI; lockstep FE↔BE garantido por CI.

**Métricas de sucesso**
- Plataformas suportadas: 1 (Windows) → 3 (Win/macOS/Linux)
- # PRs que entraram com versão divergente FE↔BE: ? → 0 (gate CI)

**Risco de não fazer**: `/health` reporta versão fora de sincronia com a UI; análise de incidente atrapalhada.
**Dependências**: nenhuma

---

### [deployability-7] Pinar Node 24 no `engines` + Render
**QA**: Deployability · **Tactic alvo**: Reproducible builds · **Esforço**: S · **Findings**: F-deployability-8

**Problema**
> CI roda Node 24, Render default = 22.x. Build "verde" não garante runtime.

**Melhoria Proposta**
> Adicionar `"engines": { "node": ">=24.0.0 <25" }` em `src/backend/package.json` e `src/frontend/package.json`. Render lê `engines` e instala a versão compatível.

**Resultado Esperado**
> CI e PRD rodam o mesmo major do Node.

**Métricas de sucesso**
- Major Node CI vs PRD: 24 vs 22 → 24 vs 24

**Risco de não fazer**: bug "funciona no CI, falha em PRD" cedo ou tarde — particularmente em features ESM/TLA novas.
**Dependências**: confirmar que Render suporta Node 24 no plano starter (suporta desde 2025)

---

### [integrability-8] (mapeia para `modifiability-1`+`testability-5`) — Avaliar God Client
**QA**: Integrability · **Tactic alvo**: Restrict Communication Paths · Use an Intermediary · **Esforço**: ver `modifiability-1` · **Findings**: F-integrability-8

**Problema**
> `ConexosClient` aproxima-se do anti-padrão God Client (25 métodos públicos, 7 services dependem dele, 1856 LOC abrangendo `imp021`, `com298`, `com299`, `com308`, `com311`, `imp019`, `imp223`, `fin010`).

**Melhoria Proposta**
> Endereçado por `modifiability-1` (split do client em sub-clients por sub-domínio). Card listado aqui para rastreabilidade do finding cross-QA.

**Resultado Esperado**
> 25 métodos / 1 arquivo → < 12 métodos por sub-client (`Fin010Client`, `Com298Client`, `Imp021Client`).

**Métricas de sucesso**
- LOC max do client: 1.855 → ≤ 700
- Métodos públicos por client: 25 → ≤ 12

**Risco de não fazer**: SISPAG e GED tendem a agravar o problema.
**Dependências**: **CARD CONSOLIDADO COM `modifiability-1` E `testability-5`** — implementar uma vez fecha os três.

---

### [modifiability-5] Encapsular os códigos wire do fin010 (`docTip`, `titCod`, `borVldTipo`) em constantes semânticas
**QA**: Modifiability · **Tactic alvo**: Encapsulate · **Esforço**: S · **Findings**: F-modifiability-5

**Problema**
> Literais `docTip=2`, `titCod=1`, `borVldTipo=2` aparecem em 17+ ocorrências entre `ConexosClient.ts`, `ReconciliacaoPermutaService.ts` e `BorderoGestaoService.ts`. Já gerou bug histórico ("A sonda inicial confundiu os dois porque na filial 2 o filCod coincide com o docTip 2").

**Melhoria Proposta**
> Estender `domain/client/permutas/conexosPermutasConstants.ts` (já existe) com: `DOC_TIP_INVOICE = 2`, `TIT_COD_INVOICE = 1`, `BOR_VLD_TIPO_PERMUTA = 2`. Substituir as 17+ ocorrências; manter JSDoc semânticos no payload.

**Resultado Esperado**
> 0 magic numbers fin010 em services/clients; grep `docTip: 2` retorna apenas a constante.

**Métricas de sucesso**
- Literais `docTip:|titCod:|borVldTipo:` fora de `conexosPermutasConstants.ts`: 17+ → 0

**Risco de não fazer**: SaaSo multi-tenant (alvo) eventualmente terá tenant com config fin010 distinta.
**Dependências**: nenhuma · **Cross-QA**: **DUPLICATA FUNCIONAL de `integrability-5`** — escolher uma das duas implementações

---

### [modifiability-6] Mover a tradução "situação do borderô" para o BE (com `label` + `tone`) e simplificar o FE
**QA**: Modifiability · **Tactic alvo**: Increase Semantic Coherence + Use an Intermediary · **Esforço**: S · **Findings**: F-modifiability-6

**Problema**
> A regra que mapeia `borVldFinalizado → BorderoSituacao` vive em `BorderoGestaoService.situacaoDoItem`. O FE replica `SITUACAO_LABEL` + `situacaoBadge` (ternário aninhado). Estado novo = 3 lugares para editar.

**Melhoria Proposta**
> O BE devolve `{ situacao, label, tone }` (`tone: 'success'|'warning'|'destructive'|'neutral'`). O FE só renderiza, sem if/else. Para estados específicos de UI (ex.: `INDISPONIVEL`), manter fallback FE pequeno.

**Resultado Esperado**
> 1 lugar para adicionar nova situação (BE). FE = puro mapeamento `tone → className`.

**Métricas de sucesso**
- Lugares para adicionar nova situação: 3 → 1
- `situacaoBadge` ternário aninhado: eliminado

**Risco de não fazer**: estado novo da Frente II/III replicará o mesmo anti-padrão.
**Dependências**: nenhuma

---

### [modifiability-8] Cognitive complexity — 17 funções > 15 (sessão adicionou 2 novas)
**QA**: Modifiability · **Tactic alvo**: Reduce Size of Module + Refactor · **Esforço**: M (varredura) · **Findings**: F-modifiability-8

**Problema**
> Biome configurado a 15 mas o time tolera 17 warnings — sinal de que o gate virou ruído. `listarBorderos` (complexidade 25) é o coração da nova feature de gestão e tem if/optional spread/null-coalescing aninhado. Pico em `EleicaoPermutasService.ts:523` (65!).

**Melhoria Proposta**
> Refactor incremental — quebrar as 3 piores (`EleicaoPermutasService.ts:523`, `BorderoGestaoService.ts:278`, `ReconciliacaoPermutaService.ts:78`) em helpers extraídos. Bloquear novos warnings via gate CI estrito.

**Resultado Esperado**
> Warnings de complexidade: 17 → ≤ 5; gate CI passa a barrar regressão.

**Métricas de sucesso**
- Warnings `noExcessiveCognitiveComplexity`: 17 → ≤ 5

**Risco de não fazer**: bug nessas funções demora mais para isolar; refatoração futura mais cara.
**Dependências**: nenhuma

---

### [performance-5] Avaliar (com probe) paralelismo no handshake `fin010` entre pares de um mesmo borderô
**QA**: Performance · **Tactic alvo**: Introduce Concurrency · **Esforço**: M · **Findings**: F-performance-6

**Problema**
> `reconciliar` executa pares em série; com K=5 pares × 4–8s/par o total fica 20–40s. As 4 chamadas DENTRO do par são sequenciais por contrato do ERP, mas o ERP pode aceitar pares concorrentes no mesmo borderô.

**Melhoria Proposta**
> Probe: enviar 2 pares em paralelo no mesmo `borCod` em dev tenant. Se o ERP aceita, paralelizar com `pLimit(N=2..3)`. Se rejeitar, documentar em ADR como restrição.

**Resultado Esperado**
> Se probe verde: K=5 sequencial 20–40s → 8–16s (pLimit=3).

**Métricas de sucesso**
- P95 reconciliar(K=5): 30s → ≤ 15s (caso probe positivo)
- ADR registrando comportamento do ERP

**Risco de não fazer**: reconciliação em lote sofre crescimento linear em K.
**Dependências**: probe em dev tenant; coordenar com `performance-1`

---

### [performance-6] Paginar / virtualizar a tabela de borderôs no FE
**QA**: Performance · **Tactic alvo**: Limit Event Response · **Esforço**: S · **Findings**: F-performance-3

**Problema**
> `app/permutas/borderos/page.tsx` renderiza 100% da lista sem virtualização; cada row carrega 5 botões + chevron + sub-tabela. Hoje "200 de 200" no DOM; quando crescer, render trava.

**Melhoria Proposta**
> Paginação cliente (50/página, controles infinite-scroll OU pages) ou `react-window`. Manter filtros aplicados antes do slice.

**Resultado Esperado**
> Tempo de first-paint independente do volume total. P95 render lista ≤ 200ms para qualquer N.

**Métricas de sucesso**
- Render rows visíveis: hoje N=lista.length → ≤ 50
- First-paint da aba Borderôs em N=500: ~6s → ≤ 300ms

**Risco de não fazer**: UX trava quando a frente envelhecer.
**Dependências**: alinhar com card `performance-2`

---

### [fault-tolerance-4] Sub-bucket de `Generic.ERROR_MESSAGE` com dump estruturado + log + correlação
**QA**: Fault Tolerance · **Tactic alvo**: Sanity Checking + Condition Monitoring · **Esforço**: S · **Findings**: F-fault-tolerance-4

**Problema**
> A tradução genérica "ERP recusou esta operação" em `routes/permutas.ts:49-51` esconde a causa raiz quando o `fin010` devolve `Generic.ERROR_MESSAGE`. Aumenta MTTR humano sem acrescentar segurança.

**Melhoria Proposta**
> Quando `key === 'Generic.ERROR_MESSAGE'`: 1) preservar `erp_response` cru no payload de erro retornado ao FE (ou um `errorRef` que linka ao log); 2) log estruturado no LogService com o dump + correlação requestId; 3) na UI, exibir "ERP recusou (cod-Generic) — código de referência: REQ-XXXX".

**Resultado Esperado**
> Tempo médio de diagnóstico de erro `Generic.*`: hoje 5-30 min → alvo < 2 min.

**Métricas de sucesso**
- % erros `Generic.*` com requestId visível na UI: 0% → 100%
- MTTR humano por erro `Generic.*`: 5-30 min → < 2 min

**Risco de não fazer**: nas primeiras semanas de produção, esses erros vão acumular tickets sem resolução rápida.
**Dependências**: nenhuma

---

### [fault-tolerance-5] Tabela append-only de eventos de execução (`permuta_alocacao_execucao_evento`)
**QA**: Fault Tolerance · **Tactic alvo**: Audit-trail completeness · **Esforço**: M · **Findings**: F-fault-tolerance-5, F-fault-tolerance-8

**Problema**
> A linha de execução é UPDATEd in-place; `markSettled` ZERA `erro_mensagem`; reabertura de error perde a evidência da tentativa anterior. Para auditoria/forense, o histórico desaparece (apenas LogService — que rotaciona em Render free).

**Melhoria Proposta**
> Nova tabela `permuta_alocacao_execucao_evento` (append-only) com `(idempotency_key, seq, evento, payload jsonb, criado_em, criado_por)`. Cada transição (beginExecution / setBorCod / markSettled / markError) grava 1 linha além de atualizar o agregado. Sem DELETE; particionável por mês.

**Resultado Esperado**
> 100% das transições têm rastro append-only consultável por `idempotency_key`.

**Métricas de sucesso**
- Histórico de tentativas recuperável SEM ler log: 0% → 100%
- Tempo de forense post-mortem de uma execução: indefinido → ≤ 5 min via SQL

**Risco de não fazer**: post-mortem de incidentes financeiros sem evidência reproduzível; defensibilidade reduzida em revisão externa.
**Dependências**: nenhuma · **Cross-QA**: Security `security-5` complementar

---

### [fault-tolerance-6] Checkpoint + WARN log per-item no `excluirBordero` (loop de `excluirBaixa`)
**QA**: Fault Tolerance · **Tactic alvo**: Compensating Transaction (forward variant) + Condition Monitoring · **Esforço**: S · **Findings**: F-fault-tolerance-6

**Problema**
> O loop `excluirBaixa[i]` + `excluirBordero` final não tem checkpoint, retry tipado, nem log WARN intermediário em falha. Re-clicar resolve (idempotência natural via `listBaixas`), mas o estado parcial fica invisível até alguém perceber.

**Melhoria Proposta**
> Em `BorderoGestaoService.excluirBordero`: 1) try-catch por iteração do loop com log WARN imediato (`borCod`, `bxaCodSeq` falhado, índice `k/N`); 2) parar o loop na 1ª falha; 3) retornar `{ excluido: false, baixasExcluidas: k, restantes: N-k }` (não 4xx — é estado parcial documentado); 4) FE mostra "Borderô parcialmente excluído — clique de novo para concluir".

**Resultado Esperado**
> Estado parcial sempre visível na resposta + log; o analista entende exatamente o que aconteceu.

**Métricas de sucesso**
- Visibilidade do estado parcial: implícita → explícita (response + log)
- Re-clicks bem-sucedidos vs tickets confusos: ratio melhor (medível no Yuri)

**Risco de não fazer**: confusão recorrente do analista; aprovação acidental de borderô parcial; mancha de confiança na UI.
**Dependências**: nenhuma

---

### [fault-tolerance-7] Válvula de escape para `borderoAindaValido` quando `getBordero` falha repetidamente
**QA**: Fault Tolerance · **Tactic alvo**: Timeout (detect) + Repair State · **Esforço**: M · **Findings**: F-fault-tolerance-7

**Problema**
> O fallback "incerto → conservador" do `borderoAindaValido` é correto para evitar dupla baixa, mas se `getBordero` falhar consistentemente (Conexos degradado / permissão), o re-relançamento fica bloqueado indefinidamente sem alerta nem override.

**Melhoria Proposta**
> Em `ReconciliacaoPermutaService.borderoAindaValido`: 1) log WARN no 1º catch citando `borCod` + `endpoint`; 2) métrica/contador "getBordero_failure" persistido na linha (`getbordero_falhas_consecutivas`); 3) admin endpoint `POST /permutas/execucoes/:key/forcar-liberacao` com motivo obrigatório (gravado no append-only de `fault-tolerance-5`) — só admin, log AUDIT.

**Resultado Esperado**
> Bloqueio por incerteza vira observável e destravável por humano com trilha.

**Métricas de sucesso**
- Linhas bloqueadas por incerteza visíveis em painel: 0 → 100%
- Override manual rastreável: 0 → 100%

**Risco de não fazer**: cenário de borda — ERP degrada por horas e ninguém consegue relançar nada.
**Dependências**: `fault-tolerance-5`

---

### [security-6] Cobrir as 5 rotas de borderô com schemas Zod (`borCod`, `filCod`, params)
**QA**: Security · **Tactic alvo**: Validate Input · **Esforço**: S · **Findings**: F-security-7

**Problema**
> As novas rotas regrediram o padrão Zod estabelecido: `/borderos/:borCod/finalizar|cancelar|estornar` leem `Number(req.body?.filCod)` sem schema; `DELETE /borderos/:borCod` lê `Number(req.query.filCod)`; `DELETE /borderos/:borCod/baixas/:invoiceDocCod` aceita `String(req.params.invoiceDocCod)` direto.

**Melhoria Proposta**
> Criar `borderoAcaoBodySchema = z.object({ filCod: z.coerce.number().int().positive() })` e `borderoActionParamsSchema = z.object({ borCod: z.coerce.number().int().positive() })`. Helper `parseOrReject(schema, value, res)` para reduzir boilerplate. Aplicar nas 5 rotas + na DELETE de alocação (linha 326).

**Resultado Esperado**
> 13/13 rotas de mutação com Zod completo (corpo + query + params).

**Métricas de sucesso**
- Cobertura Zod nas rotas de mutação: 7/13 → 13/13

**Risco de não fazer**: payload malformado vira erro opaco no ERP; reforça `security-1` como única defesa.
**Dependências**: nenhuma

---

### [security-7] Mover JWT do `localStorage` para cookie `HttpOnly; Secure; SameSite=Lax`
**QA**: Security · **Tactic alvo**: Limit Exposure · **Esforço**: M · **Findings**: F-security-8

**Problema**
> Token JWT (TTL 12h, role=admin) vive em `localStorage` no frontend Next.js. Qualquer XSS futuro (mesmo via dependência transitiva — `npm audit` FE: 1 high, 21 moderate) entrega sessão admin completa. Não há revogação granular (`signOut` só limpa `localStorage`).

**Melhoria Proposta**
> Backend: `POST /auth/login` devolve `Set-Cookie: financeiro_auth=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`. Middleware lê do cookie OU do `Authorization: Bearer` (compat backwards 1 release). Frontend: remover `TOKEN_STORAGE_KEY` + adaptar `apiFetch` para `credentials: 'include'`. CSRF: token double-submit OU verificar `Origin` na rota (depende de `security-4` estar tight). Roadmap: refresh-token + revogação server-side.

**Resultado Esperado**
> 0 tokens em `localStorage`; XSS deixa de virar account-takeover.

**Métricas de sucesso**
- JWT acessível via `document.cookie` ou `localStorage`: SIM → NÃO (HttpOnly)
- High/moderate vulns FE relevantes: monitoradas e mitigadas

**Risco de não fazer**: 1 XSS = 12h de sessão admin com poder de finalizar `fin010`.
**Dependências**: `security-4`

---

### [testability-4] Versionar fixtures HAR-real do `fin010` em `domain/client/__fixtures__/`
**QA**: Testability · **Tactic alvo**: Record/Playback · **Esforço**: S · **Findings**: F-testability-5, F-testability-1

**Problema**
> Os payloads "wire real 2026-06-18" do Conexos vivem como literais inline nos testes. O HAR original que Yuri usou para descobrir o formato do `DELETE /fin010/baixas/{borCod}/{docTip}/...` não está versionado.

**Melhoria Proposta**
> Criar `src/backend/domain/client/__fixtures__/fin010/` com 5 arquivos `*.json`: `criar-bordero.req.json`, `delete-baixa.req.json`, `delete-bordero.req.json`, `finalizar-bordero.req.json`, `get-bordero.res.json`. Os contract tests do card `testability-1` passam a `expect(legacy.X).toHaveBeenCalledWith(JSON.parse(readFileSync(fixture)))`.

**Resultado Esperado**
> Fixtures versionados por endpoint do `fin010`; o "wire real" deixa de ser memória do autor e vira artefato auditável.

**Métricas de sucesso**
- Fixtures wire-real para `fin010`: 0 → 5
- Pasta `domain/client/__fixtures__/`: ausente → presente

**Risco de não fazer**: cada bug de path/payload no `fin010` ainda exige re-correr o HAR.
**Dependências**: card `testability-1` aproveita os fixtures · **Cross-QA**: Integrability `integrability-2`/`integrability-6`

---

### [testability-5] Quebrar `ConexosClient` em sub-clients por módulo Conexos (`Fin010Client`, `Com298Client`, ...)
**QA**: Testability · **Tactic alvo**: Limit Structural Complexity · **Esforço**: L · **Findings**: F-testability-6

**Problema**
> `ConexosClient.ts` (1856 LOC, ~30 métodos públicos, 6 módulos misturados) virou classe-deus. O test file espelhou: 1490 LOC.

**Melhoria Proposta**
> Refatorar `ConexosClient` em 5-6 sub-clients (`Fin010Client`, `Com298Client`, `Com308Client`, `Imp021Client`, `ImpDeclaracaoClient`). O `ConexosClient` atual vira um façade `@singleton @injectable` que compõe os sub-clients (DI). Cada sub-client tem seu próprio `*.test.ts` < 500 LOC.

**Resultado Esperado**
> 1 classe-deus (1856 LOC) → 5-6 sub-clients (< 400 LOC cada); 1 test file (1490 LOC) → 5-6 test files (< 500 LOC cada).

**Métricas de sucesso**
- LOC do maior arquivo de teste BE: 1490 → < 600
- LOC do maior client: 1856 → < 400

**Risco de não fazer**: cost-multiplier cresce — cada feature na frente SISPAG ou GED herda o monolito.
**Dependências**: card `testability-1` PRIMEIRO · **Cross-QA**: **CARD CONSOLIDADO com `modifiability-1`+`integrability-8`**

---

## P3 — Baixo

### [availability-6] Logar o catch silencioso de `borderoAindaValido`
**QA**: Availability · **Tactic alvo**: Exception Detection · **Esforço**: S · **Findings**: F-availability-5

**Problema**
> `ReconciliacaoPermutaService.ts:484-486` faz `catch { return true; }` — decisão correta (não arrisca dupla baixa), mas invisível. Se o `getBordero` falha persistentemente, alocações ficam `skipped` sem trilha do "por que".

**Melhoria Proposta**
> Substituir `catch {}` por `catch (err) { await this.logService.warn({ type: BUSINESS_WARN, message: 'borderoAindaValido: leitura falhou — conservador=true', data: { filCod, borCod, erro: ... } }); return true; }`. Métrica derivada plotada no dashboard do card `availability-1`.

**Resultado Esperado**
> Catch silencioso → catch logado; deriva (skipped por leitura falha) deixa de ser invisível.

**Métricas de sucesso**
- Catches silenciosos no path crítico: 1 → 0

**Risco de não fazer**: deriva silenciosa segue. Baixo risco, mas pegadinha de manutenção.
**Dependências**: nenhuma

---

### [availability-7] Boot-time self-test do client Conexos (`login` dry-run no `bootstrapAppContainer`)
**QA**: Availability · **Tactic alvo**: Self-Test · **Esforço**: S · **Findings**: F-availability-7

**Problema**
> `ensureSid` é lazy: a 1ª request do dia descobre se a senha do Conexos foi rotacionada (401 ou LOGIN_ERROR) ou se o cap MAX_SESSIONS está estourado.

**Melhoria Proposta**
> No `bootstrapAppContainer` (uma vez por boot do processo, idempotente), disparar `conexosService.ensureSid()` num timeout curto. Logar `BUSINESS_INFO` em sucesso e `BUSINESS_ERROR` em falha — o alerta do card `availability-1` já cobre.

**Resultado Esperado**
> Falha de credencial expirada detectada no boot, antes da 1ª request real do analista.

**Métricas de sucesso**
- Tempo até detectar credencial expirada: ≤ próximo deploy → ≤ próximo boot

**Risco de não fazer**: 1× por trimestre, na rotação de senha, alguém perde a 1ª baixa do dia.
**Dependências**: card `availability-1`

---

### [deployability-8] Endpoint `/admin/deployments` com lead time, MTTR e failure rate
**QA**: Deployability · **Tactic alvo**: Deployment observability · **Esforço**: M · **Severidade**: P3 · **Findings**: F-deployability-1 (sem baseline numérico), F-deployability-3

**Problema**
> Métricas "quão bem deploya" vivem só no painel Render. Pós-incidente, fica difícil responder "qual foi o lead time desta release?", "qual foi a taxa de falha do último mês?".

**Melhoria Proposta**
> Workflow noturno consulta Render API + `gh api repos/.../actions/runs`, calcula DORA básicas (deploy frequency, lead time, change failure rate) e escreve num JSON commitado em `docs/dora.json` *ou* num endpoint admin do backend.

**Resultado Esperado**
> DORA do mês corrente consultável sem login no painel Render.

**Métricas de sucesso**
- DORA reportada automaticamente: não → sim (4 métricas)

**Risco de não fazer**: discussão de maturidade fica anedótica; sem dado para defender investir mais em pipeline.
**Dependências**: Render API token, GitHub Actions API token

---

### [modifiability-9] Externalizar o toggle `PROCESSAMENTO_HABILITADO` para env do FE
**QA**: Modifiability · **Tactic alvo**: Defer Binding (Configuration files) · **Esforço**: S · **Findings**: F-modifiability-9

**Problema**
> `permutas/page.tsx:82` tem `PROCESSAMENTO_HABILITADO = false` hard-coded. Ligar/desligar exige build+deploy Vercel.

**Melhoria Proposta**
> Trocar por `process.env.NEXT_PUBLIC_PERMUTAS_PROCESSAMENTO_HABILITADO === 'true'`. Documentar no `.env.example` do FE.

**Resultado Esperado**
> Flip de feature = mudar env Vercel + rebuild (~30s) em vez de PR + revisão.

**Métricas de sucesso**
- Toggles de produto hard-coded em `frontend/app/`: 1 → 0

**Risco de não fazer**: convivendo bem hoje; vira atrito quando o write-back habilitar.
**Dependências**: nenhuma

---

### [performance-7] Cachear `getDetalheTitulos` por execução em `EleicaoPermutasService`
**QA**: Performance · **Tactic alvo**: Maintain Multiple Copies of Data (cache) · **Esforço**: S · **Findings**: F-performance-7

**Problema**
> Comentário em `ConexosClient.ts:895` documenta um cache que o caller deveria fazer — `EleicaoPermutasService` não cacheia. Re-eleições ou docCod duplicado pagam call extra ao ERP.

**Melhoria Proposta**
> Map por execução (`new Map<string, Promise<Detalhe>>()` na service) — chave `docCod`. Não atravessa requests (idempotente).

**Resultado Esperado**
> Duplicações de detail call dentro de 1 elegibilidade caem para 0.

**Métricas de sucesso**
- Calls `getDetalheTitulos` duplicadas por elegibilidade: 5–20% → 0

**Risco de não fazer**: pressão pequena mas crescente no ERP enquanto a frente escalar.
**Dependências**: fora do diff da Fase 3.1; tratar quando próxima `/feature-tweak` tocar `EleicaoPermutasService`

---

### [fault-tolerance-8] Contador `tentativas` na linha de execução
**QA**: Fault Tolerance · **Tactic alvo**: Condition Monitoring · **Esforço**: S · **Findings**: F-fault-tolerance-8

**Problema**
> A linha `permuta_alocacao_execucao` não diz "esta é a 3ª tentativa"; tracker de retries é manual via LogService.

**Melhoria Proposta**
> Migration: coluna `tentativas INT NOT NULL DEFAULT 0`. `beginExecution` faz `tentativas = tentativas + 1` no `ON CONFLICT DO UPDATE` (não no INSERT inicial); expor no `GET /execucoes` para a UI mostrar "tentativa N".

**Resultado Esperado**
> Cada linha carrega o n.º de tentativas.

**Métricas de sucesso**
- Contador exposto em UI: 0% → 100%

**Risco de não fazer**: baixo; é coleta de sinal preventivo.
**Dependências**: nenhuma
