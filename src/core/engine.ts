import type {
  CircuitGroup,
  ConvergenceResult,
  EnemyEntity,
  GameState,
  MapDefinition,
  PedestalSlot,
  PrismCode,
  PrismDomain,
  PrismInstance,
  ProjectileEntity,
  SiphonOpportunity,
} from '../types';
import {
  analyzeBastionWaits,
  evaluateConvergence,
  evaluatePlacementHint,
  findBestSiphonTarget,
  isBastionComplete,
  refreshCircuitFormation,
} from './harmonics';
import { getMapById, getPolylineLength, samplePolyline } from './mapData';
import { aggregateRelicBonuses, RELIC_POOL } from './relics';
import {
  buildWaveDefinition,
  ENEMY_SPECS,
  TOTAL_CAMPAIGN_WAVES,
  type SpawnEntry,
  type WaveDefinition,
} from './waves';
import { AstralWell, DOMAIN_META, getPrismDisplayName } from './well';

export const DRAW_COST = 24;
export const SHATTER_REFUND = 10;
export const OATH_COST = 35;
export const BASE_SIPHON_COST = 15;
export const RESERVE_SIZE = 5;

export interface EngineCallbacks {
  onPlacePrism?: (domain: PrismDomain, rank: number) => void;
  onCircuitIgnite?: (kind: 'cascade' | 'monolith' | 'anchor', domain: PrismDomain) => void;
  onSupercharge?: (domain: PrismDomain) => void;
  onShatter?: (domain: PrismDomain) => void;
  onSiphonPrompt?: (opp: SiphonOpportunity) => void;
  onSiphonExecute?: (opp: SiphonOpportunity) => void;
  onOathDeclared?: () => void;
  onConvergence?: (result: ConvergenceResult) => void;
  onWaveStart?: (wave: number, isBossWave: boolean) => void;
  onWaveClear?: (wave: number) => void;
  onCoreHit?: (damage: number) => void;
  onTowerFire?: (domain: PrismDomain, isCrit: boolean) => void;
  onVictory?: () => void;
  onGameOver?: () => void;
}

export class StarloomEngine {
  public state: GameState;
  public well: AstralWell;
  public map: MapDefinition;
  public callbacks: EngineCallbacks;

  private spawnQueue: SpawnEntry[] = [];
  private spawnTimer = 0;
  private currentWaveDef: WaveDefinition | null = null;
  private nextEntityId = 1;
  private laneLengths: number[] = [];
  private jadeHealUsedThisWave = false;
  public shatterPulseCooldown = 0;
  private eclipseLaserTimer = 4.2;

  constructor(mapId = 'astrolabe', seed?: number, callbacks: EngineCallbacks = {}) {
    this.callbacks = callbacks;
    this.map = getMapById(mapId);
    this.laneLengths = this.map.lanes.map((lane) => getPolylineLength(lane));
    this.well = new AstralWell(seed);
    this.state = this.createInitialState(mapId);
  }

