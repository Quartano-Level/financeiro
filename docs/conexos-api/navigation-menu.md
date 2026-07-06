# Conexos — Menu de Navegação Oficial (Telas) ↔ controllers

> Capturado ao vivo (2026-06-19) abrindo o ícone **"Telas"** (1º da barra superior). É a **árvore de navegação
> oficial** do ERP: como um humano realmente encontra cada tela. Cada item = `rótulo do menu → /controller`.
> Há também uma **busca** no topo do menu e um painel **Favoritos** à direita.
>
> Esta é a "fonte de verdade" da IA (arquitetura de informação) — complementa `screens/` (fichas) e
> `lifecycle/` (narrativa). Status de cada controller (live/seed/stub) está no `_registry.json`.
>
> ✅ **COMPLETO: 28/28 categorias enumeradas** (2026-06-22), cada uma com seus `rótulo → /controller`. Junto com
> `reports.md` (menu de Relatórios, 24/24), cobre **toda a navegação oficial do Conexos** — telas e relatórios.

## Categorias (coluna esquerda do menu) — 28 módulos
Cadastros · Compras e Almoxarifado · Produção · Comércio Exterior · Regimes Especiais · Despacho Aduaneiro ·
Políticas Comerciais · C.R.M. · Distribuição e Vendas · Faturamento · Logística · Documentos a Pagar ·
Documentos a Receber · Trade Finance · Tesouraria · Controladoria · Orçamentos Gerenciais · Liberações e
Aprovações · Contabilidade · Tributos / Fiscal · Ativo Permanente / Investimentos · S.P.E.D. · Índices, Moedas e
Cotações · Administrativo · Gerência de Documentos (GED) · Setup / EDI · Gestão de Filiais Estrangeiras ·
Procedimentos.

---

## Cadastros
**Pessoas:** Cadastrar Pessoa → `cmn025` · Listar Pessoas → `cmn025` · Listar Clientes Ativos → `cmn025`.
**Classificadores / Pessoas e Prospects:** Origem de Prospect → `cmn147` · Tipo de Eventos Negociação → `imp086`
· Eventos do Prospect → `cmn047` · Setores → `com061` · Cargos → `cmn068` · Setores dos Contatos → `cmn125` ·
Ramos de Atividade → `com001` · Setor Geográfico → `cmn014` · Situação Comercial → `cmn013` · Classificadores p/
Fornecedores → `com072` · Bandeira → `cmn119`.
**Classificadores de Produtos e Estoques:** Unidades → `com004` · Famílias → `cmn055` · Marcas → `cmn054` ·
Linha → `com285` · Coleção → `com286` · Embalagem → `cmn004` · Cadastro de Modelo/Cor - Veículos → `com349` ·
Locais de Estoque - Armazéns → `cmn001` · Laudos e Pareceres → `cmn064` · Configuração para Codificação de
Produtos → `com189` · Cadastrar/Listar Localização → `com350`.
**Materiais e Serviços:** Cadastrar Produto/Serviço → `com006` · Listar Produtos / Serviços Ativos → `com006` ·
Montagem e Desmontagem de Kit → `com294` · Pesquisa de Produtos → `psq017` · Mix de Produtos → `com281` ·
Consulta GTIN → `com372`.
**Localidades:** CEP → `cmn018` · Bairros → `cmn002` · Tipos de Logradouros → `cmn017` · Cidades → `cmn169` ·
Países → `cmn020` · Estados → `cmn016`.
_(grupo "Comércio Exterior / Logística / Eventos" desta categoria abaixo da dobra — mas o grosso aparece também
na categoria "Comércio Exterior" abaixo)_

---

