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
 * Button — Linear-style crisp editorial action control.
 *
 * @purpose Indigo-violet primary on warm-white, geometric spacing.
 * @variants default, primary, ghost
 * @props label, variant, loading, disabled, icon
 * @a11y role=button, aria-busy when loading, 44px min touch target.
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
      "bg-[var(--color-card)] text-[var(--color-foreground)] border border-[var(--color-border)] hover:bg-[var(--color-muted)] shadow-[var(--shadow-sm)]",
    primary:
      "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90 shadow-[var(--shadow-sm)]",
    ghost:
      "bg-transparent text-[var(--color-foreground)] hover:bg-[var(--color-muted)]",
  }

  return (
    <ShadcnButton
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 min-h-[44px] px-5",
        "rounded-[var(--radius-md)] text-sm font-medium tracking-[-0.01em]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]",
        "disabled:opacity-50 disabled:cursor-not-allowed transition-all motion-reduce:transition-none",
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
      <span>{loading ? "Loading\u2026" : label}</span>
    </ShadcnButton>
  )
}
