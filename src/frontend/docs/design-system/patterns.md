# Padrões transversais

Regras que aparecem em múltiplos componentes e merecem um lugar único. Arquitetura, persistência, interação entre componentes, estados de carregamento.

## 1. Página como maestro

**Regra**: estado e lógica de negócio vivem na página (ou feature). Componentes do DS expõem dados e eventos.

### Por que

- Componentes do DS não podem conhecer domínio — se conhecerem, não são reutilizáveis.
- Centralizar estado facilita debug, testing e integração com URL/localStorage.
- Múltiplos componentes afetando-se mutuamente (KPI filtra Table) se resolvem com uma fonte única.

### Anti-padrão

```tsx
// ❌ DS conhece domínio
<DataTable endpoint="/api/notas" />

// ❌ Componente faz fetch
function KPICard() {
    const { data } = useNotas();
    return <div>{data.total}</div>;
}

// ❌ Componentes se comunicam via singleton
notasEventBus.emit('filter', status);
```

### Padrão correto

```tsx
function NotasPage() {
    const [filters, setFilters] = useState<NotasFilters>({});
    const { data, isLoading, refetch } = useNotas(filters);

    return (
        <>
            <KPIGrid>
                <SimpleKPI
                    label="Pendentes"
                    value={data?.pending}
                    active={filters.status === 'PENDING'}
                    onClick={() => setFilters(f => ({ ...f, status: 'PENDING' }))}
                />
            </KPIGrid>

            <DataTable.Client
                data={data?.rows}
                loading={isLoading}
                onRefresh={refetch}
            />
        </>
    );
}
```

## 2. Componentes expõem dados e eventos

Todo componente do DS tem:

- **Props de dados**: `data`, `value`, `selectedIds`, `active`, `loading`, `error`.
- **Props de eventos**: `onClick`, `onChange`, `onSelect`, `onFilterChange`, `onSortChange`.
- **Props de customização**: `variant`, `size`, `features`, `tooltip`, slots (`actions`, `emptyState`).

Componentes **não** têm:

- Efeitos de side com fetch.
- Acoplamento a outras features (hooks específicos).
- Callbacks singleton/global.

## 3. Deep-linking via URL

Estado que deve sobreviver refresh, ser compartilhável e bookmarkable vai para a URL.

### Quando usar URL

- **Filtros globais da página**: período, range de datas, campo de data.
- **Parâmetros de navegação**: aba ativa, id de recurso selecionado.
- **Pesquisa**: termo de busca global da página.
- **Estado de modal** (em alguns casos): abrir modal via `?modal=reproc&id=123`.

### Quando **não** usar URL

- Filtros granulares de tabela (coluna por coluna) — vão para localStorage.
- Seleção de linhas — efêmero.
- Estado de scroll, expand, hover — efêmero.
- Senhas, tokens, dados sensíveis — nunca em URL.

### Implementação

```tsx
const [globalFilter, setGlobalFilter] = useUrlState('global', defaultGlobalFilter, {
    serialize: (value) => ({
        from: format(value.from, 'yyyy-MM-dd'),
        to: format(value.to, 'yyyy-MM-dd'),
        dateField: value.dateField,
    }),
    deserialize: (params) => ({
        from: parseISO(params.from),
        to: parseISO(params.to),
        dateField: params.dateField,
    }),
});
```

URL resultante: `/notas?from=2026-04-01&to=2026-04-19&dateField=saved_date`.

### Regras

- Parâmetros da URL têm nomes curtos e estáveis (`from`, `to`, `q`, `status`, `page`).
- Mudanças de estado **substituem** a URL (não adicionam ao histórico), salvo quando é navegação semântica (mudar de aba).
- Datas em ISO date-only (`YYYY-MM-DD`), fuso local.
- Booleans: `true`/`false` (não `1`/`0`).
- Arrays: vírgula (`status=PENDING,FINALIZADA`).

## 4. Persistência em localStorage — schema versionado

### Quando usar

