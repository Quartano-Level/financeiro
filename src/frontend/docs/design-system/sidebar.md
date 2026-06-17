# Sidebar

Navegação principal persistente à esquerda da aplicação. Suporta até dois níveis, colapsa horizontalmente, mostra badges de contagem, e é substituída por BottomNav em mobile.

## Propósito

Agrupar e fornecer acesso rápido às seções principais da aplicação. Indicar visualmente a seção atual. Permitir identificação de itens com pendências via badges.

## Classificação Atomic

Organism. Usa `NavItem` (molecule) como bloco de construção.

## Anatomia

```
┌──────────────┐
│ [Logo pequeno]
│ ──────────── │
│                │
│ 📄 Notas    5  │  ← NavItem com ícone, label, badge
│ 📊 Análise     │
│ ⏱ Processamentos │  (desabilitado; dim 50%)
│    └ Detalhes │  ← sub-item (nível 2)
│    └ Arquivo  │
│ ⚙ Config.     │
│                │
│ ──────────── │
│ 🔔 Notificações│  ← NotificationCenter (footer, acima do logout)
│ ──────────── │
│ [→] Sair      │  ← Logout
└──────────────┘
```

## API pública

```tsx
<Sidebar
    items={[
        {
            id: 'notas',
            label: 'Notas',
            icon: <FileText />,
            href: '/notas',
            badge: { count: 5, variant: 'warning' },
            tooltip: {
                title: 'Notas fiscais',
                description: 'Gerencie o processamento e reprocessamento de notas fiscais',
            },
        },
        {
            id: 'historico',
            label: 'Histórico',
            icon: <Clock />,
            children: [
                { id: 'historico-detalhes', label: 'Detalhes', href: '/historico' },
                { id: 'historico-arquivo', label: 'Arquivo', href: '/historico/arquivo' },
            ],
        },
        {
            id: 'config',
            label: 'Configurações',
            icon: <Settings />,
            href: '/configuracoes',
            disabled: false,
        },
    ]}
    activeItemId="notas"
    collapsed={false}
    onCollapsedChange={setCollapsed}
    footer={<SidebarFooter>{logoutButton}</SidebarFooter>}
/>
```

## Forma compound

```tsx
<Sidebar.Root collapsed={collapsed}>
    <Sidebar.Header>
        <Sidebar.Logo src="/logo.svg" />
    </Sidebar.Header>
    <Sidebar.Nav>
        {navItems.map(item => (
            <Sidebar.Item key={item.id} {...item} />
        ))}
    </Sidebar.Nav>
    <Sidebar.Footer>
        <Sidebar.CollapseToggle />
        {logoutButton}
    </Sidebar.Footer>
</Sidebar.Root>
```

## Props

**`<Sidebar>`**

| Prop | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `items` | `SidebarItem[]` | sim | Lista de itens de navegação |
| `activeItemId` | `string` | não | ID do item ativo; se omitido, deriva da URL |
| `collapsed` | `boolean` | não | Controlado externamente |
| `onCollapsedChange` | `(value: boolean) => void` | não | Controlado externamente |
| `defaultCollapsed` | `boolean` | não, default `false` | Valor inicial se uncontrolled |
| `footer` | `ReactNode` | não | Conteúdo do footer (ex: logout) |
| `logo` | `ReactNode` | não | Logo customizado |
| `persistKey` | `string` | não, default `'ds:sidebar:collapsed:v1'` | Chave de localStorage |

**`SidebarItem`**

```ts
{
    id: string;
    label: string;
    icon?: ReactNode;
    href?: string;
    onClick?: () => void;
    badge?: { count: number; variant?: 'default' | 'warning' | 'danger' | 'success' };
    disabled?: boolean;
    tooltip?: { title: string; description: string };
    children?: SidebarItem[];  // nível 2 apenas
}
```

## Estados

- **idle**: default, sem hover.
- **hover**: background sutil (`surface-sunken` ou `primary-subtle` com 50% opacity).
- **active**: item da página atual. Background `primary-subtle`, borda/indicador à esquerda `primary`, ícone + label em `primary`.
- **disabled**: 50% opacity, `cursor: not-allowed`. Tooltip explica por quê.
- **expanded** (item com children): mostra sub-items indentados.
- **collapsed sidebar**: só ícones visíveis; hover no item mostra tooltip com label + sub-items em popover lateral.

## Comportamento

### Collapse / Expand

