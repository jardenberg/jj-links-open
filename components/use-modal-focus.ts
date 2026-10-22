import { useEffect, useRef, type RefObject } from "react";

export function useModalFocus(ref: RefObject<HTMLElement | null>, close: () => void, locked: boolean) {
  const latest = useRef({ close, locked });
  useEffect(() => { latest.current = { close, locked }; }, [close, locked]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const container = ref.current;
    const selector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';
    (container?.querySelector<HTMLElement>(selector) ?? container)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !latest.current.locked) { event.preventDefault(); latest.current.close(); }
      if (event.key !== "Tab" || !container) return;
      const elements = [...container.querySelectorAll<HTMLElement>(selector)].filter((element) => element.getClientRects().length);
      const first = elements[0], last = elements.at(-1);
      if (!first) { event.preventDefault(); container.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) { event.preventDefault(); last!.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [ref]);
}
