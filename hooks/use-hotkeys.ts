"use client";

import { useEffect, useRef } from "react";

// A binding is "mod+k", "shift+e", "?", "j", "enter", "escape", "mod+enter",
// or a two-key sequence like "g p". "mod" is ⌘ on macOS, Ctrl elsewhere.
export interface Hotkey {
  keys: string | string[];
  handler: (e: KeyboardEvent) => void;
  // Fire even while focus is in an input or textarea.
  allowInInput?: boolean;
  enabled?: boolean;
}

const SEQUENCE_TIMEOUT_MS = 900;

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

function matches(combo: string, e: KeyboardEvent) {
  const parts = combo.toLowerCase().split("+");
  const key = parts.pop()!;
  const mod = parts.includes("mod");
  const shift = parts.includes("shift");
  const alt = parts.includes("alt");
  if (mod !== (e.metaKey || e.ctrlKey)) return false;
  if (alt !== e.altKey) return false;
  const k = e.key.toLowerCase();
  // Symbols like "?" already imply shift, so only check it when the combo names it.
  if (key.length === 1 && !/[a-z0-9]/.test(key)) return k === key && (!shift || e.shiftKey);
  if (shift !== e.shiftKey) return false;
  return k === key || (key === "space" && k === " ");
}

export function useHotkeys(bindings: Hotkey[]) {
  const ref = useRef(bindings);
  ref.current = bindings;

  useEffect(() => {
    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing) return;
      const typing = isTyping(e.target);

      for (const b of ref.current) {
        if (b.enabled === false || (typing && !b.allowInInput)) continue;
        for (const combo of Array.isArray(b.keys) ? b.keys : [b.keys]) {
          // Leave Enter and Space to the focused button or link.
          if ((combo === "enter" || combo === "space") && (e.target as HTMLElement)?.closest?.("button, a, [role='button']")) {
            continue;
          }
          const steps = combo.split(" ");
          if (steps.length === 2) {
            if (pending === steps[0] && matches(steps[1], e)) {
              e.preventDefault();
              pending = null;
              b.handler(e);
              return;
            }
          } else if (matches(combo, e)) {
            e.preventDefault();
            pending = null;
            b.handler(e);
            return;
          }
        }
      }

      // Remember the first key of a possible sequence.
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
        pending = e.key.toLowerCase();
        clearTimeout(timer);
        timer = setTimeout(() => (pending = null), SEQUENCE_TIMEOUT_MS);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(timer);
    };
  }, []);
}
