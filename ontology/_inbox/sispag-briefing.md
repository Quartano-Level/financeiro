# SISPAG (Escopo II) — Briefing da operação + lacunas para a reunião

> **Uso:** documento de abertura para a reunião de diagnóstico com o analista do Financeiro.
> Consolida tudo que já levantamos (proposta + ontologia + doc Conexos + **sondagem read-only ao vivo no
> Conexos PRD**). Data: 2026-07-07. Docs-fonte no mesmo `_inbox/`:
> [`sispag-context-map`](./sispag-context-map.md) · [`sispag-native-vs-nexxera`](./sispag-native-vs-nexxera.md) ·
> [`sispag-perguntas-analista`](./sispag-perguntas-analista.md).

---

## 1. Contexto — o que é o Escopo II (em 5 linhas)

Automatizar a execução de **pagamentos de importação** para que **nenhum pagamento aprovado deixe de
sair no prazo** (evitar multa/juros). Fluxo-alvo (raias da proposta): a solução **monta o lote diário**
de títulos a pagar → a **analista revisa e finaliza** (é o gatilho, human-in-the-loop) → a solução
**envia a remessa ao banco, monitora o retorno e concilia a baixa** no ERP. Integra **Conexos** (ERP) e,
supostamente, **Nexxera** (gateway bancário). Auditoria em tudo. Prazo da proposta: 4 semanas.

## 2. A descoberta que redefine o escopo (validada em produção)

Sondamos o Conexos PRD (só leitura) e cruzamos com as specs. **O ERP já executa o fluxo SISPAG inteiro
nativamente — EXCETO o transporte do arquivo banco⇄Conexos.**

| Fato (evidência de produção) | O que significa |
|---|---|
| O ERP **gera a remessa CNAB** nativamente (`fin015`, arquivo `PG*.REM`) e **ingere retorno + grava baixa** (`fin052`→`fin010`). | Não há o que "construir" de remessa/retorno/baixa — já existe. |
| **17 lotes SISPAG reais** (Itaú/Santander, envio confirmado, analistas FLAVIA/RENE). | O motor funciona e é usado — em pequena escala. |
| **`vldHasRemessaPgto=0` em ~100%** dos borderôs (amostra 500/filial) — 99% das baixas são **DIRETAS**. | O fluxo de remessa SISPAG é a **exceção**; a operação real é baixa direta. |
| **`fin143` "Nexxera" = importador de EXTRATOS** (`EXT_*.RET`), não transmissor de remessa. `conVldEnviaNexxera` é do lado cobrança. | "Integrar Nexxera do zero" (premissa da proposta) **não bate** com a realidade. |
| **Não existe endpoint nativo que entregue a remessa ao banco** (só o lado cobrança tem transmit). | O único elo faltante é o **transporte** (passos 6–7 abaixo). |

**Aprovado para baixa (era "a confirmar"): RESOLVIDO** → são as flags de alçada `titVld1/2/3libera`
no título (`com308`), com quem/quando por nível.

### Onde o Conexos "para" (o gap)
```
… monta lote (fin015) → gera PG*.REM → [DOWNLOAD] ⇢ 6. entrega ao banco  ⇢ 7. traz retorno ⇢ [UPLOAD fin052] → baixa (fin010)
   ─────────── nativo ───────────                    └──── SEM endpoint nativo (externo) ────┘        ──── nativo ────
```

## 3. A conclusão de arquitetura (para defender, se preciso)

- **NÃO reconstruir CNAB/remessa/retorno/baixa** — duplicaria o nativo, com o risco da homologação
  bancária (que já está paga: há remessa gerada e envio confirmado em produção).
- **"Precisa Nexxera?" reduz-se ao transporte (passos 6–7)** — e só se hoje for manual e quisermos automatizar.
- **O valor da Kavex é orquestração + visibilidade + cadência** sobre o motor nativo: painel diário,
  montagem assistida, gate de finalização, monitoramento de envio/retorno, alertas, auditoria e o
  **scheduler diário que hoje não existe** — não um gerador de arquivo paralelo.

