import * as React from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
    title: React.ReactNode
    description?: React.ReactNode
    icon?: React.ReactNode
    action?: React.ReactNode
}

/**
 * Empty state — appears when a list/table has no rows. Always explains
 * *why* it is empty and *what to do next*. Aligned with
 * `docs/design-system/empty-state.md`.
 */
export const EmptyState = ({
    title,
    description,
    icon,
    action,
    className,
    ...props
}: EmptyStateProps) => (
    <div
        data-slot="empty-state"
        className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card p-10 text-center',
            className,
        )}
        {...props}
    >
        {icon ? <div className="text-muted-foreground">{icon}</div> : null}
        <h3 className="text-base font-semibold">{title}</h3>
        {description ? (
            <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        ) : null}
        {action ? <div className="mt-2">{action}</div> : null}
    </div>
)
