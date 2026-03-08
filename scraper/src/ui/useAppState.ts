import { useState, useEffect } from "react";
import { stateEvents } from "../state.js";

/**
 * Hook that forces a re-render whenever the shared state emits 'update'.
 * The actual state is a plain mutable object — this just triggers React to re-read it.
 */
export function useAppState(): void {
  const [, setTick] = useState(0);

  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    stateEvents.on("update", handler);
    return () => {
      stateEvents.off("update", handler);
    };
  }, []);
}
