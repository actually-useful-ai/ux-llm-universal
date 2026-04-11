import JSZip from "jszip";

/**
 * Download a media file via our server-side proxy to bypass CORS restrictions.
 * Falls back to direct download if proxy fails.
 */
export async function downloadMedia(
  url: string,
  filename: string
): Promise<void> {
  try {
    // Use our proxy endpoint
    const proxyUrl = `${import.meta.env.BASE_URL}api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Proxy returned ${response.status}`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    // Fallback: try opening in new tab
    try {
      window.open(url, "_blank");
    } catch {
      throw new Error("Failed to download file");
    }
  }
}

/**
 * Fetch a file as a blob via our server-side proxy.
 */
async function fetchAsBlob(url: string): Promise<Blob> {
  const proxyUrl = `${import.meta.env.BASE_URL}api/download?url=${encodeURIComponent(url)}&filename=file`;
  const response = await fetch(proxyUrl);
  if (!response.ok) throw new Error(`Proxy returned ${response.status}`);
  return response.blob();
}

/**
 * Download multiple files sequentially with a delay between each.
 */
export async function downloadAllMedia(
  items: Array<{ url: string; filename: string }>,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    await downloadMedia(items[i].url, items[i].filename);
    onProgress?.(i + 1, items.length);
    if (i < items.length - 1) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

/**
 * Download multiple files as a single ZIP archive.
 * Files are fetched via the server proxy and bundled client-side.
 */
export async function downloadAsZip(
  items: Array<{ url: string; filename: string }>,
  zipFilename: string = "export.zip",
  onProgress?: (done: number, total: number, currentFile: string) => void
): Promise<void> {
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(i, items.length, item.filename);

    try {
      const blob = await fetchAsBlob(item.url);

      // Deduplicate filenames
      let name = item.filename;
      if (usedNames.has(name)) {
        const ext = name.lastIndexOf(".");
        const base = ext > 0 ? name.slice(0, ext) : name;
        const suffix = ext > 0 ? name.slice(ext) : "";
        let counter = 2;
        while (usedNames.has(`${base}-${counter}${suffix}`)) counter++;
        name = `${base}-${counter}${suffix}`;
      }
      usedNames.add(name);

      zip.file(name, blob);
    } catch {
      console.warn(`Failed to fetch ${item.url} for zip, skipping`);
    }
  }

  onProgress?.(items.length, items.length, "Creating ZIP...");

  const content = await zip.generateAsync({ type: "blob" });

  const blobUrl = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}
