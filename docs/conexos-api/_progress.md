# Conexos mapping — progresso (resumível entre sessões)

Atualizar a cada iteração. Status: ✅ completo · 🟡 parcial · ⬜ pendente.

> **ARQUITETURA (2026-06-19):** índice primário = **`screens/<controller>.md`** (frontmatter YAML +
> layout visual, p/ navegação agêntica); `lifecycle/NN-*.md` = narrativa do processo (linka p/ screens/);
> **`_registry.json`** = índice máquina dos 648 controllers (live/seed/stub). Coverage atual: **9 live
> (com screens/ file) · 21 seed · 618 stub**. Template em `screens/_TEMPLATE.md`. Ao mapear nova tela,
> criar `screens/<ctrl>.md` e bumpar o status no registry (`C:/tmp/cnx_registry.py`).

## Telas mapeadas

| Fase | Tela | Controller | Endpoint-chave | Doc | Status |
|------|------|-----------|----------------|-----|--------|
| 40 | Encargos Gerais → IMPOSTOS (via Mais Ações do com297) | `com017` | `GET /api/com017/encargosGerais/{docTip}/{docCod}/{filCod}/{dtrVldVisivel}/{dtrVldVisivelTotal}` | `lifecycle/40-encargos-impostos.md` | ✅ |
| 50 | Fiscais de Saída — Pesquisa/Edição | `com297` | `POST /api/com297/list` · `POST /api/com297/comDocProdutos/list/{docCod}/{fisCod}` | `lifecycle/50-faturamento.md` | 🟡 |
| 60 | Financeiro a Pagar — Itens | `com298` | `POST /api/com298/comDocProdutos/list/{docCod}/{fisCod}` | `lifecycle/60-financeiro.md` | 🟡 |
| 30 | Processos — Pesquisa/Edição | `imp021` | `GET /api/imp021/{priCod}` (`ImpProcesso`) · `POST /api/imp021/list` | `lifecycle/30-processo-importacao.md` | 🟡 (cabeçalho ✅ + Despesas ✅; Eventos ⬜) |
| 30 | Processo → Despesas (rodapé) | `imp021` | `POST /api/imp021/DespesasProcesso/{priCod}` (`ImpProcessoDespesas`) | `lifecycle/30-processo-importacao.md` | ✅ = fonte "ENCARGOS GERAIS > DESPESAS" |

## Próximas (ordem cronológica sugerida)

1. 🟡 00 Cadastros: `cmn025` Pessoas, `com006` Produtos (`ComProdutos`✓), `imp013` Mercadoria TEC, `cmn023` CFOP (`CmnCfop`✓) — seed swagger ✅, telas ao vivo ⬜
2. 🟡 10 Pedido/Contrato: `com043` Pedido (`ComPedidos`✓), `imp059` = **Contrato de Câmbio** (`ImpContratoCambio`✓) — seed ✅, ao vivo ⬜
3. 🟡 20 Logística: `log009` Invoice (`PrcInvoice`✓, tela ✅), `log012` CT (`PrcConhecimentoTrasp`✓), `imp174` LI — falta CT/LI ao vivo
4. 🟡 30 Processo: `imp021` (espinha — cabeçalho+Despesas ✅; Eventos ⬜)
5. ⬜ 35 Despacho: `imp237` Presença de Carga, `imp230` Nacionalização, `imp190` DU-E, `imp038` Numerário
6. 🟡 50 Faturamento: `com296` Fiscais de Entrada, `com319` NF-e automática, `imp240` Faturamento em Lote
7. 🟡 60 Financeiro: `com299` a Receber, `com311` Títulos, `fin010` Baixa a Pagar, `fin014`
8. ⬜ 70 Fechamento de processo (débito×crédito, margem — ver `MODELO DASHBOARD` aba CONCILIAÇÃO)
9. ⬜ 90 Relatórios `psq*`

## Notas de sessão
- 2026-06-19 (deep-pass imp021, excelência): aprofundamento ao vivo achou/corrigiu erros que o seed-em-massa
  teria perpetuado: (a) **Mais Ações do imp021 é PROCESS-specific** (Saldo Adm. Temporária · Conta Corrente ·
  Validação · Checkpoints · Responsáveis) — NÃO as opções do com297; (b) **Encargos Gerais NÃO está no
  Mais Ações do processo** (só na NF); (c) rodapé real = Salvar·Listagem·Despesas·**SN**(imp038)·**SP**·Atalhos·
  Mais Ações. Mapeado ⭐ **Conta Corrente** (`POST /api/imp021/ContaCorrente` → `ViewCcPessoas`, débito×crédito
  do processo: Crédito/Débito/Diferença) e **Eventos** (`POST .../ImpEventosProcesso/list/{priCod}` →
  `ImpEventosProcesso`, cronologia interna; visual travou o renderer). Glossário +5 prefixos (cct/vw/prv/tev/pfe).
  imp021 ainda pendente: Saldo Adm.Temp/Validação/Checkpoints/Responsáveis, SP/Atalhos, visual Eventos, header completo.
- 2026-06-19 (cont. deep-pass imp021): ⭐ **Conta Corrente do Processo** capturado COM DADOS (modal "CONTA
  CORRENTE DO PROCESSO - IMP_040", 12 lançamentos: crédito=NF/ICMS, débito=VLR PAGO REF a forwarders FFPV/
  MAERSK/AR SOLUÇÕES; colunas=`ViewCcPessoas`). Form do processo: descobertas seções `INTEGRAÇÃO` (Cód EDI),
  `ENCOMENDANTE ADQUIRENTE`, `ÚLTIMO CHECKPOINT` + colapsáveis I-Observação/II-Faturamento/III-Logística/
  IV-Replicação(IMP_042)/V-Registros-Outras-Filiais. `Saldo Adm. Temporária` = contextual (vazio p/ este
  processo). Pendente (UI de modal instável): Validação/Responsáveis/Checkpoints isolados, visual Eventos,
  SP/Atalhos. imp021 ~90% — segue 🟡 pela barra de qualidade. **Aprendizado de método:** modais às vezes não
  fecham pelo × — usar botão "Fechar" (ref); fechar 1 modal antes de abrir o próximo.
- 2026-06-19 (loop tick): **Validação** = modal "AVISOS" (avisos+erros de validação, toggles Exibir Avisos/
  Erros; vazio no proc.103). Form +seções: ÚLTIMO/PRÓXIMO/MODELO DE CHECKPOINT (Data Venc/Previsão/Dias
  Restantes), INTERNET (flags visibilidade), SITUAÇÃO (ABERTO, resp. ADRIANO_SILVA). Responsáveis: página
  congelou ao abrir (recuperada com reload home→processo). Pendente imp021: Responsáveis, Checkpoints isolado,
  SP/Atalhos, visual Eventos. Próximo: Responsáveis/Checkpoints → cluster com297/298/296/017.
