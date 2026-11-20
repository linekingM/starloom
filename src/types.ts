export type ElementalDomain = 'ember' | 'tide' | 'jade';
export type PrismDomain = ElementalDomain | 'astral';

/**
 * Elemental domains have ranks 1..5.
 * Astral domain has 3 singular signs: 1 = Dawn (晨星), 2 = Eclipse (蚀月), 3 = Zenith (天穹).
 */
export type PrismRank = 1 | 2 | 3 | 4 | 5;

/** Canonical code such as "ember-3", "tide-1", "jade-5", "astral-2" */
export type PrismCode = `${PrismDomain}-${PrismRank}`;

export interface PrismInstance {
  id: string;
  domain: PrismDomain;
  rank: PrismRank;
  code: PrismCode;
}

export type FormationKind = 'none' | 'cascade' | 'monolith' | 'anchor';

export interface PedestalSlot {
  id: string;
  groupId: string; // 'circuit-0' | 'circuit-1' | 'circuit-2' | 'keystone'
  slotIndex: number; // 0..2 for circuits, 0..1 for keystone
  x: number; // Logical 1280x720 map coordinates
  y: number;
  prism: PrismInstance | null;
  cooldown: number;
  recoil: number;
  targetAngle: number;
  totalDamage: number;
}

export interface CircuitGroup {
  id: string;
  name: string;
  isKeystone: boolean;
  slots: PedestalSlot[];
  formation: FormationKind;
  bound: boolean; // True if completed via Siphon (exposed meld)
  locked: boolean; // True if bound or supercharged
  supercharged: boolean; // True if 4th copy infused onto a Monolith (Kong!)
  elementDomain: PrismDomain | null;
  cascadeRanks: number[]; // Sorted ranks if cascade
  monolithCode: PrismCode | null; // Code if monolith or anchor
  igniteFlash: number; // Visual timer for formation ignition animation
  orbitalTimer: number; // Timer for supercharged orbital strikes
}

export interface WaitTarget {
  code: PrismCode;
  groupId: string;
  slotIndex: number;
  resultingFormation: FormationKind;
  remainingInWell: number;
}

export interface ArchetypeMatch {
  id: string;
  name: string;
  enName: string;
  multiplier: number; // Additive or multiplicative bonus factor
  tier: 'common' | 'rare' | 'legendary';
  effectSummary: string;
  badgeColor: string;
}

export interface ConvergenceResult {
  archetypes: ArchetypeMatch[];
  totalMultiplier: number;
  baseScore: number;
  totalScore: number;
  isSelfDrawn: boolean; // Tsumo vs Ron
  isOathFulfilled: boolean;
  isUnbound: boolean;
  isSurgeFinish: boolean; // Completed right after Supercharge draw
  starlightReward: number;
  coreHeal: number;
}

export type EnemyKind = 'mote' | 'runner' | 'hulk' | 'weaver' | 'warden' | 'sovereign';

export interface EnemyEntity {
  id: string;
  kind: EnemyKind;
  name: string;
  isBoss: boolean;
  isElite: boolean;
  laneIndex: number;
  pathProgress: number; // 0..1 along waypoints
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  armor: number; // Flat or % mitigation
  speed: number; // Logical px/sec
  reward: number;
  coreDamage: number;
  radius: number;
  carriedPrism: PrismInstance | null;
  siphonDismissed: boolean;
  // Status effects
  burnTimer: number;
  burnDps: number;
  slowTimer: number;
  slowFactor: number; // 0.35 means 35% slow
  stunTimer: number;
  shatterMarkTimer: number; // Takes +35% damage
  hitFlash: number;
  shieldHp: number;
  abilityTimer: number;
  dead: boolean;
  reachedCore: boolean;
}

export interface ProjectileEntity {
  id: string;
  sourceSlotId?: string;
  x: number;
  y: number;
  targetId: string;
  targetX: number;
  targetY: number;
  domain: PrismDomain;
  rank: PrismRank;
  damage: number;
  speed: number;
  isCrit: boolean;
  isChain: boolean;
  chainRemaining: number;
  hitIds: string[];
  splashRadius: number;
  armorPierce: number;
  formation: FormationKind;
  supercharged: boolean;
  color: string;
  trail: Array<{ x: number; y: number }>;
  done: boolean;
}

