'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * KPICard — molecule presenting a key metric with optional delta/footer.
 * Compound subcomponents (`Root`, `Header`, `Label`, `Value`, `Footer`,
 * `Dot`, `Delta`) per `docs/design-system/kpi.md`. A `SimpleKPI` preset
 * is provided for the common case.
 */

interface KPICardRootProps extends React.HTMLAttributes<HTMLDivElement> {
    color?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'permuta'
    active?: boolean
    onClick?: () => void
    loading?: boolean
    disabled?: boolean
    tooltip?: string
    size?: 'sm' | 'md' | 'lg'
}

const colorRing: Record<NonNullable<KPICardRootProps['color']>, string> = {
    default: 'border-border',
    primary: 'border-primary',
    success: 'border-success',
    warning: 'border-warning',
    danger: 'border-danger',
    info: 'border-info',
    permuta: 'border-permuta',
}

const dotColor: Record<NonNullable<KPICardRootProps['color']>, string> = {
    default: 'bg-muted-foreground',
    primary: 'bg-primary',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
    permuta: 'bg-permuta',
}

const KPICardRoot = React.forwardRef<HTMLDivElement, KPICardRootProps>(
    (
        {
            color = 'default',
            active,
            onClick,
            loading,
            disabled,
            tooltip,
            size = 'md',
            className,
            children,
            ...props
        },
        ref,
    ) => {
        const interactive = typeof onClick === 'function' && !disabled
        return (
            <div
                ref={ref}
                role={interactive ? 'button' : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-pressed={interactive ? active : undefined}
                aria-disabled={disabled}
                title={tooltip}
                onClick={() => {
                    if (interactive && !loading) onClick?.()
                }}
                onKeyDown={(e) => {
                    if (interactive && !loading && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        onClick?.()
                    }
                }}
                data-slot="kpi-card"
                data-active={active ? 'true' : undefined}
                data-size={size}
                className={cn(
                    'flex flex-col gap-2 rounded-lg border bg-card p-4 text-card-foreground shadow-sm transition-all',
                    interactive && 'cursor-pointer hover:shadow-md',
                    disabled && 'pointer-events-none opacity-50',
                    active && cn('ring-2 ring-offset-2 ring-offset-background', colorRing[color]),
                    className,
                )}
                {...props}
            >
                {children}
            </div>
        )
    },
)
KPICardRoot.displayName = 'KPICardRoot'

const KPICardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        data-slot="kpi-card-header"
        className={cn('flex items-center gap-2 text-xs uppercase text-muted-foreground', className)}
        {...props}
    />
)

const KPICardLabel = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span
        data-slot="kpi-card-label"
        className={cn('font-medium tracking-wider', className)}
        {...props}
    />
)

interface KPIDotProps extends React.HTMLAttributes<HTMLSpanElement> {
    color?: NonNullable<KPICardRootProps['color']>
}
const KPICardDot = ({ color = 'default', className, ...props }: KPIDotProps) => (
    <span
        data-slot="kpi-card-dot"
        className={cn('inline-block h-2 w-2 shrink-0 rounded-full', dotColor[color], className)}
        {...props}
    />
)

const sizeClass: Record<NonNullable<KPICardRootProps['size']>, string> = {
    sm: 'text-2xl',
    md: 'text-3xl',
    lg: 'text-4xl',
}

interface KPICardValueProps extends React.HTMLAttributes<HTMLDivElement> {
    size?: NonNullable<KPICardRootProps['size']>
}
const KPICardValue = ({ size = 'md', className, ...props }: KPICardValueProps) => (
    <div
        data-slot="kpi-card-value"
        className={cn('font-semibold leading-tight', sizeClass[size], className)}
        {...props}
    />
)

const KPICardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        data-slot="kpi-card-footer"
        className={cn('text-xs text-muted-foreground', className)}
        {...props}
    />
)

export const KPICard = {
    Root: KPICardRoot,
    Header: KPICardHeader,
    Label: KPICardLabel,
    Dot: KPICardDot,
    Value: KPICardValue,
    Footer: KPICardFooter,
}

interface SimpleKPIProps extends Omit<KPICardRootProps, 'children'> {
    label: string
    value: React.ReactNode
    footer?: React.ReactNode
}

/**
 * Convenience preset: dot + label + value (+ optional footer).
 * Use this when you don't need custom sub-arrangement.
 */
export const SimpleKPI = React.forwardRef<HTMLDivElement, SimpleKPIProps>(
    ({ label, value, footer, color = 'default', size = 'md', ...rest }, ref) => (
        <KPICardRoot ref={ref} color={color} size={size} {...rest}>
            <KPICardHeader>
                <KPICardDot color={color} />
                <KPICardLabel>{label}</KPICardLabel>
            </KPICardHeader>
            <KPICardValue size={size}>{value}</KPICardValue>
            {footer ? <KPICardFooter>{footer}</KPICardFooter> : null}
        </KPICardRoot>
    ),
)
SimpleKPI.displayName = 'SimpleKPI'

interface KPIGridProps extends React.HTMLAttributes<HTMLDivElement> {
    columns?: 2 | 3 | 4 | 5 | 6
}

const colsClass: Record<NonNullable<KPIGridProps['columns']>, string> = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5',
    6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-6',
}

export const KPIGrid = ({ columns = 4, className, ...props }: KPIGridProps) => (
    <div
        data-slot="kpi-grid"
        className={cn('grid gap-4', colsClass[columns], className)}
        {...props}
    />
)
