/**
 * Unified type definitions for multichain facilitator
 */

// Re-export x402 types
export type * from './x402';

// Common interfaces
export interface ChainNetwork {
  name: string;
  rpcUrl: string;
}

export interface PaymentVerification {
  valid: boolean;
  isValid?: boolean;
  payer?: string;
  buyerPubkey?: string;
  error?: string;
}

export interface PaymentSettlement {
  settled: boolean;
  success?: boolean;
  txHash?: string;
  transaction?: string;
  error?: string;
  errorReason?: string;
}

export type SupportedChain = 'solana' | 'ethereum' | 'base' | 'polygon' | 'arbitrum' | 'optimism';

export interface MultichainPaymentPayload {
  chain: SupportedChain;
  network: string;
  [key: string]: any;
}

export interface MultichainPaymentRequirements {
  chain: SupportedChain;
  network: string;
  amount: number;
  recipient: string;
  nonce: string;
  resource?: string;
  [key: string]: any;
}

