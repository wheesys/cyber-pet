//! 宠物领域模型模块
//!
//! 职责：宠物及其状态的数据结构、类型/性格枚举与默认值。
//! 参考《06-数据库设计文档》3.1 宠物表、3.2 宠物状态表。
//!
//! 设计原则（SRP）：本模块只负责领域模型与校验，
//! 持久化（建表、CRUD SQL）由 `database` 模块负责。
//!
//! 行为状态机（idle/walk/run 等）见阶段5.3，此处仅承载 `current_action` 字段。

use serde::{Deserialize, Serialize};

/// 宠物类型。与数据库 `pets.type` 文本值对应。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PetType {
    /// 猫
    Cat,
    /// 狗
    Dog,
    /// 兔子
    Rabbit,
    /// 自定义形象
    Custom,
}

/// 性格模板。与数据库 `pets.personality` 文本值对应。
///
/// 性格影响 AI 行为与语言风格，但严格限度，不得损害用户设备/文件（见 CLAUDE.md）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Personality {
    /// 古灵精怪
    Playful,
    /// 沉稳
    Calm,
    /// 聪明
    Smart,
    /// 文静
    Shy,
}

/// 宠物基础信息（对应 pets 表）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pet {
    /// 主键，自增；创建前为 None。
    pub id: Option<i64>,
    /// 宠物名称（最长 50 字符，由命令层校验）。
    pub name: String,
    /// 宠物类型。
    pub pet_type: PetType,
    /// 性格模板。
    pub personality: Personality,
    /// 形象资源路径（可空）。
    pub avatar_path: Option<String>,
    /// 等级（1-100）。
    pub level: i32,
    /// 经验值（>=0）。
    pub experience: i64,
    /// 创建时间（YYYY-MM-DD HH:MM:SS，由数据库默认值填充）。
    pub created_at: Option<String>,
    /// 更新时间。
    pub updated_at: Option<String>,
}

/// 宠物实时状态（对应 pet_states 表）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetState {
    /// 关联宠物 ID。
    pub pet_id: i64,
    /// 心情值（0-100）。
    pub mood: i32,
    /// 能量值（0-100）。
    pub energy: i32,
    /// X 坐标（屏幕像素）。
    pub position_x: f64,
    /// Y 坐标（屏幕像素）。
    pub position_y: f64,
    /// 当前动作（idle/walk/run/sit/sleep）。
    pub current_action: String,
}

/// 创建宠物的输入参数（不含数据库生成字段）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewPet {
    pub name: String,
    pub pet_type: PetType,
    pub personality: Personality,
    pub avatar_path: Option<String>,
}

/// 更新宠物的输入参数（仅名称 + 性格，类型不可变）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatePet {
    pub id: i64,
    pub name: String,
    pub personality: Personality,
}

impl PetType {
    /// 转为数据库存储的文本值。
    pub fn as_str(&self) -> &'static str {
        match self {
            PetType::Cat => "cat",
            PetType::Dog => "dog",
            PetType::Rabbit => "rabbit",
            PetType::Custom => "custom",
        }
    }

    /// 从数据库文本值解析，未知值回退 Custom（容错）。
    pub fn from_str(s: &str) -> Self {
        match s {
            "cat" => PetType::Cat,
            "dog" => PetType::Dog,
            "rabbit" => PetType::Rabbit,
            _ => PetType::Custom,
        }
    }
}

impl Personality {
    /// 转为数据库存储的文本值。
    pub fn as_str(&self) -> &'static str {
        match self {
            Personality::Playful => "playful",
            Personality::Calm => "calm",
            Personality::Smart => "smart",
            Personality::Shy => "shy",
        }
    }

    /// 从数据库文本值解析，未知值回退 Calm（容错）。
    pub fn from_str(s: &str) -> Self {
        match s {
            "playful" => Personality::Playful,
            "smart" => Personality::Smart,
            "shy" => Personality::Shy,
            _ => Personality::Calm,
        }
    }
}

impl PetState {
    /// 新建宠物的默认初始状态。
    pub fn default_for(pet_id: i64) -> Self {
        Self {
            pet_id,
            mood: 50,
            energy: 100,
            position_x: 0.0,
            position_y: 0.0,
            current_action: "idle".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pet_type_roundtrip() {
        for t in [PetType::Cat, PetType::Dog, PetType::Rabbit, PetType::Custom] {
            assert_eq!(PetType::from_str(t.as_str()), t);
        }
        // 未知值回退 Custom。
        assert_eq!(PetType::from_str("unknown"), PetType::Custom);
    }

    #[test]
    fn personality_roundtrip() {
        for p in [
            Personality::Playful,
            Personality::Calm,
            Personality::Smart,
            Personality::Shy,
        ] {
            assert_eq!(Personality::from_str(p.as_str()), p);
        }
        // 未知值回退 Calm。
        assert_eq!(Personality::from_str("unknown"), Personality::Calm);
    }

    #[test]
    fn default_state_is_sane() {
        let s = PetState::default_for(7);
        assert_eq!(s.pet_id, 7);
        assert_eq!(s.mood, 50);
        assert_eq!(s.energy, 100);
        assert_eq!(s.current_action, "idle");
    }
}
