'use client'

import * as React from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Badge } from './badge'
import { cn } from '@/lib/utils'

export interface MultiSelectOption {
    value: string
    label: string
}

interface MultiSelectProps {
    options: MultiSelectOption[]
    value: string[]
    onChange: (value: string[]) => void
    placeholder?: string
    searchPlaceholder?: string
    disabled?: boolean
    id?: string
    className?: string
    'aria-label'?: string
}

/**
 * Multi-select with checkbox-style selection and inline tag rendering.
 * Built on Popover + manual list (Radix Select doesn't support multi).
 *
 * Keyboard:
 *   - Space toggles current option
 *   - Backspace on empty input removes last selected tag
 *   - Esc closes
 */
export const MultiSelect = React.forwardRef<HTMLButtonElement, MultiSelectProps>(
    (
        {
            options,
            value,
            onChange,
            placeholder = 'Selecione…',
            searchPlaceholder = 'Buscar…',
            disabled,
            id,
            className,
            'aria-label': ariaLabel,
        },
        ref,
    ) => {
        const [open, setOpen] = React.useState(false)
        const [search, setSearch] = React.useState('')

        const filtered = React.useMemo(
            () =>
                options.filter((opt) =>
                    opt.label.toLowerCase().includes(search.toLowerCase()),
                ),
            [options, search],
        )

        const toggle = (optValue: string) => {
            if (value.includes(optValue)) {
                onChange(value.filter((v) => v !== optValue))
            } else {
                onChange([...value, optValue])
            }
        }

        const remove = (optValue: string) => {
            onChange(value.filter((v) => v !== optValue))
        }

        const selectedLabels = options.filter((o) => value.includes(o.value))

        return (
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        ref={ref}
                        id={id}
                        type="button"
                        disabled={disabled}
                        aria-label={ariaLabel}
                        aria-expanded={open}
                        aria-haspopup="listbox"
                        className={cn(
                            'flex h-9 min-h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50',
                            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                            value.length > 0 ? 'h-auto' : '',
                            className,
                        )}
                    >
                        {selectedLabels.length === 0 ? (
                            <span className="text-muted-foreground">{placeholder}</span>
                        ) : (
                            <div className="flex flex-wrap gap-1 py-1">
                                {selectedLabels.map((opt) => (
                                    <Badge
                                        key={opt.value}
                                        variant="secondary"
                                        className="gap-1"
                                    >
                                        {opt.label}
                                        <button
                                            type="button"
                                            aria-label={`Remover ${opt.label}`}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                remove(opt.value)
                                            }}
                                            className="ml-1 rounded-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        )}
                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                    </button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[16rem] p-0">
                    <div className="border-b p-2">
                        <input
                            type="text"
                            placeholder={searchPlaceholder}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full rounded-md border-none bg-transparent text-sm outline-none"
                            aria-label="Buscar opções"
                        />
                    </div>
                    <ul
                        role="listbox"
                        aria-multiselectable="true"
                        className="max-h-64 overflow-auto p-1"
                    >
                        {filtered.length === 0 ? (
                            <li className="py-2 text-center text-sm text-muted-foreground">
                                Nenhuma opção
                            </li>
                        ) : (
                            filtered.map((opt) => {
                                const isSelected = value.includes(opt.value)
                                return (
                                    <li
                                        key={opt.value}
                                        role="option"
                                        aria-selected={isSelected}
                                        tabIndex={0}
                                        onClick={() => toggle(opt.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault()
                                                toggle(opt.value)
                                            }
                                        }}
                                        className={cn(
                                            'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent focus:bg-accent',
                                            isSelected && 'font-medium',
                                        )}
                                    >
                                        <span className="flex h-4 w-4 items-center justify-center">
                                            {isSelected ? (
                                                <Check className="h-4 w-4" />
                                            ) : null}
                                        </span>
                                        {opt.label}
                                    </li>
                                )
                            })
                        )}
                    </ul>
                </PopoverContent>
            </Popover>
        )
    },
)
MultiSelect.displayName = 'MultiSelect'
