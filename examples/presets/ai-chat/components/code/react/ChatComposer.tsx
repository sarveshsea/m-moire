"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "./Button"
import { Input } from "./Input"

export interface ChatComposerProps extends React.FormHTMLAttributes<HTMLFormElement> {
  placeholder?: string
  sendLabel?: string
  attachmentHint?: string
  disabled?: boolean
}

/**
 * ChatComposer - prompt input and send action.
 *
 * @purpose Accessible composer for AI chat products.
 * @variants default, compact
 * @props placeholder, sendLabel, attachmentHint, disabled
 */
export function ChatComposer({
  placeholder = "Ask the assistant...",
  sendLabel = "Send",
  attachmentHint = "Shift + Enter for a new line",
  disabled,
  className,
  ...props
}: ChatComposerProps) {
  return (
    <form
      aria-label="AI chat composer"
      className={cn(
        "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-[var(--spacing-sm)]",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-[var(--spacing-sm)] sm:flex-row sm:items-end">
        <Input
          label="Prompt"
          placeholder={placeholder}
          disabled={disabled}
          className="bg-[var(--color-background)]"
        />
        <Button label={sendLabel} variant="primary" disabled={disabled} />
      </div>
      <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">{attachmentHint}</p>
    </form>
  )
}