- Toggle na base do sidebar (botão com ícone `ChevronLeft` / `ChevronRight`).
- Estado persistido em `ds:sidebar:collapsed:v1` (versionado, ver `patterns.md`).
- Auto-colapsa em `< tablet` (640px).
- Transição `duration-normal` (`200ms`) com `ease-in-out`.
- Largura expandido: `w-56` (224px). Colapsado: `w-16` (64px).

### Navegação

- Click em item com `href` dispara navegação (via `Link` do Next.js).
- Click em item com `onClick` dispara o callback.
- Click em item com `children` expande/colapsa a lista de sub-items.
- Item ativo é determinado por `activeItemId` (se fornecido) ou pela URL atual (comparação com `href`).

### Sub-items (nível 2)

- Apenas um nível de profundidade. Não aninhar mais.
- Quando sidebar está **expandido**: sub-items aparecem indentados abaixo do pai após clique.
- Quando sidebar está **colapsado**: hover no pai abre popover lateral com os sub-items horizontalmente agrupados.
- Se o pai tem `href`, clicar navega; o ícone de expandir é separado. Se não tem `href`, o próprio clique expande.

### Tooltip

- Quando sidebar **colapsado**: hover em qualquer item → tooltip com `title` + `description`.
- Quando sidebar **expandido**: tooltip aparece apenas em hover com delay longo (1s), para não atrapalhar. Mostra apenas `description` (título já visível).

### Badges

- Aparecem à direita do label (sidebar expandido) ou no canto superior-direito do ícone (sidebar colapsado).
- Números ≥ 100 mostram "99+".
- Variantes: `default` (neutro), `warning` (amarelo), `danger` (vermelho), `success` (verde).
- Badge 0 não renderiza.

## Acessibilidade

- Wrapper com `role="navigation"` + `aria-label="Navegação principal"`.
- Lista com `<ul role="list">`; itens com `<li>`.
- Itens ativos com `aria-current="page"`.
- Sub-items: item pai tem `aria-expanded` e `aria-controls` apontando para o `<ul>` aninhado.
- Toggle colapsar: `aria-expanded` refletindo estado atual, `aria-label="Colapsar navegação"` / `"Expandir navegação"`.
- Navegação por teclado: Tab entre itens, Enter para ativar, Arrow keys para navegar entre sub-items.
- Focus ring visível em todos os itens.

## Responsividade

### Desktop (≥ laptop)

Sidebar fixo à esquerda, colapsável.

### Tablet (640–768px)

Sidebar inicia colapsado. Expande via toggle.

### Mobile (< 640px)

Sidebar vira `BottomNav` — barra horizontal fixa no rodapé com os itens principais.

Se houver mais de 5 itens, mostra os 4 primeiros + "Mais" que abre drawer com os demais.

## SettingsSidebar (secondary nav)

Variação compacta do `Sidebar` para navegação **interna** de áreas com sub-seções — tipicamente usada pelo `SettingsLayout` (ver [layout.md](./layout.md)). Não substitui o `Sidebar` global; convive com ele.

### Anatomia

```
┌────────────────┐
│ Conta           │  ← NavItem sem ícone obrigatório
│ Segurança       │
│ Usuários        │
│ ──────────────  │  (divider opcional entre grupos)
│ Faturamento     │
└────────────────┘
```

- **Sem logo**, **sem collapse toggle**, **sem badges de contagem por padrão** (as seções são curtas e estáveis; colapsar não agrega valor).
- Ícone é **opcional** — o texto dá contexto suficiente, e a sidebar global à esquerda já ocupa o canal visual de "navegação por ícone".

### API

```tsx
<SettingsSidebar
    sections={[
        { id: 'conta', label: 'Conta', href: '/configuracoes/conta' },
        { id: 'seguranca', label: 'Segurança', href: '/configuracoes/seguranca' },
        { id: 'usuarios', label: 'Usuários', href: '/configuracoes/usuarios' },
    ]}
    activeSectionId="seguranca"
/>
```

### Props

| Prop | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `sections` | `SettingsSection[]` | sim | Lista ordenada de seções |
| `activeSectionId` | `string` | não | Se omitido, deriva da URL atual |
| `onSectionChange` | `(id: string) => void` | não | Disparado ao clicar (além da navegação) |
| `groups` | `SettingsGroup[]` | não | Agrupamento opcional com divider e título |

```ts
interface SettingsSection {
    id: string;
    label: string;
    href: string;
    icon?: ReactNode;
    hidden?: boolean;   // permissão ausente esconde; nunca desabilita (ver feedback.md)
    badge?: { count: number; variant?: 'default' | 'warning' | 'danger' | 'success' };
}

interface SettingsGroup {
    id: string;
    label?: string;
    sections: SettingsSection[];
}
```

