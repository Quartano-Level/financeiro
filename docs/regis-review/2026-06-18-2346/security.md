---
qa: Security
qa_slug: security
run_id: 2026-06-18-2346
agent: qa-security
generated_at: 2026-06-19T00:00:00-03:00
scope: backend+frontend (scoped to "já permutado")
score: 8
findings_count: 2
cards_count: 1
---

# Security — Regis-Review

## 1. Cenário Geral (Bass General Scenario aplicado ao financeiro)

| Source | Stimulus | Artifact | Environment | Response | Response Measure |
|---|---|---|---|---|---|
| Conexos ERP (sistema externo, parcialmente confiável) | Resposta de `GET /com298/{docCod}` com campo `mnyTitPermuta` com tipo/valor inesperado (string com whitespace, `NaN`, negativo, payload malformado) | `ConexosClient.extractPermutaFromDetail` → `ElegibilidadeService.deriveMotivoBloqueio` → frontend badge "Já permutado" | Operação normal (analista decidindo sobre adiantamento) | Validar input no boundary (`parseOptionalNumber` derruba não-finito; `Number.isFinite` guard) e renderizar via React (auto-escape) + `formatNumber` | 0 propagação de valor inválido para a regra `JA_PERMUTADO`; 0 XSS via tooltip; 0 quebra de invariante (motivo `JA_PERMUTADO` exige `valorPermutado > 0`). |

A fatia "já permutado" não adiciona endpoint, não toca SQL, não introduz novo secret, não muda authz. O risco residual é estritamente de **input validation** em um campo numérico já vindo de fonte parcialmente confiável (Conexos), e o tratamento existente (`parseOptionalNumber` + render React) é defensivo.

## 2. Métricas observadas

| Métrica | Valor atual | Alvo | Status | Fonte |
|---|---|---|---|---|
| Hardcoded secrets em arquivos no escopo | 0 | 0 | ✅ | `grep -rEn "(password\|secret\|token\|api[_-]?key)\s*[:=]\s*['\"][^'\"]{8,}"` em `service/permutas`, `ConexosClient.ts`, `frontend/app/permutas` |
| Novas queries SQL introduzidas pela mudança | 0 | 0 (zero string-interpolated) | ✅ | Diff stat `_shared-metrics.md` (sem migração, sem repositório novo) |
| Endpoints novos sem authorizer | 0 (zero endpoints novos) | 0 | ✅ | Diff stat — feature reusa endpoints existentes |
| `dangerouslySetInnerHTML` / `innerHTML` no escopo frontend | 0 | 0 | ✅ | `grep -rn "dangerouslySetInnerHTML\|innerHTML" src/frontend/app/permutas` |
| Input validation no boundary externo (Conexos→domínio) | `parseOptionalNumber` (rejeita `null`/`''`/`NaN`/`Infinity`) + Zod `com298RowSchema.parse` no list | 100% campos numéricos novos passam por guard | ✅ | `ConexosClient.ts:1275-1279` (`parseOptionalNumber`); `ConexosClient.ts:633,699` (Zod); `ConexosClient.ts:944-946` (extração) |
| Validação de invariante de domínio (motivo `JA_PERMUTADO` ⇒ `valorPermutado > 0`) | Coberto por testes (`ElegibilidadeService.test.ts:80-124`) | Coberto | ✅ | `ElegibilidadeService.ts:152-153`; testes positivos+negativos |
| Renderização do valor numérico no FE com auto-escape | React JSX + `formatNumber()` (numérico, sem HTML) | Sem sink HTML | ✅ | `frontend/app/permutas/page.tsx:73-82,122-128` |
| Logging acidental de credenciais introduzido pela mudança | 0 | 0 | ✅ | Diff stat — sem mudança no path de secret |
| Cobertura de tactics Bass tocadas pelo delta | Validate Input, Audit Trail (parcial via logs), Limit Exposure (sem nova superfície) | — | ✅ | Seção 3 |
| `npm audit` profundo | ⚠️ Não medível (`--quick`) — pular por escopo | — | ⚠️ | `_shared-metrics.md` |

> ⚠️ **Não medível neste escopo**: dependency CVEs (`npm audit`) — pulado por `--quick`. Será coberto no próximo `--full`. A mudança não adiciona dependências novas (apenas tipos/labels).

## 3. Tactics — Cobertura no financeiro (escopo da fatia)

