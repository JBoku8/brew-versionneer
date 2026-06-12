use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::Duration;

const FORMULAE_CATALOG_URL: &str = "https://formulae.brew.sh/api/formula.json";
const CASKS_CATALOG_URL: &str = "https://formulae.brew.sh/api/cask.json";
const HTTP_TIMEOUT: Duration = Duration::from_secs(30);

/// Fields the UI actually reads from catalog list entries. The raw formula
/// catalog is ~25 MB; projecting to these fields shrinks the disk cache and
/// the IPC payload by ~90%. Full records are still available per-package via
/// `fetch_formula_detail`.
const CATALOG_FIELDS: &[&str] = &[
    "name",
    "token",
    "full_name",
    "tap",
    "desc",
    "description",
    "homepage",
    "version",
    "versions",
    "license",
    "deprecated",
    "deprecation_reason",
    "disabled",
    "disable_reason",
    "caveats",
];

fn slim_catalog(value: Value) -> Value {
    let Value::Array(entries) = value else {
        return value;
    };
    Value::Array(
        entries
            .into_iter()
            .map(|entry| match entry {
                Value::Object(mut obj) => {
                    obj.retain(|key, _| CATALOG_FIELDS.contains(&key.as_str()));
                    Value::Object(obj)
                }
                other => other,
            })
            .collect(),
    )
}

/// Shared HTTP client — reuses connections/TLS across requests.
fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("Brew-Versionneer/0.1")
            .timeout(HTTP_TIMEOUT)
            .build()
            .expect("failed to initialize HTTP client")
    })
}

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

fn is_cache_fresh(path: &Path, force_refresh: bool, ttl: Duration) -> bool {
    if force_refresh {
        return false;
    }
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    let Ok(modified) = metadata.modified() else {
        return false;
    };
    modified.elapsed().map(|age| age < ttl).unwrap_or(false)
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
    let response = http_client()
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
    ttl_hours: u64,
) -> Result<Value, String> {
    let cache_path = cache_dir.join(kind.cache_filename());
    let ttl = Duration::from_secs(ttl_hours.saturating_mul(60 * 60));

    if cache_path.exists() && is_cache_fresh(&cache_path, force_refresh, ttl) {
        if let Ok(value) = read_cache(&cache_path) {
            // Slim on read too, so caches written before projection existed still benefit.
            return Ok(slim_catalog(value));
        }
    }

    match fetch_json(kind.url()).await {
        Ok(value) => {
            let value = slim_catalog(value);
            let _ = write_cache(&cache_path, &value);
            Ok(value)
        }
        // Network failed — serve a stale cache (if any) rather than erroring.
        Err(err) => read_cache(&cache_path).map(slim_catalog).map_err(|_| err),
    }
}

pub async fn fetch_formula_detail(name: &str) -> Result<Value, String> {
    let encoded = urlencoding_encode(name);
    let url = format!("https://formulae.brew.sh/api/formula/{encoded}.json");
    fetch_json(&url).await
}

pub async fn fetch_cask_detail(token: &str) -> Result<Value, String> {
    let encoded = urlencoding_encode(token);
    let url = format!("https://formulae.brew.sh/api/cask/{encoded}.json");
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
