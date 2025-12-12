// Security audit commands
// Implements Package Security Audit feature (US1-US4)

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_store::StoreExt;

use crate::models::{
    CvssInfo, DependencyCount, FixInfo, PackageManager, ScanError, ScanStatus, SecurityScanData,
    SecurityScanSummary, Severity, VulnItem, VulnScanResult, VulnSummary, WorkspacePackage,
    WorkspaceVulnSummary,
};
use crate::utils::path_resolver;
use crate::utils::store::STORE_FILE;

// ============================================================================
// Response Types
// ============================================================================

/// Response for detect_package_manager command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectPackageManagerResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_manager: Option<PackageManager>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lock_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Response for check_cli_installed command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckCliInstalledResponse {
    pub success: bool,
    pub installed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Response for run_security_audit command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSecurityAuditResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<VulnScanResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ScanError>,
}

/// Response for get_security_scan command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSecurityScanResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<SecurityScanData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Response for get_all_security_scans command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetAllSecurityScansResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scans: Option<Vec<SecurityScanSummary>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Response for save_security_scan command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSecurityScanResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Event payload for scan started
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityScanStartedPayload {
    pub project_id: String,
    pub package_manager: PackageManager,
}

/// Event payload for scan progress
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityScanProgressPayload {
    pub project_id: String,
    pub stage: String, // "detecting" | "auditing" | "parsing"
    pub message: String,
}

/// Event payload for scan completed
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityScanCompletedPayload {
    pub project_id: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<VulnScanResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ScanError>,
}

// ============================================================================
// Internal Helper Functions
// ============================================================================

/// Extract workspace package names from dependency paths
/// In monorepo, the first segment of a path is typically the workspace package
/// e.g., ["@myapp/web", "lodash", "vulnerable-pkg"] -> "@myapp/web"
fn extract_workspace_packages(paths: &[Vec<String>], known_workspaces: &[String]) -> Vec<String> {
    use std::collections::HashSet;
    let mut packages: HashSet<String> = HashSet::new();

    for path in paths {
        if let Some(first) = path.first() {
            // Check if the first segment matches a known workspace package
            if known_workspaces.contains(first) {
                packages.insert(first.clone());
            }
        }
    }

    packages.into_iter().collect()
}

/// Compute per-workspace vulnerability summaries
fn compute_workspace_summaries(
    vulnerabilities: &[VulnItem],
    workspaces: &[WorkspacePackage],
) -> Vec<WorkspaceVulnSummary> {
    use std::collections::HashMap;
    let mut summaries: HashMap<String, WorkspaceVulnSummary> = HashMap::new();

    // Initialize summaries for all workspaces
    for ws in workspaces {
        summaries.insert(
            ws.name.clone(),
            WorkspaceVulnSummary {
                package_name: ws.name.clone(),
                relative_path: ws.relative_path.clone(),
                summary: VulnSummary::default(),
                vulnerability_ids: Vec::new(),
            },
        );
    }

    // Aggregate vulnerabilities per workspace
    for vuln in vulnerabilities {
        for ws_name in &vuln.workspace_packages {
            if let Some(ws_summary) = summaries.get_mut(ws_name) {
                ws_summary.vulnerability_ids.push(vuln.id.clone());
                ws_summary.summary.total += 1;
                match vuln.severity {
                    Severity::Critical => ws_summary.summary.critical += 1,
                    Severity::High => ws_summary.summary.high += 1,
                    Severity::Moderate => ws_summary.summary.moderate += 1,
                    Severity::Low => ws_summary.summary.low += 1,
                    Severity::Info => ws_summary.summary.info += 1,
                }
            }
        }
    }

    summaries.into_values().collect()
}

/// Detect package manager based on lock files
fn detect_package_manager_internal(
    project_path: &str,
) -> Result<(PackageManager, Option<String>), String> {
    let path = Path::new(project_path);

    // Check for lock files in order of priority
    if path.join("pnpm-lock.yaml").exists() {
        return Ok((PackageManager::Pnpm, Some("pnpm-lock.yaml".to_string())));
    }
    if path.join("yarn.lock").exists() {
        return Ok((PackageManager::Yarn, Some("yarn.lock".to_string())));
    }
    if path.join("package-lock.json").exists() {
        return Ok((PackageManager::Npm, Some("package-lock.json".to_string())));
    }
    if path.join("bun.lockb").exists() {
        return Ok((PackageManager::Bun, Some("bun.lockb".to_string())));
    }

    // Check if package.json exists
    if path.join("package.json").exists() {
        // Default to npm if only package.json exists
        return Ok((PackageManager::Npm, None));
    }

    Err("Not a Node.js project: package.json not found".to_string())
}