- **Preferências do usuário** que sobrevivem entre sessões: ordem/largura/visibilidade de colunas, densidade, estado colapsado do sidebar, filtros de coluna, page size.
- **Histórico de notificações** (NotificationCenter).

### Quando **não** usar

- Dados de sessão que deveriam sair ao fechar (sessionStorage).
- Dados sensíveis (tokens, CPFs completos, senhas).
- Dados que precisam ser compartilhados (vão para URL).
- Dados grandes (> 1MB) — use IndexedDB.

### Regras de chave

```
ds:<scope>:<userId>:<resourceId>:v<N>
```

Exemplos:

- `ds:table:u_123:notas:v1`
- `ds:sidebar:u_123:collapsed:v1`
- `ds:notifications:u_123:v1`

Por que incluir `userId`: múltiplos usuários no mesmo browser não devem ver preferências alheias.

### Schema versionado

Toda entrada tem `v: number` dentro do payload:

```ts
interface PersistedTableState {
    v: 1;
    filters: ColumnFiltersState;
    sorting: SortingState;
    columnOrder: string[];
    columnSizing: Record<string, number>;
    ...
}
```

Na leitura:

```ts
function loadTableState(tableId: string): TableState | null {
    const raw = localStorage.getItem(`ds:table:${userId}:${tableId}:v1`);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        const validated = tableStateSchema.parse(parsed);
        if (validated.v !== 1) return null;
        return validated;
    } catch {
        // Falha = descarte silencioso; usa defaults.
        return null;
    }
}
```

### Regras de gravação

- **Debounce** (100–500ms) para evitar I/O excessivo.
- **Try/catch** em `setItem` (quota exceeded, storage desabilitado).
- Em falha: **não quebra a UI** — fallback silencioso. O usuário pode perder preferência, mas não perde funcionalidade.

### Migração entre versões

Ao subir `v1 → v2`:

- Opção A (preferida): **descartar v1** silenciosamente. Usuário perde preferência; UX aceitável se mudanças são raras.
- Opção B: **migrar** — ler v1, transformar, gravar como v2. Usar quando preferências são críticas (ex: configurações customizadas do usuário em settings).

Nunca manter versões antigas em paralelo.

### Resiliência

**Input garantido é inválido na leitura.** Código de leitura deve assumir que:

- Chave pode não existir.
- Valor pode não ser JSON válido.
- JSON pode não bater com o schema.
- Schema pode ter versão diferente.

Em qualquer dessas situações: retorna `null`/defaults, **não lança erro**.

## 5. Multi-component actions

Ações em um componente afetam outro via **página como maestro**.

### Fluxo

1. Usuário clica no KPI "Pendentes".
2. KPI dispara `onClick` passado pela página.
3. Página atualiza `setFilters({ status: 'PENDING' })`.
4. DataTable recebe `filters` atualizado via props.
5. DataTable re-renderiza com dados filtrados.

### Anti-padrão — não fazer

```tsx
// ❌ KPI tenta sincronizar com Table via Context
<KPIContext.Provider value={{ filter, setFilter }}>
    <KPICard onClick={() => context.setFilter(...)} />
    <DataTable filter={context.filter} />
</KPIContext.Provider>
```

Isso oculta a comunicação. Para alguém lendo a página, não fica explícito que o KPI afeta a Table. Prefira estado na página passado explicitamente via props.

### Exceção

Contexto interno a um **compound component** é aceitável (ex: `TableContext` usado internamente pelo `DataTable` para comunicar `Toolbar`, `Body`, `Pagination`). A regra é: contextos não escapam do componente que os define.

## 6. Estados de componente — vocabulário padrão

Todo componente documenta seus estados com esse vocabulário:

