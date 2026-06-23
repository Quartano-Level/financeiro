# Runbook — Cutover da escrita `fin010` (dry-run → baixa real)

> Fase 3 (ADR-0013) — risco arquitetural #1. A baixa/permuta no `fin010` é a **primeira escrita** do
> sistema no Conexos e é **irreversível por nós** (o estorno é manual, na UI do `fin010`). Este runbook é
> o procedimento para destravar a escrita com segurança. **Homologação-first, sempre.**

## Flags (EnvironmentProvider / Render)

| Flag | Default seguro | Efeito |
|------|----------------|--------|
| `CONEXOS_BASE_URL` | (Render, `sync:false`) | ERP alvo. Homologação = `https://columbiatrading-hml.conexos.cloud/api` |
| `CONEXOS_WRITE_ENABLED` | `false` | Liga o caminho de escrita. `false` ⇒ tudo vira dry-run |
| `CONEXOS_DRY_RUN` | `true` | `true` ⇒ monta/loga o payload SEM POST |

**Escrita real só acontece com `CONEXOS_WRITE_ENABLED=true` E `CONEXOS_DRY_RUN=false`.** Qualquer outra
combinação ⇒ dry-run. O `EnvironmentProvider` é `@singleton` com cache — **mudar flag exige restart** do
serviço (redeploy/restart no Render).

## Procedimento

### Fase 1 — Homologação (obrigatória antes de produção)
1. No Render (ou `.env` local), defina: `CONEXOS_BASE_URL=https://columbiatrading-hml.conexos.cloud/api`,
   `CONEXOS_WRITE_ENABLED=true`, `CONEXOS_DRY_RUN=false`. Restart.
2. Garanta que existe **1 par adto→invoice controlado e reversível** com alocação feita (`permuta_alocacao`).
3. Na UI: Permutas → aba cross-process → **Baixar** → confira o **preview (dry-run)**:
   - rode primeiro com `CONEXOS_DRY_RUN=true` (preview) e confira invoice/juros/conta;
   - depois `=false` e **Executar baixa**.
4. Confirme no `fin010` de homologação: borderô criado, baixa/permuta gravada (`bxaCodSeq`).
5. Confira a trilha: `GET /permutas/adiantamentos/:docCod/execucoes` → status `settled` com `bor_cod`/`bxa_cod_seq`.

### Fase 2 — Produção (1 caso real controlado)
1. Só após a Fase 1 verde. Aponte `CONEXOS_BASE_URL` de volta para produção. Restart.
2. Mantenha `CONEXOS_WRITE_ENABLED=true`, `CONEXOS_DRY_RUN=false`.
3. Execute **UM** par adto→invoice combinado com o analista, ao vivo, **reversível** (o analista sabe estornar).
4. Confira no ERP + na trilha de execução. Se algo divergir, **estorne no `fin010`** e investigue.

## Rollback / desligar a escrita
- **Imediato:** `CONEXOS_DRY_RUN=true` (ou `CONEXOS_WRITE_ENABLED=false`) + restart → nenhuma escrita nova.
- **Baixa já gravada:** não há rollback automático — **estornar manualmente no `fin010`** (UI). A linha em
  `permuta_alocacao_execucao` fica `settled`; um job de conciliação (follow-up) detectará a divergência.

## Sinais de problema
- Linha presa em `reconciling` em `permuta_alocacao_execucao`: o processo morreu entre o POST e a confirmação.
  Cheque no `fin010` (pelo `bor_cod` persistido) se a baixa entrou; se sim, marque `settled` manualmente; se
  não, retry.
- `status='error'` com `erp_response`: leia a mensagem do ERP; corrija e re-execute (idempotente — par já
  `settled` é pulado).

## Invariantes que o código já garante
- Anti-super-pagamento: o valor vem do em-aberto vivo do ERP (passo 2); em-aberto ≤ 0 ⇒ aborta.
- Anti-drift (I-Write-1): aborta se o ERP quer baixar **mais** que o alocado esperado (baixa parcial não suportada ainda).
- Idempotência por par adto↔invoice; escritas (criar borderô / gravar baixa) são **tentativa única** (sem retry → sem baixa duplicada).
