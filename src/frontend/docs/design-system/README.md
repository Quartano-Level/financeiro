# Design System — NF Automation Platform

Especificação do sistema de design da plataforma de automação de notas fiscais. Este documento é o ponto de entrada.

## Objetivo

Padronizar a construção de interfaces com:

- **Atomic Design** como filosofia de decomposição.
- **Compound components** como padrão de API.
- **Data-first** como diretriz de experiência: o usuário sempre tem acesso facilitado à informação.
- **Environment-aware theming**: cada ambiente (prd/uat/dev) tem paleta distinta para servir de guard-rail visual contra erros operacionais.
- **Página como maestro**: estado e lógica de negócio vivem na página; componentes expõem dados e eventos, nunca orquestram entre si.

A documentação é otimizada para uso com o Claude Design: cada arquivo traz propósito, anatomia, API, variantes, estados, comportamento, acessibilidade, exemplos de uso e do/don't — suficiente para gerar as telas e componentes a partir daqui.

## Índice

### Fundamentos

- [principles.md](./principles.md) — diretrizes gerais que norteiam todas as decisões visuais e de interação.
- [atomic-classification.md](./atomic-classification.md) — critério objetivo para classificar atom, molecule, organism, template e page, com exemplos canônicos.
- [tokens.md](./tokens.md) — cores (semânticas e por ambiente), tipografia, spacing, radius, shadow, z-index, breakpoints e motion.
- [accessibility.md](./accessibility.md) — conformidade WCAG 2.1 AA: foco, teclado, ARIA, contraste, motion reduzido.
- [patterns.md](./patterns.md) — padrões transversais: multi-component interactions, deep-linking via URL, persistência em localStorage, schema versioning, estados de carregamento/erro/vazio.

### Layout e navegação

- [layout.md](./layout.md) — AppShell (header + sidebar + main), DashboardLayout, AuthLayout, responsividade.
- [page-header.md](./page-header.md) — título, subtítulo, breadcrumbs, help, ações primárias e bar de filtro global.
- [sidebar.md](./sidebar.md) — navegação principal com 2 níveis, badges, estados colapsado/expandido, bottom nav em mobile.

### Componentes de dados

- [table.md](./table.md) — DataTable compound com paginação, filtros avançados, ordenação múltipla, máscaras, seleção em massa, context menu, redimensionamento, reordenação, colunas sticky colapsáveis, expansão de linha, edição inline (row e batch-edit CRUD), virtualização opcional, persistência, modo cliente e servidor. Inclui: UploadableDataTable (genérico, schema-driven, editMode batch com add/delete row).
- [kpi.md](./kpi.md) — KPICard (5 variantes compound: simple, with-delta, with-percentage, with-trend, with-icon) e KPIGrid responsivo.

### Entrada de dados — importação

- [excel-import-dialog.md](./excel-import-dialog.md) — ExcelImportDialog: dialog de importação de `.xlsx` com validação de schema Zod, preview de diff (linhas novas/removidas) e confirmação antes de importar. Usado em tabelas versionadas (De-Para e Configurações do Sistema).

### Entrada de dados

- [forms.md](./forms.md) — padrão react-hook-form + Zod, FormField, todos os inputs (incluindo máscaras brasileiras CNPJ/CPF/CEP/telefone), feedback de validação e envio.
- [modal.md](./modal.md) — ConfirmDialog, DestructiveConfirmDialog, FormDialog, InfoDialog, Drawer, MultiStepDialog e exemplo concreto do ReprocessModal.

### Feedback

- [notification.md](./notification.md) — Toast (Sonner) e NotificationCenter com persistência em localStorage (FIFO de 100, schema versionado).
- [feedback.md](./feedback.md) — Tooltip, HelpTooltip, HelpPopover, estados de botões (loading, disabled, read-only).
- [skeleton.md](./skeleton.md) — shapes reutilizáveis, animação shimmer, regra obrigatória de `.Skeleton` por componente.

## Como ler este documento

1. Leia primeiro `principles.md` e `atomic-classification.md` — são a lente para tudo o resto.
2. Familiarize-se com `tokens.md` — toda decisão visual deve referenciar um token.
3. Ao trabalhar em uma feature, abra o spec do componente mais externo (ex: `table.md` ao montar uma listagem) e siga as referências para atomos internos.
4. `patterns.md` explica as decisões que aparecem em vários componentes (persistência, deep-link, interação entre componentes).

## Convenções desta documentação

- **Português** no texto; **inglês** em código, identificadores, props, nomes de arquivos.
- **Tom imperativo** (use, não use, sempre, nunca).
- **Exemplos em TSX** curtos, focados no padrão — não em implementação de biblioteca.
- **Do / Don't** visíveis em todos os componentes.
- **Checklists de acessibilidade** presentes sempre que houver interação.
- **Estado do componente** documentado explicitamente: idle, hover, active, focus, disabled, loading, empty, error.

## Stack implícita

Documentação assume as escolhas abaixo. Se algum componente exigir biblioteca adicional, isso é explicitado no próprio spec.

- **Next.js 15 (App Router), React 19, TypeScript strict**.
- **Tailwind CSS v4** para estilização.
- **shadcn/ui + Radix UI** como base de primitivos acessíveis.
- **TanStack Table v8** para DataTable (com TanStack Virtual opcional).
- **react-hook-form + Zod** para formulários.
- **Sonner** para toasts.
- **lucide-react** para ícones.

## Diretrizes de ouro (resumo)

- Todo componente expõe dados e eventos; a página orquestra.
- Todo componente com estado `loading` expõe um `.Skeleton` correspondente.
- Todo botão de ação exibe estado `loading` durante async; feedback final vai para toast.
- Toda ação destrutiva passa por confirmação explícita.
- Todo item de navegação tem tooltip com título e explicação breve.
- Toda página tem título e subtítulo.
- Toda ação no sistema produz feedback visível.
- Persistência em localStorage é versionada e resiliente; leitura que falhe descarta silenciosamente.
- Filtros globais vão para a URL (deep-linkable); filtros granulares vão para localStorage.
- Ações destrutivas nunca dependem apenas de estado `disabled`; sempre há explicação via tooltip.

A expansão dessas regras está em `principles.md` e `patterns.md`.
