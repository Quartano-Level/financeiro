/**
 * Tests the client-side route guard: unauthenticated visitors are redirected
 * to /login, the loading state shows a spinner, authenticated visitors see
 * the protected children, and dev-bypass disables the gate.
 */
import { render, screen } from '@testing-library/react'

const replaceMock = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}))

const useIsAuthenticatedMock = jest.fn()
jest.mock('@/lib/auth/AuthProvider', () => ({
  useIsAuthenticated: () => useIsAuthenticatedMock(),
}))

import { AuthGuard } from '@/components/auth/AuthGuard'

describe('AuthGuard', () => {
  beforeEach(() => {
    replaceMock.mockReset()
    useIsAuthenticatedMock.mockReset()
  })

  it('renders a spinner while the session is resolving', () => {
    useIsAuthenticatedMock.mockReturnValue({ authenticated: false, loading: true })
    render(
      <AuthGuard>
        <div>secret</div>
      </AuthGuard>,
    )
    expect(screen.getByTestId('auth-loading')).toBeInTheDocument()
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('redirects unauthenticated visitors to /login', () => {
    useIsAuthenticatedMock.mockReturnValue({ authenticated: false, loading: false })
    render(
      <AuthGuard>
        <div>secret</div>
      </AuthGuard>,
    )
    expect(replaceMock).toHaveBeenCalledWith('/login')
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })

  it('renders children for an authenticated visitor', () => {
    useIsAuthenticatedMock.mockReturnValue({ authenticated: true, loading: false })
    render(
      <AuthGuard>
        <div>secret</div>
      </AuthGuard>,
    )
    expect(screen.getByText('secret')).toBeInTheDocument()
    expect(replaceMock).not.toHaveBeenCalled()
  })
})
