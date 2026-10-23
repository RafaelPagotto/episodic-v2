import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
import { DiscoverPagination } from "../features/discover/components/discover-pagination";

beforeEach(() => { (globalThis as typeof globalThis & { React: typeof React }).React = React; });

function controls(currentPage: number, lastPage: number, onPageChange = vi.fn()) {
  const tree = DiscoverPagination({ currentPage, lastPage, onPageChange });
  const children = React.Children.toArray(tree?.props.children).filter(React.isValidElement) as React.ReactElement<Record<string, unknown>>[];
  return new Map(children.filter((node) => node.props["aria-label"]).map((node) => [node.props["aria-label"], node.props]));
}

describe("Discover pagination", () => {
  it("labels first/last shortcuts and supplies hover helpers", () => {
    const buttons = controls(5, 10);
    expect([...buttons.keys()]).toEqual(["Go to first page", "Previous page", "Next page", "Go to last page"]);
    for (const [label, props] of buttons) expect(props).toMatchObject({ title: label, size: "icon", variant: "outline" });
  });
  it("disables backward controls on the first page and forward controls on the last", () => {
    const first = controls(1, 10);
    const last = controls(10, 10);
    for (const label of ["Go to first page", "Previous page"]) {
      expect(first.get(label)?.disabled).toBe(true);
      expect(last.get(label)?.disabled).toBe(false);
    }
    for (const label of ["Next page", "Go to last page"]) {
      expect(first.get(label)?.disabled).toBe(false);
      expect(last.get(label)?.disabled).toBe(true);
    }
  });
  it.each([10, 500])("jumps directly to first/last within the existing %i-page limit", (lastPage) => {
    const change = vi.fn();
    const buttons = controls(5, lastPage, change);
    for (const label of ["Go to first page", "Previous page", "Next page", "Go to last page"]) {
      (buttons.get(label)?.onClick as () => void)();
    }
    expect(change.mock.calls).toEqual([[1], [4], [6], [lastPage]]);
  });
  it("keeps recovery controls available for an empty deep page", () => {
    expect(controls(4, 0).get("Go to first page")?.disabled).toBe(false);
    expect(controls(4, 0).get("Go to last page")?.disabled).toBe(true);
    expect(controls(4, 2).get("Go to last page")?.disabled).toBe(false);
  });
  it("hides pagination when there is only one page or no results on page one", () => {
    const onPageChange = vi.fn();
    expect(DiscoverPagination({ currentPage: 1, lastPage: 1, onPageChange })).toBeNull();
    expect(DiscoverPagination({ currentPage: 1, lastPage: 0, onPageChange })).toBeNull();
  });
});
