import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, Building2, TrendingUp, BarChart3,
  CheckSquare, Target, Megaphone, Wrench, Search, Home, ChevronDown, ExternalLink, Tv2,
  Sun, Moon,
} from 'lucide-react'
import { useThemeStore } from '../../store/useThemeStore'

const nav = [
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard',  end: true,  color: 'text-indigo-400' },
  { to: '/contatos',   icon: Users,           label: 'Contatos',   end: false, color: 'text-blue-400'   },
  { to: '/imoveis',    icon: Building2,       label: 'Imóveis',    end: false, color: 'text-cyan-400'   },
  { to: '/vendas',     icon: TrendingUp,      label: 'Vendas',     end: false, color: 'text-green-400'  },
  { to: '/tarefas',    icon: CheckSquare,     label: 'Tarefas',    end: false, color: 'text-orange-400' },
  { to: '/campanhas',  icon: Megaphone,       label: 'Campanhas',  end: false, color: 'text-pink-400'   },
  { to: '/metas',      icon: Target,          label: 'Metas',      end: false, color: 'text-amber-400'  },
  { to: '/performance',icon: BarChart3,       label: 'Performance',end: false, color: 'text-purple-400' },
]

const tools = [
  { label: 'IBuscador',   href: 'http://localhost:5177/', icon: Search, color: 'text-sky-400'  },
  { label: 'IAgenciador', href: 'http://localhost:5174/', icon: Home,   color: 'text-rose-400' },
  { label: 'Meta ADS',    href: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=886179520398765&business_id=1889117311563062&global_scope_id=1889117311563062', icon: Tv2, color: 'text-blue-400' },
  { label: 'Eemovel',     href: 'https://brokers.eemovel.com.br/login', icon: Building2, color: 'text-emerald-400' },
]

export function Sidebar() {
  const [toolsOpen, setToolsOpen] = useState(false)
  const { theme, toggle } = useThemeStore()

  return (
    <aside className="hidden lg:flex w-56 flex-shrink-0 nav-bg border-r border-white/7 flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-white/7">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gradient-to-br from-indigo-400 via-violet-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/40">
            <span className="text-white text-[10px] font-bold tracking-tight">SI</span>
          </div>
          <div>
            <span className="text-xs font-bold gradient-text tracking-tight">Souza Imobiliária</span>
            <p className="text-[10px] text-slate-600 -mt-0.5 leading-none">Gestão Imobiliária</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        {/* Search shortcut hint — keyboard trigger via ⌘K in App.tsx */}
        <div className="flex items-center gap-2 px-3 py-2 mb-1 rounded-lg border border-white/7 bg-white/2 cursor-default select-none">
          <Search size={12} className="text-slate-600 flex-shrink-0" />
          <span className="flex-1 text-xs text-slate-600">Buscar…</span>
          <kbd className="text-[10px] font-mono text-slate-700 bg-white/5 border border-white/8 rounded px-1 py-0.5 leading-none flex-shrink-0">⌘K</kbd>
        </div>

        {nav.map(({ to, icon: Icon, label, end, color }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200
              ${isActive
                ? 'bg-gradient-to-r from-indigo-500/20 to-violet-500/10 text-slate-100 font-medium border border-indigo-500/20'
                : 'text-slate-500 hover:text-slate-200 hover:bg-white/5 border border-transparent'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className={`w-6 h-6 rounded-md flex items-center justify-center transition-all duration-200
                  ${isActive ? 'bg-gradient-to-br from-indigo-500/30 to-violet-500/20' : 'bg-white/5 group-hover:bg-white/10'}`}>
                  <Icon size={14} className={isActive ? 'text-indigo-300' : color} />
                </div>
                {label}
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-sm shadow-indigo-400/50" />
                )}
              </>
            )}
          </NavLink>
        ))}

        {/* Ferramentas dropdown */}
        <div className="mt-2 pt-2 border-t border-white/7">
          <button
            onClick={() => setToolsOpen(v => !v)}
            className={`w-full group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer border
              ${toolsOpen
                ? 'bg-white/5 text-slate-200 border-white/8'
                : 'text-slate-500 hover:text-slate-200 hover:bg-white/5 border-transparent'
              }`}
          >
            <div className="w-6 h-6 rounded-md flex items-center justify-center group-hover:bg-white/8 transition-all">
              <Wrench size={14} className="text-teal-400" />
            </div>
            <span className="flex-1 text-left">Ferramentas</span>
            <ChevronDown
              size={12}
              className={`text-slate-600 transition-transform duration-200 ${toolsOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Sub-items */}
          {toolsOpen && (
            <div className="mt-0.5 ml-3 flex flex-col gap-0.5 pl-2.5 border-l border-white/8">
              {tools.map(({ label, href, icon: Icon, color }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all duration-150"
                >
                  <div className="w-5 h-5 rounded-md flex items-center justify-center group-hover:bg-white/8 transition-all flex-shrink-0">
                    <Icon size={12} className={color} />
                  </div>
                  <span className="flex-1 truncate">{label}</span>
                  <ExternalLink size={10} className="text-slate-700 group-hover:text-slate-500 flex-shrink-0 transition-colors" />
                </a>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* User + theme toggle */}
      <div className="px-3 py-3 border-t border-white/7">
        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={theme === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
          className="w-full flex items-center gap-2.5 px-3 py-2 mb-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group"
        >
          <div className="w-6 h-6 rounded-md flex items-center justify-center group-hover:bg-white/8 transition-all">
            {theme === 'dark'
              ? <Sun size={13} className="text-amber-400" />
              : <Moon size={13} className="text-indigo-400" />
            }
          </div>
          <span className="text-xs text-slate-500 group-hover:text-slate-300 transition-colors">
            {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          </span>
          <div className={`ml-auto relative w-8 h-4 rounded-full transition-all flex-shrink-0 ${theme === 'light' ? 'bg-amber-400/80' : 'bg-white/10'}`}>
            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${theme === 'light' ? 'left-4' : 'left-0.5'}`} />
          </div>
        </button>

        <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group">
          <div className="relative flex-shrink-0">
            <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md shadow-indigo-500/30">
              R
            </div>
            <div className="absolute -inset-[2px] rounded-full bg-gradient-to-br from-indigo-400 to-violet-600 -z-10 opacity-60 blur-[2px]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-300 truncate">Rafael</p>
            <p className="text-[10px] text-slate-600">Corretor</p>
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 relative flex-shrink-0">
            <div className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-50" />
          </div>
        </div>
      </div>
    </aside>
  )
}
