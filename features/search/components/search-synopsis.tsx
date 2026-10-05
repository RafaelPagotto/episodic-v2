"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function SearchSynopsis({ text, showTitle }: { text: string; showTitle: string }) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = textRef.current;
    if (!element) return;
    let frame = 0;
    let active = true;
    function measure() {
      if (!active) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!active || !element) return;
        const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
        const overflows = element.scrollHeight > lineHeight * 3 + 1;
        setCanExpand(overflows);
        if (!overflows) setExpanded(false);
      });
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    void document.fonts?.ready.then(measure);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [text, canExpand]);

  const content = (
    <span ref={textRef} className={cn("break-words", expanded ? "block" : "line-clamp-3")}>
      {text}
    </span>
  );

  return (
    <p className="min-w-0 text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-6">
      {canExpand ? (
        <button
          aria-expanded={expanded}
          className="block w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setExpanded((current) => !current)}
          title={`${expanded ? "Collapse" : "Expand"} synopsis for ${showTitle}`}
          type="button"
        >
          {content}
        </button>
      ) : content}
    </p>
  );
}
