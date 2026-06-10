# DataTable

Componente central do produto. Cobre listagem, filtragem, ordenação, seleção, edição e exploração de dados. Toda página que lista entidades usa DataTable.

Há duas implementações irmãs: **`DataTable.Client`** (todo processamento no frontend) e **`DataTable.Server`** (processamento no backend com callbacks). Ambas compartilham API visual e comportamental; a diferença é quem executa filtro/sort/paginação.

## Propósito

- Exibir dados tabulares com controle total: filtros complexos, ordenação múltipla, máscaras, seleção em massa, ações em lote, edição inline.
- Permitir persistência de preferências do usuário (ordem, largura, visibilidade, filtros, densidade).
- Integrar com visualizações externas expondo dados filtrados/ordenados para consumo pela página.
- Ser agnóstico de domínio — configurada pela página via `columns` e `features`.

## Classificação Atomic

Organism. Internamente compõe múltiplas molecules (`Toolbar`, `ColumnHeader`, `FilterPopover`, `Pagination`, `BulkActionBar`, `ContextMenu`).

## Implementação recomendada

- **Base headless**: `@tanstack/react-table v8`.
- **Virtualização opcional**: `@tanstack/react-virtual`.
- **Primitivos acessíveis**: Radix (popover, dropdown, context menu, checkbox).
- **Ícones**: `lucide-react`.

TanStack Table resolve a maior parte das features (paginação, filtros, sort multi, selection, pinning, reorder, resize, expand, visibility, virtualization) como headless hooks. O restante (máscaras, context menu custom, persistência, edit mode, sticky collapse) é nosso.

## Anatomia

```
┌────────────────────────────────────────────────────────────────────┐
│ Toolbar                                                             │
│  [Refresh ⟳]  Notas fiscais · 306 registros · atualizado às 21:51 │
│                              [Ações: Limpar filtros] [▤ Densidade]│
│                              [Primário: Disparar ingestão]         │
├────────────────────────────────────────────────────────────────────┤
│ ☐ │ ID ▼▲ ⋮  │ Data Emissão ▼ ⋮ │ Nome Prestador ⋮ │ Valor ⋮ │ ⚙   │
│   │     │      │                    │                    │         │
│   │     │      │                    │                    │         │
│ ☐ │ 001 │ 01/04 │ ACME LTDA          │ R$ 1.000,00       │ [⋮]    │
│ ☐ │ 002 │ 02/04 │ BETA SA            │ R$ 2.500,00       │ [⋮]    │
│ ☐ │ 003 │ 03/04 │ GAMMA ME           │ R$ 450,00         │ [⋮]    │
│ ...                                                                 │
├────────────────────────────────────────────────────────────────────┤
│ Pagination                                                          │
│  [← Anterior]  1 2 3 ... 20  [Próximo →]        15 por página ▼   │
├────────────────────────────────────────────────────────────────────┤
│ BulkActionBar (aparece ao selecionar)                               │
│  3 selecionadas   [Reprocessar]  [Exportar]  [Limpar seleção]      │
└────────────────────────────────────────────────────────────────────┘
```

Elementos externos à tabela mas parte do spec:

- Handle vertical no rodapé para redimensionar altura (opcional).
- Handles de resize horizontal entre colunas.
- Botões de collapse das colunas sticky (esquerda e direita).
- Chevron de expansão de linha (quando `expandable` ativo).

## Forma compound

```tsx
<DataTable.Root tableId="notas" columns={columns} data={data}>
    <DataTable.Toolbar>
        <DataTable.RefreshButton onRefresh={refetch} lastUpdatedAt={updatedAt} />
        <DataTable.Title>Notas fiscais</DataTable.Title>
        <DataTable.Count />
        <DataTable.ToolbarSpacer />
        <DataTable.ClearFiltersButton />
        <DataTable.DensityToggle />
        <DataTable.ColumnVisibilityMenu />
        <DataTable.PrimaryAction onClick={triggerIngestion}>
            Disparar ingestão
        </DataTable.PrimaryAction>
    </DataTable.Toolbar>

    <DataTable.Body />

    <DataTable.Pagination />

    <DataTable.BulkActionBar
        actions={[
            { id: 'reproc', label: 'Reprocessar', icon: <RefreshCw />, onClick: reprocSelected },
            { id: 'export', label: 'Exportar', icon: <Download />, onClick: exportSelected },
        ]}
    />
</DataTable.Root>
```

## Forma pré-configurada

