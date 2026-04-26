"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Badge } from "./Badge"

export type ChatMessageRole = "assistant" | "user" | "system"

export interface ChatMessageProps extends React.HTMLAttributes<HTMLElement> {
  role: ChatMessageRole
  content: React.ReactNode
  timestamp?: string
  status?: string
}

/**
 * ChatMessage - tokenized AI chat message surface.
 *
 * @purpose Assistant, user, and system message display.
 * @variants assistant, user, system
 * @props role, content, timestamp, status
 */
export function ChatMessage({
  role,
  content,
  timestamp,
  status,
  className,
  ...props
}: ChatMessageProps) {
  const isUser = role === "user"
  const label = role === "assistant" ? "AI" : role === "user" ? "You" : "System"

  return (
    <article
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "max-w-[82%] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-[var(--spacing-md)]",
          isUser
            ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
            : "bg-[var(--color-card)] text-[var(--color-card-foreground)]",
        )}
      >
        <div className="mb-2 flex items-center gap-2">
          <Badge label={label} variant={isUser ? "default" : "accent"} />
          {status && <span className="text-xs opacity-75">{status}</span>}
        </div>
        <div className="text-sm leading-6">{content}</div>
        {timestamp && <p className="mt-2 text-xs opacity-60">{timestamp}</p>}
      </div>
    </article>
  )
}
