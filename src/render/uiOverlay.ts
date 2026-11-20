import {
  DRAW_COST,
  OATH_COST,
  SHATTER_REFUND,
  type StarloomEngine,
} from '../core/engine';
import { ALL_ARCHETYPE_CATALOG, formatWaitSummary } from '../core/harmonics';
import { MAPS } from '../core/mapData';
import { buildWaveDefinition } from '../core/waves';
import {
  ALL_PRISM_SPECS,
  DOMAIN_META,
  getPrismDisplayName,
} from '../core/well';
import { ACHIEVEMENTS, type AchievementDef, type TapTapPlatform } from '../platform/taptap';
import { renderPrismSvgIcon } from './renderer';
import type { StarloomAudio } from '../audio/synth';
import keyArtUrl from '../assets/key_art.jpg';
import iconUrl from '../assets/icon_192.png';

export type OverlayModal = 'none' | 'codex' | 'well' | 'settings' | 'confirm_exit';
export type CodexTab = 'guide' | 'archetypes' | 'records';

export interface UiControllerOptions {
  root: HTMLElement;
  engine: StarloomEngine;
  audio: StarloomAudio;
  platform: TapTapPlatform;
  onStartDragFromReserve: (reserveIdx: number, clientX: number, clientY: number) => void;
  onStartGame: (mapId: string) => void;
  onReturnTitle: () => void;
}

export class StarloomUiOverlay {
  private opts: UiControllerOptions;
  private overlayEl: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private selectedMapId = 'astrolabe';
  private activeModal: OverlayModal = 'none';
  private codexTab: CodexTab = 'archetypes';
  private selectedPreserveGroupId = '';
  private lastSignature = '';

  constructor(opts: UiControllerOptions) {
    this.opts = opts;
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'ui-overlay-layer';
    this.opts.root.appendChild(this.overlayEl);

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast-stack';
    this.opts.root.appendChild(this.toastEl);

    this.bindDelegatedEvents();
  }

  public showToast(ach: AchievementDef): void {
    const item = document.createElement('div');
    item.className = 'toast-item';
    item.innerHTML = `<span style="font-size:20px;color:#f6dc93">${ach.icon}</span>
      <div>
        <div style="font-weight:800;color:#f6dc93">成就解锁 · ${ach.name}</div>
        <div style="font-size:11px;opacity:0.82">${ach.description}</div>
      </div>`;
    this.toastEl.appendChild(item);
    window.setTimeout(() => {
      item.remove();
    }, 3800);
  }

  public toggleModal(modal: OverlayModal): void {
    this.activeModal = this.activeModal === modal ? 'none' : modal;
    this.forceRender();
  }

  public getActiveModal(): OverlayModal {
    return this.activeModal;
  }

  public forceRender(): void {
    this.lastSignature = '';
    this.sync();
  }

  public sync(): void {
    const s = this.opts.engine.state;
    const selKey = s.selection
      ? `${s.selection.source}:${s.selection.reserveIndex ?? ''}:${s.selection.groupId ?? ''}:${s.selection.slotIndex ?? ''}`
      : 'none';
    const resKey = s.reserve.map((r) => r?.id ?? '_').join(',');
    const siphonKey = s.activeSiphon
      ? `${s.activeSiphon.enemyId}:${s.activeSiphon.actionKind}:${s.activeSiphon.cost}`
      : 'none';
    const waitKey = s.waits.map((w) => `${w.code}:${w.remainingInWell}`).join(',');
    const relicKey = s.relics.map((r) => r.id).join(',');
    const cdInt = Math.ceil(s.waveCountdown);
    const shatterReady = this.opts.engine.shatterPulseCooldown <= 0.05 ? '1' : '0';
    const activeBoss = s.enemies.find((e) => e.isBoss && !e.dead);
    const bossKey = activeBoss
      ? `${activeBoss.id}:${Math.round((activeBoss.hp / activeBoss.maxHp) * 50)}`
      : 'none';

    const sig = [
      s.phase,
      this.selectedMapId,
      this.activeModal,
      this.codexTab,
      this.selectedPreserveGroupId,
      s.wave,
      s.waveInProgress ? '1' : '0',
      cdInt,
      s.timeScale,
      s.paused ? '1' : '0',
      s.starlight,
      s.coreHp,
      s.maxCoreHp,
      s.score,
      s.harmonicRank,
      s.archetypeBuffs.achievedIds.length,
      s.wellRemaining,
      selKey,
      resKey,
      siphonKey,
      waitKey,
      s.oathActive ? '1' : '0',
      relicKey,
      s.tutorialStep,
      shatterReady,
      bossKey,
      this.opts.platform.profile.settings.muted ? '1' : '0',
      this.opts.platform.profile.settings.autoSlowOnSiphon ? '1' : '0',
      this.opts.platform.profile.settings.showDamageNumbers ? '1' : '0',
    ].join('|');

    if (sig === this.lastSignature) return;
    this.lastSignature = sig;
    this.render();
  }

  private render(): void {
    const s = this.opts.engine.state;

    if (s.phase === 'title') {
      this.overlayEl.innerHTML = this.renderTitleScreen() + this.renderAuxModal();
      return;
    }

    let html = '';
    html += this.renderTopHud();
    html += this.renderBossBar();
    html += this.renderTenpaiOrTutorial();
    html += this.renderRelicStrip();
    html += this.renderSiphonCallout();
    html += this.renderSelectionHint();
    html += this.renderBottomTray();

    if (s.phase === 'convergence_modal' && s.lastConvergence) {
      html += this.renderConvergenceModal();
    } else if (s.phase === 'relic_choice') {
      html += this.renderRelicChoiceModal();
    } else if (s.phase === 'victory' || s.phase === 'gameover') {
      html += this.renderEndModal();
    }

    html += this.renderAuxModal();
    this.overlayEl.innerHTML = html;
  }

