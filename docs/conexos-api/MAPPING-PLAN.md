# Conexos — Plano Mestre de Mapeamento (estado, universo, estimativa, templates)

> Correção de premissa (2026-06-17): **sub-telas NÃO são polimento descartável**. A regra que fecha um
> raciocínio costuma morar nelas — foi uma sub-tela (`Mais Ações → Encargos Gerais`) que resolveu o FRETE
> INTERNACIONAL. Portanto sub-telas/abas/modais entram no escopo como cidadãs de primeira classe.

## 1. Estado atual (cobertura real vs universo)

> **Atualização 2026-06-19:** o objetivo central foi atingido. **37 telas confirmadas ao vivo** (40 fichas em
> `screens/`, incl. `_home` Dashboard) + a **camada 2 (`lifecycle/`) 00→90 COMPLETA** com índice. Os **5
> documentos-chave** (Invoice `log009`, DI `imp019`, ODF `imp002`, Processo `imp021`, NF `com297`) estão mapeados
> em **profundidade** (abas/Mais Ações/sub-telas + dados reais). Descobertas de negócio consolidadas no README:
> **modelo Importação por Conta e Ordem (C&O)**, cadeia de tributos TEC→Invoice→DI→Encargos, campo **IBS/CBS**
> (reforma), camada de **ROBÔS** (Siscomex/SEFAZ) no Dashboard. `ontology-bridge.md` reconciliado.

Universo (do swagger): **648 controllers · 10.750 endpoints · 37 telas nomeadas (tag) · 9.674 sub-rotas**
(potenciais sub-telas/abas/ações). Cobertura: **37 telas confirmadas ao vivo + ~9 semeadas**; **espinha 00→90
verificada ao vivo de ponta a ponta**.

| Domínio | ctrls | endpoints | telas nomeadas | live ✅ | seed 🟡 | % ao vivo |
|---|--:|--:|--:|--:|--:|--:|
| `arq` Arquivamento/GED | 18 | 171 | 1 | 0 | 0 | 0% |
| `cmn` Comum/Cadastros | 73 | 1030 | 4 | 1 | 1 | ~1% |
| `com` Comercial/Fiscal/Fat. | 168 | 3053 | 10 | 5 | 5 | ~3% |
| `ctb` Contabilidade | 47 | 634 | 2 | 0 | 0 | 0% |
| `fin` Financeiro | 71 | 886 | 1 | 0 | 2 | 0% |
| `fup` Follow-up | 21 | 149 | 0 | 0 | 0 | 0% |
| `ger` Geral/Robôs/Config | 68 | 781 | 3 | 0 | 0 | 0% |
| `imp` Importação/Despacho | 118 | 2762 | 13 | 1 | 7 | ~1% |
| `log` Logística | 40 | 1062 | 3 | 1 | 1 | ~3% |
| `pcp` PCP/Produção | 4 | 48 | 0 | 0 | 0 | 0% |
| `psq` Pesquisas/Relatórios | 6 | 60 | 0 | 1 | 5 | ~17% |
| `trk` Tracking | 5 | 41 | 0 | 0 | 0 | 0% |
| `wrk` Workflow | 9 | 73 | 0 | 0 | 0 | 0% |
| **TOTAL** | **648** | **10750** | **37** | **9** | **21** | **~1,4%** |

> A tabela por domínio acima é o snapshot inicial (9 live) — os contadores por linha estão defasados; a fonte
> de verdade dos status é o **`_registry.json`** (gerado), hoje **37 live / ~9 seed / ~602 stub**.

**Leitura honesta:** o **caminho cronológico de alto valor (espinha 00→90) está coberto ao vivo e em profundidade**
— é onde a operação acontece e onde estavam as perguntas do negócio. Em termos de *universo completo* (648
controllers), a grande maioria continua catalogada só no nível de inventário/seed (CRUDs de cadastro, lookups,
relatórios `psq*`, robôs `fup*`, cauda `trk/wrk/pcp`). **Isso é esperado e adequado:** o valor está na espinha,
não na cauda. Expandir cobertura bruta = T2/T3 abaixo (barato em swagger, caro em confirmação ao vivo).

