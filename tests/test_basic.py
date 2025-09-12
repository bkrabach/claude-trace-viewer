"""Basic tests for claude-trace-viewer package."""

import sys
from pathlib import Path


def test_package_imports():
    """Test that the package can be imported."""
    import trace_viewer
    assert trace_viewer.__version__ == "0.1.0"


def test_cli_entry_point():
    """Test that CLI entry point exists."""
    from trace_viewer.__main__ import main
    assert callable(main)


def test_server_module():
    """Test that server module can be imported."""
    from trace_viewer import server
    assert hasattr(server, 'app')
    assert hasattr(server, 'run_server')


if __name__ == "__main__":
    test_package_imports()
    test_cli_entry_point()
    test_server_module()
    print("All tests passed!")