| Estado | Quando ocorre | Tratamento |
|---|---|---|
| `idle` | Estado default, sem interação | Base visual |
| `hover` | Mouse/focus em cima | Feedback visual sutil |
| `active`/`pressed` | Durante click ou toggle on | Feedback mais forte |
| `focus` | Recebeu foco via teclado | Ring visível |
| `disabled` | Não interagível; tem motivo | Opacity 50%, cursor not-allowed, tooltip |
| `readonly` | Valor exibido, não editável | Visual normal, sem focus |
| `loading` | Operação async em andamento | Skeleton ou spinner; `aria-busy` |
| `empty` | Sem dados, sem filtros | Empty state com CTA |
| `no-results` | Sem dados, com filtros ativos | Mensagem + "Limpar filtros" |
| `error` | Operação falhou | Banner/mensagem + retry |

### Empty states

Todo componente de listagem tem **dois** empty states distintos:

1. **Empty genuíno**: nunca houve dados. Mensagem convida a criar/importar.
2. **No results**: há dados mas os filtros escondem tudo. Mensagem + botão "Limpar filtros".

Confundir os dois é erro comum. Mensagem "Nenhum resultado" quando o usuário ainda não cadastrou nada é frustrante.

### Error states

- **Error banner**: erro recuperável, preserva dados prévios. Ex: falha ao atualizar — mostra banner em cima, deixa dados antigos visíveis.
- **Error boundary**: erro irrecuperável (exception). Substitui conteúdo por mensagem + botão "Recarregar" + link "Reportar problema".

## 7. Tamanho mínimo de clique

- Área clicável mínima: **44×44px** em mobile, **32×32px** em desktop.
- Botões pequenos usam padding interno mesmo que o conteúdo (ícone) seja menor.
- Checkboxes: área clicável inclui a label, não só o quadrado.

## 8. Feedback de operações async

Fluxo padrão:

```
1. Usuário clica ação
2. Botão entra em loading (spinner + aria-busy)
3. Backend responde
4a. Sucesso → toast.success + atualização de estado
4b. Erro → toast.error + botão volta para idle + dados prévios preservados
```

### `toast.promise` é o atalho

```tsx
toast.promise(
    reprocessNotaAsync(id),
    {
        loading: 'Reprocessando nota...',
        success: 'Nota reprocessada',
        error: (err) => `Falha: ${err.message}`,
    },
);
```

Evita boilerplate de try/catch + três toasts separados.

## 8.1 Polling / atualização em segundo plano

Alguns cenários exigem que o componente **reconsulte dados periodicamente** enquanto o usuário observa (ex.: linhas com status em transição, fila processando). O DS suporta esse padrão com uma única diretriz visual.

### Regra visual

> **Os dados visíveis não somem enquanto o polling está em andamento.** A UI só é atualizada **no sucesso** de cada tick, substituindo os valores que mudaram. Em tick sem resposta, ou com erro, a UI mantém o último estado conhecido.

Consequências:

- **Não use skeleton** durante polling — skeleton é para ausência de dados, não para revalidação.
- **Não escureça / não bloqueie** a área (sem overlay, sem `aria-busy` global, sem spinner sobreposto) — o usuário continua lendo e interagindo.
- **Preserve seleção, scroll, linhas expandidas e células em edição** entre ticks. O diff é a nível de valor, não de árvore.
- **Indicador discreto é permitido**: um `dot` animado (`motion.pulse`) no toolbar, ou timestamp "atualizado há Xs" já é suficiente. Nunca algo que compita com o conteúdo.

### Quando é apropriado

- Lista/tabela com linhas em transição (ex.: `PROCESSING` → `FINALIZADA`).
- Dashboards de saúde/fila cujo valor muda em segundos.
- Progresso de jobs assíncronos visíveis.

### Quando **não** usar

- Dados que mudam raramente (minutos/horas) — um botão de refresh basta.
- Dados críticos para decisão sincrônica — use WebSocket ou evento explícito.
- Operações iniciadas pelo usuário — use loading de botão + toast de resultado.

### Regras de controle

