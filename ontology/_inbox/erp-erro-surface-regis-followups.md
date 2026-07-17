# Follow-ups — Surface do motivo real dos erros do ERP (ErpErrorInterpreter)

Feature: `fix/erp-erro-vars-msg-surface` (2026-07-17). Revisão adversarial: **0 P0/P1**. O **P2** (robustez do
error-handler contra envelope malformado em `pickMessage`/`assertNoErpError`) foi **remediado** no mesmo
worktree (guard `Array.isArray` + `m?.valid`, com teste). Abaixo os P3 (não implementados).

## P3 — `vars.msg` agora chega ao corpo da resposta HTTP (antes só logado)
`routes/permutas.ts` passa a devolver a razão real do ERP em `error`/`erpDetail`. É texto de validação de
negócio do ERP (ex.: "CONTA DE DESCONTO NÃO INFORMADA"), não credencial (sid/token vivem no header
`Cookie`, não em `response.data`). Rota é `requireRole('admin')` + human-in-the-loop — mesma fronteira de
confiança do ERP. **Aceito.** Nota: teoricamente um template de validação do ERP poderia conter um
nome/valor; se algum dia surgir PII em `vars.msg`, reavaliar o que vai pro corpo vs só log.

## P3 — Heurística `friendly === detail.key` para surfacing da key crua
`routes/permutas.ts`: `erpDetail` surface a key quando `friendly === key`. É fiel HOJE porque nenhum valor
do `ptByKey` é igual à própria key. Invariante implícito: se algum dia adicionarem uma entrada
self-mapping (`value === key`), a key seria surfaçada mesmo mapeada (inócuo, mas frágil). Se incomodar,
expor "key não-mapeada" explicitamente (ex.: o interpretador devolver um flag `mapped`).

## P3 — Inconsistência cosmética do toast: `excluirBorderoInteiro`
O tweak de "Falha — <razão>" (sem "API 400 —") foi só no `acaoBordero` (finalizar/cancelar/estornar).
`excluirBorderoInteiro` e `excluirBaixaBordero` (`src/frontend/lib/api.ts`) seguem no padrão antigo com o
prefixo "API 400 —". Toast de Excluir difere do de Aprovar/Cancelar. Uniformizar os outros ~8 call sites de
`api.ts` num pass cosmético separado (já era follow-up do plano).

## P3 — Tipo `ErpMessage` duplicado
`ErpErrorInterpreter.ErpMessage` e o inline em `Fin010Baixa.ts:81` descrevem o mesmo shape. Exportar um só
tipo compartilhado (nice-to-have).
