# SISPAG (Escopo II — Automação de Pagamentos) — Mapa de Contexto & Diagnóstico

> **Status:** pré-entrevista / mapeamento. **NÃO é ontologia aprovada** — é o insumo de contexto
> para as reuniões de diagnóstico com os analistas do Financeiro da Columbia. Nada aqui foi modelado
> em entidade/ação; a modelagem formal nasce depois, via `/feature-new` (OfficeHoursInterviewer →
> OntologyCurator).
>
> **Data:** 2026-07-06 · **Autor do levantamento:** pipeline `/feature-new` (fase de contexto) ·
> **Fontes:** `docs/proposta/Proposta_Kavex_Columbia_Financeiro.{md,pdf}`,
> `docs-contexto/03_ontologia_financeiro.md`, `ontology/**`, `docs/conexos-api/**`, `src/backend/**`.

---

## 1. O que é o Escopo II (uma frase)

Garantir que **nenhum pagamento aprovado deixe de ser executado por falha de processo** —
automatizando a montagem do lote diário, o envio da remessa ao banco, o monitoramento do retorno e a
conciliação da baixa no ERP. **Human-in-the-loop:** a **finalização do lote pela analista é o gatilho**
que dispara o processamento. A *decisão* do que pagar (aprovação para baixa) permanece humana, no
Conexos — **fora de escopo automatizar a decisão**, só executar.

**Prazo estimado (proposta):** 4 semanas · **Sequenciamento:** 2º mês (Permutas → **SISPAG** → Popula GED).

## 2. Fluxo canônico (raias da proposta, pg. 7 do PDF)

```
SOLUÇÃO (auto)   ── Monta lote ─────────────────────►──── Envia e monitora ────►
                   (a vencer, aprovado / com298)            (remessa → banco → retorno)
                          │                                          ▲
ANALISTA (controle) ──► Revisa e finaliza ──(GATE)───────────────────┘
                        (ajusta títulos: inclui/remove)
BANCO / ERP (result.) ─────────────────────────────────────────► Pago e baixado (retorno → ERP)
AUDITORIA ── transversal a tudo (quem aprovou, ajustou, finalizou) ──────────────
```

Sequência: **solução monta → analista finaliza (gatilho) → solução envia remessa/monitora retorno →
baixa conciliada no ERP**. Auditoria completa em todas as etapas.

---

## 3. ⚠️ GARFO ARQUITETURAL CENTRAL (a decisão que reordena todo o escopo)

A proposta descreve "gera a remessa, sobe no diretório **Nexxera**, monitora o retorno". Mas a doc do
Conexos revela que **o próprio Conexos já tem um motor SISPAG nativo**:

| Controller | Papel | Evidência (doc) |
|---|---|---|
| **`fin015`** — Geração de Lote SISPAG | monta lote, importa títulos/borderôs pendentes, **gera a remessa CNAB** (`gerArquivosBancos/gerarRemessa`, campo `gabLngDados` = conteúdo do arquivo), finaliza/cancela/estorna lote | `090-fin0.json`, `navigation-menu.md:113-116` |
| **`fin052`** — Retorno de Bancos Pagfor | carrega/processa/libera o **retorno** bancário | `090-fin0.json`, `navigation-menu.md` |
| **`fin143`** — Importação **Nexxera** | via de **importação** separada (Nexxera como hub externo cujos arquivos são importados) | `navigation-menu.md:143` |
| `fin010` — Baixa de Títulos a Pagar (borderô) | registra a **quitação/baixa** efetiva; `fin015` linka de volta | live-verified (`screens/fin010.md`) |
| `ger012`/`ger015` | scripts de remessa/retorno p/ bancos (camada de layout) | `navigation-menu.md:300-301` |

**Nexxera NÃO é o gerador da remessa** na doc do Conexos — é um importador (`fin143`). O SISPAG/CNAB é
gerado pelo `fin015`. Isso cria **três desenhos possíveis** que as reuniões precisam desambiguar:

- **Opção A — "dirigir o Conexos":** a automação **pilota o `fin015`/`fin052`** do ERP (monta lote,
  manda gerar remessa, lê retorno, concilia baixa). Reusa toda a inteligência de layout do ERP; a
  Kavex orquestra. *Menor risco de leiaute, maior acoplamento ao ERP.*