## Comércio Exterior
**Processo:** Cadastrar/Listar Processo → `imp021` · **Follow Up → `imp187`** · Gerência de Faturamento de
Checkpoint → `imp185` · **Análise Gerencial de Importações → `imp189`** · **Gerência de Processos → `imp108`** ·
**Dashboard de Processos → `imp194`** · Solicitação de Cadastro de Processos → `fup018` · Gerência de Processo -
Exportação → `imp231`.
**Documentos de embarque:** Proforma → `log003` · Conhecimento de Transporte (imp) → `log012` · Invoice → `log009`
· Invoice de Serviço → `log105` · Invoice de Exportação → `log091` · Conhecimento de Transporte (exp) → `log090` ·
Memorando de Exportação → `log041` · Cancelamento Formulário p/ Memorando Exp. → `log046` · Proforma Exportação →
`log111` · Invoice de Serviço (exp) → `log103` · Packing List → `log094` · Embarques → `log120`.
**Avisos / transferências de processo:** Aviso de Crédito em Processo → `fin128` · Aviso de Débito em Processo →
`fin129` · Transferência entre Processos → `fin025`.
**Auditoria / Prestação de Contas / Fechamento:** Auditoria de Lançamento de Processo → `imp159` · Gerência de
Auditoria de Processo → `imp158` · Visualização/Prestação de Contas (obsoleto) → `imp221`/`imp160` · Configuração
de Ações para Fechamento → `imp209`.

**T.E.C.:** Cadastro de Mercadorias na TEC → `imp013` · NCM's - Atualizações → `imp232`.
**Tracking:** Tracking de Documentos → `trk001` · Tracking de Container → `trk002` · Tracking Mercovia → `trk005`.
**Agenciamento:** Solicitação de Cotação de Compra → `log121` · Agenciamento de Carga → `log122`.
**Travas e Bloqueios / Processo (configs `ger*`):** Configuração Fechamento Processo → `ger054` · Validação de
Invoice → `ger045` · Validação Reg. D.I. → `ger052` · Validação Reg. Duimp → `ger100` · Bloqueios de Registro de
DI → `cmn120` · Validação de D.I. → `ger042` · Validação Reg. L.I. → `ger073` · Validação DU-e → `ger099` ·
Validação Conhecimento de Transporte → `ger102` · Validação de Proforma → `ger074`.

> Achado: o menu revela telas de **gestão/análise** (Follow Up `imp187`, Dashboard `imp194`, Análise Gerencial
> `imp189`, Gerência `imp108`) e as **configs de validação/fechamento** (`ger*`) que não eram alcançáveis
> adivinhando controllers — valor real do menu.

---

## Despacho Aduaneiro
**Declarações / registros:** Cadastro de D.I / D.S.I → `imp019` · Registro de D.I. → `imp052` · Registro de
D.S.I. → `imp139` · **DUIMP (Declaração Única de Importação) → `imp223`** · Registro de DU-e → `imp190` ·
Registro de L.I. → `imp095` · Presença de Carga → `imp237` · Registros de D.D.E → `imp151` · Importação de
D.D.E. → `imp180` · Cadastrar/Listar Registro de R.E. → `imp129` · Registro de D.S.E → `imp149` · Transmissão de
Lote de R.E → `imp176`.
**Siscomex Web:** Importação de L.I. → `imp174` · Importação de D.I. → `imp188` · Importação de D.S.I → `imp173`
· Exportação de L.I. → `imp178` · Exportação de D.I. → `imp177` · Exportação de D.S.I → `imp181` · Exportação de
L.I em Lote → `imp191` · Exoneração de ICMS → `imp186` · Consulta Siscomex Carga → `imp175` · Siscomex Mantra/CCT
→ `imp172`.
**Apoio:** Catálogo de Produtos → `imp220` · LPCO Importação → `imp222` · LPCO Exportação → `imp217` · Dossiê
Eletrônico → `imp214` · Consulta Controle de Estoque Pré-ACD → `imp233` · **Cálculo de ICMS de Importação →
`imp184`** · Registros de Petição na Anvisa → `imp152` · Licenciamento de Importação → `log013`.

---

