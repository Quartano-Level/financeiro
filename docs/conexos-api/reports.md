# Conexos — Subsistema de Relatórios (motor de relatórios)

> Capturado ao vivo (2026-06-19/22) abrindo o ícone **"Relatórios"** (2º da barra superior). **Descoberta
> importante: os relatórios NÃO são controllers `/comNNN`** — são um **motor de relatórios à parte**,
> parametrizados e exportáveis, que o mapeamento por telas (`screens/`) não cobria. Este doc cataloga esse
> subsistema. **CATÁLOGO COMPLETO: 24/24 categorias enumeradas** (~700 relatórios `rp<Dom>NNN`). Prefixos de
> código vistos: `rpFin`/`rpCom`/`rpCtb`/`rpImp`/`rpLog`/`rpCmn`/`rpFdp`/`rpFrt`/`rpTrd`/`rpAdm`/`rpGed`/`rpSta`/
> `rpPcp`/`rpPed`/`rpFnc`. Destaques p/ o projeto: FECHAMENTO DE PROCESSO (cat. "Comércio Exterior"), Planilha de
> Custo de Importação, Análise de Juros c/ Saldo (`rpFin414`), Adiantamentos (FIM 028=`rpFin028`), Variação
> Cambial/Câmbio (cat. Trade Finance), Incentivos/Créditos Presumidos, Comissão de Trader.

## Como funciona
- **Acesso:** ícone **Relatórios** (barra superior) → menu com **categorias próprias** (≠ menu de Telas):
  Cadastros Gerais · Comércio Exterior (Exportação/Importação) · Despacho Aduaneiro · Logística · Comercial e
  Distribuição · Estoques · Faturamento · Compras e Almoxarifado · Incentivos Fiscais · **Financeiro a pagar** ·
  **Financeiro a receber** · **Trade Finance** · Tesouraria · Contabilidade · Tributário/Fiscal · Controladoria ·
  Auditoria · CRM · Documentos Eletrônicos (GED) · Procurações e Contratos · Configurações e Acessos ·
  **Relatórios Personalizados**. Há **busca** no topo do menu e **Favoritos**.
- **Identificação:** cada relatório tem um **código `rp<Dom><NNN>`** (ex.: `rpFin028`) e abre por URL
  `/home#?report=rp<Dom><NNN>` ou pelo menu.
- **Execução:** abre um **modal de parâmetros** → botão **Executar ▾** com formatos de export:
  **CSV · DOCX · HTML · PDF · RTF · XLSX**. Botão **Histórico** (execuções anteriores) e compartilhar.
- **Endpoint:** `GET /api/report/{rpCodigo}` carrega a definição/parâmetros do relatório. A geração é server-side.

> ⚠️ **Read-only:** os botões "Gerar em …" disparam download/geração — não acionados no mapeamento (requer
> autorização explícita do Yuri).

## Relatórios de Adiantamento (Financeiro a pagar → grupo "Adiantamentos")
| Relatório (menu) | Código | URL |
|---|---|---|
| **Adiantamento de Títulos Diversos** (= "FIM 028") | **`rpFin028`** | `/home#?report=rpFin028` |
| Títulos de Adiantamento | `rpFin240` | `/home#?report=rpFin240` |
| Adiantamento X Despesas | `rpFin317` | `/home#?report=rpFin317` |

### ⭐ FIM 028 — "Adiantamento de Títulos Diversos" (`RP_FIN_028` / `rpFin028`)
O relatório que **lista e exporta os adiantamentos** (o "FIM 028" do dia a dia). É o equivalente nativo do ERP
ao que o app `columbia-expense-analysis` / `relatório de adiantamento` reproduz.
- **Acesso:** Relatórios → **Financeiro a pagar** → Adiantamentos → *Adiantamento de Títulos Diversos*; ou
  `/home#?report=rpFin028`. Endpoint: `GET /api/report/rpFin028`.
- **Parâmetros (modal):** Agrupamento · **Filial** (default 2 = Columbia Itajaí/SC) · **Consolidar** (Somente
  Filial Selecionada / Filiais à Consolidar) · **Tipo Documento** (<<TODOS>>) · Cód. Documento · **Situação**
  (<<TODOS>>) · **Processo** · **Pessoa** · **Encomendante** · Nac. Pessoa · **Data Emissão** (de–até) ·
  **Data Vencimento** (de–até) · **Quitação** (de–até) · **Nº Título** · Data Base.
- **Export:** CSV · DOCX · HTML · PDF · RTF · XLSX. **Histórico** de execuções disponível.

## Catálogo por categoria (menu Relatórios)
> Cada relatório = `link href=".../home#?report=rp<...>"`. Endpoint `GET /api/report/{codigo}`. Categorias do
> menu: Cadastros Gerais · Comércio Exterior (Exp/Imp) · Despacho Aduaneiro · Logística · Comercial e Distribuição
> · Estoques · Faturamento · Compras e Almoxarifado · Incentivos Fiscais · **Financeiro a pagar/receber** ·
> **Trade Finance** · Tesouraria · Contabilidade · Tributário/Fiscal · Controladoria · Auditoria · CRM · GED ·
> Procurações e Contratos · Configurações e Acessos · Relatórios Personalizados.

