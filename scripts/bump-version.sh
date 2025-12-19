#!/bin/bash

# PackageFlow Version Bump Script
# Updates version in all required files simultaneously

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Files that contain version
PACKAGE_JSON="$PROJECT_ROOT/package.json"
CARGO_TOML="$PROJECT_ROOT/src-tauri/Cargo.toml"
TAURI_CONF="$PROJECT_ROOT/src-tauri/tauri.conf.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

print_usage() {
    echo ""
    echo "Usage: $0 [OPTIONS] [new_version]"
    echo ""
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -c, --check    Show current version without making changes"
    echo "  -i             Interactive mode (default when no args)"
    echo "  --major        Bump major version (x.0.0)"
    echo "  --minor        Bump minor version (0.x.0)"
    echo "  --patch        Bump patch version (0.0.x)"
    echo ""
    echo "Examples:"
    echo "  $0              # Interactive mode"
    echo "  $0 0.4.0        # Set specific version"
    echo "  $0 --patch      # Bump patch version"
    echo ""
}

get_current_version() {
    grep '"version":' "$PACKAGE_JSON" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/'
}

validate_version() {
    local version=$1
    if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo -e "${RED}Error: Invalid version format '$version'${NC}"
        echo "Version must be in semver format: MAJOR.MINOR.PATCH (e.g., 1.2.3)"
        return 1
    fi
    return 0
}

bump_version() {
    local current=$1
    local bump_type=$2

    IFS='.' read -r major minor patch <<< "$current"

    case $bump_type in
        major)
            echo "$((major + 1)).0.0"
            ;;
        minor)
            echo "$major.$((minor + 1)).0"
            ;;
        patch)
            echo "$major.$minor.$((patch + 1))"
            ;;
    esac
}

update_package_json() {
    local new_version=$1
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/" "$PACKAGE_JSON"
    else
        sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/" "$PACKAGE_JSON"
    fi
}

update_cargo_toml() {
    local new_version=$1
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/^version = \"[^\"]*\"/version = \"$new_version\"/" "$CARGO_TOML"
    else
        sed -i "s/^version = \"[^\"]*\"/version = \"$new_version\"/" "$CARGO_TOML"
    fi
}

update_tauri_conf() {
    local new_version=$1
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/" "$TAURI_CONF"
    else
        sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/" "$TAURI_CONF"
    fi
}

verify_update() {
    local expected=$1
    local file=$2
    local actual

    case "$file" in
        *package.json)
            actual=$(grep '"version":' "$file" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
            ;;
        *Cargo.toml)
            actual=$(grep '^version = ' "$file" | head -1 | sed 's/version = "\([^"]*\)"/\1/')
            ;;
        *tauri.conf.json)
            actual=$(grep '"version":' "$file" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
            ;;
    esac

    if [[ "$actual" == "$expected" ]]; then
        echo -e "  ${GREEN}✓${NC} $(basename "$file"): $actual"
        return 0
    else
        echo -e "  ${RED}✗${NC} $(basename "$file"): expected $expected, got $actual"
        return 1
    fi
}

interactive_mode() {
    local current=$1

    IFS='.' read -r major minor patch <<< "$current"

    local patch_ver="$major.$minor.$((patch + 1))"
    local minor_ver="$major.$((minor + 1)).0"
    local major_ver="$((major + 1)).0.0"

    echo ""
    echo -e "${BOLD}╭─────────────────────────────────────────────────────────────╮${NC}"
    echo -e "${BOLD}│${NC}              ${CYAN}PackageFlow Version Bump${NC}                      ${BOLD}│${NC}"
    echo -e "${BOLD}╰─────────────────────────────────────────────────────────────╯${NC}"
    echo ""
    echo -e "  Current version: ${YELLOW}${current}${NC}"
    echo ""
    echo -e "${BOLD}  Select version type:${NC}"
    echo ""
    echo -e "  ${GREEN}1)${NC} ${BOLD}patch${NC}  → ${GREEN}${patch_ver}${NC}"
    echo -e "     ${DIM}Bug fixes, small updates (backwards compatible)${NC}"
    echo ""
    echo -e "  ${GREEN}2)${NC} ${BOLD}minor${NC}  → ${GREEN}${minor_ver}${NC}"
    echo -e "     ${DIM}New features (backwards compatible)${NC}"
    echo ""
    echo -e "  ${GREEN}3)${NC} ${BOLD}major${NC}  → ${GREEN}${major_ver}${NC}"
    echo -e "     ${DIM}Breaking changes, major updates${NC}"
    echo ""
    echo -e "  ${GREEN}4)${NC} ${BOLD}custom${NC} → ${DIM}Enter a specific version${NC}"
    echo ""
    echo -e "  ${GREEN}5)${NC} ${BOLD}cancel${NC}"
    echo ""

    while true; do
        read -p "  Enter choice [1-5]: " choice
        case $choice in
            1)
                NEW_VERSION=$patch_ver
                break
                ;;
            2)
                NEW_VERSION=$minor_ver
                break
                ;;
            3)
                NEW_VERSION=$major_ver
                break
                ;;
            4)
                echo ""
                while true; do
                    read -p "  Enter version (e.g., 1.2.3): " custom_version
                    if validate_version "$custom_version"; then
                        NEW_VERSION=$custom_version
                        break 2
                    fi
                    echo -e "  ${RED}Invalid format. Use MAJOR.MINOR.PATCH (e.g., 1.2.3)${NC}"
                done
                ;;
            5|q|Q)
                echo ""
                echo "  Cancelled."
                exit 0
                ;;
            *)
                echo -e "  ${RED}Invalid choice. Please enter 1-5.${NC}"
                ;;
        esac
    done
}

