---
name: TituloAPagar
type: entity
ontology_version: "0.5"
implementation_status: implemented
status: draft
owners: [yuri]
related_files:
  - src/backend/domain/client/ConexosSispagClient.ts
  - src/backend/domain/service/sispag/SispagPainelService.ts
  - src/backend/domain/interface/sispag/SispagInterface.ts
  - src/backend/routes/sispag.ts
  - src/frontend/app/sispag/page.tsx
properties:
  - docCod
  - titCod
  - filCod
  - credor
  - valor
  - moeda
  - vencimento
  - liberado
  - pago
  - banco
relationships:
  - "TituloAPagar N—1 Filial (via filCod — a filial que originou o título a pagar)"
  - "TituloAPagar N—1 LotePagamento (via ItemLote — um título elegível pode ser incluído em um lote candidato RASCUNHO)"
  - "TituloAPagar 1—1 (contexto) Borderô a-pagar / Lote SISPAG nativos (fin010/fin015 — leitura de contexto no painel, não vínculo próprio)"
last_review: 2026-07-07
universality_evidence:
  - "docs/proposta/Proposta_Kavex_Columbia_Financeiro.md — Frente II (SISPAG): pagamentos de importação a vencer/aprovados"
  - "ontology/_inbox/sispag-briefing.md §2 — sondagem read-only Conexos PRD (2026-07-07): fin064 Gestão de Pagamentos, 2.100 (fil1) / 18.234 (fil2) títulos reais"
  - "ontology/_inbox/sispag-native-vs-nexxera.md §2.5/§3 — 'aprovado para baixa' = flags de alçada titVld1/2/3libera (com308), doc 100 título 1 R$135.724,80 aprovado nos 3 níveis"
  - "Conceito universal de comex/financeiro: um título a pagar (fornecedor, valor, vencimento) aprovado pela alçada é candidato a pagamento no prazo — evita multa/juros"
---

# TituloAPagar (read model — carteira de pagamento SISPAG)

> **Read model** da carteira de títulos a pagar do ERP Conexos (Escopo II — SISPAG). Um
> título a pagar é uma obrigação financeira de importação (credor, valor, vencimento) que,
> uma vez **aprovada pela alçada de liberação**, é candidata a entrar no pagamento diário.
> **NÃO é persistido** por nós — é leitura *read-through* do Conexos (`fin064` + detalhe de
> alçada em `com308`). É o insumo do painel diário e da montagem de lote (Fatia 1+2).

## Definição de domínio

Um `TituloAPagar` é a unidade da **carteira de pagamentos** do ERP: o que a trading deve a um
fornecedor/credor, com um valor e um vencimento. A operação SISPAG existe para que **nenhum
título aprovado deixe de sair no prazo** (evitar multa/juros). O painel expõe a janela
relevante (a vencer + vencidos, com aging); a analista monta o lote a partir dos títulos
**aprovados e não pagos**.

Esta fatia (Fatia 1+2) apenas **lê e agrupa** títulos; **não os modifica** no ERP (I1 —
read-only). A baixa/remessa efetiva é a próxima feature (ver ADR-0015, fora de escopo).

## Propriedades

| Propriedade | Tipo | Origem (wire/coluna) | Notas |
|-------------|------|----------------------|-------|
| `docCod` | string | `fin064` → doc a-pagar (`com298.docCod`) | Documento a-pagar. Parte da identidade `filCod:docCod:titCod`. |
| `titCod` | string | `fin064`/`com308` → `titCod` | Código do título dentro do documento (um doc pode ter N títulos/parcelas). |
| `filCod` | number | `fin064` → `filCod` | **Invariante multi-filial** — filial que originou o título. Chave do agrupamento de lote (I4). Nunca `null`. |
| `credor` | string | `fin064` → nome do fornecedor/credor | Exibição. A quem se paga. |
| `valor` | number | `fin064`/`com308` → `titMnyValor` (ou saldo a pagar) | Valor do título (moeda em `moeda`). Snapshot no `ItemLote` no momento da inclusão. |
| `moeda` | string | `com298.moeEspSigla` | Moeda do título. |
| `vencimento` | Date | `fin064`/`com308` → `titDtaVencimento` | Data de vencimento — base do aging e da janela do painel (−15d..+45d). |
| `liberado` | boolean | derivado: `titVld1libera==1 ∧ titVld2libera==1 ∧ titVld3libera==1` (`com308`, alçada) | **"Aprovado para baixa"** — passou por **todos os níveis de alçada** que a Columbia usa. Gate de elegibilidade do lote (I2). Ver `business-rules/elegibilidade-titulo-lote.md`. |
| `pago` | boolean | derivado: título já quitado (`vldBordero`/baixa `fin010`) ou saldo em aberto = 0 | Título já pago **não** entra no lote (I2). |
| `banco` | string? | `fin064` → banco/conta do título (`bncCod`/`ccoCod`, `conVldEnviaNexxera`) | Banco/conta destino. **Metadado opcional** nesta fatia (o agrupamento é por filial; banco/conta é informativo — ver ADR-0015). |

## "Liberado" (aprovado pela alçada) — evidência

- A aprovação para pagamento **não** é um único campo: são as flags de **alçada de liberação**
  `titVld1libera` / `titVld2libera` / `titVld3libera` (`com308`), com
  `titTim*libera`/`titUsn*libera`/`usnDesNomel*` registrando **quando/quem** em cada nível.
  Governadas por `fin102` (bloqueio), `fin103` (liberação), `fin106` (alçadas), `fin007/liberar`.
- **Quantos níveis a Columbia usa de fato** é pergunta operacional aberta (Flávia). Nesta fatia
  tratamos `liberado` como o **AND das flags presentes** — recalibrável por tenant/config sem
  mudar a estrutura.
- Downstream (não modelado aqui): `titVldEnviaBanco` / `titDtaEnvioBanco` / `titVldRetBanco` /
  `titNumRemessa` / `vldBordero` rastreiam remessa→envio→retorno→baixa (é a próxima fatia).

## Fonte de leitura (Conexos) — READ-ONLY

- `ConexosSispagClient.listTitulosAPagar({ filCod, janela })` — carteira `fin064` na janela do
  painel (−15d..+45d), enriquecida com a alçada de `com308` (`liberado`) e status `pago`.
- Nenhuma escrita: o `ConexosSispagClient` é **só-leitura** nesta fatia (I1). Ver
  `integrations/conexos.md` (superfície SISPAG READ).

## Fora de escopo (Fatia 1+2)

- Nenhuma escrita no ERP. O título nunca é liberado/baixado/enviado por nós aqui — isso é a
  próxima fatia (`fin015` gerar remessa / `fin052` retorno / `fin010` baixa), gated como em
  Permutas. Ver ADR-0015.
