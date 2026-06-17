# Layout — AppShell e Templates

Estrutura macro da aplicação. O AppShell é o único organism responsável por posicionar header, sidebar e main. Templates (`DashboardLayout`, `AuthLayout`, etc) compõem o AppShell com slots nomeados para organizar tipos de página.

## AppShell

### Propósito

Prover a moldura persistente da aplicação: header fixo no topo, sidebar colapsável na lateral, área principal ocupando o restante. É o ponto de entrada visual de toda página autenticada.

### Classificação Atomic

Organism.

### Anatomia

```
┌──────────────────────────────────────────────────────────┐
│ Header (sticky, altura fixa 56–64px)                      │
│  Logo | [nav opcional] |          [actions: 🔔 ❓ 👤]    │
├──────┬───────────────────────────────────────────────────┤
│      │                                                    │
│ Side │ Main                                               │
│ bar  │  (conteúdo da página — PageHeader + conteúdo)      │
│      │                                                    │
│ 224  │  flex-grow, padding interno, scroll vertical       │
│ px   │                                                    │
│      │                                                    │
└──────┴───────────────────────────────────────────────────┘
```

### API pública — forma compound

```tsx
<AppShell>
    <AppShell.Header>
        <AppShell.Logo src={logoSrc} alt="NF Automation" />
        <AppShell.HeaderActions>
            <NotificationCenter />
            <HelpButton />
            <UserMenu />
        </AppShell.HeaderActions>
    </AppShell.Header>

    <AppShell.Sidebar>
        <Sidebar items={navItems} />
    </AppShell.Sidebar>

    <AppShell.Main>
        {children}
    </AppShell.Main>
</AppShell>
```

### API pública — forma pré-configurada

```tsx
<DashboardLayout
    logo={<AppShell.Logo src={logoSrc} alt="NF Automation" />}
    navItems={navItems}
    headerActions={<DefaultHeaderActions />}
>
    {children}
</DashboardLayout>
```

### Subcomponentes

| Subcomponente | Obrigatório | Descrição |
|---|---|---|
| `AppShell.Header` | sim | container fixo, altura `h-14` a `h-16` (56–64px) |
| `AppShell.Logo` | sim | logo da aplicação ou do tenant |
| `AppShell.Nav` | não | nav horizontal no topo (opcional; padrão usa Sidebar vertical) |
| `AppShell.HeaderActions` | não | ícones à direita (notifications, user menu) |
| `AppShell.EnvBadge` | não | badge do ambiente (UAT/DEV) — não renderiza em PRD |
| `AppShell.Sidebar` | não | container para `<Sidebar />` |
| `AppShell.Main` | sim | área principal; aplica padding, max-width e scroll |

### Props

**`<AppShell>`**

| Prop | Tipo | Default | Descrição |
|---|---|---|---|
| `children` | `ReactNode` | — | Subcomponentes nomeados |
| `sidebarDefaultCollapsed` | `boolean` | `false` | Sidebar inicia colapsado |
| `stickyHeader` | `boolean` | `true` | Header fixo no topo |

**`<AppShell.Header>`**

| Prop | Tipo | Default | Descrição |
|---|---|---|---|
| `variant` | `'default' \| 'transparent'` | `'default'` | `transparent` remove bg; útil em páginas de hero |
| `children` | `ReactNode` | — | Logo, nav, actions |

**`<AppShell.Main>`**

| Prop | Tipo | Default | Descrição |
|---|---|---|---|
| `padding` | `'none' \| 'sm' \| 'md' \| 'lg'` | `'md'` | Padding interno |
| `maxWidth` | `'none' \| 'sm' \| 'md' \| 'lg' \| 'xl' \| 'full'` | `'xl'` | Largura máxima do conteúdo |

### Estados

- **Sidebar expanded / collapsed**: toggle persistido em localStorage (`ds:sidebar:collapsed:v1`).
- **Sidebar mobile drawer** (em `< tablet`): inicialmente fechado; abre via trigger no header.
- **Env badge visível** em UAT/DEV; ausente em PRD.

### Comportamento

