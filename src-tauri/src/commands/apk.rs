// APK file inspection commands
// Implements APK File Inspection (Read-only)

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

use crate::models::ApkMetadata;

/// Response for check_has_apk_files command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckHasApkFilesResponse {
    pub success: bool,
    pub has_apk_files: bool,
    pub count: usize,
    pub error: Option<String>,
}

/// Response for scan_project_apk command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProjectApkResponse {
    pub success: bool,
    pub results: Vec<ApkMetadata>,
    pub error: Option<String>,
}

/// Directories to exclude from APK file search
fn excluded_dirs() -> HashSet<&'static str> {
    let mut set = HashSet::new();
    set.insert("node_modules");
    set.insert(".git");
    set.insert(".svn");
    set.insert(".hg");
    set.insert(".cache");
    set.insert(".gradle");
    set.insert("build");
    set
}

/// Recursively find all .apk files in a directory
fn find_apk_files(dir_path: &Path, max_depth: usize) -> Vec<String> {
    let mut apk_files = Vec::new();
    let excluded = excluded_dirs();

    fn scan_dir(
        current_path: &Path,
        depth: usize,
        max_depth: usize,
        excluded: &HashSet<&str>,
        apk_files: &mut Vec<String>,
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
                        scan_dir(&path, depth + 1, max_depth, excluded, apk_files);
                    }
                } else if path.is_file() {
                    // Check for .apk extension (case insensitive)
                    if file_name_str.to_lowercase().ends_with(".apk") {
                        apk_files.push(path.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    scan_dir(dir_path, 0, max_depth, &excluded, &mut apk_files);
    apk_files
}

/// Parse binary Android manifest to extract package info
/// This is a simplified parser that extracts key attributes from the binary XML
fn parse_android_manifest(data: &[u8]) -> Result<AndroidManifestInfo, String> {
    // Android binary XML format:
    // - Magic: 0x00080003
    // - String pool with all strings
    // - Resource IDs
    // - XML content

    if data.len() < 8 {
        return Err("Manifest too short".to_string());
    }

    // Find string pool and extract strings
    let strings = extract_string_pool(data)?;

    // Look for common attribute patterns in the binary data
    let mut info = AndroidManifestInfo::default();

    // Find package name, versionCode, versionName from string pool
    for (i, s) in strings.iter().enumerate() {
        if s == "package" && i + 1 < strings.len() {
            // Next meaningful string after "package" might be the package name
            for j in (i + 1)..strings.len().min(i + 10) {
                if strings[j].contains('.')
                    && !strings[j].contains('/')
                    && !strings[j].starts_with("android")
                {
                    info.package_name = strings[j].clone();
                    break;
                }
            }
        }
        if s == "versionName" && i + 1 < strings.len() {
            for j in (i + 1)..strings.len().min(i + 5) {
                if !strings[j].is_empty()
                    && strings[j]
                        .chars()
                        .next()
                        .map(|c| c.is_ascii_digit())
                        .unwrap_or(false)
                {
                    info.version_name = strings[j].clone();
                    break;
                }
            }
        }
    }

    // Also try to find app label
    for s in &strings {
        if s.starts_with("@string/") || s == "app_name" {
            continue;
        }
        // App name is usually a human readable string
        if !s.is_empty()
            && !s.contains('.')
            && !s.contains('/')
            && !s.starts_with('@')
            && !s.starts_with("android")
            && s.chars().next().map(|c| c.is_uppercase()).unwrap_or(false)
            && s.len() < 50
        {
            if info.app_name.is_empty() || s.len() < info.app_name.len() {
                // Prefer shorter, capitalized strings as app names
            }
        }
    }

    // Extract SDK versions from binary attributes
    extract_sdk_versions(data, &strings, &mut info);

    Ok(info)
}

/// Extract string pool from binary XML
fn extract_string_pool(data: &[u8]) -> Result<Vec<String>, String> {
    let mut strings = Vec::new();

    if data.len() < 16 {
        return Ok(strings);
    }

    // Skip header, find string pool
    // String pool chunk type is 0x0001
    let mut pos = 8;

    while pos + 8 < data.len() {
        let chunk_type = u16::from_le_bytes([data[pos], data[pos + 1]]);
        let chunk_size =
            u32::from_le_bytes([data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]])
                as usize;

        if chunk_type == 0x0001 && chunk_size > 28 && pos + chunk_size <= data.len() {
            // Found string pool
            let string_count =
                u32::from_le_bytes([data[pos + 8], data[pos + 9], data[pos + 10], data[pos + 11]])
                    as usize;

            let _style_count = u32::from_le_bytes([
                data[pos + 12],
                data[pos + 13],
                data[pos + 14],
                data[pos + 15],
            ]);

            let flags = u32::from_le_bytes([
                data[pos + 16],
                data[pos + 17],
                data[pos + 18],
                data[pos + 19],
            ]);

            let strings_start = u32::from_le_bytes([
                data[pos + 20],
                data[pos + 21],
                data[pos + 22],
                data[pos + 23],
            ]) as usize;

            let is_utf8 = (flags & (1 << 8)) != 0;

            // Read string offsets
            let offsets_start = pos + 28;
            let string_data_start = pos + strings_start;

            for i in 0..string_count.min(500) {
                // Limit to prevent huge allocations
                let offset_pos = offsets_start + i * 4;
                if offset_pos + 4 > data.len() {
                    break;
                }

                let offset = u32::from_le_bytes([
                    data[offset_pos],
                    data[offset_pos + 1],
                    data[offset_pos + 2],
                    data[offset_pos + 3],
                ]) as usize;

                let str_pos = string_data_start + offset;
                if str_pos >= data.len() {
                    continue;
                }

                let s = if is_utf8 {
                    read_utf8_string(data, str_pos)
                } else {
                    read_utf16_string(data, str_pos)
                };

                if let Some(s) = s {
                    strings.push(s);
                }
            }

            break;
        }

        if chunk_size == 0 {
            break;
        }
        pos += chunk_size;
    }

    Ok(strings)
}

/// Read UTF-8 string from binary data
fn read_utf8_string(data: &[u8], pos: usize) -> Option<String> {
    if pos + 2 > data.len() {
        return None;
    }

    // UTF-8 strings: 2 bytes for char count, then string data
    let char_count = data[pos] as usize;
    let byte_count = data[pos + 1] as usize;

    if char_count == 0 || byte_count == 0 {
        return Some(String::new());
    }

    let start = pos + 2;
    let end = (start + byte_count).min(data.len());

    if start >= data.len() {
        return None;
    }

    String::from_utf8(data[start..end].to_vec()).ok()
}

/// Read UTF-16 string from binary data
fn read_utf16_string(data: &[u8], pos: usize) -> Option<String> {
    if pos + 4 > data.len() {
        return None;
    }

    // UTF-16 strings: 2 bytes for char count, then UTF-16LE data
    let char_count = u16::from_le_bytes([data[pos], data[pos + 1]]) as usize;

    if char_count == 0 {
        return Some(String::new());
    }

    let start = pos + 2;
    let byte_len = char_count * 2;
    let end = (start + byte_len).min(data.len());

    if start >= data.len() || end > data.len() {
        return None;
    }

    let u16_data: Vec<u16> = data[start..end]
        .chunks_exact(2)
        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
        .collect();

    String::from_utf16(&u16_data).ok()
}

/// Extract SDK version info from binary XML
fn extract_sdk_versions(data: &[u8], strings: &[String], info: &mut AndroidManifestInfo) {
    // Look for minSdkVersion and targetSdkVersion in string pool indices
    let mut min_sdk_idx: Option<usize> = None;
    let mut target_sdk_idx: Option<usize> = None;

    for (i, s) in strings.iter().enumerate() {
        if s == "minSdkVersion" {
            min_sdk_idx = Some(i);
        }
        if s == "targetSdkVersion" {
            target_sdk_idx = Some(i);
        }
    }

    // Search for integer values following these string indices in the binary
    // This is a simplified heuristic - real parsing would need full XML chunk parsing
    if min_sdk_idx.is_some() || target_sdk_idx.is_some() {
        // Look for common SDK version patterns (integers 1-35)
        for chunk in data.windows(4) {
            let val = u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
            if val >= 14 && val <= 35 {
                if info.min_sdk.is_empty() {
                    info.min_sdk = val.to_string();
                } else if info.target_sdk.is_empty()
                    && val >= info.min_sdk.parse::<u32>().unwrap_or(0)
                {
                    info.target_sdk = val.to_string();
                    break;
                }
            }
        }
    }
}

#[derive(Default)]
struct AndroidManifestInfo {
    package_name: String,
    version_name: String,
    version_code: String,
    app_name: String,
    min_sdk: String,
    target_sdk: String,
}

/// Extract metadata from APK file
fn extract_apk_metadata(apk_path: &Path) -> Result<AndroidManifestInfo, String> {
    let file = File::open(apk_path).map_err(|e| format!("Failed to open APK: {}", e))?;

    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read APK as zip: {}", e))?;

    // Find AndroidManifest.xml
    let mut manifest_data = Vec::new();
    {
        let mut manifest_entry = archive
            .by_name("AndroidManifest.xml")
            .map_err(|_| "AndroidManifest.xml not found in APK".to_string())?;

        manifest_entry
            .read_to_end(&mut manifest_data)
            .map_err(|e| format!("Failed to read manifest: {}", e))?;
    }

    parse_android_manifest(&manifest_data)
}

/// Check if a directory contains any APK files
#[tauri::command]
pub async fn check_has_apk_files(dir_path: String) -> Result<CheckHasApkFilesResponse, String> {
    let path = Path::new(&dir_path);

    if !path.exists() || !path.is_dir() {
        return Ok(CheckHasApkFilesResponse {
            success: false,
            has_apk_files: false,
            count: 0,
            error: Some("Invalid directory path".to_string()),
        });
    }

    let apk_files = find_apk_files(path, 5);
    let count = apk_files.len();

    Ok(CheckHasApkFilesResponse {
        success: true,
        has_apk_files: count > 0,
        count,
        error: None,
    })
}

/// Scan a project directory for APK files and extract metadata
#[tauri::command]
pub async fn scan_project_apk(dir_path: String) -> Result<ScanProjectApkResponse, String> {
    let path = Path::new(&dir_path);

    if !path.exists() || !path.is_dir() {
        return Ok(ScanProjectApkResponse {
            success: false,
            results: vec![],
            error: Some("Invalid directory path".to_string()),
        });
    }

    let apk_files = find_apk_files(path, 5);

    if apk_files.is_empty() {
        return Ok(ScanProjectApkResponse {
            success: true,
            results: vec![],
            error: None,
        });
    }

    let mut results = Vec::new();

    for apk_path in apk_files {
        let file_path = Path::new(&apk_path);
        let file_name = file_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown.apk".to_string());

        // Get file size
        let file_size = fs::metadata(file_path).map(|m| m.len()).unwrap_or(0);

        match extract_apk_metadata(file_path) {
            Ok(info) => {
                let mut metadata = ApkMetadata::new(file_name, apk_path.clone());
                metadata.package_name = if info.package_name.is_empty() {
                    "N/A".to_string()
                } else {
                    info.package_name
                };
                metadata.version_name = if info.version_name.is_empty() {
                    "N/A".to_string()
                } else {
                    info.version_name
                };
                metadata.version_code = if info.version_code.is_empty() {
                    "N/A".to_string()
                } else {
                    info.version_code
                };
                metadata.app_name = if info.app_name.is_empty() {
                    "N/A".to_string()
                } else {
                    info.app_name
                };
                metadata.min_sdk = if info.min_sdk.is_empty() {
                    "N/A".to_string()
                } else {
                    info.min_sdk
                };
                metadata.target_sdk = if info.target_sdk.is_empty() {
                    "N/A".to_string()
                } else {
                    info.target_sdk
                };
                metadata.file_size = file_size;

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
                let mut metadata = ApkMetadata::with_error(file_name, apk_path, e);
                metadata.file_size = file_size;
                results.push(metadata);
            }
        }
    }

    Ok(ScanProjectApkResponse {
        success: true,
        results,
        error: None,
    })
}
