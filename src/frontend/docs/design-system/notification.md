# Notifications — Toast + NotificationCenter

Componentes visuais para feedback de eventos: **toasts** efêmeros no canto da tela e **NotificationCenter**, um painel persistente acessível via ícone de sino no topo da sidebar.

> **Escopo deste documento**: apenas a camada visual (componentes, API, estados, acessibilidade). A lógica de **quando disparar**, **persistência em localStorage**, **categorias do produto** e **regras de negócio de leitura/abertura** vive em [docs/application/flows/notificacoes.md](../application/flows/notificacoes.md).

## Toast

### Implementação

Baseado em **Sonner** (já instalado como `sonner` + `src/shared/components/ui/sonner.tsx`).

### Variantes

| Método | Ícone | Cor | Uso visual |
|---|---|---|---|
| `toast.success(msg)` | `CheckCircle` | success | Confirmação positiva |
| `toast.error(msg)` | `XCircle` | danger | Erro não-bloqueante |
| `toast.warning(msg)` | `AlertTriangle` | warning | Alerta que exige atenção |
| `toast.info(msg)` | `Info` | info | Informação neutra |
| `toast.loading(msg)` | spinner | primary | Ação em andamento (retorna id para update) |
| `toast.promise(p, ...)` | spinner → success/error | varia | Auto-transição loading → result |

### API

```tsx
toast.success('Nota reprocessada');

toast.error('Falha ao reprocessar', {
    description: 'Código: NF-503. O serviço de contabilização está temporariamente indisponível.',
    action: {
        label: 'Tentar novamente',
        onClick: () => retryReprocess(id),
    },
});

toast.promise(
    reprocessBatch(selectedIds),
    {
        loading: `Reprocessando ${selectedIds.length} notas...`,
        success: (result) => `${result.success} notas reprocessadas`,
        error: (err) => `Falha: ${err.message}`,
    },
);
```

### Props (opções do toast)

| Opção | Tipo | Default | Descrição |
|---|---|---|---|
| `description` | `string` | — | Texto secundário abaixo do título |
| `duration` | `number` | varia | Tempo em ms |
| `action` | `{ label, onClick }` | — | Botão de ação inline |
| `cancel` | `{ label, onClick }` | — | Botão de cancel inline |
| `id` | `string` | auto | ID customizado para update |
| `onDismiss` | `() => void` | — | Callback ao fechar |

### Durações

| Variante | Duração |
|---|---|
| success | 4000ms |
| info | 4000ms |
| warning | 5000ms |
| error | 6000ms |
| com `action` | 10000ms (usuário precisa ver o botão) |
| loading | até resolver |

### Posicionamento

- Default: `bottom-right`.
- Empilhamento: até 3 visíveis simultaneamente; restante em queue (aparece quando um some).
- Swipe para dismiss em mobile (direita).
- Click para dismiss em desktop.

### Regra — toast vs modal

| Use toast | Use modal |
|---|---|
| Sucesso de ação iniciada pelo usuário | Confirmação **antes** de ação destrutiva |
| Erro não-bloqueante (sistema continua funcionando) | Erro que exige decisão (retry, cancel, ajustar) |
| Notificação passiva ("Dados atualizados") | Formulário |
| Feedback de undo ("Item excluído · Desfazer") | Informação rica que exige leitura focada |

## NotificationCenter

### Propósito

Trigger no header + painel com o histórico de notificações. O componente é **visual e stateless do ponto de vista do DS**: consome um state já carregado (array de itens + flags) e emite eventos para operações (marcar lida, excluir, limpar). A origem desse state, incluindo persistência e sincronização, é responsabilidade da feature — ver [flows/notificacoes.md](../application/flows/notificacoes.md).

### Classificação Atomic

Organism (compound).

### Anatomia