  private createInitialState(mapId: string): GameState {
    const map = getMapById(mapId);
    const circuits: CircuitGroup[] = map.circuits.map((cDef) => ({
      id: cDef.id,
      name: cDef.name,
      isKeystone: cDef.isKeystone,
      slots: cDef.slots.map((pos, idx) => ({
        id: `${cDef.id}-slot-${idx}`,
        groupId: cDef.id,
        slotIndex: idx,
        x: pos.x,
        y: pos.y,
        prism: null,
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
    }));

    return {
      phase: 'title',
      mapId: map.id,
      endlessMode: false,
      wave: 0,
      maxWaves: TOTAL_CAMPAIGN_WAVES,
      act: 1,
      waveInProgress: false,
      waveCountdown: 0,
      timeScale: 1,
      paused: false,
      starlight: 125,
      coreHp: 20,
      maxCoreHp: 20,
      score: 0,
      harmonicRank: 0,
      archetypeBuffs: {
        chainBonus: 0,
        rangeBonus: 0,
        fireRateBonus: 0,
        armorPierceBonus: 0,
        critBonus: 0,
        domainDamageBonus: { ember: 0, tide: 0, jade: 0, astral: 0 },
        eclipseLaserLevel: 0,
        achievedIds: [],
      },
      circuits,
      reserve: Array.from({ length: RESERVE_SIZE }, () => null),
      discardPile: [],
      wellRemaining: this.well.remaining,
      waits: [],
      isReadyTenpai: false,
      oathActive: false,
      usedSiphonThisCycle: false,
      lastDrawWasSurge: false,
      activeSiphon: null,
      lastConvergence: null,
      pendingRelicChoices: [],
      relics: [],
      enemies: [],
      projectiles: [],
      beams: [],
      particles: [],
      floatingTexts: [],
      elapsedTime: 0,
      screenShake: 0,
      convergenceFlash: 0,
      shatterWaveFlash: null,
      waveBanner: null,
      selection: null,
      tutorialStep: 0,
      stats: {
        wavesCleared: 0,
        enemiesSlain: 0,
        convergencesTriggered: 0,
        siphonsUsed: 0,
        shattersUsed: 0,
        superchargesUsed: 0,
        highestMultiplier: 0,
        bestArchetypeNames: [],
        score: 0,
      },
    };
  }

  public startNewGame(mapId: string, seed?: number, skipTutorial = false): void {
    this.map = getMapById(mapId);
    this.laneLengths = this.map.lanes.map((lane) => getPolylineLength(lane));
    this.well = new AstralWell(seed);
    this.state = this.createInitialState(mapId);
    this.state.phase = 'playing';
    this.state.tutorialStep = skipTutorial ? 3 : 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.currentWaveDef = null;
    this.jadeHealUsedThisWave = false;

    // Deal an inviting opening 5-prism hand (guaranteed 2-prism harmonic seed for smooth early play)
    const openingDomains: PrismDomain[] = ['ember', 'tide', 'jade'];
    const seedDomain = this.well.getRng().pick(openingDomains);
    const seed1 = this.well.drawSpecific(`${seedDomain}-2` as PrismCode);
    const seed2 = this.well.drawSpecific(`${seedDomain}-3` as PrismCode);
    const opening: Array<PrismInstance | null> = [
      seed1 ?? this.well.draw(),
      seed2 ?? this.well.draw(),
      this.well.draw(),
      this.well.draw(),
      this.well.draw(),
    ];
    this.state.reserve = opening;
    this.state.wellRemaining = this.well.remaining;
    this.state.waveCountdown = 6.0;
    this.recomputeHarmonicState();
  }

  public startNextWave(): boolean {
    if (this.state.phase !== 'playing' || this.state.waveInProgress) return false;

    this.state.wave += 1;
    this.state.act = Math.min(4, Math.ceil(this.state.wave / 4));
    this.state.waveInProgress = true;
    this.state.waveCountdown = 0;
    this.jadeHealUsedThisWave = false;

    this.currentWaveDef = buildWaveDefinition(this.state.wave, this.map.lanes.length);
    this.spawnQueue = [...this.currentWaveDef.entries];
    this.spawnTimer = this.spawnQueue.length > 0 ? this.spawnQueue[0].delay : 0;

    // Free wave-start draw into first open reserve slot if available
    if (this.state.wave > 1) {
      const emptyReserve = this.state.reserve.findIndex((r) => r === null);
      if (emptyReserve !== -1) {
        const drawn = this.drawFromWellSafe();
        if (drawn) {
          this.state.reserve[emptyReserve] = drawn;
        }
      }
    }

    const isBossWave = this.spawnQueue.some((e) => e.kind === 'warden' || e.kind === 'sovereign');
    this.state.waveBanner = {
      title: this.currentWaveDef.title,
      subtitle: this.currentWaveDef.subtitle,
      isBoss: isBossWave,
      timer: isBossWave ? 3.2 : 2.3,
      maxTimer: isBossWave ? 3.2 : 2.3,
    };
    this.callbacks.onWaveStart?.(this.state.wave, isBossWave);
    return true;
  }

  public getCurrentWaveDefinition(): WaveDefinition | null {
    return this.currentWaveDef;
  }

  private drawFromWellSafe(preferCodes: PrismCode[] = [], chance = 0): PrismInstance | null {
    if (this.well.remaining === 0) {
      // Automatically recycle discarded prisms back into the Well when depleted
      const activeCodes = this.collectBoardAndReserveCodes();
      this.well.refill(activeCodes);
      this.state.discardPile = [];
      this.addFloatingText(640, 120, '星池重盈 · 律晶回流', '#f4d35e', 18);
    }
    const prism =
      preferCodes.length > 0 && chance > 0
        ? this.well.drawPreferring(preferCodes, chance)
        : this.well.draw();
    this.state.wellRemaining = this.well.remaining;
    return prism;
  }

  private collectBoardAndReserveCodes(): PrismCode[] {
    const codes: PrismCode[] = [];
    for (const c of this.state.circuits) {
      for (const s of c.slots) {
        if (s.prism) codes.push(s.prism.code);
      }
    }
    for (const r of this.state.reserve) {
      if (r) codes.push(r.code);
    }
    return codes;
  }

  public drawPrism(free = false, isSurge = false): PrismInstance | null {
    if (this.state.phase !== 'playing') return null;
    const emptyIdx = this.state.reserve.findIndex((r) => r === null);
    if (emptyIdx === -1) return null;
    if (!free && this.state.starlight < DRAW_COST) return null;

    if (!free) {
      this.state.starlight -= DRAW_COST;
    }

    const drawn = this.drawFromWellSafe();
    if (!drawn) return null;

    this.state.reserve[emptyIdx] = drawn;
    this.state.lastDrawWasSurge = isSurge;
    return drawn;
  }

  /** Sort non-empty Reserve prisms cleanly by Domain (Ember -> Tide -> Jade -> Astral) then Rank */
  public sortReserve(): void {
    const order: Record<PrismDomain, number> = { ember: 0, tide: 1, jade: 2, astral: 3 };
    const filled = this.state.reserve
      .filter((p): p is PrismInstance => p !== null)
      .sort((a, b) => {
        const dDiff = order[a.domain] - order[b.domain];
        return dDiff !== 0 ? dDiff : a.rank - b.rank;
      });
    this.state.reserve = Array.from({ length: RESERVE_SIZE }, (_, i) => filled[i] ?? null);
    if (this.state.selection?.source === 'reserve') {
      this.state.selection = null;
    }
  }

  public placeFromReserve(
    reserveIndex: number,
    groupId: string,
    slotIndex: number
  ): boolean {
    if (this.state.phase !== 'playing') return false;
    const prism = this.state.reserve[reserveIndex];
    if (!prism) return false;

    const group = this.state.circuits.find((g) => g.id === groupId);
    if (!group) return false;

    const hint = evaluatePlacementHint(group, slotIndex, prism);

    // Case 1: Supercharge (4th copy onto an existing Monolith!)
    if (hint === 'supercharge') {
      this.state.reserve[reserveIndex] = null;
      this.applySupercharge(group, prism);
      this.state.selection = null;
      return true;
    }

    // If Oath is active, you may ONLY place a winning wait prism!
    if (this.state.oathActive) {
      const isWinning = this.state.waits.some(
        (w) => w.code === prism.code && w.groupId === groupId && w.slotIndex === slotIndex
      );
      if (!isWinning) return false;
    }

    if (group.locked) return false;
    const slot = group.slots[slotIndex];
    if (!slot) return false;

    const displaced = slot.prism;

    slot.prism = prism;
    this.state.reserve[reserveIndex] = displaced;
    this.state.selection = null;

    this.callbacks.onPlacePrism?.(prism.domain, prism.rank);
    this.spawnRingBurst(slot.x, slot.y, DOMAIN_META[prism.domain].primary, 12);

    if (this.state.tutorialStep === 0) {
      this.state.tutorialStep = 1;
    }

    this.onBoardChanged(group, true);
    return true;
  }

  public moveBetweenPedestals(
    fromGroupId: string,
    fromSlotIndex: number,
    toGroupId: string,
    toSlotIndex: number
  ): boolean {
    if (this.state.phase !== 'playing' || this.state.oathActive) return false;
    if (fromGroupId === toGroupId && fromSlotIndex === toSlotIndex) return false;

    const fromGroup = this.state.circuits.find((g) => g.id === fromGroupId);
    const toGroup = this.state.circuits.find((g) => g.id === toGroupId);
    if (!fromGroup || !toGroup) return false;
    if (fromGroup.locked) return false;

    const fromSlot = fromGroup.slots[fromSlotIndex];
    const toSlot = toGroup.slots[toSlotIndex];
    if (!fromSlot || !toSlot || !fromSlot.prism) return false;

    // Allow supercharge by dragging a 4th copy from an unlocked pedestal onto a Monolith
    const hint = evaluatePlacementHint(toGroup, toSlotIndex, fromSlot.prism);
    if (hint === 'supercharge') {
      const prism = fromSlot.prism;
      fromSlot.prism = null;
      refreshCircuitFormation(fromGroup);
      this.applySupercharge(toGroup, prism);
      this.state.selection = null;
      return true;
    }

    if (toGroup.locked) return false;

    const temp = toSlot.prism;
    toSlot.prism = fromSlot.prism;
    fromSlot.prism = temp;
    this.state.selection = null;

    this.callbacks.onPlacePrism?.(toSlot.prism.domain, toSlot.prism.rank);
    refreshCircuitFormation(fromGroup);
    this.onBoardChanged(toGroup, true);
    return true;
  }

  public recallToReserve(groupId: string, slotIndex: number, targetReserveIndex?: number): boolean {
    if (this.state.phase !== 'playing' || this.state.oathActive) return false;
    const group = this.state.circuits.find((g) => g.id === groupId);
    if (!group || group.locked) return false;
    const slot = group.slots[slotIndex];
    if (!slot || !slot.prism) return false;

    const idx =
      targetReserveIndex !== undefined && this.state.reserve[targetReserveIndex] === null
        ? targetReserveIndex
        : this.state.reserve.findIndex((r) => r === null);
    if (idx === -1) return false;

    this.state.reserve[idx] = slot.prism;
    slot.prism = null;
    this.state.selection = null;
    refreshCircuitFormation(group);
    this.recomputeHarmonicState();
    return true;
  }

  public shatterFromReserve(reserveIndex: number): boolean {
    if (this.state.phase !== 'playing') return false;
    const prism = this.state.reserve[reserveIndex];
    if (!prism) return false;

    this.state.reserve[reserveIndex] = null;
    this.state.selection = null;
    this.executeShatterEffect(prism);
    return true;
  }

  public shatterFromPedestal(groupId: string, slotIndex: number): boolean {
    if (this.state.phase !== 'playing' || this.state.oathActive) return false;
    const group = this.state.circuits.find((g) => g.id === groupId);
    if (!group || group.locked) return false;
    const slot = group.slots[slotIndex];
    if (!slot || !slot.prism) return false;

    const prism = slot.prism;
    slot.prism = null;
    this.state.selection = null;
    refreshCircuitFormation(group);
    this.executeShatterEffect(prism);
    this.recomputeHarmonicState();
    return true;
  }

  private executeShatterEffect(prism: PrismInstance): void {
    this.state.discardPile.push(prism);
    this.state.starlight += SHATTER_REFUND;
    this.state.stats.shattersUsed += 1;
    this.state.lastDrawWasSurge = false;

    const meta = DOMAIN_META[prism.domain];
    this.callbacks.onShatter?.(prism.domain);

    // If pulse is still cooling down, only discard + refund Starlight (prevents spam exploit)
    if (this.shatterPulseCooldown > 0) {
      this.addFloatingText(640, 310, `化尘回流 · +${SHATTER_REFUND} 星辉`, meta.light, 15);
      return;
    }

    this.shatterPulseCooldown = 2.6;
    const bonuses = this.getBonuses();
    const powerMult = bonuses.shatterPowerMult;
    this.state.shatterWaveFlash = { color: meta.primary, timer: 0.45 };

    if (prism.domain === 'ember') {
      const dmg = Math.round((38 + this.state.wave * 10) * powerMult);
      for (const e of this.state.enemies) {
        if (e.dead) continue;
        this.damageEnemy(e, dmg, 0.5, false, meta.primary);
        e.burnTimer = Math.max(e.burnTimer, 3.8);
        e.burnDps = Math.max(e.burnDps, 14 + this.state.wave * 3);
      }
      this.addFloatingText(640, 290, `化尘爆炎 · 全场灼烧 ${dmg}`, meta.light, 19);
    } else if (prism.domain === 'tide') {
      const dmg = Math.round((16 + this.state.wave * 5) * powerMult);
      for (const e of this.state.enemies) {
        if (e.dead) continue;
        this.damageEnemy(e, dmg, 0.25, false, meta.primary);
        e.slowTimer = Math.max(e.slowTimer, 3.4 * powerMult);
        e.slowFactor = Math.max(e.slowFactor, 0.48);
      }
      this.addFloatingText(640, 290, '化尘寒潮 · 全场滞缓', meta.light, 19);
    } else if (prism.domain === 'jade') {
      for (const e of this.state.enemies) {
        if (e.dead) continue;
        e.shatterMarkTimer = Math.max(e.shatterMarkTimer, 4.8 * powerMult);
      }
      let msg = '化尘破甲 · 易伤印记';
      if (!this.jadeHealUsedThisWave && this.state.coreHp < this.state.maxCoreHp) {
        this.state.coreHp = Math.min(this.state.maxCoreHp, this.state.coreHp + 1);
        this.jadeHealUsedThisWave = true;
        msg = '化尘生机 · 核心 +1 且全场破甲';
      }
      this.addFloatingText(640, 290, msg, meta.light, 19);
    } else {
      // Astral shatter
      const extraStarlight = Math.round(25 * powerMult);
      this.state.starlight += extraStarlight;
      for (const e of this.state.enemies) {
        if (e.dead) continue;
        e.stunTimer = Math.max(e.stunTimer, 0.9 * powerMult);
        e.pathProgress = Math.max(0, e.pathProgress - 0.035);
      }
      this.addFloatingText(640, 290, `化尘星辉 · +${extraStarlight} 星辉与震退`, meta.light, 19);
    }

    if (this.state.tutorialStep === 2) {
      this.state.tutorialStep = 3;
    }
  }

  private applySupercharge(group: CircuitGroup, fourthPrism: PrismInstance): void {
    group.supercharged = true;
    group.locked = true;
    group.igniteFlash = 1.25;
    this.state.stats.superchargesUsed += 1;
    this.state.screenShake = Math.max(this.state.screenShake, 0.28);

    const cx = group.slots.reduce((s, p) => s + p.x, 0) / group.slots.length;
    const cy = group.slots.reduce((s, p) => s + p.y, 0) / group.slots.length;
    this.spawnRingBurst(cx, cy, '#f4d35e', 28);
    this.addFloatingText(cx, cy - 28, '极律升华！岭上星落', '#fff0bf', 22);
    this.callbacks.onSupercharge?.(fourthPrism.domain);

    // Shockwave damage around the ascended circuit
    for (const e of this.state.enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - cx, e.y - cy) < 260) {
        this.damageEnemy(e, 95 + this.state.wave * 20, 1.0, true, '#f4d35e');
        e.stunTimer = Math.max(e.stunTimer, 0.7);
      }
    }

    // Grant free Surge Draw (岭上星落 / Rinshan!)
    this.drawPrism(true, true);
    this.recomputeHarmonicState();
  }

  public declareOath(): boolean {
    if (this.state.phase !== 'playing') return false;
    if (!this.state.isReadyTenpai || this.state.oathActive) return false;
    if (this.state.starlight < OATH_COST) return false;

    this.state.starlight -= OATH_COST;
    this.state.oathActive = true;
    this.state.selection = null;
    this.state.screenShake = Math.max(this.state.screenShake, 0.22);

    this.callbacks.onOathDeclared?.();
    this.addFloatingText(640, 220, '鸣誓定阵！全阵攻速 +35%', '#f4d35e', 24);
    this.spawnRingBurst(this.map.corePosition.x, this.map.corePosition.y, '#f4d35e', 30);
    return true;
  }

  public executeSiphon(): boolean {
    const opp = this.state.activeSiphon;
    if (this.state.phase !== 'playing' || !opp) return false;
    if (this.state.starlight < opp.cost) return false;

    const enemy = this.state.enemies.find((e) => e.id === opp.enemyId && !e.dead);
    const group = this.state.circuits.find((g) => g.id === opp.targetGroupId);
    if (!enemy || !group || !enemy.carriedPrism) {
      this.state.activeSiphon = null;
      return false;
    }

    this.state.starlight -= opp.cost;
    const prism = enemy.carriedPrism;
    enemy.carriedPrism = null;
    enemy.stunTimer = Math.max(enemy.stunTimer, 1.25);

    // Siphon deals immediate shatter damage to the victim enemy!
    const siphonDmg = Math.round(enemy.maxHp * 0.22 + 65 + this.state.wave * 12);
    this.damageEnemy(enemy, siphonDmg, 0.85, true, '#70e4ff');

    const targetSlot = group.slots[opp.targetSlotIndex] ?? group.slots[0];
    this.state.beams.push({
      id: `beam-${this.nextEntityId++}`,
      x1: enemy.x,
      y1: enemy.y,
      x2: targetSlot.x,
      y2: targetSlot.y,
      color: '#f4d35e',
      width: 6,
      life: 0.45,
      maxLife: 0.45,
    });

    this.state.activeSiphon = null;
    this.state.stats.siphonsUsed += 1;
    this.callbacks.onSiphonExecute?.(opp);

    if (this.state.tutorialStep === 2) {
      this.state.tutorialStep = 3;
    }

    if (opp.actionKind === 'supercharge') {
      this.state.usedSiphonThisCycle = true;
      group.bound = true;
      this.applySupercharge(group, prism);
      return true;
    }

    // Place the siphoned prism into the target slot!
    targetSlot.prism = prism;

    if (opp.actionKind === 'convergence') {
      // Ron finisher! (does not strip Unbound Purity if no prior siphon was used, matching Riichi Ron vs Open Melds!)
      this.onBoardChanged(group, false);
      return true;
    }

    // Standard open meld siphon (Pon / Chi): marks circuit as Bound & Locked!
    group.bound = true;
    group.locked = true;
    this.state.usedSiphonThisCycle = true;
    this.onBoardChanged(group, false);
    return true;
  }

  public dismissSiphon(): void {
    const opp = this.state.activeSiphon;
    if (!opp) return;
    const enemy = this.state.enemies.find((e) => e.id === opp.enemyId);
    if (enemy) {
      enemy.siphonDismissed = true;
    }
    this.state.activeSiphon = null;
  }

  private onBoardChanged(changedGroup: CircuitGroup, isSelfDrawn: boolean): void {
    const newlyIgnited = refreshCircuitFormation(changedGroup);
    if (newlyIgnited && changedGroup.formation !== 'none' && changedGroup.elementDomain) {
      this.callbacks.onCircuitIgnite?.(changedGroup.formation, changedGroup.elementDomain);
      const cx = changedGroup.slots.reduce((s, p) => s + p.x, 0) / changedGroup.slots.length;
      const cy = changedGroup.slots.reduce((s, p) => s + p.y, 0) / changedGroup.slots.length;
      const label =
        changedGroup.formation === 'cascade'
          ? '流律共鸣！'
          : changedGroup.formation === 'monolith'
            ? '凝律共鸣！'
            : '双枢定心！';
      this.addFloatingText(cx, cy - 26, label, '#fff0bf', 20);
      this.spawnRingBurst(cx, cy, DOMAIN_META[changedGroup.elementDomain].light, 22);

      if (this.state.tutorialStep === 1) {
        this.state.tutorialStep = 2;
      }
    }

    // Check for Grand Convergence!
    if (isBastionComplete(this.state.circuits)) {
      this.triggerGrandConvergence(isSelfDrawn);
      return;
    }

    // If a move didn't trigger Convergence, clear the surge flag unless it was just drawn
    if (!isSelfDrawn) {
      this.state.lastDrawWasSurge = false;
    }
    this.recomputeHarmonicState();
  }

  private triggerGrandConvergence(isSelfDrawn: boolean): void {
    const result = evaluateConvergence(this.state.circuits, {
      isSelfDrawn,
      isOathFulfilled: this.state.oathActive,
      isUnbound: !this.state.usedSiphonThisCycle,
      isSurgeFinish: isSelfDrawn && this.state.lastDrawWasSurge,
      wave: Math.max(1, this.state.wave),
    });

    this.state.lastConvergence = result;
    this.state.score += result.totalScore;
    this.state.starlight += result.starlightReward;
    this.state.coreHp = Math.min(this.state.maxCoreHp, this.state.coreHp + result.coreHeal);
    this.state.harmonicRank += 1;
    this.state.convergenceFlash = 1.0;
    this.state.screenShake = 0.55;
    this.state.activeSiphon = null;

    this.state.stats.convergencesTriggered += 1;
    this.state.stats.score = this.state.score;
    if (result.totalMultiplier > this.state.stats.highestMultiplier) {
      this.state.stats.highestMultiplier = result.totalMultiplier;
      this.state.stats.bestArchetypeNames = result.archetypes.map((a) => a.name);
    }

    // Apply real signature Archetype superpowers (both permanent Bastion auras & immediate cataclysm!)
    const buffs = this.state.archetypeBuffs;
    const dominantDomain =
      this.state.circuits.find((c) => !c.isKeystone && c.elementDomain)?.elementDomain ?? 'ember';
    for (const arch of result.archetypes) {
      if (!buffs.achievedIds.includes(arch.id)) {
        buffs.achievedIds.push(arch.id);
      }
      switch (arch.id) {
        case 'monochrome':
          buffs.domainDamageBonus[dominantDomain] = Math.min(
            1.25,
            buffs.domainDamageBonus[dominantDomain] + 0.25
          );
          break;
        case 'astral_trinity':
          buffs.eclipseLaserLevel += 2;
          this.state.coreHp = Math.min(this.state.maxCoreHp, this.state.coreHp + 2);
          break;
        case 'astral_harmony':
        case 'ascended_spire':
          buffs.eclipseLaserLevel += 1;
          break;
        case 'pure_cascade':
        case 'tri_domain_flow':
          buffs.chainBonus = Math.min(4, buffs.chainBonus + 1);
          break;
        case 'monolith_bastion':
          buffs.armorPierceBonus = Math.min(0.8, buffs.armorPierceBonus + 0.25);
          break;
        case 'horizon_edge':
          buffs.rangeBonus = Math.min(0.6, buffs.rangeBonus + 0.16);
          break;
        case 'heartland_pulse':
          buffs.fireRateBonus = Math.min(0.75, buffs.fireRateBonus + 0.18);
          break;
        case 'unbound_purity':
          buffs.critBonus = Math.min(0.45, buffs.critBonus + 0.12);
          break;
      }
    }

    // Cataclysmic harmonic blast across ALL active enemies!
    const hasTriDomain = result.archetypes.some((a) => a.id === 'tri_domain_flow');
    const hasMonochrome = result.archetypes.some((a) => a.id === 'monochrome');
    const baseBlast = (210 + this.state.wave * 55) * Math.min(8, result.totalMultiplier);
    for (const e of this.state.enemies) {
      if (e.dead) continue;
      e.shieldHp = 0; // Grand Convergence shatters all Boss Eclipse Shields!
      const dmg = e.isBoss ? Math.min(Math.round(e.maxHp * 0.52), Math.round(baseBlast)) : Math.round(baseBlast);
      this.damageEnemy(e, dmg, 1.0, true, '#fff0bf');
      e.stunTimer = Math.max(e.stunTimer, 1.6);
      if (hasTriDomain || (hasMonochrome && dominantDomain === 'ember')) {
        e.burnTimer = Math.max(e.burnTimer, 5.0);
        e.burnDps = Math.max(e.burnDps, 28 + this.state.wave * 5);
      }
      if (hasTriDomain || (hasMonochrome && dominantDomain === 'tide')) {
        e.slowTimer = Math.max(e.slowTimer, 5.0);
        e.slowFactor = Math.max(e.slowFactor, 0.55);
      }
      if (hasTriDomain || (hasMonochrome && dominantDomain === 'jade')) {
        e.shatterMarkTimer = Math.max(e.shatterMarkTimer, 6.0);
      }
      this.spawnRingBurst(e.x, e.y, '#f4d35e', 14);
    }

    this.callbacks.onConvergence?.(result);
    this.state.phase = 'convergence_modal';
  }

  /**
   * Called after player celebrates the Grand Convergence modal.
   * Keeps the chosen (or strongest) formed Circuit as a Legacy Pillar, resets remaining slots,
   * refills the 72-prism Well, deals 4 fresh Reserve prisms, and offers a Relic if < 4 owned.
   */
  public continueAfterConvergence(preferredPreserveId?: string): void {
    if (this.state.phase !== 'convergence_modal') return;

    const mainCircuits = this.state.circuits.filter((c) => !c.isKeystone);
    mainCircuits.sort((a, b) => {
      const score = (g: CircuitGroup) =>
        (g.supercharged ? 10 : 0) + (g.formation === 'monolith' ? 5 : g.formation === 'cascade' ? 3 : 0);
      return score(b) - score(a);
    });
    const validPreferred = mainCircuits.find((c) => c.id === preferredPreserveId);
    const preserveId = validPreferred?.id ?? mainCircuits[0]?.id ?? '';

    for (const g of this.state.circuits) {
      if (g.id === preserveId) {
        // Keep prisms intact & unlock it so player can freely pivot OR keep its firepower!
        g.bound = false;
        g.locked = g.supercharged;
      } else {
        for (const s of g.slots) {
          s.prism = null;
        }
        g.formation = 'none';
        g.bound = false;
        g.locked = false;
        g.supercharged = false;
        g.elementDomain = null;
        g.cascadeRanks = [];
        g.monolithCode = null;
      }
    }

    // Reset cycle flags
    this.state.oathActive = false;
    this.state.usedSiphonThisCycle = false;
    this.state.lastDrawWasSurge = false;
    this.state.discardPile = [];

    // Refill Well excluding preserved circuit prisms & current reserve
    const keptCodes = this.collectBoardAndReserveCodes();
    this.well.refill(keptCodes);

    // Top up reserve up to 4 prisms for immediate rebuilding
    let filledCount = this.state.reserve.filter((r) => r !== null).length;
    for (let i = 0; i < this.state.reserve.length && filledCount < 4; i++) {
      if (this.state.reserve[i] === null) {
        this.state.reserve[i] = this.well.draw();
        filledCount++;
      }
    }
    this.state.wellRemaining = this.well.remaining;
    this.recomputeHarmonicState();

    // Offer a Constellation Relic choice if player has fewer than 4 relics
    if (this.state.relics.length < 4) {
      const ownedIds = new Set(this.state.relics.map((r) => r.id));
      const available = RELIC_POOL.filter((r) => !ownedIds.has(r.id));
      if (available.length > 0) {
        const shuffled = this.well.getRng().shuffle([...available]);
        this.state.pendingRelicChoices = shuffled.slice(0, 3);
        this.state.phase = 'relic_choice';
        return;
      }
    }

    this.state.phase = 'playing';
  }

  public chooseRelic(relicId: string): boolean {
    if (this.state.phase !== 'relic_choice') return false;
    const relic = this.state.pendingRelicChoices.find((r) => r.id === relicId);
    if (!relic) return false;

    this.state.relics.push(relic);
    if (relic.maxCoreHpBonus) {
      this.state.maxCoreHp += relic.maxCoreHpBonus;
      this.state.coreHp = Math.min(this.state.maxCoreHp, this.state.coreHp + relic.maxCoreHpBonus);
    }

    this.state.pendingRelicChoices = [];
    this.state.phase = 'playing';
    this.addFloatingText(640, 260, `星印铭刻：${relic.name}`, relic.accent, 22);
    return true;
  }

  public continueEndlessMode(): void {
    if (this.state.phase !== 'victory') return;
    this.state.endlessMode = true;
    this.state.phase = 'playing';
    this.state.waveCountdown = 5.0;
  }

  private recomputeHarmonicState(): void {
    for (const g of this.state.circuits) {
      refreshCircuitFormation(g);
    }
    this.state.waits = analyzeBastionWaits(this.state.circuits, this.well);
    this.state.isReadyTenpai = this.state.waits.length > 0;
  }

  public getBonuses() {
    const keystone = this.state.circuits.find((c) => c.isKeystone);
    const hasKeystoneAnchor = keystone?.formation === 'anchor';
    return aggregateRelicBonuses(
      this.state.relics,
      this.state.harmonicRank,
      this.state.oathActive,
      hasKeystoneAnchor
    );
  }

  /** Advance simulation by `rawDt` seconds (deterministic for both browser & headless tests) */
  public update(rawDt: number, autoSlowOnSiphon = true): void {
    if (this.state.phase !== 'playing') return;

    const clampedDt = Math.min(0.05, Math.max(0, rawDt));

    // Visual-only timers decay gently even when paused? Keep decay tied to active sim
    if (this.state.paused) return;

    const siphonSlowFactor = this.state.activeSiphon && autoSlowOnSiphon ? 0.24 : 1.0;
    const dt = clampedDt * this.state.timeScale * siphonSlowFactor;

    this.state.elapsedTime += dt;
    this.shatterPulseCooldown = Math.max(0, this.shatterPulseCooldown - dt);
    this.state.screenShake = Math.max(0, this.state.screenShake - clampedDt * 1.4);
    this.state.convergenceFlash = Math.max(0, this.state.convergenceFlash - clampedDt * 1.1);
    if (this.state.shatterWaveFlash) {
      this.state.shatterWaveFlash.timer -= clampedDt;
      if (this.state.shatterWaveFlash.timer <= 0) {
        this.state.shatterWaveFlash = null;
      }
    }
    if (this.state.waveBanner) {
      this.state.waveBanner.timer -= clampedDt;
      if (this.state.waveBanner.timer <= 0) {
        this.state.waveBanner = null;
      }
    }

    // Periodic Eclipse Orbital Laser unlocked by Astral Harmony / Astral Trinity / Ascended Spire!
    if (this.state.archetypeBuffs.eclipseLaserLevel > 0 && this.state.enemies.length > 0) {
      this.eclipseLaserTimer -= dt;
      if (this.eclipseLaserTimer <= 0) {
        this.eclipseLaserTimer = Math.max(2.4, 4.4 - this.state.archetypeBuffs.eclipseLaserLevel * 0.45);
        const target = this.pickHighestHpEnemy();
        if (target) {
          const laserDmg = Math.round(
            (110 + this.state.wave * 24) * (1 + this.state.archetypeBuffs.eclipseLaserLevel * 0.45)
          );
          this.damageEnemy(target, laserDmg, 1.0, true, '#fff0bf');
          this.state.beams.push({
            id: `beam-${this.nextEntityId++}`,
            x1: this.map.corePosition.x,
            y1: this.map.corePosition.y,
            x2: target.x,
            y2: target.y,
            color: '#fff0bf',
            width: 6,
            life: 0.36,
            maxLife: 0.36,
          });
          this.spawnRingBurst(target.x, target.y, '#f4d35e', 14);
        }
      }
    }

    // 1. Wave Countdown & Spawning
    if (!this.state.waveInProgress) {
      if (this.state.waveCountdown > 0) {
        this.state.waveCountdown -= dt;
        if (this.state.waveCountdown <= 0) {
          this.startNextWave();
        }
      }
    } else {
      this.updateSpawning(dt);
    }

    // 2. Update Enemies & Siphon Detection
    this.updateEnemies(dt);
    this.updateSiphonScan();

    // 3. Update Towers & Orbital Supercharges
    this.updateTowers(dt);

    // 4. Update Projectiles & VFX
    this.updateProjectiles(dt);
    this.updateVisualEffects(clampedDt);

    // 5. Check Wave Clear / Victory / Defeat
    this.checkWaveCompletion();
  }

  private updateSpawning(dt: number): void {
    if (this.spawnQueue.length === 0) return;

    this.spawnTimer -= dt;
    while (this.spawnQueue.length > 0 && this.spawnTimer <= 0) {
      const entry = this.spawnQueue.shift()!;
      this.spawnEnemy(entry);
      this.spawnTimer += this.spawnQueue.length > 0 ? this.spawnQueue[0].delay : 0;
    }
  }

  private spawnEnemy(entry: SpawnEntry): void {
    const spec = ENEMY_SPECS[entry.kind];
    const laneIdx = entry.laneIndex % this.map.lanes.length;
    const startPos = samplePolyline(this.map.lanes[laneIdx], 0);
    const hpMult = entry.hpMultiplier ?? 1;
    const maxHp = Math.round(spec.baseHp * hpMult);

    // Determine if this enemy carries a Prism from the finite shared Astral Well
    let carriedPrism: PrismInstance | null = null;
    if (this.well.getRng().next() < entry.carryPrismChance) {
      const waitCodes = this.state.waits.map((w) => w.code);
      // During Oath or Boss waves, slightly increase chance an enemy carries a needed prism from remaining Well!
      const preferChance = this.state.oathActive ? 0.55 : spec.isBoss ? 0.4 : 0.16;
      carriedPrism = this.drawFromWellSafe(waitCodes, preferChance);
    }

    const enemy: EnemyEntity = {
      id: `enemy-${this.nextEntityId++}`,
      kind: spec.kind,
      name: entry.customName ?? spec.name,
      isBoss: spec.isBoss,
      isElite: spec.isElite,
      laneIndex: laneIdx,
      pathProgress: 0,
      x: startPos.x,
      y: startPos.y,
      vx: startPos.dx * spec.speed,
      vy: startPos.dy * spec.speed,
      hp: maxHp,
      maxHp,
      armor: spec.armor,
      speed: spec.speed,
      reward: spec.reward,
      coreDamage: spec.coreDamage,
      radius: spec.radius,
      carriedPrism,
      siphonDismissed: false,
      burnTimer: 0,
      burnDps: 0,
      slowTimer: 0,
      slowFactor: 0,
      stunTimer: 0,
      shatterMarkTimer: 0,
      hitFlash: 0,
      shieldHp: 0,
      abilityTimer: spec.isBoss ? 5.5 : 999,
      dead: false,
      reachedCore: false,
    };

    this.state.enemies.push(enemy);
  }

  private updateEnemies(dt: number): void {
    const summonedMinions: EnemyEntity[] = [];

    for (const e of this.state.enemies) {
      if (e.dead) continue;

      e.hitFlash = Math.max(0, e.hitFlash - dt * 5);

      // Distinct Boss Signature Abilities!
      if (e.isBoss && e.stunTimer <= 0 && e.pathProgress > 0.08 && e.pathProgress < 0.88) {
        e.abilityTimer -= dt;
        if (e.abilityTimer <= 0) {
          if (e.kind === 'warden' && this.state.wave <= 5) {
            // Act I Boss: Eclipse Shield (shattered by Monolith crits / Siphon / Convergence)
            e.abilityTimer = 7.5;
            e.shieldHp = Math.round(e.maxHp * 0.14);
            this.spawnRingBurst(e.x, e.y, '#a48ae8', 12);
            this.addFloatingText(e.x, e.y - 38, '蚀幕护盾！', '#d5c7ff', 15);
          } else if (e.kind === 'warden') {
            // Act II Boss (裂律巨像): Haste Pulse accelerating nearby minions
            e.abilityTimer = 7.8;
            for (const ally of this.state.enemies) {
              if (!ally.dead && ally.id !== e.id && Math.hypot(ally.x - e.x, ally.y - e.y) < 220) {
                ally.slowTimer = 0;
                ally.slowFactor = 0;
                ally.pathProgress = Math.min(0.95, ally.pathProgress + 0.025);
              }
            }
            this.spawnRingBurst(e.x, e.y, '#ff9c7a', 14);
            this.addFloatingText(e.x, e.y - 38, '裂律涌动！', '#ffb07c', 15);
          } else if (e.kind === 'sovereign') {
            // Final Boss (寂灭星主): Summon 2 Rift Runners from its position!
            e.abilityTimer = 8.5;
            const runnerSpec = ENEMY_SPECS.runner;
            for (let k = 0; k < 2; k++) {
              const prog = Math.max(0.02, e.pathProgress - 0.025 * (k + 1));
              const sp = samplePolyline(this.map.lanes[e.laneIndex], prog);
              summonedMinions.push({
                id: `enemy-${this.nextEntityId++}`,
                kind: 'runner',
                name: '星主裂影',
                isBoss: false,
                isElite: false,
                laneIndex: e.laneIndex,
                pathProgress: prog,
                x: sp.x,
                y: sp.y,
                vx: sp.dx * runnerSpec.speed,
                vy: sp.dy * runnerSpec.speed,
                hp: Math.round(runnerSpec.baseHp * (1.8 + this.state.wave * 0.16)),
                maxHp: Math.round(runnerSpec.baseHp * (1.8 + this.state.wave * 0.16)),
                armor: 2,
                speed: runnerSpec.speed,
                reward: 6,
                coreDamage: 1,
                radius: runnerSpec.radius,
                carriedPrism: null,
                siphonDismissed: false,
                burnTimer: 0,
                burnDps: 0,
                slowTimer: 0,
                slowFactor: 0,
                stunTimer: 0,
                shatterMarkTimer: 0,
                hitFlash: 0,
                shieldHp: 0,
                abilityTimer: 999,
                dead: false,
                reachedCore: false,
              });
            }
            this.spawnRingBurst(e.x, e.y, '#f4d35e', 18);
            this.addFloatingText(e.x, e.y - 42, '蚀渊召影！', '#f6dc93', 16);
          }
        }
      }

      if (e.burnTimer > 0) {
        e.burnTimer -= dt;
        const burnDmg = e.burnDps * dt;
        e.hp -= burnDmg;
        if (e.hp <= 0) {
          this.killEnemy(e);
          continue;
        }
      }

      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        if (e.slowTimer <= 0) e.slowFactor = 0;
      }

      if (e.shatterMarkTimer > 0) {
        e.shatterMarkTimer -= dt;
      }

      if (e.stunTimer > 0) {
        e.stunTimer -= dt;
        continue;
      }

      const effectiveSpeed = e.speed * (1 - Math.min(0.65, e.slowFactor));
      const laneLen = this.laneLengths[e.laneIndex] || 1000;
      e.pathProgress += (effectiveSpeed * dt) / laneLen;

      if (e.pathProgress >= 1) {
        e.dead = true;
        e.reachedCore = true;
        // Return un-siphoned prism to bottom of Well so Well stays balanced
        if (e.carriedPrism) {
          this.well.returnToBottom(e.carriedPrism);
          this.state.wellRemaining = this.well.remaining;
          e.carriedPrism = null;
        }
        this.state.coreHp = Math.max(0, this.state.coreHp - e.coreDamage);
        this.state.screenShake = Math.max(this.state.screenShake, 0.32);
        this.callbacks.onCoreHit?.(e.coreDamage);
        this.addFloatingText(
          this.map.corePosition.x,
          this.map.corePosition.y - 30,
          `-${e.coreDamage}`,
          '#ff6b6b',
          22
        );
        if (this.state.coreHp <= 0) {
          this.state.phase = 'gameover';
          this.state.stats.score = this.state.score;
          this.callbacks.onGameOver?.();
          return;
        }
        continue;
      }

      const sample = samplePolyline(this.map.lanes[e.laneIndex], e.pathProgress);
      e.x = sample.x;
      e.y = sample.y;
      e.vx = sample.dx * effectiveSpeed;
      e.vy = sample.dy * effectiveSpeed;
    }

    if (summonedMinions.length > 0) {
      this.state.enemies.push(...summonedMinions);
    }

    // Prune dead enemies
    this.state.enemies = this.state.enemies.filter((e) => !e.dead);
  }

