// IPA file inspection commands
// Implements US6: IPA File Inspection (Read-only)

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

use crate::models::IpaMetadata;

/// Response for check_has_ipa_files command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckHasIpaFilesResponse {
    pub success: bool,
    pub has_ipa_files: bool,
    pub count: usize,
    pub error: Option<String>,
}

/// Response for scan_project_ipa command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProjectIpaResponse {
    pub success: bool,
    pub results: Vec<IpaMetadata>,
    pub error: Option<String>,
}

/// Directories to exclude from IPA file search
fn excluded_dirs() -> HashSet<&'static str> {
    let mut set = HashSet::new();
    set.insert("node_modules");
    set.insert(".git");
    set.insert(".svn");
    set.insert(".hg");
    set.insert(".cache");
    set.insert("Pods");
    set
}

/// Recursively find all .ipa files in a directory
fn find_ipa_files(dir_path: &Path, max_depth: usize) -> Vec<String> {
    let mut ipa_files = Vec::new();
    let excluded = excluded_dirs();

    fn scan_dir(
        current_path: &Path,
        depth: usize,
        max_depth: usize,
        excluded: &HashSet<&str>,
        ipa_files: &mut Vec<String>,
    ) {
        if depth > max_depth {
            return;
        }

        if let Ok(entries) = fs::read_dir(current_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                let file_name = entry.file_name();
                let file_name_str = file_name.to_string_lossy();

                if path.is_dir() {
                    // Skip excluded directories
                    if !excluded.contains(file_name_str.as_ref()) {
                        scan_dir(&path, depth + 1, max_depth, excluded, ipa_files);
                    }
                } else if path.is_file() {
                    // Check for .ipa extension (case insensitive)
                    if file_name_str.to_lowercase().ends_with(".ipa") {
                        ipa_files.push(path.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    scan_dir(dir_path, 0, max_depth, &excluded, &mut ipa_files);
    ipa_files
}

/// Extract Info.plist data from an IPA file
fn extract_plist_from_ipa(ipa_path: &Path) -> Result<plist::Value, String> {
    let file = File::open(ipa_path).map_err(|e| format!("Failed to open IPA: {}", e))?;

    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read IPA as zip: {}", e))?;

    // Find Info.plist in Payload/*.app/
    let plist_entry_name = (0..archive.len())
        .filter_map(|i| {
            archive.by_index(i).ok().and_then(|entry| {
                let name = entry.name().to_string();
                // Match pattern: Payload/*.app/Info.plist
                if name.starts_with("Payload/")
                    && name.ends_with(".app/Info.plist")
                    && name.matches('/').count() == 2
                {
                    Some(name)
                } else {
                    None
                }
            })
        })
        .next()
        .ok_or_else(|| "Info.plist not found in IPA".to_string())?;

    let mut plist_entry = archive
        .by_name(&plist_entry_name)
        .map_err(|e| format!("Failed to read plist entry: {}", e))?;

    let mut plist_data = Vec::new();
    plist_entry
        .read_to_end(&mut plist_data)
        .map_err(|e| format!("Failed to read plist data: {}", e))?;

    // Parse plist (supports both binary and XML formats)
    plist::from_bytes(&plist_data).map_err(|e| format!("Failed to parse plist: {}", e))
}

/// Extract metadata from plist Value
fn extract_metadata_from_plist(
    plist_value: &plist::Value,
    file_name: &str,
    file_path: &str,
) -> IpaMetadata {
    let get_string = |key: &str| -> String {
        plist_value
            .as_dictionary()
            .and_then(|d| d.get(key))
            .and_then(|v| v.as_string())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "N/A".to_string())
    };

    let bundle_id = get_string("CFBundleIdentifier");
    let version = get_string("CFBundleShortVersionString");
    let build = get_string("CFBundleVersion");
    let display_name = {
        let name = get_string("CFBundleDisplayName");
        if name == "N/A" {
            get_string("CFBundleName")
        } else {
            name
        }
    };

    // Device capabilities can be array or dictionary
    let device_capabilities = plist_value
        .as_dictionary()
        .and_then(|d| d.get("UIRequiredDeviceCapabilities"))
        .map(|v| {
            if let Some(arr) = v.as_array() {
                arr.iter()
                    .filter_map(|v| v.as_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            } else if let Some(dict) = v.as_dictionary() {
                dict.keys().cloned().collect::<Vec<_>>().join(", ")
            } else {
                "N/A".to_string()
            }
        })
        .unwrap_or_else(|| "N/A".to_string());

    // Convert plist to JSON for full_plist field
    let full_plist = plist_to_json(plist_value);

    IpaMetadata {
        file_name: file_name.to_string(),
        file_path: file_path.to_string(),
        bundle_id,
        version,
        build,
        display_name,
        device_capabilities,
        error: None,
        full_plist: Some(full_plist),
        created_at: Utc::now().to_rfc3339(),
    }
}

/// Convert plist Value to JSON Value
fn plist_to_json(value: &plist::Value) -> serde_json::Value {
    match value {
        plist::Value::Array(arr) => {
            serde_json::Value::Array(arr.iter().map(plist_to_json).collect())
        }
        plist::Value::Dictionary(dict) => {
            let map: serde_json::Map<String, serde_json::Value> = dict
                .iter()
                .map(|(k, v)| (k.clone(), plist_to_json(v)))
                .collect();
            serde_json::Value::Object(map)
        }
        plist::Value::Boolean(b) => serde_json::Value::Bool(*b),
        plist::Value::Data(d) => {
            // Encode binary data as base64
            serde_json::Value::String(base64_encode(d))
        }
        plist::Value::Date(d) => serde_json::Value::String(d.to_xml_format()),
        plist::Value::Real(r) => {
            serde_json::json!(*r)
        }
        plist::Value::Integer(i) => {
            if let Some(n) = i.as_signed() {
                serde_json::json!(n)
            } else if let Some(n) = i.as_unsigned() {
                serde_json::json!(n)
            } else {
                serde_json::Value::Null
            }
        }
        plist::Value::String(s) => serde_json::Value::String(s.clone()),
        plist::Value::Uid(_) => serde_json::Value::Null,
        _ => serde_json::Value::Null,
    }
}

/// Simple base64 encoding
fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();

    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = chunk.get(1).copied().unwrap_or(0) as usize;
        let b2 = chunk.get(2).copied().unwrap_or(0) as usize;

        result.push(CHARS[(b0 >> 2) & 0x3F] as char);
        result.push(CHARS[((b0 << 4) | (b1 >> 4)) & 0x3F] as char);

        if chunk.len() > 1 {
            result.push(CHARS[((b1 << 2) | (b2 >> 6)) & 0x3F] as char);
        } else {
            result.push('=');
        }

        if chunk.len() > 2 {
            result.push(CHARS[b2 & 0x3F] as char);
        } else {
            result.push('=');
        }
    }

    result
}

/// Check if a directory contains any IPA files
#[tauri::command]
pub async fn check_has_ipa_files(dir_path: String) -> Result<CheckHasIpaFilesResponse, String> {
    let path = Path::new(&dir_path);

    if !path.exists() || !path.is_dir() {
        return Ok(CheckHasIpaFilesResponse {
            success: false,
            has_ipa_files: false,
            count: 0,
            error: Some("Invalid directory path".to_string()),
        });
    }

    let ipa_files = find_ipa_files(path, 5);
    let count = ipa_files.len();

    Ok(CheckHasIpaFilesResponse {
        success: true,
        has_ipa_files: count > 0,
        count,
        error: None,
    })
}

/// Scan a project directory for IPA files and extract metadata
#[tauri::command]
pub async fn scan_project_ipa(dir_path: String) -> Result<ScanProjectIpaResponse, String> {
    let path = Path::new(&dir_path);

    if !path.exists() || !path.is_dir() {
        return Ok(ScanProjectIpaResponse {
            success: false,
            results: vec![],
            error: Some("Invalid directory path".to_string()),
        });
    }

    let ipa_files = find_ipa_files(path, 5);

    if ipa_files.is_empty() {
        return Ok(ScanProjectIpaResponse {
            success: true,
            results: vec![],
            error: None,
        });
    }

    let mut results = Vec::new();

    for ipa_path in ipa_files {
        let file_path = Path::new(&ipa_path);
        let file_name = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown.ipa".to_string());

        match extract_plist_from_ipa(file_path) {
            Ok(plist_value) => {
                let mut metadata = extract_metadata_from_plist(&plist_value, &file_name, &ipa_path);

                // Get file creation time
                if let Ok(meta) = fs::metadata(file_path) {
                    if let Ok(created) = meta.created() {
                        let datetime: chrono::DateTime<Utc> = created.into();
                        metadata.created_at = datetime.to_rfc3339();
                    }
                }

                results.push(metadata);
            }
            Err(e) => {
                results.push(IpaMetadata::with_error(file_name, ipa_path, e));
            }
        }
    }

    Ok(ScanProjectIpaResponse {
        success: true,
        results,
        error: None,
    })
}