- **Condição de parada**: o polling termina quando o critério que o ligou deixa de ser verdadeiro (ex.: nenhuma linha em `PROCESSING`). Sempre escreva o critério explicitamente; não faça polling "para sempre".
- **Page Visibility API**: pause quando `document.hidden` e retome ao voltar. Abas escondidas não devem bater no backend.
- **Erros silenciosos**: erros de tick individual são absorvidos. Só exponha erro ao usuário após falhas consecutivas (ex.: 3 seguidas) e mesmo assim sem remover dados antigos.
- **Intervalo mínimo**: 2s. Abaixo disso, use WebSocket.
- **A lógica de *quando* e *o que* consultar é da feature**, não do DS. O DS só garante que a atualização seja silenciosa e não destrutiva.

### Integração com componentes do DS

Componentes que expõem `data` via props (como `DataTable.Client` / `DataTable.Server`) aceitam a nova referência de dados a cada tick sem remount. Não passe `loading={true}` durante polling — isso acionaria skeleton. Use `onRefresh` / `lastUpdatedAt` da toolbar para dar o sinal de frescor.

```tsx
// feature-level
const { data, isPolling, lastUpdatedAt } = useNfPolling(filters);

<DataTable.Client
    data={data}
    loading={!data}                         // só no primeiro load
    lastUpdatedAt={lastUpdatedAt}
    toolbarIndicator={isPolling ? <PollingDot /> : null}
/>
```

## 9. Optimistic updates

Quando a ação tem alta probabilidade de sucesso e o feedback precisa ser imediato:

1. Atualiza UI imediatamente (estado local).
2. Dispara mutation.
3. Em sucesso: mantém.
4. Em erro: reverte UI + toast.error + oferece retry.

**Use com cuidado**: só em ações reversíveis e com feedback claro em caso de falha. Não use em operações críticas (pagamento, delete definitivo).

## 10. Data flow em DataTable

Padrão canônico de fluxo de dados:

```
API / DB
   ↓
Hook de fetch (feature-level) — useNotas()
   ↓
Página (NotasPage)
   ├─ filtros globais (URL)
   └─ filtros de tabela (localStorage via DataTable)
   ↓
DataTable.Client
   ↓ (onFiltersApplied)
visibleData (página consome)
   ↓
KPIs dinâmicos, gráficos, exports
```

O componente `DataTable` **não** faz fetch. Recebe `data` via props. Expõe `onFiltersApplied` para que a página possa derivar visualizações secundárias.

## 11. Naming convention de props

- **Eventos**: `on<Verb>` — `onClick`, `onChange`, `onSubmit`, `onFilterChange`.
- **Estado controlado**: par `value`/`onChange` ou `<state>`/`on<State>Change`.
- **Boolean**: positivo (`disabled`, `loading`, `required`, `active`).
- **Slots**: substantivo (`actions`, `footer`, `emptyState`, `header`).
- **Handlers async**: devem retornar Promise para que o DS detecte loading automaticamente.

### Exemplo

```tsx
interface ConfirmDialogProps {
    open: boolean;                                 // controlled state
    onOpenChange: (open: boolean) => void;         // paired callback
    title: string;                                 // data
    description: ReactNode;                        // slot-ish (rich content)
    confirmLabel: string;                          // data
    loading?: boolean;                             // state
    onConfirm: () => void | Promise<void>;         // async handler
    actions?: ReactNode;                           // slot
}
```

## 12. Responsive patterns

### Target declarado

Cada página declara target mínimo no spec:

- `desktop` (≥1024px) — operação de dados intensa.
- `laptop` (≥768px) — dashboards simples.
- `tablet` (≥640px) — leitura, aprovações.
- `mobile` (<640px) — fluxos auxiliares.

### Graceful degradation

- Tabelas: colunas `priority: 'low'` escondem primeiro; `medium` depois.
- Toolbars: actions quebram para segunda linha.
- Sidebar: vira bottom nav.
- Modais: ocupam mais altura em mobile.

### Breakpoints (de `tokens.md`)

