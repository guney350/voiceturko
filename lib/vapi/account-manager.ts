/**
 * @deprecated — Bu dosya artık kullanılmıyor.
 * Tüm işlevler VapiPoolManager'a taşındı.
 * Bu dosya sadece eski referansların kırılmaması için backward compat sağlar.
 * 
 * Yeni kullanım: import { VapiPoolManager } from '@/lib/vapi/pool-manager'
 */

import { VapiPoolManager } from './pool-manager'

export class VapiAccountManager {
  
  /** @deprecated VapiPoolManager.getAvailableKeyForUser() kullanın */
  static async getCurrentAccount(userId: string) {
    try {
      return await VapiPoolManager.getAvailableKeyForUser(userId)
    } catch {
      return null
    }
  }
  
  /** @deprecated VapiPoolManager.getAvailableKeyForUser() kullanın */
  static async getAvailableAccount(userId: string) {
    try {
      return await VapiPoolManager.getAvailableKeyForUser(userId)
    } catch {
      return null
    }
  }
  
  /** @deprecated VapiPoolManager.incrementActiveCall() kullanın */
  static async incrementActiveCall(accountId: string) {
    return VapiPoolManager.incrementActiveCall(accountId)
  }
  
  /** @deprecated VapiPoolManager.decrementActiveCall() kullanın */
  static async decrementActiveCall(accountId: string) {
    return VapiPoolManager.decrementActiveCall(accountId)
  }

  /** @deprecated Bu method artık havuz sistemiyle uyumsuz */
  static async getAllAccounts(_userId: string) {
    const stats = await VapiPoolManager.getPoolStats()
    return stats.keys
  }

  /** @deprecated Bu method artık havuz sistemiyle uyumsuz */
  static async getStats(_userId: string) {
    const stats = await VapiPoolManager.getPoolStats()
    return {
      totalAccounts: stats.totalKeys,
      activeAccounts: stats.activeKeys,
      totalCapacity: stats.totalCapacity,
      usedCapacity: stats.usedCapacity,
    }
  }

  /** @deprecated Artık admin panelden /api/admin/pool ile yapılır */
  static async addAccount(_userId: string, _email: string, _apiKey: string) {
    return {
      success: false,
      error: 'Bu method kullanılmıyor. Admin panelden /api/admin/pool kullanın.',
    }
  }

  /** @deprecated Artık kullanılmıyor */
  static async deleteAccount(_id: string, _userId: string) {
    return { success: false, error: 'Bu method artık kullanılmıyor. Admin panelden API key yönetimi yapın.' }
  }

  /** @deprecated Artık kullanılmıyor */
  static async activateAccount(_id: string, _userId: string) {
    return { success: false, error: 'Bu method artık kullanılmıyor.' }
  }

  /** @deprecated Artık kullanılmıyor */
  static async updateBalance(_id: string, _balance: number) {
    return { success: false, error: 'Bakiye sistemi kaldırıldı.' }
  }

  /** @deprecated Artık kullanılmıyor */
  static async bulkImportAccounts(_userId: string, _accounts: unknown[]) {
    return { success: false, error: 'Bu method artık kullanılmıyor. Admin panelden API key ekleyin.' }
  }

  /** @deprecated Artık kullanılmıyor */
  static async ensureAssistantsOnAccount() {
    return { success: false, error: 'VapiPoolManager.provisionAssistant() kullanın.' }
  }
}