/// Detect all available package managers with lock files
fn detect_all_package_managers(project_path: &str) -> Vec<(PackageManager, String)> {
    let path = Path::new(project_path);
    let mut result = Vec::new();

    if path.join("pnpm-lock.yaml").exists() {
        result.push((PackageManager::Pnpm, "pnpm-lock.yaml".to_string()));
    }
    if path.join("yarn.lock").exists() {
        result.push((PackageManager::Yarn, "yarn.lock".to_string()));
    }
    if path.join("package-lock.json").exists() {
        result.push((PackageManager::Npm, "package-lock.json".to_string()));
    }
    if path.join("bun.lockb").exists() {
        result.push((PackageManager::Bun, "bun.lockb".to_string()));
    }

    result
}

/// Run audit for a single package manager and return vulnerabilities
fn run_single_audit(
    project_path: &str,
    pm: &PackageManager,
    project_id: &str,
    known_workspace_names: &[String],
) -> Result<(Vec<VulnItem>, DependencyCount, String), ScanError> {
    // Check if CLI is installed
    let (installed, version, _) = check_cli_internal(pm).map_err(|e| ScanError::unknown(e))?;

    if !installed {
        return Err(ScanError::cli_not_found(&pm.to_string()));
    }

    let version_str = version.unwrap_or_default();

    // Run audit command
    let cmd_name = pm.to_string();
    let output = path_resolver::create_command(&cmd_name)
        .args(["audit", "--json"])
        .current_dir(project_path)
        .output()
        .map_err(|e| ScanError::unknown(format!("Failed to execute audit: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // Check for network errors
    if stderr.contains("ENOTFOUND")
        || stderr.contains("ETIMEDOUT")
        || stderr.contains("ECONNREFUSED")
    {
        return Err(ScanError::network_error(Some(stderr)));
    }

    // Parse output
    let result = match pm {
        PackageManager::Yarn => parse_yarn_audit(&stdout, project_id, known_workspace_names),
        _ => parse_npm_audit(&stdout, project_id, pm.clone(), known_workspace_names),
    }?;

    Ok((result.vulnerabilities, result.dependency_count, version_str))
}

/// Merge vulnerabilities from multiple sources, deduplicating by ID
fn merge_vulnerabilities(all_vulns: Vec<Vec<VulnItem>>) -> Vec<VulnItem> {
    use std::collections::HashMap;

    let mut seen: HashMap<String, VulnItem> = HashMap::new();

    for vulns in all_vulns {
        for vuln in vulns {
            // Use ID + package_name as key for deduplication
            let key = format!("{}:{}", vuln.id, vuln.package_name);
            if !seen.contains_key(&key) {
                seen.insert(key, vuln);
            }
        }
    }

    let mut result: Vec<VulnItem> = seen.into_values().collect();

    // Sort by severity (critical first) then by package name
    result.sort_by(|a, b| {
        let severity_order = |s: &Severity| match s {
            Severity::Critical => 0,
            Severity::High => 1,
            Severity::Moderate => 2,
            Severity::Low => 3,
            Severity::Info => 4,
        };
        severity_order(&a.severity)
            .cmp(&severity_order(&b.severity))
            .then(a.package_name.cmp(&b.package_name))
    });

    result
}

/// Check if CLI tool is installed
fn check_cli_internal(
    pm: &PackageManager,
) -> Result<(bool, Option<String>, Option<String>), String> {
    let cmd_name = match pm {
        PackageManager::Npm => "npm",
        PackageManager::Pnpm => "pnpm",
        PackageManager::Yarn => "yarn",
        PackageManager::Bun => "bun",
        PackageManager::Unknown => return Ok((false, None, None)),
    };

    // Check if command exists using path_resolver
    let cmd_path = match path_resolver::find_tool(cmd_name) {
        Some(path) => path,
        None => return Ok((false, None, None)),
    };

    // Get version
    let version_output = path_resolver::create_command(cmd_name)
        .arg("--version")
        .output()
        .map_err(|e| e.to_string())?;

    let version = if version_output.status.success() {
        Some(
            String::from_utf8_lossy(&version_output.stdout)
                .trim()
                .to_string(),
        )
    } else {
        None
    };

    Ok((true, version, Some(cmd_path)))
}

/// Parse npm/pnpm audit JSON output (v7+ format)
fn parse_npm_audit(
    json_str: &str,
    project_id: &str,
    pm: PackageManager,
    known_workspace_names: &[String],
) -> Result<VulnScanResult, ScanError> {
    let json: Value =
        serde_json::from_str(json_str).map_err(|e| ScanError::parse_error(Some(e.to_string())))?;

    let mut vulnerabilities: Vec<VulnItem> = Vec::new();

    // Check for pnpm/npm v6 format (has "advisories" key)
    if let Some(advisories) = json.get("advisories").and_then(|v| v.as_object()) {
        for (advisory_id, advisory) in advisories {
            let severity_str = advisory
                .get("severity")
                .and_then(|s| s.as_str())
                .unwrap_or("info");
            let severity = match severity_str {
                "critical" => Severity::Critical,
                "high" => Severity::High,
                "moderate" => Severity::Moderate,
                "low" => Severity::Low,
                _ => Severity::Info,
            };

            let package_name = advisory
                .get("module_name")
                .and_then(|m| m.as_str())
                .unwrap_or_default()
                .to_string();

            let title = advisory
                .get("title")
                .and_then(|t| t.as_str())
                .unwrap_or(&package_name)
                .to_string();

            let advisory_url = advisory
                .get("url")
                .and_then(|u| u.as_str())
                .map(|s| s.to_string());

            let cves: Vec<String> = advisory
                .get("cves")
                .and_then(|c| c.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str())
                        .map(|s| s.to_string())
                        .collect()
                })
                .unwrap_or_default();

            let cwes: Vec<String> = advisory
                .get("cwe")
                .and_then(|c| c.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str())
                        .map(|s| s.to_string())
                        .collect()
                })
                .unwrap_or_default();

            let cvss_info = advisory.get("cvss").and_then(|cvss| {
                let score = cvss.get("score").and_then(|s| s.as_f64())?;
                let vector = cvss
                    .get("vectorString")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                Some(CvssInfo {
                    score: score as f32,
                    vector,
                })
            });

            let vulnerable_versions = advisory
                .get("vulnerable_versions")
                .and_then(|v| v.as_str())
                .unwrap_or("*")
                .to_string();

            let patched_versions = advisory
                .get("patched_versions")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let recommendation = advisory
                .get("recommendation")
                .and_then(|r| r.as_str())
                .map(|s| s.to_string());

            // Get findings for paths and version info
            let findings = advisory.get("findings").and_then(|f| f.as_array());

            let mut paths: Vec<Vec<String>> = Vec::new();
            let mut installed_version = vulnerable_versions.clone();

            if let Some(findings_arr) = findings {
                for finding in findings_arr {
                    if let Some(version) = finding.get("version").and_then(|v| v.as_str()) {
                        installed_version = version.to_string();
                    }
                    if let Some(finding_paths) = finding.get("paths").and_then(|p| p.as_array()) {
                        for path in finding_paths {
                            if let Some(path_str) = path.as_str() {
                                paths.push(
                                    path_str.split('>').map(|s| s.trim().to_string()).collect(),
                                );
                            }
                        }
                    }
                }
            }

            let is_direct = paths.iter().any(|p| p.len() == 1);
            let fix_available = patched_versions.is_some();
            let workspace_packages = extract_workspace_packages(&paths, known_workspace_names);

            vulnerabilities.push(VulnItem {
                id: advisory_id.clone(),
                package_name,
                installed_version,
                severity,
                title,
                description: advisory
                    .get("overview")
                    .and_then(|o| o.as_str())
                    .map(|s| s.to_string()),
                recommendation,
                advisory_url,
                cves,
                cwes,
                cvss: cvss_info,
                vulnerable_versions,
                patched_versions,
                paths,
                is_direct,
                fix_available,
                fix_info: None,
                workspace_packages,
            });
        }
    }
    // Check for npm v7+ format (has "vulnerabilities" key)
    else if let Some(vulns) = json.get("vulnerabilities").and_then(|v| v.as_object()) {
        for (pkg_name, vuln_data) in vulns {
            // Get severity
            let severity_str = vuln_data
                .get("severity")
                .and_then(|s| s.as_str())
                .unwrap_or("info");
            let severity = match severity_str {
                "critical" => Severity::Critical,
                "high" => Severity::High,
                "moderate" => Severity::Moderate,
                "low" => Severity::Low,
                _ => Severity::Info,
            };

            // Get via array for advisory details
            let via = vuln_data.get("via").and_then(|v| v.as_array());

            // Extract advisory info from via
            let mut advisory_url: Option<String> = None;
            let mut title = pkg_name.clone();
            let mut cves: Vec<String> = Vec::new();
            let mut cwes: Vec<String> = Vec::new();
            let mut cvss_info: Option<CvssInfo> = None;

            if let Some(via_arr) = via {
                for via_item in via_arr {
                    if let Some(via_obj) = via_item.as_object() {
                        if let Some(url) = via_obj.get("url").and_then(|u| u.as_str()) {
                            advisory_url = Some(url.to_string());
                        }
                        if let Some(t) = via_obj.get("title").and_then(|t| t.as_str()) {
                            title = t.to_string();
                        }
                        if let Some(cwe_arr) = via_obj.get("cwe").and_then(|c| c.as_array()) {
                            for cwe in cwe_arr {
                                if let Some(cwe_str) = cwe.as_str() {
                                    cwes.push(cwe_str.to_string());
                                }
                            }
                        }
                        if let Some(cvss) = via_obj.get("cvss") {
                            if let Some(score) = cvss.get("score").and_then(|s| s.as_f64()) {
                                let vector = cvss
                                    .get("vectorString")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                cvss_info = Some(CvssInfo {
                                    score: score as f32,
                                    vector,
                                });
                            }
                        }
                    }
                }
            }

            // Get fix info
            let fix_available = vuln_data
                .get("fixAvailable")
                .map(|f| !f.is_null() && (f.is_object() || f.as_bool().unwrap_or(false)))
                .unwrap_or(false);

            let fix_info = vuln_data
                .get("fixAvailable")
                .and_then(|f| f.as_object())
                .map(|fix_obj| FixInfo {
                    package: fix_obj
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or(pkg_name)
                        .to_string(),
                    version: fix_obj
                        .get("version")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    is_major_update: fix_obj
                        .get("isSemVerMajor")
                        .and_then(|m| m.as_bool())
                        .unwrap_or(false),
                });

            // Get affected version range
            let range = vuln_data
                .get("range")
                .and_then(|r| r.as_str())
                .unwrap_or("*")
                .to_string();

            // Check if direct dependency
            let is_direct = vuln_data
                .get("isDirect")
                .and_then(|d| d.as_bool())
                .unwrap_or(false);

            // Build dependency paths from nodes
            let paths: Vec<Vec<String>> = vuln_data
                .get("nodes")
                .and_then(|n| n.as_array())
                .map(|nodes| {
                    nodes
                        .iter()
                        .filter_map(|node| node.as_str())
                        .map(|path| path.split('>').map(|s| s.trim().to_string()).collect())
                        .collect()
                })
                .unwrap_or_default();

            // Get source ID for advisory ID
            let id = via
                .and_then(|arr| {
                    arr.iter()
                        .find_map(|v| v.get("source").and_then(|s| s.as_u64()))
                })
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("{}-{}", pkg_name, severity_str));

            let workspace_packages = extract_workspace_packages(&paths, known_workspace_names);

            vulnerabilities.push(VulnItem {
                id,
                package_name: pkg_name.clone(),
                installed_version: range.clone(),
                severity,
                title,
                description: None,
                recommendation: None,
                advisory_url,
                cves,
                cwes,
                cvss: cvss_info,
                vulnerable_versions: range,
                patched_versions: None,
                paths,
                is_direct,
                fix_available,
                fix_info,
                workspace_packages,
            });
        }
    }

    // Get dependency counts from metadata
    let dependency_count = json
        .get("metadata")
        .and_then(|m| m.get("dependencies"))
        .map(|deps| DependencyCount {
            prod: deps.get("prod").and_then(|p| p.as_u64()).unwrap_or(0) as u32,
            dev: deps.get("dev").and_then(|d| d.as_u64()).unwrap_or(0) as u32,
            optional: deps.get("optional").and_then(|o| o.as_u64()).unwrap_or(0) as u32,
            peer: deps.get("peer").and_then(|p| p.as_u64()).unwrap_or(0) as u32,
            total: deps.get("total").and_then(|t| t.as_u64()).unwrap_or(0) as u32,
        })
        .unwrap_or_default();

    let mut result = VulnScanResult::new(project_id.to_string(), pm);
    result = result.success(vulnerabilities, dependency_count);

    Ok(result)
}

