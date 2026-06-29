/**
 * The blocking session-expired modal: hidden while the session is valid; when
 * expired it shows the EXACT expiry time and makes clear earlier work was saved;
 * the single button signs out, clears the flag and redirects to /login with a
 * returnTo so the user lands back where they were.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const replaceMock = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/permutas',
}))

const useAuthMock = jest.fn()
jest.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}))

import { SessionExpiredModal } from '@/components/auth/SessionExpiredModal'

describe('SessionExpiredModal', () => {
  const signOut = jest.fn()
  const clearSessionExpired = jest.fn()
  // Fixed local instant → formatted as dd/MM HH:mm by date-fns.
  const expiredAt = new Date(2026, 5, 29, 14, 30).getTime()

  beforeEach(() => {
    replaceMock.mockReset()
    signOut.mockReset()
    clearSessionExpired.mockReset()
    useAuthMock.mockReset()
  })

  it('renders nothing while the session is valid', () => {
    useAuthMock.mockReturnValue({
      sessionExpired: false,
      sessionExpiredAt: null,
      signOut,
      clearSessionExpired,
    })
    render(<SessionExpiredModal />)
    expect(screen.queryByTestId('session-expired-modal')).not.toBeInTheDocument()
  })

  it('shows the expiry time and that nothing after it was saved', () => {
    useAuthMock.mockReturnValue({
      sessionExpired: true,
      sessionExpiredAt: expiredAt,
      signOut,
      clearSessionExpired,
    })
    render(<SessionExpiredModal />)
    const modal = screen.getByTestId('session-expired-modal')
    expect(modal).toHaveTextContent('Sua sessão expirou')
    expect(modal).toHaveTextContent('29/06 14:30')
    expect(modal).toHaveTextContent('Nada feito após esse horário foi salvo')
  })

  it('relogin button signs out, clears the flag and redirects with returnTo', async () => {
    useAuthMock.mockReturnValue({
      sessionExpired: true,
      sessionExpiredAt: expiredAt,
      signOut,
      clearSessionExpired,
    })
    render(<SessionExpiredModal />)
    await userEvent.click(screen.getByTestId('session-expired-relogin'))
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(clearSessionExpired).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledWith('/login?returnTo=%2Fpermutas')
  })
})
