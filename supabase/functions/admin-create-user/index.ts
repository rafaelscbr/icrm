// admin-create-user: cria a conta de um corretor — e só o admin pode pedir.
//
// Por que existe: a tela "Adicionar corretor" criava a conta pelo cadastro
// público do Supabase (auth.signUp no navegador). Para isso funcionar o
// cadastro público precisa ficar LIGADO, e aí qualquer pessoa de fora consegue
// criar um login no sistema. Com esta função o cadastro público pode ser
// desligado: a conta nasce aqui, com a chave de serviço, depois de conferir
// que quem pediu é um admin ativo.
//
// Fluxo: exige usuário logado (verify_jwt = true) → confere no banco que ele é
// admin ativo → valida nome, e-mail e senha → cria a conta já confirmada. O
// perfil é criado pelo gatilho `handle_new_user`, sempre como corretor
// (migração 091).
//
// A senha passa por aqui só para ser entregue ao Supabase Auth: não é gravada
// nem escrita em log.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const limpa = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  // 1. Quem está pedindo?
  const autorizacao = req.headers.get('Authorization')
  if (!autorizacao) return json({ error: 'Entre no sistema para criar um corretor' }, 401)

  const comoQuemPede = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  })
  const { data: quem, error: erroQuem } = await comoQuemPede.auth.getUser()
  if (erroQuem || !quem?.user) return json({ error: 'Sessão inválida ou expirada — entre de novo' }, 401)

  // 2. É admin ativo? Lido com a chave de serviço: não depende de regra de tela.
  const servico = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const { data: perfil, error: erroPerfil } = await servico
    .from('profiles').select('role, active').eq('id', quem.user.id).maybeSingle()
  if (erroPerfil) return json({ error: 'Não foi possível conferir a sua permissão. Tente de novo.' }, 500)
  if (!perfil || perfil.role !== 'admin' || !perfil.active) {
    return json({ error: 'Só o admin pode criar contas' }, 403)
  }

  // 3. Dados da conta
  let corpo: Record<string, unknown>
  try { corpo = await req.json() } catch { return json({ error: 'Pedido inválido' }, 400) }
  const nome  = limpa(corpo.name, 80)
  const email = limpa(corpo.email, 160).toLowerCase()
  const senha = typeof corpo.password === 'string' ? corpo.password : ''

  if (nome.length < 2) return json({ error: 'Informe o nome do corretor' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'E-mail inválido' }, 400)
  if (senha.length < 6) return json({ error: 'A senha precisa de pelo menos 6 caracteres' }, 400)
  if (senha.length > 72) return json({ error: 'A senha pode ter no máximo 72 caracteres' }, 400)

  // 4. Cria a conta já confirmada — o corretor entra direto, sem e-mail de confirmação.
  const { data, error } = await servico.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { name: nome },
  })
  if (error) {
    const jaExiste = /already|registered|exists/i.test(error.message)
    return json(
      { error: jaExiste ? 'Já existe uma conta com este e-mail' : `A conta não foi criada: ${error.message}` },
      jaExiste ? 409 : 400,
    )
  }

  return json({ id: data.user?.id, email }, 200)
})
