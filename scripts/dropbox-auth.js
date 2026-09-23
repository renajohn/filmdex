#!/usr/bin/env node

// One-off helper: turns the app key and secret of a Dropbox app into the long-lived
// refresh token DexVault needs (DROPBOX_REFRESH_TOKEN).
//   node scripts/dropbox-auth.js <app key> <app secret>

const readline = require('readline');

async function main() {
  const [appKey = process.env.DROPBOX_APP_KEY, appSecret = process.env.DROPBOX_APP_SECRET] = process.argv.slice(2);
  if (!appKey || !appSecret) {
    console.error('Usage: node scripts/dropbox-auth.js <app key> <app secret>');
    process.exit(1);
  }

  const url = 'https://www.dropbox.com/oauth2/authorize'
    + `?client_id=${encodeURIComponent(appKey)}&response_type=code&token_access_type=offline`;
  console.log(`1. Open this URL and allow access:\n\n   ${url}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise(resolve => rl.question('2. Paste the code Dropbox shows: ', answer => {
    rl.close();
    resolve(answer.trim());
  }));

  const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, grant_type: 'authorization_code', client_id: appKey, client_secret: appSecret }),
  });
  const data = await response.json();
  if (!response.ok || !data.refresh_token) {
    console.error('Dropbox refused the code:', data.error_description || data.error || response.status);
    process.exit(1);
  }
  console.log(`\nDROPBOX_REFRESH_TOKEN=${data.refresh_token}`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
