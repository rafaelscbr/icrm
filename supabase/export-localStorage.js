/**
 * iCRM - Script de exportação do localStorage para SQL
 *
 * COMO USAR:
 * 1. Abra o app no navegador (http://localhost:5173 ou onde estiver rodando)
 * 2. Abra o DevTools (F12 ou Cmd+Option+I no Mac)
 * 3. Vá na aba "Console"
 * 4. Cole TODO este script e pressione Enter
 * 5. O script vai baixar automaticamente um arquivo "icrm_export.sql"
 * 6. Execute esse arquivo no SQL Editor do Supabase
 */

(function exportICRMtoSQL() {
  const KEYS = {
    contacts:       'icrm_contacts',
    properties:     'icrm_properties',
    sales:          'icrm_sales',
    tasks:          'icrm_tasks',
    goals:          'icrm_goals',
    dailyLogs:      'icrm_daily_logs',
    campaigns:      'icrm_campaigns',
    campaignLeads:  'icrm_campaign_leads',
  };

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  // Escapa string para SQL (substitui aspas simples por duas aspas simples)
  function esc(val) {
    if (val === null || val === undefined) return 'NULL';
    return "'" + String(val).replace(/'/g, "''") + "'";
  }

  function escNum(val) {
    if (val === null || val === undefined) return 'NULL';
    const n = Number(val);
    return isNaN(n) ? 'NULL' : String(n);
  }

  function escBool(val) {
    return val ? 'TRUE' : 'FALSE';
  }

  function escArray(arr) {
    if (!arr || arr.length === 0) return "'{}'";
    const items = arr.map(v => v.replace(/'/g, "''")).join('","');
    return `'{"${items}"}'`;
  }

  function escTs(val) {
    if (!val) return 'NULL';
    // Aceita ISO string ou timestamp numérico
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return 'NULL';
      return esc(d.toISOString());
    } catch {
      return 'NULL';
    }
  }

  const lines = [];
  lines.push('-- iCRM Export gerado em: ' + new Date().toISOString());
  lines.push('-- Execute no SQL Editor do Supabase após rodar o schema.sql');
  lines.push('');

  // ---- CONTACTS ----
  const contacts = read(KEYS.contacts);
  if (contacts.length > 0) {
    lines.push('-- CONTACTS (' + contacts.length + ' registros)');
    for (const c of contacts) {
      lines.push(
        `INSERT INTO contacts (id, name, phone, company, birthdate, photo_url, tags, has_children, children_names, is_married, spouse_name, created_at, updated_at) VALUES (` +
        `${esc(c.id)}, ${esc(c.name)}, ${esc(c.phone)}, ${esc(c.company)}, ${esc(c.birthdate)}, ${esc(c.photoUrl)}, ` +
        `${escArray(c.tags)}, ${escBool(c.hasChildren)}, ${esc(c.childrenNames)}, ${escBool(c.isMarried)}, ${esc(c.spouseName)}, ` +
        `${escTs(c.createdAt)}, ${escTs(c.updatedAt)}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    lines.push('');
  }

  // ---- PROPERTIES ----
  const properties = read(KEYS.properties);
  if (properties.length > 0) {
    lines.push('-- PROPERTIES (' + properties.length + ' registros)');
    for (const p of properties) {
      lines.push(
        `INSERT INTO properties (id, kind, name, type, neighborhood, value, status, owner_id, development_name, images, created_at, updated_at) VALUES (` +
        `${esc(p.id)}, ${esc(p.kind)}, ${esc(p.name)}, ${esc(p.type)}, ${esc(p.neighborhood)}, ${escNum(p.value)}, ${esc(p.status)}, ` +
        `${esc(p.ownerId)}, ${esc(p.developmentName)}, ${escArray(p.images)}, ` +
        `${escTs(p.createdAt)}, ${escTs(p.updatedAt)}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    lines.push('');
  }

  // ---- CAMPAIGNS ----
  const campaigns = read(KEYS.campaigns);
  if (campaigns.length > 0) {
    lines.push('-- CAMPAIGNS (' + campaigns.length + ' registros)');
    for (const c of campaigns) {
      lines.push(
        `INSERT INTO campaigns (id, name, message, status, created_at, updated_at) VALUES (` +
        `${esc(c.id)}, ${esc(c.name)}, ${esc(c.message)}, ${esc(c.status)}, ` +
        `${escTs(c.createdAt)}, ${escTs(c.updatedAt)}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    lines.push('');
  }

  // ---- CAMPAIGN LEADS ----
  const campaignLeads = read(KEYS.campaignLeads);
  if (campaignLeads.length > 0) {
    lines.push('-- CAMPAIGN_LEADS (' + campaignLeads.length + ' registros)');
    for (const l of campaignLeads) {
      lines.push(
        `INSERT INTO campaign_leads (id, campaign_id, name, phone, email, extra, funnel_stage, situation, notes, first_contact_at, proposal_value, property_id, created_at, updated_at) VALUES (` +
        `${esc(l.id)}, ${esc(l.campaignId)}, ${esc(l.name)}, ${esc(l.phone)}, ${esc(l.email)}, ${esc(l.extra)}, ` +
        `${esc(l.funnelStage || 'new')}, ${esc(l.situation)}, ${esc(l.notes)}, ${escTs(l.firstContactAt)}, ` +
        `${escNum(l.proposalValue)}, ${esc(l.propertyId)}, ` +
        `${escTs(l.createdAt)}, ${escTs(l.updatedAt)}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    lines.push('');
  }

  // ---- SALES ----
  const sales = read(KEYS.sales);
  if (sales.length > 0) {
    lines.push('-- SALES (' + sales.length + ' registros)');
    for (const s of sales) {
      lines.push(
        `INSERT INTO sales (id, client_id, property_id, property_name, date, value, type, notes, created_at) VALUES (` +
        `${esc(s.id)}, ${esc(s.clientId)}, ${esc(s.propertyId)}, ${esc(s.propertyName)}, ${esc(s.date)}, ` +
        `${escNum(s.value)}, ${esc(s.type)}, ${esc(s.notes)}, ${escTs(s.createdAt)}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    lines.push('');
  }

  // ---- TASKS ----
  const tasks = read(KEYS.tasks);
  if (tasks.length > 0) {
    lines.push('-- TASKS (' + tasks.length + ' registros)');
    for (const t of tasks) {
      lines.push(
        `INSERT INTO tasks (id, title, description, due_date, due_time, status, priority, category, completed_at, contact_id, property_id, google_event_id, created_at, updated_at) VALUES (` +
        `${esc(t.id)}, ${esc(t.title)}, ${esc(t.description)}, ${esc(t.dueDate)}, ${esc(t.dueTime)}, ` +
        `${esc(t.status || 'pending')}, ${esc(t.priority || 'medium')}, ${esc(t.category)}, ${escTs(t.completedAt)}, ` +
        `${esc(t.contactId)}, ${esc(t.propertyId)}, ${esc(t.googleEventId)}, ` +
        `${escTs(t.createdAt)}, ${escTs(t.updatedAt)}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    lines.push('');
  }

  // ---- GOALS ----
  const goals = read(KEYS.goals);
  if (goals.length > 0) {
    lines.push('-- GOALS (' + goals.length + ' registros)');
    for (const g of goals) {
      lines.push(
        `INSERT INTO goals (id, name, category, target, period, active, created_at, updated_at) VALUES (` +
        `${esc(g.id)}, ${esc(g.name)}, ${esc(g.category)}, ${escNum(g.target)}, ${esc(g.period)}, ` +
        `${escBool(g.active)}, ${escTs(g.createdAt)}, ${escTs(g.updatedAt)}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    lines.push('');
  }

  // ---- DAILY LOGS ----
  const dailyLogs = read(KEYS.dailyLogs);
  if (dailyLogs.length > 0) {
    lines.push('-- DAILY_LOGS (' + dailyLogs.length + ' registros)');
    for (const d of dailyLogs) {
      lines.push(
        `INSERT INTO daily_logs (id, date, new_leads, owner_calls, funnel_followup, notes, closed, closed_at, created_at, updated_at) VALUES (` +
        `${esc(d.id)}, ${esc(d.date)}, ${escNum(d.newLeads)}, ${escNum(d.ownerCalls)}, ${escBool(d.funnelFollowup)}, ` +
        `${esc(d.notes)}, ${escBool(d.closed)}, ${escTs(d.closedAt)}, ` +
        `${escTs(d.createdAt)}, ${escTs(d.updatedAt)}) ON CONFLICT (id) DO NOTHING;`
      );
    }
    lines.push('');
  }

  // Resumo
  lines.push('-- ============================================================');
  lines.push(`-- Resumo: ${contacts.length} contatos, ${properties.length} imóveis, ${sales.length} vendas,`);
  lines.push(`--         ${tasks.length} tarefas, ${goals.length} metas, ${dailyLogs.length} registros diários,`);
  lines.push(`--         ${campaigns.length} campanhas, ${campaignLeads.length} leads de campanha`);
  lines.push('-- ============================================================');

  const sql = lines.join('\n');

  // Download automático do arquivo
  const blob = new Blob([sql], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'icrm_export.sql';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log('%c✅ iCRM Export concluído!', 'color: #4ade80; font-size: 16px; font-weight: bold;');
  console.log(`📦 ${contacts.length} contatos`);
  console.log(`🏠 ${properties.length} imóveis`);
  console.log(`💰 ${sales.length} vendas`);
  console.log(`✅ ${tasks.length} tarefas`);
  console.log(`🎯 ${goals.length} metas`);
  console.log(`📅 ${dailyLogs.length} registros diários`);
  console.log(`📣 ${campaigns.length} campanhas`);
  console.log(`👥 ${campaignLeads.length} leads de campanha`);
  console.log('📄 Arquivo "icrm_export.sql" baixado. Execute no SQL Editor do Supabase.');
})();