- **Opção B — "gerar o CNAB nós mesmos + Nexxera":** a automação **gera o arquivo de remessa** (CNAB
  240/400) e sobe no **diretório Nexxera**, lê o retorno de lá, e só a **baixa** toca o ERP (`fin010`).
  É o que a proposta literalmente descreve. *Maior controle, mas assume o risco/homologação do
  leiaute — a "premissa crítica" da proposta.*
- **Opção C — híbrido:** ERP monta/gera (fin015), Nexxera é o **canal de transporte** ao banco, retorno
  volta via `fin052`/`fin143`. 

> **Esta é a pergunta nº 1 das reuniões.** Ela decide se o SISPAG é majoritariamente "integração com a
> Nexxera do zero" (proposta) ou "orquestração do fin015 do Conexos" (doc). O esforço, o risco de
> terceiro (homologação bancária) e as entidades a modelar mudam conforme a resposta.

---

## 4. Superfície de pagamentos no Conexos (o que já está documentado)

**"Título aprovado / a pagar" — como o estado é representado** (era "a confirmar no diagnóstico"):
- **Documento** (`com298`, DTO `FinDocCab`): `docVldSituacao`/`vldStatus` = `FINALIZADO` (vs `EM CADASTRO`),
  `vldAutorizado`, `vldProcLiberado`, `docVldTipo`.
- **Título/parcela** (`com308` detalhe, DTO `FinTituloFin`): aprovação-para-pagamento = **flags de
  liberação por alçada** (1–3 níveis): `titVld1libera`/`titVld2libera`/`titVld3libera` (+ `Tim*`/`Usn*`
  = quando/quem). Downstream: `titVldEnviaBanco`, `titDtaEnvioBanco`, `titVldRetBanco`, `titVldStatus`
  (aberto/pago/permutado), `vldBordero`, `titNumRemessa`, `titEspCodbar` (cód. barras), `titDtaVencimento`.
- **Máquina de bloqueio/liberação:** `fin102` (regras de bloqueio), `fin103` (liberação de títulos),
  `fin106` (liberações/alçadas), `fin007/liberar/{docTip}/{docCod}/{titCod}`, e toggle via
  `com308 .../infoTitulo/trocaBloqueio`.

**Leitura de títulos a pagar (read model):** `psq014` (bank data, PIX, baixas), `com308`
(`financeiroAPagar/list/{docCod}`), `com311` (parcelas: `titEspNumero`, `titDtaVencimento`,
`titMnyValor`, `titVldStatus`).

**Modalidade de pagamento** (PIX/TED/boleto): `com308 modalidadePag/list` + validações
`validacao/codigoBarras|modalidadePix|modalidadeTed` (também em `fin015`).

**Escrita/execução:** `fin015` (lote→remessa), `fin052` (retorno→liberar), `fin010` (baixa/borderô,
`POST /api/fin010/baixas`, `baixaAutomatica/confirmar`), `com253/docsAPagar/gerar`, `fin007/liberar`.

> **Caveat de confiança:** só `com298`/`fin010`/`fin014` são **live-verified**. `com308`/`com311` são
> `status: seed` (schema do swagger, UI não confirmada). `fin015`/`fin052`/`fin143`/`fin102-106`
> **não têm `screens/*.md`** — existem só no JSON OpenAPI e no menu. O leiaute CNAB exato
> (`GerArquivosBancos.layoutConta`, campos `gabEsp*`) só se especifica **inspecionando ao vivo**.

---

## 5. O que REUSAR da Frente I (Permutas) — já pronto no código

A arquitetura DDD de Permutas (`src/backend/domain/`) é copiável quase 1:1:

- **Camadas:** `routes/permutas.ts` → `domain/service/permutas/*` → `domain/repository/permutas/*` →
  `ConexosBaixaClient` (compõe `ConexosBaseClient`). Para SISPAG: `routes/sispag.ts` →
  `domain/service/sispag/*` → `domain/repository/sispag/*` → novo `ConexosSispagClient`.
- **Doutrina de escrita irreversível** (`fin010-write-contract.md` + `idempotencia-reconciliacao.md`):
  escrita que não pode duplicar vai por `postGenericOnce` (**sem RetryExecutor, sem 401-retry**),
  Zod-valida a resposta pra confirmar o id, e persiste num **ledger write-ahead** com `idempotency_key`
  UNIQUE (espelho de `permuta_alocacao_execucao`: `pending → reconciling → settled/error`, com
  `request_payload`/`erp_response` JSONB). **Idêntico ao que a remessa/baixa SISPAG precisa.**
