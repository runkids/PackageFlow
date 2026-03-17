//! Built-in schema templates for SpecForge
//!
//! Contains the 3 built-in schema YAML definitions that can be written
//! to .specforge/schemas/ during project initialization.

/// Built-in schema YAML for "spec" type
pub const SPEC_SCHEMA_YAML: &str = r#"name: spec
display_name: "Spec"
fields:
  title: string
  status: [draft, active, completed]
  tags: list
sections:
  - name: summary
    required: true
  - name: details
    required: false
"#;

/// Built-in schema YAML for "change-request" type
pub const CHANGE_REQUEST_SCHEMA_YAML: &str = r#"name: change-request
display_name: "Change Request"
fields:
  title: string
  priority: [high, medium, low]
  assignee: string
  tags: list
  deadline: date
sections:
  - name: summary
    required: true
  - name: acceptance-criteria
    required: true
  - name: technical-notes
    required: false
"#;

/// Built-in schema YAML for "task" type
pub const TASK_SCHEMA_YAML: &str = r#"name: task
display_name: "Task"
fields:
  title: string
  priority: [high, medium, low]
  assignee: string
  estimate: string
sections:
  - name: description
    required: true
"#;

/// Default workflow YAML for spec-driven development
pub const DEFAULT_WORKFLOW_YAML: &str = r#"name: default
phases:
  - id: draft
    label: Draft
  - id: discuss
    label: Discuss
  - id: implement
    label: Implement
  - id: review
    label: Review
  - id: done
    label: Done
transitions:
  - from: draft
    to: discuss
  - from: discuss
    to: implement
    gate:
      condition: "spec_section_summary && reviews_count >= 1"
      message: "Summary must be filled and at least 1 review required"
      auto_advance: false
  - from: implement
    to: review
    gate:
      condition: "git_has_commits"
      message: "At least one commit is required before review"
      auto_advance: true
  - from: review
    to: done
    gate:
      condition: "reviews_approved"
      message: "Review approval is required"
      auto_advance: false
"#;

/// Get all built-in schema YAMLs as (filename, content) pairs
pub fn get_builtin_schemas() -> Vec<(&'static str, &'static str)> {
    vec![
        ("spec.schema.yaml", SPEC_SCHEMA_YAML),
        ("change-request.schema.yaml", CHANGE_REQUEST_SCHEMA_YAML),
        ("task.schema.yaml", TASK_SCHEMA_YAML),
    ]
}
