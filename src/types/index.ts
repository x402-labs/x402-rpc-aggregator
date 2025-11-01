/**
 * Type definitions for x402-RPC-Aggregator
 */

export interface RPCProvider {
  id: string;
  name: string;
  url: string;
  chains: string[];
  costPerCall: number;
  batchCost?: {
    calls: number;
    price: number;
  };
  priority?: number; // Higher = preferred
  healthCheckUrl?: string;
  maxLatencyMs?: number;
  rateLimit?: {
    requestsPerSecond: number;
    requestsPerMinute: number;
  };
  status?: 'active' | 'degraded' | 'offline';
  lastHealthCheck?: Date;
  averageLatency?: number;
  errorRate?: number;
  metadata?: {
    description?: string;
    websiteUrl?: string;
    supportedMethods?: string[];
  };
}

export interface RoutingPreferences {
  strategy?: 'lowest-cost' | 'lowest-latency' | 'highest-priority' | 'round-robin';
  maxLatencyMs?: number;
  maxCostPerCall?: number;
  preferredProviders?: string[];
  excludeProviders?: string[];
  requireHealthy?: boolean;
}

export interface AgentPreferences extends RoutingPreferences {
  chain: string;
  description?: string;
}

export interface PaymentInfo {
  provider: 'solana' | 'evm';
  chain: string;
  txHash?: string;
  amount: number;
  payer?: string;
  timestamp: string;
  explorer?: string;
}

export interface RPCRequest {
  method: string;
  params?: any[];
  chain?: string;
  preferences?: AgentPreferences;
  batch?: boolean;
}

export interface RPCResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  x402?: {
    provider: string;
    paymentInfo: PaymentInfo;
    cost: number;
    status: 'settled' | 'failed';
  };
}

export interface ProviderHealth {
  providerId: string;
  status: 'healthy' | 'degraded' | 'offline';
  latency: number;
  lastCheck: Date;
  consecutiveFailures: number;
}

export interface BatchPayment {
  callsRemaining: number;
  totalCalls: number;
  amountPaid: number;
  expiresAt: Date;
  batchId: string;
}

/**
 * x402scan-compliant types
 * Based on: https://www.x402scan.com/resources/register
 */

export interface FieldDef {
  type?: string;
  required?: boolean | string | string[];
  description?: string;
  enum?: string[];
  properties?: Record<string, FieldDef>; // for nested objects
}

export interface OutputSchema {
  input?: {
    type: string;
    method?: string;
    bodyType?: 'json' | 'form-data' | 'multipart-form-data' | 'text' | 'binary';
    queryParams?: Record<string, FieldDef>;
    bodyFields?: Record<string, FieldDef>;
    headerFields?: Record<string, FieldDef>;
  };
  output?: Record<string, any>;
}

export interface X402Accepts {
  scheme: 'exact';
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  outputSchema?: OutputSchema;
  extra?: Record<string, any>;
}

export interface X402Response {
  x402Version: number;
  error?: string;
  accepts?: X402Accepts[];
  payer?: string;
}