do_update() {
    local new_version=$1
    local current_version=$2

    # Show confirmation
    echo ""
    echo -e "${BOLD}╭─────────────────────────────────────────╮${NC}"
    echo -e "${BOLD}│${NC}          ${YELLOW}Confirm Version Update${NC}          ${BOLD}│${NC}"
    echo -e "${BOLD}╰─────────────────────────────────────────╯${NC}"
    echo ""
    echo -e "  ${DIM}Current:${NC} ${RED}${current_version}${NC}"
    echo -e "  ${DIM}New:${NC}     ${GREEN}${new_version}${NC}"
    echo ""
    echo -e "  ${DIM}Files to update:${NC}"
    echo -e "    • package.json"
    echo -e "    • src-tauri/Cargo.toml"
    echo -e "    • src-tauri/tauri.conf.json"
    echo ""

    if [[ "$current_version" == "$new_version" ]]; then
        echo -e "  ${YELLOW}Version is already ${new_version}. No changes needed.${NC}"
        echo ""
        exit 0
    fi

    read -p "  Proceed? [Y/n] " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Nn]$ ]]; then
        echo ""
        echo "  Cancelled."
        exit 0
    fi

    # Update files
    echo ""
    echo -e "  ${BLUE}Updating files...${NC}"

    update_package_json "$new_version"
    update_cargo_toml "$new_version"
    update_tauri_conf "$new_version"

    # Verify
    echo ""
    echo -e "  ${BLUE}Verifying...${NC}"

    all_success=true
    verify_update "$new_version" "$PACKAGE_JSON" || all_success=false
    verify_update "$new_version" "$CARGO_TOML" || all_success=false
    verify_update "$new_version" "$TAURI_CONF" || all_success=false

    echo ""

    if $all_success; then
        echo -e "${BOLD}╭─────────────────────────────────────────────────────────────╮${NC}"
        echo -e "${BOLD}│${NC}  ${GREEN}✓ Version updated to ${new_version} successfully!${NC}               ${BOLD}│${NC}"
        echo -e "${BOLD}╰─────────────────────────────────────────────────────────────╯${NC}"
        echo ""
        echo -e "  ${BOLD}Next steps:${NC}"
        echo ""
        echo -e "  ${DIM}1. Review changes:${NC}"
        echo -e "     git diff"
        echo ""
        echo -e "  ${DIM}2. Commit:${NC}"
        echo -e "     git add -A && git commit -m \"release: v${new_version}\""
        echo ""
        echo -e "  ${DIM}3. Tag (optional):${NC}"
        echo -e "     git tag v${new_version}"
        echo ""
    else
        echo -e "  ${RED}✗ Some files failed to update. Please check manually.${NC}"
        exit 1
    fi
}

# Main logic
CURRENT_VERSION=$(get_current_version)

# Parse arguments
if [[ $# -eq 0 ]]; then
    # No args - interactive mode
    interactive_mode "$CURRENT_VERSION"
    do_update "$NEW_VERSION" "$CURRENT_VERSION"
    exit 0
fi

case "$1" in
    -h|--help)
        print_usage
        exit 0
        ;;
    -c|--check)
        echo ""
        echo -e "${BOLD}╭─────────────────────────────────────────╮${NC}"
        echo -e "${BOLD}│${NC}        ${CYAN}PackageFlow Version Info${NC}          ${BOLD}│${NC}"
        echo -e "${BOLD}╰─────────────────────────────────────────╯${NC}"
        echo ""
        echo -e "  Current version: ${GREEN}${CURRENT_VERSION}${NC}"
        echo ""
        echo -e "  ${DIM}Version synced in:${NC}"
        echo -e "    • package.json"
        echo -e "    • src-tauri/Cargo.toml"
        echo -e "    • src-tauri/tauri.conf.json"
        echo ""
        exit 0
        ;;
    -i)
        interactive_mode "$CURRENT_VERSION"
        do_update "$NEW_VERSION" "$CURRENT_VERSION"
        exit 0
        ;;
    --major)
        NEW_VERSION=$(bump_version "$CURRENT_VERSION" "major")
        ;;
    --minor)
        NEW_VERSION=$(bump_version "$CURRENT_VERSION" "minor")
        ;;
    --patch)
        NEW_VERSION=$(bump_version "$CURRENT_VERSION" "patch")
        ;;
    *)
        NEW_VERSION=$1
        if ! validate_version "$NEW_VERSION"; then
            exit 1
        fi
        ;;
esac

do_update "$NEW_VERSION" "$CURRENT_VERSION"