  private renderTitleScreen(): string {
    const bestScore = this.opts.platform.profile.leaderboard[0]?.score ?? 0;
    const unlockedCount = this.opts.platform.profile.unlockedAchievements.length;

    const mapCards = MAPS.map(
      (m) => `
      <button class="map-card ${m.id === this.selectedMapId ? 'selected' : ''}" data-action="select-map" data-map-id="${m.id}">
        <div>
          <div class="map-card-name">${m.name} <span style="font-size:11px;opacity:0.65;font-weight:500">${m.enName}</span></div>
          <div class="map-card-sub">${m.subtitle}</div>
        </div>
        <span class="map-card-diff">${m.difficultyLabel}</span>
      </button>
    `
    ).join('');

    return `
      <div class="title-screen" style="background-image: url('${keyArtUrl}')">
        <header class="title-header">
          <div class="brand-lockup">
            <img class="brand-icon" src="${iconUrl}" alt="星枢织阵图标" />
            <div>
              <div class="brand-eyebrow">STARLOOM · ASTROLABE RESONANCE DEFENSE</div>
              <h1 class="brand-title">星枢织阵</h1>
            </div>
          </div>
          <div class="title-nav-actions">
            <button class="btn-ghost" data-action="open-modal" data-modal="codex" data-tab="archetypes">律谱图鉴</button>
            <button class="btn-ghost" data-action="open-modal" data-modal="codex" data-tab="records">星榜成就 (${unlockedCount}/${ACHIEVEMENTS.length})</button>
            <button class="btn-ghost" data-action="open-modal" data-modal="settings">设置</button>
          </div>
        </header>

        <main class="title-body">
          <section class="title-panel">
            <p class="title-tagline">
              从有限的 <strong>72 枚星池律晶</strong> 中调度构筑：连结<strong>流律顺阶</strong>与<strong>凝律三晶</strong>，在蚀兽逼近瞬间<strong>截律夺晶</strong>，于临鸣一刻<strong>鸣誓定阵</strong>，奏响扭转战局的大合鸣。
            </p>
            <div class="soul-pillars">
              <div class="pillar-chip">
                <strong>流律 · 凝律</strong>
                <span>顺阶连锁 / 三同破甲</span>
              </div>
              <div class="pillar-chip">
                <strong>截律博弈</strong>
                <span>夺晶快成 vs 隐阵高番</span>
              </div>
              <div class="pillar-chip">
                <strong>鸣誓合鸣</strong>
                <span>十一种传奇星律倍乘</span>
              </div>
            </div>

            <div class="map-selector-label">选择星盘防线</div>
            <div class="map-cards">${mapCards}</div>

            <button class="btn-primary" id="btn-start-game" data-action="start-game">
              开启织阵防线
            </button>
          </section>
        </main>

        <footer class="title-footer">
          <span>健康游戏忠告：抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。适度游戏益脑，沉迷游戏伤身。</span>
          <span>${bestScore > 0 ? `最高星律分：${bestScore.toLocaleString()} · ` : ''}v1.0 TapTap Ready</span>
        </footer>
      </div>
    `;
  }

  private renderTopHud(): string {
    const s = this.opts.engine.state;
    const isLowHp = s.coreHp <= 6;
    const waveLabel = s.endlessMode
      ? `无尽 · 第 ${s.wave} 波`
      : `第 ${Math.max(1, s.wave)} / ${s.maxWaves} 波`;

    const nextPreview = !s.waveInProgress
      ? buildWaveDefinition(s.wave + 1, this.opts.engine.map.lanes.length)
      : null;
    const waveBtn = !s.waveInProgress
      ? `<button class="hud-btn wave-cta" id="btn-next-wave" data-action="next-wave" title="${nextPreview ? `${nextPreview.title}：${nextPreview.subtitle}` : ''}">▶ 迎战下波 (${Math.max(1, Math.ceil(s.waveCountdown))}s)</button>`
      : '';

    return `
      <div class="hud-top">
        <div class="hud-group">
          <div class="hud-pill core-pill ${isLowHp ? 'low' : ''}">
            <span>星枢</span>
            <span class="val" id="hud-core-hp">${s.coreHp}/${s.maxCoreHp}</span>
          </div>
          <div class="hud-pill">
            <span>星辉</span>
            <span class="val" id="hud-starlight">${s.starlight}</span>
          </div>
          <div class="hud-pill">
            <span>${waveLabel}</span>
            <span class="val" id="hud-score">${s.score.toLocaleString()}</span>
          </div>
          ${
            s.harmonicRank > 0
              ? `<div class="hud-pill" title="每次大合鸣永久提升全阵 +20% 伤害与 +4% 暴击">
                  <span>合鸣阶</span>
                  <span class="val">Lv.${s.harmonicRank}</span>
                </div>`
              : ''
          }
          ${waveBtn}
        </div>

        <div class="hud-group">
          <button class="hud-btn" id="btn-well" data-action="open-modal" data-modal="well">
            星池余量 ${s.wellRemaining}/72
          </button>
          <button class="hud-btn ${s.timeScale === 2 ? 'active' : ''}" data-action="toggle-speed">
            ${s.timeScale}× 速
          </button>
          <button class="hud-btn ${s.paused ? 'active' : ''}" data-action="toggle-pause">
            ${s.paused ? '▶ 继续' : '❚❚ 暂停'}
          </button>
          <button class="hud-btn" data-action="open-modal" data-modal="codex" data-tab="archetypes">律谱</button>
          <button class="hud-btn" data-action="open-modal" data-modal="settings">设置</button>
          <button class="hud-btn" data-action="return-title">主界面</button>
        </div>
      </div>
    `;
  }