- 2026-06-19 (CONTÍNUO, cluster com297): **achado de método** — `resize_window 1600x1000` DESTRAVA o dropdown
  Mais Ações (a janela tinha encolhido p/ 998px e o menu-pra-cima saía da tela). com297 Mais Ações tem **12
  opções** (não 7): Embarques · **Extrato Cliente** (→nova aba `com191` "Extrato de Clientes" /com191#/{pesCod})
  · Descontos · Comissões · Contabilidade · Docs Relacionados · **Fiscal** (→modal `com300` "FISCAL - COM_300",
  4 abas Inf.Fiscal/Serviço/NF-e/Eventos-Terceiros) · Pedidos · Informação/Observação · Logística · Propriedades ·
  Encargos Gerais (→com017). Criado `screens/com300.md` (live). Documentos do com297 detalhado (Endereço Fat.,
  RESUMO DO DOCUMENTO/TÍTULOS/TRIBUTOS). Registry: 10 live/22 seed. Pendente com297: Embarques/Descontos/Comissões/
  Contabilidade/Pedidos/Logística/Propriedades/Informação + abas do com300 + endpoints de dados.
- 2026-06-19 (CONTÍNUO 2, com297 Mais Ações): **`com015` Descontos** confirmado/documentado (desconto comercial:
  % Cliente 2,35%, Valor Cliente R$ 6.168,95; abas Descontos/Comissionados Comex). **Embarques** e
  **Contabilidade** = sem modal (contextuais nesta NF FINALIZADA — Contabilidade só após contabilização).
  Registry: 11 live/22 seed. Método: clicar itens de menu e Fechar por **ref** (coordenada é flaky e reabre
  Descontos); `permissoes/new/<ctrl>` revela o controller real. Pendente com297: Comissões/Docs Relacionados/
  Pedidos/Informação/Logística/Propriedades + com191 conteúdo + abas com300.
- 2026-06-19 (CONTÍNUO 3, com297 Mais Ações): ⭐ **Pedidos = `com301`** (modal PEDIDO DE VENDA RELACIONADO,
  liga NF↔pedido de venda com034; grid Item/Produto/Descrição/Nº Pedido/Programação). `screens/com301.md` criado.
  **Nota:** `com301` (e provavelmente outros IDs de sub-tela) NÃO tem namespace `/api/com301` no swagger — dispara
  `permissoes/new/com301` mas dados vêm de outro controller; logo conta no screens/ mas não no _registry (648).
  Método ref-click abre modais limpo; **Fechar segue flaky** (às vezes não fecha — navigate reseta). Pendente
  com297: Comissões/Docs Relacionados/Informação/Logística/Propriedades. Registry: 11 live/22 seed (+com301 só em screens/).
- 2026-06-19 (CONTÍNUO 4, com297 Mais Ações): ⭐ **Logística = `com014`** (transporte/frete: Tipo Frete,
  INFORMAÇÕES CTE, Transportadora, Intermediador, Drawback; **embute Reboques=`com291` e Volumes=`com293`** como
  abas). `screens/com014.md` criado. **Comissões** falhou (após navigate o form carregou VAZIO — campos em
  vermelho, botão "Enviar para Conferência"; não cliquei nada por segurança). Registry: 12 live/22 seed, 14
  arquivos screens/. Mapeado do com297 Mais Ações: 6/12 (Descontos/Fiscal/Extrato/Encargos/Pedidos/Logística) +
  2 contextuais. FALTAM: Comissões, Docs Relacionados, Informação/Observação, Propriedades + com291/com293/com191.
  Cuidado: se o form carregar vazio (dados não vieram), recarregar antes de clicar sub-telas.
- 2026-06-19 (CONTÍNUO 5, com297 Mais Ações): ⭐ **Docs Relacionados = `com302`** (101 endpoints; modal 6 abas:
  Doc.Vinculados=com091 · Docs Relacionados · Vínculo Itens NF=com122 · Docs Relac. Serviços=com101 · Serviços
  Exterior=com298 · Pagamentos Antecipados; traz NOTA FISCAL MÃE). `screens/com302.md` criado. **Propriedades**
  não capturado: ref do menu estava STALE pós-navigate e reabriu com302 (aprendizado: SEMPRE re-find do item de
  menu após navigate; conferir parent ref). Registry: **13 live**/22 seed. com297 Mais Ações: **7/12** feito
  (com015/com300/com191/com017/com301/com014/com302) + 2 contextuais. FALTAM: Comissões, Informação/Observação,
  Propriedades + abas embutidas (com091/com122/com101/com291/com293) + conteúdo com191.
- 2026-06-19 (CONTÍNUO 6): **APRENDIZADO CRÍTICO: navigate p/ MESMA URL-com-hash NÃO recarrega** → modais do
  lote anterior persistiam e cliques batiam neles. RESET REAL = **home → /comNNN#/cadastro/{id}** (path muda).
  Menu item coord+ref ambos flaky (mis-hits). **com297 deep-dive ENCERRADO como exemplo-ouro: 7/12 sub-telas
  mapeadas** (com015/com300/com191/com017/com301/com014/com302) + 2 contextuais + 3 deferidas (Comissões/
  Informação/Propriedades = baixo valor, menu flaky). Pivô p/ **breadth**: próximo = **com298 Mais Ações**
  (Financeiro a Pagar — controllers novos), aplicando reset home→tela + screenshot-do-menu-antes-de-clicar.
  Depois com296, demais T1. Registry: 13 live/22 seed.
- 2026-06-19 (CONTÍNUO 7, com298 Mais Ações — REGRAS DE OURO FUNCIONARAM): ⭐ **Propriedades=`com016`**
  (cancelamento/estorno/finalização/situação; usuário digitação) + ⭐ **Informação/Observação=`com131`**
  (obs NF-e/livro fiscal/fisco). **com298 Mais Ações COMPLETO (6/6)**: Extrato(com191)/Contabilidade(contextual)/
  DocsRelac(com302)/Informação(com131)/Propriedades(com016)/Encargos(com017). Isso também **resolve os deferidos
  do com297** (mesmos controllers). **INSIGHT-CHAVE: com296/297/298 compartilham uma BIBLIOTECA COMUM de sub-telas**
  (com016/com131/com302/com191/com017/com300/com015/com014/com301) — mapear 1x serve p/ os 3. com298 tributos =
  PIS/COFINS/CSLL/IRRF (retenções), vs ICMS/IPI do com297. Registry: **15 live**/22 seed, 17 screens. Próximo:
  com296 (confirmar rápido, mesma lib) → breadth T1: com034 Pedidos de Venda, módulo imp (imp052/imp088/imp019).
- 2026-06-19 (CONTÍNUO 8, breadth): `com296` Mais Ações = **mesma biblioteca** de com297/298 (anotado, não re-capturado).
  **`imp088` é SUB-TELA do processo** (rota direta carrega em branco; padrão imp* — mapear via drilldown imp021;
  provável idem imp052/imp019/imp002). ⭐ **`com034` Pedidos de Venda** capturado (standalone; contraparte de com043;
  DTO `ComPedidos` compartilhado; filtros Programação/Bloqueio/Separação/Atendimento; ligado a com297 via com301).
  Registry: **16 live**/22 seed. Próximo: com034 Mais Ações + mais telas standalone com* (breadth); cluster imp
  (imp052/imp088/imp019) via drilldown do imp021 fica p/ uma investida dedicada.
- 2026-06-19 (CONTÍNUO 9, breadth financeiro): aprendizado de **roteabilidade** — nem todo controller é tela
  roteável: **`com311` (títulos) = 404** (embutido no Financeiro, acessado de dentro de um doc); `imp*` detail =
  branco (sub-telas). ⭐ **`com299` Financeiro a Receber** CONFIRMADO LIVE (seed→live): contraparte a-receber do
  com298, DTO `FinDocCab` compartilhado, mesma lib de Mais Ações, inclui adiantamento cliente (`docVldTipoAdto`).
  Registry: **17 live**/21 seed, 19 screens. Padrão de descoberta: navegar /ctrl direto → se 404/branco = não-
  roteável (embutido/sub-tela); se Pesquisa = standalone. Próximo: com006 Produtos, log009/log091, com319 NF-e.
- 2026-06-19 (CONTÍNUO 10, breadth cadastros/logística): ⭐ **`com006` Cadastro de Produtos** (live; NCM +
  alíquotas II/IPI/PIS/COFINS por produto; fase 00; alíquotas vêm do imp013 TEC) + ⭐ **`log091` Invoice de
  Exportação** (live; contraparte do log009 importação; liga Proforma log111; fase 20). Registry: **19 live**/
  20 seed, 21 screens. Standalone roteáveis confirmadas até agora: cmn025/com006/com034/com043/com296/com297/
  com298/com299/log009/log091/imp021/psq015. Próximo: com319(NF-e)/imp013(TEC)/imp174(LI)/cmn023(CFOP)/log012(CT)/
  log111(Proforma). Cluster imp-detail via drilldown imp021 = investida dedicada.
- 2026-06-19 (CONTÍNUO 11): **sessão expirou** (caiu no /login) → loop pausado → Yuri relogou → retomado.
  NB: após relogin, re-aplicar resize 1600x1000. ⭐ **`cmn023` CFOP** (operações fiscais; tratamento IPI/ICMS;
  fase 00) + ⭐ **`log012` Conhecimento de Transporte Importação** (BL/AWB: Nº House/Master, CE, frete; fase 20)
  confirmados live. Registry: **21 live**/18 seed, 23 screens. Standalone confirmadas (15): cmn023/cmn025/com006/
  com034/com043/com296/com297/com298/com299/log009/log012/log091/imp021/psq015. Próximo: com319(NF-e)/imp013(TEC)/
  imp174(LI)/log111(Proforma)/com068(Geração Docs). Cluster imp-detail via drilldown imp021 = investida dedicada.
- 2026-06-19 (CONTÍNUO 12): ⭐ **`imp013` Mercadorias na TEC** (NCM/EX-tarifário; fonte das alíquotas II/IPI/PIS/
  COFINS; fase 00) + ⭐ **`imp174` Importação de LI** (Siscomex Web; deferimento/vínculo processo; botão Siscomex;
  fase 20). **CORREÇÃO DE HEURÍSTICA: nem todo imp* é sub-tela** — imp* de CADASTRO (imp013/imp021/imp174) são
  roteáveis; só os de DETALHE/CÁLCULO do processo (imp088/imp230/imp237) abrem em branco = sub-telas. Registry:
  **23 live**/16 seed, 25 screens. Standalone (17): +imp013/imp174. Próximo: com319(NF-e)/log111(Proforma)/
  com068(Geração Docs)/cmn156(Cotação)/imp052/imp019 (testar roteabilidade). Cluster imp-detail via imp021 depois.
- 2026-06-19 (CONTÍNUO 13): ⚠️ **sessão expirou 2ª vez em ~10min** (MAX_SESSIONS: backend produção derruba a
  sessão interativa frequentemente) → Yuri relogou. ⭐ **`com319` Geração Automática de NF-e** (emissão/transmissão
  NF-e lote ao SEFAZ: XML/Lote/Transmissão/Consulta/Impressão; Ambiente PRODUÇÃO; fase 50). Registry: **24 live**/
  15 seed, 26 screens. Standalone (18): +com319. NB: sessão instável ~10min — manter lotes curtos; se expirar,
  Yuri reloga + /loop. Próximo: log111(Proforma)/com068(Geração Docs)/cmn156(Cotação)/imp052/imp019.
- 2026-06-19 (CONTÍNUO 14, lote curto): sessão sobreviveu. ⭐ **`log111` Proforma de Exportação** (pré-fatura
  que antecede log091 Invoice Export; notify/incoterms/porto; fase 20). Registry: **25 live**/15 seed, 27 screens.
  Standalone (19): +log111. Próximo: com068(Geração Documentos)/cmn156(Cotação Moeda)/imp052/imp019/ctb002(testar).
- 2026-06-19 (CONTÍNUO 15, lote curto): ⭐ **`cmn156` PTAX/Cotação da Moeda** (cadastro índices/moedas; fonte de
  cotação cambial p/ Variação Cambial; ver memória conexos-cmn156-cotacao; fase 90). Registry: **26 live**/15 seed,
  28 screens. Standalone (20): +cmn156. Próximo: com068(Geração Docs)/imp052/imp019/ctb002/fin010(testar roteabilidade).
- 2026-06-19 (CONTÍNUO 16, lote curto): ⭐ **`fin010` Baixa de Títulos a Pagar** (quitação via borderô: data/
  cheque/banco/conta financeira; registra data+taxa de pagamento = base juros perdidos/var. cambial; contraparte
  a receber=fin014; fase 60). Registry: **27 live**/14 seed, 29 screens. Standalone (21): +fin010. Próximo:
  com068(Geração Docs)/fin014/imp052/imp019/ctb002/log003(testar roteabilidade).
- 2026-06-19 (CONTÍNUO 17, lote curto): ⭐ **`fin014` Baixa de Títulos a Receber** (espelho do fin010; lado a
  receber via borderô; taxasBaixa/recebiveis/permuta; fase 60). Registry: **28 live**/13 seed, 30 screens.
  Standalone (22): +fin014. Fase 60 (financeiro) bem coberta (com298/com299/fin010/fin014). Próximo:
  com068(Geração Docs)/ctb002(contábil)/imp052/imp019/log003(testar roteabilidade).
- 2026-06-19 (CONTÍNUO 18, lote curto): ⭐ **`ctb002` Plano de Contas Contábil** (1º ctb*/contábil; chart of
  accounts: conta/natureza/redutora/detalhamento/Reinf; fase 70). NÃO-roteáveis (404, embutidos): **`com308`**
  (fin a pagar exterior/varCambial) e **`com068`** (Geração de Documentos — invocado de dentro do processo/NF).
  Registry: **29 live**/13 seed, 31 screens. Standalone (23): +ctb002. Próximo: imp052/imp019/log003/cmn033/
  ger036(testar roteabilidade); domínio ctb (47 ctrls) = cadastros/relatórios contábeis.
- 2026-06-19 (CONTÍNUO 19, lote curto): ⭐ **`imp052` Registro da Declaração de Importação (DI)** — núcleo do
  DESPACHO ADUANEIRO (fase 35): FOB, datas chegada/embarque, cód. despacho, Nº/NIC House; controller grande (170
  endpoints) c/ Mais Ações (adições/tributos a aprofundar). **MARCO: 30 telas live**; fase 35 agora tem standalone.
  Registry: **30 live**/13 seed, 32 screens. Standalone (24): +imp052. Próximo: imp019/imp002 (testar; prováveis
  telas grandes de despacho)/log003/cmn033/psq017; aprofundar Mais Ações da DI (imp052) depois.
- 2026-06-19 (CONTÍNUO 20, lote curto): ⭐ **`imp019` Cadastro de DI/DSI** (DI com **Adições**/Canal/FOB-USD/
  Frete-moeda-neg; fonte do FOB/frete dos encargos; fase 35). Fase 35 (despacho) agora bem coberta: imp052
  (Registro DI) + imp019 (Cadastro DI/DSI). Registry: **31 live**/13 seed, 33 screens. Standalone (25): +imp019.
  Próximo: imp002/log003/cmn033/psq017/psq014 (testar); aprofundar Mais Ações de imp052/imp019/com034.
- 2026-06-19 (CONTÍNUO 21, lote curto): ⭐ **`imp002` Ordem de Faturamento (ODF)** — dirige a emissão de NFs do
  processo (config faturamento/E-S/CFOP/contrato/intermediador; ponte processo→com296/com297; ref no imp021
  importarDaOdf/fatCheckPoint; fase 50). Registry: **32 live**/13 seed, 34 screens. Standalone (26): +imp002.
  Próximo: log003/cmn033/psq017/psq014/imp190(DU-E) (testar); aprofundar Mais Ações imp002/imp052/imp019/com034.
- 2026-06-19 (CONTÍNUO 22, lote curto): ⭐ **`imp059` Contrato de Câmbio** (FX; taxa fechamento `imcFltTxFec` +
  **Var.Total/Var.Acumulada** = variação cambial NATIVA; vincula hedge/FINIMP; fase 10). Reconcilia com Calculadora
  VC + log009/fechamentoCambio. Registry: **33 live**/12 seed, 35 screens. Standalone (27): +imp059. Fase 10
  (pedido/câmbio) coberta (com043+imp059). Próximo: log003/cmn033/psq017/psq014/imp190(DU-E)(testar).
- 2026-06-19 (CONTÍNUO 23, lote curto): ⭐ **`log003` Cadastro de Proforma (Importação)** (pré-fatura que
  antecede log009 Invoice; PO/Valor Seguro/Origem; fase 20). Fase 20 (logística) cobre proforma(log003)→invoice
  (log009)→conhecimento(log012). Registry: **34 live**/12 seed, 36 screens. Standalone (28): +log003.
  **AVALIAÇÃO: standalone "óbvias" quase esgotadas** — próximos lotes devem PIVOTAR p/ profundidade: aprofundar
  Mais Ações de imp002(ODF)/imp052/imp019(DI)/com034 + cluster imp-detail (imp088 frete, imp230 nacionalização)
  via drilldown imp021. Testar ainda: cmn033/psq017/psq014/imp190.
- 2026-06-19 (CONTÍNUO 24, PROFUNDIDADE — pivô funcionou!): aprofundada a **DI (`imp019`)**. Achado: processo
  103 não tem DI; busca SEM filtro (Limpar) lista MUITAS DIs (Canal VERDE/AMARELO, FOB USD, Nº Adições). Aberta
  DI 26/0702075-0 (BROWN-FORMAN): **abas Capa/Adições/Itens/Despesas(impostos)/Planilha-IMP_026**. Aba ⭐**Despesas
  (impostos)** = `POST /api/imp019/impDiPlanilha/list` → TRIBUTOS reais: II(86)=977,53 · IPI(1038)=1.249,61 ·
  PIS(5602)=114,05 · COFINS(5629)=524,06 · Siscomex(7811)=154,23 = R$3.019,48 + Dados Bancários (ITAÚ). Embute
  imp026 (Planilha). `screens/imp019.md` enriquecido. Método de drilldown validado: Pesquisa(Limpar p/ achar
  doc c/ dados)→duplo-clique→abas. Registry: 34 live/12 seed, 36 screens. Próximo: aba Adições da DI; imp052
  Mais Ações; imp002(ODF)/com034 Mais Ações.
- 2026-06-19 (CONTÍNUO 25, PROFUNDIDADE): aba **Adições** da DI imp019 (nav direto /imp019#/cadastro/2/2607020750/0
  funciona). `POST imp019/impDiAdicao/list` + `GET impDiAdicao/{cdi}/{seq}/{adic}`. Conteúdo: NCM+Regime Tributário
  +Tipo Valorização(MÉTODO 6)+Exportador/Fabricante(BROWN-FORMAN/JACK DANIEL'S)+CIF(VALOR MERCADORIA/FRETE/SEGURO
  em Dólar-MoedaNeg-MoedaNac)+PESO. DI imp019 agora bem mapeada (Capa+Adições+Despesas). `imp019.md` enriquecido.
  Registry inalterado (34 live). Próximo: imp052 Registro DI abrir→abas/Mais Ações; depois imp002(ODF)/com034.
- 2026-06-19 (CONTÍNUO 26, PROFUNDIDADE): **imp052 VAZIO** mesmo Limpar (Columbia não usa "Registro da DI";
  usa imp019). ⭐ **ODF imp002 aprofundado** (8108 ODFs): aberto ODF 3040/3 BUNTECH (`/imp002#/cadastro/{fil}/
  {pri}/{odf}`; `GET imp002/{fil}/{pri}/{odf}` + `grid/imp002/ImpItensOrdFat`). Abas **Dados/Serviços**; Dados=
  DADOS/TRATAMENTO FISCAL(CFOP/Tipo Operação/Série NF)/CLIENTE/TRATAMENTO DO PRODUTO. **INSIGHT DE NEGÓCIO:**
  Columbia opera **IMPORTAÇÃO CONTA E ORDEM** (C&O) — cada processo gera vários ODFs (ENTRADA IMPORTAÇÃO 3102/3949
  + REMESSA C&O 5949 + PRESTAÇÃO SERVIÇOS 5933 + REMESSA ARMAZENAGEM 5934 + VENDA ENC.INTEREST 6106). imp002.md
  enriquecido. Registry inalterado (34 live). Próximo: com034 (Pedido Venda) abrir→abas; aba Itens/Serviços do ODF.
- 2026-06-19 (CONTÍNUO 27, PROFUNDIDADE): **com034 (Pedidos de Venda) VAZIO** com filtros limpos → confirma
  modelo C&O (Columbia não emite Pedido de Venda nem Registro DI/imp052; opera via ODF+DI/DSI). Capturada aba
  ⭐**Serviços** do ODF imp002 (`POST imp002/impOrdFatRelac/list`): grid SERVIÇOS (item LC 17.01 Assessoria=227,97),
  seção ODFS RELACIONADAS, botões **Importar Itens/Importar SN/Importar C/C Processo**. ⭐**LOOP DE NEGÓCIO
  fechado:** despesas do processo (Conta Corrente imp021) → importadas no ODF → viram NF de serviço C&O (com297).
  imp002.md enriquecido (ODF completo: Dados+Serviços). Registry inalterado (34 live). Próximo: drilldown
  imp021→imp230(nacionalização)/imp088(frete) OU aprofundar com297 NF (Mais Ações Encargos Gerais já visto).
- 2026-06-19 (CONTÍNUO 28, PROFUNDIDADE): ⭐ **Invoice log009 aprofundada** (busca por Processo=103 achou Invoice
  350 INOX-TECH; `log009#/cadastro/{invCod}`; `GET log009/{invCod}` + `grid/log009/PrcInvoiceDecreto` +
  importarSeries). Abas **Invoice/Itens da Invoice/Câmbio-LOG_043**. Seções: INVOICE(+campo **IBS/CBS** reforma
  trib.)/IMPORTADOR(COLUMBIA)/EXPORTADOR(FFPV China)/ENCOMENDANTE-ADQUIRENTE(INOX-TECH cliente real)/RECEBEDOR.
  ⭐ Confirma C&O no nível invoice (Columbia=importador de fato, encomendante=cliente real). Aba Câmbio embute
  **log043**. log009.md enriquecido. Registry inalterado (34 live). Próximo: aba Câmbio-LOG_043/Itens da invoice;
  OU drilldown imp021→imp230(nacionalização); OU com297 NF entrada (encomendante).
- 2026-06-19 (CONTÍNUO 29, PROFUNDIDADE): aba **Câmbio-LOG_043** (CÂMBIO DA INVOICE) capturada — **embutida no
  log009, NÃO dispara /api/log043** (frontend-only label, sem screen próprio). Seções: PAGAMENTO(Modalidade BACEN
  21=à vista)/CÂMBIO(**Cobertura Cambial** ATÉ 180 DIAS/PO Order/L Câmbio)/PARCELAS(À VISTA)/CONTRATO(vínculo
  imp059). log009.md enriquecido. Invoice log009 COMPLETA (Invoice/Itens/Câmbio). Registry inalterado (34 live).
  **Documentos-chave mapeados em profundidade end-to-end:** Invoice(log009)+DI(imp019)+ODF(imp002)+Processo
  (imp021)+NF(com297). Próximo: drilldown imp021→imp230 Nacionalização (proc 103→sub-tela)/imp088 Frete; depois
  considerar síntese (lifecycle docs / atualizar README com achados C&O+IBS/CBS).
- 2026-06-19 (CONTÍNUO 30, PROFUNDIDADE + CORREÇÃO): ⭐ **`imp230` = Controle de Saldo de Itens na ADMISSÃO
  TEMPORÁRIA** (NÃO Nacionalização, como antes seed-anotado!). Tela por trás de imp021→Mais Ações→Saldo Adm.
  Temporária. Contextual (nav direto /imp230 = shell + toast 404 por falta de D.A). Abas Saldo Disponível/Baixas;
  grid Adição/NCM/Item/Disponível/Qtd.a Baixar/Qtd.Baixada/Saldo; botões Gerar/Lotes-Séries. Regime aduaneiro
  especial (tributos suspensos). screens/imp230.md criado (route=null, is_subscreen_of imp021). Registry: **35
  live**/11 seed, 37 screens. Próximo: imp088 (Frete/Rateio) testar; aba Itens da Invoice; OU síntese README.
- 2026-06-19 (CONTÍNUO 31, SÍNTESE): **imp088 = branco** (sub-tela pura embutida, sem shell). Pivot p/
  consolidação: **README.md atualizado** — (1) tabela do spine com status real (35 telas live; fases 00-60 ✅);
  (2) nova seção ⭐ **"Modelo de negócio e fluxo documental"**: modelo IMPORTAÇÃO CONTA E ORDEM (Columbia=
  importador, encomendante=cliente; com034/imp052 vazios), loop financeiro (Conta Corrente processo→ODF Serviços
  →NF serviço), **diagrama end-to-end** (Proforma→Invoice→Câmbio/Processo→DI[Adições/Despesas/AdmTemp]→Encargos
  →ODF→NF→Financeiro→Fechamento), e campo IBS/CBS (reforma trib.). Registry inalterado (35 live). Próximo:
  aba Itens da Invoice/Itens da DI; OU lifecycle/NN docs; OU testar imp038(SN)/imp237(presença carga).
- 2026-06-19 (CONTÍNUO 32, breadth fase 35): ⭐ **`imp237` Presença de Carga** (standalone/roteável; evento
  aduaneiro de chegada ao recinto: CE-Mercante/Recinto/Cód.SRF; Consultar/Transmitir Siscomex; Mensagem de Erro
  no grid; precede a DI; fase 35). `ImpPresencaCarga`. Fase 35 (despacho) agora coberta: imp237(presença)→imp019/
  imp052(DI)→imp230(adm.temp). Registry: **36 live**/10 seed, 38 screens. Standalone (29): +imp237. Próximo:
  imp190(DU-E)/imp038(SN) testar; aba Itens Invoice/DI; OU lifecycle/NN docs (camada 2).
- 2026-06-19 (CONTÍNUO 33, breadth fase 35): ⭐ **`imp190` Registro de DU-E** (Declaração Única de EXPORTAÇÃO;
  standalone/roteável; RUC/URF despacho-embarque/Chave de Acesso/declarante; Portal Único Siscomex; Ambiente
  PRODUÇÃO; fase 35 export). Registry: **37 live**/9 seed, 39 screens. Standalone (30): +imp190. Fase 35 quase
  completa: imp237(presença)+imp019/imp052(DI imp)+imp230(adm.temp)+imp190(DU-E export). Próximo: imp038(SN)
  testar; aba Itens Invoice/DI; OU iniciar lifecycle/ camada 2 (narrativa 00→90).
- 2026-06-19 (CONTÍNUO 34, CAMADA 2): **lifecycle/ iniciada** (estava vazia/parcial). Criada **lifecycle/35-
  despacho.md** (narrativa completa: presença imp237→DI imp019[Capa/Adições/Despesas]→adm.temp imp230→DU-E
  imp190→encargos com017; linka screens/). Enriquecida **lifecycle/50-faturamento.md** (já existia c/ NFs) com
  seção ⭐**ODF imp002** (tabela CFOPs C&O + loop financeiro C/C-processo→serviço). Camada 2 agora demonstra a
  estrutura nas 2 fases mais profundas. Registry inalterado (37 live). Próximo: lifecycle 30-processo/40-encargos/
  60-financeiro (enriquecer/criar); OU voltar browser (imp038/aba Itens); OU lifecycle/README índice.
- 2026-06-19 (CONTÍNUO 35, browser): aba **Itens da Invoice** log009 capturada — `POST log009/prcInvoiceItens/
  list` + `grid/log009/prcInvoiceItens` + initialValues. Grid PRODUTOS: Item/Cód.Exportador/Cód.Produto/Desc/
  **NCM**/Unidade/Qtd/Peso/Vlr Unit-Total/**II%/IPI%/PIS%/COFINS%** (da TEC imp013)/Nº LI. Botões Vistos/Validação/
  **Classificação NVE**/**Atualizar Tributos**. Real: FLANGE LAP JOINT NCM 73079100, II 12,60/IPI 3,25/PIS 2,10/
  COFINS 9,65%. Itens invoice→Adições DI. log009.md enriquecido — **Invoice 100% mapeada** (Invoice/Itens/Câmbio).
  Registry inalterado (37 live). Próximo: lifecycle 20-logistica/60-financeiro; OU imp038(SN); OU psq* relatório.
- 2026-06-19 (CONTÍNUO 36, consolidação camada 2): lifecycle/ tinha duplicata — meu **35-despacho.md** (live) vs
  seed **35-despacho-nacionalizacao.md** (com erros já corrigidos: imp230≠Nacionalização, imp237 NÃO é sub-tela).
  Foldei detalhes únicos do seed (imp038 SN, imp233 estoque pré-ACD, schema ImpPresencaCarga) no 35-despacho.md e
  **removi o duplicado contraditório**. lifecycle/ agora limpo 1-por-fase: 00,10,20,30,35,40,50,60,70,90. Registry
  inalterado (37 live). NB lifecycle seeds (00/10/20/30/40/60/70/90) ainda precisam revisão p/ achados live (ex.:
  60-financeiro c/ fin010/014; 20 c/ log003 proforma; corrigir imp059=câmbio). Próximo: enriquecer 1 lifecycle
  seed por tick c/ findings live; OU browser imp038/psq*.
- 2026-06-19 (CONTÍNUO 37, lifecycle enrich): **lifecycle/60-financeiro.md** atualizado — fin010/fin014
  confirmados ao vivo (baixa via borderô: Data Borderô/Cheque/Banco/Conta Financeira; permuta=encontro de contas;
  taxa conversão bxaFltTxconv=base juros perdidos/var.cambial); cabeçalho 🟡→✅; links p/ screens/ (com298/com299/
  fin010/fin014/imp059). Registry inalterado (37 live). Próximo lifecycle seed p/ revisar: 30-processo-importacao
  (Conta Corrente/Eventos/C&O), 20-logistica (log003 proforma), 10-pedido (imp059 câmbio). OU browser imp038/psq*.
- 2026-06-19 (CONTÍNUO 38): **psq012 = 404** (nem todo psq* roteável direto — psq015 era exceção; relatórios
  acessados via menu). Pivot escrita: **lifecycle/30-processo-importacao.md** enriquecido — add sub-telas live:
  **Conta Corrente** (`ContaCorrente`→ViewCcPessoas; débito×crédito; ⭐núcleo do loop C&O: débito de despesas→
  importado no ODF imp002→NF serviço), **Eventos** (`ImpEventosProcesso`; cronologia), Validação/Saldo Adm.Temp/
  rodapé (SN imp038/SP). Cabeçalho 🟡→✅; links screens/imp021/imp002/imp230. Registry inalterado (37 live).
  Próximo lifecycle seed: 20-logistica (log003 proforma+links log009/012/091/111), 10-pedido (imp059 câmbio),
  40-encargos (com017 FRETE), 00-cadastros. OU browser imp038(SN nav direto).
- 2026-06-19 (CONTÍNUO 39, lifecycle enrich): **lifecycle/10-pedido-contrato.md** atualizado — imp059 Contrato
  de Câmbio confirmado ao vivo (Var.Total/Var.Acumulada=var.cambial nativa; hedge/FINIMP; imcFltTxFec); cabeçalho
  ⬜→✅; links screens/com043+imp059. Lifecycle live-verificados: **10,30,35,50,60 ✅**. Restam seeds: 00,20,40,70,
  90. Registry inalterado (37 live). Próximo: enriquecer 20-logistica (log003/log009/log012/log091/log111) OU
  40-encargos (com017 FRETE+impostos) OU 00-cadastros; OU browser imp038(SN). Fechamento(70)/relatórios(90) = seed.
- 2026-06-19 (CONTÍNUO 40, lifecycle enrich): **lifecycle/20-logistica.md** atualizado — add **log003 Proforma
  importação** (antecede invoice), abas da Invoice (Itens prcInvoiceItens NCM+alíquotas→Adições DI; Câmbio-LOG043;
  C&O importador/encomendante), links screens/ log009/log012/imp174, seção exportação (log111 proforma/log091
  invoice export), CE-Mercante→imp237. Cabeçalho 🟡→✅. Lifecycle live-verificados: **10,20,30,35,50,60 ✅**.
  Restam seeds: 00,40,70,90. Registry inalterado (37 live). Próximo: 40-encargos (com017 FRETE+II/IPI/PIS/COFINS,
  ligar DI imp019 Despesas) OU 00-cadastros (cmn025/com006/imp013/cmn023). 70-fechamento/90-relatorios=seed final.
- 2026-06-19 (CONTÍNUO 41, lifecycle enrich): **lifecycle/40-encargos-impostos.md** enriquecido — add ponte
  **DI imp019 Despesas(impDiPlanilha=recolhimento c/ data/banco) → com017 encargosGerais (consolidação rateada
  na NF)**: os MESMOS tributos em 2 pontos do ciclo. Cadeia de alíquotas TEC imp013→Invoice Itens→Adições DI.
  Fontes não-trib: despesas imp021/DespesasProcesso, financeiro/var.cambial. Links screens/com017+imp019+log009.
  Lifecycle live-verificados: **10,20,30,35,40,50,60 ✅**. Restam seeds: 00,70,90. Registry inalterado (37 live).
  Próximo: 00-cadastros (cmn025/com006/imp013/cmn023) OU 70-fechamento (Conta Corrente/ctb002/var.cambial) OU
  90-relatorios; OU browser. Quase toda a camada 2 live-verificada.
- 2026-06-19 (CONTÍNUO 42, lifecycle enrich): **lifecycle/70-fechamento.md** enriquecido — add **débito×crédito
  ao vivo** (imp021 Conta Corrente ViewCcPessoas = base operacional do fechamento; Crédito NF/ICMS × Débito
  forwarders × Diferença; loop C&O), plano de contas ctb002 (contábil), var.cambial nativa (imp059 Var.Total/
  Acumulada vs taxa baixa bxaFltTxconv; PTAX cmn156). Links screens/. Cabeçalho 🟡→✅. Lifecycle live-verificados:
  **10,20,30,35,40,50,60,70 ✅** (8 de 10). Restam seeds: 00,90. Registry inalterado (37 live). Próximo:
  00-cadastros (cmn025/com006/imp013 TEC/cmn023; cadeia imp013→Invoice→DI) OU 90-relatorios (psq015/cmn156);
  depois camada 2 ~completa. OU browser imp038/novo standalone.
- 2026-06-19 (CONTÍNUO 43, lifecycle enrich): **lifecycle/00-cadastros.md** enriquecido — imp013 TEC confirmado;
  ⭐ documentada **cadeia de alíquotas completa**: TEC imp013(alíquotas/NCM)→Itens Invoice log009(% item)→Adições
  DI imp019(valoração)→tributos recolhidos(DI Despesas)→encargos com017(fase40). Links screens/ em cmn025/com006/
  imp013/cmn023; produto→tecEspCod→imp013; CFOP→ODFs. Cabeçalho 🟡→✅. Lifecycle live-verificados: **00,10,20,30,
  35,40,50,60,70 ✅ (9/10)**. Resta só seed 90-relatorios. Registry inalterado (37 live). Próximo: enriquecer
  90-relatorios (psq015/cmn156; nota psq* via menu); depois lifecycle/README.md índice 00→90; OU browser.
- 2026-06-19 (CONTÍNUO 44, ⭐ CAMADA 2 COMPLETA): enriquecido último seed **90-relatorios.md** (roteabilidade
  psq* via menu/psq012=404; psq015 exceção live; **cmn156 PTAX** cotação→var.cambial; links screens/). Cabeçalho
  🟡→✅. **TODAS as 10 fases lifecycle (00-90) live-verificadas ✅.** Criado **lifecycle/README.md** (índice:
  tabela fase→arquivo→telas-âncora→status; diagrama fluxo documental; guia uso humano/agente). **As 2 camadas
  agora completas e cruzadas:** screens/ (39 fichas, navegação agêntica) + lifecycle/ (10 fases+índice, narrativa).
  Registry: 37 live/9 seed. Próximo: atualizar MAPPING-PLAN.md (estado atual) + ontology-bridge; OU browser
  (imp038/novo standalone); OU revisar README principal. Mapeamento maduro — considerar polish/consolidação.
- 2026-06-19 (CONTÍNUO 45, ontology-bridge): **ontology-bridge.md** consolidado — CORRIGIDO: Di/AdicaoDi agora
  →**imp019** (impDiAdicao adições/impDiPlanilha tributos; antes apontava errado p/ imp190); ContratoCambio
  imp059 confirmado FX (Var.Total/Acumulada); Ncm imp013 alíquotas. ADICIONADAS 5 entidades→telas live: DU-E
  (imp190 export), **OrdemFaturamento (imp002)** ⭐candidata nova, PresencaCarga (imp237), BaixaTitulo (fin010/
  fin014), Proforma (log003/log111). Enriquece ponte ontologia↔ERP (objetivo central). NÃO editei ontology/
  entities/* (governados). Registry inalterado (37 live). Próximo: atualizar MAPPING-PLAN.md (estado maduro);
  OU browser (trk* rastreamento/fup* follow-up/ger036); OU revisar README principal. Mapeamento ~completo.
- 2026-06-19 (CONTÍNUO 46, descoberta Dashboard): **fup001 redireciona p/ /home** (widget/robô, não tela).
  Revelou o **Dashboard** (ponto de entrada): painel ⭐**ROBÔS** ("acionamento de robôs de consulta e transmissão")
  = camada de automação de integração: Siscomex Carga/Tracking Container/Imp+Exp L.I./NF-e/Imp+Exp D.I./Consulta
  CT-e/Documentos Destinados (cada um c/ config/credencial/log) — provável base do domínio **fup*** (follow-up/
  robôs, sem tag swagger). + Notícias Internas (CNPJ Alfanumérico/SPED ECF/ECD=compliance evoluindo) + Cotação
  (cmn156). Criado **screens/_home.md** (Dashboard + barra superior global; orientação p/ agentes). Registry
  inalterado (37 live, _home não é controller). Próximo: testar trk* (tracking) roteável; OU MAPPING-PLAN update.
- 2026-06-19 (CONTÍNUO 47, MAPPING-PLAN update): **MAPPING-PLAN.md** trazido ao estado atual — estado (37 live/
  espinha 00→90 completa/C&O/IBS-CBS/ROBÔS; _registry.json=fonte de verdade), leitura honesta reformulada (valor
  na espinha não na cauda), e **armadilhas corrigidas com aprendizados live**: roteabilidade=5 desfechos
  (Pesquisa standalone[imp* cadastro tbm]/branco=sub-tela/shell+404=contextual[imp230]/404=embutido/redirect-home=
  robô fup); drilldown validado (Limpar→Editar→abas, ler network); telas vazias C&O (imp052/com034); MAX_SESSIONS
  ~10min+protocolo relogin. Premissa antiga "todo imp* despacho=sub-tela" marcada FALSA. Registry inalterado (37
  live). Docs de governança (README/MAPPING-PLAN/lifecycle/ontology-bridge/_registry) todos consistentes agora.
  Próximo: browser (trk* tracking/ger036/wrk) OU revisar screens/ stubs importantes (com311/imp240/imp088).
- 2026-06-19 (CONTÍNUO 48, breadth tail): **trk006 = 404** (embutido). Domínio **trk* (tracking) sem tela
  standalone** — acessado via robô "Tracking de Container" do Dashboard, não por URL. Confirma RETORNO MARGINAL
  BAIXO da breadth restante: trk/fup/wrk/arq/ger-config = backends de robôs/config sem UI própria. **ESTADO:
  mapeamento maduro+consolidado; espinha 00→90 completa em profundidade; docs todos consistentes.** RECOMENDAÇÃO
  ao Yuri: pausar o loop ou redirecionar (ex.: aprofundar 1 sub-tela específica de interesse; semear stubs
  com311/imp240; ou construir MCP a partir dos endpoints catalogados). Registry inalterado (37 live). Se continuar
  breadth: marcar trk*/fup*/wrk* como não-roteáveis (embutidos/robôs) em vez de testar 1 a 1.
- 2026-06-19 (CONTÍNUO 49, seed stub): Yuri manteve loop (consolidação). Semeada **screens/com311.md** (Títulos
  Financeiros: parcelas dos docs com298/com299; titEspNumero/titDtaVencimento/titMnyValor/titFltTaxaMneg;
  varCambial/list=var.cambial por título; sub-tela de com298/com299, route=null, status SEED). Links fin010/fin014/
  lifecycle60. Registry: 37 live/9 seed (com311 já contava em seed, agora c/ ficha), 41 fichas. Próximo (se loop
  continuar): semear imp240 (Faturamento em Lote, fase 50) OU revisar consistência; AGUARDA decisão Yuri (1=parar/
  2=aprofundar específico/3=MCP/4=breadth). Mapeamento essencialmente completo.
- 2026-06-19 (CONTÍNUO 50, seed stub): semeada **screens/imp088.md** (Frete/Rateio de Despesas: distribui frete
  internacional+despesas pelos itens/adições=base CIF+encargos; sub-tela pura de imp021/imp019, route=null, SEED;
  endpoints list+rateio/list; liga log012 cntMnyFrete→com017). Registry: 37 live/10 seed/42 fichas. Stubs muito-
  referenciados agora c/ ficha: com311(títulos)+imp088(frete). Próximo (se continuar): imp240(Fat.Lote)/com308
  (varCambial exterior) seed; OU parar. AGUARDA decisão Yuri. Mapeamento completo — ticks agora são polish marginal.
- 2026-06-19 (CONTÍNUO 51, seed stub + PAUSA): semeada **screens/imp240.md** (Faturamento em Lote: gera NFs de
  vários ODFs de uma vez; imp002→com296/297→com319; fase 50, SEED). Registry: 37 live/11 seed/43 fichas. **3º lote
  sem direção do Yuri → PAUSEI o loop** (não reagendei) e levei a decisão via AskUserQuestion (1=parar/2=aprofundar/
  3=MCP/4=breadth). Mapeamento COMPLETO. Para retomar: Yuri escolhe direção OU /loop. Stubs-chave semeados:
  com311/imp088/imp240. Resíduos: trk/fup/wrk/arq/ger não-roteáveis (robôs/config); imp223/com308 ainda stub.
- 2026-06-19 (LOOP ENCERRADO): Yuri escolheu **PARAR** (objetivo cumprido). Estado final: **37 telas live + 6
  seed c/ ficha = 43 fichas screens/**; **lifecycle/ 00-90 completa + índice (todas live-verificadas)**; README
  (síntese C&O+IBS/CBS+ROBÔS), MAPPING-PLAN (estado maduro), ontology-bridge (entidades↔telas), _registry.json
  (648 ctrls: 37 live/11 seed/600 stub) — todos consistentes. 5 documentos-chave em profundidade (Invoice log009/
  DI imp019/ODF imp002/Processo imp021/NF com297). Para retomar: /loop ou tarefa específica. Próximas opções
  registradas: aprofundar sub-tela específica / construir MCP / breadth bruta dos stubs.
- 2026-06-19 (RETOMADO — Yuri apontou GAP REAL: os 2 MENUS de navegação): eu mapeava adivinhando controllers,
  NÃO percorri os menus oficiais. **(1) Menu "Telas"** (1º ícone): árvore oficial, busca + Favoritos, **28
  categorias**; `read_page interactive` dá **rótulo→/controller**. Criado **navigation-menu.md** (Cadastros +
  Comércio Exterior capturados; revelou telas de GESTÃO inéditas: Follow Up `imp187`/Dashboard Processos `imp194`/
  Análise Gerencial `imp189`/Gerência `imp108`/Auditoria `imp158-159`). **(2) Menu "Relatórios"** (2º ícone):
  ⭐ SUBSISTEMA À PARTE não mapeado — relatórios NÃO são /comNNN: são `GET /api/report/{rpCod}`, abrem por
  `/home#?report=rpCod`, modal de parâmetros, export **CSV/DOCX/HTML/PDF/RTF/XLSX**, Histórico. Criado **reports.md**.
  ⭐ **FIM 028 = `rpFin028` "Adiantamento de Títulos Diversos"** (Relatórios→Financeiro a pagar→Adiantamentos)
  MAPEADO: params (Filial/Tipo Doc/Processo/Pessoa/Encomendante/Datas Emissão-Venc-Quitação/Nº Título) + export.
  Família adto: rpFin028/rpFin240(Títulos de Adto)/rpFin317(Adto X Despesas). **CORREÇÃO ao "completo" anterior:
  faltavam 2 SUBSISTEMAS inteiros (menus de navegação + motor de relatórios).** PENDENTE: enumerar as ~26
  categorias restantes do menu Telas + as categorias do menu Relatórios (cada uma = 1 read_page). Sessão ~10min.
- 2026-06-19 (varredura menu Telas — Yuri pediu COMPLETA): capturadas **16/28 categorias** (todas de maior valor)
  em **navigation-menu.md** via `read_page(ref_id=ref_172)`→click ref→read panel: Cadastros, Comércio Exterior
  (+T.E.C./Tracking/Agenciamento/Travas-Bloqueios ger*), Despacho Aduaneiro (DUIMP imp223/ICMS imp184/Anvisa
  imp152/LPCO/Siscomex Web), Faturamento (ODF imp002/NF-e com319/NF Serviço com303), Logística-WMS (com276/log062),
  Doc a Pagar (com298/psq014/fin010/SISPAG fin015/Gestão Pagto fin064), Doc a Receber (com297/com299/psq015/fin014/
  Cobrança fin060), **Trade Finance** (Adto Fornecedor Estrangeiro com368/Var.Cambial imp134/Finimp imp117/Hedge
  imp120/imp059), Tesouraria (concil. fin133/Fluxo Caixa fin141), Tributos/Fiscal (IBS-CBS com377/Apuração ctb038/
  CFOP cmn023), Índices/Moedas (CDI fin101/PTAX cmn156), Contabilidade (ctb002/Contab.Var.Cambial log067),
  Regimes Especiais (Ato Concessório imp193), Compras (com043), Distribuição/Vendas (com034/ped*). **PENDENTE (12,
  baixo valor admin/config):** Produção/Políticas Comerciais/CRM/Controladoria/Orçamentos Ger./Liberações/Ativo
  Permanente/SPED/Administrativo/GED/Setup-EDI/Filiais Estrangeiras/Procedimentos. ⚠️ **BLOQUEIO:** menu re-renderiza
  em loop ("Aguarde Carregando"), invalida refs entre chamadas + congela screenshots → parei a varredura por ref.
  Menu **Relatórios**: só grupo Adiantamentos enumerado (FIM 028=rpFin028 mapeado); demais categorias pendentes.
- 2026-06-22 (rotina 60s, menu Relatórios): MÉTODO CONFIÁVEL achado — **abrir menu + clicar categoria por
  COORDENADA no MESMO browser_batch** (refs churnam, mas coords são estáveis; screenshot só funciona c/ menu
  fechado). Coords (x=60): cat i → y≈75+(i-1)*19. Capturadas em reports.md: **Financeiro a pagar** (FIM028 rpFin028
  +Contas a Pagar rpFin010+Amex rpFin401), **Financeiro a receber** (rpFin018+~25 SN+~14 boletos), **Trade Finance**
  (Var.Cambial Mensal rpImp120/Câmbio C&O rpFin125/Fechamento rpImp004-063/Finimp rpImp104), **Despacho Aduaneiro**
  (Itens DI por NCM/Encargos rpImp056/Conferência Impostos DI-DUIMP rpImp826/Relação DI's rpImp005-021). **4/24
  categorias Relatórios feitas.** Pendentes (20): Cadastros Gerais(y75)/Comex Exp(y94)/Comex Imp(y113)/Comex(y132)/
  Logística(y170)/Comercial-Distrib(y189)/Estoques(y208)/Faturamento(y227)/Compras(y246)/Incentivos Fiscais(y265)/
  Tesouraria(y341)/Contabilidade(y360)/Tributário-Fiscal(y379)/Controladoria(y398)/Auditoria(y417)/CRM(y436)/
  GED(y455)/Procurações(y474)/Config-Acessos(y493)/Relatórios Personalizados(y512). Depois: tail Telas (12 admin).
- 2026-06-22 (rotina 60s, cont.): +**Comex Importação** (~65 rel.: acompanhamento processos/Demurrage/⭐SAP recon
  rpImp857-859/Demonstrativo rpFnc009/Comissão Invoice rpFdp033) +**Tributário/Fiscal** (~50: livros fiscais/
  apuração ICMS-IPI por processo rpCtb038/rpCtb034/SPED/DIPJ/ISS). **6/24 categorias Relatórios feitas** (Fin
  pagar/receber, Trade Finance, Despacho, Comex Imp, Tributário). reports.md atualizado. Próximas: Contabilidade
  (360)/Tesouraria(341)/Faturamento(227)/Comex Exp(94)/Comex(132)/Logística(170)/Cadastros Gerais(75)/Estoques
  (208)/Comercial-Distrib(189)/Compras(246)/Incentivos(265)/Controladoria(398)/Auditoria(417)/CRM(436)/GED(455)/
  Procurações(474)/Config-Acessos(493)/Relatórios Personalizados(512). Sessão viva. Método coord OK.
- 2026-06-22 (rotina 60s, cont.): +**Contabilidade** (~50: balancetes/razão/SPED contábil-fiscal-REINF/Demonstr.
  Resultado Processo rpFin149) +**Tesouraria** (~60: extratos/conciliação rpCtb040/Fluxo Caixa rpFin065+Processo
  rpFin032/Pagfor/~40 modelos de cheque). **8/24 categorias Relatórios feitas.** Pendentes(16): Faturamento(227)/
  Comex Exp(94)/Comex(132)/Logística(170)/Cadastros Gerais(75)/Estoques(208)/Comercial-Distrib(189)/Compras(246)/
  Incentivos Fiscais(265)/Controladoria(398)/Auditoria(417)/CRM(436)/GED(455)/Procurações(474)/Config-Acessos(493)/
  Relatórios Personalizados(512). reports.md atualizado. Sessão viva.
- 2026-06-22 (rotina 60s, cont.): +**Faturamento** (~60: DANFE/NFe espelhos/NF Serviço/Listagem NF família/Juros
  Faturamento rpCom362) +**Comex Exportação** (~60: Commercial Invoice/Packing/Proforma/PO/Radar/Conta Corrente
  Exp rpFin205) +**Comex geral** ⭐⭐ (núcleo expense-analysis: **FECHAMENTO DE PROCESSO** família rpFin063-365/
  Demonstrativo rpFin118-232/Análise Fechamentos rpFin153/Resultado Processo rpImp180; **Planilha Custo Importação**
  rpFin235-331; **Análise Juros c/ Saldo rpFin414**; Capa Processo rpLog003-177). **11/24 categorias Relatórios.**
  Pendentes(13): Logística(170)/Cadastros Gerais(75)/Estoques(208)/Comercial-Distrib(189)/Compras(246)/Incentivos
  Fiscais(265)/Controladoria(398)/Auditoria(417)/CRM(436)/GED(455)/Procurações(474)/Config-Acessos(493)/Relatórios
  Personalizados(512). reports.md atualizado. Sessão viva.
- 2026-06-22 (rotina 60s, cont.2): +**Logística**(~55: embarque/BL/Cotação Frete rpFrt*/seguro rpLog079)
  +**Cadastros Gerais**(~33: produtos/clientes/etiquetas) +**Estoques**(~45: Ficha Estoque família/a Nacionalizar
  rpCom115) +**Comercial e Distribuição**(~57: preço/pedidos/vendas/Contas Pagar Ext×Receber Proc rpFin185).
  **15/24 categorias Relatórios.** Pendentes(9): Compras(246)/Incentivos Fiscais(265)/Controladoria(398)/Auditoria
  (417)/CRM(436)/GED(455)/Procurações(474)/Config-Acessos(493)/Relatórios Personalizados(512). reports.md atualiz.
