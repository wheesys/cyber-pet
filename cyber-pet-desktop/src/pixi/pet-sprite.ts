/**
 * PetSprite — 宠物精灵（程序化占位）
 *
 * 参考《05-架构设计文档》3.3.5 动画引擎模块。
 *
 * 当前为程序化生成的占位精灵（无真实美术资源时验证渲染链路），
 * 后续阶段接入 Spritesheet 帧动画后，仅需替换内部绘制与 update 逻辑，
 * 对外接口（构造、update、setAction、位置）保持稳定。
 */
import { Container, Graphics } from 'pixi.js';

/** 宠物动作状态，与后端 PetState.current_action 对应。 */
export type PetAction = 'idle' | 'walk' | 'run' | 'sit' | 'sleep';

/** 创建占位精灵的配置。 */
export interface PetSpriteConfig {
  /** 主体颜色（占位用）。 */
  color?: number;
  /** 精灵尺寸（像素）。 */
  size?: number;
}

const DEFAULT_COLOR = 0x6ab7ff;
const DEFAULT_SIZE = 96;

/**
 * 宠物精灵：一个可加入 Pixi stage 的容器，自带占位外观与动画。
 */
export class PetSprite extends Container {
  private body: Graphics;
  private readonly size: number;
  /** 累计时间（秒），驱动周期性动画。 */
  private elapsed = 0;
  private action: PetAction = 'idle';

  constructor(config: PetSpriteConfig = {}) {
    super();
    this.size = config.size ?? DEFAULT_SIZE;
    const color = config.color ?? DEFAULT_COLOR;

    // 占位外观：圆角方块 + 两只眼睛。锚点居中便于缩放与定位。
    this.body = new Graphics();
    this.drawBody(color);
    this.addChild(this.body);
    this.pivot.set(0, 0);
  }

  /** 绘制占位外观（圆角身体 + 眼睛）。 */
  private drawBody(color: number): void {
    const s = this.size;
    this.body
      .clear()
      .roundRect(-s / 2, -s / 2, s, s, s * 0.25)
      .fill(color);
    // 眼睛。
    const eyeR = s * 0.08;
    const eyeY = -s * 0.1;
    this.body.circle(-s * 0.18, eyeY, eyeR).fill(0xffffff);
    this.body.circle(s * 0.18, eyeY, eyeR).fill(0xffffff);
    this.body.circle(-s * 0.18, eyeY, eyeR * 0.5).fill(0x222222);
    this.body.circle(s * 0.18, eyeY, eyeR * 0.5).fill(0x222222);
  }

  /** 切换当前动作，重置动画相位。 */
  setAction(action: PetAction): void {
    if (this.action === action) return;
    this.action = action;
    this.elapsed = 0;
  }

  /** 当前动作。 */
  getAction(): PetAction {
    return this.action;
  }

  /**
   * 每帧更新动画。
   * @param deltaSeconds 距上一帧的秒数（由引擎换算 ticker.deltaTime）。
   */
  update(deltaSeconds: number): void {
    this.elapsed += deltaSeconds;

    switch (this.action) {
      case 'idle':
      case 'sit': {
        // 呼吸感：轻微缩放脉动。
        const pulse = 1 + Math.sin(this.elapsed * 2) * 0.03;
        this.scale.set(pulse);
        this.rotation = 0;
        break;
      }
      case 'walk':
      case 'run': {
        // 移动感：左右摆动 + 上下颠簸，run 频率更高。
        const freq = this.action === 'run' ? 12 : 6;
        this.rotation = Math.sin(this.elapsed * freq) * 0.08;
        const bob =
          Math.abs(Math.sin(this.elapsed * freq)) * (this.size * 0.04);
        this.scale.set(1);
        this.body.y = -bob;
        break;
      }
      case 'sleep': {
        // 睡眠：缓慢起伏，略微倾倒。
        const breathe = 1 + Math.sin(this.elapsed * 1) * 0.02;
        this.scale.set(breathe);
        this.rotation = 0.25;
        break;
      }
    }
  }
}
