import type { ElementalDomain, PrismCode, PrismDomain, PrismInstance, PrismRank } from '../types';

export const ELEMENTAL_DOMAINS: ElementalDomain[] = ['ember', 'tide', 'jade'];
export const ALL_DOMAINS: PrismDomain[] = ['ember', 'tide', 'jade', 'astral'];
export const ELEMENTAL_RANKS: PrismRank[] = [1, 2, 3, 4, 5];
export const ASTRAL_RANKS: PrismRank[] = [1, 2, 3];
export const COPIES_PER_CODE = 4;

export interface PrismSpec {
  code: PrismCode;
  domain: PrismDomain;
  rank: PrismRank;
  zhName: string;
  shortLabel: string;
  enName: string;
}

export const DOMAIN_META: Record<
  PrismDomain,
  {
    zhName: string;
    enName: string;
    primary: string;
    light: string;
    dark: string;
    glow: string;
    shatterDesc: string;
  }
> = {
  ember: {
    zhName: '烬火',
    enName: 'Ember',
    primary: '#e0633c',
    light: '#ffb07c',
    dark: '#7c2b17',
    glow: 'rgba(224, 99, 60, 0.55)',
    shatterDesc: '化尘爆炎：对全场蚀兽施加灼烧冲击',
  },
  tide: {
    zhName: '沧澜',
    enName: 'Tide',
    primary: '#2d8bb8',
    light: '#88d4f2',
    dark: '#14425c',
    glow: 'rgba(45, 139, 184, 0.55)',
    shatterDesc: '化尘寒潮：令全场蚀兽大幅减速 3 秒',
  },
  jade: {
    zhName: '翠林',
    enName: 'Jade',
    primary: '#3c9d74',
    light: '#93e2be',
    dark: '#1b513b',
    glow: 'rgba(60, 157, 116, 0.55)',
    shatterDesc: '化尘生机：修复星枢护盾并标记破甲',
  },
  astral: {
    zhName: '星枢',
    enName: 'Astral',
    primary: '#d9b15f',
    light: '#fff0bf',
    dark: '#6e521b',
    glow: 'rgba(217, 177, 95, 0.65)',
    shatterDesc: '化尘星辉：额外汲取 +30 星辉并震退敌群',
  },
};

export const ASTRAL_SIGN_NAMES: Record<number, { zh: string; short: string; en: string }> = {
  1: { zh: '晨星', short: '晨', en: 'Dawn' },
  2: { zh: '蚀月', short: '月', en: 'Eclipse' },
  3: { zh: '天穹', short: '穹', en: 'Zenith' },
};

export function makePrismCode(domain: PrismDomain, rank: PrismRank): PrismCode {
  return `${domain}-${rank}`;
}

export function parsePrismCode(code: PrismCode): { domain: PrismDomain; rank: PrismRank } {
  const [domain, rankStr] = code.split('-') as [PrismDomain, string];
  return { domain, rank: Number(rankStr) as PrismRank };
}

export function getAllPrismSpecs(): PrismSpec[] {
  const specs: PrismSpec[] = [];
  for (const domain of ELEMENTAL_DOMAINS) {
    for (const rank of ELEMENTAL_RANKS) {
      specs.push({
        code: makePrismCode(domain, rank),
        domain,
        rank,
        zhName: `${DOMAIN_META[domain].zhName}${rank}`,
        shortLabel: `${rank}`,
        enName: `${DOMAIN_META[domain].enName} ${rank}`,
      });
    }
  }
  for (const rank of ASTRAL_RANKS) {
    const sign = ASTRAL_SIGN_NAMES[rank];
    specs.push({
      code: makePrismCode('astral', rank),
      domain: 'astral',
      rank,
      zhName: sign.zh,
      shortLabel: sign.short,
      enName: sign.en,
    });
  }
  return specs;
}

export const ALL_PRISM_SPECS: PrismSpec[] = getAllPrismSpecs();
export const ALL_PRISM_CODES: PrismCode[] = ALL_PRISM_SPECS.map((s) => s.code);

