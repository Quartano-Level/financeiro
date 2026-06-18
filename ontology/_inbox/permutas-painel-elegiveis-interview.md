# Interview Transcript — permutas-painel-elegiveis — 2026-06-17

**Mode:** new
**Frente:** I — Permutas (Adiantamentos ↔ Invoices)
**Fatia:** 1 — "Painel de pendências elegíveis de permuta" (READ-ONLY)
**Tenant:** Columbia Trading (mesmo do fechamento-processos; `priCod=1153`, `filCod=2` nos exemplos)
**Worktree:** `/private/tmp/permutas-painel-wt/` · **Branch:** `feat/permutas-painel-elegiveis`
**Anchor (exemplo real do PDF "Processo-Permutas-Adiantamento"):** processo código `2048`,
adiantamento PROFORMA com D.I (`imp019`, "DI = CI" com data) atrelada.

---

## Summary

Esta fatia automatiza as **Etapas 1–5** do processo manual de permutas: lista os adiantamentos
(PROFORMA) em aberto no Conexos `com298`, avalia os **4 gates de elegibilidade** (tipo PROFORMA,
valor a permutar > 0, pagamento TOTALMENTE PAGO, e D.I **XOR** DUIMP atrelada via código do
processo), casa a **INVOICE** finalizada do mesmo processo, calcula a **variação cambial** e
classifica o resultado como **juros** ou **desconto** com **aging** da pendência. O resultado é
exposto num **painel READ-ONLY**, alimentado por um **job diário de eleição** + um **endpoint de
leitura**. A escrita na `fin010` (Etapa 6 — borderô, baixa em BAIXAS PERMUTAS) é **explicitamente
fora de escopo** (Fatia 2). O domínio financeiro ainda **não tem nenhuma entidade modelada** —
esta é a primeira `/feature-new` da Frente I, então ela **cria entidades novas** na ontologia.
O lado-leitura do Conexos já existe quase todo (`ConexosClient`); faltam alguns campos wire
(data-base, filtro "Adiantamento=SIM") que estão registrados como gaps abaixo.

---

## Axis 1 — Entity

Entidades de domínio que esta fatia introduz (a serem formalizadas pela `OntologyCurator`):

| Entidade | Papel | Imutável / Histórico | Fonte de leitura |
|----------|-------|----------------------|------------------|
| **Adiantamento** (PROFORMA) | Lado-débito da permuta; valor pago antecipadamente ao exportador. | `docCod` imutável; `valorPermutar`/`pago` evoluem | `com298` `tpdCod=99` (ou IMPLANTAÇÃO SALDO `tpdCod=143`/`gerNum=198` — **a confirmar qual caminho**, ver Gap P1-A) |
| **Invoice** (Fatura) | Lado-crédito; fatura definitiva do exportador. | `docCod` imutável | `com298` `tpdCod=128` |
| **DeclaracaoImportacao** | Carrega a **data-base** do borderô. Variante D.I (`imp019`, data "CI") **XOR** DUIMP (`imp223`, data de desembaraço). Nunca ambas. | data-base imutável após registro | `imp019/list` (D.I) · `imp223/list` (DUIMP) |
| **VariacaoCambial** | Resultado do cálculo cambial: moeda/valor/taxa negociada → juros ou desconto. | derivada (não persistida nesta fatia) | `TituloAPagar.{taxa,valorNegociado,moedaCod}` via `com308`; `VariacaoCambialService` referenciado |
| **PermutaCandidata** | A pendência elegível em si (adiantamento + invoice casada + variação + aging + estado de elegibilidade). **Ainda NÃO executada** nesta fatia — é uma *candidata*, não uma permuta consumada. | snapshot por execução do job | derivada (composição) |

- **`Permuta` consumada** (a reconciliação na baixa) **NÃO** nasce nesta fatia — vem na Fatia 2
  (escrita `fin010`). Aqui modelamos só a **candidata**.
