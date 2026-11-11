#!/usr/bin/env python3
"""Select Ubuntu's canonical archive for the ephemeral Ubuntu CI runner only."""

import argparse
import os
import shutil
import uuid
import platform
import re
from pathlib import Path

AZURE_ARCHIVES = {
    f"{scheme}://azure.archive.ubuntu.com/ubuntu{suffix}":
    f"https://archive.ubuntu.com/ubuntu{suffix}"
    for scheme in ("http", "https")
    for suffix in ("", "/")
}


def rewrite(text: str, kind: str, archives: dict[str, str] = AZURE_ARCHIVES) -> str:
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
                line = re.sub(r"\S+", lambda m: archives.get(m.group(), m.group()), body)
                line += separator + comment
        elif kind == "list":
            match = re.match(r"^(\s*deb(?:-src)?\s+(?:\[[^]\n]*\]\s+)?)(\S+)", line)
            if match:
                line = line[:match.start(2)] + archives.get(match.group(2), match.group(2)) + line[match.end(2):]
        else:
            match = re.match(r"^(\s*)(\S+)", line)
            if match:
                line = line[:match.start(2)] + archives.get(match.group(2), match.group(2)) + line[match.end(2):]
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



def prepare_temporary(source_root: Path, temp_root: Path) -> Path:
    """Copy sources; never edit host APT configuration or authentication settings."""
    # Public package-source metadata only. Create a fresh traversable directory;
    # do not change permissions of any existing runner/system path.
    directory = temp_root / f"vibecore-apt-{uuid.uuid4().hex}"
    directory.mkdir(mode=0o755)
    apt = directory / "etc/apt"
    apt.mkdir(parents=True)
    (directory / "etc/os-release").write_text((source_root / "etc/os-release").read_text())
    source_apt = source_root / "etc/apt"
    for name in ("sources.list", "apt-mirrors.txt", "sources.list.d"):
        source = source_apt / name
        if source.is_dir():
            shutil.copytree(source, apt / name)
        elif source.is_file():
            shutil.copyfile(source, apt / name)
    (apt / "sources.list.d").mkdir(exist_ok=True)
    if not (apt / "sources.list").exists():
        (apt / "sources.list").write_text("")
    prepare(directory)
    # Hosted Ubuntu can use mirror+file instead of a direct archive URL.
    for path in [apt / "sources.list", *(apt / "sources.list.d").glob("*.list"),
                 *(apt / "sources.list.d").glob("*.sources")]:
        path.write_text(rewrite(path.read_text(), path.suffix.lstrip("."), {
            "mirror+file:/etc/apt/apt-mirrors.txt": "https://archive.ubuntu.com/ubuntu",
        }))
    config = directory / "apt.conf"
    # Leave system apt.conf.d, trusted keys and Signed-By untouched. APT_CONFIG
    # is passed only to the installer, never exported to later build steps.
    config.write_text(
        f'Dir::Etc::sourcelist "{apt}/sources.list";\n'
        f'Dir::Etc::sourceparts "{apt}/sources.list.d";\n'
        'Acquire::Retries "2";\n'
        'Acquire::http::Timeout "30";\n'
        'Acquire::https::Timeout "30";\n'
        'APT::Update::Error-Mode "any";\n'
    )
    return config

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("/"))
    parser.add_argument("--temporary", action="store_true")
    args = parser.parse_args()
    if args.temporary:
        if os.environ.get("RUNNER_ENVIRONMENT") != "github-hosted":
            parser.error("temporary APT sources require a GitHub-hosted runner")
        config = prepare_temporary(args.root, Path(os.environ["RUNNER_TEMP"]))
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write(f"apt_config={config}\n")
    else:
        prepare(args.root)
