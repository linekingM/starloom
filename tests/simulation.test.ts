import { describe, expect, it } from 'vitest';
import { DRAW_COST, OATH_COST, StarloomEngine } from '../src/core/engine';
import { evaluatePlacementHint } from '../src/core/harmonics';

/**
 * Smart Harmonic Strategist AI:
 * - Never breaks an already-formed Circuit
 * - Actively completes Circuits (including swapping out placeholder prisms!)
 * - Seeds empty groups cleanly instead of cluttering 2-of-3 waiting circuits with junk
 * - Siphons eagerly to finish Circuits / Grand Convergence
 * - Declares Oath on Tenpai, draws from Well, and shatters unwanted pieces strategically
 */
function runSmartCampaign(mapId: string, seed: number) {
  const engine = new StarloomEngine(mapId, seed);
  engine.startNewGame(mapId, seed, true);

  let ticks = 0;
  const maxTicks = 60 * 600;

  while (ticks < maxTicks) {
    ticks++;
    const s = engine.state;

    if (s.phase === 'victory' || s.phase === 'gameover') break;
    if (s.phase === 'convergence_modal') {
      engine.continueAfterConvergence();
      continue;
    }
    if (s.phase === 'relic_choice') {
      const pick = s.pendingRelicChoices[0];
      if (pick) engine.chooseRelic(pick.id);
      continue;
    }

    if (s.activeSiphon) {
      engine.executeSiphon();
    }

    if (s.isReadyTenpai && !s.oathActive && s.starlight >= OATH_COST) {
      engine.declareOath();
    }

    if (ticks % 18 === 0) {
      let bestMove: {
        reserveIdx: number;
        groupId: string;
        slotIdx: number;
        priority: number;
      } | null = null;

      for (let r = 0; r < s.reserve.length; r++) {
        const prism = s.reserve[r];
        if (!prism) continue;
        for (const g of s.circuits) {
          if (g.formation !== 'none' && g.formation !== 'monolith') continue;
          for (let si = 0; si < g.slots.length; si++) {
            const hint = evaluatePlacementHint(g, si, prism);
            if (hint === 'none') continue;
            // Don't stuff neutral junk into a group that already has 2/3 harmonic seed!
            const filledCount = g.slots.filter((sl) => sl.prism !== null).length;
            if (hint === 'neutral' && filledCount >= (g.isKeystone ? 1 : 2)) continue;

            const prio =
              hint === 'supercharge'
                ? 100
                : hint === 'complete'
                  ? 85
                  : hint === 'partial'
                    ? 55
                    : 15;
            if (!bestMove || prio > bestMove.priority) {
              bestMove = { reserveIdx: r, groupId: g.id, slotIdx: si, priority: prio };
            }
          }
        }
      }

      if (bestMove) {
        engine.placeFromReserve(bestMove.reserveIdx, bestMove.groupId, bestMove.slotIdx);
      } else {
        // Draw if reserve has room and enough starlight, else shatter an unneeded reserve piece
        const emptyReserve = s.reserve.findIndex((r) => r === null);
        if (emptyReserve !== -1 && s.starlight >= DRAW_COST + 12) {
          engine.drawPrism();
        } else if (emptyReserve === -1) {
          // Shatter a prism that doesn't match any wait
          const waitCodes = new Set(s.waits.map((w) => w.code));
          const shatterIdx = s.reserve.findIndex((r) => r !== null && !waitCodes.has(r.code));
          if (shatterIdx !== -1) {
            engine.shatterFromReserve(shatterIdx);
          }
        }
      }

      // Start next wave promptly once at least 3 towers placed
      const placedCount = s.circuits.reduce(
        (acc, g) => acc + g.slots.filter((sl) => sl.prism !== null).length,
        0
      );
      if (!s.waveInProgress && placedCount >= 3 && s.waveCountdown > 0.5) {
        engine.startNextWave();
      }
    }

    engine.update(1 / 30, false);
  }

  return {
    phase: engine.state.phase,
    wave: engine.state.wave,
    coreHp: engine.state.coreHp,
    score: engine.state.score,
    convergences: engine.state.stats.convergencesTriggered,
    siphons: engine.state.stats.siphonsUsed,
    shatters: engine.state.stats.shattersUsed,
    highestMult: engine.state.stats.highestMultiplier,
    enemiesSlain: engine.state.stats.enemiesSlain,
    relics: engine.state.relics.length,
  };
}

