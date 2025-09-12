# Claude Trace Viewer

A simple web-based viewer for `.claude-trace` files.

## Installation

```bash
# Run directly with uvx (no installation needed)
uvx claude-trace-viewer

# Or install with pip/uv
pip install claude-trace-viewer
# or
uv add claude-trace-viewer
```

## Usage

```bash
# View traces in current directory
claude-trace-viewer

# Specify a different directory
claude-trace-viewer --trace-dir /path/to/traces

# Use a different port
claude-trace-viewer --port 8080
```

The viewer will automatically open in your default browser at http://localhost:5000

## Features

- View all `.claude-trace` files in a directory
- Interactive timeline visualization
- Sub-agent detection and visualization
- Search and filter capabilities
- Export trace data

## Development

```bash
# Clone the repository
git clone https://github.com/brkrabac/claude-trace-viewer.git
cd claude-trace-viewer

# Install in development mode
pip install -e .
```

## License

MIT