#!/usr/bin/env python3
"""
Release automation script for claude-trace-viewer.

This script handles version bumping, changelog updates, git operations,
and creates a new release with proper tagging.
"""

import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path


# ANSI color codes for pretty output
class Colors:
    HEADER = "\033[95m"
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    WARNING = "\033[93m"
    FAIL = "\033[91m"
    ENDC = "\033[0m"
    BOLD = "\033[1m"


def print_header(msg: str):
    """Print a header message."""
    print(f"\n{Colors.HEADER}{Colors.BOLD}{msg}{Colors.ENDC}")


def print_info(msg: str):
    """Print an info message."""
    print(f"{Colors.CYAN}ℹ {msg}{Colors.ENDC}")


def print_success(msg: str):
    """Print a success message."""
    print(f"{Colors.GREEN}✓ {msg}{Colors.ENDC}")


def print_error(msg: str):
    """Print an error message."""
    print(f"{Colors.FAIL}✗ {msg}{Colors.ENDC}")


def print_warning(msg: str):
    """Print a warning message."""
    print(f"{Colors.WARNING}⚠ {msg}{Colors.ENDC}")


def run_command(cmd: list[str], capture_output: bool = True) -> tuple[int, str, str]:
    """Run a command and return the result."""
    result = subprocess.run(cmd, capture_output=capture_output, text=True)
    return (
        result.returncode,
        result.stdout if capture_output else "",
        result.stderr if capture_output else "",
    )


def check_git_status() -> bool:
    """Check if there are uncommitted changes."""
    returncode, stdout, _ = run_command(["git", "status", "--porcelain"])
    if returncode != 0:
        print_error("Failed to check git status")
        return False

    if stdout.strip():
        print_error("There are uncommitted changes. Please commit or stash them first.")
        print_info("Uncommitted files:")
        for line in stdout.strip().split("\n"):
            print(f"  {line}")
        return False

    return True


