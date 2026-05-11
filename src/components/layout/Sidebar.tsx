import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, Building2, TrendingUp, BarChart3,
  CheckSquare, Megaphone, Wrench, Search, Home, ChevronDown,
  ExternalLink, Tv2, Sun, Moon, UserPlus, ChevronRight, ArrowLeftRight,
} from 'lucide-react'
import { useThemeStore } from '../../store/useThemeStore'
import logoLight from '../../assets/logo.png'
import logoDark from '../../assets/logo-dark.png'

const navSections = [
  {
    label: 'PRINCIPAL',
    items: [
      { to: '/',      icon: LayoutDashboard, label: 'Dashboard',  end: true  },
      { to: '/tarefas', icon: CheckSquare,  label: 'Tarefas',    end: false },
    ],
  },
  {
    label: 'COMERCIAL',
    items: [
      { to: '/leads',     icon: UserPlus,   label: 'Leads',      end: false },
      { to: '/contatos',  icon: Users,      label: 'Contatos',   end: false },
      { to: '/imoveis',   icon: Building2,  label: 'Imóveis',    end: false },
      { to: '/vendas',    icon: TrendingUp,    label: 'Vendas',     end: false },
      { to: '/campanhas', icon: Megaphone,    label: 'Campanhas',  end: false },
      { to: '/permuta',   icon: ArrowLeftRight, label: 'Permuta',  end: false },
    ],
  },
  {
    label: 'ANÁLISE',
    items: [
      { to: '/performance', icon: BarChart3, label: 'Performance', end: false },
    ],
  },
]

const tools = [
  { label: 'IBuscador',   href: 'http://localhost:5177/', icon: Search, },
  { label: 'IAgenciador', href: 'http://localhost:5174/', icon: Home,   },
  { label: 'Meta ADS',    href: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=886179520398765&business_id=1889117311563062&global_scope_id=1889117311563062', icon: Tv2, },
  { label: 'Eemovel',     href: 'https://brokers.eemovel.com.br/login', icon: Building2, },
]

export function Sidebar() {
  const [toolsOpen, setToolsOpen] = useState(false)
  const { theme, toggle } = useThemeStore()

  return (
    <aside className="hidden lg:flex w-60 flex-shrink-0 flex-col h-screen sticky top-0 border-r border-white/6 nav-bg">

      {/* Logo */}
      <div className="px-5 py-4 mb-1">
        <img
          src={theme === 'dark' ? logoLight : logoDark}
          alt="Souza Imobiliária"
          className="h-9 w-auto object-contain"
        />
      </div>

      {/* Search pill */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/8 bg-white/3 cursor-default select-none group hover:border-white/12 hover:bg-white/5 transition-all">
          <Search size={12} className="text-slate-600 flex-shrink-0" />
          <span className="flex-1 text-xs text-slate-600">Buscar…</span>
          <kbd className="text-[10px] font-mono text-slate-700 bg-white/5 border border-white/8 rounded px-1 leading-4 flex-shrink-0">⌘K</kbd>
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 px-3 py-2 flex flex-col gap-4 overflow-y-auto">
        {navSections.map(section => (
          <div key={section.label}>
            <p className="px-3 mb-1 text-[10px] font-bold tracking-widest text-slate-700 uppercase select-none">
              {section.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {section.items.map(({ to, icon: Icon, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150
                    ${isActive
                      ? 'bg-blue-600 text-white font-semibold shadow-lg shadow-blue-600/20'
                      : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={15} className={isActive ? 'text-white' : 'text-slate-600 group-hover:text-slate-300 transition-colors'} />
                      <span className="flex-1 truncate">{label}</span>
                      {isActive && <ChevronRight size={12} className="text-blue-200 flex-shrink-0" />}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}

        {/* Ferramentas */}
        <div>
          <p className="px-3 mb-1 text-[10px] font-bold tracking-widest text-slate-700 uppercase select-none">
            FERRAMENTAS
          </p>
          <button
            onClick={() => setToolsOpen(v => !v)}
            className="w-full group flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all duration-150 cursor-pointer"
          >
            <Wrench size={15} className="text-slate-600 group-hover:text-slate-300 transition-colors" />
            <span className="flex-1 text-left">Externas</span>
            <ChevronDown
              size={12}
              className={`text-slate-700 transition-transform duration-200 ${toolsOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {toolsOpen && (
            <div className="mt-0.5 ml-4 flex flex-col gap-0.5 pl-3 border-l border-white/8">
              {tools.map(({ label, href, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs text-slate-600 hover:text-slate-200 hover:bg-white/5 transition-all duration-150"
                >
                  <Icon size={12} className="text-slate-700 group-hover:text-slate-400 transition-colors flex-shrink-0" />
                  <span className="flex-1 truncate">{label}</span>
                  <ExternalLink size={10} className="text-slate-800 group-hover:text-slate-600 flex-shrink-0" />
                </a>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 flex flex-col gap-1">
        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group"
        >
          {theme === 'dark'
            ? <Sun size={14} className="text-slate-600 group-hover:text-amber-400 transition-colors" />
            : <Moon size={14} className="text-slate-600 group-hover:text-indigo-400 transition-colors" />
          }
          <span className="flex-1 text-left text-xs text-slate-600 group-hover:text-slate-300 transition-colors">
            {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          </span>
          <div className={`relative w-8 h-4 rounded-full transition-all flex-shrink-0 ${theme === 'light' ? 'bg-blue-500/80' : 'bg-white/10'}`}>
            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${theme === 'light' ? 'left-4' : 'left-0.5'}`} />
          </div>
        </button>

        {/* User */}
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-md shadow-blue-600/40">
            R
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-300 truncate leading-none">Rafael</p>
            <p className="text-[10px] text-slate-600 mt-0.5">Corretor</p>
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0 shadow-sm shadow-emerald-400/60" />
        </div>
      </div>
    </aside>
  )
}
