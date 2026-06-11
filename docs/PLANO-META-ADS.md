# Plano de Implementação — Integração Meta Ads Lead Forms → iCRM

> **Status:** planejamento aprovado pelo Rafael em 2026-06-10. Este documento é a especificação para execução.
> **Princípio norteador:** banco de dados é a única fonte de verdade. Toda decisão (distribuição, SLA, dedup) acontece em SQL transacional. A Edge Function é só transporte. O frontend quase não muda.

---

## 1. Diagnóstico atual

### 1.1 Como o sistema funciona hoje

- **Funil principal** = tabela `leads` (331 linhas), exibido no Kanban ([LeadKanban.tsx](../src/modules/leads/LeadKanban.tsx)). Etapas: `lead → followup → atendimento → visita → proposta → venda`. Cada lead tem `broker_id` (RLS: corretor vê os seus; admin vê tudo via `is_admin()`).
- **Origem `meta_ads` já existe** no CHECK constraint de `leads.origin`, no `lead_config`, e em TODA a UI (LeadForm, LeadKanban, LeadModal, LeadsPage, LeadsDashboard com cor/emoji/label). Nenhuma mudança de dashboard é necessária para o lead aparecer corretamente.
- **Criação de lead** (`useLeadsStore.add`): gera id TEXT, vincula/cria `contact` pelo telefone normalizado (somente dígitos), grava banco-primeiro (sem optimistic update).
- **Interações** = tabela `lead_interactions` (tipos `ligacao | whatsapp | email | visita | reuniao | nota | stage_change | discard | tarefa`). O botão **"Registrar contato e abrir WhatsApp"** ([LeadKanban.tsx:303](../src/modules/leads/LeadKanban.tsx) e [LeadModal.tsx:513](../src/modules/leads/LeadModal.tsx)) persiste uma interação `type='whatsapp'` no banco — esse é o evento oficial de primeiro contato. Existe um botão separado "Só abrir WhatsApp" que não registra nada.
- **Realtime:** `leads` está na publication `supabase_realtime` → INSERT via webhook aparece ao vivo no Kanban sem nenhuma mudança. ⚠️ `lead_interactions` **NÃO está na publication**, embora `useLeadInteractionsStore.subscribe()` exista (canal nunca recebe eventos — corrigir de carona).
- **Usuários:** Rafael `7844d77b-330a-4ffa-a4bd-f9e1134952f1` (admin), Dionata `54fd0e07-124f-43e6-aded-e17589e9c9ff` (broker), E2E Tester `e2e00000-...0001` (broker de teste — **excluir da rotação**).
- **Notificações:** tabela `notifications` (INSERT com `with_check: true`, SELECT por `user_id`), tipo único `task_assigned` hoje.
- **Extensões instaladas:** `pgcrypto`, `uuid-ossp`. **`pg_cron` e `pg_net` NÃO estão habilitadas** (disponíveis no Supabase, basta habilitar).

### 1.2 Por que a tentativa anterior falhou

Existe uma Edge Function `meta-leads-webhook` deployada (**16 versões** — evidência das tentativas). Defeitos estruturais encontrados no código:

| # | Defeito | Consequência |
|---|---------|--------------|
| 1 | `verify_jwt: true` | A Meta não envia JWT do Supabase. Toda chamada real era rejeitada com 401 **antes de chegar no código**. O teste do painel da Meta podia passar (GET) e produção falhar silenciosamente. |
| 2 | Insere em `campaign_leads` com `campaign_id: null` | Lugar errado (funil de prospecção, não o principal) e dependia de colunas extras (`source`, `meta_ad_name`) adicionadas fora das migrations. |
| 3 | Loop sobre `entry/changes` **sobrescreve** `leadgenId` | A Meta envia eventos em lote; só o último lead do lote era processado — leads perdidos. |
| 4 | Sem validação de assinatura `X-Hub-Signature-256` | Qualquer um que descobrisse a URL podia injetar leads falsos. |
| 5 | Sem deduplicação por `leadgen_id` | A Meta reenvia webhooks (retry) → leads duplicados. |
| 6 | Sem registro do payload bruto | Impossível auditar ou reprocessar falhas. |
| 7 | Matching difuso de imóvel por prefixo do nome do anúncio | Regra mágica, frágil, difícil de debugar — exatamente a complexidade que se quer eliminar. |
| 8 | Sem distribuição, sem SLA | Lead caía "no limbo" sem responsável. |