```tsx
<DataTable.Client
    tableId="notas"
    columns={columns}
    data={data}
    title="Notas fiscais"
    loading={isLoading}
    error={error}
    lastUpdatedAt={updatedAt}
    onRefresh={refetch}
    primaryAction={{ label: 'Disparar ingestão', icon: <Zap />, onClick: triggerIngestion }}
    bulkActions={[
        { id: 'reproc', label: 'Reprocessar', icon: <RefreshCw />, onClick: reprocSelected },
    ]}
    rowContextMenu={{
        copy: ['id', 'cnpj', 'numero_nf'],
        actions: [
            { id: 'reproc', label: 'Reprocessar', onClick: (row) => openReproc(row) },
            { id: 'open', label: 'Abrir detalhes', onClick: (row) => router.push(`/notas/${row.id}`) },
        ],
    }}
    features={{
        resize: true,
        reorder: true,
        multiSort: true,
        zebra: true,
        verticalResize: true,
        virtualize: false,
        edit: false,
        expand: false,
    }}
    onFiltersApplied={(filtered) => setVisibleData(filtered)}
/>
```

## API pública — props principais

### `<DataTable.Client>` e `<DataTable.Server>` (compartilhadas)

| Prop | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `tableId` | `string` | sim | Identificador único para persistência em localStorage |
| `columns` | `ColumnDef<T>[]` | sim | Definição das colunas |
| `title` | `string` | não | Título exibido na toolbar |
| `loading` | `boolean` | não | Mostra skeleton rows |
| `error` | `Error \| null` | não | Exibe banner de erro no topo da tabela |
| `lastUpdatedAt` | `Date` | não | Exibido na toolbar ("atualizado às HH:MM:SS") |
| `onRefresh` | `() => void` | não | Ativa botão refresh na toolbar |
| `primaryAction` | `ActionConfig` | não | Botão primário à direita da toolbar |
| `secondaryActions` | `ActionConfig[]` | não | Botões secundários |
| `bulkActions` | `ActionConfig[]` | não | Ações do BulkActionBar |
| `rowContextMenu` | `RowContextMenuConfig` | não | Configuração do context menu |
| `features` | `FeaturesConfig` | não | Toggles de features |
| `emptyState` | `ReactNode` | não | Substitui empty state padrão |
| `noResultsState` | `ReactNode` | não | Substitui estado "sem resultados para os filtros" |
| `loadingState` | `ReactNode` | não | Substitui skeleton rows |
| `errorState` | `(err) => ReactNode` | não | Substitui banner de erro |
| `rowClickBehavior` | `'none' \| 'select' \| 'expand' \| 'custom'` | não, default `'none'` | Comportamento do click em linha |
| `onRowClick` | `(row) => void` | não | Callback se `rowClickBehavior='custom'` |
| `onSelectionChange` | `(selected) => void` | não | Notifica mudança de seleção |
| `onFiltersApplied` | `(filtered: T[]) => void` | não | Expõe dados filtrados/ordenados para consumo externo (página, gráficos) |
| `initialState` | `TableState` | não | Estado inicial antes de restaurar do localStorage |

### `<DataTable.Client>` — específicas

| Prop | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `data` | `T[]` | sim | Dados completos; filtro/sort/paginação locais |
| `pageSize` | `number` | não, default `15` | Padrão inicial |
| `pageSizeOptions` | `number[]` | não, default `[10, 15, 25, 50, 100]` | Opções do seletor |

### `<DataTable.Server>` — específicas

| Prop | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `data` | `T[]` | sim | Linhas da página atual |
| `totalCount` | `number` | sim | Total de registros (para paginação) |
| `pageIndex` | `number` | sim | Página atual (0-indexed) |
| `pageSize` | `number` | sim | Itens por página |
| `sorting` | `SortingState` | sim | Estado de ordenação atual |
| `filters` | `ColumnFiltersState` | sim | Estado de filtros atual |
| `onStateChange` | `(state) => void` | sim | Callback único agregando todas as mudanças |

## Definição de coluna

```ts
interface ColumnDef<T> {
    id: string;                           // único na tabela; usado em persistência
    header: string | ReactNode;           // label no header; se string, permite filter/sort
    accessor: keyof T | ((row: T) => unknown);

    // Formatação
    mask?: 'cnpj' | 'cpf' | 'cep' | 'phone' | 'date-br' | 'datetime-br' | 'currency-brl' | 'percent' | ((value: unknown) => string);
    align?: 'left' | 'right' | 'center';  // default deriva do tipo: number/currency → right
    width?: number;                       // largura inicial em px
    minWidth?: number;                    // default 80
    maxWidth?: number;                    // default 600

    // Funcionalidades
    sortable?: boolean;                   // default true
    filter?: FilterConfig | false;        // false desabilita; default deriva do tipo
    resizable?: boolean;                  // default true
    reorderable?: boolean;                // default true
    hideable?: boolean;                   // default true

    // Sticky
    sticky?: 'left' | 'right';

    // Renderização
    cell?: (props: CellProps<T>) => ReactNode;  // override customizado
    copyable?: boolean;                   // aparece no context menu
    copyValue?: (row: T) => string;       // override do valor copiado

    // Edição
    editable?: boolean;                   // default false
    editor?: 'text' | 'number' | 'select' | 'date' | CustomEditor;
    validateEdit?: (value: unknown, row: T) => string | null;  // retorna erro ou null

    // Prioridade de responsividade (esconde de fora para dentro)
    priority?: 'high' | 'medium' | 'low'; // default 'medium'
}
```

