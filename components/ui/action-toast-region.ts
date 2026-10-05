// A shared overlay lets independently mounted action messages stack without
// becoming children of a card or a CSS container that constrains fixed elements.
let region: { element: HTMLDivElement; users: number } | null = null;

export function acquireActionToastRegion() {
  if (!region) {
    const element = document.createElement("div");
    element.className = "pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex max-h-[calc(100dvh-2rem)] flex-col items-center gap-3 overflow-y-auto";
    element.setAttribute("data-action-toasts", "");
    document.body.appendChild(element);
    region = { element, users: 0 };
  }

  const current = region;
  current.users += 1;

  return {
    element: current.element,
    release() {
      current.users -= 1;
      if (current.users === 0) {
        current.element.remove();
        if (region === current) region = null;
      }
    },
  };
}