**Decisão:** reescrever do zero (a função existente será substituída por completo). Remover as colunas órfãs `campaign_leads.source` e `campaign_leads.meta_ad_name` fica fora de escopo (não atrapalham).

---

## 2. Arquitetura recomendada

```
Meta (formulário preenchido)
   │  webhook POST (campo leadgen)
   ▼
Edge Function meta-leads-webhook  ← verify_jwt: FALSE + assinatura HMAC
   │  1. valida X-Hub-Signature-256 (META_APP_SECRET)
   │  2. para CADA change do lote: INSERT bruto em meta_webhook_events
   │     (ON CONFLICT leadgen_id DO NOTHING → dedup de retries)
   │  3. busca field_data na Graph API (META_ACCESS_TOKEN)
   │  4. chama RPC process_meta_lead(event_id)  ← TODA a lógica aqui
   │  5. responde 200 sempre
   ▼
Postgres (única fonte de verdade)
   ├─ process_meta_lead(): dedup por telefone → reentrada OU
   │    cria contact + lead + round-robin + sla_due_at + interação + notificação
   │    (tudo em UMA transação, SECURITY DEFINER)
   ├─ trigger em lead_interactions: type='whatsapp' → seta leads.first_contact_at,
   │    zera sla_due_at  ("parar o relógio" é efeito do dado, não de código de app)
   └─ pg_cron (a cada 1 min): recapture_overdue_leads()
        → leads com sla_due_at <= now() e sem 1º contato
        → alterna broker (ping-pong), grava lead_assignments, interação, notificação,
          recalcula novo sla_due_at em minutos úteis
   ▼
Frontend (quase intocado)
   └─ realtime de `leads` já existente → card aparece no Kanban ao vivo
```

**Por que é simples:** 3 objetos novos no banco (1 tabela de eventos, 1 tabela de auditoria de atribuições, 1 tabela de configuração da rotação), 2 colunas novas em `leads`, 3 funções SQL, 1 trigger, 1 cron job, 1 Edge Function fina. Zero regra no frontend, zero matching mágico, zero estado fora do banco.

### Regras de negócio congeladas (decisões do Rafael, 2026-06-10)

1. **Round-robin** alternado Dionata ↔ Rafael, ponteiro persistido no banco.
2. **SLA de 5 minutos ÚTEIS** para registrar 1º contato. Janela útil: **Seg–Sex 09:00–18:00 e Sáb 09:00–13:00**, timezone `America/Sao_Paulo`. Fora da janela o relógio pausa (lead que chega 03h só começa a contar 09h).
3. **Estouro do SLA → ping-pong:** o lead alterna para o outro corretor, novo SLA de 5 min úteis, repetindo indefinidamente até alguém registrar o 1º contato. Cada transferência: registro auditável (de→para, motivo, timestamp) + notificação ao novo responsável.
4. **1º contato válido** = interação `type='whatsapp'` (botão "Registrar contato e abrir WhatsApp"). Mudança de etapa, nota, tarefa **não** param o relógio. (O tipo qualificante fica numa constante única na trigger — trivial estender para `ligacao` depois, se desejado.)
5. **Reentrada (mesmo telefone):** não cria lead novo; grava interação `type='nota'` "Preencheu novamente o formulário Meta Ads (...)" no lead existente mais recente daquele telefone. `nota` não para o relógio — correto.

---

## 3. Fluxo completo (do formulário ao CRM)

