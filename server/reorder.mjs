import { isSingle } from './content.mjs';
import {projectSortYear} from '../src/lib/project-time.mjs';
const invalid = message => Object.assign(new Error(message),{status:422});
const year = row => row.startTime ? projectSortYear(row) : row.year ?? row.endYear ?? row.startYear ?? 0;
export function reorderContent(name, input, groups) {
  if (!Array.isArray(groups) || !groups.length || groups.length > 500) throw invalid('排序資料格式錯誤');
  const data = structuredClone(input);
  if (isSingle(name)) {
    const group = groups[0];
    const photos = data.photos;
    if (groups.length !== 1 || group?.field !== 'photos' || !Array.isArray(photos) || !Array.isArray(group.ids)
      || group.ids.length !== photos.length || photos.length < 2 || new Set(group.ids).size !== photos.length
      || group.ids.some(id => typeof id !== 'string' || !/^(0|[1-9]\d*)$/.test(id) || Number(id) >= photos.length)) throw invalid('照片排序已變更，請重新載入');
    data.photos = group.ids.map(id => photos[Number(id)]);
    return data;
  }
  if (!Array.isArray(data)) throw invalid('此類別無法排序');
  const rows = new Map(data.map(row => [row.id,row]));
  const used = new Set();
  for (const group of groups) {
    if (!group || group.field || !Array.isArray(group.ids) || group.ids.length < 2 || group.ids.length > data.length) throw invalid('排序資料格式錯誤');
    const ids = new Set(group.ids);
    if (ids.size !== group.ids.length || group.ids.some(id => typeof id !== 'string' || !rows.has(id) || used.has(id))) throw invalid('排序項目重複或已不存在，請重新載入');
    const sortYear = year(rows.get(group.ids[0]));
    if (group.ids.some(id => year(rows.get(id)) !== sortYear)) throw invalid('年份維持由新到舊，請在同年份內調整順序');
    const sameYear = data.filter(row => year(row) === sortYear).sort((a,b) => (a.order ?? 0) - (b.order ?? 0));
    let index = 0;
    const reordered = sameYear.map(row => ids.has(row.id) ? rows.get(group.ids[index++]) : row);
    reordered.forEach((row,index) => {row.order = index;});
    group.ids.forEach(id => used.add(id));
  }
  return data;
}