### `FilterConfig`

```ts
interface FilterConfig {
    type: 'string' | 'number' | 'date' | 'boolean' | 'enum';

    // Para 'string'
    operators?: StringOperator[];         // default todas
    facet?: boolean;                      // mostra lista de valores distintos selecionáveis; default true se type === 'string'

    // Para 'enum'
    options?: Array<{ value: string; label: string; color?: string }>;

    // Combinação de múltiplas condições
    combinator?: 'and' | 'or';            // default 'or', controlável pelo usuário
}

type StringOperator = 'contains' | 'not_contains' | 'equals' | 'not_equals' | 'starts_with' | 'ends_with' | 'is_empty' | 'is_not_empty';
type NumberOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'is_empty' | 'is_not_empty';
type DateOperator = NumberOperator;  // datas reutilizam operadores numéricos
```

## Features — toggles

```ts
interface FeaturesConfig {
    resize?: boolean;          // default true — redimensionar colunas arrastando
    reorder?: boolean;         // default true — reordenar colunas via drag
    multiSort?: boolean;       // default true — ordenação por múltiplas colunas (shift+click)
    zebra?: boolean;           // default false — linhas zebradas (decisão do dev, não do usuário)
    verticalResize?: boolean;  // default true — handle no rodapé para aumentar altura da tabela
    virtualize?: boolean;      // default false — ativa virtualização (exige viewport fixa)
    edit?: boolean;            // default false — habilita modo de edição
    expand?: boolean;          // default false — linhas expansíveis
    stickyCollapse?: boolean;  // default true — botões de collapse nas colunas sticky
    density?: boolean;         // default true — toggle compact/comfortable
    columnVisibility?: boolean; // default true — menu para mostrar/esconder colunas
    persistence?: boolean;     // default true — salva preferências em localStorage
}
```

## As 22 funcionalidades — detalhe

### 1. Paginação e quantidade de itens por página

- Molecule `Pagination` no rodapé.
- Controles: `←` prev, indicador de página, `→` next, input "ir para página", seletor de `pageSize`.
- `pageSizeOptions` padrão: `[10, 15, 25, 50, 100]`.
- Página atual **não** persiste em localStorage (reset a cada refresh); `pageSize` persiste.
- Em server mode, paginação dispara `onStateChange({ pageIndex, pageSize })`.

### 2. Filtros por coluna

Todas as colunas têm filtro por padrão. Desativa caso a caso (`filter: false`).

**Trigger**: ícone de funil no header. Ativa exibe o filtro em destaque (cor primary + badge do indicador).

**Popover de filtro — string:**

```
┌─────────────────────────────────────┐
│ Filtro: Nome Prestador              │
├─────────────────────────────────────┤
│  Combinador: [ OR | AND ]            │
│                                     │
│  [Condição 1]                       │
│   Operador: [Contém ▼]              │
│   Valor: [___________] ✕            │
│                                     │
│  [Condição 2]                       │
│   Operador: [Começa com ▼]          │
│   Valor: [___________] ✕            │
│                                     │
│  [+ Adicionar condição]             │
│                                     │
│  ─────────────────────────────────  │
│  Valores distintos (selecionáveis): │
│  [🔍 Buscar...]                      │
│  ☐ ACME LTDA          (12)          │
│  ☑ BETA SA            (8)           │
│  ☐ GAMMA ME           (3)           │
│  ☑ DELTA CORP         (1)           │
│                                     │
│  [Limpar]           [Aplicar]       │
└─────────────────────────────────────┘
```

**Popover de filtro — número / data:**

Operadores: `=`, `≠`, `>`, `<`, `≥`, `≤`, `entre`, `está vazio`, `não está vazio`. Múltiplas condições com toggle AND/OR. Sem facet (não faz sentido para números contínuos).

**Combinação:**

