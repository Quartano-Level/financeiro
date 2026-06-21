# Exploração — Permutas N:M (pool por processo) + caso 1153

**Data:** 2026-06-20 · **Branch:** `feat/permutas-multiplas` · **Status:** exploração (pré-Fatia 2)
**Fonte:** EDA no Supabase (pós re-ingestão) + probes de rede no Conexos (filCod=2).

## Hipótese (Yuri)

Um mesmo processo pode ter **vários adiantamentos E várias invoices** (N:M), e a reconciliação
não é doc-a-doc — um adto pode abater várias invoices (parcial), uma invoice pode ser composta por
vários adtos. **CONFIRMADA.**

## Modelo validado

- **Unidade de reconciliação = processo (`priCod`).** A referência de contrato NÃO é chave de junção
  (394 refs de adto × 102 de invoice, só **5 em ambos**).
- **Alocação bipartite M:N com valores PARCIAIS**, escopada ao processo. Cada lado tem saldo
  consumível: Σ(alocado de um adto) ≤ saldo a permutar; Σ(alocado p/ uma invoice) ≤ valor em aberto.
- Isto É a `Permuta` consumada → **Fatia 2** (escrita `fin010`, risco #1). Pede uma entidade de
  **alocação** `(pri_cod, adiantamento_doc, invoice_doc, valor_alocado)` com os 2 invariantes de saldo.

## EDA — cardinalidade por processo (excluindo o outlier 1153)

| Caso | Processos | Tratamento atual |
|------|-----------|------------------|
| 1 adto · 1 invoice (1:1) | 14 | ✅ auto-casa |
| 1 adto · N invoices (1:M) | 21 | ⚠️ `casamento-manual` |
| N adtos · 1 invoice (N:1) | 8 | ❌ **super-aloca** (5 invoices casadas a 2 adtos, sem controle de saldo) |
| N adtos · M invoices (N:M) | 10 | ⚠️ `casamento-manual`, sem alocação |
| sem invoice | resto | bloqueado |

- 143 processos com adto (509 adtos); 53 com invoice (126).
- **Bug atual:** `permuta_casamento` tem 27 casamentos mas só 22 invoices distintas → o auto-"1:1"
  aloca a mesma invoice a 2 adtos sem rastrear saldo consumido.
- Somas por processo N:M às vezes batem exato (293, 144, 523) e às vezes não (151, 205, 2032) →
  alocação parcial de valor, não emparelhamento.

## Caso 1153 (deep-dive no Conexos)

- **Processo REAL** (imp021): importador **INOX-TECH** (`pesCod=191`), ref `00001INX`, `priVldTipo=3`.
- Conteúdo (com298, filCod=2): **290 PROFORMA** finalizadas (adto=1) + 22 status 5; **147 ADTO_FORN_INT**
  (tpd 143); **21 INVOICE** (tpd 128 — 13 finalizadas + 8 status 5); + tpd 149/141/152.
- **0 D.I (imp019) e 0 DUIMP (imp223)** — confirmado no ERP (`count=0`). "Sem D.I/DUIMP" é REAL.
- 1153 sozinho = **290 dos 509 adtos (57%)** do nosso banco.

### Por que 1153 mostra "0 invoices" no app
As 21 invoices EXISTEM no Conexos (13 finalizadas + 8 status 5). Dois motivos somados:
1. **Nosso pipeline só persiste invoice ligada a uma candidata** e os 290 adtos falham no Gate 4 (sem
   D.I) → as invoices não são capturadas. Lacuna técnica: invoice não é documento de 1ª classe.
2. **As 13 finalizadas estão TODAS já liquidadas** (sondado 2026-06-21, docs 6097…5949: `pago=true`,
   `aberto=0`, `permutado=0` → pagas EM DINHEIRO, não por permuta) e são de contratos do ciclo **2025**
   (CT.../25), enquanto os 290 adtos são contratos **2026** (CT.../26). Ou seja: **0 invoice EM ABERTO**
   no 1153 para casar com os adtos pendentes.

⇒ A fala do time ("1153 não tem invoice") é IMPRECISA mas correta na prática: não há invoice *disponível*
no próprio 1153 — a invoice-alvo está em OUTRO processo (permuta cross-process). CORREÇÃO de bug
(2026-06-21): `buscarInvoices` agora filtra "em aberto" pelo DETALHE (`getDetalheTitulos.pago`), pois o
`pago` da lista é null/inconfiável (gate-3); antes mostrava as 13 liquidadas como permutáveis. 1153 → 0.

## Decisões FINAIS (Yuri + analista, 2026-06-20)

Validado com o time: o 1153 (INOX) é **permuta MÚLTIPLA MANUAL cross-process**. O analista pega os
adiantamentos do processo e os casa com **invoices de QUALQUER outro processo** (busca por número de
processo). Esses clientes são cadastrados como **"filtro"** para a pipeline tratá-los à parte.

1. **Permuta manual CROSS-PROCESS.** As ligações adto↔invoice são livres (não exigem `priCod` igual).
   N:M com valores parciais. O analista busca a invoice por número de processo e aloca.
2. **"Cliente filtro" = IMPORTADOR.** Registro mantido pelo analista no frontend (lista de importadores,
   ex. INOX-TECH `pesCod=191`). Os adtos desses clientes **não viram "bloqueada/erro"** — entram num
   **novo estado `permuta-manual`** (KPI/filtro próprio), prontos para a alocação manual.
3. **Gates da permuta manual:**
   - **Adiantamento:** exige só `pago` + `saldo a permutar > 0` (NÃO exige D.I — o adto do filtro não tem).
   - **Invoice (escolhida):** **DEVE ter D.I/DUIMP** (o analista confirmou: "o documento da invoice deve
     ter"). Validado nos dados: 100% dos 53 processos com invoice têm D.I.
   - **Data-base / aging / variação cambial** passam a vir da **D.I da INVOICE** (não do adto), já que o
     adto do filtro não tem D.I.
4. **Busca de invoice = LIVE sob demanda por número de processo** (consulta Conexos na hora), NÃO
   pré-ingerir a base toda — a permuta movimenta dinheiro, o saldo tem de ser confiável. **Re-validar o
   saldo ao vivo no momento de confirmar** a alocação. (O pool do próprio processo segue offline.)
5. **Gate 4 (D.I) na permuta AUTOMÁTICA continua obrigatório** — só a manual relaxa (julgamento do
   analista). Ingestão de invoices first-class (decisão anterior) segue valendo para o pool dos processos
   com adto.

### Correlação "sem invoice" × "sem D.I" (dados, p/ referência)
- 1153/INOX: 100% sem D.I (processo tem 0 D.I/DUIMP).
- Geral: NÃO são a mesma coisa — 380 adtos sem-invoice-no-processo são sem D.I, mas há exceções
  (já-permutado, não-pago, 2 "sem-invoice" COM D.I) e 93 adtos sem D.I em processos COM invoice.
  ⇒ por isso o filtro é por **CLIENTE**, não por "sem D.I".

## Plano de implementação (em fases)

**Fase 1 — Cliente-filtro + roteamento (backend + frontend CRUD). ✅ IMPLEMENTADA (2026-06-20, ADR-0007).**
- Tabela `cliente_filtro` (importador: pesCod + nome). Endpoints CRUD + `GET /importadores`. UI
  `/permutas/clientes-filtro`.
- Pipeline: adtos de cliente-filtro (pago + saldo) → estado `permuta-manual`. KPI/filtro próprio (violeta).
- Importador hidratado (`imp021`) e persistido (`pes_cod`/`importador`). Migrations 0011-0013.
- Verde (BE/FE), PatternGuardian 0 violações, DesignSystemReviewer ok (token `permuta` criado). Regis adiado.
- Estado no working tree, não commitado.

**Fase 2 — Busca cross-process + UI de alocação manual (READ-ONLY no ERP). ✅ IMPLEMENTADA (2026-06-20, ADR-0008).**
- Backend: `GET /permutas/invoices/buscar?priCod=` (live, todas as filiais, valida D.I + enriquece taxa);
  entidade `permuta_alocacao` (links livres, UNIQUE par, sobrevive à ingestão); `AlocacaoPermutasService`
  (alocar valida saldo dos 2 lados → `AlocacaoSaldoError` 422; variação pela taxa da invoice); migration 0014.
- Frontend: ação "Alocar invoice" nas linhas permuta-manual + modal (busca por processo → escolhe invoice →
  distribui valor parcial → lista alocações + saldo restante). Rascunho editável; sem write-back.
- Verde (BE 143 / FE 50), PatternGuardian ok (msgs técnicas → inglês), DesignSystemReviewer ok
  (aria-labels/aria-busy add.; notify() N/A — repo usa toast). Regis adiado. Working tree, não commitado.

**Fase 3 — Write-back `fin010` (execução no ERP). RISCO ARQUITETURAL #1.**
- Desenhar + validar o contrato de ESCRITA no Conexos (nunca feito). Idempotência, rollback, auditoria,
  dev tenant. Provável `/feature-new` próprio com QaCoach + pair-review.

Cada fase entra pelo pipeline (`/feature-new`). Começo recomendado: **Fase 1** (limpa o ruído do backlog
e cria a base do fluxo manual).

## Perguntas em aberto (para o time / Fatia 2)

- **O que é 1153?** Processo financeiro guarda-chuva com a INOX-TECH (sem D.I por natureza) ou
  importação pendente de desembaraço (D.I virá)? Define se os 290 algum dia entram na permuta.
- **A alocação fecha valor exato (Σadto = Σinvoice) ou admite sobra/diferença** (variação cambial,
  saldo p/ próxima invoice)?
- **Super-alocação:** confirmar regra de saldo (invoice abatida por N adtos e vice-versa é legítimo —
  Yuri confirmou; falta o sistema rastrear o consumido dos 2 lados).

## Próximos passos

1. (Yuri) confirmar natureza do 1153 com o time.
2. (Tweak isolado, quando aprovado) **ingestão de invoices first-class** — desacoplar a busca/persistência
   de invoices do casamento.
3. (Fatia 2) entidade `Permuta` + ação de **alocação N:M** (UI de distribuição de valores, read-only no
   ERP primeiro) → depois write-back `fin010`.
