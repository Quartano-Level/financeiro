# Ontologia Financeiro — Changelog

> Versão **da ontologia** (domínio/regras). NÃO confundir com a versão **do app**
> (`/CHANGELOG.md` na raiz, FE+BE lockstep). Conceitos separados, cadências próprias.

## v0.2.1 (2026-06-17) — respostas dos gaps P0 (Yuri) encodadas

Feature: `permutas-painel-elegiveis`. Yuri respondeu os gaps P0; addendum ao ADR-0004.

- **P0-1 (juros vs desconto) — RESOLVIDO.** Regra canônica = **comparação de TAXA de câmbio**
  (não de valor): `delta = principalMoeda × (taxaInvoice − taxaAdiantamento)`. `delta>0` → **JUROS**
  (conta **131**, passiva); `delta<0` → **DESCONTO** (conta **130**, ativa). Heurística de valor do
  PDF **superada** (nota histórica mantida). `classificacao-juros-desconto` saiu de **STUB → draft**;
  `VariacaoCambial`/`calcularVariacaoCambial` desbloqueados. **Resolve também P1-2.**
- **P0-3 (filtro "Adiantamento=SIM") — RESOLVIDO.** Eleição = `listFinanceiroAPagar(PROFORMA)`
  (`tpdCod=99`, `FINALIZADO`) **+ filtro booleano `adiantamento=SIM`** (3 filtros + Plano
  Financeiro vazio, por screenshot). Caminho `tpdCod=143`/`gerNum=198` **descartado**. Literal da
  chave wire = **build-probe**.
- **P0-6 + P0-5 — RESOLVIDO.** "INVOICE casada" = **exatamente 1 invoice FINALIZADA** no processo.
  **Fatia 1 só 1:1**; **N:M** (frequente) → **backlog** (`bloqueada`/`composto-nm`). `PermutaCandidata`
  mantém shape 1:1. Taxonomia de motivos adicionada ao estado `bloqueada`: `composto-nm`,
  `sem-invoice`, `multiplas-invoices`, `falha-gate`, `data-base-indisponivel`.
- **P0-7 — RESOLVIDO.** Query lista **TODAS** via os 3 filtros, depois elege; **sem janela
  incremental**; **multi-filial**; rate-limit = nota de implementação.
- **P0-8 — RESOLVIDO.** Aging conta da **DATA-BASE** (CI da D.I `imp019` / desembaraço da DUIMP
  `imp223`). `aging-anchor` saiu de **STUB → draft**. **Coluna aging gated no probe P0-4.**
- **P0-4 — CONTINUA ABERTO (único).** Vira **probe de diagnóstico**: nomes dos campos wire da
  data-base não conhecidos. Gate 4 valida existência/XOR hoje; a **extração** da data fica pendente.
- Stubs: **2 → 0** (ambas business-rules promovidas a draft). P0 abertos: **6 → 1** (só P0-4).

## v0.2.0 (2026-06-17) — primeira modelagem da Frente I (Permutas, Fatia 1)

Feature: `permutas-painel-elegiveis` (painel de pendências elegíveis, READ-ONLY). ADR-0004.

- **Entidades (5):** `Adiantamento`, `Invoice`, `DeclaracaoImportacao`, `VariacaoCambial`,
  `PermutaCandidata`. A `Permuta` **consumada** (escrita `fin010`) **não** nasce aqui — é Fatia 2.
- **Ações (5):** `elegerAdiantamentos`, `avaliarElegibilidade` (4 gates), `casarInvoice`,
  `calcularVariacaoCambial`, `exporNoPainel`. Todas leitura/cálculo (zero escrita, I4).
- **Máquina de estado (1):** `elegibilidade-permuta-candidata` (`descoberta → elegivel | bloqueada`;
  `executada` é Fatia 2, fora de escopo).
- **Business-rules (4):** `elegibilidade-permuta` (I3), `di-xor-duimp` (I2), e dois **STUBs**
  bloqueados — `classificacao-juros-desconto` (`P0-1`, registra as 2 heurísticas do PDF sem chutar
  fórmula) e `aging-anchor` (`P0-8`).
- **Integração (1):** `conexos` lado-LEITURA (`com298`, `imp019`/`imp223`, `com308`); `fin010`
  (escrita) explicitamente fora de escopo. Re-introduz reads D.I/DUIMP podados no ADR-0003 (O3).
- **6 gaps P0 abertos** no interview — `TaskScoper` não fecha critérios de cálculo/eleição/data-base/
  casamento/aging até o Yuri responder (P0-1, P0-3, P0-4, P0-6, P0-7, P0-8).

## v0.1.0 (2026-06-10) — bootstrap

- Estrutura criada a partir do template `fechamento-processos` (v0.10.2).
- Carregado apenas o **charter** (P1-P7 / I1-I6), a estrutura de pastas e o design profile.
- Domínio **vazio por design**: entidades, ações, regras, integrações, ui-flows e workflows
  serão modelados incrementalmente via o pipeline (`/feature-new`).
- `_index.json` / `_coverage.json` zerados.

## Roadmap (pós-bootstrap)

1. `/feature-new` da primeira entidade do domínio financeiro (interview profundo, 4 axes).
2. (Re)documentar o contrato da integração Conexos em `ontology/integrations/conexos.md`
   — o código (`ConexosClient`) já está conectado; a ontologia está vazia.
