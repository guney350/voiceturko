/**
 * VAPI API Client
 * Handles all VAPI API interactions
 * SIP Trunk Credential, Phone Number, Assistant, Call management
 */

const VAPI_BASE_URL = 'https://api.vapi.ai';

// =====================================================
// TYPES
// =====================================================

export interface VapiAssistant {
  id: string;
  name: string;
  model?: {
    provider: string;
    model: string;
    messages?: Array<{
      role: string;
      content: string;
    }>;
  };
  voice?: {
    provider: string;
    voiceId: string;
  };
  firstMessage?: string;
  firstMessageMode?: 'assistant-speaks-first' | 'assistant-waits-for-user';
  serverUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VapiPhoneNumber {
  id: string;
  number: string;
  provider: string;
  credentialId?: string;
  name?: string;
  assistantId?: string;
  serverUrl?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VapiCredential {
  id: string;
  provider: string;
  name: string;
  gateways?: Array<{
    ip: string;
    port: number;
    inboundEnabled?: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface VapiCallRequest {
  assistantId: string;
  phoneNumberId: string;
  customer: {
    number: string;
    name?: string;
  };
  assistantOverrides?: {
    variableValues?: Record<string, string>;
  };
}

export interface VapiCallResponse {
  id: string;
  status: string;
  assistantId: string;
  phoneNumberId: string;
  customer: {
    number: string;
  };
  createdAt: string;
}

export interface VapiCallDetail {
  id: string;
  type?: string;
  status: string;
  endedReason?: string;
  assistantId?: string;
  phoneNumberId?: string;
  customer?: {
    number: string;
    name?: string;
  };
  startedAt?: string;
  endedAt?: string;
  cost?: number;
  costBreakdown?: Record<string, unknown>;
  artifact?: {
    recording?: {
      url?: string;
    };
    transcript?: string;
    messages?: Array<{
      role: string;
      message?: string;
      content?: string;
      time?: number;
      duration?: number;
      secondsFromStart?: number;
    }>;
    recordingUrl?: string;
  };
  analysis?: {
    summary?: string;
    successEvaluation?: string;
    structuredData?: Record<string, unknown>;
  };
  createdAt: string;
  updatedAt: string;
}

export interface VapiCredentialRequest {
  provider: 'byo-sip-trunk';
  name: string;
  gateways: Array<{
    ip: string;
    port: number;
    inboundEnabled?: boolean;
  }>;
  outboundLeadingPlusEnabled?: boolean;
  outboundAuthenticationPlan?: {
    authUsername: string;
    authPassword: string;
  };
}

export interface VapiPhoneNumberRequest {
  provider: 'byo-phone-number';
  number: string;
  numberE164CheckEnabled?: boolean;
  credentialId: string;
  name?: string;
  assistantId?: string;
  serverUrl?: string;
}

// =====================================================
// CLIENT
// =====================================================

export class VapiClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    _retries = 3
  ): Promise<T> {
    const url = `${VAPI_BASE_URL}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (response.status === 429 && _retries > 0) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '0', 10)
      const delay = retryAfter > 0 ? retryAfter * 1000 : (4 - _retries) * 2000
      console.log(`[VapiClient] Rate limited, ${delay}ms sonra tekrar denenecek (kalan: ${_retries - 1})`)
      await new Promise(r => setTimeout(r, delay))
      return this.request<T>(endpoint, options, _retries - 1)
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`VAPI API Error: ${response.status} - ${error}`);
    }

    const text = await response.text();
    if (!text) return {} as T;
    
    return JSON.parse(text);
  }

  // =====================================================
  // CREDENTIAL (SIP TRUNK) Methods
  // =====================================================

  async createCredential(data: VapiCredentialRequest): Promise<VapiCredential> {
    return this.request<VapiCredential>('/credential', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCredential(id: string): Promise<VapiCredential> {
    return this.request<VapiCredential>(`/credential/${id}`);
  }

  async deleteCredential(id: string): Promise<void> {
    await this.request<void>(`/credential/${id}`, {
      method: 'DELETE',
    });
  }

  // =====================================================
  // PHONE NUMBER Methods
  // =====================================================

  async createPhoneNumber(data: VapiPhoneNumberRequest): Promise<VapiPhoneNumber> {
    return this.request<VapiPhoneNumber>('/phone-number', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getPhoneNumbers(): Promise<VapiPhoneNumber[]> {
    return this.request<VapiPhoneNumber[]>('/phone-number');
  }

  async getPhoneNumber(id: string): Promise<VapiPhoneNumber> {
    return this.request<VapiPhoneNumber>(`/phone-number/${id}`);
  }

  async deletePhoneNumber(id: string): Promise<void> {
    await this.request<void>(`/phone-number/${id}`, {
      method: 'DELETE',
    });
  }

  // =====================================================
  // ASSISTANT Methods
  // =====================================================

  async getAssistants(): Promise<VapiAssistant[]> {
    return this.request<VapiAssistant[]>('/assistant');
  }

  async getAssistant(id: string): Promise<VapiAssistant> {
    return this.request<VapiAssistant>(`/assistant/${id}`);
  }

  async createAssistant(data: Record<string, unknown>): Promise<VapiAssistant> {
    return this.request<VapiAssistant>('/assistant', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAssistant(
    id: string,
    data: Record<string, unknown>
  ): Promise<VapiAssistant> {
    return this.request<VapiAssistant>(`/assistant/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteAssistant(id: string): Promise<void> {
    await this.request<void>(`/assistant/${id}`, {
      method: 'DELETE',
    });
  }

  // =====================================================
  // TOOL Methods
  // =====================================================

  async createTool(data: Record<string, unknown>): Promise<{ id: string; [key: string]: unknown }> {
    return this.request<{ id: string }>('/tool', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listTools(): Promise<Array<{ id: string; type?: string; function?: { name?: string }; [key: string]: unknown }>> {
    return this.request<Array<{ id: string }>>('/tool');
  }

  async deleteTool(id: string): Promise<void> {
    await this.request<void>(`/tool/${id}`, {
      method: 'DELETE',
    });
  }

  // =====================================================
  // CALL Methods
  // =====================================================

  async createCall(data: VapiCallRequest): Promise<VapiCallResponse> {
    return this.request<VapiCallResponse>('/call', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCall(id: string): Promise<VapiCallDetail> {
    return this.request<VapiCallDetail>(`/call/${id}`);
  }

  async getCalls(params?: {
    limit?: number;
    createdAtGe?: string;
    createdAtLe?: string;
  }): Promise<VapiCallDetail[]> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.createdAtGe) searchParams.set('createdAtGe', params.createdAtGe);
    if (params?.createdAtLe) searchParams.set('createdAtLe', params.createdAtLe);
    
    const query = searchParams.toString();
    return this.request<VapiCallDetail[]>(`/call${query ? `?${query}` : ''}`);
  }
}

/**
 * Create a VAPI client with the given API key
 */
export function createVapiClient(apiKey: string): VapiClient {
  return new VapiClient(apiKey);
}