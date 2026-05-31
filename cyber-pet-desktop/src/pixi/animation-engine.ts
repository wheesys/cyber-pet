/**
 * AnimationEngine — Pixi.js 动画引擎（Pixi v8）
 *
 * 参考《05-架构设计文档》3.3.5 动画引擎模块。
 *
 * 职责：
 * - 初始化透明背景的 Pixi Application（贴合无边框透明窗口）。
 * - 以 60fps ticker 驱动所有宠物的行为状态机与精灵动画。
 * - 管理多宠物的增删（单客户端多宠物，见项目需求）。
 * - 随窗口尺寸自适应，并把边界同步给行为控制器。
 *
 * 注意：Pixi v8 使用异步 `app.init()` 与 `app.canvas`，与文档示例的 v7 API 不同。
 */
import { Application, Ticker } from 'pixi.js';

import { BehaviorController, type Personality } from './behavior-controller';
import { PetSprite, type PetSpriteConfig } from './pet-sprite';

/** 添加宠物时的配置：外观 + 性格（驱动行为）。 */
export interface AddPetOptions extends PetSpriteConfig {
  /** 性格模板，决定行为倾向。默认 calm。 */
  personality?: Personality;
  /** 是否启用自主行为（false 时仅渲染静止精灵）。默认 true。 */
  autonomous?: boolean;
}

/** 引擎内每只宠物的运行时实例：精灵 + 可选行为控制器。 */
interface PetInstance {
  sprite: PetSprite;
  behavior: BehaviorController | null;
}

export class AnimationEngine {
  private app: Application;
  private pets = new Map<string, PetInstance>();
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

    // 画布尺寸变化时把新边界同步给所有行为控制器。
    this.app.renderer.on('resize', this.onResize);

    // 目标 60fps；ticker 回调按帧推进行为与动画。
    this.app.ticker.maxFPS = 60;
    this.app.ticker.add(this.onTick);
    this.started = true;
  }

  /** ticker 回调：先推进行为状态机，再推进精灵动画。 */
  private onTick = (ticker: Ticker): void => {
    const deltaSeconds = ticker.deltaMS / 1000;
    this.pets.forEach(({ sprite, behavior }) => {
      behavior?.update(sprite, deltaSeconds);
      sprite.update(deltaSeconds);
    });
  };

  /** 窗口尺寸变化：更新所有行为控制器的可移动边界。 */
  private onResize = (): void => {
    const bounds = this.getBounds();
    this.pets.forEach(({ behavior }) => behavior?.setBounds(bounds));
  };

  /** 当前画布可视区域尺寸。 */
  getBounds(): { width: number; height: number } {
    return { width: this.app.screen.width, height: this.app.screen.height };
  }

  /**
   * 添加一只宠物，默认置于画布中心并启用自主行为。
   * @returns 创建的精灵，便于调用方进一步操控。
   */
  addPet(petId: string, options: AddPetOptions = {}): PetSprite {
    const {
      personality = 'calm',
      autonomous = true,
      ...spriteConfig
    } = options;

    const sprite = new PetSprite(spriteConfig);
    sprite.x = this.app.screen.width / 2;
    sprite.y = this.app.screen.height / 2;
    this.app.stage.addChild(sprite);

    const behavior = autonomous
      ? new BehaviorController(personality, this.getBounds())
      : null;

    this.pets.set(petId, { sprite, behavior });
    return sprite;
  }

  /** 获取已添加的宠物精灵。 */
  getPet(petId: string): PetSprite | undefined {
    return this.pets.get(petId)?.sprite;
  }

  /** 戳一下宠物，触发交互反应（切到 walk）。 */
  pokePet(petId: string): void {
    const instance = this.pets.get(petId);
    if (!instance) return;
    instance.behavior?.poke(instance.sprite);
  }

  /** 移除一只宠物并释放其资源。 */
  removePet(petId: string): void {
    const instance = this.pets.get(petId);
    if (!instance) return;
    this.app.stage.removeChild(instance.sprite);
    instance.sprite.destroy({ children: true });
    this.pets.delete(petId);
  }

  /** 当前是否已初始化。 */
  isStarted(): boolean {
    return this.started;
  }

  /** 销毁引擎，移除监听、ticker、画布与所有精灵。 */
  destroy(): void {
    if (!this.started) return;
    this.app.renderer.off('resize', this.onResize);
    this.app.ticker.remove(this.onTick);
    this.pets.clear();
    // 同时移除画布 DOM 与 GPU 资源。
    this.app.destroy(true, { children: true });
    this.started = false;
  }
}
