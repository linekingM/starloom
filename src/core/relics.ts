import type { ConstellationRelic } from '../types';

export const RELIC_POOL: ConstellationRelic[] = [
  {
    id: 'brass_astrolabe',
    name: '黄铜浑仪',
    enName: 'Brass Astrolabe',
    description: '全阵律塔射程 +22%，更早拦截疾影与载律蚀兽',
    icon: '◎',
    accent: '#d9b15f',
    rangeBonus: 0.22,
  },
  {
    id: 'celadon_chime',
    name: '青瓷鸣钟',
    enName: 'Celadon Chime',
    description: '全阵攻速 +20%，流律弹射节奏更加行云流水',
    icon: '♪',
    accent: '#4db89c',
    fireRateBonus: 0.2,
  },
  {
    id: 'solar_lens',
    name: '曦光棱镜',
    enName: 'Solar Lens',
    description: '全阵律塔基础伤害 +24%',
    icon: '✦',
    accent: '#e0633c',
    damageBonus: 0.24,
  },
  {
    id: 'eclipse_prism',
    name: '蚀月碎晶',
    enName: 'Eclipse Prism',
    description: '全阵暴击率 +18%，暴击触发璀璨星爆',
    icon: '☾',
    accent: '#7ea6e0',
    critBonus: 0.18,
  },
  {
    id: 'starlight_siphon',
    name: '流光汲瓶',
    enName: 'Starlight Siphon',
    description: '每波结束额外获得 +30 星辉，抽晶调阵更从容',
    icon: '✧',
    accent: '#f0c975',
    starlightPerWave: 30,
  },
  {
    id: 'shatter_bell',
    name: '化尘古铃',
    enName: 'Shatter Bell',
    description: '「化尘」释放的领域脉冲威力 +75%',
    icon: '❖',
    accent: '#e88b5a',
    shatterPowerBonus: 0.75,
  },
  {
    id: 'aether_hook',
    name: '星弦截钩',
    enName: 'Aether Hook',
    description: '「截律」所需星辉消耗减少 10 点（最低为 0）',
    icon: '⚡',
    accent: '#56c2d6',
    siphonDiscount: 10,
  },
  {
    id: 'porcelain_bastion',
    name: '釉光城垣',
    enName: 'Porcelain Bastion',
    description: '星枢核心最大耐久 +5，并立即修复 5 点耐久',
    icon: '❖',
    accent: '#6dc49a',
    maxCoreHpBonus: 5,
  },
];

export interface AggregatedRelicBonuses {
  damageMult: number;
  fireRateMult: number;
  rangeMult: number;
  critChance: number;
  starlightPerWave: number;
  shatterPowerMult: number;
  siphonDiscount: number;
}

export function aggregateRelicBonuses(
  relics: ConstellationRelic[],
  harmonicRank: number,
  oathActive: boolean,
  hasKeystoneAnchor: boolean
): AggregatedRelicBonuses {
  let damageBonus = harmonicRank * 0.2;
  let fireRateBonus = (oathActive ? 0.35 : 0) + (hasKeystoneAnchor ? 0.18 : 0);
  let rangeBonus = 0;
  let critChance = 0.08 + (oathActive ? 0.12 : 0) + harmonicRank * 0.04;
  let starlightPerWave = 0;
  let shatterPowerBonus = 0;
  let siphonDiscount = 0;

  for (const r of relics) {
    if (r.damageBonus) damageBonus += r.damageBonus;
    if (r.fireRateBonus) fireRateBonus += r.fireRateBonus;
    if (r.rangeBonus) rangeBonus += r.rangeBonus;
    if (r.critBonus) critChance += r.critBonus;
    if (r.starlightPerWave) starlightPerWave += r.starlightPerWave;
    if (r.shatterPowerBonus) shatterPowerBonus += r.shatterPowerBonus;
    if (r.siphonDiscount) siphonDiscount += r.siphonDiscount;
  }

  return {
    damageMult: 1 + damageBonus,
    fireRateMult: 1 + fireRateBonus,
    rangeMult: 1 + rangeBonus,
    critChance: Math.min(0.85, critChance),
    starlightPerWave,
    shatterPowerMult: 1 + shatterPowerBonus,
    siphonDiscount,
  };
}
