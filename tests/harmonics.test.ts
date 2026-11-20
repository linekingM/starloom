import { describe, expect, it } from 'vitest';
import {
  analyzeBastionWaits,
  evaluateConvergence,
  evaluatePlacementHint,
  evaluatePrismsAsGroup,
  findBestSiphonTarget,
  getGroupMissingCompletions,
  isBastionComplete,
  refreshCircuitFormation,
} from '../src/core/harmonics';
import { AstralWell, makePrismCode } from '../src/core/well';
import type { CircuitGroup, PrismDomain, PrismInstance, PrismRank } from '../src/types';

let idCounter = 1;
function p(domain: PrismDomain, rank: PrismRank): PrismInstance {
  return {
    id: `test-${idCounter++}`,
    domain,
    rank,
    code: makePrismCode(domain, rank),
  };
}

function makeGroup(
  id: string,
  prisms: Array<PrismInstance | null>,
  isKeystone = false
): CircuitGroup {
  const g: CircuitGroup = {
    id,
    name: id,
    isKeystone,
    slots: prisms.map((prism, i) => ({
      id: `${id}-${i}`,
      groupId: id,
      slotIndex: i,
      x: 100 + i * 50,
      y: 100,
      prism,
      cooldown: 0,
      recoil: 0,
      targetAngle: 0,
      totalDamage: 0,
    })),
    formation: 'none',
    bound: false,
    locked: false,
    supercharged: false,
    elementDomain: null,
    cascadeRanks: [],
    monolithCode: null,
    igniteFlash: 0,
    orbitalTimer: 0,
  };
  refreshCircuitFormation(g);
  return g;
}

describe('AstralWell finite 72-prism pool', () => {
  it('initializes with 72 prisms (18 types x 4 copies)', () => {
    const well = new AstralWell(42);
    expect(well.remaining).toBe(72);
    expect(well.countRemainingByCode('ember-1')).toBe(4);
    expect(well.countRemainingByCode('astral-3')).toBe(4);
  });

  it('draws deterministically and decrements counts accurately', () => {
    const well = new AstralWell(1234);
    const drawn = well.drawSpecific('tide-3');
    expect(drawn?.code).toBe('tide-3');
    expect(well.countRemainingByCode('tide-3')).toBe(3);
    expect(well.remaining).toBe(71);
  });
});

describe('Harmonic Formations (Cascade, Monolith, Anchor)', () => {
  it('detects Cascade regardless of slot order', () => {
    const res = evaluatePrismsAsGroup([p('ember', 4), p('ember', 2), p('ember', 3)], false);
    expect(res.formation).toBe('cascade');
    expect(res.elementDomain).toBe('ember');
    expect(res.cascadeRanks).toEqual([2, 3, 4]);
  });

  it('rejects Astral Cascade (honors only form Monolith or Anchor)', () => {
    const res = evaluatePrismsAsGroup([p('astral', 1), p('astral', 2), p('astral', 3)], false);
    expect(res.formation).toBe('none');
  });

  it('detects Elemental and Astral Monoliths', () => {
    const res = evaluatePrismsAsGroup([p('astral', 2), p('astral', 2), p('astral', 2)], false);
    expect(res.formation).toBe('monolith');
    expect(res.monolithCode).toBe('astral-2');
  });

  it('detects Keystone Anchor pair', () => {
    const ok = evaluatePrismsAsGroup([p('jade', 5), p('jade', 5)], true);
    expect(ok.formation).toBe('anchor');
    const bad = evaluatePrismsAsGroup([p('jade', 4), p('jade', 5)], true);
    expect(bad.formation).toBe('none');
  });
});