## Faturamento
**Ordem de Faturamento:** Cadastrar ODF → `imp002` · Listar Ordens de Faturamento (Não Faturada) → `imp002` ·
Configuração de Ordem de Faturamento → `imp047` · Faturamento de Pedidos de Venda → `com099`.
**Importação de documentos:** Importação de CT-e → `com265` · NF Doc. Entrada → `com295` · NF-e → `com243` ·
Notas Fiscais → `com064` · Config Importação Automática de CT-e → `ger072`.
**NF-e (saída):** Geração Automática de NFe → `com319` · Transmissão de Eventos de NF-e → `com321` · Inutilização
→ `com320` · Distribuição NF-e → `com322` · Certificados → `com324` · Regime de NFe → `cmn136` · Carta de
Correção → `com246` · Ator Interessado (Transportador) → `com376` · Evento de Prorrogação → `com290` ·
Documentos Destinados → `com323`.
**NF de Serviço:** Processamento → `com303` · Emissão → `com313` · Cancelamento → `com327`.

---

## Logística (WMS / distribuição)
Cadastrar/Listar Romaneio de Carga → `com276` · Confirmação de Coleta → `com139` · Confirmação de Entrega →
`com010` · Separação de Pedidos → `com195` · Apontamento / Cadastro de Apontamentos → `log061` · Tabela de Preço
de Serviços → `log063` · **Apuração e Faturamento Logístico → `log062`** · Movimentação de Pallets por Cliente →
`log069`. _(Armazenagem/serviços logísticos — distinto da logística-comex acima.)_

---

## Documentos a Pagar
**Documentos:** Cadastrar/Listar Financeiro a Pagar → `com298` · Fiscais de Entrada → `com296` · Financeiro a
Pagar - Automático → `com342` · **Pesquisa de Documentos a Pagar → `psq014`** (a do app de adiantamento).
**Baixas:** Baixa de Títulos a Pagar → `fin010` · Baixa Agrupada a Pagar → `fin146`.
**Pagamentos / bancos:** Importação de Arquivo DDA → `fin124` · Geração de Lote SISPAG → `fin015` · Tipo de
Contribuinte por Banco → `fin055` · Retorno de Bancos Pagfor → `fin052` · Gerenciamento de Títulos a Pagar →
`fin026` · Gestão de Pagamentos → `fin064` · Gerência de Envio de Pagamentos → `fin061` · Renegociação de
Pagamentos → `fin070`.

---

## Documentos a Receber
**Documentos:** Fiscais de Saída → `com297` · Cadastrar/Listar Financeiro a Receber → `com299` · Financeiro a
Receber - Automático → `com343` · **Pesquisa de Documentos a Receber → `psq015`**.
**Baixas:** Baixa de Títulos a Receber → `fin014` · Baixa Agrupada a Receber → `fin147` · Conferência de Títulos
a Receber → `fin007`.
**Cobrança / recebíveis:** Gerência de Títulos → `fin085` · Carteiras de Garantia → `fin122` · Gestão de Cobrança
→ `fin060` · Eventos de Duplicatas → `fin059` · Renegociação de Cobranças → `fin130` · Lotes de Cheques → `fin114`
· Gerência de Recebíveis → `fin066` · Renegociação de Recebíveis → `fin076` · Eventos p/ Gerência de Recebíveis →
`fin067` · Tipo de Recebíveis → `fin075`.

---

## Trade Finance  ⭐ (câmbio / variação cambial / adiantamento internacional)
Cadastrar/Listar Contrato de Câmbio → `imp059` · **Controle de Adto Fornecedor Estrangeiro → `com368`** ·
ACC/ACE → `imp226` · Controle e Gestão de Câmbio → `imp224` · Finimp → `imp117` · Hedge → `imp120` · Carta de
Crédito → `imp113` · **Gerência de Variação Cambial → `imp134`**.
> Diretamente relevante ao app de **Variação Cambial / Adiantamento Internacional**: `com368` (adto a fornecedor
> exterior) e `imp134` (variação cambial nativa) — telas que não tinham sido mapeadas.

---

