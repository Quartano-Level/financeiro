# Skeleton

Padrão de carregamento visual. Todo componente que tem estado `loading` expõe um skeleton correspondente com shape equivalente.

## Princípios

- **Skeleton reflete o shape final** — mesma quantidade de linhas, mesmas larguras aproximadas. Usuário antecipa o que vai aparecer.
- **Shimmer animation** comunica atividade; respeita `prefers-reduced-motion`.
- **Obrigatório**: todo componente com `loading` tem `.Skeleton` correspondente no mesmo arquivo.
- **Não use skeleton para operações rápidas** (< 200ms). Flash de skeleton é pior que nada.

## Classificação Atomic

Atoms básicos (`Skeleton.Line`, `.Block`, `.Circle`) e molecules estruturadas (`Skeleton.KPICard`, `.TableRow`, etc).

## Shapes primitivos (atoms)

### Skeleton.Line

Linha horizontal simples. Uso: texto.

```tsx
<Skeleton.Line width="80%" height="16px" />
```

| Prop | Tipo | Default | Descrição |
|---|---|---|---|
| `width` | `string \| number` | `100%` | largura |
| `height` | `string \| number` | `1em` | altura |
| `rounded` | `'sm' \| 'md' \| 'full'` | `'sm'` | radius |

### Skeleton.Block

Retângulo genérico. Uso: imagens, cards, thumbnails.

```tsx
<Skeleton.Block width="100%" height="200px" rounded="md" />
```

### Skeleton.Circle

Círculo. Uso: avatar, ícones, dots.

```tsx
<Skeleton.Circle size="40px" />
```

### Skeleton.Text

Múltiplas linhas simulando parágrafo. Última linha mais curta.

```tsx
<Skeleton.Text lines={3} />
```

| Prop | Tipo | Default | Descrição |
|---|---|---|---|
| `lines` | `number` | `3` | Número de linhas |
| `lastLineWidth` | `string` | `60%` | Largura da última |
| `lineHeight` | `string` | `16px` | Altura de cada linha |
| `gap` | token | `xs` | Espaço entre linhas |

## Shapes estruturados (molecules)

### Skeleton.KPICard

```tsx
<Skeleton.KPICard variant="simple" />
```

Shape:
- Card com padding equivalente ao `KPICard`.
- Dot à esquerda (`Circle` pequeno).
- Label (Line 40%).
- Value (Line 60%, altura `text-4xl`).
- Footer opcional (Line 30%).

| Prop | Tipo | Default | Descrição |
|---|---|---|---|
| `variant` | `'simple' \| 'delta' \| 'percentage' \| 'trend' \| 'icon'` | `'simple'` | Deriva shape do KPI |

### Skeleton.TableRow

```tsx
<Skeleton.TableRow columns={5} />
```

Renderiza uma `<tr>` com N `<td>`, cada um contendo uma `Skeleton.Line` de largura aleatória entre 40–90%.

### Skeleton.Table

```tsx
<Skeleton.Table rows={7} columns={5} />
```

Shape completo: thead com labels skeleton + N rows.

| Prop | Tipo | Default | Descrição |
|---|---|---|---|
| `rows` | `number` | `7` | Quantidade de linhas |
| `columns` | `number` | — | Quantidade de colunas |

### Skeleton.Form

```tsx
<Skeleton.Form fields={4} />
```

Shape: N FormFields (label + input + espaço para error).

| Prop | Tipo | Default | Descrição |
|---|---|---|---|
| `fields` | `number` | `4` | Quantidade de campos |
| `withSubmit` | `boolean` | `true` | Inclui botão submit skeleton |

### Skeleton.Sidebar

Shape do sidebar inteiro: logo + nav items + footer.

```tsx
<Skeleton.Sidebar itemCount={5} />
```

### Skeleton.PageHeader

```tsx
<Skeleton.PageHeader withSubtitle withActions />
```

### Skeleton.List

```tsx
<Skeleton.List items={5} itemHeight="60px" />
```

Lista vertical de blocos. Uso: listas genéricas, notificações em carregamento, histórico.

## Animação — shimmer + pulse base

O skeleton usa **duas animações combinadas**:

- **`shimmer`** — gradiente que percorre horizontalmente. Dá sensação de atividade direcional. Duração em `--shimmer-duration` (padrão 1.5s).
- **`pulse`** — oscilação sutil de opacidade na cor de fundo. Serve de base (inclusive como fallback estático quando shimmer é removido por `prefers-reduced-motion`). Tokens: `--pulse-duration` (1.6s) e `--pulse-easing` — ver [tokens.md §Motion](./tokens.md#motion-tokens).

O mesmo `pulse` é **reutilizado fora do skeleton** para indicadores discretos de "vivo" (ex.: dot sinalizando polling ativo no toolbar de uma tabela — ver [patterns.md §8.1](./patterns.md#81-polling--atualização-em-segundo-plano)). Centralizar a animação no token garante que qualquer ajuste de ritmo valha para todos os lugares.

### Shimmer

Gradiente animado da esquerda para a direita. Duração definida em `--shimmer-duration` (1.5s padrão).

```css
@keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}

.skeleton-base {
    position: relative;
    overflow: hidden;
    background-color: var(--color-surface-sunken);
}

.skeleton-base::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(255, 255, 255, 0.4) 50%,
        transparent 100%
    );
    animation: shimmer var(--shimmer-duration) ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
    .skeleton-base::after {
        animation: none;
    }
    .skeleton-base {
        background-color: var(--color-surface-sunken);
        /* fallback sutil — apenas cor, sem animação */
    }
}
```

### Pulse (base + dots)

```css
.skeleton-base,
.indicator-dot--pulsing {
    animation: pulse var(--pulse-duration) var(--pulse-easing) infinite;
}

@media (prefers-reduced-motion: reduce) {
    .skeleton-base,
    .indicator-dot--pulsing {
        animation: none;
        opacity: var(--pulse-opacity-to); /* fallback estático: mantém a diferença visual */
    }
}
```

O keyframe `pulse` vive em `tokens.md` para ser compartilhado entre skeleton base e indicadores. Componentes consumidores usam a classe ou o token diretamente — não redefinem o keyframe.

## Regra de ouro

> **Todo componente do DS com estado `loading` expõe `<Component.Skeleton />` correspondente, no mesmo arquivo.**

Exemplo:

```tsx
// DataTable.tsx
export function DataTable(...) { ... }
DataTable.Skeleton = DataTableSkeleton;

// ou
export const DataTable = { ... };
export const DataTableSkeleton = ...;
```

Uso:

```tsx
{loading ? <DataTable.Skeleton rows={10} columns={8} /> : <DataTable data={data} />}
```

**Por quê**: garante que a transição loading → loaded é visualmente fluida, sem "pulo" de layout. O skeleton é projetado junto com o componente, não depois.

## Padrões de uso

### Replacement é o padrão

Skeleton **substitui** o conteúdo enquanto carrega — e apenas no **primeiro carregamento**, quando ainda não há dados a preservar.

```tsx
<DataTable.Client loading={isLoading && !data} />
```

### Não use skeleton para refresh / polling

Revalidação de dados com dados já visíveis **não** usa skeleton. A regra é simples: **se já há dados na tela, eles não somem**. A UI atualiza apenas quando o novo payload chega com sucesso.

Isso vale para:

- Polling em tempo real (ver [patterns.md §8.1](./patterns.md#81-polling--atualização-em-segundo-plano)).
- Refresh manual (botão de atualizar na toolbar).
- Refetch após mudança de filtro que apenas reordena/filtra dados já carregados.

Para esses casos, o sinal de frescor é dado pelo `lastUpdatedAt` na toolbar e/ou por um indicador discreto (ex.: `dot-pulse`). Nada de overlay, backdrop ou spinner gigante sobre os dados.

**Exceção**: quando a mudança de filtro força **nova consulta com resultado potencialmente completamente diferente** (ex.: trocar de período anual), trate como primeiro carregamento — pode usar skeleton.

### Skeleton parcial

Nem tudo precisa ser skeleton. Em página com múltiplas seções, só as seções em carregamento usam skeleton; as já carregadas continuam normais.

```tsx
<PageHeader title="Notas" />
{isLoadingKPIs ? <KPIGrid.Skeleton /> : <KPIGrid>...</KPIGrid>}
{isLoadingTable ? <DataTable.Skeleton rows={10} /> : <DataTable data={data} />}
```

### Delay mínimo

Para evitar flash em requests rápidos:

```tsx
const isShowingSkeleton = useDelayedLoading(isLoading, { minDuration: 500, delay: 200 });
```

Lógica: só mostra skeleton se loading ultrapassa 200ms; uma vez mostrado, mantém por no mínimo 500ms para evitar flicker.

## Acessibilidade

- Container skeleton tem `role="status"` e `aria-busy="true"`.
- `aria-label="Carregando"` ou `aria-label="Carregando notas fiscais"` (contexto específico).
- Conteúdo do skeleton é `aria-hidden="true"` (é decorativo).
- Quando o loading termina, conteúdo real substitui; screen reader anuncia via live region se configurado.
- `prefers-reduced-motion` desliga animação (obrigatório).

## Exemplo completo

```tsx
function NotasPage() {
    const { data, isLoading } = useNotas();

    return (
        <DashboardLayout>
            <PageHeader title="Panorama geral" subtitle="..." />

            {isLoading && !data ? (
                <>
                    <KPIGrid.Skeleton count={5} />
                    <DataTable.Skeleton rows={10} columns={8} />
                </>
            ) : (
                <>
                    <KPIGrid>{kpis.map(kpi => <SimpleKPI {...kpi} />)}</KPIGrid>
                    <DataTable.Client
                        data={data.rows}
                        loading={false}   // dados já carregados; refresh não usa skeleton
                    />
                </>
            )}
        </DashboardLayout>
    );
}
```

## Do / Don't

**Do**

- Projete skeleton junto com o componente. Se precisa implementá-lo depois, o componente não está completo.
- Use larguras variadas em lines de skeleton (ex: 90%, 70%, 60%) para parecer natural.
- Em refresh/polling, **preserve os dados visíveis** e atualize só no sucesso — ver [patterns.md §8.1](./patterns.md#81-polling--atualização-em-segundo-plano).
- Teste em `prefers-reduced-motion: reduce` — o fallback deve ser visível (cor) sem animação.

**Don't**

- Não use skeleton para operações < 200ms — é pior que nada.
- Não use spinner genérico como substituto de skeleton estruturado.
- Não use skeleton em ação do usuário (ex: click em botão) — use loading state do botão.
- Não deixe skeleton "animar para sempre" — se a requisição demora muito, mostre mensagem de erro ou retry.
- Não use skeleton em elementos que sempre aparecem (ex: logo, nav items estáticos).