### Financeiro a pagar
Adiantamento de Títulos Diversos (**FIM 028**) → `rpFin028` · Títulos de Adiantamento → `rpFin240` · Adiantamento
X Despesas → `rpFin317` · Baixas por Conta Corrente → `rpFin013` · Baixas por Período → `rpFin182` · **Contas a
Pagar → `rpFin010`** · por Fornecedor → `rpFin022` · por Processo → `rpFin047` · por DI → `rpImp018` · Pagas por
Quitação → `rpFin040` · Liberação de Títulos a Pagar → `rpFin218` · Sintético → `rpFin219` · Contas A Pagar (v2)
→ `rpFin626` · **Despesas - Amex → `rpFin401`** · Títulos Sem Cadastro no GED → `rpCom643` · Solicitação de
Pagamento (por título / cliente / 2 vias Mod1-4) → `rpFin002`/`rpFin194`/`rpFin035`/`rpFin079`/`rpFin316`/
`rpFin354`/`rpFin224`.

### Financeiro a receber
**Contas a Receber → `rpFin018`** · Mod02 → `rpFin343` · com CNPJ → `rpFin584`/lite `rpFin914` · por Quitação →
`rpFin041` · Sintético → `rpFin220` · Títulos Recebidos por Conta → `rpFin017` · Baixados por Conta → `rpFin230`
· por Gerente → `rpFin257` · **Controle de Saldo a Receber de Processos → `rpLog053`** · Situação do Cliente →
`rpFin392` · Relatório de Cliente → `rpFin567` · Carta de Desconto → `rpCmn030` · Títulos por Banco Mod3 →
`rpFin563` · Análise de Performance dos Processos → `rpLog063`.
- **Duplicatas:** Laser Mod02/03/04 → `rpFin102`/`rpFin335`/`rpFin137`/`rpFin229` · Resumo por Processo →
  `rpFin129` · Condição/Desconto → `rpFdp016` · Limite por Situação → `rpFin055`.
- **Solicitação de Numerário (SN)** — ~25 modelos: principais `rpFin006` (base), Analítica `rpFin051`, Câmbio
  `rpFin080`, C/ Agrupadores `rpFin083`, Desp. Detalhadas `rpFin899`; modelos `rpFin204/233/236/264/286/292/306/
  308/319/643/895/896` e Prestação de Contas `rpFin268/271/290/305`. Resumo de Numerário → `rpCom297`/por Cliente
  `rpCom287`. Solicitação de Recebimento → `rpFin034`/2 vias `rpFin060`.
- **Boletos bancários** (por banco): Padrão `rpFin084` · Caixa `rpFin439` · BB `rpFin243` · Bradesco `rpFin339` ·
  Safra `rpFin373`/Safra-Bradesco `rpFin386` · Sicredi `rpFin411` · Banestes `rpFin252` · Daycoval `rpFin468/516`
  · Citibank `rpFin364` · Santander `rpFin433` · Itaú `rpFin311` · Conferência `rpFin325`.

### Trade Finance  ⭐ (câmbio / variação cambial)
**Variação/controle de câmbio:** **Planilha de Variação Cambial - Mensal Mod02 → `rpImp120`** · **Controle de
Câmbio - Conta e Ordem → `rpFin125`** · Controle de Câmbio → `rpFin099` · por Processo → `rpImp009`/`rpFin415` ·
de DI's → `rpImp041` · (Parcela) Invoice → `rpLog060` · por Invoice (listagem) → `rpLog082` · Posição em Aberto →
`rpLog086` · Pendentes Aplicação/Títulos em Aberto → `rpLog030` · Borderô → `rpLog061` · Parcelas por Cliente →
`rpLog043`.
**Fechamento de câmbio:** Analítico → `rpImp004` · Sintético → `rpImp063` · Carta → `rpImp071` · Demonstrativo →
`rpFin070` · Espelho → `rpImp014` · Contrato de Câmbio → `rpCom322` · Câmbio da Invoice → `rpLog051`/Modelo
Cliente `rpLog055`.
**Finimp / outros:** Relatório de Finimp → `rpImp104` · Conhecimento de Transportes → `rpLog031` · Geral de
Processos Mod02 → `rpLog089`.

