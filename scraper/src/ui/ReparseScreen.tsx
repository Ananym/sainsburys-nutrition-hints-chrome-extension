import React from "react";
import { Box, Text } from "ink";
import type { AppState } from "../types.js";
import { ProgressBar } from "./ProgressBar.js";

interface Props {
  state: AppState;
}

function speed(state: AppState): string {
  const elapsed = (Date.now() - state.startedAt) / 1000;
  if (elapsed <= 0) return "0";
  return `~${Math.round(state.reparse.completed / elapsed).toLocaleString()}/sec`;
}

export function ReparseScreen({ state }: Props) {
  const r = state.reparse;

  const diffOk = r.afterOk - r.beforeOk;
  const diffPartial = r.afterPartial - r.beforePartial;
  const diffFailed = r.afterFailed - r.beforeFailed;

  const fmt = (n: number) => (n >= 0 ? `+${n}` : String(n));

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Box>
        <Text bold>Sainsbury's Scraper</Text>
        <Text color="gray">                                      [q] quit cleanly</Text>
      </Box>
      <Text> </Text>
      <Text>  Phase:    Re-parse (offline, no API calls)</Text>
      <Box paddingLeft={2}>
        <Text>Progress: </Text>
        <ProgressBar current={r.completed} total={r.total} />
      </Box>
      <Text>  Speed:    {speed(state)}</Text>
      <Text> </Text>
      <Text>  Parse:    {r.afterOk} ok | {r.afterPartial} partial | {r.afterFailed} failed | {r.afterNoTable} no table</Text>
      <Text>  Was:      {r.beforeOk} ok | {r.beforePartial} partial | {r.beforeFailed} failed | {r.beforeNoTable} no table</Text>
      <Text>  Fixed:    {fmt(diffOk)} ok, {fmt(diffPartial)} partial, {fmt(diffFailed)} failed</Text>
      <Text> </Text>
      {r.lastFail && <Text>  Last fail: {r.lastFail}</Text>}
    </Box>
  );
}
