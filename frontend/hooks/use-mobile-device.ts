"use client";

import { useEffect, useState } from "react";

type MobileDeviceState = {
  isMobileDevice: boolean;
  isPhoneLike: boolean;
  isTabletLike: boolean;
  isTouchDevice: boolean;
  hasCoarsePointer: boolean;
};

const getMobileDeviceState = (): MobileDeviceState => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      isMobileDevice: false,
      isPhoneLike: false,
      isTabletLike: false,
      isTouchDevice: false,
      hasCoarsePointer: false,
    };
  }

  const userAgent = navigator.userAgent || "";
  const platform = navigator.platform || "";

  // iPadOS can identify itself as a Mac in desktop-mode Safari.
  const isIPadOSDesktopMode =
    platform === "MacIntel" && navigator.maxTouchPoints > 1;

  const isIOSPhone = /iPhone|iPod/i.test(userAgent);
  const isIPad = /iPad/i.test(userAgent) || isIPadOSDesktopMode;
  const isAndroid = /Android/i.test(userAgent);
  const isAndroidPhone = isAndroid && /Mobile/i.test(userAgent);
  const isAndroidTablet = isAndroid && !/Mobile/i.test(userAgent);

  const hasCoarsePointer =
    window.matchMedia?.("(pointer: coarse)").matches ?? false;

  // Chrome Device Toolbar often emulates a coarse pointer/user-agent,
  // but maxTouchPoints can be 0 depending on the browser/settings.
  // For player UI decisions, coarse pointer is enough to behave like mobile.
  const isTouchDevice =
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    hasCoarsePointer;

  const uaLooksMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const isPhoneLike = isIOSPhone || isAndroidPhone || (uaLooksMobile && !isIPad);
  const isTabletLike = isIPad || isAndroidTablet;

  return {
    isMobileDevice: isPhoneLike || isTabletLike || hasCoarsePointer,
    isPhoneLike,
    isTabletLike,
    isTouchDevice,
    hasCoarsePointer,
  };
};

export function useMobileDevice() {
  const [state, setState] = useState<MobileDeviceState>(() => ({
    isMobileDevice: false,
    isPhoneLike: false,
    isTabletLike: false,
    isTouchDevice: false,
    hasCoarsePointer: false,
  }));

  useEffect(() => {
    const update = () => setState(getMobileDeviceState());
    const pointerQuery = window.matchMedia?.("(pointer: coarse)");

    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    pointerQuery?.addEventListener?.("change", update);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      pointerQuery?.removeEventListener?.("change", update);
    };
  }, []);

  return state;
}
