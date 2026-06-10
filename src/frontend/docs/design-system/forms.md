# Formulários

Toda entrada de dados estruturada usa o padrão `react-hook-form + Zod`. O DS fornece `FormField` (molecule) e um conjunto de inputs (atoms). O wrapper de UI é o `Form` do shadcn, estendido com nossos tokens.

## Princípios

- **Schema primeiro**: defina o schema Zod antes dos campos. Tipos derivam dele (`z.infer`).
- **Um campo = um FormField**: nunca insira um `<Input>` solto sem label/error/help.
- **Validação `onTouched`**: valida no blur, reavalia no change após o primeiro toque.
- **Feedback inline** para validação; **toast** para feedback de envio.
- **Nunca placeholder como label**. Placeholder é dica curta; label é obrigatório.

## Stack

- **react-hook-form** para estado do formulário (uncontrolled, performático).
- **Zod** para schema e validação.
- **shadcn/ui Form** para o wrapper acessível (`FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`).
- **@hookform/resolvers/zod** para conectar Zod ao RHF.

## FormField — molecule

### Anatomia

```
┌─────────────────────────────────────┐
│ Label *                              │
│ HelpText opcional                    │
│ ┌─────────────────────────────────┐ │
│ │ Input / Control                  │ │
│ └─────────────────────────────────┘ │
│ ErrorText (aparece quando inválido)  │
└─────────────────────────────────────┘
```

### API

```tsx
<FormField
    control={form.control}
    name="cnpj"
    label="CNPJ do prestador"
    description="Informe apenas os números"
    required
>
    {(field) => <CNPJInput {...field} />}
</FormField>
```

### Props

| Prop | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `control` | `Control` | sim | Control do RHF |
| `name` | `FieldPath` | sim | Caminho do campo no schema |
| `label` | `string` | sim | Label visível |
| `description` | `string` | não | Texto de apoio abaixo do label |
| `required` | `boolean` | não | Exibe `*` ao lado do label |
| `children` | `(field) => ReactNode` | sim | Render do input |
| `layout` | `'vertical' \| 'horizontal'` | default `'vertical'` | Orientação label × input |

### Comportamento

- `required` renderiza asterisco no label; também sinaliza visualmente.
- `aria-describedby` conecta input ao `description` e ao `error`.
- `aria-invalid={fieldState.invalid}`.
- Erros herdam do estado do RHF (`fieldState.error.message`).
- Descrição some quando há erro (ou pode coexistir, a depender do caso — default some).

## Catálogo de inputs

Todos os inputs seguem a mesma API base e integram com `FormField`.

### Atoms simples

| Input | Uso |
|---|---|
| `TextInput` | Texto livre |
| `Textarea` | Texto longo multi-linha |
| `PasswordInput` | Senha com toggle de visibilidade |
| `PasswordInputWithMeter` | Senha com toggle + medidor de força (ver seção dedicada) |
| `NumberInput` | Número com controles de incremento |
| `CurrencyInput` | Valor monetário em BRL (R$) |
| `Select` | Seleção única de opção discreta |
| `MultiSelect` | Seleção múltipla |
| `Combobox` | Autocomplete com busca |
| `Checkbox` | Boolean inline |
| `CheckboxGroup` | Múltiplos checkboxes agrupados |
| `Radio` | Seleção única entre poucas opções |
| `RadioGroup` | Grupo de radios |
| `Switch` | Toggle boolean |
| `DatePicker` | Data única |
| `DateRangePicker` | Intervalo de datas |
| `TimePicker` | Hora |
| `DateTimePicker` | Data + hora |
| `FileUpload` | Upload de arquivo(s) |

### Inputs com máscara brasileira

| Input | Máscara | Validação |
|---|---|---|
| `CNPJInput` | `00.000.000/0000-00` | valida dígitos verificadores |
| `CPFInput` | `000.000.000-00` | valida dígitos verificadores |
| `CEPInput` | `00000-000` | 8 dígitos; opcional lookup de endereço |
| `PhoneInput` | `(00) 00000-0000` ou `(00) 0000-0000` | 10 ou 11 dígitos |
| `PlacaInput` | `ABC-1234` ou Mercosul `ABC1D23` | valida formato |
| `MaskedInput` | máscara customizada | genérico |

**Armazenamento**: sempre valor normalizado (apenas dígitos) no form state. A máscara é visual.

### PasswordInputWithMeter — molecule