```
mobile:    < 640px
tablet:    ≥ 640px
laptop:    ≥ 768px
desktop:   ≥ 1024px    ← target primário
wide:      ≥ 1280px
ultrawide: ≥ 1536px
```

## 13. Internacionalização (I18n)

Pt-br hard-coded é a escolha atual.

- **Identificadores** (props, variáveis, nomes de arquivo): inglês.
- **Conteúdo visível** (labels, mensagens, validações): pt-br.
- **Erros técnicos e logs**: inglês (seguem convenção do backend).
- **Máscaras**: brasileiras (CNPJ, CPF, R$, DD/MM/YYYY).

Se o produto precisar internacionalizar futuramente, o custo será conhecido e localizado — não tentaremos i18n-readiness agora.

## 14. Performance patterns

### Memoização

- Use `useMemo` apenas quando cálculo é caro (derivação complexa, filtro de lista grande).
- `React.memo` em componentes de linha de tabela que recebem props estáveis.
- Evite memoização prematura.

### Lista grande

- Virtualize (TanStack Virtual) acima de 2k itens.
- Paginate no servidor acima de 10k itens totais.

### Debounce

- Input de busca: 300ms.
- Mudança de filtro com fetch automático: 500ms.
- Gravação em localStorage: 100–500ms.

### Lazy loading

- Modais complexos: `React.lazy` + Suspense.
- Routes: Next.js automaticamente code-splita.
- Bibliotecas pesadas (gráficos, editores rich text): `dynamic(() => import(...))`.

## 15. Error boundaries

Coloque error boundaries em:

- Raiz da aplicação (último recurso).
- Ao redor de `AppShell.Main` (preserva header/sidebar mesmo se o conteúdo crashar).
- Ao redor de organisms complexos (DataTable, KPIGrid) — isola falhas.

Cada boundary mostra uma mensagem apropriada ao escopo ("Erro ao carregar tabela · Recarregar página") em vez da página inteira explodir.

## 16. Testing

- **Unit**: lógica pura e utils (formatters, masks, filters).
- **Component**: cada molecule e organism com React Testing Library. Testa comportamento, não implementação.
- **Integration**: fluxos completos (form fill + submit, filter + sort + paginate).
- **Visual regression**: Chromatic ou Playwright screenshots nas variantes-chave.
- **Accessibility**: axe em cada suíte (`@axe-core/react`).

## 17. DateFormatter / Timezone

Toda formatação de data/hora na UI usa a classe `DateFormatter` de `@/shared/lib/datetime`.

### API

```ts
import { DateFormatter } from '@/shared/lib/datetime';

DateFormatter.toBR(iso)      // DD/MM/YYYY HH:mm em America/Sao_Paulo
DateFormatter.toBRDate(iso)  // DD/MM/YYYY
DateFormatter.toBRTime(iso)  // HH:mm
```

### Regras

- Fuso fixo: `America/Sao_Paulo` (BRT/BRST) em todos os métodos.
- Entrada: `string | null | undefined`. Retorna `''` para `null`, `undefined` ou string vazia.
- Implementação usa `Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ... })`.
- **Nunca** use `new Date(...).toLocaleString()` sem `timeZone` explícito — o resultado varia por ambiente.
- Funções locais de formatação de data em componentes e features existentes devem ser migradas para `DateFormatter`.

## 18. Resizable Panels

Quando um componente precisa de três áreas de conteúdo cujos tamanhos o usuário pode ajustar, use `react-resizable-panels`.

### Quando usar

- Painel de teste de filtro (seletor / input / output).
- Comparadores lado a lado (ex: versão A vs versão B).
- Qualquer layout com 3 áreas interdependentes onde o usuário se beneficia de redimensionar.

### Layout responsivo