- 2026-06-22 (rotina 60s, cont.3): +**Compras**(8: cotação/requisição) +**Incentivos Fiscais** ⭐(~35: Benefício
  Fiscal rpCtb129/Créditos Presumidos SC rpCtb142-266+PRODEPE rpCtb265/Acompanhamento Inc.Fiscal rpFdp*/⭐COMISSÃO
  de Trader família rpFdp008-073+Conta Corrente Comissionados rpFin042/Liquidez por Processo rpFdp014). **17/24
  categorias Relatórios.** Pendentes(7): Controladoria(398)/Auditoria(417)/CRM(436)/GED(455)/Procurações(474)/
  Config-Acessos(493)/Relatórios Personalizados(512). NB: clique acidental abriu robô imp175 (aba avulsa, fechada)
  — confirmar menu aberto antes do click categoria. reports.md atualizado.
- 2026-06-22 (rotina 60s, cont.4): +**Controladoria**(~38: DRE/Resultado Operação rpFin110-111/Dem.Financeiro por
  Projeto-CCusto/Orçado×Realizado rpFin136/Posição Financeira Processos rpFin246) +**Auditoria**(~20: docs não
  finalizados/Anomalias rpImp077-rpFin156/Projetos rpCtb002). **19/24 categorias Relatórios.** Pendentes(5): CRM
  (436)/GED(455)/Procurações(474)/Config-Acessos(493)/Relatórios Personalizados(512). reports.md atualizado.
