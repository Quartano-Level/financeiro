# Feedback — Tooltips, Help e Estados de Botão

Padrões de micro-feedback: explicações contextuais (tooltip, help) e estados interativos (loading, disabled, read-only). Toasts e modais têm specs próprios (`notification.md`, `modal.md`).

## Três padrões de explicação

Três componentes com propósitos distintos. Usar o errado prejudica a UX.

| Componente | Trigger | Conteúdo | Uso |
|---|---|---|---|
| `Tooltip` | hover/focus | texto curto (≤80 chars) | Nomear UI |
| `HelpTooltip` | hover/focus | título + descrição curta | Sidebar items, labels estruturadas |
| `HelpPopover` | click | título + conteúdo rico + link | Explicar conceito de negócio |

## Tooltip

### Propósito

Revelar o nome ou propósito de um elemento pequeno/icônico. Texto curto. Aparece em hover com delay.

### Classificação Atomic

Molecule (compound sobre Radix Tooltip).

### API

```tsx
<Tooltip content="Atualizar dados">
    <IconButton icon={<RefreshCw />} onClick={refresh} />
</Tooltip>
```

### Compound

```tsx
<Tooltip.Root delayDuration={300}>
    <Tooltip.Trigger asChild>
        <IconButton icon={<RefreshCw />} />
    </Tooltip.Trigger>
    <Tooltip.Content side="bottom">
        Atualizar dados
    </Tooltip.Content>
</Tooltip.Root>
```

### Props

| Prop | Tipo | Default | Descrição |
|---|---|---|---|
| `content` | `string \| ReactNode` | — | Texto ou nó curto |
| `side` | `'top' \| 'right' \| 'bottom' \| 'left'` | `'top'` | Posição |
| `align` | `'start' \| 'center' \| 'end'` | `'center'` | Alinhamento |
| `delayDuration` | `number` | `300` | ms antes de aparecer |
| `disabled` | `boolean` | `false` | Desabilita o tooltip |

### Comportamento

- Hover **ou focus** (teclado) dispara.
- Delay default 300ms; encadeamentos próximos reduzem delay (Radix faz isso automaticamente).
- Some em mouseleave ou blur.
- Nunca contém elementos interativos (links, botões) — se precisar, use `HelpPopover`.

### Visual

- Background `secondary` (inverted), texto `text-inverse`.
- Border radius `radius-sm`.
- Padding `px-2 py-1`.
- `text-sm`.
- Seta opcional apontando para o trigger.
- Max-width 240px; wrap.
- `z-index: var(--z-tooltip)`.

### Acessibilidade

- `role="tooltip"`.
- Associa ao trigger via `aria-describedby`.
- Navegação por teclado: foco no trigger revela; blur esconde.

## HelpTooltip

### Propósito

Versão estruturada do Tooltip: título em destaque + descrição. Para elementos de navegação e labels que precisam de contexto levemente mais rico.

### API

```tsx
<HelpTooltip
    title="Notas fiscais"
    description="Processamento e reprocessamento de NFs do período"
>
    <NavItem label="Notas" icon={<FileText />} />
</HelpTooltip>
```

### Visual

- Mesma caixa visual do Tooltip, mas com dois blocos:
    - Título em `font-semibold`.
    - Descrição em `text-xs` abaixo.
- Max-width 280px.

### Quando usar vs Tooltip simples

- **Tooltip**: "Salvar", "Atualizar", "Fechar" — verbos e nomes.
- **HelpTooltip**: "Notas fiscais · Processamento e reprocessamento" — label + contexto.

## HelpPopover

### Propósito

Conteúdo explicativo rico, com texto multi-linha, listas, link para documentação. Abre por click (não hover) porque o usuário precisa poder interagir com o conteúdo.

### Classificação Atomic

Molecule.

### API

```tsx
<HelpPopover
    title="O que significa status PENDING?"
    content={
        <>
            <p>Uma nota fica em status <strong>PENDING</strong> quando o processamento
            no Conexos falha por erro de validação ou indisponibilidade.</p>
            <ul>
                <li>Clique em "Reprocessar" para tentar novamente.</li>
                <li>Verifique os logs na linha expandida.</li>
            </ul>
        </>
    }
    docsUrl="/docs/status-pending"
>
    <IconButton icon={<HelpCircle />} variant="ghost" size="sm" />
</HelpPopover>
```

### Props

| Prop | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `title` | `string` | sim | Título no topo |
| `content` | `ReactNode` | sim | Corpo rico |
| `docsUrl` | `string` | não | Link "Ver documentação completa" no footer |
| `docsLabel` | `string` | não, default `"Ver documentação completa"` | — |
| `side` | side | `'bottom'` | — |
| `children` | `ReactNode` | sim | Trigger |

### Comportamento

- Abre por click.
- Fecha por click fora, ESC ou botão `X` no canto superior.
- Max-width 400px.
- `z-index: var(--z-popover)`.
- Foco vai para primeiro elemento focável ao abrir.

