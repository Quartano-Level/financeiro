# Glossário do Domínio — Financeiro (Columbia Trading)

Vocabulário das três frentes da Automação Financeira. Capturado da proposta
([`docs/proposta/`](../docs/proposta/)) e refinado pelas entrevistas do `OfficeHoursInterviewer`.
Termos transversais da plataforma (tenant, filial/`filCod`, ERP Conexos) vivem em
[`../docs-contexto/03_ontologia.md`](../docs-contexto/03_ontologia.md).

## Frente I — Permutas

| Termo | Definição |
|-------|-----------|
| **Permuta** | Reconciliação entre um adiantamento (débito) e a fatura correspondente (crédito), refletida na baixa do ERP. |
| **Adiantamento / PROFORMA** | Valor pago antecipadamente ao exportador, antes da fatura definitiva. Lado "débito" da permuta. |
| **Invoice / Fatura** | Fatura definitiva do exportador. Lado "crédito" da permuta. |
| **Caso 1:1 (direto)** | Uma proforma casa exatamente com uma invoice em um processo — permuta automática, sem intervenção. |
| **Caso N:M (composto)** | Múltiplas proformas/invoices a alocar — exige aprovação e alocação de valores pelo analista. |
| **Alocação** | Link adto↔invoice com **valor parcial** em moeda negociada (entidade `Permuta`, tabela `permuta_alocacao`). Rascunho editável; sobrevive à re-ingestão. A baixa no ERP (`fin010`) é a Fase 3. |
| **Casamento manual** | N:M **no mesmo processo** que passou nos 4 gates: falta o analista alocar a(s) invoice(s) (ADR-0005). Tipos `multiplas` (1 adto→N inv) e `cross-over` (N adtos↔M inv). |
| **Permuta manual / cross-process** | Adto de **cliente-filtro** (pago + saldo, sem D.I no processo): a invoice vem de **outro processo**, escolhida manualmente (ADR-0007). Tipo `cross-process`. |
| **Cliente filtro** | Importador cadastrado cujos adiantamentos a pipeline roteia para `permuta-manual` em vez de `bloqueada` (entidade `ClienteFiltro`, ADR-0007). Lista mantida pelo analista (config do cliente). |
| **tipoPermuta** | Rótulo **derivado** (apresentação/abas), não persistido: `simples` / `multiplas` / `cross-over` / `cross-process` (ADR-0009). |
| **Backlog elegível** | Pendências com adiantamento pago + INVOICE disponível, prontas para permuta, com idade (aging). |
| **Pendência bloqueada** | Caso que depende de terceiros (ex.: INVOICE ainda não emitida) — reportado, não contado como falha. |

## Frente II — SISPAG (Pagamentos)

| Termo | Definição |
|-------|-----------|
| **SISPAG** | Sistema/fluxo de pagamentos em lote enviado ao banco. |
| **Título** | Documento financeiro a pagar (parcela/obrigação) no ERP. |
| **Aprovado para baixa** | Status do título habilitado a entrar no lote de pagamento (representação a confirmar na `com298`). |
| **Lote (candidato / finalizado)** | Conjunto de títulos a pagar no dia; montado pela solução, ajustado e **finalizado** pela analista. |
| **Gate de finalização** | Ação da analista que dispara o processamento do lote (palavra final sobre o que será pago). |
| **Remessa** | Arquivo de pagamento gerado e enviado ao banco. |
| **Retorno** | Resposta do banco sobre o processamento da remessa, usada para conciliar a baixa. |
| **Nexxera** | Gateway/diretório bancário onde a remessa é depositada e o retorno é lido. |
| **Baixa** | Quitação do título refletida no ERP após a conciliação do retorno. |
| **Janela de corte** | Horário-limite do banco para envio do lote (a confirmar no diagnóstico). |

## Frente III — Popula GED

| Termo | Definição |
|-------|-----------|
| **NC / ND** | Nota de Crédito / Nota de Débito. Nasce em planilha, sobe ao ERP como rascunho. |
| **Rascunho** | Estado da NC/ND no ERP enquanto falta o documento justificativo — não pode ser baixada. |
| **GED** | Gestão Eletrônica de Documentos: repositório onde o documento justificativo é anexado para destravar a baixa. |
| **SharePoint** | Diretório de origem onde o PDF justificativo é gerado. |
| **Chave de correspondência** | Critério que liga o PDF à NC/ND — por nome de arquivo (nº da nota) ou por conteúdo (a confirmar). |
| **Fila de exceções** | PDFs sem correspondência automática, roteados para supervisão do analista. |

## Transversais

| Termo | Definição |
|-------|-----------|
| **Human-in-the-loop** | Princípio: a solução faz o mecânico e audita; o analista decide o que exige julgamento. |
| **Trilha de auditoria** | Registro persistido de toda ação (quem, quando, o quê), de sistema e de usuário. |
| **Multi-filial** | As soluções operam sobre todas as filiais, não apenas uma. |
| **Diagnóstico / baseline** | Primeira semana de cada frente: confirma escopo e levanta métricas para apurar ROI. |