- **Gating:** `EnvironmentProvider.conexosWriteEnabled` + `conexosDryRun` (default DRY-RUN ON),
  homologação-first (`CONEXOS_BASE_URL=…-hml.conexos.cloud`), `requireRole('admin')` +
  `heavyRouteLimiter` nas mutações, guard de ownership por `filCod` da trilha (anti confused-deputy).
- **Padrão de lote:** `ReconciliacaoLotePermutaService` (cap `LOTE_MAX`, sequencial,
  **continue-on-error**, skip-on-idempotency, resultado agregado, subset do cliente ∩ set autoritativo
  do servidor). É o esqueleto da "montagem/execução do lote SISPAG".
- **Máquina de estados do borderô** (`status-permuta-bordero.md`: `pendente →
  aguardando-finalizacao → finalizado`, com reabertura viva em cancel/estorno) — **template direto**
  para o ciclo de vida do lote SISPAG (montado → finalizado → enviado → retorno → conciliado).
- **Cache local + refresh** (`permuta_bordero`, migration 0018) — listar sem bater no ERP.
- **Sessão Conexos compartilhada** (`conexos_sessions`, 1 SID, mutex de login, `authenticatedPost` vs
  `authenticatedPostOnce`) — já resolve a "integração Conexos resiliente" do RNF.
- **Auth/RBAC/Auditoria:** JWT HS256 próprio (`app_user`, `AUTH_JWT_SECRET`), `requireRole`, ledger
  DB + `LogService` estruturado + `requestId`. **`http/redact.ts` já existe** — mas ver risco LGPD abaixo.
- **Frontend:** Next.js App Router + shadcn/ui (`Table`, `Dialog`, `Tabs`, `Badge`, `KPIGrid`),
  `lib/api.ts` centralizado, padrão de painel+abas+dialog de confirmação de lote (`AbaAutomaticas` +
  `ConfirmarLoteDialog`) — molde pronto pro "Painel diário de títulos a pagar".

## 6. O que é NET-NEW (não existe hoje)

- **Entidades:** `TituloAPagar`, `LotePagamento` (candidato/finalizado), `RemessaBancaria`,
  `RetornoBancario`. (Ontologia hoje é 100% Permutas; a `ontology-bridge` só vai até `BaixaTitulo`.)
- **Integração:** `ConexosSispagClient` (fin015/fin052/fin010-a-pagar) e/ou **cliente Nexxera** +
  `integrations/nexxera.md` + config `nexxera_credentials` (SSM/env). → **migration-debt O7 (OPEN)**.
- **Runtime de job/scheduler:** a **cadência diária** (montar lote a vencer) e o **polling do retorno**
  não têm onde rodar hoje (Express request/response). → **migration-debt O4 (OPEN)** — decisão de
  arquitetura (cron externo? EventBridge alvo? job process no Render?).
- **Máquina de estados** do lote → remessa → retorno → baixa.
- **Ações:** montar-lote, finalizar-lote (gate), gerar/enviar-remessa, monitorar-retorno, conciliar-baixa.
- **Regras de negócio:** representação de "aprovado para baixa" (§4), **janela de corte** do banco.
- **LGPD:** o logger global imprime body cru — já pré-sinalizado (`pii-redact-logger`, sec-4) como vetor
  **quando valores/dados bancários do SISPAG entrarem**. Endurecer a redação antes de dados de pagamento.

---

## 7. Questionário de diagnóstico (para as reuniões) — pelos 4 eixos da entrevista

### Eixo INTEGRAÇÃO (o mais crítico — resolve o garfo do §3)
1. **[nº 1] Dirigimos o `fin015`/`fin052` do Conexos, ou geramos o CNAB nós mesmos e usamos a Nexxera?**
   (Opção A / B / C do §3.) Quem hoje gera a remessa: um analista dentro do Conexos, ou fora dele?
2. Qual **banco(s)** e qual **leiaute** (CNAB 240 / 400 / Pagfor / PIX)? Há mais de um banco/conta?
3. A Nexxera é **diretório de arquivos** (SFTP/pasta) ou **API**? Quem tem as credenciais/homologação?
4. **Horário de corte** do banco para envio do lote? (proposta 7.1 — a confirmar)
5. Como o retorno chega e em quanto tempo (D0/D+1)? Retorno parcial (alguns títulos rejeitados) existe?

