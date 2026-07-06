---
# === IDENTIDADE (máquina) ===
controller: comNNN              # chave única = controller do ERP
ui_title: "Título exibido"      # texto do breadcrumb/aba na UI
route: /comNNN                  # rota base (full-load: home → esta rota)
phase: NN                       # fase do lifecycle (00..90) a que pertence
domain: com                     # arq|cmn|com|ctb|fin|fup|ger|imp|log|pcp|psq|trk|wrk
status: stub                    # live (verificado ao vivo) | seed (só swagger) | stub (só inventário)
verified_at:                    # data ISO da última confirmação ao vivo (vazio se seed/stub)
# === NAVEGAÇÃO (máquina) ===
reach:                          # passos exatos para chegar (cada item = um passo verificado)
  - "home → /comNNN"            # abre a Pesquisa
  - "Pesquisa → filtro <campo> → Pesquisar → selecionar linha → Editar"
  - "→ /comNNN#/cadastro/{...}" # rota da Edição
sub_screens:                    # modais/abas/Mais Ações — ONDE moram regras de negócio
  - name: "Encargos Gerais"
    reach: "rodapé Mais Ações → Encargos Gerais"
    screen: comNNN              # controller da sub-tela (se tiver) p/ cross-ref
    endpoint: "GET /api/.../{...}"
# === ENDPOINTS (máquina) ===
endpoints:
  - { method: POST, path: /api/comNNN/list, role: pesquisa, request: CnxListRequest, response: <DTO> }
  - { method: GET,  path: /api/comNNN/{id}, role: edicao,   response: <DTO> }
# === MAPEAMENTO DE CAMPOS (máquina) ===
filters:                        # filtros da Pesquisa: rótulo da UI ↔ atributo do schema
  - { label: "Referência Externa", field: priEspRefcliente }
columns:                        # colunas do grid principal
  - { label: "Valor", field: dprPreTotalbruto }
# === LIGAÇÕES (máquina) ===
links:
  from: [<controllers que levam aqui>]
  to:   [<controllers que esta tela alimenta>]
related_ontology: [<EntidadeOntologia>]
---

## O que esta tela faz
<Narrativa semântica: papel no negócio, quando é usada, o que representa.>

## Como chegar (receita de navegação)
<Passo a passo em prosa, incluindo variações; espelha `reach` do frontmatter.>

## Layout visual (marcos para computer-use)
- **Header:** <campos do cabeçalho, da esquerda p/ direita>
- **Abas:** <Documentos | Itens | ...>
- **Grid/seções:** <PRODUTOS, RESUMO, ...>
- **Rodapé:** <botões: Salvar · Listagem · ... · Mais Ações▾ (opções)>
- **Barra lateral direita:** <ícones de atalho e seus tooltips>

## Sub-telas em detalhe
### <Nome da sub-tela> — `<reach>`
<endpoint, DTO, colunas↔campos, o que resolve.>

## Schema da resposta (`<DTO>`)
| Campo | Tipo | Significado |
|---|---|---|

## Exemplo real (verificação)
<doc/processo usado, valores observados — prova de que foi ao vivo.>

## Quirks / armadilhas
<ex.: sub-tela só via contexto de processo; renderer lento; filtro server-side ignorado; etc.>