describe('Wait / Tenpai Analyzer & Placement Hints', () => {
  it('identifies two-sided open wait (2-3 waits on 1 and 4)', () => {
    const c0 = makeGroup('c0', [p('ember', 1), p('ember', 2), p('ember', 3)]);
    const c1 = makeGroup('c1', [p('tide', 2), p('tide', 2), p('tide', 2)]);
    const c2 = makeGroup('c2', [p('jade', 2), p('jade', 3), null]);
    const ks = makeGroup('ks', [p('astral', 1), p('astral', 1)], true);

    const well = new AstralWell(7);
    const waits = analyzeBastionWaits([c0, c1, c2, ks], well);
    const codes = waits.map((w) => w.code).sort();
    expect(codes).toEqual(['jade-1', 'jade-4']);
    expect(waits.every((w) => w.remainingInWell === 4)).toBe(true);
  });

  it('identifies closed gutshot wait (2-4 waits on 3)', () => {
    const g = makeGroup('c0', [p('tide', 2), p('tide', 4), null]);
    const missing = getGroupMissingCompletions(g);
    expect(missing.map((m) => m.code)).toEqual(['tide-3']);
  });

  it('detects Supercharge placement hint when matching 4th copy onto Monolith', () => {
    const mono = makeGroup('c0', [p('ember', 5), p('ember', 5), p('ember', 5)]);
    expect(evaluatePlacementHint(mono, 0, p('ember', 5))).toBe('supercharge');
    expect(evaluatePlacementHint(mono, 0, p('ember', 4))).toBe('none');
  });

  it('prioritizes Grand Convergence Siphon over normal Monolith/Cascade', () => {
    const c0 = makeGroup('c0', [p('ember', 1), p('ember', 2), p('ember', 3)]);
    const c1 = makeGroup('c1', [p('tide', 2), p('tide', 2), p('tide', 2)]);
    const c2 = makeGroup('c2', [p('jade', 2), p('jade', 3), null]);
    const ks = makeGroup('ks', [p('astral', 1), p('astral', 1)], true);

    const match = findBestSiphonTarget([c0, c1, c2, ks], p('jade', 4), 900, 900);
    expect(match?.actionKind).toBe('convergence');
    expect(match?.groupId).toBe('c2');
  });
});

describe('Harmonic Archetypes (Yaku Soul Evaluation)', () => {
  it('evaluates Monochrome Tide + Pure Cascade + Unbound + Oath', () => {
    const circuits = [
      makeGroup('c0', [p('ember', 1), p('ember', 2), p('ember', 3)]),
      makeGroup('c1', [p('ember', 2), p('ember', 3), p('ember', 4)]),
      makeGroup('c2', [p('ember', 3), p('ember', 4), p('ember', 5)]),
      makeGroup('ks', [p('ember', 5), p('ember', 5)], true),
    ];
    expect(isBastionComplete(circuits)).toBe(true);

    const res = evaluateConvergence(circuits, {
      isSelfDrawn: true,
      isOathFulfilled: true,
      isUnbound: true,
      isSurgeFinish: false,
      wave: 6,
    });

    const ids = res.archetypes.map((a) => a.id);
    expect(ids).toContain('monochrome');
    expect(ids).toContain('pure_cascade');
    expect(ids).toContain('unbound_purity');
    expect(ids).toContain('oath_fulfilled');
    expect(res.totalMultiplier).toBeGreaterThan(10);
  });

  it('evaluates Tri-Domain Flow + Heartland Pulse (all 2-3-4 across 3 domains)', () => {
    const circuits = [
      makeGroup('c0', [p('ember', 2), p('ember', 3), p('ember', 4)]),
      makeGroup('c1', [p('tide', 2), p('tide', 3), p('tide', 4)]),
      makeGroup('c2', [p('jade', 2), p('jade', 3), p('jade', 4)]),
      makeGroup('ks', [p('ember', 3), p('ember', 3)], true),
    ];

    const res = evaluateConvergence(circuits, {
      isSelfDrawn: false,
      isOathFulfilled: false,
      isUnbound: false,
      isSurgeFinish: false,
      wave: 4,
    });

    const ids = res.archetypes.map((a) => a.id);
    expect(ids).toContain('tri_domain_flow');
    expect(ids).toContain('heartland_pulse');
  });

  it('evaluates Astral Trinity + Monolith Bastion + Horizon Edge + Ascended Spire', () => {
    const c0 = makeGroup('c0', [p('astral', 1), p('astral', 1), p('astral', 1)]);
    c0.supercharged = true;
    const c1 = makeGroup('c1', [p('astral', 2), p('astral', 2), p('astral', 2)]);
    const c2 = makeGroup('c2', [p('tide', 5), p('tide', 5), p('tide', 5)]);
    const ks = makeGroup('ks', [p('tide', 1), p('tide', 1)], true);

    const res = evaluateConvergence([c0, c1, c2, ks], {
      isSelfDrawn: true,
      isOathFulfilled: false,
      isUnbound: true,
      isSurgeFinish: true,
      wave: 10,
    });

    const ids = res.archetypes.map((a) => a.id);
    expect(ids).toContain('astral_harmony');
    expect(ids).toContain('astral_trinity');
    expect(ids).toContain('monolith_bastion');
    expect(ids).toContain('horizon_edge');
    expect(ids).toContain('ascended_spire');
    expect(ids).toContain('supercharge_bonus');
  });
});

