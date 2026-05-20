# VAPI Sistem Mimarisi - Ölçeklenebilir Tasarım

## 📋 Genel Bakış

Bu doküman, Next.js + Supabase tabanlı ölçeklenebilir VAPI yönetim sisteminin mimarisini açıklar.

## 🗄️ Veritabanı Şeması

### 1. VAPI Hesap Yönetimi

```sql
-- VAPI API Key Havuzu
CREATE TABLE vapi_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  
  -- Hesap Bilgileri
  email TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  
  -- Bakiye Yönetimi
  initial_balance DECIMAL(10,2) DEFAULT 10.00,
  current_balance DECIMAL(10,2) DEFAULT 10.00,
  total_spent DECIMAL(10,2) DEFAULT 0,
  spending_limit DECIMAL(10,2) DEFAULT 9.50,
  min_balance_threshold DECIMAL(10,2) DEFAULT 5.00,
  
  -- Durum
  status TEXT DEFAULT 'standby' CHECK (status IN ('active', 'standby', 'low_balance', 'exhausted', 'error', 'disabled')),
  is_current BOOLEAN DEFAULT false, -- Şu an aktif olan hesap
  priority INTEGER DEFAULT 100,
  
  -- İstatistikler
  total_calls_made INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  error_message TEXT,
  
  -- Zaman Damgaları
  last_balance_check TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint: Organizasyon başına sadece 1 aktif hesap
  CONSTRAINT one_current_per_org UNIQUE (organization_id, is_current) WHERE is_current = true
);

-- Bakiye Geçmişi
CREATE TABLE vapi_balance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES vapi_accounts(id) ON DELETE CASCADE,
  balance DECIMAL(10,2) NOT NULL,
  balance_change DECIMAL(10,2),
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hesap Değişim Logları
CREATE TABLE vapi_account_switch_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  from_account_id UUID REFERENCES vapi_accounts(id),
  to_account_id UUID REFERENCES vapi_accounts(id),
  switch_reason TEXT NOT NULL,
  from_balance DECIMAL(10,2),
  to_balance DECIMAL(10,2),
  switched_by TEXT DEFAULT 'system',
  switched_at TIMESTAMPTZ DEFAULT NOW()
);

-- İndeksler
CREATE INDEX idx_vapi_accounts_org ON vapi_accounts(organization_id);
CREATE INDEX idx_vapi_accounts_status ON vapi_accounts(status);
CREATE INDEX idx_vapi_accounts_current ON vapi_accounts(is_current) WHERE is_current = true;
```

### 2. Kampanya (Bulk Call) Sistemi

```sql
-- Kampanya İşleri
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES users(id),
  
  -- Kampanya Bilgileri
  name TEXT NOT NULL,
  assistant_id TEXT NOT NULL,
  assistant_name TEXT,
  
  -- İstatistikler
  total_calls INTEGER DEFAULT 0,
  pending_calls INTEGER DEFAULT 0,
  completed_calls INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  failed_calls INTEGER DEFAULT 0,
  active_call_count INTEGER DEFAULT 0, -- Şu an aranan
  
  -- Ayarlar
  delay_seconds INTEGER DEFAULT 30,
  max_concurrent_calls INTEGER DEFAULT 5, -- Bu kampanya için max eşzamanlı arama
  max_attempts INTEGER DEFAULT 3,
  
  -- Durum
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'paused', 'completed', 'cancelled', 
    'stalled', 'stalled_needs_manual'
  )),
  
  -- Zamanlama
  schedule_type TEXT DEFAULT 'immediate' CHECK (schedule_type IN ('immediate', 'scheduled')),
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Heartbeat & Recovery
  last_heartbeat_at TIMESTAMPTZ,
  last_progress_at TIMESTAMPTZ,
  stalled_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  last_recovery_at TIMESTAMPTZ,
  
  -- Hata Yönetimi
  pause_reason TEXT,
  last_error_code TEXT,
  last_error_detail TEXT,
  last_action TEXT,
  
  -- Worker Yönetimi
  worker_id TEXT,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kampanya Öğeleri (Her bir arama)
CREATE TABLE campaign_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  
  -- Müşteri Bilgileri
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_data JSONB, -- Ek veriler
  
  -- Arama Bilgileri
  call_order INTEGER NOT NULL,
  vapi_call_id TEXT,
  
  -- Durum
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'locked', 'calling', 'completed', 'failed', 
    'cancelled', 'retry_wait'
  )),
  
  -- Retry Yönetimi
  attempt_count INTEGER DEFAULT 0,
  stall_count INTEGER DEFAULT 0,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ,
  
  -- Lock Yönetimi
  locked_at TIMESTAMPTZ,
  lock_expires_at TIMESTAMPTZ,
  lock_owner TEXT,
  worker_id TEXT,
  
  -- Arama Detayları
  called_at TIMESTAMPTZ,
  call_started_at TIMESTAMPTZ,
  call_timeout_at TIMESTAMPTZ,
  call_duration INTEGER,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  last_stall_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kampanya Logları
CREATE TABLE campaign_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  item_id UUID REFERENCES campaign_items(id) ON DELETE SET NULL,
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error', 'success')),
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Durum Değişim Logları
CREATE TABLE campaign_state_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  reason_code TEXT,
  reason_detail TEXT,
  last_action TEXT,
  retry_count INTEGER DEFAULT 0,
  recovery_attempt INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kurtarma Logları
CREATE TABLE campaign_recovery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  item_id UUID REFERENCES campaign_items(id) ON DELETE SET NULL,
  recovery_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  reason TEXT,
  worker_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- İndeksler
CREATE INDEX idx_campaigns_org ON campaigns(organization_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_user ON campaigns(user_id);
CREATE INDEX idx_campaign_items_campaign ON campaign_items(campaign_id);
CREATE INDEX idx_campaign_items_status ON campaign_items(status);
CREATE INDEX idx_campaign_items_order ON campaign_items(campaign_id, call_order);
CREATE INDEX idx_campaign_items_retry ON campaign_items(status, next_retry_at) WHERE status = 'retry_wait';
CREATE INDEX idx_campaign_logs_campaign ON campaign_logs(campaign_id, created_at DESC);
```