### Despacho Aduaneiro
**DI:** Relação de DI's → `rpImp005`/Mod02 `rpImp011`/Geral `rpImp010`/por Trader `rpImp006` · **PIS/Cofins →
`rpImp013`** · **PIS/Cofins/ICMS → `rpImp021`** · Extrato de DI → `rpImp027`/Mod02 `rpImp155`/Mod03 `rpImp642` ·
Registro DI Diário → `rpImp091` · **Itens da DI por NCM/Encargos → `rpImp056`** · Listagem de Itens da DI →
`rpCmn033` · DI/Seguro Internacional → `rpLog038`/com Seguro `rpLog179` · **Conferência de Impostos DI/DUIMP →
`rpImp826`** · Consulta de Cálculo Geral → `rpImp504`/Mod2 `rpImp812` · DMI → `rpImp540` · Parametrização/Tempo de
Desembaraço → `rpLog024`/`rpLog035` · Instrução de Despacho → `rpLog072` · Relatório de Despacho → `rpLog037`.
**DU-E / DSE / DSI:** Extrato DU-E → `rpImp638` · DUE → `rpImp643` · DSE Formulário → `rpImp116` · DSI Formulário
→ `rpImp110`/Mod2 `rpImp834` · Extrato DSI → `rpImp114` · Req. Admissão Temporária → `rpImp111` · Extrato Reg.
Exportação → `rpLog110`.
**LPCO / L.I. / anuências:** LPCO Imp/Exp → `rpImp817`/`rpImp825` · Controle Exigência LPCO → `rpImp832` ·
Catálogo de Produtos → `rpImp835`/Operadores `rpImp836` · Relação de L.I.'s → `rpImp007` · Acompanhamento L.I →
`rpImp101` · Extrato Licenciamento → `rpLog088` · Anuências L.I → `rpLog018`/`rpLog032` · Listagem Li/Lidsi →
`rpImp115` · Petição Fisc./Liberação Sanitária → `rpLog116`.
**ICMS / outros:** Exoneração do ICMS → `rpImp128` · GLME Rondônia → `rpImp169`/Comprov. ICMS RO `rpImp272` ·
Nota de Crédito → `rpFin287`/Débito `rpLog334` · Booking → `rpLog331` · Relatório de Programações → `rpLog023`.

### Comércio Exterior - Importação  (≈65 relatórios — acompanhamento operacional)
**Demonstrativo / despesas:** **Demonstrativo do Processo de Importação → `rpFnc009`** · **Processos por
Despesas/Impostos → `rpLog042`** · Acompanhamento de Receitas/Despesa → `rpCom271` · Resumo - Processo Importação
→ `rpImp066` · Capa de Processo → `rpCom822` · Mapa de Importação → `rpImp107`/por Filial `rpImp106`.
**Invoice / DI / NCM:** Importação Modelo Comercial → `rpImp033` · NCM x Invoice → `rpImp636` · Invoice
Itens/Série → `rpLog075` · Consulta de Cálculo Capa → `rpImp810` · Extrato de DUIMP → `rpImp843` · Relação de
DI/DUIMP Geral Mod02 → `rpImp105` · **Comissão da Invoice/Proforma → `rpFdp033`**.
**⭐ Integração SAP:** Invoice x SAP → `rpImp858` · DI x SAP → `rpImp857` · Faturamento x SAP → `rpImp859` ·
Atendimento (Embarque) x SAP → `rpCom875`.
**Controle/acompanhamento de processos** (muitos modelos): Relação de Processos → `rpImp049`/DI-DUIMP `rpImp050`
· Controle de Processos → `rpLog019`/`rpLog020`/`rpLog050` · Acompanhamento → `rpImp022`/`rpImp023`/`rpImp034`/
`rpImp054`/`rpImp075`/`rpLog181`/`rpLog190` · Situação em Aberto → `rpImp081` · Processos s/ DI → `rpLog004` · com
DI/DUIMP → `rpLog001` · Síntese das Importações → `rpLog025`/`rpLog033` · por Cliente → `rpLog028`/`rpLog062` ·
Histórico → `rpImp052` · Abertura → `rpImp040` · Posição em Andamento → `rpFin322` · Passíveis de Perdimento →
`rpImp030` · Geral de Processos → `rpLog005`/`rpLog014`/`rpLog073` · Informativo Operacional → `rpLog071`.
**Demurrage:** `rpLog008` (base) · Mod02/03/04/06/09 → `rpLog027`/`rpLog029`/`rpLog045`/`rpLog090`/`rpLog199` ·
Controle → `rpLog085` · Embarcados/Demurrage → `rpImp051`.
**Outros:** Carga Perigosa Aérea → `rpLog096` · Req. Fiscalização Emb. Madeira → `rpImp053` · Anexo V Peças →
`rpImp076` · Importações/Entregas em Andamento → `rpLog009`/`rpImp818` · Proforma Modelo Despachante → `rpCom535`.

### Tributário / Fiscal  (≈50 — livros fiscais / apuração / SPED)
**Cadastros fiscais:** CFOP → `rpCmn001` · Configuração por CFO → `rpCmn004` · Classificadores de Produtos →
`rpCom262` · Estrutura Fiscal NCM/Produto → `rpCom286` · Produtos DNF → `rpCmn010`.
**Livros fiscais:** Registro de Entradas (P1) → `rpCtb003`/P1-A `rpCtb056`/Mod02 `rpCtb121` · Saídas (P2) →
`rpCtb011`/P2-A `rpCtb057`/Mod02 `rpCtb122` · Inventário (P7) → `rpCom011`/RI `rpCom135` · Controle Produção/
Estoque (P3) → `rpCom007` · CIAP Mod C/D → `rpCtb042`/`rpCtb041` · Apuração ICMS (P9) → `rpCtb014`/Resumo
`rpCtb019` · Apuração IPI (P9) → `rpCtb017`/Resumo `rpCtb020` · Selos de Controle → `rpCtb071`/`rpCtb186` · Termos
do Livro Fiscal → `rpCtb072`/`rpCtb073`.
**Apuração ICMS:** **por Processo → `rpCtb038`** · por Alíquota → `rpCtb012` · Mensal → `rpCtb116` · Resumos de
Escrituração por CFO/UF/CST/Alíquota → `rpCtb015`/`rpCtb021`/`rpCtb026`/`rpCtb067`/`rpCtb080`/`rpCtb089`/`rpCtb096`
· ICMS-ST → `rpCtb091`/`rpCtb092`/`rpCtb061`/Obrigação `rpCtb101` · Nacionais/Importados → `rpCom263`.
**Apuração IPI:** **por Processo → `rpCtb034`** · por Alíquota → `rpCtb018` · Mensal → `rpFin260` · Resumos →
`rpCtb016`/`rpCtb022`/`rpCtb027`.
**ISS / DIPJ:** Apuração ISS → `rpCom304` · Livro ISSQN → `rpCtb025` · DIPJ Fichas 21-22/53/58 → `rpCtb093`/
`rpCtb123`/`rpCtb081`.

