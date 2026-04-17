"use client"

import * as React from "react"
import { Input as ShadcnInput } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

/**
 * Input — a single-line text field with optional label and error message.
 *
 * @purpose Text input with accessible labelling and error state.
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
        <label htmlFor={inputId} className="text-sm font-medium text-[var(--color-foreground)]">
          {label}
        </label>
      )}
      <ShadcnInput
        id={inputId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={cn(
          "min-h-[44px] px-3 rounded-[var(--radius-md)]",
          "bg-[var(--color-background)] text-[var(--color-foreground)]",
          "border border-[var(--color-input)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2",
          error && "border-red-600 focus-visible:ring-red-600",
          className,
        )}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
})
