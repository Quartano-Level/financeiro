# Component Mapping: Ontologia → Componentes

Mapeamento de **conceitos genéricos** da ontologia para componentes Radix/shadcn do design system.
As linhas abaixo são padrões reutilizáveis — conceitos específicos do domínio financeiro entram aqui
conforme as entidades são modeladas via `/feature-new`.

| Conceito da ontologia | Componente | Variante/notas |
|-----------------------|-----------|----------------|
| Status de uma entidade | `Badge` | cor por status (ver taste-profile) |
| Lista de registros | `DataTable` | server-side pagination, sort |
| Detalhe de um registro | `Card` + seções | sem tabs desnecessárias |
| Ação que muda estado | `Button` + `AlertDialog` | confirmar antes de executar |
| Formulário de entrada | `Form` + `Input` + `Select` | validação Zod no frontend |
| Histórico / linha do tempo | `Timeline` (custom) | baseado em `ul` com CSS |
| Filtros de lista | `Popover` + `Checkbox` | multi-select por popover |
| Preview / detalhe lateral | `Sheet` (slide-over) | não modal — preserva contexto |
| Notificações de erro | `Toast` (sonner) | dismiss automático em 5s |
| Loading states | `Skeleton` | apenas em primeira carga |
| Estado vazio | `EmptyState` | sempre explica o porquê + próximo passo |
| Indicador numérico | `KpiCard` | métrica única em destaque |
