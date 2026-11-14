-- ─── Migration 084: pausa a transferência automática por SLA ─────────────────
-- 14/11/2026 — decisão do Rafael: por enquanto o lead fica com quem recebeu.
--
-- O que continua igual:
--   • distribuição inicial dos leads (rodízio por formulário / global);
--   • relógio de SLA de 5 min úteis (sla_due_at): selo no card, linha no push
--     e alerta "SLA estourado" no dashboard — vira meta, não punição.
-- O que para:
--   • o job que, vencido o prazo sem 1º contato, passava o lead para o próximo
--     corretor (recapture_overdue_leads, migrações 029/076). A função fica no
--     banco, só não é mais chamada.
--
-- Para reativar: ANTES, zere os prazos vencidos — senão o primeiro giro
-- transfere de uma vez todo lead parado desde a pausa:
--   UPDATE leads SET sla_due_at = NULL, updated_at = now()
--   WHERE sla_due_at <= now() AND first_contact_at IS NULL;
--   SELECT cron.schedule('recapture-leads-sla', '* * * * *',
--                        'SELECT public.recapture_overdue_leads()');

SELECT cron.unschedule('recapture-leads-sla')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recapture-leads-sla');