1. Pessoa preenche o Instant Form no anúncio (nome, telefone, e-mail).
2. Meta dispara `POST /functions/v1/meta-leads-webhook` com `entry[].changes[]` contendo `leadgen_id`, `page_id`, `form_id`, `ad_id`.
3. Edge Function valida a assinatura HMAC do corpo bruto. Inválida → 403 e fim.
4. Para **cada** change `leadgen` do lote: tenta `INSERT` em `meta_webhook_events` com `status='received'`. `leadgen_id` já existe → retry da Meta → ignora.
5. Busca os dados na Graph API: `GET /{leadgen_id}?fields=field_data,ad_name,form_id,created_time`. Falhou → atualiza evento para `status='error'` + mensagem (reprocessável depois) e segue para o próximo.
6. Chama `process_meta_lead(event_id)`. Dentro da transação:
   - Normaliza telefone (só dígitos, remove `55` inicial — função `normalize_phone_br`).
   - **Dedup:** existe lead com mesmo telefone normalizado? → insere interação de reentrada no mais recente, marca evento `status='reentry'` com `lead_id`, **fim**.
   - Senão: busca contato pelo telefone; não existe → cria (`broker_id` = corretor sorteado).
   - **Round-robin:** `SELECT ... FOR UPDATE` em `lead_distribution` (linha única), avança o ponteiro, escolhe o corretor.
   - Insere o `lead`: `origin='meta_ads'`, `funnel_stage='lead'`, `broker_id`, `notes` = "Meta Ads — anúncio: {ad_name} · formulário: {form_id}", `assigned_at=now()`, `sla_due_at = sla_deadline(now())`.
   - Insere em `lead_assignments` (`reason='round_robin'`).
   - Insere interação `type='nota'` "Lead recebido via Meta Ads (anúncio X)".
   - Insere `notification` para o corretor (`type='lead_assigned'`).
   - Marca evento `status='processed'` + `lead_id`.
7. Responde `200` para a Meta (sempre, mesmo com erro interno — o erro fica registrado no evento; nunca devolver 5xx repetidamente, ou a Meta desativa a subscription).
8. **No CRM:** o INSERT em `leads` chega via realtime → card aparece no Kanban do corretor (e do Rafael, admin) em tempo real. Sem F5.
9. Corretor clica "Registrar contato e abrir WhatsApp" → interação `whatsapp` persistida → trigger seta `first_contact_at`, zera `sla_due_at`. Relógio parado.
10. Se ninguém registrar: cron (1/min) encontra `sla_due_at <= now()` → transfere para o outro corretor (atualiza `leads.broker_id` **e** `contacts.broker_id` do contato vinculado — sem isso o corretor novo não enxergaria o contato por RLS), grava `lead_assignments` (`reason='sla_recapture'`), interação `stage_change`-like (`type='nota'`, descrição "Transferido por SLA: X → Y"), notificação, novo `sla_due_at`. Repete até o passo 9 acontecer.

---

## 4. Estrutura de banco — Migration `028_meta_leads_integration.sql`

> Tudo **aditivo**. IDs seguem o padrão do schema (`text`). Funções de negócio são `SECURITY DEFINER` com `SET search_path = public`.

### 4.1 Tabelas novas

```sql
-- Log bruto de webhooks — auditoria total + dedup + reprocesso
CREATE TABLE public.meta_webhook_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leadgen_id   text NOT NULL UNIQUE,          -- dedup de retries da Meta
  page_id      text,
  form_id      text,
  ad_id        text,
  ad_name      text,
  raw_payload  jsonb NOT NULL,                -- change completo recebido
  lead_payload jsonb,                          -- resposta da Graph API (field_data)
  status       text NOT NULL DEFAULT 'received'
               CHECK (status IN ('received','processed','reentry','error')),
  error_detail text,
  lead_id      text REFERENCES public.leads(id) ON DELETE SET NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- Auditoria de toda atribuição/transferência de lead
CREATE TABLE public.lead_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        text NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_broker_id uuid REFERENCES auth.users(id),  -- NULL na atribuição inicial
  to_broker_id   uuid NOT NULL REFERENCES auth.users(id),
  reason         text NOT NULL CHECK (reason IN ('round_robin','sla_recapture','manual')),
  sla_due_at     timestamptz,                     -- prazo dado ao novo responsável
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Configuração + ponteiro do round-robin (linha única)
CREATE TABLE public.lead_distribution (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  broker_ids  uuid[] NOT NULL,     -- ordem da rotação
  last_index  integer NOT NULL DEFAULT -1,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.lead_distribution (id, broker_ids, last_index)
VALUES (1, ARRAY[
  '54fd0e07-124f-43e6-aded-e17589e9c9ff',  -- Dionata (lead 1)
  '7844d77b-330a-4ffa-a4bd-f9e1134952f1'   -- Rafael  (lead 2)
]::uuid[], -1);
```

