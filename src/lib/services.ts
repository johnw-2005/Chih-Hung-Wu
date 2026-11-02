import type { CollectionEntry } from 'astro:content';
import { serviceCategories, type ServiceCategory } from './colors';

type ServiceEntry = CollectionEntry<'services'>;

const NEW_CATEGORIES = new Set<string>(serviceCategories);
const LEGACY_TEACHING_CAMP_CATEGORIES = new Set(['偏鄉數位', '機器人營隊', '社區研習']);

/** 從既有欄位推斷服務分類（相容舊資料） */
export function resolveServiceCategory(item: ServiceEntry): ServiceCategory {
  const { category, role } = item.data;
  if (category) {
    if (LEGACY_TEACHING_CAMP_CATEGORIES.has(category)) return '教學營隊';
    if (NEW_CATEGORIES.has(category)) return category;
  }
  return inferFromParentAndRole(category ?? '國內服務', role);
}

function inferFromParentAndRole(parent: string, role: string): ServiceCategory {
  if (parent === '校內') {
    return /(執行長|組長|輔導專家|育成中心|指導老師)/.test(role) ? '校內職務' : '校內行政';
  }
  if (parent === '國外服務' || role.includes('印尼')) return '國際服務';
  return '教學營隊';
}

export const serviceCategoryShortLabel: Record<ServiceCategory, string> = {
  校內行政: '行政',
  校內職務: '職務',
  教學營隊: '營隊',
  國際服務: '國際',
};

export type ServiceMetaKind = 'primary' | 'location' | 'date' | 'content';

export interface ServiceMetaRow {
  kind: ServiceMetaKind;
  value: string;
}

export interface FormattedServiceRole {
  title: string;
  meta: ServiceMetaRow[];
  isCampusRole: boolean;
}

const YEAR_PREFIX_RE = /^(\d{4})\s*年\s*/;
const ACTIVITY_CONTENT_RE = /\s*活動內容[：:]\s*(.+)$/;
const ROC_DATE_RE = /\s*\(([^)]+)\)\s*$/;
const ROBOT_RE = /^(\d{4})年?\s*(偏鄉學童機器人體驗營)\s+(.+?)\s*-\s*(.+)$/;
const NUK_PREFIX_RE = /^國立高雄大學(.+)$/;
const TENURE_ORG_RE = /^(\d{4})(?:-(\d{4})?)?$/;

/** 由長到短匹配，便於從字串末端拆出活動類型 */
const ACTIVITY_SUFFIXES = [
  '電腦動畫營與校園網路檢測服務',
  '資訊與機器人研習營',
  '社區電腦與文化活動營',
  'Scratch電腦動畫學習營',
  '社區電子商務研習營',
  '社區電腦資訊營隊',
  '資訊與網路維護與升級',
  '社區電腦繪圖比賽',
  '電腦資訊營隊',
  '電腦學習營',
  '社區電腦教學',
  '教師資訊研習',
  '校園資訊推廣營',
  '資訊推廣營',
  '機器人營隊',
  '網路團隊',
  '資訊營',
  '電腦教學',
] as const;

function splitByActivitySuffix(text: string): { location: string; activity: string } | null {
  for (const suffix of ACTIVITY_SUFFIXES) {
    if (!text.endsWith(suffix)) continue;
    const location = text.slice(0, -suffix.length).trim();
    if (location) return { location, activity: suffix };
  }
  return null;
}

