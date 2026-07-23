import * as React from "react";
import type { ReactElement, ReactNode } from "react";
import { Children, isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hookMocks = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  setState: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    useEffect: vi.fn((effect: () => void | (() => void)) => {
      hookMocks.effects.push(effect);
    }),
    useRef: vi.fn((initialValue: unknown) => ({ current: initialValue })),
    useState: vi.fn((initialValue: unknown) => [initialValue, hookMocks.setState]),
  };
});

vi.mock("@/lib/utils", () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));

import {
  ACTION_FEEDBACK_AUTO_DISMISS_MS,
  ActionFeedback,
} from "../components/ui/action-feedback";
import { Notice } from "../components/ui/notice";

function findElement(
  node: ReactNode,
  predicate: (element: ReactElement<Record<string, unknown>>) => boolean,
): ReactElement<Record<string, unknown>> | null {
  if (!isValidElement(node)) {
    if (Array.isArray(node)) {
      for (const child of node) {
        const match = findElement(child, predicate);

        if (match) {
          return match;
        }
      }
    }

    return null;
  }

  const element = node as ReactElement<Record<string, unknown>>;

  if (predicate(element)) {
    return element;
  }

  for (const child of Children.toArray(element.props.children as ReactNode)) {
    const match = findElement(child, predicate);

    if (match) {
      return match;
    }
  }

  return null;
}

describe("ActionFeedback", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    hookMocks.effects = [];
    hookMocks.setState.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dismisses successful feedback after the explicit timeout", () => {
    const feedbackKey = { message: "Show marked watched." };

    ActionFeedback({
      autoDismissMs: ACTION_FEEDBACK_AUTO_DISMISS_MS,
      children: feedbackKey.message,
      feedbackKey,
      tone: "success",
    });
    hookMocks.effects[0]();

    vi.advanceTimersByTime(4_999);
    expect(hookMocks.setState).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(hookMocks.setState).toHaveBeenCalledWith(feedbackKey);
  });

  it("keeps error feedback visible without an explicit timeout", () => {
    const feedbackKey = { message: "Unable to update progress." };

    ActionFeedback({
      children: feedbackKey.message,
      feedbackKey,
      tone: "error",
    });
    hookMocks.effects[0]();
    vi.advanceTimersByTime(30_000);

    expect(hookMocks.setState).not.toHaveBeenCalled();
  });

  it("clears the timer when the feedback component unmounts", () => {
    const feedbackKey = { message: "Metadata refreshed." };

    ActionFeedback({
      autoDismissMs: ACTION_FEEDBACK_AUTO_DISMISS_MS,
      children: feedbackKey.message,
      feedbackKey,
      tone: "success",
    });
    hookMocks.effects[0]();
    const cleanup = hookMocks.effects[1]();

    expect(cleanup).toBeTypeOf("function");
    (cleanup as () => void)();
    vi.advanceTimersByTime(ACTION_FEEDBACK_AUTO_DISMISS_MS);

    expect(hookMocks.setState).not.toHaveBeenCalled();
  });

  it("supports manual dismissal with an accessible close control", () => {
    const feedbackKey = { message: "Favourite updated." };
    const tree = ActionFeedback({
      children: feedbackKey.message,
      dismissible: true,
      feedbackKey,
      tone: "success",
    });
    const closeButton = findElement(
      tree,
      (element) => element.type === "button" && element.props["aria-label"] === "Dismiss notification",
    );

    expect(closeButton).not.toBeNull();
    (closeButton?.props.onClick as () => void)();
    expect(hookMocks.setState).toHaveBeenCalledWith(feedbackKey);
  });

  it("keeps generic informational notices persistent with appropriate roles", () => {
    const information = Notice({ children: "Dropped show", tone: "neutral" });
    const success = Notice({ children: "Saved", tone: "success" });
    const error = Notice({ children: "Unable to save", tone: "error" });

    expect(information.props.role).toBe("status");
    expect(success.props.role).toBe("status");
    expect(error.props.role).toBe("alert");
    expect(hookMocks.effects).toHaveLength(0);
  });
});