  private renderTenpaiOrTutorial(): string {
    const s = this.opts.engine.state;
    let out = '';

    if (s.isReadyTenpai) {
      const waitText = formatWaitSummary(s.waits);
      const canOath = !s.oathActive && s.starlight >= OATH_COST;
      out += `
        <div class="tenpai-banner ${s.oathActive ? 'oath-active' : ''}" id="tenpai-banner">
          <span><strong>${s.oathActive ? '✦ 鸣誓定阵中' : '✦ 临鸣待合'}</strong> · 待鸣：${waitText}</span>
          ${
            !s.oathActive
              ? `<button class="oath-btn" id="btn-declare-oath" data-action="declare-oath" ${canOath ? '' : 'disabled'}>
                  鸣誓定阵 (-${OATH_COST}星辉 · ×1.6倍)
                </button>`
              : `<span style="color:#fff0bf;font-weight:700">攻速 +35% · 命中即大合鸣！</span>`
          }
        </div>
      `;
    } else if (s.tutorialStep < 3) {
      const hints = [
        '指引 1/3：点选或拖拽下方「备律台」律晶，安置在地图星盘塔座上自动开火。',
        '指引 2/3：在同一回路放入「顺阶 3 晶（如 1-2-3 流律）」或「3 枚相同（凝律）」，金色脉冲槽即为成阵位！',
        '指引 3/3：选中多余律晶点「化尘」可触发全场控场/灼烧；载律蚀兽出现时可「截律」夺晶！',
      ];
      out += `
        <div class="tutorial-pill" id="tutorial-pill">
          <span>${hints[s.tutorialStep]}</span>
          <button class="tutorial-dismiss" data-action="dismiss-tutorial">跳过</button>
        </div>
      `;
    }

    return out;
  }

  private renderRelicStrip(): string {
    const s = this.opts.engine.state;
    const relics = s.relics;
    const b = s.archetypeBuffs;
    const auraChips: string[] = [];
    if (b.chainBonus > 0) auraChips.push(`<div class="relic-chip aura-chip"><span>⟿</span><span>连锁 +${b.chainBonus}</span></div>`);
    if (b.eclipseLaserLevel > 0) auraChips.push(`<div class="relic-chip aura-chip"><span>✦</span><span>星轨射线 Lv.${b.eclipseLaserLevel}</span></div>`);
    if (b.armorPierceBonus > 0) auraChips.push(`<div class="relic-chip aura-chip"><span>❖</span><span>破甲 +${Math.round(b.armorPierceBonus * 100)}%</span></div>`);
    if (b.rangeBonus > 0) auraChips.push(`<div class="relic-chip aura-chip"><span>◎</span><span>射程 +${Math.round(b.rangeBonus * 100)}%</span></div>`);
    if (b.fireRateBonus > 0) auraChips.push(`<div class="relic-chip aura-chip"><span>♪</span><span>攻速 +${Math.round(b.fireRateBonus * 100)}%</span></div>`);
    if (b.critBonus > 0) auraChips.push(`<div class="relic-chip aura-chip"><span>★</span><span>暴击 +${Math.round(b.critBonus * 100)}%</span></div>`);

    if (relics.length === 0 && auraChips.length === 0) return '';
    return `
      <div class="relic-strip">
        ${relics
          .map(
            (r) =>
              `<div class="relic-chip" title="${r.description}"><span style="color:${r.accent}">${r.icon}</span><span>${r.name}</span></div>`
          )
          .join('')}
        ${auraChips.join('')}
      </div>
    `;
  }

