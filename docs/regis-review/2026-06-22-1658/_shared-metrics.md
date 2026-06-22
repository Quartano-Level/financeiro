# Shared baseline metrics — run 2026-06-22-1658 (UTC)
(node_modules/.next/dist excluídos)

## LOC (src, não-teste)
- Backend: 9331 linhas / 77 arquivos — service 2499, repository 1389, client 1979, routes 411
- Frontend: 4984 linhas

## Testes
- Backend test files: 37
- Frontend test files: 11
- BE: 374 testes (1 falha ambiental: EnvironmentProvider, .env local com CONEXOS_FIL_COD — passa no CI). FE: 51 testes.

## Infra (estado ATUAL ≠ alvo)
- infra/ NÃO existe (Terraform é estado-alvo). Deploy: BE = Render (deploy hook), FE = Vercel.
- Auth/DB: Supabase (JWT + Postgres). Scheduler: GitHub Actions cron (ingest-permutas 3x/dia).
- Backend é Express puro (legado do template), não Lambda. DDD a partir de Service vale.

## Deps / versão
- Backend: 14 prod / 13 dev · Frontend: 22 prod / 17 dev · App v0.4.0 (FE+BE lockstep)

## Escopo desta revisão
- Foco no que mudou no PR #4 (v0.4.0): permutas — distribuição greedy Simples, eleição (acesso Conexos),
  ingestão, gestão (read), cliente-filtro (auto-ingest add/remove), alocação manual. READ-ONLY no ERP.
- Frente I (Permutas) é a única implementada. SISPAG e Popula GED ainda não existem.