- Header fixo com `z-sticky`. Sombra sutil (`shadow-sticky`) aparece ao rolar.
- Sidebar em desktop: fixo à esquerda com `w-56` (224px) expandido ou `w-16` (64px) colapsado. Transição 200ms.
- Em mobile (< tablet): sidebar some e é substituído por bottom nav (ver `sidebar.md`).
- Main tem `overflow-y-auto` em desktop para permitir conteúdo extenso sem rolar o header.
- Main aplica max-width no conteúdo e padding lateral. Em wide (≥1280px), o conteúdo fica centralizado.

### Acessibilidade

- Header tem `role="banner"`.
- Sidebar tem `role="navigation"` com `aria-label="Navegação principal"`.
- Main tem `role="main"` e `id="main-content"` para suportar skip links.
- Link "Pular para o conteúdo" (`<a href="#main-content">`) é o primeiro elemento focável da página, visível ao focar via Tab.
- Toggle de sidebar tem `aria-expanded` e `aria-controls`.

### Exemplo de uso

```tsx
export default function DashboardLayoutPage({ children }) {
    return (
        <AppShell>
            <AppShell.Header>
                <AppShell.Logo src="/logo.svg" alt="NF Automation" />
                <AppShell.EnvBadge />
                <AppShell.HeaderActions>
                    <NotificationCenter />
                    <UserMenu />
                </AppShell.HeaderActions>
            </AppShell.Header>

            <AppShell.Sidebar>
                <Sidebar
                    items={[
                        { id: 'notas', label: 'Notas', icon: FileText, href: '/notas' },
                        { id: 'config', label: 'Configurações', icon: Settings, href: '/configuracoes' },
                    ]}
                />
            </AppShell.Sidebar>

            <AppShell.Main padding="md" maxWidth="xl">
                {children}
            </AppShell.Main>
        </AppShell>
    );
}
```

### Do / Don't

**Do**

- Coloque o `AppShell` no layout de rota (`app/(dashboard)/layout.tsx`) para que persista entre navegações.
- Use `AppShell.HeaderActions` para tudo que é ação persistente (notificações, usuário). Não coloque ações de página aqui.
- Use `AppShell.EnvBadge` para sinalizar UAT/DEV.

**Don't**

- Não coloque `PageHeader` dentro de `AppShell.Header`. Eles são componentes distintos (header do app vs header de página).
- Não use `AppShell` em páginas de auth (login, reset password). Use `AuthLayout`.
- Não anine múltiplos `AppShell` — é um organism raiz.
- Não faça fetch no AppShell. Ele recebe a lista de nav items via props.

---

## DashboardLayout

Template pré-configurado para páginas autenticadas de dashboard (Notas, Histórico, Configurações).

### Anatomia

AppShell + slots opcionais para PageHeader e GlobalFilterBar.

### API

```tsx
<DashboardLayout
    header={<PageHeader title="..." subtitle="..." />}
    filterBar={<GlobalFilterBar ... />}
>
    <KPIGrid>...</KPIGrid>
    <DataTable.Client ... />
</DashboardLayout>
```

### Props

| Prop | Tipo | Descrição |
|---|---|---|
| `header` | `ReactNode` | `PageHeader` da página |
| `filterBar` | `ReactNode` | `GlobalFilterBar` opcional; renderiza abaixo do header |
| `children` | `ReactNode` | Conteúdo da página |

### Layout interno

Spacing vertical entre seções = `gap-lg` (24px).

```
PageHeader + GlobalFilterBar  ← header + filter bar flexbox alinhados, mesma linha visual
[ spacing lg ]
KPIGrid
[ spacing lg ]
conteúdo principal (Tabela, gráficos, etc)
```

---

## AuthLayout

Template para páginas de autenticação (login, reset password, set password).

### Anatomia

```
┌─────────────────────────────────────────────┐
│                                             │
│            [Logo]                           │
│                                             │
│      ┌────────────────────────┐             │
│      │  Card (400–480px)      │             │
│      │  Título                │             │
│      │  Subtítulo             │             │
│      │  Form                  │             │
│      │  Link auxiliar         │             │
│      └────────────────────────┘             │
│                                             │
│            Footer (opcional)                │
│                                             │
└─────────────────────────────────────────────┘
```

### API

```tsx
<AuthLayout
    title="Entrar"
    subtitle="Acesse sua conta para gerenciar notas fiscais"
    footer={<AuthLayout.Links><Link href="/forgot">Esqueci minha senha</Link></AuthLayout.Links>}
>
    <LoginForm />
</AuthLayout>
```

### Props

