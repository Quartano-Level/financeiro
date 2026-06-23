# Business Rule — Contrato de escrita `fin010` (baixa/permuta de adiantamento)

> **Origem:** engenharia reversa de um HAR real (DevTools Network) de UMA baixa/permuta manual
> executada por um analista no `fin010 #/cadastro` (2026-06-23). Risco arquitetural #1 — a **primeira
> escrita** do sistema no Conexos. Ver ADR-0013 e `integrations/conexos.md` (seção WRITE).

## Descoberta-chave: a baixa NÃO é um POST único

O `fin010` valida cada ponta no servidor antes de gravar. Executar uma permuta **adiantamento → invoice**
é um **handshake de 5 chamadas** (todas `POST`, base `/api`). Em permuta múltipla, os passos 2–5 repetem-se
**por par adto→invoice** dentro do mesmo borderô.

| # | Endpoint | Papel | Entrada que NÓS controlamos | Saída relevante do ERP |
|---|----------|-------|------------------------------|------------------------|
| 1 | `POST /api/fin010` | Cria o borderô | `borDtaMvto` (epoch-ms), `borVldTipo:2`, `borVldFinalizado:0`, `frontModelName:"bordero"`, `filCod` | **`borCod`** (id do borderô) |
| 2 | `POST /api/fin010/baixas/validacao/tituloBaixa` | Valida a **invoice** | `docCod`=invoice, `titCod` (parcela), `docTip:2`, `borCod`, `filCod` | `responseData.bxaMnyValor` (valor do título), contas default (`bxaCodGerJuros` etc.) |
| 3 | `POST /api/fin010/baixas/validacao/tituloPermuta` | Valida o **adiantamento** | `bxaDocCod`=adto, `bxaTitCod`, `bxaDocTip:2`, `borCod`, `filCod` | `gerNumPermuta`, `gerDesPermuta`, `pesCod`, `dpeNomPessoa`, `bxaMnyValorPermuta` |
| 4 | `POST /api/fin010/baixas/validacao/atualizaValorLiquido` | Recalcula o líquido | `docCod`, `titCod`, `bxaMnyValor`, `bxaMnyJuros` (=variação), `bxaMnyDesconto`, `bxaMnyMulta`, `borCod`, `filCod` | `responseData.bxaMnyLiquido` |
| 5 | `POST /api/fin010/baixas` | **Grava a baixa/permuta** | payload consolidado (ver abaixo) | **`bxaCodSeq`** (sequência da baixa) — confirmação |

> O ERP é a **fonte da verdade dos valores** (`bxaMnyValor`, `bxaMnyLiquido`, dados da permuta).
> Nós só fornecemos **quem** (invoice `docCod` + adiantamento `bxaDocCod`), **a data** (`borDtaMvto`),
> e **o juros + conta** (`bxaMnyJuros` + `bxaCodGerJuros`). Isso é *mais seguro*: o valor a baixar e o
> em-aberto vêm do próprio Conexos no passo 2 — o "re-ler em-aberto vivo" do plano vira **capturar
> `bxaMnyValor` do passo 2 e validar contra a nossa alocação** antes de prosseguir ao passo 5.

## Payload consolidado do passo 5 (`POST /api/fin010/baixas`)

Campos = união do que o analista digitou + o que os passos 2/3/4 devolveram:

```jsonc
{
  "filCod": 4, "borCod": 1999, "borVldTipo": 2, "borVldFinalizado": 0,
  "frontModelName": "baixa",
  // lado INVOICE (baixa) — do passo 2
  "docTip": 2, "docCod": 5078, "titCod": 1, "titEspNumero": "CAMEX/MONO1",
  "bxaMnyValor": 40879.9,              // valor do título (do ERP, passo 2)
  "bxaMnyDesconto": 0, "bxaMnyMulta": 0,
  "bxaMnyJuros": 220,                  // VARIAÇÃO CAMBIAL — nós colocamos (variacao_resultado)
  "bxaCodGerJuros": 131,              // CONTA DE JUROS — JUROS=131 (passiva) / DESCONTO via bxaMnyDesconto+bxaCodGerDesconto
  "gerDesJuros": "VARIAÇÃO CAMBIAL PASSIVA REALIZADA",
  "bxaMnyLiquido": 41099.9,           // do ERP (passo 4) = valor + juros
  "bxaCodGerDesconto": 94, "bxaCodGerMulta": 127,
  "gerDesDesconto": "DESCONTOS OBTIDOS", "gerDesMulta": "MULTAS E JUROS COMERCIAIS",
  // lado ADIANTAMENTO (permuta) — do passo 3
  "bxaVldAdto": 1,
  "bxaDocTip": 2, "bxaDocCod": 2767, "bxaTitCod": 1,
  "gerNum": 198, "gerNumPermuta": 198, "gerDesPermuta": "ADTO FORNECEDOR INTERNACIONAIS",
  "gerDes": "ADTO FORNECEDOR INTERNACIONAIS",
  "pesCod": 2658, "dpeNomPessoa": "TOP GLOBAL PARTS CO LTD",
  "bxaMnyValorPermuta": 41175.97, "bxaMnyLiquidoPermuta": null,
  "bxaVldSistema": 0, "bxaVldCcorrente": 0, "bxaVldCorrenteDc": 1
}
```

