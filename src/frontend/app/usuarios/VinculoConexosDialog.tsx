'use client'

import { useState } from 'react'
import { Link2, Link2Off } from 'lucide-react'
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
import { type AppUser, definirVinculoConexos, removerVinculoConexos } from '@/lib/usuarios'

/** Dialog para definir/remover o vínculo Conexos de um usuário. `alvo=null` fecha. */
export function VinculoConexosDialog({
  alvo,
  onClose,
  onSaved,
}: {
  alvo: AppUser | null
  onClose: () => void
  onSaved: () => void
}) {
  const [cxUser, setCxUser] = useState('')
  const [cxSenha, setCxSenha] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  const reset = () => {
    setCxUser('')
    setCxSenha('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!alvo || saving) return
    setSaving(true)
    try {
      await definirVinculoConexos(alvo.id, {
        conexosUsername: cxUser.trim(),
        conexosPassword: cxSenha,
      })
      toast.success(`Vínculo Conexos de ${alvo.username} atualizado.`)
      reset()
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar o vínculo.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    if (!alvo || removing) return
    setRemoving(true)
    try {
      await removerVinculoConexos(alvo.id)
      toast.success(`Vínculo removido — ${alvo.username} volta a operar pelo robô.`)
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao remover o vínculo.')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Dialog
      open={alvo != null}
      onOpenChange={(o) => {
        if (!o) {
          reset()
          onClose()
        }
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Vínculo Conexos</DialogTitle>
            <DialogDescription>
              Acesso do ERP para <strong>{alvo?.username}</strong>. Com o vínculo, as execuções saem
              no nome deste usuário.
              {alvo?.conexosUsername ? (
                <>
                  {' '}
                  Vínculo atual: <strong>{alvo.conexosUsername}</strong>.
                </>
              ) : (
                ' Hoje sem vínculo (opera pelo robô).'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="vinc-user">Login Conexos</Label>
              <Input
                id="vinc-user"
                autoComplete="off"
                placeholder="NOME_SOBRENOME"
                value={cxUser}
                onChange={(e) => setCxUser(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vinc-senha">Senha Conexos</Label>
              <Input
                id="vinc-senha"
                type="password"
                autoComplete="new-password"
                value={cxSenha}
                onChange={(e) => setCxSenha(e.target.value)}
                required
              />
            </div>
          </DialogBody>
          <DialogFooter className="sm:justify-between">
            {alvo?.conexosUsername ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleRemove}
                disabled={removing || saving}
              >
                {removing ? <Spinner /> : <Link2Off className="size-4" aria-hidden />} Remover vínculo
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={saving || removing}>
              {saving ? <Spinner /> : <Link2 className="size-4" aria-hidden />} Salvar vínculo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