- Dentro da mesma coluna: usuário escolhe AND ou OR.
- Entre colunas: sempre AND.
- Facet (multi-select) implica OR implícito entre os selecionados; combina com as condições via AND (condições AND facet).

**Máscara**: filtros desconsideram máscara. Ex: filtro "contém 123" em coluna CNPJ bate em `12.345.678/0001-00` (valor normalizado é `12345678000100`).

### 3. Ordenação múltipla

- Click em header: sort asc; próximo click: desc; próximo click: remove sort.
- **Shift + click**: adiciona coluna ao sort existente (multi-sort).
- Indicador visual: seta (`↑` / `↓`) + número da ordem (`1`, `2`, `3`...).
- Sem limite de colunas no sort.
- Botão "Limpar ordenação" disponível em menu de coluna e no atalho "Limpar filtros" da toolbar (ver 20).

### 4. Máscaras

Aplicadas apenas na renderização. Filtro e sort operam sobre o valor bruto.

**Máscaras built-in:**

| Mask | Input | Output |
|---|---|---|
| `cnpj` | `12345678000100` | `12.345.678/0001-00` |
| `cpf` | `12345678900` | `123.456.789-00` |
| `cep` | `01234567` | `01234-567` |
| `phone` | `11987654321` | `(11) 98765-4321` |
| `date-br` | `Date` ou ISO string | `DD/MM/YYYY` |
| `datetime-br` | `Date` ou ISO string | `DD/MM/YYYY HH:mm:ss` |
| `currency-brl` | `1234.56` | `R$ 1.234,56` |
| `percent` | `0.1234` | `12,34%` |

Custom: `mask: (value) => string`.

### 5. Seleção em massa

- Checkbox no início de cada linha + checkbox no header para select-all.
- Select-all seleciona apenas página atual em client mode; seleção cross-page é suportada via "Selecionar todos os N resultados filtrados".
- `onSelectionChange` recebe `{ selectedIds: Set<string>, selectedRows: T[], allFilteredSelected: boolean }`.
- Feedback visual: linha selecionada tem background `primary-subtle`.
- BulkActionBar sticky no rodapé aparece quando há seleção (ver item 6).

### 6. Context menu

**Triggers**: right-click na linha (abre no ponto do click) + botão kebab (`⋮`) no final da linha (abre à direita do botão).

**Conteúdo configurável:**

```ts
interface RowContextMenuConfig<T> {
    copy?: Array<keyof T> | 'all';            // colunas copiáveis (mostra seção "Copiar")
    actions?: ContextMenuAction<T>[];
}

interface ContextMenuAction<T> {
    id: string;
    label: string;
    icon?: ReactNode;
    onClick: (row: T) => void;
    destructive?: boolean;                     // estiliza em vermelho e adiciona divisor antes
    disabled?: (row: T) => boolean;
    hidden?: (row: T) => boolean;
    confirm?: { title: string; description: string };  // se presente, abre ConfirmDialog antes
}
```

**Exemplo:**

```
┌─────────────────────────────┐
│ 📋 Copiar ID                │
│ 📋 Copiar CNPJ              │
│ 📋 Copiar Nº da nota        │
│ ───────────────────────────│
│ 🔄 Reprocessar              │
│ 📄 Abrir detalhes           │
│ ───────────────────────────│
│ 🗑 Excluir                  │  ← destrutiva: vermelho + confirm
└─────────────────────────────┘
```

Para ações em lote, há um BulkActionBar análogo (item 5).

### 7. Colunas redimensionáveis

- Handle à direita de cada header (3px de largura, visível em hover).
- Drag horizontal muda a largura; mínimo 80px, máximo 600px (configurável por coluna).
- Duplo click: auto-ajusta ao conteúdo (largura do maior valor visível).
- Largura persistida em localStorage.

### 8. Reordenar colunas

- Drag no header da coluna (não no handle de resize — são regiões distintas).
- Cursor muda para `grab` em hover; `grabbing` durante drag.
- Drop zones entre colunas visíveis durante drag.
- Ordem persistida em localStorage.
- Colunas sticky (left/right) não podem ser movidas para fora da área sticky (arrastar para o lado oposto move para o meio).

### 9. Scroll interno x/y

- Container da tabela tem `overflow: auto`.
- Scroll X quando `sum(columnWidths) > tableWidth`.
- Scroll Y quando linhas excedem altura do container.
- Scrollbar estilizada sutilmente.

### 10. Colunas sticky colapsáveis

