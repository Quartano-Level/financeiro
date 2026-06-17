# Automação Financeira — Kavex × Columbia Trading

**Proposta de escopo e modelo de engajamento — Área Financeira**

---

## 1. Sumário executivo

A área Financeira da Columbia opera sobre três frentes onde o processo manual hoje gera o mesmo tipo de exposição: dado que não fecha, pagamento que não sai e documento que não destrava. Em cada uma, a perda não fica no operacional — ela chega à controladoria como relatório inconsistente, ao caixa como risco de multa e ao fechamento como trava.

Esta proposta cobre a automação assistida das três frentes, mantendo o analista no controle das decisões que exigem julgamento e transferindo à solução o trabalho mecânico e repetitivo:

- **Permutas (Adiantamentos ↔ Invoices)** — reconciliação em cadência diária, devolvendo à controladoria uma base confiável para decisões de capital de giro e câmbio.
- **SISPAG (Pagamentos)** — garantia de que nenhum pagamento aprovado deixe de ser executado por falha de processo, mitigando multa e juros por atraso.
- **Popula GED (Documentação de NC/ND)** — destravamento contínuo das notas presas em rascunho, desbloqueando o fechamento financeiro.

O modelo é de **alocação de capacidade e expertise** dedicada ao Financeiro da Columbia, não de horas ou headcount: a Columbia contrata o resultado e a especialização em Comex, entregues em um roadmap sequencial de 90 dias.

---

## 2. Modelo de engajamento

A Kavex aloca capacidade de engenharia e expertise de domínio em Comércio Exterior diretamente no time Financeiro da Columbia, operando como parceiro de execução. O contrato é por **capacidade e entrega**, não por tempo de um profissional específico — a Columbia adquire a especialização e o resultado.

As três frentes são entregues de forma **sequencial** ao longo dos primeiros 90 dias, com a primeira semana de cada uma dedicada a diagnóstico e ao levantamento de baseline (ver Seção 7). A capacidade remanescente do trimestre é dedicada à estabilização em produção e ao diagnóstico das evoluções de Fase 2 identificadas em cada frente.

As soluções são entregues como aplicações web dedicadas, projetadas para aderir aos padrões de arquitetura e segurança definidos pela área de Tecnologia da Columbia, com vistas à futura centralização em um portal único de operação financeira.

---

## 3. Escopo I — Automação de Permutas (Adiantamentos ↔ Invoices)

**Em uma frase:** eliminar o acúmulo silencioso de permutas pendentes entre adiantamentos (PROFORMA) e faturas (INVOICE) — hoje invisível e fonte de distorção na controladoria — automatizando os casos diretos e assistindo o analista nos casos compostos.

### Problema
Quando o adiantamento pago ao exportador não é reconciliado na cadência necessária contra o título correspondente na baixa (Conexos, fin010), o valor desembolsado fica solto no ERP. Em volume de 120–200 permutas/mês, o acúmulo é questão de tempo — e a consequência chega à controladoria como relatório que não fecha, base sobre a qual se decide capital de giro e hedge. Agravante: hoje não há visibilidade de quantas permutas estão pendentes. O problema é invisível até virar número errado na mesa da liderança.

### Outcome
Reconciliação em cadência diária e backlog de pendências elegíveis tendendo a zero. A controladoria volta a operar sobre base confiável; decisões de caixa e câmbio deixam de correr sobre dado sujo.

### Fluxo
**[Inserir na diagramação: fluxograma de raias — Analista (decisão) × Solução Kavex (automático) × Conexos/ERP (resultado), com auditoria transversal.]**

### Divisão do trabalho
- **O que o analista faz:** aprova os casos compostos (N:M), define a alocação de valores entre as múltiplas proformas e invoices, e resolve as exceções que exigem julgamento.
- **O que a solução faz:** identifica os processos com adiantamento pago e INVOICE disponível, calcula a idade de cada pendência, executa automaticamente as permutas diretas (1:1) na fin010 e registra a trilha de auditoria.
- **O resultado:** backlog visível e em queda, permuta refletida no ERP em D0/D+1, controladoria operando sobre base confiável e registro completo de quem fez o quê.

