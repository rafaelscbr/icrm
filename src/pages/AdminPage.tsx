import { useEffect, useState } from 'react'
import {
  Users, Shield, UserCheck, UserX, Pencil, LayoutGrid, Plus, EyeOff, Lock,
} from 'lucide-react'
import { PageLayout } from '../components/layout/PageLayout'
import { SidePanel } from '../components/ui/SidePanel'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { EstadoTela } from '../components/shared/EstadoTela'
import { SecaoTitulo, Rotulo, Chip, IconeTom } from '../components/shared/visual'
import { useAuthStore, Profile } from '../store/useAuthStore'
import { mensagemDeErro } from '../lib/erros'
import toast from 'react-hot-toast'

/**
 * Administração de usuários.
 *
 * A tela estava fora da linguagem do sistema e, pior, escondia o que importa.
 * Uma linha ocupava a largura toda para mostrar um nome e três ícones cinzentos
 * de 28px sem rótulo — abaixo dos 44 de alvo de toque, e indistinguíveis entre
 * si. E a restrição de menu, que é a informação de verdade desta tela, ficava
 * comprimida num selo "Menu restrito (11/14)": para saber **o que** o corretor
 * não vê, era preciso abrir um modal.
 *
 * Agora o que está bloqueado aparece na própria linha. O dado já estava em
 * mãos (`allowedMenus`); só não estava sendo mostrado.
 */

// As chaves TÊM que espelhar as da Sidebar. Um item que existe no menu e falta
// aqui é silenciosamente removido da permissão do corretor na primeira edição —
// era o caso de 'base-leads' e 'lancamentos' antes desta lista ser completada.
const ALL_MENU_ITEMS = [
  { key: 'dashboard',   label: 'Dashboard',          section: 'Principal' },
  { key: 'tarefas',     label: 'Tarefas',            section: 'Principal' },
  { key: 'metas',       label: 'Metas',              section: 'Principal' },
  { key: 'escritorio',  label: 'Escritório Virtual', section: 'Principal' },
  { key: 'leads',       label: 'Leads',              section: 'Comercial' },
  { key: 'contatos',    label: 'Contatos',           section: 'Comercial' },
  { key: 'base-leads',  label: 'Base de Leads',      section: 'Comercial' },
  { key: 'imoveis',     label: 'Produtos · Prontos',     section: 'Comercial' },
  { key: 'lancamentos', label: 'Produtos · Lançamentos', section: 'Comercial' },
  { key: 'vendas',      label: 'Vendas',             section: 'Comercial' },
  { key: 'disparos',    label: 'Prospecção · Disparos WhatsApp', section: 'Comercial' },
  { key: 'ligacoes',    label: 'Prospecção · Ligações WhatsApp', section: 'Comercial' },
  { key: 'simulador',   label: 'Simulador',          section: 'Comercial' },
  { key: 'performance', label: 'Performance',        section: 'Análise'   },
]

const SECTIONS = ['Principal', 'Comercial', 'Análise']

