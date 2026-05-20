import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { DashboardClientShell } from '@/components/dashboard-client-shell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User'
  const email = user.email || ''

  return (
    <SidebarProvider>
      <AppSidebar user={{ name: displayName, email }} variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
            {children}
          </div>
        </div>
      </SidebarInset>
      <DashboardClientShell />
    </SidebarProvider>
  )
}