### Features
- Painel de pendências elegíveis, com a idade de cada caso (a instrumentação que cria a linha de base inexistente hoje).
- Permuta automática para casos diretos (1:1 por processo), disparada na fin010 sem intervenção.
- Interface assistida para casos compostos (N:M): o analista aloca valores entre proformas e invoices e executa com um clique.
- Fila de bloqueios visível, para pendências que dependem de terceiros (ex.: INVOICE ainda não emitida).
- Auditoria de todas as ações do sistema e dos usuários.

### Fora de escopo
Negociação comercial com o exportador; julgamento financeiro sobre divergência cambial (permanece com o analista); permutas cuja condição depende de terceiros; conciliação retroativa do passivo histórico como garantia de zerar (tratada como diagnóstico, não como promessa); alterações no fluxo de importação a montante da baixa.

### Premissas
Integração disponível com a fin010 do Conexos; o número do processo é a chave estável de vínculo; os analistas validam e operam os casos assistidos. O backlog histórico é mapeado e priorizado, mas sua eliminação total depende de condições externas (faturas pendentes de terceiros) fora do controle da Kavex.

### Critério de aceite
Backlog de permutas elegíveis reduzido a zero e mantido durante a janela de observação; permutas 1:1 disparadas sem toque manual; casos N:M resolvidos via interface em poucos cliques; cadência elegível → refletido no ERP operando em D0/D+1. Pendências bloqueadas por terceiros são reportadas, não contabilizadas como falha.

**Prazo estimado:** 4 semanas.

---

## 4. Escopo II — Automação de Pagamentos (SISPAG)

**Em uma frase:** garantir que nenhum pagamento aprovado deixe de ser executado por falha de processo, automatizando a montagem do lote, o envio ao banco e a conciliação do retorno no ERP.

### Problema
Hoje, séries de pagamentos deixam de ser executadas porque dar baixa no Conexos é trabalhoso e pouco transparente. Um pagamento de importação que não sai no prazo vira multa, juros ou trava operacional — risco financeiro direto e recorrente numa operação do porte da Columbia.

### Outcome
Nenhum pagamento aprovado deixa de ser executado por falha de processo. Lote diário montado, finalizado pela analista e conciliado no ERP sem retrabalho manual.

### Fluxo
**[Inserir na diagramação: fluxograma de raias — Analista (controle) × Solução Kavex (automático) × Banco/ERP (resultado), com auditoria transversal.]**

### Divisão do trabalho
- **O que o analista faz:** revisa o lote candidato, adiciona ou remove títulos conforme a necessidade e finaliza — mantendo a palavra final sobre o que será pago. A finalização é o gatilho que dispara o processamento.
- **O que a solução faz:** identifica diariamente os títulos a vencer e aprovados para baixa (com298), monta o lote candidato, gera o arquivo de remessa, sobe no diretório Nexxera, monitora o retorno do banco e concilia a baixa no ERP. Registra a trilha de auditoria.
- **O resultado:** pagamento executado no prazo, baixa refletida no ERP, zero pagamentos perdidos por falha de processo e registro completo de quem aprovou, ajustou e finalizou.

### Features
- Painel diário dos títulos a vencer e aprovados para baixa (com298).
- Montagem assistida do lote, com inclusão e exclusão de títulos pela analista.
- Gate de finalização, que dispara o processamento.
- Geração e envio da remessa ao diretório Nexxera.
- Monitoramento do retorno bancário.
- Conciliação automática da baixa no ERP.
- Auditoria de todas as ações do sistema e dos usuários.

### Fora de escopo
A aprovação para baixa em si (permanece com o analista, na validação teórica com o operacional — é julgamento humano); decisões financeiras sobre o que pagar; e a homologação do leiaute bancário, que é dependência de terceiro (ver Premissa crítica).