Variante do `PasswordInput` que exibe um medidor visual de força da senha abaixo do campo. Use em formulários de **criação** e **alteração** de senha. Não use em formulários de login — no login, força da senha não é relevante.

#### Anatomia

```
┌─────────────────────────────────────┐
│ ●●●●●●●●                       [👁] │
└─────────────────────────────────────┘
 ▮▮▮▮▮▯▯▯▯▯  Fraca
 Use ao menos 1 letra maiúscula e 1 número.
```

- Barra segmentada (4 segmentos) colorida progressivamente conforme a força.
- Label textual ao lado (`Muito fraca` / `Fraca` / `Razoável` / `Forte`).
- Mensagem de dica opcional com o critério que falta.

#### API

```tsx
<FormField control={form.control} name="newPassword" label="Nova senha" required>
    {(field) => (
        <PasswordInputWithMeter
            {...field}
            autoComplete="new-password"
            minScore={2}
            rules={{ minLength: 8, requireLetter: true, requireNumber: true }}
        />
    )}
</FormField>
```

#### Props

| Prop | Tipo | Default | Descrição |
|---|---|---|---|
| `minScore` | `0 \| 1 \| 2 \| 3 \| 4` | `2` | Score mínimo para considerar válido (afeta apenas o aviso visual — a validação canônica é do Zod) |
| `rules` | `{ minLength?: number; requireLetter?: boolean; requireNumber?: boolean; requireSpecial?: boolean }` | `{ minLength: 8 }` | Regras exibidas no hint textual |
| `showChecklist` | `boolean` | `false` | Se `true`, substitui a mensagem única por uma checklist com cada critério |
| `strategy` | `'heuristic' \| 'zxcvbn'` | `'heuristic'` | Algoritmo de scoring (heurístico leve ou `zxcvbn` quando precisão importa) |

Demais props espelham `PasswordInput` (`autoComplete`, `placeholder`, ...).

#### Score → label → cor

| Score | Label | Cor |
|---|---|---|
| 0 | Muito fraca | `danger` |
| 1 | Fraca | `danger` |
| 2 | Razoável | `warning` |
| 3 | Forte | `success` |
| 4 | Muito forte | `success` |

#### Regras

- **Validação canônica vive no Zod** — o medidor é dica visual, não substitui validação. O submit continua bloqueado pelas regras do schema.
- **Nunca exiba o valor da senha em texto fora do campo** — nem no medidor, nem no hint.
- **Não armazene score** no form state — é derivado a cada render.
- **`prefers-reduced-motion`**: transição de preenchimento da barra cai para `duration-instant`.
- **Acessibilidade**: barra tem `role="progressbar"` + `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label="Força da senha: <label>"`. Hint textual fica em `aria-live="polite"` para anunciar mudança de nível sem interromper digitação.

#### Zod acompanhando

```ts
const schema = z
    .object({
        newPassword: z
            .string()
            .min(8, 'Mínimo 8 caracteres')
            .regex(/[A-Za-z]/, 'Use ao menos 1 letra')
            .regex(/[0-9]/, 'Use ao menos 1 número'),
        confirmPassword: z.string(),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
        path: ['confirmPassword'],
        message: 'As senhas não coincidem',
    });
```

### Exemplo — CNPJInput

```tsx
<FormField control={form.control} name="cnpj" label="CNPJ" required>
    {(field) => <CNPJInput {...field} placeholder="00.000.000/0000-00" />}
</FormField>
```

**Zod:**

```ts
const schema = z.object({
    cnpj: z
        .string()
        .length(14, 'CNPJ deve ter 14 dígitos')
        .refine(isValidCnpj, 'CNPJ inválido'),
});
```

## Estados de inputs

| Estado | Visual |
|---|---|
| `idle` | Border `border-strong`, background `surface` |
| `hover` | Border `border-focus` com opacity 50% |
| `focus` | Border `border-focus` 2px, ring `shadow-focus` |
| `invalid` | Border `danger`, ring `danger` sutil |
| `disabled` | opacity 50%, cursor `not-allowed`, sem hover |
| `readonly` | opacity normal, cursor `text`, sem border-focus |
| `loading` | Input desabilitado + spinner à direita |
| `with-icon` | Ícone à esquerda ou direita (padding ajustado) |

## Validação — timing

Configurar RHF em `mode: 'onTouched'`:

```tsx
const form = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { ... },
});
```

- **Antes do primeiro blur**: não valida, não mostra erro.
- **Após o primeiro blur**: valida a cada change.
- **Submit**: valida tudo; scroll até primeiro erro.

