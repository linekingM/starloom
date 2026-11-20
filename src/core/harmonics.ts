import type {
  ArchetypeMatch,
  CircuitGroup,
  ConvergenceResult,
  FormationKind,
  PrismCode,
  PrismDomain,
  PrismInstance,
  WaitTarget,
} from '../types';
import { AstralWell, makePrismCode, parsePrismCode } from './well';

export interface GroupEvaluation {
  formation: FormationKind;
  elementDomain: PrismDomain | null;
  cascadeRanks: number[];
  monolithCode: PrismCode | null;
}

export function evaluatePrismsAsGroup(
  prisms: Array<PrismInstance | null>,
  isKeystone: boolean
): GroupEvaluation {
  const filled = prisms.filter((p): p is PrismInstance => p !== null);

  if (isKeystone) {
    if (filled.length === 2 && filled[0].code === filled[1].code) {
      return {
        formation: 'anchor',
        elementDomain: filled[0].domain,
        cascadeRanks: [],
        monolithCode: filled[0].code,
      };
    }
    return { formation: 'none', elementDomain: null, cascadeRanks: [], monolithCode: null };
  }

  if (filled.length !== 3) {
    return { formation: 'none', elementDomain: null, cascadeRanks: [], monolithCode: null };
  }

  const [a, b, c] = filled;

  // Monolith (Unison Triad): 3 identical domain + rank (works for all domains including astral)
  if (a.code === b.code && b.code === c.code) {
    return {
      formation: 'monolith',
      elementDomain: a.domain,
      cascadeRanks: [],
      monolithCode: a.code,
    };
  }

  // Cascade (Harmonic Sequence): 3 consecutive ranks in the same elemental domain (non-astral)
  if (a.domain === b.domain && b.domain === c.domain && a.domain !== 'astral') {
    const ranks = [a.rank, b.rank, c.rank].sort((x, y) => x - y);
    if (ranks[0] + 1 === ranks[1] && ranks[1] + 1 === ranks[2]) {
      return {
        formation: 'cascade',
        elementDomain: a.domain,
        cascadeRanks: ranks,
        monolithCode: null,
      };
    }
  }

  return { formation: 'none', elementDomain: null, cascadeRanks: [], monolithCode: null };
}

/** Mutates a CircuitGroup's cached formation fields and returns whether it newly ignited */
export function refreshCircuitFormation(group: CircuitGroup): boolean {
  const prev = group.formation;
  const result = evaluatePrismsAsGroup(
    group.slots.map((s) => s.prism),
    group.isKeystone
  );
  group.formation = result.formation;
  group.elementDomain = result.elementDomain;
  group.cascadeRanks = result.cascadeRanks;
  group.monolithCode = result.monolithCode;

  if (group.formation !== 'monolith') {
    group.supercharged = false;
  }

  const newlyIgnited = prev === 'none' && group.formation !== 'none';
  if (newlyIgnited) {
    group.igniteFlash = 1.0;
  }
  return newlyIgnited;
}

export interface MissingCompletion {
  code: PrismCode;
  formation: FormationKind;
  emptySlotIndex: number;
  isReplacement?: boolean;
}

/**
 * Returns every PrismCode that completes a valid formation in an unformed group:
 *  - Case A: Group has 1 empty slot (2/3 for circuits, 1/2 for keystone)
 *  - Case B: Group is full (unformed, unlocked) and replacing 1 mismatched slot completes it
 */
