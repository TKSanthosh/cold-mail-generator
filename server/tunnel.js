const localtunnel = require('localtunnel');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    const tunnel = await localtunnel({ port: 5001 });
    const urlFilePath = path.join(__dirname, '../tunnel_url.txt');
    fs.writeFileSync(urlFilePath, tunnel.url, 'utf8');
    console.log(`[TUNNEL_URL] ${tunnel.url}`);
    
    tunnel.on('close', () => {
      console.log('Tunnel closed');
    });
    tunnel.on('error', (err) => {
      console.error('Tunnel error:', err);
    });
  } catch (err) {
    console.error('Failed to create tunnel:', err);
  }
})();