- `sticky: 'left'` fixa coluna à esquerda; `sticky: 'right'` à direita.
- Múltiplas colunas sticky em cada lado são suportadas; agrupadas visualmente.
- **Collapse UX**: botão pequeno na borda da última coluna sticky. Click colapsa todas as sticky daquele lado em um bloco estreito (~32px) com indicador "◀ 3 cols" ou "3 cols ▶". Click novamente expande.
- Estado de collapse persistido em localStorage (`stickyCollapsedLeft`, `stickyCollapsedRight`).
- Sombra sutil marca o limite entre sticky e área rolável (`shadow: inset -2px 0 4px ...` à direita da sticky esquerda).

### 11. Cópia fácil de valores

- Duplo click em célula: copia o valor (sem máscara por padrão — comportamento configurável).
- Ícone de cópia aparece ao hover na célula (canto superior-direito).
- Feedback: ícone troca para check por 1s + toast `"Copiado: <valor truncado>"`.
- Context menu "Copiar X" também copia.
- Tecla Ctrl/Cmd+C em célula focada copia.

### 12. Data de último carregamento

Exibido na toolbar em formato relativo ou absoluto:

- `atualizado há 30s`
- `atualizado às 21:51:40` (quando > 5 min)
- `atualizado ontem às 14:22`

Atualiza automaticamente (tick de 30s) enquanto o componente está montado.

### 13. Botão refresh

- Ícone `RefreshCw` à esquerda da toolbar.
- Click dispara `onRefresh`. Durante execução, ícone gira (animation `spin`).
- Atalho de teclado: `R` (com tabela focada).

### 14. Exposição de valores filtrados/ordenados

Prop `onFiltersApplied(filteredData)` recebe as linhas após filtros e ordenação (antes da paginação). A página usa isso para alimentar gráficos, contagens adicionais, exports etc.

```tsx
const [visibleData, setVisibleData] = useState([]);

<DataTable.Client
    data={allData}
    columns={columns}
    onFiltersApplied={setVisibleData}
/>

// visibleData reflete filtros e sort aplicados;
// use em gráficos, KPIs dinâmicos, export.
```

Também expõe `onStateChange({ filters, sorting, columnVisibility, pageSize })` para integração mais granular.

### 15. Botões de ação na toolbar

- `primaryAction`: botão com `variant="primary"` à direita da toolbar.
- `secondaryActions`: array de botões `variant="secondary"` à esquerda do primary.
- Default já oferece: Refresh, Clear filters, Density toggle, Column visibility menu.

### 16. Redimensionamento vertical pelo usuário

- Handle na base da tabela (cursor `ns-resize`) — só aparece se `features.verticalResize === true`.
- Drag vertical aumenta/diminui altura do container.
- Altura persistida em localStorage.
- Altura mínima: 200px; máxima: `80vh`.

### 17. Linhas zebradas

- Decidido pelo **dev** via `features.zebra`, não pelo usuário.
- Quando ativo: linhas pares recebem background `surface-sunken`; ímpares mantêm `surface`.
- Se hover, background sobrescreve zebra com `primary-subtle` (opacity 30%).

### 18. Expansão de linha

- Chevron no início da linha (antes do checkbox se ambos ativos).
- Click expande abaixo da linha mostrando conteúdo extra (renderizado via prop `renderExpandedRow`).
- Múltiplas linhas podem estar expandidas simultaneamente.
- Estado de expansão **não** persiste (reset a cada load).

```tsx
<DataTable.Client
    ...
    features={{ expand: true }}
    renderExpandedRow={(row) => <NotaLogs id={row.id} />}
/>
```

### 19. Persistência em localStorage

**Schema versionado:**

```ts
interface TablePersistedState {
    v: number;                     // versão do schema
    filters: ColumnFiltersState;
    sorting: SortingState;
    columnVisibility: Record<string, boolean>;
    columnOrder: string[];
    columnSizing: Record<string, number>;
    density: 'compact' | 'comfortable';
    pageSize: number;
    stickyCollapsedLeft?: boolean;
    stickyCollapsedRight?: boolean;
    verticalHeight?: number;
}
```

**Chave**: `ds:table:<userId>:<tableId>:v<N>`.

**Regras:**

- Validação Zod ao ler. Falha → descarta silenciosamente e usa defaults.
- Versão incrementa a cada breaking change do schema.
- Gravação com debounce de 300ms para evitar I/O excessivo.
- Errors de gravação (ex: quota exceeded) fazem fallback silencioso; não quebram a UI.

**Não persiste**: `pageIndex`, seleção, scroll, estado de expansão, dados em edição.

### 20. Botão "Limpar filtros e ordenações"

- Ícone `X` + tooltip "Limpar filtros e ordenações".
- Aparece na toolbar quando há pelo menos um filtro ou sort aplicado.
- Click reseta filtros, sort, columnVisibility (para defaults), mantém columnOrder e sizing (preferências).

