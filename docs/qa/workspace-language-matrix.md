# Workspace agent language matrix

From a checkout with frozen pnpm dependencies installed, run the command below on Linux x86-64 with Docker and the runsc runtime. Supply directories containing the extracted Linux Go distribution and Rust toolchain (including the standard library). The test ran with Go 1.24.12 and Rust 1.85.1. Python and Node come from the pinned Debian test image.

```sh
scripts/qa/workspace-language-matrix.sh /path/to/go /path/to/rust-toolchain
```

Each case starts a loopback agent and creates a separate temporary workspace. It sends the source through authenticated HTTP to `/files/write`, then executes the project through `/commands/run`. Passing requires HTTP 200, exit code zero and stdout exactly `42\n`. Any failed case makes the script exit nonzero. The container has external networking disabled and a fresh temporary Go build cache.

Observed at base `517e7208dcaf204381178d8c329ba16cf19ed3a7` under gVisor. Agent startup measures construction through HTTP listen. Run time measures the HTTP command request through completion and includes compilation. These are single observations, excluding image pulls and container startup.

| Project | Agent ready (ms) | Run (ms) | Exit | stdout |
| --- | ---: | ---: | ---: | --- |
| Python | 828 | 196 | 0 | 42 |
| Node | 19 | 423 | 0 | 42 |
| Go | 34 | 13328 | 0 | 42 |
| Rust | 11 | 443 | 0 | 42 |

The stock executor had a different program named `go` and lacked `rustc`. Mounting the two toolchains explicitly resolved both failures. The workspace-agent Alpine image build stopped at its first package installation because both Alpine v3.24 index requests returned HTTP 403. The signed Nix catalog and store were absent. Image packaging, Nix activation, Kubernetes provisioning and the IDE Run button therefore remain unverified by this matrix.