### Contabilidade  (≈50 — balancetes / razão / SPED)
**Demonstrações:** Balancete Geral → `rpCtb007` · Comparativo (Filiais/Centro de Custos/Variação Mensal) →
`rpCtb097`/`rpCtb104`/`rpCtb105`/`rpCtb108`/`rpCtb113`/`rpCtb120`/`rpCtb162` · Diário Geral → `rpCtb024` · Razão
(Detalhado/Geral/Projeto/Sintético/Matricial) → `rpCtb031`/`rpCtb004`/`rpCtb008`/`rpCtb070`/`rpCtb068` · DMPL →
`rpCtb135` · **Demonstrativo de Resultado do Processo → `rpFin149`** · Dem. Financeiro Sintético → `rpFin195`.
**Plano de Contas / lançamentos:** Plano de Contas (Completo/Resumido/c-Histórico) → `rpCtb001`/`rpCtb036`/
`rpCtb077`/`rpCtb023` · Lançamentos (Documento/Lote/Borderô/CFOP/Sintéticas) → `rpCtb006`/`rpCtb009`/`rpCtb030`/
`rpCmn003`/`rpCtb066`/`rpCtb115`/`rpCtb125` · Consistência Contábil → `rpCtb043` · Movimento por Encargo →
`rpCtb049` · Diário Auxiliar de Pessoas → `rpCtb044` · Recontabilizados → `rpFin375`.
**SPED:** Balancete SPED → `rpCtb084` · Diário SPED → `rpCtb085` · Razão SPED → `rpCtb083` · Plano Conexos/SPED →
`rpCtb087` · Lançamentos SPED PIS/Cofins → `rpCtb124` · EFD-REINF Recibo → `rpCtb170` · Conferência SPED Fiscal
(1601) → `rpCtb230`.
**Ativo / depreciação:** Bens (Analítico/Sintético/Extrato Movto) → `rpCtb039`/`rpCtb082`/`rpCtb045` · Depreciação
(Sintético/Detalhamento) → `rpCtb046`/`rpCtb078`.

### Tesouraria  (≈60 — extratos / cheques / fluxo de caixa)
**Extratos / conciliação:** Conciliação Bancária → `rpCtb040` · Extrato Bancário (Detalhado/Real/Diário) →
`rpFin082`/`rpFin007`/`rpFin307`/`rpFin356` · Despesas Bancárias → `rpFin122` · Caixa → `rpFin178` · Demonstrativo
Extrato Financeiro → `rpFin158` · Transferência entre Contas → `rpFin249` · Contas Correntes Bancárias → `rpFin112`
· Análise Financeira por Conta → `rpFin313` · Movimento Bancário Sintético → `rpFin120` · Resumo de Movimento →
`rpFin328`.
**Fluxo de caixa:** Fluxo de Caixa → `rpFin065` · Diário Mod02 → `rpFin228` · Realizado → `rpFin352` · **do
Processo Completo → `rpFin032`**.
**Pagamento / Pagfor:** Pagfor (Autorização/Comprovante Bradesco) → `rpFin241`/`rpFin421` · Remessa de Pagamento →
`rpCom224` · Títulos Baixados por Borderô → `rpFin029` · Recibo → `rpFin020`/`rpFin303`/`rpFin329`.
**Cheques** (≈40 modelos por banco/forma — BB/Bradesco/Itaú/Banestes/HSBC/Sicoob/Real): emissão `rpFin014/015/016/
088/091/092/097/101/117/147/148/174/190/199/200/201/202/203/211/215/254/258/301`; controle `rpFin265/278/281/304`;
cópia `rpFin012/031/140/654`.

### Faturamento  (≈60 — DANFE / NF / listagens)
**Impressão/espelho DANFE-NFe** (modelos 3.0/3.10 retrato/paisagem): `rpCom220`/`rpCom229`/`rpCom238`/`rpCom326`/
`rpCom337`/`rpCom414`/`rpCom415`/`rpCom564`/`rpCom605`/`rpCom622`/`rpCom786` · Visualização NFe → `rpCom232` ·
Espelho de NF → `rpCom016`.
**NF de Serviço:** Impressão → `rpCom014` · Espelho → `rpCom269`/`rpCom319` · Pendentes → `rpCom405` · Carta de
Correção → `rpCom360`/`rpCom385`.
**Duplicatas / fatura:** Duplicatas Laser → `rpFin068` · Fatura Laser → `rpFin072` · Impressão de Duplicatas →
`rpFin003` · Desdobramento (por NF/Geral) → `rpFin066`/`rpFin071` · **Juros sob Faturamento → `rpCom362`** ·
Formação do Preço de Venda por Docto → `rpFin127`.
**Listagem de Notas Fiscais** (família ~25): base `rpCom004` · por Cliente `rpCom006` · por CNPJ `rpCom062` · por
Processo `rpCom363` · por CFOP `rpCom384` · por Transportadora `rpCom018` · Representante `rpCom182` · com Produtos
`rpCom035`/Custo Médio `rpCom065`/Despesas `rpCom112`/ICMS `rpCom118` · com Agrupadores `rpCom034`/`rpCom069`/
`rpCom075`/`rpCom114`/`rpCom140` · com Agrup. de Impostos `rpCom058` · Serviços `rpCom037` · a Receber `rpFin399` ·
Posição Financeira `rpCom026` · Cronológico `rpCom032` · Uso Fiscal `rpCom030`. Listagem de Faturamento →
`rpCom251`/por Produto `rpCom076` · Apuração de Tributos → `rpCom409`.

