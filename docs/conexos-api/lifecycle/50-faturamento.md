---
phase: 50
title: "Faturamento (Ordem de Faturamento → Notas Fiscais)"
screens: [imp002, com296, com297, com319]
prev: lifecycle/40-encargos.md
next: lifecycle/60-financeiro.md
---

# Fase 50 — Faturamento

> Camada 2 (narrativa). Verificado ao vivo em 2026-06-19 (ODF 3040/3, 8108 ODFs na filial 2).

## O que é
Com a mercadoria nacionalizada e os encargos apurados, a Columbia **fatura** o processo: emite as notas fiscais
que entregam a mercadoria ao encomendante e cobram os serviços de importação. Como a operação é **conta e ordem**
(C&O), o faturamento é orquestrado por **Ordens de Faturamento (ODF)**.

## A Ordem de Faturamento (ODF) — [`imp002`](../screens/imp002.md)
A **ODF** é o documento que dirige cada emissão de NF a partir do processo. Um único processo gera **vários
ODFs**, um por operação fiscal — porque a operação C&O tem várias pernas:

| Configuração da ODF | CFOP típico | Papel |
|---|---|---|
| ENTRADA IMPORTAÇÃO ENCOMENDA / CO3 | 3102 / 3949 | NF de entrada da mercadoria importada (em nome do encomendante) |
| REMESSA C&O | 5949 | Remessa simbólica/física ao encomendante |
| **PRESTAÇÃO DE SERVIÇOS CONTA E ORDEM** | 5933 | **NF de serviço** — a remuneração da Columbia |
| REMESSA ARMAZENAGEM | 5934 | Movimentação para/de armazém |
| VENDA ENC. INTEREST. | 6106 | Venda no encerramento (interestadual) |

Cada ODF tem **Dados** (tratamento fiscal: CFOP, tipo de operação, série NF; cliente; tratamento do produto) e
**Serviços**. Na aba **Serviços**, os itens da NF de serviço (ex.: LC **17.01 — Assessoria**) podem ser puxados
do processo via **Importar C/C Processo** — fechando o loop financeiro: as **despesas do processo** (Conta
Corrente em [`imp021`](../screens/imp021.md)) viram a **NF de serviço** cobrada do encomendante.

## As Notas Fiscais
- **NF de entrada** — [`com296`](../screens/com296.md): a entrada da mercadoria importada.
- **NF de saída** — [`com297`](../screens/com297.md): a saída/remessa ao encomendante. É na NF que se acessa
  **Mais Ações → Encargos Gerais** ([`com017`](../screens/com017.md)) — a ponte para os impostos/FRETE da fase 40.
- **Geração/Transmissão de NF-e** — [`com319`](../screens/com319.md): emite e transmite as NF-e ao SEFAZ em lote
  (XML, lote, transmissão, consulta, impressão do DANFE).

## Reforma tributária
A Invoice ([`log009`](../screens/log009.md)) já carrega o **Classificador Tributário IBS/CBS**, e o plano de
contas ([`ctb002`](../screens/ctb002.md)) tem flags de Reinf — o ERP está preparado para a transição fiscal.

## Para onde vai
As NFs geram **títulos financeiros** (a pagar/receber) — fase **60 — Financeiro**
([`com298`](../screens/com298.md) / [`com299`](../screens/com299.md) → baixa via borderô em
[`fin010`](../screens/fin010.md) / [`fin014`](../screens/fin014.md)).

→ Próxima: [60 — Financeiro](60-financeiro.md)