  private updateSiphonScan(): void {
    const bonuses = this.getBonuses();

    // Validate existing activeSiphon
    if (this.state.activeSiphon) {
      const current = this.state.activeSiphon;
      const carrier = this.state.enemies.find((e) => e.id === current.enemyId && !e.dead);
      if (!carrier || !carrier.carriedPrism || carrier.siphonDismissed) {
        this.state.activeSiphon = null;
      } else {
        const check = findBestSiphonTarget(
          this.state.circuits,
          carrier.carriedPrism,
          carrier.x,
          carrier.y
        );
        if (!check) {
          this.state.activeSiphon = null;
        }
      }
    }

    if (this.state.activeSiphon) return;

    // Find best new siphon opportunity across active carriers
    let bestOpp: SiphonOpportunity | null = null;
    let bestPriority = 0;

    for (const e of this.state.enemies) {
      if (e.dead || !e.carriedPrism || e.siphonDismissed) continue;
      if (e.pathProgress < 0.05 || e.pathProgress > 0.94) continue;

      const match = findBestSiphonTarget(this.state.circuits, e.carriedPrism, e.x, e.y);
      if (!match) continue;

      const priority =
        match.actionKind === 'convergence'
          ? 100
          : match.actionKind === 'supercharge'
            ? 80
            : match.actionKind === 'monolith'
              ? 60
              : 40;

      if (priority > bestPriority) {
        const cost =
          match.actionKind === 'convergence'
            ? 0
            : Math.max(0, BASE_SIPHON_COST - bonuses.siphonDiscount);

        // Only surface prompt if player can afford it (or it's free convergence)
        if (this.state.starlight >= cost) {
          const actionText =
            match.actionKind === 'convergence'
              ? '绝杀截鸣 · 触发大合鸣！'
              : match.actionKind === 'supercharge'
                ? '截律升华 · 四晶极律'
                : match.actionKind === 'monolith'
                  ? '截律成凝 · 三同凝律'
                  : '截律成流 · 顺阶流律';

          bestPriority = priority;
          bestOpp = {
            enemyId: e.id,
            prism: e.carriedPrism,
            targetGroupId: match.groupId,
            targetSlotIndex: match.slotIndex,
            actionKind: match.actionKind,
            cost,
            label: `${actionText} (${getPrismDisplayName(e.carriedPrism.domain, e.carriedPrism.rank)})`,
          };
        }
      }
    }

    if (bestOpp) {
      this.state.activeSiphon = bestOpp;
      this.callbacks.onSiphonPrompt?.(bestOpp);
    }
  }

