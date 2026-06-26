# Shared Baseline Metrics — Regis-Review 2026-06-26-0058

> Coletado do checkout `main` @ `4e59fec` (v0.8.3). LOC/contagens EXCLUEM `node_modules`, `dist`, `.next`.
> Escopo: **all** (backend + frontend). **Sem `infra/`** (Render/Vercel/Supabase hoje; Terraform é alvo).

## Tamanho
| Métrica | Valor | Fonte |
|---|---|---|
| Backend src LOC (não-teste) | **13.228** | `find src/backend -name '*.ts' -not -name '*.test.ts'` (limpo) |
| Backend LOC por camada | service **4627** · repository **1852** · client **2527** · libs **731** · routes **846** · jobs **80** | find por dir |
| Backend test files / testes | **44 arquivos** / **480 testes** (44 suites) verde | `npm test` |
| Frontend src LOC (não-teste) | **6.980** | find (limpo) |
| Frontend test files / testes | **11 arquivos** / **57 testes** verde | `npm test` |
| Terraform modules / tenants | **0 / 0** (sem infra/) | `ls infra` → ausente |
| Backend deps / devDeps | **14 / 13** | package.json |
| Frontend deps / devDeps | **22 / 17** | package.json |

## Hotspots (maiores arquivos-fonte)
| Arquivo | LOC |
|---|---|
| `src/frontend/app/permutas/page.tsx` | **2971** |
| `src/backend/domain/client/ConexosClient.ts` | **1956** |
| `src/backend/domain/service/permutas/EleicaoPermutasService.ts` | 897 |
| `src/backend/routes/permutas.ts` | 772 |
| `src/frontend/app/permutas/BorderosPanel.tsx` | 683 |
| `src/backend/domain/repository/permutas/PermutaRelationalRepository.ts` | 629 |

## Qualidade estática (baseline)
| Gate | Resultado |
|---|---|
| Backend typecheck (`tsc --noEmit`) | ✅ limpo |
| Backend lint (biome, 134 arquivos) | ✅ 0 erros, **20 warnings** |
| Frontend typecheck | ✅ limpo |
| Frontend lint (biome) | ✅ 0 erros, ~3–7 warnings |
| Frontend coverage thresholds (jest) | lines **20** / branches **9** / functions **14** (pisos reassentados v0.8.1; page.tsx 2971 LOC sem teste de componente) |

## Contexto de arquitetura (do CLAUDE.md)
- **Atual:** Express (src/backend) + Next.js (src/frontend), deploy Render + Vercel, auth/DB Supabase (JWT HS256 próprio + Postgres). **Alvo:** AWS Lambda + Terraform multi-tenant (NÃO existe ainda).
- Domínio: **Permutas** (adiantamento PROFORMA × invoice → borderô/baixa no Conexos fin010). SISPAG e Popula GED ainda não modelados.
- Escrita no ERP **gated** (CONEXOS_WRITE_ENABLED / CONEXOS_DRY_RUN), idempotência write-ahead (`permuta_alocacao_execucao`).
- Releases recentes: v0.8.1 (baixa parcial), v0.8.2 (trava remover alocação em borderô), v0.8.3 (trava ignora cancelado).

> ⚠️ Métricas de runtime (latência p95, MTTR, disponibilidade, throughput) **não são medíveis localmente** — exigem produção/observabilidade (Render logs, Supabase, sem CloudWatch/X-Ray pois não há AWS). Declarar como tal.