## Tesouraria
**Extratos / bancos:** Extrato Sistema → `fin091` · Extrato Banco → `fin095` · Lançamento Manual de Extrato →
`fin096` · Importação de Extratos Bancários → `fin134` · Importação Nexxera → `fin143` · Cheques Emitidos →
`fin045`.
**Conciliação:** Conciliação Bancária → `fin133` · Conciliação Conta Caixa → `fin020` · Conciliações Geradas →
`fin135`.
**Gestão:** Resumo Financeiro Geral/Sintético → `fin136`/`fin137` · Controle/Atualização de Mútuos → `fin144`/
`fin145` · **Fluxo de Caixa → `fin141`** · Análise Gerencial de Gastos → `com337`.

---

## Tributos / Fiscal
**Cadastros fiscais:** CFOP → `cmn023` · Tipo de Operação → `cmn015` · Classificador de Produtos → `com007` ·
Redução de Base de Cálculo → `com005` · Config de CST por NCM → `ctb050` · Séries Fiscais → `com002` ·
Parâmetros por Filiais/Tributos → `ger047` · Encargos → `cmn005` · Observações do CFOP → `cmn183` · Código de
Benefício Fiscal → `ctb081` · Automação de CFOP → `cmn150` · Tipos de Aplicação → `cmn076` · Classificador de
Serviço → `cmn134` · CNAE → `cmn133`.
**Reforma / IBS-CBS:** **Redução de Alíquota do IBS/CBS → `com377`** · Motivo de Restituição/Complementação de
Imposto → `com353`.
**Consulta Tributária:** Solicitação → `com345` · Recepção → `com346` · Resultado → `com347`.
**Apuração / período fiscal:** Transição de Períodos Fiscais → `ctb009`/`ctb062` · Interface Fiscal → `ctb010` ·
**Apuração/Recolhimento de Tributos → `ctb038`** · DST (Decl. Serviços Tomados) → `com316` · Programação de
Incentivo Fiscal → `com051` · Incentivos Fiscais → `ctb031`.

---

## Índices, Moedas e Cotações
**CDI/SELIC - Taxa de Juros (Atualização de Taxas) → `fin101`** (usada na Calculadora de Encargos) · Taxas
Moedas / Siscomex → `cmn007` · **Cotação de Moeda Ptax → `cmn156`**.

---

## Contabilidade
Plano de Contas Contábil → `ctb002` · Conciliação Contábil → `ctb066` · Balancete Contábil → `ctb064` ·
**Contabilização da Variação Cambial → `log067`** · Encerramento do Exercício Contábil → `ctb029` · Auditoria de
processos → `ctb077` · Recontabilização → `ctb035` · Siglas de Lançamentos → `ctb008` · Históricos Contábeis →
`ctb001` · Lançamentos Contábeis → `ctb006` · Históricos de Lançamentos → `ctb044` · Bloqueios/Liberação de
Períodos → `ger050`/`ger002` · Apuração Fiscal → `ctb074` · Tipo de Lançamentos Fiscais → `ctb075`.

---

## Regimes Especiais (drawback / admissão temporária)
Controle de Prazos de Processos Temporários → `imp163` · Status do Pedido → `imp168` · Tipo do Pedido → `imp167`
· Garantia dos Tributos → `imp166` · **Ato Concessório → `imp193`** · Laudo de Composição de Item → `imp192`.

---

## Compras e Almoxarifado
Cotação de Preços → `com084` · Gerência de Cotações → `com264` · Gerência de Pedidos de Compra → `com274` ·
**Pedido de Compra → `com043`** · Atendimento do Pedido → `com256` · Tipo de Pedido → `com355` · Requisição de
Materiais e Serviços → `com039` · Gestão da R.M → `com041` · Atendimento de R.M e Cotações → `com235` · Produtos
em Elaboração → `com365` · Processo de Validação → `com362` · Conferência (Características/Padrão/Física) →
`com358`/`com363`/`com364`.

