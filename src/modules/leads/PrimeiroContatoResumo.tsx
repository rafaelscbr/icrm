import { CorretorComFoto } from '../../components/shared/CorretorComFoto'
import { fmtTaxa, taxa } from './conversao'
import { COR_RESULTADO, NOME_POTENCIAL, NOME_RESULTADO, totalDoCanal } from './primeiroContato'
import { ORDEM_POTENCIAL, ORDEM_RESULTADO, SEM } from './safra'
import type { ResumoContato } from './safra'

/**
 * O resultado do 1º contato (migração 114), a mesma peça na aba Conversão e
 * na dashboard: de X leads que chegaram, o que aconteceu na 1ª chamada e —
 * nas ligações atendidas — quantos têm potencial. Com a lista por corretor
 * (só para o admin), dá para comparar o desempenho de cada um.
 */

const n = (x: number) => x.toLocaleString('pt-BR')
const pct = (a: number, b: number) => fmtTaxa(taxa(a, b))

export function PrimeiroContatoResumo({ r, porCorretor }: {
  r: ResumoContato
  porCorretor: { chave: string; nome: string; r: ResumoContato }[]
}) {
  if (r.registrados === 0) {
    return (
      <p className="text-[13.5px] text-t3 py-2">
        Nenhum primeiro contato registrado neste recorte. O popup começou a registrar em 26/11/2026; os leads chamados antes ficam sem registro.
      </p>
    )
  }
  const maior = Math.max(1, ...ORDEM_RESULTADO.map(k => r.porResultado[k]))
  const lig = totalDoCanal(r, 'ligacao')
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] text-t3 tabular-nums">
        <span className="font-semibold text-t1">{n(r.registrados)}</span> de {n(r.recebidos)} leads com o 1º contato registrado
        {r.recebidos > r.registrados && <span className="text-t4"> · {n(r.recebidos - r.registrados)} sem registro</span>}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
        <ul className="flex flex-col gap-2.5" aria-label="Resultado do primeiro contato">
          {ORDEM_RESULTADO.map(k => (
            <li key={k} className="flex items-center gap-3 min-w-0">
              <span className="w-[170px] shrink-0 text-[13px] text-t2 truncate">{NOME_RESULTADO[k]}</span>
              <span className="relative flex-1 h-1.5 rounded-full bg-s2 overflow-hidden">
                <span className={`absolute inset-y-0 left-0 rounded-full ${COR_RESULTADO[k]}`}
                      style={{ width: `${r.porResultado[k] > 0 ? Math.max(2, (r.porResultado[k] / maior) * 100) : 0}%` }} />
              </span>
              <span className="w-[44px] shrink-0 text-right font-display text-[16px] font-semibold tabular-nums text-t1">{n(r.porResultado[k])}</span>
              <span className="w-[52px] shrink-0 text-right text-[12px] tabular-nums text-t4">{pct(r.porResultado[k], r.registrados)}</span>
            </li>
          ))}
          <li className="text-[12px] text-t4 tabular-nums pt-1">
            Ligação {n(lig)} · WhatsApp {n(totalDoCanal(r, 'whatsapp'))}
            {lig > 0 && <> · atendem a ligação {pct(r.porCanal.ligacao.atendeu, lig)}</>}
          </li>
        </ul>

        <div className="min-w-0">
          <p className="text-[12.5px] text-t3 mb-2.5 tabular-nums">
            Nas {n(r.ligacoesAtendidas)} {r.ligacoesAtendidas === 1 ? 'ligação atendida' : 'ligações atendidas'}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {ORDEM_POTENCIAL.map(k => (
              <div key={k} className="rounded-xl border border-line px-3 py-2.5 min-w-0">
                <p className="text-[12px] text-t3 truncate">{NOME_POTENCIAL[k]}</p>
                <p className="font-display text-[22px] leading-tight font-semibold tabular-nums text-t1">{n(r.potencial[k])}</p>
                <p className="text-[11.5px] text-t4 tabular-nums">{pct(r.potencial[k], r.ligacoesAtendidas)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {porCorretor.length > 0 && (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[600px] text-[13px] tabular-nums">
            <caption className="sr-only">Primeiro contato por corretor</caption>
            <thead>
              <tr className="text-left text-[12px] text-t4">
                <th scope="col" className="font-medium px-1 py-1.5">Corretor</th>
                <th scope="col" className="font-medium px-1 py-1.5 text-right">Registrados</th>
                <th scope="col" className="font-medium px-1 py-1.5 text-right">Atendeu</th>
                <th scope="col" className="font-medium px-1 py-1.5 text-right">Texto</th>
                <th scope="col" className="font-medium px-1 py-1.5 text-right">Áudio</th>
                <th scope="col" className="font-medium px-1 py-1.5 text-right">Nº não existe</th>
                <th scope="col" className="font-medium px-1 py-1.5 text-right">Com potencial</th>
              </tr>
            </thead>
            <tbody>
              {porCorretor.map(({ chave, nome, r: c }) => (
                <tr key={chave} className="border-t border-line">
                  <th scope="row" className="font-medium text-t1 text-left px-1 py-2 max-w-[200px]">
                    <CorretorComFoto id={chave === SEM ? null : chave} nome={nome} tamanho={24} className="gap-2 min-w-0" />
                  </th>
                  <td className="px-1 py-2 text-right text-t2">{n(c.registrados)} <span className="text-t4">de {n(c.recebidos)}</span></td>
                  <td className="px-1 py-2 text-right text-t1 font-semibold">{pct(c.porResultado.atendeu, c.registrados)}</td>
                  <td className="px-1 py-2 text-right text-t2">{pct(c.porResultado.mensagem_texto, c.registrados)}</td>
                  <td className="px-1 py-2 text-right text-t2">{pct(c.porResultado.mensagem_audio, c.registrados)}</td>
                  <td className="px-1 py-2 text-right text-t2">{pct(c.porResultado.numero_invalido, c.registrados)}</td>
                  <td className="px-1 py-2 text-right text-t2">{pct(c.potencial.potencial, c.ligacoesAtendidas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
