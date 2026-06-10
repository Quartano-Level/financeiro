# ADR 0002: Propósito e escopo do repositório `financeiro`

**Data:** 2026-06-10
**Status:** accepted
**Autores:** Yuri (CEO), Claude Code
**Cliente:** Columbia Trading · **Entrega:** Kavex (created by Clonex)
**Fonte canônica:** [`docs/proposta/Proposta_Kavex_Columbia_Financeiro.md`](../../docs/proposta/Proposta_Kavex_Columbia_Financeiro.md) (e `.pdf`)
**Relacionado:** ADR-0001 (bootstrap do template)

## Contexto

O repositório `financeiro` foi bootstrapped do template `fechamento-processos` (ADR-0001) como um
esqueleto rodável **sem domínio**. A proposta comercial Kavex × Columbia Trading (Automação
Financeira) define o **propósito**: automação assistida de três frentes da área Financeira, todas
integradas ao ERP Conexos (mesmo tenant), em modelo de capacidade dedicada + expertise em Comex.

## Decisão

1. **O domínio do repositório é a Automação Financeira da Columbia Trading**, composta por três
   frentes (ver `03_ontologia_financeiro.md`):
   - **I — Permutas** (Adiantamentos ↔ Invoices) → Conexos `fin010`.
   - **II — SISPAG** (Pagamentos) → Conexos `com298` + Nexxera.
   - **III — Popula GED** (NC/ND) → SharePoint + GED.
2. **Princípio human-in-the-loop é invariante de produto:** a solução executa o mecânico e audita;
   o analista decide o que exige julgamento (aprova compostos, finaliza lotes, resolve exceções).
3. **NFRs são invariantes do domínio** (aplicam-se às três frentes): auth corporativa + RBAC,
   multi-filial, auditoria completa, integração Conexos resiliente, observabilidade, padronização.
4. **A proposta em `docs/proposta/` é a fonte canônica de escopo.** Conflitos entre código/ontologia
   e a proposta são resolvidos a favor da proposta (ou geram novo ADR).
5. **Identidade/branding:** a UI e os docs usam **"Columbia Trading / Financeiro"**; Kavex (created by
   Clonex) figura como **fornecedor/autor** (créditos), não como nome de produto na interface.
6. **Este passo é contextualização, não modelagem nem roadmap.** A modelagem formal (entidades,
   ações, regras, máquinas de estado, contratos de integração para Nexxera/GED/SharePoint) e o
   sequenciamento de entrega acontecem via `/feature-new`, frente a frente.

## Consequências

- O repositório deixa de ser "virgem": tem propósito, vocabulário (`ontology/glossary.md`) e narrativa
  de domínio (`03_ontologia_financeiro.md`) — base para o `OntologyCurator` modelar.
- Três integrações **novas** (Nexxera, GED, SharePoint) entram no horizonte; a primeira `/feature-new`
  de cada frente cria seu `ontology/integrations/<nome>.md`. Conexos tem o **lado leitura** integrado em
  código (mesmo tenant); o **lado escrita não existe ainda**.
- ⚠️ **Risco arquitetural #1 (orientação leitura→escrita):** o template foi herdado de um sistema de
  leitura/relatórios; o `ConexosClient` é read-only (sem insert/update/baixa). Permutas (executar na
  `fin010`) e SISPAG (conciliar baixa) exigem um caminho de **escrita no ERP inexistente e não validado**
  — a ser desenhado na primeira `/feature-new` dessas frentes. Ver `_inbox/migration-debt.md` O3.
- **Dependência de terceiro registrada:** a homologação do leiaute bancário (Nexxera) depende do
  cronograma da instituição financeira — condiciona os marcos da Frente II.

## Alternativas consideradas

- **Modelar a ontologia agora (entidades/ações):** rejeitado — modelagem é trabalho do pipeline
  (`/feature-new` + entrevistas), com TDD e gates; antecipá-la aqui pularia o processo.
- **Branding "Kavex" como produto na UI:** rejeitado nesta fase — mantém-se a visão do cliente
  ("Columbia Trading / Financeiro"); Kavex/Clonex como crédito de fornecedor.