| Tactic (Bass) | Implementação atual | Status | Evidência |
|---|---|---|---|
| Detect Intrusion | Fora de escopo (não há novo path de login/API público); CloudTrail/GuardDuty pertencem ao alvo Terraform | N/A | sem código novo de auth/perímetro |
| Detect Service Denial | Sem novo endpoint; idem | N/A | — |
| Verify Message Integrity | Resposta Conexos validada via Zod (list) + guard numérico (detail) | ✅ presente | `ConexosClient.ts:633,699`; `ConexosClient.ts:944-946` |
| Detect Message Delay | Fora de escopo da fatia | N/A | — |
| Identify Actors | Sem mudança de identidade (path de auth intocado) | N/A | — |
| Authenticate Actors | Sem novo endpoint/path | N/A | — |
| Authorize Actors | Sem novo endpoint; regra `JA_PERMUTADO` é determinismo de domínio, não authz | N/A | — |
| Limit Access | Backend não expõe Conexos cred ao FE; novo campo `valorPermutado` é número derivado, não credencial | ✅ presente | `extractPermutaFromDetail` retorna apenas `{ valorPermutar?, pago?, valorPermutado? }` |
| Limit Exposure | Nenhuma nova superfície (endpoint/handler/secret). Blast-radius do delta = uma badge no FE | ✅ presente | Diff stat `_shared-metrics.md` |
| Encrypt Data | N/A — valor é numérico em-trânsito sobre o canal existente | N/A | — |
| Separate Entities | Estado-alvo (conta AWS por tenant) — fatia não regride a separação | ✅ presente (sem regressão) | — |
| Change Default Settings | N/A | N/A | — |
| **Validate Input** | `parseOptionalNumber` (`ConexosClient.ts:1275-1279`) derruba `null`/`''`/`NaN`/`Infinity`; Zod no list (`com298RowSchema.parse`); domínio só atribui se `!== undefined` | ✅ presente | `ConexosClient.ts:944-951`; `EleicaoPermutasService.ts:489-492`; `ElegibilidadeService.ts:152-153` |
| Revoke Access | N/A (sem mudança em sessão/token) | N/A | — |
| Lock Computer | N/A | N/A | — |
| Inform Actors | Badge "Já permutado" informa o analista do estado concluído (sinaliza no FE) | ✅ presente | `frontend/app/permutas/page.tsx:73-82` |
| Restore | N/A (sem mudança de estado persistido) | N/A | — |
| Audit Trail | Mudança não introduz ação de domínio nova (apenas refina motivo de bloqueio classificatório, sem write-back ao Conexos). Audit trail de write financeiro segue como débito do alvo (cross-ref Fault Tolerance) | ⚠️ parcial | `EleicaoPermutasService.ts:461-492` (decisão registrada no snapshot in-memory) |

## 4. Findings

### F-security-1: Resposta do Conexos no detail é tratada como `Record<string, unknown>` sem schema Zod (detail, especificamente)

- **Severidade**: P3
- **Tactic violada**: Verify Message Integrity (parcial)
- **Localização**: `src/backend/domain/client/ConexosClient.ts:944-946` (uso de `detail.mnyTitPermuta` / `detail.mnyTitPermutar` / `detail.mnyTitAberto` via cast implícito de `Record<string, unknown>`).
- **Evidência (objetiva)**:
  ```
  const valorPermutar = this.parseOptionalNumber(detail.mnyTitPermutar);
  const valorPermutado = this.parseOptionalNumber(detail.mnyTitPermuta);
  const mnyTitAberto = this.parseOptionalNumber(detail.mnyTitAberto);
  ```
  O `list` (`com298/list`) usa `com298RowSchema.parse(row)` (Zod) — o `detail` não. O risco fica todo concentrado em `parseOptionalNumber`, que rejeita não-finito mas **não** detecta payloads estruturalmente quebrados (campo renomeado pelo upstream, payload aninhado inesperado).
- **Impacto técnico**: Se o Conexos renomear o campo no detail (`mnyTitPermuta` → `mny_tit_permuta`), `parseOptionalNumber(undefined) → undefined` silencioso; a fatia "já permutado" deixaria de classificar `JA_PERMUTADO` corretamente sem nenhum log/erro de schema. O comportamento é seguro-em-default (cai para `SEM_SALDO_PERMUTAR`), mas a degradação é silenciosa.
- **Impacto de negócio**: Analista vê adiantamento já permutado classificado erroneamente como "sem saldo a permutar", podendo reabrir tentativa de permuta. Não move dinheiro indevidamente (Gates posteriores ainda bloqueiam), mas gera retrabalho.
- **Métrica de baseline**: 0% dos campos do payload `detail` validados via Zod schema (vs. 100% no `list`).

### F-security-2: Audit trail in-memory do motivo de bloqueio não é persistido

