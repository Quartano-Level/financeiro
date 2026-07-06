# Fase 20 — Embarque / Logística (Proforma, Invoice, Conhecimento, LI) ✅ (telas confirmadas)

**Narrativa.** Fechado o pedido, a operação documental do embarque segue: primeiro a **Proforma**
(pré-fatura), depois a **Invoice** (fatura comercial definitiva) e o **Conhecimento de Transporte**
(BL marítimo / AWB aéreo). Quando exigido, abre-se a **Licença de Importação (LI)**. Esses documentos trazem
peso, volume, containers, **frete internacional** e valores que abastecem o despacho.

## [`log003`](../screens/log003.md) — Proforma de Importação (tag LOG_003, 83 paths) ✅
A **pré-fatura** que antecede a Invoice. `home → /log003` → "Cadastro de Proforma - Pesquisa". Liga ao pedido
(PO), exportador, origem, **valor de seguro** (compõe o CIF) e contrato. ⮕ vira a Invoice (`log009`).

## [`log009`](../screens/log009.md) — Invoice (tag LOG_009, 160 paths) ✅ tela confirmada
**Tela:** `home → /log009` → **"Invoice - Pesquisa"** (`/log009#/`). Filtros: Código=`invCod`, Número=
`invEspNumero`, Processo, Referência Externa, Ref. Cliente, Emissão de/até, Cód. Exportador=`invCodExportador`,
**Valor Invoice**=`invPreVlrtotal`, **INCOTERMS** (CIF/FOB), Situação=`invVldSituacaoDcto`, Situação Processo
(ABERTO). Grid: Código, Número, Processo, Ref. Externa, Ref. Cliente, Emissão, Cód./Descrição Moeda da Invoice,
Cód. Exportador, Descrição Encomendante, País do Exportador.

`GET /api/log009/{invCod}` → **`PrcInvoice`**. Campos-chave:
`invEspNumero`, `invDtaEmissao`, `invDtaRecebimento`, `invCodExportador`, `invCodImportador`,
`invCodConsignatario`, `invPreVlrtotal` (valor total), `invVldTipoFrete` (CIF/FOB), `incVldFrete`,
`invPrePesoBruto`/`invPrePesoLiquido`, `invPreVolume`, `invQtdContainers`, `invEspEspecie`/`invEspMarca`,
`pedCod` (vínculo pedido), `invVldSituacaoDcto`. Sub: `webtrackingNavios/list`, `pucomexAtributos/list`.

A Invoice (Edição) tem abas **Invoice · Itens da Invoice · Câmbio-LOG_043**: os **Itens**
(`prcInvoiceItens/list`) trazem NCM e **alíquotas por item** (II/IPI/PIS/COFINS, da TEC `imp013`) que alimentam
as Adições da DI; a aba **Câmbio** liga ao contrato de câmbio. No modelo C&O, o **Importador** = Columbia e o
**Encomendante/Adquirente** = cliente real. Detalhe em [`screens/log009.md`](../screens/log009.md).

## [`log012`](../screens/log012.md) — Conhecimento de Transporte de Importação (tag LOG_012, 65 paths) ✅
`GET /api/log012/{cntCod}` → **`PrcConhecimentoTrasp`** (BL/AWB). Campos:
`cntEspNumeroMaster`/`cntEspNumeroHouse`, `cntEspBookingnr`, **`cntMnyFrete`** (frete do conhecimento),
`cntMnyValorFinal`, `cntDtaEmissao`/`cntDtaEntrega`, `cntQtdContainers`/`cntQtdPallets`,
`cntPrePesoBruto`/`cntPrePesoLiquido`, `cntPreM3`, `pesCodExportador`, `pesCodImportador`,
`pesCodArmazem`, `pesCodRecintoEnt`, `oriCodOrigem`/`oriCodDestino`, `cntVldConsolidado`. O **CE-Mercante** daqui
abastece a Presença de Carga ([`imp237`](../screens/imp237.md), fase 35).

## [`imp174`](../screens/imp174.md) — Importação de LI (tag IMP_174, 35 paths) ✅
Licença de Importação via Siscomex Web (anuências de órgãos; deferimento; vínculo ao processo; botão Siscomex).

## Lado exportação (re-exportação / saída)
- [`log111`](../screens/log111.md) — **Proforma de Exportação** (antecede a invoice de exportação).
- [`log091`](../screens/log091.md) — **Invoice de Exportação**.

**Ligações cronológicas.** ⬅ pedido (fase 10). ➡ Processo (fase 30, vincula invoices/conhecimento); o
**frete internacional** do conhecimento (`cntMnyFrete`) reaparece nos encargos (fase 40) e o valor da
invoice compõe o FOB/CIF.
