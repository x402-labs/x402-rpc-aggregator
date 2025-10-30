/**
 * Facilitator Manager - Unified interface for Self-Hosted and PayAI facilitators
 * 
 * Allows users to choose their preferred facilitator via configuration
 */

import { SolanaFacilitator } from './solana-facilitator';
import { PayAISdkFacilitator } from './payai-sdk-facilitator';
import axios from 'axios';

export type FacilitatorType = 'xlab' | 'payai' | 'auto';

export interface FacilitatorConfig {
  type: FacilitatorType;
  // Self-hosted config
  solanaPrivateKey?: string;
  evmPrivateKey?: string;
  networks?: any[];
  // PayAI config
  payaiFacilitatorUrl?: string;
  // Fallback options
  enableFallback?: boolean;
  fallbackType?: 'xlab' | 'payai';
}

export interface VerifyResult {
  valid?: boolean;
  isValid?: boolean;
  buyerPubkey?: string;
  payer?: string;
  error?: string;
}

export interface SettleResult {
  settled?: boolean;
  success?: boolean;
  txHash?: string;
  transaction?: string;
  error?: string;
  errorReason?: string;
}

/**
 * Abstract Facilitator Interface
 */
export interface IFacilitator {
  name: string;
  type: FacilitatorType;
  verifyPayment(paymentPayload: any, paymentRequirements: any): Promise<VerifyResult>;
  settlePayment(paymentPayload: any, paymentRequirements: any): Promise<SettleResult>;
  isAvailable(): boolean;
}

/**
 * X-Labs Facilitator Wrapper
 */
export class SelfHostedFacilitator implements IFacilitator {
  name = 'X-Labs solana network';
  type: FacilitatorType = 'xlab';
  private facilitator: SolanaFacilitator | null = null;

  constructor(config: FacilitatorConfig) {
    if (config.solanaPrivateKey && config.networks) {
      try {
        this.facilitator = new SolanaFacilitator({
          solanaPrivateKey: config.solanaPrivateKey,
          networks: config.networks,
        });
        console.log('✅ X-Labs Facilitator initialized');
      } catch (err: any) {
        console.error('❌ X-Labs Facilitator init failed:', err.message);
      }
    }
  }

  isAvailable(): boolean {
    return this.facilitator !== null;
  }

  async verifyPayment(paymentPayload: any, paymentRequirements: any): Promise<VerifyResult> {
    if (!this.facilitator) {
      return { valid: false, error: 'X-Labs facilitator not available' };
    }

    try {
      console.log(`🔐 SelfHostedFacilitator: Starting verification...`);
      const result = await this.facilitator.verifyPayment(paymentPayload, paymentRequirements);
      console.log(`🔐 SelfHostedFacilitator: Verification result:`, { valid: result.valid, error: result.error });
      
      return {
        valid: result.valid,
        isValid: result.valid,
        buyerPubkey: result.buyerPubkey,
        payer: result.buyerPubkey,
        error: result.error, // IMPORTANT: Preserve the error message!
      };
    } catch (err: any) {
      console.error(`❌ SelfHostedFacilitator: Verification exception:`, err.message);
      return { valid: false, error: err.message };
    }
  }

  async settlePayment(paymentPayload: any, paymentRequirements: any): Promise<SettleResult> {
    if (!this.facilitator) {
      return { settled: false, error: 'X-Labs facilitator not available' };
    }

    try {
      const result = await this.facilitator.settlePayment(paymentPayload, paymentRequirements);
      return {
        settled: result.settled,
        success: result.settled,
        txHash: result.txHash,
        transaction: result.txHash,
      };
    } catch (err: any) {
      return { settled: false, error: err.message };
    }
  }
}

/**
 * PayAI Facilitator Wrapper - Using Official x402-solana SDK
 */
