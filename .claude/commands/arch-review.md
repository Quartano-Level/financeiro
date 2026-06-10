Deprecated alias for /regis-review — Architecture Review (Bass & Clements 8-QA pipeline).

> **Este comando foi renomeado.** `/arch-review` agora é apenas um **alias deprecado** de
> `/regis-review` (homenagem ao professor de arquitetura de software). Ele executa exatamente
> o mesmo pipeline, sem nenhuma diferença de comportamento.

## O que fazer

Execute o pipeline canônico definido em `.claude/commands/regis-review.md`, repassando
`$ARGUMENTS` verbatim (scopes `backend`/`frontend`/`infra`, flag `--quick`, etc.).

Prefira `/regis-review` daqui em diante; este alias existe apenas para compatibilidade com
referências antigas (cards, comentários de proveniência no código, documentação histórica).
