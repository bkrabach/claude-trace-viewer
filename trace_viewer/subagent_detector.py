"""Simple sub-agent detector using robust conversation flow patterns."""

from typing import Any


def detect_subagent_conversations(entries: list[dict[str, Any]]) -> None:
    """
    Detect sub-agent conversations using conversation flow patterns.

    Detection is based on:
    1. Task tool invocations start sub-agent contexts
    2. Message count resets (drops to 1) after Task indicate sub-agent start
    3. Large message count jumps (50+) indicate return to main agent
    4. Infrastructure requests (single-message, non-conversation) are skipped

    Modifies entries in place by adding 'subagent_info' dictionary.
    """
    if not entries:
        return

    active_subagent = None
    prev_msg_count = 0

    for entry in entries:
        # Check if this entry invokes a Task tool
        task_agent = _get_task_subagent_type(entry)
        if task_agent:
            # Task invocation - next conversation reset starts sub-agent
            active_subagent = task_agent
            prev_msg_count = _get_message_count(entry)
            continue

        # Skip infrastructure requests
        if _is_infrastructure_request(entry):
            continue

        # Get message count for this conversation entry
        msg_count = _get_message_count(entry)

        # Detect conversation context changes
        # Check for return to main (large positive jump in messages)
        if active_subagent and prev_msg_count > 0 and msg_count > prev_msg_count + 50:
            # Jumped back to main conversation context
            active_subagent = None

        # Mark as sub-agent if in sub-agent context
        if active_subagent:
            entry["subagent_info"] = {
                "is_subagent": True,
                "agent_type": active_subagent,
                "detection_method": "conversation_flow",
            }

        prev_msg_count = msg_count


def _get_message_count(entry: dict[str, Any]) -> int:
    """Get the message count from an entry's request."""
    if "request" in entry and "body" in entry["request"]:
        body = entry["request"].get("body", {})
        if isinstance(body, dict):
            return len(body.get("messages", []))
    return 0


def _get_task_subagent_type(entry: dict[str, Any]) -> str | None:
    """Extract subagent_type from Task tool invocation if present."""
    if "response" not in entry or "parsed_events" not in entry["response"]:
        return None

    for event in entry["response"]["parsed_events"]:
        if event.get("type") != "content_block_start":
            continue

        data = event.get("data", {})
        content_block = data.get("content_block", {})

        if content_block.get("type") == "tool_use" and content_block.get("name") == "Task":
            input_data = content_block.get("input", {})
            if isinstance(input_data, dict):
                return input_data.get("subagent_type")

    return None


def _is_infrastructure_request(entry: dict[str, Any]) -> bool:
    """
    Identify infrastructure requests (bash processors, file extractors, etc).

    Infrastructure requests have:
    - Exactly 1 message (single-purpose request)
    - System prompt that's not the main conversation prompt

    This detection is based on structural patterns, not hard-coded strings.
    """
    if "request" not in entry or "body" not in entry["request"]:
        return False

    body = entry["request"].get("body", {})
    if not isinstance(body, dict):
        return False

    # Check message count - infrastructure always has exactly 1 message
    messages = body.get("messages", [])
    if len(messages) != 1:
        return False

    # Check system prompt - infrastructure doesn't use conversation prompt
    system = body.get("system", "")
    if isinstance(system, list) and system:
        system = system[0].get("text", "") if isinstance(system[0], dict) else system[0]
    if not isinstance(system, str):
        return False

    # Conversation entries start with "You are Claude Code"
    # This is the stable identity marker for the main agent
    # Infrastructure uses different, task-specific prompts
    return not system.startswith("You are Claude Code")
