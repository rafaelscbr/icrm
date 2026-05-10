import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VERIFY_TOKEN = Deno.env.get('META_VERIFY_TOKEN')!
const ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Busca os dados do lead na Meta Graph API
async function getLeadData(leadgenId: string) {
  const url = `https://graph.facebook.com/v19.0/${leadgenId}?fields=field_data,ad_id,ad_name,created_time&access_token=${ACCESS_TOKEN}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.error) {
    console.error('Meta API erro:', JSON.stringify(data.error))
    return null
  }
  return data
}

// Extrai um campo específico do field_data do formulário
function extractField(fieldData: Array<{ name: string; values: string[] }>, ...names: string[]): string {
  for (const name of names) {
    const field = fieldData.find(f => f.name === name)
    if (field?.values?.[0]) return field.values[0]
  }
  return ''
}

// Encontra o imóvel cadastrado cujo nome bate com o início do nome do anúncio
async function findProperty(adName: string): Promise<string | null> {
  if (!adName) return null

  const { data: properties, error } = await supabase
    .from('properties')
    .select('id, name')

  if (error || !properties) return null

  const adNameLower = adName.toLowerCase().trim()

  // Ordena por nome mais longo primeiro para pegar o match mais específico
  const sorted = [...properties].sort((a, b) => b.name.length - a.name.length)

  const match = sorted.find(p => adNameLower.startsWith(p.name.toLowerCase().trim()))
  return match?.id ?? null
}

Deno.serve(async (req) => {

  // GET — verificação do webhook
  if (req.method === 'GET') {
    const url       = new URL(req.url)
    const mode      = url.searchParams.get('hub.mode')
    const token     = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  // POST — lead recebido
  if (req.method === 'POST') {
    try {
      const rawBody = await req.text()
      const body    = JSON.parse(rawBody)
      const now     = new Date().toISOString()

      let leadgenId = ''
      let adId      = ''

      // Formato produção: { object, entry: [{ changes: [{ field, value }] }] }
      if (body.entry) {
        for (const entry of body.entry) {
          for (const change of entry.changes ?? []) {
            if (change.field === 'leadgen') {
              leadgenId = change.value?.leadgen_id ?? ''
              adId      = change.value?.ad_id ?? ''
            }
          }
        }
      }
      // Formato teste: { sample: { field, value } }
      else if (body.sample?.field === 'leadgen') {
        leadgenId = body.sample.value?.leadgen_id ?? ''
        adId      = body.sample.value?.ad_id ?? ''
      }

      if (leadgenId) {
        // Busca dados reais do lead na Meta API
        const leadData = await getLeadData(leadgenId)

        let name       = 'Lead Meta Ads'
        let phone      = ''
        let email      = ''
        let adName     = adId ? `ad:${adId}` : `leadgen:${leadgenId}`
        let propertyId: string | null = null

        if (leadData) {
          const fieldData = leadData.field_data ?? []

          // Extrai nome (tenta full_name, depois first_name + last_name)
          const fullName  = extractField(fieldData, 'full_name')
          const firstName = extractField(fieldData, 'first_name')
          const lastName  = extractField(fieldData, 'last_name')
          const nameRaw   = fullName || [firstName, lastName].filter(Boolean).join(' ')
          if (nameRaw.trim()) name = nameRaw.trim()

          // Extrai telefone e email
          phone = extractField(fieldData, 'phone_number', 'phone')
          email = extractField(fieldData, 'email')

          // Nome do anúncio (vem direto da API)
          if (leadData.ad_name) {
            adName = leadData.ad_name
          }

          // Tenta vincular ao imóvel cadastrado
          propertyId = await findProperty(adName)
        }

        const { error: insertError } = await supabase.from('campaign_leads').insert({
          id:               crypto.randomUUID(),
          campaign_id:      null,
          name,
          phone,
          email:            email || null,
          funnel_stage:     'new',
          source:           'meta_ads',
          meta_ad_name:     adName,
          property_id:      propertyId,
          created_at:       now,
          updated_at:       now,
          stage_updated_at: now,
        })

        if (insertError) {
          console.error('Erro ao inserir lead:', JSON.stringify(insertError))
        } else {
          console.log(`Lead inserido: ${name} | anúncio: ${adName} | imóvel: ${propertyId ?? 'não vinculado'}`)
        }
      }
    } catch (err) {
      console.error('Erro geral:', err)
    }

    // Sempre retorna 200 para o Meta
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response('Method Not Allowed', { status: 405 })
})
