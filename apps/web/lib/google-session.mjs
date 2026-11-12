export function completeGoogleSession(location, history, announce) {
  const url = new URL(location.href);
  if (!["/beranda", "/dashboard"].includes(url.pathname) || url.searchParams.get("google") !== "signed_in") return;
  url.searchParams.delete("google");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  announce();
}