- 2026-06-22 (rotina 60s, cont.5): +**CRM**(~36: rankings/limite crédito/extrato cliente/análise) +**GED**(4:
  rpGed001-002/protocolo) +**Procurações e Contratos**(8: rpAdm001-006/contratos/seguros rpLog064). **22/24
  categorias Relatórios.** Pendentes(2): Config-Acessos(493)/Relatórios Personalizados(512). Prefixos rp vistos:
  rpFin/rpCom/rpCtb/rpImp/rpLog/rpCmn/rpFdp/rpFrt/rpTrd/rpAdm/rpGed/rpSta/rpPcp/rpPed/rpFnc. reports.md atualizado.
- 2026-06-22 (rotina 60s — ⭐ RELATÓRIOS COMPLETO 24/24): +**Config e Acessos**(3: EDI/permissões) +**Relatórios
  Personalizados**(7: custom Columbia — Prévia Faturamento rpCom910/Checkpoint rpImp263/Comissão rpFdp048).
  **MENU RELATÓRIOS 100% (24/24, ~700 relatórios rp<Dom>NNN)**; reports.md marcado catálogo completo (cabeçalho).
  FALTA agora: **tail do menu TELAS (13 admin)** → navigation-menu.md, via coord (botão Telas=33,25): Produção
  (113)/Políticas Comerciais(189)/CRM(208)/Controladoria(360)/Orçamentos(379)/Liberações(398)/Ativo Permanente
  (455)/SPED(474)/Administrativo(512)/GED(531)/Setup-EDI(550)/Filiais Estrangeiras(569)/Procedimentos(588).
