/**
 * As primitivas nasceram aqui e subiram para `components/shared/visual` quando
 * o resto do sistema passou a usar a mesma linguagem. Este arquivo continua
 * existindo só como ponte, para os imports do módulo não precisarem mudar de
 * caminho — e para deixar claro onde a fonte de verdade mora agora.
 */
export {
  TOM, Painel, PainelTitulo, Rotulo, IconeTom, Barra, Numero, KpiCard, Dica, Chip, SecaoTitulo,
} from '../../../components/shared/visual'
export type { Tom } from '../../../components/shared/visual'