### 21. Modo cliente vs servidor

Dois componentes distintos: `<DataTable.Client>` e `<DataTable.Server>`.

**`<DataTable.Client>`**:

- Recebe todos os dados via `data`.
- Filtro, sort, paginação executados localmente (via TanStack Table).
- Ideal para datasets ≤ 5k linhas.

**`<DataTable.Server>`**:

- Recebe apenas a página atual via `data`, + `totalCount` + estado atual (`pageIndex`, `sorting`, `filters`).
- Emite `onStateChange` a cada mudança; a página traduz para query da API e refetch.
- Ideal para datasets grandes ou dados em streaming.

As APIs visuais são idênticas. Só muda quem processa.

### 22. Modo de edição inline

Ativado por `features.edit = true`. O dev define por coluna `editable: true | false`.

**Interação:**

- Botão "Editar" na linha (context menu ou botão inline) → linha inteira entra em modo edit.
- Cada célula editável vira `Input` / `Select` / `DatePicker` conforme `editor`.
- Células não-editáveis continuam como texto.
- Botões "Salvar" e "Cancelar" aparecem na linha.
- Validação inline (`validateEdit`) mostra erro abaixo da célula.
- Salvar dispara callback `onRowSave(rowId, changes)`; página executa a mutação.
- Cancelar reverte valores.

**Modo batch edit** (alternativo):

- Toggle na toolbar "Modo edição" → todas as linhas entram em edit simultaneamente.
- Botão "Salvar alterações" na toolbar agrupa mudanças em `onBatchSave(changes)`.

Escolha entre row-edit e batch-edit via prop `editMode: 'row' | 'batch'`.

## Estados

- **idle**: dados carregados, sem interação especial.
- **loading**: skeleton rows (7 linhas padrão, largura variada por coluna).
- **empty** (sem dados): empty state slot com ilustração + mensagem + CTA opcional.
- **no-results** (filtros ativos, 0 resultados): mensagem específica + botão "Limpar filtros".
- **error**: banner vermelho no topo da tabela, mantém cabeçalho visível, corpo mostra mensagem + botão "Tentar novamente". Dados prévios permanecem (se houver) para não perder contexto.
- **selection-active**: BulkActionBar visível no rodapé.
- **editing**: linha(s) em modo edit.
- **virtualized**: apenas linhas visíveis renderizadas (modo opcional).

## Densidade

```ts
type Density = 'compact' | 'comfortable';
```

| Density | Row height | Cell padding |
|---|---|---|
| `compact` | 32px | `p-2` (8px) |
| `comfortable` | 48px | `p-3` (12px) |

Default: `comfortable`. Toggle na toolbar. Persiste.

## Virtualização

Quando `features.virtualize === true`:

- Requer viewport com altura fixa (container com `h-[value]` explícito).
- `@tanstack/react-virtual` gerencia o virtual window.
- Scroll continua nativo.
- Filtros, sort, paginação continuam funcionando (TanStack Table aplica antes do virtual).
- Sticky columns e row expand são suportados; row height deve ser previsível (compact/comfortable presets, não arbitrário).

**Regra**: só ative se dataset > 2k linhas. Para menos, DOM puro é mais simples e igualmente performático.

## Acessibilidade

- Tabela renderiza como `<table role="grid">`.
- `<thead>` contém `<tr>` com `<th scope="col">`.
- `<tbody>` com `<tr>` e `<td>`.
- Navegação por teclado:
  - Tab entre elementos interativos (checkbox, botões, filtros).
  - Dentro da tabela focada: `ArrowUp/Down/Left/Right` move entre células.
  - `Space` seleciona linha.
  - `Enter` ativa action padrão (ex: abrir context menu).
  - `Escape` sai de modo edit.
- Células editáveis em modo edit têm `aria-invalid` quando há erro.
- Botões de sort têm `aria-sort="ascending" | "descending" | "none"`.
- `aria-label` em todos os ícones de ação.
- Seleção cross-page: quando "Selecionar todos N filtrados" é clicado, `aria-live` anuncia.

## Responsividade

- **Desktop**: layout completo.
- **Tablet/Mobile**: mantém tabela, scroll horizontal nativo. Colunas com `priority: 'low'` escondem primeiro; `medium` depois. `high` sempre visíveis.
- Toolbar quebra em múltiplas linhas em mobile.
- BulkActionBar mantém sticky bottom; adapta para largura da viewport.
- Context menu em mobile: toque longo em vez de right-click; botão kebab sempre visível.

## Exemplo canônico — NotasTable

