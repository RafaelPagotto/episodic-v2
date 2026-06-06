export const CLEAR_WATCHED_HISTORY_CONFIRMATION = "CLEAR WATCHED HISTORY";
export const RESET_LIBRARY_CONFIRMATION = "RESET LIBRARY";
export const DELETE_ACCOUNT_FALLBACK_CONFIRMATION = "DELETE ACCOUNT";

function isConfirmationValid(confirmation: unknown, expected: string) {
  return typeof confirmation === "string" && confirmation === expected;
}

export function isClearWatchedHistoryConfirmationValid(confirmation: unknown) {
  return isConfirmationValid(confirmation, CLEAR_WATCHED_HISTORY_CONFIRMATION);
}

export function isResetLibraryConfirmationValid(confirmation: unknown) {
  return isConfirmationValid(confirmation, RESET_LIBRARY_CONFIRMATION);
}

export function getDeleteAccountConfirmationTarget(email: string | null | undefined) {
  // Auth users normally have an email; this stable fallback covers providers that do not supply one.
  return email || DELETE_ACCOUNT_FALLBACK_CONFIRMATION;
}

export function isDeleteAccountConfirmationValid(
  confirmation: unknown,
  email: string | null | undefined,
) {
  return isConfirmationValid(confirmation, getDeleteAccountConfirmationTarget(email));
}
