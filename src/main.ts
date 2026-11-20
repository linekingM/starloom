import './styles/main.css';
import { StarloomAudio } from './audio/synth';
import { StarloomEngine } from './core/engine';
import { TapTapPlatform } from './platform/taptap';
import { StarloomRenderer } from './render/renderer';
import { StarloomUiOverlay } from './render/uiOverlay';

function bootstrap(): void {
  const app = document.getElementById('app');
  if (!app) throw new Error('Missing #app root element');

  const shell = document.createElement('div');
  shell.className = 'game-shell';
  app.appendChild(shell);

  const canvas = document.createElement('canvas');
  canvas.className = 'battle-canvas';
  canvas.id = 'battle-canvas';
  shell.appendChild(canvas);

  const audio = new StarloomAudio();
  let ui: StarloomUiOverlay;

  const platform = new TapTapPlatform((ach) => {
    ui?.showToast(ach);
  });

  // Apply persisted audio preferences
  audio.setMuted(platform.profile.settings.muted);
  audio.setVolumes(platform.profile.settings.musicVolume, platform.profile.settings.sfxVolume);

  const engine = new StarloomEngine('astrolabe', undefined, {
    onPlacePrism: (domain, rank) => audio.playPlacePrism(domain, rank),
    onCircuitIgnite: (kind, domain) => audio.playCircuitIgnite(kind, domain),
    onSupercharge: () => audio.playSupercharge(),
    onShatter: (domain) => audio.playShatter(domain),
    onSiphonPrompt: () => audio.playSiphonPrompt(),
    onSiphonExecute: () => audio.playSiphonExecute(),
    onOathDeclared: () => {
      audio.playOath();
      audio.setIntensity(false, true);
    },
    onConvergence: (res) => {
      audio.playGrandConvergence();
      platform.evaluateConvergenceAchievements(res);
    },
    onWaveStart: (_wave, isBoss) => {
      audio.playWaveStart(isBoss);
      audio.setIntensity(isBoss, engine.state.oathActive);
    },
    onCoreHit: () => audio.playCoreHit(),
    onTowerFire: (domain, isCrit) => audio.playTowerFire(domain, isCrit),
    onVictory: () => {
      platform.recordRunResult(engine.state.mapId, engine.state.wave, engine.state.stats, true);
      audio.playGrandConvergence();
    },
    onGameOver: () => {
      platform.recordRunResult(engine.state.mapId, engine.state.wave, engine.state.stats, false);
    },
  });

  const renderer = new StarloomRenderer(canvas);
  renderer.showDamageNumbers = platform.profile.settings.showDamageNumbers;

  let draggingFromReserve: { index: number; startX: number; startY: number; moved: boolean } | null = null;

  ui = new StarloomUiOverlay({
    root: shell,
    engine,
    audio,
    platform,
    onStartDragFromReserve: (reserveIdx, clientX, clientY) => {
      const prism = engine.state.reserve[reserveIdx];
      if (!prism) return;
      audio.unlock();
      draggingFromReserve = { index: reserveIdx, startX: clientX, startY: clientY, moved: false };
      engine.state.selection = { source: 'reserve', reserveIndex: reserveIdx, prism };
      ui.forceRender();
    },
    onStartGame: (mapId) => {
      audio.unlock();
      engine.startNewGame(mapId, undefined, platform.profile.settings.tutorialSeen);
      ui.forceRender();
    },
    onReturnTitle: () => {
      engine.state.phase = 'title';
      engine.state.selection = null;
      audio.setIntensity(false, false);
      ui.forceRender();
    },
  });

  // Resize observer
  const handleResize = () => {
    renderer.resize(shell.clientWidth, shell.clientHeight);
  };
  handleResize();
  window.addEventListener('resize', handleResize);

  // Canvas & global pointer handling (supports both click-to-place AND smooth drag-and-drop!)
  window.addEventListener('pointermove', (ev) => {
    const pos = renderer.clientToLogical(ev.clientX, ev.clientY);
    const hit = renderer.hitTestPedestal(engine, pos.x, pos.y);
    renderer.hover = {
      x: pos.x,
      y: pos.y,
      groupId: hit?.group.id ?? null,
      slotIndex: hit?.slot.slotIndex ?? -1,
    };

    if (draggingFromReserve) {
      const dist = Math.hypot(ev.clientX - draggingFromReserve.startX, ev.clientY - draggingFromReserve.startY);
      if (dist > 10) {
        draggingFromReserve.moved = true;
        renderer.dragPos = pos;
      }
    }
  });

  window.addEventListener('pointerup', (ev) => {
    if (!draggingFromReserve) return;
    const drag = draggingFromReserve;
    draggingFromReserve = null;
    renderer.dragPos = null;

    if (drag.moved) {
      const pos = renderer.clientToLogical(ev.clientX, ev.clientY);
      const hit = renderer.hitTestPedestal(engine, pos.x, pos.y, 44);
      if (hit) {
        engine.placeFromReserve(drag.index, hit.group.id, hit.slot.slotIndex);
        ui.forceRender();
      }
    }
  });

  canvas.addEventListener('pointerdown', (ev) => {
    if (engine.state.phase !== 'playing') return;
    audio.unlock();
    const pos = renderer.clientToLogical(ev.clientX, ev.clientY);
    const hit = renderer.hitTestPedestal(engine, pos.x, pos.y, 40);
    const sel = engine.state.selection;

    if (!hit) {
      if (sel) {
        engine.state.selection = null;
        ui.forceRender();
      }
      return;
    }

    const { group, slot } = hit;

    if (sel) {
      if (sel.source === 'reserve' && sel.reserveIndex !== undefined) {
        const ok = engine.placeFromReserve(sel.reserveIndex, group.id, slot.slotIndex);
        if (!ok && slot.prism && !group.locked) {
          engine.state.selection = {
            source: 'pedestal',
            groupId: group.id,
            slotIndex: slot.slotIndex,
            prism: slot.prism,
          };
        }
        ui.forceRender();
        return;
      }

      if (sel.source === 'pedestal' && sel.groupId !== undefined && sel.slotIndex !== undefined) {
        if (sel.groupId === group.id && sel.slotIndex === slot.slotIndex) {
          engine.state.selection = null;
        } else {
          engine.moveBetweenPedestals(sel.groupId, sel.slotIndex, group.id, slot.slotIndex);
        }
        ui.forceRender();
        return;
      }
    }

    // Nothing selected yet -> select occupied pedestal prism
    if (slot.prism && !group.locked && !engine.state.oathActive) {
      engine.state.selection = {
        source: 'pedestal',
        groupId: group.id,
        slotIndex: slot.slotIndex,
        prism: slot.prism,
      };
      audio.playUiClick();
      ui.forceRender();
    }
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (ev) => {
    if (engine.state.phase !== 'playing') return;
    const key = ev.key.toLowerCase();

    if (key >= '1' && key <= '5') {
      const idx = Number(key) - 1;
      const prism = engine.state.reserve[idx];
      if (prism) {
        engine.state.selection = { source: 'reserve', reserveIndex: idx, prism };
        ui.forceRender();
      }
    } else if (key === 'd') {
      engine.drawPrism();
      ui.forceRender();
    } else if (key === 's') {
      engine.sortReserve();
      audio.playUiClick();
      ui.forceRender();
    } else if (key === 'x') {
      const sel = engine.state.selection;
      if (sel?.source === 'reserve' && sel.reserveIndex !== undefined) {
        engine.shatterFromReserve(sel.reserveIndex);
      } else if (sel?.source === 'pedestal' && sel.groupId && sel.slotIndex !== undefined) {
        engine.shatterFromPedestal(sel.groupId, sel.slotIndex);
      }
      ui.forceRender();
    } else if (key === 'e' && engine.state.activeSiphon) {
      engine.executeSiphon();
      ui.forceRender();
    } else if (key === 'q' && engine.state.activeSiphon) {
      engine.dismissSiphon();
      ui.forceRender();
    } else if (key === 'r' && engine.state.isReadyTenpai && !engine.state.oathActive) {
      engine.declareOath();
      ui.forceRender();
    } else if (key === ' ') {
      ev.preventDefault();
      engine.state.paused = !engine.state.paused;
      ui.forceRender();
    } else if (key === 'w' && !engine.state.waveInProgress) {
      engine.startNextWave();
      ui.forceRender();
    } else if (key === 'tab') {
      ev.preventDefault();
      ui.toggleModal('well');
    } else if (key === 'escape') {
      if (ui.getActiveModal() !== 'none') {
        ui.toggleModal('none');
      } else {
        engine.state.selection = null;
        ui.forceRender();
      }
    }
  });

  // Expose structured handle for automated Playwright E2E inspection & visual verification
  (window as unknown as Record<string, unknown>).__STARLOOM__ = {
    engine,
    renderer,
    ui,
    platform,
  };

  // Fixed-smooth RAF loop
  let lastTs = performance.now();
  const frame = (ts: number) => {
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    renderer.showDamageNumbers = platform.profile.settings.showDamageNumbers;
    engine.update(dt, platform.profile.settings.autoSlowOnSiphon);
    renderer.render(engine, ts / 1000);
    ui.sync();

    requestAnimationFrame(frame);
  };

  ui.forceRender();
  requestAnimationFrame(frame);
}

bootstrap();