```tsx
const notasColumns: ColumnDef<Nota>[] = [
    {
        id: 'id',
        header: 'ID da nota',
        accessor: 'id',
        sticky: 'left',
        copyable: true,
        width: 120,
        priority: 'high',
    },
    {
        id: 'issue_date',
        header: 'Data emissão',
        accessor: 'issue_date',
        mask: 'date-br',
        filter: { type: 'date' },
        priority: 'high',
    },
    {
        id: 'prestador_nome',
        header: 'Nome prestador',
        accessor: 'prestador_nome',
        filter: { type: 'string', facet: true },
        priority: 'high',
    },
    {
        id: 'cnpj_prestador',
        header: 'CNPJ prestador',
        accessor: 'cnpj_prestador',
        mask: 'cnpj',
        copyable: true,
        priority: 'medium',
    },
    {
        id: 'valor',
        header: 'Valor',
        accessor: 'valor_total',
        mask: 'currency-brl',
        align: 'right',
        filter: { type: 'number' },
        priority: 'high',
    },
    {
        id: 'status',
        header: 'Status',
        accessor: 'status',
        filter: {
            type: 'enum',
            options: [
                { value: 'SAVED', label: 'Salva', color: 'info' },
                { value: 'PROCESSING', label: 'Processando', color: 'warning' },
                { value: 'ESCRITURADA', label: 'Escriturada', color: 'info' },
                { value: 'FINALIZADA', label: 'Finalizada', color: 'success' },
                { value: 'PENDING', label: 'Pendente', color: 'danger' },
            ],
        },
        cell: ({ value }) => <StatusBadge status={value} />,
        priority: 'high',
    },
    {
        id: 'actions',
        header: '',
        accessor: () => null,
        sticky: 'right',
        sortable: false,
        filter: false,
        width: 56,
        cell: ({ row }) => <RowActions row={row} />,
    },
];

function NotasTable({ data, loading, onRefresh, lastUpdatedAt }: Props) {
    return (
        <DataTable.Client
            tableId="notas"
            title="Notas fiscais"
            columns={notasColumns}
            data={data}
            loading={loading}
            onRefresh={onRefresh}
            lastUpdatedAt={lastUpdatedAt}
            primaryAction={{
                label: 'Disparar ingestão',
                icon: <Zap />,
                onClick: triggerIngestion,
            }}
            bulkActions={[
                { id: 'reproc', label: 'Reprocessar', icon: <RefreshCw />, onClick: reprocSelected },
            ]}
            rowContextMenu={{
                copy: ['id', 'cnpj_prestador', 'numero_nf'],
                actions: [
                    { id: 'reproc', label: 'Reprocessar', onClick: (r) => openReproc(r) },
                    { id: 'details', label: 'Abrir detalhes', onClick: (r) => router.push(`/notas/${r.id}`) },
                ],
            }}
            features={{
                resize: true,
                reorder: true,
                multiSort: true,
                zebra: true,
                verticalResize: true,
                virtualize: data.length > 2000,
                expand: false,
            }}
            onFiltersApplied={(filtered) => setVisibleData(filtered)}
        />
    );
}
```

## Colunas via schema declarado

Quando `data=[]` (tabela vazia ou carregando), a `UploadableDataTable` **deve renderizar o cabeçalho** com base no array `schema` passado via prop, não inferir colunas dos dados. Isso garante que o empty state visível seja correto e contextualizado, e que o estado de loading mostre os headers antes dos dados chegarem.

### Regras

- `columns` é derivado de `schema: { name: string; type: string; required: boolean }[]`.
- Se `schema` está vazio e `data` está vazio → exibe empty state genérico ("Nenhum dado") sem headers.
- Se `schema` está preenchido e `data` está vazio → exibe headers + empty state inline na tabela.
- `columns` não depende de `Object.keys(data[0])` — esse padrão é proibido neste componente.

### Exemplo

```tsx
// CORRETO: schema declarado, data pode ser []
<UploadableDataTable
    schema={[
        { name: 'email', type: 'string', required: true },
        { name: 'email_group', type: 'string', required: true },
        { name: 'active', type: 'boolean', required: false },
    ]}
    data={[]}
    editMode="batch"
    onAddRow={handleAddRow}
    onDeleteRow={handleDeleteRow}
    onCellChange={handleCellChange}
/>
// → renderiza header com 3 colunas + empty state "Nenhuma linha ainda"

// ERRADO: inferir colunas dos dados
const columns = data.length > 0 ? Object.keys(data[0]) : [];
// → se data=[], nenhuma coluna é renderizada
```

## Modo batch-edit — CRUD completo (extensão de §22)

O modo batch-edit (§22) foi estendido para suportar **adicionar e remover linhas** (CRUD completo), além das operações de edição já documentadas.

