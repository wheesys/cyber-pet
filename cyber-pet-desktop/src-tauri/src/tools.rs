//! 工具模块（阶段7.2）— 文件操作。
//! 宠物帮助用户：列出、搜索、创建空文件（≤5个）。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub is_dir: bool,
}

pub fn list_files(path: &str) -> Result<Vec<FileEntry>, String> {
    let dir = Path::new(path);
    if !dir.is_dir() { return Err("路径不是有效目录".to_string()); }
    let mut entries = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| format!("读取目录失败: {e}"))? {
        let entry = entry.map_err(|e| format!("读取条目失败: {e}"))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        entries.push(FileEntry { name, is_dir });
    }
    Ok(entries)
}

pub fn search_files(query: &str) -> Result<Vec<String>, String> {
    let current = std::env::current_dir().map_err(|e| format!("获取当前目录失败: {e}"))?;
    let mut results = Vec::new();
    for entry in fs::read_dir(&current).map_err(|e| format!("读取目录失败: {e}"))? {
        let entry = entry.map_err(|e| format!("读取条目失败: {e}"))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.to_lowercase().contains(&query.to_lowercase()) {
            results.push(name);
        }
    }
    Ok(results)
}

pub fn create_empty_files(path: &str, names: &[String]) -> Result<Vec<String>, String> {
    if names.len() > 5 { return Err("一次最多创建 5 个文件".to_string()); }
    let dir = Path::new(path);
    if !dir.is_dir() { return Err("目标路径不是有效目录".to_string()); }
    let mut created = Vec::new();
    for name in names {
        let safe = Path::new(name).file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "untitled".to_string());
        let target = dir.join(&safe);
        fs::write(&target, "").map_err(|e| format!("创建文件 {safe} 失败: {e}"))?;
        created.push(safe);
    }
    Ok(created)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os: String,
    pub hostname: String,
    pub cpu_count: usize,
    pub total_memory_gb: f64,
}

pub fn get_system_info() -> SystemInfo {
    let os = std::env::consts::OS.to_string();
    let hostname = std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "unknown".to_string());
    let cpu_count = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1);
    // 简单估算（不引入 sysinfo 依赖，保持绿色）。
    let total_memory_gb = 8.0; // 占位，后续可接入 sysinfo crate
    SystemInfo { os, hostname, cpu_count, total_memory_gb }
}

/// 进程信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_percent: f32,
    pub memory_mb: f64,
}

/// 获取当前系统进程列表（按 CPU 使用率降序，最多 50 个）。
pub fn get_processes() -> Vec<ProcessInfo> {
    use sysinfo::System;

    let mut sys = System::new_all();
    sys.refresh_all();

    // 短暂等待让 CPU 采样生效。
    std::thread::sleep(std::time::Duration::from_millis(100));
    sys.refresh_all();

    let mut procs: Vec<ProcessInfo> = sys
        .processes()
        .iter()
        .map(|(pid, p)| ProcessInfo {
            pid: pid.as_u32(),
            name: p.name().to_string_lossy().into_owned(),
            cpu_percent: p.cpu_usage() as f32,
            memory_mb: p.memory() as f64 / (1024.0 * 1024.0),
        })
        .collect();

    // 按 CPU 降序，限制 50 个。
    procs.sort_by(|a, b| {
        b.cpu_percent
            .partial_cmp(&a.cpu_percent)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    procs.truncate(50);
    procs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_files_limit() {
        let tmp = std::env::temp_dir().join("cyber-pet-test");
        fs::create_dir_all(&tmp).unwrap();
        let names: Vec<String> = (1..=6).map(|i| format!("test_{i}.txt")).collect();
        assert!(create_empty_files(tmp.to_str().unwrap(), &names).is_err());
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn create_files_ok() {
        let tmp = std::env::temp_dir().join("cyber-pet-test2");
        fs::create_dir_all(&tmp).unwrap();
        let names = vec!["hello.txt".to_string(), "world.txt".to_string()];
        let created = create_empty_files(tmp.to_str().unwrap(), &names).unwrap();
        assert_eq!(created.len(), 2);
        fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn get_processes_returns_non_empty() {
        let procs = get_processes();
        assert!(!procs.is_empty(), "应至少返回当前进程");
        assert!(procs.len() <= 50);
        let first = &procs[0];
        assert!(first.pid > 0);
        assert!(!first.name.is_empty());
    }

    #[test]
    fn get_processes_sorted_by_cpu() {
        let procs = get_processes();
        for w in procs.windows(2) {
            assert!(
                w[0].cpu_percent >= w[1].cpu_percent,
                "应按 CPU 降序排列"
            );
        }
    }
}
