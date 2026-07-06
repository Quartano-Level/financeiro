# Conexos — Documentação Geral da Plataforma (UI ↔ Swagger)

Objetivo: mapear **toda a interface do Conexos** e conectá-la às requisições documentadas no
swagger oficial (`docs/conexos-api/*.json`), produzindo uma **documentação operacional** que conte,
em ordem cronológica, **o que acontece do início ao fim de um processo de importação** na Columbia
Trading. Cada tela/relatório/campo é amarrado ao endpoint que o alimenta e ao atributo do schema.
Isso enriquece a `ontology/` e serve de referência para features e para um eventual MCP do Conexos.

## Por que cronológico (e não alfabético por módulo)

O alvo do negócio é entender a **operação em sequência**. Por isso a documentação é organizada pela
**linha do tempo do processo**, e o mapeamento é feito **tela a tela seguindo essa linha** — cada
iteração estende a narrativa e acumula entendimento de domínio. O swagger é usado para *semear* cada
fase (listar controllers/endpoints/schemas, de graça via script); o navegador é usado só para o caro:
confirmar **rótulo da UI ↔ atributo do schema**, descobrir **qual endpoint alimenta qual widget**, e
registrar a navegação.

## Metodologia (loop validado 2026-06-17)

1. **Âncora**: pegar a fase/tela do spine cronológico abaixo (ou do `MODELO DASHBOARD`).
2. **Semear pelo swagger**: `_inventory.md` + script para extrair endpoints/schemas do controller.
3. **Navegar** no Conexos (forçar full-load: `home → tela`; navegação por hash NÃO recarrega).
4. **Capturar** `read_network_requests urlPattern:"/api/<ctrl>"` no momento da ação (limpar antes).
5. **Casar** o path ao vivo (ex.: `GET /api/com017/encargosGerais/1/5998/2/1/1`) com o template do
   swagger (`/api/com017/encargosGerais/{docTip}/{docCod}/{filCod}/{dtrVldVisivel}/{dtrVldVisivelTotal}`)
   → ler `responses.$ref` → schema → glossário de campos.
6. **Documentar** na ficha da fase (`lifecycle/NN-*.md`) e atualizar `_glossary.md` + `_progress.md`.

### Guard-rails (invioláveis)
- **Read-only**: nunca clicar Salvar/Estornar/Excluir/Submeter/Confirmar. Só navegar, abrir, ler.
- **Credenciais**: o login é sempre do Yuri; eu nunca digito senha.
- **MAX_SESSIONS**: a sessão `MPS_FRANCINEI` é compartilhada com o backend de produção — não derrubar
  sessões; se cair, pausar e avisar.
- **Replicar API por fetch/XHR da página é bloqueado** pelo sandbox da extensão → sempre deixar o app
  disparar a request e observar via captura.

## Espinha cronológica do processo de importação

> Fases derivadas das descrições de tag do swagger (`_inventory.md`) + navegação ao vivo. Cada fase
> vira um arquivo em `lifecycle/`. Controllers entre parênteses são âncoras confirmadas ou candidatas.

