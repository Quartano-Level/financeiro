import * as React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { SimpleKPI, KPIGrid } from '@/components/ui/kpi-card'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Switch } from '@/components/ui/switch'
import { MultiSelect } from '@/components/ui/multi-select'
import { DatePicker } from '@/components/ui/date-picker'

describe('UI primitives smoke', () => {
    it('Dialog opens and shows title on trigger click', async () => {
        const user = userEvent.setup()
        render(
            <Dialog>
                <DialogTrigger>Open</DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Test title</DialogTitle>
                    </DialogHeader>
                </DialogContent>
            </Dialog>,
        )
        expect(screen.queryByText('Test title')).toBeNull()
        await user.click(screen.getByText('Open'))
        expect(screen.getByText('Test title')).toBeInTheDocument()
    })

    it('SimpleKPI renders label + value and toggles active on click', async () => {
        const user = userEvent.setup()
        const onClick = jest.fn()
        render(<SimpleKPI label="Total" value={42} onClick={onClick} />)
        expect(screen.getByText('Total')).toBeInTheDocument()
        expect(screen.getByText('42')).toBeInTheDocument()
        await user.click(screen.getByRole('button'))
        expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('KPIGrid renders children in a grid', () => {
        render(
            <KPIGrid columns={3}>
                <SimpleKPI label="A" value={1} />
                <SimpleKPI label="B" value={2} />
            </KPIGrid>,
        )
        expect(screen.getByText('A')).toBeInTheDocument()
        expect(screen.getByText('B')).toBeInTheDocument()
    })

    it('PageHeader renders title and subtitle', () => {
        render(<PageHeader title="Hello" subtitle="World" />)
        expect(screen.getByText('Hello')).toBeInTheDocument()
        expect(screen.getByText('World')).toBeInTheDocument()
    })

    it('EmptyState renders title + description', () => {
        render(<EmptyState title="No data" description="Try a different filter" />)
        expect(screen.getByText('No data')).toBeInTheDocument()
        expect(screen.getByText('Try a different filter')).toBeInTheDocument()
    })

    it('Switch toggles checked state', async () => {
        const user = userEvent.setup()
        const onChange = jest.fn()
        render(<Switch onCheckedChange={onChange} />)
        await user.click(screen.getByRole('switch'))
        expect(onChange).toHaveBeenCalledWith(true)
    })

    it('DatePicker emits ISO date string', async () => {
        const user = userEvent.setup()
        const onChange = jest.fn()
        render(<DatePicker onChange={onChange} aria-label="data base" />)
        const input = screen.getByLabelText('data base')
        await user.type(input, '2026-04-30')
        expect(onChange).toHaveBeenCalled()
        const lastCall = onChange.mock.calls.at(-1)
        expect(lastCall?.[0]).toBe('2026-04-30')
    })

    it('MultiSelect filters options by substring', async () => {
        const user = userEvent.setup()
        const onChange = jest.fn()
        render(
            <MultiSelect
                options={[
                    { value: 'a', label: 'Alpha' },
                    { value: 'b', label: 'Beta' },
                    { value: 'c', label: 'Charlie' },
                ]}
                value={[]}
                onChange={onChange}
                aria-label="filtro"
            />,
        )
        await user.click(screen.getByLabelText('filtro'))
        expect(screen.getByText('Alpha')).toBeInTheDocument()
        expect(screen.getByText('Beta')).toBeInTheDocument()
        expect(screen.getByText('Charlie')).toBeInTheDocument()

        const search = screen.getByLabelText('Buscar opções')
        await user.type(search, 'al')
        expect(screen.queryByText('Beta')).toBeNull()
        expect(screen.getByText('Alpha')).toBeInTheDocument()
    })

    it('MultiSelect toggles selection on option click', async () => {
        const user = userEvent.setup()
        const onChange = jest.fn()
        render(
            <MultiSelect
                options={[{ value: 'a', label: 'Alpha' }]}
                value={[]}
                onChange={onChange}
                aria-label="filtro"
            />,
        )
        await user.click(screen.getByLabelText('filtro'))
        await user.click(screen.getByText('Alpha'))
        expect(onChange).toHaveBeenCalledWith(['a'])
    })
})
