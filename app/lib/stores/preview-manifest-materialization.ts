/** Read-only precondition. Repair/retry belongs to the existing synchronization path. */
export async function requireMaterializedPreviewManifest(
  readManifest: () => Promise<unknown>,
  message: string,
): Promise<void> {
  try {
    await readManifest();
  } catch (cause) {
    throw Object.assign(new Error(message), { code: 'PREVIEW_MANIFEST_UNVERIFIED', cause });
  }
}