export class PayAIFacilitator implements IFacilitator {
  name = 'PayAI Network';
  type: FacilitatorType = 'payai';
  private sdkFacilitator: PayAISdkFacilitator | null = null;
  private facilitatorUrl: string;

  constructor(config: FacilitatorConfig) {
    this.facilitatorUrl = config.payaiFacilitatorUrl || 'https://facilitator.payai.network';
    
    // Try to initialize PayAI SDK facilitator
    const treasuryAddress = process.env.X402_WALLET;
    if (treasuryAddress) {
      try {
        this.sdkFacilitator = new PayAISdkFacilitator({
          network: 'solana', // mainnet
          treasuryAddress,
          facilitatorUrl: this.facilitatorUrl,
          defaultToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mainnet
        });
        console.log(`✅ PayAI SDK Facilitator initialized with treasury: ${treasuryAddress}`);
      } catch (err: any) {
        console.warn(`⚠️  PayAI SDK init failed, falling back to HTTP API: ${err.message}`);
      }
    } else {
      console.warn(`⚠️  X402_WALLET not set, PayAI SDK will use HTTP API only`);
    }
  }

  isAvailable(): boolean {
    return true; // PayAI is always available (network service)
  }

  async verifyPayment(paymentPayload: any, paymentRequirements: any): Promise<VerifyResult> {
    // Try SDK first if available
    if (this.sdkFacilitator) {
      try {
        const result = await this.sdkFacilitator.verifyPayment(paymentPayload, paymentRequirements);
        return {
          valid: result.valid,
          isValid: result.valid,
          payer: result.payer || result.buyerPubkey,
          buyerPubkey: result.buyerPubkey || result.payer,
        };
      } catch (err: any) {
        console.warn(`⚠️  PayAI SDK verify failed, trying HTTP fallback: ${err.message}`);
      }
    }

    // Fallback to direct HTTP API
    try {
      const response = await axios.post(
        `${this.facilitatorUrl}/verify`,
        { paymentPayload, paymentRequirements },
        { timeout: 5000 }
      );

      return {
        valid: response.data.isValid,
        isValid: response.data.isValid,
        payer: response.data.payer,
        buyerPubkey: response.data.payer,
      };
    } catch (err: any) {
      console.error('PayAI verify error:', err.message);
      return { 
        valid: false, 
        isValid: false,
        error: err.response?.data?.message || err.message 
      };
    }
  }

  async settlePayment(paymentPayload: any, paymentRequirements: any): Promise<SettleResult> {
    // Try SDK first if available
    if (this.sdkFacilitator) {
      try {
        const result = await this.sdkFacilitator.settlePayment(paymentPayload, paymentRequirements);
        return {
          settled: result.settled,
          success: result.settled,
          txHash: result.txHash || result.transaction,
          transaction: result.transaction || result.txHash,
        };
      } catch (err: any) {
        console.warn(`⚠️  PayAI SDK settle failed, trying HTTP fallback: ${err.message}`);
      }
    }

    // Fallback to direct HTTP API
    try {
      const response = await axios.post(
        `${this.facilitatorUrl}/settle`,
        { paymentPayload, paymentRequirements },
        { timeout: 10000 }
      );

      return {
        settled: response.data.success,
        success: response.data.success,
        txHash: response.data.transaction,
        transaction: response.data.transaction,
        errorReason: response.data.errorReason,
      };
    } catch (err: any) {
      console.error('PayAI settle error:', err.message);
      return { 
        settled: false,
        success: false,
        error: err.response?.data?.message || err.message,
        errorReason: err.response?.data?.errorReason,
      };
    }
  }
}


/**
 * Facilitator Manager - Smart routing between self-hosted and PayAI
 */
export class FacilitatorManager {
  private primaryFacilitator: IFacilitator | null = null;
  private fallbackFacilitator: IFacilitator | null = null;
  private config: FacilitatorConfig;

  constructor(config: FacilitatorConfig) {
    this.config = config;
    this.initialize();
  }

