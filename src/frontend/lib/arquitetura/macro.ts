/**
 * Vista MACRO — as três frentes em raias horizontais, na linguagem do negócio.
 *
 * Cada raia é lida da esquerda (origem do dado) para a direita (efeito no ERP).
 * O eixo vertical separa as frentes; a maturidade do nó carrega a informação de
 * que elas estão em estágios muito diferentes.
 */

import type { ArqEdge, ArqNode } from './types'

const RAIA_PERMUTAS = 0
const RAIA_SISPAG = 340
const RAIA_GED = 700

const COL = (n: number) => 40 + n * 290

export const MACRO_NODES: ArqNode[] = [
    // ─────────────────────────── Frente I — Permutas ───────────────────────────
    {
        id: 'macro-permutas-eleicao',
        position: { x: COL(0), y: RAIA_PERMUTAS },
        data: {
            label: 'Eleição de adiantamentos',
            subtitle: 'Job diário · 3x ao dia',
            frente: 'permutas',
            camada: 'job',
            maturidade: 'implementado',
            estado: 'ambos',
            vista: 'macro',
            descricao:
                'Varre o ERP em busca de PROFORMAs finalizadas que sejam adiantamento (tpdCod=99 + docVldTipoAdto=1), em todas as filiais. É o ponto de entrada da frente: sem eleição não há candidata. Roda 3x por dia (06h, 12h e 18h BRT) via GitHub Actions, e também pode ser disparada manualmente pelo analista no painel.',
            arquivos: [
                'src/backend/jobs/ingest-permutas.ts',
                'src/backend/domain/service/permutas/EleicaoPermutasService.ts',
                '.github/workflows/ingest-permutas.yml',
            ],
            programasErp: ['com298'],
            docRefs: ['ADR-0006 — ingestão manual como interface humana do mesmo compute'],
        },
    },
    {
        id: 'macro-permutas-gates',
        position: { x: COL(1), y: RAIA_PERMUTAS },
        data: {
            label: '4 gates de elegibilidade',
            subtitle: 'Automático',
            frente: 'permutas',
            camada: 'servico',
            maturidade: 'implementado',
            estado: 'ambos',
            vista: 'macro',
            descricao:
                'Um adiantamento só vira candidata se passar por quatro portas: (G1) é PROFORMA; (G2) tem valor a permutar maior que zero; (G3) está TOTALMENTE pago — critério estrito, saldo em aberto exatamente zero; (G4) tem D.I ou DUIMP atrelada, que é o que fornece a data-base do aging. Reprovar aqui não é erro: a candidata fica BLOQUEADA com o motivo visível no painel.',
            arquivos: [
                'src/backend/domain/service/permutas/ElegibilidadeService.ts',
                'ontology/business-rules/elegibilidade-permuta.md',
            ],
            programasErp: ['com298', 'com308', 'imp019', 'imp223'],
            docRefs: [
                'ontology/state-machines/elegibilidade-permuta-candidata.md',
                'ontology/business-rules/di-xor-duimp.md',
            ],
        },
    },
    {
        id: 'macro-permutas-casamento',
        position: { x: COL(2), y: RAIA_PERMUTAS },
        data: {
            label: 'Casamento com a invoice',
            subtitle: '1:1 automático · N:M assistido',
            frente: 'permutas',
            camada: 'servico',
            maturidade: 'implementado',
            estado: 'ambos',
            vista: 'macro',
            descricao:
                'Conta quantas invoices finalizadas existem no processo. Nenhuma → bloqueada. Exatamente uma → elegível, casa sozinha. Mais de uma → casamento manual, que não é reprovação: os gates passaram, falta apenas o analista escolher a alocação. Para importadores cadastrados no cliente-filtro, o adiantamento vai direto para permuta manual cross-process.',
            arquivos: [
                'src/backend/domain/service/permutas/AlocacaoPermutasService.ts',
                'src/backend/domain/repository/permutas/PermutaAlocacaoRepository.ts',
            ],
            programasErp: ['com298', 'imp021'],
            docRefs: [
                'ADR-0005 — casamento-manual como 4º estado',
                'ADR-0008 — alocação N:M cross-process',
                'ADR-0010 — distribuição greedy N:1',
            ],
        },
    },
    {
        id: 'macro-permutas-analista',
        position: { x: COL(2) + 20, y: RAIA_PERMUTAS - 190 },
        data: {
            label: 'Analista decide',
            subtitle: 'Human-in-the-loop',
            frente: 'permutas',
            camada: 'humano',
            maturidade: 'implementado',
            estado: 'ambos',
            vista: 'macro',
            descricao:
                'Invariante de produto: a solução executa o mecânico e audita; a decisão permanece humana. Nos casos compostos o analista define como o valor se distribui entre proformas e invoices. O julgamento sobre divergência cambial está explicitamente fora de escopo — a solução calcula o delta, não decide o que fazer com ele.',
            docRefs: ['ADR-0002 — human-in-the-loop como invariante de produto'],
        },
    },
    {
        id: 'macro-permutas-variacao',
        position: { x: COL(3), y: RAIA_PERMUTAS },
        data: {
            label: 'Variação cambial',
            subtitle: 'Juros (131) ou desconto (130)',
            frente: 'permutas',
            camada: 'servico',
            maturidade: 'implementado',
            estado: 'ambos',
            vista: 'macro',
            descricao:
                'Compara a taxa negociada do adiantamento com a da invoice. Delta positivo vira juros (conta 131, passiva); negativo vira desconto (conta 130, ativa). Também absorve o resíduo de centavos quando a baixa consome o adiantamento por inteiro, com guarda de sanidade de R$ 1,00.',
            arquivos: [
                'src/backend/domain/service/permutas/VariacaoCambialPermutaService.ts',
            ],
            programasErp: ['com308'],
            docRefs: ['ADR-0020 — âncora no valor real do adiantamento (anti-resíduo)'],
        },
    },
    {
        id: 'macro-permutas-baixa',
        position: { x: COL(4), y: RAIA_PERMUTAS },
        data: {
            label: 'Baixa no ERP',
            subtitle: 'fin010 · escrita irreversível',
            frente: 'permutas',
            camada: 'externo',
            maturidade: 'parcial',
            estado: 'ambos',
            vista: 'macro',
            descricao:
                'A única escrita em produção do sistema hoje, e o ponto de maior risco. Grava a baixa da permuta no borderô do ERP. É irreversível, então tem dupla trava por variável de ambiente (escrita habilitada E dry-run desligado), ledger write-ahead com chave de idempotência, e um POST que não repete em caso de 401 — repetir significaria baixa duplicada.',
            arquivos: [
                'src/backend/domain/client/permutas/ConexosBaixaClient.ts',
                'src/backend/domain/service/permutas/ReconciliacaoPermutaService.ts',
                'src/backend/domain/repository/permutas/PermutaExecucaoRepository.ts',
            ],
            programasErp: ['fin010'],
            riscos: [
                {
                    nivel: 'alto',
                    texto:
                        'Marcada como parcial porque o primeiro caso real em produção ainda não foi validado. Caminhos nunca observados no ERP: baixa parcial N:M, finalização do borderô e o caminho de DESCONTO.',
                    origem: 'ontology/_coverage.json — watchlist',
                },
            ],
            docRefs: [
                'ADR-0013 — write-back fin010, homologação-first',
                'docs/runbooks/fin010-write-cutover.md',
            ],
        },
    },

    // ─────────────────────────── Frente II — SISPAG ────────────────────────────
    {
        id: 'macro-sispag-ingestao',
        position: { x: COL(0), y: RAIA_SISPAG },
        data: {
            label: 'Ingestão da carteira',
            subtitle: 'Job diário · 07h BRT',
            frente: 'sispag',
            camada: 'job',
            maturidade: 'implementado',
            estado: 'ambos',
            vista: 'macro',
            descricao:
                'Traz a carteira de títulos a pagar do ERP e persiste localmente com upsert diário. Enriquece cada título com a alçada de aprovação e com o discriminador nacional/internacional, que o programa de origem não carrega. Roda às 07h BRT — uma hora depois da ingestão de permutas, deliberadamente, para não disputar sessão no Conexos.',
            arquivos: [
                'src/backend/jobs/ingest-pagamentos.ts',
                'src/backend/domain/service/sispag/IngestaoPagamentosService.ts',
                '.github/workflows/ingest-sispag.yml',
            ],
            programasErp: ['fin064', 'com308', 'com298'],
            docRefs: ['ADR-0016 — persistir a carteira; painel passa a ler do banco'],
        },
    },
    {
        id: 'macro-sispag-lote',
        position: { x: COL(1), y: RAIA_SISPAG },
        data: {
            label: 'Formação de lotes',
            subtitle: 'Automática + ajuste manual',
            frente: 'sispag',
            camada: 'servico',
            maturidade: 'implementado',
            estado: 'ambos',
            vista: 'macro',
            descricao:
                'Agrupa os títulos elegíveis — aprovados, não pagos, a vencer em até 7 dias — por filial, classe e banco. Um lote é de uma filial só e é 100% nacional ou 100% internacional, nunca misto. O analista inclui e remove títulos livremente enquanto o lote está em rascunho.',
            arquivos: [
                'src/backend/domain/service/sispag/FormacaoLotesService.ts',
                'src/backend/domain/service/sispag/LotePagamentoService.ts',
            ],
            riscos: [
                {
                    nivel: 'medio',
                    texto:
                        'A política de "a vencer em até 7 dias" pode estar estreita demais: a analista informou que a data de débito é sempre hoje, sem agendamento — paga-se o boleto no dia mesmo vencendo em 20 dias. Revisão pendente.',
                    origem: 'ontology/_inbox — respostas da analista, 2026-07-16',
                },
            ],
            docRefs: [
                'ADR-0017 — lote uniforme nacional × internacional',
                'ADR-0018 — formação automática de lotes',
            ],
        },
    },
    {
        id: 'macro-sispag-gate',
        position: { x: COL(2), y: RAIA_SISPAG },
        data: {
            label: 'Gate do analista',
            subtitle: 'Finalização do lote',
            frente: 'sispag',
            camada: 'humano',
            maturidade: 'implementado',
            estado: 'ambos',
            vista: 'macro',
            descricao:
                'O ponto de human-in-the-loop da frente: nenhum lote avança sem que uma pessoa o finalize. Exige pelo menos um item e revalida a elegibilidade de todos. Registra quem finalizou e quando. É reversível enquanto não houver efeito downstream — e hoje não há, porque a remessa real ainda não existe.',
            arquivos: ['src/backend/domain/service/sispag/LotePagamentoService.ts'],
            docRefs: [
                'ontology/state-machines/lote-pagamento.md',
                'ADR-0015 — Fatia 1+2, zero escrita no ERP',
            ],
        },
    },
    {
        id: 'macro-sispag-remessa',
        position: { x: COL(3), y: RAIA_SISPAG },
        data: {
            label: 'Geração da remessa',
            subtitle: 'CNAB 240 — motor nativo do ERP',
            frente: 'sispag',
            camada: 'externo',
            maturidade: 'planejado',
            estado: 'ambos',
            vista: 'macro',
            descricao:
                'A descoberta que redefiniu o escopo desta frente. A proposta comercial previa construir a integração bancária do zero; a sondagem em produção provou que o ERP já gera o arquivo CNAB 240 nativamente — confirmado com resposta 200 em homologação. Não há gerador de CNAB a construir: o valor está em orquestrar o motor que já existe.',
            programasErp: ['fin015'],
            riscos: [
                {
                    nivel: 'medio',
                    texto:
                        'Provado em homologação, não codado. Falta confirmar o payload de importação dos títulos no lote nativo e obter um arquivo de retorno de exemplo.',
                    origem: 'ontology/_inbox/sispag-fin015-exploration.md',
                },
            ],
            docRefs: ['ontology/_inbox/sispag-fin015-exploration.md'],
        },
    },
    {
        id: 'macro-sispag-transporte',
        position: { x: COL(4), y: RAIA_SISPAG },
        data: {
            label: 'Transporte ao banco',
            subtitle: 'A única lacuna real',
            frente: 'sispag',
            camada: 'externo',
            maturidade: 'inexistente',
            estado: 'ambos',
            vista: 'macro',
            descricao:
                'Baixar o arquivo de remessa, entregá-lo à VAN e trazer o retorno de volta. Este hop — e só ele — é o que falta para fechar a frente. Hoje os pagamentos são feitos manualmente pelo portal do banco; o contrato atual com a VAN cobre apenas extrato, não transmissão de remessa de pagamento. Não existe cliente nem configuração no código.',
            riscos: [
                {
                    nivel: 'alto',
                    texto:
                        'A homologação do leiaute bancário depende do cronograma da instituição financeira — dependência de terceiro fora do controle do projeto.',
                    origem: 'docs/proposta — premissas e dependências',
                },
            ],
            docRefs: ['ontology/_inbox/migration-debt.md — O7'],
        },
    },
    {
        id: 'macro-sispag-retorno',
        position: { x: COL(5), y: RAIA_SISPAG },
        data: {
            label: 'Retorno e conciliação',
            subtitle: 'Hoje: botão manual',
            frente: 'sispag',
            camada: 'externo',
            maturidade: 'parcial',
            estado: 'ambos',
            vista: 'macro',
            descricao:
                'O ERP já sabe ingerir o arquivo de retorno e gravar a baixa. O que existe no sistema hoje é apenas a marcação manual: o analista clica em "marcar retorno recebido" e o lote muda de estado. É uma simulação do efeito, não a conciliação real — o gatilho verdadeiro seria um robô lendo o arquivo de retorno.',
            programasErp: ['fin052', 'fin010'],
            riscos: [
                {
                    nivel: 'medio',
                    texto:
                        'O estado RETORNADO é hoje terminal e alimentado por um botão. É o ponto de sutura para a etapa de remessa real, não o fim do domínio.',
                    origem: 'ADR-0019',
                },
            ],
            docRefs: ['ADR-0019 — status RETORNADO'],
        },
    },
    {
        id: 'macro-sispag-duplo-pagamento',
        position: { x: COL(3) + 30, y: RAIA_SISPAG + 175 },
        data: {
            label: 'Título único por lote',
            subtitle: 'Garantia no serviço, não no banco',
            frente: 'sispag',
            camada: 'infra',
            maturidade: 'parcial',
            estado: 'ambos',
            vista: 'macro',
            descricao:
                'Um título a pagar não pode estar em dois lotes ao mesmo tempo — se estivesse, e ambos fossem enviados, a mesma conta seria paga duas vezes. Hoje essa garantia existe e funciona, mas mora na camada de serviço, através de transação e trava cooperativa no banco. O banco em si impede apenas a repetição dentro de um mesmo lote.\n\nA escolha foi consciente e está documentada na própria migração: o status vive no lote e o título vive no item, então uma restrição de banco entre lotes exigiria copiar o status para dentro do item — duplicando dado que poderia divergir. É um custo real, e a decisão de não pagá-lo naquele momento era defensável.\n\nO ponto que permanece é a natureza da garantia: procedural em vez de estrutural. Ela protege o caminho normal, mas depende de todo código futuro lembrar de passar pelo serviço.',
            arquivos: [
                'src/backend/migrations/0023_lote_pagamento.sql',
                'src/backend/domain/service/sispag/LotePagamentoService.ts',
            ],
            riscos: [
                {
                    nivel: 'medio',
                    texto:
                        'Um script de correção rodando SQL direto, um job novo que insira itens fora do serviço, ou uma refatoração que perca a trava sem ninguém notar — nenhum desses casos seria barrado, e nenhum teste quebraria. Hoje o efeito máximo é tela inconsistente, porque nada é enviado ao banco.',
                    origem: 'Regis-Review — fault-tolerance-6',
                },
                {
                    nivel: 'alto',
                    texto:
                        'A partir do momento em que a remessa real existir, o mesmo estado deixa de ser inconsistência de tela e passa a ser dinheiro saindo duas vezes. A janela certa para endurecer isso é antes de ligar o transporte, não depois — é o tipo de item que fica em prioridade média por anos justamente porque hoje não dói.',
                    origem: 'Regis-Review — fault-tolerance-6',
                },
                {
                    nivel: 'alto',
                    texto:
                        'Na mesma linha: a trilha de auditoria de quem enviou a remessa hoje só existe na saída padrão do servidor, sem persistência. Para um fluxo que move dinheiro, precisa ser incontestável.',
                    origem: 'Regis-Review — fault-tolerance-1 / security-sispag-1',
                },
            ],
            docRefs: [
                'docs/regis-review/2026-07-07-1841-sispag-painel-montagem',
                'ADR-0015 — invariantes na fronteira do agregado',
            ],
        },
    },

    // ────────────────────────── Frente III — Popula GED ────────────────────────
    {
        id: 'macro-ged-sharepoint',
        position: { x: COL(0), y: RAIA_GED },
        data: {
            label: 'Monitorar SharePoint',
            subtitle: 'Não existe',
            frente: 'ged',
            camada: 'externo',
            maturidade: 'inexistente',
            estado: 'ambos',
            vista: 'macro',
            descricao:
                'Detectar o PDF assim que ele é gerado no diretório monitorado. Nada disso existe — nem código, nem modelagem de domínio, nem decisão registrada. A especificação inteira desta frente são cerca de trinta linhas na proposta comercial.',
            riscos: [
                {
                    nivel: 'medio',
                    texto:
                        'Não se sabe se o SharePoint é on-premises ou 365, o que muda completamente a integração. Também não há runtime de job onde o monitoramento rodaria.',
                    origem: 'ontology/_inbox/migration-debt.md — O4 e O7',
                },
            ],
        },
    },
    {
        id: 'macro-ged-match',
        position: { x: COL(1), y: RAIA_GED },
        data: {
            label: 'Correspondência PDF ↔ NC/ND',
            subtitle: 'Chave desconhecida',
            frente: 'ged',
            camada: 'servico',
            maturidade: 'inexistente',
            estado: 'ambos',
            vista: 'macro',
            descricao:
                'Casar o documento com a nota de crédito ou débito que ele justifica. Esta é a pergunta que trava a frente inteira: a chave de correspondência é o nome do arquivo, que conteria o número da nota, ou o conteúdo do documento? A resposta muda a viabilidade e a taxa de acerto esperada — por nome, acima de 95%; por conteúdo, exige calibração conservadora.',
            riscos: [
                {
                    nivel: 'alto',
                    texto:
                        'Diagnóstico obrigatório e ainda não respondido. Nenhuma estimativa desta frente é confiável antes dele.',
                    origem: 'docs/proposta §7.1',
                },
            ],
        },
    },
    {
        id: 'macro-ged-upload',
        position: { x: COL(2), y: RAIA_GED },
        data: {
            label: 'Upload no GED',
            subtitle: 'Não existe',
            frente: 'ged',
            camada: 'externo',
            maturidade: 'inexistente',
            estado: 'ambos',
            vista: 'macro',
            descricao:
                'Anexar o documento no GED, destravando a nota para baixa. Não se sabe qual é o produto de GED nem que API ele expõe. A solução destrava a nota; a baixa contábil em si permanece fora de escopo.',
            riscos: [
                {
                    nivel: 'medio',
                    texto: 'Integração com o GED inexistente — sem cliente, sem configuração.',
                    origem: 'ontology/_inbox/migration-debt.md — O7',
                },
            ],
        },
    },
    {
        id: 'macro-ged-excecao',
        position: { x: COL(3), y: RAIA_GED },
        data: {
            label: 'Fila de exceções',
            subtitle: 'Não existe',
            frente: 'ged',
            camada: 'humano',
            maturidade: 'inexistente',
            estado: 'ambos',
            vista: 'macro',
            descricao:
                'O que não casa automaticamente vai para uma fila que o analista supervisiona. É o único ponto de atuação humana previsto na frente — o resto deveria correr sozinho.',
        },
    },

    // ─────────────────────────────── Sistemas ──────────────────────────────────
    {
        id: 'macro-conexos',
        position: { x: COL(6) + 40, y: RAIA_PERMUTAS + 170 },
        data: {
            label: 'Conexos ERP',
            subtitle: 'Sistema de registro',
            frente: 'plataforma',
            camada: 'externo',
            maturidade: 'implementado',
            estado: 'ambos',
            vista: 'macro',
            descricao:
                'O sistema de registro da Columbia e a fonte de verdade de tudo que o financeiro faz. A automação lê dele continuamente e escreve nele em pontos muito específicos e protegidos. Toda a arquitetura é organizada em torno de uma premissa: o ERP é soberano, a automação orquestra.',
            programasErp: [
                'fin010 — borderô e baixa',
                'fin015 — lotes SISPAG e remessa',
                'fin052 — arquivos de retorno',
                'fin064 — carteira a pagar',
                'com298 — títulos',
                'com308 — taxa negociada',
                'imp019 / imp223 — D.I e DUIMP',
                'imp021 — importadores',
            ],
        },
    },
]

