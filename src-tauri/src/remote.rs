use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

const FORMULAE_CATALOG_URL: &str = "https://formulae.brew.sh/api/formula.json";
const CASKS_CATALOG_URL: &str = "https://formulae.brew.sh/api/cask.json";
const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);

pub enum CatalogKind {
    Formulae,
    Casks,
}

impl CatalogKind {
    fn url(&self) -> &'static str {
        match self {
            CatalogKind::Formulae => FORMULAE_CATALOG_URL,
            CatalogKind::Casks => CASKS_CATALOG_URL,
        }
    }

    fn cache_filename(&self) -> &'static str {
        match self {
            CatalogKind::Formulae => "formula.json",
            CatalogKind::Casks => "cask.json",
        }
    }
}

fn is_cache_fresh(path: &Path, force_refresh: bool) -> bool {
    if force_refresh {
        return false;
    }
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    let Ok(modified) = metadata.modified() else {
        return false;
    };
    modified
        .elapsed()
        .map(|age| age < CACHE_TTL)
        .unwrap_or(false)
}

fn read_cache(path: &Path) -> Result<Value, String> {
    let contents = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&contents).map_err(|e| format!("Invalid cached JSON: {e}"))
}

fn write_cache(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let serialized = serde_json::to_string(value).map_err(|e| e.to_string())?;
    fs::write(path, serialized).map_err(|e| e.to_string())
}

async fn fetch_json(url: &str) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .user_agent("Brew-Versionneer/0.1")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Network request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    response
        .json::<Value>()
        .await
        .map_err(|e| format!("Failed to parse JSON: {e}"))
}

pub async fn fetch_catalog(
    cache_dir: &Path,
    kind: CatalogKind,
    force_refresh: bool,
) -> Result<Value, String> {
    let cache_path = cache_dir.join(kind.cache_filename());

    if cache_path.exists() && is_cache_fresh(&cache_path, force_refresh) {
        if let Ok(value) = read_cache(&cache_path) {
            return Ok(value);
        }
    }

    let value = fetch_json(kind.url()).await?;
    let _ = write_cache(&cache_path, &value);
    Ok(value)
}

pub async fn fetch_formula_detail(name: &str) -> Result<Value, String> {
    let encoded = urlencoding_encode(name);
    let url = format!("https://formulae.brew.sh/api/formula/{encoded}.json");
    fetch_json(&url).await
}

fn urlencoding_encode(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            _ => format!("%{:02X}", c as u8),
        })
        .collect()
}

pub fn cache_dir_from_app(cache_base: PathBuf) -> PathBuf {
    cache_base.join("brew-catalog")
}