## 2. Universo organizado em camadas (tiers de prioridade)

- **T0 — Espinha do processo (✅ feito):** fases 00→90. ~9 live + 21 seed.
- **T1 — Operacional rico (sub-telas críticas):** os 174 controllers com ≥15 sub-rotas (telas com abas/
  Mais Ações/modais). Inclui `imp021`(250), `cmn025`(276), `log009`(157), `com034`(144 Pedidos de Venda),
  `com006`(125), `com043`(107), `com302`(100 financeiro), `imp088`(97 frete), `imp052`(168), `imp002`(109),
  `imp019`(89), `log091`(134), `imp223`(136), `com296/297/298/299`, `com017`, `com311`. **Aqui moram as
  regras que fecham raciocínio.** É a prioridade real.
- **T2 — Cadastros/config/lookup:** `cmn*` (CFOP, moedas, classificadores), `ger*` (config/robôs), `ctb*`
  (plano de contas, conciliação), `arq*` (GED), `fup*`. CRUD simples, baixo raciocínio, mas fecham o universo.
- **T3 — Cauda longa:** `trk*`, `wrk*`, `pcp*` (18 controllers).

## 3. Estimativa de esforço

Unidade = **tela ou sub-tela mapeada ao vivo** (rótulo↔atributo + endpoint + schema). Calibração das 9 telas
desta sessão: Pesquisa simples ≈ 0,5 tick; Edição+abas ≈ 2–4 ticks; cada sub-tela/modal ≈ 0,3–0,5 tick.
1 tick ≈ 20–30 min de sessão logada.

| Bloco | Qtde estimada | Esforço |
|---|--:|--:|
| **Seed swagger de TODOS os 648 controllers** (endpoints+schema, scriptado, sem navegador) | 648 | **~2 ticks** (batch) |
| T1 telas principais ao vivo | ~70 | ~50 ticks |
| **T1 sub-telas críticas ao vivo** (Mais Ações/abas/modais; ~5/tela rica) | ~350 | ~150 ticks |
| T2 cadastros/config ao vivo (seed + confirmação rápida) | ~200 | ~80 ticks |
| T3 cauda + revisão/consistência | ~30 | ~15 ticks |
| **TOTAL ao vivo** | ~650 unid. | **~295 ticks** |

Tradução: **~120–150 h de trabalho de sessão logada** (≈ 25–35 sessões de 8 ticks). A parte de **swagger
(catálogo de endpoints+schema do universo inteiro) é barata e cabe em ~2 ticks scriptados** — dá pra
"mapear todo o universo" no nível de API quase já. O caro e indispensável é a **confirmação ao vivo das
sub-telas** (T1), que é onde o ERP esconde a semântica de negócio.

## 4. Template padrão de ficha de tela (usar em toda iteração)

```markdown
## <Tela> (`<ctrl>`) — "<título exibido na UI>"  [✅ live | 🟡 seed]
**Como chegar:** home → /<ctrl> → Pesquisa → (filtro) → Editar → /<ctrl>#/cadastro/{...}
**Sub-telas:** rodapé Mais Ações → [<opção> → endpoint], abas [<aba> → endpoint]
**Endpoints:**
  POST /api/<ctrl>/list                      ← Pesquisa (CnxListRequest)
  GET  /api/<ctrl>/{id}                       ← Edição → resp $ref = <DTO>
  <verbo> /api/<ctrl>/<sub>/{...}             ← <sub-tela>, resp <DTO>
**Filtros (rótulo ↔ campo):** <UI> = <attr> · ...
**Grid/colunas (rótulo ↔ campo):** <coluna> = <attr> · ...
**Schema <DTO> (campos-chave):** <attr> (tipo) — <significado> · ...
**Valores reais (exemplo):** <doc/processo> → <campo> = <valor>
**Ligações cronológicas:** ⬅ <fase origem> · ➡ <fase destino>
**Notas/quirks:** <ex.: sub-tela só via contexto de processo; renderer lento; etc.>
```