/// Parse Yarn v1 audit NDJSON output
fn parse_yarn_audit(
    output: &str,
    project_id: &str,
    known_workspace_names: &[String],
) -> Result<VulnScanResult, ScanError> {
    let mut vulnerabilities: Vec<VulnItem> = Vec::new();
    let mut dependency_count = DependencyCount::default();

    for line in output.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let json: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let line_type = json.get("type").and_then(|t| t.as_str()).unwrap_or("");

        match line_type {
            "auditAdvisory" => {
                if let Some(data) = json.get("data") {
                    if let Some(advisory) = data.get("advisory") {
                        let severity_str = advisory
                            .get("severity")
                            .and_then(|s| s.as_str())
                            .unwrap_or("info");
                        let severity = match severity_str {
                            "critical" => Severity::Critical,
                            "high" => Severity::High,
                            "moderate" => Severity::Moderate,
                            "low" => Severity::Low,
                            _ => Severity::Info,
                        };

                        let id = advisory
                            .get("id")
                            .and_then(|i| i.as_u64())
                            .map(|i| i.to_string())
                            .unwrap_or_default();

                        let package_name = advisory
                            .get("module_name")
                            .and_then(|m| m.as_str())
                            .unwrap_or("")
                            .to_string();

                        let title = advisory
                            .get("title")
                            .and_then(|t| t.as_str())
                            .unwrap_or(&package_name)
                            .to_string();

                        let advisory_url = advisory
                            .get("url")
                            .and_then(|u| u.as_str())
                            .map(|s| s.to_string());

                        let recommendation = advisory
                            .get("recommendation")
                            .and_then(|r| r.as_str())
                            .map(|s| s.to_string());

                        let vulnerable_versions = advisory
                            .get("vulnerable_versions")
                            .and_then(|v| v.as_str())
                            .unwrap_or("*")
                            .to_string();

                        let patched_versions = advisory
                            .get("patched_versions")
                            .and_then(|p| p.as_str())
                            .map(|s| s.to_string());

                        let cves: Vec<String> = advisory
                            .get("cves")
                            .and_then(|c| c.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                    .collect()
                            })
                            .unwrap_or_default();

                        let cwe = advisory
                            .get("cwe")
                            .and_then(|c| c.as_str())
                            .map(|s| s.to_string());
                        let cwes = cwe.map(|c| vec![c]).unwrap_or_default();

                        // Get paths from findings
                        let paths: Vec<Vec<String>> = advisory
                            .get("findings")
                            .and_then(|f| f.as_array())
                            .map(|findings| {
                                findings
                                    .iter()
                                    .filter_map(|finding| {
                                        finding.get("paths").and_then(|p| p.as_array()).map(
                                            |paths| {
                                                paths
                                                    .iter()
                                                    .filter_map(|path| {
                                                        path.as_str().map(|s| {
                                                            s.split('>')
                                                                .map(|p| p.trim().to_string())
                                                                .collect()
                                                        })
                                                    })
                                                    .collect::<Vec<Vec<String>>>()
                                            },
                                        )
                                    })
                                    .flatten()
                                    .collect()
                            })
                            .unwrap_or_default();

                        let installed_version = advisory
                            .get("findings")
                            .and_then(|f| f.as_array())
                            .and_then(|findings| findings.first())
                            .and_then(|f| f.get("version"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();

                        let is_direct = data
                            .get("resolution")
                            .and_then(|r| r.get("dev"))
                            .and_then(|d| d.as_bool())
                            .map(|_| false) // If there's dev info, it's likely not a direct dep
                            .unwrap_or(paths.iter().any(|p| p.len() <= 2));

                        let workspace_packages =
                            extract_workspace_packages(&paths, known_workspace_names);

                        vulnerabilities.push(VulnItem {
                            id,
                            package_name,
                            installed_version,
                            severity,
                            title,
                            description: None,
                            recommendation,
                            advisory_url,
                            cves,
                            cwes,
                            cvss: None,
                            vulnerable_versions,
                            fix_available: patched_versions.is_some(),
                            patched_versions,
                            paths,
                            is_direct,
                            fix_info: None,
                            workspace_packages,
                        });
                    }
                }
            }
            "auditSummary" => {
                if let Some(data) = json.get("data") {
                    dependency_count = DependencyCount {
                        prod: data
                            .get("dependencies")
                            .and_then(|d| d.as_u64())
                            .unwrap_or(0) as u32,
                        dev: data
                            .get("devDependencies")
                            .and_then(|d| d.as_u64())
                            .unwrap_or(0) as u32,
                        optional: data
                            .get("optionalDependencies")
                            .and_then(|d| d.as_u64())
                            .unwrap_or(0) as u32,
                        peer: 0,
                        total: data
                            .get("totalDependencies")
                            .and_then(|d| d.as_u64())
                            .unwrap_or(0) as u32,
                    };
                }
            }
            _ => {}
        }
    }

    let mut result = VulnScanResult::new(project_id.to_string(), PackageManager::Yarn);
    result = result.success(vulnerabilities, dependency_count);

    Ok(result)
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Detect package manager for a project
#[tauri::command]
pub async fn detect_package_manager(
    project_path: String,
) -> Result<DetectPackageManagerResponse, String> {
    match detect_package_manager_internal(&project_path) {
        Ok((pm, lock_file)) => Ok(DetectPackageManagerResponse {
            success: true,
            package_manager: Some(pm),
            lock_file,
            error: None,
        }),
        Err(e) => Ok(DetectPackageManagerResponse {
            success: false,
            package_manager: None,
            lock_file: None,
            error: Some(e),
        }),
    }
}

/// Check if CLI tool is installed
#[tauri::command]
pub async fn check_cli_installed(
    package_manager: PackageManager,
) -> Result<CheckCliInstalledResponse, String> {
    match check_cli_internal(&package_manager) {
        Ok((installed, version, path)) => Ok(CheckCliInstalledResponse {
            success: true,
            installed,
            version,
            path,
            error: None,
        }),
        Err(e) => Ok(CheckCliInstalledResponse {
            success: false,
            installed: false,
            version: None,
            path: None,
            error: Some(e),
        }),
    }
}

/// Run security audit for a project
#[tauri::command]
pub async fn run_security_audit(
    app: AppHandle,
    project_id: String,
    project_path: String,
    package_manager: Option<PackageManager>,
    workspace_packages: Option<Vec<WorkspacePackage>>,
) -> Result<RunSecurityAuditResponse, String> {
    // Extract workspace names for matching
    let known_workspace_names: Vec<String> = workspace_packages
        .as_ref()
        .map(|ws| ws.iter().map(|w| w.name.clone()).collect())
        .unwrap_or_default();

    // Check if node_modules exists first
    if !Path::new(&project_path).join("node_modules").exists() {
        let error = ScanError::no_node_modules();
        let _ = app.emit(
            "security_scan_completed",
            SecurityScanCompletedPayload {
                project_id: project_id.clone(),
                success: false,
                result: None,
                error: Some(error.clone()),
            },
        );
        return Ok(RunSecurityAuditResponse {
            success: false,
            result: None,
            error: Some(error),
        });
    }

    // If package_manager is specified, use single PM mode
    if let Some(pm) = package_manager {
        return run_single_pm_audit(
            app,
            project_id,
            project_path,
            pm,
            known_workspace_names.clone(),
            workspace_packages,
        )
        .await;
    }

    // Multi-PM mode: detect all available package managers
    let _ = app.emit(
        "security_scan_progress",
        SecurityScanProgressPayload {
            project_id: project_id.clone(),
            stage: "detecting".to_string(),
            message: "Detecting package managers...".to_string(),
        },
    );

    let available_pms = detect_all_package_managers(&project_path);

    if available_pms.is_empty() {
        // Fall back to npm if no lock files found but package.json exists
        if Path::new(&project_path).join("package.json").exists() {
            return run_single_pm_audit(
                app,
                project_id,
                project_path,
                PackageManager::Npm,
                known_workspace_names.clone(),
                workspace_packages,
            )
            .await;
        }
        return Ok(RunSecurityAuditResponse {
            success: false,
            result: None,
            error: Some(ScanError::unknown(
                "Not a Node.js project: package.json not found".to_string(),
            )),
        });
    }

    // If only one PM, use single PM mode
    if available_pms.len() == 1 {
        let (pm, _) = &available_pms[0];
        return run_single_pm_audit(
            app,
            project_id,
            project_path,
            pm.clone(),
            known_workspace_names.clone(),
            workspace_packages,
        )
        .await;
    }

    // Multiple PMs found - run all and merge results
    let pm_names: Vec<String> = available_pms.iter().map(|(pm, _)| pm.to_string()).collect();
    let _ = app.emit(
        "security_scan_progress",
        SecurityScanProgressPayload {
            project_id: project_id.clone(),
            stage: "auditing".to_string(),
            message: format!("Running security audit with {}...", pm_names.join(", ")),
        },
    );

    // Emit scan started with first PM (for compatibility)
    let primary_pm = available_pms[0].0.clone();
    let _ = app.emit(
        "security_scan_started",
        SecurityScanStartedPayload {
            project_id: project_id.clone(),
            package_manager: primary_pm.clone(),
        },
    );

    let mut all_vulns: Vec<Vec<VulnItem>> = Vec::new();
    let mut combined_dep_count = DependencyCount::default();
    let mut pm_versions: Vec<String> = Vec::new();
    let mut successful_pms: Vec<String> = Vec::new();
    let mut last_error: Option<ScanError> = None;

    for (pm, _lock_file) in &available_pms {
        let _ = app.emit(
            "security_scan_progress",
            SecurityScanProgressPayload {
                project_id: project_id.clone(),
                stage: "auditing".to_string(),
                message: format!("Running {} audit...", pm),
            },
        );

        match run_single_audit(&project_path, pm, &project_id, &known_workspace_names) {
            Ok((vulns, dep_count, version)) => {
                all_vulns.push(vulns);
                // Use max dependency counts
                combined_dep_count.prod = combined_dep_count.prod.max(dep_count.prod);
                combined_dep_count.dev = combined_dep_count.dev.max(dep_count.dev);
                combined_dep_count.optional = combined_dep_count.optional.max(dep_count.optional);
                combined_dep_count.peer = combined_dep_count.peer.max(dep_count.peer);
                combined_dep_count.total = combined_dep_count.total.max(dep_count.total);
                pm_versions.push(format!("{} {}", pm, version));
                successful_pms.push(pm.to_string());
            }
            Err(e) => {
                // Log but continue with other PMs
                eprintln!("Warning: {} audit failed: {:?}", pm, e);
                last_error = Some(e);
            }
        }
    }

    // If all audits failed, return the last error
    if successful_pms.is_empty() {
        let error =
            last_error.unwrap_or_else(|| ScanError::unknown("All audits failed".to_string()));
        let _ = app.emit(
            "security_scan_completed",
            SecurityScanCompletedPayload {
                project_id: project_id.clone(),
                success: false,
                result: None,
                error: Some(error.clone()),
            },
        );
        return Ok(RunSecurityAuditResponse {
            success: false,
            result: None,
            error: Some(error),
        });
    }

    // Merge and deduplicate vulnerabilities
    let _ = app.emit(
        "security_scan_progress",
        SecurityScanProgressPayload {
            project_id: project_id.clone(),
            stage: "parsing".to_string(),
            message: "Merging scan results...".to_string(),
        },
    );

    let merged_vulns = merge_vulnerabilities(all_vulns);
    let summary = VulnSummary::from_vulnerabilities(&merged_vulns);

    // Compute workspace summaries if workspace packages are provided
    let workspace_summaries = if let Some(ref ws) = workspace_packages {
        compute_workspace_summaries(&merged_vulns, ws)
    } else {
        Vec::new()
    };

    // Create result with combined info
    let scan_result = VulnScanResult {
        id: uuid::Uuid::new_v4().to_string(),
        project_id: project_id.clone(),
        scanned_at: chrono::Utc::now().to_rfc3339(),
        status: ScanStatus::Success,
        package_manager: primary_pm,
        package_manager_version: successful_pms.join(" + "),
        summary,
        vulnerabilities: merged_vulns,
        dependency_count: combined_dep_count,
        error: None,
        workspace_summaries,
    };

    let _ = app.emit(
        "security_scan_completed",
        SecurityScanCompletedPayload {
            project_id: project_id.clone(),
            success: true,
            result: Some(scan_result.clone()),
            error: None,
        },
    );

    Ok(RunSecurityAuditResponse {
        success: true,
        result: Some(scan_result),
        error: None,
    })
}

/// Run security audit with a single package manager
async fn run_single_pm_audit(
    app: AppHandle,
    project_id: String,
    project_path: String,
    pm: PackageManager,
    known_workspace_names: Vec<String>,
    workspace_packages: Option<Vec<WorkspacePackage>>,
) -> Result<RunSecurityAuditResponse, String> {
    // Emit scan started event
    let _ = app.emit(
        "security_scan_started",
        SecurityScanStartedPayload {
            project_id: project_id.clone(),
            package_manager: pm.clone(),
        },
    );

    // Check if CLI is installed
    let (installed, version, _) = match check_cli_internal(&pm) {
        Ok(result) => result,
        Err(e) => {
            let error = ScanError::unknown(e);
            let _ = app.emit(
                "security_scan_completed",
                SecurityScanCompletedPayload {
                    project_id: project_id.clone(),
                    success: false,
                    result: None,
                    error: Some(error.clone()),
                },
            );
            return Ok(RunSecurityAuditResponse {
                success: false,
                result: None,
                error: Some(error),
            });
        }
    };

    if !installed {
        let error = ScanError::cli_not_found(&pm.to_string());
        let _ = app.emit(
            "security_scan_completed",
            SecurityScanCompletedPayload {
                project_id: project_id.clone(),
                success: false,
                result: None,
                error: Some(error.clone()),
            },
        );
        return Ok(RunSecurityAuditResponse {
            success: false,
            result: None,
            error: Some(error),
        });
    }

    // Emit progress event
    let _ = app.emit(
        "security_scan_progress",
        SecurityScanProgressPayload {
            project_id: project_id.clone(),
            stage: "auditing".to_string(),
            message: format!("Running security audit with {}...", pm),
        },
    );

    // Run audit command
    let cmd_name = pm.to_string();
    let output = path_resolver::create_command(&cmd_name)
        .args(["audit", "--json"])
        .current_dir(&project_path)
        .output();

    let output = match output {
        Ok(o) => o,
        Err(e) => {
            let error = ScanError::unknown(format!("Failed to execute audit: {}", e));
            let _ = app.emit(
                "security_scan_completed",
                SecurityScanCompletedPayload {
                    project_id: project_id.clone(),
                    success: false,
                    result: None,
                    error: Some(error.clone()),
                },
            );
            return Ok(RunSecurityAuditResponse {
                success: false,
                result: None,
                error: Some(error),
            });
        }
    };

    // Note: npm/pnpm/yarn audit returns non-zero exit code when vulnerabilities are found
    // This is expected behavior, not an error
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    // Check for network errors in stderr
    if stderr.contains("ENOTFOUND")
        || stderr.contains("ETIMEDOUT")
        || stderr.contains("ECONNREFUSED")
    {
        let error = ScanError::network_error(Some(stderr));
        let _ = app.emit(
            "security_scan_completed",
            SecurityScanCompletedPayload {
                project_id: project_id.clone(),
                success: false,
                result: None,
                error: Some(error.clone()),
            },
        );
        return Ok(RunSecurityAuditResponse {
            success: false,
            result: None,
            error: Some(error),
        });
    }

    // Emit progress event
    let _ = app.emit(
        "security_scan_progress",
        SecurityScanProgressPayload {
            project_id: project_id.clone(),
            stage: "parsing".to_string(),
            message: "Parsing scan results...".to_string(),
        },
    );

    // Parse output based on package manager
    let mut result = match pm {
        PackageManager::Yarn => parse_yarn_audit(&stdout, &project_id, &known_workspace_names),
        _ => parse_npm_audit(&stdout, &project_id, pm.clone(), &known_workspace_names),
    };

    // Set package manager version and workspace summaries
    if let Ok(ref mut r) = result {
        r.package_manager_version = version.unwrap_or_default();

        // Compute workspace summaries if workspace packages are provided
        if let Some(ref ws) = workspace_packages {
            r.workspace_summaries = compute_workspace_summaries(&r.vulnerabilities, ws);
        }
    }

    match result {
        Ok(scan_result) => {
            let _ = app.emit(
                "security_scan_completed",
                SecurityScanCompletedPayload {
                    project_id: project_id.clone(),
                    success: true,
                    result: Some(scan_result.clone()),
                    error: None,
                },
            );
            Ok(RunSecurityAuditResponse {
                success: true,
                result: Some(scan_result),
                error: None,
            })
        }
        Err(error) => {
            let _ = app.emit(
                "security_scan_completed",
                SecurityScanCompletedPayload {
                    project_id: project_id.clone(),
                    success: false,
                    result: None,
                    error: Some(error.clone()),
                },
            );
            Ok(RunSecurityAuditResponse {
                success: false,
                result: None,
                error: Some(error),
            })
        }
    }
}

/// Get security scan data for a project
#[tauri::command]
pub async fn get_security_scan(
    app: AppHandle,
    project_id: String,
) -> Result<GetSecurityScanResponse, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let security_scans: std::collections::HashMap<String, SecurityScanData> = store
        .get("securityScans")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let data = security_scans.get(&project_id).cloned();

    Ok(GetSecurityScanResponse {
        success: true,
        data,
        error: None,
    })
}