export const MACRO_EDGES: ArqEdge[] = [
    // Permutas
    { id: 'me-p1', source: 'macro-permutas-eleicao', target: 'macro-permutas-gates', tipo: 'fluxo', estado: 'ambos', vista: 'macro' },
    { id: 'me-p2', source: 'macro-permutas-gates', target: 'macro-permutas-casamento', tipo: 'fluxo', estado: 'ambos', vista: 'macro' },
    { id: 'me-p3', source: 'macro-permutas-casamento', target: 'macro-permutas-variacao', tipo: 'fluxo', estado: 'ambos', vista: 'macro' },
    { id: 'me-p4', source: 'macro-permutas-variacao', target: 'macro-permutas-baixa', label: 'escrita', tipo: 'escrita', estado: 'ambos', vista: 'macro' },
    { id: 'me-p5', source: 'macro-permutas-analista', target: 'macro-permutas-casamento', label: 'casos N:M', tipo: 'humano', estado: 'ambos', vista: 'macro' },

    // SISPAG
    { id: 'me-s1', source: 'macro-sispag-ingestao', target: 'macro-sispag-lote', tipo: 'fluxo', estado: 'ambos', vista: 'macro' },
    { id: 'me-s2', source: 'macro-sispag-lote', target: 'macro-sispag-gate', tipo: 'fluxo', estado: 'ambos', vista: 'macro' },
    { id: 'me-s3', source: 'macro-sispag-gate', target: 'macro-sispag-remessa', tipo: 'fluxo', estado: 'ambos', vista: 'macro' },
    { id: 'me-s4', source: 'macro-sispag-remessa', target: 'macro-sispag-transporte', label: 'lacuna', tipo: 'gap', estado: 'ambos', vista: 'macro', destaque: true },
    { id: 'me-s5', source: 'macro-sispag-transporte', target: 'macro-sispag-retorno', label: 'lacuna', tipo: 'gap', estado: 'ambos', vista: 'macro', destaque: true },
    { id: 'me-s6', source: 'macro-sispag-lote', target: 'macro-sispag-duplo-pagamento', label: 'invariante', tipo: 'fluxo', estado: 'ambos', vista: 'macro' },

    // GED
    { id: 'me-g1', source: 'macro-ged-sharepoint', target: 'macro-ged-match', tipo: 'gap', estado: 'ambos', vista: 'macro' },
    { id: 'me-g2', source: 'macro-ged-match', target: 'macro-ged-upload', label: 'casou', tipo: 'gap', estado: 'ambos', vista: 'macro' },
    { id: 'me-g3', source: 'macro-ged-match', target: 'macro-ged-excecao', label: 'não casou', tipo: 'gap', estado: 'ambos', vista: 'macro' },

    // ERP
    { id: 'me-c1', source: 'macro-permutas-baixa', target: 'macro-conexos', tipo: 'escrita', estado: 'ambos', vista: 'macro' },
    { id: 'me-c2', source: 'macro-sispag-retorno', target: 'macro-conexos', tipo: 'fluxo', estado: 'ambos', vista: 'macro' },
    { id: 'me-c3', source: 'macro-ged-upload', target: 'macro-conexos', label: 'destrava NC/ND', tipo: 'gap', estado: 'ambos', vista: 'macro' },
]