  private initialize() {
    const { type, enableFallback, fallbackType } = this.config;

    // Initialize primary facilitator
    if (type === 'xlab') {
      this.primaryFacilitator = new SelfHostedFacilitator(this.config);
      if (enableFallback && fallbackType === 'payai') {
        this.fallbackFacilitator = new PayAIFacilitator(this.config);
      }
    } else if (type === 'payai') {
      this.primaryFacilitator = new PayAIFacilitator(this.config);
      if (enableFallback && fallbackType === 'xlab') {
        this.fallbackFacilitator = new SelfHostedFacilitator(this.config);
      }
    } else if (type === 'auto') {
      // Auto: Try X-Labs first, fallback to PayAI
      const xlabFacilitator = new SelfHostedFacilitator(this.config);
      if (xlabFacilitator.isAvailable()) {
        this.primaryFacilitator = xlabFacilitator;
        this.fallbackFacilitator = new PayAIFacilitator(this.config);
      } else {
        this.primaryFacilitator = new PayAIFacilitator(this.config);
      }
    }

    this.logConfiguration();
  }

  private logConfiguration() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   Facilitator Configuration            ║');
    console.log('╚════════════════════════════════════════╝');
    
    if (this.primaryFacilitator) {
      console.log(`✅ Primary: ${this.primaryFacilitator.name} (${this.primaryFacilitator.type})`);
      console.log(`   Available: ${this.primaryFacilitator.isAvailable()}`);
    } else {
      console.log('❌ No primary facilitator configured');
    }

    if (this.fallbackFacilitator) {
      console.log(`🔄 Fallback: ${this.fallbackFacilitator.name} (${this.fallbackFacilitator.type})`);
      console.log(`   Available: ${this.fallbackFacilitator.isAvailable()}`);
    }