export interface BeamEffect {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  life: number;
  maxLife: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  shape: 'circle' | 'diamond' | 'ring';
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  vy: number;
}

export interface SiphonOpportunity {
  enemyId: string;
  prism: PrismInstance;
  targetGroupId: string;
  targetSlotIndex: number;
  actionKind: 'cascade' | 'monolith' | 'supercharge' | 'convergence';
  cost: number;
  label: string;
}

export interface ConstellationRelic {
  id: string;
  name: string;
  enName: string;
  description: string;
  icon: string;
  accent: string;
  damageBonus?: number;
  fireRateBonus?: number;
  rangeBonus?: number;
  critBonus?: number;
  starlightPerWave?: number;
  shatterPowerBonus?: number;
  siphonDiscount?: number;
  maxCoreHpBonus?: number;
}

export interface Waypoint {
  x: number;
  y: number;
}

export interface MapDefinition {
  id: string;
  name: string;
  enName: string;
  subtitle: string;
  difficultyLabel: string;
  lanes: Waypoint[][];
  corePosition: Waypoint;
  circuits: Array<{
    id: string;
    name: string;
    isKeystone: boolean;
    slots: Waypoint[];
  }>;
  decorRings: Array<{ x: number; y: number; radius: number; speed: number }>;
}

export type GamePhase =
  | 'title'
  | 'playing'
  | 'convergence_modal'
  | 'relic_choice'
  | 'victory'
  | 'gameover';

export interface SelectionState {
  source: 'reserve' | 'pedestal';
  reserveIndex?: number;
  groupId?: string;
  slotIndex?: number;
  prism: PrismInstance;
}

export interface GameSettings {
  muted: boolean;
  musicVolume: number;
  sfxVolume: number;
  autoSlowOnSiphon: boolean;
  showDamageNumbers: boolean;
  tutorialSeen: boolean;
}

export interface GameStats {
  wavesCleared: number;
  enemiesSlain: number;
  convergencesTriggered: number;
  siphonsUsed: number;
  shattersUsed: number;
  superchargesUsed: number;
  highestMultiplier: number;
  bestArchetypeNames: string[];
  score: number;
}

export interface ArchetypeBuffState {
  chainBonus: number;
  rangeBonus: number;
  fireRateBonus: number;
  armorPierceBonus: number;
  critBonus: number;
  domainDamageBonus: Record<PrismDomain, number>;
  eclipseLaserLevel: number;
  achievedIds: string[];
}

export interface WaveBannerState {
  title: string;
  subtitle: string;
  isBoss: boolean;
  timer: number;
  maxTimer: number;
}

export interface GameState {
  phase: GamePhase;
  mapId: string;
  endlessMode: boolean;
  wave: number;
  maxWaves: number;
  act: number; // 1, 2, 3, or 4+ in endless
  waveInProgress: boolean;
  waveCountdown: number;
  timeScale: number; // 1 or 2
  paused: boolean;
  starlight: number;
  coreHp: number;
  maxCoreHp: number;
  score: number;
  harmonicRank: number; // Permanent power scaling from Grand Convergences
  archetypeBuffs: ArchetypeBuffState;
  // Board & Hand
  circuits: CircuitGroup[];
  reserve: Array<PrismInstance | null>; // 5 slots
  discardPile: PrismInstance[];
  wellRemaining: number;
  // Mahjong-Soul States
  waits: WaitTarget[];
  isReadyTenpai: boolean;
  oathActive: boolean; // Riichi equivalent!
  usedSiphonThisCycle: boolean;
  lastDrawWasSurge: boolean; // For Rinshan (杠上开花)
  activeSiphon: SiphonOpportunity | null;
  lastConvergence: ConvergenceResult | null;
  pendingRelicChoices: ConstellationRelic[];
  relics: ConstellationRelic[];
  // Entities
  enemies: EnemyEntity[];
  projectiles: ProjectileEntity[];
  beams: BeamEffect[];
  particles: Particle[];
  floatingTexts: FloatingText[];
  // Timers & Feedback
  elapsedTime: number;
  screenShake: number;
  convergenceFlash: number;
  shatterWaveFlash: { color: string; timer: number } | null;
  waveBanner: WaveBannerState | null;
  selection: SelectionState | null;
  tutorialStep: number; // 0=place, 1=complete circuit, 2=siphon or shatter, 3=done
  stats: GameStats;
}
