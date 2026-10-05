"use client";

import { Download, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import {
  ACTION_FEEDBACK_AUTO_DISMISS_MS,
  ActionFeedback,
} from "@/components/ui/action-feedback";
import { Button } from "@/components/ui/button";
import {
  clearWatchedHistoryAction,
  deleteAccountAction,
  resetLibraryDataAction,
} from "@/features/profile/actions";
import {
  CLEAR_WATCHED_HISTORY_CONFIRMATION,
  RESET_LIBRARY_CONFIRMATION,
} from "@/features/profile/confirmation";
import {
  INITIAL_PROFILE_DATA_CONTROL_STATE,
  type ProfileDataControlState,
} from "@/features/profile/data-control-state";

type DataControlsProps = {
  deleteConfirmationTarget: string;
};

type ActionKind = "clear-watched" | "reset-library";

type ExportErrorResponse = {
  error?: {
    message?: string;
  };
};

function ActionMessage({ state }: { state: ProfileDataControlState }) {
  if (!state.message) {
    return null;
  }

  return (
    <ActionFeedback
      autoDismissMs={
        state.status === "success" && !state.redirectTo
          ? ACTION_FEEDBACK_AUTO_DISMISS_MS
          : undefined
      }
      dismissible
      feedbackKey={state}
      presentation="toast"
      tone={state.status === "error" ? "error" : "success"}
    >
      {state.message}
    </ActionFeedback>
  );
}

function DeleteAccountButton() {
  const { pending } = useFormStatus();

  return (
    <fieldset className="mt-4" disabled={pending}>
      <label className="flex items-start gap-2 text-sm">
        <input className="mt-1" name="deleteAcknowledgement" required type="checkbox" />
        <span>I understand that my account and all associated data will be permanently deleted.</span>
      </label>
      <Button className="mt-4 gap-2" disabled={pending} type="submit" variant="destructive">
        <Trash2 className="size-4" />
        {pending ? "Deleting..." : "Delete account"}
      </Button>
    </fieldset>
  );
}

function getActionConfirmationTarget(kind: ActionKind) {
  return kind === "clear-watched"
    ? CLEAR_WATCHED_HISTORY_CONFIRMATION
    : RESET_LIBRARY_CONFIRMATION;
}

export function DataControls({ deleteConfirmationTarget }: DataControlsProps) {
  const router = useRouter();
  const [dataActionState, setDataActionState] = useState<ProfileDataControlState>(
    INITIAL_PROFILE_DATA_CONTROL_STATE,
  );
  const [deleteState, deleteFormAction] = useActionState(
    deleteAccountAction,
    INITIAL_PROFILE_DATA_CONTROL_STATE,
  );
  const [isExporting, setIsExporting] = useState(false);
  const [confirmationAction, setConfirmationAction] = useState<ActionKind | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [pendingAction, setPendingAction] = useState<ActionKind | null>(null);
  const actionInFlight = useRef(false);
  const [isPending, startTransition] = useTransition();
  const hasPendingDataAction = pendingAction !== null || isPending;

  useEffect(() => {
    if (deleteState.status === "success" && deleteState.redirectTo) {
      const timeoutId = window.setTimeout(() => {
        window.location.assign(deleteState.redirectTo ?? "/sign-in");
      }, 900);

      return () => window.clearTimeout(timeoutId);
    }

    return undefined;
  }, [deleteState]);

  function openConfirmation(kind: ActionKind) {
    if (actionInFlight.current) {
      return;
    }

    setConfirmation("");
    setConfirmationAction(kind);
    setDataActionState(INITIAL_PROFILE_DATA_CONTROL_STATE);
  }

  function handleConfirmationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !confirmationAction
      || actionInFlight.current
      || confirmation !== getActionConfirmationTarget(confirmationAction)
    ) {
      return;
    }

    const kind = confirmationAction;
    const action = kind === "clear-watched" ? clearWatchedHistoryAction : resetLibraryDataAction;
    actionInFlight.current = true;
    setPendingAction(kind);
    setDataActionState(INITIAL_PROFILE_DATA_CONTROL_STATE);

    startTransition(async () => {
      try {
        const result = await action(confirmation);
        setDataActionState(result);

        if (result.status === "success") {
          setConfirmationAction(null);
          setConfirmation("");
          router.refresh();
        }
      } catch {
        setDataActionState({
          message: "Unable to update your data right now.",
          status: "error",
        });
      } finally {
        actionInFlight.current = false;
        setPendingAction(null);
      }
    });
  }

  async function readExportError(response: Response) {
    try {
      const body = (await response.json()) as ExportErrorResponse;
      return body.error?.message || "Unable to export your data.";
    } catch {
      return "Unable to export your data.";
    }
  }

  async function handleExportData() {
    setIsExporting(true);
    setDataActionState(INITIAL_PROFILE_DATA_CONTROL_STATE);

    try {
      const response = await fetch("/api/profile/export");

      if (!response.ok) {
        throw new Error(await readExportError(response));
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const exportedDate = new Date().toISOString().slice(0, 10);

      link.href = objectUrl;
      link.download = `episodic-export-${exportedDate}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
      setDataActionState({
        message: "Data export downloaded.",
        status: "success",
      });
    } catch (error) {
      setDataActionState({
        message: error instanceof Error ? error.message : "Unable to export your data.",
        status: "error",
      });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="grid gap-5">
      <ActionMessage state={dataActionState} />
      <ActionMessage state={deleteState} />

      <div className="grid gap-3 md:grid-cols-3">
        <Button
          className="gap-2"
          disabled={isExporting || hasPendingDataAction}
          onClick={handleExportData}
          type="button"
        >
          <Download className="size-4" />
          {isExporting ? "Exporting..." : "Export JSON"}
        </Button>
        <Button
          className="gap-2"
          disabled={hasPendingDataAction}
          aria-controls="data-action-confirmation"
          aria-expanded={confirmationAction === "clear-watched"}
          onClick={() => openConfirmation("clear-watched")}
          type="button"
          variant="outline"
        >
          <Trash2 className="size-4" />
          {pendingAction === "clear-watched" ? "Clearing..." : "Clear watched"}
        </Button>
        <Button
          className="gap-2"
          disabled={hasPendingDataAction}
          aria-controls="data-action-confirmation"
          aria-expanded={confirmationAction === "reset-library"}
          onClick={() => openConfirmation("reset-library")}
          type="button"
          variant="outline"
        >
          <Trash2 className="size-4" />
          {pendingAction === "reset-library" ? "Resetting..." : "Reset library"}
        </Button>
      </div>

      {confirmationAction && (
        <form
          aria-labelledby="data-action-confirmation-title"
          aria-busy={hasPendingDataAction}
          className="rounded-md border border-destructive/40 p-4"
          id="data-action-confirmation"
          onSubmit={handleConfirmationSubmit}
        >
          <h3 className="text-sm font-medium" id="data-action-confirmation-title">
            {confirmationAction === "clear-watched" ? "Clear watched history" : "Reset library data"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground" id="data-action-confirmation-description">
            {confirmationAction === "clear-watched"
              ? "This clears all watched episode history."
              : "This removes all shows and watched history."}
            {" "}This cannot be undone.
          </p>
          <label className="mt-3 block text-sm" htmlFor="dataActionConfirmation">
            Type <strong>{getActionConfirmationTarget(confirmationAction)}</strong> exactly to continue.
          </label>
          <input
            aria-describedby="data-action-confirmation-description"
            autoComplete="off"
            autoFocus
            className="mt-2 h-11 w-full rounded-md border bg-background px-3 py-2 text-base sm:text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
            disabled={hasPendingDataAction}
            id="dataActionConfirmation"
            onChange={(event) => setConfirmation(event.target.value)}
            required
            type="text"
            value={confirmation}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={hasPendingDataAction || confirmation !== getActionConfirmationTarget(confirmationAction)}
              type="submit"
              variant="destructive"
            >
              {pendingAction === "clear-watched"
                ? "Clearing..."
                : pendingAction === "reset-library"
                  ? "Resetting..."
                  : "Confirm"}
            </Button>
            <Button
              disabled={hasPendingDataAction}
              onClick={() => {
                setConfirmationAction(null);
                setConfirmation("");
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <form
        action={deleteFormAction}
        className="rounded-md border border-destructive/40 p-4"
      >
        <label className="block text-sm font-medium text-destructive" htmlFor="deleteConfirmation">
          Delete account
        </label>
        <p className="mt-1 text-sm text-muted-foreground">
          Type <strong>{deleteConfirmationTarget}</strong> exactly to permanently delete your
          account.
        </p>
        <input
          autoComplete="off"
          className="mt-3 h-11 w-full rounded-md border bg-background px-3 py-2 text-base sm:text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          id="deleteConfirmation"
          name="deleteConfirmation"
          placeholder={deleteConfirmationTarget}
          required
          type="text"
        />
        <DeleteAccountButton />
      </form>
    </div>
  );
}