import { StarloomEngine } from '../src/core/engine';

describe('Iteration 3 Engine Mechanics (Archetype Buffs, Pillar Choice, Boss Shield, Tower Damage)', () => {
  it('applies permanent Archetype buffs and preserves player-selected Legacy Pillar', () => {
    const eng = new StarloomEngine('astrolabe', 99);
    eng.startNewGame('astrolabe', 99, true);

    const grab = (code: `${PrismDomain}-${PrismRank}`) => eng.well.drawSpecific(code)!;
    // Set up Pure Cascade + Unbound Purity waiting on jade-3
    eng.state.circuits[0].slots[0].prism = grab('ember-1');
    eng.state.circuits[0].slots[1].prism = grab('ember-2');
    eng.state.circuits[0].slots[2].prism = grab('ember-3');

    eng.state.circuits[1].slots[0].prism = grab('tide-2');
    eng.state.circuits[1].slots[1].prism = grab('tide-3');
    eng.state.circuits[1].slots[2].prism = grab('tide-4');

    eng.state.circuits[2].slots[0].prism = grab('jade-1');
    eng.state.circuits[2].slots[1].prism = grab('jade-2');
    eng.state.circuits[2].slots[2].prism = null;

    eng.state.circuits[3].slots[0].prism = grab('ember-4');
    eng.state.circuits[3].slots[1].prism = grab('ember-4');

    eng.state.circuits.forEach((c) => refreshCircuitFormation(c));

    eng.state.reserve[0] = grab('jade-3');
    expect(eng.placeFromReserve(0, 'circuit-2', 2)).toBe(true);

    // Grand Convergence triggered!
    expect(eng.state.phase).toBe('convergence_modal');
    expect(eng.state.archetypeBuffs.chainBonus).toBeGreaterThanOrEqual(1); // Pure Cascade
    expect(eng.state.archetypeBuffs.critBonus).toBeGreaterThanOrEqual(0.12); // Unbound Purity

    // Explicitly choose circuit-0 as Legacy Pillar!
    eng.continueAfterConvergence('circuit-0');
    expect(eng.state.circuits[0].formation).toBe('cascade');
    expect(eng.state.circuits[1].formation).toBe('none');
    expect(eng.state.circuits[2].formation).toBe('none');
  });

  it('tracks per-tower totalDamage accurately during combat', () => {
    const eng = new StarloomEngine('astrolabe', 55);
    eng.startNewGame('astrolabe', 55, true);
    eng.placeFromReserve(0, 'circuit-0', 0);
    eng.placeFromReserve(1, 'circuit-0', 1);
    eng.startNextWave();

    for (let i = 0; i < 300; i++) {
      eng.update(1 / 30, false);
    }

    const dealt =
      eng.state.circuits[0].slots[0].totalDamage + eng.state.circuits[0].slots[1].totalDamage;
    expect(dealt).toBeGreaterThan(50);
  });
});
