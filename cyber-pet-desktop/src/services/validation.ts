/**
 * 通用校验工具。
 */

/** 宠物名称最大长度（与 Rust `PET_NAME_MAX_LEN` 对齐）。 */
const NAME_MAX_LEN = 50;

/**
 * 前端预校验宠物名称。
 * @returns 校验通过返回 null，否则返回中文错误信息。
 */
export function validatePetName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return '名称不能为空';
  }
  if (trimmed.length > NAME_MAX_LEN) {
    return `名称不能超过 ${NAME_MAX_LEN} 个字符`;
  }
  return null;
}
