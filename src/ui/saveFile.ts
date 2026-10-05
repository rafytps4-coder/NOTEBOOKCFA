/** Hand a file to the user: native save dialog where available, otherwise a normal download. */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const w = window as unknown as {
    showSaveFilePicker?: (o: { suggestedName: string }) => Promise<{
      createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }>;
    }>;
  };
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName: filename });
      const stream = await handle.createWritable();
      await stream.write(blob);
      await stream.close();
      return;
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return; // user cancelled
      // Any other failure: fall back to a regular download below.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function safeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'notebook';
}