## Distribuição e Vendas
**Pedidos/orçamentos:** Pedido de Venda → `com034` · Programação → `com177` · Pré-Pedidos → `com141` · Geração →
`com132` · Gerência → `com196` · Eventos → `com233` · Orçamento Simplificado/Completo → `com107`/`com164` ·
Gerência de Orçamentos → `com197`.
**Análises gerenciais:** Resumo de Vendas (Analítico/Agrupador/Logística) → `com328`/`com329`/`com344` · Clientes
→ `com330` · Produtos → `com331` · Giro → `com332` · Lucratividade → `com333` · Curva ABC → `com334` · Vendas por
Fornecedor → `com335` · Estoque → `com317` · Documentos → `com341` · Inventário → `com318`.
**Força de vendas (`ped*`):** Pré-Pedido → `ped006` · Clientes/Prospects → `ped005` · Eventos → `ped003` ·
Consulta Produtos → `ped001` · Consulta NF → `ped002`.

---

## Produção
Linha de Produção → `pcp001` · Processo Produtivo → `pcp002` · Ferramentas → `pcp003` · Cadastrar/Listar Ordem de
Produção → `pcp005` · **Ficha de Conteúdo de Importação (FCI) → `com340`**.

---

## Políticas Comerciais
**Vendas/equipe:** Equipe → `com182` · Estrutura de Vendas → `com184` · Atendimento de Cliente por Equipe →
`com203`. **Preço/comissão/metas:** Tabela de Preços → `com033`/Config `com052` · Precificação → `com239`/`com314`
· **Comissão** (Apuração/Cadastro/Quitação) → `com248`/`com204`/`com253` · Metas (Cadastro/Gerenciamento) →
`com354`/`com366`. **Bloqueios:** Pedidos (Regras/Tipo) → `com175`/`com174`/`com172` · Venda → `com245` · **ODFs
(Cadastro/Bloqueio) → `com352`/`com351`**.

---

## C.R.M.
Prospect → `cmn059` · Confirmação de Agendamento → `cmn040` · **E-mail** (Padrão/Grupo/Layout/Envio/Gerência) →
`ger003`/`ger005`/`ger033`/`ger018`/`ger009` · Tarefas Agendadas → `ger019` · Questionários/Perguntas/Respostas →
`cmn043`/`cmn041`/`cmn042` · Despesas da Negociação → `imp087` · **Funil → `cmn177`** · **Gestão de Negócio →
`cmn179`**.

---

## Controladoria
**Estrutura:** Empresas/Filiais → `ger007` · Parâmetros Gerais/por Filial → `ger010`/`ger008` · **Plano de Contas
Financeiro → `fin004`** · **Gerencial → `fin006`** · Grupos de Cálculo → `fin054` · **Projetos → `ctb004`** ·
**Centro de Custos → `ctb003`** · **Unidades de Negócio → `com181`** · Classificação de Despesas por Conta →
`ctb076`. **Rateio:** Gerencial → `ctb079` · Máscara → `ctb080` · Custo de Capital → `ctb078` · Alçadas →
`com173`. **Config/bloqueio financeiro:** Config Documentos → `com065` · Config Lançamentos de Extratos →
`fin017` · Liberações Financeiras → `fin106` · Regras de Bloqueio Financeiro → `fin102`.

---

## Orçamentos Gerenciais
Orçamento Contábil → `ctb019` · Orçamento de Projetos por Centro de Custos → `ctb032` · Orçamentos de Contas
Financeiras → `fin003`.

## Liberações e Aprovações
**Financeiro:** Liberação de Títulos → `fin103`. **Despacho/processo:** Liberação de Registro DI/DUIMP
(Risco-Financeiro/Operacional/DI) → `imp207`/`imp211`/`imp074` · Gerência de Bloqueios de DI/DUIMP → `imp208` ·
**Liberação de Processos p/ Faturamento/Operacional → `imp097`** · **Liberação de Despesas do Processo →
`imp054`** · p/ Alteração de Processos → `imp083`. **Comercial:** Cadastro/Alteração de Produtos → `com125`/
`com136` · Pedidos de Compra/Venda → `com307`/`com074` · Documentos → `com277` · Proforma → `log119`.

---

## Ativo Permanente / Investimentos
Cadastrar/Listar Ativo Imobilizado → `ctb011` · Locais de Ativos → `ctb039` · Lote de Ativos → `ctb012` ·
Gerenciamento de Ativos por Lote → `ctb014` · Configuração de Lançamentos de Ativos → `ctb025` · Depreciação de
Ativos → `ctb023`.

