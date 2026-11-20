import {
  evaluatePlacementHint,
  getGroupMissingCompletions,
} from '../core/harmonics';
import { DOMAIN_META, getPrismDisplayName, getPrismShortSymbol, parsePrismCode } from '../core/well';
import type { StarloomEngine } from '../core/engine';
import type {
  CircuitGroup,
  PedestalSlot,
  PrismDomain,
  PrismInstance,
  PrismRank,
} from '../types';

export const LOGICAL_WIDTH = 1280;
export const LOGICAL_HEIGHT = 720;

export interface ViewportTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export interface HoverInfo {
  x: number;
  y: number;
  groupId: string | null;
  slotIndex: number;
}

interface AmbientStar {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
}

export class StarloomRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stars: AmbientStar[] = [];
  public transform: ViewportTransform = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
  };
  public hover: HoverInfo = { x: -100, y: -100, groupId: null, slotIndex: -1 };
  public dragPos: { x: number; y: number } | null = null;
  public showDamageNumbers = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize 2D canvas context');
    }
    this.ctx = ctx;

    // Generate deterministic atmospheric celestial dust
    for (let i = 0; i < 75; i++) {
      const s = Math.sin(i * 12.9898) * 43758.5453;
      const frac1 = s - Math.floor(s);
      const s2 = Math.sin(i * 78.233) * 19341.123;
      const frac2 = s2 - Math.floor(s2);
      this.stars.push({
        x: frac1 * LOGICAL_WIDTH,
        y: frac2 * LOGICAL_HEIGHT,
        r: 0.8 + (i % 3) * 0.7,
        phase: frac1 * Math.PI * 2,
        speed: 0.7 + (i % 4) * 0.35,
      });
    }
  }

  public resize(clientWidth: number, clientHeight: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.floor(clientWidth));
    const h = Math.max(240, Math.floor(clientHeight));
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    const scale = Math.min(w / LOGICAL_WIDTH, h / LOGICAL_HEIGHT);
    const offsetX = (w - LOGICAL_WIDTH * scale) / 2;
    const offsetY = (h - LOGICAL_HEIGHT * scale) / 2;

    this.transform = { scale, offsetX, offsetY, width: w, height: h };
  }

  public clientToLogical(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    return {
      x: (px - this.transform.offsetX) / this.transform.scale,
      y: (py - this.transform.offsetY) / this.transform.scale,
    };
  }

  public hitTestPedestal(
    engine: StarloomEngine,
    logicalX: number,
    logicalY: number,
    radius = 36
  ): { group: CircuitGroup; slot: PedestalSlot } | null {
    let best: { group: CircuitGroup; slot: PedestalSlot; dist: number } | null = null;
    for (const g of engine.state.circuits) {
      for (const s of g.slots) {
        const d = Math.hypot(logicalX - s.x, logicalY - s.y);
        if (d <= radius && (!best || d < best.dist)) {
          best = { group: g, slot: s, dist: d };
        }
      }
    }
    return best ? { group: best.group, slot: best.slot } : null;
  }

  public render(engine: StarloomEngine, nowSec: number): void {
    const ctx = this.ctx;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { scale, offsetX, offsetY, width, height } = this.transform;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Full-bleed deep celestial slate ocean background
    const bgGrad = ctx.createRadialGradient(
      width * 0.52,
      height * 0.42,
      40,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.78
    );
    bgGrad.addColorStop(0, '#1e3846');
    bgGrad.addColorStop(0.55, '#142631');
    bgGrad.addColorStop(1, '#0c1820');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Apply logical coordinate transform + subtle screen shake
    const shake = engine.state.screenShake;
    const sx = shake > 0 ? Math.sin(nowSec * 65) * shake * 10 : 0;
    const sy = shake > 0 ? Math.cos(nowSec * 58) * shake * 8 : 0;

    ctx.translate(offsetX + sx * scale, offsetY + sy * scale);
    ctx.scale(scale, scale);

    this.drawCelestialBackdrop(engine, nowSec);
    this.drawLanes(engine, nowSec);
    this.drawCircuitsAndLeylines(engine, nowSec);
    this.drawSanctumCore(engine, nowSec);
    this.drawPedestalsAndTowers(engine, nowSec);
    this.drawEnemies(engine, nowSec);
    this.drawBeams(engine);
    this.drawProjectiles(engine);
    this.drawParticles(engine);
    if (this.showDamageNumbers) {
      this.drawFloatingTexts(engine);
    }

    // Active Siphon tether indicator line on battlefield
    if (engine.state.activeSiphon) {
      this.drawSiphonPreviewLink(engine, nowSec);
    }

    // Hover Tower Inspector card (shows real damage, attack speed, and total damage dealt!)
    this.drawTowerHoverInspector(engine);

    // Cinematic Wave Start Banner
    if (engine.state.waveBanner) {
      this.drawWaveBanner(engine);
    }

    // Drag ghost prism if dragging
    if (this.dragPos && engine.state.selection) {
      ctx.save();
      ctx.globalAlpha = 0.92;
      this.drawPrismCrystal(
        this.dragPos.x,
        this.dragPos.y,
        engine.state.selection.prism,
        24,
        nowSec,
        true
      );
      ctx.restore();
    }

    // Screen-wide Oath golden border vignette
    if (engine.state.oathActive) {
      const pulse = 0.25 + 0.14 * Math.sin(nowSec * 4.5);
      ctx.save();
      ctx.strokeStyle = `rgba(244, 211, 94, ${pulse})`;
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, LOGICAL_WIDTH - 10, LOGICAL_HEIGHT - 10);
      ctx.restore();
    }

    // Shatter wave pulse flash
    if (engine.state.shatterWaveFlash) {
      const f = engine.state.shatterWaveFlash;
      ctx.save();
      ctx.globalAlpha = Math.max(0, (f.timer / 0.45) * 0.2);
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      ctx.restore();
    }

    // Grand Convergence sunburst flash
    if (engine.state.convergenceFlash > 0) {
      ctx.save();
      ctx.globalAlpha = engine.state.convergenceFlash * 0.55;
      const cg = ctx.createRadialGradient(640, 340, 20, 640, 340, 760);
      cg.addColorStop(0, '#fff9de');
      cg.addColorStop(0.5, '#f4d35e');
      cg.addColorStop(1, 'rgba(244, 211, 94, 0)');
      ctx.fillStyle = cg;
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      ctx.restore();
    }

    ctx.restore();
  }

  private drawCelestialBackdrop(engine: StarloomEngine, nowSec: number): void {
    const ctx = this.ctx;

    // Faint golden constellation threads connecting nearby stars
    ctx.save();
    ctx.strokeStyle = 'rgba(214, 178, 103, 0.08)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < this.stars.length; i += 2) {
      const a = this.stars[i];
      for (let j = i + 1; j < Math.min(this.stars.length, i + 7); j++) {
        const b = this.stars[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < 125) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // Ambient twinkling stars
    for (const st of this.stars) {
      const a = 0.22 + 0.45 * (0.5 + 0.5 * Math.sin(nowSec * st.speed + st.phase));
      ctx.fillStyle = `rgba(246, 238, 219, ${a})`;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rotating etched gilded brass astrolabe rings
    for (const ring of engine.map.decorRings) {
      ctx.save();
      ctx.translate(ring.x, ring.y);
      ctx.rotate(nowSec * ring.speed);

      ctx.strokeStyle = 'rgba(214, 178, 103, 0.16)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, ring.radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(132, 179, 167, 0.12)';
      ctx.setLineDash([6, 12]);
      ctx.beginPath();
      ctx.arc(0, 0, ring.radius - 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Degree tick marks around astrolabe ring
      ctx.strokeStyle = 'rgba(214, 178, 103, 0.24)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const inner = i % 3 === 0 ? ring.radius - 9 : ring.radius - 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * inner, Math.sin(ang) * inner);
        ctx.lineTo(Math.cos(ang) * ring.radius, Math.sin(ang) * ring.radius);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Subtle gilded brass corner astrolabe framing filigree
    ctx.save();
    ctx.strokeStyle = 'rgba(214, 178, 103, 0.18)';
    ctx.lineWidth = 1.2;
    const corners: Array<[number, number, number, number]> = [
      [18, 62, 0, Math.PI / 2],
      [LOGICAL_WIDTH - 18, 62, Math.PI / 2, Math.PI],
      [LOGICAL_WIDTH - 18, LOGICAL_HEIGHT - 18, Math.PI, Math.PI * 1.5],
      [18, LOGICAL_HEIGHT - 18, Math.PI * 1.5, Math.PI * 2],
    ];
    for (const [cx, cy, a0, a1] of corners) {
      ctx.beginPath();
      ctx.arc(cx, cy, 42, a0, a1);
      ctx.stroke();
    }
    ctx.restore();

    // Raised stepped celadon-porcelain observatory terraces beneath each circuit cluster
    for (const g of engine.state.circuits) {
      const cx = g.slots.reduce((s, p) => s + p.x, 0) / g.slots.length;
      const cy = g.slots.reduce((s, p) => s + p.y, 0) / g.slots.length;
      const maxR =
        Math.max(...g.slots.map((s) => Math.hypot(s.x - cx, s.y - cy))) + 44;

      ctx.save();
      // Outer terrace drop shadow
      ctx.fillStyle = 'rgba(5, 11, 17, 0.36)';
      ctx.beginPath();
      ctx.arc(cx, cy + 5, maxR, 0, Math.PI * 2);
      ctx.fill();

      // Outer celadon terrace tier
      const grad = ctx.createRadialGradient(cx, cy, 12, cx, cy, maxR);
      if (g.formation !== 'none' && g.elementDomain) {
        const meta = DOMAIN_META[g.elementDomain];
        grad.addColorStop(0, `${meta.primary}34`);
        grad.addColorStop(0.7, 'rgba(66, 118, 110, 0.22)');
        grad.addColorStop(1, 'rgba(28, 56, 64, 0.16)');
      } else {
        grad.addColorStop(0, 'rgba(84, 136, 130, 0.19)');
        grad.addColorStop(0.72, 'rgba(38, 68, 76, 0.14)');
        grad.addColorStop(1, 'rgba(20, 38, 49, 0.08)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
      ctx.fill();

      // Fine stepped gilded porcelain terrace rims
      ctx.strokeStyle =
        g.formation !== 'none' ? 'rgba(244, 211, 94, 0.36)' : 'rgba(164, 206, 194, 0.18)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.strokeStyle = 'rgba(214, 178, 103, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawLanes(engine: StarloomEngine, nowSec: number): void {
    const ctx = this.ctx;

    for (const lane of engine.map.lanes) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Outer aqueduct shadow
      ctx.strokeStyle = 'rgba(5, 12, 18, 0.78)';
      ctx.lineWidth = 56;
      ctx.beginPath();
      lane.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.stroke();

      // Brushed brass stone parapet trim
      ctx.strokeStyle = 'rgba(214, 178, 103, 0.42)';
      ctx.lineWidth = 46;
      ctx.stroke();

      // Celadon-stone bridge walkway surface
      ctx.strokeStyle = '#253f4b';
      ctx.lineWidth = 40;
      ctx.stroke();

      // Subtle inlaid inner stone border
      ctx.strokeStyle = 'rgba(138, 182, 174, 0.22)';
      ctx.lineWidth = 30;
      ctx.stroke();

      ctx.strokeStyle = '#203743';
      ctx.lineWidth = 28;
      ctx.stroke();

      // Animated golden starlight centerline flow
      ctx.strokeStyle = 'rgba(245, 220, 153, 0.28)';
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 16]);
      ctx.lineDashOffset = -nowSec * 36;
      ctx.stroke();
      ctx.setLineDash([]);

      // Warm gilded brass corner lanterns at intermediate bridge bends
      for (let i = 1; i < lane.length - 1; i++) {
        const pt = lane[i];
        const glow = 0.45 + 0.2 * Math.sin(nowSec * 2.5 + i);
        ctx.fillStyle = `rgba(246, 220, 147, ${glow * 0.35})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(246, 220, 147, 0.7)';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Eclipse Rift Portal at lane start
      const start = lane[0];
      const pulse = 1 + 0.09 * Math.sin(nowSec * 3.8);
      const rg = ctx.createRadialGradient(start.x, start.y, 4, start.x, start.y, 32 * pulse);
      rg.addColorStop(0, '#190e26');
      rg.addColorStop(0.55, '#462657');
      rg.addColorStop(0.85, 'rgba(217, 177, 95, 0.5)');
      rg.addColorStop(1, 'rgba(25, 14, 38, 0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(start.x, start.y, 32 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(244, 211, 94, 0.65)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(start.x, start.y, 20 * pulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#f6eedb';
      ctx.font = '600 11px "Noto Sans SC", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('蚀裂口', start.x, start.y + 38);

      ctx.restore();
    }
  }

  private drawCircuitsAndLeylines(engine: StarloomEngine, nowSec: number): void {
    const ctx = this.ctx;

    for (const group of engine.state.circuits) {
      const slots = group.slots;
      const cx = slots.reduce((s, p) => s + p.x, 0) / slots.length;
      const cy = slots.reduce((s, p) => s + p.y, 0) / slots.length;

      ctx.save();

      if (group.formation !== 'none' && group.elementDomain) {
        const meta = DOMAIN_META[group.elementDomain];

        // Filled harmonic polygon glow for Monolith!
        if (group.formation === 'monolith' && slots.length === 3) {
          ctx.fillStyle = group.supercharged ? 'rgba(244, 211, 94, 0.16)' : `${meta.primary}20`;
          ctx.beginPath();
          ctx.moveTo(slots[0].x, slots[0].y);
          ctx.lineTo(slots[1].x, slots[1].y);
          ctx.lineTo(slots[2].x, slots[2].y);
          ctx.closePath();
          ctx.fill();
        }

        // Draw luminous ley-line links
        const pairs: Array<[PedestalSlot, PedestalSlot]> =
          slots.length === 3
            ? [
                [slots[0], slots[1]],
                [slots[1], slots[2]],
                [slots[2], slots[0]],
              ]
            : [[slots[0], slots[1]]];

        // Outer glow
        ctx.strokeStyle = group.supercharged ? '#fff0bf' : meta.light;
        ctx.lineWidth = group.supercharged ? 6 : 4;
        ctx.globalAlpha = 0.35 + group.igniteFlash * 0.5;
        ctx.beginPath();
        for (const [a, b] of pairs) {
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();

        // Animated flow core for Cascade, solid radiant gold for Monolith/Anchor
        ctx.globalAlpha = 0.92;
        ctx.lineWidth = group.supercharged ? 3.2 : 2.2;
        ctx.strokeStyle = group.supercharged ? '#f4d35e' : meta.light;
        if (group.formation === 'cascade') {
          ctx.setLineDash([14, 10]);
          ctx.lineDashOffset = -nowSec * 55;
        }
        ctx.beginPath();
        for (const [a, b] of pairs) {
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // Unformed subtle brass conduit lines showing circuit grouping clearly
        ctx.strokeStyle = 'rgba(214, 178, 103, 0.28)';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        if (slots.length === 3) {
          ctx.moveTo(slots[0].x, slots[0].y);
          ctx.lineTo(slots[1].x, slots[1].y);
          ctx.lineTo(slots[2].x, slots[2].y);
          ctx.closePath();
        } else if (slots.length === 2) {
          ctx.moveTo(slots[0].x, slots[0].y);
          ctx.lineTo(slots[1].x, slots[1].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Group status badge in center of circuit
      const badgeY = group.isKeystone ? cy + 38 : cy + 4;
      const badgeLabel =
        group.formation === 'cascade'
          ? `流律 ${group.cascadeRanks.join('-')}${group.bound ? ' · 明锁' : ''}`
          : group.formation === 'monolith'
            ? `${group.supercharged ? '✦ 极律升华' : '凝律'}${group.bound ? ' · 明锁' : ''}`
            : group.formation === 'anchor'
              ? '双枢定心'
              : group.name;

      ctx.font = group.formation !== 'none'
        ? '700 12px "Noto Sans SC", system-ui, sans-serif'
        : '500 11px "Noto Sans SC", system-ui, sans-serif';
      const tw = ctx.measureText(badgeLabel).width + 18;
      ctx.fillStyle =
        group.formation !== 'none'
          ? group.supercharged
            ? 'rgba(122, 88, 22, 0.92)'
            : 'rgba(18, 35, 46, 0.88)'
          : 'rgba(14, 27, 36, 0.65)';
      this.roundRect(cx - tw / 2, badgeY - 11, tw, 22, 11);
      ctx.fill();

      ctx.strokeStyle =
        group.formation !== 'none'
          ? group.supercharged
            ? '#f4d35e'
            : group.elementDomain
              ? DOMAIN_META[group.elementDomain].light
              : '#d9b15f'
          : 'rgba(214, 178, 103, 0.32)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = group.formation !== 'none' ? '#fff7e0' : 'rgba(232, 224, 205, 0.72)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeLabel, cx, badgeY);

      ctx.restore();
    }
  }

  private drawSanctumCore(engine: StarloomEngine, nowSec: number): void {
    const ctx = this.ctx;
    const { x, y } = engine.map.corePosition;
    const hpRatio = Math.max(0, engine.state.coreHp / engine.state.maxCoreHp);

    ctx.save();
    ctx.translate(x, y);

    // Outer radiant aura
    const glow = ctx.createRadialGradient(0, 0, 8, 0, 0, 56);
    glow.addColorStop(0, 'rgba(245, 220, 153, 0.48)');
    glow.addColorStop(0.55, 'rgba(104, 184, 166, 0.2)');
    glow.addColorStop(1, 'rgba(20, 38, 49, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 56, 0, Math.PI * 2);
    ctx.fill();

    // Rotating celestial brass rings
    ctx.save();
    ctx.rotate(nowSec * 0.6);
    ctx.strokeStyle = '#d9b15f';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 34, 14, 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, 34, 14, -0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Celadon porcelain sanctuary dome
    ctx.fillStyle = '#2d5c5a';
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f4d35e';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // HP arc ring
    ctx.strokeStyle = hpRatio > 0.4 ? '#7ee0b8' : '#ff6b6b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpRatio);
    ctx.stroke();

    // Inner bright star
    ctx.fillStyle = '#fff5cf';
    this.drawStarPath(0, 0, 4, 13, 5);
    ctx.fill();

    // Label + HP number
    ctx.fillStyle = '#fff7e0';
    ctx.font = '700 12px "Noto Sans SC", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`星枢 ${engine.state.coreHp}/${engine.state.maxCoreHp}`, 0, -40);

    ctx.restore();
  }

  private drawPedestalsAndTowers(engine: StarloomEngine, nowSec: number): void {
    const ctx = this.ctx;
    const selection = engine.state.selection;
    const hoveredGroupId = this.hover.groupId;
    const hoveredSlotIdx = this.hover.slotIndex;

    for (const group of engine.state.circuits) {
      const missingList = getGroupMissingCompletions(group);

      for (const slot of group.slots) {
        const isHovered = hoveredGroupId === group.id && hoveredSlotIdx === slot.slotIndex;
        const isSelected =
          selection?.source === 'pedestal' &&
          selection.groupId === group.id &&
          selection.slotIndex === slot.slotIndex;

        // Placement hint ring when player holds/selects a prism
        let hint: ReturnType<typeof evaluatePlacementHint> = 'none';
        if (selection && !(isSelected)) {
          hint = evaluatePlacementHint(group, slot.slotIndex, selection.prism);
          // Respect Oath rule visually
          if (engine.state.oathActive && hint !== 'supercharge') {
            const isWin = engine.state.waits.some(
              (w) =>
                w.code === selection.prism.code &&
                w.groupId === group.id &&
                w.slotIndex === slot.slotIndex
            );
            if (!isWin) hint = 'none';
          }
        }

        // Draw range circle on hover or selection
        if ((isHovered || isSelected) && slot.prism) {
          const stats = engine.computeTowerStats(group, slot);
          ctx.save();
          ctx.fillStyle = 'rgba(244, 211, 94, 0.06)';
          ctx.strokeStyle = 'rgba(244, 211, 94, 0.35)';
          ctx.lineWidth = 1.4;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.arc(slot.x, slot.y, stats.range, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        // Pedestal base disc (celadon-porcelain + brass rim)
        ctx.save();
        ctx.translate(slot.x, slot.y);

        // Drop shadow
        ctx.fillStyle = 'rgba(5, 12, 17, 0.55)';
        ctx.beginPath();
        ctx.arc(0, 4, 26, 0, Math.PI * 2);
        ctx.fill();

        // Outer ring
        ctx.fillStyle = group.isKeystone ? '#2b4752' : '#213a45';
        ctx.beginPath();
        ctx.arc(0, 0, 25, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = group.supercharged
          ? '#f4d35e'
          : isSelected
            ? '#fff5cf'
            : group.formation !== 'none' && group.elementDomain
              ? DOMAIN_META[group.elementDomain].light
              : 'rgba(214, 178, 103, 0.55)';
        ctx.lineWidth = group.supercharged ? 3 : isSelected ? 2.8 : 1.8;
        ctx.stroke();

        // Inner inlaid ring
        ctx.strokeStyle = 'rgba(132, 179, 167, 0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.stroke();

        // Placement hint pulsing aura!
        if (hint !== 'none') {
          const pulse = 0.65 + 0.35 * Math.sin(nowSec * 6.5);
          ctx.strokeStyle =
            hint === 'supercharge'
              ? `rgba(255, 240, 160, ${pulse})`
              : hint === 'complete'
                ? `rgba(244, 211, 94, ${pulse})`
                : hint === 'partial'
                  ? `rgba(112, 228, 255, ${pulse * 0.9})`
                  : `rgba(246, 238, 219, ${pulse * 0.45})`;
          ctx.lineWidth = hint === 'complete' || hint === 'supercharge' ? 3.5 : 2.2;
          ctx.beginPath();
          ctx.arc(0, 0, 31 + pulse * 3, 0, Math.PI * 2);
          ctx.stroke();

          if (hint === 'supercharge' || hint === 'complete') {
            ctx.fillStyle = '#fff5cf';
            ctx.font = '700 11px "Noto Sans SC", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(hint === 'supercharge' ? '✦ 升华' : '✦ 成阵', 0, -34);
          } else if (hint === 'partial') {
            ctx.fillStyle = '#9be8ff';
            ctx.font = '600 10px "Noto Sans SC", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('连携', 0, -34);
          }
        }

        ctx.restore();

        // Draw Prism Tower if occupied
        if (slot.prism) {
          const recoilOffset = slot.recoil * 4;
          const rx = slot.x - Math.cos(slot.targetAngle) * recoilOffset;
          const ry = slot.y - Math.sin(slot.targetAngle) * recoilOffset;
          this.drawPrismCrystal(
            rx,
            ry,
            slot.prism,
            group.supercharged ? 23 : group.formation !== 'none' ? 21 : 18,
            nowSec,
            group.formation !== 'none',
            group.supercharged
          );
        } else {
          // Empty slot: show crisp pill-backed Ghost Wait Preview if this slot completes a 2-of-3 circuit!
          const slotWaits = missingList.filter((m) => m.emptySlotIndex === slot.slotIndex);
          if (slotWaits.length > 0) {
            ctx.save();
            const label = slotWaits
              .slice(0, 2)
              .map((m) => {
                const { domain, rank } = parsePrismCode(m.code);
                const prefix =
                  domain === 'ember' ? '烬' : domain === 'tide' ? '沧' : domain === 'jade' ? '翠' : '';
                return `${prefix}${getPrismShortSymbol(domain, rank)}`;
              })
              .join('/');
            const firstDomain = parsePrismCode(slotWaits[0].code).domain;
            const text = `待 ${label}`;
            ctx.font = '700 11px "Noto Sans SC", system-ui, sans-serif';
            const pw = ctx.measureText(text).width + 14;
            const pulse = 0.8 + 0.2 * Math.sin(nowSec * 4.5);
            ctx.globalAlpha = pulse;
            ctx.fillStyle = 'rgba(11, 23, 31, 0.9)';
            this.roundRect(slot.x - pw / 2, slot.y - 11, pw, 22, 11);
            ctx.fill();
            ctx.strokeStyle = DOMAIN_META[firstDomain].light;
            ctx.lineWidth = 1.2;
            ctx.stroke();

            ctx.fillStyle = DOMAIN_META[firstDomain].light;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, slot.x, slot.y + 0.5);
            ctx.restore();
          } else {
            // Subtle empty socket star
            ctx.fillStyle = 'rgba(214, 178, 103, 0.26)';
            this.drawStarPath(slot.x, slot.y, 4, 6, 2.5);
            ctx.fill();
          }
        }
      }
    }
  }

  /**
   * Renders a bespoke crystalline geometric prism relic — zero mahjong tile visuals!
   * Ember = Sunburst Diamond, Tide = Azure Teardrop/Crescent, Jade = Hexagonal Facet, Astral = Golden 4-Star.
   */
  public drawPrismCrystal(
    x: number,
    y: number,
    prism: PrismInstance,
    radius: number,
    nowSec: number,
    isFormed: boolean,
    isSupercharged = false
  ): void {
    const ctx = this.ctx;
    const meta = DOMAIN_META[prism.domain];
    const bob = Math.sin(nowSec * 3.2 + x * 0.03) * 1.8;

    ctx.save();
    ctx.translate(x, y + bob);

    // Supercharged rotating golden halo
    if (isSupercharged) {
      ctx.save();
      ctx.rotate(nowSec * 1.6);
      ctx.strokeStyle = '#f4d35e';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Luminous backdrop glow when part of a formed circuit
    if (isFormed) {
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, radius + 12);
      g.addColorStop(0, meta.glow);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 12, 0, Math.PI * 2);
      ctx.fill();
    }

    // Distinct silhouette by Domain
    const bodyGrad = ctx.createLinearGradient(-radius, -radius, radius, radius);
    bodyGrad.addColorStop(0, meta.light);
    bodyGrad.addColorStop(0.5, meta.primary);
    bodyGrad.addColorStop(1, meta.dark);
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = isSupercharged ? '#fff5cf' : 'rgba(255, 248, 224, 0.85)';
    ctx.lineWidth = 1.8;

    ctx.beginPath();
    if (prism.domain === 'ember') {
      // Faceted Sunburst Diamond
      ctx.moveTo(0, -radius * 1.12);
      ctx.lineTo(radius * 0.92, 0);
      ctx.lineTo(0, radius * 1.12);
      ctx.lineTo(-radius * 0.92, 0);
      ctx.closePath();
    } else if (prism.domain === 'tide') {
      // Celestial Wave Shield / Octagonal Droplet
      ctx.moveTo(0, -radius * 1.08);
      ctx.quadraticCurveTo(radius * 1.05, -radius * 0.1, radius * 0.72, radius * 0.72);
      ctx.quadraticCurveTo(0, radius * 1.15, -radius * 0.72, radius * 0.72);
      ctx.quadraticCurveTo(-radius * 1.05, -radius * 0.1, 0, -radius * 1.08);
      ctx.closePath();
    } else if (prism.domain === 'jade') {
      // Crisp Hexagonal Celadon Crystal
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 - Math.PI / 2;
        const px = Math.cos(a) * radius;
        const py = Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else {
      // Astral 8-Facet Celestial Star Medallion
      this.drawStarPath(0, 0, 4, radius * 1.18, radius * 0.54);
    }
    ctx.fill();
    ctx.stroke();

    // Multi-facet internal crystal specular sheen
    ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.85);
    ctx.lineTo(radius * 0.48, -radius * 0.15);
    ctx.lineTo(0, radius * 0.18);
    ctx.lineTo(-radius * 0.48, -radius * 0.15);
    ctx.closePath();
    ctx.fill();

    // Crisp Rank Number / Astral Symbol
    const sym = getPrismShortSymbol(prism.domain, prism.rank);
    ctx.fillStyle = '#fffdf5';
    ctx.font = `800 ${Math.round(radius * 0.85)}px "Noto Sans SC", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 4;
    ctx.fillText(sym, 0, 1);
    ctx.shadowBlur = 0;

    // Tiny orbital rank pips along bottom rim for instant color-blind & tactical readability
    if (prism.domain !== 'astral') {
      const pipCount = prism.rank;
      const spread = 5.2;
      const startX = -((pipCount - 1) * spread) / 2;
      for (let i = 0; i < pipCount; i++) {
        ctx.fillStyle = '#fff5cf';
        ctx.beginPath();
        ctx.arc(startX + i * spread, radius + 4, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private drawEnemies(engine: StarloomEngine, nowSec: number): void {
    const ctx = this.ctx;
    const waitCodes = new Set(engine.state.waits.map((w) => w.code));

    for (const e of engine.state.enemies) {
      if (e.dead) continue;
      ctx.save();
      ctx.translate(e.x, e.y);

      const angle = Math.atan2(e.vy, e.vx);

      // Soft shadow beneath wisp
      ctx.fillStyle = 'rgba(5, 8, 14, 0.5)';
      ctx.beginPath();
      ctx.ellipse(0, e.radius * 0.72, e.radius * 0.9, e.radius * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();

      // Status aura rings (slow = icy blue, burn = ember orange, shatter mark = emerald)
      if (e.slowTimer > 0) {
        ctx.strokeStyle = 'rgba(136, 212, 242, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (e.shatterMarkTimer > 0) {
        ctx.strokeStyle = 'rgba(147, 226, 190, 0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, e.radius + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Ink-shadow body styled after key art's Eclipse Wisps
      ctx.save();
      ctx.rotate(angle);

      const bodyFill =
        e.hitFlash > 0.2
          ? '#fff2cc'
          : e.isBoss
            ? '#1c122e'
            : e.kind === 'hulk'
              ? '#242938'
              : e.kind === 'weaver'
                ? '#2a1c3d'
                : '#171526';

      ctx.fillStyle = bodyFill;
      ctx.strokeStyle = e.isBoss
        ? '#f4d35e'
        : e.burnTimer > 0
          ? '#ff8552'
          : e.isElite
            ? '#c9a66b'
            : 'rgba(182, 166, 214, 0.55)';
      ctx.lineWidth = e.isBoss ? 2.8 : 1.6;

      // Flowing eclipse wisp tail
      const tailWave = Math.sin(nowSec * 10 + e.x * 0.05) * 4;
      ctx.beginPath();
      ctx.moveTo(e.radius, 0);
      ctx.quadraticCurveTo(0, -e.radius * 1.05, -e.radius * 1.45, tailWave - 3);
      ctx.quadraticCurveTo(-e.radius * 0.8, 0, -e.radius * 1.45, tailWave + 3);
      ctx.quadraticCurveTo(0, e.radius * 1.05, e.radius, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Glowing golden-violet eclipse eye core
      ctx.fillStyle = e.isBoss ? '#ffcf56' : e.kind === 'runner' ? '#ff8552' : '#e8c474';
      ctx.beginPath();
      ctx.arc(e.radius * 0.25, 0, e.isBoss ? 6.5 : 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Boss crown rotating ring
      if (e.isBoss) {
        ctx.save();
        ctx.rotate(-nowSec * 1.1);
        ctx.strokeStyle = 'rgba(244, 211, 94, 0.72)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, e.radius + 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Boss Eclipse Shield dome!
      if (e.shieldHp > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(155, 220, 255, 0.16)';
        ctx.strokeStyle = 'rgba(170, 232, 255, 0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius + 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // HP Bar (+ Shield bar overlay)
      const barW = e.isBoss ? 64 : e.isElite ? 38 : 28;
      const barH = e.isBoss ? 6 : 4;
      const barY = -e.radius - 10;
      ctx.fillStyle = 'rgba(10, 16, 22, 0.8)';
      ctx.fillRect(-barW / 2, barY, barW, barH);
      const hpPct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = e.isBoss ? '#f4b942' : hpPct > 0.45 ? '#6cd4a5' : '#eb6b56';
      ctx.fillRect(-barW / 2, barY, barW * hpPct, barH);
      if (e.shieldHp > 0) {
        const shPct = Math.min(1, e.shieldHp / (e.maxHp * 0.2));
        ctx.fillStyle = '#9be8ff';
        ctx.fillRect(-barW / 2, barY - 3, barW * shPct, 2.5);
      }

      // Carried Star-Prism orbiting overhead!
      if (e.carriedPrism) {
        const isWaitMatch = waitCodes.has(e.carriedPrism.code);
        const py = -e.radius - 26 + Math.sin(nowSec * 5 + e.y) * 2.5;

        if (isWaitMatch) {
          // Dramatic golden beacon when an enemy carries a WINNING waiting prism!
          ctx.save();
          ctx.strokeStyle = 'rgba(244, 211, 94, 0.85)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, py, 16 + Math.sin(nowSec * 8) * 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#fff2b2';
          ctx.font = '700 10px "Noto Sans SC", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('★ 待鸣晶', 0, py - 18);
          ctx.restore();
        }

        this.drawPrismCrystal(0, py, e.carriedPrism, 11, nowSec, true, isWaitMatch);
      }

      ctx.restore();
    }
  }

  private drawTowerHoverInspector(engine: StarloomEngine): void {
    if (!this.hover.groupId || this.hover.slotIndex < 0) return;
    const group = engine.state.circuits.find((g) => g.id === this.hover.groupId);
    const slot = group?.slots[this.hover.slotIndex];
    if (!group || !slot || !slot.prism) return;

    const stats = engine.computeTowerStats(group, slot);
    const meta = DOMAIN_META[slot.prism.domain];
    const title = `${getPrismDisplayName(slot.prism.domain, slot.prism.rank)} · ${
      group.supercharged
        ? '极律升华'
        : group.formation === 'monolith'
          ? '凝律'
          : group.formation === 'cascade'
            ? '流律'
            : group.formation === 'anchor'
              ? '双枢'
              : '散塔'
    }`;
    const line2 = `伤害 ${Math.round(stats.damage)}  攻速 ${(1 / stats.fireInterval).toFixed(1)}/s  暴击 ${Math.round(stats.critChance * 100)}%`;
    const line3 = `累计输出 ${Math.round(slot.totalDamage).toLocaleString()} · 破甲 ${Math.round(stats.armorPierce * 100)}%`;

    const ctx = this.ctx;
    ctx.save();
    const boxW = 228;
    const boxH = 66;
    const bx = Math.min(LOGICAL_WIDTH - boxW - 14, Math.max(14, slot.x - boxW / 2));
    const by = slot.y > 160 ? slot.y - 102 : slot.y + 42;

    ctx.fillStyle = 'rgba(13, 27, 36, 0.94)';
    this.roundRect(bx, by, boxW, boxH, 10);
    ctx.fill();
    ctx.strokeStyle = meta.light;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff7e0';
    ctx.font = '700 12px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillText(title, bx + 11, by + 9);

    ctx.fillStyle = '#f6dc93';
    ctx.font = '600 11px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillText(line2, bx + 11, by + 28);

    ctx.fillStyle = 'rgba(246, 238, 219, 0.78)';
    ctx.font = '500 11px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillText(line3, bx + 11, by + 45);
    ctx.restore();
  }

  private drawWaveBanner(engine: StarloomEngine): void {
    const b = engine.state.waveBanner;
    if (!b) return;

    const elapsed = b.maxTimer - b.timer;
    const fadeIn = Math.min(1, elapsed / 0.25);
    const fadeOut = Math.min(1, b.timer / 0.4);
    const alpha = Math.max(0, Math.min(fadeIn, fadeOut));

    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;

    const w = 520;
    const h = 64;
    const x = (LOGICAL_WIDTH - w) / 2;
    const y = 112;

    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, 'rgba(14, 28, 36, 0)');
    grad.addColorStop(0.18, b.isBoss ? 'rgba(54, 24, 34, 0.92)' : 'rgba(17, 36, 46, 0.9)');
    grad.addColorStop(0.82, b.isBoss ? 'rgba(54, 24, 34, 0.92)' : 'rgba(17, 36, 46, 0.9)');
    grad.addColorStop(1, 'rgba(14, 28, 36, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    const lineGrad = ctx.createLinearGradient(x, y, x + w, y);
    lineGrad.addColorStop(0, 'rgba(244, 211, 94, 0)');
    lineGrad.addColorStop(0.5, b.isBoss ? '#ff9c7a' : '#f4d35e');
    lineGrad.addColorStop(1, 'rgba(244, 211, 94, 0)');
    ctx.fillStyle = lineGrad;
    ctx.fillRect(x, y, w, 1.5);
    ctx.fillRect(x, y + h - 1.5, w, 1.5);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = b.isBoss ? '#ffe2a8' : '#fff7e0';
    ctx.font = '800 20px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillText(b.title, LOGICAL_WIDTH / 2, y + 23);

    ctx.fillStyle = 'rgba(246, 238, 219, 0.82)';
    ctx.font = '500 12px "Noto Sans SC", system-ui, sans-serif';
    ctx.fillText(b.subtitle, LOGICAL_WIDTH / 2, y + 46);
    ctx.restore();
  }

  private drawSiphonPreviewLink(engine: StarloomEngine, nowSec: number): void {
    const opp = engine.state.activeSiphon;
    if (!opp) return;
    const enemy = engine.state.enemies.find((e) => e.id === opp.enemyId && !e.dead);
    const group = engine.state.circuits.find((g) => g.id === opp.targetGroupId);
    if (!enemy || !group) return;
    const slot = group.slots[opp.targetSlotIndex] ?? group.slots[0];

    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = opp.actionKind === 'convergence' ? '#fff0bf' : '#70e4ff';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -nowSec * 70;
    ctx.beginPath();
    ctx.moveTo(enemy.x, enemy.y - enemy.radius - 22);
    ctx.lineTo(slot.x, slot.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#f4d35e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius + 12 + Math.sin(nowSec * 10) * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawBeams(engine: StarloomEngine): void {
    const ctx = this.ctx;
    for (const b of engine.state.beams) {
      const alpha = Math.max(0, b.life / b.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.width * alpha + 1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, b.width * 0.4 * alpha);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawProjectiles(engine: StarloomEngine): void {
    const ctx = this.ctx;
    for (const p of engine.state.projectiles) {
      const meta = DOMAIN_META[p.domain];
      ctx.save();

      // Luminous trail
      if (p.trail.length > 1) {
        ctx.strokeStyle = meta.primary;
        ctx.lineWidth = p.isCrit ? 4.5 : 3;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        p.trail.forEach((pt, idx) =>
          idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)
        );
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }

      // Bright core orb
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.isCrit ? '#fff9de' : meta.light;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.isCrit ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  private drawParticles(engine: StarloomEngine): void {
    const ctx = this.ctx;
    for (const pt of engine.state.particles) {
      ctx.save();
      ctx.globalAlpha = pt.alpha;
      if (pt.shape === 'ring') {
        const progress = 1 - pt.life / pt.maxLife;
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 2.5 * pt.alpha;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size + progress * 46, 0, Math.PI * 2);
        ctx.stroke();
      } else if (pt.shape === 'diamond') {
        ctx.translate(pt.x, pt.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = pt.color;
        ctx.fillRect(-pt.size / 2, -pt.size / 2, pt.size, pt.size);
      } else {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawFloatingTexts(engine: StarloomEngine): void {
    const ctx = this.ctx;
    for (const ft of engine.state.floatingTexts) {
      const alpha = Math.min(1, (ft.life / ft.maxLife) * 1.5);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `700 ${ft.size}px "Noto Sans SC", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(10, 18, 25, 0.85)';
      ctx.lineWidth = 3.5;
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  private drawStarPath(cx: number, cy: number, spikes: number, outerR: number, innerR: number): void {
    const ctx = this.ctx;
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
      rot += step;
    }
    ctx.closePath();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

export function renderPrismSvgIcon(domain: PrismDomain, rank: PrismRank): string {
  const meta = DOMAIN_META[domain];
  const sym = getPrismShortSymbol(domain, rank);

  let shape = '';
  if (domain === 'ember') {
    shape = `<polygon points="24,4 42,24 24,44 6,24" fill="${meta.primary}" stroke="${meta.light}" stroke-width="2.2"/>`;
  } else if (domain === 'tide') {
    shape = `<path d="M24 4 C38 14, 42 30, 34 39 C29 44, 19 44, 14 39 C6 30, 10 14, 24 4 Z" fill="${meta.primary}" stroke="${meta.light}" stroke-width="2.2"/>`;
  } else if (domain === 'jade') {
    shape = `<polygon points="24,5 41,14 41,34 24,43 7,34 7,14" fill="${meta.primary}" stroke="${meta.light}" stroke-width="2.2"/>`;
  } else {
    shape = `<polygon points="24,3 30,18 45,24 30,30 24,45 18,30 3,24 18,18" fill="${meta.primary}" stroke="${meta.light}" stroke-width="2.2"/>`;
  }

  return `<svg viewBox="0 0 48 48" class="prism-svg" aria-hidden="true">
    ${shape}
    <text x="24" y="25" text-anchor="middle" dominant-baseline="central" fill="#fffdf5" font-size="18" font-weight="800">${sym}</text>
  </svg>`;
}