### 4.2 Colunas novas em `leads`

```sql
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS first_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_due_at       timestamptz;
```

(`assigned_at` é dispensável — a última linha de `lead_assignments` já diz quando/para quem.)

### 4.3 Índices

```sql
CREATE INDEX idx_meta_events_status   ON public.meta_webhook_events(status) WHERE status <> 'processed';
CREATE INDEX idx_lead_assignments_lead ON public.lead_assignments(lead_id, created_at DESC);
CREATE INDEX idx_leads_sla_due        ON public.leads(sla_due_at) WHERE sla_due_at IS NOT NULL;
CREATE INDEX idx_leads_phone_norm     ON public.leads(public.normalize_phone_br(phone));
```

### 4.4 Funções

```sql
-- Normalização de telefone BR (IMMUTABLE para uso em índice)
CREATE OR REPLACE FUNCTION public.normalize_phone_br(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN d ~ '^55' AND length(d) >= 12 THEN substring(d FROM 3)
    ELSE d
  END
  FROM (SELECT regexp_replace(coalesce(p,''), '\D', '', 'g') AS d) t;
$$;

-- Prazo de SLA: +5 minutos ÚTEIS a partir de um instante.
-- Janela: Seg–Sex 09–18h, Sáb 09–13h, America/Sao_Paulo.
-- Algoritmo: converte para hora local; se o instante está fora da janela,
-- avança para o início da próxima janela; soma 5 min; se ultrapassar o fim
-- da janela, carrega o restante para a próxima janela. Loop simples (máx. 2 iterações).
CREATE OR REPLACE FUNCTION public.sla_deadline(from_ts timestamptz)
RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$ ... $$;
-- (executor: implementar exatamente a regra acima; testar os casos da seção 9.3)

-- Processamento transacional de um evento Meta
CREATE OR REPLACE FUNCTION public.process_meta_lead(p_event_id uuid)
RETURNS text  -- lead_id criado ou existente (reentrada)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ ... $$;
-- Passos internos (ver fluxo §3 item 6). Pontos de atenção:
--  * SELECT ... FROM lead_distribution WHERE id=1 FOR UPDATE  (serializa a rotação)
--  * dedup: SELECT id FROM leads
--      WHERE normalize_phone_br(phone) = normalize_phone_br(v_phone)
--      ORDER BY created_at DESC LIMIT 1
--  * ids text: usar gen_random_uuid()::text para leads/contacts/interactions
--  * nome vem de field_data: full_name OU first_name+last_name; fallback 'Lead Meta Ads'
--  * telefone vazio → ainda cria o lead (phone = '') e anota no notes; nunca descartar silenciosamente

-- Recaptura por SLA estourado (chamada pelo pg_cron)
CREATE OR REPLACE FUNCTION public.recapture_overdue_leads()
RETURNS integer  -- quantos transferiu
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ ... $$;
-- SELECT ... FROM leads
--   WHERE sla_due_at IS NOT NULL AND sla_due_at <= now()
--     AND first_contact_at IS NULL AND discarded_at IS NULL
--   FOR UPDATE SKIP LOCKED;
-- Para cada lead: v_next = o broker em lead_distribution.broker_ids que NÃO é o atual;
--   UPDATE leads SET broker_id = v_next, sla_due_at = sla_deadline(now()), updated_at = now();
--   UPDATE contacts SET broker_id = v_next WHERE id = lead.contact_id;  -- visibilidade RLS
--   INSERT lead_assignments (reason='sla_recapture', from→to, sla_due_at novo);
--   INSERT lead_interactions (type='nota', 'Transferido automaticamente: {De} não registrou
--     o 1º contato em 5 min úteis → {Para}', broker_id = NULL);
--   INSERT notifications (user_id=v_next, type='lead_recaptured', title, resource_id=lead.id);
```

