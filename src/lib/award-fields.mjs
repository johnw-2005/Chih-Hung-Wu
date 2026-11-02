import {parseAwardEntry} from './award-parser.mjs';
const comparable = value => (value ?? '').replace(/[\s、，,。.:：]/g,'').toLocaleLowerCase();
export function awardFields(row) {
  const parsed = parseAwardEntry(row.title,row.award);
  const title=parsed.displayTitle;
  const award=parsed.awardLabel;
  const redundant=[title,award,row.recipient,row.organization].filter(Boolean).map(comparable);
  const lines=[parsed.detail,row.detail].filter(Boolean).join('\n').split('\n').map(s=>s.trim()).filter(Boolean);
  const seen=new Set();
  const detail=lines.filter(line=>{
    const value=comparable(line.replace(/^(?:作者|獲獎人|得獎人|相關單位|單位)\s*[:：]\s*/,''));
    if (redundant.includes(value)||seen.has(value)) return false;
    seen.add(value);return true;
  }).join('\n');
  const {sourceUrl,...rest}=row;
  return {...rest,title,award,detail:detail || undefined};
}
