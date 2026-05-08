"use client";

import { useEffect, useState } from "react";

export function FreshnessIndicator({ generatedAt }: { generatedAt: number }) {
  const [age, setAge] = useState(() => Math.max(0, Math.round((Date.now() - generatedAt) / 1000)));
  useEffect(() => {
    const id = setInterval(() => {
      setAge(Math.max(0, Math.round((Date.now() - generatedAt) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [generatedAt]);

  let label: string;
  if (age < 60) label = `Updated ${age}s ago`;
  else if (age < 3600) label = `Updated ${Math.round(age / 60)}m ago`;
  else label = `Updated ${Math.round(age / 3600)}h ago`;

  return (
    <span className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
      {label}
    </span>
  );
}