## 5. Playbook / padrões (o "como" repetível)

1. **Seed primeiro (barato):** script lê o controller no swagger → lista endpoints, acha `GET /{id}` e
   `POST /list`, extrai `$ref` da resposta e os campos do DTO. (ver `C:/tmp/cnx_phase*.py` como base.)
2. **Navegar com full-load:** `home → /ctrl` (hash não recarrega). Pesquisa carrega limpa; Edição via Editar.
3. **Capturar no ato:** `read_network_requests urlPattern:"/api/<ctrl>"` logo após a ação (limpar antes).
4. **Sub-telas (CRÍTICO):** no rodapé da Edição, **Mais Ações** e as **abas** abrem os modais onde estão as
   regras (ex.: Encargos Gerais, Despesas, Eventos). Mapear cada um = 1 sub-ficha.
5. **Casar com swagger:** path ao vivo (com ids) → template `{param}` → `$ref` → DTO → glossário (`_glossary.md`).
6. **Registrar:** ficha em `lifecycle/` (ou `screens/<ctrl>.md` para fora da espinha) + `_progress.md` + glossário.

### Armadilhas conhecidas (já catalogadas — corrigidas ao vivo 2026-06-19)
- **Roteabilidade tem 3 desfechos** (testar por nav direto `/ctrl`): **Pesquisa** = standalone roteável (inclui
  imp* de **cadastro**: imp013/imp019/imp052/imp174/imp237/imp190); **página em branco** = sub-tela pura
  (imp088); **shell + toast 404** = sub-tela contextual que precisa de id (imp230 = Adm. Temporária, via
  `imp021 → Mais Ações → Saldo Adm. Temporária`); **404 puro** = embutido (com068/com308/com311); **redirect
  `/home`** = widget/robô do Dashboard (fup*). ⚠️ Premissa antiga "todo imp* de despacho é sub-tela" era **falsa**.
- **Drilldown validado:** nav direto `/ctrl#/cadastro/{ids}` OU Pesquisa→**Limpar** (p/ listar docs com dados)→
  duplo-clique/checkbox+**Editar**→abas/Mais Ações; ler `read_network_requests` no ato p/ os endpoints reais.
- **Telas vazias p/ Columbia** (modelo C&O): `imp052` (Registro DI) e `com034` (Pedido de Venda) — não usadas.
- **Replicar API por fetch/XHR é bloqueado** pelo sandbox da extensão → deixar o app disparar e observar.
- **Renderer trava** em telas pesadas/relatórios → aguardar mais, ou recarregar; não martelar.
- **Filtros viram `campo!OP=valor` na URL** (`priEspRefcliente!LIKE=...`) — fonte grátis de nome de campo.
- **MAX_SESSIONS**: sessão `MPS_FRANCINEI` compartilhada com produção — **expira ~a cada 10 min**; ao cair, pausar
  e pedir relogin ao Yuri; após relogin re-aplicar `resize_window 1600x1000`. Manter lotes curtos.

## 6. Sequência recomendada (ordem de execução)

1. **Catálogo swagger do universo (T-all)** — ~2 ticks scriptados → cobre 648 controllers no nível de API.
2. **T1 por subdomínio cronológico**, esgotando **cada tela + TODAS as suas sub-telas** antes de seguir:
   despacho (`imp002/019/052/088/223`) → comercial/fiscal (`com034/296/297/298/299/302/311`) →
   logística (`log009/091/012`) → financeiro (`fin*`) → cadastros ricos (`cmn025/com006/com043`).
3. **T2 cadastros/config** em lote (seed + confirmação rápida de tela).
4. **T3 cauda** + passo de **consistência/revisão** (glossário fechado, ligações cronológicas completas).

> Esta é a base para, ao final, gerar a **documentação geral do Conexos** (narrativa operacional ponta a
> ponta) e, se desejado, um **MCP do Conexos** (tools tipadas reusando os endpoints+DTOs catalogados).