```
[🔔 3]  ← Trigger no header com badge de não-lidas

────── Popover ao clicar ──────
┌───────────────────────────────────┐
│ Notificações           [⋮ menu]   │
│ [Não lidas (3)] [Todas]           │
├───────────────────────────────────┤
│ Hoje                              │
│  ● Nota NF-001234 reprocessada    │ ← não lida = bolinha azul
│    há 2 min                       │
│                                   │
│  ○ Ingestão concluída: 42 notas   │
│    há 15 min                      │
│                                   │
│ Ontem                             │
│  ○ 3 notas movidas para PENDING   │
│    18:42                          │
│                                   │
├───────────────────────────────────┤
│  Marcar todas como lidas          │
└───────────────────────────────────┘
```

### API

O componente é **self-contained**: conecta-se internamente ao `useNotifications()` e não recebe props de state externo.

```tsx
// Sidebar colapsada (icon-only)
<NotificationCenter collapsedSidebar={true} />

// Sidebar expandida (icon + label)
<NotificationCenter collapsedSidebar={false} />
<NotificationCenter />   // collapsedSidebar padrão false
```

### Props — `<NotificationCenter>`

| Prop | Tipo | Default | Descrição |
|---|---|---|---|
| `collapsedSidebar` | `boolean` | `false` | Quando `true`, exibe apenas o ícone (sem label) |

### Sub-componentes internos

| Componente | Responsabilidade |
|---|---|
| `NotificationItem` | Renderiza item individual: dot, ícone de categoria, título, descrição, timestamp relativo, ações de hover |
| `NotificationGroup` | Renderiza um bucket temporal com label + lista de `NotificationItem` |

Esses sub-componentes são exportados de `src/shared/components/atomic/organisms/NotificationCenter/`.

Para a página `/notificacoes`, use `NotificationPageCard` e `NotificationPageGroup` (ver seção abaixo) — que oferecem um visual mais rico adequado à listagem completa.

```ts
interface NotificationItem {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    description?: string;
    timestamp: string;    // ISO; usado apenas para exibição
    read: boolean;
    actionLabel?: string; // se presente, renderiza como link dentro do item
    actionUrl?: string;   // se presente, ao ativar o item navega para esta rota
}
```

### Trigger

- Ícone `Bell` no footer do `CollapsibleSidebar`, acima do botão de logout. **Duplo-clique navega para `/notificacoes`.**
- Badge com contagem de não-lidas (absolute no canto superior-direito do ícone).
- Badge esconde quando 0; exibe `99+` quando contagem excede 99.
- `aria-label="Notificações (3 não lidas)"` (atualiza dinamicamente).
- Em sidebar colapsada: exibe apenas o ícone (sem label); popover abre para a direita com `side="right"`.
- Em sidebar expandida: exibe ícone + label "Notificações".

### Panel

- Popover de ~400px de largura aberto ao clicar no trigger.
- Altura máxima `70vh`; scroll interno.
- Em mobile, vira drawer bottom ou full-screen sheet.
- Empty state quando sem notificações: ilustração + "Sem notificações".

### Agrupamento temporal

Os itens são renderizados dentro de seções de tempo que o próprio componente calcula a partir de `timestamp`:

- **Hoje**
- **Ontem**
- **Esta semana**
- **Este mês**
- **Anteriores**

### Notification item

```
┌────────────────────────────────────┐
│ ● 🔄 Nota NF-001234 reprocessada   │
│    Processamento concluído com     │
│    sucesso.                        │
│    há 2 min · [Ver nota]           │
└────────────────────────────────────┘
```

Elementos:

- Dot de status (à esquerda): azul (não lida), cinza (lida), some se lida + mais de 7 dias.
- Ícone de categoria derivado de `type`.
- Título.
- Descrição (até 2 linhas; reticência se maior).
- Timestamp relativo ("há 2 min", "ontem às 18:42") — renderizado pelo componente a partir de `timestamp`.
- `actionLabel` opcional renderizado como link.
- Ações rápidas no hover: marcar lida/não lida, excluir.

### Filters

- Aba "Não lidas" (padrão) / "Todas".
- Contagem em cada aba.
- Controlado via props `filter` / `onFilterChange` — o componente não mantém estado.

