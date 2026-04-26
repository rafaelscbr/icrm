import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, Building2, TrendingUp, BarChart3, Zap,
  CheckSquare, Target, Megaphone, Wrench, Search, Home, ChevronDown, ExternalLink, Tv2
} from 'lucide-react'

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

  return (
    <aside className="hidden lg:flex w-56 flex-shrink-0 bg-[#0d0f1a] border-r border-white/7 flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/7">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <span className="text-white text-xs font-bold tracking-tight">SI</span>
          </div>
          <div>
            <span className="text-sm font-bold gradient-text tracking-tight">Souza Imobiliária</span>
            <p className="text-[10px] text-slate-600 -mt-0.5 leading-none">Gestão Imobiliária</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        {nav.map(({ to, icon: Icon, label, end, color }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200
              ${isActive
                ? 'bg-gradient-to-r from-indigo-500/20 to-violet-500/10 text-slate-100 font-medium border border-indigo-500/20'
                : 'text-slate-500 hover:text-slate-200 hover:bg-white/5 border border-transparent'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200
                  ${isActive ? 'bg-gradient-to-br from-indigo-500/30 to-violet-500/20' : 'group-hover:bg-white/8'}`}>
                  <Icon size={15} className={isActive ? 'text-indigo-300' : color} />
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
        <div className="mt-1">
          <button
            onClick={() => setToolsOpen(v => !v)}
            className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 cursor-pointer border
              ${toolsOpen
                ? 'bg-white/5 text-slate-200 border-white/8'
                : 'text-slate-500 hover:text-slate-200 hover:bg-white/5 border-transparent'
              }`}
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center group-hover:bg-white/8 transition-all">
              <Wrench size={15} className="text-teal-400" />
            </div>
            <span className="flex-1 text-left">Ferramentas</span>
            <ChevronDown
              size={13}
              className={`text-slate-600 transition-transform duration-200 ${toolsOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Sub-items */}
          {toolsOpen && (
            <div className="mt-1 ml-3 flex flex-col gap-0.5 pl-3 border-l border-white/8">
              {tools.map(({ label, href, icon: Icon, color }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-all duration-150"
                >
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center group-hover:bg-white/8 transition-all flex-shrink-0">
                    <Icon size={13} className={color} />
                  </div>
                  <span className="flex-1 truncate">{label}</span>
                  <ExternalLink size={10} className="text-slate-700 group-hover:text-slate-500 flex-shrink-0 transition-colors" />
                </a>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-white/7">
        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md shadow-indigo-500/30">
            R
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
