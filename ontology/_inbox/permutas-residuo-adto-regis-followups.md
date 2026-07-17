# Follow-ups — Âncora no valor real do adto (I-Write-6 / ADR-0020)

Feature: `fix/permutas-residuo-adto-ancora-erp` (2026-07-17). Revisão adversarial: **0 P0/P1**, matemática
verificada (ambos os ramos JUROS/DESCONTO fecham exato, anti-drift intacto, multi-título desligado,
dry-run inalterado). Itens abaixo NÃO bloqueiam o merge.

## P2 — Teto fixo R$1 deixa resíduo em adiantamentos grandes (DECISÃO tomada)
O resíduo legítimo de arredondamento de taxa é `USD × |taxaReal − taxaExibida|` (≤ `USD × 0,001`), que
**escala com o USD**. Com o teto absoluto de **R$1,00** (escolha do Yuri em 2026-07-17, opção
conservadora), adtos acima de ~US$2k com arredondamento de taxa maior **mantêm** o resíduo "à permutar"
— o fix não os cobre; caem no `BUSINESS_WARN` ("resíduo acima da tolerância") para conferência manual.
**Trade-off aceito:** preferir nunca lançar valor material na variação a zerar resíduo de adto grande.
Alternativa registrada (se o volume de adtos grandes com resíduo incomodar): teto proporcional
(`USD × 0,001`) + gate no full-consume — conserta todos os tamanhos, ao custo de absorver ≤ ~0,01% do
adto na conta de variação. Reabrir via `/feature-tweak` se a operação pedir.

## P3 — Semântica de `bxaMnyValorPermuta` a confirmar em HML
A âncora assume que o `bxaMnyValorPermuta` do passo 3 reflete o valor do adto **no momento da baixa**.
Se, num adto com permuta parcial anterior, o ERP devolver o valor ORIGINAL (não o remanescente), o
resíduo calculado seria grande → o teto (R$1) rejeitaria (seguro, vira `BUSINESS_WARN`), mas o
comportamento deve ser confirmado em homologação (`columbiatrading-hml.conexos.cloud`) antes de habilitar
escrita ampla. O feature inteiro depende dessa semântica (hoje só validada no caso full-consume 1:1).

## P3 — Multi-título full-consume não coberto
A âncora só dispara em invoice de **título único** (`titulos.length === 1`). Invoice multi-título em
full-consume pode deixar resíduo (o resíduo cruza os títulos). Raro (título único é a maioria). Cobrir
distribuindo o fechamento no último título, se aparecer em campo.