### 3. VAPI Asistan & Telefon Numarası Yönetimi

```sql
-- VAPI Asistanları
CREATE TABLE vapi_assistants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  vapi_assistant_id TEXT NOT NULL, -- VAPI'deki asistan ID
  name TEXT NOT NULL,
  
  -- Durum
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, vapi_assistant_id)
);

-- Asistan-Hesap Mapping (Her asistan, her hesapta farklı ID'ye sahip)
CREATE TABLE assistant_account_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID REFERENCES vapi_assistants(id) ON DELETE CASCADE,
  vapi_account_id UUID REFERENCES vapi_accounts(id) ON DELETE CASCADE,
  vapi_assistant_id TEXT NOT NULL, -- Bu hesaptaki asistan ID
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(assistant_id, vapi_account_id)
);

-- VAPI Telefon Numaraları
CREATE TABLE vapi_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  vapi_phone_number_id TEXT NOT NULL UNIQUE,
  phone_number TEXT NOT NULL,
  
  -- Durum
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  
  -- İstatistikler
  total_calls_made INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint: Organizasyon başına sadece 1 varsayılan numara
  CONSTRAINT one_default_per_org UNIQUE (organization_id, is_default) WHERE is_default = true
);

-- İndeksler
CREATE INDEX idx_vapi_assistants_user ON vapi_assistants(user_id);
CREATE INDEX idx_assistant_mapping_assistant ON assistant_account_mapping(assistant_id);
CREATE INDEX idx_assistant_mapping_account ON assistant_account_mapping(vapi_account_id);
CREATE INDEX idx_vapi_phone_numbers_org ON vapi_phone_numbers(organization_id);
CREATE INDEX idx_vapi_phone_numbers_default ON vapi_phone_numbers(is_default) WHERE is_default = true;
```

### 4. Global Ayarlar

```sql
-- Sistem Ayarları
CREATE TABLE system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  
  -- VAPI Ayarları
  vapi_auto_switch_enabled BOOLEAN DEFAULT true,
  vapi_balance_check_interval INTEGER DEFAULT 300, -- 5 dakika
  vapi_critical_balance DECIMAL(10,2) DEFAULT 2.00,
  default_phone_number_id TEXT, -- Varsayılan telefon numarası
  
  -- Kampanya Ayarları
  max_global_concurrent_calls INTEGER DEFAULT 100, -- Tüm kampanyalar için toplam
  default_call_timeout_seconds INTEGER DEFAULT 300, -- 5 dakika
  default_lock_ttl_seconds INTEGER DEFAULT 120, -- 2 dakika
  default_max_attempts INTEGER DEFAULT 3,
  default_retry_delay_seconds INTEGER DEFAULT 30,
  
  -- Kurtarma Ayarları
  stale_heartbeat_threshold_seconds INTEGER DEFAULT 60,
  max_auto_recovery_attempts INTEGER DEFAULT 3,
  auto_recovery_interval_seconds INTEGER DEFAULT 300,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id)
);
```