### Premissa crítica
A integração com o Nexxera/banco parte do zero. A geração de remessa e a leitura de retorno são entregues no período, mas a **homologação do leiaute junto ao banco depende do cronograma da instituição**, fora do controle da Kavex. Os marcos de envio e conciliação ficam condicionados a essa homologação.

### Critério de aceite
Lote diário montado a partir dos títulos aprovados, ajustado e finalizado pela analista; remessa gerada e enviada ao diretório Nexxera após a finalização; retorno bancário monitorado e baixa conciliada no ERP sem toque manual; zero pagamentos perdidos por falha de processo durante a janela de observação.

### Evolução (Fase 2)
Monitoramento de documentos a vencer ainda sem aprovação ("dormindo"), com follow-up automático ao responsável, antecipando travas antes do vencimento.

**Prazo estimado:** 4 semanas.

---

## 5. Escopo III — Popula GED (Documentação de NC/ND)

**Em uma frase:** destravar continuamente as Notas de Crédito/Débito presas em rascunho, anexando automaticamente ao GED o documento que as justifica.

### Problema
As NC/ND nascem em planilha e sobem ao ERP como rascunho, mas não podem ser baixadas porque falta no GED o documento que as justifique. Em volume de cerca de 300 notas/mês, isso significa um acúmulo constante de notas presas, travando o fechamento e exigindo que os analistas subam documento por documento manualmente.

### Outcome
NC/ND destravadas para baixa de forma contínua, sem manuseio manual de documento. O tempo entre a emissão da nota e sua disponibilidade para baixa cai de dias para minutos.

### Fluxo
**[Inserir na diagramação: fluxograma de raias — Solução Kavex (automático, caminho principal) × Analista (apenas exceções) × GED/ERP (resultado), com auditoria transversal.]**

### Divisão do trabalho
- **O que o analista faz:** apenas supervisiona a fila de exceções — os PDFs que não casaram automaticamente. Atuação mínima.
- **O que a solução faz:** detecta o PDF gerado no diretório do SharePoint, identifica a qual NC/ND ele corresponde e o sobe no GED, destravando a baixa. Registra a trilha de auditoria.
- **O resultado:** notas saem do limbo de rascunho automaticamente, o fechamento é desbloqueado e cerca de 300 documentos/mês deixam de passar pela mão de alguém.

### Features
- Monitoramento do diretório do SharePoint.
- Correspondência automática entre PDF e NC/ND.
- Upload no GED.
- Fila de exceções para casos sem correspondência, supervisionada pelo analista.
- Auditoria de todas as ações do sistema e dos usuários.

### Fora de escopo
A geração da NC/ND em si (continua no fluxo atual: planilha → rascunho no ERP); a baixa contábil propriamente dita (a solução destrava, não executa a baixa); casos de não-correspondência que exijam julgamento (vão para o analista).

### Premissas
O PDF é gerado de forma consistente no diretório do SharePoint; existe uma chave de correspondência identificável entre o PDF e a NC/ND (a confirmar no diagnóstico — ver Seção 7); integração disponível com o GED.

### Critério de aceite
PDFs com correspondência identificável anexados ao GED automaticamente, sem manuseio manual; casos sem correspondência roteados para a fila de exceção. *(A meta percentual será cravada após a confirmação da chave de correspondência: match por nome de arquivo permite meta de 95%+; match por conteúdo será calibrado de forma mais conservadora.)*

**Prazo estimado:** 2 a 3 semanas.

---

## 6. Requisitos não-funcionais (transversais às três frentes)

