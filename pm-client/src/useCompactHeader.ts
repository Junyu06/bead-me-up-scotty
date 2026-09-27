import {
  useRef,
  useEffect,
  useState,
  type KeyboardEvent,
  type UIEvent,
  type WheelEvent,
} from "react";

/** Tracks scroll intent without taking over the board's scrolling or the map's pan/zoom. */
export function useCompactHeader(scope: string, enabled: boolean) {
  const [state, setState] = useState({ scope, compact: false });
  const container = useRef<HTMLElement>(null);
  const gesture = useRef({ amount: 0, time: 0 });
  const positions = useRef(new WeakMap<EventTarget, number>());
  const settlingUntil = useRef(0);
  if (state.scope !== scope) {
    setState({ scope, compact: false });
  }
  useEffect(() => {
    gesture.current = { amount: 0, time: 0 };
    positions.current = new WeakMap();
    settlingUntil.current = performance.now() + 320;
  }, [scope]);
  const compact = enabled && state.scope === scope && state.compact;

  function change(next: boolean) {
    if (!enabled || next === compact) return;
    // A search/edit control stays visible until the user leaves it.
    if (next) {
      const focused = container.current?.querySelector<HTMLElement>(
        "[data-header-details] :focus",
      );
      if (focused?.matches("input, textarea, select, [contenteditable=true]"))
        return;
      if (focused)
        container.current
          ?.querySelector<HTMLButtonElement>(".header-toggle")
          ?.focus({ preventScroll: true });
    }
    settlingUntil.current = performance.now() + 320;
    gesture.current.amount = 0;
    setState({ scope, compact: next });
  }
  function onWheelCapture(event: WheelEvent<HTMLElement>) {
    if (
      !enabled ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      Math.abs(event.deltaY) <= Math.abs(event.deltaX) ||
      (event.target as Element).closest(
        "input, textarea, select, [role=slider], [contenteditable=true]",
      )
    )
      return;
    const now = performance.now();
    if (now < settlingUntil.current) return;
    const delta =
      event.deltaY *
      (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
    if (
      now - gesture.current.time > 180 ||
      Math.sign(delta) !== Math.sign(gesture.current.amount)
    )
      gesture.current.amount = 0;
    gesture.current.time = now;
    gesture.current.amount += delta;
    if (gesture.current.amount > 36) change(true);
    if (gesture.current.amount < -72) change(false);
  }
  function onScrollCapture(event: UIEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    const before = positions.current.get(target) ?? 0;
    positions.current.set(target, target.scrollTop);
    // Scrollbars and keyboard scrolling also work; layout changes during the
    // animation must not immediately undo a manual expansion.
    if (
      performance.now() >= settlingUntil.current &&
      target.scrollTop > 24 &&
      target.scrollTop - before > 12
    )
      change(true);
    if (
      performance.now() >= settlingUntil.current &&
      before - target.scrollTop > 12
    )
      change(false);
  }
  function onKeyDownCapture(event: KeyboardEvent<HTMLElement>) {
    if (
      (event.target as Element).closest(
        "button, input, textarea, select, a, [contenteditable=true]",
      )
    )
      return;
    if (
      ["PageDown", "ArrowDown", "End", " "].includes(event.key) &&
      !event.shiftKey
    )
      change(true);
    if (
      ["PageUp", "ArrowUp", "Home"].includes(event.key) ||
      (event.key === " " && event.shiftKey)
    )
      change(false);
  }
  return {
    container,
    compact,
    toggle: () => change(!compact),
    onWheelCapture,
    onScrollCapture,
    onKeyDownCapture,
  };
}
