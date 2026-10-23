export function updateDiscoverHistory(method: "pushState" | "replaceState", href: string) {
  const state = { ...window.history.state };
  // Forwarding Next's internal flags bypasses its useSearchParams update.
  // The patched History API restores its own flags/tree from the current entry.
  delete state.__NA;
  delete state._N;
  delete state.__PRIVATE_NEXTJS_INTERNALS_TREE;
  window.history[method](state, "", href);
}
