use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

const BREW_CANDIDATES: &[&str] = &[
    "/opt/homebrew/bin/brew",
    "/usr/local/bin/brew",
    "/home/linuxbrew/.linuxbrew/bin/brew",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrewStatus {
    pub installed: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

pub fn augmented_path() -> String {
    let extra = "/opt/homebrew/bin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin";
    match std::env::var("PATH") {
        Ok(path) => format!("{extra}:{path}"),
        Err(_) => extra.to_string(),
    }
}

pub fn resolve_brew_path() -> Option<PathBuf> {
    for candidate in BREW_CANDIDATES {
        let path = Path::new(candidate);
        if path.is_file() {
            return Some(path.to_path_buf());
        }
    }

    let path_env = augmented_path();
    let output = Command::new("sh")
        .arg("-c")
        .arg("command -v brew")
        .env("PATH", &path_env)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let resolved = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if resolved.is_empty() {
        None
    } else {
        Some(PathBuf::from(resolved))
    }
}

fn run_brew(args: &[&str]) -> Result<std::process::Output, String> {
    let brew = resolve_brew_path().ok_or_else(|| "Homebrew is not installed".to_string())?;

    Command::new(&brew)
        .args(args)
        .env("PATH", augmented_path())
        .output()
        .map_err(|e| format!("Failed to run brew: {e}"))
}

fn brew_output_success(output: std::process::Output) -> Result<String, String> {
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!(
            "brew exited with code {:?}: {}",
            output.status.code(),
            stderr.trim()
        ))
    }
}

pub fn check_brew() -> BrewStatus {
    let Some(path) = resolve_brew_path() else {
        return BrewStatus {
            installed: false,
            path: None,
            version: None,
        };
    };

    let path_str = path.to_string_lossy().into_owned();
    let version = run_brew(&["--version"])
        .ok()
        .and_then(|output| brew_output_success(output).ok());

    BrewStatus {
        installed: true,
        path: Some(path_str),
        version,
    }
}

pub fn get_installed_formula_names() -> Result<Vec<String>, String> {
    let output = run_brew(&["list", "--formula"])?;
    let stdout = brew_output_success(output)?;
    Ok(stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
        .collect())
}

pub fn get_installed_formulae_json() -> Result<serde_json::Value, String> {
    let output = run_brew(&["info", "--json=v2", "--installed"])?;
    let stdout = brew_output_success(output)?;
    serde_json::from_str(&stdout).map_err(|e| format!("Invalid JSON from brew info: {e}"))
}

/// Fast alternative to get_installed_formulae_json: parses `brew list --versions --formula`
/// which returns `name version` pairs and runs in ~100ms instead of 3-10s.
pub fn get_installed_versions_json() -> Result<serde_json::Value, String> {
    let output = run_brew(&["list", "--versions", "--formula"])?;
    let stdout = brew_output_success(output)?;
    let mut map = serde_json::Map::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // Format: "name version1 [version2 ...]" — use the last listed version
        let mut parts = line.splitn(2, ' ');
        if let (Some(name), Some(rest)) = (parts.next(), parts.next()) {
            let version = rest.split_whitespace().last().unwrap_or(rest);
            map.insert(name.to_string(), serde_json::Value::String(version.to_string()));
        }
    }
    Ok(serde_json::Value::Object(map))
}

/// Runs `brew outdated --json=v1` (~300ms) and returns the JSON directly.
/// Output shape: { "formulae": [{name, installed_versions, current_version, ...}], "casks": [...] }
pub fn get_outdated_json() -> Result<serde_json::Value, String> {
    let output = run_brew(&["outdated", "--json=v2"])?;
    let stdout = brew_output_success(output)?;
    serde_json::from_str(&stdout).map_err(|e| format!("Invalid JSON from brew outdated: {e}"))
}
