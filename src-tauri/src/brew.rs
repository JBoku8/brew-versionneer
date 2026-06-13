use serde::Serialize;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Mutex, OnceLock};

struct UpgradeSession {
    stdin: ChildStdin,
    child: Child,
}

static UPGRADE_SESSION: Mutex<Option<UpgradeSession>> = Mutex::new(None);

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
    // Cache successful lookups only, so a "check again" after the user installs
    // Homebrew mid-session still re-probes the filesystem.
    static BREW_PATH: OnceLock<PathBuf> = OnceLock::new();
    if let Some(path) = BREW_PATH.get() {
        return Some(path.clone());
    }
    let found = resolve_brew_path_uncached()?;
    let _ = BREW_PATH.set(found.clone());
    Some(found)
}

fn resolve_brew_path_uncached() -> Option<PathBuf> {
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
        // Keep read-only queries fast and side-effect free.
        .env("HOMEBREW_NO_AUTO_UPDATE", "1")
        .env("HOMEBREW_NO_ANALYTICS", "1")
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

/// Fast path: filesystem lookup only, no subprocess (~1ms).
pub fn detect_brew() -> BrewStatus {
    let Some(path) = resolve_brew_path() else {
        return BrewStatus {
            installed: false,
            path: None,
            version: None,
        };
    };

    BrewStatus {
        installed: true,
        path: Some(path.to_string_lossy().into_owned()),
        version: None,
    }
}

/// Slow path: runs `brew --version` after the UI shell is visible.
pub fn brew_version() -> Option<String> {
    run_brew(&["--version"])
        .ok()
        .and_then(|output| brew_output_success(output).ok())
}

pub fn check_brew() -> BrewStatus {
    let mut status = detect_brew();
    if status.installed {
        status.version = brew_version();
    }
    status
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

/// Send a line of input to an in-progress `brew upgrade` (e.g. `"y\n"`).
pub fn upgrade_respond(response: &str) -> Result<(), String> {
    let mut guard = UPGRADE_SESSION
        .lock()
        .map_err(|e| format!("Upgrade session lock failed: {e}"))?;
    let session = guard
        .as_mut()
        .ok_or_else(|| "No upgrade in progress".to_string())?;
    session
        .stdin
        .write_all(response.as_bytes())
        .map_err(|e| format!("Failed to send input to brew: {e}"))?;
    session
        .stdin
        .flush()
        .map_err(|e| format!("Failed to flush brew stdin: {e}"))?;
    Ok(())
}

/// Abort an in-progress upgrade by declining any prompt and terminating brew.
/// Leaves the session in place so `upgrade_packages` can `wait()` and clean up.
pub fn upgrade_cancel() -> Result<(), String> {
    let mut guard = UPGRADE_SESSION
        .lock()
        .map_err(|e| format!("Upgrade session lock failed: {e}"))?;
    if let Some(session) = guard.as_mut() {
        let _ = session.stdin.write_all(b"n\n");
        let _ = session.stdin.flush();
        let _ = session.child.kill();
    }
    Ok(())
}

/// Runs `brew upgrade --no-ask <names…>`, streaming each output line (stdout +
/// stderr interleaved) through `on_line`. Stdin is piped so the frontend can
/// answer any unexpected mid-run prompts. Blocks until the upgrade finishes.
pub fn upgrade_packages<F>(names: &[String], on_line: F) -> Result<(), String>
where
    F: Fn(String) + Send + Clone + 'static,
{
    if names.is_empty() {
        return Err("No packages selected for upgrade".to_string());
    }
    let brew = resolve_brew_path().ok_or_else(|| "Homebrew is not installed".to_string())?;

    let mut child = Command::new(&brew)
        .arg("upgrade")
        .arg("--no-ask")
        .args(names)
        .env("PATH", augmented_path())
        .env("HOMEBREW_NO_AUTO_UPDATE", "1")
        .env("HOMEBREW_NO_ANALYTICS", "1")
        .env("HOMEBREW_NO_ENV_HINTS", "1")
        .env("HOMEBREW_NO_ASK", "1")
        .env("HOMEBREW_COLOR", "0")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run brew upgrade: {e}"))?;

    let stdin = child.stdin.take().ok_or_else(|| {
        "Failed to open brew stdin".to_string()
    })?;

    {
        let mut guard = UPGRADE_SESSION
            .lock()
            .map_err(|e| format!("Upgrade session lock failed: {e}"))?;
        if guard.is_some() {
            let _ = child.kill();
            return Err("An upgrade is already in progress".to_string());
        }
        *guard = Some(UpgradeSession { stdin, child });
    }

    let stderr = {
        let mut guard = UPGRADE_SESSION
            .lock()
            .map_err(|e| format!("Upgrade session lock failed: {e}"))?;
        guard
            .as_mut()
            .and_then(|session| session.child.stderr.take())
    };

    let stderr_reader = {
        let on_line = on_line.clone();
        std::thread::spawn(move || {
            if let Some(stderr) = stderr {
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    on_line(line);
                }
            }
        })
    };

    if let Some(stdout) = {
        let mut guard = UPGRADE_SESSION
            .lock()
            .map_err(|e| format!("Upgrade session lock failed: {e}"))?;
        guard
            .as_mut()
            .and_then(|session| session.child.stdout.take())
    } {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            on_line(line);
        }
    }
    let _ = stderr_reader.join();

    let status = {
        let mut guard = UPGRADE_SESSION
            .lock()
            .map_err(|e| format!("Upgrade session lock failed: {e}"))?;
        let mut session = guard
            .take()
            .ok_or_else(|| "Upgrade session lost".to_string())?;
        session
            .child
            .wait()
            .map_err(|e| format!("Failed to wait for brew upgrade: {e}"))?
    };

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "brew upgrade exited with code {:?}",
            status.code()
        ))
    }
}

/// Runs `brew bundle dump --file=-` and returns the Brewfile contents.
pub fn export_brewfile() -> Result<String, String> {
    let output = run_brew(&["bundle", "dump", "--file=-"])?;
    brew_output_success(output)
}

/// Runs `brew outdated --json=v1` (~300ms) and returns the JSON directly.
/// Output shape: { "formulae": [{name, installed_versions, current_version, ...}], "casks": [...] }
pub fn get_outdated_json() -> Result<serde_json::Value, String> {
    let output = run_brew(&["outdated", "--json=v2"])?;
    let stdout = brew_output_success(output)?;
    serde_json::from_str(&stdout).map_err(|e| format!("Invalid JSON from brew outdated: {e}"))
}