function splitLocationAndActivity(text: string): { location?: string; activity: string } {
  const quoted = text.match(/^(.+?)「(.+?)」-?\s*(.*)$/);
  if (quoted) {
    const theme = quoted[3].trim();
    const activity = theme ? `${quoted[2]} — ${theme}` : quoted[2];
    return { location: quoted[1].trim(), activity };
  }

  const doubleDash = text.match(/^(.+?)--\s*(.+)$/);
  if (doubleDash) {
    const split = splitByActivitySuffix(doubleDash[1].trim());
    if (split) {
      return {
        location: split.location,
        activity: `${split.activity} — ${doubleDash[2].trim()}`,
      };
    }
  }

  const longStay = text.match(/^(.+?社區)\s*\(([^)]+)\)\s*(.+)$/);
  if (longStay) {
    return {
      location: longStay[1].trim(),
      activity: `${longStay[2]} · ${longStay[3].trim()}`,
    };
  }

  const folk = text.match(/^(.+?)民眾資訊研習\s*(\d+)?$/);
  if (folk) {
    const activity = folk[2] ? `民眾資訊研習 ${folk[2]}` : '民眾資訊研習';
    return { location: folk[1].trim(), activity };
  }

  const nuk = text.match(NUK_PREFIX_RE);
  if (nuk) {
    return { location: '國立高雄大學', activity: nuk[1].trim() };
  }

  const indo = text.match(/^(印尼.+?(?:學校|國際學校))(.+)$/);
  if (indo) {
    return { location: indo[1].trim(), activity: indo[2].trim() };
  }

  const bySuffix = splitByActivitySuffix(text);
  if (bySuffix) return bySuffix;

  return { activity: text };
}

function buildEventMeta(
  activity: string,
  location?: string,
  date?: string,
  content?: string,
): ServiceMetaRow[] {
  const meta: ServiceMetaRow[] = [{ kind: 'primary', value: activity }];
  if (location) meta.push({ kind: 'location', value: location });
  if (date) meta.push({ kind: 'date', value: date });
  if (content) meta.push({ kind: 'content', value: content });
  return meta;
}

/** 判斷 organization 是否為任期標記（如 2018-、2005-2007） */
export function isServiceTenureOrganization(organization: string): boolean {
  return organization !== '其他' && TENURE_ORG_RE.test(organization);
}

/** 從任期標記解析起迄年 */
export function parseServiceTenureYears(organization: string): {
  startYear: number;
  endYear?: number;
} | undefined {
  const match = organization.match(TENURE_ORG_RE);
  if (!match) return undefined;
  return {
    startYear: Number(match[1]),
    endYear: match[2] ? Number(match[2]) : undefined,
  };
}

/** 將服務項目的 role 文字整理為標題與結構化欄位 */
export function formatServiceRole(role: string, organization = '其他'): FormattedServiceRole {
  const isCampusRole = NUK_PREFIX_RE.test(role.trim())
    && (organization === '國立高雄大學' || isServiceTenureOrganization(organization));

  if (isCampusRole) {
    const position = role.trim().match(NUK_PREFIX_RE)?.[1] ?? role.trim();
    return {
      title: position,
      meta: [
        { kind: 'primary', value: position },
        { kind: 'location', value: '國立高雄大學' },
      ],
      isCampusRole: true,
    };
  }

  let text = role.trim();
  let content: string | undefined;
  let date: string | undefined;

  const robot = text.match(ROBOT_RE);
  if (robot) {
    const rest = robot[4];
    const dateMatch = rest.match(/\(([^)]+)\)/);
    const subActivity = rest.replace(/\([^)]*\)/, '').trim();
    const activity = subActivity ? `${robot[2]} · ${subActivity}` : robot[2];
    return {
      title: activity,
      meta: buildEventMeta(activity, robot[3].trim(), dateMatch?.[1], undefined),
      isCampusRole: false,
    };
  }

  const contentMatch = text.match(ACTIVITY_CONTENT_RE);
  if (contentMatch) {
    content = contentMatch[1].trim();
    text = text.replace(ACTIVITY_CONTENT_RE, '').trim();
  }

  const dateMatch = text.match(ROC_DATE_RE);
  if (dateMatch) {
    date = dateMatch[1];
    text = text.replace(ROC_DATE_RE, '').trim();
  }

  text = text.replace(YEAR_PREFIX_RE, '').trim();
  const { location, activity } = splitLocationAndActivity(text);

  return {
    title: activity || role,
    meta: buildEventMeta(activity || role, location, date, content),
    isCampusRole: false,
  };
}

export function groupServicesByCategory(items: ServiceEntry[]) {
  return items.reduce<Record<ServiceCategory, ServiceEntry[]>>(
    (groups, item) => {
      const category = resolveServiceCategory(item);
      groups[category].push(item);
      return groups;
    },
    {
      校內行政: [],
      校內職務: [],
      教學營隊: [],
      國際服務: [],
    },
  );
}
