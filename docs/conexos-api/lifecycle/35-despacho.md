---
phase: 35
title: "Despacho Aduaneiro / Nacionalização"
screens: [imp237, imp019, imp052, imp230, imp190, com017]
prev: lifecycle/30-processo.md
next: lifecycle/40-encargos.md
---

# Fase 35 — Despacho Aduaneiro

> Camada 2 (narrativa). Conta **o que acontece no negócio** e linka para as fichas de tela (camada 1,
> `screens/<ctrl>.md`) com os endpoints e o layout. Verificado ao vivo em 2026-06-19 (DI 26/0702075-0 e
> processo 103/INOX-TECH).

## O que é
Depois que a carga embarca (fase 20) e o **Processo de Importação** (`imp021`, fase 30) está aberto, começa o
**despacho aduaneiro**: a sequência regulatória que **nacionaliza** a mercadoria — registra sua chegada,
declara-a à Receita, calcula e recolhe os tributos, e a libera para entrega. É aqui que nascem os **impostos
de importação** que depois compõem os encargos do processo.

## Sequência (cronológica)

1. **Presença de Carga** — [`imp237`](../screens/imp237.md)
   A carga chega fisicamente ao **recinto alfandegado** (armazém/porto/aeroporto). Registra-se o evento com o
   **CE-Mercante** (conhecimento eletrônico, vindo de [`log012`](../screens/log012.md)) e o recinto/URF, e
   **transmite-se ao Siscomex**. Sem presença de carga registrada não se registra a DI.

2. **Declaração de Importação (DI/DSI)** — [`imp019`](../screens/imp019.md) *(registro em [`imp052`](../screens/imp052.md), não usado pela Columbia)*
   A declaração formal à Receita. Estrutura em abas:
   - **Capa**: origem, recinto, **canal** de parametrização (VERDE = desembaraço automático; AMARELO/VERMELHO =
     conferência), FOB, datas.
   - **Adições** (`impDiAdicao`): cada adição = um grupo NCM com seu **regime tributário**, **método de
     valoração aduaneira** (ex.: Método 6), exportador/fabricante e o **CIF** decomposto (mercadoria + frete +
     seguro, em dólar / moeda negociada / moeda nacional). A valoração da adição é a **base de cálculo** dos
     tributos.
   - **Despesas (impostos)** (`impDiPlanilha`): os **tributos recolhidos** — II, IPI, PIS, COFINS e Taxa
     Siscomex —, com valor, data de pagamento e dados bancários. **Esta é a origem fiscal dos encargos.**

3. **Admissão Temporária** (quando aplicável) — [`imp230`](../screens/imp230.md)
   Para itens que entram sob **regime de admissão temporária** (tributos suspensos por prazo), controla-se o
   **saldo** de cada item: quanto ainda está no regime e quanto já foi baixado (nacionalizado/reexportado).
   Acessível via `imp021 → Mais Ações → Saldo Adm. Temporária`.

4. **DU-E** (no leg de exportação/reexportação) — [`imp190`](../screens/imp190.md)
   **Declaração Única de Exportação** no Portal Único Siscomex (RUC, URF de despacho/embarque). Usada quando a
   operação tem saída/reexportação.

### Telas de apoio do despacho (seed swagger, ainda não confirmadas ao vivo)
- **`imp038` — Solicitação de Numerário (SN)** (tag IMP_038, 20 paths): o despachante **solicita ao importador
  os recursos** para pagar tributos/despesas do despacho. Botão **SN** no rodapé do processo (`imp021`). A SN
  gera títulos financeiros (fase 60). ⬜ tela ao vivo.
- **`imp233` — Consulta controle de estoque pré-ACD**: estoque antes do desembaraço; vincula-se ao saldo de
  itens da admissão temporária (`imp230`). ⬜ tela ao vivo.
- **Wire (seed):** `imp237.ImpPresencaCarga` = `icgEspNumce` (nº CE-Mercante), `rctCod`/`rctDesNome` (recinto),
  `viaCod` (via transporte), `icgDtaCadastro`, `icgVldStatus`. `imp190`: `item/list`, `calcDueFrete`, `divDueFrete`.

## Para onde vai
Os tributos da DI e as despesas do despacho alimentam a fase **40 — Encargos & Impostos**
([`com017`](../screens/com017.md)): é em `com017/encargosGerais` que o **FRETE INTERNACIONAL** e os impostos
aparecem consolidados como ENCARGOS GERAIS do processo. Em paralelo, as despesas de despacho entram na **Conta
Corrente do processo** ([`imp021`](../screens/imp021.md)) e, no modelo **conta e ordem** da Columbia, são
repassadas ao encomendante via **ODF de serviço** ([`imp002`](../screens/imp002.md), fase 50).

→ Próxima: [40 — Encargos & Impostos](40-encargos.md)