## 🔄 İş Akışları

### 1. Otomatik Asistan Kopyalama Sistemi

**Problem**: VAPI hesabı değiştiğinde, kullanıcının asistanları yeni hesapta yok.

**Çözüm**: Her hesap değişiminde asistanlar otomatik kopyalanır ve mapping tutulur.

```typescript
// lib/vapi/account-manager.ts

export class VapiAccountManager {
  
  // Hesap değiştir ve asistanları kopyala
  async switchToNextAccount(userId: string, fromAccountId: string, reason: string) {
    // 1. Yeni hesabı bul
    const nextAccount = await this.findNextAvailableAccount(userId);
    
    if (!nextAccount) {
      throw new Error('No available accounts');
    }
    
    // 2. Kullanıcının asistanlarını yeni hesaba kopyala
    await this.ensureAssistantsOnAccount(userId, nextAccount);
    
    // 3. Hesabı aktive et
    await this.activateAccount(nextAccount.id);
    
    // 4. Eski hesabı deaktive et
    await this.deactivateAccount(fromAccountId, 'exhausted');
    
    return nextAccount;
  }
  
  // Asistanları hesaba kopyala
  async ensureAssistantsOnAccount(userId: string, account: VapiAccount) {
    const supabase = await createClient();
    
    // Kullanıcının tüm asistanlarını al
    const { data: assistants } = await supabase
      .from('vapi_assistants')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);
    
    if (!assistants || assistants.length === 0) return;
    
    for (const assistant of assistants) {
      // Bu hesapta mapping var mı kontrol et
      const { data: existingMapping } = await supabase
        .from('assistant_account_mapping')
        .select('*')
        .eq('assistant_id', assistant.id)
        .eq('vapi_account_id', account.id)
        .single();
      
      if (existingMapping) {
        // Zaten kopyalanmış
        continue;
      }
      
      // VAPI'ye asistanı kopyala
      const vapiClient = new VapiClient(account.api_key);
      const originalAssistant = await vapiClient.getAssistant(assistant.vapi_assistant_id);
      
      const newAssistant = await vapiClient.createAssistant({
        name: originalAssistant.name,
        model: originalAssistant.model,
        voice: originalAssistant.voice,
        firstMessage: originalAssistant.firstMessage,
        // ... diğer ayarlar
      });
      
      // Mapping'i kaydet
      await supabase.from('assistant_account_mapping').insert({
        assistant_id: assistant.id,
        vapi_account_id: account.id,
        vapi_assistant_id: newAssistant.id
      });
    }
  }
}
```

### 2. VAPI Hesap Yönetimi

