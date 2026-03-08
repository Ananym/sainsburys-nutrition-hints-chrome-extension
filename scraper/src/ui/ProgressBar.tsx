import React from "react";
import { Text } from "ink";

interface Props {
  current: number;
  total: number;
  width?: number;
}

export function ProgressBar({ current, total, width = 30 }: Props) {
  const pct = total > 0 ? Math.min(current / total, 1) : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;

  return (
    <Text>
      [
      <Text color="green">{"█".repeat(filled)}</Text>
      <Text color="gray">{"░".repeat(empty)}</Text>
      ] {current}/{total}
    </Text>
  );
}
