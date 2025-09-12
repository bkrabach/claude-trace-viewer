"""Parser brick for Claude trace JSONL files.

Contract:
- Input: Path to JSONL trace file
- Output: List of parsed request/response entries with ALL fields
- No side effects
- Developer-focused: preserves all technical details
"""

import json
from datetime import UTC
from datetime import datetime
from pathlib import Path
from typing import Any


def parse_trace_file(file_path: Path) -> list[dict[str, Any]]:
    """Parse a JSONL trace file and return structured entries with ALL data.

    Args:
        file_path: Path to the JSONL file

    Returns:
        List of parsed entries with complete request/response data
    """
    entries = []

    with open(file_path, encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
                parsed = _process_entry(entry, line_num)
                entries.append(parsed)
            except json.JSONDecodeError as e:
                # Include error entries for debugging
                entries.append(
                    {
                        "index": line_num,
                        "error": f"JSON parse error: {str(e)}",
                        "raw_line": line[:500] + "..." if len(line) > 500 else line,
                    }
                )
                continue

    # Post-process to detect sub-agent conversations
    from .subagent_detector import detect_subagent_conversations

    detect_subagent_conversations(entries)

    return entries


def _process_entry(entry: dict[str, Any], index: int) -> dict[str, Any]:
    """Process a single trace entry preserving ALL technical details."""
    result = {
        "index": index,
        "raw_entry": entry,  # Keep the full raw entry for debugging
        "logged_at": entry.get("logged_at"),
        # Request details - extract everything
        "request": {
            "timestamp": None,
            "timestamp_human": None,
            "method": None,
            "url": None,
            "headers": {},
            "body": None,
            "query_params": None,
            "api_key_suffix": None,
        },
        # Response details - extract everything
        "response": {
            "timestamp": None,
            "timestamp_human": None,
            "status_code": None,
            "headers": {},
            "body": None,
            "body_raw": None,
            "parsed_events": [],
            "request_id": None,
            "rate_limits": {},
            "duration_ms": None,
        },
        # Computed summary fields for quick overview
        "summary": {
            "timestamp": None,
            "method": None,
            "url_path": None,
            "status": None,
            "duration": None,
            "model": None,
            "tokens_used": None,
            "error": None,
        },
        # Sub-agent detection info
        "subagent_info": {
            "is_subagent": False,
            "agent_type": None,
            "detection_method": None,
            "confidence": None,  # Confidence score from robust detection (0.0 to 1.0)
        },
    }

    # Extract request data
    if "request" in entry:
        req = entry["request"]
        result["request"]["timestamp"] = req.get("timestamp")
        result["request"]["timestamp_human"] = _format_timestamp_full(req.get("timestamp"))
        result["request"]["method"] = req.get("method", "GET")
        result["request"]["url"] = req.get("url", "")
        result["request"]["headers"] = req.get("headers", {})
        result["request"]["body"] = req.get("body")

        # Extract query params from URL
        if "?" in result["request"]["url"]:
            result["request"]["query_params"] = result["request"]["url"].split("?")[1]

        # Extract API key suffix for debugging (safely)
        if "x-api-key" in result["request"]["headers"]:
            api_key = result["request"]["headers"]["x-api-key"]
            if len(api_key) > 10:
                result["request"]["api_key_suffix"] = "..." + api_key[-4:]

        # Set summary fields
        result["summary"]["timestamp"] = _format_timestamp(req.get("timestamp"))
        result["summary"]["method"] = req.get("method", "GET")
        result["summary"]["url_path"] = _extract_url_path(req.get("url", ""))

        # Extract model from body if present
        if isinstance(req.get("body"), dict):
            result["summary"]["model"] = req["body"].get("model")

    # Extract response data
    if "response" in entry:
        resp = entry["response"]
        result["response"]["timestamp"] = resp.get("timestamp")
        result["response"]["timestamp_human"] = _format_timestamp_full(resp.get("timestamp"))
        result["response"]["status_code"] = resp.get("status_code")
        result["response"]["headers"] = resp.get("headers", {})
        result["response"]["body"] = resp.get("body")
        result["response"]["body_raw"] = resp.get("body_raw")

        # Extract request ID from headers
        if "request-id" in resp.get("headers", {}):
            result["response"]["request_id"] = resp["headers"]["request-id"]

        # Extract rate limit info
        headers = resp.get("headers", {})
        for key, value in headers.items():
            if "ratelimit" in key.lower():
                result["response"]["rate_limits"][key] = value

        # Calculate duration
        if "timestamp" in resp and "request" in entry and "timestamp" in entry["request"]:
            duration_s = resp["timestamp"] - entry["request"]["timestamp"]
            result["response"]["duration_ms"] = int(duration_s * 1000)
            result["summary"]["duration"] = f"{duration_s:.3f}s"

        # Parse SSE events if present
        if resp.get("body_raw"):
            result["response"]["parsed_events"] = _parse_sse_events_detailed(resp["body_raw"])

            # Extract token usage from events
            for event in result["response"]["parsed_events"]:
                if event.get("type") == "message_delta" and "usage" in event.get("data", {}):
                    usage = event["data"]["usage"]
                    result["summary"]["tokens_used"] = {
                        "input": usage.get("input_tokens"),
                        "output": usage.get("output_tokens"),
                    }

        # Set summary status
        result["summary"]["status"] = resp.get("status_code")

        # Check for errors
        if resp.get("status_code") and resp["status_code"] >= 400:
            if resp.get("body"):
                result["summary"]["error"] = resp["body"]
            else:
                result["summary"]["error"] = f"HTTP {resp['status_code']}"

    # Sub-agent info will be added during post-processing if detected
    if "subagent_info" not in result:
        result["subagent_info"] = {"is_subagent": False, "agent_type": None, "detection_method": None}

    return result


def _extract_system_prompt(entry: dict[str, Any]) -> str | None:
    """Extract the system prompt from an entry.

    Returns:
        System prompt string if found, None otherwise
    """
    if "request" in entry and "body" in entry["request"]:
        body = entry["request"].get("body", {})
        if isinstance(body, dict):
            system = body.get("system")
            # Handle both string and array formats
            if isinstance(system, str):
                return system
            if isinstance(system, list):
                # Convert array of text objects to concatenated string for comparison
                text_parts = []
                for part in system:
                    if isinstance(part, dict) and "text" in part:
                        text_parts.append(part["text"])
                return " ".join(text_parts) if text_parts else ""
    return None


def _format_timestamp(timestamp: float | None) -> str | None:
    """Format Unix timestamp to readable time string."""
    if not timestamp:
        return None
    dt = datetime.fromtimestamp(timestamp, tz=UTC)
    return dt.strftime("%H:%M:%S")


def _format_timestamp_full(timestamp: float | None) -> str | None:
    """Format Unix timestamp to full human-readable datetime string."""
    if not timestamp:
        return None
    dt = datetime.fromtimestamp(timestamp, tz=UTC)
    return dt.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3] + " UTC"


