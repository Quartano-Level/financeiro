# SISPAG — perguntas para a reunião de segunda (2026-07-13)

> **Contexto:** as ferramentas de integração das DUAS pernas já estão construídas e validadas em HML
> (ida = gerar remessa `.REM` no fin015; retorno = subir o `.RET` no fin052 → baixa). O que falta para
> **fiar o fluxo real** é: (a) ver como a analista faz o passo a passo na tela, (b) as exceções, e
> (c) dois artefatos (um HAR e um `.RET` de exemplo). Linguagem não-técnica nas perguntas; os pedidos
> técnicos estão marcados **[PEDIDO]**.
>
> Fontes: `sispag-fin015-exploration.md` (ida) + `sispag-fin052-exploration.md` (retorno).

---

## BLOCO A — Analista operacional (quem finaliza os lotes / dá as baixas)

### Perna de IDA — gerar o lote e a remessa (tela "Geração de Lotes SISPAG" / fin015)

**A1. Como você monta um lote de pagamento hoje, do começo ao fim?**
Passo a passo: cria o lote, escolhe a conta de onde sai o dinheiro, e **como puxa os títulos** pra dentro
do lote? (queremos reproduzir exatamente esse fluxo automaticamente a partir dos títulos que já
selecionamos no nosso painel).

**A2. A forma de pagamento (boleto / TED / crédito em conta / PIX) — de onde vem?**
É do **cadastro do favorecido** (já vem pronto) ou **você escolhe na hora** de importar cada título?
> *Por que perguntamos:* essa informação (a "modalidade") **não aparece** na lista de títulos a pagar,
> mas é **obrigatória** para importar o título no lote — foi o único ponto que não conseguimos fechar
> sozinhos em teste.
> **[PEDIDO 1]** Se possível, **deixe a gente gravar a sua tela** enquanto você **importa 1 título e
> gera 1 remessa** (do início ao fim, uma vez). Isso fecha esse ponto de vez.

**A3. Conta pagadora — qual banco paga o quê?**
O padrão é o **Itaú** (agência 0641 / conta 55795-4)? Quando um pagamento sai por **outro banco**
(Santander, etc.)? Existe uma **regra** de qual título vai por qual conta, ou é caso a caso?

**A4. Pagamentos ao exterior (internacional).**
Nosso entendimento: pagamento ao exterior é **câmbio** (feito no módulo de Comércio Exterior), **não**
passa por esse fluxo de lote/remessa do SISPAG — que é só **nacional**. Está correto? O câmbio continua
sendo feito à parte por vocês, e a gente cuida só do nacional? *(Ou vocês querem que a gente automatize
o câmbio também, num projeto separado?)*

**A5. Data de débito.**
Confirmando: vocês pagam com débito no **mesmo dia** em que finalizam o lote? Tem algum caso de
**agendar** para uma data futura?

### Perna de RETORNO — dar a baixa a partir do retorno do banco (tela "Retorno de Bancos Pagfor" / fin052)

**A6. [PEDIDO 2] Um arquivo `.RET` de exemplo.**
Precisamos de **um arquivo de retorno real** que o banco devolveu (o "par" do arquivo de remessa que
vocês enviam). É com ele que a gente testa a **baixa automática**. Pode ser de qualquer pagamento já
concluído — só precisamos do arquivo.

**A7. Como você processa o retorno hoje, do começo ao fim?**
Você sobe o arquivo do banco na tela, clica **"processar"** e ele **dá as baixas sozinho**? Tem um passo
de **"liberar títulos"** depois? Ou é tudo automático no "processar"?
> **[PEDIDO 3]** Idealmente, **deixe a gente gravar a sua tela** enquanto você **processa um retorno**
> (subir + processar + liberar, se houver). Igual ao pedido da remessa.

**A8. Retorno rejeitado / parcial.**
Quando o banco **rejeita** um pagamento (ex.: dados do favorecido errados, conta inválida), como você
trata hoje? Corrige o cadastro e **reenvia**? Fica marcado em algum lugar?
> *Por que perguntamos:* nos lotes de teste, vários pagamentos voltaram **rejeitados por cadastro** — se
> isso é comum, a gente precisa **sanear o cadastro antes de enviar** (parte do escopo).

---

## BLOCO B — Ricardo (TI) / quem cuida da integração Nexxera

**B1. O caminho exato da pasta / SharePoint.**
Onde exatamente o **Nexxera larga o retorno (`.RET`)** e de onde ele **pega a remessa (`.REM`)**?
Precisamos do caminho (pasta de rede? SharePoint? qual?) para o nosso robô **ler o retorno** e
**deixar a remessa**. É a última milha do transporte.

---

## Checklist de artefatos a sair da reunião

- [ ] **[PEDIDO 1]** HAR/gravação da tela: **importar título + gerar remessa** (fin015) — fecha a "modalidade".
- [ ] **[PEDIDO 2]** Um **`.RET` de exemplo** (retorno real do banco) — destrava toda a perna de baixa.
- [ ] **[PEDIDO 3]** HAR/gravação da tela: **processar retorno** (fin052) — fecha `processar`/`liberar`.
- [ ] **[B1]** Caminho da **pasta/SharePoint** de remessa e retorno (Ricardo).

## Decisões que dependem das respostas (uso interno)
- **A2/A3** → como o serviço monta o item do lote (modalidade por título) e roteia a conta pagadora (Santander = exceção).
- **A4** → se formamos lote internacional para o SISPAG ou só visibilidade (câmbio à parte). Hoje: só nacional gera remessa.
- **A6/A7/A8** → destrava o serviço de orquestração do retorno (poller → carregar → processar → baixa → tratar rejeitado). Esqueleto já pronto em `RetornoOrquestracaoService` (TODOs).
- **B1** → o reader de pasta do poller (hoje no-op).