## Feedback de envio

### Botão de submit

```tsx
<Button
    type="submit"
    variant="primary"
    loading={form.formState.isSubmitting}
    disabled={!form.formState.isValid}
>
    Salvar
</Button>
```

- **Durante submit**: spinner + texto mantido + disabled para evitar double submit.
- **Sucesso**: `toast.success("Configurações salvas")` + `form.reset(newValues)` (marca como pristine).
- **Erro de servidor**: `toast.error(...)` + `form.setError('root', { message })` OU `form.setError('campo', { message })` para erros específicos.

### Erros de servidor em campos

```ts
try {
    await api.saveUser(values);
    toast.success('Usuário salvo');
} catch (err) {
    if (err instanceof ValidationError) {
        Object.entries(err.fieldErrors).forEach(([field, message]) => {
            form.setError(field, { type: 'server', message });
        });
    } else {
        toast.error('Falha ao salvar usuário', { description: err.message });
    }
}
```

### Prompt de saída com form dirty

```tsx
useFormDirtyPrompt(form.formState.isDirty, 'Você tem alterações não salvas. Deseja sair?');
```

Dispara `beforeunload` nativo + prompt no Next.js router.

## Exemplo canônico — formulário completo

```tsx
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const memberSchema = z.object({
    name: z.string().min(1, 'Nome é obrigatório'),
    email: z.string().email('E-mail inválido'),
    role: z.enum(['admin', 'member', 'viewer']),
    cnpj: z.string().length(14, 'CNPJ incompleto').refine(isValidCnpj, 'CNPJ inválido').optional(),
    active: z.boolean().default(true),
});

type MemberFormData = z.infer<typeof memberSchema>;

function AddMemberForm({ onSubmit }: Props) {
    const form = useForm<MemberFormData>({
        resolver: zodResolver(memberSchema),
        mode: 'onTouched',
        defaultValues: { active: true },
    });

    const submit = async (values: MemberFormData) => {
        try {
            await onSubmit(values);
            toast.success('Membro adicionado');
            form.reset();
        } catch (err) {
            toast.error('Falha ao adicionar membro', { description: err.message });
        }
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(submit)} className="space-y-md">
                <FormField control={form.control} name="name" label="Nome" required>
                    {(field) => <TextInput {...field} placeholder="Maria Silva" />}
                </FormField>

                <FormField control={form.control} name="email" label="E-mail" required>
                    {(field) => <TextInput {...field} type="email" placeholder="maria@empresa.com" />}
                </FormField>

                <FormField control={form.control} name="role" label="Papel" required>
                    {(field) => (
                        <Select {...field}>
                            <Select.Option value="admin">Admin</Select.Option>
                            <Select.Option value="member">Membro</Select.Option>
                            <Select.Option value="viewer">Visualização</Select.Option>
                        </Select>
                    )}
                </FormField>

                <FormField control={form.control} name="cnpj" label="CNPJ (opcional)">
                    {(field) => <CNPJInput {...field} />}
                </FormField>

                <FormField control={form.control} name="active" label="Ativo">
                    {(field) => <Switch {...field} />}
                </FormField>

                <div className="flex justify-end gap-sm">
                    <Button variant="secondary" type="button" onClick={onCancel}>
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        loading={form.formState.isSubmitting}
                        disabled={!form.formState.isValid}
                    >
                        Adicionar membro
                    </Button>
                </div>
            </form>
        </Form>
    );
}
```

## Layout de formulário

### Vertical (default)

Label em cima, input embaixo. Campos empilhados. Ideal para formulários longos e mobile.

### Horizontal

Label à esquerda (largura fixa, ex: `w-40`), input à direita. Use em configurações "flat" (Settings).

### Grid

Múltiplos campos por linha. Use `FormGrid` para layout de 2 ou 3 colunas:

```tsx
<FormGrid columns={2} gap="md">
    <FormField name="firstName" label="Nome">...</FormField>
    <FormField name="lastName" label="Sobrenome">...</FormField>
    <FormField name="email" label="E-mail" className="col-span-2">...</FormField>
</FormGrid>
```

## Acessibilidade

- Todo input tem `<label>` associado (via `htmlFor` ou aninhamento).
- `aria-required` no input quando `required`.
- `aria-invalid` espelha o estado do RHF.
- `aria-describedby` conecta input a description e error.
- Error messages têm `role="alert"` para anúncio imediato por screen readers.
- Tab order segue ordem visual.
- Submit via Enter funciona em todos os campos (exceto textarea).
- Autocomplete correto no atributo (`autoComplete="email"`, `"new-password"`, etc).

