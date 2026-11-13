export const sessionChangeKey = "imajilearn-session-change";

export function apiPath(path, pathname = typeof window === "undefined" ? "" : window.location.pathname) {
  return `${pathname === "/app" || pathname.startsWith("/app/") ? "/app" : ""}/api/v1${path}`;
}

export function sessionLoginPath(pathname = window.location.pathname) {
  return pathname === "/app" || pathname.startsWith("/app/") ? "/app/masuk" : "/masuk";
}

export function announceSessionChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(sessionChangeKey));
  try {
    localStorage.setItem(sessionChangeKey, `${Date.now()}:${Math.random()}`);
  } catch {
    // Full navigation still revalidates this tab when storage is unavailable.
  }
}

export function navigateAfterSessionChange(path) {
  announceSessionChange();
  window.location.replace(path);
}
