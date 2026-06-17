# ExcelImportDialog

Organism de importação de arquivos Excel (`.xlsx`). Exibe um dialog com input de arquivo, validação de schema, preview de diff e confirmação antes de importar os dados.

## Propósito

- Permitir que o usuário substitua a versão inteira de uma tabela versionada via arquivo Excel.
- Validar cabeçalhos e tipos contra o schema Zod declarado no provider, antes de aceitar o arquivo.
- Exibir preview de diff (linhas novas/removidas) para o usuário confirmar o impacto antes de confirmar.
- Bloquear importação se colunas obrigatórias estiverem ausentes.

## Classificação Atomic

Organism. Compõe: Dialog (overlay + content), Input (file), tabela de preview, botões de ação, estados de carregamento e erro.

## Implementação recomendada

- **SheetJS (`xlsx`)** para parsing do arquivo `.xlsx`.
- **Radix Dialog** como primitivo acessível.
- **`parseXlsx`** da lib `features/core/uploadable/lib/excel.ts` para parsing + validação.

## Anatomia

```
┌────────────────────────────────────────────────────────┐
│ Dialog: "Importar tabela via Excel"                    │
├────────────────────────────────────────────────────────┤
│ [Estado idle]                                          │
│   Arraste ou selecione um arquivo .xlsx               │
│   [Selecionar arquivo]                                 │
│                                                        │
│ [Estado uploading/validating]                          │
│   Spinner + "Validando arquivo..."                     │
│                                                        │
│ [Estado error]                                         │
│   ❌ Cabeçalhos inválidos:                              │
│      - Coluna "email" obrigatória ausente              │
│      - Coluna "active" obrigatória ausente             │
│   [Selecionar outro arquivo]                           │
│                                                        │
│ [Estado preview-diff]                                  │
│   ✅ 47 linhas encontradas                              │
│                                                        │
│   Preview das alterações:                              │
│   ┌─────────────────────────────────────┐              │
│   │ email (verde = nova, vermelha = rem)│              │
│   │ + user@new.com      group  true     │ ← nova       │
│   │ - user@old.com      group  true     │ ← removida   │
│   │   user@same.com     group  true     │ ← inalterada │
│   └─────────────────────────────────────┘              │
│                                                        │
│   [Cancelar]                     [Confirmar import]   │
└────────────────────────────────────────────────────────┘
```

## API — Props

```ts
interface ExcelImportDialogProps {
    open: boolean;
    onClose: () => void;

    // Schema para validação de cabeçalhos e tipos
    schema: Array<{
        name: string;      // nome da coluna (deve corresponder ao cabeçalho do Excel)
        type: 'string' | 'number' | 'boolean';
        required: boolean; // se true, coluna deve estar presente no arquivo
    }>;

    // Linhas atuais — usadas para calcular o diff no preview
    currentRows: Record<string, unknown>[];

    // Chamado quando o usuário confirma o import
    // rows: linhas parseadas e validadas do Excel
    onImport: (rows: Record<string, unknown>[]) => void;
}
```

## Estados

| Estado | Descrição | Transição |
|---|---|---|
| `idle` | Input de arquivo exibido; aguarda seleção | Usuário seleciona arquivo → `validating` |
| `validating` | Spinner + "Validando arquivo..." | Parse + validação completos → `preview-diff` ou `error` |
| `preview-diff` | Tabela de diff + botão "Confirmar" habilitado | Confirmar → `onImport()` + `onClose()`; Cancelar → `idle` |
| `error` | Lista de erros de validação; botão Confirmar desabilitado | Novo arquivo → `validating` |

## Regras

