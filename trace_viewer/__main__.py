"""Entry point for Claude trace viewer module."""

import argparse
from pathlib import Path

from .server import run_server


def main():
    """Main entry point for the trace viewer."""
    parser = argparse.ArgumentParser(description="Claude Trace Viewer - Web-based viewer for Claude trace files")
    parser.add_argument(
        "directory",
        nargs="?",
        default=".claude-trace",
        help="Directory containing trace files (default: .claude-trace)",
    )
    parser.add_argument(
        "-p",
        "--port",
        type=int,
        default=8080,
        help="Port to run server on (default: 8080)",
    )
    parser.add_argument("--no-browser", action="store_true", help="Don't automatically open browser")

    args = parser.parse_args()

    trace_dir = Path(args.directory)
    if not trace_dir.exists():
        print(f"⚠️  Warning: Directory '{trace_dir}' does not exist")
        print("Creating directory...")
        trace_dir.mkdir(parents=True, exist_ok=True)

    run_server(trace_dir=trace_dir, port=args.port, open_browser_flag=not args.no_browser)


if __name__ == "__main__":
    main()
