/**
 * Tests that RouteGate leaves the public route (/login) ungated and wraps
 * every other route in the AuthGuard.
 */
import { render, screen } from '@testing-library/react'

const pathnameMock = jest.fn()
jest.mock('next/navigation', () => ({
  usePathname: () => pathnameMock(),
}))

jest.mock('@/components/auth/AuthGuard', () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-guard">{children}</div>
  ),
}))

import { RouteGate } from '@/components/auth/RouteGate'

describe('RouteGate', () => {
  beforeEach(() => pathnameMock.mockReset())

  it('does not gate the /login route', () => {
    pathnameMock.mockReturnValue('/login')
    render(
      <RouteGate>
        <div>page</div>
      </RouteGate>,
    )
    expect(screen.queryByTestId('auth-guard')).not.toBeInTheDocument()
    expect(screen.getByText('page')).toBeInTheDocument()
  })

  it('gates a protected route through the AuthGuard', () => {
    pathnameMock.mockReturnValue('/')
    render(
      <RouteGate>
        <div>page</div>
      </RouteGate>,
    )
    expect(screen.getByTestId('auth-guard')).toBeInTheDocument()
    expect(screen.getByText('page')).toBeInTheDocument()
  })

  it('gates the root route', () => {
    pathnameMock.mockReturnValue('/')
    render(
      <RouteGate>
        <div>page</div>
      </RouteGate>,
    )
    expect(screen.getByTestId('auth-guard')).toBeInTheDocument()
  })
})