- Aceita apenas `.xlsx`. Arquivos `.csv`, `.xls` e outros são rejeitados com mensagem "Apenas arquivos .xlsx são aceitos."
- Valida cabeçalhos da primeira linha do Excel contra `schema.name` (case-insensitive).
- Se uma coluna com `required: true` está ausente → estado `error` com a coluna listada.
- Colunas extras no Excel (não presentes no schema) → aviso (não bloqueia), mas são ignoradas na importação.
- Coerce tipos quando possível:
  - `boolean`: aceita `"true"`, `"false"`, `1`, `0`, `true`, `false`.
  - `number`: aceita strings numéricas (`"42"` → `42`).
  - `string`: qualquer valor é convertido via `String()`.
- Se o tipo não pode ser coercido → aviso por coluna no estado `error`.
- O botão "Confirmar" só é habilitado no estado `preview-diff` sem erros bloqueantes.
- O botão "Cancelar" fecha o dialog em qualquer estado; dados não são importados.
- `currentRows` é usado apenas para calcular o diff visual; não valida duplicatas.

## Exemplo de uso

```tsx
// Wrapper de feature (UploadableExcelImportDialog)
function UploadableExcelImportDialog({
    open,
    onClose,
    onImport,
    schema,
    currentRows,
}: UploadableExcelImportDialogProps) {
    return (
        <ExcelImportDialog
            open={open}
            onClose={onClose}
            schema={schema}
            currentRows={currentRows}
            onImport={onImport}
        />
    );
}

// Uso na página (via UploadableDataEditor)
<UploadableExcelImportDialog
    open={importDialogOpen}
    onClose={() => setImportDialogOpen(false)}
    schema={detail.schema}
    currentRows={localRows}
    onImport={(rows) => {
        setLocalRows(rows);
        setImportDialogOpen(false);
    }}
/>
```

## Preview de diff — visualização

O diff é calculado comparando `currentRows` com `parsedRows` do Excel:

- **Linha nova**: presente em `parsedRows` mas não em `currentRows` (sem `_row_audit.id` correspondente) → fundo verde `emerald-50`, prefixo `+`.
- **Linha removida**: presente em `currentRows` mas não em `parsedRows` → fundo vermelho `red-50`, prefixo `-`.
- **Linha inalterada**: presente em ambos com mesmos valores → sem destaque.

Se o número de linhas for maior que 50, exibe as primeiras 50 com contador "... e mais N linhas".

## Acessibilidade

- `role="dialog"` com `aria-modal="true"` e `aria-labelledby` no título.
- Focus inicial no botão "Selecionar arquivo" no estado idle.
- Focus no primeiro erro no estado error.
- Esc fecha o dialog (Radix Dialog já garante).
- Input de arquivo tem `accept=".xlsx"` e label descritiva.
- Botões de ação têm `aria-label` explícito.
- Preview de diff: colunas com linhas novas/removidas têm `aria-label` descrevendo o tipo de mudança.

## `.Skeleton`

```tsx
ExcelImportDialog.Skeleton = function () {
    return (
        <div className="space-y-4 p-6">
            <Skeleton.Block className="h-6 w-48" />
            <Skeleton.Block className="h-32 w-full rounded-lg" />
            <div className="flex justify-end gap-2">
                <Skeleton.Block className="h-9 w-20" />
                <Skeleton.Block className="h-9 w-28" />
            </div>
        </div>
    );
};
```

## Do / Don't

**Do**

- Sempre exibir preview de diff antes de confirmar — o usuário precisa ver o impacto.
- Bloquear confirmar quando há erros de schema (colunas obrigatórias ausentes).
- Usar `accept=".xlsx"` no input de arquivo para filtrar no SO.
- Exibir o número total de linhas encontradas no estado `preview-diff`.

**Don't**

- Não importar automaticamente sem confirmação do usuário.
- Não aceitar `.csv` ou `.xls` — apenas `.xlsx`.
- Não fazer merge incremental — o import substitui a tabela inteira.
- Não persistir os dados dentro do dialog — chamar `onImport(rows)` e deixar a página salvar.
- Não exibir todos os erros de parsing de uma vez se forem muitos — limitar a 10 e indicar "e mais N erros".
