```markdown
---
type: regis-review-kanban
run_id: 2026-06-24-2011
pr_under_review: v0.7.0 (feat permutas)
total: 52
counts: { p0: 3, p1: 20, p2: 21, p3: 8 }
---

# Kanban — financeiro — PR v0.7.0 — run 2026-06-24-2011

> Importável para o Kanban do time. Cada card abaixo já tem Problema / Melhoria Proposta / Resultado Esperado.
> Ordem: P0 (S → XL), depois P1, P2, P3. Cards cross-QA marcados com [CROSS].

---

## P0 — Crítico (3 cards) — BLOQUEANTES DE MERGE

---

### [fault-tolerance-1] Endurecer `removerDaTrilha` contra dupla-baixa quando borderô ainda é válido

**QA**: Fault Tolerance · [CROSS: Security]
**Tactic alvo**: Idempotent Replay; Compensating Transaction
**Esforço**: S
**Findings**: F-fault-tolerance-1, F-security-6

**Problema**
> O endpoint `DELETE /permutas/borderos/:borCod/trilha` apaga a linha da `permuta_alocacao_execucao` sem checar se o borderô ainda está válido no `fin010`. Como a chave de idempotência é deletada (não renomeada), a próxima baixa do mesmo adto cria uma chave nova e o sistema NÃO bloqueia — gerando uma segunda baixa real no ERP contra o mesmo par adto↔invoice. Endpoint vivo, sem caller no FE atual (botão removido nesta sessão); admin (ou JWT vazado) consegue acionar via curl.

**Melhoria Proposta**
> Antes do `deleteByBorCod`, chamar `borderoAindaValido(filCod, borCod)` (já existe em `ReconciliacaoPermutaService.ts:496-507`, extrair para libs). Se VÁLIDO → recusar 409 com "borderô ainda em cadastro/finalizado no ERP — cancele/exclua lá antes". Se INVÁLIDO (cancelado/estornado/removido) → renomear (não deletar) a chave para `:rmtrilha:<borCod>` para preservar histórico e ainda assim impedir dupla-baixa por anti-replay. Adicionar teste cobrindo (a) borderô válido → recusa, (b) borderô cancelado → renomeia, (c) dupla-baixa bloqueada.

**Resultado Esperado**
> Cenários de dupla-baixa via `removerDaTrilha`: 1 (atual, lógico) → 0 (impossível por contrato). Chave de idempotência preservada para auditoria pós-evento.

**Métricas de sucesso**
- Caminhos lógicos de dupla-baixa via `removerDaTrilha`: 1 → 0
- Cobertura de teste do `removerDaTrilha`: 2 cenários → 5 cenários

**Risco de não fazer**
> incidente real de baixa duplicada quando o "modo emergência" for usado em produção; lançamento contábil espelhado que precisa ser estornado manualmente.

**Dependências**: Nenhuma

---

### [testability-1] Cobrir `AlocacaoPermutasService.autoAlocarSeElegivel` e `autoAlocarDeCasamento`

**QA**: Testability · [CROSS: Availability, Fault Tolerance]
**Tactic alvo**: Executable Assertions + Specialized Interfaces
**Esforço**: S
**Findings**: F-testability-1

**Problema**
> As duas funções de auto-alocação (regra 2026-06-24, escrita financeira automática no Baixar) não têm um único teste direto. O teste do `ReconciliacaoPermutaService` mocka ambas como `false` — o caminho que efetivamente CRIA alocações nunca é exercitado em CI. Bug aqui aciona baixa errada no `fin010` sem revisão humana.

**Melhoria Proposta**
> Adicionar bloco `describe('autoAlocarSeElegivel')` e `describe('autoAlocarDeCasamento')` em `AlocacaoPermutasService.test.ts`. Reusar os builders `buildConexos`/`buildAlocacaoRepo`/`buildRelational`. Casos mínimos:
> 1. `autoAlocarSeElegivel`: (a) múltipla com saldo cobrindo Σ → cria N alocações; (b) cross-over (>1 adto casamento-manual) → false; (c) saldo < Σ → false; (d) idempotente (já alocado) → true sem criar; (e) sem D.I → false.
> 2. `autoAlocarDeCasamento`: (a) cria do casamento existente; (b) idempotente; (c) sem casamento → false.

**Resultado Esperado**
> Cobertura `autoAlocarSeElegivel` 0/5 → 5/5 branches; `autoAlocarDeCasamento` 0/3 → 3/3; suite `permutas` ganha ≥ 8 it.

**Métricas de sucesso**
- `grep -c autoAlocar AlocacaoPermutasService.test.ts`: 0 → ≥ 8
- branches cobertas: 0 → 8

**Risco de não fazer**
> auto-alocação cria baixa errada (saldo ultrapassado, invoice sem D.I, cross-over indevido), descoberto só em produção pelo time financeiro com fechamento errado no `fin010`.

**Dependências**: Nenhuma

---

### [testability-2] Cobrir `GestaoPermutasService.autoElegivel` e a síntese `autoCasamentos`

**QA**: Testability
**Tactic alvo**: Executable Assertions
**Esforço**: S
**Findings**: F-testability-2

**Problema**
> O flag `autoElegivel` decide se a UI mostra o caso como Automática (com botão "Processar" 1-click) ou Manual (Alocar/Baixar). Não tem teste. A síntese `autoCasamentos` (pré-distribuição adto→invoices p/ a aba Automáticas) também não tem teste — uma vai junto da outra na regra 2026-06-24.

**Melhoria Proposta**
> Adicionar 4 it em `GestaoPermutasService.test.ts`: (a) múltipla c/ saldo ≥ Σ invoices → `autoElegivel:true` + `res.casamentos` contém 1 grupo sintético por invoice; (b) múltipla c/ saldo < Σ → `autoElegivel` undefined + nada em `casamentos`; (c) cross-over (>1 adto casamento-manual) → nunca `autoElegivel:true`; (d) reclassificado por ultrapassa-invoice NÃO ganha `autoElegivel`.

**Resultado Esperado**
> Cobertura `autoElegivel` 0/4 branches → 4/4; cobertura `autoCasamentos synthesis` 0/2 → 2/2; suite ganha 4 it.

**Métricas de sucesso**
- `grep -c autoElegivel GestaoPermutasService.test.ts`: 0 → ≥ 4
- branches `autoElegivel` cobertas: 0 → 4

**Risco de não fazer**
> a aba "Automáticas" mostra/esconde casos errados; analista perde confiança e volta ao Excel paralelo — o problema-raiz que a feature resolve.

**Dependências**: Nenhuma

---

## P1 — Alto (20 cards)

---

### [availability-2] Tornar `autoAlocarSeElegivel`/`autoAlocarDeCasamento` all-or-nothing

**QA**: Availability · [CROSS: Fault Tolerance, Modifiability]
**Tactic alvo**: Transactions; Rollback
**Esforço**: M
**Findings**: F-availability-2

**Problema**
> A auto-alocação faz N escritas sequenciais em `permuta_alocacao` via `alocar()`. Se Conexos derrubar a 3ª chamada de 5, o método retorna `true` (porque `some()` acha as 2 anteriores) e a baixa real prossegue com alocação parcial — meia-permuta no ERP, saldo residual no adto.

**Melhoria Proposta**
> Envolver o for-loop em transação (`databaseClient.withTransaction`), ou pré-validar TODAS as N invoices (buscar live + cap-check) antes de gravar QUALQUER linha, e gravar tudo em um único `INSERT INTO ... VALUES (...), (...), ...`. Adicionalmente, distinguir o retorno: `'all' | 'partial' | 'none'` em vez de `boolean`, e o caller (`ReconciliacaoPermutaService`) deve abortar a baixa em `'partial'`.

**Resultado Esperado**
> 0 cenários de auto-alocação parcial persistida. Falha de Conexos no meio ⇒ rollback completo, analista vê erro claro e re-tenta.

**Métricas de sucesso**
- Alocações órfãs (sem borderô) após falha: indeterminado → 0
- Cobertura de teste para "falha de Conexos no meio do for-loop": 0 → ≥1 teste por método

**Risco de não fazer**
> meia-permuta gravada no ERP em incidente Conexos = chamada manual da Yuri para conciliar; risco financeiro real (saldo residual de adto vira "perdido" no fluxo).

**Dependências**: Nenhuma; toca código novo do PR.

---

### [fault-tolerance-2] Loop `confirmarProcessamento` (FE) com per-item try/catch + agregação de erros

**QA**: Fault Tolerance
**Tactic alvo**: Containment — Forward Recovery; Sanity Checking
**Esforço**: S
**Findings**: F-fault-tolerance-2

**Problema**
> O frontend `confirmarProcessamento` (page.tsx:702-739) chama `reconciliarAdiantamento` em série dentro de um único `try/catch`. A 1ª falha (rede, 4xx do backend, timeout) aborta o restante e o toast genérico não diferencia o que foi e o que faltou. Adtos posteriores ficam sem feedback.

**Melhoria Proposta**
> Envolver cada `await reconciliarAdiantamento` em try/catch individual; agregar `{settled, erros: [{docCod, mensagem}], dryRun, borderos}` e renderizar um `toast.error` com a lista dos que falharam + `toast.success` com os que passaram (já é o padrão para o resultado settled vs erros, falta para a EXCEÇÃO da chamada).

**Resultado Esperado**
> Processar 3 adtos com falha no 2º: 1 settled + 1 erro reportado por nome + 1 NÃO interrompido → 2 settled + 1 erro. Cobertura: todos os adtos sempre tentados; estado parcial sempre visível ao analista.

**Métricas de sucesso**
- Adtos processados / adtos pendentes em runs com falha intermediária: parcial → 100%
- Toasts informativos por adto com erro: 0 → 1 por item

**Risco de não fazer**
> na primeira vez que o `fin010` der hiccup no meio de uma rodada, o analista perde 30+ min reconciliando manualmente.

**Dependências**: Nenhuma

---

### [fault-tolerance-3] Testar `autoAlocarSeElegivel` e `autoAlocarDeCasamento` (cobertura zero)

**QA**: Fault Tolerance · [CROSS: Testability]
**Tactic alvo**: Sanity Checking; Increase Competence Set
**Esforço**: M
**Findings**: F-fault-tolerance-3, F-fault-tolerance-4

**Problema**
> Os dois novos métodos públicos (`AlocacaoPermutasService.ts:300-393`) que criam alocações automaticamente antes da baixa não têm um único teste direto — só são mockados como `false` nos testes de reconciliação. Lógica delicada (idempotência, saldo cobre vs não, único casamento-manual do processo) não validada.

**Melhoria Proposta**
> Adicionar `AlocacaoPermutasService.test.ts` com ≥8 cenários: idempotente quando já alocado; segue manual quando não é casamento-manual; segue manual quando há >1 casamento-manual no processo; cria N alocações quando saldo cobre; segue manual quando saldo NÃO cobre (com magic-number 1 documentado ou substituído por tolerância derivada do valor); `autoAlocarDeCasamento` sem casamento → false; `autoAlocarDeCasamento` cria alocações pelos `valorASerUsado`; uma falha do `alocar` interno é PROPAGADA (ou trata com try/catch — definir contrato).

**Resultado Esperado**
> Cobertura de teste dos dois métodos: 0 → ≥8 cenários. Magic-number `+ 1` em `AlocacaoPermutasService.ts:337` documentado ou substituído por tolerância derivada (`Math.max(1, somaInvoices * 0.005)`).

**Métricas de sucesso**
- Cobertura: 0 → ≥8 cenários
- Documentação ou substituição do magic-number `+ 1`: pendente → resolvido

**Risco de não fazer**
> regressão silenciosa numa lógica de pre-write; bug que só vira incidente quando a forma do casamento mudar.

**Dependências**: Nenhuma

---

### [fault-tolerance-4] `autoAlocarDeCasamento`: live re-read antes de criar alocação + try/catch no loop

**QA**: Fault Tolerance
**Tactic alvo**: Increase Competence Set; Containment — Forward Recovery
**Esforço**: M
**Findings**: F-fault-tolerance-3, F-fault-tolerance-4

**Problema**
> O método usa o `valorASerUsado` do snapshot (potencialmente stale por horas), e o loop não tem try/catch — falha numa invoice deixa as anteriores alocadas e aborta as restantes. Diverge da disciplina aplicada em `autoAlocarSeElegivel` (que re-lê live via `buscarInvoices`).

**Melhoria Proposta**
> Antes do loop, chamar `buscarInvoices(adto.priCod, adto.filCod, adto.docCod)` e ajustar `valorASerUsado` ao `min(valor, disponivelLive)` por invoice. Envolver cada `await this.alocar(...)` em try/catch — agregar erros num retorno estruturado em vez de propagar (o caller `reconciliar` decide se prossegue para a baixa só com as alocações que deram certo). Logar warn em cada divergência stale × live para visibilidade.

**Resultado Esperado**
> Divergências stale-snapshot × live-ERP: detectadas e capped em vez de explodir como erro. Estado parcial na `permuta_alocacao` em runs de "Processar" com Conexos lateralmente mexido: 0.

**Métricas de sucesso**
- Chamadas live a `buscarInvoices` por execução de `autoAlocarDeCasamento`: 0 → 1
- Try/catch por iteração no loop: 0 → 1

**Risco de não fazer**
> "Processar" da aba Automáticas se torna instável quando o time financeiro lança algo no Conexos entre a ingestão e o clique.

**Dependências**: Nenhuma

---

### [fault-tolerance-5] Compensação no `excluirBordero` (best-effort com marcador de estado parcial)

**QA**: Fault Tolerance
**Tactic alvo**: Compensating Transaction; Idempotent Replay
**Esforço**: M
**Findings**: F-fault-tolerance-5

**Problema**
> O loop `for (const b of baixas) { await excluirBaixa(...) }` em `BorderoGestaoService.ts:170-180` pode falhar no meio, deixando o borderô parcialmente esvaziado no ERP e a trilha intacta (`deleteByBorCod` só roda depois). Retry repete chamadas que já passaram (ERP responde "não existe" → throw).

**Melhoria Proposta**
> (a) Try/catch por iteração; acumular falhas. (b) Se faltou ≥1 baixa, NÃO chamar `excluirBordero` e marcar a trilha com flag `parcial_delete_em_curso` (nova coluna opcional ou via `erro_mensagem`). (c) Retornar para o caller `{baixasExcluidas, baixasFalha}` em vez de simplesmente lançar. (d) Tornar a operação idempotente: filtrar do loop as baixas que o ERP responde 404 (tratar como já-feito) — não rethrow.

**Resultado Esperado**
> Falha intermediária no loop: estado parcial visível, retry seguro. Operação 100% idempotente em retry.

**Métricas de sucesso**
- Retries de `excluirBordero` em estado parcial: throw → no-op idempotente
- Visibilidade de estado parcial: 0 → marcador na trilha + retorno estruturado

**Risco de não fazer**
> lixo contábil no ERP que requer intervenção manual; suporte recorrente.

**Dependências**: Nenhuma

---

### [fault-tolerance-7] Stuck-state reaper: job que detecta `permuta_alocacao_execucao.status='reconciling'` órfão

**QA**: Fault Tolerance · [CROSS: Availability]
**Tactic alvo**: Condition Monitoring; Reconcile
**Esforço**: M
**Findings**: F-fault-tolerance-7

**Problema**
> Não há job que detecte execuções deixadas em `reconciling` por mais de N minutos (crash, timeout no passo 5 do handshake antes do `markSettled`). Em retry, a chave existe mas com `status='reconciling'` → `beginExecution` faz UPSERT (não pula) → risco de dupla-baixa se o `gravarBaixaPermuta` original tiver completado no ERP mas a resposta foi perdida.

**Melhoria Proposta**
> Job/endpoint que: (1) busca rows `status='reconciling' AND atualizado_em < now() - interval '15 minutes' AND bor_cod IS NOT NULL`; (2) consulta no ERP `getBordero(bor_cod)` e `listBaixas({borCod})` para ver se a baixa do par já existe; (3a) se a baixa existe no ERP → `markSettled` com o `bxaCodSeq` do ERP (cura idempotência); (3b) se NÃO existe e o borderô está EM CADASTRO → `markError` com "execução abandonada — re-execute"; (3c) emite log/alerta. Frequência: 15min (Express atual = endpoint admin chamado por cron externo / botão).

**Resultado Esperado**
> Execuções órfãs em `reconciling`: até janela de 15min, automaticamente curadas. Cenário de dupla-baixa "resposta perdida no passo 5": eliminado.

**Métricas de sucesso**
- MTTR para execução em `reconciling` órfã: indefinido → ≤30min
- Cenários de dupla-baixa cobertos pela idempotência: + 1 (resposta perdida no passo 5)

**Risco de não fazer**
> o primeiro hiccup de rede entre o passo 5 e o nosso `markSettled` cria uma janela de dupla-baixa silenciosa.

**Dependências**: pode ser implementado como endpoint admin invocado por cron externo (Render → /admin/permutas/health) até que haja jobs nativos.

---

### [security-1] Aplicar RBAC nas leituras novas de borderôs/status (least-privilege)

**QA**: Security
**Tactic alvo**: Authorize Actors / Limit Exposure
**Esforço**: S
**Findings**: F-security-1

**Problema**
> As 3 leituras novas (`GET /permutas/borderos`, `GET /permutas/borderos/:borCod/baixas`, `GET /permutas/status`) aceitam qualquer JWT autenticado e devolvem todo o backlog financeiro da Columbia (R$, fornecedores, CNPJ-derivável). A proposta institucional definiu SSO + RBAC como requisito transversal; as mutações vizinhas usam `requireRole('admin')`, mas as leituras regrediram para "qualquer-autenticado-vê-tudo".

**Melhoria Proposta**
> Definir 2 roles na ontologia: `admin` (mutações) e `analista` (leitura + mutações específicas). Aplicar `requireRole('admin','analista')` nas 3 leituras. Caso a Supabase emita só `authenticated`, materializar o role no JWT via custom claim (`app_metadata.role`) e validar em `toAuthUser`. Arquivos: `routes/permutas.ts:423, 437, 600`; `http/auth.ts:55-64`.

**Resultado Esperado**
> 3/3 rotas novas com `requireRole`; 0 vazamentos de backlog a JWTs sem role mapeada. JWT sem `role` → 403.

**Métricas de sucesso**
- rotas novas com RBAC: 1/4 → 4/4
- JWTs sem role conseguindo `GET /borderos`: 100% → 0%

**Risco de não fazer**
> token de "leitor" vazado → backlog financeiro extraído em 2 requests sem deixar rastro de privilégio escalado.

**Dependências**: definir o catálogo de roles na ontologia (`ontology/business-rules/rbac.md`)

---

### [security-2] Trilha de auditoria persistida para `removerDaTrilha` (DELETE com prova)

**QA**: Security · [CROSS: Fault Tolerance]
**Tactic alvo**: Audit Trail
**Esforço**: M
**Findings**: F-security-6

**Problema**
> `removerDaTrilha` é a saída-de-emergência que apaga linhas de `permuta_alocacao_execucao` para reabrir uma permuta. Hoje a única evidência é `LogService.info` em stdout (logs Render rotacionam). Investigação forense ≥ 7d depois fica cega — não há quem/quando/qual `bor_cod` recuperável.

**Melhoria Proposta**
> Adicionar tabela `permuta_execucao_audit_log` (`id`, `acao`, `bor_cod`, `payload_antigo jsonb`, `executado_por`, `criado_em`). `removerDaTrilha` faz `INSERT` ANTES do `DELETE`, dentro da mesma transação. Alternativa Postgres: trigger `AFTER DELETE ON permuta_alocacao_execucao` para qualquer DELETE.

**Resultado Esperado**
> 100% dos DELETEs em `permuta_alocacao_execucao` (de qualquer origem) deixam linha durável com payload anterior. Retenção: ≥ 2 anos (compliance SOX).

**Métricas de sucesso**
- DELETEs em `permuta_alocacao_execucao` com linha de auditoria: 0% → 100%
- tempo p/ reconstituir quem-removeu-borCod-X: indefinido → 1 SELECT

**Risco de não fazer**
> incidente de uso indevido de `removerDaTrilha` (insider abrindo permuta `settled` para re-baixar) fica impossível de auditar após rotação dos logs Render (~7d).

**Dependências**: Nenhuma

---

### [integrability-1] Adicionar Zod nas reads-críticas do `ConexosClient` (`listBorderos`/`listBaixas`/`listInvoicesFinalizadas`)

**QA**: Integrability · [CROSS: Security, Fault Tolerance]
**Tactic alvo**: Tailor Interface
**Esforço**: S
**Findings**: F-integrability-1

**Problema**
> As três reads novas alimentam cache local (`permuta_bordero`), input de DELETE no ERP (`listBaixas → excluirBordero`) e a tela de Gestão. Nenhuma valida o boundary com Zod: `Number(r.borCod)` aceita `NaN` silenciosamente. As writes correlatas (`criarBordero`, `gravarBaixaPermuta`) já exigem schema (`BORDERO_CRIADO_SCHEMA`) — incoerência simétrica.

**Melhoria Proposta**
> Criar `BORDERO_LISTA_ROW_SCHEMA` e `BAIXA_LISTA_ROW_SCHEMA` em `client/permutas/conexosPermutasSchemas.ts` (mesmo padrão dos `com298RowSchema`). `borCod`/`bxaCodSeq` = `z.coerce.number().int().positive()`. Rejeitar row sem identidade (log + skip da row, NÃO derrubar a página). Aplicar em `listBorderos`, `listBaixas`, `listInvoicesFinalizadas`.

**Resultado Esperado**
> 0 NaN no cache de borderô; toda row inválida vira `BUSINESS_WARN` rastreável. Cache rebuild idempotente.

**Métricas de sucesso**
- Cobertura Zod nos reads críticos: 0/3 → 3/3
- Rows inválidas observáveis em log: 0 → instrumentadas

**Risco de não fazer**
> corrupção silenciosa do cache → permuta duplicada na trilha → super-pagamento.

**Dependências**: Nenhuma

---

### [integrability-2] Paginação completa + cap-hit em `listBorderos`/`listBaixas`

**QA**: Integrability
**Tactic alvo**: Manage Resources / Observability of integration failures
**Esforço**: S
**Findings**: F-integrability-2

**Problema**
> Ambos chamam `listGenericPaginated` UMA vez (página 1, pageSize 200/1000). `listBorderos` ordena `borCod desc` — uma filial com >1000 borderôs perde os antigos, o `statusPorAdiantamento` deixa de resolver permutas antigas e o sistema as reabre indevidamente. `listBaixas` (pageSize 200) idem para borderôs com muitas baixas.

**Melhoria Proposta**
> Refatorar `listBorderos`/`listBaixas` para usarem o `paginate()` interno (laço até `MAX_PAGES`) com `onCapHit` → `BUSINESS_WARN`. Para o caso `borCods` (busca precisa), manter pageSize 1000 mas validar contra `count` do envelope.

**Resultado Esperado**
> Truncamento detectável: 0 cap-hits em produção significa que a hipótese é segura; >0 cap-hits dispara alerta. Cache de borderô consistente com o ERP.

**Métricas de sucesso**
- Endpoints com paginação completa: 1/3 → 3/3
- Cap-hit observável em log estruturado: ❌ → ✅

**Risco de não fazer**
> re-baixa duplicada de permutas antigas após o cache cruzar 1000 entradas (estimativa: 6-12 meses).

**Dependências**: Nenhuma

---

### [performance-1] Reduzir o fan-out com308 do universo completo (~1875 → ≤ 600 chamadas/run)

**QA**: Performance · [CROSS: Integrability, Fault Tolerance]
**Tactic alvo**: Increase Resource Efficiency · Reduce Overhead
**Esforço**: M (opção 1) · L (opção 2)
**Findings**: F-performance-1

**Problema**
> A ingestão agora hidrata `valorMoedaNegociada/moedaNegociada/taxa` (com308) para TODAS as invoices finalizadas do ERP (~1875), não só as ~126 casadas. Mede em ~65s, e cresce linear no backlog. Em 6 meses (>3k invoices) a ingestão estoura a janela do cron e arrisca `MAX_SESSIONS` Conexos.

**Melhoria Proposta**
> Três caminhos, em ordem de menor → maior esforço:
> 1. **Hidratar só o delta**: só chamar `listTitulosAPagar` para invoices NOVAS ou QUE MUDARAM. As já hidratadas reusam o valor do banco.
> 2. **Hidratar lazy**: a tela `/gestao` mostra "—" para moeda negociada das invoices NÃO casadas + botão "Buscar valor" on-demand.
> 3. **Batch endpoint**: investigar se o Conexos tem variante `com308/list` que aceita N docCods.

**Resultado Esperado**
> Ingestão p95 cai para ≤ 25s; nº de `listTitulosAPagar` por run cai de ~2390 para ≤ 600 em regime estacionário.

**Métricas de sucesso**
- Duração ingestão p95: 65s → ≤ 25s
- Chamadas com308/run em regime estacionário: ~2390 → ≤ 600
- Falhas `MAX_SESSIONS` em 30d: 0 → 0 (manter)

**Risco de não fazer**
> em ≤ 6 meses, ingestão > 2min, modal "girando" perceptível, e potencial retry storm Conexos em pico.

**Dependências**: opção 3 requer descoberta no Conexos.

---

### [performance-2] Criar índice em `permuta_bordero(bor_dta_mvto DESC, bor_cod DESC)` (migration 0019)

**QA**: Performance
**Tactic alvo**: Increase Resource Efficiency
**Esforço**: S
**Findings**: F-performance-2

**Problema**
> A tabela `permuta_bordero` (recém-criada em 0018) NÃO tem índice secundário e a única query de leitura faz `ORDER BY bor_dta_mvto DESC, bor_cod DESC LIMIT 500`. HOJE: 4008 rows = ~0,3s (seq scan + top-K em memória). Em 12 meses (~15k rows): degrada para ≥ 800ms só na query.

**Melhoria Proposta**
> Adicionar `migrations/0019_permuta_bordero_index.sql`:
> ```sql
> CREATE INDEX IF NOT EXISTS idx_permuta_bordero_recentes
>     ON permuta_bordero (bor_dta_mvto DESC NULLS LAST, bor_cod DESC);
> ```
> Postgres pode usar index-only scan + LIMIT 500 → retorna sem ler heap.

**Resultado Esperado**
> `listBorderoCache(500)` cai de ~0,3s para ≤ 30ms. `/permutas/borderos` cold cai de 0,83s para ≤ 500ms.

**Métricas de sucesso**
- `listBorderoCache(500)` Supabase remoto: ~300ms → ≤ 50ms
- `/permutas/borderos` cold: 0,83s → ≤ 500ms

**Risco de não fazer**
> degradação linear no volume; "aba lenta" recorrente em 6–12 meses.

**Dependências**: Nenhuma

---

### [deployability-1] Envelopar cada arquivo SQL em transação no MigrationRunner

**QA**: Deployability
**Tactic alvo**: Script Deployment Commands
**Esforço**: S
**Findings**: F-deployability-1

**Problema**
> O runner aplica o conteúdo de cada arquivo `.sql` como uma chamada única ao Postgres sem `BEGIN/COMMIT` explícito. Migrations com múltiplos statements (já existem: `0017_invoice_importador.sql` tem 2 ALTERs) podem aplicar parcialmente em falha intermediária. Hoje os DDL são idempotentes (`IF NOT EXISTS`), mascarando o problema; a primeira migration com DML (UPDATE/INSERT) ou DDL não-idempotente sofrerá corrupção.

**Melhoria Proposta**
> Em `MigrationRunner.run`, envolver cada arquivo em `BEGIN; <conteúdo>; COMMIT;` e mover o `INSERT INTO schema_migrations` para dentro da mesma transação.

**Resultado Esperado**
> Falha durante o arquivo = rollback completo + arquivo não marcado como aplicado → próxima run retenta limpo. Estado intermediário impossível.

**Métricas de sucesso**
- migrations atomicas: 0/18 → 18/18
- statements órfãos pós-falha: possível → impossível

**Risco de não fazer**
> primeira migration futura com DML deixa o schema em estado inconsistente — incidente de produção com debug manual.

**Dependências**: Nenhuma

---

### [deployability-3] Criar runbook de rollback v0.7.0 (e template recorrente por release)

**QA**: Deployability
**Tactic alvo**: Rollback
**Esforço**: S
**Findings**: F-deployability-3

**Problema**
> `DEPLOY.md` não menciona rollback. `docs/runbooks/` só tem `fin010-write-cutover.md`. Operador em incidente precisa decidir sob estresse se pode rebobinar o deploy sem quebrar o schema — as migrations 0017/0018 são aditivas (rollback de código é seguro), mas isso não está afirmado em lugar algum.

**Melhoria Proposta**
> Adicionar `docs/runbooks/rollback-v0.7.0.md` afirmando: (1) "Rollback de código v0.7.0 → v0.6.1 é seguro — colunas e tabela ficam órfãs, inertes"; (2) passo-a-passo no Render dashboard; (3) check-list pós-rollback (`/health`, `/permutas/gestao` ok). Generalizar para template `docs/runbooks/_template-rollback.md` consumido pelo `/feature-new` ao registrar o bump de versão.

**Resultado Esperado**
> MTTR de rollback documentado (alvo ≤ 5 min). Próximo release sai com runbook gerado automaticamente.

**Métricas de sucesso**
- releases com runbook de rollback: 0/N → 1/1 (v0.7.0) + futuro
- MTTR rollback documentado: indefinido → ≤5 min

**Risco de não fazer**
> incidente em prd com decisão tardia/errada → janela de impacto a usuárias do financeiro >30min.

**Dependências**: Nenhuma

---

### [modifiability-1] Extrair `PermutaClassificadorService` (regras de tipo/elegibilidade)

**QA**: Modifiability · [CROSS: Testability]
**Tactic alvo**: Encapsulate / Polymorphism
**Esforço**: M
**Findings**: F-modifiability-1, F-modifiability-7

**Problema**
> `GestaoPermutasService.toPendente` (cog complexity 58, 100 LOC) e `adtosQueUltrapassamInvoice` (16) concentram a decisão de status × tipoPermuta × autoElegivel num único ternário aninhado. O `page.tsx` espelha a mesma derivação. Toda regra de classificação nova fica espalhada em 2 lugares.

**Melhoria Proposta**
> Criar `PermutaClassificadorService` com métodos `classificarTipoPermuta(adto, contexto)`, `reclassificarSeUltrapassa(...)`, `isAutoElegivel(...)`. `toPendente` passa a delegar. Opcional Fase 2: `interface PermutaTipoStrategy` com 4 impls registradas no tsyringe via token `PERMUTA_TIPO_STRATEGIES`.

**Resultado Esperado**
> `toPendente` cai para ≤ 15 de complexidade; adicionar um 5º tipo de permuta = 1 arquivo novo + 1 registro no token. Suites verdes.

**Métricas de sucesso**
- Cog complexity `toPendente`: 58 → ≤ 15
- Cog complexity `exporGestao`: 28 → ≤ 15
- Funções backend > 15: 14 → 11

**Risco de não fazer**
> cada feature de classificação (3 previstas em backlog) custará 1–2 dias a mais; em 6 meses o método passa de 60 → 80+ e vira intratável.

**Dependências**: Nenhuma

---

### [modifiability-2] Split `BorderoGestaoService` em 3 services coesos

**QA**: Modifiability · [CROSS: Testability]
**Tactic alvo**: Split Module
**Esforço**: M
**Findings**: F-modifiability-2

**Problema**
> `BorderoGestaoService` mistura 4 responsabilidades (CRUD ERP, leitura+cache, status vivo cross-permuta, leitura on-demand de baixas ERP) em 527 LOC e 9 métodos públicos. Testes pesados; bug em uma responsabilidade arrisca as outras três.

**Melhoria Proposta**
> Split em: (a) `BorderoErpActionService` — 5 ações de escrita + guards; (b) `BorderoListagemService` — `listarBorderos` + `refreshCache` + `listarBaixasErp`; (c) `PermutaBorderoStatusService` — `statusPorAdiantamento`. Manter um `BorderoGestaoFacade` no `routes/` se preciso preservar o caminho atual.

**Resultado Esperado**
> Cada service ≤ 250 LOC, ≤ 4 métodos públicos. Suites separadas. Mock surface por teste cai.

**Métricas de sucesso**
- LOC `BorderoGestaoService`: 527 → ≤ 250 (split em 3)
- Métodos públicos por classe: 9 → ≤ 4

**Risco de não fazer**
> Fase 3.2 (histórico de borderôs, relatórios) cairá no mesmo arquivo; em 6 meses passa de 527 → 900+ LOC.

**Dependências**: Nenhuma

---

### [modifiability-5] Split `frontend/app/permutas/page.tsx` em hooks + componentes por aba

**QA**: Modifiability
**Tactic alvo**: Split Module
**Esforço**: L
**Findings**: F-modifiability-5

**Problema**
> Page atingiu 2.562 LOC (Δ +404 só neste PR). Concentra 4 modais, 4 badges, 1 hook genérico, 6 derivações de lista filtrada e o orquestrador. 3 warnings `setState-in-effect` ainda abertos.

**Melhoria Proposta**
> Extrair: `components/permutas/{MoneyInput, StatusBadge, ProcessamentoBadge, PermutaBorderoBadge, RunStatusBadge, Campo, FiltroBarra, Paginacao}.tsx`; `hooks/{useGestaoPermutas, useAlocacao, useReconciliacao, useIngestaoManual, useStatusBordero}.ts`; `app/permutas/{AlocacaoModal, ReconciliacaoModal, IngestaoModal, ConfirmacaoModal}.tsx`. Manter a page como orquestrador ≤ 600 LOC. Resolver os 3 warnings de setState-in-effect no caminho.

**Resultado Esperado**
> `page.tsx` ≤ 600 LOC; cada modal ≤ 250 LOC; cada hook testável isoladamente. 0 warning de setState-in-effect.

**Métricas de sucesso**
- LOC `page.tsx`: 2.562 → ≤ 600
- setState-in-effect warnings: 3 → 0
- Componentes reutilizáveis extraídos: 0 → ≥ 8

**Risco de não fazer**
> a tela é o "espelho" da regra de negócio; cada nova aba/modal exigirá visita de ~2,5k LOC.

**Dependências**: idealmente após [modifiability-1].

---

### [testability-3] Cobrir os 13 métodos não-testados de `PermutaExecucaoRepository`

**QA**: Testability
**Tactic alvo**: Specialized Interfaces + Executable Assertions
**Esforço**: M
**Findings**: F-testability-3

**Problema**
> O repositório ganhou +101 LOC nesta PR (8 métodos novos do cache de borderôs + helpers de borderô). Existem 18 métodos públicos no `.ts` e só 5 cobertos por teste direto. O `replaceBorderoCache` faz INSERT…ON CONFLICT seguido de `DELETE … NOT IN (...)` com placeholders dinâmicos — SQL parametrizado correto, mas zero teste prova a forma do prune.

**Melhoria Proposta**
> Adicionar ≥ 14 it em `PermutaExecucaoRepository.test.ts`, no mesmo padrão dos 7 existentes. Casos: (1-2) `listBorderoCache` ordering + limit clamp; (3-5) `replaceBorderoCache` upsert + prune + no-op no vazio; (6) `updateBorderoCacheSituacao`; (7) `deleteBorderoCache`; (8) `listComBordero`; (9-10) `listByBorCod` + `countByBorCod` cast; (11) `findByBorCodInvoice`; (12-13) `deleteByBorCod` + `deleteByBorCodInvoice`; (14) `renameKey` + `deleteByKey`.

**Resultado Esperado**
> Cobertura métodos públicos `PermutaExecucaoRepository` 5/18 → 18/18; SQL do prune coberto explicitamente.

**Métricas de sucesso**
- `grep -c '^\s*it(' PermutaExecucaoRepository.test.ts`: 7 → ≥ 21
- métodos públicos com teste direto: 5 → 18

**Risco de não fazer**
> prune do cache apaga tudo (lista de borderôs em branco); `countByBorCod` retorna 0 errado → dispara `excluirBordero` no ERP sem haver baixa pendente.

**Dependências**: Nenhuma

---

### [testability-4] Cobrir os 9 endpoints novos de `routes/permutas.ts` + tradutor de erro ERP

**QA**: Testability · [CROSS: Security, Fault Tolerance]
**Tactic alvo**: Executable Assertions
**Esforço**: M
**Findings**: F-testability-4 + F-security-* + F-fault-tolerance-*

**Problema**
> 9 endpoints novos foram adicionados nesta PR (`GET /borderos[?live]`, `GET /borderos/:b/baixas`, `POST /borderos/:b/{finalizar,cancelar,estornar}`, `DELETE /borderos/:b`, `DELETE /borderos/:b/trilha`, `DELETE /borderos/:b/baixas/:i`, `GET /status`) e o tradutor `erpErrorMessage`/`respondActionError` (mapeia FIN_014, FORBIDDEN→403). Zero teste de rota. Regressão silenciosa em RBAC, status code, mensagem PT.

**Melhoria Proposta**
> Estender `routes/permutas.test.ts` (setup supertest pronto). Para cada endpoint mutador, ≥ 3 it: (a) happy 200 c/ admin; (b) 401 sem auth; (c) 403 não-admin OU FORBIDDEN do service. Para endpoints de escrita ERP, ≥ 1 it injetando erro com `cause.response.data.messages[0].message = 'FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO'` e assere que `res.body.error` é a mensagem PT traduzida.

**Resultado Esperado**
> Cobertura endpoints `/borderos*` + `/status` 0/9 → 9/9; ≥ 12 it adicionais.

**Métricas de sucesso**
- `grep -cE '/borderos|/status|trilha|/baixas' routes/permutas.test.ts`: 0 → ≥ 24
- `grep -c '^\s*it(' routes/permutas.test.ts`: 28 → ≥ 40

**Risco de não fazer**
> admin consegue mexer em borderô que não é da trilha (confused-deputy regressa); usuário vê `FIN_014.FIN_IMPOSSIVEL_ALTERAR_REGISTRO` cru.

**Dependências**: Nenhuma

---

### [testability-5] Cobrir o front: `BorderosPanel`, 10 funções `lib/api.ts` novas, `MoneyInput`/`maskBrl`, `confirmarProcessamento`

**QA**: Testability
**Tactic alvo**: Specialized Interfaces + Limit Non-Determinism
**Esforço**: M
**Findings**: F-testability-5 + F-testability-6

**Problema**
> A PR adicionou 678 LOC em `BorderosPanel.tsx`, ~150 LOC de funções API novas em `lib/api.ts` e os utilitários contábeis `MoneyInput`/`maskBrl`. Nenhum teste. `maskBrl` errado vira valor errado de alocação manual; memo de 30s de `fetchBorderos` sem invalidação correta vira decisão financeira sobre dado velho.

**Melhoria Proposta**
> Criar:
> 1. `__tests__/borderos-api.test.ts` — ≥ 10 it (1 por função + 1 dedicado ao memo TTL com `jest.useFakeTimers` + `invalidarBorderosMemo`).
> 2. `__tests__/money-input.test.tsx` — Testing Library, ≥ 4 it para `maskBrl` (`'0'`→`'0,00'`, idempotência, round-trip).
> 3. `__tests__/borderos-panel.test.tsx` — mock `fetchBorderos`/`finalizarBordero`. ≥ 3 it.
> 4. `__tests__/permutas-processar.test.tsx` — ≥ 1 it para `confirmarProcessamento`.

**Resultado Esperado**
> Cobertura FE superfícies novas: 0/13 → ≥ 13; FE testes totais 51 → ≥ 69.

**Métricas de sucesso**
- `find __tests__ -name 'borderos*'`: 0 → ≥ 2 arquivos
- testes cobrindo `maskBrl`: 0 → ≥ 4
- testes cobrindo `fetchBorderos` (inclui memo TTL): 0 → ≥ 2

**Risco de não fazer**
> analista decide sobre cache fantasma de 30s; `maskBrl` regride em refactor e vira valor errado de alocação no ERP.

**Dependências**: Nenhuma

---

## P2 — Médio (21 cards)

---

### [availability-1] Tornar `replaceBorderoCache` atômico (single transaction)

**QA**: Availability
**Tactic alvo**: Transactions / Rollback
**Esforço**: S
**Findings**: F-availability-1

**Problema**
> O `replaceBorderoCache` faz INSERT...ON CONFLICT e DELETE em chamadas separadas no `databaseClient`. Se o processo cair entre as duas, o cache fica com órfãos (borderôs já apagados no ERP visíveis na UI).

**Melhoria Proposta**
> Envolver as duas statements em `databaseClient.withTransaction(...)`. Alternativa: usar um único `WITH inserted AS (INSERT ... RETURNING bor_cod) DELETE FROM permuta_bordero WHERE bor_cod NOT IN (SELECT bor_cod FROM inserted)`.

**Resultado Esperado**
> Cache de borderôs sempre consistente após `refreshCache`. Janela de inconsistência: 0s.

**Métricas de sucesso**
- Borderôs órfãos pós-crash de refresh: indeterminado → 0
- Statements por refresh: 2 → 1

**Risco de não fazer**
> incidente recorrente onde analista reporta "borderô que não existe mais aparece na tela".

**Dependências**: Nenhuma

---

### [availability-3] Adicionar timeout HTTP no `GET /permutas/status` e demais rotas que fazem fan-out Conexos

**QA**: Availability
**Tactic alvo**: Detect Faults — Monitor (timeout)
**Esforço**: S
**Findings**: F-availability-3

**Problema**
> O `GET /permutas/status` dispara `Promise.all` sobre N filiais com `RetryExecutor(2, 500ms, jitter 200ms)` cada. Sem timeout do request Express, uma queda Conexos pendura workers por 30+ segundos.

**Melhoria Proposta**
> Adicionar middleware `express-timeout` (10s) nas rotas que fazem fan-out Conexos LAZY (`/status`, `/borderos?live=true`, `/invoices/buscar`). No serviço, passar um `AbortSignal` com timeout e usar `Promise.allSettled` em vez de `Promise.all`.

**Resultado Esperado**
> Endpoint responde em ≤10s mesmo com Conexos lento.

**Métricas de sucesso**
- p95 latência `/permutas/status` em incidente Conexos: > 30s → ≤ 10s
- Workers Express pendurados em incidente: indeterminado → 0

**Risco de não fazer**
> 1 incidente Conexos = tela inteira de permutas indisponível.

**Dependências**: Nenhuma

---

### [availability-5] Propagar `capHit` de `listInvoicesFinalizadas` para `IngestaoResult` + alarme

**QA**: Availability
**Tactic alvo**: Condition Monitoring
**Esforço**: S
**Findings**: F-availability-5

**Problema**
> `listInvoicesFinalizadas` captura `capHit=true` quando bate `MAX_PAGES=50` (teto teórico 25 000 invoices/filial), mas o `EleicaoPermutasService.computeCandidatas` descarta o sinal. Ingestão pode truncar silenciosamente o universo de invoices.

**Melhoria Proposta**
> Estender `EleicaoResult` e `IngestaoResult` com `truncatedFiliais: number[]`. Logar `BUSINESS_WARN` por filial truncada. UI da aba "Ingestão Manual" mostra alerta quando truncatedFiliais ≠ [].

**Resultado Esperado**
> Truncamento visível em ≤ 1 run. Analista sabe quando ampliar o filtro.

**Métricas de sucesso**
- Runs truncadas detectadas: 0 → 100%

**Risco de não fazer**
> à medida que o backlog Columbia cresce, ingestão começa a perder invoices; ninguém detecta até auditoria contábil acusar diferença.

**Dependências**: Nenhuma

---

### [deployability-2] Pré-aquecer `permuta_bordero` no `preDeployCommand`

**QA**: Deployability · [CROSS: Performance]
**Tactic alvo**: Scale Rollouts (warm-up)
**Esforço**: S
**Findings**: F-deployability-2, F-deployability-4

**Problema**
> A primeira request a `/permutas/borderos` pós-deploy v0.7.0 paga 5–15s (`refreshCache` ao vivo) porque a tabela acabou de ser criada. O fallback self-warming existe, mas degrada UX e fica vulnerável a indisponibilidade do ERP no momento errado.

**Melhoria Proposta**
> Adicionar `npm run cache:warm-borderos` ao `preDeployCommand` do `render.yaml:21`. Criar `jobs/warm-bordero-cache.ts` resolvendo `BorderoGestaoService.refreshCache()` com try/catch (best-effort — falha do ERP no preDeploy NÃO deve bloquear o deploy, apenas log).

**Resultado Esperado**
> Cache populado antes do tráfego trocar — primeira request a `/borderos` lê do banco (<200ms).

**Métricas de sucesso**
- p95 primeira request pós-deploy: ~10s → ≤500ms
- chamadas ao ERP na primeira request: N filiais → 0

**Risco de não fazer**
> tickets recorrentes de "tela travou após o deploy".

**Dependências**: Nenhuma

---

### [deployability-4] Pinar Node version no `render.yaml`

**QA**: Deployability
**Tactic alvo**: Reproducible Builds
**Esforço**: S
**Findings**: F-deployability-5

**Problema**
> CI valida em Node 24; Render usa a versão default do plan starter (variável, atualmente Node 22). Bibliotecas nativas (`pg`, `bcryptjs`) ou recursos de linguagem podem comportar-se diferente.

**Melhoria Proposta**
> Adicionar `nodeVersion: '24'` (ou criar `.nvmrc`/`engines`) ao `render.yaml:7` — Render respeita ambos.

**Resultado Esperado**
> CI e Render rodam a mesma versão do Node. Atualização vira commit explícito.

**Métricas de sucesso**
- Node version drift CI↔prd: possível → impossível

**Risco de não fazer**
> deploy verde no CI quebra em prd quando Render bumpar default.

**Dependências**: Nenhuma

---

### [integrability-3] Desacoplar `IngestaoPermutas → BorderoGestao.refreshCache` via evento/callback

**QA**: Integrability · [CROSS: Modifiability]
**Tactic alvo**: Manage Resource Coupling / Orchestrate
**Esforço**: M
**Findings**: F-integrability-3

**Problema**
> A ingestão passou a injetar `BorderoGestaoService` para chamar `refreshCache()` best-effort no fim da run. Vira hotspot de 7 dependências e dependência direta cross-aggregate. No alvo Lambda, isso deveria ser um `EventBridge` fan-out.

**Melhoria Proposta**
> Introduzir `IngestEventBus` (interface local; impl in-memory hoje, SNS/EventBridge no alvo). `IngestaoPermutasService.executar` emite `IngestCompleted` → `BorderoGestaoService` assina. Remove o `@inject(BorderoGestaoService)` do construtor da ingestão.

**Resultado Esperado**
> Ingestão volta a 6 deps (era 6 pré-PR). Adicionar novo "post-ingest hook" não toca `IngestaoPermutasService`.

**Métricas de sucesso**
- Deps injetadas em `IngestaoPermutasService`: 7 → 6
- Acoplamentos cross-aggregate diretos: 1 → 0

**Risco de não fazer**
> próxima feature ("avisar Slack quando ingestão completar") adiciona uma 8ª dep direta na ingestão — ladeira escorregadia.

**Dependências**: alinha com Modifiability (mesmo locus).

---

### [integrability-4] Pacote `shared/` ou OpenAPI gerado para tipos FE↔BE

**QA**: Integrability · [CROSS: Modifiability, Testability]
**Tactic alvo**: Versioning strategy
**Esforço**: L
**Findings**: F-integrability-4

**Problema**
> Cada novo response shape do backend é redeclarado à mão em `frontend/lib/types.ts`. PR v0.7.0 adicionou 4 tipos espelhados. Risco de divergência silenciosa cresce a cada feature.

**Melhoria Proposta**
> Avaliar 2 caminhos: (a) gerar OpenAPI das rotas Express + `openapi-typescript` no FE; (b) extrair um pacote `shared/types` no monorepo. Decisão de arquitetura — discutir com Yuri.

**Resultado Esperado**
> Mudança de shape no BE quebra o build do FE no typecheck. Custo marginal = 1 arquivo.

**Métricas de sucesso**
- Tipos duplicados FE↔BE: 4+ (este PR) → 0
- Detecção de drift em CI: nenhuma → typecheck FE quebra

**Risco de não fazer**
> bug silencioso de enum/status em runtime; tempo de PR cresce.

**Dependências**: roadmap de migração para Lambda.

---

### [modifiability-3] Criar `PermutaBorderoCacheRepository` e tirar a tabela `permuta_bordero` de `PermutaExecucaoRepository`

**QA**: Modifiability
**Tactic alvo**: Increase Semantic Coherence
**Esforço**: S
**Findings**: F-modifiability-3

**Problema**
> 4 métodos públicos de `PermutaExecucaoRepository` operam a tabela `permuta_bordero` (≠ `permuta_alocacao_execucao`). 33% do repo está fora do seu escopo declarado.

**Melhoria Proposta**
> Extrair `PermutaBorderoCacheRepository` (`@injectable`, mesmo padrão DDD) com `list`, `replace`, `updateSituacao`, `delete`. Re-injetar em `BorderoGestaoService`.

**Resultado Esperado**
> 0 referência a `permuta_bordero` fora do novo repo. `PermutaExecucaoRepository` volta a 12 → 8 métodos.

**Métricas de sucesso**
- Métodos `*BorderoCache*` em `PermutaExecucaoRepository`: 4 → 0
- Arquivos que tocam `permuta_bordero`: 2 → 1

**Risco de não fazer**
> dívida cresce com Fase 3.2 (histórico, relatórios).

**Dependências**: Nenhuma

---

### [modifiability-4] Centralizar tolerâncias de saldo em `PermutaTolerancePolicy` + expor via `EnvironmentProvider`

**QA**: Modifiability · [CROSS: Deployability]
**Tactic alvo**: Encapsulate / Configuration files
**Esforço**: S
**Findings**: F-modifiability-4

**Problema**
> Tolerâncias "+1 USD" e "+0,005 BRL" estão duplicadas literal em 5 sítios (Gestao + Alocacao). Qualquer ajuste contábil = 5 edições + risco de bug silencioso.

**Melhoria Proposta**
> Criar `class PermutaTolerancePolicy` (`@singleton @injectable`) com `excedeSaldoCentavos(disp, pedido)` e `cobreSomaUsd(saldo, soma)`. Valores default em código; override via `EnvironmentProvider` (`permutaToleranceUsd`, `permutaToleranceCentavos`).

**Resultado Esperado**
> 5 ocorrências → 1 classe. Ajustar tolerância = 1 var de ambiente, sem redeploy do código.

**Métricas de sucesso**
- Magic numbers de tolerância em services: 5 → 0
- Cobertura de teste da policy: ≥ 90%

**Risco de não fazer**
> cada pedido contábil de "ajusta a tolerância" vai vir com bug colateral pela divergência das 5 ocorrências.

**Dependências**: Nenhuma

---

### [modifiability-6] Introduzir `PermutaActionsFacade` + middleware `executadoPor`

**QA**: Modifiability
**Tactic alvo**: Use an Intermediary / Abstract Common Services
**Esforço**: M
**Findings**: F-modifiability-6

**Problema**
> `routes/permutas.ts` resolve 12 services do container e duplica `executadoPor = req.user?.sub ?? req.user?.email ?? 'unknown'` em 9 handlers. 620 LOC só de roteamento.

**Melhoria Proposta**
> (a) Middleware `withExecutadoPor` que injeta `req.executadoPor`. (b) Agrupar as 5 ações de borderô + reconciliar num `PermutaActionsFacade` que recebe `executadoPor` e roteia. Mantém compat de rota.

**Resultado Esperado**
> 9 cópias de `executadoPor` → 1; `routes/permutas.ts` ≤ 400 LOC; deps do `container.resolve`: 12 → ≤ 5.

**Métricas de sucesso**
- LOC `routes/permutas.ts`: 620 → ≤ 400
- Cópias do trecho `executadoPor`: 9 → 1
- Deps resolvidas: 12 → ≤ 5

**Risco de não fazer**
> na migração Lambda, cada handler precisará repetir o middleware → 9× retrabalho.

**Dependências**: após [modifiability-2].

---

### [performance-3] Paralelizar as 2 leituras do `BorderoGestaoService.listarBorderos`

**QA**: Performance
**Tactic alvo**: Reduce Overhead · Schedule Resources
**Esforço**: S
**Findings**: F-performance-4

**Problema**
> `listarBorderos` faz `listBorderoCache` e `listComBordero` SEQUENCIAIS no Postgres remoto (RTT ~250ms × 2 = 500ms a mais que o mínimo). Medido: 0,83s cold vs 0,47s warm.

**Melhoria Proposta**
> Trocar para `Promise.all([listBorderoCache, listComBordero])`. Pequeno cuidado: o `if (cache.length === 0 && !opts?.live)` precisa virar reavaliação após as duas resolverem.

**Resultado Esperado**
> `/permutas/borderos` cold cai de 0,83s para ~580ms.

**Métricas de sucesso**
- `/permutas/borderos` cold: 0,83s → ≤ 580ms (sem Card 2) ou ≤ 400ms (com Card 2)

**Risco de não fazer**
> usuário sente delay desnecessário ao trocar de aba pela primeira vez.

**Dependências**: combina bem com `performance-2`.

---

### [performance-4] Índice parcial em `permuta_alocacao_execucao(bor_cod) WHERE bor_cod IS NOT NULL`

**QA**: Performance
**Tactic alvo**: Increase Resource Efficiency
**Esforço**: S
**Findings**: F-performance-5

**Problema**
> `PermutaExecucaoRepository.listComBordero` faz `WHERE bor_cod IS NOT NULL ORDER BY bor_cod DESC, criado_em` sem índice. Medido: 287ms hoje.

**Melhoria Proposta**
> Adicionar à migration 0019 (ou nova 0020):
> ```sql
> CREATE INDEX IF NOT EXISTS idx_permuta_alocacao_execucao_borcod_partial
>     ON permuta_alocacao_execucao (bor_cod DESC, criado_em)
>     WHERE bor_cod IS NOT NULL;
> ```

**Resultado Esperado**
> `listComBordero` cai de 287ms para ≤ 30ms. `/permutas/status` (lazy) responde em < 100ms.

**Métricas de sucesso**
- `listComBordero` Supabase remoto: 287ms → ≤ 30ms
- `/permutas/status` total: NÃO medido → ≤ 200ms

**Risco de não fazer**
> cresce linear com histórico de execuções; em 1 ano (~10k linhas) chega a > 1s a query.

**Dependências**: Nenhuma

---

### [performance-5] Instrumentar `Server-Timing` + log de payload size nas rotas `/permutas/*`

**QA**: Performance · [CROSS: Availability]
**Tactic alvo**: Bound Execution Times (observabilidade)
**Esforço**: S
**Findings**: F-performance-3, F-performance-6, F-performance-7

**Problema**
> Não há instrumentação de latência por sub-fase (DB vs Conexos vs serialização) nem do tamanho do payload de `/gestao` (~1.0–1.3MB estimado).

**Melhoria Proposta**
> Em `asyncHandler.ts` (ou middleware dedicado), envolver com `performance.now()` antes/depois e gravar `Server-Timing: db;dur=X, conexos;dur=Y, total;dur=Z`. Também logar `res.getHeader('content-length')`. Subir para Sentry como tag/measurement.

**Resultado Esperado**
> Visibilidade p50/p95 por rota em produção; cada card seguinte tem baseline objetivo.

**Métricas de sucesso**
- % rotas /permutas com Server-Timing: 0 → 100%

**Risco de não fazer**
> cada nova otimização vira anedota.

**Dependências**: combina com qa-availability.

---

### [performance-6] Paginar/streamar `invoicesEmAberto` no `/permutas/gestao`

**QA**: Performance
**Tactic alvo**: Limit Event Response · Reduce Overhead
**Esforço**: M
**Findings**: F-performance-3

**Problema**
> Payload de `/gestao` carrega TODAS as 1875 invoices em aberto a cada GET. Estimativa: 1.0–1.3MB → parse na CPU do cliente.

**Melhoria Proposta**
> Curto prazo: adicionar query param `?invoiceLimit=N` (default 500), devolver `invoicesEmAberto` paginadas + `totalInvoices`. Médio prazo: endpoint dedicado `/permutas/invoices?search=...&priCod=...` lazy.

**Resultado Esperado**
> Payload `/gestao` cai de ~1.2MB para ~400KB; parse front cai de ~50ms para ~15ms.

**Métricas de sucesso**
- Tamanho do payload /gestao p95: ~1.2MB → ≤ 400KB
- TTFB /gestao p95: NÃO MEDIDO → ≤ 800ms

**Risco de não fazer**
> payload cresce linearmente com o backlog; em 1 ano arrisca ≥ 2.5MB.

**Dependências**: `performance-5` (não bloqueia).

---

### [fault-tolerance-6] `estornarBordero` deve atualizar o cache local (simetria com finalizar/cancelar)

**QA**: Fault Tolerance
**Tactic alvo**: State Resync
**Esforço**: S
**Findings**: F-fault-tolerance-6

**Problema**
> `BorderoGestaoService.estornarBordero` (`:260-272`) é a única ação de mutação que NÃO chama `updateBorderoCacheSituacao` após o POST no ERP. A tela mostra o borderô como FINALIZADO até o próximo refresh manual.

**Melhoria Proposta**
> Após o POST do estorno, chamar `updateBorderoCacheSituacao(borCod, { borCodEstornado: <retornoDoErp ?? -1> })`. Adicionar teste cobrindo a chamada do `updateBorderoCacheSituacao`.

**Resultado Esperado**
> Estornar reflete imediatamente na lista (UI mostra ESTORNADO sem refresh).

**Métricas de sucesso**
- Ações de mutação que atualizam o cache: 2/3 → 3/3

**Risco de não fazer**
> confusão visual recorrente; suporte intermitente.

**Dependências**: Nenhuma

---

### [security-3] Migrar inputs HTTP das 4 rotas novas para Zod (boundary regression-fix)

**QA**: Security
**Tactic alvo**: Validate Input
**Esforço**: S
**Findings**: F-security-2

**Problema**
> As 4 rotas novas (`/status`, `/borderos?live`, `/borderos/:borCod/baixas`, `/trilha` DELETE) validam params/query com `Number(...)` + `Number.isFinite` manual, regredindo o padrão Zod estabelecido no MESMO arquivo (8 schemas existentes).

**Melhoria Proposta**
> Criar e usar `borCodPathSchema = z.object({ borCod: z.coerce.number().int().positive() })`, `filCodQuerySchema = z.object({ filCod: z.coerce.number().int().positive() })`, `borderosQuerySchema = z.object({ live: z.coerce.boolean().optional() })`. Aplicar `safeParse` no início de cada handler novo.

**Resultado Esperado**
> 4/4 rotas novas validam inputs com Zod. Inputs malformados respondem 400 estruturado.

**Métricas de sucesso**
- rotas novas com Zod: 0/4 → 4/4
- rotas com `Number()`+`isFinite` ad-hoc: 4 → 0

**Risco de não fazer**
> precedente de "ignorar Zod para rotas simples" se propaga.

**Dependências**: Nenhuma

---

### [security-4] Validar com Zod as respostas do `com298/list` em `listInvoicesFinalizadas` e do `fin010/baixas/list` em `listBaixas`

**QA**: Security · [CROSS: Integrability, Fault Tolerance]
**Tactic alvo**: Validate Input
**Esforço**: S
**Findings**: F-security-3

**Problema**
> Novos mappers ERP (`ConexosClient.listInvoicesFinalizadas:730`, `listBaixas:1181`) consomem rows do Conexos sem `com298RowSchema.parse`. O mesmo cliente JÁ usa Zod em `listAdiantamentosProforma:679`. Rows sem `docCod`/`priCod` viram identidade vazia.

**Melhoria Proposta**
> Em `listInvoicesFinalizadas`: aplicar `com298RowSchema.parse(row)` antes do `mapDocPagar`. Em `listBaixas`: criar `fin010BaixaRowSchema` (exigir `docCod`, `titCod`, `bxaCodSeq` como wireNumber positivo).

**Resultado Esperado**
> Rows tóxicas do ERP → erro Zod logado e descartadas. Mappers ERP cobertos 3/3.

**Métricas de sucesso**
- mappers ERP novos com Zod: 0/2 → 2/2
- rows com identidade vazia entrando em `permuta_invoice`: silencioso → 0

**Risco de não fazer**
> cache poluído por uma row tóxica do ERP corrompe a busca por cliente.

**Dependências**: Nenhuma

---

### [security-5] Reservar `tenant_id` em `permuta_bordero` antes da expansão multi-tenant

**QA**: Security · [CROSS: Availability, Modifiability]
**Tactic alvo**: Limit Exposure / Separate Entities
**Esforço**: M
**Findings**: F-security-4

**Problema**
> Nova tabela `permuta_bordero` (cache de borderôs) é global (`bor_cod` como PK única). No alvo SaaSo, se a evolução for "multi-tenant mesmo banco", `replaceBorderoCache` apagaria os borderôs do tenant B ao rodar a ingestão do tenant A.

**Melhoria Proposta**
> Adicionar coluna `tenant_id TEXT NOT NULL DEFAULT 'columbia'` em `permuta_bordero`. Mudar PK para `(tenant_id, bor_cod)`. Atualizar `replaceBorderoCache`/`listBorderoCache`/`updateBorderoCacheSituacao`/`deleteBorderoCache` para receber `tenantId` e filtrar WHERE. Habilitar RLS no Supabase.

**Resultado Esperado**
> Modelo de dados pronto para multi-tenant antes que a primeira filial-cliente entre.

**Métricas de sucesso**
- tabelas `permuta_*` com `tenant_id`: 0 → ≥1 (cache) → todas (futuro)

**Risco de não fazer**
> quando o financeiro for vendido para o 2º cliente, retrabalho de migration + risco de leak cross-tenant.

**Dependências**: decisão arquitetural "1 banco multi-tenant" vs "1 banco por tenant".

---

### [security-6] Implementar revogação server-side de sessão (kill-switch por `sub`/`jti`)

**QA**: Security
**Tactic alvo**: Revoke Access
**Esforço**: M
**Findings**: F-security-5

**Problema**
> A nova `DELETE /trilha` é destrutiva e a única defesa para "admin desligado com JWT válido" é esperar `exp`. Sem mecanismo de revogação imediata por `sub`/`jti`, um admin recém-removido mantém poder de mutação por até 1h (access) + 7d (refresh).

**Melhoria Proposta**
> Tabela `app_session_revoked` (`jti TEXT PRIMARY KEY`, `sub TEXT`, `revoked_at TIMESTAMPTZ`). Em `buildAuthMiddleware`, após `jwtVerify`, consultar a tabela (cache 60s em memória). Endpoint `POST /admin/sessions/revoke` (admin-only) para revogar por `sub`.

**Resultado Esperado**
> Token de admin desligado pode ser killed em ≤60s.

**Métricas de sucesso**
- tempo p/ matar token comprometido: até 1h+7d → ≤60s

**Risco de não fazer**
> insider desligado com poder de mutação até `exp`.

**Dependências**: alinhar com migração para SSO institucional.

---

### [testability-6] Determinizar o tempo: injetar clock no memo de borderôs e nos defaults de data

**QA**: Testability · [CROSS: Modifiability]
**Tactic alvo**: Limit Non-Determinism
**Esforço**: S
**Findings**: F-testability-6

**Problema**
> O memo de 30s de `fetchBorderos` lê `Date.now()` direto e guarda estado em variável de módulo. Em teste, leak entre suites + impossibilidade de simular expiração sem `jest.useFakeTimers`. O backend repete o pattern em `routes/permutas.ts:78`.

**Melhoria Proposta**
> Duas opções: 1. (mínima) Adotar `jest.useFakeTimers` + `beforeEach(() => invalidarBorderosMemo())`. 2. (recomendada) Extrair `now: () => number` como parâmetro injetável; helper `clockNow()` no BE (resolver via tsyringe).

**Resultado Esperado**
> 5 reads de tempo no source → 0 leituras diretas; 0 `useFakeTimers` → 1+ teste do TTL determinístico.

**Métricas de sucesso**
- `grep -nE 'Date\.now\(\)|new Date\(\)'` (3 arquivos): 5 → 0
- `grep -rln useFakeTimers __tests__`: 0 → ≥ 1

**Risco de não fazer**
> testes do memo serão flakey ou impossíveis; cross-test pollution.

**Dependências**: coordenar com Modifiability sobre `ClockProvider`.

---

### [testability-7] Cobrir o caminho `todasInvoices` do `IngestaoPermutasService.toInvoiceRows` (universo completo)

**QA**: Testability
**Tactic alvo**: Executable Assertions
**Esforço**: S
**Findings**: F-testability-7

**Problema**
> A regra 2026-06-24 estendeu a ingestão para incluir TODAS as invoices finalizadas. O `toInvoiceRows` ganhou um segundo loop com early-return "não sobrescrever a casada". Zero asserção sobre esse ramo.

**Melhoria Proposta**
> Adicionar 2 it em `IngestaoPermutasService.test.ts`: (a) `computeCandidatas` retorna `todasInvoices` com uma invoice avulsa — assertion: `upsertInvoices` recebe a invoice avulsa COM `importador` resolvido; (b) `todasInvoices` traz uma invoice que TAMBÉM está casada — assertion: a versão casada vence (early-return).

**Resultado Esperado**
> Cobertura do ramo `todasInvoices` 0 → 2 branches; `IngestaoPermutasService.test.ts` ganha 2 it.

**Métricas de sucesso**
- `grep -c todasInvoices IngestaoPermutasService.test.ts`: 0 → ≥ 2

**Risco de não fazer**
> refator do early-return esconde/duplica invoice; tela de Permutas Manuais perde caso esperado.

**Dependências**: Nenhuma

---

## P3 — Baixo (8 cards)

---

### [availability-4] Expor idade do cache `permuta_bordero` na resposta REST e na UI

**QA**: Availability
**Tactic alvo**: Detect Faults — Timestamp
**Esforço**: S
**Findings**: F-availability-4

**Problema**
> A coluna `atualizado_em` existe na `permuta_bordero` mas não é selecionada no `listBorderoCache`, nem propagada para o payload de `GET /permutas/borderos`. Se o cron falhar por 24h, o cache vira fóssil silencioso.

**Melhoria Proposta**
> Selecionar `MAX(atualizado_em)` no `listBorderoCache` e devolver no payload (`{ borderos, cacheUpdatedAt, geradoEm, requestId }`). Frontend mostra badge "Atualizado há Xmin"; se > 1h, badge fica laranja.

**Resultado Esperado**
> Staleness explícito. Operador detecta cache podre antes de tomar decisão.

**Métricas de sucesso**
- Tempo até detectar cron parado: 24h+ → ≤ 1h

**Risco de não fazer**
> decisão financeira tomada em cima de cache de dias atrás.

**Dependências**: Nenhuma; coluna já existe.

---

### [availability-6] Trocar memo per-tab por broadcast (BroadcastChannel) ou polling curto após write

**QA**: Availability
**Tactic alvo**: State Resynchronization
**Esforço**: S (BroadcastChannel) · M (Realtime)
**Findings**: F-availability-6

**Problema**
> `borderosMemo` é module-scoped no browser: após Usuário-A excluir um borderô, o cache server volta limpo, mas Usuário-B só vê quando o memo TTL (30s) expirar. Janela de 30s onde B vê dado morto.

**Melhoria Proposta**
> Curto-prazo: `BroadcastChannel('permutas-borderos')` no `invalidarBorderosMemo`. Mitigação completa: WebSocket (Supabase Realtime já está no stack).

**Resultado Esperado**
> Janela de inconsistência inter-usuário: 30s → ≤ 5s.

**Métricas de sucesso**
- Janela máx. de inconsistência inter-aba: 30s → ≤ 1s (mesma aba via BroadcastChannel)

**Risco de não fazer**
> erro 403/404 ocasional na UX; mitigado pelo guard `requireOwnBorderoFilCod` no backend.

**Dependências**: Nenhuma

---

### [deployability-5] Workflow de drift detection entre `render.yaml` e dashboard

**QA**: Deployability
**Tactic alvo**: Drift Detection
**Esforço**: M
**Findings**: F-deployability-5

**Problema**
> A v0.6.1 resolveu o caso específico de `CONEXOS_*` (`sync:false`), mas não há detecção automatizada para futuras divergências.

**Melhoria Proposta**
> Workflow GitHub Actions semanal que via Render API: (1) lista envs do serviço; (2) compara com a lista de chaves declaradas em `render.yaml`; (3) alerta no Slack/issue para diff.

**Resultado Esperado**
> Diff render.yaml↔dashboard detectado dentro de 1 semana.

**Métricas de sucesso**
- MTTD env drift: dias-a-semanas → ≤7d

**Risco de não fazer**
> env não-sincronizada quebra deploy futuro silenciosamente.

**Dependências**: token Render API; decisão sobre canal de alerta.

---

### [deployability-6] Pre-commit gate de bump de versão consistente FE+BE

**QA**: Deployability
**Tactic alvo**: Script Deployment Commands
**Esforço**: S
**Findings**: F-deployability-6

**Problema**
> O bump FE+BE 0.6.1→0.7.0 deste PR está consistente, mas é executado manualmente. Esquecimento humano = FE em 0.7.0 e BE em 0.6.1.

**Melhoria Proposta**
> Adicionar step `check-version-lockstep` ao job `backend`/`frontend` do CI: comparar `src/backend/package.json#version` com `src/frontend/package.json#version`, falhar se diferentes.

**Resultado Esperado**
> Push com versões divergentes é rejeitado no CI antes do merge.

**Métricas de sucesso**
- drift FE↔BE version: possível → impossível (CI gate)

**Risco de não fazer**
> release "fantasma" com FE/BE em versões diferentes.

**Dependências**: Nenhuma

---

### [integrability-5] Consolidar constantes wire Conexos em `client/permutas/conexosWireConstants.ts`

**QA**: Integrability
**Tactic alvo**: Encapsulate
**Esforço**: S
**Findings**: F-integrability-5

**Problema**
> `TPD_PROFORMA` e `VLD_STATUS_FINALIZADO` existem em 2 arquivos (`ConexosClient.ts` e `permutas/conexosPermutasConstants.ts`). Refactor wire = ≥2 file-touches.

**Melhoria Proposta**
> Mover TODAS as constantes wire (`TPD_PROFORMA=99`, `TPD_INVOICE=128`, `VLD_STATUS_FINALIZADO=['3']`, `TPD_IMPLANTACAO_SALDO=143`, `GER_*`) para `client/conexos/wireConstants.ts`.

**Resultado Esperado**
> 1 lugar para mudar o ID de FINALIZADO/PROFORMA/INVOICE.

**Métricas de sucesso**
- Fontes de `VLD_STATUS_FINALIZADO`: 2 → 1
- Fontes de `TPD_PROFORMA`: 2 → 1

**Risco de não fazer**
> bug por inconsistência num upgrade futuro.

**Dependências**: Nenhuma

---

### [integrability-6] Quantificar e capar fan-out de `listInvoicesFinalizadas + imp021 + com308` na ingestão

**QA**: Integrability · [CROSS: Performance]
**Tactic alvo**: Manage Resources / Observability
**Esforço**: M
**Findings**: F-integrability-6

**Problema**
> A regra 2026-06-24 ("universo COMPLETO de invoices finalizadas") faz a ingestão chamar `listInvoicesFinalizadas` (paginado) + `listProcessos` + 1× `listTitulosAPagar` por invoice — sem upper bound observável.

**Melhoria Proposta**
> (1) Propagar `capHit` de `listInvoicesFinalizadas` para a ingestão. (2) Adicionar métrica `invoicesHidratadasPerRun` no `FLOW_COMPLETE`. (3) Avaliar janela incremental ("invoices abertas nos últimos 12 meses").

**Resultado Esperado**
> Ingestão com tamanho de fan-out conhecido; alertas se cap-hit.

**Métricas de sucesso**
- `capHit` propagado: ❌ → log estruturado
- Métrica de fan-out total por run: nenhuma → instrumentada

**Risco de não fazer**
> ingestão diária estourando lock window à medida que o backlog cresce.

**Dependências**: alinha com Performance (mesma observação).

---

### [modifiability-7] Externalizar constantes de paginação/cache de borderôs

**QA**: Modifiability
**Tactic alvo**: Configuration files / Defer Binding
**Esforço**: S
**Findings**: F-modifiability-4 (parcial)

**Problema**
> `limit=500` (default da listagem), `pageSize=1000` (refresh por filial), `Math.min(limit, 20000)` (sanity), `BORDEROS_MEMO_TTL=30_000` ms (frontend) — todas literais.

**Melhoria Proposta**
> Mover para `EnvironmentProvider` (BE) e `lib/config.ts` (FE) com defaults nomeados (`BORDERO_DEFAULT_LIMIT`, `BORDERO_REFRESH_PAGE_SIZE`, `BORDERO_LIMIT_MAX`, `BORDEROS_MEMO_TTL_MS`).

**Resultado Esperado**
> Magic numbers de paginação/cache: 4 → 0. TTL ajustável via env.

**Métricas de sucesso**
- Magic numbers de paginação/cache: 4 → 0
- Vars de env documentadas: +4

**Risco de não fazer**
> dor mínima hoje; cresce se houver instâncias multi-tenant com volumes muito diferentes.

**Dependências**: Nenhuma

---

### [performance-7] Stale-while-revalidate para `/permutas/borderos` (memo curto → SWR)

**QA**: Performance
**Tactic alvo**: Maintain Multiple Copies of Data · Reduce Overhead
**Esforço**: S
**Findings**: F-performance-4 (complementar)

**Problema**
> Memo simples de 30s no front: depois de 30s, ao trocar de aba o usuário aguarda fresh fetch (~0,83s cold). UX poderia mostrar imediatamente o stale e revalidar em background.

**Melhoria Proposta**
> Substituir o memo no `lib/api.ts:272-292` por padrão SWR: retornar `borderosMemo.data` mesmo expirado, disparar fetch em background, atualizar o estado quando voltar.

**Resultado Esperado**
> Reabertura de aba percebida sempre instantânea (< 50ms) mesmo após o memo expirar.

**Métricas de sucesso**
- Latência percebida ao reabrir aba: 0,47s → ≤ 50ms

**Risco de não fazer**
> micro-UX. Sem impacto operacional.

**Dependências**: Nenhuma

---
```

---

## Sumário (≤300 palavras)

**Caminhos dos artefatos** (gerar manualmente — sandbox bloqueou Write):
- `/Users/rizzi26/Documents/GitHub/pessoal/clonex/financeiro/docs/regis-review/2026-06-24-2011/REPORT.md`
- `/Users/rizzi26/Documents/GitHub/pessoal/clonex/financeiro/docs/regis-review/2026-06-24-2011/KANBAN.md`

**Overall score**: **6.5/10** (média ponderada — Security 1.5, Fault Tolerance 1.3, Availability/Modifiability 1.2, Test/Perf 1.0, Integ/Deploy 0.9).

| QA | Score | P0 | P1 | P2 | P3 |
|---|---|---|---|---|---|
| Availability | 7.0 | 0 | 1 | 3 | 2 |
| Deployability | 7.5 | 0 | 2 | 2 | 2 |
| Integrability | 7.0 | 0 | 2 | 2 | 2 |
| Modifiability | 5.5 | 0 | 3 | 3 | 1 |
| Performance | 5.0 | 0 | 2 | 4 | 1 |
| Fault Tolerance | 6.5 | 1 | 5 | 1 | 0 |
| Security | 7.5 | 0 | 2 | 4 | 0 |
| Testability | 6.0 | 2 | 3 | 2 | 0 |

**Totais**: 52 cards (P0=3, P1=20, P2=21, P3=8).

**Top 3 riscos consolidados**:
1. **R-1** — `DELETE /borderos/:borCod/trilha` permite dupla-baixa real no fin010 (botão FE removido, endpoint vivo). `fault-tolerance-1` + `security-2`.
2. **R-2** — `AlocacaoPermutasService.autoAlocar*` (escrita real no fin010) sem 1 teste direto + sem transação envolvendo N writes + retorno `boolean` ambíguo. `testability-1` + `availability-2` + `fault-tolerance-3/4`.
3. **R-3** — 3 leituras novas (`/borderos`, `/borderos/:borCod/baixas`, `/status`) sem `requireRole` vazam backlog financeiro completo a qualquer JWT autenticado. `security-1`.

**Merge-readiness**: **BLOQUEADO**. 3 P0 + 2 P1 críticos requerem ~1 sprint (5 dias úteis) de 1 dev focado: `fault-tolerance-1` (S) → `testability-1`+`testability-2` (S+S) → `availability-2`+`fault-tolerance-3` (M+M).

**Frase-chamada para o usuário**: "PR v0.7.0 traz 10 acertos arquiteturais sólidos (DDD íntegro, anti-super-pagamento, write-ahead, `requireOwnBorderoFilCod`), mas movimenta dinheiro com 3 P0 + 2 P1 críticos concentrados na auto-alocação automática e no `DELETE /trilha`. Bloqueio para merge é técnico e desbloqueável em 1 sprint."
agentId: ae00a6c1f086a4a1e (use SendMessage with to: 'ae00a6c1f086a4a1e' to continue this agent)
<usage>subagent_tokens: 208861
tool_uses: 11
duration_ms: 782624</usage>