```typescript
// lib/vapi/account-manager.ts

export class VapiAccountManager {
  
  // Aktif hesabı getir
  async getCurrentAccount(orgId: string): Promise<VapiAccount | null> {
    const { data } = await supabase
      .from('vapi_accounts')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_current', true)
      .eq('status', 'active')
      .single();
    
    return data;
  }
  
  // Bakiye düşür (webhook'tan çağrılır)
  async deductCallCost(orgId: string, cost: number, callId: string) {
    const account = await this.getCurrentAccount(orgId);
    if (!account) throw new Error('No active account');
    
    const newBalance = Math.max(0, account.current_balance - cost);
    
    await supabase
      .from('vapi_accounts')
      .update({
        current_balance: newBalance,
        total_spent: account.total_spent + cost,
        total_calls_made: account.total_calls_made + 1,
        last_used_at: new Date().toISOString()
      })
      .eq('id', account.id);
    
    // Bakiye logla
    await supabase.from('vapi_balance_logs').insert({
      account_id: account.id,
      balance: newBalance,
      balance_change: -cost
    });
    
    // Bakiye kontrolü
    if (newBalance <= 0) {
      await this.switchToNextAccount(orgId, account.id, 'exhausted');
    } else if (newBalance < account.min_balance_threshold) {
      await this.sendLowBalanceAlert(account);
    }
  }
  
  // Sıradaki hesaba geç
  async switchToNextAccount(
    orgId: string, 
    fromAccountId: string, 
    reason: string
  ) {
    // Transaction başlat
    const { data: nextAccount } = await supabase
      .from('vapi_accounts')
      .select('*')
      .eq('organization_id', orgId)
      .neq('id', fromAccountId)
      .in('status', ['standby', 'active'])
      .lt('total_spent', supabase.raw('spending_limit'))
      .order('total_spent', { ascending: true })
      .limit(1)
      .single();
    
    if (!nextAccount) {
      await this.sendNoAccountsAlert(orgId);
      throw new Error('No available accounts');
    }
    
    // Eski hesabı deaktive et
    await supabase
      .from('vapi_accounts')
      .update({ 
        is_current: false, 
        status: 'exhausted' 
      })
      .eq('id', fromAccountId);
    
    // Yeni hesabı aktive et
    await supabase
      .from('vapi_accounts')
      .update({ 
        is_current: true, 
        status: 'active',
        last_used_at: new Date().toISOString()
      })
      .eq('id', nextAccount.id);
    
    // Log kaydet
    await supabase.from('vapi_account_switch_logs').insert({
      organization_id: orgId,
      from_account_id: fromAccountId,
      to_account_id: nextAccount.id,
      switch_reason: reason
    });
    
    return nextAccount;
  }
  
  // Toplu hesap yükleme
  async bulkImportAccounts(
    orgId: string, 
    accounts: Array<{email: string, apiKey: string, balance: number}>
  ) {
    const records = accounts.map((acc, idx) => ({
      organization_id: orgId,
      email: acc.email,
      api_key: acc.apiKey,
      initial_balance: acc.balance,
      current_balance: acc.balance,
      priority: idx + 1,
      status: 'standby'
    }));
    
    const { data, error } = await supabase
      .from('vapi_accounts')
      .upsert(records, { 
        onConflict: 'api_key',
        ignoreDuplicates: false 
      });
    
    return { imported: data?.length || 0, error };
  }
}
```

### 3. Kampanya İşleme Motoru - Paralel İşleme

**Özellik**: Aynı anda birden fazla arama başlatma (Batch Processing)

```typescript
// lib/campaign/processor.ts

export class CampaignProcessor {
  
  // Sıradaki öğeleri PARALEL işle
  async processNextBatch(campaignId: string, campaign: Campaign, workerId: string) {
    const supabase = await createClient();
    
    // 1. Kaç arama başlatılabilir?
    const maxConcurrent = campaign.max_concurrent_calls || 10;
    const currentActive = campaign.active_call_count || 0;
    const availableSlots = Math.max(0, maxConcurrent - currentActive);
    
    if (availableSlots === 0) {
      return { waiting: true, message: 'Max concurrent calls reached' };
    }
    
    // 2. Batch size kadar pending item al
    const batchSize = Math.min(availableSlots, 10);
    
    const { data: pendingItems } = await supabase
      .from('campaign_items')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .order('call_order', { ascending: true })
      .limit(batchSize);
    
    if (!pendingItems || pendingItems.length === 0) {
      return { waiting: true, message: 'No pending items' };
    }
    
    // 3. Item'ları kilitle
    const itemIds = pendingItems.map(i => i.id);
    await supabase
      .from('campaign_items')
      .update({
        status: 'locked',
        locked_at: new Date().toISOString(),
        lock_expires_at: new Date(Date.now() + 120000).toISOString(),
        worker_id: workerId
      })
      .in('id', itemIds);
    
    // 4. PARALEL ARAMA BAŞLAT
    const callPromises = pendingItems.map(item =>
      this.makeCall(item, campaign).catch(error => ({
        success: false,
        error: error.message,
        itemId: item.id
      }))
    );
    
    const results = await Promise.all(callPromises);
    
    // 5. Active call count'u güncelle
    const successCount = results.filter(r => r.success).length;
    await supabase
      .from('campaigns')
      .update({
        active_call_count: currentActive + successCount
      })
      .eq('id', campaignId);
    
    return {
      processed: results.length,
      successful: successCount,
      failed: results.length - successCount,
      results
    };
  }
  
  // VAPI araması - Mapping'den doğru assistant ID'yi al
  async makeCall(item: CampaignItem, campaign: Campaign) {
    const supabase = await createClient();
    
    // 1. Aktif hesabı al
    const account = await VapiAccountManager.getCurrentAccount(campaign.user_id);
    
    if (!account) {
      throw new Error('No active VAPI account');
    }
    
    // 2. Bu hesap için doğru assistant ID'yi al (mapping'den)
    const { data: mapping } = await supabase
      .from('assistant_account_mapping')
      .select('vapi_assistant_id')
      .eq('assistant_id', campaign.assistant_id)
      .eq('vapi_account_id', account.id)
      .single();
    
    const assistantId = mapping?.vapi_assistant_id || campaign.assistant_id;
    
    // 3. VAPI API çağrısı
    const response = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'outboundPhoneCall',
        customer: {
          number: item.customer_phone,
          name: item.customer_name
        },
        assistantId: assistantId, // Mapping'den gelen ID
        phoneNumberId: await this.getPhoneNumberId()
      })
    });
    
    // ... geri kalan kod
  }
}
```