export function getGroupMissingCompletions(group: CircuitGroup): MissingCompletion[] {
  if (group.formation !== 'none' || group.locked) return [];

  const emptyIndices: number[] = [];
  const filledEntries: Array<{ idx: number; prism: PrismInstance }> = [];

  group.slots.forEach((slot, idx) => {
    if (slot.prism) {
      filledEntries.push({ idx, prism: slot.prism });
    } else {
      emptyIndices.push(idx);
    }
  });

  const results: MissingCompletion[] = [];
  const seen = new Set<string>();

  const addIfNew = (
    code: PrismCode,
    formation: FormationKind,
    targetSlotIndex: number,
    isReplacement: boolean
  ) => {
    const key = `${code}:${formation}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ code, formation, emptySlotIndex: targetSlotIndex, isReplacement });
  };

  if (group.isKeystone) {
    if (emptyIndices.length === 1 && filledEntries.length === 1) {
      addIfNew(filledEntries[0].prism.code, 'anchor', emptyIndices[0], false);
    } else if (emptyIndices.length === 0 && filledEntries.length === 2) {
      // Two mismatched prisms on keystone: replacing slot 1 matches slot 0, or replacing slot 0 matches slot 1
      addIfNew(filledEntries[0].prism.code, 'anchor', filledEntries[1].idx, true);
      addIfNew(filledEntries[1].prism.code, 'anchor', filledEntries[0].idx, true);
    }
    return results;
  }

  // Helper to evaluate a 2-prism pair + target slot index
  const checkPair = (a: PrismInstance, b: PrismInstance, targetIdx: number, isReplacement: boolean) => {
    if (a.domain !== b.domain) return;
    if (a.rank === b.rank) {
      addIfNew(a.code, 'monolith', targetIdx, isReplacement);
    }
    if (a.domain !== 'astral') {
      const lo = Math.min(a.rank, b.rank);
      const hi = Math.max(a.rank, b.rank);
      const diff = hi - lo;
      if (diff === 1) {
        if (lo - 1 >= 1) {
          addIfNew(makePrismCode(a.domain, (lo - 1) as 1 | 2 | 3 | 4 | 5), 'cascade', targetIdx, isReplacement);
        }
        if (hi + 1 <= 5) {
          addIfNew(makePrismCode(a.domain, (hi + 1) as 1 | 2 | 3 | 4 | 5), 'cascade', targetIdx, isReplacement);
        }
      } else if (diff === 2) {
        addIfNew(makePrismCode(a.domain, (lo + 1) as 1 | 2 | 3 | 4 | 5), 'cascade', targetIdx, isReplacement);
      }
    }
  };

  // Case A: 2 filled + 1 empty slot
  if (emptyIndices.length === 1 && filledEntries.length === 2) {
    checkPair(filledEntries[0].prism, filledEntries[1].prism, emptyIndices[0], false);
    return results;
  }

  // Case B: 3 filled mismatched prisms -> try holding each pair and replacing the 3rd!
  if (emptyIndices.length === 0 && filledEntries.length === 3) {
    checkPair(filledEntries[0].prism, filledEntries[1].prism, filledEntries[2].idx, true);
    checkPair(filledEntries[0].prism, filledEntries[2].prism, filledEntries[1].idx, true);
    checkPair(filledEntries[1].prism, filledEntries[2].prism, filledEntries[0].idx, true);
  }

  return results;
}

/**
 * Evaluates visual placement feedback for placing `prism` onto `group` at `slotIndex`.
 * 'complete'   -> Gold pulse (completes a Cascade, Monolith, Anchor, or Supercharges a Monolith!)
 * 'partial'    -> Cyan pulse (forms a valid 2-of-3 pair/sequence seed)
 * 'neutral'    -> Soft white (valid placement into an empty slot)
 * 'none'       -> Cannot place (locked or occupied without supercharge)
 */
export function evaluatePlacementHint(
  group: CircuitGroup,
  slotIndex: number,
  prism: PrismInstance
): 'supercharge' | 'complete' | 'partial' | 'neutral' | 'none' {
  // Check Supercharge (4th copy onto an existing non-supercharged Monolith!)
  if (
    !group.isKeystone &&
    group.formation === 'monolith' &&
    !group.supercharged &&
    group.monolithCode === prism.code
  ) {
    return 'supercharge';
  }

  if (group.locked) return 'none';
  const slot = group.slots[slotIndex];
  if (!slot) return 'none';

  // Simulate placing (even if swapping out an existing mismatched prism!)
  const testPrisms = group.slots.map((s, idx) => (idx === slotIndex ? prism : s.prism));
  const evalResult = evaluatePrismsAsGroup(testPrisms, group.isKeystone);
  if (evalResult.formation !== 'none' && group.formation === 'none') {
    return 'complete';
  }

  if (slot.prism !== null) {
    // If this group is unformed and has ZERO current missing completions (a dead pair like ember-3 + jade-4),
    // highlight swapping this slot if the swap creates a valid wait!
    if (group.formation === 'none' && getGroupMissingCompletions(group).length === 0) {
      const simulatedSlots = group.slots.map((s, idx) =>
        idx === slotIndex ? { ...s, prism } : s
      );
      const simGroup: CircuitGroup = { ...group, slots: simulatedSlots };
      if (getGroupMissingCompletions(simGroup).length > 0) {
        return 'partial';
      }
    }
    return 'none';
  }

  // Check if it forms a strong partial link with existing pieces in this group
  const existing = group.slots.map((s) => s.prism).filter((p): p is PrismInstance => p !== null);
  if (existing.length === 1) {
    const other = existing[0];
    if (other.code === prism.code) return 'partial';
    if (
      !group.isKeystone &&
      other.domain === prism.domain &&
      prism.domain !== 'astral' &&
      Math.abs(other.rank - prism.rank) <= 2
    ) {
      return 'partial';
    }
  }

  return 'neutral';
}

export function isBastionComplete(circuits: CircuitGroup[]): boolean {
  if (circuits.length === 0) return false;
  return circuits.every((g) => g.formation !== 'none');
}

/**
 * Full 11-node Tenpai (临鸣 / Resonance Threshold) analyzer.
 * Detects when the player is 1 single prism away from completing the entire Bastion!
 * Supports:
 *  - 3 groups complete + 1 group has 1 empty slot waiting on 1..N codes
 *  - Also detects when 3 groups are complete and 1 group has a misplaced piece if allowSwap=false?
 *    Keep Tenpai strictly crisp: 3 groups complete + the 4th group has 1 empty slot (or 1 mismatched piece that can be replaced? No, empty slot is clearest for players & Riichi lock!).
 */
export function analyzeBastionWaits(circuits: CircuitGroup[], well?: AstralWell): WaitTarget[] {
  const incomplete = circuits.filter((g) => g.formation === 'none');
  if (incomplete.length !== 1) return [];

  const targetGroup = incomplete[0];
  const completions = getGroupMissingCompletions(targetGroup);

  return completions.map((comp) => ({
    code: comp.code,
    groupId: targetGroup.id,
    slotIndex: comp.emptySlotIndex,
    resultingFormation: comp.formation,
    remainingInWell: well ? well.countRemainingByCode(comp.code) : 0,
  }));
}

export interface ArchetypeDefinition {
  id: string;
  name: string;
  enName: string;
  multiplier: number;
  tier: 'common' | 'rare' | 'legendary';
  conditionText: string;
  effectSummary: string;
  badgeColor: string;
}

export const ALL_ARCHETYPE_CATALOG: ArchetypeDefinition[] = [
  {
    id: 'monochrome',
    name: '纯律归宗',
    enName: 'Monochrome Tide',
    multiplier: 3.0,
    tier: 'legendary',
    conditionText: '全部 11 枚律晶属于同一元素系（纯烬火 / 纯沧澜 / 纯翠林）',
    effectSummary: '×3.0 倍率 · 释放单系天灾清屏与永久 +25% 同系增伤',
    badgeColor: '#e0633c',
  },
  {
    id: 'astral_trinity',
    name: '星辰三极',
    enName: 'Astral Trinity',
    multiplier: 3.5,
    tier: 'legendary',
    conditionText: '阵型中包含至少 2 组星枢（晨星 / 蚀月 / 天穹）凝律或双枢',
    effectSummary: '×3.5 倍率 · 降临日蚀星轨射线并大幅回复核心护盾',
    badgeColor: '#d9b15f',
  },
  {
    id: 'tri_domain_flow',
    name: '三脉贯通',
    enName: 'Tri-Domain Flow',
    multiplier: 2.4,
    tier: 'rare',
    conditionText: '烬火、沧澜、翠林三系各自形成相同阶位的流律（如三系皆为 2-3-4）',
    effectSummary: '×2.4 倍率 · 触发元素三重破甲星爆',
    badgeColor: '#3c9d74',
  },
  {
    id: 'monolith_bastion',
    name: '万钧碑林',
    enName: 'Monolith Bastion',
    multiplier: 2.2,
    tier: 'rare',
    conditionText: '全部 3 组回路皆为「凝律」（三枚相同律晶）',
    effectSummary: '×2.2 倍率 · 全阵获得无视护甲重击冲击波',
    badgeColor: '#c9883b',
  },
  {
    id: 'astral_harmony',
    name: '星穹混响',
    enName: 'Astral Harmony',
    multiplier: 2.0,
    tier: 'rare',
    conditionText: '仅由 1 种元素系与星枢系共同构成完整星阵',
    effectSummary: '×2.0 倍率 · 星穹轨道脉冲增幅',
    badgeColor: '#56a3c7',
  },
  {
    id: 'pure_cascade',
    name: '平流和弦',
    enName: 'Harmonic Stream',
    multiplier: 1.5,
    tier: 'common',
    conditionText: '全部 3 组回路皆为「流律」（顺阶连携）',
    effectSummary: '×1.5 倍率 · 全阵连锁弹射 +1 目标',
    badgeColor: '#48b099',
  },
  {
    id: 'horizon_edge',
    name: '边际星辉',
    enName: 'Horizon Edge',
    multiplier: 1.8,
    tier: 'rare',
    conditionText: '每组回路与双枢均包含 1 阶、5 阶或星枢律晶',
    effectSummary: '×1.8 倍率 · 全阵射程显著扩张',
    badgeColor: '#8d7ae6',
  },
  {
    id: 'heartland_pulse',
    name: '中庭律动',
    enName: 'Heartland Pulse',
    multiplier: 1.6,
    tier: 'common',
    conditionText: '全部 11 枚律晶仅由 2、3、4 阶元素律晶组成（无边际与星枢）',
    effectSummary: '×1.6 倍率 · 高频疾射节奏加速',
    badgeColor: '#52b788',
  },
  {
    id: 'unbound_purity',
    name: '无瑕隐阵',
    enName: 'Unbound Purity',
    multiplier: 1.5,
    tier: 'common',
    conditionText: '本轮合鸣全程未截律（无明锁回路），纯靠星池凝结成阵',
    effectSummary: '×1.5 倍率 · 暴击率大幅提升',
    badgeColor: '#e2c275',
  },
  {
    id: 'oath_fulfilled',
    name: '鸣誓终章',
    enName: 'Oath Fulfilled',
    multiplier: 1.6,
    tier: 'common',
    conditionText: '在开启「鸣誓」定阵状态下完成大合鸣',
    effectSummary: '×1.6 倍率 · 额外星辉倾泻与冲击清场',
    badgeColor: '#f29e4c',
  },
  {
    id: 'ascended_spire',
    name: '极律天成',
    enName: 'Ascended Spire',
    multiplier: 2.0,
    tier: 'rare',
    conditionText: '通过四晶「升华」获得的岭上星落直接完成大合鸣',
    effectSummary: '×2.0 倍率 · 触发双倍星轨重炮',
    badgeColor: '#f4d35e',
  },
];

export interface ConvergenceContext {
  isSelfDrawn: boolean;
  isOathFulfilled: boolean;
  isUnbound: boolean;
  isSurgeFinish: boolean;
  wave: number;
}

export function evaluateConvergence(
  circuits: CircuitGroup[],
  context: ConvergenceContext
): ConvergenceResult {
  const mainCircuits = circuits.filter((c) => !c.isKeystone);
  const allPrisms: PrismInstance[] = [];
  for (const g of circuits) {
    for (const s of g.slots) {
      if (s.prism) allPrisms.push(s.prism);
    }
  }

  const matches: ArchetypeMatch[] = [];
  const pushById = (id: string) => {
    const def = ALL_ARCHETYPE_CATALOG.find((a) => a.id === id);
    if (def) {
      matches.push({
        id: def.id,
        name: def.name,
        enName: def.enName,
        multiplier: def.multiplier,
        tier: def.tier,
        effectSummary: def.effectSummary,
        badgeColor: def.badgeColor,
      });
    }
  };

  // Domain composition analysis
  const elementalDomains = new Set<PrismDomain>();
  let hasAstral = false;
  for (const p of allPrisms) {
    if (p.domain === 'astral') {
      hasAstral = true;
    } else {
      elementalDomains.add(p.domain);
    }
  }

  // 1. Monochrome Tide (清一色)
  if (elementalDomains.size === 1 && !hasAstral) {
    pushById('monochrome');
  } else if (elementalDomains.size === 1 && hasAstral) {
    // 2. Astral Harmony (混一色)
    pushById('astral_harmony');
  }

  // 3. Astral Trinity (大三元/双星极)
  const astralGroups = circuits.filter((g) => g.elementDomain === 'astral' && g.formation !== 'none');
  if (astralGroups.length >= 2) {
    pushById('astral_trinity');
  }

  // 4. Tri-Domain Flow (三色同顺)
  const allCascades = mainCircuits.length === 3 && mainCircuits.every((c) => c.formation === 'cascade');
  if (allCascades) {
    const cascadeDomains = new Set(mainCircuits.map((c) => c.elementDomain));
    const rankKeys = new Set(mainCircuits.map((c) => c.cascadeRanks.join('-')));
    if (cascadeDomains.size === 3 && rankKeys.size === 1) {
      pushById('tri_domain_flow');
    } else {
      // 5. Pure Cascade (平流和弦 / 平和)
      pushById('pure_cascade');
    }
  }

  // 6. Monolith Bastion (对对和)
  const allMonoliths = mainCircuits.length === 3 && mainCircuits.every((c) => c.formation === 'monolith');
  if (allMonoliths) {
    pushById('monolith_bastion');
  }

  // 7. Horizon Edge (混全带幺) vs 8. Heartland Pulse (断幺九)
  const isTerminalOrAstral = (p: PrismInstance) =>
    p.domain === 'astral' || p.rank === 1 || p.rank === 5;
  const everyGroupHasTerminal = circuits.every((g) =>
    g.slots.some((s) => s.prism !== null && isTerminalOrAstral(s.prism))
  );
  const noTerminalAnywhere = allPrisms.length > 0 && allPrisms.every((p) => !isTerminalOrAstral(p));

  if (noTerminalAnywhere) {
    pushById('heartland_pulse');
  } else if (everyGroupHasTerminal) {
    pushById('horizon_edge');
  }

  // 9. Unbound Purity (门前清)
  if (context.isUnbound) {
    pushById('unbound_purity');
  }

  // 10. Oath Fulfilled (立直)
  if (context.isOathFulfilled) {
    pushById('oath_fulfilled');
  }

  // 11. Ascended Spire (杠上开花)
  if (context.isSurgeFinish) {
    pushById('ascended_spire');
  }

  // Supercharged circuits bonus
  const superchargeCount = mainCircuits.filter((c) => c.supercharged).length;
  if (superchargeCount > 0) {
    matches.push({
      id: 'supercharge_bonus',
      name: `极律升华 ×${superchargeCount}`,
      enName: `Supercharge x${superchargeCount}`,
      multiplier: 1 + superchargeCount * 0.5,
      tier: 'rare',
      effectSummary: `每座四晶升华回路额外提升 +0.5 倍率`,
      badgeColor: '#f4d35e',
    });
  }

  // Self-draw bonus (星池自鸣 / 门清自摸)
  if (context.isSelfDrawn) {
    matches.push({
      id: 'self_drawn',
      name: '星池自鸣',
      enName: 'Self-Resonance',
      multiplier: 1.25,
      tier: 'common',
      effectSummary: '自星池汲取终晶成阵 · 核心护盾回复与倍率加成',
      badgeColor: '#7fd1ae',
    });
  }

  // Guarantee at least base harmony entry if no special archetypes matched
  if (matches.length === 0) {
    matches.push({
      id: 'base_convergence',
      name: '初律合鸣',
      enName: 'First Chord',
      multiplier: 1.2,
      tier: 'common',
      effectSummary: '三回路与双枢同步共鸣，释放全场星律冲击波',
      badgeColor: '#c9b489',
    });
  }

  // Multiplicative harmonic scaling (capped gently so numbers stay exhilarating yet readable)
  let totalMultiplier = 1.0;
  for (const m of matches) {
    totalMultiplier *= m.multiplier;
  }
  totalMultiplier = Math.round(totalMultiplier * 100) / 100;

  const baseScore = 1000 + context.wave * 250;
  const totalScore = Math.round(baseScore * totalMultiplier);
  const starlightReward = Math.min(175, Math.round(55 + totalMultiplier * 10));
  const coreHeal = Math.min(6, 2 + (context.isSelfDrawn ? 1 : 0) + (totalMultiplier >= 4 ? 2 : 0));

  return {
    archetypes: matches,
    totalMultiplier,
    baseScore,
    totalScore,
    isSelfDrawn: context.isSelfDrawn,
    isOathFulfilled: context.isOathFulfilled,
    isUnbound: context.isUnbound,
    isSurgeFinish: context.isSurgeFinish,
    starlightReward,
    coreHeal,
  };
}

/** Helper to check if a PrismCode can complete any group or supercharge a monolith */
export function findBestSiphonTarget(
  circuits: CircuitGroup[],
  prism: PrismInstance,
  enemyX: number,
  enemyY: number,
  cascadeProximityPx = 235
): {
  groupId: string;
  slotIndex: number;
  actionKind: 'cascade' | 'monolith' | 'supercharge' | 'convergence';
} | null {
  // 1. Highest priority: Grand Convergence finisher! (Ron!)
  const waits = analyzeBastionWaits(circuits);
  const winWait = waits.find((w) => w.code === prism.code);
  if (winWait) {
    return {
      groupId: winWait.groupId,
      slotIndex: winWait.slotIndex,
      actionKind: 'convergence',
    };
  }

  // 2. Supercharge an existing Monolith (4th copy Kong!)
  for (const g of circuits) {
    if (!g.isKeystone && g.formation === 'monolith' && !g.supercharged && g.monolithCode === prism.code) {
      return {
        groupId: g.id,
        slotIndex: 0,
        actionKind: 'supercharge',
      };
    }
  }

  // 3. Complete a Monolith anywhere on the map (Pon!)
  for (const g of circuits) {
    if (g.locked || g.isKeystone) continue;
    const missing = getGroupMissingCompletions(g);
    const mono = missing.find((m) => m.code === prism.code && m.formation === 'monolith');
    if (mono) {
      return {
        groupId: g.id,
        slotIndex: mono.emptySlotIndex,
        actionKind: 'monolith',
      };
    }
  }

  // 4. Complete a Cascade when enemy is within tactical proximity of that circuit (Chi!)
  for (const g of circuits) {
    if (g.locked || g.isKeystone) continue;
    const missing = getGroupMissingCompletions(g);
    const casc = missing.find((m) => m.code === prism.code && m.formation === 'cascade');
    if (casc) {
      const cx = g.slots.reduce((sum, s) => sum + s.x, 0) / g.slots.length;
      const cy = g.slots.reduce((sum, s) => sum + s.y, 0) / g.slots.length;
      const dist = Math.hypot(enemyX - cx, enemyY - cy);
      if (dist <= cascadeProximityPx) {
        return {
          groupId: g.id,
          slotIndex: casc.emptySlotIndex,
          actionKind: 'cascade',
        };
      }
    }
  }

  return null;
}

export function formatWaitSummary(waits: WaitTarget[]): string {
  return waits
    .map((w) => {
      const { domain, rank } = parsePrismCode(w.code);
      const label =
        domain === 'astral'
          ? rank === 1
            ? '晨星'
            : rank === 2
              ? '蚀月'
              : '天穹'
          : `${domain === 'ember' ? '烬' : domain === 'tide' ? '沧' : '翠'}${rank}`;
      return `${label}(余${w.remainingInWell})`;
    })
    .join(' · ');
}
