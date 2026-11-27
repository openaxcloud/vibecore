#!/usr/bin/env bash
set -euo pipefail

# Playwright invokes apt through sudo, which clears APT_CONFIG.
# A job-local drop-in reaches both apt update and apt install.
test -s /usr/share/keyrings/ubuntu-archive-keyring.gpg
sources=$(sudo mktemp /etc/apt/vibecore-browser-XXXXXXXX.list)
config=$(sudo mktemp /etc/apt/apt.conf.d/zz-vibecore-browser-XXXXXXXX.conf)
echo "sources=$sources" >> "$GITHUB_OUTPUT"
echo "config=$config" >> "$GITHUB_OUTPUT"
sudo install -m 0644 .github/scripts/browser-noble.list "$sources"
printf 'Dir::Etc::sourcelist "%s";\nDir::Etc::sourceparts "-";\n' "$sources" | sudo tee "$config" >/dev/null
sudo chmod 0644 "$config"
