"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type CardVariant = "default" | "elevated"

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  title?: string
  description?: string
  children?: React.ReactNode
}

/**
 * Card — Vercel-style bordered content surface.
 *
 * @purpose Near-black/near-white content surface with tight radii.
 * @variants default, elevated
 * @props variant, title, description, children
 */
export function Card({
  variant = "default",
  title,
  description,
  className,
  children,
  ...props
}: CardProps) {
  const variantClasses: Record<CardVariant, string> = {
    default: "border border-[var(--color-border)]",
    elevated: "border border-[var(--color-border)] shadow-[var(--shadow-md)]",
  }

  return (
    <div
      role="region"
      aria-label={title}
      className={cn(
        "bg-[var(--color-card)] text-[var(--color-card-foreground)]",
        "rounded-[var(--radius-lg)] p-[var(--spacing-lg)]",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {(title || description) && (
        <header className="mb-[var(--spacing-md)]">
          {title && <h3 className="text-sm font-semibold tracking-tight">{title}</h3>}
          {description && (
            <p className="text-xs text-[var(--color-muted-foreground)] mt-1">{description}</p>
          )}
        </header>
      )}
      {children}
    </div>
  )
}