### 4.5 Trigger — parar o relógio

```sql
CREATE OR REPLACE FUNCTION public.handle_first_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.type = 'whatsapp' THEN   -- tipo qualificante (constante única; estender aqui se preciso)
    UPDATE public.leads
       SET first_contact_at = COALESCE(first_contact_at, NEW.interacted_at),
           sla_due_at = NULL
     WHERE id = NEW.lead_id AND first_contact_at IS NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_first_contact
  AFTER INSERT ON public.lead_interactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_first_contact();
```

(SECURITY DEFINER porque o corretor que insere a interação pode já não ser o dono do lead no instante exato — a trigger precisa atualizar o lead mesmo assim. O `WHERE first_contact_at IS NULL` torna a corrida trigger × cron inofensiva.)

### 4.6 Realtime e cron

```sql
-- corrige gap existente: store já assina lead_interactions mas a tabela não publica
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_interactions;

-- habilitar extensão (Dashboard > Database > Extensions, ou:)
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('recapture-leads-sla', '* * * * *',
  $$SELECT public.recapture_overdue_leads()$$);
```

---

## 5. Segurança (RLS, permissões, auditoria)

| Tabela | RLS |
|---|---|
| `meta_webhook_events` | `ENABLE RLS`. SELECT: `public.is_admin()` apenas. **Nenhuma policy de INSERT/UPDATE/DELETE** → só a service role (Edge Function) escreve. Payloads contêm dados pessoais — corretor não precisa ver. |
| `lead_assignments` | `ENABLE RLS`. SELECT: `from_broker_id = auth.uid() OR to_broker_id = auth.uid() OR public.is_admin()`. Sem policies de escrita → só funções DEFINER/service role escrevem. |
| `lead_distribution` | `ENABLE RLS`. SELECT/UPDATE: `public.is_admin()` (admin pode editar a rotação no futuro). |
| `leads`, `contacts`, `lead_interactions`, `notifications` | **Inalteradas.** As escritas do webhook/cron passam por service role + SECURITY DEFINER, que ignoram RLS por design. |

Outros pontos:
- **Assinatura HMAC obrigatória** (`X-Hub-Signature-256`, comparação timing-safe) — sem ela a URL pública aceitaria leads forjados.
- **`verify_jwt: false`** no deploy é seguro *porque* a autenticação real é a assinatura HMAC da Meta.
- **Secrets** só em Edge Function Secrets do Supabase (`META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_ACCESS_TOKEN`). Nada no repo, nada no frontend.
- **Auditoria:** trilha completa = `meta_webhook_events` (entrada) → `lead_assignments` (quem recebeu, quando, por quê) → `lead_interactions` (histórico visível no LeadModal) → `notifications`. Toda transferência tem motivo + timestamp + de→para.
- ⚠️ Observação pré-existente (fora de escopo, não tocar nesta entrega): `notifications_insert` tem `WITH CHECK (true)` — qualquer usuário autenticado pode inserir notificação para qualquer outro.

---

## 6. Meta Ads — passo a passo completo

### 6.1 Meta Business Manager (business.facebook.com)
1. Confirmar que a Página da Souza Imobiliária e a conta de anúncios estão **dentro do Business Manager** (Configurações do negócio → Contas → Páginas / Contas de anúncios).
2. **Verificação da empresa** (Central de Segurança → Verificação da empresa): enviar CNPJ + documento. Demora 1–5 dias úteis. *Necessária para o app ficar em modo Live com acesso padrão; sem ela dá para operar em modo Desenvolvimento (ver 6.8), mas a verificação é o caminho profissional.*

### 6.2 App Meta (developers.facebook.com)
3. My Apps → Create App → caso de uso "Outro" → tipo **Business** → vincular ao Business Manager. Nome ex.: `iCRM Souza`.
4. App Settings → Basic: copiar **App Secret** → será o secret `META_APP_SECRET`.

