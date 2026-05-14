# Terminal and shell behaviour

The IDE terminal is backed by StackBlitz's WebContainer and its bundled
`/bin/jsh` shell. jsh is wired to a minimal BusyBox userland that runs entirely
inside the browser sandbox; we don't control its argument-parsing rules.

## Known quirk: obsolete short flags

`head` and `tail` ship without support for the deprecated obsolete short
form `-N`. Typing

```sh
cat package.json | head -20
```

into the terminal yields:

```
head: -20: No such file or directory
```

The BusyBox `head` binary treats `-20` as a filename instead of a count.
**Use the POSIX form for portability:**

```sh
cat package.json | head -n 20
```

The same applies to `tail -N` (use `tail -n N`).

## Why we can't "just install bash"

WebContainer is not a Docker container — it is StackBlitz's proprietary
in-browser sandbox. There is no Alpine userland to `apk add bash` into,
and we cannot side-load arbitrary binaries. The shell that ships with
WebContainer is the shell we get.

## Programmatic commands get normalized

Commands the AI / agent sends through `BoltShell.executeCommand` are
pre-processed by `normalizeShellCommand` (`app/utils/shell-normalizer.ts`).
The normalizer rewrites the known broken forms to their POSIX equivalents
before forwarding to jsh, so AI-generated shell actions never trip over
this quirk. Interactive terminal input is **not** rewritten — buffering
keystrokes would break paste mode and TUI programs like vim.

If you find another jsh / BusyBox argument-parsing quirk that the agent
keeps tripping on, extend `normalizeShellCommand` rather than patching
individual callers.
