# Generation-pinned WAL byte materialization

`withVerifiedWalBytes` consumes a trusted scoped plan and one inventory entry.
The GCS adapter rejects generations above Number.MAX_SAFE_INTEGER because the
installed SDK converts generation strings to numbers internally. It never rounds
a generation. For supported generations it reads the exact object, disables transparent
decompression, and keeps SDK CRC32C validation enabled. The materializer also
checks the compressed byte count and canonical CRC32C against the inventory,
validates gzip through Node's decompressor, enforces the exact expected expanded
segment length, and records SHA256 digests for both representations.

The copy is isolated in a newly allocated private temporary directory with a
0600 output file. The trusted in-process inspector callback runs only after integrity checks pass.
The directory is removed on success, transfer error, decompression error,
cancellation, failed integrity checks and inspector failure. No caller-supplied
filesystem path is accepted. Copies never replace a database or live WAL file.

The current byte stage is intentionally limited to segments <=64 MiB, one at a
time, compressed size <=twice the segment size, and a shared 120-second cancellation deadline.
An optional AbortSignal cancels the pipeline and is composed with this deadline.
The trusted inspector receives that signal, must stop its work and settle on
cancellation, and may not retain the temporary path. The result is rejected if
cancellation occurs during inspection. This callback is not a sandbox and cannot
be forcibly stopped in-process: a noncooperating callback may retain the copy
until it settles. Cleanup never races an inspector still using the file.
No shell command, production resource, credential change or write to GCS occurs.

**This is not PostgreSQL physical recovery attestation.** Even arbitrary bytes
with valid gzip/CRC and the correct length pass transport checks. PostgreSQL
record checksums, page headers, system identifier, timeline history and actual
recovery replay must still be validated by a separate physical verifier.
`archiveVerified` and `walContinuityVerified` remain false, regardless of the
inspector's return value. The production 503 gate and coordinator wiring are
unchanged. A transport-integrity result cannot serve as an ArchiveReceipt.

Tests use synthetic in-memory gzip streams and disposable files only. They cover
wrong CRC, size mismatch, truncation, expansion above the bound, invalid scope,
noncanonical checksum, provider failure, cancellation, private permissions,
exact-generation SDK arguments and cleanup on inspector success/failure.