- `DeclaracaoImportacao` é genuinamente nova ao domínio (apesar de existir leitura D.I/DUIMP da
  feature `taxa-di-duimp`, ela foi **podada** do `ConexosClient` per ADR-0003/migration-debt O3 —
  precisa ser re-introduzida; ver Gap P0-4).
- Convenção de nomes: identificadores em inglês (regra do CLAUDE.md); campos espelho-de-DB em PT-BR
  permitidos (`mnyTitPermutar`, `priCod`).

## Axis 2 — Action

Cadeia de ações da fatia (todas **leitura/cálculo** — zero escrita):

1. **`elegerAdiantamentos`** (job diário) — lista PROFORMA finalizado por processo/filial.
   - Reuso: `ConexosClient.listFinanceiroAPagar({docTip:'PROFORMA'})` (`tpdCod=99`,
     `vldStatus FINALIZADO`). **Falta** o filtro "Adiantamento=SIM" (Gap P0-3).
2. **`avaliarElegibilidade`** — aplica os 4 gates por adiantamento:
   - Gate 1: tipo = PROFORMA. Gate 2: `getMnyTitPermutar(docCod) > 0`. Gate 3: TOTALMENTE PAGO
     (`isPago`/`mnyTitAberto===0`). Gate 4: D.I **XOR** DUIMP atrelada pelo código do processo.
3. **`casarInvoice`** — `listFinanceiroAPagar({docTip:'INVOICE', priCods:[proc]})` (`tpdCod=128`,
   finalizado). Definição de "casada" e tratamento de 0/múltiplas → Gap P0-6.
4. **`calcularVariacaoCambial`** — moeda/valor/taxa negociada; classifica juros vs desconto → Gap P0-1.
5. **`exporNoPainel`** — agrega candidatas com aging para o endpoint de leitura.

- **Preconditions:** sessão Conexos ativa; processo tem PROFORMA finalizado.
- **Postconditions (garantias):** cada candidata exposta tem os 4 gates satisfeitos **E** INVOICE
  casada; pendências sem INVOICE/gate ficam como **"bloqueada"** (reportadas, não contadas como
  falha — vide glossary "Pendência bloqueada").
- **Write-back:** **NENHUM**. Sem escrita em `fin010` nesta fatia (invariante de escopo).
- **Idempotência:** o job é idempotente por design (recomputa o backlog a cada run; sem efeito
  colateral externo). Rodar 2× no mesmo dia produz o mesmo painel. **Auditoria** de cada execução
  é exigida (NFR §5; persistência via Postgres — migration-debt O5).

## Axis 3 — Invariant

Regras que **não podem** ser violadas:

- **I1 — Human-in-the-loop:** a solução só *prepara e expõe*; não decide nada que exija julgamento
  financeiro/comercial. O painel é informativo; a execução (mesmo 1:1) é da Fatia 2.
- **I2 — D.I XOR DUIMP:** sempre exatamente uma, nunca as duas. Adiantamento com ambas ou com
  nenhuma é anomalia (→ bloqueada / exceção, ver Gap P0-4).
- **I3 — Elegibilidade estrita:** só é "elegível" quem passa nos **4 gates** **E** tem **INVOICE
  casada**. Caso contrário → "bloqueada".
- **I4 — Sem escrita:** nada de borderô/baixa/`fin010` nesta fatia (limite de blast radius).
- **I5 — Auditoria:** toda execução do job e leitura sensível é registrada e persistida (quem/quando/o quê).
- **I6 — Multi-filial:** opera sobre todas as filiais (não só `filCod=2`). Cadência/recorte → Gap P0-7.

- **Business rules existentes tocadas:** o repo herda regras de `valor-permutar-ponto-no-tempo`,
  `invoice-permutar-via-baixas`, `exposicao-fifo-saldo-aberto` (referenciadas no `ConexosClient`),
  mas `ontology/business-rules/` está **vazio** (só docs no header). Esta fatia **cria** as
  primeiras regras formais de Permutas.