    console.log('');
  }

  /**
   * Verify payment with automatic fallback (optionally force specific facilitator)
   */
  async verifyPayment(
    paymentPayload: any, 
    paymentRequirements: any, 
    forceFacilitator?: 'xlab' | 'payai'
  ): Promise<VerifyResult & { facilitator: string }> {
    // If client forces a specific facilitator, try to honor it
    if (forceFacilitator === 'xlab') {
      if (this.primaryFacilitator?.type === 'xlab' && this.primaryFacilitator.isAvailable()) {
        console.log('🎯 Using client-requested X-Labs facilitator');
        const result = await this.primaryFacilitator.verifyPayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.primaryFacilitator.name };
      } else if (this.fallbackFacilitator?.type === 'xlab' && this.fallbackFacilitator.isAvailable()) {
        console.log('🎯 Using fallback X-Labs facilitator');
        const result = await this.fallbackFacilitator.verifyPayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.fallbackFacilitator.name };
      } else {
        return { 
          valid: false, 
          isValid: false,
          error: 'X-Labs facilitator not available - missing SOLANA_PRIVATE_KEY',
          facilitator: 'xlab (unavailable)' 
        };
      }
    }
    
    // Try primary
    if (this.primaryFacilitator?.isAvailable()) {
      const result = await this.primaryFacilitator.verifyPayment(paymentPayload, paymentRequirements);
      if (result.valid || result.isValid) {
        return { ...result, facilitator: this.primaryFacilitator.name };
      }
      console.warn(`⚠️  Primary facilitator verification failed, trying fallback...`);
    }

    // Try fallback
    if (this.fallbackFacilitator?.isAvailable()) {
      console.log(`🔄 Using fallback facilitator: ${this.fallbackFacilitator.name}`);
      const result = await this.fallbackFacilitator.verifyPayment(paymentPayload, paymentRequirements);
      return { ...result, facilitator: this.fallbackFacilitator.name };
    }

    return { 
      valid: false, 
      isValid: false,
      error: 'No facilitator available',
      facilitator: 'none' 
    };
  }

  /**
   * Settle payment with automatic fallback (optionally force specific facilitator)
   */
  async settlePayment(
    paymentPayload: any, 
    paymentRequirements: any,
    forceFacilitator?: 'xlab' | 'payai'
  ): Promise<SettleResult & { facilitator: string }> {
    // If client forces a specific facilitator, try to honor it
    if (forceFacilitator === 'xlab') {
      if (this.primaryFacilitator?.type === 'xlab' && this.primaryFacilitator.isAvailable()) {
        console.log('🎯 Using client-requested X-Labs facilitator');
        const result = await this.primaryFacilitator.settlePayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.primaryFacilitator.name };
      } else if (this.fallbackFacilitator?.type === 'xlab' && this.fallbackFacilitator.isAvailable()) {
        console.log('🎯 Using fallback X-Labs facilitator');
        const result = await this.fallbackFacilitator.settlePayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.fallbackFacilitator.name };
      } else {
        return { 
          settled: false,
          success: false,
          error: 'X-Labs facilitator not available - missing SOLANA_PRIVATE_KEY',
          facilitator: 'xlab (unavailable)' 
        };
      }
    }
    
    // Try primary
    if (this.primaryFacilitator?.isAvailable()) {
      const result = await this.primaryFacilitator.settlePayment(paymentPayload, paymentRequirements);
      if (result.settled || result.success) {
        return { ...result, facilitator: this.primaryFacilitator.name };
      }
      console.warn(`⚠️  Primary facilitator settlement failed, trying fallback...`);
    }

    // Try fallback
    if (this.fallbackFacilitator?.isAvailable()) {
      console.log(`🔄 Using fallback facilitator: ${this.fallbackFacilitator.name}`);
      const result = await this.fallbackFacilitator.settlePayment(paymentPayload, paymentRequirements);
      return { ...result, facilitator: this.fallbackFacilitator.name };
    }

    return { 
      settled: false,
      success: false,
      error: 'No facilitator available',
      facilitator: 'none' 
    };
  }

  /**
   * Get current facilitator info
   */
  getInfo() {
    return {
      primary: {
        name: this.primaryFacilitator?.name,
        type: this.primaryFacilitator?.type,
        available: this.primaryFacilitator?.isAvailable(),
      },
      fallback: this.fallbackFacilitator ? {
        name: this.fallbackFacilitator.name,
        type: this.fallbackFacilitator.type,
        available: this.fallbackFacilitator.isAvailable(),
      } : null,
    };
  }

  /**
   * Switch facilitator on the fly
   */
  switchFacilitator() {
    if (this.fallbackFacilitator) {
      const temp = this.primaryFacilitator;
      this.primaryFacilitator = this.fallbackFacilitator;
      this.fallbackFacilitator = temp;
      console.log(`🔄 Switched to ${this.primaryFacilitator?.name}`);
    }
  }
}

/**
 * Factory function to create facilitator based on environment
 */
export function createFacilitatorManager(): FacilitatorManager {
  const config: FacilitatorConfig = {
    type: (process.env.X402_FACILITATOR_TYPE as FacilitatorType) || 'auto',
    
    // Self-hosted config
    solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
    evmPrivateKey: process.env.EVM_PRIVATE_KEY,
    networks: [
      {
        name: 'solana-mainnet',
        rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
        cluster: 'mainnet-beta',
      },
      {
        name: 'solana-devnet',
        rpcUrl: 'https://api.devnet.solana.com',
        cluster: 'devnet',
      },
    ],
    
    // PayAI config
    payaiFacilitatorUrl: process.env.PAYAI_FACILITATOR_URL || 'https://facilitator.payai.network',
    
    // Fallback config
    enableFallback: process.env.X402_ENABLE_FALLBACK !== 'false',
    fallbackType: (process.env.X402_FALLBACK_TYPE as 'xlab' | 'payai') || 'payai',
  };

  return new FacilitatorManager(config);
}

