"use client"

import * as React from "react"
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Activity,
  Settings,
  Shield,
  Wallet,
} from "lucide-react"
import Link from "next/link"

import { NavMain } from "@/components/nav-main"
import { NavUserAdmin } from "@/components/nav-user-admin"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

export function AdminSidebar({
  adminEndpoint,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  adminEndpoint: string
}) {
  const data = {
    navMain: [
      {
        title: "Genel Bakış",
        url: "#",
        icon: LayoutDashboard,
        isActive: true,
        items: [
          {
            title: "Dashboard",
            url: `/${adminEndpoint}`,
          },
          {
            title: "İstatistikler",
            url: `/${adminEndpoint}/stats`,
          },
        ],
      },
      {
        title: "Kullanıcılar",
        url: "#",
        icon: Users,
        items: [
          {
            title: "Tüm Kullanıcılar",
            url: `/${adminEndpoint}/users`,
          },
        ],
      },
      {
        title: "Paketler & Fiyat",
        url: "#",
        icon: CreditCard,
        items: [
          {
            title: "Paketler",
            url: `/${adminEndpoint}/packages`,
          },
          {
            title: "Dakika Fiyatlandırma",
            url: `/${adminEndpoint}/pricing`,
          },
        ],
      },
      {
        title: "Finansal",
        url: "#",
        icon: Wallet,
        items: [
          {
            title: "Paket Satışları",
            url: `/${adminEndpoint}/package-sales`,
          },
          {
            title: "Kredi Hareketleri",
            url: `/${adminEndpoint}/credit-transactions`,
          },
        ],
      },
      {
        title: "Sistem",
        url: "#",
        icon: Activity,
        items: [
          {
            title: "API Key Havuzu",
            url: `/${adminEndpoint}/pool`,
          },
          {
            title: "Çağrılar",
            url: `/${adminEndpoint}/calls`,
          },
        ],
      },
      {
        title: "Ayarlar",
        url: "#",
        icon: Settings,
        items: [
          {
            title: "Genel Ayarlar",
            url: `/${adminEndpoint}/settings`,
          },
        ],
      },
    ],
  }

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={`/${adminEndpoint}`}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Shield className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">VoiceTurko</span>
                  <span className="truncate text-xs">Admin Panel</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain label="Yönetim" items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUserAdmin adminEndpoint={adminEndpoint} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}