### Comércio Exterior - Exportação  (≈60)
**Invoice/Commercial Invoice** (modelos, PT/EN): `rpCom063`/`rpCom514`/`rpCom519`/`rpCom577`/`rpCom588` ·
`rpLog117`/`rpLog156`/`rpLog193`/`rpLog216`/`rpLog253` · Detalhamento → `rpLog076` · Validação → `rpLog034`/Erros
`rpLog036` · Produtos por Invoice → `rpLog074`/`rpLog106`.
**Packing List:** `rpCom086`/`rpCom265`/`rpCom490`/`rpCom518`/`rpCom578` · `rpLog252`/`rpLog321`.
**Proforma:** `rpCom151`/`rpCom177`/`rpCom204`/`rpCom321`/`rpCom512` · `rpLog065`/`rpLog254` · Controle de Proformas
→ `rpCom177`.
**Purchase Order:** `rpCom197`/`rpCom332`/`rpCom333` · Check List Invoice → `rpCmn054`.
**Contrato/embarque/radar:** Contrato Exportação → `rpCmn136` · Saldo de Embarque por Contrato → `rpCmn129`/
`rpCmn135` · Controle de Saldo na Exportação → `rpImp503` · Draft BL → `rpLog337` · Confirmação de Embarque →
`rpLog330` · Vínculo/Limite de Radar → `rpCmn034`/`rpCmn051` · Pricing FCL → `rpLog333`.
**Gestão exportação:** Follow-up de Exportação → `rpImp644` · Planilha de Exportação → `rpCom080`/`rpCom184` ·
Conta Corrente de Exportação → `rpFin205` · Conciliação Final de Processos → `rpFin081` · Memorando de Exportação
→ `rpCom054`/Detalhamento `rpImp084` · DU-E → `rpLog205` · Rentabilidade Produto → `rpCom313` · DST/DTA → `rpImp029`.

### Comércio Exterior (geral)  ⭐⭐ — FECHAMENTO DE PROCESSO / CUSTO / JUROS (núcleo do `columbia-expense-analysis`)
**Fechamento de Processo** (família grande): Controle de Fechamento → `rpImp073`/`rpImp088`/`rpImp094` · de Câmbio
→ `rpImp057` · **Demonstrativo de Fechamento de Processo** (modelos) → `rpFin118`/`rpFin151`(Parcial)/`rpFin152`/
`rpFin155`/`rpFin159`/`rpFin175`/`rpFin232` · Fechamento de Processo - Geral → `rpFin063`/`rpFin144`/`rpFin253`/
`rpFin365` · **Relatório de Análise de Fechamentos → `rpFin153`** · Relatório Geral de Fechamento → `rpFin621`/
`rpFin171` · Planilha de Acerto de Contas → `rpFin237`/Modelo Cliente `rpFin217` · Resumo Saldo de Processo →
`rpFin250` · Resumo de Movimento por Processo → `rpFin166` · **Resultado do Processo → `rpImp180`** · Demonstrativo
de Processos → `rpFin048` · Fechamento para Cobrança → `rpImp002` · Envio de Prestação de Contas → `rpCom273` ·
Fechamento de Processo → `rpImp264`.
**Planilha de Custo de Importação:** `rpFin235`/`rpFin245`/`rpFin267`/`rpFin274`/`rpFin331` · Estimativa de Custos
→ `rpImp069` · Previsão de Custo → `rpImp072` · Dados p/ Planilhas → `rpCom316` · Pré-Negócio → `rpFin334`.
**Juros / preço:** **Análise de Cálculo de Juros com Saldo → `rpFin414`** · Simulado x Realizado → `rpFin266` ·
Formação do Preço de Venda por Produto → `rpFin210` · Ganho Sobre Vendas → `rpCom090` · Repasse Incentivo Fiscal
→ `rpFdp007`/`rpFdp032`.
**Capa / documentos do processo:** Capa de Processo (Mod/Follow-Up/a Preencher) → `rpLog003`/`rpLog015`/`rpLog044`/
`rpLog054`/`rpLog057`/`rpLog068`/`rpLog078`/`rpLog081`/`rpLog177` · Documentos do Processo → `rpImp038`/`rpImp048` ·
Planilha de Desconsolidação → `rpImp079` · Ficha de BL → `rpImp046` · Análise Prestação de Serviço dos
Despachantes → `rpLog084`.

