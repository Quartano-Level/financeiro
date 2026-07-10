'use client'

import { AlertTriangle } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthProvider'

/**
 * Banner de aviso persistente (Fatia B): aparece quando o usuário TEM vínculo
 * Conexos mas a credencial não loga no ERP (`conexosStatus === 'falha'`) — ele
 * está operando pelo robô, então as execuções NÃO sairão no nome dele até
 * corrigir a senha. `ok`/`ausente`/`null` não mostram nada.
 */
export function ConexosStatusBanner() {
  const { conexosStatus } = useAuth()
  if (conexosStatus !== 'falha') return null

  return (
    <div
      role="alert"
      className="flex items-start gap-2 border-b border-warning/40 bg-warning-subtle px-4 py-2 text-sm text-warning-foreground sm:px-6 lg:px-8"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        Sua credencial do Conexos não está válida — você está operando com o acesso do robô, e as
        execuções não sairão no seu nome. Peça a um administrador para atualizar sua senha do Conexos
        em <strong>Usuários</strong>.
      </p>
    </div>
  )
}
