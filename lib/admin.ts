import { createClient } from '@/lib/supabase/server'

export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user?.email) {
    return false
  }

  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(email => email.trim()) || []
  
  return adminEmails.includes(user.email)
}

export async function requireAdmin() {
  const admin = await isAdmin()
  
  if (!admin) {
    throw new Error('Unauthorized: Admin access required')
  }
  
  return true
}

export function getAdminEndpoint(): string {
  return process.env.ADMIN_ENDPOINT || 'admin'
}