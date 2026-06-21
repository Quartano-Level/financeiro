---
name: ClienteFiltro
type: entity
ontology_version: "0.2"
implementation_status: implemented
status: draft
owners: [yuri]
related_files:
  - src/backend/migrations/0013_cliente_filtro.sql
  - src/backend/migrations/0011_adiantamento_importador.sql
  - src/backend/domain/repository/permutas/ClienteFiltroRepository.ts
  - src/backend/domain/service/permutas/EleicaoPermutasService.ts
  - src/backend/routes/permutas.ts
  - src/frontend/app/permutas/clientes-filtro/page.tsx
properties:
  - pesCod
  - importador
  - ativo
  - criadoPor
  - criadoEm
  - atualizadoEm
relationships:
  - "ClienteFiltro 1—N Adiantamento (via pesCod = importador do processo; roteia os adtos desse importador)"
  - "ClienteFiltro influencia a transição da PermutaCandidata → estado permuta-manual (ver state-machine)"
last_review: 2026-06-21
universality_evidence:
  - "ADR-0007 — cadastro de cliente-filtro (por IMPORTADOR) que roteia adtos para permuta-manual"
  - "Columbia + INOX-TECH (priCod=1153): importador recorrente cujos adtos não casam no próprio processo (validado com o time 2026-06-20)"
  - "Conceito de domínio: trading mantém uma lista de importadores cujos adiantamentos são SEMPRE reconciliados manualmente cross-process — universal em form (regra de roteamento configurável); os valores específicos (quais importadores) são CONFIGURAÇÃO do cliente"
---

# ClienteFiltro (configuração de roteamento)

> Um **importador cadastrado** (chave `pesCod`, do `imp021`) cujos adiantamentos a
> pipeline **roteia para o estado `permuta-manual`** em vez de `bloqueada`. É a entidade
> de **configuração** que materializa a regra de roteamento da ADR-0007.

## Natureza: estrutura na ontologia, valores na configuração

A **forma** desta entidade é universal e pertence à ontologia: uma trading mantém uma
lista de importadores cujos adiantamentos **não casam no próprio processo** (a invoice
vem de outro processo) e são, portanto, reconciliados **manualmente cross-process**. A
existência de uma regra de roteamento configurável por importador é domínio.

Os **valores** — *quais* importadores estão na lista — são **configuração específica do
cliente** (Columbia), mantidos pelo analista no frontend e persistidos em
`cliente_filtro`. A ontologia modela o conceito; a tabela carrega as instâncias.

## Por que filtrar por IMPORTADOR (e não por "sem D.I")

ADR-0007: o traço definidor é o **CLIENTE**, não a ausência de D.I. Filtrar por "sem D.I"
pegaria 93 adtos que não são o caso e perderia exceções. "Sem invoice no processo" ≠ "sem
D.I"; e o mesmo importador pode ter vários processos.

## Propriedades

| Propriedade | Tipo | Origem (coluna) | Notas |
|-------------|------|-----------------|-------|
| `pesCod` | string | `cliente_filtro.pes_cod` (PK) | Chave natural do importador no Conexos (`imp021`). PK p/ o CRUD ser idempotente (UPSERT). |
| `importador` | string? | `cliente_filtro.importador` | Nome do importador (exibição/seletor do cadastro). |
| `ativo` | boolean | `cliente_filtro.ativo` (default `true`) | Liga/desliga o roteamento sem apagar o cadastro. Indexado. |
| `criadoPor` | string? | `cliente_filtro.criado_por` | Auditoria — analista que cadastrou. |
| `criadoEm` | Date | `cliente_filtro.criado_em` | Auditoria. |
| `atualizadoEm` | Date | `cliente_filtro.atualizado_em` | Auditoria. |

## Regra de roteamento (na eleição)

Para um adiantamento cujo importador (`pesCod`) está no cadastro **ativo**:

```
BLOQUEADA && pago && saldoPermutar > 0  →  permuta-manual
```

Os demais não são tocados: `nao-pago` / `sem-saldo` continuam `bloqueada`;
`elegivel` / `casamento-manual` / `ja-permutado` ficam como estão. **Gate 4 (D.I) NÃO é
exigido** na permuta-manual — a D.I/data-base virá da **invoice escolhida** na alocação
(ADR-0007 §3). Implementado em `EleicaoPermutasService` (override de roteamento); o
importador é hidratado na eleição via `imp021` e persistido em
`permuta_adiantamento.pes_cod`/`importador` (migration `0011`).

## Endpoints (CRUD)

- `GET /permutas/cliente-filtro` — lista o cadastro.
- `POST /permutas/cliente-filtro` — UPSERT por `pesCod`.
- `DELETE /permutas/cliente-filtro/:pesCod` — remove (ou desativa).
- `GET /permutas/importadores` — seletor de importadores (do `imp021`) para o cadastro.

## Fora de escopo

- A **alocação cross-process** em si (busca de invoice + N:M) é a `Permuta` (ADR-0008); o
  `ClienteFiltro` apenas **roteia** o adto para a fila `permuta-manual`.
- **Sem escrita no ERP** (I4) — o cadastro é tabela própria.
