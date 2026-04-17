"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type BadgeVariant = "default" | "muted" | "accent"

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: string
  variant?: BadgeVariant
}

/**
 * Badge — Vercel-style compact label with monospace treatment.
 *
 * @purpose Tight uppercase mono status label.
 * @variants default, muted, accent (electric blue)
 * @props label, variant
 * @a11y role=status; announces updates politely.
 */
export function Badge({ label, variant = "default", className, ...props }: BadgeProps) {
  const variantClasses: Record<BadgeVariant, string> = {
    default:
      "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]",
    muted:
      "bg-[var(--color-muted)] text-[var(--color-muted-foreground)] border border-[var(--color-border)]",
    accent:
      "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]",
  }

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium",
        "font-[var(--font-mono,ui-monospace)] rounded-[var(--radius-sm)]",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {label}
    </span>
  )
}
