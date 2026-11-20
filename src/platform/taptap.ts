import type { ConvergenceResult, GameSettings, GameStats } from '../types';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_convergence', name: '初闻星律', description: '首次触发「大合鸣」', icon: '✦' },
  { id: 'siphon_tactician', name: '星弦截手', description: '单局通过「截律」夺晶至少 3 次', icon: '⚡' },
  { id: 'oath_master', name: '鸣誓破晓', description: '在「鸣誓」定阵状态下完成一次大合鸣', icon: '☾' },
  { id: 'unbound_pure', name: '无瑕清阵', description: '以「无瑕隐阵」完成大合鸣', icon: '◈' },
  { id: 'high_multiplier', name: '满贯星潮', description: '单次大合鸣总倍率达到 ×6.0 以上', icon: '★' },
  { id: 'monochrome_sage', name: '纯律宗师', description: '达成传奇律谱「纯律归宗」或「星辰三极」', icon: '❖' },
  { id: 'campaign_clear', name: '星枢守护者', description: '通关全部 12 波战役并击败寂灭星主', icon: '♛' },
  { id: 'endless_voyager', name: '无尽观星者', description: '在无尽星渊模式坚持至第 16 波', icon: '∞' },
];

export interface LeaderboardEntry {
  mapId: string;
  score: number;
  wave: number;
  highestMultiplier: number;
  date: string;
}

export interface PersistentProfile {
  settings: GameSettings;
  unlockedAchievements: string[];
  leaderboard: LeaderboardEntry[];
  totalConvergences: number;
  totalRuns: number;
}

const STORAGE_KEY = 'starloom_taptap_profile_v1';

const DEFAULT_PROFILE: PersistentProfile = {
  settings: {
    muted: false,
    musicVolume: 0.32,
    sfxVolume: 0.65,
    autoSlowOnSiphon: true,
    showDamageNumbers: true,
    tutorialSeen: false,
  },
  unlockedAchievements: [],
  leaderboard: [],
  totalConvergences: 0,
  totalRuns: 0,
};

/**
 * TapTap-ready Platform Bridge.
 * Automatically hooks into native TapSDK / Capacitor bridge when packaged for Android APK,
 * while seamlessly operating on Web / TapPlay via localStorage fallback.
 */
export class TapTapPlatform {
  public profile: PersistentProfile;
  private onAchievementUnlock?: (ach: AchievementDef) => void;

  constructor(onAchievementUnlock?: (ach: AchievementDef) => void) {
    this.onAchievementUnlock = onAchievementUnlock;
    this.profile = this.loadProfile();
  }

  private loadProfile(): PersistentProfile {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_PROFILE);
      const parsed = JSON.parse(raw) as Partial<PersistentProfile>;
      return {
        ...structuredClone(DEFAULT_PROFILE),
        ...parsed,
        settings: {
          ...DEFAULT_PROFILE.settings,
          ...(parsed.settings ?? {}),
        },
      };
    } catch {
      return structuredClone(DEFAULT_PROFILE);
    }
  }

  public saveProfile(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch {
      // Ignore storage quota errors in sandboxed iframes
    }
  }

  public updateSettings(patch: Partial<GameSettings>): void {
    this.profile.settings = { ...this.profile.settings, ...patch };
    this.saveProfile();
  }

  public unlockAchievement(id: string): boolean {
    if (this.profile.unlockedAchievements.includes(id)) return false;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def) return false;
    this.profile.unlockedAchievements.push(id);
    this.saveProfile();
    this.onAchievementUnlock?.(def);

    // Optional native TapTap SDK forwarder when running in Capacitor Android shell
    const w = window as unknown as { TapSDK?: { unlockAchievement?: (aid: string) => void } };
    w.TapSDK?.unlockAchievement?.(id);
    return true;
  }

  public evaluateConvergenceAchievements(res: ConvergenceResult): void {
    this.profile.totalConvergences += 1;
    this.unlockAchievement('first_convergence');
    if (res.isOathFulfilled) this.unlockAchievement('oath_master');
    if (res.isUnbound) this.unlockAchievement('unbound_pure');
    if (res.totalMultiplier >= 6.0) this.unlockAchievement('high_multiplier');
    if (res.archetypes.some((a) => a.id === 'monochrome' || a.id === 'astral_trinity')) {
      this.unlockAchievement('monochrome_sage');
    }
    this.saveProfile();
  }

  public recordRunResult(mapId: string, wave: number, stats: GameStats, isVictory: boolean): void {
    this.profile.totalRuns += 1;
    if (stats.siphonsUsed >= 3) this.unlockAchievement('siphon_tactician');
    if (isVictory) this.unlockAchievement('campaign_clear');
    if (wave >= 16) this.unlockAchievement('endless_voyager');

    const now = new Date();
    const dateStr = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;

    this.profile.leaderboard.push({
      mapId,
      score: stats.score,
      wave,
      highestMultiplier: stats.highestMultiplier,
      date: dateStr,
    });
    this.profile.leaderboard.sort((a, b) => b.score - a.score);
    this.profile.leaderboard = this.profile.leaderboard.slice(0, 10);
    this.saveProfile();

    const w = window as unknown as {
      TapSDK?: { submitScore?: (board: string, score: number) => void };
    };
    w.TapSDK?.submitScore?.(`starloom_${mapId}`, stats.score);
  }
}
