# Fase 35 — Despacho Aduaneiro / Nacionalização ⬜ (seed swagger)

**Narrativa.** Com a carga chegando ao país, registra-se a **Presença de Carga**, faz-se o **despacho
aduaneiro** (DI/DUIMP), e a **Nacionalização** libera a mercadoria após o desembaraço. É aqui que se
consolidam os tributos de importação (II/IPI/PIS/COFINS/ICMS) que depois aparecem em Encargos (fase 40).

## `imp237` — Presença de Carga (tag IMP_237, 9 paths)
`GET /api/imp237/{icgEspNumce}` → **`ImpPresencaCarga`**. Campos: `icgEspNumce` (nº CE-Mercante),
`rctCod`/`rctDesNome` (recinto alfandegado), `viaCod`/`viaDesNome` (via de transporte), `icgDtaCadastro`,
`icgVldStatus`. Sub: `list`, `consulta/list`.

## `imp230` — Nacionalização (tag IMP_230, 8 paths)
Sub-listas: `series/list`, `saldoDisponivel/list`, `lotes/list`. Controla o saldo nacionalizável por
série/lote (vínculo com estoque pré-ACD — ver `imp233` "Consulta controle de estoque pré-acd"). ⬜ schema
principal + tela ao vivo.

## `imp190` — Registro de DU-E / declaração (tag IMP_190, 94 paths)
`POST /api/imp190/list`, `item/list`, `textoComplConf/list`, `calcDueFrete`, `divDueFrete`. Documento de
declaração aduaneira (a confirmar DUIMP vs DU-E no contexto de importação da Columbia). ⬜ tela ao vivo.

## `imp038` — Solicitação de Numerário (SN) (tag IMP_038, 20 paths)
Sub-tela de pedido de numerário (recursos para pagar tributos/despesas do despacho — o despachante solicita
o numerário ao importador). ⬜ schema/tela.

**Pendente:** capturar ao vivo `imp237`/`imp230`; mapear o vínculo nacionalização → estoque (`imp233`) e
→ tributos (entram em `com017`, fase 40).

> **Nota de navegação (2026-06-17):** `imp237` (e provavelmente `imp230`) **não abrem como tela standalone**
> via `/imp237` — são **sub-telas** invocadas de dentro do Processo/DI (contexto de `priCod`). Para capturá-las
> ao vivo é preciso abrir um processo (`imp021`) e drilldown via aba/Mais Ações. Captura adiada (mais frágil).

**Ligações cronológicas.** ⬅ logística (fase 20, conhecimento/presença de carga). ➡ faturamento (fase 50)
e encargos/impostos (fase 40); a SN (`imp038`) gera títulos financeiros (fase 60).
