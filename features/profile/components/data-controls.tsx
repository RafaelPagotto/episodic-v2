"use client";

import { Download, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
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

  return <Notice tone={state.status === "error" ? "error" : "success"}>{state.message}</Notice>;
}

function DeleteAccountButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="mt-4 gap-2" disabled={pending} type="submit" variant="destructive">
      <Trash2 className="size-4" />
      {pending ? "Deleting..." : "Delete account"}
    </Button>
  );
}

function getActionConfirmationPrompt(kind: ActionKind) {
  if (kind === "clear-watched") {
    return `Clear all watched episode history? This cannot be undone. Type "${CLEAR_WATCHED_HISTORY_CONFIRMATION}" to continue.`;
  }

  return `Reset your library data? This removes all shows and watched history. Type "${RESET_LIBRARY_CONFIRMATION}" to continue.`;
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
  const [pendingAction, setPendingAction] = useState<ActionKind | null>(null);
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

  function runDestructiveAction(
    kind: ActionKind,
    action: (confirmation: string) => Promise<ProfileDataControlState>,
  ) {
    const confirmation = window.prompt(getActionConfirmationPrompt(kind));

    if (confirmation === null) {
      return;
    }

    setPendingAction(kind);
    setDataActionState(INITIAL_PROFILE_DATA_CONTROL_STATE);

    startTransition(() => {
      void (async () => {
        try {
          const result = await action(confirmation);
          setDataActionState(result);

          if (result.status === "success") {
            router.refresh();
          }
        } catch {
          setDataActionState({
            message: "Unable to update your data right now.",
            status: "error",
          });
        } finally {
          setPendingAction(null);
        }
      })();
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

  function handleDeleteSubmit(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm("Delete your account and all associated data? This cannot be undone.")) {
      event.preventDefault();
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
          onClick={() => runDestructiveAction("clear-watched", clearWatchedHistoryAction)}
          type="button"
          variant="outline"
        >
          <Trash2 className="size-4" />
          {pendingAction === "clear-watched" ? "Clearing..." : "Clear watched"}
        </Button>
        <Button
          className="gap-2"
          disabled={hasPendingDataAction}
          onClick={() => runDestructiveAction("reset-library", resetLibraryDataAction)}
          type="button"
          variant="outline"
        >
          <Trash2 className="size-4" />
          {pendingAction === "reset-library" ? "Resetting..." : "Reset library"}
        </Button>
      </div>

      <form
        action={deleteFormAction}
        className="rounded-md border border-destructive/40 p-4"
        onSubmit={handleDeleteSubmit}
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
          className="mt-3 h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
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
