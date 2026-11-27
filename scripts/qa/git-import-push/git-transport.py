#!/usr/bin/python3
"""Replace this fixture's external transport while preserving Git's ref checks."""
import os
import subprocess
import sys

args = sys.argv[1:]
fixture_url = "https://forge.example.invalid/qa/project.git"
bare = os.path.join(os.environ["QA_ROOT"], "origin.git")
git = "/usr/bin/git"

if "clone" in args and args[-2] == fixture_url:
    options = [flag for flag in ("--no-checkout", "--depth=1") if flag in args]
    args = ["clone", "--no-local", *options, "--template=", "--single-branch", "--branch", "main", bare, args[-1]]
elif "push" in args:
    position = args.index("push")
    if args[position + 1:] != ["origin", "main"]:
        sys.exit("Unexpected fixture push")
    prefix = args[:position]
    configured = subprocess.check_output([git, *prefix, "remote", "get-url", "origin"], text=True).strip()
    if configured != fixture_url:
        sys.exit("The imported workspace does not have the fixture origin")
    args = [*prefix, "push", bare, "main"]

os.execv(git, [git, *args])
