# PageHeader e GlobalFilterBar

Toda página tem um PageHeader. Páginas que trabalham com dados temporais também têm um GlobalFilterBar ao lado dele. A combinação é o topo semântico da página.

## PageHeader

### Propósito

Identificar a página, explicar seu propósito, fornecer navegação hierárquica (breadcrumbs), acesso a ajuda contextual e ações primárias.

### Classificação Atomic

Organism.

### Anatomia

```
┌───────────────────────────────────────────────────────────────────┐
│ [breadcrumb: Home › Notas]                                         │
│                                                                    │
│ ┌────────────────────────────┐      ┌────────────────────────────┐│
│ │ Título grande (h1) [?]     │      │  [Actions slot à direita]  ││
│ │ Subtítulo explicativo      │      │  ex: Disparar ingestão     ││
│ └────────────────────────────┘      └────────────────────────────┘│
└───────────────────────────────────────────────────────────────────┘
```

### API pública

```tsx
<PageHeader
    title="Panorama geral"
    subtitle="Monitoramento e reprocessamento de notas fiscais"
    breadcrumbs={[
        { label: 'Dashboard', href: '/' },
        { label: 'Notas' },
    ]}
    help={{
        title: 'Panorama de notas fiscais',
        content: 'Use esta tela para monitorar o status de processamento e reprocessar notas pendentes.',
        docsUrl: '/docs/notas',
    }}
    actions={
        <Button variant="primary" leftIcon={<Zap />}>
            Disparar ingestão
        </Button>
    }
/>
```

### Forma compound

```tsx
<PageHeader.Root>
    <PageHeader.Breadcrumb items={[...]} />
    <PageHeader.Row>
        <PageHeader.TitleBlock>
            <PageHeader.Title>Panorama geral</PageHeader.Title>
            <PageHeader.HelpTrigger content={...} />
            <PageHeader.Subtitle>Monitoramento e reprocessamento de notas fiscais</PageHeader.Subtitle>
        </PageHeader.TitleBlock>
        <PageHeader.Actions>
            <Button>Disparar ingestão</Button>
        </PageHeader.Actions>
    </PageHeader.Row>
</PageHeader.Root>
```

Use a forma pré-configurada salvo quando precisar:

- Renderizar actions em múltiplas linhas (botão + menu).
- Inserir elementos não padronizados entre título e actions.
- Customizar breadcrumbs com ícones específicos.

### Props

**`<PageHeader>`**

| Prop | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `title` | `string` | sim | Título da página (h1) |
| `subtitle` | `string` | não | Explicação em uma frase |
| `breadcrumbs` | `BreadcrumbItem[]` | não | Array de até 4 itens |
| `help` | `HelpContent` | não | Conteúdo do help popover |
| `actions` | `ReactNode` | não | Slot à direita para botões primários |
| `align` | `'left' \| 'center'` | não, default `'left'` | Alinhamento do title block |

**`BreadcrumbItem`**

```ts
{
    label: string;
    href?: string;      // se ausente, item renderiza como texto (atual)
    icon?: ReactNode;
}
```

**`HelpContent`**

```ts
{
    title: string;
    content: string | ReactNode;
    docsUrl?: string;
}
```

### Estados

- **default**: sem variação.
- **com help**: ícone `?` aparece ao lado do título, clicável.
- **sem actions**: actions slot omitido, title block ocupa 100% da linha.
- **com breadcrumbs**: breadcrumbs ocupam linha acima; sem eles, título começa no topo do bloco.

### Comportamento

- Título renderiza como `<h1>`. Apenas um PageHeader por página.
- Subtítulo renderiza como `<p>` com cor `text-muted`.
- Breadcrumbs:
  - Mais de 4 itens: colapsa os do meio com "…" e tooltip revela a lista.
  - Último item (atual) nunca é clicável; não tem `href`.
  - Separador: caracter "›" ou ícone `ChevronRight`.
- Help trigger:
  - Ícone `HelpCircle` 16×16px.
  - Click abre `HelpPopover` com título + content + botão "Ver documentação completa" se `docsUrl` fornecido.
- Actions slot:
  - Botão primário à direita (padrão).
  - Múltiplos botões: secundário à esquerda, primário à direita. Gap `gap-sm`.
  - Em telas estreitas, actions quebram para nova linha abaixo do título.

### Layout responsivo

- **Desktop (≥ laptop)**: título + actions na mesma linha flex.
- **Tablet/Mobile**: quebra em duas linhas. Actions vão abaixo do title block, alinhadas à esquerda. Breadcrumbs mantêm no topo.

