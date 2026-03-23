"use client"
import * as React from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
export type MetricCardVariant = "default" | "compact" | "highlighted"

export interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  value: string
  change?: string
  trend: up | down | flat
  variant?: MetricCardVariant
}
export function MetricCard({ title, value, change, trend, variant = "default", className, ...props }: MetricCardProps) {
  return (
    <Card className={cn("transition-all", className)} {...props}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change && <span className="text-sm text-muted-foreground">{change}</span>}
        {trend && <span className="text-sm text-muted-foreground">{trend}</span>}
      </CardContent>
    </Card>
  )
}