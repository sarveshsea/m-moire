"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Badge } from "./Badge"
import { Button } from "./Button"
import { Card } from "./Card"

export interface ProductCardProps extends React.HTMLAttributes<HTMLElement> {
  name: string
  description?: string
  price: string
  badge?: string
  rating?: string
  cta: string
}

/**
 * ProductCard - conversion-focused ecommerce surface.
 *
 * @purpose Product card for storefront and pricing surfaces.
 * @variants default, featured, compact
 * @props name, description, price, badge, rating, cta
 */
export function ProductCard({
  name,
  description,
  price,
  badge = "Best seller",
  rating = "4.9 average rating",
  cta,
  className,
  ...props
}: ProductCardProps) {
  return (
    <article className={className} aria-label={name} {...props}>
      <Card variant="elevated" className="overflow-hidden">
        <div className="mb-[var(--spacing-md)] aspect-[4/3] rounded-[var(--radius-lg)] bg-[var(--color-muted)]" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-card-foreground)]">{name}</h3>
            {description && (
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{description}</p>
            )}
          </div>
          {badge && <Badge label={badge} variant="accent" />}
        </div>
        <div className="mt-[var(--spacing-md)] flex items-end justify-between gap-4">
          <div>
            <p className="text-2xl font-semibold text-[var(--color-foreground)]">{price}</p>
            <p className="text-xs text-[var(--color-muted-foreground)]">{rating}</p>
          </div>
          <Button label={cta} variant="primary" />
        </div>
      </Card>
    </article>
  )
}
