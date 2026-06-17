# Design Taste Profile

**Atualizado por:** OntologyCurator / DesignConsultant  
**Última atualização:** 2026-06-10

## Direção estética

Sistema financeiro B2B para operadores especializados (controller, financeiro). Não é produto B2C.

**Valores:**
- **Clareza > Beleza** — o usuário precisa encontrar e agir, não admirar
- **Densidade informacional** — tabelas densas são boas; não "abrir espaço" artificialmente
- **Confiança implícita** — paleta conservadora, sem gamification

## Tokens preferidos

Derivados de `frontend/docs/design-system/`. Não inventar tokens fora do design system.

- Background primário: surface neutro (não branco puro)
- Status de atenção: amber/orange (atenção, não erro)
- Status de sucesso: green
- Status neutro: gray
- Ações destrutivas: sempre confirmar dialog

## Padrões de componente

| Contexto | Componente |
|----------|-----------|
| Listas de registros | Tabela com paginação server-side |
| Status | Badge colorido (não ícone isolado) |
| Ações principais | Button variant=default |
| Ações secundárias | Button variant=outline |
| Ações destrutivas | Button variant=destructive + Dialog confirm |
| Formulários de config | Form com labels em português |

## Anti-patterns identificados

- Não usar cards onde tabela resolve
- Não adicionar ícones decorativos sem função
- Não truncar valores monetários — mostrar completo com separador de milhar
