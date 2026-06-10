# Acessibilidade — WCAG 2.1 AA

Conformidade com WCAG 2.1 nível AA é obrigatória. Este documento lista os critérios aplicáveis e como o DS os implementa. Checklists por componente ficam em cada spec individual; este arquivo é o consolidado.

## Princípios

- **Teclado em tudo**: qualquer interação disparável por mouse é disparável por teclado.
- **Foco visível**: nunca esconda o focus ring; melhore-o.
- **Anuncie mudanças**: operações assíncronas ou updates de estado anunciam via `aria-live`.
- **Contraste suficiente**: textos, ícones e bordas respeitam razões WCAG.
- **Respeita preferências**: `prefers-reduced-motion`, `prefers-color-scheme` (quando dark mode ativar).
- **Semântica correta**: roles e landmarks alinhados com a estrutura visual.

## Contraste — WCAG 2.1 AA

| Tipo | Razão mínima | Aplicado em |
|---|---|---|
| Texto normal (< 18px) | 4.5:1 | body, label, input text |
| Texto grande (≥ 18px, bold ≥ 14px) | 3:1 | headings, KPI values |
| Componentes UI e ícones informativos | 3:1 | borders, ícones de estado, focus rings |
| Text em botão | 4.5:1 | botões primário e secundário |

**Verificação**:

- Paleta validada para o tema light (ver `tokens.md`).
- Quando dark mode ativar, rodar validação novamente.
- Ferramentas: Stark, axe DevTools, WebAIM Contrast Checker.

### Exemplo — cores que atendem

- Texto primário (`#212121`) sobre surface branca (`#FFFFFF`): razão 16.5:1 ✓.
- Botão primary: texto branco sobre laranja (`#FF8C42`): razão ~3.2:1 — usar **apenas em texto ≥ 14px bold** ou reforçar com cor hover mais escura.

## Navegação por teclado

### Tecla-a-tecla

| Tecla | Comportamento esperado |
|---|---|
| `Tab` | Avança para próximo elemento focável |
| `Shift+Tab` | Volta para anterior |
| `Enter` | Ativa botão, submete form, abre link |
| `Space` | Alterna checkbox, switch, clica botão |
| `Escape` | Fecha modal, popover, drawer, cancela edição |
| `ArrowUp/Down` | Navega em menus, selects, listas |
| `ArrowLeft/Right` | Navega em tabs, sliders, carrosséis |
| `Home/End` | Primeiro/último item de listas |
| `/` | Foca em campo de busca (quando presente) |

### Order

- Tab order segue ordem visual (left-to-right, top-to-bottom).
- `tabindex="-1"` apenas em elementos que recebem foco programático (ex: modal ao abrir).
- Nunca use `tabindex > 0` (quebra ordem natural).

### Skip link

Primeiro elemento focável da página é um skip link visível ao receber foco:

```tsx
<a href="#main-content" className="sr-only focus:not-sr-only ...">
    Pular para o conteúdo principal
</a>
```

`<AppShell.Main>` tem `id="main-content"` para suportar.

## Focus visível

- Focus ring obrigatório em todo elemento focável.
- Não remover com `outline: none` sem substituir.
- Padrão:

```css
.focusable:focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: 2px;
    border-radius: inherit;
}
```

- Usar `:focus-visible` (não `:focus`) para não mostrar ring em cliques de mouse — só teclado.
- Focus ring deve ter contraste 3:1 contra background.

## Landmarks e estrutura semântica

Todo page:

```html
<a href="#main-content">Pular para o conteúdo</a>
<header role="banner">
    <nav aria-label="Barra superior">...</nav>
</header>
<nav aria-label="Navegação principal">...</nav>
<main id="main-content" role="main">
    ...
</main>
<footer role="contentinfo">...</footer>
```

- Apenas **um** `<main>` por página.
- Apenas **um** `<h1>` por página — é o título do PageHeader.
- Hierarquia de headings respeitada: `h1 → h2 → h3`. Nunca pule.

## ARIA — regras gerais

- Use HTML semântico primeiro. ARIA complementa, não substitui.
- `aria-label` quando o rótulo visível é inexistente (ícone sozinho).
- `aria-labelledby` quando o rótulo está em outro elemento.
- `aria-describedby` para descrição adicional (helper text, error message).
- `aria-live="polite"` para anúncios não urgentes (toast, update de contagem).
- `aria-live="assertive"` apenas para erros críticos.
- `aria-busy="true"` em loading states.
- `aria-expanded` em elementos que abrem/fecham painéis.
- `aria-controls` apontando para o id do painel controlado.
- `aria-current="page"` em link de navegação da página atual.
- `aria-selected` em items de tabs/listbox.
- `aria-invalid="true"` em inputs com erro.
- `aria-required="true"` em inputs obrigatórios.

### `role=` — quando usar

- `role="button"` em `<div>` clicável (evite — prefira `<button>`).
- `role="dialog"` em modais.
- `role="alert"` em mensagens de erro inline.
- `role="status"` em loading states.
- `role="tooltip"` em tooltip content.
- `role="grid"` em DataTable (com `row`, `columnheader`, `gridcell`).
- `role="list"` + `role="listitem"` quando perdido em `<div>` (prefira `<ul>`).

## Anúncios ao vivo (live regions)

### Toast

- Container com `aria-live="polite"` e `role="status"`.
- Error toasts: `role="alert"` para anúncio imediato.

### Loading/completion

```tsx
{isLoading ? (
    <div aria-live="polite" aria-busy="true">
        Carregando notas fiscais...
    </div>
) : (
    <div aria-live="polite">
        {data.length} notas carregadas
    </div>
)}
```