Resposta do passo 5 (sucesso): objeto da baixa com `bxaCodSeq` (ex.: `1`), `bxaCodSeqPerm`, todos os
valores ecoados, `borDtaMvto`, `vldPermuta:1`. **`bxaCodSeq` é a confirmação** que persistimos.

## Mapeamento `permuta_alocacao` → contrato

| Campo fin010 | Fonte nossa (`permuta_alocacao`) | Observação |
|---|---|---|
| `docCod` (passo 2/5) | `invoice_doc_cod` | docCod da INVOICE (≠ processo) |
| `bxaDocCod` (passo 3/5) | `adiantamento_doc_cod` | docCod do ADIANTAMENTO |
| `titCod` / `bxaTitCod` | `1` (constante por ora) | parcela / número do título |
| `bxaMnyValor` | **ERP (passo 2)** | validar `≈` contra a alocação (anti-drift) |
| `bxaMnyJuros` | `variacao_resultado` | valor da variação cambial |
| `bxaCodGerJuros` | `variacao_classificacao`=`JUROS` → `131` | DESCONTO ⇒ usar `bxaMnyDesconto`+`bxaCodGerDesconto` (94), `bxaMnyJuros=0` |
| `bxaMnyLiquido` | **ERP (passo 4)** | = `bxaMnyValor` + `bxaMnyJuros` |
| `borDtaMvto` | data da execução (entrada do analista) | epoch-ms, meia-noite UTC do dia |
| `gerNum*`, `pesCod`, `dpeNomPessoa`, `bxaMnyValorPermuta` | **ERP (passo 3)** | repassar verbatim ao passo 5 |

## Regras / invariantes de escrita

- **I-Write-1 (anti-drift):** antes do passo 5, `|bxaMnyValor(passo 2) − valorEsperadoDaAlocacao|` deve estar
  dentro da tolerância (≤ 0,005 na moeda do título); divergência ⇒ **abortar** (em-aberto mudou no ERP).
- **I-Write-2 (conta de juros):** `JUROS` → `bxaCodGerJuros=131`, `gerDesJuros="VARIAÇÃO CAMBIAL PASSIVA
  REALIZADA"`. `DESCONTO` → valor em `bxaMnyDesconto` + `bxaCodGerDesconto=94`, `bxaMnyJuros=0`.
  Ver `classificacao-juros-desconto.md`.
- **I-Write-3 (um adto por vez):** escreve-se **adto a adto** (como no manual). Em múltipla, cada par
  adto→invoice é um passo 2–5 separado, no MESMO `borCod`.
- **I-Write-4 (idempotência):** a execução carrega uma `idempotency_key`; uma re-execução com a mesma chave
  NÃO cria novo borderô nem nova baixa (ver `idempotencia-reconciliacao.md`).
- **I-Write-5 (homologação-first):** nenhuma escrita em produção antes de validada em
  `https://columbiatrading-hml.conexos.cloud` (mesmas credenciais/`filCod`). `CONEXOS_DRY_RUN` default ON.

## Fora do contrato (a confirmar em campo)
- Comportamento quando a invoice **já tem baixa parcial** anterior (passo 2 pode mudar `bxaMnyValor`).
- Finalização do borderô (`borVldFinalizado`/`borDtaFinalizado`) — o HAR ficou com `borVldFinalizado:0`
  (borderô aberto); confirmar se a permuta exige um passo de "finalizar".
- Estorno programático (hoje o analista estorna pela UI).
