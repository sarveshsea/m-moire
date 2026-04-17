"use client"

import * as React from "react"
import { Input as ShadcnInput } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

/**
 * Input — Vercel-style text field with electric blue focus ring.
 *
 * @purpose Sharp-edged single-line text input.
 * @variants default, error
 * @props label, placeholder, value, error, type
 * @a11y aria-invalid and aria-describedby wired when error is present.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className, ...props },
  ref,
) {
  const autoId = React.useId()
  const inputId = id ?? autoId
  const errorId = error ? `${inputId}-error` : undefined

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium tracking-tight text-[var(--color-foreground)]">
          {label}
        </label>
      )}
      <ShadcnInput
        id={inputId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={cn(
          "min-h-[44px] px-3 rounded-[var(--radius-md)] text-sm",
          "bg-[var(--color-background)] text-[var(--color-foreground)]",
          "border border-[var(--color-input)] placeholder:text-[var(--color-muted-foreground)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]",
          error && "border-red-500 focus-visible:ring-red-500",
          className,
        )}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="text-[11px] text-red-500">
          {error}
        </p>
      )}
    </div>
  )
})