### 6.3 Webhook
5. Adicionar o produto **Webhooks** → objeto **Page** → Subscribe to `leadgen`.
   - Callback URL: `https://dczexbzsfdavcrwiungk.supabase.co/functions/v1/meta-leads-webhook`
   - Verify Token: string aleatória longa (gerar com `openssl rand -hex 24`) → secret `META_VERIFY_TOKEN`.
   - ⚠️ A verificação (GET) só funciona **depois** da Edge Function nova estar deployada com `verify_jwt: false`.

### 6.4 Token permanente (System User)
6. Business Settings → Usuários → **Usuários do sistema** → criar `icrm-integracao` (função: Funcionário).
7. "Adicionar ativos" ao usuário do sistema: a **Página** (controle total) e a **conta de anúncios** (acesso de visualização basta).
8. **Gerar token**: selecionar o app `iCRM Souza`, expiração **"nunca"**, escopos:
   `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `leads_retrieval`, `pages_manage_ads`, `ads_read` (este último para `ad_name`).
   → secret `META_ACCESS_TOKEN`. Guardar também em local seguro (1Password etc.) — a Meta não mostra de novo.

### 6.5 Inscrever a Página no app (passo que quase todo mundo esquece)
9. Com o token do sistema, obter o **Page Access Token**:
   `GET https://graph.facebook.com/v23.0/me/accounts?access_token={META_ACCESS_TOKEN}`
10. Inscrever:
    `POST https://graph.facebook.com/v23.0/{PAGE_ID}/subscribed_apps?subscribed_fields=leadgen&access_token={PAGE_ACCESS_TOKEN}`
    Resposta esperada: `{"success": true}`. Sem este passo o webhook **nunca dispara**, mesmo configurado no painel.

### 6.6 Acesso aos leads da Página (segundo bloqueador silencioso)
11. Meta Business Suite → Configurações → **Acesso a leads** (Lead Access Manager): garantir que CRMs estão liberados e que o usuário do sistema / o app têm acesso. Se a Página nunca mexeu nisso, o padrão costuma liberar admins — conferir mesmo assim. Sintoma de bloqueio: webhook chega, mas a Graph API devolve erro de permissão ao buscar o `leadgen_id`.

### 6.7 Formulário (Instant Form)
12. Ads Manager → criar/editar o formulário com campos **nome completo (`full_name`)**, **telefone (`phone_number`)** e **e-mail (`email`)** — são os nomes de campo que a função extrai. Campos personalizados extras chegam no `field_data` e ficam guardados no `raw/lead_payload` (auditável), mas não mapeiam para colunas.
13. Conferir no formulário: idioma, política de privacidade (obrigatória — usar a da Souza), e telefone com preenchimento automático (vem do perfil do usuário, reduz telefone inválido).

### 6.8 Modo do app e aprovações
14. **Modo Desenvolvimento:** funciona para Páginas administradas pelos admins do app (seu caso). Leads reais chegam. Limitação: se outra pessoa criar formulários/páginas fora do seu BM, não funciona.
15. **Modo Live (recomendado):** exige Business Verification (passo 2) + Data Use Checkup anual. Para **ativos do próprio negócio**, *Standard Access* em `leads_retrieval` basta — **não precisa de App Review/Advanced Access** (isso só é exigido para acessar leads de páginas de terceiros).
16. **Riscos de bloqueio Meta:** token morre se o usuário do sistema for excluído ou o App Secret for rotacionado (refazer 6.4); a Meta **desativa a subscription do webhook** se o endpoint responder erro repetidamente (por isso a função responde 200 sempre); leads só ficam disponíveis na API por **90 dias** (irrelevante com webhook em tempo real, mas limita reprocessamento antigo); anúncios imobiliários no Brasil hoje não exigem Special Ad Category (exigência EUA/Canadá), mas políticas de anúncios de imóveis podem mudar — quem gerencia campanha deve acompanhar.

### 6.9 Teste
17. **Lead Ads Testing Tool**: `https://developers.facebook.com/tools/lead-ads-testing` → selecionar Página + formulário → "Create lead" → conferir: linha em `meta_webhook_events` com `status='processed'`, lead no Kanban, notificação, rotação correta. O lead de teste vem com valores dummy ("test lead: dummy data...") — apagar manualmente depois.
18. Repetir o teste 2× para validar o round-robin e 1× sem registrar contato para validar a recaptura após 5 min úteis.

