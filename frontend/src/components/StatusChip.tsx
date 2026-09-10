import type { ReactNode } from "react";
import { TONE_CLASSES, type Tone } from "../status";

interface StatusChipProps {
  tone?: Tone;
  mono?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Flat, square-cornered status indicator. Verdict codes and raw values render
 * mono; word labels (e.g. tier names) pass mono={false}.
 */
export default function StatusChip({
  tone = "muted",
  mono = true,
  className = "",
  children,
}: StatusChipProps) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
        mono ? "font-mono" : ""
      } ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