---

## S.P.E.D.
**Geração do SPED (Contábil/Fiscal/PIS-COFINS) → `ctb048`** · **Geração SPED REINF → `ctb069`** · Apuração Lucro
Presumido → `ctb063` · **Apuração LALUR/LACS → `ctb061`** · Plano de Contas SPED Contábil → `ctb046`/Vinculação
`ctb047`/Anterior `ctb065` · Atividades/Produtos/Serviços CPRB → `ctb070` · Controle de Código de Ajuste →
`ctb068` · Processos Administrativos/Judiciais → `ctb071` · Escrituração Contábil Consolidada → `ctb073`.

---

## Administrativo
**Procurações/contratos:** Procuração → `cmn024` · Tipo de Pessoas p/ Procurações → `cmn074` · **Contrato →
`cmn033`** · Gerência de Contratos → `cmn187` · Eventos p/ Contratos → `cmn050` · Apólice → `com146`.
**Workflow (`wrk*`):** Gerenciamento de Tarefas → `wrk008` · Fluxo de Trabalho por Atividade → `wrk006` ·
Controle/Configuração de Projetos → `wrk009`/`wrk005` · Tipos de Atividades → `wrk004` · Tipo de Tarefas →
`wrk002` · Cadastro de Tarefas → `wrk007` · Situação de Tarefas → `wrk001` · Papéis → `wrk003`.

---

## Gerência de Documentos (GED) — domínio `arq*`
**Config GED:** Tipo de Arquivo → `arq018` · Palavras Chave → `arq003` · Tipos de Movimentação → `arq004` ·
Cadastro de Pastas → `cmn022` · Status do Documento → `arq001` · Restrições → `arq013` · Estrutura de Pastas →
`arq021` · Tipo de Documentos p/ Arquivo → `arq009` · Meio de Armazenagem → `arq010` · Complemento de Usuários →
`arq016` · Meio de Comunicação → `arq015`.
**Arquivo físico:** Prédio → `arq005` · Tipo de Móveis → `arq006` · Salas → `arq008` · Móvel em Salas → `arq011`.
**Operação:** Movimento de Documentos → `arq012` · Pesquisa Arquivamento → `arq014` · Gerência Compartilhada →
`ger087`.

---

## Setup / EDI (administração — domínio `ger*`)
**Usuários/permissões:** Usuário → `ger004` · Perfil → `ger066` · Minhas Solicitações de Permissão → `ger060` ·
Grupo de Usuários → `arq017` · Privilégios por Grupo → `ger014` · Concessão de Permissão → `ger061` · Grupos por
Componentes → `ger016`.
**Integração de dados:** Importação de Dados em Arquivos → `ger027` · **EDI → `ger036`** · Interface Fiscal →
`ger017` · Layout de Importação → `ger026` · Integração NCM → `ger083` · Exportação de Dados → `ger031`/Config
`ger030`.
**Customização:** Relatórios → `ger067` · Parâmetros → `ger068` · LOVs → `ger069` · Execução de Relatórios/
Procedimentos → `ger070` · Execução Agendada de Relatório → `ger090` · Execução de Procedimento Agendado →
`ger098`.
**Robôs / log / agentes:** **Configuração de Robôs → `ger081`** · Log de Tarefa Robô → `ger076` · Pesquisa Log do
Site de Processos → `psq031` · Cadastro de Agentes → `ger089` · Log de Acessos → `ger097`.
**Integração bancária:** Mensagens de Retorno Bancário → `ger053` · Erros de Retorno (A Receber/A Pagar) →
`fin056`/`fin050` · Script de Remessa/Retorno p/ Bancos → `ger012`/`ger015`.
**Regras/diversos:** Restrições p/ Documentos → `cmn129` · Grupos de Motivos → `cmn008` · Regras de Negócio →
`ger011` · Territórios → `cmn175`.

## Gestão de Filiais Estrangeiras (Processos no Exterior)
Controle Gerencial de Processos no Exterior - Resultado → `fin142` · Conciliações Bancárias → `fin138` ·
Resultados → `fin139` · Saldo Clientes → `fin140`.

