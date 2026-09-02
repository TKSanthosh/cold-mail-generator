const fs = require('fs');
const path = require('path');
const sessionPath = path.join(__dirname, 'server', 'users', 'tksanthosh494_gmail_com', 'naukri_session.json');
console.log('Local naukri_session.json exists:', fs.existsSync(sessionPath));
if (fs.existsSync(sessionPath)) {
  const content = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  console.log('Cookie count:', content.length, 'Cookie names:', content.map(c => c.name).join(', '));
}
