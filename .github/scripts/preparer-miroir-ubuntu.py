#!/usr/bin/env python3
"""Select Ubuntu's canonical archive for the ephemeral WebKit CI runner only."""

import argparse
import platform
import re
from pathlib import Path

AZURE_ARCHIVES = {
    f"{scheme}://azure.archive.ubuntu.com/ubuntu{suffix}":
    f"https://archive.ubuntu.com/ubuntu{suffix}"
    for scheme in ("http", "https")
    for suffix in ("", "/")
}


def rewrite(text: str, kind: str) -> str:
    result = []
    uri_field = False
    for line in text.splitlines(keepends=True):
        if not line.strip() or line.lstrip().startswith("#"):
            if not line.strip():
                uri_field = False
            result.append(line)
            continue
        if kind == "sources":
            field = re.match(r"^([^\s:]+):", line)
            if field:
                uri_field = field.group(1) == "URIs"
            if uri_field:
                body, separator, comment = line.partition("#")
                line = re.sub(r"\S+", lambda m: AZURE_ARCHIVES.get(m.group(), m.group()), body)
                line += separator + comment
        elif kind == "list":
            match = re.match(r"^(\s*deb(?:-src)?\s+(?:\[[^]\n]*\]\s+)?)(\S+)", line)
            if match:
                line = line[:match.start(2)] + AZURE_ARCHIVES.get(match.group(2), match.group(2)) + line[match.end(2):]
        else:
            match = re.match(r"^(\s*)(\S+)", line)
            if match:
                line = line[:match.start(2)] + AZURE_ARCHIVES.get(match.group(2), match.group(2)) + line[match.end(2):]
        result.append(line)
    return "".join(result)


def prepare(root: Path) -> int:
    os_release = root / "etc/os-release"
    if platform.machine() != "x86_64" or not os_release.is_file():
        print("Ubuntu mirror unchanged: unsupported runner architecture or OS")
        return 0
    release = dict(
        line.split("=", 1) for line in os_release.read_text().splitlines() if "=" in line
    )
    if release.get("ID", "").strip('"') != "ubuntu":
        print("Ubuntu mirror unchanged: not Ubuntu")
        return 0

    apt = root / "etc/apt"
    candidates = [apt / "apt-mirrors.txt", apt / "sources.list"]
    candidates += sorted((apt / "sources.list.d").glob("*.list"))
    candidates += sorted((apt / "sources.list.d").glob("*.sources"))
    changed = 0
    for path in candidates:
        if not path.is_file() or path.is_symlink():
            continue
        original = path.read_text()
        kind = "mirrorlist" if path.name == "apt-mirrors.txt" else path.suffix.lstrip(".")
        updated = rewrite(original, kind)
        if updated != original:
            path.write_text(updated)
            changed += 1
            print(f"Selected canonical Ubuntu archive in {path.relative_to(root)}")
    print(f"Ubuntu archive configuration files changed: {changed}")
    return changed


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("/"))
    args = parser.parse_args()
    prepare(args.root)