def _extract_url_path(url: str) -> str:
    """Extract the path portion of the URL."""
    if not url:
        return ""
    # Remove protocol and domain
    if "://" in url:
        url = url.split("://")[1]
        if "/" in url:
            return "/" + "/".join(url.split("/")[1:]).split("?")[0]
    return url


def _parse_sse_events_detailed(body_raw: str) -> list[dict[str, Any]]:
    """Parse Server-Sent Events into structured event list.

    Handles accumulation of partial JSON for tool inputs that are built
    up through multiple delta events.
    """
    if not body_raw:
        return []

    events = []
    lines = body_raw.split("\n")
    current_event = None

    # Track content blocks being built up through deltas
    content_blocks = {}  # index -> accumulated content for tool inputs
    content_block_refs = {}  # index -> reference to the content_block_start event

    for line in lines:
        line = line.strip()

        if line.startswith("event: "):
            # Start a new event
            event_type = line[7:]
            current_event = {"type": event_type, "raw": line, "data": None}
            events.append(current_event)

        elif line.startswith("data: ") and current_event is not None:
            # Parse the data for current event
            data_str = line[6:]
            try:
                if data_str and data_str != "[DONE]":
                    current_event["data"] = json.loads(data_str)
                    current_event["raw"] += "\n" + line

                    # Handle content block events for tool input accumulation
                    event_type = current_event.get("type")
                    data = current_event.get("data", {})

                    if event_type == "content_block_start":
                        # Track new content blocks, especially tool_use blocks
                        block_index = data.get("index")
                        content_block = data.get("content_block", {})

                        if block_index is not None and content_block.get("type") == "tool_use":
                            # Initialize accumulator for this tool block
                            content_blocks[block_index] = ""
                            # Store reference to the start event so we can update it later
                            content_block_refs[block_index] = current_event

                    elif event_type == "content_block_delta":
                        # Accumulate partial JSON for tool inputs
                        block_index = data.get("index")
                        delta = data.get("delta", {})

                        if (
                            block_index is not None
                            and block_index in content_blocks
                            and delta.get("type") == "input_json_delta"
                        ):
                            # Accumulate the partial JSON
                            partial_json = delta.get("partial_json", "")
                            content_blocks[block_index] += partial_json

                    elif event_type == "content_block_stop":
                        # Complete the content block and parse accumulated JSON
                        block_index = data.get("index")

                        if block_index is not None and block_index in content_blocks:
                            # Parse the accumulated JSON and update the original start event
                            accumulated_json = content_blocks[block_index]
                            if accumulated_json and block_index in content_block_refs:
                                try:
                                    # Parse the complete input
                                    parsed_input = json.loads(accumulated_json)

                                    # Update the original content_block_start event with complete input
                                    start_event = content_block_refs[block_index]
                                    if "data" in start_event and "content_block" in start_event["data"]:
                                        start_event["data"]["content_block"]["input"] = parsed_input

                                except json.JSONDecodeError as e:
                                    # If parsing fails, store the raw accumulated string for debugging
                                    if block_index in content_block_refs:
                                        start_event = content_block_refs[block_index]
                                        if "data" in start_event and "content_block" in start_event["data"]:
                                            start_event["data"]["content_block"]["input_raw"] = accumulated_json
                                            start_event["data"]["content_block"]["input_parse_error"] = str(e)

                            # Clean up accumulators for this block
                            del content_blocks[block_index]
                            if block_index in content_block_refs:
                                del content_block_refs[block_index]

            except json.JSONDecodeError:
                current_event["data"] = data_str  # Keep as string if not JSON
                current_event["raw"] += "\n" + line

    return events


def list_trace_files(directory: Path) -> list[dict[str, Any]]:
    """List available trace files in a directory.

    Args:
        directory: Path to directory containing trace files

    Returns:
        List of file info dictionaries
    """
    files = []

    if not directory.exists():
        return files

    for file_path in sorted(directory.glob("*.jsonl"), reverse=True):
        stat = file_path.stat()
        files.append(
            {
                "name": file_path.name,
                "size": _format_file_size(stat.st_size),
                "modified": datetime.fromtimestamp(stat.st_mtime, tz=UTC).strftime("%Y-%m-%d %H:%M:%S"),
                "path": str(file_path),
            }
        )

    return files


def _format_file_size(size: int) -> str:
    """Format file size in human-readable form."""
    size_float = float(size)
    for unit in ["B", "KB", "MB", "GB"]:
        if size_float < 1024.0:
            return f"{size_float:.1f} {unit}"
        size_float /= 1024.0
    return f"{size_float:.1f} TB"