- 2026-06-22 (rotina 60s, tail Telas): +**Produção**(pcp001-005/FCI com340) +**Políticas Comerciais**(Comissão
  com204-253/Bloqueio ODFs com351-352/Tabela Preços com033) +**CRM**(prospect cmn059/E-mail ger003-033/Funil
  cmn177/Gestão Negócio cmn179). navigation-menu.md. **Telas tail 3/13.** Pendentes Telas(10): Controladoria(360)/
  Orçamentos(379)/Liberações(398)/Ativo Permanente(455)/SPED(474)/Administrativo(512)/GED(531)/Setup-EDI(550)/
  Filiais Estrangeiras(569)/Procedimentos(588).
- 2026-06-22 (rotina 60s, tail Telas cont.): +**Controladoria**(Plano Contas Fin/Ger fin004/006/Projetos ctb004/
  Centro Custos ctb003/Rateio ctb079-080/Unid Negócio com181) +**Orçamentos**(ctb019/ctb032/fin003) +**Liberações**
  (Reg DI/DUIMP imp207-211/Liberação Faturamento imp097/Despesas Processo imp054). **Telas tail 6/13.** Pendentes
  Telas(7): Ativo Permanente(455)/SPED(474)/Administrativo(512)/GED(531)/Setup-EDI(550)/Filiais Estrangeiras(569)/
  Procedimentos(588).
