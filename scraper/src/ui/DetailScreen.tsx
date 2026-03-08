import React from "react";
import { Box, Text } from "ink";
import type { AppState } from "../types.js";
import { COOKIE_LIFETIME_MS } from "../config.js";
import { ProgressBar } from "./ProgressBar.js";

interface Props {
  state: AppState;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function cookieStatus(state: AppState): string {
  if (state.cookiesRefreshing) return "refreshing...";
  if (!state.cookiesHarvestedAt) return "not harvested";
  const remaining = COOKIE_LIFETIME_MS - (Date.now() - state.cookiesHarvestedAt);
  if (remaining <= 0) return "expired";
  return `fresh (${formatDuration(remaining)} remaining)`;
}

function eta(state: AppState): string {
  const elapsed = Date.now() - state.startedAt;
  const d = state.detail;
  if (d.completed <= 0) return "calculating...";
  const perItem = elapsed / d.completed;
  return formatDuration(perItem * (d.totalQueue - d.completed));
}

function rate(state: AppState): string {
  const elapsed = (Date.now() - state.startedAt) / 1000;
  if (elapsed <= 0) return "0.0";
  return (state.http.totalRequests / elapsed).toFixed(1);
}

export function DetailScreen({ state }: Props) {
  const d = state.detail;

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Box>
        <Text bold>Sainsbury's Scraper</Text>
        <Text color="gray">                                      [q] quit cleanly</Text>
      </Box>
      <Text> </Text>
      <Text>  Phase:    Detail (nutrition fetch)</Text>
      <Box paddingLeft={2}>
        <Text>Progress: </Text>
        <ProgressBar current={d.completed} total={d.totalQueue} />
      </Box>
      <Text>  Current:  "{d.currentSlug}"</Text>
      <Text> </Text>
      <Text>  Requests: {state.http.totalRequests} total | {state.http.errors} errors | {state.http.throttled} throttled</Text>
      <Text>  Rate:     {rate(state)} req/s | ETA: {eta(state)}</Text>
      <Text>  Cookies:  {cookieStatus(state)}</Text>
      <Text> </Text>
      <Text>  Parse:    {d.parseOk} ok | {d.parsePartial} partial | {d.parseFailed} failed | {d.parseNoTable} no table</Text>
      <Text>  Re-parsed: {d.reparsed} (from stored HTML)</Text>
      <Text>  New fails: {d.newFailsThisSession} this session</Text>
      <Text>  Error:    {state.http.lastError || "None"}</Text>
    </Box>
  );
}
