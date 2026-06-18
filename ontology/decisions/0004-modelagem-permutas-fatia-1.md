---
adr_number: 0004
title: Primeira modelagem da Frente I (Permutas) — Fatia 1 (painel de elegíveis, READ-ONLY)
date: 2026-06-17
status: accepted
type: addition
related_entities: [Adiantamento, Invoice, DeclaracaoImportacao, VariacaoCambial, PermutaCandidata]
---

# ADR 0004: Primeira modelagem da Frente I (Permutas) — Fatia 1

**Cliente:** Columbia Trading (`priCod=1153`) · **Entrega:** Kavex (created by Clonex)
**Relacionado:** ADR-0002 (propósito), ADR-0003 (poda do legado de fechamento), migration-debt O1/O3
**Fonte:** `ontology/_inbox/permutas-painel-elegiveis-interview.md`

## Contexto

O domínio financeiro estava **vazio por design** (migration-debt O1): `ontology/entities/`,
`actions/`, `business-rules/`, `state-machines/`, `integrations/` só com `.gitkeep`. Esta é a
**primeira `/feature-new` da Frente I** — Fatia 1: "painel de pendências elegíveis de permuta",
**READ-ONLY**. Ela introduz o esqueleto estável do domínio de Permutas.

## Decisão

### 1. Modelar a **candidata**, não a permuta consumada
Modelamos `PermutaCandidata` (pendência elegível, derivada, não persistida no ERP). A entidade
`Permuta` **consumada** (baixa em `fin010`, Etapa 6) **NÃO** nasce aqui — pertence à **Fatia 2**,
que exige o caminho de **escrita no ERP** ainda inexistente/não-validado (risco arquitetural #1,
ADR-0002/0003 O3). Modelar a `Permuta` consumada agora seria modelar uma entidade sem caminho de
execução.

### 2. Re-introduzir o lado-leitura de D.I/DUIMP podado no ADR-0003
O ADR-0003 podou os reads de D.I/DUIMP (`listDiByProcess`, `getDiPlanilhaTaxa`,
`listDuimpByProcess`, `getDuimpTaxa`) por serem **só-fechamento sem reuso**. A Fatia 1 precisa da
**existência (XOR)** e da **data-base** dessas declarações (Gate 4 + data-base do borderô). Esta
modelagem **re-introduz** o read de `imp019` (D.I) e `imp223` (DUIMP), **com escopo restrito** à
data-base e à existência — **não** os campos de taxa/variação do fechamento. O ADR-0003 previu
explicitamente que "a decisão final de quais reads sobrevivem cabe à 1ª `/feature-new` de cada
frente" — esta é essa decisão para Permutas.

### 3. Esqueleto sim, regras de negócio bloqueadas
Modelamos o **esqueleto** (entidades, ações, estados, contratos), mas **não inventamos** três
regras de negócio cuja resposta cabe ao Yuri:
- **P0-1** — regra canônica + fórmula juros/desconto → `business-rules/classificacao-juros-desconto.md` (STUB, registra as duas heurísticas conflitantes do PDF como pergunta).
- **P0-3** — filtro wire "Adiantamento = SIM" → ação `elegerAdiantamentos` + integração `conexos`.
- **P0-4** — nome do campo wire da data-base (`imp019`/`imp223`) → entidade `DeclaracaoImportacao` + ação `avaliarElegibilidade`.
- **P0-6** (INVOICE casada), **P0-7** (cadência/rate-limit), **P0-8** (âncora do aging) também marcados `blocked-by`.

### 4. Bump da ontologia: 0.1.0 → 0.2.0
Mudança não-trivial (5 entidades, 5 ações, 1 máquina de estado, 4 regras, 1 integração novas).

## Consequências

- O domínio de Permutas tem esqueleto estável; `_index.json`/`_coverage.json` saem do zero.
- Os **6 P0** continuam abertos no interview — o `TaskScoper` **não fecha** os critérios das
  ações de cálculo/eleição/data-base/casamento/aging até o Yuri responder.
- `migration-debt O3` atualizado: D.I/DUIMP **re-introduzidos** no horizonte de leitura (escopo
  data-base/existência), com o campo wire `blocked-by: P0-4`.

