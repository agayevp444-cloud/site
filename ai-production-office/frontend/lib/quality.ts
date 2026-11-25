/** Rendering quality. "?quality=low" (or localStorage office.quality=low) disables shadows and lamp lights for slower Macs. */
export function lowQuality(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("quality") ?? window.localStorage.getItem("office.quality");
    return q === "low";
  } catch {
    return false;
  }
}