- **Blast radius se errado:** painel mostra pendência como elegível quando não é → analista
  reconcilia algo indevido na Fatia 2 → baixa errada no ERP / relatório de controladoria
  inconsistente. Mitigado nesta fatia por ser READ-ONLY, mas o **critério de elegibilidade é a
  base de confiança** da Fatia 2 — daí os gaps P0 sobre juros/desconto e data-base serem bloqueantes.

## Axis 4 — Integration

- **Conexos (leitura apenas):** `com298` (PROFORMA/INVOICE, list+detail), `imp019` (D.I),
  `imp223` (DUIMP), `com308` (título a-pagar: taxa/valor negociado). **SEM `fin010`** nesta fatia.
- **Contrato de API:** não muda contrato de escrita (não há). Pode **estender** o `ConexosClient`
  com reads re-introduzidos (D.I data-CI, DUIMP data-desembaraço, filtro Adiantamento=SIM).
- **SSM:** sem novos parâmetros previstos (reusa credencial Conexos existente). A confirmar se o
  job diário exige runtime de scheduler (migration-debt O4 — Express puro não tem job runner; é
  dívida estrutural, mas o **desenho** do scheduler é da camada de infra, não desta entrevista).
- **Persistência (Postgres):** necessária para auditoria + snapshot de backlog/aging
  (migration-debt O5 — Postgres cablado mas sem uso). Modelagem da tabela → TaskScoper/infra.
