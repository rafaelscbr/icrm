# Plano Técnico — Camada de Inteligência Comercial de Leads

> **Status:** planejamento para revisão. Nada implementado. Nenhuma migration aplicada.
> **Data do diagnóstico:** 2026-08-01 — projeto Supabase `icrm` (`dczexbzsfdavcrwiungk`), branch `main`.
> **Princípio herdado:** o banco é a única fonte de verdade. Toda classificação é calculada e persistida em SQL transacional; o front apenas lê. Nenhum cálculo de inteligência pode viver só no navegador.

---

## Sumário

1. [Diagnóstico do estado atual](#1-diagnóstico-do-estado-atual)
2. [Fluxo atual do lead — webhook até interface](#2-fluxo-atual-do-lead--webhook-até-interface)
3. [Lacunas e inconsistências](#3-lacunas-e-inconsistências)
4. [Modelo conceitual proposto](#4-modelo-conceitual-proposto)
5. [Alterações de banco sugeridas](#5-alterações-de-banco-sugeridas)
6. [Normalização de perguntas e respostas](#6-normalização-de-perguntas-e-respostas)
7. [Identidade e deduplicação](#7-identidade-e-deduplicação)
8. [Perfil atual e histórico do lead](#8-perfil-atual-e-histórico-do-lead)
9. [Condições comerciais de produto e campanha](#9-condições-comerciais-de-produto-e-campanha)
10. [Regras iniciais de compatibilidade](#10-regras-iniciais-de-compatibilidade)
11. [Regras iniciais de temperatura e decaimento](#11-regras-iniciais-de-temperatura-e-decaimento)
12. [Matriz de prioridade comercial](#12-matriz-de-prioridade-comercial)
13. [Eventos que provocam recálculo](#13-eventos-que-provocam-recálculo)
14. [Interface e filtros](#14-interface-e-filtros)
15. [Plano de migração e backfill](#15-plano-de-migração-e-backfill)
16. [Plano de testes](#16-plano-de-testes)
17. [Observabilidade e auditoria](#17-observabilidade-e-auditoria)
18. [Rollout por fases](#18-rollout-por-fases)
19. [Riscos e proteções](#19-riscos-e-proteções)
20. [Decisões pendentes do negócio](#20-decisões-pendentes-do-negócio)

---

## 1. Diagnóstico do estado atual

### 1.1 Respostas às 18 perguntas de investigação

**1. Como um lead é identificado e deduplicado hoje?**

Só na entrada do Meta, dentro de `process_meta_lead`. O critério é `normalize_phone_br(phone)` **restrito a leads não descartados**:

```sql
SELECT id INTO v_existing_id FROM leads
WHERE normalize_phone_br(phone) = v_phone_norm
  AND discard_reason IS NULL
ORDER BY created_at DESC LIMIT 1;
```

`normalize_phone_br` remove não-dígitos e corta o `55` inicial quando o número tem ≥12 dígitos. **Não normaliza o nono dígito** — `4799680xxxx` e `479680xxxx` (mesma pessoa, formatos diferentes) são identidades distintas. Como o filtro exclui descartados e 704 dos 820 leads estão descartados, a mesma pessoa reentra como lead novo assim que o anterior é descartado — comportamento intencional (memória `project_meta_ads_regras`), mas significa que **`leads.id` não é a identidade da pessoa**.

Evidência no banco: 16 telefones normalizados com mais de um lead; 9 telefones que preencheram 2+ formulários diferentes; 9 contatos com 2+ leads.

**2. Existe vínculo confiável entre `meta_webhook_events` e `leads`?**

Parcialmente. `meta_webhook_events.lead_id` é FK para `leads(id)` **`ON DELETE SET NULL`**. Estado atual:

| status | total | com `lead_id` | sem |
|---|---|---|---|
| processed | 502 | 491 | **11** |
| reentry | 5 | 5 | 0 |
| error | 1 | 0 | 1 |

Os 11 `processed` órfãos são leads que foram criados e depois **deletados** — o `SET NULL` apagou a rastreabilidade. 10 deles são leads de teste da Meta (ver item 3). Conclusão: o vínculo serve para leitura, **não serve como chave de reprocessamento**. O `leadgen_id` (UNIQUE) é a única chave estável.

**3. Todos os payloads históricos do Meta continuam disponíveis?**

Não, e a lacuna é conhecida. Primeiro evento: **2026-06-12**. Existem 598 leads `origin='meta_ads'`, mas apenas 493 têm evento vinculado. Os ~105 restantes entraram antes do webhook (importação manual) e **não têm respostas de formulário em lugar nenhum**. Dos que têm rastro, 507 eventos guardam `lead_payload` completo (1 evento em `error` sem payload).

**Descoberta relevante:** os **leads de teste da Meta viram leads reais**. Dez eventos com `<test lead: dummy data for full_name>` foram processados — consumiram slot do round-robin, geraram notificação, SLA e `lead_assignments` — e alguém deletou os leads depois na mão. Não há filtro para isso na RPC.

**4. Como as mudanças de etapa são registradas?**

Em `lead_interactions` com `type='stage_change'` e as colunas estruturadas `from_stage`/`to_stage` (migração posterior à 049). **608 registros, todos com from/to preenchidos** — é a melhor fonte comportamental do sistema.

O problema é *onde* isso acontece: no front, em [useLeadsStore.ts:250](../src/store/useLeadsStore.ts#L250). O lead é salvo primeiro e o histórico depois, com `.catch()` que engole o erro:

```ts
await useLeadInteractionsStore.getState().add({ ... })
  .catch(err => console.error('[leads] setStage history:', err)) // etapa já salva — histórico não bloqueia
```

Ou seja: **não há garantia no banco de que toda mudança de etapa gere um evento**. Para uma camada de inteligência que depende de eventos, isso é uma fundação de areia — o gatilho precisa migrar para trigger de banco.

**5. Existe histórico suficiente para distinguir avanço, retorno e correção manual?**

Sim para avanço e retorno, não para correção. Com a ordem canônica `lead → followup → atendimento → visita → proposta → venda`, dos 608 `stage_change` há **41 retrocessos** (posição de destino menor que a de origem). O que falta é distinguir "corretor arrastou o card errado e desfez em 30 segundos" de "lead voltou para follow-up de verdade" — não há marcação de intenção. Proposta na §11.4: heurística de janela curta + mesmo ator, sem exigir nada do corretor.

**6. Como videochamadas e visitas são diferenciadas nas tarefas?**

**Videochamada não existe no sistema.** `TaskCategory` em [types/index.ts:83](../src/types/index.ts#L83) é `'visita' | 'agenciamento' | 'proposta' | 'busca_imovel' | 'campanhas' | 'administrativo' | 'prospeccao_imoveis' | 'souza_financeiro' | 'outro'`. Visita existe: 36 tarefas `category='visita'` (31 `done`, 5 `pending`), e o lead guarda `visita_task_id` com o modal dedicado ([LeadVisitaTaskModal.tsx](../src/modules/leads/LeadVisitaTaskModal.tsx)). Também há `lead_interactions.type='reuniao'` (0 registros) e `'visita'` (0 registros) — tipos declarados e nunca usados.

Para tratar videochamada como sinal, é preciso **criar a categoria** — decisão pendente §20.

**7. Agendamento e conclusão possuem eventos separados?**

Sim, mas por *estado*, não por evento: `tasks.status` (`pending`/`done`/`cancelled`) + `tasks.completed_at`. Não existe log de transição de tarefa. Dá para derivar "agendou" de `created_at` e "concluiu" de `completed_at` — suficiente para pesar visita realizada acima de visita marcada, como pedido. Apenas 10 tarefas têm `lead_id` preenchido (coluna nova, migração 058); o resto se liga por `contact_id`.

**8. Como descartes e reativações são registrados?**

Descarte: `leads.discard_reason` + `discarded_at` + interação `type='discard'` (680 registros). Os motivos vêm de `lead_config` (`type='discard_reason'`, 10 ativos) — configurável, sem enum travado. Distribuição atual:

| motivo | n |
|---|---|
| sem_condicao | 255 |
| nunca_respondeu | 227 |
| parou_de_responder | 75 |
| telefone_invalido | 47 |
| sem_interesse | 42 |
| fora_de_nicho | 22 |
| desistiu_de_comprar | 14 |
| corretor / ciclou_por_engano | 9 cada |
| comprou_outro | 6 |

`sem_condicao` (255, o maior grupo) é exatamente o sinal de *incompatibilidade financeira* que a camada de inteligência quer prever — é o rótulo de treino natural quando houver volume.

**Reativação não é registrada.** `restore()` em [useLeadsStore.ts:428](../src/store/useLeadsStore.ts#L428) limpa `discard_reason` e `discarded_at` e **não cria interação nenhuma**. O estado "reaquecendo" pedido no briefing não tem hoje evento de origem.

**9. Já existe tabela de produtos com condições comerciais?**

Não. Existe `properties` (31 linhas) — **todas `kind='ready'`**, imóveis de revenda com dono. **Zero registros `off_plan`**. Rogga, San Pelegrino, Porto Velas e Dotzero **não existem como entidade** no banco. O que existe é:

- `meta_form_routing.product_name` (texto livre) e `product_ticket` (numeric) — preenchidos em 4 dos 8 formulários;
- `leads.property_name` (texto livre) e `average_ticket`.

Nenhum campo de renda mínima, entrada, FGTS ou validade. Isso é a maior lacuna estrutural do projeto: **a metade "produto" da equação de compatibilidade não existe**.

**10. Já existe entidade de campanhas associada a produtos?**

Existem duas coisas chamadas "campanha" e nenhuma é campanha de Meta Ads:

- `campaigns` (3 linhas) — campanhas de **disparo de WhatsApp**, com `messages jsonb`, `average_ticket`, `conversion_rates`. Universo `campaign_leads` (14.794), separado do funil principal.
- `meta_form_routing` (8 linhas) — roteamento **por formulário**, que a UI chama de "campanhas" ([CampaignRoutingSettings.tsx](../src/modules/leads/CampaignRoutingSettings.tsx)).

A campanha real do Meta (`campaign_name`, `adset_name`) **não chega**: a Edge Function pede esses campos ([index.ts:40](../supabase/functions/meta-leads-webhook/index.ts#L40)) mas a Graph API não os retorna com o token atual. Ver item 17.

**11. Onde o formulário é roteado para produto e ticket?**

Em `meta_form_routing`, lido dentro de `process_meta_lead`:

```sql
property_name  := COALESCE(NULLIF(v_routing.product_name,''), NULLIF(v_form_name,''))
average_ticket := v_routing.product_ticket
```

Estado dos 8 formulários:

| form_id | form_name | product_name | ticket | leads | com `form_answers` |
|---|---|---|---|---|---|
| 2952185188465860 | Porto Velas + Perguntas | *(null)* | 650.000 | 1 | **0** |
| 2844383485917003 | Rogga + Perguntas | *(null)* | 530.000 | 10 | **0** |
| 2866501457059393 | San Pelegrino + Perguntas | San Pelegrino | 600.000 | 6 | **0** |
| 1512839613921544 | Rogga | Rogga | 530.000 | 336 | 336 |
| 971798969188963 | Porto Velas - 2 | Porto Velas | 650.000 | 12 | 12 |
| 2015420939066147 | San Pelegrino | San Pelegrino | 570.000 | 68 | 68 |
| 25059793933718336 | Dotzero | *(null)* | 440.000 | 49 | 49 |
| 2090155531929280 | Rogga - Renda | Rogga | 530.000 | 8 | 8 |

Dois problemas: `product_name` é texto livre (três grafias possíveis para o mesmo produto) e os **3 formulários novos estão sem `product_name`** — 2 de 3 nem herdam nome de produto correto.

**12. Qual é a causa exata de `form_answers` não ser preenchido?**

`process_meta_lead` **nunca escreveu nessa coluna**. A função monta o texto e descarta a estrutura:

```sql
SELECT string_agg('• ' || replace(f->>'name','_',' ') || ': ' || ..., E'\n')
INTO v_extra FROM jsonb_array_elements(v_field_data) f WHERE ...;
...
v_notes := format('Meta Ads — %s', v_origem_desc)
  || COALESCE(E'\n\nRespostas do formulário:\n' || v_extra, '');

INSERT INTO leads (id, name, phone, email, origin, meta_form_id, ..., notes, ...)
--                                    ↑ form_answers ausente da lista de colunas
```

Os 477 registros preenchidos vieram inteiramente do bloco `WITH parsed AS (...) UPDATE leads SET form_answers = p.answers` da migração [059_lead_form_answers.sql:25](../supabase/migrations/059_lead_form_answers.sql#L25) — um `UPDATE` único, executado uma vez. O comentário da própria migração diz "Ela só cria a base", e a segunda metade (alimentar a coluna daí em diante) nunca foi feita.

Consequência medida: os 17 leads dos 3 formulários novos (01/08) estão com `form_answers = null`. Em 31/07 a taxa era 6/6; em 01/08 caiu para 1/18 — e esse 1 é do formulário antigo `Rogga`, que já tinha sido backfillado.

**13. O banco possui constraints, triggers ou funções que seriam afetados?**

Inventário do que toca leads:

| objeto | tipo | impacto |
|---|---|---|
| `process_meta_lead(uuid)` | função SECURITY DEFINER, 8 KB | **precisa mudar** — é o ponto de entrada |
| `recapture_overdue_leads()` | função + cron `* * * * *` | round-robin de SLA; não muda, mas compete por lock em `leads` |
| `handle_first_contact()` | trigger AFTER INSERT em `lead_interactions` | grava `first_contact_at`; modelo a seguir |
| `transfer_lead(text,uuid)` | função | grava `lead_assignments` + interação |
| `trg_first_contact` | único trigger em `lead_interactions` | — |
| `log_delete_contacts` | trigger AFTER DELETE em `contacts` | — |
| **`leads` não tem nenhum trigger** | — | toda escrita vem do front via upsert |
| CHECK `leads_origin_check` | `felicita, meta_ads, portal, offline, campanha, indicacao` | TS declara 5 dos 6 — falta `indicacao` em [types/index.ts:262](../src/types/index.ts#L262) |
| CHECK `leads_funnel_stage_check` | 6 etapas | define a ordem canônica de avanço |
| CHECK `lead_interaction_type_check` | 9 tipos | **precisa de novos tipos** se sinais virarem interações |
| `leads.contact_id` | **sem FK** | 275 leads sem contato (33%); 0 órfãos hoje, mas nada impede |

Extensões: `pg_cron 1.6.4` e `pg_net 0.20.0` ativos, com 2 jobs (`recapture-leads-sla` a cada minuto, `cleanup-deleted-rows` diário). Infra de agendamento pronta para o decaimento de temperatura.

**14. Quais componentes e tipos do front precisam ser estendidos?**

| arquivo | situação |
|---|---|
| [types/index.ts:281](../src/types/index.ts#L281) `interface Lead` | **não tem `metaFormId` nem `formAnswers`** |
| [lib/db.ts:495](../src/lib/db.ts#L495) `LeadRow` / `toLead` / `fromLead` | mesmas ausências; `fromLead` monta a linha inteira |
| [lib/db.ts:632](../src/lib/db.ts#L632) `fetchAll` | usa `select('*')` — **puxa `notes` e `form_answers` de todos os leads em cada carga** |
| [lib/db.ts:778](../src/lib/db.ts#L778) `upsertOne` | `.upsert(row, {onConflict:'id'})` — colunas ausentes do payload não são sobrescritas ✔ |
| [modules/leads/LeadModal.tsx:891](../src/modules/leads/LeadModal.tsx#L891) | única exibição das respostas: `<p>{lead.notes}</p>` |
| [modules/leads/LeadsPage.tsx:172](../src/modules/leads/LeadsPage.tsx#L172) | filtros `stage/origin/broker/product` — **todos client-side** sobre o array completo |
| [lib/leadScore.ts](../src/lib/leadScore.ts) | **score concorrente já existe** — ver abaixo |

**Score legado.** `leadScore.ts` calcula "Frio/Morno/Quente/Muito Quente" no navegador a partir de listas, disparos, etapa de campanha e etapa do funil. Não persiste, não versiona, não usa formulário, não decai com o tempo e roda 5 queries por contato. Não é a camada pedida — mas **usa os mesmos rótulos**. Deixar os dois convivendo cria duas verdades na tela. Decisão §20.

**15. Há risco de RLS impedir o cálculo ou a visualização?**

Sim, em dois pontos.

*Cálculo:* `leads`, `contacts` e `lead_interactions` usam `(broker_id = auth.uid()) OR is_admin()`. Qualquer função que varra o histórico da pessoa inteira precisa ser `SECURITY DEFINER` (como `process_meta_lead` já é), senão o corretor A não enxerga a submissão que caiu para o corretor B — e leads da mesma pessoa **trocam de dono** por round-robin e recaptura de SLA. Sem `SECURITY DEFINER`, o perfil consolidado fica com buracos que variam por usuário.

*Visualização:* `meta_webhook_events` e `meta_form_routing` são **`is_admin()`-only**. Se a aba de inteligência ler direto dessas tabelas, o Dionata vê tela vazia. As tabelas novas precisam de policy própria: visível quando o corretor é dono de *algum* lead daquela pessoa.

**16. Como o sistema lida com fuso horário?**

Banco em **UTC** (`current_setting('TimeZone') = 'UTC'`), todas as colunas de data são `timestamptz` — correto. A conversão para `America/Sao_Paulo` é feita explicitamente onde o horário comercial importa: `sla_deadline()` e `business_minutes()` (janelas Seg-Sex 9-18, Sáb 9-13). Duas exceções que exigem cuidado:

- `tasks.due_date` / `due_time` são **`text`**, sem fuso;
- `leads.created_at` e `meta_webhook_events.received_at` estão em UTC, mas o Meta manda `created_time` no payload com offset (`2026-08-01T18:32:03+0000`) — **é essa a hora real do preenchimento**, e ela é ignorada hoje. Janelas de "2 formulários em 7 dias" devem usar `created_time`, não `received_at`.

Regra para o projeto: agregações por dia/semana usam `AT TIME ZONE 'America/Sao_Paulo'`; a semana é Domingo→Sábado (memória `project_week_convention`), sem `date_trunc('week')`.

**17. Como enriquecer campanhas e anúncios, sendo que `ad_name` recebe só o ID?**

Confirmado: `meta_webhook_events.ad_name = '120249032612560512'` — é o `ad_id` do webhook, não o nome. A causa está em [index.ts:179](../supabase/functions/meta-leads-webhook/index.ts#L179):

```ts
ad_name: (graphData.ad_name as string) ?? c.ad_id ?? null
```

O `??` cai para o `ad_id` porque `graphData.ad_name` volta indefinido — a Graph API não devolve `ad_name`, `campaign_name` nem `adset_name` no payload atual (verificado: nenhum dos 507 `lead_payload` contém essas chaves). É limitação de permissão do token: esses campos exigem `ads_read` sobre a conta de anúncios, além de `leads_retrieval`.

Caminho: consultar `/{ad_id}?fields=name,adset{name},campaign{name}` com token que tenha `ads_read`, e **cachear em tabela própria** (`meta_ad_dimension`) — o nome do anúncio é estável, não precisa de chamada por lead. Sem isso, a dimensão "campanha/anúncio" do briefing fica preenchida com IDs.

**18. Existem dados pessoais que exigem controle adicional?**

Sim. O escopo é LGPD-relevante e **aumenta** com este projeto:

- `meta_webhook_events.raw_payload` e `lead_payload` guardam nome, telefone, e-mail e respostas — **retenção infinita, sem política de expurgo**, visível a admin. Hoje 507 payloads.
- As respostas novas incluem **renda familiar e capacidade de entrada** — dado financeiro, categoria mais sensível que o CRM já tinha.
- A camada proposta cria um *perfil financeiro consolidado e persistente por pessoa*, que sobrevive ao descarte do lead — é o ponto em que "CRM" vira "base de perfilamento". Precisa de decisão explícita de retenção (§20).
- `deleted_rows` registra exclusões, mas apenas `table_name`/`row_id`/`deleted_at` — não há trilha de *quem* leu ou exportou.

Base legal para o tratamento: legítimo interesse comercial sobre dado fornecido voluntariamente em formulário, com finalidade declarada. A implementação deve permitir **expurgo por pessoa** (apagar perfil + submissões + sinais mantendo o lead), o que o desenho da §5 já viabiliza (tudo pendurado numa `person_id`).

### 1.2 Confirmação dos formulários

Verificado varrendo todos os `lead_payload` por `form_id` — **o levantamento da sua mensagem diverge do que o Meta está mandando** em quatro pontos:

**Porto Velas + Perguntas (2952185188465860)** — confirmado: **só 3 perguntas**. Não tem FGTS, não tem prazo.

| pergunta (chave crua) | valores observados |
|---|---|
| `você_busca_imóvel_para:` | `morar` |
| `qual_é_a_renda_familiar_aproximada?` | `r$_5_mil_a_r$_10_mil` |
| `qual_entrada_você_consegue_organizar_hoje?` | `mais_de_r$_30_mil` |

Com 1 lead real, as demais alternativas ainda não apareceram. **Não presumir FGTS nem prazo para este produto.**

**Rogga + Perguntas (2844383485917003)** — 5 perguntas, bate com o levantamento:

| pergunta | valores observados (n) |
|---|---|
| `qual_seu_objetivo_hoje?` | `comprar_para_morar` (10), `investir` (1) |
| `você_pretende_usar_fgts_na_compra?` | `não` (6), `sim` (4), **vazio (1)** |
| `hoje,_qual_faixa_de_entrada_você_consegue_organizar?` | `até_r$_10_mil` (8), `entre_r$_10_mil_e_r$_20_mil` (2), `acima_de_r$_20_mil` (1) |
| `quando_você_gostaria_de_avançar_na_compra?` | `nos_próximos_30_dias` (4), `estou_apenas_conhecendo_opções` (4), `em_3_a_6_meses` (2), `em_1_a_3_meses` (1) |
| `qual_é_a_renda_familiar_bruta?` | `até_r$_5_mil` (8), `de_r$_5_mil_-_r$_10_mil` (3) |

A opção "ainda preciso me planejar" (entrada) e "mais de R$ 10 mil" (renda) ainda não foram escolhidas. Um lead respondeu FGTS **em branco** (lead `831fc109`, Vanessa Lima) — prova de que campo obrigatório na Meta pode chegar vazio.

**San Pelegrino + Perguntas (2866501457059393)** — 6 perguntas:

| pergunta | valores observados (n) |
|---|---|
| `você_procura_imóvel_para:` | `morar_com_a_família` (5), `morar_sozinho(a)_/_casal` (2) |
| `qual_configuração_faz_mais_sentido_para_você?` | `3_dormitórios` (5), `2_dormitórios` (2) |
| `você_pretende_utilizar_fgts?` | `não` (4), `sim` (3) |
| `qual_faixa_de_entrada_consegue_organizar_hoje?` | `entre_r$_20_mil_e_r$_50_mil` (4), `ainda_preciso_me_planejar` (2), `acima_de_r$_50_mil` (1) |
| `qual_é_a_renda_familiar_aproximada?` | `r$_8_mil_a_r$_15_mil` (4), `até_r$_8_mil` (2), `r$_15_mil_a_r$_20_mil` (1) |
| `quando_pretende_avançar_na_compra?` | `nos_próximos_30_dias` (6), **`estou_só_conhecendo_opções`** (1) |

Três achados:

1. **A opção "até R$ 25 mil" não existe nos payloads.** As alternativas de entrada observadas são `até_?`(não visto), `entre_r$_20_mil_e_r$_50_mil`, `acima_de_r$_50_mil`, `ainda_preciso_me_planejar`. A sobreposição 20/25 que você descreveu **não se materializou** — ou a opção foi editada no Meta, ou o rótulo real é outro. **Precisa de conferência no gerenciador de formulários** antes de escrever qualquer regra. O tratamento seguro para sobreposição está na §6.3.
2. **`estou_só_conhecendo_opções`** aqui vs **`estou_apenas_conhecendo_opções`** no Rogga — mesmo conceito, rótulos diferentes. Prova de que mapear por texto do rótulo quebra.
3. Objetivo tem 3 vocabulários entre os 3 formulários (`comprar_para_morar` / `morar_com_a_família` / `morar`).

**Vocabulário histórico completo** (5 formulários antigos, para o backfill):

| form | pergunta | alternativas |
|---|---|---|
| Rogga (1512839613921544) | `qual_sua_renda_familiar?` | `r$_2.000_-_r$_5.000`, `r$_5.000_-_r$_10.000`, `mais_de_r$_10.000` |
| | `qual_sua_urgência_para_essa_compra?` | `não_quero_perder_essa_oportunidade`, `estou_sem_pressa,_até_o_final_do_ano`, `apenas_pesquisando` |
| | `você_quer_receber_nosso_contato...?` | `sim`, `não` |
| Rogga - Renda | `você_está_ciente_necessário_renda_bruta_familiar_de_r$_13.000_comprovada?` | `sim`, `não` |
| San Pelegrino (2015420939066147) | `qual_finalidade_da_compra?` | `moradia`, `investimento` |
| | `qual_sua_urgência_para_essa_compra?` | `o_quanto_antes`, `até_o_final_do_ano`, `apenas_pesquisando` |
| Porto Velas - 2 | `você_tem_disponbilidade_do_recurso_de_30_mil_de_ato_e_1.500_de_parcela?` | `sim`, `não` |
| | `você_tem_interesse_para_visitar_o_apartamento_decorado_e_a_maquete?` | `tenho_interesse_sim`, `não_tenho_interesse` |
| | `qual_sua_urgência_para_essa_compra?` | `quero_comprar!`, `apenas_pesquisando!` |
| Dotzero | `qual_seu_objetivo_com_studio?` | `morar`, `investir_para_alugar_(airbnb_/_locação)`, `investir_para_revender_na_valorização`, `ainda_estou_avaliando` |
| | `está_ciente_que_o_pagamento_começa_com_entrada_de_r$22_mil_+_parcelas_de_r$2.000/mês...` | `tenho_disponível_agora`, `estou_apenas_pesquisando` |

Três formatos de faixa de renda (`r$_2.000_-_r$_5.000`, `de_r$_5_mil_-_r$_10_mil`, `r$_8_mil_a_r$_15_mil`), três escalas de urgência incomparáveis, e perguntas de *ciência de condição* (Rogga-Renda, Dotzero, Porto Velas-2) que são um tipo semântico diferente: não medem capacidade, medem aceitação de uma condição específica. Na §6 elas viram o campo canônico `ciencia_condicao`, nunca renda.

**Nota:** os rótulos históricos embutem condições comerciais reais da época — R$ 13.000 de renda (Rogga), R$ 22 mil + R$ 2.000/mês (Dotzero), R$ 30 mil de ato + R$ 1.500 (Porto Velas). São **pistas**, não condições vigentes. Não usar como cadastro sem confirmação (§20).

---

## 2. Fluxo atual do lead — webhook até interface

```
Meta Lead Ads (formulário preenchido)
  │  POST /functions/v1/meta-leads-webhook  (campo "leadgen")
  ▼
Edge Function meta-leads-webhook  ── supabase/functions/meta-leads-webhook/index.ts
  │  1. lê rawBody, valida X-Hub-Signature-256 (HMAC timing-safe)  :12
  │  2. coleta TODOS os changes do lote                            :114
  │  3. INSERT meta_webhook_events (status='received')             :135
  │       └─ erro 23505 → retry da Meta, descarta                  :150
  │  4. GET graph.facebook.com/v23.0/{leadgen_id}                  :38
  │       fields=field_data,ad_name,campaign_name,adset_name,...
  │       └─ ad_name/campaign_name/adset_name NÃO retornam ⚠
  │  5. GET /{form_id}?fields=name → form_name                     :58
  │  6. UPDATE meta_webhook_events SET lead_payload, ad_name(=ad_id) :175
  │  7. SELECT rpc('process_meta_lead', {p_event_id})              :186
  ▼
process_meta_lead(uuid) ── SECURITY DEFINER, transação única
  │  extrai name / phone / email de field_data
  │  monta v_extra = "• pergunta: resposta\n..."   ← estrutura perdida aqui ⚠
  │  ┌─ dedup: telefone normalizado, lead NÃO descartado?
  │  │    SIM → lead_interactions('nota') + status='reentry' + RETURN  ← respostas só em texto ⚠
  │  └─ NÃO ↓
  │  round-robin: meta_form_routing.broker_ids → fallback lead_distribution
  │  contacts: busca por telefone ou cria
  │  sla_due_at = sla_deadline(now())
  │  INSERT leads (…, notes = "Meta Ads — …\n\nRespostas do formulário:\n" || v_extra)
  │                     ↑ form_answers NÃO está na lista de colunas ⚠
  │  INSERT lead_assignments (reason='campaign_routing'|'round_robin')
  │  INSERT lead_interactions ('nota': "Lead recebido via Meta Ads (…)")
  │  INSERT notifications ('lead_assigned')
  │  UPDATE meta_webhook_events SET status='processed', lead_id
  ▼
Realtime (publication supabase_realtime inclui leads + lead_interactions)
  ▼
useLeadsStore ── src/store/useLeadsStore.ts
  │  fetchAll → db.leads.fetchAll → select('*')  ← puxa notes de todos ⚠
  │  sync incremental por updated_at
  ▼
LeadKanban / LeadsPage / LeadModal
     LeadModal.tsx:891 → <p>{lead.notes}</p>   ← respostas como parágrafo de texto
     LeadsPage.tsx:233 → filtros client-side (stage, origin, broker, product)
     SlaBadge, LeadTimeline, NextStepSuggestion

Em paralelo, a cada minuto:
  cron recapture-leads-sla → recapture_overdue_leads()
     → sem 1º contato no prazo → passa para o próximo corretor do pool
       (lead_assignments 'sla_recapture' + interação + notificação)

Escritas do front (sem trigger de banco garantindo histórico):
  setStage()          → db.leads.upsert + lead_interactions('stage_change') .catch() ⚠
  advanceFollowup()   → idem
  discard(reason)     → db.leads.upsert + lead_interactions('discard')      .catch() ⚠
  restore()           → db.leads.upsert                     ← nenhum evento ⚠
  concludeSale()      → sales + leads.closed_at + interação('nota')
```

---

## 3. Lacunas e inconsistências

Ordenadas por impacto sobre o objetivo.

| # | Lacuna | Evidência | Consequência |
|---|---|---|---|
| **L1** | `process_meta_lead` não grava `form_answers` | função sem a coluna no INSERT; 17 leads de 01/08 com null | **Sem dado estruturado, nenhuma regra é possível.** Bloqueador absoluto. |
| **L2** | Não existe entidade de produto com condições comerciais | `properties` tem 0 `off_plan`; nenhum campo de renda/entrada | **Metade da equação de compatibilidade não existe.** Bloqueador. |
| **L3** | Vocabulário de resposta incompatível entre formulários | 3 formatos de renda, 3 escalas de urgência, 3 vocabulários de objetivo | Comparar leads de formulários diferentes é impossível sem dicionário. |
| **L4** | Reentrada perde a resposta estruturada | `process_meta_lead` grava só `lead_interactions('nota')` no ramo `reentry` | O 2º formulário — o sinal mais forte de temperatura — não vira dado. |
| **L5** | Identidade da pessoa não existe | dedup só entre não-descartados; 16 telefones com 2+ leads; 275 leads sem `contact_id`; 46 contatos com telefone duplicado | Histórico da pessoa fragmentado entre N leads. |
| **L6** | Histórico de etapa depende do front com `.catch()` silencioso | [useLeadsStore.ts:287](../src/store/useLeadsStore.ts#L287) | Eventos podem sumir → temperatura calculada sobre base incompleta. |
| **L7** | Reativação não gera evento | `restore()` não cria interação | Estado `reheating` sem gatilho. |
| **L8** | Leads de teste do Meta viram leads reais | 10 eventos `<test lead: …>` processados, leads deletados na mão | Poluição de base, round-robin consumido, métricas sujas. |
| **L9** | `campaign_name` / `adset_name` / `ad_name` não chegam | nenhum dos 507 payloads tem essas chaves | Dimensão campanha/anúncio inutilizável. |
| **L10** | Videochamada não existe como categoria | `TaskCategory` sem o valor | Sinal pedido no briefing não tem origem. |
| **L11** | `meta_form_routing.product_name` é texto livre e está nulo em 2 dos 3 formulários novos | tabela | Vínculo lead→produto frágil justamente nos formulários que importam. |
| **L12** | `fetchAll` usa `select('*')` | [db.ts:632](../src/lib/db.ts#L632) | Qualquer coluna nova pesada em `leads` entra no payload de toda carga — risco de repetir o incidente de egress de jul/2026. |
| **L13** | `meta_webhook_events.lead_id` é `ON DELETE SET NULL` | 11 `processed` órfãos | Rastreabilidade evento→lead se perde ao deletar lead. |
| **L14** | Score legado paralelo | [leadScore.ts](../src/lib/leadScore.ts) | Duas temperaturas com os mesmos rótulos e valores diferentes na tela. |
| **L15** | `leads.contact_id` sem FK; `LeadOrigin` TS sem `indicacao` | schema / [types/index.ts:262](../src/types/index.ts#L262) | Integridade e tipagem. |
| **L16** | `created_time` do Meta ignorado | payload tem, `leads` não guarda | Janelas temporais usam hora de recebimento, não de preenchimento. |
| **L17** | Payload com dado financeiro sem política de retenção | 507 payloads, sem expurgo | Exposição LGPD crescente. |

---

## 4. Modelo conceitual proposto

Cinco camadas, cada uma com uma responsabilidade única. A regra de ouro: **camadas de baixo nunca dependem de camadas de cima**, e tudo que é derivado pode ser jogado fora e recalculado a partir dos fatos.

```
┌─ CAMADA 5 — APRESENTAÇÃO ────────────────────────────────────────────┐
│  Aba "Inteligência" no LeadModal · badges no Kanban · filtros        │
│  Lê: v_lead_intelligence (view) — nunca calcula                     │
└──────────────────────────────────▲───────────────────────────────────┘
┌─ CAMADA 4 — CLASSIFICAÇÃO (derivada, descartável) ──────────────────┐
│  lead_product_fit   — pessoa × produto → compatível / ajuste / …    │
│  lead_temperature   — pessoa → new / hot / warm / cold / reheating  │
│  Ambas carregam rule_version + computed_at + reasons                │
└──────────────────────────────────▲───────────────────────────────────┘
┌─ CAMADA 3 — REGRAS (configuração versionada) ───────────────────────┐
│  classification_rules      — pesos, limiares, meia-vida (jsonb)     │
│  product_commercial_terms  — renda/entrada/FGTS/objetivo + validade │
│  meta_form_dictionary      — pergunta crua → campo canônico         │
│  meta_answer_dictionary    — resposta crua → valor + faixa [min,max)│
└──────────────────────────────────▲───────────────────────────────────┘
┌─ CAMADA 2 — PERFIL E SINAIS (derivada, descartável) ────────────────┐
│  lead_profile   — perfil ATUAL da pessoa (1 linha por pessoa)       │
│  lead_signals   — eventos comportamentais normalizados + dedup_key  │
└──────────────────────────────────▲───────────────────────────────────┘
┌─ CAMADA 1 — FATOS (imutável, nunca sobrescrito) ────────────────────┐
│  lead_person            — identidade da pessoa                      │
│  lead_form_submission   — 1 linha por preenchimento, com origem     │
│  meta_webhook_events    — payload bruto (já existe)                 │
│  leads / lead_interactions / tasks / sales  (já existem)            │
└──────────────────────────────────────────────────────────────────────┘
```

**Por que `lead_person` e não `contacts`.** `contacts` seria o candidato natural (já é deduplicado por telefone, já é vinculado pela RPC), mas: 275 leads não têm `contact_id`, 46 contatos têm telefone duplicado, e `contacts` tem RLS por `broker_id` com 12.559 linhas majoritariamente importadas de listas frias. Pendurar o perfil financeiro ali mistura dois universos. `lead_person` é uma tabela fina (id, telefone normalizado, e-mail normalizado, `contact_id` opcional) que **referencia** o contato sem depender dele — e permite fundir identidades sem mexer em `contacts`.

**Por que `lead_signals` em vez de calcular varrendo tudo.** Três razões: (a) `dedup_key UNIQUE` garante que rodar o backfill duas vezes não dobre a temperatura — requisito explícito do briefing; (b) permite aplicar teto por família de sinal sem re-derivar semântica de 5 tabelas; (c) torna a explicação auditável — cada motivo na tela aponta para uma linha.

**Fluxo de recálculo:**

```
fato novo (submissão, stage_change, tarefa concluída, descarte, mudança de condição comercial)
   │  trigger AFTER INSERT/UPDATE  → derive_signals()  → INSERT lead_signals (ON CONFLICT dedup_key DO NOTHING)
   │                                                   → INSERT intelligence_queue (person_id, motivo)
   ▼
cron a cada 1 min: process_intelligence_queue()
   │  para cada person_id na fila:
   │    1. rebuild_lead_profile(person_id)      ← lê lead_form_submission
   │    2. compute_temperature(person_id)       ← lê lead_signals + regra vigente
   │    3. compute_product_fit(person_id, *)    ← lê lead_profile × product_commercial_terms
   ▼
UPDATE lead_profile / lead_temperature / lead_product_fit  →  Realtime  →  UI
```

Cálculo **fora** do trigger. O webhook do Meta não pode ficar esperando classificação, e `recapture_overdue_leads` já disputa lock em `leads` a cada minuto.

---

## 5. Alterações de banco sugeridas

> Rascunhos de desenho. **Não executáveis, não aplicados.** Numeração a partir de 060 (última migração existente: 059).

### 5.1 Correção da fonte (bloqueador L1)

```sql
-- 060_meta_lead_capture_fix.sql  (RASCUNHO — NÃO EXECUTAR)
-- Substitui process_meta_lead. Muda mínima e cirúrgica: passa a gravar
-- a estrutura junto com o texto, e registra a submissão como fato.

-- (a) grava form_answers no INSERT de leads, com a MESMA normalização da 059
--     (lower + underscore→espaço) para não criar um segundo dialeto:
--
--   SELECT jsonb_object_agg(
--            lower(replace(f->>'name', '_', ' ')),
--            (SELECT jsonb_agg(replace(v,'_',' ')) FROM jsonb_array_elements_text(f->'values') v))
--     INTO v_answers
--     FROM jsonb_array_elements(v_field_data) f
--    WHERE f->>'name' NOT IN ('full_name','first_name','last_name',
--                             'phone_number','phone','whatsapp_number','email');
--
--   INSERT INTO leads (..., notes, form_answers, meta_created_time, ...)
--   VALUES            (..., v_notes, v_answers, v_created_time, ...);

-- (b) o ramo reentry passa a gravar submissão + form_answers do lead existente
--     (hoje só cria lead_interactions('nota') e perde a estrutura)

-- (c) descarta lead de teste da Meta ANTES do round-robin:
--     IF v_field_data::text LIKE '%<test lead: dummy data%' THEN
--       UPDATE meta_webhook_events SET status='test', processed_at=now() ...
--       RETURN NULL;   -- não consome rodízio, não notifica, não cria SLA
--     END IF;
--     → exige ampliar o CHECK de status para incluir 'test'

-- (d) guarda o created_time do Meta (hora real do preenchimento)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meta_created_time timestamptz;
```

### 5.2 Camada 1 — fatos

```sql
-- 061_lead_identity.sql  (RASCUNHO)
CREATE TABLE public.lead_person (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_norm    text NOT NULL,              -- normalize_phone_br + 9º dígito
  email_norm    text,                       -- lower(trim())
  contact_id    text,                       -- ponte opcional para contacts
  display_name  text,
  merged_into   uuid REFERENCES public.lead_person(id),  -- fusão sem perder id antigo
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON public.lead_person (phone_norm) WHERE merged_into IS NULL;
CREATE INDEX ON public.lead_person (email_norm) WHERE email_norm IS NOT NULL;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS person_id uuid
  REFERENCES public.lead_person(id);

-- 1 linha por preenchimento. NUNCA sobrescrita. É o histórico.
CREATE TABLE public.lead_form_submission (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id      uuid NOT NULL REFERENCES public.lead_person(id),
  lead_id        text REFERENCES public.leads(id) ON DELETE SET NULL,
  event_id       uuid REFERENCES public.meta_webhook_events(id) ON DELETE SET NULL,
  leadgen_id     text,                      -- chave estável da Meta
  form_id        text,
  form_name      text,
  product_id     uuid,                      -- resolvido via meta_form_routing
  ad_id          text,
  submitted_at   timestamptz NOT NULL,      -- created_time do Meta, NÃO received_at
  answers_raw    jsonb NOT NULL,            -- field_data como veio
  answers_norm   jsonb,                     -- {campo_canonico: {value, min, max, confidence}}
  source         text NOT NULL,             -- webhook | backfill_event | backfill_notes | manual
  confidence     smallint NOT NULL DEFAULT 100,  -- 100 payload · 80 form_answers · 60 notes
  dedup_key      text NOT NULL,             -- leadgen_id, ou hash(person+form+minuto) no backfill
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON public.lead_form_submission (dedup_key);
CREATE INDEX ON public.lead_form_submission (person_id, submitted_at DESC);
```

### 5.3 Camada 2 — perfil e sinais

```sql
-- 062_lead_profile_signals.sql  (RASCUNHO)
CREATE TABLE public.lead_profile (
  person_id            uuid PRIMARY KEY REFERENCES public.lead_person(id) ON DELETE CASCADE,
  objetivo             text,        -- morar | investir | ambos | indefinido
  composicao_moradia   text,        -- familia | casal_ou_sozinho | null
  tipologia            text[],      -- {'2d','3d'}
  renda_min            numeric,     -- limites da FAIXA declarada; nunca ponto único
  renda_max            numeric,     -- NULL = aberto ("mais de R$ 10 mil")
  entrada_min          numeric,
  entrada_max          numeric,
  entrada_indefinida   boolean,     -- "ainda preciso me planejar" ≠ ausência de resposta
  usa_fgts             boolean,
  prazo_compra         text,        -- ate_30d | 1_3m | 3_6m | pesquisando
  field_meta           jsonb NOT NULL DEFAULT '{}',  -- {campo:{submission_id,observed_at,confidence,form_id}}
  produtos_pesquisados text[],
  first_seen_at        timestamptz,
  last_seen_at         timestamptz,
  submission_count     integer NOT NULL DEFAULT 0,
  rebuilt_at           timestamptz NOT NULL DEFAULT now()
);

-- Eventos comportamentais normalizados. dedup_key impede dupla contagem no backfill.
CREATE TABLE public.lead_signal (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    uuid NOT NULL REFERENCES public.lead_person(id) ON DELETE CASCADE,
  lead_id      text,
  signal_type  text NOT NULL,   -- form_submitted | stage_advanced | stage_regressed |
                                -- visit_scheduled | visit_completed | call_scheduled |
                                -- call_completed | first_contact | discarded | restored |
                                -- new_product_interest | financial_improved | financial_worsened
  occurred_at  timestamptz NOT NULL,
  payload      jsonb,           -- {from,to,product_id,reason,delta,...}
  source_table text NOT NULL,
  source_id    text,
  dedup_key    text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON public.lead_signal (dedup_key);
CREATE INDEX ON public.lead_signal (person_id, occurred_at DESC);
CREATE INDEX ON public.lead_signal (signal_type, occurred_at DESC);
```

### 5.4 Camada 3 — regras e condições

```sql
-- 063_product_terms.sql  (RASCUNHO)
CREATE TABLE public.product (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text NOT NULL UNIQUE,   -- rogga | san_pelegrino | porto_velas | dotzero
  name           text NOT NULL,
  developer      text,
  city           text,
  neighborhood   text,
  property_id    text REFERENCES public.properties(id),  -- ponte opcional
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_form_routing ADD COLUMN IF NOT EXISTS product_id uuid
  REFERENCES public.product(id);

-- Condição comercial COM VALIDADE. Nunca sobrescrever: nova condição = nova linha.
CREATE TABLE public.product_commercial_terms (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id           uuid NOT NULL REFERENCES public.product(id) ON DELETE CASCADE,
  campaign_form_id     text,          -- NULL = regra padrão do produto;
                                      -- preenchido = override daquele formulário/campanha
  version              integer NOT NULL,
  valid_from           timestamptz NOT NULL,
  valid_to             timestamptz,   -- NULL = vigente
  renda_min            numeric,       -- obrigatório para classificar renda
  renda_ideal          numeric,
  entrada_min          numeric,
  entrada_ideal        numeric,
  fgts_policy          text NOT NULL DEFAULT 'not_applicable',
                                      -- required | relevant | not_applicable
  fgts_counts_as_entry boolean NOT NULL DEFAULT false,
  objetivos_aceitos    text[] NOT NULL DEFAULT '{morar,investir}',
  tipologias           text[],
  valor_min            numeric,
  valor_max            numeric,
  prazo_ideal          text[],        -- {'ate_30d','1_3m'}
  criterios_obrig      text[] NOT NULL DEFAULT '{}',   -- campos que reprovam se não atendidos
  criterios_desej      text[] NOT NULL DEFAULT '{}',   -- campos que só pontuam
  notes                text,
  created_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON public.product_commercial_terms
  (product_id, coalesce(campaign_form_id,''), version);
-- Impede duas condições vigentes simultâneas para o mesmo escopo:
-- EXCLUDE USING gist (product_id WITH =, coalesce(campaign_form_id,'') WITH =,
--                     tstzrange(valid_from, valid_to) WITH &&)   [requires btree_gist]

-- Regras de classificação versionadas (pesos, limiares, meia-vida)
CREATE TABLE public.classification_rules (
  version     integer PRIMARY KEY,
  kind        text NOT NULL,    -- temperature | fit
  params      jsonb NOT NULL,
  active      boolean NOT NULL DEFAULT false,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON public.classification_rules (kind) WHERE active;
```

### 5.5 Camada 4 — resultados

```sql
-- 064_classification_results.sql  (RASCUNHO)
CREATE TABLE public.lead_temperature (
  person_id      uuid PRIMARY KEY REFERENCES public.lead_person(id) ON DELETE CASCADE,
  state          text NOT NULL,   -- new | hot | warm | cold | reheating
  score          numeric NOT NULL,
  reasons        jsonb NOT NULL,  -- [{signal,label,points,occurred_at}]
  last_signal_at timestamptz,
  rule_version   integer NOT NULL REFERENCES public.classification_rules(version),
  computed_at    timestamptz NOT NULL DEFAULT now(),
  next_decay_at  timestamptz      -- quando o decaimento muda o estado sem evento novo
);

CREATE TABLE public.lead_product_fit (
  person_id      uuid NOT NULL REFERENCES public.lead_person(id) ON DELETE CASCADE,
  product_id     uuid NOT NULL REFERENCES public.product(id) ON DELETE CASCADE,
  status         text NOT NULL,   -- compatible | compatible_with_adjustment |
                                  -- currently_incompatible | insufficient_data
  score          numeric,
  reasons        jsonb NOT NULL,  -- [{criterio,resultado,esperado,observado}]
  missing_fields text[] NOT NULL DEFAULT '{}',
  blocking_field text,            -- a "trava" — o que impede hoje
  terms_id       uuid REFERENCES public.product_commercial_terms(id),
  rule_version   integer NOT NULL,
  computed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, product_id)
);

CREATE TABLE public.intelligence_queue (
  person_id   uuid PRIMARY KEY REFERENCES public.lead_person(id) ON DELETE CASCADE,
  reason      text NOT NULL,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  attempts    smallint NOT NULL DEFAULT 0,
  last_error  text
);
```

**Colunas escalares em `leads` — o mínimo indispensável (por causa de L12).** O front carrega leads com `select('*')`. Nenhum `jsonb` de inteligência pode morar em `leads`. Apenas três colunas leves, para badge e filtro:

```sql
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS temperature_state text,   -- espelho de lead_temperature.state
  ADD COLUMN IF NOT EXISTS fit_status        text,   -- fit com o produto de ORIGEM
  ADD COLUMN IF NOT EXISTS intelligence_at   timestamptz;
```

Tudo mais (reasons, perfil, histórico) vem por consulta sob demanda ao abrir o lead.

### 5.6 RLS das tabelas novas

Padrão: o corretor enxerga a inteligência de uma pessoa se for dono de **algum** lead dela; admin vê tudo.

```sql
-- CREATE POLICY lead_profile_select ON public.lead_profile FOR SELECT USING (
--   is_admin() OR EXISTS (
--     SELECT 1 FROM public.leads l
--      WHERE l.person_id = lead_profile.person_id AND l.broker_id = auth.uid()));
-- Idem lead_signal, lead_temperature, lead_product_fit, lead_form_submission.
-- product / product_commercial_terms: SELECT para autenticado, WRITE só is_admin().
-- Funções de cálculo: SECURITY DEFINER (senão o corretor não enxerga o histórico
-- da pessoa que passou por outro corretor via round-robin / recaptura de SLA).
```

---

## 6. Normalização de perguntas e respostas

### 6.1 Campos canônicos

Nove campos cobrem os 8 formulários existentes:

| campo | tipo | observações |
|---|---|---|
| `objetivo` | enum | `morar` · `investir` · `ambos` · `indefinido` |
| `composicao_moradia` | enum | `familia` · `casal_ou_sozinho` — só quando o formulário pergunta |
| `tipologia` | enum[] | `2d` · `3d` · `studio` |
| `renda_familiar` | faixa | `[min, max)` em R$; `max NULL` = aberto |
| `entrada_disponivel` | faixa | idem; `indefinida=true` para "ainda preciso me planejar" |
| `usa_fgts` | bool | `NULL` quando não perguntado **ou** respondido em branco |
| `prazo_compra` | enum | `ate_30d` · `1_3m` · `3_6m` · `pesquisando` |
| `ciencia_condicao` | bool + rótulo | perguntas do tipo "está ciente que…" — **nunca vira renda ou entrada** |
| `interesse_visita` | bool | Porto Velas - 2 |

### 6.2 Dicionário dirigido por dados, não por código

```sql
CREATE TABLE public.meta_form_dictionary (
  form_id        text NOT NULL,
  question_raw   text NOT NULL,      -- chave EXATA do field_data, com underscores
  canonical_field text NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  PRIMARY KEY (form_id, question_raw)
);

CREATE TABLE public.meta_answer_dictionary (
  form_id         text NOT NULL,
  canonical_field text NOT NULL,
  answer_raw      text NOT NULL,     -- valor EXATO do payload, com underscores
  canonical_value text,              -- para enums
  value_min       numeric,           -- para faixas
  value_max       numeric,           -- NULL = aberto à direita
  is_undefined    boolean NOT NULL DEFAULT false,  -- "ainda preciso me planejar"
  confidence      smallint NOT NULL DEFAULT 100,
  PRIMARY KEY (form_id, canonical_field, answer_raw)
);
```

Chaveado por `form_id` de propósito: `estou_só_conhecendo_opções` (San Pelegrino) e `estou_apenas_conhecendo_opções` (Rogga) mapeiam para o mesmo `pesquisando` sem que nenhum dos dois vire regra global frágil. Editar um rótulo no gerenciador do Meta gera uma linha nova no dicionário, não quebra código.

**Resposta desconhecida nunca é silenciosa:** um valor sem linha no dicionário grava `canonical_value = NULL` + alerta em `intelligence_audit` (§17). O campo fica `insufficient_data`, não vira zero.

### 6.3 Faixas e o problema da sobreposição

Toda faixa vira **intervalo semiaberto `[min, max)`**, nunca ponto. Isso resolve a incerteza sem inventar valor:

| formulário | resposta crua | min | max |
|---|---|---|---|
| Rogga+P | `até_r$_10_mil` | 0 | 10.000 |
| Rogga+P | `entre_r$_10_mil_e_r$_20_mil` | 10.000 | 20.000 |
| Rogga+P | `acima_de_r$_20_mil` | 20.000 | **NULL** |
| Rogga+P | `ainda_preciso_me_planejar` | NULL | NULL + `is_undefined` |
| SanPel+P | `entre_r$_20_mil_e_r$_50_mil` | 20.000 | 50.000 |
| SanPel+P | `acima_de_r$_50_mil` | 50.000 | NULL |
| PortoVelas+P | `mais_de_r$_30_mil` | 30.000 | NULL |
| Rogga (antigo) | `r$_2.000_-_r$_5.000` | 2.000 | 5.000 |

**Sobreposição** (o caso "até R$ 25 mil" × "entre R$ 20 mil e R$ 50 mil", se confirmado no Meta): as duas opções continuam sendo linhas independentes com seus próprios intervalos — `[0, 25.000)` e `[20.000, 50.000)`. Não se tenta desambiguar. A comparação com a condição do produto usa três resultados:

- **atende com certeza** — `min do lead ≥ mínimo exigido` (todo o intervalo está acima da régua);
- **não atende com certeza** — `max do lead ≤ mínimo exigido` (todo o intervalo está abaixo);
- **indeterminado** — o intervalo cruza a régua → status `compatible_with_adjustment` com motivo explícito *"faixa declarada cruza o mínimo exigido — confirmar valor exato com o cliente"*.

Um lead que respondeu "até R$ 25 mil" para um produto que exige R$ 20 mil de entrada cai em **indeterminado**, e a tela diz exatamente isso. Nunca vira "compatível" nem "incompatível" por chute.

### 6.4 Ausência ≠ negativa

Três estados distintos, jamais colapsados:

| situação | representação | efeito |
|---|---|---|
| formulário não perguntou | campo ausente de `answers_norm` | `missing_fields`, não penaliza |
| perguntou e veio vazio | `{value:null, asked:true}` | `missing_fields`, não penaliza |
| respondeu "ainda preciso me planejar" | `is_undefined = true` | sinal fraco de baixa prontidão — **não** de baixa renda |

Porto Velas não pergunta FGTS: leads desse formulário têm `usa_fgts = NULL` e a regra de FGTS simplesmente **não se aplica** — não conta como "não usa FGTS".

---

## 7. Identidade e deduplicação

### 7.1 Chave principal

`phone_norm` = `normalize_phone_br(phone)` **+ tratamento do nono dígito**, que a função atual não faz:

```
entrada           dígitos        hoje            proposto
+55 47 99680-9242 → 5547996809242 → 47996809242  → 47996809242
(47) 9 9680-9242  → 47996809242   → 47996809242  → 47996809242
(47) 9680-9242    → 4796809242    → 4796809242   → 47996809242   ← corrigido
```

Regra: para celular (DDD + 8 dígitos começando em 6-9), insere o `9`. Fixo (8 dígitos começando em 2-5) fica como está. **Não alterar `normalize_phone_br`** — ela é `IMMUTABLE` e usada em índices e na dedup em produção. Criar `normalize_phone_br_v2` e migrar por etapas.

`email_norm` = `lower(trim(email))` como **chave secundária**: nunca cria vínculo sozinha, mas se dois `phone_norm` diferentes compartilham e-mail, gera **sugestão de fusão** para revisão do admin — não fusão automática (e-mail compartilhado entre cônjuges é comum no mercado imobiliário).

### 7.2 Resolução na entrada

```
nova submissão
  ├─ phone_norm existe em lead_person (merged_into IS NULL)?
  │   SIM → person_id encontrado
  │   NÃO → email_norm bate com exatamente 1 pessoa?
  │           SIM → usa, marca match_source='email' para revisão
  │           NÃO → cria lead_person novo
  ▼
já existe submissão com mesmo (person_id, form_id) em < 10 min?
  SIM → duplicidade técnica: grava a submissão (fato preservado)
        mas NÃO gera sinal de temperatura     ← evita inflar
  NÃO → grava submissão + sinal form_submitted
  ▼
existe lead ATIVO (discard_reason IS NULL) para essa pessoa?
  SIM → reentrada: vincula ao lead existente, atualiza perfil,
        gera sinal de peso maior se o dia for diferente
  NÃO → cria lead novo (round-robin como hoje), person_id preenchido
```

Isso preserva o comportamento atual de negócio (lead descartado que volta vira lead novo — memória `project_meta_ads_regras`) e ao mesmo tempo mantém o histórico ligado à mesma pessoa.

### 7.3 Fusão

`merged_into` aponta para a identidade sobrevivente. Nenhuma linha é apagada: `lead_form_submission`, `lead_signal` e `leads` são repontados por UPDATE, e a pessoa antiga permanece como redirect. Reversível.

---

## 8. Perfil atual e histórico do lead

**Histórico** = `lead_form_submission` (append-only, imutável).
**Perfil atual** = `lead_profile`, sempre **reconstruído do zero** a partir do histórico — nunca editado incrementalmente. Se a regra mudar, dropa e reconstrói.

### 8.1 Regra de consolidação, campo a campo

Para cada campo canônico, entre todas as submissões da pessoa:

1. descarta submissões com `confidence < 60`;
2. descarta valores `NULL` (ausência não compete);
3. ordena por `submitted_at DESC`, empate resolvido por `confidence DESC`;
4. vence a primeira — **a resposta válida mais recente**, por campo, não por submissão.

Consequência desejada: se o lead respondeu renda em janeiro e só objetivo em março, o perfil tem renda de janeiro **e** objetivo de março. A procedência de cada campo fica em `field_meta`:

```json
{
  "renda_familiar":     {"submission_id":"a1b2…","observed_at":"2026-07-09T14:22:00Z","confidence":100,"form_id":"1512839613921544"},
  "entrada_disponivel": {"submission_id":"c3d4…","observed_at":"2026-08-01T18:32:03Z","confidence":100,"form_id":"2866501457059393"}
}
```

### 8.2 Mudança entre respostas

Quando um campo numérico muda entre submissões, além de atualizar o perfil, gera sinal:

- `financial_improved` — faixa de renda ou entrada sobe (`min` novo > `min` anterior);
- `financial_worsened` — desce;
- `intent_accelerated` — prazo encurta (`3_6m` → `ate_30d`);
- `new_product_interest` — formulário de produto ainda não pesquisado.

São os sinais mais valiosos da camada: um lead que voltou dizendo que a entrada subiu de "até R$ 10 mil" para "acima de R$ 20 mil" é o caso de reativação mais óbvio do funil, e hoje **isso é invisível** — a segunda resposta nem é gravada.

### 8.3 Exemplo com dados reais do banco

Lead `13d43186` (Ingrid Almeida, San Pelegrino + Perguntas, 01/08 18:32):

```
lead_form_submission
  submitted_at 2026-08-01T18:32:03Z  ·  source webhook  ·  confidence 100
  answers_norm {
    objetivo:            {value:"morar"},
    composicao_moradia:  {value:"casal_ou_sozinho"},
    tipologia:           {value:["2d"]},
    usa_fgts:            {value:true},
    entrada_disponivel:  {min:20000, max:50000},
    renda_familiar:      {min:8000,  max:15000},
    prazo_compra:        {value:"ate_30d"}
  }

lead_profile  (única submissão → perfil = submissão)
  objetivo morar · composicao casal_ou_sozinho · tipologia {2d} · fgts true
  renda [8.000, 15.000) · entrada [20.000, 50.000) · prazo ate_30d
  produtos_pesquisados {san_pelegrino} · submission_count 1
```

Hoje esse mesmo lead tem `form_answers = NULL` e as respostas existem apenas como parágrafo em `notes`.

---

## 9. Condições comerciais de produto e campanha

### 9.1 Hierarquia de resolução

```
1. product_commercial_terms WHERE product_id = P
                              AND campaign_form_id = <form do lead>
                              AND valid_from <= data_entrada
                              AND (valid_to IS NULL OR valid_to > data_entrada)
   → override da campanha (unidade promocional, entrada reduzida, fluxo especial)
2. … AND campaign_form_id IS NULL  (mesma janela de validade)
   → condição padrão do produto
3. nenhuma linha → status insufficient_data, motivo "produto sem condição cadastrada"
```

**A data que manda é a de entrada do lead** (`lead_form_submission.submitted_at`), não `now()`. Um lead que entrou em junho é avaliado pela tabela de junho — senão a mudança de tabela reescreve o passado e o histórico deixa de ser comparável.

O override é **por campo**: a campanha sobrescreve `entrada_min` e mantém `renda_min` do produto se não declarar. `COALESCE(campanha.campo, produto.campo)`.

### 9.2 Nenhuma condição existe hoje

**Nenhum dos 4 produtos tem condição comercial cadastrada em lugar nenhum do sistema.** O que existe são `product_ticket` (530k Rogga, 600k/570k San Pelegrino, 650k Porto Velas, 440k Dotzero) — preço, não critério.

Pistas encontradas nos rótulos históricos dos formulários, **para conferência, não para uso**:

| produto | pista (rótulo do formulário) | período |
|---|---|---|
| Rogga | "renda bruta familiar de R$ 13.000 comprovada" | form `Rogga - Renda`, jun/2026 |
| Dotzero | "entrada de R$ 22 mil + parcelas de R$ 2.000/mês" | jun-jul/2026 |
| Porto Velas | "R$ 30 mil de ato e R$ 1.500 de parcela" | form `Porto Velas - 2`, jul/2026 |
| San Pelegrino | — nenhuma pista | — |

Note a contradição: o formulário Rogga atual oferece "renda até R$ 5 mil" como alternativa, enquanto o formulário de junho falava em R$ 13.000 de renda comprovada. **Sem confirmação do negócio, qualquer regra de compatibilidade para Rogga é chute.** Item 1 da §20.

### 9.3 Rascunho de cadastro (valores fictícios — não usar)

```sql
-- ILUSTRAÇÃO DE ESTRUTURA. Os números são placeholders.
-- INSERT INTO product_commercial_terms
--   (product_id, campaign_form_id, version, valid_from,
--    renda_min, renda_ideal, entrada_min, entrada_ideal,
--    fgts_policy, fgts_counts_as_entry, objetivos_aceitos, tipologias,
--    valor_min, valor_max, prazo_ideal, criterios_obrig, criterios_desej)
-- VALUES
--   (:san_pelegrino, NULL, 1, '2026-08-01',
--    <A DEFINIR>, <A DEFINIR>, <A DEFINIR>, <A DEFINIR>,
--    'relevant', true, '{morar,investir}', '{2d,3d}',
--    570000, 600000, '{ate_30d,1_3m}',
--    '{renda_familiar}', '{entrada_disponivel,usa_fgts,prazo_compra}');
```

---

## 10. Regras iniciais de compatibilidade

### 10.1 Algoritmo

Para cada `(pessoa, produto)` com condição vigente:

```
1. resolve terms (produto → override da campanha → validade na data de entrada)
2. para cada critério de terms.criterios_obrig:
     campo ausente no perfil       → MISSING
     faixa toda acima da régua     → PASS
     faixa toda abaixo             → FAIL
     faixa cruza a régua           → INDETERMINATE
3. veredito:
     algum FAIL                              → currently_incompatible
     nenhum FAIL e algum INDETERMINATE       → compatible_with_adjustment
     ≥ metade dos obrigatórios MISSING       → insufficient_data
     todos PASS                              → compatible
4. score 0-100 = obrigatórios (peso 70) + desejáveis (peso 30), só informativo
5. blocking_field = o primeiro critério FAIL — é a "trava" exibida na tela
6. grava reasons com {criterio, resultado, esperado, observado}
```

Regras auxiliares:

- **FGTS como entrada.** Se `fgts_counts_as_entry = true` e `usa_fgts = true`, o lead ganha o benefício da dúvida na entrada: `INDETERMINATE` em vez de `FAIL`, com motivo *"pode compor entrada com FGTS — confirmar saldo"*. Nunca somar valor estimado de FGTS: o saldo não é conhecido.
- **Objetivo.** `objetivo` fora de `objetivos_aceitos` é `FAIL` sempre, mesmo com renda alta — investidor em produto exclusivo para moradia é incompatível de fato.
- **Prazo nunca reprova.** Entra só como desejável e como sinal de temperatura. Prazo longo com renda compatível é lead de nutrição, não incompatível.
- **`entrada_indefinida`** ("ainda preciso me planejar") = `INDETERMINATE`, jamais `FAIL`.

### 10.2 Exemplos com leads reais

> As condições dos produtos são **hipotéticas**. Servem só para mostrar a mecânica.

**Lead `13d43186` (Ingrid) × San Pelegrino** — renda `[8k,15k)`, entrada `[20k,50k)`, FGTS sim, prazo 30d, 2 dorm, morar:

| critério | exigido (hipótese) | observado | resultado |
|---|---|---|---|
| renda_familiar | ≥ 8.000 | [8.000, 15.000) | **PASS** — faixa inteira ≥ régua |
| entrada_disponivel | ≥ 20.000 | [20.000, 50.000) | **PASS** |
| objetivo | morar ou investir | morar | PASS |
| tipologia | 2d ou 3d | 2d | PASS |
| prazo (desejável) | ate_30d, 1_3m | ate_30d | PASS |

→ `compatible`, score alto.

**Lead `cc12152b` (Eliza, Rogga+P)** — objetivo morar, FGTS sim, entrada `[0,10k)`, prazo 30d, renda `[5k,10k)`:

| critério | exigido (hipótese) | observado | resultado |
|---|---|---|---|
| renda_familiar | ≥ 8.000 | [5.000, 10.000) | **INDETERMINATE** — cruza a régua |
| entrada_disponivel | ≥ 20.000 | [0, 10.000) | **FAIL** — teto abaixo do mínimo |

→ `currently_incompatible` **para San Pelegrino**, `blocking_field = entrada_disponivel`.
Com FGTS = sim e `fgts_counts_as_entry = true` no Rogga, o mesmo lead pode ser `compatible_with_adjustment` **para Rogga** — que é justamente o produto de origem dela. É o comportamento pedido: classificação por par pessoa×produto, não global.

**Lead `831fc109` (Vanessa, Rogga+P)** — FGTS **em branco**, entrada `[0,10k)`, renda `[5k,10k)`, prazo `pesquisando`:

→ `usa_fgts` entra em `missing_fields`. Se FGTS for critério obrigatório do produto, e for o único MISSING junto de um INDETERMINATE de renda → `compatible_with_adjustment` com *"falta confirmar FGTS"*. **Nunca `currently_incompatible` por causa de campo em branco.**

**Lead de Porto Velas** — o formulário não pergunta FGTS nem prazo. Se Porto Velas exigir FGTS como obrigatório, **todo lead do formulário cai em `insufficient_data`** — o que é correto e revela um problema de captação, não de lead. A tela deve dizer *"o formulário de origem não coleta FGTS"* e sugerir descobrir só esse dado.

---

## 11. Regras iniciais de temperatura e decaimento

### 11.1 Forma do cálculo

```
score(t) = Σ  peso(sinal) × 0.5^((t - occurred_at) / meia_vida(sinal))
       aplicando teto por família de sinal
```

Decaimento exponencial em vez de janela fixa: um sinal de 6 dias vale mais que um de 27, e a temperatura cai sozinha sem evento novo — atende ao requisito de decaimento por inatividade sem cron pesado (basta recalcular quem passou de `next_decay_at`).

### 11.2 Pesos iniciais (versão 1, para calibrar)

| sinal | peso | meia-vida | teto da família |
|---|---|---|---|
| `form_submitted` (1º) | 20 | 21 d | — |
| `form_submitted` (reentrada, **outro dia**) | 35 | 21 d | máx. 3 contando |
| `form_submitted` (< 10 min do anterior) | **0** | — | duplicidade técnica |
| `new_product_interest` | 15 | 30 d | máx. 2 produtos |
| `financial_improved` | 25 | 45 d | — |
| `intent_accelerated` | 20 | 30 d | — |
| `first_contact` | 10 | 14 d | — |
| `stage_advanced` (avanço real) | 25 | 30 d | máx. 4 |
| `stage_regressed` (para follow-up) | −10 | 30 d | — |
| `visit_scheduled` | 30 | 30 d | — |
| `visit_completed` | 60 | 60 d | — |
| `call_scheduled` | 20 | 21 d | — |
| `call_completed` | 40 | 45 d | — |
| `restored` (reativação) | 15 | 21 d | — |
| `discarded` (motivo duro¹) | −40 | 90 d | — |
| `discarded` (motivo brando²) | −15 | 45 d | — |
| `financial_worsened` | −20 | 45 d | — |

¹ `telefone_invalido`, `comprou_outro`, `desistiu_de_comprar`, `fora_de_nicho`
² `nunca_respondeu`, `parou_de_responder`, `sem_condicao`, `sem_interesse`

`sem_condicao` é brando de propósito: é a incompatibilidade que a §10 já captura como `currently_incompatible`. Penalizar duas vezes esconde o lead que fica compatível quando a tabela muda.

### 11.3 Estados

| estado | condição |
|---|---|
| `new` | < 48 h da 1ª submissão e nenhum sinal além dela |
| `hot` | score ≥ 70 |
| `warm` | 35 ≤ score < 70 |
| `cold` | score < 35 |
| `reheating` | sinal positivo nos últimos 7 dias **e** hiato ≥ 30 dias antes dele |

`reheating` tem precedência sobre `warm`/`cold` — é um estado de *transição*, o mais acionável do conjunto.

### 11.4 Proteções contra inflação

Cinco travas, todas exigidas pelo briefing:

1. **Teto por família.** Três submissões contam; a quarta não move o score. Impede que um lead ansioso preencha 8 vezes e vire "quente" sem falar com ninguém.
2. **Janela de duplicidade técnica.** Submissões do mesmo formulário em < 10 min: gravadas como fato, peso zero. Verificado no banco: 11 telefones com múltiplos eventos — precisa medir o intervalo real antes de fixar os 10 min.
3. **Avanço real.** `stage_advanced` só quando `posição(to_stage) > posição(from_stage)` na ordem canônica do CHECK. Movimento lateral ou para trás nunca é avanço.
4. **Correção manual.** Se `A→B` e depois `B→A` pelo mesmo `broker_id` em < 15 min, **ambos os sinais são anulados** (`payload.voided = true`), não invertidos. Nenhum clique extra para o corretor. Dos 608 `stage_change`, 41 são retrocessos — a medição de quantos são correção contra retorno real deve ser feita antes de fixar os 15 min.
5. **Realizado > agendado.** `visit_completed` (60) contra `visit_scheduled` (30); só o maior conta quando ambos existem para a mesma tarefa. Agendar e não comparecer não sustenta temperatura.

### 11.5 Decaimento sem evento novo

`next_decay_at` guarda o instante em que o score cruza o próximo limiar. O cron acorda apenas quem venceu — não varre a base:

```sql
-- SELECT person_id FROM lead_temperature
--  WHERE next_decay_at <= now() LIMIT 500;
```

---

## 12. Matriz de prioridade comercial

`prioridade = f(fit, temperatura)`, materializada em `lead_product_fit` + `lead_temperature` e exposta como faixa P1-P5.

| fit \ temp | hot / reheating | warm | cold |
|---|---|---|---|
| **compatible** | **P1** — atacar hoje | **P2** — cadência ativa | **P3** — reativar com o produto |
| **compatible_with_adjustment** | **P1** — consultivo + simulação | **P3** — nutrir pela trava | **P4** — nutrição de longo prazo pela trava |
| **insufficient_data** | **P2** — descobrir só o campo faltante | **P4** — enriquecer no próximo toque | **P5** — nutrição leve |
| **currently_incompatible** | **P2** — realocar para produto alternativo | **P4** — nutrição | **P5** — base fria |

Regra de realocação: quando `currently_incompatible` e temperatura `hot`/`reheating`, o sistema busca em `lead_product_fit` o melhor `status` entre os **outros** produtos e exibe *"incompatível com X hoje — compatível com Y"*. É o cruzamento que o briefing pede, e sai de graça porque o fit é calculado por par.

### Formato da explicação na tela

```
Temperatura: quente (78)                     regra v1 · calculado há 4 min
  +35  2º formulário em 14 dias        01/08
  +25  renda declarada subiu           01/08
  +15  pesquisou 2 empreendimentos     28/07
  +10  1º contato registrado           28/07
  − 7  decaimento (7 dias)

Porto Velas — compatível                     condição v2, vigente desde 15/07
  ✓ renda [8k,15k) ≥ mínimo 8k
  ✓ entrada [20k,50k) ≥ mínimo 20k
  ✓ objetivo "morar" aceito
  ! prazo não coletado neste formulário

San Pelegrino — incompatível hoje
  ✗ entrada [0,10k) abaixo do mínimo 20k     ← trava
  ✓ renda compatível
  → alternativa: Rogga (compatível com ajuste)
```

Nenhuma nota sem justificativa: `reasons` é `NOT NULL` nas duas tabelas.

---

## 13. Eventos que provocam recálculo

| # | Evento | Origem | Gatilho | Recalcula |
|---|---|---|---|---|
| 1 | Nova submissão | `process_meta_lead` | dentro da RPC | perfil + temp + fit (todos os produtos) |
| 2 | Reentrada da mesma pessoa | idem, ramo `reentry` | idem | perfil + temp + fit |
| 3 | Mudança de resposta | derivada da submissão | idem | perfil + temp + fit |
| 4 | Mudança de etapa | `lead_interactions` `stage_change` | **trigger AFTER INSERT** | temp |
| 5 | Retorno a follow-up | idem (`to_stage='followup'`) | idem | temp |
| 6 | Descarte | `leads.discard_reason` IS NULL → NOT NULL | **trigger AFTER UPDATE** | temp |
| 7 | Reativação | `discard_reason` NOT NULL → NULL | idem | temp |
| 8 | Visita agendada | `tasks` INSERT `category='visita'` | trigger | temp |
| 9 | Visita concluída | `tasks.status` → `done` | trigger | temp |
| 10 | Videochamada agendada/concluída | idem, categoria nova | trigger | temp |
| 11 | 1º contato | `handle_first_contact` já existe | estender trigger | temp |
| 12 | Condição comercial alterada | `product_commercial_terms` INSERT/UPDATE | trigger | fit de **todas** as pessoas do produto (lote) |
| 13 | Regra alterada | `classification_rules.active` muda | trigger | base inteira (lote, fora de pico) |
| 14 | Passagem de tempo | `next_decay_at <= now()` | cron 5 min | temp |
| 15 | Transferência de corretor | `transfer_lead` / `recapture_overdue_leads` | — | **nada** — troca de dono não é sinal comercial |

Os eventos 4-11 **dependem de eventos que hoje nascem no front com `.catch()` silencioso**. Ancorar os triggers em `lead_interactions` (que já é gravado) funciona para 4, 5 e 11; para 6, 7 e 8-10 os triggers vão em `leads` e `tasks`, que são escritos pelo `upsert` do front — esses disparam de forma confiável porque observam o *estado*, não o evento.

**Fila, não cálculo inline.** Todo gatilho só faz `INSERT INTO intelligence_queue (person_id, reason) ON CONFLICT (person_id) DO UPDATE SET reason = …`. Um cron de 1 minuto drena. Assim: (a) o webhook não espera; (b) 20 eventos da mesma pessoa em 1 minuto = 1 cálculo; (c) falha de cálculo nunca derruba a escrita do fato — princípio de que o banco é fonte de verdade, mas a inteligência é derivada e pode ser refeita.

---

## 14. Interface e filtros

### 14.1 Onde aparece

**No card do Kanban** ([LeadKanban.tsx](../src/modules/leads/LeadKanban.tsx)) — o mínimo, sem poluir: um ponto colorido de temperatura + um chip de fit **só quando** for `currently_incompatible` ou `compatible_with_adjustment`. Lead compatível e morno não ganha ruído visual. Lê de `leads.temperature_state` / `leads.fit_status` (as duas colunas escalares), sem query extra.

**No LeadModal** — nova aba **"Inteligência"**, ao lado do que já existe. Carregada **sob demanda** ao abrir a aba (uma RPC, `get_lead_intelligence(person_id)`), nunca no `fetchAll`. Blocos:

1. **Perfil atual** — cada campo com valor, data e formulário de origem; campos faltantes em cinza com "não coletado";
2. **Temperatura** — estado, score, lista de motivos com data, versão da regra, "calculado há X";
3. **Compatibilidade** — cartão do produto de origem em destaque + demais produtos recolhidos; critérios com ✓/✗/! e a trava destacada;
4. **Histórico de formulários** — timeline de submissões com produto, data e o que **mudou** em relação à anterior;
5. **Sinais recentes** — últimos 10 de `lead_signal`, legíveis.

**Onde não vai:** nada disso entra no `LeadForm`. O corretor não preenche inteligência — requisito explícito. O único campo que ele já preenche e que alimenta o sistema é o **motivo de descarte**, que já existe no fluxo atual.

### 14.2 Filtros

Os filtros de hoje são client-side sobre o array inteiro ([LeadsPage.tsx:233](../src/modules/leads/LeadsPage.tsx#L233)). Dois níveis:

**Nível 1 — client-side, de graça** (usam as colunas escalares já carregadas): temperatura, fit do produto de origem.

**Nível 2 — server-side via RPC** `search_leads_intelligence(filtros jsonb)`, retornando só IDs para o store filtrar. Necessário porque estes filtros dependem de tabelas que o front não carrega:

| filtro pedido | fonte |
|---|---|
| quentes e compatíveis com Porto Velas | `lead_product_fit` + `lead_temperature` |
| renda acima de X | `lead_profile.renda_min` |
| entrada acima de X | `lead_profile.entrada_min` |
| com FGTS | `lead_profile.usa_fgts` |
| quentes incompatíveis com o produto de origem | fit do produto de origem + temp |
| 2+ formulários em 30 dias | `lead_form_submission` |
| 2+ empreendimentos pesquisados | `lead_profile.produtos_pesquisados` |
| em reaquecimento | `lead_temperature.state='reheating'` |
| compatíveis sem avanço recente | fit + ausência de `stage_advanced` em N dias |
| melhora de renda ou entrada | `lead_signal.signal_type='financial_improved'` |
| dados insuficientes | `fit_status='insufficient_data'` |

**Listas salvas** (fase posterior): as combinações acima viram presets nomeados — "Reativação Porto Velas", "Quentes sem produto" — reaproveitando o padrão de `lead_lists`.

### 14.3 Tipos a estender

```ts
// src/types/index.ts
export type TemperatureState = 'new' | 'hot' | 'warm' | 'cold' | 'reheating'
export type FitStatus = 'compatible' | 'compatible_with_adjustment'
                      | 'currently_incompatible' | 'insufficient_data'

export interface Lead {
  // … campos atuais
  metaFormId?:       string           // já existe no banco, ausente no TS
  personId?:         string
  temperatureState?: TemperatureState // escalar leve, vem no fetchAll
  fitStatus?:        FitStatus
  intelligenceAt?:   string
  // formAnswers e reasons NÃO entram aqui — sob demanda via RPC
}
```

Corrigir de carona: `LeadOrigin` sem `'indicacao'` ([types/index.ts:262](../src/types/index.ts#L262)).

### 14.4 Identidade visual

Regras já estabelecidas (memórias `project_identidade_visual` e `project_design_conventions`): sem emoji, Lucide 1.6, Space Grotesk nos labels, raio 14px, ouro com parcimônia, base 16px, piso 11px, cores de estado por `stageTheme.ts`. Isso **desqualifica o visual do `leadScore.ts` atual** (❄️🌤🔥⚡ e classes Tailwind cruas) — a nova camada não deve herdá-lo.

---

## 15. Plano de migração e backfill

### 15.1 Cobertura medida

| população | n | melhor fonte |
|---|---|---|
| leads `origin='meta_ads'` | 598 | — |
| com evento vinculado (`lead_payload`) | **493** | **nível 1** — payload bruto |
| com `form_answers` (backfill 059) | 477 | nível 2 |
| com `notes` no formato padrão | 491 | nível 3 |
| meta sem evento (pré-webhook) | ~105 | nível 4 — só campos do cadastro |
| sem rastro nenhum | 2 | — |
| leads não-meta | 224 | nível 4/5 |
| **17 leads dos formulários novos** | 17 | **nível 1 — payload existe e está íntegro** |

Os 17 leads que motivaram o projeto são o caso mais fácil: o payload está inteiro em `meta_webhook_events`. Não é recuperação arqueológica, é releitura.

### 15.2 Ordem e confiabilidade

| nível | fonte | confidence | volume |
|---|---|---|---|
| 1 | `meta_webhook_events.lead_payload` | **100** | 493 |
| 2 | `leads.form_answers` | **80** | 477 (subconjunto) |
| 3 | `leads.notes` parseado | **60** | ~0 residual |
| 4 | campos do cadastro (`property_name`, `average_ticket`) | 40 | resto |
| 5 | `lead_interactions` / `tasks` / `sales` | — | só sinais, não perfil |

Nível 3 só é aplicado quando o parse é determinístico: linha começa com `• `, tem exatamente um `: ` separador, e a pergunta resultante existe em `meta_form_dictionary` para aquele `meta_form_id`. Qualquer desvio → **não migra**, entra no relatório como `unparseable`. Sem heurística de texto livre.

**Nunca rebaixar.** O `UPSERT` do backfill só substitui se `EXCLUDED.confidence > existing.confidence`. Os 477 registros da 059 são preservados; quando o payload nível 1 existir para os mesmos leads, ele promove de 80 para 100 — nunca o contrário.

### 15.3 Idempotência

Requisito: rodar duas vezes não pode duplicar.

- `lead_form_submission.dedup_key UNIQUE`: `leadgen_id` no nível 1-2; `md5(person_id || form_id || date_trunc('minute', submitted_at))` nos níveis 3-4.
- `lead_signal.dedup_key UNIQUE`: `'stage:' || interaction_id`, `'visit:' || task_id || ':done'`, etc. — sempre derivado da linha de origem, nunca de `now()`.
- Perfil e classificações são **reconstruídos**, não incrementados: rodar de novo produz o mesmo resultado.

### 15.4 Etapas

```
E0  Snapshot: pg_dump das tabelas afetadas → storage. Ponto de retorno.
E1  Popula meta_form_dictionary + meta_answer_dictionary a partir do
    inventário desta seção (8 formulários, todas as alternativas observadas).
    Revisão humana obrigatória antes de seguir — é aqui que erro vira dado errado.
E2  Cria lead_person: distinct phone_norm dos 820 leads + 493 eventos.
    Vincula leads.person_id. Relatório de colisões (16 telefones com 2+ leads,
    46 contatos com telefone duplicado) para revisão manual.
E3  Backfill nível 1: 493 submissões dos eventos, submitted_at = created_time.
E4  Backfill níveis 2-4 para quem não foi coberto, sem rebaixar confidence.
E5  Deriva lead_signal do histórico: 608 stage_change, 680 discard,
    36 tasks de visita, 1.751 whatsapp (1º contato), 22 vendas.
E6  Reconstrói lead_profile de todas as pessoas.
E7  Cadastra product + product_commercial_terms  ← BLOQUEADO por §20 item 1
E8  Calcula fit e temperatura da base inteira.
E9  Relatório final e conferência amostral.
```

E1 a E6 podem rodar sem nenhuma decisão de negócio. **E7 é o bloqueio real do projeto** — sem condição comercial cadastrada, a compatibilidade não existe.

### 15.5 Relatório obrigatório

Tabela `backfill_report` (run_id, etapa, categoria, lead_id, person_id, detalhe):

| categoria | significado |
|---|---|
| `migrated` | submissão criada, com nível de fonte |
| `promoted` | confidence subiu (ex.: 80 → 100) |
| `skipped_lower_confidence` | fonte inferior ignorada — o dado bom permaneceu |
| `unparseable` | notes fora do padrão |
| `no_source` | lead sem nenhuma fonte (os ~105 pré-webhook) |
| `identity_conflict` | telefone/e-mail ambíguo — precisa de decisão humana |
| `unknown_answer` | resposta ausente do dicionário — **lacuna de dicionário** |
| `test_lead` | payload de teste da Meta |

### 15.6 Reversão

Todas as tabelas novas carregam `backfill_run_id`. Reverter = `DELETE WHERE backfill_run_id = X` + reconstruir perfil. Como camadas 2 e 4 são inteiramente deriváveis da camada 1, a reversão nunca perde fato.

---

## 16. Plano de testes

**Unitários SQL** (pgTAP ou fixtures + asserts):

- `normalize_phone_br_v2`: com/sem +55, com/sem 9, fixo, lixo, vazio, número internacional;
- normalização de faixa: cada uma das ~40 alternativas observadas → `[min,max)` esperado;
- resposta desconhecida → `NULL` + registro em `unknown_answer`, nunca 0;
- resposta vazia (caso Vanessa Lima) → `missing`, não `false`;
- comparação de faixa contra régua: PASS / FAIL / INDETERMINATE nos três casos de borda (`min = régua`, `max = régua`, cruzando);
- decaimento: score de sinal com meia-vida exata bate com o esperado em t=0, t=meia-vida, t=3×;
- teto de família: 5 submissões contam como 3;
- duplicidade técnica: 2 submissões em 5 min → 1 sinal;
- correção manual: A→B→A em 10 min pelo mesmo broker → 0 sinais; em 2 h → 2 sinais.

**Integração** (banco de teste com cópia anonimizada):

- payload real dos 3 formulários novos → perfil esperado (fixture por lead);
- reentrada: mesma pessoa, formulário diferente, 20 dias depois → 2 submissões, 1 perfil, `new_product_interest`;
- lead de teste da Meta → não cria lead, não consome round-robin, evento marcado `test`;
- backfill rodado 2× → contagens idênticas (o teste que prova idempotência);
- mudança de condição comercial → todos os fits daquele produto recalculados, os demais intactos;
- RLS: corretor A não vê perfil de pessoa cujos leads são todos do corretor B; admin vê tudo; a função de cálculo enxerga tudo.

**Regressão do que já funciona** — o risco real está aqui, porque `process_meta_lead` vai mudar:

- round-robin continua alternando na mesma ordem;
- `sla_due_at` idêntico ao cálculo atual;
- dedup de retry (`23505`) continua funcionando;
- `recapture_overdue_leads` não regride;
- `notes` continua sendo escrito no mesmo formato — a UI atual não pode mudar (a aba nova é aditiva).

**Validação de negócio (E9):** 30 leads amostrados, classificação comparada com a leitura do Dionata e do Rafael. Divergência > 20% = regra reprovada, não publica.

---

## 17. Observabilidade e auditoria

**`intelligence_audit`** (append-only): toda classificação gravada registra `person_id`, `kind`, `rule_version`, `terms_id`, entrada resumida, saída, duração. Permite responder "por que este lead estava marcado como compatível em julho?" depois de a tabela mudar.

**Métricas expostas** (aproveitando `dashboard_extras` / `pulse_snapshot`):

- fila: profundidade de `intelligence_queue`, idade do item mais velho, taxa de erro;
- cobertura: % de leads meta com perfil; % com fit calculado; % `insufficient_data` por formulário;
- **saúde do dicionário**: contagem de `unknown_answer` nos últimos 7 dias — **sobe assim que alguém edita um rótulo no gerenciador do Meta**. É o alarme mais importante do sistema, porque a quebra é silenciosa;
- distribuição de temperatura e fit por produto — mudança brusca sem mudança de regra indica bug;
- defasagem: leads com `intelligence_at` mais velho que a última mudança de regra.

**Alertas** (via `notifications`, tipo novo `intelligence_alert`, só para admin):

- `unknown_answer` > 5 em 24 h → formulário mudou;
- fila > 100 ou item > 15 min → worker travado;
- produto com condição vencida (`valid_to < now()`) e sem sucessora → fits congelados numa tabela morta;
- queda > 30% na taxa de `compatible` de um produto de um dia para o outro.

**Auditoria de acesso a dado sensível:** `lead_profile` guarda renda e capacidade financeira. Registrar leitura via RPC em `activity_logs` (`action='intelligence_view'`) — a tabela já existe com 5.253 linhas e o padrão `details jsonb`.

---

## 18. Rollout por fases

Cada fase entrega valor sozinha e é reversível. Um commit por fase, direto na `main` (memórias `feedback_git_branch`, `feedback_git_commit_push`).

| Fase | Entrega | Depende de | Risco | Reversão |
|---|---|---|---|---|
| **F1** | `process_meta_lead` grava `form_answers` + `meta_created_time` + descarta lead de teste | — | **médio** — mexe no caminho crítico do webhook | restaurar função anterior |
| **F2** | Dicionários + `lead_person` + `lead_form_submission`; backfill E1-E4 com relatório | F1 | baixo — só escreve em tabelas novas | drop por `backfill_run_id` |
| **F3** | `lead_profile` + reconstrução; aba "Inteligência" **só com perfil e histórico** | F2 | baixo | esconder aba |
| **F4** | `lead_signal` + derivação histórica (E5) + triggers de recálculo + fila + worker | F3 | médio — triggers em `leads`/`tasks` | desativar triggers |
| **F5** | `product` + `product_commercial_terms` + tela de cadastro (admin) | **§20 item 1** | baixo | — |
| **F6** | `lead_product_fit` + explicação na aba + `leads.fit_status` | F5 | baixo | zerar coluna |
| **F7** | `lead_temperature` + decaimento por cron + badge no Kanban | F4 | médio — visível a todos | zerar coluna |
| **F8** | Filtros nível 1 e 2 + RPC de busca | F6, F7 | baixo | remover filtros |
| **F9** | Validação com 30 leads reais; calibração dos pesos (regra v2) | F8 + tempo | — | reverter versão |
| **F10** | Listas salvas, sugestão de produto alternativo, priorização automática de fila | F9 | — | — |

Ordem inegociável: **F1 antes de tudo**. Cada dia sem F1 são ~18 leads entrando sem dado estruturado — a dívida cresce sozinha.

---

## 19. Riscos e proteções

| # | Risco | Prob. | Impacto | Proteção |
|---|---|---|---|---|
| R1 | Alterar `process_meta_lead` quebra a entrada de leads | média | **crítico** | função nova com nome versionado; teste com payload real dos 8 formulários em branch Supabase; a Edge Function fica igual, só a RPC muda; rollback = `CREATE OR REPLACE` da versão anterior |
| R2 | Meta muda um rótulo e o dicionário para de casar | **alta** | alto | alerta de `unknown_answer`; nunca falhar silenciosamente; classificação vira `insufficient_data`, jamais um valor inventado |
| R3 | Condições comerciais erradas classificam leads bons como incompatíveis | média | alto | F5 sem F6 primeiro (cadastra e confere antes de classificar); validação amostral em F9; `blocking_field` na tela deixa o erro óbvio para o corretor |
| R4 | Colunas novas engordam o `select('*')` e repetem o incidente de egress de jul/2026 | média | alto | só 3 colunas escalares em `leads`; jsonb sempre em tabela satélite, sob demanda; medir payload do `fetchAll` antes e depois |
| R5 | Cálculo síncrono trava o webhook ou disputa lock com `recapture_overdue_leads` | média | alto | fila + worker; nenhum cálculo em trigger; `FOR UPDATE SKIP LOCKED` no drain |
| R6 | RLS esconde histórico e o perfil sai diferente por usuário | **alta** | alto | funções `SECURITY DEFINER`; teste explícito de RLS por papel |
| R7 | Duas temperaturas na tela (nova × `leadScore.ts`) | **alta** | médio | decidir em §20 item 6 antes de F7 |
| R8 | Backfill duplicado infla temperatura | média | médio | `dedup_key UNIQUE` em submissão e sinal; teste "rodar 2× = mesmo resultado" |
| R9 | Perfil financeiro persistente amplia exposição LGPD | média | alto | RLS restritiva, auditoria de leitura, política de retenção (§20 item 8), expurgo por pessoa |
| R10 | Corretor passa a confiar na classificação e ignora lead marcado como frio | média | médio | linguagem da UI: "pré-qualificação comercial", nunca "aprovado/reprovado"; nunca esconder lead por classificação — só ordenar |
| R11 | Identidade fundida errado junta duas pessoas | baixa | alto | e-mail nunca funde sozinho; `merged_into` é reversível; conflitos vão para relatório, não para automação |
| R12 | Regra nova reclassifica a base e apaga a comparação histórica | média | médio | `rule_version` em cada linha; `intelligence_audit` guarda a classificação anterior |

---

## 20. Decisões pendentes do negócio

Ordenadas por bloqueio. **1 e 2 travam a metade "compatibilidade" do projeto.**

**1. Quais são as condições comerciais vigentes de Rogga, San Pelegrino, Porto Velas e Dotzero?** 🔴 *bloqueia F5-F6*
Para cada um: renda mínima e ideal, entrada mínima e ideal, se FGTS entra na composição da entrada, objetivos aceitos (morar/investir/ambos), tipologias, faixa de valor, desde quando vale. Não existe nada disso no sistema. As pistas históricas (R$ 13.000 de renda no Rogga, R$ 22 mil + R$ 2.000/mês no Dotzero, R$ 30 mil de ato no Porto Velas) são de junho/julho e contradizem os formulários atuais — o Rogga hoje oferece "renda até R$ 5 mil" como alternativa. **Sem confirmação, qualquer regra é chute.**

**2. Confirmar as alternativas reais do San Pelegrino + Perguntas.** 🔴 *bloqueia o dicionário*
O levantamento cita "até R$ 25 mil" na entrada, mas os payloads só trazem `entre_r$_20_mil_e_r$_50_mil`, `acima_de_r$_50_mil` e `ainda_preciso_me_planejar`. A sobreposição 20/25 não aparece nos dados. Precisa de print do gerenciador de formulários dos três formulários novos, com todas as alternativas.

**3. Porto Velas deve passar a coletar FGTS e prazo?**
Hoje pergunta só objetivo, renda e entrada. Se FGTS ou prazo forem critério do produto, todo lead desse formulário nasce `insufficient_data`. Duas saídas: editar o formulário no Meta (melhor) ou aceitar que Porto Velas é classificado com menos critérios.

**4. Videochamada vira categoria de tarefa?**
O briefing pede videochamada como sinal, e ela não existe no sistema. Criar `TaskCategory = 'videochamada'` ou tratar como `reuniao` em `lead_interactions` (tipo declarado, zero uso)?

**5. Produto: entidade nova ou `properties` com `kind='off_plan'`?**
`properties` tem o campo, mas está vazio dele e a UI/RLS são de imóvel de revenda com dono. Recomendação: tabela `product` separada, com ponte opcional para `properties`. Confirmar.

**6. O que fazer com o score legado (`leadScore.ts`)?** ⚠️ *decidir antes de F7*
Ele mostra "Frio/Morno/Quente/Muito Quente" com base em listas e disparos, no `ContactModal` e no `LeadListDetail`. A nova temperatura usa os mesmos rótulos com outra conta. Opções: (a) aposentar e apontar tudo para a nova; (b) renomear o antigo para "Engajamento de campanha"; (c) manter separados. Recomendação: (a) na F7 — duas verdades com o mesmo nome é pior que nenhuma.

**7. Temperatura é visível ao corretor ou só ao admin no início?**
Sugestão: F7 só admin por 2 semanas, libera após a validação da F9. Evita que uma regra não calibrada mude o comportamento comercial.

**8. Retenção do payload bruto e do perfil financeiro.**
`meta_webhook_events` guarda nome, telefone, e-mail e renda desde junho, sem expurgo. O perfil consolidado sobrevive ao descarte do lead. Definir: por quanto tempo manter payload bruto (sugestão: 12 meses, depois manter só `answers_norm`); o que acontece com o perfil quando o lead é descartado como `telefone_invalido`; e se há pedido de exclusão, o que exatamente é apagado.

**9. Contatos frios de `lead_lists` entram na camada?**
São 12.559 contatos e 16.301 vínculos de lista, sem formulário. Ficariam permanentemente `insufficient_data`. Sugestão: fora do escopo inicial — a camada cobre quem preencheu formulário.

**10. Meta: liberar `ads_read` no token?**
Sem isso, `campaign_name`, `adset_name` e `ad_name` continuam ausentes e a dimensão campanha fica só com IDs. É uma permissão a mais no app do Meta.

---

## Resumo executivo

**O que está quebrado agora:** `process_meta_lead` monta as respostas do formulário como texto e joga a estrutura fora. Os 477 registros estruturados vieram de um backfill único de junho. Desde 01/08, os 3 formulários novos entregam 17 leads com `form_answers` nulo — cerca de 18 leads por dia entrando sem dado utilizável.

**O que falta para o objetivo:** as condições comerciais dos produtos **não existem em nenhum lugar do sistema** — nem tabela, nem coluna, nem registro. A compatibilidade é uma equação com um lado só.

**Onde a base é boa:** 507 payloads brutos íntegros desde 12/06, 608 mudanças de etapa com `from_stage`/`to_stage` estruturados, 680 descartes com motivo configurável, dedup por telefone funcionando, `pg_cron` e `pg_net` ativos, realtime ligado nas tabelas certas, e o precedente de `process_meta_lead` provando que lógica transacional pesada em SQL funciona neste projeto.

**Primeiro passo, independente de qualquer decisão:** F1 — fazer a RPC gravar `form_answers` e `meta_created_time`, e parar de transformar lead de teste da Meta em lead real. É cirúrgico, cabe em uma migration, e estanca a perda diária.

**O que trava o resto:** os itens 1 e 2 da §20.

---

*Documento de planejamento. Nenhuma alteração aplicada em código, banco, migrations, Edge Functions ou interface.*
