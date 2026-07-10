'use client'

import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { resetarSenha, type AppUser } from '@/lib/usuarios'

/** Dialog de redefinição de senha. `alvo=null` fecha; setar um usuário abre. */
export function ResetSenhaDialog({
  alvo,
  onClose,
}: {
  alvo: AppUser | null
  onClose: () => void
}) {
  const [senha, setSenha] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!alvo || saving) return
    setSaving(true)
    try {
      await resetarSenha(alvo.id, senha)
      toast.success(`Senha de ${alvo.username} redefinida.`)
      setSenha('')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao redefinir a senha.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={alvo != null}
      onOpenChange={(o) => {
        if (!o) {
          setSenha('')
          onClose()
        }
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              Nova senha para <strong>{alvo?.username}</strong> (mín. 8 caracteres).
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-1.5">
              <Label htmlFor="reset-senha">Nova senha</Label>
              <Input
                id="reset-senha"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner /> : <KeyRound className="size-4" aria-hidden />} Redefinir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
