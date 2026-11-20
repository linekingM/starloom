import type { MapDefinition } from '../types';

/**
 * Logical coordinate space: 1280 x 720.
 * Playable field comfortably leaves top bar (0..64) and bottom Reserve Tray (575..720)
 * clear of pedestals and lane crossings so nothing ever overlaps on desktop or mobile!
 */
export const MAPS: MapDefinition[] = [
  {
    id: 'astrolabe',
    name: '浑天星台',
    enName: 'Celestial Astrolabe',
    subtitle: '单脉回旋长廊 · 经典星盘阵地，适合构筑大倍率纯律阵型',
    difficultyLabel: '标准 · 推荐初探',
    lanes: [
      [
        { x: 64, y: 175 },
        { x: 350, y: 175 },
        { x: 420, y: 235 },
        { x: 420, y: 425 },
        { x: 495, y: 475 },
        { x: 755, y: 475 },
        { x: 825, y: 410 },
        { x: 825, y: 225 },
        { x: 905, y: 175 },
        { x: 1135, y: 175 },
        { x: 1165, y: 315 },
      ],
    ],
    corePosition: { x: 1165, y: 335 },
    circuits: [
      {
        id: 'circuit-0',
        name: '前哨星环',
        isKeystone: false,
        slots: [
          { x: 215, y: 255 },
          { x: 325, y: 280 },
          { x: 265, y: 380 },
        ],
      },
      {
        id: 'circuit-1',
        name: '中庭星枢',
        isKeystone: false,
        slots: [
          { x: 545, y: 355 },
          { x: 695, y: 355 },
          { x: 620, y: 245 },
        ],
      },
      {
        id: 'circuit-2',
        name: '高塔星弧',
        isKeystone: false,
        slots: [
          { x: 925, y: 280 },
          { x: 1035, y: 255 },
          { x: 965, y: 390 },
        ],
      },
      {
        id: 'keystone',
        name: '定心双柱',
        isKeystone: true,
        slots: [
          { x: 1095, y: 445 },
          { x: 1200, y: 445 },
        ],
      },
    ],
    decorRings: [
      { x: 620, y: 330, radius: 220, speed: 0.04 },
      { x: 620, y: 330, radius: 330, speed: -0.022 },
      { x: 1165, y: 335, radius: 86, speed: 0.09 },
    ],
  },
  {
    id: 'meridian',
    name: '双脉星桥',
    enName: 'Twin Meridian',
    subtitle: '南北双蚀裂口合流 · 考验中庭拦截与节奏截律',
    difficultyLabel: '进阶 · 双线合流',
    lanes: [
      [
        { x: 64, y: 150 },
        { x: 420, y: 150 },
        { x: 560, y: 270 },
        { x: 760, y: 270 },
        { x: 920, y: 320 },
        { x: 1145, y: 320 },
      ],
      [
        { x: 64, y: 490 },
        { x: 420, y: 490 },
        { x: 560, y: 370 },
        { x: 760, y: 370 },
        { x: 920, y: 320 },
        { x: 1145, y: 320 },
      ],
    ],
    corePosition: { x: 1165, y: 320 },
    circuits: [
      {
        id: 'circuit-0',
        name: '北辰回路',
        isKeystone: false,
        slots: [
          { x: 220, y: 235 },
          { x: 350, y: 235 },
          { x: 285, y: 320 },
        ],
      },
      {
        id: 'circuit-1',
        name: '南冥回路',
        isKeystone: false,
        slots: [
          { x: 220, y: 405 },
          { x: 350, y: 405 },
          { x: 455, y: 320 },
        ],
      },
      {
        id: 'circuit-2',
        name: '合流天桥',
        isKeystone: false,
        slots: [
          { x: 660, y: 175 },
          { x: 660, y: 465 },
          { x: 830, y: 215 },
        ],
      },
      {
        id: 'keystone',
        name: '定心双柱',
        isKeystone: true,
        slots: [
          { x: 1015, y: 215 },
          { x: 1015, y: 425 },
        ],
      },
    ],
    decorRings: [
      { x: 660, y: 320, radius: 195, speed: 0.05 },
      { x: 285, y: 320, radius: 135, speed: -0.06 },
      { x: 1165, y: 320, radius: 90, speed: 0.08 },
    ],
  },
  {
    id: 'citadel',
    name: '蚀渊星殿',
    enName: 'Eclipse Citadel',
    subtitle: '十字回廊星渊 · 高速蚀潮冲击，极致博弈与高番狂欢',
    difficultyLabel: '大师 · 极速博弈',
    lanes: [
      [
        { x: 64, y: 320 },
        { x: 280, y: 320 },
        { x: 350, y: 165 },
        { x: 620, y: 165 },
        { x: 690, y: 320 },
        { x: 620, y: 480 },
        { x: 880, y: 480 },
        { x: 960, y: 320 },
        { x: 1150, y: 320 },
      ],
    ],
    corePosition: { x: 1168, y: 320 },
    circuits: [
      {
        id: 'circuit-0',
        name: '西门星环',
        isKeystone: false,
        slots: [
          { x: 185, y: 225 },
          { x: 185, y: 415 },
          { x: 355, y: 320 },
        ],
      },
      {
        id: 'circuit-1',
        name: '星殿核心',
        isKeystone: false,
        slots: [
          { x: 485, y: 265 },
          { x: 585, y: 320 },
          { x: 485, y: 385 },
        ],
      },
      {
        id: 'circuit-2',
        name: '东穹星阵',
        isKeystone: false,
        slots: [
          { x: 785, y: 235 },
          { x: 785, y: 385 },
          { x: 895, y: 255 },
        ],
      },
      {
        id: 'keystone',
        name: '定心双柱',
        isKeystone: true,
        slots: [
          { x: 1055, y: 220 },
          { x: 1055, y: 420 },
        ],
      },
    ],
    decorRings: [
      { x: 530, y: 320, radius: 185, speed: -0.055 },
      { x: 840, y: 320, radius: 155, speed: 0.045 },
      { x: 1168, y: 320, radius: 85, speed: 0.1 },
    ],
  },
];

export function getMapById(id: string): MapDefinition {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}

export function getPolylineLength(points: Array<{ x: number; y: number }>): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

export function samplePolyline(
  points: Array<{ x: number; y: number }>,
  progress: number
): { x: number; y: number; dx: number; dy: number } {
  const clamped = Math.max(0, Math.min(1, progress));
  const totalLen = getPolylineLength(points);
  let targetDist = clamped * totalLen;

  for (let i = 1; i < points.length; i++) {
    const segLen = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (targetDist <= segLen || i === points.length - 1) {
      const t = segLen > 0 ? Math.min(1, targetDist / segLen) : 0;
      const x = points[i - 1].x + (points[i].x - points[i - 1].x) * t;
      const y = points[i - 1].y + (points[i].y - points[i - 1].y) * t;
      const dx = segLen > 0 ? (points[i].x - points[i - 1].x) / segLen : 1;
      const dy = segLen > 0 ? (points[i].y - points[i - 1].y) / segLen : 0;
      return { x, y, dx, dy };
    }
    targetDist -= segLen;
  }

  const last = points[points.length - 1];
  return { x: last.x, y: last.y, dx: 1, dy: 0 };
}
