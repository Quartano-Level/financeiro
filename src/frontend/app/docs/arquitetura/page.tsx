import type { Metadata } from 'next'
import { PageHeader } from '@/components/ui/page-header'
import { ArquiteturaFlow } from './ArquiteturaFlow'

export const metadata: Metadata = {
    title: 'Arquitetura · Financeiro',
    description:
        'Mapa da automação financeira da Columbia Trading — as três frentes, as camadas técnicas e o estado-alvo.',
    // Rota pública: não deve ser indexada por buscadores.
    robots: { index: false, follow: false },
}

/**
 * `/docs/arquitetura` — mapa navegável da plataforma.
 *
 * Rota pública (registrada em `PUBLIC_ROUTES` do `RouteGate`): o conteúdo é
 * servido a visitantes não autenticados.
 */
export default function ArquiteturaPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Arquitetura"
                subtitle="Automação financeira da Columbia Trading — as três frentes, as camadas que as sustentam e o caminho até o estado-alvo."
            />

            <section className="max-w-3xl space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                    A plataforma automatiza três frentes do financeiro, todas girando em torno do ERP
                    Conexos: <strong className="text-foreground">Permutas</strong>, que reconcilia
                    adiantamentos contra invoices na baixa;{' '}
                    <strong className="text-foreground">SISPAG</strong>, que monta e executa os lotes de
                    pagamento; e <strong className="text-foreground">Popula GED</strong>, que destravaria
                    as notas de crédito e débito presas por falta de documento anexado.
                </p>
                <p>
                    As três estão em estágios muito diferentes, e o diagrama mostra isso: Permutas roda em
                    produção, SISPAG tem tudo construído menos o transporte do arquivo até o banco, e a
                    frente de GED ainda é só especificação comercial. O contorno tracejado marca o que não
                    existe.
                </p>
            </section>

            <ArquiteturaFlow />
        </div>
    )
}
