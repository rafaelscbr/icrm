import type { ComponentType, CSSProperties } from 'react'
import {
  LayoutDashboard, Users, Building2, TrendingUp, BarChart3,
  CheckSquare, Megaphone, Search, Home, Tv2, UserPlus, Calculator,
  Target, Database, Package, Rocket, Send, Phone,
} from 'lucide-react'

export type NavIcon = ComponentType<{
  size?: number
  strokeWidth?: number
  className?: string
  style?: CSSProperties
}>

export interface NavLeaf {
  key: string
  to: string
  icon: NavIcon
  label: string
  end: boolean
}

export interface NavGroupDef {
  key: string
  icon: NavIcon
  label: string
  children: NavLeaf[]
}

export type NavEntry = NavLeaf | NavGroupDef

export function isGroup(e: NavEntry): e is NavGroupDef {
  return 'children' in e
}

/*
 * Fonte única da navegação. A Sidebar e a BottomNav liam duas listas separadas
 * e já tinham divergido em rótulo mais de uma vez — o comentário "nomes
 * idênticos aos da Sidebar" na BottomNav era um pedido, não uma garantia.
 * Agora é a mesma estrutura, achatada no mobile por `navLeaves()`.
 *
 * "Imóveis" virou "Produtos", com duas naturezas debaixo do mesmo guarda-chuva:
 * o que está PRONTO (a unidade avulsa, `properties.kind = 'ready'`) e o
 * LANÇAMENTO (o empreendimento na planta, com régua comercial). São coisas
 * diferentes o suficiente para não caberem na mesma tela, e próximas o
 * suficiente para não merecerem dois itens soltos no menu.
 *
 * Mesma lógica em "Prospecção Ativa": disparo e ligação atacam a MESMA base
 * fria por canais diferentes. Disparo é em lote e o corretor escolhe quem
 * abordar; ligação é um por vez e a fila escolhe por ele. Telas separadas,
 * guarda-chuva comum.
 */
export const navSections: Array<{ label: string; items: NavEntry[] }> = [
  {
    label: 'Operação',
    items: [
      { key: 'dashboard',   to: '/',           icon: LayoutDashboard, label: 'Dashboard',          end: true  },
      { key: 'tarefas',     to: '/tarefas',    icon: CheckSquare,     label: 'Tarefas',             end: false },
      { key: 'metas',       to: '/metas',      icon: Target,          label: 'Metas',               end: false },
      { key: 'escritorio',  to: '/escritorio', icon: Tv2,             label: 'Escritório Virtual',  end: false },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { key: 'leads',       to: '/leads',        icon: UserPlus,       label: 'Leads',         end: false },
      { key: 'contatos',    to: '/contatos',     icon: Users,          label: 'Contatos',      end: false },
      { key: 'base-leads',  to: '/base-leads',   icon: Database,       label: 'Base de Leads', end: false },
      {
        key: 'produtos', icon: Package, label: 'Produtos',
        children: [
          { key: 'imoveis',     to: '/imoveis',     icon: Building2, label: 'Prontos',     end: false },
          { key: 'lancamentos', to: '/lancamentos', icon: Rocket,    label: 'Lançamentos', end: false },
        ],
      },
      { key: 'vendas',      to: '/vendas',       icon: TrendingUp,     label: 'Vendas',        end: false },
      {
        key: 'prospeccao', icon: Megaphone, label: 'Prospecção Ativa',
        children: [
          { key: 'disparos', to: '/prospeccao/disparos', icon: Send,  label: 'Disparos WhatsApp', end: false },
          { key: 'ligacoes', to: '/prospeccao/ligacoes', icon: Phone, label: 'Ligações WhatsApp', end: false },
        ],
      },
      { key: 'simulador',   to: '/simulador',    icon: Calculator,     label: 'Simulador',     end: false },
    ],
  },
  {
    label: 'Inteligência',
    items: [
      { key: 'performance', to: '/performance', icon: BarChart3, label: 'Análise', end: false },
    ],
  },
]

export const externalTools = [
  { label: 'IBuscador',   href: 'http://localhost:5177/', icon: Search   as NavIcon },
  { label: 'IAgenciador', href: 'http://localhost:5174/', icon: Home     as NavIcon },
  { label: 'Meta ADS',    href: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=886179520398765&business_id=1889117311563062&global_scope_id=1889117311563062', icon: Tv2 as NavIcon },
  { label: 'Eemovel',     href: 'https://brokers.eemovel.com.br/login', icon: Building2 as NavIcon },
]

/**
 * Seções já achatadas para a gaveta do mobile, sem os destinos que já estão na
 * barra de baixo.
 *
 * O filho vem prefixado com o nome do pai ("Produtos · Prontos"): numa gaveta já
 * rolável, dois itens rasos custam menos toque que um acordeão — mas sem o
 * prefixo "Prontos" sozinho não diz de quê.
 *
 * As SEÇÕES são preservadas de propósito. A gaveta era uma grade única de
 * "Páginas" com quatro colunas, e um rótulo de duas palavras em ~80px de
 * largura quebrava em três linhas ou era cortado. Lista por seção lê melhor no
 * celular e mantém a mesma divisão do desktop.
 */
export function secoesDaGaveta(
  podeVer: (key: string) => boolean,
  excluir: Set<string>,
): Array<{ label: string; items: NavLeaf[] }> {
  return filtrarPorPermissao(podeVer)
    .map(s => ({
      label: s.label,
      items: s.items
        .flatMap<NavLeaf>(item =>
          isGroup(item)
            ? item.children.map(c => ({ ...c, label: `${item.label} · ${c.label}` }))
            : [item],
        )
        .filter(l => !excluir.has(l.to)),
    }))
    .filter(s => s.items.length > 0)
}

/**
 * Filtra a árvore pelas telas liberadas ao perfil.
 *
 * Num grupo a permissão é por filho: quem só tem 'imoveis' liberado vê
 * Produtos com um item só, em vez de perder o menu inteiro.
 */
export function filtrarPorPermissao(
  podeVer: (key: string) => boolean,
): Array<{ label: string; items: NavEntry[] }> {
  return navSections
    .map(section => ({
      ...section,
      items: section.items.flatMap<NavEntry>(item => {
        if (!isGroup(item)) return podeVer(item.key) ? [item] : []
        const filhos = item.children.filter(c => podeVer(c.key))
        return filhos.length > 0 ? [{ ...item, children: filhos }] : []
      }),
    }))
    .filter(section => section.items.length > 0)
}
