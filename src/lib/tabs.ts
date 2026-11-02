export interface TabItem {
  id: string;
  label: string;
  labelEn: string;
  color: string;
  count?: number;
}

export const siteTabs: TabItem[] = [
  { id: 'profile', label: '簡介', labelEn: 'Dr. Chih-Hung Wu', color: 'lab-blue' },
  { id: 'lab', label: '實驗室', labelEn: 'I.C.A.L.', color: 'lab-indigo' },
  { id: 'project', label: '重點計畫', labelEn: 'Project', color: 'lab-purple' },
  { id: 'publications', label: '論文著作', labelEn: 'Publications', color: 'lab-pink' },
  { id: 'graduate', label: '指導論文', labelEn: 'Supervised Theses', color: 'lab-orange' },
  { id: 'awards', label: '獲獎紀錄', labelEn: 'Awards', color: 'lab-amber' },
  { id: 'services', label: '一般服務', labelEn: 'Services', color: 'lab-blue' },
  { id: 'academics', label: '學術服務', labelEn: 'Academics', color: 'lab-green' },
];