### Logística  (≈55)
**Embarque / BL:** Relatório de Embarque → `rpLog026`/`rpLog059`/`rpLog077` · Relação Mensal de Embarques →
`rpLog066` · Containers Importados → `rpImp043`/`rpImp119` · Draft BL Marítimo → `rpLog093`/AWB `rpLog094` ·
Instrução de Embarque/Desembaraço Aéreo → `rpLog092`/`rpLog095` · Shipping Instructions → `rpLog201` · INTTRA
Booking → `rpLog210` · House/Master Aéreo → `rpLog323` · Boletim Diário Navios → `rpLog067` · Roteiro Logístico →
`rpLog002`.
**Cotação de Frete (`rpFrt*`):** Marítimo (Container/Peso) → `rpFrt003`/`rpFrt007`/`rpFrt004` · Rodoviário
(Veículo/Peso/NF) → `rpFrt001`/`rpFrt002`/`rpFrt006` · Aéreo por Peso → `rpFrt005` · Cotação de Frete → `rpCom305`.
**Armazenagem / WMS / entrega:** Controle de Períodos de Armazenagem → `rpLog011` · m³ Armazenado → `rpCmn022` ·
Separação de Pedidos → `rpCom330`/`rpCom857` · Log Pedidos/WMS → `rpCom239` · Coleta e Entregas → `rpCom193`/
`rpCom339` · Solicitação de Carregamento → `rpImp058` · Carregamento/Entrega → `rpImp065` · Romaneio de Carga →
`rpLog112` · Controle Transportadora/Despachante → `rpLog007`.
**Custos/seguro/câmbio:** Despesas com Liberação de Conhecimento → `rpFin173` · Planilha de Seguro → `rpLog079` ·
DI/Seguro Internacional Mod02 → `rpLog047` · Fechamento de Câmbio por Cliente → `rpImp074` · DTC/DTA → `rpImp024`
· Controle de Exoneração → `rpImp012`.

### Cadastros Gerais  (≈33)
**Produtos:** Listagem Geral → `rpCmn017` · com Agrupador → `rpCmn007` · por Fornecedor → `rpCmn006` · por Cliente
→ `rpCom119` · Análise → `rpCom331` · Importados EDI → `rpCmn032` · Rastreamento → `rpCmn020`/`rpCmn059`.
**Clientes/cadastro:** Relação Geral de Clientes → `rpCmn057`/`rpCmn066`/`rpCmn086` · Contatos por Empresa →
`rpCmn058` · Tipos de Documentos → `rpCmn005` · Distribuição do Cadastro Geral → `rpTrd005` · Ordem de Produção →
`rpPcp001` · Royalties → `rpCom234`.
**Financeiro/faturamento:** Planilha Acompanhamento Faturado → `rpFin177` · Movimento Financeiro - Proc. Não
Faturados → `rpFin176`.
**Etiquetas** (família): endereços de clientes (Mod 6183/6280/6282/6283/A4350) → `rpCmn056`/`rpCmn025`/`rpCmn040`/
`rpCmn039`/`rpCmn046` · Laser 04711 → `rpCmn061` · Caixa-Proforma → `rpCmn044` · Zebra/Zebra A4 → `rpCom308`/
`rpCom365` · NF/Volume → `rpLog113`/`rpLog350` · Produtos EAN13/3" → `rpCom325`/`rpCom196` · Agenciamento de Carga
→ `rpLog311`.

### Estoques  (≈45)
**Ficha de Estoque:** Custo Médio → `rpCtb032` · Contábil/Gerencial → `rpCtb060`/`rpCtb112`/`rpCtb163` · Analítica
(Produto/Lote/DI) → `rpCom028`/`rpCom159`/`rpCom009`/`rpCom005` · Sintética (Família/Marca/Processo/Produto/Lote)
→ `rpCom041`/`rpCom042`/`rpCom122`/`rpCom157`/`rpCom163`/`rpCom012` · com Agrupadores → `rpCom077` · por
Proprietário PSL → `rpCom081`.
**Posição/movimento:** Posição de Estoque → `rpCom329`/`rpCom357` · Movimento por Produto → `rpCom040`/`rpCom125` ·
PEPS → `rpCtb095` · Mapa de Movimentação → `rpCom334`/Mapa de Estoque `rpCom351` · Resumo → `rpCom097` · por
Cliente/Processo → `rpCom095`/`rpCom298` · Comparativo por Filial → `rpCom324`.
**Importação-específico:** **Estoque a Nacionalizar → `rpCom115`** · Saldo p/ Embarque → `rpCom245` · Saldo
Disponível p/ Venda → `rpCom280` · Giro de Importados → `rpCom283` · Impostos/Logística → `rpCom134` · Inventário
por Processo → `rpCom044` · Demonstrativo Estoque/NF Entrada → `rpCom168`.
**Análise:** Curva ABC → `rpCom246`/`rpCom349` · Movimento e Rentabilidade por Produto → `rpCom293` · Quebra e
Faltas → `rpFin355` · Quantidade de Unidade na NF → `rpCtb147`.

