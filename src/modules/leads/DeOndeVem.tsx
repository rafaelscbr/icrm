import { DDD_EXTERIOR, regiaoDoDDD, rotuloDoDDD } from '../../lib/regiaoPorDDD'
import { fmtTaxa, taxa } from './conversao'

/**
 * De onde vêm os leads, pelo DDD do telefone (migração 115). É uma SUGESTÃO:
 * o DDD é de onde o número foi registrado, não necessariamente onde a pessoa
 * mora, e cobre várias cidades. O formulário do Meta não pergunta a cidade.
 */

const n = (x: number) => x.toLocaleString('pt-BR')
const pct = (a: number, b: number) => fmtTaxa(taxa(a, b))

/** A Souza é de SC: o estado de casa vem destacado. */
const UF_DE_CASA = 'SC'
const MAX_LINHAS = 8

export function DeOndeVem({ total, porDDD }: { total: number; porDDD: { ddd: string; n: number }[] }) {
  if (total === 0) return <p className="text-[13.5px] text-t3 py-2">Nenhum telefone para ler neste recorte.</p>

  // Por estado
  const porUF = new Map<string, number>()
  for (const d of porDDD) {
    const uf = d.ddd === DDD_EXTERIOR ? 'Exterior' : regiaoDoDDD(d.ddd)?.uf ?? '?'
    porUF.set(uf, (porUF.get(uf) ?? 0) + d.n)
  }
  const ufs = [...porUF.entries()].sort((a, b) => Number(b[0] === UF_DE_CASA) - Number(a[0] === UF_DE_CASA) || b[1] - a[1])
  const deCasa = porUF.get(UF_DE_CASA) ?? 0

  const linhas = porDDD.slice(0, MAX_LINHAS)
  const resto = porDDD.slice(MAX_LINHAS).reduce((a, d) => a + d.n, 0)
  const maior = Math.max(1, ...linhas.map(l => l.n))

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-t3 tabular-nums">
        <span className="font-semibold text-t1">{pct(deCasa, total)}</span> de Santa Catarina
        <span className="text-t4"> · {n(total - deCasa)} de outros estados ou de fora · {n(total)} telefones lidos</span>
      </p>

      <div className="flex flex-wrap gap-1.5" aria-label="Leads por estado">
        {ufs.map(([uf, q]) => (
          <span key={uf} className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12.5px] tabular-nums ${
            uf === UF_DE_CASA ? 'bg-brand-fill text-brand-fill-text font-semibold' : 'bg-s2 text-t2'}`}>
            {uf} <span className={uf === UF_DE_CASA ? '' : 'text-t4'}>{n(q)}</span>
          </span>
        ))}
      </div>

      <ul className="flex flex-col gap-2.5" aria-label="Leads por região do DDD">
        {linhas.map(l => {
          const r = regiaoDoDDD(l.ddd)
          return (
            <li key={l.ddd} className="flex items-center gap-3 min-w-0">
              <span className="w-[56px] shrink-0 text-[12px] text-t4 tabular-nums">{l.ddd === DDD_EXTERIOR ? '—' : `DDD ${l.ddd}`}</span>
              <span className="w-[230px] shrink-0 text-[13px] text-t2 truncate" title={rotuloDoDDD(l.ddd)}>{rotuloDoDDD(l.ddd)}</span>
              <span className="relative flex-1 h-1.5 rounded-full bg-s2 overflow-hidden">
                <span className={`absolute inset-y-0 left-0 rounded-full ${r?.uf === UF_DE_CASA ? 'bg-brand-fill' : 'bg-t4'}`}
                      style={{ width: `${Math.max(2, (l.n / maior) * 100)}%` }} />
              </span>
              <span className="w-[40px] shrink-0 text-right font-display text-[15px] font-semibold tabular-nums text-t1">{n(l.n)}</span>
              <span className="w-[48px] shrink-0 text-right text-[12px] tabular-nums text-t4">{pct(l.n, total)}</span>
            </li>
          )
        })}
        {resto > 0 && <li className="text-[12px] text-t4 tabular-nums">+ {n(resto)} de outros DDDs</li>}
      </ul>

      <p className="text-[11.5px] text-t4">
        Sugestão pelo DDD: é de onde o número foi registrado, não necessariamente onde a pessoa mora. Para saber a cidade, coloque a pergunta "Cidade" no formulário do Meta.
      </p>
    </div>
  )
}