/// Get all security scans summary
#[tauri::command]
pub async fn get_all_security_scans(app: AppHandle) -> Result<GetAllSecurityScansResponse, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    // Get projects
    let projects: Vec<crate::models::Project> = store
        .get("projects")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    // Get security scans
    let security_scans: std::collections::HashMap<String, SecurityScanData> = store
        .get("securityScans")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let mut summaries: Vec<SecurityScanSummary> = Vec::new();

    for project in projects {
        let scan_data = security_scans.get(&project.id);

        let summary = SecurityScanSummary {
            project_id: project.id.clone(),
            project_name: project.name.clone(),
            project_path: project.path.clone(),
            package_manager: scan_data
                .map(|s| s.package_manager.clone())
                .unwrap_or(PackageManager::Unknown),
            last_scanned_at: scan_data
                .and_then(|s| s.last_scan.as_ref())
                .map(|r| r.scanned_at.clone()),
            summary: scan_data
                .and_then(|s| s.last_scan.as_ref())
                .map(|r| r.summary.clone()),
            status: scan_data
                .and_then(|s| s.last_scan.as_ref())
                .map(|r| r.status.clone())
                .unwrap_or(ScanStatus::Pending),
        };

        summaries.push(summary);
    }

    Ok(GetAllSecurityScansResponse {
        success: true,
        scans: Some(summaries),
        error: None,
    })
}

