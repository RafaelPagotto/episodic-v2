"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

export function Turnstile() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("");
  const [failed, setFailed] = useState(false);
  const [compact, setCompact] = useState(false);
  const { pending } = useFormStatus();

  useEffect(() => {
    const element = container.current;
    if (!siteKey || !element) return;
    const measure = () => setCompact(element.clientWidth < 300);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [siteKey]);

  useEffect(() => {
    if (!ready || !siteKey || !container.current || !window.turnstile) return;
    const api = window.turnstile;
    setToken("");
    widget.current = api.render(container.current, {
      sitekey: siteKey, size: compact ? "compact" : "flexible", "response-field": false,
      callback: (value: string) => { setToken(value); setFailed(false); },
      "expired-callback": () => setToken(""),
      "error-callback": () => { setToken(""); setFailed(true); },
    });
    return () => { if (widget.current !== null) api.remove(widget.current); widget.current = null; };
  }, [ready, siteKey, compact]);

  useEffect(() => {
    if (pending && widget.current !== null) {
      setToken("");
      window.turnstile?.reset(widget.current);
    }
  }, [pending]);

  if (!siteKey) return null;
  return (
    <div className="min-w-0 [container-type:inline-size]">
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive"
        onLoad={() => setReady(true)} onReady={() => setReady(true)} onError={() => setFailed(true)} />
      <div ref={container} aria-label="Security check" className="min-h-16 [@container(max-width:299px)]:min-h-36" />
      <input name="captchaToken" type="hidden" value={token} />
      {failed ? <p role="alert" className="text-sm text-destructive">Security check unavailable. Reload and try again.</p> : null}
    </div>
  );
}
