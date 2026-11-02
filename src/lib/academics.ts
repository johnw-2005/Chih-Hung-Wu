import type { CollectionEntry } from 'astro:content';
import type { AcademicCategory } from './colors';

type AcademicEntry = CollectionEntry<'academics'>;

export const academicCategoryShortLabel: Record<AcademicCategory, string> = {
  學會會員: '學會',
  期刊審稿: '審稿',
  會議委員: '委員',
  國際會議: '國際會議',
  國內會議: '國內',
};

export type AcademicMetaKind = 'primary' | 'role' | 'location' | 'date' | 'content';

export interface AcademicMetaRow {
  kind: AcademicMetaKind;
  value: string;
}

export interface FormattedAcademicEntry {
  title: string;
  meta: AcademicMetaRow[];
}

const LOCATION_LABELS: Record<string, string> = {
  HongKong: '香港',
  Howaii: '夏威夷',
  Marlaysia: '馬來西亞',
  Indonisia: '印尼',
  Austrilia: '澳洲',
  TW: '台灣',
  USA: '美國',
  Japan: '日本',
  China: '中國',
  Korea: '韓國',
  Canada: '加拿大',
  Norway: '挪威',
  Singapore: '新加坡',
  Italy: '義大利',
  PengHu: '澎湖',
  PeiHung: '北竿',
  Kinmen: '金門',
  Kaohsiung: '高雄',
  Taipei: '台北',
  Tainan: '台南',
  Taiwan: '台灣',
  Australia: '澳洲',
  UK: '英國',
  Turkey: '土耳其',
  TURKEY: '土耳其',
};

const ROLE_SUFFIX_RE =
  /,\s*(Member of Board of Directors|Senior Member|Member)(?:\s*,\s*\d{4}-?)?\s*$/i;
const TRAILING_YEAR_RE = /,?\s*\d{4}(?:~|-)?\s*$/;
const COMMITTEE_DOUBLE_DASH_RE = /^(\d{4})--(.+?)--(.+)$/;
const COMMITTEE_SINGLE_DASH_RE = /^(\d{4})--(.+?)-(.+)$/;
const REVIEWER_RE = /^(Reviewer|Guest Editor)--(.+)$/;
const INTERNATIONAL_RE = /^(.+?)\s*\((.+?)\s+(\d{4})\)$/;
const DOMESTIC_PREFIX_RE = /^\d{4}--/;

function normalizeLocation(label: string): string {
  const trimmed = label.trim().replace(/\.$/, '');
  return LOCATION_LABELS[trimmed] ?? trimmed;
}

