"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const FETCH_START_DELAY_MS = 120;
const MIN_VISIBLE_MS = 520;

const isInternalNavigationClick = (event: MouseEvent) => {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;

  const target = event.target as HTMLElement | null;
  const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor) return false;
  if (anchor.target && anchor.target !== "_self") return false;

  try {
    const nextUrl = new URL(anchor.href);
    return nextUrl.origin === window.location.origin && nextUrl.href !== window.location.href;
  } catch {
    return false;
  }
};

const isDifferentInternalPath = (url: string | URL | null | undefined) => {
  if (!url) return false;

  try {
    const nextUrl = new URL(url.toString(), window.location.href);
    return nextUrl.origin === window.location.origin && nextUrl.pathname !== window.location.pathname;
  } catch {
    return false;
  }
};

export function GlobalLoadingIndicator() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);
  const activeRequestsRef = useRef(0);
  const startTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const visibleSinceRef = useRef(0);
  const isVisibleRef = useRef(false);
  const hasMountedRef = useRef(false);

  const updateVisible = useCallback((nextVisible: boolean) => {
    isVisibleRef.current = nextVisible;
    setIsVisible(nextVisible);
  }, []);

  const clearStartTimer = useCallback(() => {
    if (startTimerRef.current === null) return;
    window.clearTimeout(startTimerRef.current);
    startTimerRef.current = null;
  }, []);

  const show = useCallback((immediate = false) => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (isVisibleRef.current || startTimerRef.current !== null) return;

    const reveal = () => {
      startTimerRef.current = null;
      visibleSinceRef.current = Date.now();
      updateVisible(true);
    };

    if (immediate) {
      clearStartTimer();
      reveal();
      return;
    }

    startTimerRef.current = window.setTimeout(reveal, FETCH_START_DELAY_MS);
  }, [clearStartTimer, updateVisible]);

  const hide = useCallback(() => {
    clearStartTimer();

    if (!isVisibleRef.current) return;

    const elapsed = Date.now() - visibleSinceRef.current;
    const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);

    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }

    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      updateVisible(false);
    }, delay);
  }, [clearStartTimer, updateVisible]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (isInternalNavigationClick(event)) {
        show(true);
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [show]);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    if (activeRequestsRef.current === 0) {
      hide();
    }
  }, [hide, pathname]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args) => {
      activeRequestsRef.current += 1;
      show();

      try {
        return await originalFetch(...args);
      } finally {
        activeRequestsRef.current = Math.max(0, activeRequestsRef.current - 1);
        if (activeRequestsRef.current === 0) {
          hide();
        }
      }
    };

    return () => {
      window.fetch = originalFetch;
      clearStartTimer();
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, [clearStartTimer, hide, show]);

  useEffect(() => {
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    const showAfterNavigationCommit = () => {
      window.setTimeout(() => show(true), 0);
    };

    window.history.pushState = function pushState(...args) {
      if (isDifferentInternalPath(args[2])) {
        showAfterNavigationCommit();
      }

      return originalPushState.apply(this, args);
    };

    window.history.replaceState = function replaceState(...args) {
      if (isDifferentInternalPath(args[2])) {
        showAfterNavigationCommit();
      }

      return originalReplaceState.apply(this, args);
    };

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, [show]);

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 top-0 z-[10000] transition-opacity duration-150 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      aria-live="polite"
      aria-hidden="true"
    >
      <div className="h-1.5 bg-primary/15">
        <div className="global-loading-bar h-full w-1/2 rounded-full bg-primary shadow-[0_0_18px_var(--primary)]" />
      </div>
    </div>
  );
}