### Visual

- Background `surface-raised`, border `border`, shadow `shadow-popover`.
- Border radius `radius-md`.
- Padding `p-4`.
- Título em `text-base font-semibold`.
- Conteúdo em `text-sm`.
- Link de docs em `text-link`.

## Estados de Botão

Todo botão assíncrono segue o mesmo padrão de feedback.

### Estados visuais

| Estado | Visual | Comportamento |
|---|---|---|
| `idle` | Cor base | Click dispara ação |
| `hover` | Background ligeiramente mais escuro/claro | Cursor pointer |
| `active` (pressing) | Background ainda mais escuro | Feedback de click |
| `focus` | Ring visível (`shadow-focus`) | Acessível via teclado |
| `loading` | Spinner à esquerda do texto + disabled | Ação em andamento; não pode clicar novamente |
| `disabled` | Opacity 50%, sem hover | Não clicável; tooltip explica |
| `success` (efêmero) | Não há — use toast | — |

### Loading

```tsx
<Button
    variant="primary"
    loading={isSubmitting}
    onClick={handleSubmit}
>
    Salvar
</Button>
```

- Spinner renderizado à esquerda do texto.
- **Texto mantido** — NÃO trocar para "Carregando..." (ruído desnecessário).
- Botão recebe `aria-busy="true"`.
- Pointer events desabilitados.
- Visualmente disabled mas `disabled` em HTML não setado (permite foco para leitor de tela anunciar `aria-busy`).

### Disabled

```tsx
<Button
    variant="primary"
    disabled={!canSave}
    tooltip={!canSave ? 'Preencha todos os campos obrigatórios' : undefined}
>
    Salvar
</Button>
```

**Regras:**

- Todo botão `disabled` **exige explicação** — via tooltip OU via mensagem visível próxima.
- `cursor: not-allowed`.
- Opacidade 50%.
- Não recebe focus.
- `aria-disabled="true"`.

**Nunca use disabled para "permissão"** — esconda o botão ou explique por que está desabilitado. "Por que esse botão está cinza?" é uma pergunta que o usuário nunca deveria precisar fazer.

### Read-only (só inputs)

Diferente de `disabled`:

- Valor visível e selecionável.
- Cursor `text`.
- Border ainda visível, sem foco.
- Sem opacidade reduzida.
- Semântica: "este valor existe mas não pode ser editado agora".

```tsx
<TextInput value={user.id} readOnly />
```

## Variants de Button (resumo)

| Variant | Uso | Visual |
|---|---|---|
| `primary` | Ação principal | Background `primary`, texto `primary-foreground` |
| `secondary` | Ação secundária | Background `surface`, border `border-strong`, texto `text-primary` |
| `ghost` | Ação sutil (ícones, links) | Transparent, hover com `surface-sunken` |
| `danger` | Ação destrutiva | Background `danger`, texto `danger-foreground` |
| `link` | Visualmente link | Transparent, texto `text-link`, underline on hover |

### Tamanhos

| Size | Altura | Padding |
|---|---|---|
| `xs` | 24px | px-2 |
| `sm` | 32px | px-3 |
| `md` (default) | 40px | px-4 |
| `lg` | 48px | px-5 |

### Ícones

```tsx
<Button leftIcon={<Save />}>Salvar</Button>
<Button rightIcon={<ArrowRight />}>Próximo</Button>
<IconButton icon={<Trash />} aria-label="Excluir" variant="danger" />
```

- `leftIcon` / `rightIcon` como props; spacing automático.
- `IconButton` é atom dedicado (quadrado, sem texto, exige `aria-label`).

## CopyButton e feedback de cópia

Molecule especializada:

```tsx
<CopyButton value="12.345.678/0001-00" />
```

### Estados

- `idle`: ícone `Copy`.
- `success` (1s após click): ícone `Check`, cor `success`.
- Toast `"Copiado"` opcional (default on).

## Do / Don't

**Do**

- Use tooltips em **todos** os `IconButton` — sem `aria-label` visível, o tooltip é a única pista.
- Use `HelpPopover` quando o conteúdo explicativo tem mais de uma frase ou inclui link/lista.
- Mantenha o texto do botão em loading; não troque para "Carregando...".
- Sempre justifique um disabled — via tooltip ou contexto visível.
- Distinga `disabled` vs `readonly` corretamente.

**Don't**

- Não use tooltip para esconder informação essencial (se é essencial, deve estar visível).
- Não use Tooltip em elementos sem trigger de hover/focus (não aparecem para teclado).
- Não anine Popovers dentro de Tooltips — comportamento imprevisível.
- Não troque texto + ícone do botão entre estados (idle → loading) — só adicione spinner.
- Não use cor vermelha para disabled; disabled é neutro.
- Não dependa apenas de opacidade para indicar disabled — combine com cursor e `aria-disabled`.
