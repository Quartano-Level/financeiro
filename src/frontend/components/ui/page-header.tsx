import * as React from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
    title: React.ReactNode
    subtitle?: React.ReactNode
    actions?: React.ReactNode
}

/**
 * Page header — title, subtitle, optional action slot. One per page.
 * Aligned with `docs/design-system/page-header.md`.
 */
export const PageHeader = ({
    title,
    subtitle,
    actions,
    className,
    ...props
}: PageHeaderProps) => (
    <div
        data-slot="page-header"
        className={cn('flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between', className)}
        {...props}
    >
        <div className="space-y-1">
            <h1 className="text-2xl font-bold leading-tight tracking-tight">{title}</h1>
            {subtitle ? (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
)
