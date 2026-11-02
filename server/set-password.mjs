import { resolve, join } from 'node:path';
import { hashPassword, saveCredential } from './auth.mjs';

// Read only from a terminal. Passwords never become command arguments or env vars.
async function hidden(prompt) {
  process.stdout.write(prompt);
  const input = process.stdin;
  input.setRawMode(true); input.resume(); input.setEncoding('utf8');
  try {
    return await new Promise((accept,reject) => {
      let value = '';
      const onData = chunk => {
        for (const c of chunk) {
          if (c === '\u0003' || c === '\u0004') { finish(); reject(new Error('已取消')); return; }
          if (c === '\r' || c === '\n') { finish(); accept(value); return; }
          if (c === '\u007f' || c === '\b') value = [...value].slice(0,-1).join('');
          else if (c >= ' ' && c !== '\u001b') value += c;
        }
      };
      const finish = () => { input.removeListener('data',onData); };
      input.on('data',onData);
    });
  } finally { input.setRawMode(false); input.pause(); process.stdout.write('\n'); }
}
try {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('請在互動式終端機執行 npm run admin:password；不接受密碼參數或環境變數');
  const password = await hidden('設定管理密碼（不能空白，輸入不顯示）：');
  const confirmation = await hidden('再輸入一次：');
  if (password !== confirmation) throw new Error('兩次密碼不同，未變更任何憑證');
  const path = resolve(process.env.ADMIN_CREDENTIALS_FILE || join(import.meta.dirname,'../.admin-auth/credentials.json'));
  await saveCredential(path,await hashPassword(password));
  console.log('管理密碼已儲存為加鹽雜湊。請重新建立管理容器，使新密碼生效並撤銷既有登入。');
  console.log('請在專案的 docker/ 目錄執行：SITE_MODE=admin docker compose up -d --force-recreate');
} catch (error) { console.error(error.message); process.exitCode = 1; }
