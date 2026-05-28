import { useEffect, useState } from 'react'
import { Users, Shield, UserCheck, UserX, Pencil, LayoutGrid } from 'lucide-react'
import { PageLayout } from '../components/layout/PageLayout'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { useAuthStore, Profile } from '../store/useAuthStore'
import toast from 'react-hot-toast'

const ALL_MENU_ITEMS = [
  { key: 'dashboard',   label: 'Dashboard',   section: 'Principal' },
  { key: 'tarefas',     label: 'Tarefas',     section: 'Principal' },
  { key: 'metas',       label: 'Metas',       section: 'Principal' },
  { key: 'leads',       label: 'Leads',       section: 'Comercial' },
  { key: 'contatos',    label: 'Contatos',    section: 'Comercial' },
  { key: 'imoveis',     label: 'Imóveis',     section: 'Comercial' },
  { key: 'vendas',      label: 'Vendas',      section: 'Comercial' },
  { key: 'campanhas',   label: 'Campanhas',   section: 'Comercial' },
  { key: 'permuta',     label: 'Permuta',     section: 'Comercial' },
  { key: 'performance', label: 'Performance', section: 'Análise'   },
]

const SECTIONS = ['Principal', 'Comercial', 'Análise']

export function AdminPage() {
  const { fetchAllProfiles, updateProfile, createBroker, updateBrokerMenus } = useAuthStore()

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

  // menu management state
  const [menuTarget,    setMenuTarget]    = useState<Profile | null>(null)
  const [menuSelection, setMenuSelection] = useState<string[]>([])
  const [savingMenu,    setSavingMenu]    = useState(false)

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

  function openMenuManager(p: Profile) {
    setMenuTarget(p)
    // null = todos liberados → seleciona todos por padrão
    setMenuSelection(p.allowedMenus ?? ALL_MENU_ITEMS.map(i => i.key))
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

  function toggleMenuItem(key: string) {
    setMenuSelection(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  async function saveMenuConfig() {
    if (!menuTarget) return
    setSavingMenu(true)
    try {
      const allSelected = menuSelection.length === ALL_MENU_ITEMS.length
      // null = todos liberados (sem restrição)
      await updateBrokerMenus(menuTarget.id, allSelected ? null : menuSelection)
      toast.success('Permissões de menu salvas')
      setMenuTarget(null)
      await reload()
    } catch { toast.error('Erro ao salvar permissões') }
    finally   { setSavingMenu(false) }
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
                  <ProfileRow
                    key={p.id}
                    profile={p}
                    onEdit={openEdit}
                    onToggle={toggleActive}
                    onManageMenu={openMenuManager}
                  />
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

      {/* Menu management modal */}
      <Modal
        isOpen={Boolean(menuTarget)}
        onClose={() => setMenuTarget(null)}
        title={`Menu de ${menuTarget?.name ?? ''}`}
        size="sm"
      >
        <div className="flex flex-col gap-5">
          <p className="text-xs text-t3">
            Selecione quais itens do menu este corretor pode ver. Desmarcar um item oculta a página para ele.
          </p>

          {SECTIONS.map(section => {
            const items = ALL_MENU_ITEMS.filter(i => i.section === section)
            return (
              <div key={section}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-t4 mb-2">{section}</p>
                <div className="flex flex-col gap-1">
                  {items.map(item => {
                    const enabled = menuSelection.includes(item.key)
                    return (
                      <button
                        key={item.key}
                        onClick={() => toggleMenuItem(item.key)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left w-full"
                        style={{
                          background: enabled ? 'var(--brand-subtle, rgba(var(--brand-rgb),0.08))' : 'var(--s3)',
                          borderColor: enabled ? 'var(--brand)' : 'var(--line)',
                          opacity: enabled ? 1 : 0.6,
                        }}
                      >
                        <div
                          className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all"
                          style={{
                            background: enabled ? 'var(--brand)' : 'transparent',
                            border: enabled ? 'none' : '1.5px solid var(--t4)',
                          }}
                        >
                          {enabled && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <span className="text-sm font-medium" style={{ color: enabled ? 'var(--t1)' : 'var(--t3)' }}>
                          {item.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setMenuSelection(ALL_MENU_ITEMS.map(i => i.key))}
              className="text-xs text-t3 hover:text-t1 transition-colors cursor-pointer"
            >
              Selecionar tudo
            </button>
            <span className="text-t4">·</span>
            <button
              onClick={() => setMenuSelection([])}
              className="text-xs text-t3 hover:text-t1 transition-colors cursor-pointer"
            >
              Desmarcar tudo
            </button>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setMenuTarget(null)}>Cancelar</Button>
            <Button className="flex-1" onClick={saveMenuConfig} disabled={savingMenu}>
              {savingMenu ? 'Salvando...' : 'Salvar permissões'}
            </Button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  )
}

function ProfileRow({
  profile,
  onEdit,
  onToggle,
  onManageMenu,
}: {
  profile: Profile
  onEdit: (p: Profile) => void
  onToggle: (p: Profile) => void
  onManageMenu?: (p: Profile) => void
}) {
  const menuRestricted = profile.role === 'broker' && profile.allowedMenus !== null

  return (
    <Card className="!p-4">
      <div className="flex items-center gap-3">
        <Avatar name={profile.name} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-t1 truncate">{profile.name}</p>
            {profile.role === 'admin' && (
              <Badge variant="indigo">Admin</Badge>
            )}
            {!profile.active && (
              <Badge variant="slate">Inativo</Badge>
            )}
            {menuRestricted && (
              <Badge variant="slate">
                Menu restrito ({profile.allowedMenus!.length}/{9})
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onManageMenu && (
            <button
              onClick={() => onManageMenu(profile)}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-s3/70 text-t4 hover:text-t1 transition-colors cursor-pointer"
              title="Gerenciar menu"
            >
              <LayoutGrid size={14} />
            </button>
          )}
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