- 2026-06-22 (rotina 60s, tail Telas cont.2): +**Ativo Permanente**(ctb011-039/Depreciação ctb023) +**SPED**
  (Geração SPED ctb048/REINF ctb069/LALUR ctb061) +**Administrativo**(Contratos cmn033-187/Workflow wrk001-009).
  **Telas tail 9/13.** Pendentes Telas(4): GED(531)/Setup-EDI(550)/Filiais Estrangeiras(569)/Procedimentos(588).
- 2026-06-22 (rotina 60s — ⭐⭐ AMBOS MENUS COMPLETOS): +**GED**(arq* arquivamento físico+eletrônico) +**Setup/EDI**
  (ger* admin: usuários/EDI ger036/Robôs ger081/scripts bancários/Interface Fiscal ger017) +**Filiais Estrangeiras**
  (Processos no Exterior fin138-142) +**Procedimentos**(índice amplo cadastros/parametrização: Eventos Processo
  cmn021/Checkpoint cmn165/geografia/transporte). **MENU TELAS 100% (28/28)** + **MENU RELATÓRIOS 100% (24/24)**.
  navigation-menu.md + reports.md marcados completos. **ROTINA 60s ENCERRADA** — ambos subsistemas de navegação
  oficial do Conexos mapeados (label→controller p/ telas; ~700 rp p/ relatórios). Domínios de controller além do
  _registry: arq(GED), ger(admin), wrk(workflow), pcp(produção), frt(frete), fdp(incentivo/comissão), trd(trader),
  adm(procuração), sta(estatística), ped(pedido). Resíduo: imp223/com308 stubs nunca semeados (baixo valor).
