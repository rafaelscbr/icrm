import { describe, it, expect } from 'vitest'
import { calcularPosChaves, PosChavesInput } from '../modules/simulador/posChaves/calc'
import { mensagemPosChaves } from '../modules/simulador/posChaves/mensagem'
import { calcularDireto, DiretoInput } from '../modules/simulador/direto/calc'
import { mensagemDireto } from '../modules/simulador/direto/mensagem'
import { calcularAssociativo, AssociativoInput } from '../modules/simulador/associativo/calc'
import { mensagemAssociativo } from '../modules/simulador/associativo/mensagem'
import { primeiroNome, linhaReforco } from '../modules/simulador/shared/mensagem'
import { telefoneValido } from '../modules/simulador/shared/MensagemWhatsApp'
import { mascaraTelefone } from '../modules/simulador/shared/components'

/**
 * Texto de WhatsApp do simulador.
 *
 * O que se trava aqui: o texto usa os MESMOS números da imagem (a parcela da
 * mensagem é a parcela do card), nada de emoji, e as peças opcionais somem
 * quando não existem em vez de virar "0 reforços de R$ 0,00".
 */

const IDS = { empreendimento: 'Porto Velas 3D', cliente: 'joão da silva', corretor: 'Rafael Souza' }
// toLocaleString de moeda separa "R$" do número com espaço não quebrável.
const sp = (s: string) => s.replace(/ /g, ' ')

describe('peças', () => {
  it('saúda pelo primeiro nome, capitalizado', () => {
    expect(primeiroNome('  joão da silva ')).toBe('João')
    expect(primeiroNome('')).toBe('')
  })

  it('reforço some quando não existe e concorda no plural', () => {
    expect(linhaReforco(0, 8000, 'semestral')).toBeNull()
    expect(sp(linhaReforco(1, 8000, 'anual')!)).toBe('• 1 reforço anual de R$ 8.000,00')
    expect(sp(linhaReforco(9, 8000, 'semestral')!)).toBe('• 9 reforços semestrais de R$ 8.000,00 (total R$ 72.000,00)')
  })

  it('telefone: máscara progressiva e validação com DDD', () => {
    expect(mascaraTelefone('47')).toBe('(47')
    expect(mascaraTelefone('4799912')).toBe('(47) 9991-2')
    expect(mascaraTelefone('47999123456')).toBe('(47) 99912-3456')
    expect(telefoneValido('47999123456')).toBe(true)
    expect(telefoneValido('5547999123456')).toBe(true)
    expect(telefoneValido('999123456')).toBe(false)
  })
})

describe('Pós-chaves', () => {
  const input: PosChavesInput = {
    valorTotal: 758584.61, pctChaves: 33,
    entradaQtd: 1, entradaValor: 36412.06,
    reforcoQtd: 9, reforcoValor: 8000, reforcoPeriodo: 'semestral',
    parcelasQtd: 56,
  }
  const result = calcularPosChaves(input)
  const texto = sp(mensagemPosChaves(input, result, IDS))

  it('leva a parcela do card, em negrito', () => {
    const parcela = sp(result.parcelaValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }))
    expect(texto).toContain(`*56 parcelas mensais de ${parcela}*`)
  })

  it('abre pelo nome do cliente e fecha com o corretor', () => {
    expect(texto.startsWith('Olá, João! Tudo bem?')).toBe(true)
    expect(texto).toContain('do *Porto Velas 3D*, na condição pós-chaves')
    expect(texto).toContain('Rafael Souza')
    expect(texto).toContain('Saldo na entrega das chaves')
  })

  it('não tem emoji', () => {
    expect(/\p{Extended_Pictographic}/u.test(texto)).toBe(false)
  })
})

describe('Direto', () => {
  it('sem reforço, a linha de reforço não aparece', () => {
    const input: DiretoInput = {
      valorTotal: 500000, entradaQtd: 2, entradaValor: 25000,
      reforcoQtd: 0, reforcoValor: 0, reforcoPeriodo: 'anual', parcelasQtd: 90,
    }
    const texto = sp(mensagemDireto(input, calcularDireto(input), { ...IDS, cliente: '' }))
    expect(texto.startsWith('Olá! Tudo bem?')).toBe(true)
    expect(texto).toContain('• Entrada em 2x de R$ 25.000,00 (total R$ 50.000,00)')
    expect(texto).not.toContain('reforço')
    expect(texto).toContain('*90 parcelas mensais de R$ 5.000,00*')
  })
})

describe('Associativo', () => {
  const input: AssociativoInput = {
    valorTotal: 480000,
    entradaQtd: 1, entradaValor: 59040,
    parcelasQtd: 36, parcelaValor: 1026.67,
    balaoQtd: 3, balaoValor: 8000,
    indice: 'incc', taxaIndiceAnual: 5, aplicarCorrecao: true,
    inicioParcelas: '2026-01', financiamento: '2027-12', entrega: '2030-12',
    jurosObraMensal: 0.83, taxaAdm: 25, seguro: 79, pctObraAssinatura: 0,
    taxaBancoAnual: 10, prazoMeses: 420, sistema: 'price',
  }
  const result = calcularAssociativo(input)
  const texto = sp(mensagemAssociativo(input, result, IDS))

  it('diz as datas, a taxa de obra e o financiamento como estimativa', () => {
    expect(texto).toContain('• 1ª parcela: jan/2026')
    expect(texto).toContain('• Entrega das chaves: dez/2030')
    expect(texto).toContain('Taxa de obra')
    expect(texto).toContain('não abate o saldo financiado')
    expect(texto).toContain('Estimativa sobre o saldo de hoje')
    expect(texto).toContain('3 balões anuais de R$ 8.000,00 (total R$ 24.000,00)')
  })

  it('sem projeção de correção, não promete a última parcela', () => {
    const semCorrecao = { ...input, aplicarCorrecao: false }
    const t = mensagemAssociativo(semCorrecao, calcularAssociativo(semCorrecao), IDS)
    expect(t).not.toContain('a última parcela fica')
  })
})
