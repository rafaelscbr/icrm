# Camada de inteligência comercial — migrações aplicadas direto no banco

**02/08/2026 · pendência de versionamento**

As migrações abaixo foram aplicadas em produção pelo MCP do Supabase durante a
construção da camada de inteligência. Elas **existem no banco e estão
funcionando**, mas não têm arquivo `.sql` nesta pasta.

Consequência prática: quem recriar o banco do zero apenas com os arquivos daqui
terá o esquema até a `062`, sem a camada de inteligência.

## O que falta versionar

| Migração no banco | O que faz |
|---|---|
| `lead_profile` | `lead_field_of` e `normalize_answer` — normalizam as perguntas dos formulários do Meta |
| `lead_profile_rpc` / `lead_profile_base` | Monta o perfil do lead a partir de formulários e listas internas |
| `pretty_labels` / `fit_reason_precision` | Rótulos legíveis e texto do motivo de cada encaixe |
| `lead_declared_view` | View `lead_declared` — resolve declarado + apurado num lugar só |
| `lead_fit` / `lead_fit_by_unit` | `fit_range`, `fit_worst`, `lead_fit_regua`, `best_unit_for` |
| `lead_temperature` | `lead_temperature` — o cálculo comportamental |
| `leads_intelligence_rpc` | `leads_intelligence()` — o mapa de todos os leads numa chamada |
| `lead_profile_override` | Coluna `leads.profile_override` e `set_lead_profile_field` |
| `development_units` | Tabela de tipologias e view `development_units_effective` |
| `development_matches` | Matching reverso: quem da base cabe no produto |
| `lead_preferencias_regiao_tipologia` | Preferências múltiplas de região e tipologia |
| `regiao_cidade_bairro` | `region_key`, `unaccent_br`, `pref_match_region` |
| `tipologia_com_suites` | `typology_bedrooms`, `typology_suites` |
| `objetivo_nao_qualifica_sozinho` | Correção: objetivo reprova, não aprova |

## Como resolver

Com o Supabase CLI, um comando basta:

```bash
supabase db pull
```

Ele gera o arquivo de migração com o estado atual do esquema, que passa a ser a
fonte versionada. Enquanto isso não roda, **não apagar nem recriar o projeto do
Supabase** — as definições só existem lá.

## Por que aconteceu

As funções foram escritas e ajustadas em ciclos curtos, validando cada uma
contra os dados reais antes de seguir. Aplicar direto encurtou o caminho, mas
deixou o repositório atrás do banco. As migrações `060`, `061` e `062`, que
mexem no caminho de entrada dos leads, têm arquivo — essas eram as de risco.
