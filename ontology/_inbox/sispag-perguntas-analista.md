# SISPAG — Roteiro de pergunta ao analista (cravar a decisão do transporte)

> **Objetivo:** cravar UMA decisão — se precisamos (ou não) de um canal de transporte tipo Nexxera.
> Toda a demais funcionalidade (montar lote, gerar remessa, ler retorno, dar baixa) o Conexos já faz.
> Linguagem para o analista financeiro (não-técnica). Copiar/colar em e-mail, WhatsApp ou levar à reunião.

---

## A pergunta decisiva (comece por ela)

> **Quando vocês pagam um título de importação: como o arquivo de remessa chega ao banco hoje?**
> Vocês geram o lote de pagamento no Conexos (tela "Geração de Lote SISPAG"), baixam o arquivo de
> remessa e **sobem manualmente no portal/internet banking do banco** — ou existe algo automático
> (um robô, a Nexxera, uma integração direta) que já envia esse arquivo pro banco sem alguém subir na mão?

Só isso já resolve 80% da decisão. As perguntas abaixo confirmam o resto.

---

## Roteiro completo (6 perguntas objetivas)

**1. Envio ao banco (a decisiva):**
Hoje, o arquivo de remessa de pagamento é enviado ao banco **manualmente** (alguém baixa e sobe no
portal do banco) ou **automaticamente** (robô/Nexxera/integração direta)? Se automático, quem/o quê faz?

**2. Retorno do banco:**
E o **retorno** do banco (a confirmação de que pagou) — vocês **baixam do banco e sobem no Conexos** na
mão, ou ele entra sozinho? Em quanto tempo depois do envio (mesmo dia? dia seguinte?)?

**3. O quebra-cabeça central — por que quase ninguém usa a remessa:**
Reparamos que a **grande maioria dos pagamentos é baixada direto no Conexos, sem gerar remessa** (o
fluxo de "Geração de Lote SISPAG" aparece pouquíssimo). Por quê? Vocês pagam a maior parte **por fora**
(portal do banco, PIX, TED manual) e só **registram a baixa** no Conexos depois? Ou a tela de lote é
trabalhosa/pouco prática e por isso é evitada?

**4. Quais bancos/contas usam remessa de fato:**
Existe algum banco ou tipo de pagamento em que vocês **usam a remessa** (Itaú? Santander?) e outros em
que é **sempre manual**? Se sim, quais?

**5. Onde dói de verdade (o gargalo do "pagamento que não sai"):**
Quando um pagamento aprovado deixa de sair no prazo (e vira multa/juros), o gargalo costuma ser:
(a) **montar/organizar** o que tem que pagar no dia, (b) **enviar** ao banco, (c) **dar a baixa** no
Conexos depois, ou (d) **falta de visibilidade** (ninguém viu que estava vencendo)? Qual desses mais?

**6. A palavra "Nexxera" pra vocês:**
Quando falam em Nexxera, é pra **pagamento** (enviar remessa ao banco) ou pra **conciliação de extrato**
(trazer o extrato bancário pro Conexos)? Ela hoje **envia pagamento** pra vocês, ou não?

---

## Como cada resposta muda o rumo (uso interno — não mandar ao analista)

| Se a resposta for… | Então… |
|---|---|
| **Envio é manual** (P1) e não querem automatizar o envio | **Nexxera desnecessária.** Kavex orquestra o motor nativo: painel diário + montagem assistida + gate + cadência + monitoramento. |
| **Envio é manual** (P1) e **querem** automatizar | Add-on pequeno de transporte (Nexxera **ou** SFTP/API do banco) — não é o coração do escopo. |
| **Envio já é automático** (robô/Nexxera) | Não integrar nada de transporte; só **orquestrar + monitorar** o que já roda. |
| **Pagam por fora e só registram baixa** (P3=a) | O escopo vira **assistir a baixa direta** (99% do volume), não a remessa. Reframe grande. |
| **Remessa só em alguns bancos** (P4) | Escopo de remessa se estreita a esses; o resto é baixa direta. |
| **Gargalo = visibilidade** (P5=d) | Reforça que o valor é **painel + cadência + alerta**, não geração de arquivo. |

> Origem técnica desta pauta: [`sispag-native-vs-nexxera.md`](./sispag-native-vs-nexxera.md) (evidência
> de produção + specs). O "hop de transporte" (passos 6–7) é o único elo que o Conexos não faz nativo.