export function AdminPage() {
  const { fetchAllProfiles, updateProfile, createBroker, updateBrokerMenus } = useAuthStore()

  const [profiles,    setProfiles]    = useState<Profile[]>([])
  const [loading,     setLoading]     = useState(true)
  const [erro,        setErro]        = useState<string | null>(null)
  const [editTarget,  setEditTarget]  = useState<Profile | null>(null)
  const [editName,    setEditName]    = useState('')
  const [editRole,    setEditRole]    = useState<'admin' | 'broker'>('broker')
  const [newOpen,     setNewOpen]     = useState(false)
  const [newName,     setNewName]     = useState('')
  const [newEmail,    setNewEmail]    = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving,      setSaving]      = useState(false)

  const [menuTarget,    setMenuTarget]    = useState<Profile | null>(null)
  const [menuSelection, setMenuSelection] = useState<string[]>([])
  const [savingMenu,    setSavingMenu]    = useState(false)

  async function reload() {
    setLoading(true)
    setErro(null)
    try {
      const data = await fetchAllProfiles()
      setProfiles(data)
    } catch (err) {
      // Antes só saía um toast: a tela ficava vazia e parecia "nenhum usuário".
      console.error('[admin] fetchAllProfiles:', err)
      setErro(mensagemDeErro(err))
    } finally { setLoading(false) }
  }

  useEffect(() => { reload() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (err) { toast.error(err); return }
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

  const admins   = profiles.filter(p => p.role === 'admin')
  const brokers  = profiles.filter(p => p.role === 'broker')
  const inativos = profiles.filter(p => !p.active).length

  return (
    <PageLayout
      icon={Shield}
      iconTom="marca"
      title="Administração"
      subtitle={erro
        ? 'não foi possível ler os usuários'
        : `${admins.length} administrador${admins.length !== 1 ? 'es' : ''} · ${brokers.length} corretor${brokers.length !== 1 ? 'es' : ''}${inativos > 0 ? ` · ${inativos} desativado${inativos !== 1 ? 's' : ''}` : ''}`}
      ctaLabel="Adicionar corretor"
      onCta={() => setNewOpen(true)}
    >
      <EstadoTela
        carregando={loading && profiles.length === 0}
        erro={erro}
        vazio={profiles.length === 0}
        onTentarDeNovo={() => { void reload() }}
        icone={Users}
        titulo="Nenhum usuário cadastrado"
        descricao="Crie a primeira conta de corretor para começar."
        acao={
          <Button onClick={() => setNewOpen(true)} className="gap-2">
            <Plus size={14} /> Adicionar corretor
          </Button>
        }
      >
        <div className="flex flex-col gap-7">
          {admins.length > 0 && (
            <section>
              <SecaoTitulo icon={Shield} descricao="Enxergam tudo e administram contas">
                Administradores
              </SecaoTitulo>
              <div className="flex flex-col gap-2 mt-3">
                {admins.map(p => (
                  <ProfileRow key={p.id} profile={p} onEdit={openEdit} onToggle={toggleActive} />
                ))}
              </div>
            </section>
          )}

          <section>
            <SecaoTitulo icon={Users} tom="info" descricao="Cada um vê apenas o que está liberado no menu">
              Corretores
            </SecaoTitulo>
            {brokers.length === 0 ? (
              <p className="text-sm text-t3 mt-3 rounded-[14px] border border-line bg-s2/50 px-4 py-6 text-center">
                Nenhum corretor cadastrado ainda.
              </p>
            ) : (
              <div className="flex flex-col gap-2 mt-3">
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
          </section>
        </div>
      </EstadoTela>

      {/* ── Editar perfil ─────────────────────────────────────────────────── */}
      <SidePanel
        isOpen={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title="Editar perfil"
        subtitle={editTarget?.name}
        size="md"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button className="flex-1" onClick={saveEdit} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="admin-nome"><Rotulo>Nome</Rotulo></label>
            <input
              id="admin-nome"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="w-full bg-s3/50 border border-line rounded-[14px] px-3 py-2.5 min-h-[44px] text-sm text-t1
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            />
          </div>
          <fieldset className="flex flex-col gap-1.5 border-0 m-0 p-0">
            <legend className="mb-1.5"><Rotulo>Papel</Rotulo></legend>
            <div className="flex gap-2">
              {([
                { v: 'admin'  as const, label: 'Administrador', nota: 'vê tudo e administra contas' },
                { v: 'broker' as const, label: 'Corretor',      nota: 'vê o que estiver liberado' },
              ]).map(r => (
                <label
                  key={r.v}
                  className={`flex-1 flex flex-col gap-0.5 py-3 px-3 rounded-[14px] border cursor-pointer transition-all
                              has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40
                    ${editRole === r.v
                      ? 'bg-brand/15 border-brand/40 text-brand-text'
                      : 'bg-s3/50 border-line text-t3 hover:border-line-strong'}`}
                >
                  <input
                    type="radio" name="papel" checked={editRole === r.v}
                    onChange={() => setEditRole(r.v)} className="sr-only"
                  />
                  <span className="text-[13px] font-bold">{r.label}</span>
                  <span className="text-[11px] opacity-80">{r.nota}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </SidePanel>

      {/* ── Novo corretor ─────────────────────────────────────────────────── */}
      <SidePanel
        isOpen={newOpen}
        onClose={() => setNewOpen(false)}
        title="Adicionar corretor"
        subtitle="A conta já nasce pronta para login"
        size="md"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setNewOpen(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={handleCreateBroker} disabled={saving}>
              {saving ? 'Criando…' : 'Criar conta'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          {[
            { id: 'novo-nome',  label: 'Nome completo', value: newName,     set: setNewName,     type: 'text',  ph: 'João Silva' },
            { id: 'novo-email', label: 'E-mail',        value: newEmail,    set: setNewEmail,    type: 'email', ph: 'joao@email.com' },
            { id: 'novo-senha', label: 'Senha temporária', value: newPassword, set: setNewPassword, type: 'text', ph: 'Mínimo 6 caracteres' },
          ].map(c => (
            <div key={c.id} className="flex flex-col gap-1.5">
              <label htmlFor={c.id}><Rotulo>{c.label}</Rotulo></label>
              <input
                id={c.id}
                type={c.type}
                value={c.value}
                onChange={e => c.set(e.target.value)}
                placeholder={c.ph}
                className="w-full bg-s3/50 border border-line rounded-[14px] px-3 py-2.5 min-h-[44px] text-sm text-t1
                           placeholder:text-t4 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              />
              {c.id === 'novo-senha' && (
                <p className="text-xs text-t4">O corretor deverá alterar a senha no primeiro acesso.</p>
              )}
            </div>
          ))}
        </div>
      </SidePanel>

      {/* ── Menu do corretor ──────────────────────────────────────────────── */}
      <SidePanel
        isOpen={Boolean(menuTarget)}
        onClose={() => setMenuTarget(null)}
        title="Menu liberado"
        subtitle={menuTarget?.name}
        size="md"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setMenuTarget(null)}>Cancelar</Button>
            <Button className="flex-1" onClick={saveMenuConfig} disabled={savingMenu}>
              {savingMenu ? 'Salvando…' : 'Salvar permissões'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-s2/50 px-4 py-3">
            <p className="text-[13px] text-t3">
              <span className="font-bold text-t1 tabular-nums">{menuSelection.length}</span> de{' '}
              <span className="tabular-nums">{ALL_MENU_ITEMS.length}</span> itens liberados.
              O que estiver desmarcado some do menu dele.
            </p>
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => setMenuSelection(ALL_MENU_ITEMS.map(i => i.key))}
                className="text-xs font-semibold text-t3 hover:text-t1 transition-colors cursor-pointer px-2 py-2 rounded-lg
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                Tudo
              </button>
              <button
                onClick={() => setMenuSelection([])}
                className="text-xs font-semibold text-t3 hover:text-t1 transition-colors cursor-pointer px-2 py-2 rounded-lg
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                Nada
              </button>
            </div>
          </div>

          {SECTIONS.map(section => {
            const items = ALL_MENU_ITEMS.filter(i => i.section === section)
            return (
              <fieldset key={section} className="border-0 m-0 p-0">
                <legend className="mb-2"><Rotulo>{section}</Rotulo></legend>
                <div className="flex flex-col gap-1">
                  {items.map(item => {
                    const enabled = menuSelection.includes(item.key)
                    return (
                      <label
                        key={item.key}
                        className={`flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-[14px] border
                                    cursor-pointer transition-all text-left w-full
                                    has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40
                          ${enabled
                            ? 'bg-brand/10 border-brand/40'
                            : 'bg-s3/50 border-line'}`}
                      >
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => toggleMenuItem(item.key)}
                          className="sr-only"
                        />
                        <span
                          className="w-[18px] h-[18px] rounded-[6px] flex items-center justify-center flex-shrink-0 transition-all"
                          style={{
                            background: enabled ? 'var(--brand)' : 'transparent',
                            border: enabled ? 'none' : '1.5px solid var(--t4)',
                          }}
                          aria-hidden
                        >
                          {enabled && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4L3.5 6.5L9 1" stroke="var(--grad-brand-text, #0F1730)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </span>
                        <span className={`text-sm font-medium ${enabled ? 'text-t1' : 'text-t4'}`}>
                          {item.label}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )
          })}
        </div>
      </SidePanel>
    </PageLayout>
  )
}

// ─── Linha de usuário ────────────────────────────────────────────────────────

function ProfileRow({
  profile, onEdit, onToggle, onManageMenu,
}: {
  profile: Profile
  onEdit: (p: Profile) => void
  onToggle: (p: Profile) => void
  onManageMenu?: (p: Profile) => void
}) {
  const restrito = profile.role === 'broker' && profile.allowedMenus !== null
  // O que o corretor NÃO vê. Era exatamente isto que ficava escondido atrás de
  // um selo "(11/14)" e de um modal.
  const bloqueados = restrito
    ? ALL_MENU_ITEMS.filter(i => !profile.allowedMenus!.includes(i.key)).map(i => i.label)
    : []

  return (
    <div className={`rounded-[14px] border border-line surface-premium shadow-card px-4 py-3.5 transition-all
      ${profile.active ? '' : 'opacity-60'}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <Avatar name={profile.name} size="sm" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-t1 truncate">{profile.name}</p>
            {profile.role === 'admin' && <Chip icon={Shield} tom="marca">Admin</Chip>}
            {!profile.active && <Chip icon={Lock} tom="risco">Desativado</Chip>}
          </div>
          {profile.role === 'broker' && (
            <p className="text-xs text-t4 mt-0.5">
              {restrito
                ? `${profile.allowedMenus!.length} de ${ALL_MENU_ITEMS.length} telas liberadas`
                : 'Todas as telas liberadas'}
            </p>
          )}
        </div>

        {/* Ações com rótulo. Eram três ícones de 28px sem texto, iguais entre
            si e abaixo do alvo mínimo de toque. */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {onManageMenu && (
            <AcaoBotao icon={LayoutGrid} onClick={() => onManageMenu(profile)}>Menu</AcaoBotao>
          )}
          <AcaoBotao
            icon={profile.active ? UserX : UserCheck}
            tom={profile.active ? 'risco' : 'sucesso'}
            onClick={() => onToggle(profile)}
          >
            {profile.active ? 'Desativar' : 'Reativar'}
          </AcaoBotao>
          <AcaoBotao icon={Pencil} onClick={() => onEdit(profile)}>Editar</AcaoBotao>
        </div>
      </div>

      {bloqueados.length > 0 && (
        <div className="flex items-start gap-2 mt-3 pt-3 border-t border-line/70 flex-wrap">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <IconeTom icon={EyeOff} tom="atencao" tamanho="sm" />
            <Rotulo>Não vê</Rotulo>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {bloqueados.map(label => (
              <span
                key={label}
                className="font-label text-[11px] px-2 py-1 rounded-[8px] bg-warning-bg border border-warning-line text-warning"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AcaoBotao({
  icon: Icon, children, onClick, tom = 'neutro',
}: {
  icon: typeof Pencil
  children: string
  onClick: () => void
  tom?: 'neutro' | 'risco' | 'sucesso'
}) {
  const cor = tom === 'risco'   ? 'hover:bg-error-bg hover:text-error hover:border-error-line'
            : tom === 'sucesso' ? 'hover:bg-success-bg hover:text-success hover:border-success-line'
            :                     'hover:bg-s3 hover:text-t1 hover:border-line-strong'
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 h-11 sm:h-9 px-3 rounded-[12px] border border-line bg-s2/50
                  text-xs font-semibold text-t3 transition-all cursor-pointer whitespace-nowrap
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${cor}`}
    >
      <Icon size={13} strokeWidth={1.7} aria-hidden />
      <span className="hidden sm:inline">{children}</span>
      <span className="sr-only sm:hidden">{children}</span>
    </button>
  )
}
