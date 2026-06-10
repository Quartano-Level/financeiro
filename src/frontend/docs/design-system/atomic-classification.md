# Classificação Atomic

Critério objetivo e exemplos canônicos para decidir em qual camada vai cada componente. Quando houver dúvida, use a **regra do corte** (abaixo) e, no empate, promova para a camada acima.

## As cinco camadas

### 1. Atom

**Definição:** primitivo visual com no máximo um elemento de conteúdo, sem estado de negócio, sem composição interna de outros componentes do DS (exceto tokens).

**Critério objetivo:**

- É um elemento HTML estilizado ou um pequeno wrapper (1 a 2 elementos).
- Não contém outros componentes do DS.
- Não guarda estado além do mínimo interno (ex: estado do Radix primitive).
- É agnóstico de domínio (não conhece "nota", "cliente", "pedido").

**Exemplos canônicos:**

- `Button`, `IconButton`
- `Input`, `Textarea`, `PasswordInput` (ainda é atom — compõe um único input com um toggle de visibilidade)
- `Label`, `HelpText`, `ErrorText`
- `Badge`, `StatusDot`, `Dot`
- `Icon` (wrapper de lucide)
- `Avatar`
- `Checkbox`, `Radio`, `Switch`
- `Spinner`
- `Skeleton.Line`, `Skeleton.Block`, `Skeleton.Circle`
- `Divider`
- `Kbd` (visual de tecla de atalho)
- `Link`

**Contraexemplos (NÃO são atoms):**

- `KPICard` → tem label + valor + dot + onClick + estado active → **molecule**.
- `CopyButton` com texto de tooltip e feedback de cópia → **molecule** (icon + tooltip + feedback state).

### 2. Molecule

**Definição:** composição de 2+ atoms com lógica de interação local. Resolve um micro-problema de UI, ainda agnóstica de domínio.

**Critério objetivo:**

- Compõe 2+ atoms.
- Tem estado local ou interação própria (hover coordenado, toggle interno, feedback de cópia).
- Ainda não conhece domínio.
- Pode ser usada em múltiplos contextos distintos.

**Exemplos canônicos:**

- `FormField` (label + input + helpText + errorText)
- `SearchBox` (icon + input + clear button)
- `CopyField` (label + valor truncado + botão copy + feedback)
- `KPICard` (label + value + dot + secondary info + clickable)
- `Breadcrumb` (ícone home + separador + item → item → item)
- `Pagination` (prev + indicador de página + next + page size)
- `FilterPopover` (popover + select de operador + input de valor + lista de valores distintos)
- `ColumnHeader` (label + sort indicator + filter trigger + resize handle)
- `SortIndicator`, `FilterIndicator`
- `NavItem` (ícone + label + badge + estado active)
- `DateRangePicker` (2 inputs de data + calendário)
- `DropdownMenu` (com items, separators, submenus)
- `ContextMenu`
- `ReadonlyModeBanner` (ícone Eye + texto de versão + botão Voltar — sem estado de loading, não requer `.Skeleton`)
- `Tooltip`, `HelpTooltip`, `HelpPopover`
- `Tabs`
- `Stepper` (para wizards)

**Contraexemplos:**

- `NotasTableFilter` → conhece "nota" → fora do DS, vira componente de feature.
- `PageHeader` com breadcrumbs, título, subtítulo, help e actions → organism (composição alta).

### 3. Organism

**Definição:** composição completa reutilizável entre domínios. Resolve uma seção funcional da interface. Aceita dados e ações via props.

**Critério objetivo:**

- Compõe 2+ molecules e/ou atoms.
- Tem anatomia rica (header + body + footer, ou toolbar + content + pagination).
- Declara slots opcionais para customização.
- Tem estado interno não trivial (seleção, filtros locais, ordenação — tudo sincronizável via props).
- Ainda é agnóstico de domínio.

**Exemplos canônicos:**

- `DataTable` (toolbar + header + body + pagination + context menu + bulk bar)
- `DataTable.Client`, `DataTable.Server` (duas implementações irmãs)
- `UploadableDataTable` (DataTable genérico schema-driven com editMode batch CRUD — add/delete row, onCellChange)
- `ExcelImportDialog` (dialog de import com validação de schema, preview de diff, confirm)
- `Sidebar` (logo + nav list + footer + collapse toggle)
- `AppShell` (header + sidebar + main)
- `Modal` / `Dialog` (overlay + content + header + body + footer)
- `Drawer`
- `MultiStepDialog` (modal + stepper + content por step + nav)
- `KPIGrid` (grid responsivo de KPICard)
- `NotificationCenter` (trigger + panel + list + empty state)
- `PageHeader` (título + subtítulo + breadcrumbs + help + actions)
- `GlobalFilterBar` (card + DateRangePicker + select de campo + botão aplicar)
- `BulkActionBar` (sticky bottom com contagem + actions + clear)

### 4. Template

**Definição:** layout de página sem dados. Define estrutura e posicionamento dos organisms/molecules na página.

**Critério objetivo:**

- Não contém dados reais; posições são ocupadas por slots ou `children`.
- Define grid, spacing, max-width, sticky areas.
- Reutilizável entre páginas do mesmo tipo.

**Exemplos canônicos:**

- `DashboardLayout` (AppShell com slots para PageHeader, filter bar, conteúdo principal).
- `AuthLayout` (centered card para login, reset password, etc).
- `SettingsLayout` (sidebar secundária de seções + área de conteúdo).
- `DetailLayout` (breadcrumb + title + tabs + body).

