const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, 'server', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gnuezthgywjfbalrcnbh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_dDMl14z59IIbxq2utpKMmQ_HrISgSU9';

async function purgeStaleScheduledJobs() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data, error } = await supabase.from('scheduled_jobs').select('*');
  console.log(`Found ${data ? data.length : 0} scheduled jobs in Supabase.`);
  if (data && data.length > 0) {
    for (const job of data) {
      console.log(`Deleting stale job: ${job.id} (email: ${job.email})`);
      await supabase.from('scheduled_jobs').delete().eq('id', job.id);
    }
  }

  // Also clean local scheduled.json
  const schedPath = path.join(__dirname, 'server', 'scheduled.json');
  fs.writeFileSync(schedPath, '[]', 'utf8');
  console.log('Cleaned local server/scheduled.json');
}

purgeStaleScheduledJobs().catch(console.error);
