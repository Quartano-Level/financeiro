# `_inbox/archive/` — interviews/tasks já materializados

Arquivos aqui pertencem a features **já mergeadas e materializadas na ontologia**. Foram
movidos para fora de `ontology/_inbox/` para **não dispararem** o gate de PR que bloqueia
quando há um `*-interview.md` com `entity_changed: true` no `_inbox/` **sem** o diff
correspondente em `entities/`. As entidades dessas features já existem — então o lugar
correto desses transcritos é o arquivo histórico.

| Arquivo | Feature | Materializado em |
|---------|---------|------------------|
| `permutas-painel-elegiveis-interview.md` | Frente I, Fatia 1 (painel elegíveis, READ-ONLY) | ADR-0004; entities adiantamento/invoice/declaracao-importacao/variacao-cambial/permuta-candidata; state-machine elegibilidade-permuta-candidata (commit df90fa6) |
| `permutas-painel-elegiveis-tasks.md` | idem (TaskScoper) | idem |
