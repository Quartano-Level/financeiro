# ClonexComex — Ontologia Comex v0.1

**Versão:** 0.1  
**Data:** Abril/2026  
**Audiência:** Time técnico (Yuri, CTO, FDE2, Data) + Francinei (validação fiscal) + investidores técnicos  
**Status:** documento técnico vivo. Esta é a v0.1 inicial. Cada cliente novo refina.

---

## Sumário

1. [O Que É Ontologia (Visão Conceitual)](#1-o-que-é-ontologia)
2. [O Que A Ontologia Vai Virar (Visão de Longo Prazo)](#2-visão-de-longo-prazo)
3. [Princípios da Ontologia ClonexComex](#3-princípios)
4. [Metodologia de Construção](#4-metodologia)
5. [Ontologia v0.1 — Objetos](#5-ontologia-v01-objetos)
6. [Ontologia v0.1 — Relacionamentos](#6-ontologia-v01-relacionamentos)
7. [Ontologia v0.1 — Ações](#7-ontologia-v01-ações)
8. [Implementação Técnica](#8-implementação-técnica)
9. [Roadmap de Evolução v0.1 → v1.0](#9-roadmap-de-evolução)

---

## 1. O Que É Ontologia

### 1.1 Definição

**Ontologia** é a representação formal de como uma área de conhecimento está estruturada — quais entidades existem, quais propriedades cada entidade tem, como elas se relacionam, e quais ações podem ser executadas sobre elas.

No contexto da Palantir (origem dessa abordagem em produto de software), ontologia não é apenas um esquema de dados. É **a camada que une dados, lógica de negócio e ações executáveis** em um modelo unificado que permite humanos, código e agentes de IA trabalharem sobre a mesma representação de realidade.

### 1.2 Diferença Entre Ontologia e Esquema de Banco de Dados

| Aspecto | Esquema de Banco | Ontologia |
|---|---|---|
| Foco | Como armazenar | Como o negócio opera |
| Granularidade | Tabelas e colunas | Objetos, relacionamentos, ações |
| Ações | Inexistentes (apenas CRUD) | Primeira-classe (regras de negócio) |
| Semântica | Implícita no nome | Explícita e versionada |
| IA-friendly | Difícil (precisa interpretação) | Direta (objetos + ações são fornecidos) |
| Mudança | Migration de schema | Versão da ontologia |

Exemplo concreto:
- **Esquema:** tabela `notas_fiscais` com colunas `id`, `valor`, `cnpj_emissor`
- **Ontologia:** objeto `Nota Fiscal` com propriedades semânticas, relacionamento com objeto `Fornecedor`, ação `Conciliar com Invoice` que tem regras de validação explícitas e produz objeto `Operação Fiscal Concluída`

### 1.3 Por Que Ontologia Importa Para Comex

Comércio exterior brasileiro tem **três características que tornam ontologia essencial**:

**Primeira: complexidade regulatória extrema.** Centenas de regras tributárias, dezenas de regimes especiais, mudanças mensais. Sem ontologia, cada regra fica espalhada em código → manutenção vira pesadelo.

**Segunda: heterogeneidade de dados.** Cada cliente tem ERP configurado de forma diferente, fornecedores diferentes, produtos diferentes, regimes diferentes. Sem ontologia, cada deploy é uma nova solução. Com ontologia, é uma nova instância da mesma estrutura.

**Terceira: interdependência operacional.** Uma DI errada quebra a NF, que quebra o crédito, que quebra o fechamento. Sem ontologia, a relação entre erros é descoberta em produção. Com ontologia, é representada explicitamente.

### 1.4 O Que Ontologia Habilita Em Produto

Quando a ontologia está madura, ela habilita capacidades que sem ela seriam impossíveis:

- **Agentes de IA confiáveis** — LLMs operando sobre objetos definidos têm taxas de alucinação dramaticamente menores que LLMs operando sobre texto livre
- **Reutilização entre clientes** — mesmo objeto `Nota Fiscal` serve para Columbia, Level, Sertrading, com configurações específicas mas estrutura compartilhada
- **Auditabilidade total** — toda decisão é rastreável: qual objeto foi modificado, por qual ação, sob quais regras, por quem
- **Velocidade de desenvolvimento de novos módulos** — novo módulo herda ontologia existente, foca apenas no que é específico
- **Integração com ERPs** — write-back para o ERP é natural quando ontologia mapeia objetos do ERP

---

## 2. Visão de Longo Prazo

### 2.1 Onde Queremos Chegar (3-5 Anos)

Em 3-5 anos, a Ontologia ClonexComex será:

**Profundidade:** ~150-300 objetos cobrindo todo o ciclo comex (importação, exportação, regimes especiais, financeiro, logístico, fiscal, contábil) com profundidade suficiente para representar 80%+ das operações de uma trading média.

**Cobertura regulatória:** todas as principais normas comex brasileiras representadas como regras na ontologia (NCM, regimes aduaneiros, tributos federais e estaduais, normas Banco Central, normas Receita).

**Integração:** conectores com Conexos (primário), SAP, TOTVS, Oracle, Siscomex/Portal Único, Bancos (extratos de câmbio), Receita Federal (consultas).

**Ações executáveis:** ~500+ ações disparáveis por humanos ou agentes — desde "reclassificar NCM" até "abrir DI" até "solicitar reembolso de tributo".

**Agentes:** 5-15 agentes especializados (Classificador NCM, Conciliador Documental, Auditor de Crédito, Monitor Regulatório, etc.) operando em modo shadow ou ativo conforme cliente.

### 2.2 Camadas Futuras

Visão das camadas que a ontologia terá em 3-5 anos:

```
┌─────────────────────────────────────────┐
│  Camada 5: Agentes Especializados       │ ← AIP / IA
│  (Classificador, Conciliador, Auditor)  │
├─────────────────────────────────────────┤
│  Camada 4: Workflows e Orquestração     │ ← Lógica composta
│  (Fechamento mensal, Drawback, etc.)    │
├─────────────────────────────────────────┤
│  Camada 3: Ações                        │ ← Regras de negócio
│  (Conciliar, Classificar, Apurar)       │
├─────────────────────────────────────────┤
│  Camada 2: Relacionamentos              │ ← Grafo
│  (NF→Fornecedor→Contrato→Operação)      │
├─────────────────────────────────────────┤
│  Camada 1: Objetos                      │ ← Entidades
│  (NF, DI, Invoice, Câmbio, Operação)    │
├─────────────────────────────────────────┤
│  Camada 0: Conectores                   │ ← I/O
│  (Conexos, SAP, Siscomex, RFB)          │
└─────────────────────────────────────────┘
```

A v0.1 cobre principalmente Camadas 0-2 com início de Camada 3. Camadas 4-5 são roadmap de 12-30 meses.

### 2.3 Princípio de Acumulação

A ontologia **só funciona se for cumulativa**. Cada cliente novo deve adicionar 5-15% de objetos/relacionamentos novos e validar 85-95% de objetos existentes. Se um cliente novo exige criar 50% de objetos novos, ou a tese está errada ou o cliente não é o ICP (Ideal Customer Profile).

Métrica-chave: **% de reutilização de ontologia por novo cliente.** Meta: > 70% ao final de 6 clientes; > 85% ao final de 15 clientes.

---

## 3. Princípios

### 3.1 Princípios de Modelagem

**P1 — Modela como o negócio fala, não como o sistema armazena.**  
Se o controller chama de "operação de importação" e o ERP chama de `t_imp_op_001`, a ontologia chama de `OperacaoImportacao`.

**P2 — Objeto > Tabela.**  
Um objeto pode mapear para múltiplas tabelas no ERP. Uma tabela do ERP pode ser parte de múltiplos objetos.

**P3 — Ações são primeira-classe.**  
Não há "objetos passivos". Toda mudança de estado é uma ação nomeada com regras explícitas.

**P4 — Regulação é parte da ontologia.**  
NCM não é um código numérico; é um objeto com classificação, alíquotas, regimes aplicáveis, relação histórica.

**P5 — Tempo é parte da ontologia.**  
Cada propriedade pode ser histórica. Alíquota mudou em 2024? Ontologia sabe disso e qual valor aplicar para operação de qual data.

**P6 — Cliente-específico é configuração, não fork.**  
Cada cliente tem configurações que variam (conta contábil, filial, fornecedor preferencial), mas estrutura é a mesma.

**P7 — Write-back é cidadão de primeira classe.**  
Toda ação que modifica realidade deve ter caminho de volta para o sistema-fonte (ERP).

### 3.2 Princípios de Implementação

**I1 — Tipado fortemente.**  
TypeScript types ou equivalente. Compilador verifica relações.

**I2 — Versionado.**  
Cada release da ontologia é versionada. Migrations entre versões.

**I3 — Schema-first.**  
JSON Schema (ou equivalente) como source of truth. Código gerado a partir do schema, não vice-versa.

**I4 — Test-driven.**  
Cada objeto e ação tem testes unitários. Cada relacionamento tem testes de integridade.

**I5 — Observable.**  
Toda execução de ação é logada com input, output, ator, timestamp.

**I6 — Documentation-as-code.**  
Documentação vive no mesmo repositório do código. Markdown gerado automaticamente a partir de schemas.

---

## 4. Metodologia

### 4.1 Como Construir a Ontologia (Triângulo de Descoberta)

A ontologia NÃO se constrói olhando o ERP. Constrói-se com três fontes de evidência simultâneas:

```
                Discovery Humano
                (Yuri/FDE2 no cliente)
                       │
                       │
       Arqueologia ────┼──── Síntese com
       de Dados        │     Domain Expert
       (scripts no DB) │     (Francinei)
                       │
                Ontologia v0.x
```

#### 4.1.1 Vértice 1 — Discovery Humano

**Quem:** Yuri ou FDE2 + CEO ocasionalmente  
**Onde:** No cliente, fisicamente quando possível, remoto via chamada longa caso contrário  
**Duração:** 1-2 semanas por cliente, no início de cada relacionamento ou de cada novo módulo

**Atividades:**
- Sentar ao lado de quem opera (controller, fiscal, comércio exterior)
- Anotar: o que faz, em que ordem, por que faz, quando para, quando confere com outro
- Identificar: onde abre Excel, onde liga para alguém, onde imprime, onde escolhe entre opções
- Coletar: nomes que usam para coisas (vocabulário do cliente)
- Mapear: quem decide o quê, com base em qual informação

**Output:**  
- Documento de 10-30 páginas: "Como se opera X em [cliente]"
- Lista de "objetos candidatos" (substantivos que aparecem repetidamente)
- Lista de "ações candidatas" (verbos que descrevem o que se faz)
- Lista de "regras de negócio" (condicionais que aparecem na fala)

#### 4.1.2 Vértice 2 — Arqueologia de Dados

**Quem:** Yuri ou Data + auxiliar técnico  
**Onde:** Acesso ao banco de dados do cliente (Conexos primariamente)  
**Duração:** 1 semana paralela ao discovery humano

**Atividades:**
- Mapear todas as tabelas com volume vivo (>1.000 registros, atividade últimos 6 meses)
- Identificar foreign keys e cardinalidades
- Análise de campos preenchidos vs vazios (qual % de uso)
- Detectar padrões de queries (se houver log do ERP)
- Amostragem de registros típicos (10-50 por tabela importante)

**Output:**
- Documento de "Mapa de Dados Conexos no Cliente X"
- Lista de tabelas categorizadas por importância
- Documentação de FKs e relacionamentos
- Identificação de campos críticos (alta cardinalidade, alta variabilidade)

**Importante:** **NÃO usar agente LLM como oráculo aqui.** LLM pode sugerir agrupamentos semânticos, mas todo agrupamento precisa ser validado por humano + Francinei. LLM como estagiário, não como expert.

#### 4.1.3 Vértice 3 — Síntese com Domain Expert

**Quem:** Yuri + CTO + Francinei + CEO  
**Onde:** Whiteboard session (físico ou Miro), sessões de 2-4h  
**Duração:** 2-3 sessões por cliente/módulo, total de 8-12 horas

**Atividades:**
- Apresentar discovery humano + arqueologia de dados
- Francinei valida: "isso aqui é uma confusão entre 2 conceitos. São coisas diferentes."
- Refatorar objetos candidatos baseado na visão fiscal
- Definir relacionamentos
- Definir ações com regras de negócio
- Identificar onde regulação entra como parte da ontologia

**Output:**
- Ontologia v0.x atualizada
- Decisões registradas (por que escolhemos modelar X assim)
- Lista de "abertos" — coisas que precisam de mais investigação

### 4.2 Cadência de Evolução

| Frequência | Atividade | Responsável |
|---|---|---|
| Semanal | FDE registra "aprendizados de campo" em backlog | FDE2 |
| Quinzenal | Code review de ontologia (PRs novas) | Yuri + CTO |
| Mensal | Reunião de "Abstração" — o que de cliente vira ontologia | Yuri + CTO + Francinei |
| Trimestral | Release versionada da ontologia (v0.1 → v0.2 → ...) | Yuri |
| Por novo cliente | Discovery + Arqueologia + Síntese | Yuri + FDE2 + Francinei |
| Por novo módulo | Iteração focada em domínio do módulo | Yuri + CTO + Francinei |

### 4.3 Quando NÃO Adicionar à Ontologia

Resistir à tentação de modelar tudo. **Não adicionar à ontologia:**

- Objetos usados por apenas 1 cliente sem perspectiva de generalização
- Regras de negócio extremamente específicas (vão como configuração do cliente)
- Estados temporários de UI (não pertencem à ontologia)
- Dados de log/auditoria (têm seu próprio modelo)

Modelo mental: ontologia descreve **o que é universal ou universalizável** no comex brasileiro. Variações específicas vão para configuração.

---

## 5. Ontologia v0.1 — Objetos

A v0.1 cobre o domínio fiscal-tributário-documental com objetos suficientes para sustentar:
- NFSe / NFMe / CTe (módulos atuais)
- Calculadora de Encargos (módulo atual)
- Operação Fiscal Assistida Columbia (próximo)
- Conciliação documental (módulo #2 candidato)

### 5.1 Objetos Centrais

#### 5.1.1 `Empresa`
Representa a entidade legal cliente.
- `id`: identificador único interno
- `cnpj`: CNPJ
- `razaoSocial`: razão social
- `nomeFantasia`: nome fantasia
- `regimeTributario`: enum (Lucro Real, Presumido, Simples)
- `setorAtividade`: enum (Trading, Indústria, Serviços, etc.)
- `filiais`: array de `Filial`
- `configuracoesContabeis`: configuração específica do cliente
- `metadata`: dados adicionais (data de cadastro, status, etc.)

#### 5.1.2 `Filial`
Representa estabelecimento (CNPJ matriz/filial).
- `id`
- `empresa`: ref para `Empresa`
- `cnpj`
- `enderecoCompleto`
- `inscricoesEstaduais`: array
- `inscricoesMunicipais`: array

#### 5.1.3 `Fornecedor`
Representa contraparte em operações de compra.
- `id`
- `tipo`: enum (Nacional, Estrangeiro)
- `identificacao`: CNPJ se Nacional, código fiscal estrangeiro se Estrangeiro
- `pais`: ref para `Pais`
- `dadosBancarios`: array (para câmbio)
- `historicoCompras`: agregado de `OperacaoFiscal`

#### 5.1.4 `Pais`
Representa país. Necessário para regimes, tratados, NCMs.
- `id`
- `codigoBacen`: código Bacen
- `iso`: ISO 3166
- `nome`
- `tratadosAplicaveis`: array (Mercosul, ALADI, etc.)

#### 5.1.5 `NotaFiscal`
Representa documento fiscal eletrônico (NF-e, NFSe, NFMe).
- `id`
- `tipo`: enum (NFe, NFSe, NFMe, CTe)
- `numero`
- `serie`
- `chaveAcesso`
- `dataEmissao`
- `dataEntrada`: quando aplicável
- `emitente`: ref para `Empresa` ou `Fornecedor`
- `destinatario`: ref para `Empresa` ou `Fornecedor`
- `valorTotal`
- `itens`: array de `ItemNotaFiscal`
- `tributos`: ref para `ApuracaoTributaria`
- `status`: enum (Emitida, Cancelada, Denegada, Conciliada, Pendente)
- `documentosRelacionados`: refs (DI, Invoice, etc.)
- `xmlOriginal`: armazenamento do XML

#### 5.1.6 `ItemNotaFiscal`
Linha de produto/serviço dentro de NF.
- `id`
- `notaFiscal`: ref
- `produto`: ref para `Produto`
- `quantidade`
- `valorUnitario`
- `valorTotal`
- `cfop`: ref para `CFOP`
- `ncm`: ref para `NCM` (se aplicável)
- `cest`: ref para `CEST` (se aplicável)
- `tributos`: cálculos por item

#### 5.1.7 `Produto`
SKU/Item comercializado.
- `id`
- `codigoInterno`: SKU do cliente
- `descricao`
- `ncm`: ref para `NCM` (mais provável)
- `unidadeComercial`: enum
- `pesoLiquido`
- `pesoBruto`
- `historicoNCM`: array (para tracking de reclassificações)

#### 5.1.8 `NCM`
Nomenclatura Comum do Mercosul. Objeto regulatório.
- `codigo`: 8 dígitos
- `descricao`
- `unidadeEstatistica`
- `aliquotasVigentes`: array com vigência
  - `imposto`: enum (II, IPI, PIS, COFINS, ICMS-Imp)
  - `aliquota`: percentual
  - `vigenciaInicio`
  - `vigenciaFim`
- `regimesEspeciaisAplicaveis`: array (Drawback, RECOF, Ex-tarifário)
- `historicoMudancas`: array

#### 5.1.9 `DI` (Declaração de Importação)
Operação de importação registrada no Siscomex.
- `id`
- `numero`: número da DI
- `tipo`: enum (Consumo, Admissão Temporária, Drawback, etc.)
- `dataRegistro`
- `dataDesembaraco`
- `importador`: ref para `Empresa`
- `exportador`: ref para `Fornecedor`
- `adicoes`: array de `AdicaoDI`
- `valorAduaneiro`
- `taxaCambio`: usado no cálculo
- `tributosRecolhidos`: ref para `ApuracaoTributaria`
- `documentosVinculados`: refs (Invoices, BL/AWB, NF de entrada)
- `regimeAduaneiro`: enum

#### 5.1.10 `AdicaoDI`
Item dentro da DI (cada produto tem uma adição).
- `id`
- `di`: ref
- `numeroAdicao`
- `produto`: ref
- `ncm`: ref
- `quantidade`
- `valorAduaneiro`
- `tributosCalculados`

#### 5.1.11 `Invoice`
Fatura comercial emitida pelo exportador estrangeiro.
- `id`
- `numero`
- `dataEmissao`
- `exportador`: ref
- `importador`: ref
- `moeda`
- `valorTotal`
- `itens`: array
- `condicoesPagamento`
- `incoterms`: enum (FOB, CIF, EXW, etc.)

#### 5.1.12 `ContratoCambio`
Contrato de câmbio para liquidação de operação internacional.
- `id`
- `numero`
- `dataContratacao`
- `banco`
- `tipo`: enum (Importação, Exportação)
- `valorMoedaEstrangeira`
- `taxaCambio`
- `valorReais`
- `documentosVinculados`: refs (Invoice, DI)
- `status`: enum (Aberto, Liquidado, Cancelado)

#### 5.1.13 `OperacaoFiscal`
Objeto agregador que une documentos relacionados a uma operação completa.
- `id`
- `tipo`: enum (Importação, Exportação, Operação Interna)
- `empresa`: ref
- `fornecedor`: ref (se aplicável)
- `documentosFiscais`: array de refs (NF, DI, Invoice, Câmbio, CTe)
- `dataInicio`
- `dataConclusao`
- `valorTotalOperacao`
- `tributosTotais`: ref para `ApuracaoTributaria`
- `regime`: ref para `RegimeAduaneiro` (se aplicável)
- `statusFechamento`: enum (Aberto, Em Conciliação, Conciliado, Auditado, Encerrado)

#### 5.1.14 `ApuracaoTributaria`
Cálculo de tributos sobre uma operação.
- `id`
- `escopo`: ref (NF, DI, OperacaoFiscal)
- `data`
- `tributos`: array
  - `tipo`: enum (II, IPI, PIS, COFINS, ICMS, ICMS-ST, ISS, CBS, IBS)
  - `baseCalculo`
  - `aliquota`
  - `valorDevido`
  - `creditoTomado`: quando aplicável
- `valorTotalTributos`
- `regraAplicada`: ref para `RegraTributaria`

#### 5.1.15 `RegraTributaria`
Representação de regra de cálculo tributário.
- `id`
- `nome`
- `tributo`: enum
- `condicoes`: lógica de aplicabilidade (CFOP, NCM, regime, UF, etc.)
- `formula`: cálculo
- `vigenciaInicio`
- `vigenciaFim`
- `fonteLegal`: referência à norma (Lei, Decreto, IN)

#### 5.1.16 `RegimeAduaneiro`
Regime aplicável a operação.
- `id`
- `tipo`: enum (Drawback Suspensão, Drawback Isenção, RECOF, Entreposto, Repetro, Linha Azul, OEA, etc.)
- `numeroAtoConcessivo`: quando aplicável
- `vigenciaInicio`
- `vigenciaFim`
- `beneficios`: tributos suspensos/isentos
- `obrigacoes`: contrapartidas
- `operacoesVinculadas`: array de refs

#### 5.1.17 `CFOP`
Código Fiscal de Operações e Prestações.
- `codigo`: 4 dígitos
- `descricao`
- `tipo`: enum (Entrada Interna, Entrada Interestadual, Entrada Importação, Saída Interna, etc.)
- `aplicabilidades`: array

#### 5.1.18 `MapeamentoFornecedor`
Configuração específica do cliente: regras para inserir NF de fornecedor X no ERP.
- `id`
- `cliente`: ref para `Empresa`
- `fornecedor`: ref
- `regrasEspecificas`: array (CFOP a usar, conta contábil, centro de custo, etc.)
- `historicoMudancas`

Este é o objeto que captura o conhecimento atual do produto Qive→ERP.

#### 5.1.19 `EventoIntegracao`
Log de qualquer interação com sistema externo (ERP, Qive, Siscomex, RFB).
- `id`
- `sistemaOrigem`
- `sistemaDestino`
- `tipo`: enum (Leitura, Escrita, Consulta, Erro)
- `payload`: snapshot do dado
- `timestamp`
- `ator`: humano ou agente
- `objetoRelacionado`: ref polimórfica
- `status`: enum (Sucesso, Falha, Pendente)

#### 5.1.20 `RegrumNegocioCliente`
Regra específica de um cliente (não regulatória).
- `id`
- `cliente`: ref
- `escopo`: enum (Conciliação, Classificação, Apuração, Mapeamento)
- `condicoes`: lógica
- `acao`: o que fazer quando condições são atendidas
- `prioridade`: para resolução de conflitos
- `historicoVersoes`

### 5.2 Resumo da v0.1

A v0.1 tem **20 objetos centrais**. Cobertura:
- Documentos fiscais (NF, DI, Invoice, Câmbio, CTe parcialmente via NF) ✓
- Tributação (Apuração, Regras) ✓
- Regulação (NCM, CFOP, Regimes) ✓
- Entidades (Empresa, Filial, Fornecedor, País) ✓
- Configuração (Mapeamento, Regras de Cliente) ✓
- Operação (OperacaoFiscal como agregador) ✓
- Auditoria (EventoIntegracao) ✓

**Não coberto na v0.1 (vai em v0.2-v0.5):**
- Logística física (BL, AWB, contêineres, navios)
- Câmbio detalhado (ROF, RE)
- Drawback completo (Atos Concessórios, Comprovação)
- Folha de pagamento fiscal (compensações, parcelamentos)
- Contábil (lançamentos, plano de contas)

---

## 6. Ontologia v0.1 — Relacionamentos

Os relacionamentos formam o **grafo da ontologia**. São onde a inteligência mora.

### 6.1 Relacionamentos Principais

| Origem | Relação | Destino | Cardinalidade | Notas |
|---|---|---|---|---|
| `Empresa` | tem | `Filial` | 1:N | Matriz + filiais |
| `Empresa` | usa | `RegraNegocioCliente` | 1:N | Regras específicas |
| `Empresa` | possui | `RegimeAduaneiro` | 1:N | Regimes habilitados |
| `Filial` | emite | `NotaFiscal` | 1:N | NF de saída |
| `Filial` | recebe | `NotaFiscal` | 1:N | NF de entrada |
| `Fornecedor` | é parte de | `OperacaoFiscal` | N:N | |
| `Fornecedor` | tem | `MapeamentoFornecedor` | 1:N | Por cliente |
| `Fornecedor` | localiza-se em | `Pais` | N:1 | |
| `NotaFiscal` | tem | `ItemNotaFiscal` | 1:N | |
| `NotaFiscal` | é parte de | `OperacaoFiscal` | N:1 | Múltiplas NFs por operação |
| `NotaFiscal` | gera | `ApuracaoTributaria` | 1:1 | Apuração calculada |
| `NotaFiscal` | está conciliada com | `Invoice` | N:N | Conciliação documental |
| `NotaFiscal` | está conciliada com | `DI` | N:N | NF de entrada vs DI |
| `ItemNotaFiscal` | classifica-se como | `NCM` | N:1 | |
| `ItemNotaFiscal` | tem operação | `CFOP` | N:1 | |
| `ItemNotaFiscal` | refere-se a | `Produto` | N:1 | |
| `Produto` | classifica-se como | `NCM` | N:1 | NCM "padrão" do produto |
| `NCM` | tem | `RegraTributaria` | 1:N | Regras vigentes por NCM |
| `NCM` | é elegível a | `RegimeAduaneiro` | N:N | Regimes que aceitam o NCM |
| `DI` | tem | `AdicaoDI` | 1:N | |
| `DI` | é parte de | `OperacaoFiscal` | N:1 | |
| `DI` | é coberta por | `Invoice` | N:N | Múltiplas DIs por Invoice ou vice-versa |
| `DI` | usa regime | `RegimeAduaneiro` | N:1 | |
| `AdicaoDI` | classifica-se como | `NCM` | N:1 | |
| `AdicaoDI` | refere-se a | `Produto` | N:1 | |
| `Invoice` | é parte de | `OperacaoFiscal` | N:1 | |
| `Invoice` | é liquidada por | `ContratoCambio` | N:N | |
| `ContratoCambio` | é parte de | `OperacaoFiscal` | N:1 | |
| `OperacaoFiscal` | gera | `ApuracaoTributaria` | 1:1 | Apuração consolidada |
| `OperacaoFiscal` | usa regime | `RegimeAduaneiro` | N:1 | |
| `OperacaoFiscal` | tem eventos | `EventoIntegracao` | 1:N | |
| `ApuracaoTributaria` | aplica | `RegraTributaria` | N:N | Pode aplicar múltiplas regras |
| `MapeamentoFornecedor` | usa | `CFOP` | N:N | CFOPs aplicáveis |
| `RegraNegocioCliente` | gera evento | `EventoIntegracao` | 1:N | Quando regra dispara |

### 6.2 Visualização do Grafo Central

```
                          Empresa
                         /   |   \
                    Filial   |   RegraNegocioCliente
                         \   |   /
                          OperacaoFiscal
                         /  |  |  \
                  NotaFiscal DI Invoice ContratoCambio
                       |     |
                       Item  AdicaoDI
                        \   /
                         NCM ─── RegraTributaria
                          |
                    RegimeAduaneiro
```

### 6.3 Padrões de Travessia (Queries Frequentes)

**Padrão 1: "Quais NFs ainda não foram conciliadas com DI?"**
```
NotaFiscal WHERE 
  tipo = 'NFe' AND 
  cfop.tipo = 'EntradaImportacao' AND
  NOT EXISTS (relação 'está conciliada com' para qualquer DI)
```

**Padrão 2: "Qual é o crédito de PIS-Imp pendente nos últimos 90 dias?"**
```
ApuracaoTributaria WHERE
  escopo é DI AND
  tributo = 'PIS-Imp' AND
  creditoTomado < valorDevido AND
  data > now - 90 dias
```

**Padrão 3: "Quais produtos têm NCM divergente entre Produto.ncm e ItemNotaFiscal.ncm?"**
```
ItemNotaFiscal WHERE
  produto.ncm != self.ncm AND
  notaFiscal.dataEmissao > now - 365 dias
```

Esses padrões viram **queries reutilizáveis** na implementação, e eventualmente viram inputs de agentes.

---

## 7. Ontologia v0.1 — Ações

Ações são onde a lógica de negócio mora. Cada ação tem precondições, transformação, pós-condições, e write-back para sistema-fonte quando aplicável.

### 7.1 Catálogo de Ações v0.1

#### 7.1.1 Ações sobre `NotaFiscal`

**`importarNotaFiscal(xml)`**
- Input: XML de NF
- Output: `NotaFiscal` criada/atualizada
- Efeitos: cria/atualiza objetos relacionados (itens, fornecedor se novo, etc.)
- Side-effect: emite `EventoIntegracao`

**`conciliarNFcomDI(notaFiscal, di)`**
- Input: refs para NF e DI
- Precondições: NF é de entrada de importação; DI está desembaraçada; valores compatíveis (com tolerância)
- Output: relacionamento "conciliada com" estabelecido
- Side-effect: atualiza `OperacaoFiscal` agregadora; emite evento

**`conciliarNFcomInvoice(notaFiscal, invoice)`**
- Similar ao acima, mas para NF vs Invoice estrangeira

**`reclassificarNCM(item, novoNCM, justificativa)`**
- Input: item de NF, novo NCM, justificativa
- Precondições: usuário com permissão; novo NCM existe; histórico preservado
- Output: item atualizado; histórico de NCM atualizado
- Write-back: atualiza ERP (Conexos)

**`cancelarNotaFiscal(notaFiscal, motivo)`**
- Input: NF, motivo
- Precondições: NF dentro do prazo de cancelamento (24h para NFe geralmente)
- Output: NF com status "Cancelada"
- Write-back: comunica RFB e atualiza ERP

#### 7.1.2 Ações sobre `OperacaoFiscal`

**`abrirOperacaoFiscal(tipo, dataInicio, escopo)`**
- Cria nova `OperacaoFiscal` com documentos esperados

**`vincularDocumento(operacaoFiscal, documento)`**
- Vincula documento (NF, DI, Invoice, Câmbio) à operação

**`fecharOperacaoFiscal(operacaoFiscal)`**
- Precondições: todos os documentos esperados presentes; conciliações completas; tributação apurada
- Output: operação com status "Encerrada"
- Write-back: lançamentos contábeis no ERP

**`auditarOperacaoFiscal(operacaoFiscal)`**
- Verifica integridade: documentos faltantes, divergências, regras violadas
- Output: relatório de auditoria

#### 7.1.3 Ações sobre `ApuracaoTributaria`

**`apurarTributos(escopo)`**
- Input: NF, DI, ou OperacaoFiscal
- Aplica regras vigentes (regra tributária aplicável a NCM + CFOP + UF + regime)
- Output: `ApuracaoTributaria` calculada

**`recalcularTributos(apuracao, motivo)`**
- Re-executa apuração quando regra muda ou erro foi detectado

**`registrarCreditoTomado(apuracao, valor)`**
- Marca crédito tomado em apuração federal

#### 7.1.4 Ações sobre `DI`

**`importarDI(xmlSiscomex)`**
- Cria DI a partir de XML do Siscomex

**`vincularInvoice(di, invoice)`**
- Estabelece relacionamento entre DI e Invoice

**`solicitarReembolso(di, tributo, justificativa)`**
- Inicia processo de pedido de reembolso de tributo pago indevidamente

#### 7.1.5 Ações sobre `RegimeAduaneiro`

**`aplicarRegime(operacaoFiscal, regime)`**
- Vincula operação a regime; recalcula tributação com benefícios

**`comprovarRegime(regime, evidencias)`**
- Para regimes com obrigação de comprovação (Drawback, RECOF), registra cumprimento

**`monitorarVigenciaRegime(regime)`**
- Ação automática (cron) que alerta sobre vencimento próximo

#### 7.1.6 Ações sobre `Produto` e `NCM`

**`classificarProduto(produto, ncmSugerido, confianca)`**
- Classifica produto em NCM
- Pode ser executada por humano ou agente
- Output: produto com NCM atribuído + log de decisão

**`auditarClassificacaoNCM(produto)`**
- Compara NCM atual com classificações similares no setor
- Sinaliza divergências para revisão

**`atualizarNCMVigente(ncm, novasAliquotas, vigencia)`**
- Atualização regulatória (mudança em IN, decreto)
- Ação tipicamente automática (monitor regulatório)

#### 7.1.7 Ações sobre `MapeamentoFornecedor`

**`criarMapeamento(cliente, fornecedor, regras)`**
- Estabelece regras para entrada de NF deste fornecedor

**`atualizarMapeamento(mapeamento, novasRegras)`**
- Atualiza regras existentes

**`aplicarMapeamento(notaFiscal)`**
- Aplica regras de mapeamento ao processar NF
- Esta é a ação central do produto Qive→ERP atual

### 7.2 Anatomia de uma Ação (Especificação Padrão)

Toda ação na ontologia segue padrão:

```typescript
interface Acao<TInput, TOutput> {
  nome: string;
  versao: string;
  descricao: string;
  
  input: TInput;
  output: TOutput;
  
  precondicoes: (input: TInput, contexto: Contexto) => Resultado<true | string>;
  executar: (input: TInput, contexto: Contexto) => Promise<TOutput>;
  poscondicoes: (output: TOutput, contexto: Contexto) => Resultado<true | string>;
  
  permissoesNecessarias: Permissao[];
  efeitosColaterais: EfeitoColateral[];
  
  rollback?: (output: TOutput) => Promise<void>;
}
```

Cada ação:
- É testável independentemente
- Tem pre/pós-condições explícitas
- Loga input + output via `EventoIntegracao`
- Pode ser invocada por humano (UI) ou agente (AIP futuro)

### 7.3 Composição de Ações (Workflows)

Workflows são composições de ações. Exemplos v0.1:

**Workflow: Receber NF de Importação**
```
1. importarNotaFiscal(xml)
2. SE fornecedor é estrangeiro:
   a. buscarDIRelacionada(notaFiscal)
   b. SE encontrada:
      - conciliarNFcomDI(nf, di)
      - vincularDocumento(operacaoFiscal, nf)
   c. SE não encontrada:
      - alertar humano para investigação
3. apurarTributos(notaFiscal)
4. aplicarMapeamento(notaFiscal) → ERP
5. emitir relatório de processamento
```

**Workflow: Fechamento Mensal Fiscal**
```
1. listarOperacoesFiscaisDoMes()
2. PARA CADA operação:
   a. auditarOperacaoFiscal(op)
   b. SE auditoria OK:
      - fecharOperacaoFiscal(op)
   c. SENÃO:
      - sinalizar pendências para humano
3. consolidar apurações tributárias do mês
4. gerar SPED Fiscal
5. enviar relatório consolidado para controladoria
```

Workflows v0.1 são representados em código (TypeScript). Em v0.5+ podem virar configuráveis em UI.

---

## 8. Implementação Técnica

### 8.1 Stack Recomendada

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Linguagem | TypeScript (Node 20+) | Tipagem forte; ecossistema; já é stack atual |
| Schema | Zod ou JSON Schema | Validação runtime + tipos compile-time |
| Persistência | PostgreSQL (Supabase) | Já em uso; suporta JSONB para flexibilidade |
| Grafo | Inicialmente PostgreSQL + libs como Drizzle ORM ou Prisma; Neo4j em v0.5+ se grafo crescer | Evolução gradual |
| Versionamento | Git + Semantic Versioning para schema | Ontologia versionada como código |
| Testes | Vitest ou Jest + Playwright para integração | Padrão moderno |
| Documentação | TypeDoc + Markdown gerado | Doc próximo do código |

### 8.2 Estrutura de Repositório Sugerida

```
clonexcomex-ontology/
├── README.md
├── CHANGELOG.md
├── package.json
├── tsconfig.json
├── src/
│   ├── objetos/
│   │   ├── Empresa.ts
│   │   ├── Filial.ts
│   │   ├── NotaFiscal.ts
│   │   └── ... (um arquivo por objeto)
│   ├── relacionamentos/
│   │   ├── grafo.ts
│   │   └── traversals.ts
│   ├── acoes/
│   │   ├── notaFiscal/
│   │   │   ├── importarNotaFiscal.ts
│   │   │   ├── conciliarNFcomDI.ts
│   │   │   └── ...
│   │   └── operacaoFiscal/
│   │       └── ...
│   ├── workflows/
│   │   ├── receberNFImportacao.ts
│   │   └── fechamentoMensal.ts
│   ├── regulacao/
│   │   ├── ncm.ts
│   │   ├── cfop.ts
│   │   └── regrasTributarias.ts
│   ├── conectores/
│   │   ├── conexos/
│   │   ├── qive/
│   │   └── siscomex/
│   └── tipos/
│       └── (tipos compartilhados)
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── docs/
│   ├── objetos.md (gerado)
│   ├── acoes.md (gerado)
│   └── workflows.md (gerado)
└── migrations/
    ├── 001_v0.1_initial.sql
    └── ...
```

### 8.3 Exemplo de Definição de Objeto em Código

```typescript
// src/objetos/NotaFiscal.ts

import { z } from 'zod';
import { EmpresaRef } from './Empresa';
import { FornecedorRef } from './Fornecedor';

export const TipoNotaFiscal = z.enum(['NFe', 'NFSe', 'NFMe', 'CTe']);
export type TipoNotaFiscal = z.infer<typeof TipoNotaFiscal>;

export const StatusNotaFiscal = z.enum([
  'Emitida', 'Cancelada', 'Denegada', 'Conciliada', 'Pendente'
]);

export const NotaFiscalSchema = z.object({
  id: z.string().uuid(),
  tipo: TipoNotaFiscal,
  numero: z.string(),
  serie: z.string(),
  chaveAcesso: z.string().length(44).optional(),
  dataEmissao: z.date(),
  dataEntrada: z.date().optional(),
  emitenteId: z.string().uuid(),
  destinatarioId: z.string().uuid(),
  valorTotal: z.number().positive(),
  status: StatusNotaFiscal,
  xmlOriginal: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type NotaFiscal = z.infer<typeof NotaFiscalSchema>;

export interface NotaFiscalRef {
  id: string;
  tipo: TipoNotaFiscal;
}
```

### 8.4 Exemplo de Definição de Ação em Código

```typescript
// src/acoes/notaFiscal/conciliarNFcomDI.ts

import { Acao, Resultado, Contexto } from '../../tipos/Acao';
import { NotaFiscal } from '../../objetos/NotaFiscal';
import { DI } from '../../objetos/DI';

interface Input {
  notaFiscalId: string;
  diId: string;
  toleranciaPercentual?: number; // default 2%
}

interface Output {
  conciliacaoId: string;
  divergencias: Divergencia[];
  status: 'Conciliada' | 'ConciliadaComResalva' | 'Recusada';
}

export const conciliarNFcomDI: Acao<Input, Output> = {
  nome: 'conciliarNFcomDI',
  versao: '0.1.0',
  descricao: 'Concilia uma Nota Fiscal de entrada de importação com sua DI correspondente',
  
  precondicoes: async (input, contexto) => {
    const nf = await contexto.repo.notaFiscal.get(input.notaFiscalId);
    if (!nf) return Resultado.erro('NF não encontrada');
    if (nf.tipo !== 'NFe') return Resultado.erro('Apenas NFe pode ser conciliada com DI');
    
    const di = await contexto.repo.di.get(input.diId);
    if (!di) return Resultado.erro('DI não encontrada');
    if (!di.dataDesembaraco) return Resultado.erro('DI ainda não desembaraçada');
    
    return Resultado.ok(true);
  },
  
  executar: async (input, contexto) => {
    // ... lógica de conciliação ...
    // - comparar valores (com tolerância)
    // - comparar itens/NCMs
    // - identificar divergências
    // - criar relacionamento "está conciliada com"
    // - emitir EventoIntegracao
    // - retornar resultado
  },
  
  poscondicoes: async (output, contexto) => {
    if (output.status === 'Conciliada' && output.divergencias.length > 0) {
      return Resultado.erro('Inconsistência: conciliada com divergências');
    }
    return Resultado.ok(true);
  },
  
  permissoesNecessarias: ['conciliacao:executar'],
  efeitosColaterais: ['cria-relacionamento', 'emite-evento', 'pode-write-back-erp'],
};
```

### 8.5 Conectores como Adaptadores

Cada conector externo (Conexos, Qive, Siscomex) é implementado como **adaptador** que traduz entre formato externo e ontologia interna.

```typescript
// src/conectores/conexos/notaFiscalAdapter.ts

import { NotaFiscal } from '../../objetos/NotaFiscal';
import { ConexosNFRow } from './tipos';

export class ConexosNotaFiscalAdapter {
  fromConexos(row: ConexosNFRow): NotaFiscal {
    return {
      id: row.uuid_interno,
      tipo: this.mapearTipo(row.tipo_doc),
      numero: row.num_nf,
      serie: row.serie,
      // ... mapeamento ...
    };
  }
  
  toConexos(nf: NotaFiscal): ConexosNFRow {
    // mapeamento reverso para write-back
  }
}
```

Princípio: **objetos da ontologia nunca conhecem detalhes do ERP. Conhecem apenas si mesmos.**

### 8.6 Como Garantir Reutilização Entre Clientes

**Configuração separada de código.** Cada cliente tem arquivo (ou tabela) de configuração que define:
- Quais conectores estão ativos
- Configurações de cada conector (URLs, credenciais via secrets)
- Regras de negócio específicas (`RegraNegocioCliente`)
- Mapeamentos de fornecedores

A ontologia em si é a mesma. A configuração varia.

---

## 9. Roadmap de Evolução

### 9.1 Versões Planejadas

| Versão | Período Alvo | Foco | Objetos novos | Cobertura |
|---|---|---|---|---|
| v0.1 | Jun-Ago/2026 | Fiscal-tributário básico | 20 (esta versão) | NFSe/NFMe/CTe + Calculadora |
| v0.2 | Ago-Out/2026 | Conciliação documental rica | +8-12 | Módulo #2 (DI↔NF↔Invoice↔Câmbio) |
| v0.3 | Nov/2026-Jan/2027 | Logística básica + Drawback | +10-15 | Módulo #3 candidato |
| v0.4 | Q1-Q2/2027 | Apuração consolidada multi-cliente | +10-15 | Pós-Seed |
| v0.5 | Q3/2027 | Primeira camada de agentes (AIP-light) | +objetos para agentes | Pós-Seed |
| v1.0 | 2028 | Production-ready, multi-tenant, cobertura ampla | total ~80-120 | Series A scale |

### 9.2 Critérios para Subir Versão

Cada versão sobe quando:

1. **Cobre os módulos vendidos** sem necessidade de "ontology hacks" específicos de cliente
2. **Tem testes de regressão completos** para todos objetos e ações
3. **Tem documentação atualizada** gerada automaticamente
4. **Foi validada por Francinei** em revisão fiscal
5. **Migrations escritas** para subir clientes existentes
6. **Não-breaking** ou com plano explícito de migração se breaking

### 9.3 Métricas de Saúde da Ontologia

| Métrica | Meta v0.1 | Meta v0.5 | Meta v1.0 |
|---|---|---|---|
| Objetos modelados | 20 | 60-80 | 100-150 |
| Ações catalogadas | 30-40 | 150-250 | 400-600 |
| Workflows compostos | 3-5 | 15-25 | 40-70 |
| Cobertura de testes | 70% | 85% | 95%+ |
| % reutilização entre clientes | 50%+ | 75%+ | 90%+ |
| Tempo médio de novo módulo | n/a | -50% vs v0.1 | -75% vs v0.1 |

### 9.4 Riscos da Construção da Ontologia

**Risco 1: Premature abstraction.** Modelar coisa que ainda não foi vista em 2+ clientes. Mitigação: regra dos 2 — só vai para ontologia quando aparece em 2+ clientes ou Francinei valida que é universal.

**Risco 2: Rigidez excessiva.** Ontologia tão rígida que custa caro mudar. Mitigação: versionamento + migrations + tolerância a `metadata` (campos livres por objeto).

**Risco 3: Drift cliente-específico.** Códigos de cliente diferem da ontologia ao longo do tempo. Mitigação: code review obrigatório com olho em "isto vai para ontologia ou fica em config?".

**Risco 4: Decisões fiscais erradas.** Modelar tributação errada gera multa para cliente. Mitigação: Francinei valida toda regra tributária; testes com casos reais; warnings explícitos para casos novos.

**Risco 5: Performance em grafo.** Em escala, queries de grafo ficam lentas. Mitigação: começar com PostgreSQL + JSONB, migrar para Neo4j ou similar quando volume justificar (provavelmente v0.5+).

---

## 10. Próximos Passos Imediatos

1. **Aprovar v0.1** com Yuri + CTO + Francinei (1 semana)
2. **Criar repositório** `clonexcomex-ontology` (1 dia)
3. **Implementar 5 objetos centrais** como prova de conceito (Empresa, NotaFiscal, NCM, OperacaoFiscal, MapeamentoFornecedor) (2 semanas)
4. **Implementar 3 ações centrais** com testes (`importarNotaFiscal`, `aplicarMapeamento`, `apurarTributos`) (2 semanas)
5. **Migrar produto Qive→ERP** para usar ontologia v0.1 ao invés de código direto (3-4 semanas)
6. **Documentar discovery do Columbia** como input para v0.2 (em paralelo, durante Junho-Julho)
7. **Definir cadência de revisão** (mensal: reunião de abstração)

---

*Documento técnico vivo. Releases versionadas trimestralmente. Issues e PRs no repositório `clonexcomex-ontology`.*