def check_branch() -> bool:
    """Check if we're on the main branch."""
    returncode, stdout, _ = run_command(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    if returncode != 0:
        print_error("Failed to get current branch")
        return False

    current_branch = stdout.strip()
    if current_branch not in ["main", "master"]:
        print_warning(f"You are on branch '{current_branch}', not 'main' or 'master'")
        response = input(f"{Colors.BLUE}Continue anyway? (y/N): {Colors.ENDC}")
        if response.lower() != "y":
            return False

    return True


def run_tests() -> bool:
    """Run the test suite."""
    print_info("Running tests...")

    # Try to find and run tests
    if Path("Makefile").exists():
        returncode, _, stderr = run_command(["make", "check"], capture_output=False)
        if returncode != 0:
            print_error("Tests failed. Please fix them before releasing.")
            return False
    else:
        print_warning("No Makefile found, skipping automated tests")
        response = input(f"{Colors.BLUE}Have you manually verified that tests pass? (y/N): {Colors.ENDC}")
        if response.lower() != "y":
            return False

    return True


def get_current_version() -> str:
    """Get the current version from pyproject.toml."""
    pyproject_path = Path("pyproject.toml")
    if not pyproject_path.exists():
        print_error("pyproject.toml not found")
        sys.exit(1)

    content = pyproject_path.read_text()
    match = re.search(r'^version\s*=\s*"([^"]+)"', content, re.MULTILINE)
    if not match:
        print_error("Could not find version in pyproject.toml")
        sys.exit(1)

    return match.group(1)


def parse_version(version: str) -> tuple[int, int, int]:
    """Parse a semantic version string."""
    parts = version.split(".")
    if len(parts) != 3:
        raise ValueError(f"Invalid version format: {version}")

    try:
        major = int(parts[0])
        minor = int(parts[1])
        patch = int(parts[2])
        return major, minor, patch
    except ValueError:
        raise ValueError(f"Invalid version format: {version}")


def bump_version(current: str, bump_type: str) -> str:
    """Bump the version based on the type."""
    major, minor, patch = parse_version(current)

    if bump_type == "major":
        return f"{major + 1}.0.0"
    if bump_type == "minor":
        return f"{major}.{minor + 1}.0"
    if bump_type == "patch":
        return f"{major}.{minor}.{patch + 1}"
    # Custom version - validate it
    try:
        parse_version(bump_type)
        return bump_type
    except ValueError:
        raise ValueError(f"Invalid version format: {bump_type}")


def get_new_version(current_version: str) -> str:
    """Prompt user for the new version."""
    print_info(f"Current version: {Colors.BOLD}{current_version}{Colors.ENDC}")
    print("\nSelect version bump type:")

    major, minor, patch = parse_version(current_version)

    print(f"  1) Major ({major + 1}.0.0) - Breaking changes")
    print(f"  2) Minor ({major}.{minor + 1}.0) - New features")
    print(f"  3) Patch ({major}.{minor}.{patch + 1}) - Bug fixes")
    print("  4) Custom version")

    while True:
        choice = input(f"\n{Colors.BLUE}Enter choice (1-4): {Colors.ENDC}")

        if choice == "1":
            return bump_version(current_version, "major")
        if choice == "2":
            return bump_version(current_version, "minor")
        if choice == "3":
            return bump_version(current_version, "patch")
        if choice == "4":
            custom = input(f"{Colors.BLUE}Enter custom version (e.g., 1.2.3): {Colors.ENDC}")
            try:
                return bump_version(current_version, custom)
            except ValueError as e:
                print_error(str(e))
                continue
        else:
            print_error("Invalid choice. Please enter 1, 2, 3, or 4.")


def update_version_in_file(file_path: Path, old_version: str, new_version: str, pattern: str | None = None):
    """Update version in a file."""
    content = file_path.read_text()

    if pattern:
        # Use custom pattern
        old_pattern = pattern.format(version=re.escape(old_version))
        new_pattern = pattern.format(version=new_version)
        new_content = re.sub(old_pattern, new_pattern, content)
    else:
        # Simple string replacement
        new_content = content.replace(old_version, new_version)

    if new_content == content:
        print_warning(f"No version string found in {file_path}")
        return False

    file_path.write_text(new_content)
    return True


def update_changelog(new_version: str):
    """Update the CHANGELOG.md file."""
    changelog_path = Path("CHANGELOG.md")

    if not changelog_path.exists():
        print_warning("CHANGELOG.md not found, creating one...")
        content = """# Changelog

All notable changes to claude-trace-viewer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

"""
    else:
        content = changelog_path.read_text()

    # Check if version already exists
    if f"## [{new_version}]" in content:
        print_warning(f"Version {new_version} already exists in CHANGELOG.md")
        return

    # Find the insertion point (after the header, before the first version entry)
    lines = content.split("\n")
    insert_index = -1

    for i, line in enumerate(lines):
        if line.startswith("## ["):
            insert_index = i
            break

    today = datetime.now().strftime("%Y-%m-%d")
    new_entry = f"""## [{new_version}] - {today}

### Added
-

### Changed
-

### Fixed
-

### Removed
-

"""

    if insert_index == -1:
        # No existing versions, append at the end
        content += "\n" + new_entry
    else:
        # Insert before the first version entry
        lines.insert(insert_index, new_entry.rstrip())
        content = "\n".join(lines)

    changelog_path.write_text(content)
    print_success(f"Updated CHANGELOG.md with version {new_version}")

    print_warning("Please edit CHANGELOG.md to add your changes before finalizing the release")
    input(f"{Colors.BLUE}Press Enter when you've updated the changelog...{Colors.ENDC}")


def confirm_release(old_version: str, new_version: str) -> bool:
    """Confirm the release details with the user."""
    print_header("Release Summary")
    print(f"  Old version: {old_version}")
    print(f"  New version: {Colors.BOLD}{new_version}{Colors.ENDC}")
    print(f"  Git tag:     v{new_version}")
    print(f"  Commit msg:  chore: release v{new_version}")

    response = input(f"\n{Colors.BLUE}Proceed with release? (y/N): {Colors.ENDC}")
    return response.lower() == "y"


def perform_git_operations(new_version: str) -> bool:
    """Perform git operations for the release."""
    print_header("Performing Git Operations")

    # Stage all changes
    print_info("Staging changes...")
    returncode, _, stderr = run_command(["git", "add", "-A"])
    if returncode != 0:
        print_error(f"Failed to stage changes: {stderr}")
        return False

    # Commit
    commit_message = f"chore: release v{new_version}"
    print_info(f"Creating commit: {commit_message}")
    returncode, _, stderr = run_command(["git", "commit", "-m", commit_message])
    if returncode != 0:
        print_error(f"Failed to commit: {stderr}")
        return False

    # Create annotated tag
    tag_name = f"v{new_version}"
    tag_message = f"Release version {new_version}"
    print_info(f"Creating tag: {tag_name}")
    returncode, _, stderr = run_command(["git", "tag", "-a", tag_name, "-m", tag_message])
    if returncode != 0:
        print_error(f"Failed to create tag: {stderr}")
        return False

    # Push commit and tag
    print_info("Pushing to remote...")
    returncode, _, stderr = run_command(["git", "push"])
    if returncode != 0:
        print_error(f"Failed to push commit: {stderr}")
        return False

    returncode, _, stderr = run_command(["git", "push", "--tags"])
    if returncode != 0:
        print_error(f"Failed to push tags: {stderr}")
        return False

    return True


def main():
    """Main entry point."""
    print_header("🚀 Claude Trace Viewer Release Script")

    # Change to project root
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    os.chdir(project_root)

    # Pre-flight checks
    print_header("Pre-flight Checks")

    if not check_git_status():
        sys.exit(1)
    print_success("Git working directory is clean")

    if not check_branch():
        sys.exit(1)
    print_success("On appropriate branch")

    if not run_tests():
        sys.exit(1)
    print_success("Tests passed")

    # Version management
    print_header("Version Management")

    current_version = get_current_version()
    new_version = get_new_version(current_version)

    print_info(f"Bumping version from {current_version} to {new_version}")

    # Update version in files
    pyproject_path = Path("pyproject.toml")
    if update_version_in_file(
        pyproject_path,
        current_version,
        new_version,
        pattern=r'^version\s*=\s*"{version}"',
    ):
        print_success("Updated pyproject.toml")

    init_path = Path("trace_viewer/__init__.py")
    if update_version_in_file(
        init_path,
        current_version,
        new_version,
        pattern=r'^__version__\s*=\s*"{version}"',
    ):
        print_success("Updated trace_viewer/__init__.py")

    # Update changelog
    update_changelog(new_version)

    # Confirm and perform release
    if not confirm_release(current_version, new_version):
        print_warning("Release cancelled")
        # Revert changes
        run_command(["git", "checkout", "--", "pyproject.toml", "trace_viewer/__init__.py"])
        sys.exit(0)

    if not perform_git_operations(new_version):
        print_error("Failed to complete git operations")
        sys.exit(1)

    # Success!
    print_header("🎉 Release Complete!")
    print_success(f"Version {new_version} has been released")
    print_info(f"GitHub release page: https://github.com/brkrabac/claude-trace-viewer/releases/tag/v{new_version}")
    print_info(f"PyPI package page: https://pypi.org/project/claude-trace-viewer/{new_version}/")
    print_info("\nNext steps:")
    print("  1. Wait for GitHub Actions to publish to PyPI (if configured)")
    print("  2. Or manually publish with: python -m build && twine upload dist/*")
    print("  3. Create a GitHub release from the tag (optional)")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n" + Colors.WARNING + "Release cancelled by user" + Colors.ENDC)
        sys.exit(1)
    except Exception as e:
        print_error(f"Unexpected error: {e}")
        sys.exit(1)
