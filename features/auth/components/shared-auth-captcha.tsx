"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

import type { AuthFormState } from "../state";
import { Turnstile } from "./turnstile";

type AuthAction = (state: AuthFormState, formData: FormData) => Promise<AuthFormState>;

type SharedCaptchaState = {
  token: string;
  pending: boolean;
  resetKey: number;
  onTokenChange: (token: string) => void;
  submit: (action: AuthAction, state: AuthFormState, formData: FormData) => Promise<AuthFormState>;
};

const SharedCaptchaContext = createContext<SharedCaptchaState | null>(null);

export function SharedAuthCaptcha({ children }: { children: ReactNode }) {
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const tokenRef = useRef("");
  const inFlight = useRef(false);

  const onTokenChange = useCallback((value: string) => {
    if (inFlight.current) return;
    tokenRef.current = value;
    setToken(value);
  }, []);

  const submit = useCallback(async (action: AuthAction, state: AuthFormState, formData: FormData) => {
    // The ref reserves this single-use token before either form can submit again.
    if (inFlight.current) return { status: "error", message: "A request is already in progress. Try again shortly." } satisfies AuthFormState;
    if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !tokenRef.current) {
      return { status: "error", message: "Complete the security check and try again." } satisfies AuthFormState;
    }
    inFlight.current = true;
    formData.set("captchaToken", tokenRef.current);
    tokenRef.current = "";
    // Async Action transitions defer normal updates until completion; lock both forms now.
    flushSync(() => {
      setToken("");
      setPending(true);
    });
    try {
      return await action(state, formData);
    } finally {
      inFlight.current = false;
      setPending(false);
      setResetKey((value) => value + 1);
    }
  }, []);

  return (
    <SharedCaptchaContext.Provider value={{ token, pending, resetKey, onTokenChange, submit }}>
      {children}
    </SharedCaptchaContext.Provider>
  );
}

export function useSharedCaptchaAction(action: AuthAction) {
  const shared = useContext(SharedCaptchaContext);
  return {
    action: shared ? (state: AuthFormState, formData: FormData) => shared.submit(action, state, formData) : action,
    disabled: shared?.pending ?? false,
  };
}

export function AuthCaptcha({ showSharedWidget = true }: { showSharedWidget?: boolean }) {
  const shared = useContext(SharedCaptchaContext);
  if (!shared) return <Turnstile />;
  return (
    <>
      {showSharedWidget ? <Turnstile onTokenChange={shared.onTokenChange} resetKey={shared.resetKey} /> : null}
      <input name="captchaToken" type="hidden" value={shared.token} />
    </>
  );
}
