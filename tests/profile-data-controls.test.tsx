import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataControls } from "../features/profile/components/data-controls";
import type { ProfileDataControlState } from "../features/profile/data-control-state";

const hooks = vi.hoisted(() => ({
  index: 0,
  states: [] as unknown[],
  ref: { current: false },
  transitions: [] as Promise<void>[],
}));
const actions = vi.hoisted(() => ({
  clear: vi.fn(),
  reset: vi.fn(),
  delete: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("react", async () => ({
  ...await vi.importActual<typeof import("react")>("react"),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [hooks.states[index], (next: unknown) => { hooks.states[index] = next; }];
  },
  useRef: () => hooks.ref,
  useEffect: vi.fn(),
  useActionState: (action: unknown, initial: unknown) => [initial, action, false],
  useTransition: () => [false, (callback: () => Promise<void>) => {
    hooks.transitions.push(callback());
  }],
}));
vi.mock("react-dom", async () => ({
  ...await vi.importActual<typeof import("react-dom")>("react-dom"),
  useFormStatus: () => ({ pending: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: actions.refresh }) }));
vi.mock("@/features/profile/actions", () => ({
  clearWatchedHistoryAction: actions.clear,
  resetLibraryDataAction: actions.reset,
  deleteAccountAction: actions.delete,
}));
vi.mock("@/features/profile/confirmation", async () => vi.importActual("../features/profile/confirmation"));
vi.mock("@/features/profile/data-control-state", async () => vi.importActual("../features/profile/data-control-state"));
vi.mock("@/components/ui/action-feedback", () => ({
  ACTION_FEEDBACK_AUTO_DISMISS_MS: 3_000,
  ActionFeedback: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => {
    delete props.variant;
    return <button {...props}>{children}</button>;
  },
}));

type Element = React.ReactElement<{
  children?: React.ReactNode;
  id?: string;
  name?: string;
  disabled?: boolean;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
  onSubmit?: (event: { preventDefault: () => void }) => void;
  value?: string;
  type?: string;
}>;

function render() {
  hooks.index = 0;
  return DataControls({ deleteConfirmationTarget: "user@example.com" });
}

function elements(node: React.ReactNode): Element[] {
  return React.Children.toArray(node).flatMap((child) => {
    if (!React.isValidElement(child)) return [];
    const element = child as Element;
    return [element, ...elements(element.props.children)];
  });
}

function find(predicate: (element: Element) => boolean) {
  const element = elements(render()).find(predicate);
  if (!element) throw new Error("Expected control was not rendered");
  return element;
}

function open(kind: "clear" | "reset") {
  const buttons = elements(render()).filter((element) => element.props.onClick);
  buttons[kind === "clear" ? 1 : 2].props.onClick!();
}

function enter(value: string) {
  find((element) => element.props.id === "dataActionConfirmation").props.onChange!({ target: { value } });
}

function submit() {
  const event = { preventDefault: vi.fn() };
  find((element) => element.props.id === "data-action-confirmation").props.onSubmit!(event);
  expect(event.preventDefault).toHaveBeenCalled();
}

async function settle() {
  await Promise.all(hooks.transitions.splice(0));
}

describe("profile data-control confirmation UI", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    vi.stubGlobal("window", {
      prompt: vi.fn(() => { throw new Error("prompt() is not supported."); }),
      confirm: vi.fn(() => { throw new Error("confirm() is not supported."); }),
    });
    hooks.index = 0;
    hooks.states = [];
    hooks.ref.current = false;
    hooks.transitions = [];
    vi.clearAllMocks();
    actions.clear.mockResolvedValue({ message: "Watched history cleared.", status: "success" });
    actions.reset.mockResolvedValue({ message: "Library data reset.", status: "success" });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["clear", "CLEAR WATCHED HISTORY"],
    ["reset", "RESET LIBRARY"],
  ] as const)("requires exact typed confirmation before %s can run", async (kind, phrase) => {
    open(kind);
    expect(actions.clear).not.toHaveBeenCalled();
    expect(actions.reset).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(render())).toContain(phrase);
    for (const invalid of ["", phrase.toLowerCase(), ` ${phrase} `]) {
      enter(invalid);
      expect(find((element) => element.props.type === "submit" && element.props.children === "Confirm").props.disabled).toBe(true);
      submit();
    }
    expect(actions[kind]).not.toHaveBeenCalled();
    enter(phrase);
    submit();
    await settle();
    expect(actions[kind]).toHaveBeenCalledOnce();
    expect(actions[kind]).toHaveBeenCalledWith(phrase);
    expect(actions[kind === "clear" ? "reset" : "clear"]).not.toHaveBeenCalled();
    expect(actions.refresh).toHaveBeenCalledOnce();
    expect(elements(render()).some((element) => element.props.id === "data-action-confirmation")).toBe(false);
    expect(window.prompt).not.toHaveBeenCalled();
  });

  it("cancels without mutation and resets typed text when switching or reopening", () => {
    open("clear");
    enter("CLEAR WATCHED HISTORY");
    open("reset");
    expect(find((element) => element.props.id === "dataActionConfirmation").props.value).toBe("");
    enter("RESET LIBRARY");
    find((element) => element.props.children === "Cancel").props.onClick!();
    expect(elements(render()).some((element) => element.props.id === "data-action-confirmation")).toBe(false);
    open("reset");
    expect(find((element) => element.props.id === "dataActionConfirmation").props.value).toBe("");
    expect(actions.clear).not.toHaveBeenCalled();
    expect(actions.reset).not.toHaveBeenCalled();
  });

  it("blocks repeated submission and disables controls while the request is pending", async () => {
    let resolve!: (state: ProfileDataControlState) => void;
    actions.clear.mockReturnValue(new Promise<ProfileDataControlState>((done) => { resolve = done; }));
    open("clear");
    enter("CLEAR WATCHED HISTORY");
    const form = find((element) => element.props.id === "data-action-confirmation");
    form.props.onSubmit!({ preventDefault: vi.fn() });
    form.props.onSubmit!({ preventDefault: vi.fn() });
    expect(actions.clear).toHaveBeenCalledOnce();
    expect(find((element) => element.props.id === "dataActionConfirmation").props.disabled).toBe(true);
    expect(find((element) => element.props.children === "Cancel").props.disabled).toBe(true);
    open("reset");
    expect(renderToStaticMarkup(render())).toContain("CLEAR WATCHED HISTORY");
    resolve({ message: "Done", status: "success" });
    await settle();
  });

  it.each(["returned", "thrown"])("keeps confirmation available for retry after a %s error", async (mode) => {
    if (mode === "returned") {
      actions.reset.mockResolvedValueOnce({ message: "Reset failed.", status: "error" });
    } else {
      actions.reset.mockRejectedValueOnce(new Error("Network failed"));
    }
    open("reset");
    enter("RESET LIBRARY");
    submit();
    await settle();
    expect(actions.refresh).not.toHaveBeenCalled();
    expect(find((element) => element.props.id === "dataActionConfirmation").props.disabled).toBe(false);
    expect(renderToStaticMarkup(render())).toContain(mode === "returned" ? "Reset failed." : "Unable to update your data right now.");
    submit();
    await settle();
    expect(actions.reset).toHaveBeenCalledTimes(2);
    expect(actions.refresh).toHaveBeenCalledOnce();
  });

  it("uses a required account deletion acknowledgement instead of a native confirm", () => {
    const form = find((element) => element.type === "form" && !element.props.id);
    expect(form.props.onSubmit).toBeUndefined();
    const markup = renderToStaticMarkup(render());
    expect(markup).toContain("user@example.com");
    const acknowledgement = markup.match(/<input[^>]*name="deleteAcknowledgement"[^>]*>/)?.[0];
    expect(acknowledgement).toContain('required=""');
    expect(acknowledgement).toContain('type="checkbox"');
    expect(window.confirm).not.toHaveBeenCalled();
  });
});
