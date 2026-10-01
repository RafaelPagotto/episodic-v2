import { getRedirectTypeFromError, getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { describe, expect, it } from "vitest";

import ProgressPage from "../app/(app)/progress/page";

describe("retired Progress route", () => {
  it("redirects legacy visits to Library using history replacement", () => {
    expect.assertions(3);
    try {
      ProgressPage();
    } catch (error) {
      expect(isRedirectError(error)).toBe(true);
      if (!isRedirectError(error)) throw error;
      expect(getURLFromRedirectError(error)).toBe("/library");
      expect(getRedirectTypeFromError(error)).toBe("replace");
    }
  });
});