---

## 7. Dashboard e relatórios

**Não muda nada** estruturalmente — e isso é intencional:
- `LeadsDashboard`, `LeadsPage`, `LeadKanban`, `LeadModal`, relatórios e admin view já segmentam por `origin` (com `meta_ads` mapeado: label "Meta ADS", azul, ícone) e por `broker_id` (visão Global / Meu Desempenho / Corretor X).
- O lead novo entra na coluna "Leads" do Kanban do corretor sorteado, ao vivo via realtime existente.

**Mudanças mínimas de frontend (fase 4):**
1. [src/types/index.ts](../src/types/index.ts): `Lead` += `firstContactAt?: string; slaDueAt?: string`; `NotificationType` += `'lead_assigned' | 'lead_recaptured'`.
2. [src/lib/db.ts](../src/lib/db.ts): mapear `first_contact_at`/`sla_due_at` no fetch/upsert de leads (upsert deve **preservar** os valores, nunca sobrescrever com undefined→null — atenção: o `update()` do store reenvia o objeto inteiro).
3. [src/store/useLeadsStore.ts](../src/store/useLeadsStore.ts): incluir os 2 campos nos mappers de realtime (INSERT e UPDATE).
4. [src/pages/NotificationsPage.tsx](../src/pages/NotificationsPage.tsx) + `useNotificationsStore`: renderizar os 2 tipos novos (ícone + texto + clique abre o lead).
5. **Opcional (fase 6):** badge de countdown no card do Kanban quando `slaDueAt` presente e `firstContactAt` nulo ("⏱ 3min para contato"). Puramente cosmético — a regra roda no banco com ou sem o badge. Seguir identidade visual (Lucide, Space Grotesk, sem emoji real).

---

## 8. Plano de implementação por fases

> Cada fase termina com critério de aceite verificável. Banco primeiro, Meta por último.

**Fase 1 — Migration `028_meta_leads_integration.sql`** (seção 4 inteira, menos o cron).
Aceite: `SELECT process_meta_lead(...)` com evento fake insere lead com broker alternado; trigger zera `sla_due_at` ao inserir interação `whatsapp`; reentrada não duplica; RLS: Dionata não lê `meta_webhook_events`.

**Fase 2 — Edge Function `meta-leads-webhook` (reescrita total)**
Criar `supabase/functions/meta-leads-webhook/index.ts` **no repo** (hoje só existe deployada). Conteúdo: GET verify / POST com validação HMAC / loop completo por `entry[].changes[]` / insert do evento / fetch Graph API `v23.0` / RPC / 200 sempre. Deploy com **`verify_jwt: false`** (`supabase functions deploy meta-leads-webhook --no-verify-jwt`, ou flag equivalente no MCP). Secrets: conferir `META_VERIFY_TOKEN` e `META_ACCESS_TOKEN` existentes, adicionar `META_APP_SECRET`.
Aceite: `curl` GET com verify token responde o challenge; POST sem assinatura → 403; POST assinado com payload de exemplo cria evento + lead.

**Fase 3 — pg_cron**
Habilitar extensão + `cron.schedule` (§4.6).
Aceite: lead fake com `sla_due_at` no passado é transferido em ≤1 min com assignment + interação + notificação; lead com `first_contact_at` preenchido é ignorado.

**Fase 4 — Frontend mínimo** (§7, itens 1–4).
Aceite: typecheck/build verdes; notificação de lead aparece e navega; lead via realtime carrega os campos novos.

**Fase 5 — Configuração Meta + teste ponta a ponta** (seção 6, com Rafael executando os passos de painel).
Aceite: Lead Ads Testing Tool → lead no Kanban em <30s; round-robin confirmado em 2 leads; recaptura confirmada em 1 lead deixado sem contato.

