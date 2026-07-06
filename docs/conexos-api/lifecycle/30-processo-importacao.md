# Fase 30 — Processo de Importação ([`imp021`](../screens/imp021.md)) ✅ — a ESPINHA

**Narrativa.** O **Processo** (`imp021`, tag IMP_021 "Processos") é a entidade central que amarra todo o
ciclo: cadastros → pedido → embarque → despacho → nacionalização → faturamento → financeiro → fechamento.
Tudo pendura no `priCod`. É também onde se controlam as **datas de fechamento** (Operacional, Financeiro,
Contábil) que o `MODELO DASHBOARD` usa, e a **taxa de câmbio** do processo. 252 endpoints no swagger.

**Tela / como chegar.** `home → /imp021` → **Processos - Pesquisa** (filtros) → selecionar → **Editar** →
`/imp021#/cadastro/{filCod}/{priCod}` = **Processos - Edição** (ex.: `/imp021#/cadastro/2/103`).

**Filtros da Pesquisa (rótulo ↔ campo):** Cód. Processo=`priCod` · Cód. Pessoa=`pesCod` · Referência
Externa=`priEspRefcliente` ✅ · Tipo=`priVldTipo` · Cód. Adquirente · Finalidade · Referência Cliente=
`priEspReferencia`(?) · Agenciamento Internacional · Situação=`priVldStatus` (ABERTO → `priVldStatus!IN=1`) ✅ ·
Cód. Transportadora · Pessoa Armazém=`priCodPesArmazena` · Quantidade de Notas · Cód. Configuração de ODF.

**Seções da Edição (visíveis):** cabeçalho (Agenciamento Internacional, Finalidade=IMPORTAÇÃO, Ref.
Externa/Cliente/Auxiliar, Documento Federal/Estadual, Contrato, **Plano Financeiro NF Entrada**=FORNECEDORES
EXTERIOR / **NF Saída**=CLIENTES DIVERSOS) · **DATAS** (Abertura/Fechamento) · **FECHAMENTO** (Operacional /
Financeiro / Contábil) · **ENTREPOSTO ADUANEIRO/ADMISSÃO TEMPORÁRIA** · **PROCESSO MASTER**.

## Endpoints (capturados ao vivo no load do processo 103)

```
GET  /api/imp021/{priCod}                         ← carrega o processo. resp $ref = ImpProcesso
     ex.: /api/imp021/103
GET  /api/imp021/getProcessoLiberado/{priCod}
GET  /api/imp021/liberacao/filial/valida
POST /api/imp021/getOperacaoArmazem
POST /api/imp021/transferenciaProc/list
POST /api/imp021/habilitaSaldoAdmtmp
POST /api/imp021/habilitaNacionalizacao            ← habilita etapa de nacionalização (fase 35)
POST /api/imp021/validaDocFederalAmazonas/{n}
POST /api/imp021/list                              ← lista da Pesquisa (CnxListRequest)
```

Outros endpoints relevantes do controller (do swagger, a mapear ao vivo): `DespesasProcesso/{priCod}`
(despesas do processo), `ImpEventosProcesso/list/{priCod}` (**eventos/etapas — a linha do tempo**),
`ImpProcessoLigFin` (ligação financeira), `ImpProcessoSldItm` (saldo de itens), `alterarDatas/{priCod}`,
`confirmaDespesas/{priCod}`, `fatCheckPoint/gerarDocs` (gera docs de faturamento), `ContaCorrente`.

## Schema do cabeçalho — `ImpProcesso` (campos-chave)

| Grupo | Atributos |
|---|---|
| Identificação | `priCod`, `priEspRefcliente`, `priEspReferencia`, `priVldTipo`, `priVldStatus`, `filCod` |
| Pessoas | `pesCod` (cliente), `pesCodExportador`, `priCodDespachante`, `priCodPesArmazena`, `priCodPesTrans`(transp.), `pesCodSeguradora`(`priCodSeguradora`) |
| Datas | `priDtaAbertura`, `priDtaFechamento`, `tipoFechamento`, `priDtaConv`, `priDtaCarrSol/CarrExec/EntrCarg`, `priDtaFundap` |
| Câmbio / valores | `priFltTxDolar`, `priFltTaxaConv`, `moeCodConv`, `priMnyCifDolar`, `priMnyCfiMnac` (CIF), `priMnySeguroDolar/Mneg`, `priMnyValorFinal` |
| Percentuais | `priPctMarkup`, `priPctLucro`, `priPctOperacional`, `priPctIcms`, `priPctSeguro`, `priPctDescCliente` |
| Natureza gerencial | `gerNum`, `gerNumEnt` (ver labels na memória `conexos-apidocs-access`) |
| Planos financeiros | NF Entrada / NF Saída (rótulos "FORNECEDORES EXTERIOR" / "CLIENTES DIVERSOS") |
| Projeto/conta | `prjCod`, `ctpCod`, `tpcCod` |