- **Tenant-specific:** os IDs (`gerNum=198/210/233`, `tpdCod`) são da instalação Columbia
  (`priCod=1153`); manter como constantes tipadas, não hardcode de tenant em service (regra #2).

---

## Gaps abertos (priorizados — Yuri responde aqui)

> **STATUS (2026-06-17, Yuri respondeu):** P0-1, P0-3, P0-6, P0-7, P0-8, P0-5, P1-2 = **RESOLVIDO**.
> **P0-4 = OPEN (vira probe de diagnóstico)** — único gap aberto.
>
> **ATUALIZAÇÃO (2026-06-18, probe de rede dev tenant Columbia, filCod=2, 410 adiantamentos reais):**
> **P0-3 e P0-4 = RESOLVIDO** com evidência empírica real. P0-3: chave wire do filtro adiantamento =
> `docVldTipoAdto=1` (FinDocCab) — o placeholder `adiantamento#EQ:'S'` era um **BUG** (HTTP 500
> `adiantamento (FinDocCab)`, campo inexistente). P0-4: data-base = `cdiDtaCi` (imp019, D.I) /
> `dioDtaDesembaraco` (imp223, DUIMP), ambos epoch-ms; XOR confirmado em dados reais; coluna aging
> agora popula. **Não há mais gap P0 aberto.** **NOVO GAP descoberto pelo probe** (sugestão P1):
> `gate-3-pago-via-detail` — ver seção de gaps abaixo.

### P0 — BLOQUEIAM o avanço (TaskScoper não fecha critérios sem isto)

- **P0-1 — Regra canônica juros vs desconto + fórmula. — ✅ RESOLVIDO (2026-06-17).**
  Regra canônica = **comparação de TAXA de câmbio** (não de valor). Mesmo principal em moeda
  estrangeira revalorizado em duas taxas:
  `delta = principalMoeda × (taxaInvoice − taxaAdiantamento)`.
  `taxaInvoice > taxaAdiantamento` (delta>0) → **JUROS** = `delta` → conta **131** (passiva).
  `taxaInvoice < taxaAdiantamento` (delta<0) → **DESCONTO** = `|delta|` → conta **130** (ativa).
  Taxas iguais → sem juros/desconto. A heurística de **valor** do PDF foi **superada** pela de
  TAXA. **Isto RESOLVE também P1-2** (131=passiva=juros / 130=ativa=desconto). Fonte das taxas:
  `TituloAPagar.taxa` (`titFltTaxaMneg`); principal `titMnyValorMneg` via `com308`
  (build-probe: confirmar doc-fonte). → `classificacao-juros-desconto`, `variacao-cambial`,
  `calcular-variacao-cambial` desbloqueados.

- **P0-3 — Filtro "Adiantamento = SIM". — ✅ RESOLVIDO (chave wire confirmada, probe de rede 2026-06-18).**
  A tela `com298` (FILTROS) tem campo dedicado **"Adiantamento = SIM"**, usado com
  **Tipo=PROFORMA** e **Situação=FINALIZADO** (Plano Financeiro VAZIO). Caminho =
  `listFinanceiroAPagar({docTip:'PROFORMA'})` (`tpdCod=99`, `vldStatus=FINALIZADO`) **+ filtro
  `docVldTipoAdto=1`** (modelo `FinDocCab`). **Chave wire confirmada por probe de rede** (dev tenant
  Columbia, 2026-06-18, `filCod=2`, validado contra **410 adiantamentos reais**): `docVldTipoAdto`
  numérico = `1`. O placeholder anterior (`adiantamento#EQ`/`'S'`) era um **BUG** (HTTP 500
  `adiantamento (FinDocCab)`, campo inexistente). Evidência: PROFORMA com `docVldTipoAdto=1`
  carregam `gerNum=198` (ADTO FORNECEDOR INTERNACIONAIS) e `gcdDesNome="ADIANTAMENTO PROFORMA"`.
  Já plugado em `conexosPermutasConstants.ts`. **NÃO** é `listAdiantamentoFinanceiroAPagar`/`tpdCod=143`/`gerNum=198`
  (path). **Deixa de ser build-probe.**

- **P0-4 — Data-base (D.I e DUIMP) no payload wire. — ✅ RESOLVIDO (probe de rede 2026-06-18).**
  Campos wire confirmados empiricamente (dev tenant Columbia, 2026-06-18, `filCod=2`, validado
  contra **410 adiantamentos reais**): D.I (`imp019`) = **`cdiDtaCi`** (data "CI", epoch-ms;
  acompanha `cdiEspNumci` = nº da CI; confere com o PDF "DI = CI"); DUIMP (`imp223`) =
  **`dioDtaDesembaraco`** (data de desembaraço, epoch-ms). **XOR DI/DUIMP confirmado em dados reais**
  (processo tem uma OU outra). Já plugado em `ConexosClient.mapDeclaracaoDataBase`. A **coluna aging
  agora popula**. Deixa de ser `blocked-by: P0-4`. **Não há mais gap P0 aberto nesta fatia.**

- **P0-6 — Definição de "INVOICE casada". — ✅ RESOLVIDO (2026-06-17).**
  "Casada" = **exatamente 1 invoice FINALIZADA** no processo. **0** → `bloqueada` (`sem-invoice`,
  aguardando emissão). **>1** → `bloqueada` (`composto-nm`, caso N:M → backlog). → `casar-invoice`,
  `elegibilidade-permuta`, `permuta-candidata` desbloqueados.

- **P0-7 — Cadência/escopo da eleição (rate-limit Conexos). — ✅ RESOLVIDO (2026-06-17).**
  A query lista **TODAS** via os 3 filtros (Adiantamento=SIM, Tipo=PROFORMA, Situação=FINALIZADO),
  depois elege. **Sem janela incremental.** **Multi-filial.** Performance/rate-limit (paginate cap
  existente) é **nota de implementação não-bloqueante**. → query-base de `eleger-adiantamentos`.

- **P0-8 — Âncora do aging. — ✅ RESOLVIDO (2026-06-17).**
  Aging conta da **DATA-BASE** = data CI da D.I (`imp019`) **OU** data de desembaraço da DUIMP
  (`imp223`). `aging = hoje − dataBase`. **PORÉM** o campo wire dessa data é o P0-4 → a coluna
  aging fica **gated no probe P0-4** (regra definida, leitura pendente). → `aging-anchor`,
  `expor-no-painel` desbloqueados (com a dependência anotada).

### P1 — Desejáveis (não bloqueiam a Fatia 1, mas moldam a modelagem)

- **P1-2 — Contas 130/131 (mapeamento). — ✅ RESOLVIDO (junto de P0-1, 2026-06-17).**
  **131 VAR.CAMBIAL PASSIVA = JUROS** (taxa subiu) / **130 VAR.CAMBIAL ATIVA = DESCONTO** (taxa
  caiu). PDF rotulava ambas "juros" (typo); a regra de TAXA resolve o mapeamento.

- **gate-3-pago-via-detail — 🔴 NOVO GAP ABERTO (sugestão P1, descoberto no probe de rede 2026-06-18).**
  Nos **410 adiantamentos reais**, o `com298/list` traz `mnyTitAberto=null` / `mnyTitPago=null`, então
  `isPago` retorna **`false` para TODOS** — o **Gate 3 (TOTALMENTE PAGO) bloquearia tudo**. O status
  "TOTALMENTE PAGO" provavelmente mora no **endpoint de detalhe** (modal financeiro do adiantamento),
  igual ao `mnyTitPermutar` (que já é hidratado via `getMnyTitPermutar` detail). **Ação:** confirmar a
  fonte wire do status pago (detail vs list) **antes** de a eleição produzir candidatas elegíveis.
  **Bloqueante** para a feature produzir ALGUMA candidata elegível, mas **NÃO** foi escopo do probe de
  2026-06-18. Também registrado em `permutas-painel-elegiveis-regis-followups.md`.

- **P0/P1-5 — 1:1 vs N:M (composto). — ✅ RESOLVIDO (2026-06-17).**
  Fatia 1 executa **SOMENTE 1:1** (1 PROFORMA ↔ 1 invoice finalizada no processo). Casos **N:M
  EXISTEM e são FREQUENTES**, mas nesta feature vão para **BACKLOG**: `bloqueada` com motivo
  `composto-nm` (reportados, não processados). `PermutaCandidata` mantém **shape 1:1** — N:M não
  modelado agora (fica no watchlist para fatia futura).

---

## entity_changed: true
> Domínio financeiro ainda **sem nenhuma entidade modelada** (`ontology/entities/` vazio,
> migration-debt O1). Esta fatia introduz `Adiantamento`, `Invoice`, `DeclaracaoImportacao`,
> `VariacaoCambial`, `PermutaCandidata` + as primeiras business-rules da Frente I.

## Ontology diff needed: yes
> Novas entidades (5), novas actions (`elegerAdiantamentos`, `avaliarElegibilidade`, `casarInvoice`,
> `calcularVariacaoCambial`, `exporNoPainel`), 1 state/estado de elegibilidade
> (elegível / bloqueada), business-rules de elegibilidade + classificação juros/desconto + aging,
> e a integração `conexos` (lado-leitura: `com298`/`imp019`/`imp223`/`com308`).

## Reason: new entity + new flow (primeira modelagem da Frente I)

---

## Handoff

→ **OntologyCurator** (entity_changed=true): propor o diff das 5 entidades + actions + business-rules
+ integração Conexos (leitura). **NÃO** modelar a regra juros/desconto (P0-1) nem a data-base (P0-4)
até o Yuri responder os gaps — modele o esqueleto e marque esses pontos como `target: fatia-1,
blocked-by: P0-1/P0-4`.
> **ATUALIZAÇÃO (2026-06-17):** Yuri respondeu. P0-1 e os demais (exceto P0-4) **modelados** com
> as regras reais; `classificacao-juros-desconto` e `aging-anchor` saíram de STUB. **P0-4** segue
> `blocked-by` (vira probe). Ver addendum ADR-0004 e CHANGELOG ontologia v0.2.1.

→ Os **P0 gaps** estão respondidos (exceto P0-4, que é probe de campo wire e **não** bloqueia a
modelagem). O `TaskScoper` pode fechar critérios de cálculo/eleição/casamento/aging; a **leitura
da data-base** (coluna aging populada + Gate 4 com data) fica gated no **probe P0-4**.

---

## OntologyCurator — decisão de modelagem (2026-06-17, ADR-0004)

**Diff proposto** (aguardando aprovação do Yuri; escrito no worktree `permutas-painel-wt`):
- 5 entidades, 5 ações, 1 máquina de estado, 4 business-rules (2 STUB), 1 integração (conexos read-only).
- Ontologia bumpada `0.1.0 → 0.2.0`. ADR-0004 registra a primeira modelagem da Frente I + a
  re-introdução dos reads D.I/DUIMP podados no ADR-0003.

**Decisões que merecem destaque do Yuri:**
1. **`PermutaCandidata` ≠ `Permuta` consumada.** Modelei só a candidata (derivada, READ-ONLY).
   A `Permuta` consumada (escrita `fin010`) + ação `reconciliarPermuta` ficam para a Fatia 2 —
   exigem o caminho de escrita no ERP ainda não validado (risco #1, O3).
2. **IDs Columbia (tpdCod/gerNum) como constantes tipadas de tenant**, não como universais (P6).
3. **Nada inventado** onde falta resposta — `blocked-by` honrado.

**P0 que GATEIAM o avanço (TaskScoper não fecha critérios destas ações sem resposta):**
- **P0-1** (juros/desconto) → ✅ RESOLVIDO (comparação de TAXA). `classificacao-juros-desconto` saiu de STUB; `VariacaoCambial`/`calcularVariacaoCambial` desbloqueados.
- **P0-3** (filtro "Adiantamento=SIM") → ✅ RESOLVIDO (probe 2026-06-18). Chave wire = `docVldTipoAdto=1` (FinDocCab). `elegerAdiantamentos`/`conexos` desbloqueados; **deixa de ser build-probe**.
- **P0-4** (campo wire data-base imp019/imp223) → ✅ RESOLVIDO (probe 2026-06-18). `cdiDtaCi` (imp019) / `dioDtaDesembaraco` (imp223), epoch-ms; XOR confirmado em dados reais; coluna aging popula. **Não há mais gap P0 aberto.**
- **P0-6** (definição "INVOICE casada") → ✅ RESOLVIDO (=1 finalizada). `casarInvoice`/`elegibilidade-permuta` desbloqueados.
- **P0-7** (cadência/rate-limit) → ✅ RESOLVIDO (lista todas via 3 filtros; sem janela; multi-filial). query-base de `elegerAdiantamentos` definida.
- **P0-8** (âncora do aging) → ✅ RESOLVIDO (=data-base). `aging-anchor` saiu de STUB; `exporNoPainel` desbloqueado; coluna aging populável (P0-4 resolvido).

**NOVO GAP (probe 2026-06-18, sugestão P1):** `gate-3-pago-via-detail` — status TOTALMENTE PAGO vem
`null` no `com298/list` (mnyTitAberto/mnyTitPago=null nos 410 reais); fonte provável = endpoint de
detalhe. Bloqueante p/ a eleição produzir ALGUMA candidata elegível (fora de escopo do probe).

**Resolução pós-respostas (2026-06-17, addendum ADR-0004; + probe 2026-06-18):** P0-1/P0-3/P0-4/P0-5/P0-6/P0-7/P0-8/P1-2
RESOLVIDOS (P0-3 e P0-4 com evidência empírica de rede). N:M → backlog (`composto-nm`),
`PermutaCandidata` mantém shape 1:1. **Único gap aberto remanescente: `gate-3-pago-via-detail` (P1).**

**Watchlist** (não bloqueia Fatia 1): P0/P1-5 → **decidido**: N:M é backlog nesta fatia (pode
mudar shape de `PermutaCandidata` numa fatia futura); P1-A (caminho de leitura do adiantamento)
→ **resolvido** por P0-3 (caminho PROFORMA + filtro `adiantamento=SIM`).