### 4. Kampanya İşleme Motoru - Eski Versiyon

```typescript
// lib/campaign/processor.ts

export class CampaignProcessor {
  
  // İdempotent tick - Ana işleme fonksiyonu
  async tick(campaignId: string, userId: string) {
    const workerId = this.generateWorkerId();
    
    // 1. Kampanyayı kilitle (row-level lock)
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('user_id', userId)
      .single();
    
    if (!campaign) return { error: 'Campaign not found' };
    
    // 2. Heartbeat güncelle
    await supabase
      .from('campaigns')
      .update({ 
        last_heartbeat_at: new Date().toISOString(),
        worker_id: workerId 
      })
      .eq('id', campaignId);
    
    // 3. Takılı öğeleri kurtar
    const recovered = await this.recoverStalledItems(campaignId);
    
    // 4. Global rate limit kontrolü
    const canProceed = await this.checkGlobalRateLimit();
    if (!canProceed) {
      return { waiting: true, reason: 'global_rate_limit' };
    }
    
    // 5. Sıradaki öğeyi işle
    const result = await this.processNextItem(campaignId, campaign);
    
    return {
      success: true,
      recovered,
      processed: result.processed,
      done: result.done
    };
  }
  
  // Sıradaki öğeyi işle
  async processNextItem(campaignId: string, campaign: Campaign) {
    // Pending öğeyi bul ve kilitle
    const { data: item } = await supabase.rpc('acquire_next_campaign_item', {
      p_campaign_id: campaignId,
      p_worker_id: this.workerId,
      p_lock_ttl_seconds: 120
    });
    
    if (!item) {
      // Tüm öğeler tamamlandı mı?
      const { count } = await supabase
        .from('campaign_items')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .in('status', ['pending', 'calling', 'retry_wait']);
      
      if (count === 0) {
        await this.completeCampaign(campaignId);
        return { done: true };
      }
      
      return { waiting: true };
    }
    
    // VAPI araması yap
    const callResult = await this.makeCall(item, campaign);
    
    return { processed: 1, item, callResult };
  }
  
  // VAPI araması
  async makeCall(item: CampaignItem, campaign: Campaign) {
    // 1. Hesap al
    const account = await this.accountManager.getCurrentAccount(
      campaign.organization_id
    );
    
    if (!account) {
      throw new Error('No active VAPI account');
    }
    
    // 2. Item'ı calling durumuna al
    await supabase
      .from('campaign_items')
      .update({
        status: 'calling',
        called_at: new Date().toISOString(),
        call_started_at: new Date().toISOString(),
        call_timeout_at: new Date(Date.now() + 300000).toISOString(), // 5 dk
        attempt_count: item.attempt_count + 1
      })
      .eq('id', item.id);
    
    // 3. VAPI API çağrısı
    try {
      const response = await fetch('https://api.vapi.ai/call', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${account.api_key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'outboundPhoneCall',
          customer: {
            number: item.customer_phone,
            name: item.customer_name
          },
          assistantId: campaign.assistant_id,
          phoneNumberId: await this.getPhoneNumberId()
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Başarılı
        await supabase
          .from('campaign_items')
          .update({
            vapi_call_id: data.id,
            status: 'calling' // Webhook'tan completed olacak
          })
          .eq('id', item.id);
        
        return { success: true, callId: data.id };
      } else {
        // Hata
        const reasonCode = this.detectErrorReason(data, response.status);
        
        if (this.isTransientError(reasonCode) && item.attempt_count < 3) {
          // Retry planla
          await this.scheduleRetry(item.id, reasonCode);
        } else {
          // Kalıcı hata
          await this.markItemFailed(item.id, reasonCode, data.message);
        }
        
        return { success: false, error: data.message, reasonCode };
      }
    } catch (error) {
      // Network hatası
      await this.scheduleRetry(item.id, 'NETWORK_ERROR');
      return { success: false, error: error.message };
    }
  }
  
  // Takılı öğeleri kurtar
  async recoverStalledItems(campaignId: string) {
    // 1. Süresi dolmuş kilitleri temizle
    const { data: expiredLocks } = await supabase
      .from('campaign_items')
      .update({
        status: 'pending',
        locked_at: null,
        lock_expires_at: null,
        worker_id: null,
        stall_count: supabase.raw('stall_count + 1')
      })
      .eq('campaign_id', campaignId)
      .eq('status', 'locked')
      .lt('lock_expires_at', new Date().toISOString())
      .select();
    
    // 2. Timeout olan aramaları kurtar
    const { data: timedOutCalls } = await supabase
      .from('campaign_items')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('status', 'calling')
      .lt('call_timeout_at', new Date().toISOString());
    
    for (const item of timedOutCalls || []) {
      await this.handleCallTimeout(item);
    }
    
    return (expiredLocks?.length || 0) + (timedOutCalls?.length || 0);
  }
}
```