function normalizeRole(role: string): string {
  return role
    .replace(/&/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTrailingYear(text: string): string {
  return text.replace(TRAILING_YEAR_RE, '').trim();
}

function buildMeta(rows: AcademicMetaRow[]): AcademicMetaRow[] {
  return rows.filter((row) => row.value.trim().length > 0);
}

function formatJournalEntry(title: string): FormattedAcademicEntry {
  const match = title.match(REVIEWER_RE);
  if (!match) {
    return { title, meta: [{ kind: 'primary', value: title }] };
  }

  const role = match[1];
  const journal = stripTrailingYear(match[2].trim());
  return {
    title: journal,
    meta: buildMeta([
      { kind: 'role', value: role },
      { kind: 'primary', value: journal },
    ]),
  };
}

function formatSocietyEntry(title: string): FormattedAcademicEntry {
  const roleMatch = title.match(ROLE_SUFFIX_RE);
  if (!roleMatch) {
    const cleaned = stripTrailingYear(title);
    return { title: cleaned, meta: [{ kind: 'primary', value: cleaned }] };
  }

  const role = roleMatch[1];
  const organization = title.slice(0, roleMatch.index).replace(/,\s*$/, '').trim();
  return {
    title: organization,
    meta: buildMeta([
      { kind: 'primary', value: organization },
      { kind: 'role', value: role },
    ]),
  };
}

function extractConferenceLocation(rest: string): { name: string; location?: string } {
  const semi = rest.match(/^(.+?)\s*;\s*(.+)$/);
  if (semi) {
    return {
      name: semi[1].trim(),
      location: normalizeLocation(semi[2]),
    };
  }

  const trailingLocation = rest.match(
    /^(.+?),\s*([^,]+),\s*(Taiwan|China|Japan|USA|UK|Australia|Canada|Singapore|Turkey|TURKEY)\.?\s*$/i,
  );
  if (trailingLocation) {
    return {
      name: trailingLocation[1].trim(),
      location: `${normalizeLocation(trailingLocation[2])}，${normalizeLocation(trailingLocation[3])}`,
    };
  }

  const countryOnly = rest.match(
    /^(.+?),\s*(Taiwan|China|Japan|USA|UK|Australia|Canada|Singapore|Turkey|TURKEY)\.?\s*$/i,
  );
  if (countryOnly) {
    return {
      name: countryOnly[1].trim(),
      location: normalizeLocation(countryOnly[2]),
    };
  }

  return { name: rest.trim().replace(/\.$/, '') };
}

function cleanConferenceName(name: string, year?: number): string {
  let cleaned = name.trim();
  if (year) {
    cleaned = cleaned.replace(new RegExp(`^The\\s+${year}\\s+`, 'i'), 'The ');
  }
  cleaned = cleaned.replace(/,\s*\d{1,2}-\d{1,2},\s*[A-Za-z]+,\s*\d{4}/, '');
  cleaned = cleaned.replace(/,\s*\d{1,2}-\d{1,2}\s+[A-Za-z]+,\s*\d{4}/, '');
  return cleaned.replace(/\s{2,}/g, ' ').replace(/,\s*$/, '').trim();
}

function formatCommitteeEntry(title: string, startYear?: number): FormattedAcademicEntry {
  const double = title.match(COMMITTEE_DOUBLE_DASH_RE);
  if (double) {
    const role = normalizeRole(double[2]);
    const { name, location } = extractConferenceLocation(double[3]);
    const conference = cleanConferenceName(name, Number(double[1]) || startYear);
    return {
      title: conference,
      meta: buildMeta([
        { kind: 'role', value: role },
        { kind: 'primary', value: conference },
        ...(location ? [{ kind: 'location' as const, value: location }] : []),
      ]),
    };
  }

  const single = title.match(COMMITTEE_SINGLE_DASH_RE);
  if (single) {
    const role = normalizeRole(single[2]);
    const { name, location } = extractConferenceLocation(single[3]);
    const conference = cleanConferenceName(name, Number(single[1]) || startYear);
    return {
      title: conference,
      meta: buildMeta([
        { kind: 'role', value: role },
        { kind: 'primary', value: conference },
        ...(location ? [{ kind: 'location' as const, value: location }] : []),
      ]),
    };
  }

  return { title, meta: [{ kind: 'primary', value: title }] };
}

function formatInternationalEntry(title: string): FormattedAcademicEntry {
  const match = title.match(INTERNATIONAL_RE);
  if (!match) {
    return { title, meta: [{ kind: 'primary', value: title }] };
  }

  const location = normalizeLocation(match[1]);
  const event = match[2].trim();
  return {
    title: event,
    meta: buildMeta([
      { kind: 'primary', value: event },
      { kind: 'location', value: location },
    ]),
  };
}

function formatDomesticEntry(title: string): FormattedAcademicEntry {
  const text = title.replace(DOMESTIC_PREFIX_RE, '').replace(/\.$/, '').trim();
  const parts = text.split('，').map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 3) {
    const [paperTitle, authors, conference, ...locationParts] = parts;
    const location = locationParts.join('，');
    return {
      title: paperTitle,
      meta: buildMeta([
        { kind: 'primary', value: paperTitle },
        { kind: 'content', value: authors },
        { kind: 'role', value: conference },
        ...(location ? [{ kind: 'location' as const, value: location }] : []),
      ]),
    };
  }

  return { title: text, meta: [{ kind: 'primary', value: text }] };
}

/** 將學術服務原始標題整理為卡片標題與結構化欄位 */
export function formatAcademicEntry(
  title: string,
  category: AcademicCategory,
  startYear?: number,
): FormattedAcademicEntry {
  switch (category) {
    case '期刊審稿':
      return formatJournalEntry(title);
    case '學會會員':
      return formatSocietyEntry(title);
    case '會議委員':
      return formatCommitteeEntry(title, startYear);
    case '國際會議':
      return formatInternationalEntry(title);
    case '國內會議':
      return formatDomesticEntry(title);
    default:
      return { title, meta: [{ kind: 'primary', value: title }] };
  }
}

/** 從既有欄位推斷學術服務分類（相容舊資料） */
export function resolveAcademicCategory(item: AcademicEntry): AcademicCategory {
  if (item.data.category) return item.data.category;

  const title = item.data.title;
  if (title.startsWith('Reviewer') || title.startsWith('Guest Editor')) {
    return '期刊審稿';
  }
  if (
    title.startsWith('Program Committee')
    || title.includes('Program Committee')
    || title.includes('Session Chair')
  ) {
    return '會議委員';
  }
  if (title.includes('Member') || title.includes('Society') || title.includes('Board')) {
    return '學會會員';
  }
  if (/[\u4e00-\u9fff]/.test(title)) {
    return '國內會議';
  }
  if (/\([A-Za-z].*\d{4}\)/.test(title) || /^[A-Za-z].*\d{4}/.test(title)) {
    return '國際會議';
  }
  return '會議委員';
}
