# 🐾 AI桌面宠物 (Cyber Pet)

> 一个跨平台的智能桌面宠物应用，让AI陪伴你的数字生活

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Android%20%7C%20iOS-lightgrey.svg)](https://github.com/wheesys/cyber-pet)
[![Status](https://img.shields.io/badge/status-MVP%20v0.1.0-brightgreen.svg)](https://github.com/wheesys/cyber-pet)

---

## ✨ 特性

### 🎨 可爱的桌面宠物
- 多种宠物形象（猫、狗、兔子等）
- 流畅的动画效果（60fps）
- 多种性格模板（古灵精怪、沉稳、聪明、文静）

### 🤖 AI驱动
- 智能对话系统（支持用户自配置AI供应商）
- 三层AI架构（调度AI + 简单问题AI + 复杂问题AI）
- 自动判断问题复杂度，智能路由

### 🌐 跨设备互动
- P2P网络连接（基于libp2p）
- 宠物可以"串门"到其他设备
- 跨设备协作（文件查找、问题求助）
- 带回礼物功能

### 🛡️ 安全可靠
- 严格的权限控制（每次操作需用户确认）
- 沙盒限制（限制可访问路径）
- 数据加密存储
- 绿色软件（删除目录即可卸载）

---

## 🏗️ 技术架构

### 桌面端
- **框架**: Tauri 2.0
- **前端**: React + TypeScript
- **动画**: Pixi.js (WebGL加速)
- **存储**: SQLite + IndexedDB

### 移动端
- **Android**: Kotlin + Jetpack Compose
- **iOS**: Swift + SwiftUI
- **性能**: 原生开发，60fps稳定

### 网络层
- **P2P**: libp2p + 固定中继节点
- **连接策略**: 先连中继（1秒），后台升级直连
- **成功率**: 90-95%（中国网络环境）

### AI层
- **调度AI**: Qwen-Plus（推荐）
- **简单问题**: DeepSeek-V4-Pro（推荐）
- **复杂问题**: GPT-5.1（推荐）
- **成本**: 用户自配置，零运营成本

---

## 📖 文档

- [可行性分析报告](doc/01-可行性分析报告.md)
- [技术方案调研报告](doc/02-技术方案调研报告.md)
- [技术选型决策](doc/04-技术选型决策.md)
- [架构设计文档](doc/05-架构设计文档.md)
- [数据库设计文档](doc/06-数据库设计文档.md)
- [阶段7基础工具总结](doc/10-阶段7基础工具完成总结.md)
- [MVP发布说明](doc/11-MVP发布说明.md)
- [待办事项](doc/00-待办事项.md)
- [更新日志](CHANGELOG.md)

---

## 🗺️ 路线图

### ✅ v0.1.0 MVP（2026-06-01）
- [x] 项目启动与技术选型
- [x] 架构设计（Tauri 2.0 + React + Pixi.js）
- [x] SQLite 数据库设计
- [x] 窗口管理（透明无边框、置顶、托盘）
- [x] 配置管理（TOML 便携模式）
- [x] 日志系统（tracing 按天轮转）
- [x] 宠物系统（CRUD + 状态机 + 动画引擎60fps）
- [x] 宠物管理界面（主从布局）
- [x] AI 集成（三层架构 + 流式对话 + 历史记录）
- [x] 基础工具（文件管理 + 系统信息 + 进程列表 + 通知）
- [x] 测试与优化（Rust 34 + Vitest 23，二进制7.2MB）

### 📅 v0.2.0 规划
- [ ] 多宠物互动系统
- [ ] P2P 网络（libp2p）
- [ ] 账户体系
- [ ] 移动端（Android/iOS）

---

## 💰 成本估算

### 用户成本
- **AI费用**: 约¥30/年（根据使用量）
- **软件费用**: 免费开源

### 开发者成本
- **P2P中继节点**: ¥1,800/年（3个节点）
- **AI费用**: ¥0（用户自配置）
- **总计**: ¥1,800/年

---

## 🚀 快速开始

### 环境要求
- Rust 1.80+
- Node.js 20+
- pnpm
- Linux: webkit2gtk-4.1, libayatana-appindicator

### 开发运行
```bash
cd cyber-pet-desktop
pnpm install
cd src-tauri && cargo build && cd ..
pnpm tauri dev
```

### 生产构建
```bash
cd cyber-pet-desktop
pnpm tauri build
# 输出: src-tauri/target/release/cyber-pet-desktop
```

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

---

## 📄 许可证

本项目采用 MIT 许可证

---

## 🙏 致谢

- [Tauri](https://tauri.app/) - 跨平台桌面应用框架
- [libp2p](https://libp2p.io/) - P2P网络库
- [Pixi.js](https://pixijs.com/) - 2D渲染引擎

---

<p align="center">
  Made with ❤️ by the Cyber Pet Team
</p>

