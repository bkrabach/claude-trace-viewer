"""Web server brick for Claude trace viewer.

Contract:
- Input: Directory path containing trace files
- Output: Flask web server on localhost:8080
- Side effects: Opens web browser
- Developer-focused: Serves complete trace data for debugging
"""

import webbrowser
from pathlib import Path
from threading import Timer

from flask import Flask
from flask import jsonify
from flask import render_template
from flask import request

from . import parser

app = Flask(__name__)


# Global config
TRACE_DIR = Path(".claude-trace")


@app.route("/")
def index():
    """Serve the main viewer interface."""
    return render_template("index.html")


@app.route("/api/files")
def get_files():
    """API endpoint to list available trace files."""
    files = parser.list_trace_files(TRACE_DIR)
    return jsonify(files)


@app.route("/api/trace/<filename>")
def get_trace(filename: str):
    """API endpoint to get parsed trace data for a specific file.

    Query parameters:
    - limit: Maximum number of entries to return (default: all)
    - offset: Number of entries to skip (default: 0)
    """
    # Security: only allow .jsonl files in the trace directory
    if not filename.endswith(".jsonl"):
        return jsonify({"error": "Invalid file type"}), 400

    file_path = TRACE_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        return jsonify({"error": "File not found"}), 404

    # Ensure file is within trace directory (prevent path traversal)
    try:
        file_path = file_path.resolve()
        TRACE_DIR.resolve()
        if not str(file_path).startswith(str(TRACE_DIR.resolve())):
            return jsonify({"error": "Invalid file path"}), 403
    except Exception:
        return jsonify({"error": "Invalid file path"}), 403

    try:
        entries = parser.parse_trace_file(file_path)

        # Apply pagination if requested
        limit = request.args.get("limit", type=int)
        offset = request.args.get("offset", 0, type=int)

        total = len(entries)

        if limit:
            entries = entries[offset : offset + limit]
        elif offset:
            entries = entries[offset:]

        return jsonify({"entries": entries, "total": total, "limit": limit, "offset": offset})
    except Exception as e:
        return jsonify({"error": f"Failed to parse file: {str(e)}"}), 500


def open_browser():
    """Open the default web browser to the viewer."""
    webbrowser.open("http://localhost:8080")


def run_server(trace_dir: Path | None = None, port: int = 8080, open_browser_flag: bool = True):
    """Run the Flask server.

    Args:
        trace_dir: Directory containing trace files
        port: Port to run server on
        open_browser_flag: Whether to automatically open browser
    """
    global TRACE_DIR
    if trace_dir:
        TRACE_DIR = trace_dir

    # Open browser after a short delay
    if open_browser_flag:
        Timer(1.5, open_browser).start()

    print("🚀 Starting Claude Trace Viewer")
    print(f"📁 Trace directory: {TRACE_DIR}")
    print(f"🌐 Server running at: http://localhost:{port}")
    print("Press Ctrl+C to stop\n")

    app.run(host="127.0.0.1", port=port, debug=False)
