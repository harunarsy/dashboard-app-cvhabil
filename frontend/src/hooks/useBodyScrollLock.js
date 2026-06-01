import { useEffect } from "react";

let lockCount = 0;
let originalOverflow = "";
let originalPaddingRight = "";

function getScrollbarWidth() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return 0;
  }
  return Math.max(
    0,
    window.innerWidth - document.documentElement.clientWidth,
  );
}

export default function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked || typeof document === "undefined") return undefined;

    const body = document.body;
    if (lockCount === 0) {
      originalOverflow = body.style.overflow;
      originalPaddingRight = body.style.paddingRight;
      const scrollbarWidth = getScrollbarWidth();
      if (scrollbarWidth > 0) {
        const currentPadding = parseFloat(
          window.getComputedStyle(body).paddingRight || "0",
        );
        body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
      }
      body.style.overflow = "hidden";
    }

    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        body.style.overflow = originalOverflow;
        body.style.paddingRight = originalPaddingRight;
      }
    };
  }, [locked]);
}