export function getPrismDisplayName(domain: PrismDomain, rank: PrismRank): string {
  if (domain === 'astral') {
    return ASTRAL_SIGN_NAMES[rank]?.zh ?? '星枢';
  }
  return `${DOMAIN_META[domain].zhName}·${rank}`;
}

export function getPrismShortSymbol(domain: PrismDomain, rank: PrismRank): string {
  if (domain === 'astral') {
    return ASTRAL_SIGN_NAMES[rank]?.short ?? '★';
  }
  return String(rank);
}

/** Deterministic Mulberry32 PRNG for reproducible tests and fair draws */
export class SeededRng {
  private state: number;

  constructor(seed = Date.now()) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, maxInclusive: number): number {
    return min + Math.floor(this.next() * (maxInclusive - min + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }
}

/**
 * Finite 72-prism shared Astral Well (the strategic heart of counting probabilities).
 * Both player draws AND enemy-carried prisms come from this same finite pool.
 */
export class AstralWell {
  private pool: PrismInstance[] = [];
  private nextInstanceId = 1;
  private rng: SeededRng;

  constructor(seed?: number) {
    this.rng = new SeededRng(seed);
    this.refill();
  }

  refill(excludeCodes: PrismCode[] = []): void {
    const excludeCount = new Map<PrismCode, number>();
    for (const c of excludeCodes) {
      excludeCount.set(c, (excludeCount.get(c) ?? 0) + 1);
    }

    this.pool = [];
    for (const spec of ALL_PRISM_SPECS) {
      const alreadyUsed = Math.min(COPIES_PER_CODE, excludeCount.get(spec.code) ?? 0);
      const countToAdd = COPIES_PER_CODE - alreadyUsed;
      for (let i = 0; i < countToAdd; i++) {
        this.pool.push({
          id: `prism-${this.nextInstanceId++}`,
          domain: spec.domain,
          rank: spec.rank,
          code: spec.code,
        });
      }
    }
    this.rng.shuffle(this.pool);
  }

  get remaining(): number {
    return this.pool.length;
  }

  draw(): PrismInstance | null {
    if (this.pool.length === 0) {
      return null;
    }
    return this.pool.pop() ?? null;
  }

  /**
   * Draw biased lightly toward an optional target code list ONLY when player is in
   * tutorial step 0 or when drawing enemy carriers during Oath to keep matches dynamic
   * while strictly respecting the finite pool!
   */
  drawPreferring(preferredCodes: PrismCode[], chance: number): PrismInstance | null {
    if (this.pool.length === 0) return null;
    if (preferredCodes.length > 0 && this.rng.next() < chance) {
      const idx = this.pool.findIndex((p) => preferredCodes.includes(p.code));
      if (idx !== -1) {
        const [picked] = this.pool.splice(idx, 1);
        return picked;
      }
    }
    return this.draw();
  }

  /** Draw a specific code if still present in the Well (used in tests and scripted tutorial) */
  drawSpecific(code: PrismCode): PrismInstance | null {
    const idx = this.pool.findIndex((p) => p.code === code);
    if (idx === -1) return null;
    const [picked] = this.pool.splice(idx, 1);
    return picked;
  }

  returnToBottom(prism: PrismInstance): void {
    this.pool.unshift(prism);
  }

  countRemainingByCode(code: PrismCode): number {
    let count = 0;
    for (const p of this.pool) {
      if (p.code === code) count++;
    }
    return count;
  }

  getRemainingCounts(): Record<PrismCode, number> {
    const counts = {} as Record<PrismCode, number>;
    for (const code of ALL_PRISM_CODES) {
      counts[code] = 0;
    }
    for (const p of this.pool) {
      counts[p.code] = (counts[p.code] ?? 0) + 1;
    }
    return counts;
  }

  getRng(): SeededRng {
    return this.rng;
  }
}