```tsx
// react-resizable-panels v4 exports: Group, Panel, Separator
import { Group, Panel, Separator } from 'react-resizable-panels';

// Desktop (>= lg): horizontal
// Mobile (< lg): vertical
<Group orientation={isDesktop ? 'horizontal' : 'vertical'}>
    <Panel defaultSize={20}>Seletor</Panel>
    <Separator className="w-1.5 bg-slate-100 hover:bg-orange-300/60 transition-colors" />
    <Panel defaultSize={35}>Input</Panel>
    <Separator className="w-1.5 bg-slate-100 hover:bg-orange-300/60 transition-colors" />
    <Panel defaultSize={45}>Output</Panel>
</Group>
```

- Breakpoint `>= lg` (1024px) → `orientation="horizontal"`.
- Breakpoint `< lg` → `orientation="vertical"`.
- A v4 usa `orientation` (não `direction`) e não requer alias nas importações.

### Persistência

Salve os tamanhos dos painéis em localStorage com chave versionada:

```
ds:filter-panel:<userId>:<resourceId>:v1
```

Schema Zod:

```ts
const panelSizesSchema = z.object({ p1: z.number(), p2: z.number(), p3: z.number() });
```

Falha ao ler → descarte silencioso, use `defaultSize` dos painéis.

### PanelResizeHandle

- Cor padrão: `bg-slate-100`.
- Hover: `bg-orange-300/60`.
- Para separadores verticais (horizontal layout): `w-1.5 cursor-col-resize`.
- Para separadores horizontais (vertical layout): `h-1.5 cursor-row-resize`.

## 19. Readonly Mode Banner

Componente `ReadonlyModeBanner` exibido quando o usuário está visualizando uma versão histórica (não a versão atual).

### Quando usar

- Em editores de dados versionados quando `viewingVersion` está definido.
- Banner substitui acesso às ações de edição (que ficam **ocultas**, nunca desabilitadas).

### Interface

```tsx
interface ReadonlyModeBannerProps {
    versionNumber: number;
    createdAt?: string;   // ISO string → formatado em BRT via DateFormatter.toBR
    createdBy?: string;   // email do autor
    onExit: () => void;   // retorna à versão atual
}
```

### Visual

- Fundo: `bg-amber-50`.
- Borda inferior: `border-b border-amber-200`.
- Ícone: `Eye` (lucide-react), cor `text-amber-600`.
- Texto: "Visualizando v{N}" + data em BRT + email do autor.
- Botão "Voltar para versão atual": `text-amber-700 hover:underline`.
- Botões de salvar, adicionar linha e importar ficam **ocultos** (não desabilitados) enquanto o banner está visível.

### Classificação Atomic

Molecule. Arquivo: `src/shared/components/atomic/molecules/ReadonlyModeBanner.tsx`.

> **Exceção `.Skeleton`:** `ReadonlyModeBanner` não implementa `.Skeleton` — o banner nunca entra em estado de carregamento (é renderizado de forma síncrona a partir do estado da página).

## 20. FilterSchema

Tipo que descreve os campos de entrada de um filtro. Usado pelo painel de teste de filtro e futuro endpoint de schema do backend.

### Tipos

```ts
export type FilterFieldType = 'string' | 'number' | 'boolean' | 'date';

export interface FilterSchemaField {
    name: string;
    type: FilterFieldType;
    label?: string;
    required?: boolean;
}

export interface FilterSchema {
    fields: FilterSchemaField[];
}
```

### Hook `useFilterSchema`

```ts
function useFilterSchema(
    uploadableId: string,
    filterName: string | null,
    tableColumns: ColumnDefinition[],
): FilterSchema
```

- Enquanto o backend não expõe `GET /uploadables/:id/filters/:filterName/schema`, o hook deriva o schema das colunas da tabela (`name = col.field`, `type = col.type || 'string'`, `label = col.label`).
- TODO: substituir pela chamada ao backend quando disponível.

## 21. Notificações de interações importantes — use `notify()`

**Regra inegociável**: toda interação do usuário que **modifica dados do sistema** ou que precisa de **confirmação de resultado persistível** usa `notify()`. Nunca chame `toast.*` diretamente nesses casos.

### Por que