- **Segurança e acesso:** autenticação corporativa (login institucional), com controle de acesso por perfil.
- **Multi-filial:** as soluções operam sobre todas as filiais, não apenas uma.
- **Auditoria:** toda ação do sistema e dos usuários é registrada e persistida, com trilha completa (quem, quando, o quê).
- **Integração resiliente com o Conexos:** gestão de sessão, retry e tratamento de limites de chamada, garantindo robustez na operação contra o ERP.
- **Observabilidade:** monitoramento de execuções e alertas para falhas, garantindo que problemas sejam detectados antes de gerar impacto.
- **Padronização:** as soluções são projetadas para aderir aos padrões da área de Tecnologia da Columbia, facilitando a integração e a futura centralização em um portal único.

---

## 7. Diagnóstico inicial — informações a levantar

A primeira semana de cada frente é dedicada a diagnóstico. As confirmações abaixo ajustam o escopo onde necessário; as métricas de baseline permitem à Columbia **metrificar e reportar internamente o retorno** de cada solução.

### 7.1 Confirmações de escopo

| Frente | A confirmar |
|---|---|
| Permutas | O número do processo é a chave estável de vínculo entre PROFORMA e INVOICE? |
| SISPAG | Como é representado o status "aprovado para baixa" na com298? Qual o horário de corte do banco para envio do lote? |
| Popula GED | Qual a chave de correspondência entre o PDF no SharePoint e a NC/ND — nome do arquivo (com número da nota) ou conteúdo do documento? |

### 7.2 Métricas de baseline (para apurar o ROI)

**Permutas**
- Volume de permutas por mês (estimativa atual: 120–200 — confirmar).
- Tempo médio gasto por um analista para executar uma permuta manualmente.
- Quantidade média de permutas pendentes/atrasadas a qualquer momento (backlog).
- Frequência com que relatórios de controladoria são reabertos ou corrigidos por permutas não realizadas.

**SISPAG**
- Volume de pagamentos processados por dia.
- Janela de corte do banco (horário-limite para envio do lote).
- **Nos últimos 12 meses, houve multa ou juros por atraso ou não-pagamento? Qual o valor acumulado?** *(métrica central de ROI.)*
- Quantidade de pagamentos que deixam de ser feitos no prazo hoje por dificuldade de baixa.
- Tempo gasto hoje na montagem manual do lote.

**Popula GED**
- Tempo médio gasto por um analista para subir um documento no GED manualmente. *(Com ~300 notas/mês, este número converte diretamente em horas/mês economizadas — métrica central de ROI.)*
- Quantidade média de NC/ND presas em rascunho a qualquer momento (backlog).
- Tempo entre a emissão da nota e sua disponibilidade para baixa hoje.

---

## 8. Premissas e dependências consolidadas

- Acesso às integrações necessárias do Conexos (fin010, com298, e demais) e ao GED.
- Disponibilidade de um ponto focal do cliente para validação dos dados e dos fluxos durante o diagnóstico.
- **Homologação do leiaute bancário (Nexxera) depende do cronograma da instituição financeira** — dependência de terceiro que condiciona os marcos de envio e conciliação do Escopo II.
- A geração das NC/ND e dos PDFs no SharePoint permanece no fluxo atual do cliente.

---

## 9. Proposta comercial

**Modelo:** alocação de capacidade e expertise dedicada ao Financeiro da Columbia. O contrato remunera o resultado e a especialização em Comex, não horas ou headcount.

**Roadmap dos primeiros 90 dias:** entrega sequencial — Permutas → SISPAG → Popula GED — com diagnóstico e baseline na primeira semana de cada frente, e a capacidade remanescente dedicada à estabilização e ao diagnóstico das evoluções de Fase 2.

**Investimento mensal:** R$ 23.200,00.

**Prazo mínimo:** 3 meses. Ao término, conversão para contrato anual em condições preferenciais a serem acordadas.

**Prioridades:** mudanças de prioridade no backlog são acordadas entre os champions de cada parte; o período e o valor da alocação permanecem inalterados durante a vigência do contrato.

**Inclui:** desenvolvimento, entrega em produção, estabilização e a expertise de domínio em Comex aplicada ao longo de todo o período.

---

*Documento preparado pela Kavex para a Columbia Trading.*
