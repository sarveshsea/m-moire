"use client"

import * as React from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface RevenueChartDataPoint {
  date: string
  number: number
}

export interface RevenueChartProps {
  data: RevenueChartDataPoint[]
  title?: string
  description?: string
  className?: string
  height?: number
}

export function RevenueChart({
  data,
  title,
  description,
  className,
  height = 400,
}: RevenueChartProps) {
  return (
    <Card className={cn("w-full", className)}>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip />
            <Line type="monotone" dataKey="number" stroke="hsl(var(--chart-1))" />
          </LineChart>
        </ResponsiveContainer>
        <details className="mt-4">
          <summary className="text-sm text-muted-foreground cursor-pointer">View data table</summary>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-1">date</th>
                <th className="text-right p-1">number</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i}>
                  <td className="p-1">{String(d.date)}</td>
                  <td className="text-right p-1">{d.number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </CardContent>
    </Card>
  )
}