### Acessibilidade

- Título renderiza como `<h1>` — obrigatório, apenas um por página.
- Breadcrumbs em `<nav aria-label="Breadcrumb">` com `<ol>`.
- Help trigger com `aria-label="Ajuda sobre esta página"`, `aria-expanded`, `aria-controls`.
- Hierarquia de foco segue ordem visual: breadcrumbs → título → help → actions.

### Exemplo completo

```tsx
<PageHeader
    breadcrumbs={[
        { label: 'Dashboard', href: '/' },
        { label: 'Notas fiscais' },
    ]}
    title="Panorama geral"
    subtitle="Monitoramento e reprocessamento de notas fiscais"
    help={{
        title: 'Como usar o panorama',
        content: (
            <>
                <p>Esta tela mostra todas as notas fiscais processadas no período selecionado.</p>
                <p>Clique em um KPI para filtrar a tabela pelo status correspondente.</p>
            </>
        ),
        docsUrl: '/docs/notas#panorama',
    }}
    actions={
        <>
            <Button variant="secondary" leftIcon={<Download />}>Exportar</Button>
            <Button variant="primary" leftIcon={<Zap />}>Disparar ingestão</Button>
        </>
    }
/>
```

### Do / Don't

**Do**

- Use título curto e específico. "Panorama geral" > "Tela principal".
- Use subtítulo para descrever o que a página permite fazer, não o que mostra.
- Coloque help quando a página introduz conceitos novos.
- Use actions para a ação primária da página (ex: "Disparar ingestão" na tela de notas).

**Don't**

- Não duplique título e breadcrumb do último nível. Se breadcrumb já diz "Notas", o título deve ser mais específico.
- Não coloque mais de 2 botões no actions — o terceiro deve ir para um menu `...` ou para dentro do conteúdo.
- Não use emojis ou caracteres decorativos no título.
- Não faça o subtítulo instruir ("Clique aqui para..."). Ele descreve, não orienta.

---

## GlobalFilterBar

### Propósito

Bar discreta que controla filtros globais que afetam todo o conteúdo da página abaixo (KPIs + tabela + gráficos). O caso mais comum é um `DateRangePicker` combinado com seletor de qual campo de data aplicar.

### Classificação Atomic

Organism.

### Anatomia

Card branco compacto, alinhado à direita do PageHeader ou abaixo dele em uma linha própria.

```
┌─────────────────────────────────────────────────────────────┐
│ 📅  Período | Data Emissão | 01/04/2026 – 19/04/2026  ✓ Aplicar │
└─────────────────────────────────────────────────────────────┘
```

Estrutura horizontal:
1. Ícone colorido (calendário) indicando o tipo do filtro.
2. Label fixa ("Período").
3. Seletor de campo de data (Select — ex: "Data Emissão", "Data de Salvamento", "Data de Processamento").
4. Display do range selecionado (clicável — abre DateRangePicker).
5. Botão "Aplicar" (texto + ícone check).

### API pública

```tsx
<GlobalFilterBar
    value={{ from: Date, to: Date, dateField: 'saved_date' }}
    onChange={setFilters}
    onApply={() => refetch()}
    dateFields={[
        { id: 'saved_date', label: 'Data Salva' },
        { id: 'processing_started_date', label: 'Data de Processamento' },
        { id: 'issue_date', label: 'Data de Emissão' },
    ]}
    presets={[
        { label: 'Hoje', range: () => ({ from: today(), to: today() }) },
        { label: 'Últimos 7 dias', range: () => ({ from: subDays(today(), 7), to: today() }) },
        { label: 'Últimos 30 dias', range: () => ({ from: subDays(today(), 30), to: today() }) },
        { label: 'Este mês', range: () => ({ from: startOfMonth(today()), to: today() }) },
    ]}
    applyMode="manual"
/>
```

### Props

| Prop | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `value` | `GlobalFilterValue` | sim | Estado controlado |
| `onChange` | `(value) => void` | sim | Dispara ao mudar seletor ou range |
| `onApply` | `() => void` | não | Callback quando botão "Aplicar" é clicado |
| `dateFields` | `DateFieldOption[]` | sim | Lista de campos de data disponíveis |
| `presets` | `Preset[]` | não | Atalhos no date range picker |
| `applyMode` | `'auto' \| 'manual'` | default `'manual'` | `auto` dispara onApply a cada mudança; `manual` exige botão |
| `icon` | `ReactNode` | default `<Calendar />` | Ícone à esquerda |
| `compact` | `boolean` | default `false` | Versão sem labels textuais |