/// Save security scan result
#[tauri::command]
pub async fn save_security_scan(
    app: AppHandle,
    project_id: String,
    result: VulnScanResult,
) -> Result<SaveSecurityScanResponse, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    // Get existing security scans
    let mut security_scans: std::collections::HashMap<String, SecurityScanData> = store
        .get("securityScans")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    // Update or create scan data
    let scan_data = security_scans.entry(project_id.clone()).or_insert_with(|| {
        SecurityScanData::new(project_id.clone(), result.package_manager.clone())
    });

    scan_data.update_scan(result);
    // Clear snooze when a new scan is performed
    scan_data.snooze_until = None;

    // Save back to store
    let value = serde_json::to_value(&security_scans).map_err(|e| e.to_string())?;
    store.set("securityScans", value);
    store.save().map_err(|e| e.to_string())?;

    Ok(SaveSecurityScanResponse {
        success: true,
        error: None,
    })
}

/// Snooze security scan reminder for a project
/// Sets a snooze_until timestamp to temporarily hide reminders
#[tauri::command]
pub async fn snooze_scan_reminder(
    app: AppHandle,
    project_id: String,
    snooze_duration_hours: u32,
) -> Result<SaveSecurityScanResponse, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let mut security_scans: std::collections::HashMap<String, SecurityScanData> = store
        .get("securityScans")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    // Calculate snooze_until timestamp
    let snooze_until = chrono::Utc::now() + chrono::Duration::hours(snooze_duration_hours as i64);
    let snooze_until_str = snooze_until.to_rfc3339();

    // Update or create scan data with snooze
    let scan_data = security_scans
        .entry(project_id.clone())
        .or_insert_with(|| SecurityScanData::new(project_id.clone(), PackageManager::Unknown));

    scan_data.snooze_until = Some(snooze_until_str);

    // Save back to store
    let value = serde_json::to_value(&security_scans).map_err(|e| e.to_string())?;
    store.set("securityScans", value);
    store.save().map_err(|e| e.to_string())?;

    Ok(SaveSecurityScanResponse {
        success: true,
        error: None,
    })
}

/// Dismiss security scan reminder for a project
/// Clears the snooze_until timestamp (used when user clicks dismiss/close)
#[tauri::command]
pub async fn dismiss_scan_reminder(
    app: AppHandle,
    project_id: String,
) -> Result<SaveSecurityScanResponse, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let mut security_scans: std::collections::HashMap<String, SecurityScanData> = store
        .get("securityScans")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    // Clear snooze if exists
    if let Some(scan_data) = security_scans.get_mut(&project_id) {
        scan_data.snooze_until = None;
    }

    // Save back to store
    let value = serde_json::to_value(&security_scans).map_err(|e| e.to_string())?;
    store.set("securityScans", value);
    store.save().map_err(|e| e.to_string())?;

    Ok(SaveSecurityScanResponse {
        success: true,
        error: None,
    })
}
