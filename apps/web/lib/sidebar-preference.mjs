const key = "imajilearn:sidebar";
const listeners = new Set();
let collapsed;

export function sidebarSnapshot() {
  if (collapsed === undefined) {
    let saved;
    try { saved = window.localStorage.getItem(key); } catch {}
    collapsed = saved === "collapsed" || (saved !== "expanded" && window.matchMedia("(max-width: 760px)").matches);
  }
  return collapsed;
}

export const sidebarServerSnapshot = () => false;

export function subscribeSidebar(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSidebarCollapsed(value) {
  collapsed = value;
  try { window.localStorage.setItem(key, value ? "collapsed" : "expanded"); } catch {}
  for (const listener of listeners) listener();
}

export const toggleSidebar = () => setSidebarCollapsed(!sidebarSnapshot());
