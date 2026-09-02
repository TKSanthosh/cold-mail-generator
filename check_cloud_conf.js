const { isSupabaseConfigured, supabaseGetNaukriConfig } = require('./server/src/services/supabase.service');

async function checkCloudConfig() {
  const conf = await supabaseGetNaukriConfig('tksanthosh494_gmail_com');
  console.log('Supabase Naukri Config for tksanthosh494_gmail_com:');
  console.log('hasSession:', conf ? conf.hasSession : null);
  console.log('hasCookies:', conf && Array.isArray(conf.sessionCookies) ? conf.sessionCookies.length : 0);
  console.log('username:', conf ? conf.username : null);
  console.log('hasPassword:', conf ? Boolean(conf.password) : null);
}

checkCloudConfig().catch(console.error);