**Fase 6 — Go-live + observabilidade**
Campanha real ativa. Primeira semana: conferir diariamente `SELECT status, count(*) FROM meta_webhook_events GROUP BY 1` e logs da função. Opcional: badge SLA no Kanban; reprocesso manual de eventos `error` via `SELECT process_meta_lead(id)`.

---

## 9. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Meta reenvia o mesmo lead (retry/at-least-once) | `UNIQUE(leadgen_id)` + `ON CONFLICT DO NOTHING`. |
| Lote com vários leads num POST | Loop por **todas** as `entry[].changes[]` (defeito nº 3 da versão antiga). |
| Graph API fora do ar / token sem permissão na hora do webhook | Evento fica `status='error'` com detalhe; reprocesso manual idempotente. Lead bruto nunca se perde. |
| Token invalidado (rotação de secret, system user excluído) | System user com token sem expiração; procedimento de regeração documentado (§6.4); sintoma = eventos `error` com erro 190 da Meta. |
| Meta desativa subscription por respostas non-200 | Função responde 200 incondicionalmente no POST; erros vivem no banco, não no HTTP. |
| Dois webhooks simultâneos × round-robin | `FOR UPDATE` na linha de `lead_distribution` serializa. |
| Cron × clique no botão ao mesmo tempo | Trigger usa `WHERE first_contact_at IS NULL`; cron usa `FOR UPDATE SKIP LOCKED` e reverifica `first_contact_at` após o lock. Pior caso: transferência 1s antes do clique — o clique ainda registra o contato e para o relógio. |
| Transferência deixa o contato invisível ao novo corretor (RLS de `contacts`) | Recaptura atualiza também `contacts.broker_id` (§3 item 10). |
| Telefone em formato diferente quebra dedup | `normalize_phone_br` dos dois lados + índice funcional. |
| Fuso/horário comercial errado | `sla_deadline` calcula tudo em `America/Sao_Paulo`; testes obrigatórios: 17:58 sex → 09:03 sáb; 12:59 sáb → 09:04 seg; 03:00 qua → 09:05 qua; feriado **não** é tratado (decisão: simplicidade — relógio corre em feriado de semana). |
| Precisão do cron (1/min) | SLA efetivo = 5–6 min. Aceitável e documentado. |
| Lead sem telefone no formulário | Cria mesmo assim com aviso no `notes` — nunca descarte silencioso (princípio do banco como fonte de verdade). |
| E2E Tester entrar na rotação | `broker_ids` é lista explícita; testes E2E não tocam `lead_distribution`. |
| Pré-existente (não tocar, só ciência): `lead_config` tem origem `indicacao` ativa mas o CHECK de `leads.origin` não a permite | Tarefa separada já sinalizada — fora deste escopo. |

---

## 10. Rollback (sem perda de dados)

**Desligar a entrada (reversível em 2 min, ordem recomendada):**
1. Meta App Dashboard → Webhooks → unsubscribe do campo `leadgen` (ou `DELETE /{page_id}/subscribed_apps`). Leads param de chegar; os que já entraram ficam intactos.
2. `SELECT cron.unschedule('recapture-leads-sla');` — para o ping-pong; responsáveis atuais congelam.

**Rollback de banco (se necessário desfazer o schema):**
```sql
SELECT cron.unschedule('recapture-leads-sla');
DROP TRIGGER trg_first_contact ON public.lead_interactions;
DROP FUNCTION handle_first_contact(), recapture_overdue_leads(), process_meta_lead(uuid), sla_deadline(timestamptz);
DROP INDEX idx_leads_phone_norm;  DROP FUNCTION normalize_phone_br(text);
ALTER TABLE public.leads DROP COLUMN sla_due_at, DROP COLUMN first_contact_at;  -- única perda: metadados de SLA
-- manter (são histórico): meta_webhook_events, lead_assignments, lead_distribution
-- leads/contacts/interações criados pela integração: dados de negócio normais — NUNCA apagar em rollback
```
A Edge Function pode ficar deployada (sem subscription ela não recebe nada) ou ser deletada.

**Princípio:** a migration é 100% aditiva e os leads criados são leads normais do CRM. Rollback nunca toca em linha de `leads`/`contacts`/`lead_interactions`.