  private updateTowers(dt: number): void {
    const bonuses = this.getBonuses();

    for (const group of this.state.circuits) {
      group.igniteFlash = Math.max(0, group.igniteFlash - dt * 1.4);

      // Supercharged Monolith orbital starlight strike!
      if (group.supercharged && group.formation === 'monolith' && this.state.enemies.length > 0) {
        group.orbitalTimer -= dt * bonuses.fireRateMult;
        if (group.orbitalTimer <= 0) {
          group.orbitalTimer = 3.0;
          const target = this.pickHighestHpEnemy();
          if (target) {
            const cx = group.slots.reduce((s, p) => s + p.x, 0) / group.slots.length;
            const cy = group.slots.reduce((s, p) => s + p.y, 0) / group.slots.length;
            const orbitalDmg = Math.round((135 + this.state.wave * 24) * bonuses.damageMult);
            this.damageEnemy(target, orbitalDmg, 1.0, true, '#fff0bf');
            const perSlot = Math.round(orbitalDmg / group.slots.length);
            for (const s of group.slots) {
              s.totalDamage += perSlot;
            }
            this.state.beams.push({
              id: `beam-${this.nextEntityId++}`,
              x1: cx,
              y1: cy,
              x2: target.x,
              y2: target.y,
              color: '#f4d35e',
              width: 5,
              life: 0.34,
              maxLife: 0.34,
            });
            this.spawnRingBurst(target.x, target.y, '#f4d35e', 16);
          }
        }
      }

      for (const slot of group.slots) {
        slot.recoil = Math.max(0, slot.recoil - dt * 6);
        if (!slot.prism) continue;

        slot.cooldown -= dt;
        if (slot.cooldown > 0) continue;

        const stats = this.computeTowerStats(group, slot, bonuses);
        const target = this.pickTargetInRange(slot.x, slot.y, stats.range, group.formation === 'monolith');
        if (!target) continue;

        slot.cooldown = stats.fireInterval;
        slot.recoil = 1.0;
        slot.targetAngle = Math.atan2(target.y - slot.y, target.x - slot.x);

        const isCrit = this.well.getRng().next() < stats.critChance;
        const finalDmg = Math.round(stats.damage * (isCrit ? 1.85 : 1.0));

        const proj: ProjectileEntity = {
          id: `proj-${this.nextEntityId++}`,
          sourceSlotId: slot.id,
          x: slot.x,
          y: slot.y,
          targetId: target.id,
          targetX: target.x,
          targetY: target.y,
          domain: slot.prism.domain,
          rank: slot.prism.rank,
          damage: finalDmg,
          speed: group.formation === 'monolith' ? 580 : 490,
          isCrit,
          isChain:
            (group.formation === 'cascade' && (slot.prism.domain === 'tide' || slot.prism.domain === 'jade')) ||
            (group.formation === 'cascade' && this.state.archetypeBuffs.chainBonus > 0),
          chainRemaining:
            group.formation === 'cascade'
              ? (slot.prism.domain === 'jade' ? 3 : slot.prism.domain === 'tide' ? 2 : 0) +
                this.state.archetypeBuffs.chainBonus
              : 0,
          hitIds: [],
          splashRadius:
            group.formation === 'cascade' && slot.prism.domain === 'ember'
              ? 68
              : group.supercharged
                ? 52
                : 0,
          armorPierce: stats.armorPierce,
          formation: group.formation,
          supercharged: group.supercharged,
          color: DOMAIN_META[slot.prism.domain].light,
          trail: [{ x: slot.x, y: slot.y }],
          done: false,
        };

        this.state.projectiles.push(proj);
        this.callbacks.onTowerFire?.(slot.prism.domain, isCrit);
      }
    }
  }