### Novos callbacks

```ts
interface UploadableDataTableProps {
    // ... props existentes
    editMode?: 'batch';
    onAddRow?: () => void;                     // usuário clicou em "Adicionar linha"
    onDeleteRow?: (rowIndex: number) => void;  // usuário clicou em lixeira da linha
    onCellChange?: (rowIndex: number, columnName: string, value: string) => void;
}
```

### Comportamento

- **Adicionar linha**: botão "Adicionar linha" no rodapé da tabela (dentro do componente). Click dispara `onAddRow()`; a página é responsável por criar a nova linha em `localRows` e passá-la de volta via `data`.
- **Remover linha**: botão `Trash2` (lixeira) ao final de cada linha. Click dispara `onDeleteRow(rowIndex)`; a página remove a linha.
- **Editar célula**: `<input>` nativo em cada célula editável. `onChange` dispara `onCellChange(rowIndex, colName, value)`.
- **Linhas novas** (sem `_row_audit`): fundo verde-claro (`emerald-50/40`) para distinguir de linhas persistidas.
- **Badge de diff**: calculado externamente (no hook da página) e passado via prop `diffSummary?: { added: number; modified: number; deleted: number }`.

### Props de visibilidade de colunas

```ts
hiddenColumns?: string[];  // lista de IDs de colunas a ocultar
```

Permite que a página configure quais colunas não exibir sem alterar o schema. Útil para ocultar `context` na página De-Para.

### Prop de clique em linha (modo lista)

```ts
onRowClick?: (row: Record<string, unknown>) => void;
```

Quando passada, cada linha é clicável (cursor pointer, hover highlight). Não combina com `editMode='batch'`.

## Export / Import

Props adicionadas ao `GenericDataTable` para habilitar exportação e importação de dados diretamente no toolbar da tabela.

### Props

| Prop | Tipo | Padrão | Descrição |
|---|---|---|---|
| `enableExport` | `boolean` | `false` | Exibe botão "Exportar" no toolbar |
| `enableImport` | `boolean` | `false` | Exibe botão "Importar" no toolbar (apenas em `mode='edit'`) |
| `exportFileName` | `string` | `'export.xlsx'` | Nome do arquivo exportado |
| `onImport` | `(rows: TRow[]) => void \| Promise<void>` | — | Chamado após confirmação do import |
| `importSchema` | `ZodSchema` | — | Schema Zod para validação das linhas importadas (opcional) |

### Comportamento

- **Export**: usa o array `sortedData` interno (filtrado + ordenado, não paginado). Chama `exportToXlsx` de `@/features/core/uploadable/lib/excel`.
- **Import**: abre `ExcelImportDialog` montado internamente; ao confirmar, chama `onImport` com as linhas parseadas.
- `enableImport` só deve ser passado quando `mode='edit'`. Em `mode='display'`, o botão de importar não é exibido mesmo que `enableImport=true`.
- Os botões aparecem no toolbar entre o botão "Limpar filtros" e os `headerActions`.
- Se `enableExport || enableImport` for `true` e `showHeader` seria `false`, o header é forçado a exibir.

### Estilo dos botões

Consistente com o botão "Limpar filtros" existente:

```tsx
className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 bg-white px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
```

### Exemplo

```tsx
<GenericDataTable
    mode="edit"
    enableExport
    enableImport
    exportFileName="mapeamentos-v3.xlsx"
    onImport={handleImport}
    // importSchema={myZodSchema}  // opcional
    ...
/>
```

## Do / Don't

**Do**

- Use `tableId` único por tabela. Chave de persistência depende disso.
- Declare `priority` em cada coluna para graceful degradation em viewports menores.
- Exponha `onFiltersApplied` quando a página tem gráficos ou KPIs que acompanham o filtro.
- Use `DataTable.Server` quando o dataset > 5k linhas ou quando filtros dependem de dados não carregados.
- Use `confirm` em ações destrutivas do context menu.
- Passe `editable: false` em colunas que nunca devem ser editadas (ex: `id`).

**Don't**

- Não coloque lógica de fetch dentro da tabela. A página fornece `data` e recebe eventos.
- Não misture client e server mode em uma mesma tabela.
- Não persista dados sensíveis em localStorage (a tabela só persiste preferências, não dados).
- Não ultrapasse 25 colunas. Se precisar, reorganize em abas ou views.
- Não esconda filtros importantes atrás de "avançado" — se precisa do filtro, disponibilize.
- Não duplique o mesmo `id` em duas colunas diferentes.
- Não use `hideable: false` em todas as colunas. O usuário precisa poder customizar.
