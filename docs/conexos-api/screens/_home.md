---
controller: (home)
ui_title: "Dashboard"
route: /home
phase: null
domain: (portal)
status: live
verified_at: 2026-06-19
reach:
  - "login → /home"                        # ponto de entrada do portal
  - "logo/Dashboard no breadcrumb volta aqui"
endpoints: []
links: { from: [], to: [] }
---

## O que esta tela é
**Dashboard** = a **home do portal** Conexos (`/home`), o ponto de entrada após login. Não é um controller
`/api/<ctrl>` — é o painel inicial. Útil para um agente como **landing/orientação** antes de navegar para uma tela.

## Layout visual (verificado)
Painéis (cards):
- **ROBÔS** — *"Acionamento de robôs de consulta e transmissão de informações"*: a camada de **automação de
  integração** com os órgãos externos. Cada robô tem ⚙️ (config) · 🔒 (credencial) · 📄 (log). Robôs vistos:
  **Siscomex Carga · Tracking de Container · Importação L.I. · Exportação L.I. · NF-e · Importação D.I. ·
  Exportação D.I. · Consulta CT-e · Documentos Destinados** (2 páginas). ⮕ provável base do domínio `fup*`
  (follow-up/robôs) e da integração Siscomex/SEFAZ.
- **NOTÍCIAS INTERNAS** — avisos do ERP (ex.: *Implementação de CNPJ Alfanumérico*, *Atualização do Layout SPED
  ECF*, *Planos Referenciais do SPED ECD*) — sinais de compliance fiscal/contábil em evolução (reforma + SPED).
- **NOTÍCIAS DO BLOG** · **COTAÇÃO** (cotações de moeda — ligado a `cmn156` PTAX).

## Barra superior (global, presente em todas as telas)
Ícones (esq.): abrir-em-nova-aba · relatórios/BI · velocímetro (dashboards) · ⭐ favoritos. Centro: logo
COLUMBIA. Dir.: 🔔 notificações · ⚙️ configurações · usuário (`MPS_FRANCINEI` / COLUMBIA - FILIAL: 2) · logout.

## Quirks
Navegar a um controller inexistente/não-roteável às vezes **redireciona para `/home#/`** (ex.: `fup001`) em vez
de 404 — sinal de que o alvo é widget/robô do dashboard, não tela. `fup*` = follow-up/robôs (sem tag no swagger).