- **Severidade**: P3
- **Tactic violada**: Audit Trail (cross-ref Fault Tolerance)
- **Localização**: `src/backend/domain/service/permutas/EleicaoPermutasService.ts:461-492` (a decisão `JA_PERMUTADO` vs. `SEM_SALDO_PERMUTAR` só vive no snapshot retornado ao FE).
- **Evidência (objetiva)**:
  ```
  // `valorPermutado` (mnyTitPermuta) distingue "já permutado" de "sem
  // ...
  ...(detalhe.valorPermutado !== undefined
      ? { valorPermutado: detalhe.valorPermutado }
  ```
  Sem write a audit log persistido — coerente com estado-atual (sem `audit_log` table, sem CloudTrail por tenant ainda, conforme `migration-debt`).
- **Impacto técnico**: Não há trilha histórica de "quando o adiantamento X foi classificado como JA_PERMUTADO e qual `valorPermutado` lido". Para reconstrução pós-incidente, é preciso correlacionar logs do Conexos.
- **Impacto de negócio**: Em uma auditoria contábil (ou disputa com fornecedor), o time não consegue provar quando o sistema percebeu o saldo zerado, apenas o estado atual do Conexos. Aceitável até o alvo (Terraform + tabela de audit por tenant) materializar.
- **Métrica de baseline**: 0 linhas em tabela `audit_log` (tabela não existe ainda); 0 eventos CloudTrail por tenant (sem Terraform).

## 5. Cards Kanban

### [security-1] Adicionar Zod schema para payload `detail` do Conexos (`com298/{docCod}`)

- **Problema**
  > Hoje o `extractPermutaFromDetail` cast'a o payload como `Record<string, unknown>` e confia em `parseOptionalNumber` em três campos (`mnyTitPermutar`, `mnyTitPermuta`, `mnyTitAberto`). Se o Conexos mudar o nome de um campo, a fatia "já permutado" degrada silenciosamente para `SEM_SALDO_PERMUTAR`, sem erro logado. Já existe precedente no list (`com298RowSchema.parse(row)`) que prova que o esforço é trivial.

- **Melhoria Proposta**
  > Criar `com298DetailSchema` no mesmo módulo do `com298RowSchema`, descrever `mnyTitPermutar?`, `mnyTitPermuta?`, `mnyTitAberto?` com `z.union([z.number(), z.string()]).optional()` (espelhando o que `parseOptionalNumber` aceita) e fazer `safeParse` em `getPermuta` antes de chamar `extractPermutaFromDetail`. Em falha de schema, logar `warn` com `docCod` e prosseguir com `{ valorPermutar: undefined, pago: undefined, valorPermutado: undefined }` (preserva comportamento seguro). Tactic: **Verify Message Integrity**.

- **Resultado Esperado**
  > Mudança de contrato upstream gera `warn` rastreável em vez de degradação silenciosa. Cobertura do payload `detail` por Zod sobe de 0% para 100% dos campos consumidos pela fatia.

- **Tactic alvo**: Verify Message Integrity
- **Severidade**: P3
- **Esforço estimado**: S (≤1d)
- **Findings relacionados**: F-security-1
- **Métricas de sucesso**:
  - % campos do `detail` consumidos validados via Zod: 0% → 100%
  - Eventos `warn` "com298 detail schema mismatch" por dia em produção: instrumentado (alvo: 0)
- **Risco de não fazer**: Mudança não-comunicada do Conexos derruba a distinção `JA_PERMUTADO` vs. `SEM_SALDO_PERMUTAR` sem alarme; analista reabre tentativa de permuta indevida e descobre só no Gate 3.
- **Dependências**: nenhuma — Zod já está no projeto e o `list` já tem schema paralelo.

> F-security-2 (Audit Trail) **não vira card próprio nesta fatia**: é débito conhecido do estado-alvo (rastreado em `ontology/_inbox/migration-debt.md` e pertinente à QA Fault Tolerance). Cross-ref na seção 6.

## 6. Notas do agente

- Escopo intencionalmente restrito à "já permutado": a fatia não adiciona endpoint/SQL/secret/auth-path, então as varreduras de hygiene foram pontuais (apenas nos arquivos tocados) — confirmado 0 hardcoded secrets, 0 `dangerouslySetInnerHTML`, 0 SQL string-interpolation novo.
- A defesa principal contra input lixo do Conexos é `parseOptionalNumber` (rejeita `null`/`''`/`NaN`/`Infinity`) + cast para `Number.isFinite`. Boa, mas estruturalmente cega (F-security-1).
- `npm audit` profundo intencionalmente pulado (`--quick`); a fatia não adiciona dependências.
- **Cross-QA**:
  - F-security-2 (Audit Trail) ↔ Fault Tolerance (audit de transição de estado) e Availability (forense pós-incidente).
  - F-security-1 (Verify Message Integrity) ↔ Integrability (contrato com Conexos) e Fault Tolerance (degradação silenciosa).
  - Limit Exposure ↔ Availability (blast-radius zero adicional nesta fatia).
