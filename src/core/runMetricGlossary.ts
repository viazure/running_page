/** Short zh/en help for running-dynamics metrics. */

export type GlossaryKey =
  | 'gct'
  | 'vo'
  | 'vr'
  | 'cadence'
  | 'stride'
  | 'gap'
  | 'lthr'
  | 'power'
  | 'hrZones';

export type MetricGlossaryEntry = {
  zh: string;
  en: string;
  titleZh: string;
  titleEn: string;
  /** Optional extra line under the definition. Form metrics leave this unset. */
  howZh?: string;
  howEn?: string;
};

export const METRIC_GLOSSARY: Record<GlossaryKey, MetricGlossaryEntry> = {
  gct: {
    titleZh: '触地时间',
    titleEn: 'Ground contact time',
    zh: '脚接触地面的时长，通常越短越省力。',
    en: 'How long the foot stays on the ground. Shorter usually takes less effort.',
  },
  vo: {
    titleZh: '垂直振幅',
    titleEn: 'Vertical oscillation',
    zh: '身体随每一步上下移动的幅度，通常越低越省力。',
    en: 'How much the body moves up and down with each step. Lower usually takes less effort.',
  },
  vr: {
    titleZh: '垂直步幅比',
    titleEn: 'Vertical ratio',
    zh: '垂直振幅占步幅的比例，通常越低越省力。',
    en: 'Vertical oscillation as a share of stride length. Lower usually takes less effort.',
  },
  cadence: {
    titleZh: '步频',
    titleEn: 'Cadence',
    zh: '每分钟落步的次数，通常较快更省力。',
    en: 'Steps per minute. A quicker cadence usually takes less effort.',
  },
  stride: {
    titleZh: '步幅',
    titleEn: 'Stride length',
    zh: '每一步的水平距离。可由配速与步频估算：步幅 ≈ 速度 / 步频。',
    en: 'Horizontal distance per step. Often derived from pace and cadence.',
  },
  gap: {
    titleZh: '坡度调整配速（估算）',
    titleEn: 'Grade-adjusted pace (estimate)',
    zh: '按坡度估算的等效平路配速。本站用简化公式估算，仅供参考，不是设备原值。',
    en: 'Estimated flat-equivalent pace from grade. This site uses a simple estimate — not a device original.',
  },
  lthr: {
    titleZh: '乳酸阈心率',
    titleEn: 'Lactate threshold heart rate',
    zh: '接近乳酸阈时的心率。没有设备记录的心率区间时，会按它重新划分。',
    en: 'Heart rate near your lactate threshold. When a run has no device zones, zones are redrawn from this value.',
  },
  power: {
    titleZh: '功率',
    titleEn: 'Power',
    zh: '跑步功率（瓦）。区间表仅在文件自带设备分区时显示。',
    en: 'Running power (W). Zone tables appear only when the file includes device power zones.',
  },
  hrZones: {
    titleZh: '心率区间',
    titleEn: 'Heart rate zones',
    zh: '心率区间把这次跑步的心率分成几档。',
    en: "Heart rate zones split this run's heart rate into bands.",
    howZh: '每档显示你在该区间停留了多久。',
    howEn: 'Each row shows how long you spent in that zone.',
  },
};
