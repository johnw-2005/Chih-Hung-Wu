/** 研究計劃類型對應色 */
export const projectCategoryAccent = {
  研究型: 'cat-indigo',
  教學服務型: 'cat-green',
  大專生: 'cat-amber',
} as const;

export type ProjectCategory = keyof typeof projectCategoryAccent;

export const projectCategories = Object.keys(projectCategoryAccent) as ProjectCategory[];

/** EntryList 區塊對應色 */
export const sectionAccent = {
  experience: 'lab-indigo',
  honors: 'lab-purple',
  graduates: 'lab-teal',
  awards: 'lab-amber',
  services: 'lab-blue',
  academics: 'lab-green',
} as const;

/** 行政與社會服務分類對應色 */
export const serviceCategoryAccent = {
  校內行政: 'cat-indigo',
  校內職務: 'cat-blue',
  教學營隊: 'cat-green',
  國際服務: 'cat-rose',
} as const;

export type ServiceCategory = keyof typeof serviceCategoryAccent;

export const serviceCategories = Object.keys(serviceCategoryAccent) as ServiceCategory[];

/** 學術服務分類對應色 */
export const academicCategoryAccent = {
  學會會員: 'cat-blue',
  期刊審稿: 'cat-purple',
  會議委員: 'cat-teal',
  國際會議: 'cat-indigo',
  國內會議: 'cat-amber',
} as const;

export type AcademicCategory = keyof typeof academicCategoryAccent;

export const academicCategories = Object.keys(academicCategoryAccent) as AcademicCategory[];
