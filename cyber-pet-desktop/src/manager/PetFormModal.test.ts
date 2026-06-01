/**
 * PetFormModal 前端校验逻辑测试。
 *
 * 验证 `validatePetName` 纯函数的边界条件。
 */

import { describe, expect, it } from 'vitest';
import { validatePetName } from '../services/validation';

describe('validatePetName', () => {
  it('正常名称返回 null', () => {
    expect(validatePetName('小白')).toBeNull();
  });

  it('单字符名称通过', () => {
    expect(validatePetName('a')).toBeNull();
  });

  it('50 字符名称（上限）通过', () => {
    const name = 'a'.repeat(50);
    expect(validatePetName(name)).toBeNull();
  });

  it('超过 50 字符返回错误', () => {
    const name = 'a'.repeat(51);
    const err = validatePetName(name);
    expect(err).not.toBeNull();
    expect(err).toContain('50');
  });

  it('空字符串返回错误', () => {
    const err = validatePetName('');
    expect(err).not.toBeNull();
    expect(err).toContain('不能为空');
  });

  it('纯空白字符串返回错误', () => {
    const err = validatePetName('   ');
    expect(err).not.toBeNull();
    expect(err).toContain('不能为空');
  });

  it('前后空白自动 trim 后通过', () => {
    expect(validatePetName('  小白  ')).toBeNull();
  });

  it('前后空白 trim 后若超长则报错', () => {
    const name = '  ' + 'a'.repeat(51) + '  ';
    const err = validatePetName(name);
    expect(err).not.toBeNull();
    expect(err).toContain('50');
  });
});
