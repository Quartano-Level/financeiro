# Lifecycle — narrativa cronológica do processo de importação (camada 2)

> A **camada 2** conta a história do negócio **em ordem cronológica** (00→90), do cadastro ao fechamento,
> e linka para a **camada 1** (`../screens/<controller>.md`, navegação agêntica com endpoints e layout).
> Modelo de negócio: Columbia opera **importação por conta e ordem (C&O)** — ver `../README.md`.

## Índice das fases

| # | Fase | Arquivo | Telas-âncora (live) | Status |
|--:|------|---------|---------------------|--------|
| 00 | Cadastros base | [00-cadastros.md](00-cadastros.md) | cmn025 · com006 · imp013 (TEC) · cmn023 (CFOP) | ✅ |
| 10 | Pedido / Contrato de Câmbio | [10-pedido-contrato.md](10-pedido-contrato.md) | com043 · imp059 (câmbio) | ✅ |
| 20 | Embarque / Logística | [20-logistica.md](20-logistica.md) | log003 · log009 · log012 · imp174 · (log091/log111 export) | ✅ |
| 30 | Processo de Importação (espinha) | [30-processo-importacao.md](30-processo-importacao.md) | imp021 (Conta Corrente · Eventos · Despesas) | ✅ |
| 35 | Despacho Aduaneiro | [35-despacho.md](35-despacho.md) | imp237 · imp019 (DI) · imp230 (adm.temp) · imp190 (DU-E) | ✅ |
| 40 | Encargos & Impostos | [40-encargos-impostos.md](40-encargos-impostos.md) | com017 (encargosGerais) | ✅ |
| 50 | Faturamento | [50-faturamento.md](50-faturamento.md) | imp002 (ODF) · com296 · com297 · com319 | ✅ |
| 60 | Financeiro | [60-financeiro.md](60-financeiro.md) | com298 · com299 · fin010 · fin014 (borderô) | ✅ |
| 70 | Fechamento de Processo | [70-fechamento.md](70-fechamento.md) | imp021 (C/C) · ctb002 · imp059/log009 (var.cambial) | ✅ |
| 90 | Relatórios / Pesquisas | [90-relatorios.md](90-relatorios.md) | psq015 · cmn156 (PTAX) | ✅ |

## Fluxo documental (resumo)
```
Cadastros (00) → Pedido+Câmbio (10) → Proforma→Invoice→Conhecimento (20)
   → PROCESSO imp021 (30, espinha)
       → Presença→DI[Adições/Despesas]→Adm.Temp→DU-E (35) → Encargos com017 (40)
   → ODF imp002 → NF entrada/saída (50) → Títulos→Baixa borderô (60)
   → Fechamento débito×crédito + var.cambial (70) → Relatórios (90)
```

## Como usar
- **Humano** querendo entender a operação: leia 00→90 em ordem.
- **Agente** querendo navegar/automatizar uma tela: vá da fase para `../screens/<controller>.md` (rota, endpoints,
  layout, quirks) e para `../_registry.json` (índice máquina dos 648 controllers).