  public computeTowerStats(
    group: CircuitGroup,
    slot: PedestalSlot,
    bonuses = this.getBonuses()
  ): {
    damage: number;
    fireInterval: number;
    range: number;
    critChance: number;
    armorPierce: number;
  } {
    const prism = slot.prism!;
    const buffs = this.state.archetypeBuffs;
    const isAstral = prism.domain === 'astral';
    // Unformed solo prisms are intentionally modest so forming Circuits feels transformative!
    let baseDamage = isAstral ? 21 : 12 + prism.rank * 2.2;
    let baseInterval = isAstral ? 1.05 : 1.15 - prism.rank * 0.025;
    let baseRange = group.isKeystone ? 235 : 178;
    let critChance = bonuses.critChance + buffs.critBonus;
    let armorPierce = (isAstral ? 0.3 : 0.05) + buffs.armorPierceBonus;

    if (group.formation === 'cascade') {
      baseDamage *= 1.95;
      baseInterval /= 1.38;
      baseRange += 32;
    } else if (group.formation === 'monolith') {
      baseDamage *= isAstral ? 2.65 : 2.35;
      baseRange += 46;
      critChance += 0.24;
      armorPierce = Math.min(1, (isAstral ? 0.85 : 0.6) + buffs.armorPierceBonus);
      if (group.supercharged) {
        baseDamage *= 1.7;
        baseInterval /= 1.24;
        armorPierce = 1.0;
      }
    } else if (group.formation === 'anchor') {
      baseDamage *= 1.85;
      baseInterval /= 1.3;
      baseRange += 40;
    }

    const domainMult = 1 + (buffs.domainDamageBonus[prism.domain] ?? 0);
    const totalFireRateMult = bonuses.fireRateMult + buffs.fireRateBonus;
    const totalRangeMult = bonuses.rangeMult + buffs.rangeBonus;

    return {
      damage: baseDamage * bonuses.damageMult * domainMult,
      fireInterval: Math.max(0.2, baseInterval / totalFireRateMult),
      range: baseRange * totalRangeMult,
      critChance: Math.min(0.95, critChance),
      armorPierce: Math.min(1, armorPierce),
    };
  }