## Procedimentos (índice amplo de cadastros / parametrização de processo)
> Categoria-catálogo: reúne (com sobreposição às demais) todo o cadastro-base e a parametrização de evento/processo.
**Pessoas/comercial:** Pessoa → `cmn025` · Prospect (Origem/Eventos) → `cmn147`/`cmn047` · Tipo de Eventos
Negociação → `imp086` · Setores/Cargos/Contatos → `com061`/`cmn068`/`cmn125` · Ramos de Atividade → `com001` ·
Setor Geográfico → `cmn014` · Situação Comercial → `cmn013` · Classificadores p/ Fornecedores → `com072` ·
Bandeira → `cmn119`.
**Produto:** Unidades → `com004` · Famílias/Marcas/Linha/Coleção → `cmn055`/`cmn054`/`com285`/`com286` · Embalagem
→ `cmn004` · Modelo/Cor Veículos → `com349` · Locais de Estoque/Armazéns → `cmn001` · Laudos e Pareceres →
`cmn064` · Config Codificação de Produtos → `com189` · Localização → `com350` · Produto/Serviço → `com006` ·
Kit (Montagem) → `com294` · Pesquisa de Produtos → `psq017` · Mix → `com281` · Consulta GTIN → `com372`.
**Geografia:** CEP → `cmn018` · Bairros → `cmn002` · Logradouros → `cmn017` · Cidades → `cmn169` · Países →
`cmn020` · Estados → `cmn016`.
**Evento/processo:** **Eventos de Processo → `cmn021`** · Grupos de Eventos → `imp048` · Tipos de Respostas →
`cmn036` · **Modelo de Checkpoint → `cmn165`** · Eventos p/ Proforma → `log058` · Classif. de Eventos p/ Importação
→ `imp020`.
**Transporte/despacho:** Despesas de Transporte Internacional → `log004` · Origem/Destino → `log007` · Via de
Transporte → `cmn011` · Veículos/Tipo → `log006`/`log002` · Container → `log008` · Despesas de Despacho → `log029`
· Tipo de Serviços → `log027`.

---

> ✅ **Menu de Telas COMPLETO — 28/28 categorias enumeradas** (label → `/controller`) em 2026-06-22. Ver
> `reports.md` para o menu de Relatórios (24/24). Juntos, os dois menus cobrem toda a navegação oficial do Conexos.

---

## Setup / EDI (administração — domínio `ger*`)
**Usuários/permissões:** Usuário → `ger004` · Perfil → `ger066` · Minhas Solicitações de Permissão → `ger060` ·
Grupo de Usuários → `arq017` · Privilégios por Grupo → `ger014` · Concessão de Permissão → `ger061` · Grupos por
Componentes → `ger016`.
**Integração de dados:** Importação de Dados em Arquivos → `ger027` · **EDI → `ger036`** · Interface Fiscal →
`ger017` · Layout de Importação → `ger026` · Integração NCM → `ger083` · Exportação de Dados → `ger031`/Config
`ger030`.
**Customização:** Relatórios → `ger067` · Parâmetros → `ger068` · LOVs → `ger069` · Execução de Relatórios/
Procedimentos → `ger070` · Execução Agendada de Relatório → `ger090` · Execução de Procedimento Agendado →
`ger098`.
**Robôs / log / agentes:** **Configuração de Robôs → `ger081`** · Log de Tarefa Robô → `ger076` · Pesquisa Log do
Site de Processos → `psq031` · Cadastro de Agentes → `ger089` · Log de Acessos → `ger097`.
**Integração bancária:** Mensagens de Retorno Bancário → `ger053` · Erros de Retorno (A Receber/A Pagar) →
`fin056`/`fin050` · Script de Remessa/Retorno p/ Bancos → `ger012`/`ger015`.
**Regras/diversos:** Restrições p/ Documentos → `cmn129` · Grupos de Motivos → `cmn008` · Regras de Negócio →
`ger011` · Territórios → `cmn175`.
