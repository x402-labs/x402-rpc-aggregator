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

