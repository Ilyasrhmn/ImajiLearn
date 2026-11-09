export function completeGoogleSession(location, history, announce) {
  const url = new URL(location.href);
  if (url.pathname !== "/dashboard" || url.searchParams.get("google") !== "signed_in") return;
  url.searchParams.delete("google");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  announce();
}
