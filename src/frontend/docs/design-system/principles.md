# Diretrizes Gerais

Este arquivo define os princípios que todos os componentes e páginas devem seguir. Quando existir conflito entre um requisito funcional e um princípio aqui, o princípio prevalece — ou a divergência é justificada por escrito no spec do componente.

## 1. Data-first

O usuário final é um operador que precisa analisar muitos dados e tomar decisões rápidas. A interface serve à informação, não ao contrário.

**Regras:**

- Informação primária ocupa o centro visual. Ornamentos e molduras são discretos.
- Tabelas mostram o máximo de linhas úteis. Padding é econômico.
- Gráficos e KPIs trazem o número em destaque; legendas e eixos ficam em segundo plano.
- Nunca escondemos dados atrás de cliques desnecessários. Se o usuário precisa daquilo, está visível ou a um clique de distância — nunca a três.
- Filtros, ordenações e agrupamentos estão disponíveis por padrão em qualquer visualização de dados.

**Aplicação prática:**

- `DataTable` abre com todas as colunas úteis visíveis.
- `KPICard` exibe o valor numérico com a maior tipografia do card.
- `PageHeader` descreve a página em uma linha; subtítulo explica o contexto em outra.

## 2. KPIs sempre

Toda página de listagem/análise de entidade começa com um conjunto de KPIs que resumem o estado atual.

**Regras:**

- KPIs refletem filtros globais da página (ex: período). Mudar o filtro atualiza os KPIs.
- Um KPI clicável filtra a tabela/visualização abaixo. A seleção é visível (estado `active`).
- KPIs são agrupados em `KPIGrid` com espaçamento consistente.
- Cada KPI tem título curto (≤3 palavras), valor em destaque e, se útil, informação secundária (delta, percentual, tendência).

## 3. Multi-component actions

Ações em um componente podem afetar outros. Este é um padrão, não um acidente.

**Regras:**

- A **página é o maestro**. Estado de filtros, seleção e dados vive no componente de página.
- Componentes expõem **dados e eventos**, nunca escutam outros componentes diretamente.
- Nenhum componente do design system importa outro via singleton global, event bus ou context compartilhado entre si.
- Comunicação entre componentes é feita pela página via props.

**Exemplo canônico:**

```tsx
function NotasPage() {
    const [filters, setFilters] = useState<NotasFilters>({});
    const [period, setPeriod] = useState<DateRange>(defaultPeriod);
    const { data, isLoading } = useNotas({ ...filters, ...period });

    return (
        <DashboardLayout>
            <PageHeader
                title="Panorama geral"
                subtitle="Monitoramento e reprocessamento de notas fiscais"
            />
            <GlobalFilterBar value={period} onChange={setPeriod} />
            <KPIGrid>
                <SimpleKPI
                    label="Todas as notas"
                    value={data?.total}
                    active={filters.status === undefined}
                    onClick={() => setFilters({ status: undefined })}
                />
                <SimpleKPI
                    label="Pendentes"
                    value={data?.pending}
                    active={filters.status === 'PENDING'}
                    onClick={() => setFilters({ status: 'PENDING' })}
                />
            </KPIGrid>
            <DataTable.Client
                data={data?.rows}
                loading={isLoading}
                filters={filters}
                onFiltersChange={setFilters}
            />
        </DashboardLayout>
    );
}
```

A página resolve a orquestração. `SimpleKPI` e `DataTable` não se conhecem.

## 4. Ações claras

O usuário não deve ficar em dúvida sobre o que vai acontecer ao clicar.

**Regras:**

- Ações destrutivas ou que alteram o sistema passam por modal de confirmação. O botão de confirmação repete o verbo (ex: "Excluir", "Reprocessar") — nunca apenas "OK".
- Botões primários e secundários são visualmente distinguíveis. Só há um botão primário por contexto (linha, modal, toolbar, página).
- Ações assíncronas exibem estado `loading` no botão durante a execução.
- Ações produzem feedback visível: toast de sucesso/erro, atualização do estado visual, badge, contagem.
- Mensagens de erro são específicas e acionáveis. "Algo deu errado" é proibido. Inclua o código do erro, o recurso afetado e a ação sugerida.
- Todo elemento clicável tem estado `hover` distinto.
- `cursor: pointer` aparece em todo elemento clicável; `cursor: not-allowed` em disabled (mas com tooltip explicando).

## 5. Tudo explicado

Navegação, campos, ações e estados não podem depender de conhecimento prévio.

**Regras:**

- Todo item de sidebar tem tooltip com título + explicação breve (≤120 chars).
- Toda página tem título + subtítulo. O subtítulo descreve o propósito da página em uma frase.
- Conceitos de negócio (status de NF, tipos de data, etc) têm botão `?` ao lado que abre um `HelpPopover` com explicação.
- Campos de formulário têm `label` visível (não apenas placeholder) e `helpText` opcional.
- Badges e indicadores têm tooltip explicando o que representam (ex: badge "PROCESSANDO" hover → "NF enviada para contabilização no Conexos").
- Estados vazios (empty states) explicam por que está vazio e o que fazer.

## 6. Environment-aware theming

Cada ambiente de implantação (prd/uat/dev) tem uma paleta visualmente distinta para servir de guard-rail contra erros operacionais (ex: operar em UAT pensando ser PRD).

**Regras:**