### Estados e comportamento

- **idle / hover / active / disabled**: idênticos ao `Sidebar` global (ver seção "Estados").
- **Navegação**: usa `Link` do Next.js em cada item.
- **Permissão ausente**: seção **não renderiza** (não usar `disabled`). Esta é a mesma regra que `Sidebar` → "esconder em vez de desabilitar por permissão" — ver [feedback.md](./feedback.md).
- **Mobile**: o container vira `Select` no topo da seção ou tabs horizontais com scroll (decisão do template consumidor — ver `SettingsLayout` em [layout.md](./layout.md)).

### Acessibilidade

- Wrapper com `role="navigation"` + `aria-label="Navegação de configurações"`.
- Item ativo com `aria-current="page"`.
- Ordem de Tab segue ordem visual.

### Do / Don't

**Do**
- Use para navegação de sub-seções dentro de uma área (Settings, Preferências, Perfil).
- Mantenha 3–8 seções no máximo. Mais que isso sugere que a área deveria virar rota própria.
- Use `hidden` para ocultar seções a que o usuário não tem acesso — consistente com o resto do DS.

**Don't**
- Não aninhe sub-sub-seções — `SettingsSidebar` é um único nível.
- Não adicione collapse toggle — se precisa colapsar, provavelmente não é o componente certo.
- Não use ao lado de tabs no mesmo template — escolha um eixo de navegação.

## BottomNav (mobile)

### Anatomia

```
┌────────────────────────────────────────┐
│  📄      📊      ⏱      ⚙     ≡     │
│  Notas  Análise  Hist   Config  Mais   │
└────────────────────────────────────────┘
```

### API

```tsx
<BottomNav
    items={sameAsTheSidebar}
    activeItemId="notas"
/>
```

### Comportamento

- Posição fixa na base da viewport (`position: fixed; bottom: 0`).
- Altura `h-16` (64px) + safe-area inset-bottom.
- Ícone + label vertical.
- Item ativo: cor `primary`, indicador acima (barra de 2px).
- Máximo 5 itens; overflow vai para drawer "Mais".
- Sub-items: clicar em item com children abre drawer horizontal/vertical.
- Badges visíveis no canto superior-direito do ícone.

## Exemplo completo

```tsx
const navItems = [
    {
        id: 'notas',
        label: 'Notas',
        icon: <FileText />,
        href: '/notas',
        badge: { count: pendingCount, variant: 'warning' },
        tooltip: {
            title: 'Notas fiscais',
            description: 'Processamento e reprocessamento de NFs',
        },
    },
    {
        id: 'historico',
        label: 'Histórico',
        icon: <Clock />,
        children: [
            { id: 'recentes', label: 'Recentes', href: '/historico' },
            { id: 'arquivadas', label: 'Arquivadas', href: '/historico/arquivadas' },
        ],
        tooltip: {
            title: 'Histórico',
            description: 'Consulta de movimentações anteriores',
        },
    },
    {
        id: 'config',
        label: 'Configurações',
        icon: <Settings />,
        href: '/configuracoes',
        tooltip: {
            title: 'Configurações',
            description: 'Preferências e membros da organização',
        },
    },
];

function AppLayout({ children }) {
    const { isMobile } = useBreakpoint();
    return (
        <AppShell>
            <AppShell.Header>...</AppShell.Header>
            {isMobile ? (
                <BottomNav items={navItems} />
            ) : (
                <AppShell.Sidebar>
                    <Sidebar
                        items={navItems}
                        footer={<LogoutButton />}
                    />
                </AppShell.Sidebar>
            )}
            <AppShell.Main>{children}</AppShell.Main>
        </AppShell>
    );
}
```

## Do / Don't

**Do**

- Mantenha labels curtas (1–2 palavras). Contexto fica no tooltip.
- Use ícone em todos os itens — facilita escaneabilidade e permite collapse.
- Use badges para sinalizar itens que exigem atenção (pendentes, notificações não lidas).
- Persiste o estado colapsado por usuário.

**Don't**

- Não ultrapasse 2 níveis. Se precisar, considere SettingsLayout com sub-nav própria.
- Não coloque ações (botões de ação) na sidebar. Ela é para navegação.
- Não use tooltip vazio (`description: ''`). Se não há o que explicar, remova.
- Não esconda itens principais atrás de um menu "Mais" em desktop.
- Não coloque mais de 8 itens no nível raiz. Se tiver mais, reorganize em áreas.
- Não use sub-items como atalho para filtros da página. Filtros ficam na própria página.
