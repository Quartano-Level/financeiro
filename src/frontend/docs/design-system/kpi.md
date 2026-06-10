# KPICard e KPIGrid

Big numbers de fácil visualização. KPIs resumem o estado do negócio no período filtrado e servem como atalho para filtrar visualizações abaixo (ex: clicar no KPI "Pendentes" filtra a tabela por status `PENDING`).

## Propósito

- Apresentar a informação mais importante da página em escaneabilidade máxima.
- Permitir interação (clique filtra visualização abaixo).
- Comunicar tendência ou comparação com período anterior.
- Agrupar-se em grid responsivo.

## Classificação Atomic

`KPICard` — Molecule (compound). `KPIGrid` — Organism.

## Variantes

Cinco presets construídos sobre o mesmo compound base. Todos suportam `color`, `onClick`, `active`, `loading`, `tooltip`, `footer` slot.

| Variante | Uso | Elementos |
|---|---|---|
| `SimpleKPI` | KPI básico — label + valor | label + value + dot |
| `DeltaKPI` | Valor + delta em relação ao período anterior | label + value + delta (↑/↓ %) |
| `PercentageKPI` | Valor + percentual do total | label + value + "% do total" + barra de progresso |
| `TrendKPI` | Valor + mini gráfico de linha | label + value + sparkline |
| `IconKPI` | Valor + ícone grande | label + value + icon |

## Compound — KPICard.Root

```tsx
<KPICard.Root
    color="warning"
    active={filters.status === 'PENDING'}
    onClick={() => setFilters({ status: 'PENDING' })}
>
    <KPICard.Header>
        <KPICard.Dot color="warning" />
        <KPICard.Label>Pendentes</KPICard.Label>
        <KPICard.HelpTrigger content="Notas com erro de processamento" />
    </KPICard.Header>
    <KPICard.Value>295</KPICard.Value>
    <KPICard.Footer>
        <KPICard.Delta direction="down" value={-12} />
    </KPICard.Footer>
</KPICard.Root>
```

## Subcomponentes

| Subcomponente | Obrigatório | Descrição |
|---|---|---|
| `KPICard.Root` | sim | Container clicável com estados hover/active/loading |
| `KPICard.Header` | sim | Linha superior: dot/ícone + label + help |
| `KPICard.Dot` | não | Ponto colorido à esquerda do label |
| `KPICard.Icon` | não | Ícone grande à esquerda do valor |
| `KPICard.Label` | sim | Texto descritivo (ex: "Pendentes") |
| `KPICard.HelpTrigger` | não | Ícone `?` com popover explicativo |
| `KPICard.Value` | sim | Número grande ou string |
| `KPICard.Footer` | não | Informação secundária (delta, %, sparkline) |
| `KPICard.Delta` | não | Variação (↑/↓ com cor e valor) |
| `KPICard.Percentage` | não | "X% do total" + barra de progresso fininha |
| `KPICard.Sparkline` | não | Mini linha de tendência |

## Props — KPICard.Root

| Prop | Tipo | Default | Descrição |
|---|---|---|---|
| `color` | `'default' \| 'primary' \| 'success' \| 'warning' \| 'danger' \| 'info' \| string` | `'default'` | Cor do dot, borda ativa e acentos |
| `active` | `boolean` | `false` | Estado selecionado (borda destacada) |
| `onClick` | `() => void` | — | Click dispara ação (usualmente filtro) |
| `loading` | `boolean` | `false` | Mostra skeleton |
| `disabled` | `boolean` | `false` | Desabilita interação |
| `tooltip` | `string` | — | Tooltip no card inteiro |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Tamanho do valor tipográfico |

## Presets

### SimpleKPI

```tsx
<SimpleKPI
    label="Todas as notas"
    value={306}
    color="primary"
    active={!filters.status}
    onClick={() => setFilters({ status: undefined })}
/>
```

**API:**

| Prop | Tipo | Descrição |
|---|---|---|
| `label` | `string` | Label |
| `value` | `number \| string` | Valor |
| `color` | color token | Cor do dot |
| `active`, `onClick`, `loading`, `tooltip` | — | herda de KPICard.Root |

### DeltaKPI

```tsx
<DeltaKPI
    label="Processadas hoje"
    value={47}
    previousValue={52}
    deltaFormat="percentage"     // "absolute" | "percentage"
    deltaPeriodLabel="vs. ontem"
/>
```

**Comportamento:**

- Calcula delta automaticamente: `((value - previousValue) / previousValue) * 100`.
- Formato `"absolute"`: `+5` / `-5`; `"percentage"`: `+9,6%` / `-9,6%`.
- Cor do delta: verde se positivo, vermelho se negativo (reversível via `inverse: true` para métricas onde menor é melhor, ex: "Erros").
- Ícone: `ArrowUp` / `ArrowDown` / `Minus` (neutro quando delta = 0).

### PercentageKPI

```tsx
<PercentageKPI
    label="Pendentes"
    value={295}
    total={306}
    showBar={true}
/>
```

**Comportamento:**

- Exibe o valor principal em destaque + linha abaixo "X% do total".
- Barra de progresso fina (2–4px) no rodapé do card mostra a proporção.
- Cor da barra herda do `color` do card.

### TrendKPI

```tsx
<TrendKPI
    label="Processamento semanal"
    value={324}
    trend={[12, 18, 22, 30, 28, 34, 42]}
    trendLabel="últimos 7 dias"
/>
```

