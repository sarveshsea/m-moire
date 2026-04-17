"use client"

import * as React from "react"
import { Button as ShadcnButton } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ButtonVariant = "default" | "primary" | "ghost"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  variant?: ButtonVariant
  loading?: boolean
  icon?: React.ReactNode
}

/**
 * Button — Vercel-style high-contrast action control.
 *
 * @purpose Sharp B&W action button with monospace-leaning label and electric blue focus ring.
 * @variants default (subtle), primary (solid), ghost
 * @props label, variant, loading, disabled, icon
 * @a11y role=button, aria-busy when loading, min-h-44 touch target.
 */
export function Button({
  label,
  variant = "default",
  loading = false,
  disabled,
  icon,
  className,
  ...props
}: ButtonProps) {
  const variantClasses: Record<ButtonVariant, string> = {
    default:
      "bg-[var(--color-background)] text-[var(--color-foreground)] border border-[var(--color-border)] hover:bg-[var(--color-muted)]",
    primary:
      "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90",
    ghost:
      "bg-transparent text-[var(--color-foreground)] hover:bg-[var(--color-muted)]",
  }

  return (
    <ShadcnButton
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 min-h-[44px] px-4",
        "rounded-[var(--radius-md)] text-sm font-medium tracking-tight",
        "font-[var(--font-mono,ui-monospace)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]",
        "disabled:opacity-50 disabled:cursor-not-allowed transition-colors motion-reduce:transition-none",
        variantClasses[variant],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={props["aria-label"] ?? label}
      {...props}
    >
      {loading ? (
        <span
          className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : (
        icon && <span aria-hidden="true">{icon}</span>
      )}
      <span>{loading ? "\u2026" : label}</span>
    </ShadcnButton>
  )
}