- 2026-06-22 (rotina 60s — ⭐⭐ AMBOS MENUS COMPLETOS): +**GED**(arq* arquivamento físico+eletrônico) +**Setup/EDI**
  (ger* admin: usuários/EDI ger036/Robôs ger081/scripts bancários/Interface Fiscal ger017) +**Filiais Estrangeiras**
  (Processos no Exterior fin138-142) +**Procedimentos**(índice amplo cadastros/parametrização: Eventos Processo
  cmn021/Checkpoint cmn165/geografia/transporte). **MENU TELAS 100% (28/28)** + **MENU RELATÓRIOS 100% (24/24)**.
  navigation-menu.md + reports.md marcados completos. **ROTINA 60s ENCERRADA** — ambos subsistemas de navegação
  oficial do Conexos mapeados (label→controller p/ telas; ~700 rp p/ relatórios). Domínios de controller vistos
  além do _registry: arq(GED), ger(admin), wrk(workflow), pcp(produção), frt(frete), fdp(incentivo/comissão),
  trd(trader), adm(procuração), sta(estatística), ped(pedido), ger(relatório custom rpGer), fnc.
- 2026-06-19 (CONTÍNUO 25, PROFUNDIDADE): aba **Adições** da DI imp019 (nav direto /imp019#/cadastro/2/2607020750/0
  funciona). `POST imp019/impDiAdicao/list` + `GET impDiAdicao/{cdi}/{seq}/{adic}`. Conteúdo: NCM+Regime Tributário
  +Tipo Valorização(MÉTODO 6)+Exportador/Fabricante(BROWN-FORMAN/JACK DANIEL'S)+CIF(VALOR MERCADORIA/FRETE/SEGURO
  em Dólar-MoedaNeg-MoedaNac)+PESO. DI imp019 agora bem mapeada (Capa+Adições+Despesas). `imp019.md` enriquecido.
  Registry inalterado (34 live). Próximo: imp052 Registro DI abrir→abas/Mais Ações; depois imp002(ODF)/com034.