/** Naive player who places prisms randomly without forming circuits or siphoning */
function runSloppyCampaign(mapId: string, seed: number) {
  const engine = new StarloomEngine(mapId, seed);
  engine.startNewGame(mapId, seed, true);

  for (let ticks = 0; ticks < 60 * 600; ticks++) {
    const s = engine.state;
    if (s.phase === 'victory' || s.phase === 'gameover') break;
    if (s.phase === 'convergence_modal') {
      engine.continueAfterConvergence();
      continue;
    }
    if (s.phase === 'relic_choice') {
      engine.chooseRelic(s.pendingRelicChoices[0].id);
      continue;
    }
    if (ticks % 25 === 0) {
      // Blindly fill empty pedestals without checking synergy
      for (let r = 0; r < s.reserve.length; r++) {
        if (!s.reserve[r]) continue;
        let placed = false;
        for (const g of s.circuits) {
          for (let si = 0; si < g.slots.length; si++) {
            if (!g.slots[si].prism && !g.locked) {
              engine.placeFromReserve(r, g.id, si);
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
      }
      if (!s.waveInProgress && s.waveCountdown > 0.5) engine.startNextWave();
    }
    engine.update(1 / 30, false);
  }

  return {
    phase: engine.state.phase,
    wave: engine.state.wave,
    coreHp: engine.state.coreHp,
    convergences: engine.state.stats.convergencesTriggered,
  };
}

describe('Headless AI Campaign Balance Simulation', () => {
  it('rewards Harmonic Strategist with multiple Grand Convergences, Siphons, and Campaign Victory', () => {
    const results = [101, 202, 303, 404, 505].map((seed) => runSmartCampaign('astrolabe', seed));
    const wins = results.filter((r) => r.phase === 'victory').length;
    const avgConvergences = results.reduce((s, r) => s + r.convergences, 0) / results.length;
    const avgSiphons = results.reduce((s, r) => s + r.siphons, 0) / results.length;

    console.log('Smart Strategist Results:', results);

    expect(wins).toBeGreaterThanOrEqual(4);
    expect(avgConvergences).toBeGreaterThanOrEqual(1.5);
    expect(avgSiphons).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => !Number.isNaN(r.score) && r.enemiesSlain > 60)).toBe(true);
  });

  it('punishes sloppy unformed placement so strategy truly matters', () => {
    const sloppy = [101, 202, 303].map((seed) => runSloppyCampaign('astrolabe', seed));
    console.log('Sloppy Random Results:', sloppy);
    // At least most sloppy runs should fail or take significant damage
    const losses = sloppy.filter((r) => r.phase === 'gameover').length;
    const avgHp = sloppy.reduce((s, r) => s + r.coreHp, 0) / sloppy.length;
    expect(losses >= 2 || avgHp < 10).toBe(true);
  });

  it('plays Twin Meridian and Eclipse Citadel cleanly with zero crashes', () => {
    const meridian = runSmartCampaign('meridian', 777);
    const citadel = runSmartCampaign('citadel', 888);
    console.log('Meridian Sim:', meridian);
    console.log('Citadel Sim:', citadel);

    expect(['victory', 'gameover']).toContain(meridian.phase);
    expect(['victory', 'gameover']).toContain(citadel.phase);
    expect(meridian.convergences + citadel.convergences).toBeGreaterThanOrEqual(2);
  });
});