  private pickTargetInRange(
    x: number,
    y: number,
    range: number,
    preferStrong: boolean
  ): EnemyEntity | null {
    let best: EnemyEntity | null = null;
    let bestScore = -Infinity;

    for (const e of this.state.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > range) continue;

      const score = preferStrong
        ? e.hp * 0.5 + e.pathProgress * 400 + (e.isBoss ? 1000 : 0)
        : e.pathProgress * 1000 - d * 0.1;

      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  private pickHighestHpEnemy(): EnemyEntity | null {
    let best: EnemyEntity | null = null;
    for (const e of this.state.enemies) {
      if (e.dead) continue;
      if (!best || e.hp > best.hp) best = e;
    }
    return best;
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.state.projectiles) {
      if (p.done) continue;

      const target = this.state.enemies.find((e) => e.id === p.targetId && !e.dead);
      if (target) {
        p.targetX = target.x;
        p.targetY = target.y;
      }

      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;

      if (dist <= step + 8) {
        p.x = p.targetX;
        p.y = p.targetY;
        this.resolveProjectileImpact(p, target ?? null);
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 6) p.trail.shift();
      }
    }

    this.state.projectiles = this.state.projectiles.filter((p) => !p.done);
  }

  private resolveProjectileImpact(p: ProjectileEntity, primaryTarget: EnemyEntity | null): void {
    const meta = DOMAIN_META[p.domain];

    if (primaryTarget && !primaryTarget.dead) {
      this.damageEnemy(primaryTarget, p.damage, p.armorPierce, p.isCrit, meta.light, p.sourceSlotId);
      p.hitIds.push(primaryTarget.id);

      // Apply elemental effects
      if (p.domain === 'ember') {
        primaryTarget.burnTimer = Math.max(primaryTarget.burnTimer, p.formation === 'cascade' ? 3.2 : 1.8);
        primaryTarget.burnDps = Math.max(primaryTarget.burnDps, p.damage * 0.28);
      } else if (p.domain === 'tide') {
        primaryTarget.slowTimer = Math.max(primaryTarget.slowTimer, p.formation === 'cascade' ? 2.6 : 1.4);
        primaryTarget.slowFactor = Math.max(primaryTarget.slowFactor, p.formation === 'cascade' ? 0.36 : 0.2);
      } else if (p.domain === 'jade' && p.formation === 'cascade') {
        primaryTarget.shatterMarkTimer = Math.max(primaryTarget.shatterMarkTimer, 3.0);
      } else if (p.domain === 'astral' && p.isCrit) {
        primaryTarget.stunTimer = Math.max(primaryTarget.stunTimer, 0.38);
      }
    }

    // Splash damage (Ember Cascade or Supercharge)
    if (p.splashRadius > 0) {
      this.spawnRingBurst(p.x, p.y, meta.primary, 8);
      for (const e of this.state.enemies) {
        if (e.dead || e.id === primaryTarget?.id) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) <= p.splashRadius) {
          this.damageEnemy(
            e,
            Math.round(p.damage * 0.6),
            p.armorPierce,
            false,
            meta.primary,
            p.sourceSlotId
          );
          if (p.domain === 'ember') {
            e.burnTimer = Math.max(e.burnTimer, 2.2);
            e.burnDps = Math.max(e.burnDps, p.damage * 0.2);
          }
        }
      }
    }

    // Chain ricochet (Tide / Jade Cascade!)
    if (p.isChain && p.chainRemaining > 0) {
      let nextTarget: EnemyEntity | null = null;
      let bestDist = 170;
      for (const e of this.state.enemies) {
        if (e.dead || p.hitIds.includes(e.id)) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < bestDist) {
          bestDist = d;
          nextTarget = e;
        }
      }
      if (nextTarget) {
        this.state.beams.push({
          id: `beam-${this.nextEntityId++}`,
          x1: p.x,
          y1: p.y,
          x2: nextTarget.x,
          y2: nextTarget.y,
          color: meta.light,
          width: 2.5,
          life: 0.16,
          maxLife: 0.16,
        });
        p.targetId = nextTarget.id;
        p.targetX = nextTarget.x;
        p.targetY = nextTarget.y;
        p.chainRemaining -= 1;
        p.damage = Math.round(p.damage * 0.82);
        return;
      }
    }

    // Small hit sparks
    for (let i = 0; i < (p.isCrit ? 7 : 3); i++) {
      const a = this.well.getRng().next() * Math.PI * 2;
      const spd = 45 + this.well.getRng().next() * 90;
      this.state.particles.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        size: p.isCrit ? 3.8 : 2.5,
        color: p.isCrit ? '#fff0bf' : meta.light,
        alpha: 1,
        life: 0.28,
        maxLife: 0.28,
        shape: 'diamond',
      });
    }

    p.done = true;
  }

  private damageEnemy(
    enemy: EnemyEntity,
    rawDamage: number,
    armorPierce: number,
    isCrit: boolean,
    color: string,
    sourceSlotId?: string
  ): void {
    if (enemy.dead) return;
    const effectiveArmor = enemy.armor * (1 - Math.min(1, armorPierce));
    let dmg = Math.max(4, rawDamage - effectiveArmor);
    if (enemy.shatterMarkTimer > 0) {
      dmg *= 1.35;
    }
    const finalDmg = Math.round(dmg);

    // Track tower damage statistics accurately!
    if (sourceSlotId) {
      for (const g of this.state.circuits) {
        const slot = g.slots.find((s) => s.id === sourceSlotId);
        if (slot) {
          slot.totalDamage += finalDmg;
          break;
        }
      }
    }

    // Boss Eclipse Shield absorbs non-piercing damage (Crits deal double vs shields!)
    if (enemy.shieldHp > 0) {
      const shieldDmg = isCrit ? finalDmg * 1.8 : finalDmg;
      if (shieldDmg >= enemy.shieldHp) {
        const overflow = Math.max(0, Math.round(finalDmg - enemy.shieldHp));
        enemy.shieldHp = 0;
        enemy.hp -= overflow;
        this.addFloatingText(enemy.x, enemy.y - enemy.radius - 16, '破盾！', '#fff0bf', 15);
      } else {
        enemy.shieldHp -= shieldDmg;
        enemy.hitFlash = 0.7;
        return;
      }
    } else {
      enemy.hp -= finalDmg;
    }
    enemy.hitFlash = 1.0;

    if (finalDmg >= 12 || isCrit) {
      this.addFloatingText(
        enemy.x + (this.well.getRng().next() - 0.5) * 16,
        enemy.y - enemy.radius - 4,
        isCrit ? `${finalDmg}!` : `${finalDmg}`,
        isCrit ? '#fff0bf' : color,
        isCrit ? 15 : 12
      );
    }

    if (enemy.hp <= 0) {
      this.killEnemy(enemy);
    }
  }

  private killEnemy(enemy: EnemyEntity): void {
    if (enemy.dead) return;
    enemy.dead = true;
    this.state.starlight += enemy.reward;
    this.state.score += enemy.reward * 10;
    this.state.stats.enemiesSlain += 1;
    this.state.stats.score = this.state.score;

    // If enemy was carrying an un-siphoned prism, return it to Well cleanly
    if (enemy.carriedPrism) {
      this.well.returnToBottom(enemy.carriedPrism);
      this.state.wellRemaining = this.well.remaining;
      enemy.carriedPrism = null;
    }

    // Death particle burst
    this.spawnRingBurst(enemy.x, enemy.y, enemy.isBoss ? '#f4d35e' : '#85a9bd', enemy.isBoss ? 26 : 9);
  }

  private checkWaveCompletion(): void {
    if (!this.state.waveInProgress) return;
    if (this.spawnQueue.length > 0 || this.state.enemies.length > 0) return;

    this.state.waveInProgress = false;
    this.state.activeSiphon = null;
    this.state.stats.wavesCleared = Math.max(this.state.stats.wavesCleared, this.state.wave);

    const bonuses = this.getBonuses();
    const clearBonus = (this.currentWaveDef?.clearBonus ?? 45) + bonuses.starlightPerWave;
    this.state.starlight += clearBonus;
    this.state.score += 180 + this.state.wave * 60;
    this.state.stats.score = this.state.score;

    this.callbacks.onWaveClear?.(this.state.wave);
    this.addFloatingText(640, 180, `波次净化 · +${clearBonus} 星辉`, '#93e2be', 20);

    // Check Campaign Victory!
    if (!this.state.endlessMode && this.state.wave >= this.state.maxWaves) {
      this.state.phase = 'victory';
      this.state.score += this.state.coreHp * 150;
      this.state.stats.score = this.state.score;
      this.callbacks.onVictory?.();
      return;
    }

    // Offer a Constellation Relic at the end of Act 1 (Wave 4) and Act 2 (Wave 8) if not already capped
    if ((this.state.wave === 4 || this.state.wave === 8) && this.state.relics.length < 4) {
      const ownedIds = new Set(this.state.relics.map((r) => r.id));
      const available = RELIC_POOL.filter((r) => !ownedIds.has(r.id));
      if (available.length > 0) {
        this.state.pendingRelicChoices = this.well.getRng().shuffle([...available]).slice(0, 3);
        this.state.phase = 'relic_choice';
      }
    }

    this.state.waveCountdown = 8.5;
  }

  private updateVisualEffects(dt: number): void {
    for (const b of this.state.beams) {
      b.life -= dt;
    }
    this.state.beams = this.state.beams.filter((b) => b.life > 0);

    for (const pt of this.state.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.94;
      pt.vy *= 0.94;
      pt.life -= dt;
      pt.alpha = Math.max(0, pt.life / pt.maxLife);
    }
    this.state.particles = this.state.particles.filter((pt) => pt.life > 0);

    for (const ft of this.state.floatingTexts) {
      ft.y += ft.vy * dt;
      ft.life -= dt;
    }
    this.state.floatingTexts = this.state.floatingTexts.filter((ft) => ft.life > 0);
  }

  private spawnRingBurst(x: number, y: number, color: string, count: number): void {
    this.state.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      size: 16,
      color,
      alpha: 0.9,
      life: 0.35,
      maxLife: 0.35,
      shape: 'ring',
    });
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + this.well.getRng().next() * 0.3;
      const spd = 55 + this.well.getRng().next() * 110;
      this.state.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        size: 2.5 + this.well.getRng().next() * 2.5,
        color,
        alpha: 1,
        life: 0.42,
        maxLife: 0.42,
        shape: 'diamond',
      });
    }
  }

  public addFloatingText(x: number, y: number, text: string, color: string, size = 14): void {
    if (this.state.floatingTexts.length > 42) {
      this.state.floatingTexts.shift();
    }
    this.state.floatingTexts.push({
      id: `ft-${this.nextEntityId++}`,
      x,
      y,
      text,
      color,
      size,
      life: 1.05,
      maxLife: 1.05,
      vy: -32,
    });
  }
}
