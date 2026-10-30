/** Short zh/en help for running-dynamics metrics (Garmin-style, light theme). */

export type GlossaryKey =
  'gct' | 'vo' | 'vr' | 'cadence' | 'stride' | 'gap' | 'lthr' | 'power';

export const METRIC_GLOSSARY: Record<
  GlossaryKey,
  { zh: string; en: string; titleZh: string; titleEn: string }
> = {
  gct: {
    titleZh: '触地时间',
    titleEn: 'Ground contact time',
    zh: '每一步脚与地面接触的时长（毫秒）。通常越短越高效。',
    en: 'How long each foot stays on the ground (ms). Shorter is usually more efficient.',
  },
  vo: {
    titleZh: '垂直振幅',
    titleEn: 'Vertical oscillation',
    zh: '躯干上下起伏的幅度（厘米）。过大意味着多余上下晃动，浪费能量。',
    en: 'How much your torso bounces up and down (cm). Extra bounce usually wastes energy.',
  },
  vr: {
    titleZh: '垂直步幅比',
    titleEn: 'Vertical ratio',
    zh: '垂直振幅相对步幅的百分比。把弹跳幅度按步长归一，便于跨配速比较。',
    en: 'Vertical oscillation as a percent of stride length — bounce normalised by step length.',
  },
  cadence: {
    titleZh: '步频',
    titleEn: 'Cadence',
    zh: '每分钟步数（spm）。常见舒适区间约 160–180；并非越高越好，需配合步幅与配速。',
    en: 'Steps per minute (spm). Many runners sit around 160–180; higher is not always better — match it to stride and pace.',
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
    titleZh: '乳酸阈心率 (LTHR)',
    titleEn: 'Lactate threshold HR',
    zh: '接近乳酸阈时的心率。%LTHR 区间常用 65/80/89/95/100%。个人 LTHR 请放本地/环境变量，不要提交到仓库。',
    en: 'Heart rate near lactate threshold. Common %LTHR cuts are 65/80/89/95/100%. Keep personal LTHR in local/env, not the repo.',
  },
  power: {
    titleZh: '功率',
    titleEn: 'Power',
    zh: '跑步功率（瓦）。仅在 FIT 提供设备功率区间时显示区间表；本站不会硬编功率分区。',
    en: 'Running power (W). Zone tables appear only when the FIT file includes device power zones — none are invented here.',
  },
};