## 4. 🔑 Lacunas a validar AMANHÃ com o analista (ordenadas)

**A pergunta que decide o escopo (começar por ela):**
> **Como o arquivo de remessa de pagamento chega ao banco hoje?** A analista baixa o arquivo do Conexos
> e **sobe manualmente no portal do banco**, ou algo **automático** (robô/Nexxera) já envia?

Depois, confirmar:
1. **Transporte de envio** (a decisiva): manual (portal) ou automático? Quem/o quê faz?
2. **Retorno**: entra sozinho no Conexos ou a analista sobe na mão? Em quanto tempo (D0/D+1)?
3. **O quebra-cabeça**: por que **99% das baixas são diretas** (sem remessa)? Pagam por fora
   (portal/PIX/TED) e só **registram a baixa**? Ou a tela de lote é trabalhosa e por isso evitada?
4. **Quais bancos/contas** usam remessa de fato (Itaú/Santander?) e quais são sempre manuais.
5. **Onde dói** quando um pagamento atrasa: (a) montar, (b) enviar, (c) baixar, ou (d) **falta de
   visibilidade**? — calibra onde a automação agrega.
6. **"Nexxera" pra vocês** é pagamento (enviar remessa) ou conciliação de extrato? Ela envia pagamento hoje?
7. **Alçada**: quantos níveis de liberação (`titVld1/2/3libera`) a Columbia usa de fato? Quem finaliza o lote?
8. **Corte do banco**: horário-limite para envio do lote no dia.

**Baseline/ROI a pedir** (proposta §7.2): multa/juros por atraso nos últimos 12 meses (métrica central),
volume de pagamentos/dia, quantos não saem no prazo hoje, tempo gasto montando o lote manualmente.

### Como cada resposta muda o rumo (uso interno)
| Resposta | Rumo |
|---|---|
| Envio manual + não querem automatizar | Nexxera desnecessária; Kavex orquestra o nativo (painel+gate+cadência). |
| Envio manual + querem automatizar | Add-on pequeno de transporte (Nexxera **ou** SFTP/API do banco). |
| Envio já automático (robô) | Só orquestrar + monitorar o que já roda. |
| Pagam por fora e só registram baixa | Escopo vira **assistir a baixa direta** (99% do volume) — reframe grande. |
| Gargalo = visibilidade | Valor = painel + cadência + alerta, não geração de arquivo. |

## 4.1 Respostas recebidas — Ricardo (TI Columbia), áudio 2026-07-07

Contato: **Ricardo** = lado **técnico** (envio/retorno junto à Nexxera). **Flávia** (financeiro) = lado
**operacional** (bancos, como pagam) — contato via **Yuri**. *(Flávia = a `FLAVIA_SANTOS` que finaliza os
lotes reais na sondagem — é a operadora do processo.)*

| Pergunta | Resposta do Ricardo |
|---|---|
| Contrato Nexxera cobre pagamento ou só extrato? | **Pela leitura dele, hoje é SÓ EXTRATO.** Vai **agendar reunião com a Nexxera** pra confirmar o que o contrato inclui. ⏳ (bate com o `fin143` = extrato). |
| Como pagam hoje? | **Manual pelo portal do banco** (ex.: Itaú). O robô do Conexos só faz o **extrato** (via API). |
| Quais bancos? | Não sabe — **perguntar à Flávia**. |
| Apetite/mecanismo desejado? | **Arquivo em pasta de rede + VAN Nexxera** (ver §4.2). |

## 4.2 🎯 Arquitetura-alvo do transporte (hipótese validada com o Ricardo)

O Ricardo desenhou o mecanismo desejado — **baseado em ARQUIVO numa pasta de rede**, não em API por banco:

```
Conexos (fin015 gera remessa PG*.REM) ──▶ PASTA DE REDE ──▶ VAN Nexxera pega ──▶ banco processa
                                                                                     │
        baixa no Conexos (fin052) ◀── PASTA DE REDE ◀── arquivo de retorno ◀────────┘
```

