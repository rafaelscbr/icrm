import { useEffect, useState } from 'react'
import { Users, Shield, UserCheck, UserX, Pencil } from 'lucide-react'
import { PageLayout } from '../components/layout/PageLayout'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { useAuthStore, Profile } from '../store/useAuthStore'
import toast from 'react-hot-toast'

export function AdminPage() {
  const { fetchAllProfiles, updateProfile, createBroker } = useAuthStore()

  const [profiles,    setProfiles]    = useState<Profile[]>([])
  const [loading,     setLoading]     = useState(true)
  const [editTarget,  setEditTarget]  = useState<Profile | null>(null)
  const [editName,    setEditName]    = useState('')
  const [editRole,    setEditRole]    = useState<'admin' | 'broker'>('broker')
  const [newOpen,     setNewOpen]     = useState(false)
  const [newName,     setNewName]     = useState('')
  const [newEmail,    setNewEmail]    = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving,      setSaving]      = useState(false)

  async function reload() {
    setLoading(true)
    try {
      const data = await fetchAllProfiles()
      setProfiles(data)
    } catch { toast.error('Erro ao carregar corretores') }
    finally   { setLoading(false) }
  }

  useEffect(() => { reload() }, [])

  function openEdit(p: Profile) {
    setEditTarget(p)
    setEditName(p.name)
    setEditRole(p.role)
  }

  async function saveEdit() {
    if (!editTarget) return
    setSaving(true)
    try {
      await updateProfile(editTarget.id, { name: editName, role: editRole })
      toast.success('Perfil atualizado')
      setEditTarget(null)
      await reload()
    } catch { toast.error('Erro ao salvar') }
    finally   { setSaving(false) }
  }

  async function toggleActive(p: Profile) {
    try {
      await updateProfile(p.id, { active: !p.active })
      toast.success(p.active ? 'Corretor desativado' : 'Corretor reativado')
      await reload()
    } catch { toast.error('Erro ao atualizar') }
  }

  async function handleCreateBroker() {
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      toast.error('Preencha todos os campos')
      return
    }
    setSaving(true)
    const err = await createBroker(newEmail.trim(), newPassword, newName.trim())
    setSaving(false)
    if (err) {
      toast.error(err)
      return
    }
    toast.success(`Conta criada para ${newName}. O corretor já pode fazer login.`)
    setNewOpen(false)
    setNewName(''); setNewEmail(''); setNewPassword('')
    await reload()
  }

  const admins  = profiles.filter(p => p.role === 'admin')
  const brokers = profiles.filter(p => p.role === 'broker')

  return (
    <PageLayout
      title="Administração"
      subtitle={`${profiles.length} usuário${profiles.length !== 1 ? 's' : ''} cadastrado${profiles.length !== 1 ? 's' : ''}`}
      ctaLabel="Adicionar Corretor"
      onCta={() => setNewOpen(true)}
    >
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">

          {/* Admins */}
          {admins.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-t4 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Shield size={12} /> Administradores
              </h2>
              <div className="flex flex-col gap-2">
                {admins.map(p => (
                  <ProfileRow key={p.id} profile={p} onEdit={openEdit} onToggle={toggleActive} />
                ))}
              </div>
            </div>
          )}

          {/* Brokers */}
          <div>
            <h2 className="text-xs font-semibold text-t4 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Users size={12} /> Corretores
            </h2>
            {brokers.length === 0 ? (
              <Card>
                <p className="text-sm text-t3 text-center py-4">Nenhum corretor cadastrado ainda.</p>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {brokers.map(p => (
                  <ProfileRow key={p.id} profile={p} onEdit={openEdit} onToggle={toggleActive} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit modal */}
      <Modal isOpen={Boolean(editTarget)} onClose={() => setEditTarget(null)} title="Editar Perfil" size="sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-t3 uppercase tracking-wider">Nome</label>
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="w-full bg-s3/50 border border-line rounded-xl px-3 py-2.5 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-t3 uppercase tracking-wider">Papel</label>
            <div className="flex gap-2">
              {(['admin', 'broker'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setEditRole(r)}
                  className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${editRole === r ? 'bg-brand/20 border-brand/40 text-brand-text' : 'bg-s3/50 border-line text-t3'}`}
                >
                  {r === 'admin' ? 'Administrador' : 'Corretor'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button className="flex-1" onClick={saveEdit} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* New broker modal */}
      <Modal isOpen={newOpen} onClose={() => setNewOpen(false)} title="Adicionar Corretor" size="sm">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-t3 uppercase tracking-wider">Nome completo</label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="João Silva"
              className="w-full bg-s3/50 border border-line rounded-xl px-3 py-2.5 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-t3 uppercase tracking-wider">E-mail</label>
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="joao@email.com"
              className="w-full bg-s3/50 border border-line rounded-xl px-3 py-2.5 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-t3 uppercase tracking-wider">Senha temporária</label>
            <input
              type="text"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full bg-s3/50 border border-line rounded-xl px-3 py-2.5 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
            <p className="text-xs text-t4">O corretor deverá alterar a senha no primeiro acesso.</p>
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setNewOpen(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={handleCreateBroker} disabled={saving}>
              {saving ? 'Criando...' : 'Criar conta'}
            </Button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  )
}

function ProfileRow({ profile, onEdit, onToggle }: { profile: Profile; onEdit: (p: Profile) => void; onToggle: (p: Profile) => void }) {
  return (
    <Card className="!p-4">
      <div className="flex items-center gap-3">
        <Avatar name={profile.name} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-t1 truncate">{profile.name}</p>
            {profile.role === 'admin' && (
              <Badge variant="indigo">Admin</Badge>
            )}
            {!profile.active && (
              <Badge variant="slate">Inativo</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onToggle(profile)}
            className={`w-8 h-8 flex items-center justify-center rounded-xl transition-colors cursor-pointer ${profile.active ? 'hover:bg-red-500/10 text-t4 hover:text-red-400' : 'hover:bg-green-500/10 text-t4 hover:text-green-400'}`}
            title={profile.active ? 'Desativar' : 'Reativar'}
          >
            {profile.active ? <UserX size={14} /> : <UserCheck size={14} />}
          </button>
          <button
            onClick={() => onEdit(profile)}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-s3/70 text-t4 hover:text-t1 transition-colors cursor-pointer"
          >
            <Pencil size={14} />
          </button>
        </div>
      </div>
    </Card>
  )
}
