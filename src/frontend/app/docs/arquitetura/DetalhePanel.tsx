'use client'

import { AlertTriangle, FileCode2, FileText, Server, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    CAMADA_LABEL,
    FRENTE_LABEL,
    MATURIDADE_LABEL,
    type ArqNodeData,
    type NivelRisco,
} from '@/lib/arquitetura'
import { cn } from '@/lib/utils'

const CLASSE_RISCO: Record<NivelRisco, string> = {
    critico: 'border-danger/50 bg-danger-subtle/50',
    alto: 'border-warning/50 bg-warning-subtle/50',
    medio: 'border-info/40 bg-info-subtle/40',
}

const LABEL_RISCO: Record<NivelRisco, string> = {
    critico: 'Crítico',
    alto: 'Alto',
    medio: 'Médio',
}

interface DetalhePanelProps {
    node: ArqNodeData | null
    onClose: () => void
}

/**
 * Painel lateral com a profundidade de cada nó. O diagrama fica legível porque
 * a explicação longa mora aqui, sob demanda — não nas caixas.
 */
export function DetalhePanel({ node, onClose }: DetalhePanelProps) {
    if (!node) return null

    return (
        <aside
            className="absolute right-0 top-0 z-20 flex h-full w-full max-w-md flex-col overflow-y-auto border-l bg-card shadow-xl sm:w-[26rem]"
            aria-label={`Detalhes de ${node.label}`}
        >
            <header className="sticky top-0 flex items-start gap-2 border-b bg-card px-5 py-4">
                <div className="min-w-0 flex-1 space-y-1">
                    <h2 className="text-base font-bold leading-tight">{node.label}</h2>
                    <p className="text-xs text-muted-foreground">
                        {FRENTE_LABEL[node.frente]} · {CAMADA_LABEL[node.camada]} ·{' '}
                        {MATURIDADE_LABEL[node.maturidade]}
                    </p>
                </div>
                <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar painel">
                    <X className="size-4" />
                </Button>
            </header>

            <div className="space-y-5 px-5 py-4 text-sm">
                <div className="space-y-3">
                    {node.descricao.split('\n\n').map((paragrafo) => (
                        <p key={paragrafo.slice(0, 40)} className="leading-relaxed text-foreground">
                            {paragrafo}
                        </p>
                    ))}
                </div>

                {node.riscos?.length ? (
                    <section className="space-y-2">
                        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <AlertTriangle className="size-3.5" aria-hidden />
                            Riscos e lacunas
                        </h3>
                        <ul className="space-y-2">
                            {node.riscos.map((risco) => (
                                <li
                                    key={risco.texto}
                                    className={cn('rounded-md border px-3 py-2', CLASSE_RISCO[risco.nivel])}
                                >
                                    <p className="text-[10px] font-bold uppercase tracking-wide">
                                        {LABEL_RISCO[risco.nivel]}
                                    </p>
                                    <p className="mt-1 text-[13px] leading-relaxed">{risco.texto}</p>
                                    {risco.origem ? (
                                        <p className="mt-1.5 text-[11px] italic text-muted-foreground">
                                            {risco.origem}
                                        </p>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {node.programasErp?.length ? (
                    <section className="space-y-2">
                        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <Server className="size-3.5" aria-hidden />
                            Programas do ERP
                        </h3>
                        <ul className="flex flex-wrap gap-1.5">
                            {node.programasErp.map((programa) => (
                                <li
                                    key={programa}
                                    className="rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-foreground"
                                >
                                    {programa}
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {node.arquivos?.length ? (
                    <section className="space-y-2">
                        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <FileCode2 className="size-3.5" aria-hidden />
                            Onde vive no código
                        </h3>
                        <ul className="space-y-1">
                            {node.arquivos.map((arquivo) => (
                                <li
                                    key={arquivo}
                                    className="break-all font-mono text-[11px] leading-relaxed text-muted-foreground"
                                >
                                    {arquivo}
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {node.docRefs?.length ? (
                    <section className="space-y-2">
                        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <FileText className="size-3.5" aria-hidden />
                            Referências
                        </h3>
                        <ul className="space-y-1">
                            {node.docRefs.map((ref) => (
                                <li key={ref} className="text-[12px] leading-relaxed text-muted-foreground">
                                    {ref}
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}
            </div>
        </aside>
    )
}
