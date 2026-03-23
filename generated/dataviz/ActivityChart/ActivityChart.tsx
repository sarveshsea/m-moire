"use client"

import * as React from "react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface ActivityChartDataPoint {
  date: string
  value: number
  users?: number
  sessions?: number
}

export interface ActivityChartProps {
  data: ActivityChartDataPoint[]
  title?: string
  description?: string
  className?: string
  height?: number
}

const SAMPLE_DATA: ActivityChartDataPoint[] = [
  {
    "date": "Mon",
    "users": 120,
    "sessions": 340
  },
  {
    "date": "Tue",
    "users": 150,
    "sessions": 420
  },
  {
    "date": "Wed",
    "users": 180,
    "sessions": 510
  },
  {
    "date": "Thu",
    "users": 140,
    "sessions": 380
  },
  {
    "date": "Fri",
    "users": 200,
    "sessions": 580
  },
  {
    "date": "Sat",
    "users": 90,
    "sessions": 210
  },
  {
    "date": "Sun",
    "users": 70,
    "sessions": 160
  }
]

export function ActivityChart({
  data = SAMPLE_DATA,
  title,
  description,
  className,
  height = 400,
}: ActivityChartProps) {
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
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" className="text-xs" />
            <YAxis className="text-xs" />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="users" fill="hsl(var(--chart-1))" stroke="hsl(var(--chart-1))" fillOpacity={0.3} />
            <Area type="monotone" dataKey="sessions" fill="hsl(var(--chart-2))" stroke="hsl(var(--chart-2))" fillOpacity={0.3} />
          </AreaChart>
        </ResponsiveContainer>
        <details className="mt-4">
          <summary className="text-sm text-muted-foreground cursor-pointer">View data table</summary>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr>
                <th className="text-left p-1">date</th>
                <th className="text-right p-1">value</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i}>
                  <td className="p-1">{String(d.date)}</td>
                  <td className="text-right p-1">{d.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </CardContent>
    </Card>
  )
}