  private renderBossBar(): string {
    const boss = this.opts.engine.state.enemies.find((e) => e.isBoss && !e.dead);
    if (!boss) return '';
    const pct = Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100));
    const offsetClass = this.opts.engine.state.isReadyTenpai ? 'below-tenpai' : '';
    return `
      <div class="boss-hp-banner ${offsetClass}" id="boss-hp-banner">
        <div class="boss-hp-head">
          <span>♛ 首领来袭 · ${boss.name}</span>
          <span>${Math.ceil(boss.hp)} / ${boss.maxHp}</span>
        </div>
        <div class="boss-hp-track">
          <div class="boss-hp-fill" style="width:${pct.toFixed(1)}%"></div>
        </div>
      </div>
    `;
  }

  private renderSelectionHint(): string {
    const s = this.opts.engine.state;
    if (!s.selection || s.activeSiphon) return '';
    const p = s.selection.prism;
    const meta = DOMAIN_META[p.domain];
    const msg =
      s.selection.source === 'reserve'
        ? `已选【${getPrismDisplayName(p.domain, p.rank)}】· 点选金色槽立即成阵 · ${meta.shatterDesc}`
        : `已选塔座【${getPrismDisplayName(p.domain, p.rank)}】· 点其他塔座移位 / 点空备律位收回 / 点「化尘」引爆`;
    return `<div class="selection-hint-bar">${msg}</div>`;
  }

  private renderSiphonCallout(): string {
    const opp = this.opts.engine.state.activeSiphon;
    if (!opp) return '';
    const isConv = opp.actionKind === 'convergence';
    const tradeNote = isConv
      ? '绝杀夺晶！立即引爆大合鸣并重创全场蚀兽'
      : '夺晶瞬间晕眩蚀兽并立即成阵（该回路将「明锁」，放弃无瑕隐阵）';

    return `
      <div class="siphon-callout ${isConv ? 'convergence' : ''}" id="siphon-callout">
        <div class="siphon-info">
          ${renderPrismSvgIcon(opp.prism.domain, opp.prism.rank)}
          <div>
            <div class="siphon-title">${opp.label}</div>
            <div class="siphon-sub">${tradeNote}</div>
          </div>
        </div>
        <div class="siphon-actions">
          <button class="btn-siphon-yes" id="btn-siphon-yes" data-action="siphon-yes">
            截律<span class="kbd-hint"> [E]</span> ${opp.cost > 0 ? `(-${opp.cost})` : '(免费!)'}
          </button>
          <button class="btn-siphon-no" id="btn-siphon-no" data-action="siphon-no">
            守清<span class="kbd-hint"> [Q]</span>
          </button>
        </div>
      </div>
    `;
  }

  private renderBottomTray(): string {
    const s = this.opts.engine.state;
    const waitCodes = new Set(s.waits.map((w) => w.code));
    const hasEmptyReserve = s.reserve.some((r) => r === null);
    const canDraw = hasEmptyReserve && s.starlight >= DRAW_COST;
    const hasSelection = s.selection !== null;
    const canShatterSelection =
      hasSelection &&
      (s.selection!.source === 'reserve' ||
        (!s.oathActive &&
          !s.circuits.find((c) => c.id === s.selection!.groupId)?.locked));
    const shatterPulseReady = this.opts.engine.shatterPulseCooldown <= 0.05;

    const slotsHtml = s.reserve
      .map((prism, idx) => {
        const isSel = s.selection?.source === 'reserve' && s.selection.reserveIndex === idx;
        const isWait = prism ? waitCodes.has(prism.code) : false;
        if (!prism) {
          return `
            <button class="reserve-slot empty" data-action="reserve-slot" data-index="${idx}">
              <span class="reserve-slot-empty-dot">空位</span>
            </button>
          `;
        }
        return `
          <button
            class="reserve-slot ${isSel ? 'selected' : ''} ${isWait ? 'wait-match' : ''}"
            data-action="reserve-slot"
            data-index="${idx}"
            title="${getPrismDisplayName(prism.domain, prism.rank)} — ${DOMAIN_META[prism.domain].shatterDesc}"
          >
            ${renderPrismSvgIcon(prism.domain, prism.rank)}
            <span class="reserve-slot-label">${getPrismDisplayName(prism.domain, prism.rank)}</span>
          </button>
        `;
      })
      .join('');

    const shatterSub = !hasSelection
      ? '先选律晶'
      : shatterPulseReady
        ? `领域爆发 +${SHATTER_REFUND}`
        : `回流 +${SHATTER_REFUND}星辉`;

    const filledReserveCount = s.reserve.filter((r) => r !== null).length;

    return `
      <div class="hud-bottom" id="hud-bottom">
        <button class="sort-mini-btn" id="btn-sort-reserve" data-action="sort-reserve" title="按系别与阶位整理备律台 [S]" ${filledReserveCount < 2 ? 'disabled' : ''}>
          <span>理晶</span>
        </button>
        <div class="reserve-slots">${slotsHtml}</div>
        <div class="tray-divider"></div>
        <div class="tray-actions">
          <button class="action-tile-btn" id="btn-draw-prism" data-action="draw-prism" ${canDraw ? '' : 'disabled'}>
            <strong>汲取律晶<span class="kbd-hint"> [D]</span></strong>
            <span>-${DRAW_COST} 星辉</span>
          </button>
          <button class="action-tile-btn shatter-btn" id="btn-shatter-prism" data-action="shatter-selected" ${canShatterSelection ? '' : 'disabled'}>
            <strong>化尘脉冲<span class="kbd-hint"> [X]</span></strong>
            <span>${shatterSub}</span>
          </button>
        </div>
      </div>
    `;
  }

  private renderConvergenceModal(): string {
    const s = this.opts.engine.state;
    const res = s.lastConvergence!;
    const mainCircuits = s.circuits.filter((c) => !c.isKeystone);

    // Ensure default selected preserve pillar is the strongest circuit
    if (!mainCircuits.some((c) => c.id === this.selectedPreserveGroupId)) {
      const sorted = [...mainCircuits].sort((a, b) => {
        const sc = (g: typeof a) =>
          (g.supercharged ? 10 : 0) + (g.formation === 'monolith' ? 5 : g.formation === 'cascade' ? 3 : 0);
        return sc(b) - sc(a);
      });
      this.selectedPreserveGroupId = sorted[0]?.id ?? '';
    }

    const rows = res.archetypes
      .map(
        (a) => `
      <div class="archetype-row" style="border-left-color:${a.badgeColor}">
        <div>
          <strong>${a.name} <span style="font-size:11px;opacity:0.65">${a.enName}</span></strong>
          <small>${a.effectSummary}</small>
        </div>
        <span class="archetype-mult-tag">×${a.multiplier.toFixed(2)}</span>
      </div>
    `
      )
      .join('');

    const pillarChoices = mainCircuits
      .map((c) => {
        const isSel = c.id === this.selectedPreserveGroupId;
        const kindLabel = c.supercharged
          ? '✦ 极律升华'
          : c.formation === 'monolith'
            ? '凝律'
            : `流律 ${c.cascadeRanks.join('-')}`;
        const domLabel = c.elementDomain ? DOMAIN_META[c.elementDomain].zhName : '';
        return `
          <button class="pillar-pick-btn ${isSel ? 'selected' : ''}" data-action="select-preserve" data-group-id="${c.id}">
            <strong>${c.name}</strong>
            <span>${domLabel} · ${kindLabel}</span>
          </button>
        `;
      })
      .join('');

    return `
      <div class="modal-backdrop">
        <div class="modal-card" id="convergence-modal">
          <div class="modal-header">
            <div>
              <div class="modal-eyebrow">GRAND CONVERGENCE · ${res.isSelfDrawn ? '星池自鸣' : '绝杀截鸣'}</div>
              <h2 class="modal-title">✦ 大合鸣奏响！</h2>
            </div>
          </div>

          <div class="convergence-mult-hero">
            <span class="mult-value">×${res.totalMultiplier.toFixed(2)}</span>
            <span class="score-gain">+${res.totalScore.toLocaleString()} 分</span>
          </div>

          <div class="archetype-list">${rows}</div>

          <div class="reward-summary-row">
            <div class="reward-box">
              <strong>+${res.starlightReward}</strong>
              <span>星辉倾泻</span>
            </div>
            <div class="reward-box">
              <strong>+${res.coreHeal}</strong>
              <span>星枢修复</span>
            </div>
            <div class="reward-box">
              <strong>Lv.${s.harmonicRank}</strong>
              <span>永久合鸣增伤</span>
            </div>
          </div>

          <div class="preserve-picker">
            <div class="preserve-label">选择保留 1 座「传承星柱」进入下轮星池：</div>
            <div class="preserve-grid">${pillarChoices}</div>
          </div>

          <button class="btn-primary" id="btn-convergence-continue" data-action="continue-convergence">
            凝印续阵（保留所选星柱并重盈星池）
          </button>
        </div>
      </div>
    `;
  }

  private renderRelicChoiceModal(): string {
    const choices = this.opts.engine.state.pendingRelicChoices;
    return `
      <div class="modal-backdrop">
        <div class="modal-card wide" id="relic-modal">
          <div class="modal-header">
            <div>
              <div class="modal-eyebrow">CONSTELLATION RELIC · 星印铭刻</div>
              <h2 class="modal-title">择一星印，永久增幅防线</h2>
            </div>
          </div>
          <div class="relic-grid">
            ${choices
              .map(
                (r) => `
              <button class="relic-card" data-action="choose-relic" data-relic-id="${r.id}">
                <span class="relic-card-icon" style="color:${r.accent}">${r.icon}</span>
                <span class="relic-card-name">${r.name}</span>
                <span class="relic-card-desc">${r.description}</span>
              </button>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;
  }

  private renderEndModal(): string {
    const s = this.opts.engine.state;
    const isWin = s.phase === 'victory';
    // Find MVP tower with highest total damage dealt
    let mvpText = '';
    let bestDmg = 0;
    for (const g of s.circuits) {
      for (const sl of g.slots) {
        if (sl.prism && sl.totalDamage > bestDmg) {
          bestDmg = sl.totalDamage;
          mvpText = `${g.name} · ${getPrismDisplayName(sl.prism.domain, sl.prism.rank)} (${Math.round(bestDmg).toLocaleString()} 伤害)`;
        }
      }
    }

    return `
      <div class="modal-backdrop">
        <div class="modal-card" id="end-modal">
          <div class="modal-header">
            <div>
              <div class="modal-eyebrow">${isWin ? 'SANCTUM PRESERVED · 战役凯旋' : 'ECLIPSE FALLEN · 星枢湮灭'}</div>
              <h2 class="modal-title">${isWin ? '✦ 蚀潮已净，星阵长明！' : '防线失守，重整星盘'}</h2>
            </div>
          </div>

          <div class="reward-summary-row">
            <div class="reward-box">
              <strong>${s.score.toLocaleString()}</strong>
              <span>最终星律分</span>
            </div>
            <div class="reward-box">
              <strong>${s.stats.convergencesTriggered}</strong>
              <span>大合鸣次数</span>
            </div>
            <div class="reward-box">
              <strong>×${s.stats.highestMultiplier.toFixed(2)}</strong>
              <span>最高单次倍率</span>
            </div>
          </div>

          <div class="reward-summary-row">
            <div class="reward-box">
              <strong>第 ${s.wave} 波</strong>
              <span>抵达波次</span>
            </div>
            <div class="reward-box">
              <strong>${s.stats.siphonsUsed}</strong>
              <span>截律夺晶</span>
            </div>
            <div class="reward-box">
              <strong>${s.stats.enemiesSlain}</strong>
              <span>净化蚀兽</span>
            </div>
          </div>

          ${
            mvpText
              ? `<div style="margin-bottom:14px;padding:8px 12px;border-radius:10px;background:rgba(217,177,95,0.12);border:1px solid var(--brass-border);font-size:12.5px;text-align:center">★ 最佳输出塔位：<strong>${mvpText}</strong></div>`
              : ''
          }

          <div style="display:flex;gap:10px;margin-top:8px">
            ${
              isWin
                ? `<button class="btn-primary" id="btn-endless" data-action="continue-endless">挑战无尽星渊</button>`
                : `<button class="btn-primary" id="btn-retry" data-action="restart-game">再战本关</button>`
            }
            <button class="btn-ghost" style="min-width:120px" data-action="confirm-return-title">返回主界面</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderAuxModal(): string {
    if (this.activeModal === 'none') return '';

    if (this.activeModal === 'confirm_exit') {
      return `
        <div class="modal-backdrop" data-action="close-modal-backdrop">
          <div class="modal-card" id="confirm-exit-modal" style="width:min(420px,100%)">
            <div class="modal-header">
              <div>
                <div class="modal-eyebrow">RETURN TO TITLE · 退出确认</div>
                <h2 class="modal-title">确认返回主界面？</h2>
              </div>
            </div>
            <p style="margin:0 0 18px;font-size:13.5px;color:var(--ivory-muted);line-height:1.6">
              当前战局（第 ${this.opts.engine.state.wave} 波）进度将不会保留。确定要放弃本轮织阵防线吗？
            </p>
            <div style="display:flex;gap:10px">
              <button class="btn-primary" id="btn-confirm-exit" data-action="confirm-return-title">确认返回</button>
              <button class="btn-ghost" style="min-width:110px" data-action="close-modal">继续战斗</button>
            </div>
          </div>
        </div>
      `;
    }

    if (this.activeModal === 'well') {
      const counts = this.opts.engine.well.getRemainingCounts();
      const domains = ['ember', 'tide', 'jade', 'astral'] as const;
      const sections = domains
        .map((d) => {
          const specs = ALL_PRISM_SPECS.filter((sp) => sp.domain === d);
          const meta = DOMAIN_META[d];
          return `
            <div class="well-domain-section">
              <div class="well-domain-title" style="color:${meta.light}">${meta.zhName}系 (${meta.enName})</div>
              <div class="well-grid" style="${d === 'astral' ? 'grid-template-columns:repeat(3,1fr)' : ''}">
                ${specs
                  .map((sp) => {
                    const left = counts[sp.code] ?? 0;
                    return `<div class="well-cell ${left === 0 ? 'depleted' : ''}" style="border-color:${meta.primary}66">
                      <span>${sp.zhName}</span>
                      <strong style="color:${left > 0 ? meta.light : '#888'}">${left}/4</strong>
                    </div>`;
                  })
                  .join('')}
              </div>
            </div>
          `;
        })
        .join('');

      const recentDiscards = this.opts.engine.state.discardPile.slice(-10).reverse();
      const discardHtml =
        recentDiscards.length > 0
          ? `<div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.1)">
              <div class="well-domain-title" style="color:var(--ivory-muted)">近期化尘记录 (最近 ${recentDiscards.length} 枚)</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${recentDiscards
                  .map(
                    (p) =>
                      `<span style="font-size:11.5px;padding:3px 8px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid ${DOMAIN_META[p.domain].primary}88;color:${DOMAIN_META[p.domain].light}">${getPrismDisplayName(p.domain, p.rank)}</span>`
                  )
                  .join('')}
              </div>
            </div>`
          : '';

      return `
        <div class="modal-backdrop" data-action="close-modal-backdrop">
          <div class="modal-card" id="well-modal">
            <div class="modal-header">
              <div>
                <div class="modal-eyebrow">ASTRAL WELL COMPASS · 读池算律</div>
                <h2 class="modal-title">星池余量 (${this.opts.engine.well.remaining}/72)</h2>
              </div>
              <button class="btn-ghost" data-action="close-modal">关闭</button>
            </div>
            <p style="margin:0 0 14px;font-size:12.5px;color:var(--ivory-muted)">
              你抽取的律晶与蚀兽携带的律晶均来自同一有限星池。若某路余量已空，果断转阵是星律大师的制胜之道！
            </p>
            ${sections}
            ${discardHtml}
          </div>
        </div>
      `;
    }

    if (this.activeModal === 'settings') {
      const cfg = this.opts.platform.profile.settings;
      return `
        <div class="modal-backdrop" data-action="close-modal-backdrop">
          <div class="modal-card" id="settings-modal">
            <div class="modal-header">
              <div>
                <div class="modal-eyebrow">SETTINGS · 观星仪校准</div>
                <h2 class="modal-title">游戏设置</h2>
              </div>
              <button class="btn-ghost" data-action="close-modal">关闭</button>
            </div>
            <div class="settings-row">
              <span>全局静音</span>
              <button class="hud-btn ${cfg.muted ? 'active' : ''}" data-action="toggle-mute">${cfg.muted ? '已静音' : '开启中'}</button>
            </div>
            <div class="settings-row">
              <span>背景五声配乐音量 (${Math.round(cfg.musicVolume * 100)}%)</span>
              <input type="range" min="0" max="100" value="${Math.round(cfg.musicVolume * 100)}" data-slider="music" class="vol-slider" />
            </div>
            <div class="settings-row">
              <span>律晶共鸣音效音量 (${Math.round(cfg.sfxVolume * 100)}%)</span>
              <input type="range" min="0" max="100" value="${Math.round(cfg.sfxVolume * 100)}" data-slider="sfx" class="vol-slider" />
            </div>
            <div class="settings-row">
              <span>截律时机自动慢动作</span>
              <button class="hud-btn ${cfg.autoSlowOnSiphon ? 'active' : ''}" data-action="toggle-autoslow">${cfg.autoSlowOnSiphon ? '开启 (推荐)' : '关闭'}</button>
            </div>
            <div class="settings-row">
              <span>显示战斗伤害数字</span>
              <button class="hud-btn ${cfg.showDamageNumbers ? 'active' : ''}" data-action="toggle-dmg">${cfg.showDamageNumbers ? '显示' : '隐藏'}</button>
            </div>
            <div style="margin-top:16px;font-size:12px;color:var(--ivory-muted);line-height:1.6">
              快捷键：<code>1-5</code> 选晶 · <code>D</code> 汲取 · <code>X</code> 化尘 · <code>E/Q</code> 截律/守清 · <code>R</code> 鸣誓 · <code>Space</code> 暂停 · <code>Tab</code> 星池余量
            </div>
          </div>
        </div>
      `;
    }

    // Codex Modal (Guide / Archetypes / Leaderboard & Achievements)
    let tabBody = '';
    if (this.codexTab === 'archetypes') {
      tabBody = `
        <div class="codex-grid">
          ${ALL_ARCHETYPE_CATALOG.map(
            (a) => `
            <div class="codex-item" style="border-left:3px solid ${a.badgeColor}">
              <div class="codex-item-head">
                <strong>${a.name}</strong>
                <span style="color:#f6dc93;font-weight:800">×${a.multiplier.toFixed(1)}</span>
              </div>
              <p>${a.conditionText}</p>
              <p style="color:#93e2be">${a.effectSummary}</p>
            </div>
          `
          ).join('')}
        </div>
      `;
    } else if (this.codexTab === 'guide') {
      tabBody = `
        <div class="codex-grid">
          <div class="codex-item">
            <div class="codex-item-head"><strong>1. 流律 vs 凝律</strong></div>
            <p>地图包含 3 座三孔回路与 1 座双孔定心双柱。三孔放入同系连续三阶（如 2-3-4）激活「流律」连锁清群；三枚完全相同激活「凝律」破甲重击。星枢系（晨星/蚀月/天穹）仅可构筑凝律或双枢。</p>
          </div>
          <div class="codex-item">
            <div class="codex-item-head"><strong>2. 截律夺晶与隐阵博弈</strong></div>
            <p>载律蚀兽头顶携带星池律晶。当它可助你成阵时触发「截律」：夺晶立成并晕眩敌人，但该回路会「明锁」并放弃「无瑕隐阵 ×1.5」加成；坚守隐阵则风险更高、收益爆炸！</p>
          </div>
          <div class="codex-item">
            <div class="codex-item-head"><strong>3. 临鸣与鸣誓定阵</strong></div>
            <p>当全阵仅差最后 1 枚律晶即可大合鸣时进入「临鸣」状态。开启「鸣誓」锁定阵型并获得 +35% 全阵攻速与 ×1.6 额外倍率！</p>
          </div>
          <div class="codex-item">
            <div class="codex-item-head"><strong>4. 四晶升华与化尘脉冲</strong></div>
            <p>将第 4 枚同款律晶注入已成型的凝律，触发「极律升华」获得轨道激光并免费岭上抽晶！不需要的律晶可「化尘」换回星辉并释放全场领域控场。</p>
          </div>
        </div>
      `;
    } else {
      const board = this.opts.platform.profile.leaderboard;
      const unlocked = new Set(this.opts.platform.profile.unlockedAchievements);
      tabBody = `
        <div style="margin-bottom:14px">
          <div class="well-domain-title">本地星律高分榜</div>
          ${
            board.length === 0
              ? '<p style="font-size:12.5px;color:var(--ivory-muted)">尚未有完赛记录，开启你的首局织阵防线吧！</p>'
              : board
                  .slice(0, 5)
                  .map(
                    (b, idx) =>
                      `<div class="settings-row"><span>#${idx + 1} · ${b.mapId} (第${b.wave}波 · 最高×${b.highestMultiplier.toFixed(1)})</span><strong style="color:#f6dc93">${b.score.toLocaleString()}</strong></div>`
                  )
                  .join('')
          }
        </div>
        <div class="well-domain-title">TapTap 成就徽章 (${unlocked.size}/${ACHIEVEMENTS.length})</div>
        <div class="codex-grid">
          ${ACHIEVEMENTS.map((a) => {
            const ok = unlocked.has(a.id);
            return `<div class="codex-item" style="opacity:${ok ? 1 : 0.5};border-color:${ok ? '#f6dc93' : 'rgba(255,255,255,0.12)'}">
              <div class="codex-item-head"><strong>${a.icon} ${a.name}</strong><span>${ok ? '已解锁' : '未解锁'}</span></div>
              <p>${a.description}</p>
            </div>`;
          }).join('')}
        </div>
      `;
    }

    return `
      <div class="modal-backdrop" data-action="close-modal-backdrop">
        <div class="modal-card wide" id="codex-modal">
          <div class="modal-header">
            <div>
              <div class="modal-eyebrow">HARMONIC CODEX · 星律典籍</div>
              <h2 class="modal-title">律谱图鉴与星榜</h2>
            </div>
            <button class="btn-ghost" data-action="close-modal">关闭</button>
          </div>
          <div class="codex-tabs">
            <button class="hud-btn ${this.codexTab === 'archetypes' ? 'active' : ''}" data-action="codex-tab" data-tab="archetypes">十一种律谱倍率</button>
            <button class="hud-btn ${this.codexTab === 'guide' ? 'active' : ''}" data-action="codex-tab" data-tab="guide">核心机制详解</button>
            <button class="hud-btn ${this.codexTab === 'records' ? 'active' : ''}" data-action="codex-tab" data-tab="records">星榜与成就</button>
          </div>
          ${tabBody}
        </div>
      </div>
    `;
  }

  private bindDelegatedEvents(): void {
    // Support pointerdown drag from Reserve slots smoothly
    this.overlayEl.addEventListener('pointerdown', (ev) => {
      const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-action="reserve-slot"]');
      if (!target) return;
      const idx = Number(target.dataset.index);
      const prism = this.opts.engine.state.reserve[idx];
      if (!prism) return;
      this.opts.onStartDragFromReserve(idx, ev.clientX, ev.clientY);
    });

    // Volume range sliders inside Settings modal
    this.overlayEl.addEventListener('input', (ev) => {
      const input = ev.target as HTMLInputElement;
      const slider = input.dataset?.slider;
      if (!slider) return;
      const val = Math.max(0, Math.min(1, Number(input.value) / 100));
      const cfg = this.opts.platform.profile.settings;
      if (slider === 'music') {
        this.opts.platform.updateSettings({ musicVolume: val });
        this.opts.audio.setVolumes(val, cfg.sfxVolume);
      } else if (slider === 'sfx') {
        this.opts.platform.updateSettings({ sfxVolume: val });
        this.opts.audio.setVolumes(cfg.musicVolume, val);
      }
    });

    this.overlayEl.addEventListener('click', (ev) => {
      const target = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!target) return;

      const action = target.dataset.action;
      if (action === 'close-modal-backdrop' && ev.target !== target) return;

      this.opts.audio.playUiClick();

      const engine = this.opts.engine;
      const s = engine.state;

      switch (action) {
        case 'select-map': {
          this.selectedMapId = target.dataset.mapId ?? 'astrolabe';
          this.forceRender();
          break;
        }
        case 'start-game': {
          this.activeModal = 'none';
          this.selectedPreserveGroupId = '';
          this.opts.onStartGame(this.selectedMapId);
          this.forceRender();
          break;
        }
        case 'restart-game': {
          this.activeModal = 'none';
          this.selectedPreserveGroupId = '';
          this.opts.onStartGame(s.mapId);
          this.forceRender();
          break;
        }
        case 'return-title': {
          if (s.phase === 'playing' && s.wave >= 1) {
            this.activeModal = 'confirm_exit';
            this.forceRender();
          } else {
            this.activeModal = 'none';
            this.opts.onReturnTitle();
            this.forceRender();
          }
          break;
        }
        case 'confirm-return-title': {
          this.activeModal = 'none';
          this.opts.onReturnTitle();
          this.forceRender();
          break;
        }
        case 'select-preserve': {
          this.selectedPreserveGroupId = target.dataset.groupId ?? '';
          this.forceRender();
          break;
        }
        case 'next-wave': {
          engine.startNextWave();
          this.forceRender();
          break;
        }
        case 'toggle-speed': {
          s.timeScale = s.timeScale === 1 ? 2 : 1;
          this.forceRender();
          break;
        }
        case 'toggle-pause': {
          s.paused = !s.paused;
          this.forceRender();
          break;
        }
        case 'reserve-slot': {
          const idx = Number(target.dataset.index);
          const prism = s.reserve[idx];
          if (prism) {
            if (s.selection?.source === 'reserve' && s.selection.reserveIndex === idx) {
              s.selection = null;
            } else {
              s.selection = { source: 'reserve', reserveIndex: idx, prism };
            }
          } else if (s.selection?.source === 'pedestal' && s.selection.groupId !== undefined) {
            engine.recallToReserve(s.selection.groupId, s.selection.slotIndex ?? 0, idx);
          }
          this.forceRender();
          break;
        }
        case 'sort-reserve': {
          engine.sortReserve();
          this.forceRender();
          break;
        }
        case 'draw-prism': {
          engine.drawPrism();
          this.forceRender();
          break;
        }
        case 'shatter-selected': {
          if (s.selection?.source === 'reserve' && s.selection.reserveIndex !== undefined) {
            engine.shatterFromReserve(s.selection.reserveIndex);
          } else if (
            s.selection?.source === 'pedestal' &&
            s.selection.groupId &&
            s.selection.slotIndex !== undefined
          ) {
            engine.shatterFromPedestal(s.selection.groupId, s.selection.slotIndex);
          }
          this.forceRender();
          break;
        }
        case 'declare-oath': {
          engine.declareOath();
          this.forceRender();
          break;
        }
        case 'siphon-yes': {
          engine.executeSiphon();
          this.forceRender();
          break;
        }
        case 'siphon-no': {
          engine.dismissSiphon();
          this.forceRender();
          break;
        }
        case 'continue-convergence': {
          const preserve = this.selectedPreserveGroupId;
          this.selectedPreserveGroupId = '';
          engine.continueAfterConvergence(preserve);
          this.forceRender();
          break;
        }
        case 'choose-relic': {
          const rid = target.dataset.relicId ?? '';
          engine.chooseRelic(rid);
          this.forceRender();
          break;
        }
        case 'continue-endless': {
          engine.continueEndlessMode();
          this.forceRender();
          break;
        }
        case 'dismiss-tutorial': {
          s.tutorialStep = 3;
          this.opts.platform.updateSettings({ tutorialSeen: true });
          this.forceRender();
          break;
        }
        case 'open-modal': {
          const modal = (target.dataset.modal as OverlayModal) ?? 'none';
          if (target.dataset.tab) {
            this.codexTab = target.dataset.tab as CodexTab;
          }
          this.activeModal = modal;
          this.forceRender();
          break;
        }
        case 'close-modal':
        case 'close-modal-backdrop': {
          this.activeModal = 'none';
          this.forceRender();
          break;
        }
        case 'codex-tab': {
          this.codexTab = (target.dataset.tab as CodexTab) ?? 'archetypes';
          this.forceRender();
          break;
        }
        case 'toggle-mute': {
          const next = !this.opts.platform.profile.settings.muted;
          this.opts.platform.updateSettings({ muted: next });
          this.opts.audio.setMuted(next);
          this.forceRender();
          break;
        }
        case 'toggle-autoslow': {
          const next = !this.opts.platform.profile.settings.autoSlowOnSiphon;
          this.opts.platform.updateSettings({ autoSlowOnSiphon: next });
          this.forceRender();
          break;
        }
        case 'toggle-dmg': {
          const next = !this.opts.platform.profile.settings.showDamageNumbers;
          this.opts.platform.updateSettings({ showDamageNumbers: next });
          this.forceRender();
          break;
        }
      }
    });
  }
}
