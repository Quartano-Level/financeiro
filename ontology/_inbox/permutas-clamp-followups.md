# Follow-ups — permutas clamp Cliente/Exportador (P1, não-bloqueantes)

Origem: `/feature-tweak permutas "line-clamp-2 + tooltip no hover em Cliente/Exportador"`
Branch: `fix/permutas-clamp-cliente-exportador`
Gate: DesignSystemReviewer (PASS, sem P0).

## FUP-1 (P1) — `title` nativo vs `Tooltip` do Design System
- **Finding:** `Campo` usa o atributo HTML `title` como tooltip do valor truncado
  (`ui.tsx`), em vez do molecule `Tooltip` (Radix) documentado em `docs/design-system/feedback.md`.
- **Por que P1 (não P0):** feedback.md não proíbe `title` nativo; ele é anunciado por leitores de
  tela e acessível no `:hover`/`:focus`. Escolha pragmática de v1 para campo presentacional.
- **Ação futura:** quando truncamento virar padrão em >1 componente, criar um molecule
  `TruncatedText`/`ClampedText` que encapsule `line-clamp-*` + `Tooltip` do DS (com gating de
  overflow: só mostra o tooltip quando o texto realmente cortou).

## FUP-2 (P1) — Princípio "data-first / never hide data behind clicks"
- **Finding:** `line-clamp-2` esconde o excesso do nome de Cliente/Exportador; o texto completo só
  aparece no hover (não descobrível por teclado num `<dd>` sem `tabindex`). Tensão com o princípio
  P1 de `docs/design-system/principles.md`.
- **Por que P1 (não P0):** o constraint de layout (grid 4 col) é real; nome é metadado, não a ação
  primária (invoice/processo/valor são os dados-chave). Fallback `—` sinaliza campo vazio.
- **Ação futura (uma das):** (a) alargar a coluna em `lg:` para exibir o nome inteiro sem clamp; ou
  (b) `Tooltip` do DS com suporte a `:focus` por teclado; ou (c) mover para painel de detalhe
  expansível. Agendar como refinamento de UX pelo DesignReviewer.

REPORT/KANBAN: n/a (gate rodado foi DesignSystemReviewer, não Regis-Review completo).
