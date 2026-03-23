import * as React from "react"
import { cn } from "@/lib/utils"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { MetricCard } from "@/generated/components/MetricCard"
import { ActivityChart } from "@/generated/components/ActivityChart"

export interface DashboardProps {
  className?: string
}

export function Dashboard({ className }: DashboardProps) {
  return (
    <div className={cn("", className)}>
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <main className="flex-1 p-6 space-y-6">
          {/* metrics-row */}
          <section className="grid grid-cols-4 gap-4 max-sm:flex max-sm:flex-col sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard  />
            <MetricCard  />
            <MetricCard  />
            <MetricCard  />
          </section>
          {/* activity-chart */}
          <section className="w-full">
            <ActivityChart  />
          </section>
        </main>
      </SidebarInset>
    </SidebarProvider>
    </div>
  )
}