import type { ReactNode } from 'react'
import { PhoneCall } from 'lucide-react'
import { destacar } from '../../../components/shared/Destaque'
import { CorretorComFoto } from '../../../components/shared/CorretorComFoto'
import { fmtTaxa, taxa } from '../../leads/conversao'
import { COR_RESULTADO, NOME_POTENCIAL, NOME_RESULTADO, totalDoCanal } from '../../leads/primeiroContato'
import { ORDEM_POTENCIAL, ORDEM_RESULTADO, SEM, primeiroContato, primeiroContatoPorCorretor } from '../../leads/safra'
import type { FunilSafra } from '../../leads/safra'
import { Painel } from './Sala'

/**
 * A terceira tela do Pulse (25/11/2026): o resultado do 1º contato dos leads
 * que chegaram nos últimos 30 dias (migração 114). Na faixa Marinho, os
 * números grandes; embaixo, o que aconteceu na 1ª chamada, o potencial das
 * ligações atendidas e cada corretor com a foto — a taxa de quem atende.
 */

const n = (x: number) => x.toLocaleString('pt-BR')
const pct = (a: number, b: number) => fmtTaxa(taxa(a, b))

export function PrimeiroContatoDaSala({ dados, janelaDias, giro, direita, celular = false }: {
  /** undefined = ainda lendo; null = a leitura falhou */
  dados: FunilSafra | null | undefined
  janelaDias: number
  giro: ReactNode
  direita: ReactNode
  celular?: boolean
}) {
  const r = dados ? primeiroContato(dados) : null
  const porCorretor = dados ? primeiroContatoPorCorretor(dados) : []
  const lig = r ? totalDoCanal(r, 'ligacao') : 0

  const destaques = r ? [
    { rotulo: 'Chegaram', valor: n(r.recebidos), nota: `em ${janelaDias} dias` },
    { rotulo: 'Com registro', valor: n(r.registrados), nota: pct(r.registrados, r.recebidos) + ' dos leads' },
    { rotulo: 'Atenderam', valor: pct(r.porResultado.atendeu, r.registrados), nota: `${n(r.porResultado.atendeu)} leads` },
    { rotulo: 'Atendem a ligação', valor: pct(r.porCanal.ligacao.atendeu, lig), nota: `${n(lig)} ligações` },
    { rotulo: 'Com potencial', valor: pct(r.potencial.potencial, r.ligacoesAtendidas), nota: `das ${n(r.ligacoesAtendidas)} atendidas` },
  ] : []

  const faixa = (
    <section className={`pulse-marinho relative shrink-0 overflow-hidden ${celular ? 'rounded-[24px] px-4 py-4' : 'pulse-palco-hero px-9 pt-5 pb-6'}`}>
      <div className="pulse-luzes" aria-hidden />
      <div className="relative flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3.5">
          <span className={`flex items-center justify-center rounded-[14px] bg-brand-fill ${celular ? 'h-11 w-11' : 'h-12 w-12'}`} aria-hidden>
            <PhoneCall size={celular ? 22 : 25} strokeWidth={2.2} className="text-brand-fill-text" />
          </span>
          <span className="leading-tight">
            <span className={`block font-display font-semibold uppercase tracking-[0.2em] ${celular ? 'text-[11px]' : 'text-[15px]'}`} style={{ color: 'var(--m-t3)' }}>Pulse · Souza</span>
            <h1 className={`font-display font-extrabold tracking-[-0.035em] ${celular ? 'text-[22px]' : 'text-[30px]'}`} style={{ color: 'var(--m-t1)' }}>
              {destacar('O *1º contato*')}
            </h1>
          </span>
        </div>
        {!celular && <div className="ml-4">{giro}</div>}
        <div className={celular ? 'w-full flex items-center gap-2' : 'ml-auto'}>{direita}</div>
      </div>
      {destaques.length > 0 && (
        <div className={`relative ${celular ? 'mt-3 pt-3 grid grid-cols-2 gap-x-4 gap-y-4' : 'mt-4 pt-4 flex items-stretch'}`}
             style={{ borderTop: '1px solid var(--m-line)' }}>
          {destaques.map((d, k) => (
            <div key={d.rotulo} className={celular ? `min-w-0 ${k === 0 ? 'col-span-2' : ''}` : `min-w-0 flex-1 pr-6 ${k > 0 ? 'pl-6' : ''}`}
                 style={!celular && k > 0 ? { borderLeft: '1px solid var(--m-line)' } : undefined}>
              <p className={celular ? 'text-[12px]' : 'text-[15px]'} style={{ color: 'var(--m-t3)' }}>{d.rotulo}</p>
              <p className={`font-display font-extrabold tabular-nums tracking-[-0.03em] leading-tight ${celular ? 'text-[26px]' : 'text-[44px]'}`}
                 style={{ color: k === 2 || k === 4 ? 'var(--m-ouro)' : 'var(--m-t1)' }}>{d.valor}</p>
              <p className={celular ? 'text-[12px]' : 'text-[14px]'} style={{ color: 'var(--m-t2)' }}>{d.nota}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )

  if (!dados || !r) {
    return (
      <>
        {faixa}
        <p className="rounded-[20px] border border-line bg-surface px-6 py-10 text-center text-[17px] text-t3">
          {dados === null ? 'Não consegui ler o 1º contato agora.' : 'Carregando…'}
        </p>
      </>
    )
  }

  if (r.registrados === 0) {
    return (
      <>
        {faixa}
        <Painel titulo="O que aconteceu na *1ª chamada*" className={celular ? '' : 'flex-1'}>
          <p className="px-6 pb-6 text-[17px] text-t3">
            Nenhum 1º contato registrado ainda. O popup começou em 26/11/2026: assim que os corretores chamarem os leads novos, os números aparecem aqui.
          </p>
        </Painel>
      </>
    )
  }

  const maior = Math.max(1, ...ORDEM_RESULTADO.map(k => r.porResultado[k]))
  const fs = celular ? { rot: 'text-[14px]', num: 'text-[22px]', pct: 'text-[13px]' } : { rot: 'text-[18px]', num: 'text-[34px]', pct: 'text-[16px]' }

  return (
    <>
      {faixa}
      <div className={celular ? 'flex flex-col gap-3' : 'flex-1 min-h-0 grid gap-4'}
           style={celular ? undefined : { gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 0.9fr) minmax(0, 1.1fr)' }}>
        <Painel titulo="O que aconteceu na *1ª chamada*" extra={`${n(r.registrados)} registrados`}>
          <ul className={`flex flex-col ${celular ? 'gap-3 px-5 pb-5' : 'justify-evenly gap-6 px-6 pb-6 flex-1'}`}>
            {ORDEM_RESULTADO.map(k => (
              <li key={k} className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-baseline gap-3 min-w-0">
                  <span className={`${fs.rot} text-t2 truncate`}>{NOME_RESULTADO[k]}</span>
                  <span className={`ml-auto font-display ${fs.num} font-bold tabular-nums text-t1 leading-none`}>{n(r.porResultado[k])}</span>
                  <span className={`w-[64px] text-right ${fs.pct} tabular-nums text-t4`}>{pct(r.porResultado[k], r.registrados)}</span>
                </div>
                <span className="relative h-2.5 rounded-full bg-s2 overflow-hidden">
                  <span className={`absolute inset-y-0 left-0 rounded-full ${COR_RESULTADO[k]}`}
                        style={{ width: `${r.porResultado[k] > 0 ? Math.max(2, (r.porResultado[k] / maior) * 100) : 0}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </Painel>

        <Painel titulo="Tem *potencial*?" extra={`${n(r.ligacoesAtendidas)} ligações atendidas`}>
          <div className={`grid ${celular ? 'grid-cols-3 gap-2 px-5 pb-5' : 'grid-rows-3 gap-3 px-6 pb-6 flex-1'}`}>
            {ORDEM_POTENCIAL.map(k => (
              <div key={k} className="rounded-[18px] border border-line px-4 py-3 flex flex-col justify-center min-w-0">
                <p className={`${celular ? 'text-[13px]' : 'text-[17px]'} text-t3 truncate`}>{NOME_POTENCIAL[k]}</p>
                <p className={`font-display font-extrabold tabular-nums leading-tight ${celular ? 'text-[26px]' : 'text-[46px]'} ${k === 'potencial' ? 'text-brand-text' : 'text-t1'}`}>
                  {n(r.potencial[k])}
                </p>
                <p className={`${celular ? 'text-[12px]' : 'text-[15px]'} text-t4 tabular-nums`}>{pct(r.potencial[k], r.ligacoesAtendidas)}</p>
              </div>
            ))}
          </div>
        </Painel>

        <Painel titulo="Cada *corretor*" extra="atende · com potencial">
          <ul className={`flex flex-col ${celular ? 'gap-2.5 px-5 pb-5' : 'gap-4 px-6 pb-6 flex-1 overflow-hidden'}`}>
            {porCorretor.map(({ chave, nome, r: c }) => (
              <li key={chave} className="flex items-center gap-3 min-w-0">
                <CorretorComFoto id={chave === SEM ? null : chave} nome={nome.split(' ')[0]} tamanho={celular ? 32 : 46}
                                 className={`gap-3 min-w-0 flex-1 ${celular ? 'text-[15px]' : 'text-[19px]'} font-semibold text-t1`} />
                <span className="text-right shrink-0">
                  <span className={`block font-display font-bold tabular-nums leading-none ${celular ? 'text-[20px]' : 'text-[28px]'} text-t1`}>
                    {pct(c.porResultado.atendeu, c.registrados)}
                  </span>
                  <span className={`${celular ? 'text-[11.5px]' : 'text-[14px]'} text-t4 tabular-nums`}>{n(c.registrados)} registrados</span>
                </span>
                <span className={`text-right shrink-0 ${celular ? 'w-[64px]' : 'w-[92px]'}`}>
                  <span className={`block font-display font-bold tabular-nums leading-none ${celular ? 'text-[20px]' : 'text-[28px]'} text-brand-text`}>
                    {pct(c.potencial.potencial, c.ligacoesAtendidas)}
                  </span>
                  <span className={`${celular ? 'text-[11.5px]' : 'text-[14px]'} text-t4 tabular-nums`}>potencial</span>
                </span>
              </li>
            ))}
          </ul>
        </Painel>
      </div>
    </>
  )
}
