/**
 * BehaviorController — 宠物行为状态机
 *
 * 参考《05-架构设计文档》、《00-待办事项》阶段5.3。
 *
 * 职责：
 * - 性格加权的随机行为决策（idle/walk/run/sit/sleep）。
 * - 移动逻辑：walk/run 时朝目标点移动，到达后重新决策。
 * - 边界检测：移动目标与位置限制在窗口可视区域内（考虑精灵半径）。
 * - 交互响应：被戳（poke）时切到 walk 并短暂提速。
 *
 * 设计要点（可测试性）：
 * - 不直接依赖 Pixi，只操作一个最小 `BehaviorTarget` 接口。
 * - 随机源 `rng` 可注入，单测时用确定性序列。
 */
import type { PetAction } from './pet-sprite';

/** 性格模板，与后端 Rust `Personality` 枚举的 lowercase 序列化值一致。 */
export type Personality = 'playful' | 'calm' | 'smart' | 'shy';

/** 行为控制操作的最小精灵接口（解耦 Pixi）。 */
export interface BehaviorTarget {
  x: number;
  y: number;
  setAction(action: PetAction): void;
  getAction(): PetAction;
}

/** 可移动区域（像素），通常为窗口画布尺寸。 */
export interface Bounds {
  width: number;
  height: number;
}

/** 注入的随机源，返回 [0, 1)。默认 Math.random。 */
export type Rng = () => number;

/** 精灵到边界的内缩半径，避免贴边出界。 */
const EDGE_MARGIN = 48;

/** 各动作的移动速度（像素/秒）。idle/sit/sleep 不移动。 */
const SPEED: Record<PetAction, number> = {
  idle: 0,
  sit: 0,
  sleep: 0,
  walk: 60,
  run: 160,
};

/** 一次决策后维持当前行为的时长范围（秒）。 */
const MIN_DECISION_INTERVAL = 2;
const MAX_DECISION_INTERVAL = 5;

/** 性格 → 各行为权重。权重越高越易被选中。 */
const PERSONALITY_WEIGHTS: Record<Personality, Record<PetAction, number>> = {
  // 古灵精怪：好动，多走多跑。
  playful: { idle: 2, walk: 4, run: 3, sit: 1, sleep: 0.5 },
  // 沉稳：偏静。
  calm: { idle: 4, walk: 2, run: 0.5, sit: 3, sleep: 2 },
  // 聪明：均衡偏活跃。
  smart: { idle: 3, walk: 3, run: 2, sit: 2, sleep: 1 },
  // 文静：安静，多坐多睡。
  shy: { idle: 4, walk: 1.5, run: 0.3, sit: 3, sleep: 3 },
};

const ALL_ACTIONS: PetAction[] = ['idle', 'walk', 'run', 'sit', 'sleep'];

/**
 * 行为状态机：每帧 update，定时重新决策行为并驱动移动。
 */
export class BehaviorController {
  private bounds: Bounds;
  private readonly personality: Personality;
  private readonly rng: Rng;

  /** 距下次决策的剩余秒数。 */
  private timer = 0;
  /** 当前移动目标点（仅 walk/run 有意义）。 */
  private targetX = 0;
  private targetY = 0;

  constructor(personality: Personality, bounds: Bounds, rng: Rng = Math.random) {
    this.personality = personality;
    this.bounds = bounds;
    this.rng = rng;
  }

  /** 更新可移动区域（窗口尺寸变化时调用）。 */
  setBounds(bounds: Bounds): void {
    this.bounds = bounds;
  }

  /**
   * 每帧推进行为状态机。
   * @param target 受控精灵。
   * @param deltaSeconds 距上一帧秒数。
   */
  update(target: BehaviorTarget, deltaSeconds: number): void {
    this.timer -= deltaSeconds;
    if (this.timer <= 0) {
      this.decide(target);
    }
    this.move(target, deltaSeconds);
  }

  /** 外部交互：被戳一下，立即切到 walk 并刷新目标（短暂活跃）。 */
  poke(target: BehaviorTarget): void {
    target.setAction('walk');
    this.pickTarget();
    this.timer = MIN_DECISION_INTERVAL;
  }

  /** 重新决策当前行为，并在移动类行为下选定目标点。 */
  private decide(target: BehaviorTarget): void {
    const action = this.weightedPick();
    target.setAction(action);
    if (action === 'walk' || action === 'run') {
      this.pickTarget();
    }
    this.timer = this.randomInterval();
  }

  /** 朝目标点移动，并将位置约束在边界内。 */
  private move(target: BehaviorTarget, deltaSeconds: number): void {
    const action = target.getAction();
    const speed = SPEED[action];
    if (speed === 0) return;

    const dx = this.targetX - target.x;
    const dy = this.targetY - target.y;
    const dist = Math.hypot(dx, dy);
    const step = speed * deltaSeconds;

    if (dist <= step || dist === 0) {
      // 到达目标：吸附并立即重新决策。
      target.x = this.targetX;
      target.y = this.targetY;
      this.timer = 0;
    } else {
      target.x += (dx / dist) * step;
      target.y += (dy / dist) * step;
    }
    this.clampPosition(target);
  }

  /** 在边界内随机选一个移动目标点。 */
  private pickTarget(): void {
    const [minX, maxX, minY, maxY] = this.movableRange();
    this.targetX = minX + this.rng() * (maxX - minX);
    this.targetY = minY + this.rng() * (maxY - minY);
  }

  /** 将精灵位置约束在可移动范围内。 */
  private clampPosition(target: BehaviorTarget): void {
    const [minX, maxX, minY, maxY] = this.movableRange();
    target.x = clamp(target.x, minX, maxX);
    target.y = clamp(target.y, minY, maxY);
  }

  /** 计算考虑边距后的可移动范围 [minX, maxX, minY, maxY]。 */
  private movableRange(): [number, number, number, number] {
    const minX = EDGE_MARGIN;
    const minY = EDGE_MARGIN;
    // 防御：窗口过小时退化为单点，避免 max < min。
    const maxX = Math.max(minX, this.bounds.width - EDGE_MARGIN);
    const maxY = Math.max(minY, this.bounds.height - EDGE_MARGIN);
    return [minX, maxX, minY, maxY];
  }

  /** 按性格权重随机挑选一个行为。 */
  private weightedPick(): PetAction {
    const weights = PERSONALITY_WEIGHTS[this.personality];
    const total = ALL_ACTIONS.reduce((sum, a) => sum + weights[a], 0);
    let roll = this.rng() * total;
    for (const action of ALL_ACTIONS) {
      roll -= weights[action];
      if (roll < 0) return action;
    }
    return 'idle'; // 理论不可达，兜底。
  }

  /** 随机决策间隔（秒）。 */
  private randomInterval(): number {
    return MIN_DECISION_INTERVAL + this.rng() * (MAX_DECISION_INTERVAL - MIN_DECISION_INTERVAL);
  }
}

/** 将值约束在 [min, max]。 */
function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
