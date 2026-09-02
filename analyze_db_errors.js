const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
require('dotenv').config({ path: path.join(__dirname, 'server', '.env') });
const { isSupabaseConfigured, supabaseGetNaukriHistory } = require('./server/src/services/supabase.service');

async function analyzeAllLogs() {
  console.log('=== ANALYZING ALL ERROR LOGS ACROSS LOCAL & DATABASE ===\n');

  const errors = [];
  const warnings = [];
  const userDirs = [];

  const usersBase = path.join(__dirname, 'server', 'users');
  if (fs.existsSync(usersBase)) {
    const entries = fs.readdirSync(usersBase, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) userDirs.push(ent.name);
    }
  }

  console.log(`Found ${userDirs.length} user sandboxes: ${userDirs.join(', ')}`);

  for (const u of userDirs) {
    const dir = path.join(usersBase, u);
    
    // 1. Check logs.json.gz / logs.json
    const gzPath = path.join(dir, 'logs.json.gz');
    const jsonPath = path.join(dir, 'logs.json');
    let logs = [];

    if (fs.existsSync(gzPath)) {
      try {
        const buf = fs.readFileSync(gzPath);
        const decompressed = zlib.gunzipSync(buf).toString('utf8');
        logs = JSON.parse(decompressed);
      } catch (e) {
        errors.push({ source: `${u}/logs.json.gz`, error: `Failed to decompress/parse: ${e.message}` });
      }
    } else if (fs.existsSync(jsonPath)) {
      try {
        logs = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      } catch (e) {
        errors.push({ source: `${u}/logs.json`, error: `Failed to parse: ${e.message}` });
      }
    }

    // Filter failed logs
    for (const log of logs) {
      const status = (log.status || '').toLowerCase();
      if (status.includes('fail') || status.includes('err') || status.includes('block') || status.includes('denied')) {
        errors.push({
          user: u,
          type: log.type,
          company: log.company,
          email: log.email || log.hrEmail,
          status: log.status,
          date: log.timestamp || log.date,
          subject: log.subject
        });
      }
    }

    // 2. Check naukri_history.json
    const naukriHistoryPath = path.join(dir, 'naukri_history.json');
    if (fs.existsSync(naukriHistoryPath)) {
      try {
        const nHistory = JSON.parse(fs.readFileSync(naukriHistoryPath, 'utf8'));
        for (const item of nHistory) {
          const status = (item.status || '').toLowerCase();
          if (status.includes('fail') || status.includes('err') || status.includes('denied')) {
            errors.push({
              user: u,
              type: 'Naukri Upload',
              company: 'Naukri.com',
              status: item.status,
              message: item.statusText || item.error || item.message,
              date: item.timestamp
            });
          }
        }
      } catch (e) {}
    }

    // 3. Check pending questions
    const pendingPath = path.join(dir, 'naukri_pending_questions.json');
    if (fs.existsSync(pendingPath)) {
      try {
        const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
        if (pending.length > 0) {
          warnings.push({
            user: u,
            type: 'Naukri Pending Screening Questions',
            count: pending.length,
            questions: pending.map(p => p.question)
          });
        }
      } catch (e) {}
    }
  }

  // 4. Supabase Cloud Check
  console.log(`\nChecking Supabase configuration... Configured: ${isSupabaseConfigured()}`);
  if (isSupabaseConfigured()) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_dDMl14z59IIbxq2utpKMmQ_HrISgSU9';
      const supabase = createClient(process.env.SUPABASE_URL || 'https://gnuezthgywjfbalrcnbh.supabase.co', sbKey);
      
      const { data: dbLogs, error: logErr } = await supabase.from('outreach_logs').select('*').limit(500);
      if (dbLogs) {
        console.log(`Retrieved ${dbLogs.length} logs from Supabase 'outreach_logs' table.`);
        for (const log of dbLogs) {
          const status = (log.status || '').toLowerCase();
          if (status.includes('fail') || status.includes('err')) {
            errors.push({
              source: 'Supabase DB (outreach_logs)',
              user: log.user_key,
              company: log.company,
              email: log.hr_email || log.email,
              status: log.status,
              date: log.created_at
            });
          }
        }
      } else if (logErr) {
        console.log(`Supabase outreach_logs table query notice: ${logErr.message}`);
      }

      const { data: nHist, error: nHistErr } = await supabase.from('naukri_history').select('*').limit(200);
      if (nHist) {
        console.log(`Retrieved ${nHist.length} entries from Supabase 'naukri_history' table.`);
        for (const item of nHist) {
          const status = (item.status || '').toLowerCase();
          if (status.includes('fail') || status.includes('err')) {
            errors.push({
              source: 'Supabase DB (naukri_history)',
              user: item.user_key,
              status: item.status,
              message: item.status_text,
              date: item.timestamp
            });
          }
        }
      } else if (nHistErr) {
        console.log(`Supabase naukri_history table query notice: ${nHistErr.message}`);
      }
    } catch (e) {
      console.log(`Supabase error check: ${e.message}`);
    }
  }

  console.log(`\n==============================================`);
  console.log(`TOTAL ERROR / FAILURE ENTRIES FOUND: ${errors.length}`);
  console.log(`TOTAL WARNINGS / PENDING ITEMS:      ${warnings.length}`);
  console.log(`==============================================\n`);

  // Group errors by pattern
  const patterns = {};
  for (const err of errors) {
    const key = err.status || err.message || err.error || 'Unknown';
    patterns[key] = (patterns[key] || 0) + 1;
  }

  console.log('--- ERROR BREAKDOWN BY TYPE ---');
  for (const [k, v] of Object.entries(patterns)) {
    console.log(`[Count: ${v}] ${k}`);
  }

  if (warnings.length > 0) {
    console.log('\n--- WARNINGS & PENDING ITEMS ---');
    console.log(JSON.stringify(warnings, null, 2));
  }
}

analyzeAllLogs().catch(console.error);
