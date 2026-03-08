import React from "react";
import { Box, Text } from "ink";
import type { AppState } from "../types.js";

interface Props {
  state: AppState;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function SummaryScreen({ state }: Props) {
  const elapsed = Date.now() - state.startedAt;
  const d = state.discovery;
  const det = state.detail;
  const label = state.interrupted ? "stopped (progress saved)" : "complete";

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text bold>Sainsbury's Scraper — {label}</Text>
      <Text>  Discovery: {d.completedTerms}/{d.totalTerms} terms, {d.totalProducts.toLocaleString()} products ({d.foodProducts.toLocaleString()} food), {d.newProducts.toLocaleString()} new</Text>
      <Text>  Detail:    {det.completed.toLocaleString()} fetched, {det.newFailsThisSession} new failures</Text>
      <Text>  Parse:     {det.parseOk} ok | {det.parsePartial} partial | {det.parseFailed} failed | {det.parseNoTable} no table</Text>
      <Text>  Errors:    {state.http.errors} HTTP errors</Text>
      <Text>  Duration:  {formatDuration(elapsed)}</Text>
    </Box>
  );
}