### 5. Page / Feature

**Definição:** composição final com dados reais, conhecimento de domínio, e efeitos de side (fetch, navegação, toast). **NÃO FICA NO DESIGN SYSTEM.**

**Critério objetivo:**

- Conhece entidades de domínio ("nota", "cliente", "conta projeto").
- Faz fetch, chama API, dispara mutações.
- Vive em `features/<domain>/` ou `app/<route>/` no código.
- Consome templates, organisms, molecules e atoms do DS.

**Exemplos canônicos:**

- `NotasPage`, `LoginPage`, `ConfiguracoesPage`
- `ReprocessModal` (é uma implementação concreta de `MultiStepDialog` para o domínio "nota")
- `NotasTable` (wrapper que configura `DataTable.Client` com colunas de NF)

## A regra do corte

Quando estiver em dúvida entre duas camadas:

1. **Contém nome de domínio (nota, cliente, prestador, etc)?** → fora do DS.
2. **Compõe outros componentes do DS?** → pelo menos molecule.
3. **Tem slot/variante nomeada ou API com compound pattern?** → organism.
4. **Ocupa a página inteira ou define layout macro?** → template.

## Guideline de naming

- **Atoms**: substantivo simples, PascalCase. `Button`, `Badge`, `Icon`.
- **Molecules**: substantivo composto ou descritivo da função. `FormField`, `SearchBox`, `KPICard`.
- **Organisms**: substantivo do papel na interface. `DataTable`, `Sidebar`, `NotificationCenter`.
- **Templates**: sufixo `Layout`. `DashboardLayout`, `AuthLayout`.
- **Pages/Features**: sufixo `Page` ou nome da feature. `NotasPage`, `Login`.

## Exemplo de composição entre camadas

Uma página típica composta inteira:

```
Page (NotasPage — em features/notas/)
└── Template (DashboardLayout)
    └── Organism (AppShell)
        ├── Organism (Sidebar)
        │   └── Molecule (NavItem)
        │       ├── Atom (Icon)
        │       ├── Atom (Label)
        │       └── Atom (Badge)
        ├── Header
        │   └── Organism (NotificationCenter)
        │       └── Molecule (PopoverPanel)
        └── Main
            ├── Organism (PageHeader)
            │   ├── Atom (Heading)
            │   ├── Atom (Text)
            │   ├── Molecule (Breadcrumb)
            │   └── Molecule (HelpButton)
            ├── Organism (GlobalFilterBar)
            │   ├── Molecule (DateRangePicker)
            │   └── Atom (Button)
            ├── Organism (KPIGrid)
            │   └── Molecule (KPICard)
            │       ├── Atom (Label)
            │       ├── Atom (Heading — value)
            │       └── Atom (StatusDot)
            └── Organism (DataTable)
                ├── Molecule (Toolbar)
                ├── Molecule (ColumnHeader)
                ├── Molecule (FilterPopover)
                ├── Molecule (Pagination)
                ├── Molecule (BulkActionBar)
                └── Molecule (ContextMenu)
```

## Quando promover de camada

Um atom vira molecule quando:

- Ganha um segundo elemento estruturado (ex: `Input` → `Input` + `Label` vira `FormField`).
- Ganha estado próprio (ex: `Button` + feedback de cópia vira `CopyButton` molecule).

Uma molecule vira organism quando:

- Passa a ter slots nomeados (`<X.Header />`, `<X.Body />`).
- Passa a exigir orquestração de múltiplas molecules irmãs (toolbar + body + pagination).
- Tem estado compartilhado entre partes (selection state no DataTable).

## Quando degradar

Raramente. Só degrade se o componente perdeu composições internas e virou um wrapper trivial sobre um único elemento. A degradação é sinal de que existe outro caminho melhor (deletar, fundir com outro).

## Exemplos que sempre confundem

### `Tooltip` — molecule
Primitive do Radix (atom?) + wrapper que adiciona tokens e contract de API. Fica em **molecule** porque encapsula comportamento coordenado (delay, positioning, arrow).

### `Skeleton` — atom
Cada variante (`Skeleton.Line`, `.Block`, `.Circle`) é um atom. Os **presets estruturados** (`Skeleton.TableRow`, `.KPICard`) são molecules porque compõem múltiplos atoms no shape do componente que representam.

### `Modal` — organism
Apesar de visualmente simples, compõe overlay + content + header + footer + close button + focus trap. É organism.

### `CopyButton` vs `CopyField` — ambos molecules
`CopyButton` = icon + tooltip + feedback state.
`CopyField` = label + valor + `CopyButton`. Ambos são molecules; a diferença é o caso de uso.

### `PageHeader` — organism
Embora pareça "só título e subtítulo", inclui help, actions, breadcrumbs e é o topo semântico de toda página — organism.

## Do / Don't

### Do

- Promova o componente para a camada acima em caso de dúvida empatada.
- Mantenha atoms sem dependência de molecules ou organisms do DS.
- Use a camada superior para compor; nunca modifique um atom com prop de domínio.
- Documente no spec do componente qual camada ele ocupa (seção "Classificação Atomic").

### Don't

- Não crie um atom que só serve a um organism específico — nesse caso o atom é um subcomponente interno do organism.
- Não espalhe domínio em nenhuma camada do DS. "NotaBadge" não existe; existe `Badge` com `variant="warning"` consumido por código de feature.
- Não duplique componentes entre camadas (`KPICard` em atoms e molecules). Escolha uma.
- Não abuse de `Template` para tudo; se não há reuso real entre páginas, o layout é inline na página.
