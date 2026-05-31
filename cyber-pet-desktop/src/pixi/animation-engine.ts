/**
 * AnimationEngine — Pixi.js 动画引擎（Pixi v8）
 *
 * 参考《05-架构设计文档》3.3.5 动画引擎模块。
 *
 * 职责：
 * - 初始化透明背景的 Pixi Application（贴合无边框透明窗口）。
 * - 以 60fps ticker 驱动所有宠物精灵的 update。
 * - 管理多宠物精灵的增删（单客户端多宠物，见项目需求）。
 * - 随窗口尺寸自适应。
 *
 * 注意：Pixi v8 使用异步 `app.init()` 与 `app.canvas`，与文档示例的 v7 API 不同。
 */
import { Application, Ticker } from 'pixi.js';

import { PetSprite, type PetSpriteConfig } from './pet-sprite';

export class AnimationEngine {
  private app: Application;
  private pets = new Map<string, PetSprite>();
  private started = false;

  constructor() {
    this.app = new Application();
  }

  /**
   * 初始化引擎并把画布挂载到容器。
   * @param container 承载 Pixi canvas 的 DOM 元素。
   */
  async init(container: HTMLElement): Promise<void> {
    await this.app.init({
      // 透明背景，贴合桌宠透明窗口。
      backgroundAlpha: 0,
      antialias: true,
      // 适配高 DPI 屏幕，避免精灵模糊。
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      resizeTo: container,
    });

    container.appendChild(this.app.canvas);

    // 目标 60fps；ticker 回调按帧推进所有宠物动画。
    this.app.ticker.maxFPS = 60;
    this.app.ticker.add(this.onTick);
    this.started = true;
  }

  /** ticker 回调：将 deltaMS 换算为秒后驱动各精灵。 */
  private onTick = (ticker: Ticker): void => {
    const deltaSeconds = ticker.deltaMS / 1000;
    this.pets.forEach((pet) => pet.update(deltaSeconds));
  };

  /**
   * 添加一只宠物精灵，默认置于画布中心。
   * @returns 创建的精灵，便于调用方进一步操控。
   */
  addPet(petId: string, config: PetSpriteConfig = {}): PetSprite {
    const sprite = new PetSprite(config);
    sprite.x = this.app.screen.width / 2;
    sprite.y = this.app.screen.height / 2;
    this.pets.set(petId, sprite);
    this.app.stage.addChild(sprite);
    return sprite;
  }

  /** 获取已添加的宠物精灵。 */
  getPet(petId: string): PetSprite | undefined {
    return this.pets.get(petId);
  }

  /** 移除一只宠物精灵并释放其资源。 */
  removePet(petId: string): void {
    const sprite = this.pets.get(petId);
    if (!sprite) return;
    this.app.stage.removeChild(sprite);
    sprite.destroy({ children: true });
    this.pets.delete(petId);
  }

  /** 当前是否已初始化。 */
  isStarted(): boolean {
    return this.started;
  }

  /** 销毁引擎，移除 ticker、画布与所有精灵。 */
  destroy(): void {
    if (!this.started) return;
    this.app.ticker.remove(this.onTick);
    this.pets.clear();
    // 同时移除画布 DOM 与 GPU 资源。
    this.app.destroy(true, { children: true });
    this.started = false;
  }
}
