"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type BadgeVariant = "default" | "muted" | "accent"

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: string
  variant?: BadgeVariant
}

/**
 * Badge — Linear-style pill label with indigo-violet accent.
 *
 * @purpose Fully-rounded compact status label.
 * @variants default, muted, accent (indigo-violet)
 * @props label, variant
 * @a11y role=status; announces updates politely.
 */
export function Badge({ label, variant = "default", className, ...props }: BadgeProps) {
  const variantClasses: Record<BadgeVariant, string> = {
    default:
      "bg-[var(--color-foreground)] text-[var(--color-background)]",
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
        "inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {label}
    </span>
  )
}
