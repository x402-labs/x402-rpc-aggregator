/**
 * @x402-multichain/facilitator
 * 
 * Self-hosted multichain payment facilitator for x402 protocol
 * Supports Solana and EVM chains with unified interface
 */

// Main facilitator manager (multichain)
export { 
  FacilitatorManager as MultichainFacilitatorManager,
  createFacilitatorManager
} from './manager/facilitator-manager';

// Chain-specific facilitators
export { SolanaFacilitator } from './chains/solana/facilitator';
export { Facilitator as EVMFacilitator } from './chains/evm/facilitator';

// Framework adapters (re-export from adapters)
export { createExpressAdapter } from './adapters/express';
export { createHonoAdapter } from './adapters/hono';

// Types
export type {
  // Manager types
  FacilitatorConfig,
  FacilitatorType,
  IFacilitator,
  VerifyResult,
  SettleResult,
} from './manager/facilitator-manager';

export type {
  // Solana types
  SolanaNetwork,
  PaymentPayload as SolanaPaymentPayload,
  PaymentRequirements as SolanaPaymentRequirements,
  SupportedKind,
} from './chains/solana/facilitator';

export type {
  // EVM types
  CreateFacilitatorOptions as EVMFacilitatorOptions,
  PaymentPayload as EVMPaymentPayload,
  PaymentRequirements as EVMPaymentRequirements,
} from './chains/evm/facilitator';

// Utilities
export { fromViemNameToX402Network } from './chains/evm/utils';

