from __future__ import annotations

import json
import os
import socket
from pathlib import Path
from urllib import error, request

from dotenv import load_dotenv

from graph.state import SentinelState

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def _backend_url() -> str:
    raw = os.getenv("SENTINEL_BACKEND_URL", "http://localhost:3000")
    value = raw.strip().rstrip("/")
    if not value:
        raise ValueError(
            "SENTINEL_BACKEND_URL environment variable is empty or only whitespace; please set it to a valid backend URL."
        )
    return value


def courier_execute_node(state: SentinelState) -> dict[str, object]:
    dispatch_action = str(state.get("dispatch_action", "")).strip()
    dispatch_payload = state.get("dispatch_payload")

    if not dispatch_action:
        raise ValueError("state.dispatch_action is required before courier_execute step")
    if not isinstance(dispatch_payload, dict):
        raise ValueError("state.dispatch_payload must be a dict before courier_execute step")

    # Patch application and branch push are handled by the Next.js Courier API,
    # which clones the target repo, applies the patch, and pushes. We only
    # forward the payload here.
    req = request.Request(
        url=f"{_backend_url()}/api/agent/courier",
        data=json.dumps(
            {
                "dispatch_action": dispatch_action,
                "dispatch_payload": dispatch_payload,
            }
        ).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        return {
            "dispatch_result_type": "error",
            "dispatch_result_url": "",
            "dispatch_result_number": 0,
            "dispatch_payload": {
                **dispatch_payload,
                "execution_error": f"courier API error {err.code}: {body}",
            },
        }
    except error.URLError as err:
        reason = err.reason
        if isinstance(reason, socket.timeout):
            message = "courier API timed out after 30 seconds"
        else:
            message = f"courier API unavailable: {reason}"
        return {
            "dispatch_result_type": "error",
            "dispatch_result_url": "",
            "dispatch_result_number": 0,
            "dispatch_payload": {
                **dispatch_payload,
                "execution_error": message,
            },
        }
    except (TimeoutError, socket.timeout):
        return {
            "dispatch_result_type": "error",
            "dispatch_result_url": "",
            "dispatch_result_number": 0,
            "dispatch_payload": {
                **dispatch_payload,
                "execution_error": "courier API timed out after 30 seconds",
            },
        }

    return {
        "dispatch_result_type": data.get("type"),
        "dispatch_result_url": data.get("url"),
        "dispatch_result_number": data.get("number"),
    }
