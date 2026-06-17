# Ontologia Financeiro — Changelog

> Versão **da ontologia** (domínio/regras). NÃO confundir com a versão **do app**
> (`/CHANGELOG.md` na raiz, FE+BE lockstep). Conceitos separados, cadências próprias.

## v0.1.0 (2026-06-10) — bootstrap

- Estrutura criada a partir do template `fechamento-processos` (v0.10.2).
- Carregado apenas o **charter** (P1-P7 / I1-I6), a estrutura de pastas e o design profile.
- Domínio **vazio por design**: entidades, ações, regras, integrações, ui-flows e workflows
  serão modelados incrementalmente via o pipeline (`/feature-new`).
- `_index.json` / `_coverage.json` zerados.

## Roadmap (pós-bootstrap)

1. `/feature-new` da primeira entidade do domínio financeiro (interview profundo, 4 axes).
2. (Re)documentar o contrato da integração Conexos em `ontology/integrations/conexos.md`
   — o código (`ConexosClient`) já está conectado; a ontologia está vazia.
