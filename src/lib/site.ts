import {projectSortYear} from './project-time.mjs';
export function sortByYearDesc<T extends { data: { year?: number; order?: number } }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const yearDiff = (b.data.year ?? 0) - (a.data.year ?? 0);
    if (yearDiff !== 0) return yearDiff;
    return (a.data.order ?? 0) - (b.data.order ?? 0);
  });
}

export function getEntrySortYear(item: {
  year?: number;
  startTime?: string;
  endTime?: string;
  startYear?: number;
  endYear?: number;
}): number {
  return item.startTime ? projectSortYear(item) : item.year ?? item.endYear ?? item.startYear ?? 0;
}

export function sortByCollectionDateDesc<
  T extends { data: { year?: number; startYear?: number; endYear?: number; order?: number } },
>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    getEntrySortYear(b.data) - getEntrySortYear(a.data)
    || (a.data.order ?? 0) - (b.data.order ?? 0),
  );
}

export function sortByEntryDateDesc<
  T extends { year?: number; startYear?: number; endYear?: number; order?: number },
>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => getEntrySortYear(b) - getEntrySortYear(a)
      || (a.order ?? 0) - (b.order ?? 0),
  );
}

export function formatYearRange(startYear: number, endYear?: number): string {
  if (endYear === undefined) return `${startYear} – 至今`;
  return `${startYear} – ${endYear}`;
}