- **Pasta de rede é o mecanismo preferido** ("a princípio, pasta seria o mais indicado"). A **VAN da
  Nexxera pega o arquivo da pasta**, envia ao banco, e devolve o **retorno na mesma pasta**. Um **RPA**
  entra só se a VAN não fizer o pickup sozinha.
- **Implicação (baixo risco do nosso lado):** a integração é **drop/read de arquivo em pasta** — colocar
  o `PG*.REM` na pasta e ler o retorno da pasta (→ `fin052`). **Sem homologação de API banco-a-banco do
  nosso lado**; a VAN abstrai os bancos. A parte pesada (pasta↔Nexxera) é da VAN.
- **Confirma a tese:** NÃO reconstruímos remessa/retorno/baixa (Conexos faz nativo); falta só a **ponte
  de arquivo** + **orquestração/cadência** + **painel/gate/visibilidade**.

**Ainda aberto:** (1) contrato cobre pagamento? (Ricardo→Nexxera); (2) bancos + arquivo-vs-digitação
(Flávia); (3) a VAN faz o pickup da pasta sozinha ou precisa de RPA; (4) como o `PG*.REM` sai do Conexos
pra pasta (export nativo do ERP vs. nossa automação chamando o download do `fin015`).

**Leitura atualizada "precisa Nexxera?":** **provavelmente SIM**, como **VAN de transporte via arquivo** —
gate = contrato cobrir pagamento. Integração do nosso lado é **simples (pasta)**. O "Nexxera é ruim de
retorno" (suporte lento) reforça tratá-la como **última milha**: construir todo o valor antes e plugar o
transporte quando o contrato/VAN estiver pronto.

## 5. O que já existe (não começamos do zero)

- **Diagnóstico read-only** completo (probes `src/backend/jobs/probe-sispag*.ts`; saídas em `/tmp/sispag-probe*`).
- **Esboço funcional** (spike, branch `spike/sispag-painel-readonly`, **não commitado**): endpoint
  read-only `GET /sispag/painel` + página `/sispag` (KPIs, fluxo de raias, abas Títulos/Lotes/Borderôs,
  "montar lote" **simulado** — zero escrita). Dados ao vivo do Conexos.
  - Rodar: `PORT=3001 npm --prefix src/backend run dev` + `PORT=3000 npm --prefix src/frontend run dev` → `http://localhost:3000/sispag`.
- **Reuso pronto da Frente I (Permutas):** doutrina de escrita irreversível (idempotência + ledger
  write-ahead + gating dry-run/HML-first), padrão de lote, máquina de estados do borderô, auth/RBAC/auditoria.

## 6. Próximos passos (estado 2026-07-07)

**Aguardando terceiros (não bloqueiam o dev):**
1. **Ricardo → reunião Nexxera:** o contrato cobre **pagamento** (remessa) ou só **extrato**? A VAN faz
   pickup de pasta sozinha ou precisa RPA?
2. **Flávia (via Yuri):** quais **bancos** vocês pagam? Hoje **sobem um arquivo** no portal ou **digitam**
   um a um? Volume/dia, horário de corte.

**Podemos andar já (independe da Nexxera):**
3. Formalizar a **Fatia 1** via `/feature-new` (worktree + entrevista + ontologia), promovendo o spike a
   código de verdade — **painel read-only** (zero risco), que vale em qualquer cenário.
4. Fatia 2: **montagem assistida do lote + gate de finalização** (dirigindo `fin015`, dry-run).
5. **Transporte (última milha, depende do contrato Nexxera):** exportar `PG*.REM` do Conexos → pasta de
   rede; ler retorno da pasta → `fin052`. Só desenhar após confirmar o contrato + o mecanismo da VAN.

Escrita real (Fatia 3) reusa o gating de Permutas (dry-run + HML-first).

> **Riscos herdados que o SISPAG ativa** (migration-debt): **O4** — não há runtime de scheduler para a
> cadência diária + polling do retorno; **O7** — client/config Nexxera inexistentes (só se o §4 confirmar
> necessidade); **LGPD** — endurecer redação de logs antes de dados bancários/valores entrarem.
