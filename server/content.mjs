import { createHash } from 'node:crypto';
import { schemas } from '../src/lib/content-schemas.mjs';

export const labels = { profile: '教授簡介', lab: '實驗室', publications: '論文著作', projects: '研究計畫', graduates: '指導論文', awards: '獲獎紀錄', honors: '榮譽', services: '一般服務', academics: '學術服務', photos: '相簿' };
export const revision = (text) => createHash('sha256').update(text).digest('hex');
export const isSingle = (name) => ['profile', 'lab'].includes(name);
export function validate(name, data) {
  if (!Object.hasOwn(labels, name)) throw new Error('找不到此資料類別');
  const rows = isSingle(name) ? [data] : data;
  if (!Array.isArray(rows)) throw new Error('資料格式錯誤');
  const ids = new Set();
  for (const [index, row] of rows.entries()) {
    const result = schemas[name].safeParse(row);
    if (!result.success) throw new Error(`第 ${index + 1} 筆：${result.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('；')}`);
    if (!isSingle(name)) {
      if (typeof row.id !== 'string' || !row.id.trim() || ids.has(row.id)) throw new Error('每筆資料的識別碼不可空白或重複');
      ids.add(row.id);
    }
  }
  function check(value) {
    if (typeof value === 'string' && /^\s*(javascript|data|vbscript):/i.test(value)) throw new Error('連結格式不安全');
    if (value && typeof value === 'object') Object.values(value).forEach(check);
  }
  check(data);
  return data;
}
export function describe(schema) {
  const optional = schema.isOptional();
  while (['optional', 'default', 'nullable'].includes(schema.def.type)) schema = schema.def.innerType;
  const type = schema.def.type;
  if (type === 'object') return { type, optional, fields: Object.fromEntries(Object.entries(schema.shape).map(([k,v]) => [k, describe(v)])) };
  if (type === 'array') return { type, optional, item: describe(schema.element) };
  if (type === 'enum') return { type, optional, options: schema.options };
  return { type, optional };
}
export const catalog = Object.entries(labels).map(([name,label]) => ({ name, label, single: isSingle(name), schema: describe(schemas[name]) }));
