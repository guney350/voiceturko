import { Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft, User, Wallet, Package, Phone as PhoneIcon,
  Bot, Key, Calendar, Mail, Clock, TrendingUp,
} from 'lucide-react'
import Link from 'next/link'
import { UserManagementForm } from '@/components/admin/user-management-form'
import { UserDetailClient } from './user-detail-client'

interface MinutePackage {
  id: string
  name: string
  minutes: number
  price_per_minute: number
  total_price: number
  display_order: number
}

interface UserBalance {
  package_minutes_remaining: number
  package_total_minutes: number
  package_rate_per_minute: number
  package_id: string | null
  credit_try: number
  total_minutes_used: number
  total_spent_try: number
  minute_packages?: { name?: string }
}

async function UserDetails({ userId }: { userId: string }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId)
  if (!authUser) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Kullanıcı bulunamadı
        </CardContent>
      </Card>
    )
  }

  // Paralel sorgular
  const [balanceRes, packagesRes, assistantsRes, sipsRes, callsRes, txRes, poolRes, campaignsRes] = await Promise.all([
    supabase
      .from('user_balances')
      .select('*, minute_packages(name)')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('minute_packages')
      .select('id, name, minutes, price_per_minute, total_price, display_order')
      .eq('is_active', true)
      .order('display_order'),
    supabase.from('assistant').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('sips').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('calls').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(15),
    supabase.from('user_pool_assignments').select('vapi_account_id, assigned_at').eq('user_id', userId),
    supabase.from('campaigns').select('id, name, status, total_contacts, completed_calls, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
  ])

  const balance = balanceRes.data as UserBalance | null
  const packages = (packagesRes.data as MinutePackage[]) || []
  const assistants = assistantsRes.data || []
  const sips = sipsRes.data || []
  const calls = callsRes.data || []
  const transactions = txRes.data || []
  const poolKeys = poolRes.data || []
  const campaigns = campaignsRes.data || []

  const totalCalls = calls.length // 20 cap; daha doğrusu için ayrı count gerekebilir
  const successfulCalls = calls.filter((c: { ended_reason?: string }) => !c.ended_reason || c.ended_reason === 'customer-ended-call' || c.ended_reason === 'assistant-ended-call').length

  return (
    <div className="space-y-6">
      {/* Üst Profil */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Kullanıcı Profili */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                    {authUser.email}
                  </CardTitle>
                  <CardDescription className="text-xs flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Kayıt: {new Date(authUser.created_at).toLocaleDateString('tr-TR')}
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Son giriş: {authUser.last_sign_in_at ? new Date(authUser.last_sign_in_at).toLocaleDateString('tr-TR') : 'Hiç'}
                    </span>
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <code className="text-[10px] text-muted-foreground font-mono">{authUser.id.slice(0, 8)}</code>
                {balance?.package_minutes_remaining && balance.package_minutes_remaining > 0 ? (
                  <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                    Aktif
                  </Badge>
                ) : balance ? (
                  <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                    Kullandıkça Öde
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] bg-gray-50 text-gray-700 border-gray-200">
                    Bakiye Yok
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Bakiye Özeti */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-600" />
              Bakiye
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-2xl font-bold text-emerald-600 tabular-nums">
                {(balance?.credit_try || 0).toFixed(2)}₺
              </p>
              <p className="text-[10px] text-muted-foreground">Kredi bakiyesi</p>
            </div>
            {balance && balance.package_minutes_remaining > 0 && (
              <div className="pt-2 border-t">
                <p className="text-lg font-bold text-blue-600 tabular-nums">
                  {balance.package_minutes_remaining.toLocaleString('tr-TR')} dk
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Paket kalan ({balance.minute_packages?.name})
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stat Kartları */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Toplam Arama</p>
              <p className="text-xl font-bold tabular-nums">{totalCalls}{totalCalls === 20 && '+'}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">~%{totalCalls > 0 ? Math.round((successfulCalls / totalCalls) * 100) : 0} başarılı</p>
            </div>
            <PhoneIcon className="w-8 h-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Toplam Kullanım</p>
              <p className="text-xl font-bold tabular-nums">{Math.floor(balance?.total_minutes_used || 0).toLocaleString('tr-TR')}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">dakika</p>
            </div>
            <TrendingUp className="w-8 h-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Asistanlar</p>
              <p className="text-xl font-bold tabular-nums">{assistants.length}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{sips.length} SIP bağlantısı</p>
            </div>
            <Bot className="w-8 h-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Arama Hatlar\u0131</p>
              <p className={`text-xl font-bold tabular-nums ${poolKeys.length < 10 ? 'text-yellow-600' : 'text-emerald-600'}`}>
                {poolKeys.length}/10
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{poolKeys.length * 10} eşzamanlı</p>
            </div>
            <Key className="w-8 h-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
      </div>

      {/* Yönetim Formu */}
      <UserManagementForm
        userId={userId}
        balance={balance}
        packages={packages}
        poolKeysCount={poolKeys.length}
      />

      {/* Son Hareketler */}
      {transactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Son Bakiye Hareketleri
            </CardTitle>
            <CardDescription>Son 15 işlem</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {transactions.map((tx: { id: string; transaction_type: string; amount: number; description: string; created_at: string; balance_after?: number }) => {
                const positive = tx.amount > 0
                const typeLabel: Record<string, string> = {
                  topup: 'Yükleme',
                  call_charge: 'Arama',
                  trial_grant: 'Hoş Geldin',
                  admin_grant: 'Admin Hediye',
                  refund: 'İade',
                  package_purchase: 'Paket',
                }
                return (
                  <div key={tx.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/40 text-xs">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{tx.description}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(tx.created_at).toLocaleString('tr-TR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant="outline" className="text-[9px]">
                        {typeLabel[tx.transaction_type] || tx.transaction_type}
                      </Badge>
                      <span className={`tabular-nums font-mono font-semibold ${positive ? 'text-emerald-600' : 'text-red-600'}`}>
                        {positive ? '+' : ''}{tx.amount.toFixed(2)}₺
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detaylı Bilgiler - Client Component (Asistan/SIP/Çağrı tabları) */}
      <UserDetailClient
        userId={userId}
        assistants={assistants}
        sips={sips}
        calls={calls}
        invoices={[]}
        minutePurchases={[]}
        campaigns={campaigns}
      />
    </div>
  )
}

function UserDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32" />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}

export default async function UserDetailPage({ params }: { params: Promise<{ userId: string; adminEndpoint: string }> }) {
  const { userId, adminEndpoint } = await params

  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex items-center gap-3 mb-4">
          <Link href={`/${adminEndpoint}/users`}>
            <button className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-9 px-3">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Kullanıcılar
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Kullanıcı Detayı</h1>
            <p className="text-sm text-muted-foreground">Paket, bakiye ve kaynakları yönetin</p>
          </div>
        </div>
      </div>

      <div className="@container/main px-4 lg:px-6 space-y-6">
        <Suspense fallback={<UserDetailSkeleton />}>
          <UserDetails userId={userId} />
        </Suspense>
      </div>
    </>
  )
}