## Sub-tela: Despesas do Processo (rodapé **Despesas**) ✅ — fonte "ENCARGOS GERAIS > DESPESAS"

Botão **Despesas** no rodapé abre a grid de despesas rateadas do processo. É a fonte da seção
**"ENCARGOS GERAIS > DESPESAS"** do `MODELO DASHBOARD` (AFRMM, agente de carga, armazenagem zona primária,
frete entrega, despachante DI, + ENCARGOS FINANCEIROS / VARIAÇÃO CAMBIAL em CUSTOS FINANCEIROS).

```
POST /api/imp021/DespesasProcesso/{priCod}            ← grid. resp CnxListResponseImpProcessoDespesas
GET  /api/imp021/ProcessoDespesas/complemento/{priCod}
```

**Mapa rótulo ↔ atributo (`ImpProcessoDespesas`):**

| Coluna UI | Atributo |
|---|---|
| Despesa | `impDesNome` |
| Valor (MN) | `pidMnyValormn` |
| Valor moeda neg. | `pidMnyValorMneg` · taxa `pidFltTxMneg` |
| Forma de rateio | `pidVldFormaReteio` (ex.: PROCESSO) |
| Base (FOB/NENHUMA) | `pdiVldOrigemDesp` / `pidCodOrigemDesp` |
| Conta do Projeto | `ctpDesNome` / `ctpEspConta` (ex.: OUTRAS DESPESAS - FOB, AFRMM-MARINHA MERCANTE, ENCARGOS FINANCEIROS) |
| Moeda | `moeEspNome` (REAL/BRASIL) |
| Tipo | `tdsDesTipo` (DESPESA) |
| Faturado | `pidMnyFatEntPri/Fil` (entrada), `pidMnyFatSaiPri/Fil` (saída) |

**Valores reais (processo 103):** ICMS/ICMS DIFAL R$ 1.646,19 · AFRMM Marinha Mercante R$ 1.666,18 (+19,99) ·
ENCARGOS FINANCEIROS R$ 5.766,05.

> **Síntese da CONCILIAÇÃO** (fonte por seção do `MODELO DASHBOARD`):
> "ENCARGOS GERAIS > IMPOSTOS" = `com017/encargosGerais` (fase 40) · "ENCARGOS GERAIS > DESPESAS" =
> `imp021/DespesasProcesso` (esta sub-tela) · "CALCULADORA DE VARIAÇÃO CAMBIAL" / "CALCULADORA DE ENCARGOS" =
> apps próprios (custos financeiros).

## Sub-tela: Conta Corrente do Processo (Mais Ações → **Conta Corrente**) ✅ — débito × crédito
Modal **"CONTA CORRENTE DO PROCESSO - IMP_040"**. `POST /api/imp021/ContaCorrente` → `ViewCcPessoas`. Mostra,
por parceiro, o **crédito × débito** do processo (Crédito / Débito / Diferença). Verificado ao vivo (processo
103, 12 lançamentos): **crédito** = NF/ICMS; **débito** = VLR PAGO REF a forwarders (FFPV / MAERSK / AR
SOLUÇÕES). ⭐ **É o núcleo do loop conta e ordem:** as despesas que a Columbia paga por conta do encomendante
ficam aqui como débito e são **importadas para o ODF de serviço** ([`imp002`](../screens/imp002.md) → Serviços
→ *Importar C/C Processo*), virando a NF de serviço cobrada do cliente. Ver [`screens/imp021.md`](../screens/imp021.md).

## Sub-tela: Eventos do Processo (Mais Ações → **Eventos**) ✅ — cronologia interna
`POST /api/imp021/ImpEventosProcesso/list/{priCod}` → `ImpEventosProcesso`. A **linha do tempo interna** do
processo (etapas/checkpoints com datas). O grid visual é pesado e pode travar o renderer (recuperar com reload
`home → processo`). Complementa as 3 datas de fechamento (Operacional/Financeiro/Contábil) do cabeçalho.

## Outras sub-telas do processo (Mais Ações, verificadas)
**Validação** = modal "AVISOS" (avisos/erros de validação). **Saldo Adm. Temporária** → [`imp230`](../screens/imp230.md)
(saldo de itens em admissão temporária). **Checkpoints/Responsáveis** = contextuais. Rodapé do processo:
Salvar · Listagem · **Despesas** · **SN** (`imp038` Solicitação de Numerário) · **SP** · Atalhos · Mais Ações.

## Pendente (próximas iterações ao vivo)
- ⬜ `fatCheckPoint/gerarDocs` (ponte para faturamento, fase 50); SP/Atalhos; visual completo de Eventos.

**Ligações cronológicas.** É o hub. ⬅ pedido/contrato (fase 10), invoice/CT (fase 20). ➡ habilita
nacionalização (fase 35), gera faturamento (fase 50, `fatCheckPoint`), encargos (fase 40), financeiro
(fase 60), e consolida o **fechamento** (fase 70) via as 3 datas Operacional/Financeiro/Contábil.