| # | Fase | Controllers-âncora (✅ = ficha live) | Tela (UI) | Status |
|--:|------|--------------------|-----------|--------|
| 00 | **Cadastros base** (pessoas, produtos, mercadoria TEC, CFOP) | `cmn025`✅ `com006`✅ `imp013`✅ `cmn023`✅ | Cadastros | ✅ |
| 10 | **Pedido / Contrato** (compra exterior, câmbio) | `com043`✅ `imp059`✅ (`com034` vazio p/ Columbia) | Compras / Pedidos | ✅ |
| 20 | **Embarque / Logística** (proforma, invoice, conhecimento, LI) | `log003`✅ `log009`✅ `log012`✅ `imp174`✅ `log091`✅ `log111`✅ | Logística | ✅ |
| 30 | **Processo de Importação** (espinha) | `imp021`✅ | Processos | ✅ |
| 35 | **Despacho** (DI/DSI, **DUIMP**, registro, adm. temporária, DU-E) | `imp019`✅ `imp223` seed(DUIMP) `imp052`✅(vazio) `imp230`✅(adm.temp.) `imp237`/`imp190`/`imp038` seed | Despacho Aduaneiro | ✅ (DI mapeada; DUIMP seed) |
| 40 | **Encargos & Impostos do processo** | `com017`✅ | Mais Ações → Encargos Gerais | ✅ |
| 50 | **Faturamento** (ODF, fiscais entrada/saída, NF-e) | `imp002`✅(ODF) `com296`✅ `com297`✅ `com319`✅ | Faturamento | ✅ |
| 60 | **Financeiro** (a pagar/receber, títulos, baixa, adto, var.cambial) | `com298`✅ `com299`✅ `com308` seed(detalhe título a pagar) `fin010`✅ `fin014`✅ `com311` seed | Financeiro | ✅ |
| 70 | **Fechamento / Contábil** (débito×crédito, plano de contas) | `ctb002`✅ `imp021/fechProcesso` seed `com099` seed | Fechamento | 🟡 (ctb002 ✅) |
| 90 | **Relatórios / Pesquisas** + cotação | `psq015`✅ `cmn156`✅(PTAX) `psq*` seed | Relatórios | 🟡 (psq015/cmn156 ✅) |

Legenda: ✅ mapeado · 🟡 parcial · ⬜ pendente. **35 telas live** (ver `_registry.json`).

## Modelo de negócio e fluxo documental (descobertas ao vivo, 2026-06-19)

> Achados confirmados abrindo documentos reais no ERP (drilldown). Contexto essencial para qualquer
> agente/humano interpretar as telas.

### Columbia opera **IMPORTAÇÃO POR CONTA E ORDEM (C&O)**
A Columbia **importa em nome próprio por conta e ordem de terceiros** (não compra para revender). Implicações
em toda a plataforma:
- Na **Invoice** (`log009`): `IMPORTADOR` = **Columbia Trading**; `ENCOMENDANTE/ADQUIRENTE` = **cliente real**
  (ex.: INOX-TECH); `EXPORTADOR` = fornecedor exterior. A NF de **entrada** sai em nome do encomendante.
- Cada **processo** gera **vários ODFs** (`imp002`), um por operação fiscal: ENTRADA IMPORTAÇÃO (CFOP 3102/3949)
  + REMESSA C&O (5949) + **PRESTAÇÃO DE SERVIÇOS CONTA E ORDEM** (5933) + REMESSA ARMAZENAGEM (5934) + VENDA
  ENC. INTEREST. (6106). A remuneração da Columbia entra como **NF de serviço** (LC 17.01 Assessoria).
- Telas de venda comum **não são usadas**: `com034` (Pedido de Venda) e `imp052` (Registro de DI) ficam **vazios**.

### Loop financeiro do processo (origem dos encargos)
**Despesas do processo** (forwarders, frete, armazenagem) entram na **Conta Corrente do processo** (`imp021` →
Mais Ações → Conta Corrente, `ViewCcPessoas`, débito×crédito) → são **importadas para o ODF** (`imp002` Serviços
→ botão *Importar C/C Processo*) → viram a **NF de serviço** ao encomendante. As 2 fontes "ENCARGOS GERAIS" do
`MODELO DASHBOARD`/CONCILIAÇÃO = `com017/encargosGerais` (IMPOSTOS) + `imp021/DespesasProcesso` (DESPESAS).