### 3. Watchdog Servisi (Cron Job)

```typescript
// app/api/cron/campaign-watchdog/route.ts

export async function GET(request: Request) {
  // Cron secret kontrolü
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  const watchdog = new CampaignWatchdog();
  const result = await watchdog.run();
  
  return Response.json(result);
}

class CampaignWatchdog {
  async run() {
    const recovered = {
      staleJobs: 0,
      stalledItems: 0,
      completedJobs: 0
    };
    
    // 1. Heartbeat'i eski olan kampanyaları bul
    const { data: staleJobs } = await supabase
      .from('campaigns')
      .select('*')
      .eq('status', 'running')
      .lt('last_heartbeat_at', new Date(Date.now() - 60000).toISOString());
    
    for (const job of staleJobs || []) {
      await this.recoverStaleJob(job);
      recovered.staleJobs++;
    }
    
    // 2. Tamamlanmış ama işaretlenmemiş kampanyaları bul
    const { data: completableJobs } = await supabase
      .from('campaigns')
      .select('id')
      .eq('status', 'running')
      .eq('pending_calls', 0);
    
    for (const job of completableJobs || []) {
      await supabase
        .from('campaigns')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id);
      
      recovered.completedJobs++;
    }
    
    // 3. Global temizlik
    await this.globalCleanup();
    
    return recovered;
  }
  
  async recoverStaleJob(job: Campaign) {
    // Kampanyayı duraklat
    await supabase
      .from('campaigns')
      .update({
        status: 'paused',
        paused_at: new Date().toISOString(),
        pause_reason: 'stale_heartbeat'
      })
      .eq('id', job.id);
    
    // Takılı öğeleri kurtar
    const processor = new CampaignProcessor();
    await processor.recoverStalledItems(job.id);
  }
  
  async globalCleanup() {
    // Çok eski kilitleri temizle
    await supabase
      .from('campaign_items')
      .update({
        status: 'pending',
        locked_at: null,
        lock_expires_at: null,
        worker_id: null
      })
      .eq('status', 'locked')
      .lt('lock_expires_at', new Date(Date.now() - 300000).toISOString());
  }
}
```

## 🚀 Ölçeklenebilirlik Stratejileri

### 1. Paralel İşleme (100+ Eşzamanlı Arama)

**Nasıl Çalışır:**
1. Her kampanya `max_concurrent_calls` ayarına sahip (örn: 10)
2. `processNextBatch()` fonksiyonu aynı anda birden fazla item işler
3. Global limit: `max_global_concurrent_calls` (örn: 100)
4. Webhook-driven: Her arama bittiğinde otomatik yeni arama başlar

**Örnek Senaryo:**
- 10 kampanya, her biri 10 eşzamanlı arama = 100 paralel arama
- Kampanya 1: 10 arama aktif
- Kampanya 2: 10 arama aktif
- ...
- Toplam: 100 arama aynı anda

**Kod:**
```typescript
// Her kampanya için batch processing
const batchSize = Math.min(availableSlots, 10);
const callPromises = pendingItems.map(item => this.makeCall(item, campaign));
const results = await Promise.all(callPromises); // Paralel çalışır
```

