import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
const derive = promisify(scrypt);
const parameters = { N: 131072, r: 8, p: 1 };
const options = { ...parameters, maxmem: 256 * 1024 * 1024 };
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.trim().length === 0 || Buffer.byteLength(password) > 1024) throw new Error('密碼不能空白，且不超過 1024 bytes');
  const salt = randomBytes(32).toString('hex');
  const key = (await derive(password, salt, 64, options)).toString('hex');
  return { version: 1, algorithm: 'scrypt', ...parameters, salt, key };
}
export function validateCredential(record) {
  if (!record || record.version !== 1 || record.algorithm !== 'scrypt' ||
      Object.entries(parameters).some(([key,value]) => record[key] !== value) ||
      typeof record.salt !== 'string' || !/^[a-f0-9]{64}$/.test(record.salt) ||
      typeof record.key !== 'string' || !/^[a-f0-9]{128}$/.test(record.key)) throw new Error('管理員憑證格式錯誤，請重新執行 npm run admin:password');
  return record;
}
export async function loadCredential(path) {
  try { return validateCredential(JSON.parse(await readFile(path,'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') throw new Error('尚未設定管理密碼，請先執行 npm run admin:password'); throw error; }
}
export async function verifyPassword(password, record) {
  validateCredential(record);
  if (typeof password !== 'string' || Buffer.byteLength(password) > 1024) return false;
  const key = await derive(password, record.salt, 64, options);
  return timingSafeEqual(key, Buffer.from(record.key,'hex'));
}
export async function saveCredential(path, record) {
  validateCredential(record);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    // The private parent directory protects the hash-only credential file.
    // Replace it atomically rather than modifying the read-only file in place.
    await writeFile(temp, JSON.stringify(record) + '\n', { mode: 0o444, flag: 'wx' });
    await rename(temp, path);
  } finally { await rm(temp,{force:true}); }
}