## Máscaras — detalhamento

Implementar com `use-mask-input` ou similar. Requisitos:

- Máscara aplicada **durante digitação**, não apenas no blur.
- Paste respeita a máscara (remove caracteres não-numéricos e reaplica).
- Valor no form state: apenas dígitos.
- Backspace funciona como esperado (remove caracter anterior, incluindo formatação).

### Implementação conceitual

```tsx
export const CNPJInput = forwardRef<HTMLInputElement, CNPJInputProps>((props, ref) => {
    return (
        <MaskedInput
            {...props}
            ref={ref}
            mask="00.000.000/0000-00"
            unmask={true}
            inputMode="numeric"
            autoComplete="off"
        />
    );
});
```

## Do / Don't

**Do**

- Use Zod como fonte única da verdade do schema + tipos.
- Use `mode: 'onTouched'` para UX equilibrada.
- Resete o form após submit com `form.reset(newValues)` para limpar `isDirty`.
- Use toasts para feedback de envio; erros de validação ficam inline.
- Use `FormField` mesmo para um campo único — consistência vale mais que concisão.
- Desabilite submit durante `isSubmitting`.

**Don't**

- Não valide no `onChange` desde o início — é agressivo e intrusivo.
- Não use placeholder como label.
- Não dispare toast para erros de validação inline — o erro já aparece abaixo do campo.
- Não armazene valor mascarado no form state; sempre armazene valor normalizado.
- Não use `alert()` ou `confirm()` nativos — use componentes do DS.
- Não esconda o botão submit em loading — mantenha visível com estado loading.

---

## AsyncCombobox — molecule

Campo de busca assíncrona com seleção. Usa `Popover` + `Input` interno — sem dependência de `cmdk`. Indicado quando as opções são buscadas via API ao digitar (ex: busca de fornecedor, produto).

> **Não confundir** com `Select` (opções fixas locais) ou `MultiSelect`. Use `AsyncCombobox` apenas quando o conjunto de opções é grande e/ou vem de uma API.

### Anatomia

```
┌──────────────────────────────────────────┐
│  Buscar fornecedor…                   ▼  │  ← trigger (botão)
└──────────────────────────────────────────┘
                  ↓ (ao abrir)
┌──────────────────────────────────────────┐
│ 🔍 [Digite para buscar…          ]       │  ← Input interno
├──────────────────────────────────────────┤
│  Resultado 1                             │
│  Resultado 2                         ← selected highlight
│  Resultado 3                             │
│  …                                       │
└──────────────────────────────────────────┘
```

### Estados

| Estado | Descrição |
|---|---|
| `idle` | Popover fechado; trigger exibe `displayValue` ou `placeholder` |
| `typing` | Popover aberto, input focado, aguardando debounce |
| `loading` | Buscando resultados (spinner no input) |
| `results` | Lista de opções exibida |
| `empty` | Busca retornou vazio — "Nenhum resultado" |
| `error` | Falha na busca — "Erro ao buscar" + `notify('error', ...)` |
| `disabled` | Trigger desabilitado (opaco, cursor `not-allowed`) |

### API

```tsx
interface AsyncComboboxProps<T> {
    onSearch: (query: string) => Promise<T[]>;  // chamado com debounce 300ms
    onSelect: (item: T) => void;
    renderOption: (item: T) => React.ReactNode;
    getOptionKey: (item: T) => string;
    disabled?: boolean;
    placeholder?: string;       // texto no trigger quando vazio
    displayValue?: string;      // valor atual formatado a exibir no trigger
    className?: string;
}
```

### Regras de uso

- Debounce **300ms** na chamada de `onSearch` — não disparar request a cada keystroke.
- `onSearch` recebe a query limpa (trimada); retornar `[]` em query vazia é válido.
- `renderOption` é responsabilidade do consumidor — `AsyncCombobox` não sabe do domínio.
- Erros de busca: `notify('error', 'Erro ao buscar', ...)` — nunca deixar silencioso.
- `disabled`: use quando a busca depende de outro campo ainda não preenchido (ex: `ConfigDocContaProjetoSelect` desabilitado até fornecedor selecionado).
- **Não** use para listas com ≤ 10 opções fixas — prefira `Select`.

### AsyncCombobox.Skeleton

```tsx
<AsyncCombobox.Skeleton />  // div arredondado com animate-pulse, altura 36px
```