`toast.*` dispara feedback efêmero (4–6s) que some para sempre. `notify()` faz as duas coisas: exibe o toast E grava no `NotificationCenter` (histórico persistente no sino). O usuário pode voltar para verificar o resultado de uma operação feita minutos atrás — coisa impossível com `toast.*` puro.

### Matriz de decisão

| Tipo de interação | Toast (`notify`) | Persiste no centro | Método |
|---|---|---|---|
| Ação do usuário bem-sucedida (salvar, reprocessar, criar, editar, excluir) | sim | **sim** | `notify('success', ...)` |
| Erro recuperável de ação do usuário (falha de reproc, erro de API) | sim | **sim** | `notify('error', ..., { action: { label: 'Tentar novamente', onClick } })` |
| Job de background concluído (ingestão, sync, batch) | não | **sim** | `notify('info', ..., { silent: true })` |
| Evento crítico do sistema (sessão expirando, limite atingido) | sim | **sim** | `notify('warning', ...)` |
| Feedback efêmero puro (copiar para clipboard, refresh de dados) | sim | **não** | `notify('success', ..., { persist: false })` |
| Erro de validação inline de formulário | **não** | **não** | aparece no campo; nunca toast |
| Loading de operação async | não | não | estado do botão + spinner |

### Como usar

```ts
import { notify } from '@/features/notifications/lib/notify';

// Sucesso — toast + centro
notify('success', 'Nota reprocessada', {
    description: `NF-${id} processada com sucesso.`,
    category: 'reproc',
    actionUrl: `/notas/${id}`,
    actionLabel: 'Ver nota',
});

// Erro com retry — toast + centro
notify('error', 'Falha ao reprocessar', {
    description: err.message,
    category: 'reproc',
    action: { label: 'Tentar novamente', onClick: () => handleReprocess(id) },
});

// Background — só centro, sem toast
notify('info', 'Ingestão concluída', {
    description: `${count} notas processadas`,
    category: 'ingestion',
    silent: true,
});

// Efêmero — só toast, sem centro
notify('success', 'Copiado', { persist: false });
```

### Regras específicas

- **Sempre passe `category`** quando a notificação persiste — os filtros do painel dependem disso.
- **Sempre passe `actionUrl`** quando há recurso navegável relacionado à ação (ex.: id da nota reprocessada).
- **Nunca persista dados sensíveis** (tokens, CPF completo, senhas) — o payload vai para localStorage.
- **Nunca duplique**: se o fluxo já usa `toast.promise`, substitua por `notify()` + lógica de loading manual. Não use os dois.
- **`category` obrigatória** para: `reproc`, `ingestion`, `accounting`, `auth`, `system`, `user` — ver tabela em `docs/application/flows/notificacoes.md §4`.

### Anti-padrão

```ts
// ❌ toast direto — não persiste, usuário perde o histórico
import { toast } from 'sonner';
toast.success('Nota reprocessada');

// ❌ toast.promise sem notify — feedback de background sem rastro
toast.promise(reprocessar(id), { success: 'Pronto' });

// ✅ correto
notify('success', 'Nota reprocessada', { category: 'reproc', actionUrl: `/notas/${id}` });
```

### Onde mora a spec completa

- Fluxo de negócio completo (categorias, schema, persistência, regras de leitura): `docs/application/flows/notificacoes.md`.
- Componentes visuais (Toast, NotificationCenter, NotificationPageCard): `docs/design-system/notification.md`.

## Do / Don't transversal

**Do**

- Centralize lógica na página. DS é visual, não de negócio.
- Persista preferências com chave versionada.
- Use URL para estado compartilhável; localStorage para preferências pessoais.
- Exponha callbacks suficientes para a página observar tudo que importa.
- Degrade gracefully em viewport pequeno.

**Don't**

- Não crie Context global que cruza DS e features.
- Não persista dados no DS sem schema versionado.
- Não dependa de ordem de renderização não-declarada.
- Não use `setInterval`/`setTimeout` não limpo em componentes.
- Não faça fetch em componente do DS.
