import type { EnemyKind } from '../types';

export interface EnemyArchetypeSpec {
  kind: EnemyKind;
  name: string;
  baseHp: number;
  armor: number;
  speed: number;
  reward: number;
  coreDamage: number;
  radius: number;
  isBoss: boolean;
  isElite: boolean;
}

export const ENEMY_SPECS: Record<EnemyKind, EnemyArchetypeSpec> = {
  mote: {
    kind: 'mote',
    name: '蚀影浮灵',
    baseHp: 68,
    armor: 0,
    speed: 64,
    reward: 9,
    coreDamage: 1,
    radius: 13,
    isBoss: false,
    isElite: false,
  },
  runner: {
    kind: 'runner',
    name: '裂隙疾影',
    baseHp: 52,
    armor: 0,
    speed: 102,
    reward: 11,
    coreDamage: 1,
    radius: 11,
    isBoss: false,
    isElite: false,
  },
  hulk: {
    kind: 'hulk',
    name: '黑曜重甲',
    baseHp: 215,
    armor: 10,
    speed: 44,
    reward: 19,
    coreDamage: 2,
    radius: 19,
    isBoss: false,
    isElite: true,
  },
  weaver: {
    kind: 'weaver',
    name: '载律星噬',
    baseHp: 135,
    armor: 4,
    speed: 70,
    reward: 16,
    coreDamage: 2,
    radius: 15,
    isBoss: false,
    isElite: true,
  },
  warden: {
    kind: 'warden',
    name: '暮蚀巡卫',
    baseHp: 1050,
    armor: 14,
    speed: 38,
    reward: 75,
    coreDamage: 5,
    radius: 26,
    isBoss: true,
    isElite: true,
  },
  sovereign: {
    kind: 'sovereign',
    name: '寂灭星主',
    baseHp: 2850,
    armor: 20,
    speed: 34,
    reward: 140,
    coreDamage: 10,
    radius: 32,
    isBoss: true,
    isElite: true,
  },
};

export interface SpawnEntry {
  kind: EnemyKind;
  delay: number; // Seconds after previous spawn
  laneIndex: number;
  carryPrismChance: number;
  customName?: string;
  hpMultiplier?: number;
}

export interface WaveDefinition {
  wave: number;
  act: number;
  title: string;
  subtitle: string;
  entries: SpawnEntry[];
  clearBonus: number;
}

export const TOTAL_CAMPAIGN_WAVES = 12;