### Comercial e Distribuição  (≈57 — vendas/pedidos)
**Preço / pré-negócio / prospects:** Tabela de Preço → `rpCmn019`/`rpCom130`/`rpCom141`/`rpCom404` · Pré-Negócio →
`rpImp042`/`rpImp062`/`rpImp064`/`rpImp083`/`rpImp092` · Prospects → `rpCmn011`/`rpCmn012`/`rpCmn053`/`rpTrd009` ·
Proposta Comercial → `rpCom100`.
**Pedidos** (família grande): Impressão de Pedidos (modelos) → `rpCom067`/`rpCom099`/`rpCom128`/`rpCom215`/`rpCom276`/
`rpCom309`/`rpCom489`/`rpCom788`/`rpCom859` · Pré-Pedido → `rpCom201`/`rpPed001`/Listagem `rpCom268`/Fluxo `rpCom327`
· Pedido de Venda → `rpCom406` · Listagem/Detalhes/Posição/Atendimento → `rpCom070`/`rpCom211`/`rpCom288`/`rpCom342`
· Eventos → `rpCom344` · Reserva de Estoque → `rpCom343` · Ordem de Compra → `rpCom350` · Pendência Documental →
`rpCom121` · Controle Numeração → `rpCom317`.
**Análise de vendas:** por Cliente/Produto/Estado → `rpFin160`/`rpFin161`/`rpCom328` · com Agrupadores → `rpCom340`
· Resumo de Vendas → `rpCom295` · Produtos Vendidos (Faturados) → `rpCom147`/`rpCom148` · Performance por Vendedor
→ `rpCom416` · Faturamento Mensal → `rpFin326` · Análise de Preço por Item → `rpCom270`.
**Financeiro do projeto:** **Contas a Pagar Exterior x Contas Receber Processos → `rpFin185`** · Caixa (Projeto)
→ `rpFin208` · Prestação de Contas ICMS → `rpFin119` · Nota de Crédito/Débito → `rpFin273`.

### Compras e Almoxarifado  (8)
R.M. Não Atendidas → `rpCom094` · Requisição de Material → `rpCom061` · Retiradas de Estoque por R.M. → `rpCom085`
· Cotação de Preços → `rpCom071` · Cotação Internacional (Exportador/Produto) → `rpCom154`/`rpCom153` · Pedido de
Compra e Autorização de Faturamento → `rpLog022` · Controle de Vínculo de Chave de NF-e → `rpCom853`.

### Incentivos Fiscais  ⭐ (benefício/crédito presumido + comissão — modelo SC/ES)
**Benefício / crédito presumido:** **Apuração de Benefício Fiscal → `rpCtb129`** · **Apuração de Créditos
Presumidos → `rpCtb142`(SC)/`rpCtb187`/`rpCtb266`** · Crédito Presumido PRODEPE → `rpCtb265` · Relatório de
Incentivo Fiscal → `rpFdp029` · Liquidez Inc. Fiscal por Processo → `rpFdp014`.
**Acompanhamento de incentivo:** `rpFdp019` · c/ Subcliente (Total/Quebra/Resumos/Mod2) → `rpFdp006`/`rpFdp003`/
`rpFdp018`/`rpFdp004`/`rpFdp045` · por Status/Trader → `rpTrd007` · Planilha de Clientes p/ Conferência → `rpFdp001`
· NF com/sem Inc. Fiscal (BC ICMS) → `rpFdp010`/`rpFdp011` · Clientes Faturados Sem Repasse → `rpFdp009`.
**Comissão de Trader** (família `rpFdp*`/`rpFin*`): Analítico → `rpFdp021`/`rpFdp028`/CSV `rpFdp073` · Sintético →
`rpFdp020` · Resumo (Trader/Cliente) → `rpFdp015`/`rpFdp022` · Apuração → `rpFdp008` · Simplificado → `rpFdp030` ·
Comissão e Desconto por Cliente → `rpFdp046` · Desconto+Comissionamento Traders → `rpFdp025` · Conta Corrente
Comissionados (Saldo) → `rpFin042`.
**Preço / financeiro do processo:** Formação do Preço de Venda por Processo → `rpFin128` · Resumo de Movimento
Financeiro do Processo → `rpFin094` · Declaração de Trânsito de Importação → `rpImp045` · Movimentação de Estoque
por NCM → `rpCom060`.

### Controladoria  (≈38 — DRE / centro de custo / orçamento)
**Resultado / lucro:** Rentabilidade da Empresa → `rpCom110` · **Demonstrativo de Resultado da Operação →
`rpFin110`/`rpFin111`** · Apuração de Lucro (Presumido/Final/Mod) → `rpCtb109`/`rpCtb062`/`rpCtb058`/`rpCtb063` ·
DLPA → `rpCtb136` · DIPJ Ficha 57 → `rpCtb102`.
**Demonstrativo Financeiro** (por Projeto/Centro de Custo): Sintético → `rpFin075`/`rpFin076`/`rpFin134`/`rpFin164`/
`rpFin321`/`rpFin340` · Analítico → `rpFin062`/`rpFin074`/`rpFin077`/`rpFin096` · Resultado Sintético → `rpFdp047`.
**Despesas / centro de custo:** por Centro de Custos → `rpFin221` · por Projeto → `rpFin039` · Administrativas →
`rpFin348` · Relação de Centros de Custos → `rpCtb094` · Plano Financeiro → `rpCtb005`.
**Orçamento / gerencial:** **Orçado x Realizado → `rpFin136`** · Contábil por C.Custo Orçado x Realizado →
`rpCtb150` · Plano Gerencial (1col/15col/Horiz-Vert) → `rpCom048`/`rpCom049`/`rpCom369` · Fechamento Financeiro →
`rpFin345` · **Posição Financeira de Processos → `rpFin246`** · Movimento Financeiro - Proc. Não Faturados →
`rpFin168` · Faturamento por Setor → `rpFin213`.

