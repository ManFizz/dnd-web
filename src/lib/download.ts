/** Saves data as a JSON file in the browser. */
export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/[\\/:*?"<>|]+/g, "_");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const CHARACTER_EXPORT_FORMAT = "dnd-web-character";

export function characterExport(doc: unknown) {
  return { format: CHARACTER_EXPORT_FORMAT, version: 1, exportedAt: new Date().toISOString(), doc };
}