## NotificationPageCard

### Propósito

Card visual rico para a listagem da página `/notificacoes`. Substitui o `NotificationItem` compacto com mais espaço para descrição completa e acento de cor para itens não lidos.

### Classificação Atomic

Organism leaf. Usado por `NotificationPageGroup`.

### Anatomia

```
┌────────────────────────────────────────┐  ← border-l-4 colorida (não lido)
│ [●icon] NF-001234 reprocessada         │  ← ícone em círculo colorido
│         Processamento concluído com    │  ← descrição completa (sem line-clamp)
│         sucesso.                       │
│         há 2 min · [→ Ver nota]        │  ← timestamp + action link (Next Link)
│                              [✓] [🗑] │  ← hover actions
└────────────────────────────────────────┘
```

### Props

Idênticas a `NotificationItem`:

| Prop | Tipo | Descrição |
|---|---|---|
| `item` | `PersistedNotification` | Dados da notificação |
| `onActivate` | `() => void` | Click ou Enter no card |
| `onMarkAsRead` | `() => void` | Botão hover "Marcar como lida" |
| `onDelete` | `() => void` | Botão hover "Excluir" |

### Diferenças em relação a `NotificationItem`

| Aspecto | `NotificationItem` (popover) | `NotificationPageCard` (página) |
|---|---|---|
| Ícone | 14px simples à esquerda | Círculo `w-7 h-7` com bg colorido |
| Descrição | `line-clamp-2` | Sem clamp — exibe tudo |
| Itens não lidos | `bg-blue-50/40` | `bg-blue-50/30` + `border-l-4` colorida por tipo |
| Action link | `span` de texto | `<Link>` com `ExternalLink` icon (stopPropagation) |
| Agrupado por | `NotificationGroup` | `NotificationPageGroup` |

## Acessibilidade

- Trigger com `aria-label` descritivo: `"Notificações, 3 não lidas"`.
- Trigger com `aria-expanded` refletindo estado do popover.
- Panel com `role="dialog"` e `aria-label="Painel de notificações"`.
- Lista com `role="list"` e items com `role="listitem"`.
- Quando o painel está aberto e chega item novo: `aria-live="polite"` no container da lista.
- Timestamps com `<time datetime="ISO">` para leitura semântica.
- Navegação por teclado: Tab para items, Enter ativa ação, Delete remove.

## Layout em mobile

- Trigger permanece no header.
- Popover vira **bottom sheet** ou **full-screen drawer** ocupando toda a viewport.
- Safe-area respeitada (iOS notch).

## Exemplo de composição

```tsx
<AppShell>
    <AppShell.Header>
        <AppShell.Logo />
        <AppShell.HeaderActions>
            <NotificationCenter />
            <UserMenu />
        </AppShell.HeaderActions>
    </AppShell.Header>
    ...
</AppShell>
```

A implementação de `<NotificationCenter />` pré-configurado consome o hook da feature (`useNotifications`) e conecta as props — ver [flows/notificacoes.md](../application/flows/notificacoes.md#5-helper-notify--como-o-produto-emite).

## Do / Don't

**Do**

- Use `action` no toast quando o usuário pode reverter ou tentar de novo ("Desfazer", "Tentar novamente").
- Use `toast.promise` para ações com duração previsível — evita múltiplos toasts para a mesma operação.
- Mantenha toasts curtos (1 linha + descrição opcional). Se precisa de texto longo, é modal ou página.
- Mantenha o painel stateless: estado de leitura/ordem é passado via props.

**Don't**

- Não use toast para erros de validação de form — eles aparecem inline.
- Não dispare toasts em cascata (> 3 em poucos segundos) — use `toast.promise` ou agrupe manualmente.
- Não coloque regra de persistência ou schema dentro do componente — isso é responsabilidade da feature.
- Não use o painel como log de debug — mensagens são para o usuário, não para desenvolvedor.