### Auditoria  (≈20)
**Documentos / pendências:** Documentos Não Finalizados por Usuário → `rpCom038` · Borderôs Não Finalizado →
`rpFin033` · Auditoria de Documentos → `rpCom216` · Performance de Entrada de Documentos → `rpSta001` · Processo
e Pendência Documental → `rpCom124`.
**Anomalias:** **Controle de Anomalias → `rpImp077`** · Despesas Pagas com Anomalias → `rpFin156`.
**Orçado x Realizado / projetos:** mais modelos → `rpFin139`/`rpFin143`/`rpFin255` · Orçamento Contábil →
`rpCtb118` · Relatório de Projetos → `rpCtb002` · Demonstrativo Centro de Custos Analítico → `rpFin135` · Dem.
Financeiro Sintético (Projeto) → `rpFin061`/`rpFin145`.
**Outros:** Controle de NF de Saída Sintético → `rpFdp024` · Controle de Estoque por NF Entrada → `rpCom600` ·
Codificação de Produtos → `rpCmn055` · Arquivo Morto → `rpGed003` · Despesas por C.Custo Mod04 → `rpFin505`.

### CRM  (≈36 — clientes / rankings)
**Rankings:** Clientes por Atraso → `rpFin284` · Faturamento → `rpCom279`/Anual `rpFin209` · Receitas por Cliente
→ `rpCom278` · Pessoas → `rpCmn008`/por UF `rpCmn014`/por Quitação `rpCmn016`/`rpCmn088`/`rpLog186`.
**Crédito / financeiro do cliente:** Limite de Crédito → `rpFin256`/`rpFin298`/`rpFin585` · Extrato de Cliente →
`rpFin297` · Resumo Financeiro por Cliente → `rpFin098`/com Sub-Clientes `rpFdp017`.
**Análise / cadastro:** Clientes por Trader → `rpTrd001` · Acompanhamento por Status → `rpTrd002` · Movimento NCM/
Cliente → `rpCom206` · Produtos Imp/Exp por Cliente → `rpCmn015` · Análise de Clientes/Fornecedores → `rpCom345`/
`rpCom346` · Ficha de Cadastro/Cadastral → `rpCmn043`/`rpCmn023` · Clientes Inativos/Reconquistados → `rpCmn048`/
`rpCmn049` · Clientes/Produtos Sem Venda → `rpCom250` · Atendimento ao Cliente → `rpCom341`.
**Listagens de pessoas:** Relação Geral → `rpCmn002` · Endereço/Documento → `rpCmn041` · por Cond. Pagamento →
`rpCmn009` · Vendas Efetuadas → `rpCmn038` · Credenciamento → `rpCmn099` · Clientes/Exportadores c/ FOB US$ →
`rpCmn029`.

### Configurações e Acessos  (3)
Demonstrativo de Configurações de EDI → `rpCmn027` · Permissões de Acesso → `rpCmn013`/`rpCmn028`.

### Relatórios Personalizados  (7 — custom Columbia)
**Prévia de Faturamento Columbia → `rpCom910`** · Apuração de Comissão Mod03 → `rpFdp048` · Controle de Checkpoint
de Processos → `rpImp263` · Resumo de Movimento por Despesa → `rpCtb055` · DU-E Simplificado → `rpImp501` · Relação
de Clientes - Crédito e Cobrança → `rpFin289` · Histórico de Envio de E-Mails → `rpGer001`.

### Documentos Eletrônicos (GED)  (4)
Protocolo de Documentação → `rpCom228` · GED - Documentos Vinculados → `rpGed002` · Gerenciamento Eletrônico de
Documentos → `rpGed001` · Importação Dados x Processo → `rpImp103`.

### Procurações e Contratos  (8)
Relatório/Impressão de Procurações → `rpAdm001`/`rpAdm002` · Licenças de Usuários → `rpAdm006` · Relatório de
Contratos → `rpCom111`/`rpCom300` · **Apuração de Seguros → `rpLog064`** · Averbação de Seguro → `rpLog058` ·
Seguro de Transporte Nacional → `rpFin116`.

## Como mapear o restante (método validado)
1. Abrir o menu **Relatórios** → escolher a categoria.
2. `read_page (interactive)` → cada relatório vem como `link href=".../home#?report=rp<...>"` → **rótulo → código**.
3. Abrir 1 relatório → o modal expõe os **parâmetros**; o dropdown Executar expõe os **formatos**.
4. Endpoint sempre `GET /api/report/{codigo}`.

> ✅ **Catálogo COMPLETO (24/24 categorias)** enumerado em 2026-06-22 via rotina. Ver também `navigation-menu.md`
> (menu de Telas). Para abrir/parametrizar qualquer relatório: `/home#?report=<codigo>` (read-only; não acionar
> "Gerar/Executar" sem autorização — dispara download).