## Alternativas consideradas

- **Modelar `Permuta` consumada já:** rejeitada — sem caminho de escrita validado (O3); Fatia 2.
- **Chutar a fórmula juros/desconto / o campo data-base / o filtro Adiantamento=SIM:** rejeitada —
  viola a regra dura do interview e poluiria a ontologia com regra volátil/incorreta. Stub + `blocked-by`.
- **Tratar os IDs Columbia como universais:** rejeitada — `tpdCod`/`gerNum` são valores de tenant
  (P6); a **estrutura** vai na ontologia, os **valores** ficam como constantes tipadas recalibráveis.

---

## Addendum (2026-06-17) — respostas dos gaps P0 (Yuri) · ontologia v0.2.1

Yuri respondeu os gaps P0; as regras reais foram **encodadas** nos artefatos (não mais stubs/`blocked-by`),
exceto P0-4 que vira probe. Nenhuma decisão estrutural anterior foi revertida.

### Regra canônica de juros vs desconto (P0-1 + P1-2)

A classificação é por **comparação de TAXA de câmbio**, **não** de valor — o mesmo principal em
moeda estrangeira é revalorizado em duas taxas:

```
delta = principalMoeda × (taxaInvoice − taxaAdiantamento)
delta > 0 (taxaInvoice > taxaAdiantamento) → JUROS    = delta   → conta 131 (VAR. CAMBIAL PASSIVA REALIZADA)
delta < 0 (taxaInvoice < taxaAdiantamento) → DESCONTO = |delta| → conta 130 (VAR. CAMBIAL ATIVA REALIZADA)
delta = 0 → sem juros/desconto
```

- A **heurística de valor** do PDF ("adiantamento>invoice→juros") foi **superada** pela regra de
  TAXA (nota histórica preservada em `business-rules/classificacao-juros-desconto.md`).
- **P1-2 resolvido junto:** 131=passiva=juros / 130=ativa=desconto.
- Fontes: `taxaAdiantamento`/`taxaInvoice` ← `TituloAPagar.taxa` (`titFltTaxaMneg`); `principalMoeda`
  ← `titMnyValorMneg` via `com308`. Confirmação doc→taxa = **build-probe** (não-P0).

### Demais respostas

- **P0-3 (RESOLVIDO):** eleição = `listFinanceiroAPagar(PROFORMA)` + filtro booleano `adiantamento=SIM`
  (3 filtros, Plano Financeiro vazio; screenshot). Caminho `tpdCod=143`/`gerNum=198` **descartado**.
  Literal da chave wire = **build-probe** (`adiantamento#EQ:'S'` a confirmar).
- **P0-6 + P0-5 (RESOLVIDO):** "casada" = **1 invoice FINALIZADA**; 0 → `bloqueada`(`sem-invoice`),
  >1/N:M → `bloqueada`(`composto-nm`). **Fatia 1 só 1:1**; N:M (frequente) → **backlog**. Taxonomia
  de motivos adicionada à `BLOQUEADA`: `composto-nm`, `sem-invoice`, `multiplas-invoices`,
  `falha-gate`, `data-base-indisponivel`. `PermutaCandidata` mantém shape **1:1**.
- **P0-7 (RESOLVIDO):** query lista **todas** via os 3 filtros, depois elege; sem janela incremental;
  multi-filial; rate-limit = nota de implementação.
- **P0-8 (RESOLVIDO):** aging conta da **data-base** (CI da D.I / desembaraço da DUIMP). Coluna aging
  **gated no probe P0-4** (regra definida, leitura do campo pendente).

### P0-4 — único gap aberto (vira probe de diagnóstico)

Yuri não sabe os nomes dos campos wire da data CI (`imp019`) e da data de desembaraço (`imp223`).
`DeclaracaoImportacao.dataBase` permanece **declarada** com leitura `blocked-by: P0-4`. **Gate 4 valida
existência/XOR** independentemente; a **extração** da data fica pendente do probe. P0-4 é o **único**
gap P0 ainda aberto.

### Consequência de versionamento

Ontologia patch **0.2.0 → 0.2.1** (regras encodadas, 2 stubs promovidos a draft; sem entidade/ação nova).
