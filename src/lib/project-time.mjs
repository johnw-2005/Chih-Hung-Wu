/** Accept a year, year/month, or real calendar date; never invent missing parts. */
export function validProjectTime(value) {
  if (typeof value !== 'string' || !/^\d{4}(?:\/\d{1,2}(?:\/\d{1,2})?)?$/.test(value)) return false;
  const [y,m,d] = value.split('/').map(Number);
  if (y < 1000 || y > 9999 || (m !== undefined && (m < 1 || m > 12))) return false;
  return d === undefined || (d > 0 && d <= new Date(Date.UTC(y,m,0)).getUTCDate());
}
export function normalizeProjectTime(value) {
  return value.split('/').map((part,index) => index ? part.padStart(2,'0') : part).join('/');
}
export function projectTimes(row) {
  if (row.startTime !== undefined) return {startTime:row.startTime,endTime:row.endTime};
  const tokens = String(row.period ?? '').replace(/\s*\/\s*/g,'/').match(/\d{3,4}(?:\/\d{1,2}(?:\/\d{1,2})?)?/g) ?? [];
  const dates = tokens.map(token => {
    const parts=token.split('/');
    if (parts[0].length === 3 && parts.length > 1) parts[0]=String(Number(parts[0])+1911);
    const value=parts.join('/');
    return validProjectTime(value) ? normalizeProjectTime(value) : undefined;
  });
  if (dates.length === 2 && dates.every(Boolean)) return {startTime:dates[0],endTime:dates[1]};
  return {
    startTime: row.startYear !== undefined ? String(row.startYear) : dates[0],
    endTime: row.endYear !== undefined ? String(row.endYear) : row.status === '已完成' ? dates[0] : undefined,
  };
}
export function formatProjectTime(row) {
  const {startTime,endTime}=projectTimes(row);
  if (!startTime) return '';
  if (startTime === endTime) return startTime;
  return endTime ? `${startTime} – ${endTime}` : row.status === '進行中' ? `${startTime} – 至今` : startTime;
}
export function projectSortYear(row) {
  const {startTime,endTime}=projectTimes(row);
  return Number((endTime || startTime || '0').slice(0,4));
}
export function projectTimeRangeValid(row) {
  if (!row.startTime || !row.endTime) return true;
  // Compare intervals at their known precision, so a year can overlap a known month/day.
  const lower = value => [...value.split('/').map(Number),1,1].slice(0,3);
  const [y,m,d]=row.endTime.split('/').map(Number);
  const last=[y,m ?? 12,d ?? new Date(Date.UTC(y,m ?? 12,0)).getUTCDate()];
  return lower(row.startTime).join('-').split('-').reduce((n,p)=>n*100+Number(p),0) <= last.reduce((n,p)=>n*100+p,0);
}