- Tema é determinado no build-time ou boot-time da aplicação, não é alternável pelo usuário.
- A mudança é sutil mas perceptível: cor de primária, header e acentos muda; estrutura e tipografia são idênticas.
- O nome do ambiente aparece discretamente no header em UAT e DEV; em PRD não aparece (comportamento normal).
- Detalhes em `tokens.md`.

## 7. Responsividade graceful

O produto é desktop-first. Mobile é suportado em fluxos específicos (login, leitura de notificações, aprovação rápida), não em operação intensa de dados.

**Regras:**

- Toda página declara seu **target mínimo**: `desktop` (≥1024px) para operação de dados, `mobile` (≥375px) para fluxos auxiliares.
- Tabelas com muitas colunas mantêm-se como tabela em mobile com scroll horizontal + colunas prioritárias sempre visíveis.
- Formulários longos empilham verticalmente em mobile sem perda de usabilidade.
- Sidebar vira `BottomNav` em mobile.
- Breakpoints nomeados em `tokens.md`.

## 8. Acessibilidade WCAG 2.1 AA

Conformidade não é opcional. Checklist em `accessibility.md`.

**Regras:**

- Todo componente interativo é navegável por teclado.
- Todo elemento de UI tem rótulo acessível (texto visível, `aria-label`, ou `aria-labelledby`).
- Contraste mínimo 4.5:1 em texto normal e 3:1 em texto grande e ícones informativos.
- Foco visível (anel colorido) em todo elemento focável.
- `prefers-reduced-motion` desabilita animações não essenciais.
- Modais têm focus trap; fechamento retorna foco ao elemento que os abriu.
- Estados não são transmitidos apenas por cor (sempre há ícone, texto ou forma acompanhando).

## 9. Persistência resiliente

Preferências do usuário que sobrevivem entre sessões devem ser resilientes à evolução do código.

**Regras:**

- Qualquer persistência em localStorage usa chave com `userId` e versão (`ds:table:<userId>:<tableId>:v<N>`).
- Schema validado com Zod na leitura. Falha = descarte silencioso, usa default.
- Qualquer alteração no formato incrementa o número de versão.
- Persistimos: filtros de tabela, ordenação, ordem e largura de colunas, visibilidade de colunas, densidade, page size, estado colapsado/expandido de sticky columns, estado da sidebar.
- **Não persistimos**: página atual da paginação, seleção de linhas, scroll position, conteúdo de campo em edição.
- Filtros **globais** da página (ex: period) vão para **URL query string**, não localStorage — para deep-linking e compartilhamento.
- Detalhes em `patterns.md`.

## 10. Feedback obrigatório

Nenhuma ação fica em silêncio.

**Regras:**

- Ação síncrona bem-sucedida: estado visual muda (ex: botão fica `active`, item muda de cor).
- Ação assíncrona: botão em `loading`, depois `toast.success` ou `toast.error`.
- Ação em lote: `toast.promise` com mensagem "Reprocessando 12 notas..." → "12 notas reprocessadas" ou "3 de 12 falharam".
- Erros de sistema (rede, 500): toast com mensagem amigável + botão "Tentar novamente" quando aplicável.
- Erros de validação: inline no campo do formulário, não em toast.

## 11. Composição por compound components

Componentes complexos expõem uma raiz + partes nomeadas. Uma versão pré-configurada encapsula defaults.

**Regras:**

- Todo organismo complexo tem forma compound (`<Component.Root>`, `<Component.Header>`, ...) e forma pré-configurada (`<SimpleComponent>`).
- A forma pré-configurada é preferida quando a customização não é necessária.
- A forma compound permite substituir partes sem herdar o resto.
- Slots opcionais são declarados como `ReactNode` em props: `<DataTable toolbar={<CustomToolbar />} />`.
- Detalhes e exemplo canônico em `atomic-classification.md`.

## 12. Componentes expõem, nunca impõem

**Regras:**

- Nenhum componente do DS contém lógica de fetch.
- Nenhum componente do DS contém chamada a API.
- Nenhum componente do DS conhece endpoints, autenticação ou entidades de domínio.
- Componentes recebem `data` via props e emitem mudanças via callbacks (`onFilterChange`, `onSortChange`, `onSelectionChange`).
- Lógica de negócio e fetch vivem em `hooks/` e `services/` fora do DS, consumidos pela **página**.

Exceção: primitivos utilitários que lidam com `localStorage` podem fazer I/O local — desde que isso seja a função do componente (ex: `NotificationCenter` persiste notificações por definição).

## 13. Do / Don't transversal

### Do

- Prefira defaults sensatos. Se um componente tem feature, ela vem ligada salvo quando explicitamente contraproducente.
- Use tokens em vez de valores literais (`var(--color-primary)`, não `#FF8C42`).
- Documente todo `onClick` destrutivo com confirmação.
- Teste componentes com teclado e leitor de tela antes de fechar.
- Reutilize atoms existentes antes de criar novos.

### Don't

- Não crie props booleanas para comportamentos mutuamente exclusivos — use enum/union.
- Não passe estado por Context interno ao DS (exceto dentro de um compound, quando necessário).
- Não adicione `if (process.env.NODE_ENV === ...)` no DS — o DS é o mesmo em qualquer ambiente.
- Não use cor como único sinal de estado.
- Não esconda funcionalidade por trás de right-click sem alternativa via teclado/botão visível.
- Não dispare fetch em efeito de componente do DS — a página fornece os dados.