### 2. Webhook-Driven Processing

**Problem**: Cron job her dakika 1 kez çalışır, yavaş.

**Çözüm**: Her arama bittiğinde webhook tetiklenir, hemen yeni arama başlar.

```typescript
// app/api/webhooks/vapi/route.ts

export async function POST(request: Request) {
  const event = await request.json();
  
  if (event.type === 'call.ended') {
    // 1. Maliyeti hesapla ve hesaptan düş
    await VapiAccountManager.deductCallCost(
      event.orgId,
      event.call.cost,
      event.call.id
    );
    
    // 2. Item'ı completed olarak işaretle
    await supabase
      .from('campaign_items')
      .update({
        status: 'completed',
        call_duration: event.call.duration,
        completed_at: new Date().toISOString()
      })
      .eq('vapi_call_id', event.call.id);
    
    // 3. Active call count'u azalt
    await supabase.rpc('decrement_active_calls', {
      p_campaign_id: event.campaignId
    });
    
    // 4. HEMEN YENİ ARAMA BAŞLAT (Cron beklemeden)
    const processor = new CampaignProcessor();
    await processor.tick(event.campaignId, event.userId);
  }
  
  return Response.json({ success: true });
}
```

### 3. Çoklu VAPI Hesap Yönetimi

**Strateji**: Birden fazla VAPI hesabı kullanarak limitleri aş

- Her hesap: 10-20 eşzamanlı arama
- 10 hesap: 100-200 eşzamanlı arama
- Otomatik hesap değiştirme: Bakiye bitince sıradaki hesaba geç
- Asistan kopyalama: Yeni hesapta asistanlar otomatik oluşturulur

**Akış:**
```
Hesap 1 (10 arama) → Bakiye biter
↓
Hesap 2'ye geç (asistanlar otomatik kopyalanır)
↓
Hesap 2 (10 arama) → Bakiye biter
↓
Hesap 3'e geç
...
```

### 4. Horizontal Scaling
- **Supabase Edge Functions**: Her kampanya işleme isteği bağımsız
- **Row-level locking**: Aynı kampanya birden fazla worker tarafından işlenemez
- **Worker ID**: Her işlem benzersiz worker ID ile işaretlenir

### 5. Rate Limiting
```typescript
// Global concurrent call limiti
async checkGlobalRateLimit(): Promise<boolean> {
  const { count } = await supabase
    .from('campaign_items')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'calling');
  
  const { data: settings } = await supabase
    .from('system_settings')
    .select('max_global_concurrent_calls')
    .single();
  
  return count < (settings?.max_global_concurrent_calls || 100);
}
```

### 3. Cost Tracking
```typescript
// Her arama sonrası maliyet hesaplama
async trackCallCost(callId: string, orgId: string) {
  // VAPI'den arama detaylarını al
  const call = await this.vapiClient.getCall(callId);
  
  if (call.cost) {
    // Hesaptan düş
    await this.accountManager.deductCallCost(
      orgId, 
      call.cost, 
      callId
    );
  }
}
```

### 4. Monitoring & Alerting
```typescript
// Supabase Realtime ile canlı izleme
const subscription = supabase
  .channel('campaign-monitor')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'campaigns',
    filter: `organization_id=eq.${orgId}`
  }, (payload) => {
    // UI'da canlı güncelleme
    updateCampaignStatus(payload.new);
  })
  .subscribe();
```

## 📊 Performans Optimizasyonları

1. **Batch Processing**: 100 müşteri için tek seferde 5 arama başlat
2. **Connection Pooling**: Supabase connection pool kullan
3. **Caching**: Redis ile aktif hesap cache'le
4. **Indexing**: Kritik sorgular için index'ler oluştur
5. **Partitioning**: Büyük tablolar için partition (logs, history)

## 🔐 Güvenlik

1. **RLS Policies**: Her organizasyon sadece kendi verilerini görsün
2. **API Key Encryption**: VAPI key'leri encrypted sakla
3. **Rate Limiting**: API endpoint'lere rate limit
4. **Audit Logs**: Tüm kritik işlemleri logla

## 📈 Maliyet Optimizasyonu

1. **Akıllı Hesap Seçimi**: En az harcama yapılmış hesabı kullan
2. **Spending Limit**: Hesap başına harcama limiti
3. **Auto-pause**: Tüm hesaplar bitince otomatik duraklat
4. **Cost Alerts**: Eşik değerlerde bildirim gönder