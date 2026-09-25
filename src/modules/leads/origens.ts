import { Sparkles, Smartphone, Globe, Handshake, Megaphone, UserPlus, PhoneOutgoing } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { LeadOrigin } from '../../types'

/**
 * Origem do lead — rótulo e ícone num lugar só.
 *
 * Lista, Kanban e filtros tinham cada um a sua cópia, e já divergiam na grafia
 * ("Meta ADS" na lista, "Meta Ads" no Kanban) e nenhuma conhecia `indicacao`
 * nem `prospeccao_ligacao` — um lead com essas origens quebrava a linha da
 * lista. Origem é procedência, não estado: não leva cor.
 */
export const ORIGEM_META: Record<LeadOrigin, { label: string; icon: LucideIcon }> = {
  felicita: { label: 'Felicità', icon: Sparkles   },
  meta_ads: { label: 'Meta Ads', icon: Smartphone },
  portal:   { label: 'Portal',   icon: Globe      },
  offline:  { label: 'Offline',  icon: Handshake  },
  campanha: { label: 'Campanha', icon: Megaphone  },
  indicacao: { label: 'Indicação', icon: UserPlus },
  prospeccao_ligacao: { label: 'Ligação ativa', icon: PhoneOutgoing },
}

export const ORIGENS: LeadOrigin[] = [
  'meta_ads', 'felicita', 'portal', 'offline', 'campanha', 'indicacao', 'prospeccao_ligacao',
]
