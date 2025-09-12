# Releasing claude-trace-viewer

## Automated Release Process

Simply run the release script after making your changes:

```bash
python tools/release.py
```

The script will:
1. Check for uncommitted changes
2. Run tests to ensure everything works
3. Ask you to choose version bump (major/minor/patch)
4. Update version in all necessary files
5. Update CHANGELOG.md with template sections
6. Create git commit and tag
7. Push to GitHub (triggering automatic PyPI release)

## Manual Release Process (if needed)

If you prefer to do it manually or the script fails:

### 1. Update Version

Update the version in **two places**:
- `pyproject.toml` - line 7
- `trace_viewer/__init__.py` - line 3

Use semantic versioning: `MAJOR.MINOR.PATCH`
- MAJOR: Breaking changes
- MINOR: New features (backward compatible)
- PATCH: Bug fixes

### 2. Update CHANGELOG

Add a new section to `CHANGELOG.md`:
```markdown
## [0.2.0] - 2025-09-XX

### Added
- New feature descriptions

### Changed
- Modified behavior descriptions

### Fixed
- Bug fix descriptions
```

### 3. Commit and Tag

```bash
# Commit your changes
git add -A
git commit -m "chore: release v0.2.0"

# Create annotated tag (MUST start with 'v')
git tag -a v0.2.0 -m "Release version 0.2.0"

# Push everything
git push origin main
git push origin v0.2.0
```

### 4. Monitor Release

GitHub Actions will automatically publish to PyPI. Monitor at:
- GitHub Actions: https://github.com/brkrabac/claude-trace-viewer/actions
- PyPI: https://pypi.org/project/claude-trace-viewer/

## Important Notes

- **Version tags MUST start with 'v'** (e.g., `v0.2.0`)
- **Use annotated tags** (`git tag -a`) not lightweight tags
- **Version must match** in both `pyproject.toml` and `__init__.py`
- **Trusted publishing is configured** - no PyPI tokens needed in GitHub

## Testing Before Release

```bash
# Run tests locally
python -m pytest tests/

# Build and check package
python -m build
twine check dist/*

# Test installation in clean environment
python -m venv test-env
source test-env/bin/activate
pip install dist/*.whl
claude-trace-viewer --help
deactivate
rm -rf test-env dist/
```

## If Something Goes Wrong

1. **Failed GitHub Action**: Check the logs at GitHub Actions page
2. **PyPI upload failed**: Verify trusted publisher settings at https://pypi.org/manage/project/claude-trace-viewer/settings/publishing/
3. **Wrong version uploaded**: You cannot reuse version numbers on PyPI - bump to next patch version

## Maintaining Trusted Publishing

The project uses PyPI's trusted publishing with these settings:
- **Owner**: brkrabac
- **Repository**: claude-trace-viewer  
- **Workflow**: release.yml
- **Environment**: (none)

If you need to reconfigure, visit:
https://pypi.org/manage/project/claude-trace-viewer/settings/publishing/