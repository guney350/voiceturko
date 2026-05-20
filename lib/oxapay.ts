/**
 * Oxapay Client
 *
 * Crypto ödemeleri için Oxapay Merchant API entegrasyonu.
 * Doc: https://docs.oxapay.com/
 *
 * Env vars:
 * - OXAPAY_MERCHANT_KEY
 * - OXAPAY_API_KEY (opsiyonel, webhook için)
 */

interface CreateInvoiceParams {
  amount: number
  currency?: string // USD, EUR, TRY vs. - oxapay TRY desteklemiyorsa USD'ye çeviririz
  orderId: string
  description?: string
  callbackUrl: string
  returnUrl: string
  email?: string
}

interface OxapayInvoiceResponse {
  result: number
  message: string
  trackId?: string
  payLink?: string
  expiredAt?: number
}

const OXAPAY_BASE_URL = 'https://api.oxapay.com/merchants'

export class OxapayClient {
  private merchantKey: string

  constructor(merchantKey?: string) {
    this.merchantKey = merchantKey || process.env.OXAPAY_MERCHANT_KEY || ''
    if (!this.merchantKey) {
      console.warn('[Oxapay] OXAPAY_MERCHANT_KEY env var tanımlanmamış')
    }
  }

  /**
   * Yeni invoice oluştur (kullanıcı ödeme yapacak)
   */
  async createInvoice(params: CreateInvoiceParams): Promise<{
    success: boolean
    payUrl?: string
    trackId?: string
    error?: string
  }> {
    try {
      // Oxapay TRY desteklemiyor olabilir - kontrol için USD'ye çevirelim
      // (sabit kur 1$ = 40₺ varsayımıyla; production'da gerçek kur API'si gerekli)
      const usdAmount = params.currency === 'USD' ? params.amount : params.amount / 40

      const res = await fetch(`${OXAPAY_BASE_URL}/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          merchant: this.merchantKey,
          amount: usdAmount,
          currency: 'USD',
          lifeTime: 30, // dakika
          feePaidByPayer: 0,
          underPaidCover: 2.5,
          callbackUrl: params.callbackUrl,
          returnUrl: params.returnUrl,
          email: params.email,
          orderId: params.orderId,
          description: params.description || 'Kredi yüklemesi',
        }),
      })

      const data: OxapayInvoiceResponse = await res.json()

      if (data.result !== 100) {
        return { success: false, error: data.message || 'Invoice oluşturma başarısız' }
      }

      return {
        success: true,
        payUrl: data.payLink,
        trackId: data.trackId,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown'
      return { success: false, error: msg }
    }
  }

  /**
   * Invoice durumu sorgula
   */
  async getInvoice(trackId: string): Promise<{
    success: boolean
    status?: string
    paidAmount?: number
    error?: string
  }> {
    try {
      const res = await fetch(`${OXAPAY_BASE_URL}/inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant: this.merchantKey,
          trackId,
        }),
      })

      const data = await res.json()

      if (data.result !== 100) {
        return { success: false, error: data.message }
      }

      return {
        success: true,
        status: data.status, // 'Waiting' | 'Paid' | 'Expired' | 'New'
        paidAmount: data.payAmount,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown'
      return { success: false, error: msg }
    }
  }
}
