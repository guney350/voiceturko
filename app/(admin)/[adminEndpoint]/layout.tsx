import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { AdminSidebar } from '@/components/admin-sidebar'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { getAdminEndpoint } from '@/lib/admin'

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ adminEndpoint: string }>
}) {
  const adminEndpoint = getAdminEndpoint()
  const { adminEndpoint: routeEndpoint } = await params

  // Endpoint kontrolü
  if (routeEndpoint !== adminEndpoint) {
    redirect('/dashboard')
  }

  // Şifre kontrolü
  const cookieStore = await cookies()
  const adminSession = cookieStore.get('admin_session')

  if (!adminSession) {
    redirect(`/admin-login?redirect=/${adminEndpoint}`)
  }

  return (
    <div suppressHydrationWarning>
      <SidebarProvider>
        <AdminSidebar
          adminEndpoint={adminEndpoint}
          variant="inset"
        />
        <SidebarInset>
          <SiteHeader />
          <div className="flex flex-1 flex-col">
            <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
              {children}
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}