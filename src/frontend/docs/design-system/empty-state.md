# EmptyState

Placeholder visual para áreas de conteúdo que ainda não têm dados, cujos filtros não retornaram resultados, ou cujo carregamento inicial está em andamento.

> **Escopo deste documento**: apenas a camada visual (componente, API, estados, acessibilidade). A lógica de **quando exibir** (ex.: "sem notificações" vs. "sem resultados") é responsabilidade da página — ver `docs/application/pages/`.

## 1. Propósito

Evitar que o usuário veja uma área em branco sem contexto. O `EmptyState` comunica:

- O que está ausente (ícone + título).
- Por que está ausente (descrição opcional).
- O que o usuário pode fazer a seguir (ação opcional).

## 2. Classificação Atomic

**Molecule** — combina primitivos (ícone Lucide, texto, botão) sem lógica de negócio própria. Vive em `src/shared/components/atomic/molecules/EmptyState.tsx`.

## 3. Anatomia

```
┌─────────────────────────────┐
│                             │
│        [ ícone ]            │  ← círculo bg-slate-100, ícone Lucide 24px
│                             │
│        Título               │  ← text-sm font-semibold text-slate-900
│      Descrição              │  ← text-sm text-slate-500 (máx. ~200px)
│                             │
│      [ Ação ]               │  ← qualquer ReactNode (botão, link, etc.)
│                             │
└─────────────────────────────┘
```

Layout: coluna centralizada (`flex-col items-center justify-center text-center`). Padding: `px-6 py-10`.

## 4. API

```ts
export interface EmptyStateProps {
    icon?: LucideIcon;       // padrão: Inbox
    title: string;           // obrigatório — descreve o que está faltando
    description?: string;    // contexto adicional, máx. 2 linhas
    action?: ReactNode;      // CTA; ex.: <Button>Limpar filtros</Button>
    className?: string;      // override de layout para casos especiais
}
```

### Exemplos de uso

```tsx
// Básico
<EmptyState icon={Bell} title="Sem notificações" />

// Com descrição
<EmptyState
    icon={Bell}
    title="Sem notificações"
    description="Eventos do produto aparecem aqui."
/>

// Sem resultados (filtros ativos)
<EmptyState
    icon={Search}
    title="Nenhum resultado"
    description="Os filtros atuais não correspondem a nenhuma notificação."
    action={<Button variant="ghost" size="sm" onClick={clearFilters}>Limpar filtros</Button>}
/>
```

## 5. Estados

### Idle (sem dados)

Ícone domínio-específico (ex.: `Bell` para notificações, `FileText` para notas).  
Título afirmativo: "Sem notificações", "Nenhuma nota encontrada".  
Descrição explica o que produz dados: "Eventos do produto aparecem aqui."  
Ação ausente — nada para o usuário fazer além de aguardar.

### Sem resultados (filtros ativos)

Ícone `Search`.  
Título: "Nenhum resultado".  
Descrição referencia os filtros: "Os filtros atuais não correspondem a…".  
Ação: "Limpar filtros" — volta ao estado idle.

### Skeleton (carregando)

```tsx
<EmptyState.Skeleton />
```

Renderiza três blocos `animate-pulse` (círculo + duas linhas) com alturas fixas. Não recebe props. Exibir enquanto o dado inicial não chegou — substituir pelo `EmptyState` real (ou pela lista) quando o fetch concluir.

## 6. Acessibilidade

- O container usa `role` implícito `generic` — não adicionar `role="status"` salvo se o estado muda dinamicamente enquanto o usuário aguarda (nesse caso usar `aria-live="polite"` no container pai).
- O `action` deve ser um elemento nativo interativo (`<button>`, `<a>`); não usar `<div onClick>`.
- `icon` é decorativo — não recebe `aria-label`; a semântica vem do `title`.

## 7. Do / Don't

| Faça | Evite |
|---|---|
| Ícone relacionado ao domínio da área | Ícone genérico para tudo |
| Título curto (≤ 4 palavras) | Título que repete a descrição |
| Ação específica ("Limpar filtros") | Ação genérica ("Clique aqui") |
| `EmptyState.Skeleton` enquanto carrega | Área em branco sem feedback |
| `description` com 1–2 frases | Parágrafo longo de explicação |

## 8. Exemplos por contexto

| Contexto | `icon` | `title` | `description` | `action` |
|---|---|---|---|---|
| Notificações — sem histórico | `Bell` | "Sem notificações" | "Eventos do produto aparecem aqui." | — |
| Notificações — sem resultados | `Search` | "Nenhum resultado" | "Os filtros atuais não correspondem a nenhuma notificação." | Botão "Limpar filtros" |
| Notas fiscais — lista vazia | `FileText` | "Nenhuma nota encontrada" | — | — |
| Tabela com filtro ativo | `Search` | "Nenhum resultado" | "Tente ajustar os filtros." | Botão "Limpar filtros" |
| Histórico de uploads | `UploadCloud` | "Sem uploads" | "Arquivos enviados aparecem aqui." | — |
