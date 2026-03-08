import React from "react";
import { useInput } from "ink";
import type { AppState } from "../types.js";
import { useAppState } from "./useAppState.js";
import { DiscoveryScreen } from "./DiscoveryScreen.js";
import { DetailScreen } from "./DetailScreen.js";
import { ReparseScreen } from "./ReparseScreen.js";
import { SummaryScreen } from "./SummaryScreen.js";

interface Props {
  state: AppState;
}

export function App({ state }: Props) {
  useAppState();

  const isRawModeSupported =
    typeof process.stdin.setRawMode === "function";

  useInput(
    (input) => {
      if (input === "q") {
        state.abortRequested = true;
      }
    },
    { isActive: isRawModeSupported }
  );

  switch (state.phase) {
    case "discovery":
      return <DiscoveryScreen state={state} />;
    case "detail":
      return <DetailScreen state={state} />;
    case "reparse":
      return <ReparseScreen state={state} />;
    case "done":
    case "aborted":
      return <SummaryScreen state={state} />;
    default:
      return <DiscoveryScreen state={state} />;
  }
}