### Fluxo documental end-to-end (5 documentos-chave, todos mapeados em profundidade)
```
Proforma (log003)
   → Invoice (log009)      abas: Invoice · Itens · Câmbio-LOG_043  [Importador=Columbia, Encomendante=cliente]
       → Contrato de Câmbio (imp059)   [taxa fechamento + Var.Total/Acumulada = variação cambial]
   → Processo de Importação (imp021)   [espinha; Conta Corrente; Despesas; Eventos; Checkpoints]
       → DI/DSI (imp019)   abas: Capa · Adições · Itens · Despesas(impostos) · Planilha-IMP_026
             • Adições  → POST imp019/impDiAdicao/list  [NCM, Regime Trib., Método valoração, CIF=Merc+Frete+Seguro]
             • Despesas → POST imp019/impDiPlanilha/list [II(86)/IPI(1038)/PIS(5602)/COFINS(5629)/Siscomex(7811)]
             • Adm. Temporária → imp230 (saldo a baixar por item)
       → Encargos Gerais (com017)   [IMPOSTOS do processo; FRETE INTERNACIONAL aqui]
   → ODF / Ordem de Faturamento (imp002)   abas: Dados · Serviços  [gera NFs; importa C/C do processo]
       → NF entrada (com296) / NF saída (com297)   [com297 Mais Ações → Encargos Gerais]
   → Financeiro: títulos a pagar/receber (com298/com299) → baixa via borderô (fin010/fin014)
   → Fechamento contábil (ctb002 plano de contas) · Relatórios (psq*)
```

### Reforma tributária já presente
A Invoice (`log009`) já tem o campo **Classificador Tributário IBS/CBS** — o ERP está preparado para a
reforma tributária (IBS/CBS substituindo PIS/COFINS/ICMS/ISS).

## Arquitetura de documentação (2 camadas + registro)

A doc serve **duas audiências ao mesmo tempo**: humano/agente entendendo o **fluxo de processos**, e agente
navegando **tela a tela**. Por isso:

- **Camada 1 — `screens/<controller>.md` (índice PRIMÁRIO, navegação agêntica):** 1 arquivo por tela.
  Frontmatter **YAML** (rota, `reach`, endpoints, `sub_screens`, filtros/colunas, status — *máquina*) +
  corpo **Markdown** (o que faz, **layout visual** p/ computer-use, semântica, quirks). Ver `screens/_TEMPLATE.md`.
- **Camada 2 — `lifecycle/NN-*.md` (narrativa do PROCESSO):** a história cronológica 00→90; linka para `screens/`.
- **Registro — `_registry.json`:** índice máquina dos **648 controllers** (status live/seed/stub, rota, fase,
  sub-telas). Um agente carrega isso e tem o mapa inteiro; cobertura = contável.

```
docs/conexos-api/
  README.md            ← plano, metodologia, spine, guard-rails
  _registry.json       ← índice máquina dos 648 controllers (status/rota/fase) — gerado
  screens/_TEMPLATE.md ← template padrão de ficha de tela
  screens/<ctrl>.md    ← 1 ficha por tela (camada 1, navegação agêntica)
  lifecycle/NN-*.md    ← narrativa cronológica do processo (camada 2) → linka p/ screens/
  _inventory.md        ← inventário de 648 controllers por domínio
  _glossary.md         ← glossário de prefixos de campo
  _progress.md         ← tracker resumível entre sessões
  ontology-bridge.md   ← liga entidades da ontology/ → tela + endpoint + DTO
  MAPPING-PLAN.md      ← estado, universo em tiers, estimativa, playbook
  *.json               ← os 23 specs do swagger (recuperados de git c5f3532)
```

Cada ficha de fase contém: **narrativa** (o que acontece no negócio), **telas** (rota UI + como chegar),
**endpoints** (método + path template + params + `$ref` da resposta), **glossário de campos** da grid
principal (rótulo UI ↔ atributo), e **ligações cronológicas** (de onde veio, para onde vai).

## Como alimenta a `ontology/`

Entidades/relações confirmadas viram/atualizam `ontology/entities/*.md`; decisões de modelagem viram
ADRs. O `_index.json` liga entidade → arquivos de implementação; esta doc liga entidade → tela + endpoint
do ERP (a "verdade externa"). Ver memória `conexos-apidocs-access`.
