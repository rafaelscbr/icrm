import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, TrendingUp, CheckSquare, MoreHorizontal,
  Building2, Megaphone, Target, BarChart3, X,
  Search, Home, Tv2, ExternalLink, Plus,
} from 'lucide-react'
import { TaskForm } from '../../modules/tasks/TaskForm'

const mainNav = [
  { to: '/',          icon: LayoutDashboard, label: 'Início',   end: true,  color: 'text-indigo-400', activeGrad: 'from-indigo-500/20 to-violet-500/10' },
  { to: '/contatos',  icon: Users,           label: 'Contatos', end: false, color: 'text-blue-400',   activeGrad: 'from-blue-500/20 to-blue-500/10'     },
  { to: '/vendas',    icon: TrendingUp,      label: 'Vendas',   end: false, color: 'text-green-400',  activeGrad: 'from-green-500/20 to-green-500/10'   },
  { to: '/tarefas',   icon: CheckSquare,     label: 'Tarefas',  end: false, color: 'text-orange-400', activeGrad: 'from-orange-500/20 to-orange-500/10' },
]

const moreNav = [
  { to: '/imoveis',     icon: Building2, label: 'Imóveis',     color: 'text-cyan-400'   },
  { to: '/campanhas',   icon: Megaphone, label: 'Campanhas',   color: 'text-pink-400'   },
  { to: '/metas',       icon: Target,    label: 'Metas',       color: 'text-amber-400'  },
  { to: '/performance', icon: BarChart3, label: 'Performance', color: 'text-purple-400' },
]

const tools = [
  { label: 'IBuscador',   href: 'http://localhost:5177/', icon: Search,   color: 'text-sky-400'     },
  { label: 'IAgenciador', href: 'http://localhost:5174/', icon: Home,     color: 'text-rose-400'    },
  { label: 'Meta ADS',    href: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=886179520398765&business_id=1889117311563062&global_scope_id=1889117311563062', icon: Tv2, color: 'text-blue-400' },
  { label: 'Eemovel',     href: 'https://brokers.eemovel.com.br/login', icon: Building2, color: 'text-emerald-400' },
]

export function BottomNav() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [taskFormOpen, setTaskFormOpen] = useState(false)
  const location = useLocation()

  const isMoreActive = moreNav.some(item => location.pathname === item.to)

  return (
    <>
      {/* ── Nova Tarefa FAB ────────────────────────────────────────────── */}
      <button
        onClick={() => setTaskFormOpen(true)}
        className="lg:hidden fixed bottom-20 right-4 z-50 w-[52px] h-[52px] rounded-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 flex items-center justify-center shadow-xl shadow-indigo-500/40 border border-indigo-400/30 transition-all duration-150"
        title="Nova tarefa"
      >
        <Plus size={22} className="text-white" strokeWidth={2.5} />
      </button>

      {/* ── Bottom bar ─────────────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0d0f1a]/95 backdrop-blur-xl border-t border-white/10">
        <div className="flex items-center justify-around h-16 px-1">
          {mainNav.map(({ to, icon: Icon, label, end, color, activeGrad }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setDrawerOpen(false)}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 flex-1 h-full px-1 rounded-xl transition-all duration-200 active:scale-95
                ${isActive ? 'text-slate-100' : 'text-slate-600 active:text-slate-400'}`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all
                    ${isActive ? `bg-gradient-to-br ${activeGrad}` : ''}`}>
                    <Icon size={18} className={isActive ? 'text-indigo-300' : color} strokeWidth={isActive ? 2.5 : 2} />
                  </div>
                  <span className={`text-[10px] font-medium leading-none ${isActive ? 'text-slate-200' : 'text-slate-600'}`}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}

          {/* Mais */}
          <button
            onClick={() => setDrawerOpen(v => !v)}
            className={`flex flex-col items-center justify-center gap-1 flex-1 h-full px-1 rounded-xl transition-all duration-200 active:scale-95
              ${isMoreActive || drawerOpen ? 'text-slate-100' : 'text-slate-600'}`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all
              ${drawerOpen ? 'bg-white/10' : isMoreActive ? 'bg-white/8' : ''}`}>
              {drawerOpen
                ? <X size={18} className="text-slate-300" strokeWidth={2.5} />
                : <MoreHorizontal size={18} className={isMoreActive ? 'text-indigo-300' : 'text-slate-500'} strokeWidth={2} />
              }
            </div>
            <span className={`text-[10px] font-medium leading-none ${drawerOpen || isMoreActive ? 'text-slate-200' : 'text-slate-600'}`}>
              Mais
            </span>
          </button>
        </div>
        {/* Safe area (iOS) */}
        <div className="h-safe-bottom" />
      </nav>

      {/* ── Drawer ─────────────────────────────────────────────────────── */}
      {/* ── Task Form Modal ────────────────────────────────────────────── */}
      <TaskForm
        isOpen={taskFormOpen}
        onClose={() => setTaskFormOpen(false)}
      />

      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="absolute bottom-16 inset-x-0 bg-[#0d0f1a] border-t border-white/10 rounded-t-2xl pb-2 animate-in slide-in-from-bottom-4 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-4">
              <div className="w-10 h-1 bg-white/20 rounded-full" />
            </div>

            {/* Seção: Páginas */}
            <div className="px-4 pb-2">
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-3 px-2">
                Páginas
              </p>
              <div className="grid grid-cols-4 gap-2">
                {moreNav.map(({ to, icon: Icon, label, color }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setDrawerOpen(false)}
                    className={({ isActive }) =>
                      `flex flex-col items-center gap-2 p-3 rounded-2xl transition-all active:scale-95
                      ${isActive ? 'bg-white/10 text-slate-100' : 'bg-white/5 text-slate-500 active:bg-white/8'}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center
                          ${isActive ? 'bg-white/10' : 'bg-white/5'}`}>
                          <Icon size={20} className={isActive ? 'text-slate-200' : color} />
                        </div>
                        <span className="text-xs font-medium leading-tight text-center">{label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>

            {/* Seção: Ferramentas */}
            <div className="px-4 pt-3 pb-4 border-t border-white/5 mt-3">
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest mb-3 px-2">
                Ferramentas
              </p>
              <div className="grid grid-cols-2 gap-2">
                {tools.map(({ label, href, icon: Icon, color }) => (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-2xl text-slate-400 active:bg-white/10 transition-all active:scale-95"
                  >
                    <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon size={15} className={color} />
                    </div>
                    <span className="text-sm font-medium truncate">{label}</span>
                    <ExternalLink size={11} className="text-slate-700 flex-shrink-0 ml-auto" />
                  </a>
                ))}
              </div>
            </div>

            {/* User strip */}
            <div className="px-4 pt-3 border-t border-white/5">
              <div className="flex items-center gap-3 px-3 py-2.5 bg-white/3 rounded-2xl">
                <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                  R
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-300">Rafael</p>
                  <p className="text-xs text-slate-600">Corretor</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-400 relative flex-shrink-0">
                    <div className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-50" />
                  </div>
                  <span className="text-[11px] text-green-500 font-medium">Online</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