- 2026-06-22 (finalização stubs + doc MCP): semeadas fichas dos 2 stubs referenciados que faltavam — **imp223**
  (DUIMP, 137 endpoints, sucessor da DI imp019, fase35: item/tributos/análise anuente-RFB/conferência/pagamentos,
  chave dimCod/dioCod) e **com308** (Financeiro a Pagar detalhe do título, 38 endpoints, fase60: adiantamento
  FinTituloAdto/baixas/varCambial CtbVarCambialTitulo/titVinculado/modalidade PIX-TED — sub-tela de com298).
  _registry.json regerado (seed 11→13, stub 600→598). Criado **`docs/conexos-arquitetura-e-mcp.md`** (raiz docs/,
  não /tmp): 3 camadas (swagger/contrato + interface/navegação + ontologia/semântica), conceito de MCP (host/client/
  server, tools/resources/prompts, JSON-RPC), proposta de MCP do Conexos (reúso ConexosService/ConexosClient),
  acoplamento camada-a-camada, roadmap faseado, guard-rails. README spine 35/60 atualizado.
- 2026-06-17: framework criado (README, _inventory, _glossary, _progress). Fase 40 ✅.
  com297/com298 parciais. imp021 (espinha): cabeçalho `ImpProcesso` ✅ + Despesas `ImpProcessoDespesas` ✅.
  **Insight-chave**: as 2 fontes "ENCARGOS GERAIS" da CONCILIAÇÃO = `com017/encargosGerais` (IMPOSTOS) +
  `imp021/DespesasProcesso` (DESPESAS). Achado de wire: `GET /api/grid/{ctrl}/{Entity}` retorna config de colunas.
  Próximo: imp021 Eventos; fases 00/10/20 (Cadastros/Pedido/Logística); 35 (Despacho/Nacionalização).
- 2026-06-17 (loop tick 2): fichas 00/10/20 semeadas pelo swagger (schemas `ComProdutos`, `CmnCfop`,
  `ComPedidos`, `ImpContratoCambio`, `PrcInvoice`, `PrcConhecimentoTrasp`). `log009` Invoice confirmado
  ao vivo (tela "Invoice - Pesquisa"). Correção: **imp059 = Contrato de Câmbio** (não contrato comercial).
- 2026-06-17 (loop tick 3): ficha 35 (Despacho/Nacionalização) semeada (`imp237` Presença de Carga
  `ImpPresencaCarga`, `imp230` Nacionalização, `imp190` DU-E/declaração, `imp038` Solicitação de Numerário).
  `cmn025` Pessoas confirmado ao vivo ("Cadastro de Pessoas - Pesquisa").
- 2026-06-17 (loop tick 4): fases 50/60 enriquecidas. **Insight: `com296`/`com298`/`com299` compartilham
  o DTO `FinDocCab`** (mesmo doc, `docVldTipo` diferente). `com296` Fiscais de Entrada confirmado ao vivo.
  `com311` (títulos), `fin010`/`fin014` (baixa a pagar/receber) semeados.
- 2026-06-17 (loop tick 5): **espinha 00→90 fechada (seed completo)**. Fichas 70 (Fechamento:
  `imp021/fechProcesso` `ImpProcessoFechamento`, `com099/resultadoFaturamento` margem, `log009/fechamentoCambio`
  `ImpContratoCambioInv` com `vlrVariacaoCambial` nativa) e 90 (Relatórios `psq015/014/017/...`) criadas.
  Marco: ciclo cronológico do processo de importação documentado de ponta a ponta. Próximo: aprofundar telas
  de Edição ao vivo (com043, imp230/imp237, abas de com297/com298, psq015/014) e ligar à `ontology/`.
- 2026-06-17 (loop tick 6): criado **`ontology-bridge.md`** — liga 14 entidades da ontology a tela+endpoint+DTO
  (sem editar arquivos governados). Achados de enriquecimento p/ Curator: `Invoice` (planned) → campos reais
  `PrcInvoice`; `EncargoNF` usa `dpp*` (despesas[]) mas IMPOSTOS usam `dtr*`; `FinDocCab` como DTO-base comum
  a com296/298/299. Próximo: capturar telas Edição ao vivo (com043, psq015) e detalhar abas.
- 2026-06-17 (loop tick 7): `psq015` confirmado ao vivo = **"Pesquisa de Documentos a Receber"** (cols
  Valor Título / Valor Juros do Título / Valor Desconto + TOTALIZADOR). Renderer lento (screenshot timeout)
  — colunas à direita pendentes. Backbone completo; ticks agora são polimento incremental por tela.
- 2026-06-17 (loop tick 8): `com043` Pedido de Compra confirmado ao vivo ("Pedido de Compra - Pesquisa").
  Agora TODAS as fases 00→90 têm ≥1 tela confirmada ao vivo. Pendências = polimento (imp059/com006/imp013/
  imp230/imp237 Edição, colunas restantes de psq*). Valor marginal por tick baixo a partir daqui.
- 2026-06-17 (loop tick 9): aprendizado de navegação — `imp237`/`imp230` são **sub-telas** (não abrem
  via rota direta; precisam de contexto de processo). Renderer travou 2x (screenshot timeout). **Loop pausado
  aqui**: backbone 00→90 completo + todas as fases com tela ao vivo + ontology-bridge. Resta só polimento
  frágil (sub-telas via drilldown). Retomar: abrir processo `imp021` e drilldown p/ imp237/imp230; detalhar
  abas Documentos de com297/com298; colunas restantes psq015/psq014.
