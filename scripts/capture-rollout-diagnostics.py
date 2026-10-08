#!/usr/bin/env python3
"""Preserve rollout status before Helm's atomic rollback removes failed pods.

Only explicitly selected status fields are persisted: never pod specs, environment,
Secrets, annotations, application logs or arbitrary Kubernetes error messages.
The wrapped command keeps its stdout/stderr and its exit status.
"""

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def summarize(items, release):
    result = []
    prefix = release + "-vibecore-platform-"
    for item in items:
        metadata = item.get("metadata", {})
        name = metadata.get("name", "")
        if not name.startswith(prefix):
            continue
        status = item.get("status", {})
        row = {"kind": item.get("kind"), "name": name}
        for key in ("phase", "replicas", "readyReplicas", "availableReplicas", "updatedReplicas", "active", "succeeded", "failed"):
            if key in status:
                row[key] = status[key]
        row["conditions"] = [
            {key: condition[key] for key in ("type", "status", "reason") if key in condition}
            for condition in status.get("conditions", [])
        ]
        row["containers"] = []
        for container in status.get("initContainerStatuses", []) + status.get("containerStatuses", []):
            entry = {key: container[key] for key in ("name", "ready", "restartCount") if key in container}
            for key in ("state", "lastState"):
                entry[key] = {
                    state: {field: value[field] for field in ("reason", "exitCode", "signal", "startedAt", "finishedAt") if field in value}
                    for state, value in container.get(key, {}).items()
                }
            row["containers"].append(entry)
        result.append(row)
    return sorted(result, key=lambda row: (row["kind"] or "", row["name"]))


def snapshot(namespace, release):
    try:
        response = subprocess.run(
            ["kubectl", "--request-timeout=8s", "-n", namespace, "get", "pods,jobs,deployments", "-o", "json"],
            capture_output=True, text=True, timeout=10, check=True,
        )
        resources = summarize(json.loads(response.stdout)["items"], release)
        return {"resources": resources}
    except (subprocess.SubprocessError, OSError, ValueError, KeyError, TypeError) as error:
        # Never persist stderr: it can contain authentication details.
        return {"captureError": type(error).__name__}


def capture(command, namespace, release, output, interval=15):
    output.parent.mkdir(parents=True, exist_ok=True)
    # Open before starting Helm: refuse to change production if evidence cannot
    # be written. Each sample is flushed before the upgrade can discard its pods.
    with output.open("w", encoding="utf-8") as evidence:
        def record(payload):
            evidence.write(json.dumps({"time": datetime.now(timezone.utc).isoformat(), **payload}) + "\n")
            evidence.flush()

        record(snapshot(namespace, release))
        process = subprocess.Popen(command)
        while True:
            try:
                code = process.wait(timeout=interval)
                break
            except subprocess.TimeoutExpired:
                record(snapshot(namespace, release))
        record(snapshot(namespace, release))
        record({"commandExitCode": code})
        return code if code >= 0 else 128 - code


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--release", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("a wrapped command is required after --")
    return capture(command, args.namespace, args.release, args.output)


if __name__ == "__main__":
    raise SystemExit(main())