**Comportamento:**

- Sparkline renderizado com `recharts` ou implementação SVG simples (~40px altura).
- Linha acompanha a cor do card.
- Último ponto destacado (círculo pequeno).
- Tooltip no hover do sparkline mostra valores por índice.

### IconKPI

```tsx
<IconKPI
    icon={<FileText />}
    label="Total de notas"
    value={1234}
    color="primary"
/>
```

**Comportamento:**

- Ícone grande (40×40px) à esquerda do valor.
- Valor e label à direita, alinhados verticalmente.
- Hover destaca o ícone sutilmente.

## Estados

| Estado | Visual |
|---|---|
| `idle` | Card com background `surface`, border `border`, shadow `shadow-card` |
| `hover` | Border ligeiramente mais forte, shadow `shadow-md`, cursor `pointer` se clicável |
| `active` | Border 2px `color` + background `color-subtle`, label em `color` |
| `loading` | Skeleton shimmer no lugar de label, value e footer |
| `disabled` | opacity 50%, cursor `not-allowed`, sem hover |

## KPIGrid

### Propósito

Organizar múltiplos KPIs em grid responsivo com gap consistente.

### API

```tsx
<KPIGrid columns={{ sm: 1, md: 2, lg: 4, xl: 5 }} gap="md">
    <SimpleKPI label="Todas" value={306} />
    <SimpleKPI label="Finalizadas" value={11} color="success" />
    <SimpleKPI label="Processando" value={14} color="warning" />
    <SimpleKPI label="Pendentes" value={295} color="danger" />
    <SimpleKPI label="Escrituradas" value={8} color="info" />
</KPIGrid>
```

### Props

| Prop | Tipo | Default | Descrição |
|---|---|---|---|
| `columns` | `ColumnsConfig` | `{ sm: 1, md: 2, lg: 4 }` | Número de colunas por breakpoint |
| `gap` | `'sm' \| 'md' \| 'lg'` | `'md'` | Espaçamento (token) |
| `children` | `ReactNode` | — | KPIs |

**`ColumnsConfig`:**

```ts
{
    sm?: number;    // < tablet
    md?: number;    // tablet+
    lg?: number;    // desktop+
    xl?: number;    // wide+
}
```

### Comportamento

- CSS Grid com `grid-template-columns: repeat(N, minmax(0, 1fr))`.
- Itens que excedem a linha quebram para baixo (nunca scroll horizontal).
- Gap usa token: `sm` = 8px, `md` = 16px, `lg` = 24px.

## Interação KPI → Tabela

A interação segue o padrão **multi-component action via página** (ver `patterns.md`):

```tsx
function NotasPage() {
    const [statusFilter, setStatusFilter] = useState<NfStatus | undefined>();

    return (
        <>
            <KPIGrid>
                <SimpleKPI
                    label="Todas"
                    value={data?.total}
                    active={statusFilter === undefined}
                    onClick={() => setStatusFilter(undefined)}
                />
                <SimpleKPI
                    label="Pendentes"
                    value={data?.pending}
                    color="danger"
                    active={statusFilter === 'PENDING'}
                    onClick={() => setStatusFilter('PENDING')}
                />
                <SimpleKPI
                    label="Finalizadas"
                    value={data?.finalized}
                    color="success"
                    active={statusFilter === 'FINALIZADA'}
                    onClick={() => setStatusFilter('FINALIZADA')}
                />
            </KPIGrid>

            <DataTable.Client
                data={data?.rows.filter(nf => !statusFilter || nf.status === statusFilter)}
                columns={columns}
            />
        </>
    );
}
```

A página é o maestro. O KPI expõe `onClick`, a tabela recebe `data` já filtrado. Nenhum dos componentes conhece o outro.

## Acessibilidade

- Card clicável vira `<button>` (se tiver `onClick`), ou `<div>` (se não tiver).
- `aria-pressed={active}` quando atua como toggle.
- `aria-label` descritivo: `"Filtrar por pendentes: 295 notas"`.
- Delta tem `aria-label` explicando ("queda de 12%", "aumento de 5 em relação a ontem").
- Focus ring visível ao navegar por teclado.
- Loading state tem `aria-busy="true"` e anúncio via `aria-live`.

## Responsividade

- Grid adapta número de colunas por breakpoint.
- Em mobile: 1 coluna, cards com largura total, padding reduzido.
- Valor tipográfico reduz `text-4xl` → `text-3xl` em mobile.

## Do / Don't

**Do**

- Use `SimpleKPI` quando não há informação secundária relevante.
- Escolha a variante pela **informação que agrega**, não por variedade visual.
- Use cor consistente com o significado: `success` para positivo, `danger` para pendências.
- Adicione `tooltip` ou `HelpTrigger` para conceitos que o usuário pode desconhecer.
- Exponha o valor `active` espelhando o estado de filtro atual.

**Don't**

- Não use KPIs para mostrar detalhes — eles resumem. Detalhes vão em tabelas e gráficos.
- Não coloque mais de 6 KPIs na mesma linha. Se precisa, reorganize em abas ou páginas.
- Não use cor decorativa sem significado (ex: rotação arco-íris).
- Não deixe `onClick` desabilitado sem `tooltip` explicando por quê.
- Não altere o valor ou delta dinamicamente enquanto o usuário lê — respeite o momento da leitura.
- Não use `TrendKPI` em telas com muito conteúdo — sparkline exige foco para ser lido.
