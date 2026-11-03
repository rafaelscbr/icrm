import { Trophy, MessageCircle, Pencil } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { FichaPainel, FichaBarraTopo, FichaNome, FichaAgora, FichaNumeros, FichaSecao } from '../../components/shared/Ficha'
import { Destaque } from '../../components/shared/Destaque'
import { useContactsStore } from '../../store/useContactsStore'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useAuthStore } from '../../store/useAuthStore'
import { Sale, calcSaleCommissions } from '../../types'
import { formatCurrency, formatCurrencyFull, formatDate, formatPhone, whatsappUrl } from '../../lib/formatters'
import { STAGE_THEME } from '../../lib/stageTheme'

/**
 * Ficha da venda — padrão "Folha" (02/11/2026).
 *
 * Antes clicar numa venda abria direto o formulário de edição: não havia como
 * só olhar. Aqui a venda responde as mesmas três perguntas das outras fichas:
 * de quem é (cliente como título), o que rendeu (valor e comissão) e o que
 * fazer agora — numa venda fechada, pedir a indicação enquanto o cliente está
 * feliz com a compra.
 */
export function SaleFicha({ sale, onClose, onEdit, onDelete }: {
  sale: Sale
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const client = useContactsStore(s => s.contacts.find(c => c.id === sale.clientId))
  const leadDeOrigem = useLeadsStore(s => s.leads.find(l => l.saleId === sale.id))
  const { isAdmin, allProfiles } = useAuthStore()
  const corretor = allProfiles.find(p => p.id === sale.brokerId)?.name
  const { totalCommission, brokerCommission } = calcSaleCommissions(sale)
  const primeiroNome = client?.name.split(' ')[0]

  return (
    <FichaPainel
      rotulo={`Venda para ${client?.name ?? 'cliente'}`}
      onClose={onClose}
      topo={
        <>
          <FichaBarraTopo
            onClose={onClose}
            contexto={<><Trophy size={13} strokeWidth={1.8} aria-hidden />
              <span className="truncate">Venda · {sale.type === 'off_plan' ? 'Na planta' : 'Pronto'}</span></>}
            acoes={
              <button onClick={onEdit} className="ficha-icone" aria-label="Editar venda" title="Editar">
                <Pencil size={16} strokeWidth={1.8} />
              </button>
            }
          />
          <FichaNome>{client?.name ?? 'Cliente não carregado'}</FichaNome>
          <div className="flex items-center gap-x-3 gap-y-1 mt-2 flex-wrap text-[14px]">
            <span className="text-t2">{sale.propertyName}</span>
            <span className="text-t4">{formatDate(sale.date)}</span>
            {isAdmin && corretor && <span className="text-t4">{corretor}</span>}
          </div>
          <div className="h-5" />
        </>
      }
      rodape={
        <>
          <button onClick={onDelete} className="inline-flex items-center h-9 px-3 rounded-[10px] text-[13.5px] font-medium text-error hover:bg-error-bg">
            Excluir
          </button>
          <div className="flex-1" />
          <Button onClick={onEdit} className="gap-1.5"><Pencil size={14} aria-hidden /> Editar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-7">
        <FichaAgora
          tom="sucesso"
          rotulo={`Venda fechada em ${formatDate(sale.date)}`}
          texto={primeiroNome
            ? <>Quem compra indica — peça uma indicação a {primeiroNome}.</>
            : 'Quem compra indica — peça uma indicação ao cliente.'}
        >
          {client?.phone && (
            <a href={whatsappUrl(client.phone)} target="_blank" rel="noopener noreferrer" className="ficha-acao ficha-acao-zap w-full">
              <MessageCircle size={17} strokeWidth={2} aria-hidden /> WhatsApp de {primeiroNome}
            </a>
          )}
        </FichaAgora>

        <FichaNumeros itens={[
          { rotulo: 'Valor da venda', valor: formatCurrency(sale.value) },
          { rotulo: 'Comissão total', valor: totalCommission > 0 ? formatCurrency(totalCommission) : '—' },
          { rotulo: 'Sua parte', valor: brokerCommission > 0 ? formatCurrency(brokerCommission) : '—', tom: brokerCommission > 0 ? 'sucesso' : undefined },
        ]} />

        <FichaSecao titulo={<>Detalhes da <Destaque>venda</Destaque></>}>
          <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-[14px]">
            <dt className="text-t4">Imóvel</dt><dd className="text-t1 min-w-0 truncate">{sale.propertyName}</dd>
            <dt className="text-t4">Valor exato</dt><dd className="text-t1 tabular-nums">{formatCurrencyFull(sale.value)}</dd>
            {totalCommission > 0 && <><dt className="text-t4">Comissão</dt><dd className="text-t1 tabular-nums">{formatCurrencyFull(totalCommission)}{brokerCommission !== totalCommission && <span className="text-t4"> · sua parte {formatCurrencyFull(brokerCommission)}</span>}</dd></>}
            {client?.phone && <><dt className="text-t4">Telefone</dt><dd className="text-t1 tabular-nums">{formatPhone(client.phone)}</dd></>}
            {leadDeOrigem && <><dt className="text-t4">Veio do funil</dt><dd className="text-t1">Lead de {formatDate(leadDeOrigem.createdAt)} · {STAGE_THEME[leadDeOrigem.funnelStage].label}</dd></>}
          </dl>
        </FichaSecao>

        {sale.notes && (
          <FichaSecao titulo="Observação">
            <p className="text-[14px] text-t2 leading-relaxed whitespace-pre-wrap">{sale.notes}</p>
          </FichaSecao>
        )}
      </div>
    </FichaPainel>
  )
}