**`GlobalFilterValue`**

```ts
{
    from: Date;
    to: Date;
    dateField: string;
}
```

### Estados

- **idle**: default, com valores atuais.
- **dirty**: valor do seletor mudou mas não foi aplicado. Botão "Aplicar" ganha destaque (cor primary). Ícone de check visível.
- **applied**: após click em Aplicar, botão volta para estado neutro.
- **loading**: quando `onApply` está em andamento, botão mostra spinner.

### Comportamento

- Display do range ("01/04/2026 – 19/04/2026") é clicável e abre popover com `DateRangePicker`.
- Presets aparecem como lista de links à esquerda do calendário no popover.
- Mudar o campo de data ou o range deixa o filtro em estado `dirty`.
- Em `applyMode="manual"`: mudança não dispara fetch; só após clicar "Aplicar".
- Em `applyMode="auto"`: cada mudança dispara `onApply` após debounce de 300ms.
- Valores vão para a URL como query string (ver `patterns.md`): `?from=2026-04-01&to=2026-04-19&dateField=saved_date`.

### Deep-linking

O estado da barra é refletido na URL. Ao carregar a página com query string, a bar inicializa com esses valores.

Conversão:
- `Date` → `YYYY-MM-DD` na URL (fuso local).
- Parâmetros: `from`, `to`, `dateField`.

### Acessibilidade

- Seletor de campo é um `<Select>` com `aria-label="Campo de data"`.
- Display do range é um `<button aria-label="Selecionar período" aria-expanded aria-controls>`.
- Botão "Aplicar" tem `aria-label="Aplicar filtros"`.
- Teclado: Tab navega entre campos, Enter aplica.

### Layout no PageHeader

A GlobalFilterBar acompanha o PageHeader no topo. Duas disposições possíveis:

**Disposição 1 — mesma linha (desktop padrão):**

```
┌──────────────────────────────────────────────────────────┐
│ Título grande       | [📅 Período | Data ... | Aplicar] │
│ Subtítulo           |                                    │
└──────────────────────────────────────────────────────────┘
```

O PageHeader empurra para a esquerda; o GlobalFilterBar vai à direita.

**Disposição 2 — linha própria (quando há muitos actions):**

```
┌──────────────────────────────────────────────────────────┐
│ Título    | [Ações: Exportar | Disparar ingestão]        │
│ Subtítulo |                                              │
├──────────────────────────────────────────────────────────┤
│ [📅 Período | Data Emissão | 01/04 – 19/04 | Aplicar]    │
└──────────────────────────────────────────────────────────┘
```

**Regra de escolha**: se cabe na linha do PageHeader sem quebrar, vai na linha (layout do print de referência). Se o PageHeader já tem múltiplos actions, vai em linha separada.

### Exemplo completo

```tsx
function NotasPage() {
    const [globalFilter, setGlobalFilter] = useUrlState('global', defaultGlobalFilter);
    const { data, refetch, isLoading } = useNotas(globalFilter);

    return (
        <DashboardLayout>
            <div className="flex items-start justify-between gap-lg">
                <PageHeader
                    title="Panorama geral"
                    subtitle="Monitoramento e reprocessamento de notas fiscais"
                />
                <GlobalFilterBar
                    value={globalFilter}
                    onChange={setGlobalFilter}
                    onApply={refetch}
                    dateFields={[
                        { id: 'issue_date', label: 'Data Emissão' },
                        { id: 'saved_date', label: 'Data Salva' },
                    ]}
                    applyMode="manual"
                />
            </div>

            <KPIGrid>...</KPIGrid>
            <DataTable.Client data={data?.rows} loading={isLoading} />
        </DashboardLayout>
    );
}
```

### Do / Don't

**Do**

- Inicialize com preset "Últimos 30 dias" por default (ou período que faça sentido para o negócio).
- Persista em URL, não em localStorage — filtros globais são compartilháveis.
- Use `applyMode="manual"` em páginas pesadas (tabela grande, múltiplos gráficos).
- Use `applyMode="auto"` em filtros leves (toggle de um switch).

**Don't**

- Não adicione mais de 2-3 campos na GlobalFilterBar. Filtros granulares vão no nível da tabela.
- Não use GlobalFilterBar para filtros que afetam só uma seção. Se é só da tabela, usa filtro de coluna.
- Não esconda a bar atrás de um botão "Filtros" — ela é persistente e visível.
- Não dispare refetch automaticamente quando o usuário digita/arrasta — espere `onApply` em `applyMode="manual"`.
