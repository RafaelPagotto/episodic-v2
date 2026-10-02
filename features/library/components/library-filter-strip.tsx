"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function LibraryFilterStrip({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ overflow: false, left: false, right: false });

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const strip = stripRef.current;
    if (!wrapper || !strip) return;
    const update = () => setScroll({
      // Compare against the full wrapper so arrow controls disappear when all filters fit.
      overflow: strip.scrollWidth > wrapper.clientWidth + 1,
      left: strip.scrollLeft > 1,
      right: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1,
    });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(wrapper);
    observer.observe(strip);
    strip.addEventListener("scroll", update, { passive: true });
    return () => { observer.disconnect(); strip.removeEventListener("scroll", update); };
  }, []);

  function scrollFilters(direction: -1 | 1) {
    const strip = stripRef.current;
    if (strip) strip.scrollBy({ left: direction * Math.max(100, strip.clientWidth * 0.75), behavior: "auto" });
  }

  return (
    <div className="flex min-w-0 items-start gap-1 [@container_(min-width:70rem)]:flex-1" ref={wrapperRef}>
      {scroll.overflow ? <Button aria-controls="library-status-filters" aria-label="Scroll filters left" className="mt-1 shrink-0" disabled={!scroll.left} onClick={() => scrollFilters(-1)} size="icon" type="button" variant="outline"><ChevronLeft aria-hidden="true" className="size-4" /></Button> : null}
      <div aria-describedby="library-filters-help" aria-label="Library filters" className="filter-scroll-strip flex min-h-16 min-w-0 flex-1 items-start gap-1.5 overflow-x-auto overflow-y-hidden p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" id="library-status-filters" ref={stripRef} role="group" tabIndex={0}>
        {children}
      </div>
      {scroll.overflow ? <Button aria-controls="library-status-filters" aria-label="Scroll filters right" className="mt-1 shrink-0" disabled={!scroll.right} onClick={() => scrollFilters(1)} size="icon" type="button" variant="outline"><ChevronRight aria-hidden="true" className="size-4" /></Button> : null}
      <p className="sr-only" id="library-filters-help">Use the arrow buttons, drag the scrollbar, swipe, or focus the strip and use arrow keys to see all status filters.</p>
    </div>
  );
}