### Selection changes

```tsx
<p aria-live="polite" className="sr-only">
    {selectedCount} notas selecionadas
</p>
```

## Respeito a preferências do sistema

### `prefers-reduced-motion`

Obrigatório em todo CSS:

```css
@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }
}
```

Componentes que dependem de animação para informação (shimmer em skeleton) têm fallback estático (cor de fundo diferente).

### `prefers-color-scheme`

Quando dark mode ativar, respeitar a preferência do sistema por padrão. Toggle manual sobrepõe.

### `prefers-contrast: more`

Sistema de alto contraste — considerar em futuro. Hoje apenas garantir que contrast ratios são seguras.

## Formulários

- Todo `<input>` tem `<label>` associado.
- Error messages conectadas via `aria-describedby`.
- Campos obrigatórios: `aria-required="true"` + asterisco visível.
- Submit via Enter em qualquer campo (exceto `textarea`).
- `autocomplete` correto (`email`, `new-password`, `tel`, etc).
- Agrupar radios/checkboxes com `<fieldset>` + `<legend>`.

## Tabelas

- `<table role="grid">` com `<thead>`, `<tbody>`.
- `<th scope="col">` em headers de coluna.
- `aria-sort="ascending" | "descending" | "none"` em headers ordenáveis.
- Navegação por teclado: Arrow keys entre células quando tabela focada.
- Linha selecionada: `aria-selected="true"`.
- Filtros abertos: `aria-expanded` no trigger.

## Modais e popovers

- Focus trap enquanto abertos.
- Focus inicial no primeiro elemento focável (ou `autoFocus`).
- Focus retorna ao trigger ao fechar.
- `role="dialog"` + `aria-modal="true"`.
- `aria-labelledby` → título; `aria-describedby` → descrição.
- ESC fecha (salvo em casos justificados).

## Imagens e ícones

- `<img alt="...">` sempre. `alt=""` se decorativa.
- Ícones decorativos: `aria-hidden="true"`.
- Ícones informativos: `aria-label` descritivo (ex: ícone de status em badge).
- SVG decorativo: `aria-hidden="true"` + `role="presentation"`.

## Cores — nunca só cor como sinal

Estados transmitidos por cor sempre acompanhados por:

- **Ícone**: check, alerta, erro.
- **Texto**: "Sucesso", "Erro", "Alerta".
- **Forma**: underline em link, border em focus.

Exemplo: badge de status "PENDING" tem cor vermelha + ícone `AlertCircle` + texto "Pendente".

## Teste de acessibilidade

### Automatizado

- `axe-core` em todos os componentes (via `@axe-core/react` em dev ou Jest).
- Lighthouse accessibility score ≥ 95.
- ESLint plugin `jsx-a11y` com config strict.

### Manual

Checklist por componente:

- [ ] Navegação por teclado completa (Tab, Shift+Tab, Enter, Space, Arrow keys, Esc).
- [ ] Focus ring visível em todo elemento focável.
- [ ] Tab order faz sentido visualmente.
- [ ] Screen reader (VoiceOver / NVDA / TalkBack) anuncia corretamente.
- [ ] Funciona sem mouse.
- [ ] Funciona em 200% zoom.
- [ ] `prefers-reduced-motion` respeitado.
- [ ] Contraste verificado (Stark, axe).

## Checklist por tipo de elemento

### Botão

- [ ] `<button>` (nunca `<div onClick>`).
- [ ] Texto visível OU `aria-label`.
- [ ] Focus ring visível.
- [ ] Loading com `aria-busy`.
- [ ] Disabled com `aria-disabled` e tooltip explicando.

### Input

- [ ] `<label>` associado.
- [ ] `aria-required` se obrigatório.
- [ ] `aria-invalid` quando com erro.
- [ ] `aria-describedby` apontando para error/help.
- [ ] `autocomplete` apropriado.

### Link

- [ ] `<a href>` (nunca `<span onClick>`).
- [ ] Texto descreve destino (evite "clique aqui").
- [ ] Links externos: ícone + `aria-label` indicando que abre em nova aba.

### Modal

- [ ] `role="dialog"` + `aria-modal="true"`.
- [ ] Focus trap.
- [ ] ESC fecha.
- [ ] Focus retorna ao trigger.
- [ ] `aria-labelledby` → título.

### Tabela

- [ ] `<th scope="col">`.
- [ ] `aria-sort` em headers ordenáveis.
- [ ] Keyboard nav entre células.
- [ ] Selection com `aria-selected`.

### Navegação

- [ ] Skip link primeiro.
- [ ] `<nav aria-label>` em cada bloco.
- [ ] `aria-current="page"` no item ativo.
- [ ] `aria-expanded` em items com children.

## Do / Don't

**Do**

- Use HTML semântico primeiro; ARIA depois.
- Teste com teclado antes de fechar PR.
- Rode axe/Lighthouse em cada componente novo.
- Ofereça alternativas textuais para toda informação visual.
- Mantenha foco visível mesmo em elementos customizados.

**Don't**

- Não use `outline: none` sem substituir o focus ring.
- Não dependa apenas de cor para transmitir estado.
- Não use `tabindex > 0`.
- Não crie elementos clicáveis com `<div>` + `onClick` — use `<button>` ou `<a>`.
- Não esconda texto de rótulo em `aria-label` quando poderia estar visível.
- Não use ícones informativos sem `aria-label`.
- Não bloqueie o teclado (evite `onKeyDown` que chama `preventDefault` em Tab).
