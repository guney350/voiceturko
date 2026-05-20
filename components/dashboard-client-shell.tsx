'use client'

import dynamic from 'next/dynamic'

// Client-only render — SSR'ı atlatır, hydration mismatch'i engeller
const ChatWidget = dynamic(
  () => import('@/components/chatbot/chat-widget').then(m => ({ default: m.ChatWidget })),
  { ssr: false }
)

const AutoCallSync = dynamic(
  () => import('@/components/auto-call-sync').then(m => ({ default: m.AutoCallSync })),
  { ssr: false }
)

export function DashboardClientShell() {
  return (
    <>
      <ChatWidget />
      <AutoCallSync />
    </>
  )
}
