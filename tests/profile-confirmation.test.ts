import { describe, expect, it } from "vitest";

import {
  CLEAR_WATCHED_HISTORY_CONFIRMATION,
  DELETE_ACCOUNT_FALLBACK_CONFIRMATION,
  getDeleteAccountConfirmationTarget,
  isClearWatchedHistoryConfirmationValid,
  isDeleteAccountConfirmationValid,
  isResetLibraryConfirmationValid,
  RESET_LIBRARY_CONFIRMATION,
} from "../features/profile/confirmation";

describe("profile data-control confirmation", () => {
  it("requires exact explicit phrases for watched history and library reset", () => {
    expect(isClearWatchedHistoryConfirmationValid(CLEAR_WATCHED_HISTORY_CONFIRMATION)).toBe(true);
    expect(isClearWatchedHistoryConfirmationValid("clear watched history")).toBe(false);
    expect(isClearWatchedHistoryConfirmationValid(` ${CLEAR_WATCHED_HISTORY_CONFIRMATION} `)).toBe(
      false,
    );
    expect(isClearWatchedHistoryConfirmationValid(undefined)).toBe(false);

    expect(isResetLibraryConfirmationValid(RESET_LIBRARY_CONFIRMATION)).toBe(true);
    expect(isResetLibraryConfirmationValid("RESET LIBRARY DATA")).toBe(false);
    expect(isResetLibraryConfirmationValid(` ${RESET_LIBRARY_CONFIRMATION} `)).toBe(false);
    expect(isResetLibraryConfirmationValid(null)).toBe(false);
  });

  it("requires the user's email exactly for account deletion", () => {
    expect(getDeleteAccountConfirmationTarget("user@example.com")).toBe("user@example.com");
    expect(isDeleteAccountConfirmationValid("user@example.com", "user@example.com")).toBe(true);
    expect(isDeleteAccountConfirmationValid("USER@example.com", "user@example.com")).toBe(false);
    expect(isDeleteAccountConfirmationValid(" user@example.com ", "user@example.com")).toBe(false);
    expect(isDeleteAccountConfirmationValid(null, "user@example.com")).toBe(false);
  });

  it("falls back to an explicit stable phrase when no email is available", () => {
    expect(getDeleteAccountConfirmationTarget(null)).toBe(DELETE_ACCOUNT_FALLBACK_CONFIRMATION);
    expect(isDeleteAccountConfirmationValid(DELETE_ACCOUNT_FALLBACK_CONFIRMATION, null)).toBe(true);
    expect(isDeleteAccountConfirmationValid("DELETE", null)).toBe(false);
  });
});