export function buildWaveDefinition(wave: number, laneCount: number): WaveDefinition {
  const act = Math.min(3, Math.ceil(wave / 4));
  const lane = (i: number) => i % laneCount;

  if (wave === 1) {
    return {
      wave,
      act: 1,
      title: '第 1 波 · 暮霭初临',
      subtitle: '安置律晶并尝试连结首座「流律」或「凝律」回路',
      clearBonus: 35,
      entries: Array.from({ length: 8 }, (_, i) => ({
        kind: i === 5 ? 'weaver' : 'mote',
        delay: i === 0 ? 1.2 : 1.55,
        laneIndex: lane(i),
        carryPrismChance: i === 5 ? 1.0 : 0.3,
        hpMultiplier: 0.85,
      })),
    };
  }

  if (wave === 2) {
    return {
      wave,
      act: 1,
      title: '第 2 波 · 游星试探',
      subtitle: '载律蚀兽携带着星池中的律晶——把握时机「截律」或坚守「隐阵」',
      clearBonus: 40,
      entries: Array.from({ length: 11 }, (_, i) => ({
        kind: i % 4 === 3 ? 'runner' : i === 7 ? 'weaver' : 'mote',
        delay: i === 0 ? 1.0 : 1.35,
        laneIndex: lane(i),
        carryPrismChance: i === 7 ? 1.0 : 0.35,
        hpMultiplier: 0.95,
      })),
    };
  }

  if (wave === 3) {
    return {
      wave,
      act: 1,
      title: '第 3 波 · 黑曜压境',
      subtitle: '重甲单位登场——「凝律」三同晶可破甲重击',
      clearBonus: 45,
      entries: [
        ...Array.from({ length: 6 }, (_, i) => ({
          kind: (i % 2 === 0 ? 'mote' : 'runner') as EnemyKind,
          delay: i === 0 ? 1.0 : 1.15,
          laneIndex: lane(i),
          carryPrismChance: 0.3,
          hpMultiplier: 1.05,
        })),
        { kind: 'hulk', delay: 1.8, laneIndex: lane(0), carryPrismChance: 1.0, hpMultiplier: 1.0 },
        { kind: 'weaver', delay: 1.4, laneIndex: lane(1), carryPrismChance: 1.0, hpMultiplier: 1.05 },
        ...Array.from({ length: 4 }, (_, i) => ({
          kind: 'mote' as EnemyKind,
          delay: 1.05,
          laneIndex: lane(i),
          carryPrismChance: 0.35,
          hpMultiplier: 1.1,
        })),
        { kind: 'hulk', delay: 1.6, laneIndex: lane(1), carryPrismChance: 0.8, hpMultiplier: 1.05 },
      ],
    };
  }

  if (wave === 4) {
    return {
      wave,
      act: 1,
      title: '第 4 波 · 幕一首领：暮蚀巡卫',
      subtitle: '首领携带稀有律晶——在它逼近前完成「大合鸣」给予毁灭打击！',
      clearBonus: 70,
      entries: [
        ...Array.from({ length: 5 }, (_, i) => ({
          kind: 'mote' as EnemyKind,
          delay: i === 0 ? 1.0 : 1.1,
          laneIndex: lane(i),
          carryPrismChance: 0.3,
          hpMultiplier: 1.15,
        })),
        {
          kind: 'warden',
          delay: 2.0,
          laneIndex: 0,
          carryPrismChance: 1.0,
          customName: '暮蚀巡卫 · 阿克图',
          hpMultiplier: 0.95,
        },
        ...Array.from({ length: 6 }, (_, i) => ({
          kind: (i % 3 === 0 ? 'weaver' : 'runner') as EnemyKind,
          delay: 1.25,
          laneIndex: lane(i + 1),
          carryPrismChance: i % 3 === 0 ? 1.0 : 0.3,
          hpMultiplier: 1.15,
        })),
      ],
    };
  }

  // Waves 5..12 & Endless (13+)
  const hpScale =
    wave <= 12
      ? 1.05 + (wave - 1) * 0.34 + (wave >= 8 ? (wave - 7) * 0.38 : 0)
      : 6.2 * Math.pow(1.26, wave - 12);

  const isMidBoss = wave === 8;
  const isFinalBoss = wave === 12 || (wave > 12 && wave % 4 === 0);

  const entries: SpawnEntry[] = [];
  const count = Math.min(28, 10 + Math.floor(wave * 1.15));

  for (let i = 0; i < count; i++) {
    let kind: EnemyKind = 'mote';
    if (i % 6 === 5) kind = 'hulk';
    else if (i % 5 === 3) kind = 'weaver';
    else if (i % 3 === 1) kind = 'runner';

    entries.push({
      kind,
      delay: i === 0 ? 1.0 : Math.max(0.58, 1.22 - wave * 0.045),
      laneIndex: lane(i),
      carryPrismChance: kind === 'weaver' ? 1.0 : kind === 'hulk' ? 0.65 : 0.28,
      hpMultiplier: hpScale,
    });
  }

  if (isMidBoss) {
    entries.splice(Math.floor(entries.length / 2), 0, {
      kind: 'warden',
      delay: 1.8,
      laneIndex: 0,
      carryPrismChance: 1.0,
      customName: '裂律巨像 · 塞壬',
      hpMultiplier: hpScale * 0.78,
    });
  }

  if (isFinalBoss) {
    entries.splice(Math.floor(entries.length * 0.55), 0, {
      kind: 'sovereign',
      delay: 2.2,
      laneIndex: 0,
      carryPrismChance: 1.0,
      customName: wave === 12 ? '寂灭星主 · 终焉之蚀' : `虚空星主 · 阶 ${wave}`,
      hpMultiplier: wave === 12 ? 1.12 : hpScale * 0.52,
    });
  }

  const titles: Record<number, [string, string]> = {
    5: ['第 5 波 · 裂星中潮', '蚀潮提速，利用「化尘」即时清场控速'],
    6: ['第 6 波 · 疾影奔袭', '大量疾影涌入，沧澜流律与翠林弹射大放异彩'],
    7: ['第 7 波 · 双重星噬', '重甲与载律蚀兽协同压进，蓄力高番大合鸣'],
    8: ['第 8 波 · 幕二首领：裂律巨像', '开启「鸣誓」定阵，迎接爆发合鸣！'],
    9: ['第 9 波 · 终焉前奏', '星池余量渐紧，审时度势灵活转阵'],
    10: ['第 10 波 · 蚀影狂潮', '全频压迫，善用四晶「升华」极律破局'],
    11: ['第 11 波 · 黑曜卫队', '最终决战前的最后阵型精炼机会'],
    12: ['第 12 波 · 终幕决战：寂灭星主', '集结全部星律，奏响最终大合鸣！'],
  };

  const [title, subtitle] = titles[wave] ?? [
    `无尽星渊 · 第 ${wave} 波`,
    '蚀潮永无止境——冲击 TapTap 星律榜极限高分！',
  ];

  return {
    wave,
    act: wave <= 12 ? act : 4,
    title,
    subtitle,
    clearBonus: 45 + wave * 6,
    entries,
  };
}
