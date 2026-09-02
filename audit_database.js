const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const {
  isSupabaseConfigured,
  supabaseGetAllUsers,
  supabaseGetNaukriHistory,
  supabaseGetNaukriConfig
} = require('./server/src/services/supabase.service');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gnuezthgywjfbalrcnbh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_dDMl14z59IIbxq2utpKMmQ_HrISgSU9';

function getHeaders() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function fetchTable(tableName) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?select=*&order=created_at.desc&limit=500`, {
      headers: getHeaders()
    });
    if (!res.ok) {
      // try without order=created_at.desc
      const res2 = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?select=*&limit=500`, {
        headers: getHeaders()
      });
      if (res2.ok) return await res2.json();
      return [];
    }
    return await res.json();
  } catch (e) {
    return [];
  }
}

async function inspectAll() {
  console.log('=== COMPREHENSIVE CLOUD DB & LOCAL LOGS AUDIT ===\n');

  const tables = ['users', 'naukri_history', 'naukri_config', 'outreach_logs', 'scheduled_jobs'];
  const errors = [];
  const findings = [];

  for (const t of tables) {
    const records = await fetchTable(t);
    console.log(`Table \x1b[36m${t}\x1b[0m: ${records.length} record(s)`);

    if (t === 'naukri_history') {
      for (const r of records) {
        const status = (r.status || '').toLowerCase();
        const text = (r.status_text || '').toLowerCase();
        if (status.includes('fail') || status.includes('err') || text.includes('error') || text.includes('denied') || text.includes('failed')) {
          errors.push({
            table: 'naukri_history',
            user: r.user_key,
            status: r.status,
            message: r.status_text,
            timestamp: r.timestamp || r.created_at
          });
        }
      }
    }

    if (t === 'outreach_logs') {
      for (const r of records) {
        const status = (r.status || '').toLowerCase();
        if (status.includes('fail') || status.includes('err') || status.includes('blocked')) {
          errors.push({
            table: 'outreach_logs',
            user: r.user_key,
            company: r.company,
            email: r.hr_email || r.email,
            status: r.status,
            created_at: r.created_at
          });
        }
      }
    }

    if (t === 'naukri_config') {
      for (const r of records) {
        findings.push({
          user: r.user_key,
          scheduleMode: r.schedule_mode,
          hasSession: r.has_session,
          lastStatus: r.last_status,
          updatedAt: r.updated_at
        });
      }
    }
  }

  // Local Sandboxes
  const usersBase = path.join(__dirname, 'server', 'users');
  if (fs.existsSync(usersBase)) {
    const entries = fs.readdirSync(usersBase, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        const u = ent.name;
        const nHistoryPath = path.join(usersBase, u, 'naukri_history.json');
        if (fs.existsSync(nHistoryPath)) {
          try {
            const hist = JSON.parse(fs.readFileSync(nHistoryPath, 'utf8'));
            for (const h of hist) {
              const status = (h.status || '').toLowerCase();
              const text = (h.statusText || h.error || '').toLowerCase();
              if (status.includes('fail') || status.includes('err') || text.includes('fail') || text.includes('denied')) {
                errors.push({
                  table: `local_naukri_history (${u})`,
                  user: u,
                  status: h.status,
                  message: h.statusText || h.error,
                  timestamp: h.timestamp
                });
              }
            }
          } catch (e) {}
        }

        const logsPath = path.join(usersBase, u, 'logs.json.gz');
        if (fs.existsSync(logsPath)) {
          try {
            const buf = fs.readFileSync(logsPath);
            const logs = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
            for (const l of logs) {
              const status = (l.status || '').toLowerCase();
              if (status.includes('fail') || status.includes('err')) {
                errors.push({
                  table: `local_outreach_logs (${u})`,
                  user: u,
                  company: l.company,
                  email: l.email || l.hrEmail,
                  status: l.status,
                  date: l.timestamp || l.date
                });
              }
            }
          } catch (e) {}
        }
      }
    }
  }

  console.log(`\n==============================================`);
  console.log(`TOTAL DETECTED ERROR/FAILURE LOGS: ${errors.length}`);
  console.log(`==============================================\n`);

  if (errors.length > 0) {
    console.log('--- ALL ERROR LOGS (FULL DETAILS) ---');
    console.log(JSON.stringify(errors, null, 2));
  } else {
    console.log('No error logs found.');
  }

  console.log('\n--- NAUKRI CONFIGURATIONS ---');
  console.log(JSON.stringify(findings, null, 2));
}

inspectAll().catch(console.error);