### Eixo ENTIDADE (o que é um "título a pagar aprovado" e um "lote")
6. Confirmar que "aprovado para baixa" = flags `titVld1/2/3libera` (alçada) + não bloqueado + a vencer.
   Quantos níveis de alçada a Columbia usa de fato?
7. Um lote agrupa por **filial? banco? conta? data de vencimento?** Um título pode estar em >1 lote?
8. Multi-título por documento (parcelas) — como o analista escolhe quais parcelas entram? (`com311`)
9. Modalidades em jogo: PIX, TED, boleto, câmbio (fornecedor exterior)? Cada uma muda o fluxo?

### Eixo AÇÃO (o que a analista faz vs. o que a solução faz)
10. "Revisa e finaliza": a analista **inclui/remove títulos** de um lote pré-montado. Ela pode **editar
    valor/data**? Ou só incluir/excluir?
11. A **finalização** é irreversível? Existe "reabrir lote" antes do envio? E depois do envio (estorno)?
12. Quem pode finalizar (perfil/alçada)? Precisa de duplo-controle (maker-checker)?
13. Conciliação da baixa: automática total, ou a analista revisa divergências do retorno?

### Eixo INVARIANTE (o que nunca pode quebrar)
14. **Nunca pagar duas vezes** — qual a chave natural de idempotência de um pagamento?
    (`docCod:titCod:borCod`? número da remessa?) — espelhar `idempotency_key`.
15. Nunca enviar título **não aprovado / bloqueado** no lote.
16. Multi-filial: um lote é sempre de uma filial só, ou pode cruzar filiais?
17. Trilha de auditoria: registrar quem aprovou, ajustou, finalizou (já é RNF).
18. Homologação-first: **nenhuma escrita/envio real antes de validar em HML** (mesma doutrina de Permutas).

### Baseline / ROI (proposta §7.2 — números para as reuniões trazerem)
- Volume de pagamentos processados por dia.
- **Multa/juros por atraso nos últimos 12 meses — valor acumulado** (métrica central de ROI).
- Qtd. de pagamentos que não saem no prazo hoje por dificuldade de baixa.
- Tempo gasto hoje na montagem manual do lote.

---

## 8. Riscos herdados (migration-debt) que o SISPAG ativa
- **O3 (Risco arquitetural #1):** escrita no ERP. Permutas já abriu o caminho `fin010`; SISPAG amplia
  para `fin015`/`fin052` (ou CNAB próprio). Doutrina de escrita já existe — reusar, não reinventar.
- **O4 (OPEN):** sem runtime de job/scheduler. Cadência diária + polling de retorno precisam de casa.
- **O7 (OPEN):** Nexxera inexistente (sem client, sem config).
- **LGPD (sec-4):** endurecer redação de logs antes de dados bancários/valores de pagamento.
- **Dependência de terceiro (proposta):** homologação do leiaute bancário depende do cronograma do
  banco — **fora do controle da Kavex**; condiciona os marcos de envio/conciliação.

## 9. Fatiamento tentativo (a validar na entrevista — NÃO comprometido)
1. **Read-only + Painel:** ler títulos a pagar aprovados/a-vencer (`com308`/`com311`/`psq014`), expor
   painel diário com filtros e aging. Zero escrita. (Espelha "Permutas Fatia 1".)
2. **Montagem de lote (local):** montar/ajustar/finalizar lote em estado local (`lote_sispag` +
   `lote_item`), sem tocar banco/ERP. Gate de finalização + auditoria.
3. **Remessa (garfo do §3):** gerar/enviar remessa — via `fin015` (A) ou CNAB+Nexxera (B). **DRY-RUN +
   HML-first.** Ledger write-ahead + idempotência.
4. **Retorno + conciliação:** ler retorno (`fin052`/Nexxera), conciliar baixa (`fin010`), fechar o ciclo.
5. **Cadência/scheduler (O4):** automatizar a montagem diária + polling do retorno.

> Fase 2 (proposta): monitorar documentos "dormindo" (a vencer sem aprovação) com follow-up automático.

---

## Próximos passos
- [ ] Reuniões de diagnóstico com analistas → responder o §7 (prioridade absoluta ao garfo §3).
- [ ] Confirmar credenciais/acesso HML do Conexos p/ `fin015`/`fin052` e/ou Nexxera.
- [ ] Sondar ao vivo o leiaute CNAB (`GerArquivosBancos`/`layoutConta`) se a Opção A/C.
- [ ] Só então rodar `/feature-new` de verdade (worktree + OfficeHoursInterviewer) sobre a Fatia 1.
