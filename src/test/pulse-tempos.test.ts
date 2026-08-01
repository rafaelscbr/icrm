import { describe, it, expect } from 'vitest'
import {
  formatarDuracaoUtil, nivelPrimeiroContato, nivelSegundaTentativa, nivelSla,
  MINUTOS_DIA_UTIL,
} from '../modules/pulse/tempos'

describe('formatarDuracaoUtil', () => {
  it('abaixo de uma hora mostra minutos', () => {
    expect(formatarDuracaoUtil(5)).toBe('5 min')
    expect(formatarDuracaoUtil(33)).toBe('33 min')
    expect(formatarDuracaoUtil(59)).toBe('59 min')
  })

  it('entre uma hora e um dia útil mostra horas e minutos', () => {
    expect(formatarDuracaoUtil(60)).toBe('1h')
    expect(formatarDuracaoUtil(91)).toBe('1h31')     // a média real da base
    expect(formatarDuracaoUtil(125)).toBe('2h05')    // minuto com zero à esquerda
  })

  it('acima de um dia útil passa a contar em dias úteis', () => {
    expect(formatarDuracaoUtil(MINUTOS_DIA_UTIL)).toBe('1,0 d')
    expect(formatarDuracaoUtil(1497)).toBe('2,8 d')  // a mediana real da 2ª tentativa
    expect(formatarDuracaoUtil(2484)).toBe('4,6 d')  // a média real
  })

  it('sem dados não inventa número', () => {
    expect(formatarDuracaoUtil(0)).toBe('—')
    expect(formatarDuracaoUtil(-10)).toBe('—')
    expect(formatarDuracaoUtil(NaN)).toBe('—')
  })
})

describe('classificação dos tempos', () => {
  it('1º contato: rápido de verdade continua verde acima da meta de 5 min', () => {
    // Marcar tudo acima de 5 min como ruim deixaria o painel vermelho para
    // sempre e ensinaria a ignorá-lo.
    expect(nivelPrimeiroContato(4, 10)).toBe('bom')
    expect(nivelPrimeiroContato(15, 10)).toBe('bom')
    expect(nivelPrimeiroContato(16, 10)).toBe('atencao')
    expect(nivelPrimeiroContato(60, 10)).toBe('atencao')
    expect(nivelPrimeiroContato(91, 10)).toBe('ruim')
  })

  it('2ª tentativa: um dia útil é bom, três é o limite', () => {
    expect(nivelSegundaTentativa(MINUTOS_DIA_UTIL, 10)).toBe('bom')
    expect(nivelSegundaTentativa(MINUTOS_DIA_UTIL * 2, 10)).toBe('atencao')
    expect(nivelSegundaTentativa(MINUTOS_DIA_UTIL * 3, 10)).toBe('atencao')
    expect(nivelSegundaTentativa(2484, 10)).toBe('ruim')
  })

  it('SLA por percentual de cumprimento', () => {
    expect(nivelSla(90, 100)).toBe('bom')
    expect(nivelSla(60, 100)).toBe('atencao')
    expect(nivelSla(36, 100)).toBe('ruim')   // o número real de hoje
  })

  it('amostra vazia nunca é classificada — não existe "bom" sem dado', () => {
    expect(nivelPrimeiroContato(0, 0)).toBe('sem_dados')
    expect(nivelSegundaTentativa(0, 0)).toBe('sem_dados')
    expect(nivelSla(0, 0)).toBe('sem_dados')
  })
})