| Prop | Tipo | Descrição |
|---|---|---|
| `title` | `string` | Título acima do card |
| `subtitle` | `string?` | Texto explicativo |
| `children` | `ReactNode` | Formulário (dentro do card) |
| `footer` | `ReactNode?` | Links auxiliares abaixo do card |

### Layout

- Viewport centralizado vertical e horizontalmente.
- Card com `max-w-md`, `rounded-lg`, `shadow-card`, `p-8`.
- Em mobile ocupa 100% da largura com padding lateral.
- Background: `bg-background` ou imagem sutil. Nunca concorre com o card.

---

## SettingsLayout

Template para áreas de configuração com sub-navegação à esquerda.

### Anatomia

```
┌────────────┬────────────────────────────┐
│            │                             │
│ Sub-nav    │ Seção ativa                 │
│ (seções)   │                             │
│            │                             │
│  General   │ Título da seção             │
│ > Membros  │ Conteúdo                    │
│  Billing   │                             │
│            │                             │
└────────────┴────────────────────────────┘
```

### API

```tsx
<SettingsLayout
    sections={[
        { id: 'general', label: 'Geral', href: '/configuracoes' },
        { id: 'members', label: 'Membros', href: '/configuracoes/membros' },
    ]}
    activeSectionId="members"
>
    <MembersSection />
</SettingsLayout>
```

### Comportamento

- Sub-nav vertical à esquerda (largura `w-56`), implementada com `SettingsSidebar` — ver [sidebar.md](./sidebar.md#settingssidebar-secondary-nav).
- Em mobile, vira seletor no topo (select ou tabs horizontais com scroll).
- Seções sem permissão são **omitidas** (não desabilitadas) — ver [feedback.md](./feedback.md).

---

## DetailLayout

Template para páginas de detalhe de entidade (nota específica, usuário específico).

### Anatomia

```
┌────────────────────────────────────────────┐
│ Breadcrumb                                  │
│ PageHeader (com ações)                      │
│ Tabs (opcional)                             │
│ ───────────────────────────────────────────│
│                                             │
│ Conteúdo da aba ativa                       │
│                                             │
└────────────────────────────────────────────┘
```

### API

```tsx
<DetailLayout
    breadcrumb={[{ label: 'Notas', href: '/notas' }, { label: 'NF-001234' }]}
    header={<PageHeader title="NF-001234" actions={...} />}
    tabs={[
        { id: 'overview', label: 'Visão geral' },
        { id: 'logs', label: 'Logs' },
        { id: 'history', label: 'Histórico' },
    ]}
    activeTabId="overview"
    onTabChange={...}
>
    <Overview />
</DetailLayout>
```

---

## Responsividade — regras transversais

### Grid de página

```css
.page-container {
    padding: var(--spacing-6);
    max-width: 1440px;
    margin: 0 auto;
}

@media (min-width: 1280px) {
    .page-container {
        padding: var(--spacing-8) var(--spacing-12);
    }
}

@media (max-width: 640px) {
    .page-container {
        padding: var(--spacing-4);
    }
}
```

### Spacing vertical entre seções

| Contexto | Gap |
|---|---|
| Entre itens de um mesmo grupo | `gap-sm` (8px) |
| Entre subseções | `gap-md` (16px) |
| Entre seções principais (header → filter → KPI → table) | `gap-lg` (24px) |
| Entre páginas (footer → próxima página) | `gap-2xl` (48px) |

### Scroll

- Header: `position: sticky; top: 0; z-index: var(--z-sticky)`.
- Sidebar: `position: sticky; top: 0; height: 100vh; overflow-y: auto`.
- Main: `overflow-y: auto`. Scrollbar nativa, estilizada sutilmente em Firefox/WebKit para combinar com o tema.

## Do / Don't do layout

**Do**

- Declare o target mínimo de viewport no spec de cada página ("desktop", "mobile").
- Use max-width no Main para evitar linhas de texto extensas em wide.
- Respeite a hierarquia de z-index definida em tokens.

**Don't**

- Não use viewport units (`100vh`) sem cuidado em mobile (a altura muda com URL bar). Prefira `100dvh`.
- Não faça scroll horizontal no Main (exceto em DataTable dentro dele).
- Não quebre o sticky do header forçando `transform` em ancestrais (cria novo stacking context e quebra position:sticky).
