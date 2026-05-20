"use client"

import * as React from "react"
import {
  LayoutDashboard,
  Phone,
  CreditCard,
  Wallet,
  Bot,
  Settings,
  Headphones,
  Megaphone,
  HelpCircle,
} from "lucide-react"
import Link from "next/link"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const data = {
  navGroups: [
    {
      label: "Ana Menü",
      items: [
        {
          title: "Dashboard",
          url: "/dashboard",
          icon: LayoutDashboard,
        },
        {
          title: "Kampanyalar",
          url: "/dashboard/campaigns",
          icon: Megaphone,
        },
        {
          title: "Çağrılar",
          url: "/dashboard/calls",
          icon: Phone,
        },
        {
          title: "Asistanlar",
          url: "/dashboard/assistant",
          icon: Bot,
        },
      ],
    },
    {
      label: "Hesap",
      items: [
        {
          title: "Paketler",
          url: "/dashboard/packages",
          icon: CreditCard,
        },
        {
          title: "Kredilerim",
          url: "/dashboard/credits",
          icon: Wallet,
        },
        {
          title: "SIP Yönetimi",
          url: "/dashboard/sip",
          icon: Headphones,
        },
        {
          title: "Ayarlar",
          url: "/dashboard/settings",
          icon: Settings,
        },
        {
          title: "Yardım Merkezi",
          url: "/dashboard/help",
          icon: HelpCircle,
        },
      ],
    },
  ],
}

export function AppSidebar({ 
  user,
  ...props 
}: React.ComponentProps<typeof Sidebar> & {
  user: {
    name: string
    email: string
  }
}) {
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Phone className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">VoiceTurko</span>
                  <span className="truncate text-xs">AI Çağrı Analizi</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {data.navGroups.map((group) => (
          <NavMain key={group.label} label={group.label} items={group.items} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}