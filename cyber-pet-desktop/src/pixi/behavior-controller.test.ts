/**
 * BehaviorController 单元测试。
 *
 * 聚焦纯逻辑：边界约束、性格加权决策、移动与交互。
 * 通过注入确定性 rng 消除随机性，保证可重复。
 */
import { describe, expect, it } from 'vitest';

import { BehaviorController, type BehaviorTarget } from './behavior-controller';
import type { PetAction } from './pet-sprite';

/** 构造一个最小受控精灵。 */
function makeTarget(x = 100, y = 100): BehaviorTarget {
  let action: PetAction = 'idle';
  return {
    x,
    y,
    setAction(a) {
      action = a;
    },
    getAction() {
      return action;
    },
  };
}

/** 返回一个吐出预设序列的 rng（循环）。 */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return v;
  };
}

const BOUNDS = { width: 400, height: 300 };

describe('BehaviorController', () => {
  it('rng=0 时按权重选中第一个有权重的行为（idle）', () => {
    // playful 权重顺序 idle 优先；rng()=0 → 落在第一个区间。
    const ctrl = new BehaviorController('playful', BOUNDS, seqRng([0]));
    const target = makeTarget();
    ctrl.update(target, 999); // 触发决策
    expect(target.getAction()).toBe('idle');
  });

  it('rng≈1 时选中最后一个行为（sleep）', () => {
    // rng 接近 1 → 落在权重区间末端 sleep。
    const ctrl = new BehaviorController('playful', BOUNDS, seqRng([0.999]));
    const target = makeTarget();
    ctrl.update(target, 999);
    expect(target.getAction()).toBe('sleep');
  });

  it('walk 时朝目标移动且不越界', () => {
    const ctrl = new BehaviorController('calm', BOUNDS, seqRng([0.99, 0.99]));
    const target = makeTarget(50, 50);
    ctrl.poke(target); // 切 walk，目标设到接近右下角
    expect(target.getAction()).toBe('walk');

    // 推进若干帧，位置应朝目标移动且始终在边界内。
    for (let i = 0; i < 120; i += 1) {
      ctrl.update(target, 1 / 60);
      expect(target.x).toBeGreaterThanOrEqual(48);
      expect(target.x).toBeLessThanOrEqual(BOUNDS.width - 48);
      expect(target.y).toBeGreaterThanOrEqual(48);
      expect(target.y).toBeLessThanOrEqual(BOUNDS.height - 48);
    }
  });

  it('idle 行为下精灵不移动', () => {
    const ctrl = new BehaviorController('shy', BOUNDS, seqRng([0]));
    const target = makeTarget(100, 100);
    ctrl.update(target, 999); // 决策为 idle
    expect(target.getAction()).toBe('idle');
    const { x, y } = target;
    ctrl.update(target, 1); // idle 速度为 0
    expect(target.x).toBe(x);
    expect(target.y).toBe(y);
  });

  it('窗口过小时位置不会出现 NaN 或越界', () => {
    const ctrl = new BehaviorController('playful', { width: 20, height: 20 }, seqRng([0.99, 0.99]));
    const target = makeTarget(10, 10);
    ctrl.poke(target);
    for (let i = 0; i < 30; i += 1) {
      ctrl.update(target, 1 / 60);
      expect(Number.isFinite(target.x)).toBe(true);
      expect(Number.isFinite(target.y)).toBe(true);
    }
  });

  it('poke 立即切换为 walk', () => {
    const ctrl = new BehaviorController('calm', BOUNDS, seqRng([0.5, 0.5]));
    const target = makeTarget();
    target.setAction('sleep');
    ctrl.poke(target);
    expect(target.getAction()).toBe('walk');
  });
});
