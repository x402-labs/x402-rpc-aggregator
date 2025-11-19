/**
 * Facilitator Manager - Unified interface for Self-Hosted and PayAI facilitators
 * 
 * Allows users to choose their preferred facilitator via configuration
 */

import { SolanaFacilitator } from './solana-facilitator';
import { PayAISdkFacilitator } from './payai-sdk-facilitator';
import { CodeNutFacilitator } from './codenut-facilitator';
import { CorbitsFacilitator } from './corbits-facilitator';
import axios from 'axios';

export type FacilitatorType = 'x402labs' | 'payai' | 'codenut' | 'corbits' | 'auto';

export interface FacilitatorConfig {
  type: FacilitatorType;
  // Self-hosted config
  solanaPrivateKey?: string;
  evmPrivateKey?: string;
  networks?: any[];
  // PayAI config
  payaiFacilitatorUrl?: string;
  // CodeNut config
  codenutFacilitatorUrl?: string;
  codenutNetwork?: 'base' | 'solana';
  // Corbits config
  corbitsFacilitatorUrl?: string;
  corbitsNetwork?: 'solana' | 'base' | 'polygon' | 'ethereum';
  // Fallback options
  enableFallback?: boolean;
  fallbackType?: 'x402labs' | 'payai' | 'codenut' | 'corbits';
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
 * x402labs Self-Hosted Facilitator
 */
export class SelfHostedFacilitator implements IFacilitator {
  name = 'x402labs';
  type: FacilitatorType = 'x402labs';
  private facilitator: SolanaFacilitator | null = null;

  constructor(config: FacilitatorConfig) {
    if (config.solanaPrivateKey && config.networks) {
      try {
        this.facilitator = new SolanaFacilitator({
          solanaPrivateKey: config.solanaPrivateKey,
          networks: config.networks,
        });
        console.log('✅ x402labs Facilitator initialized');
      } catch (err: any) {
        console.error('❌ x402labs Facilitator init failed:', err.message);
      }
    }
  }

  isAvailable(): boolean {
    return this.facilitator !== null;
  }

  async verifyPayment(paymentPayload: any, paymentRequirements: any): Promise<VerifyResult> {
    if (!this.facilitator) {
      return { valid: false, error: 'x402labs facilitator not available' };
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
      return { settled: false, error: 'x402labs facilitator not available' };
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
 * CodeNut Facilitator Wrapper
 */
export class CodeNutFacilitatorWrapper implements IFacilitator {
  name = 'CodeNut Pay';
  type: FacilitatorType = 'codenut';
  private facilitator: CodeNutFacilitator;

  constructor(config: FacilitatorConfig) {
    this.facilitator = new CodeNutFacilitator({
      facilitatorUrl: config.codenutFacilitatorUrl || 'https://facilitator.codenut.ai',
      network: config.codenutNetwork || 'base',
    });
    console.log(`✅ CodeNut Facilitator initialized`);
  }

  isAvailable(): boolean {
    return this.facilitator.isAvailable();
  }

  async verifyPayment(paymentPayload: any, paymentRequirements: any): Promise<VerifyResult> {
    try {
      console.log(`🔐 CodeNutFacilitator: Starting verification...`);
      const result = await this.facilitator.verifyPayment(paymentPayload, paymentRequirements);
      console.log(`🔐 CodeNutFacilitator: Verification result:`, { valid: result.valid, error: result.error });
      
      return {
        valid: result.valid,
        isValid: result.valid,
        buyerPubkey: result.buyerPubkey || result.payer,
        payer: result.payer || result.buyerPubkey,
        error: result.error,
      };
    } catch (err: any) {
      console.error(`❌ CodeNutFacilitator: Verification exception:`, err.message);
      return { valid: false, error: err.message };
    }
  }

  async settlePayment(paymentPayload: any, paymentRequirements: any): Promise<SettleResult> {
    try {
      console.log(`💰 CodeNutFacilitator: Starting settlement...`);
      const result = await this.facilitator.settlePayment(paymentPayload, paymentRequirements);
      console.log(`💰 CodeNutFacilitator: Settlement result:`, { settled: result.settled, txHash: result.txHash });
      
      return {
        settled: result.settled,
        success: result.settled,
        txHash: result.txHash || result.transaction,
        transaction: result.transaction || result.txHash,
        error: result.error,
        errorReason: result.errorReason,
      };
    } catch (err: any) {
      console.error(`❌ CodeNutFacilitator: Settlement exception:`, err.message);
      return { settled: false, error: err.message };
    }
  }
}

/**
 * Corbits Facilitator Wrapper
 */
export class CorbitsFacilitatorWrapper implements IFacilitator {
  name = 'Corbits';
  type: FacilitatorType = 'corbits';
  private facilitator: CorbitsFacilitator;

  constructor(config: FacilitatorConfig) {
    this.facilitator = new CorbitsFacilitator({
      facilitatorUrl: config.corbitsFacilitatorUrl || 'https://facilitator.corbits.dev',
      network: config.corbitsNetwork || 'solana',
    });
    console.log(`✅ Corbits Facilitator initialized`);
  }

  isAvailable(): boolean {
    return this.facilitator.isAvailable();
  }

  async verifyPayment(paymentPayload: any, paymentRequirements: any): Promise<VerifyResult> {
    try {
      console.log(`🔐 CorbitsFacilitator: Starting verification...`);
      const result = await this.facilitator.verifyPayment(paymentPayload, paymentRequirements);
      console.log(`🔐 CorbitsFacilitator: Verification result:`, { valid: result.valid, error: result.error });
      
      return {
        valid: result.valid,
        isValid: result.valid,
        buyerPubkey: result.buyerPubkey || result.payer,
        payer: result.payer || result.buyerPubkey,
        error: result.error,
      };
    } catch (err: any) {
      console.error(`❌ CorbitsFacilitator: Verification exception:`, err.message);
      return { valid: false, error: err.message };
    }
  }

  async settlePayment(paymentPayload: any, paymentRequirements: any): Promise<SettleResult> {
    try {
      console.log(`💰 CorbitsFacilitator: Starting settlement...`);
      const result = await this.facilitator.settlePayment(paymentPayload, paymentRequirements);
      console.log(`💰 CorbitsFacilitator: Settlement result:`, { settled: result.settled, txHash: result.txHash });
      
      return {
        settled: result.settled,
        success: result.settled,
        txHash: result.txHash || result.transaction,
        transaction: result.transaction || result.txHash,
        error: result.error,
        errorReason: result.errorReason,
      };
    } catch (err: any) {
      console.error(`❌ CorbitsFacilitator: Settlement exception:`, err.message);
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

  async getFeePayer(): Promise<string> {
    if (this.sdkFacilitator) {
      return this.sdkFacilitator.getFeePayer();
    }
    return '2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4';
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
  private payaiFacilitator: PayAIFacilitator | null = null;
  private corbitsFacilitator: CorbitsFacilitatorWrapper | null = null;
  private config: FacilitatorConfig;

  constructor(config: FacilitatorConfig) {
    this.config = config;
    this.initialize();
  }

  private getOrCreatePayAIFacilitator(): PayAIFacilitator {
    if (this.primaryFacilitator?.type === 'payai') {
      return this.primaryFacilitator as PayAIFacilitator;
    }

    if (this.fallbackFacilitator?.type === 'payai') {
      return this.fallbackFacilitator as PayAIFacilitator;
    }

    if (!this.payaiFacilitator) {
      this.payaiFacilitator = new PayAIFacilitator(this.config);
    }

    return this.payaiFacilitator;
  }

  async getPayAIFeePayer(): Promise<string> {
    const payai = this.getOrCreatePayAIFacilitator();
    return payai.getFeePayer();
  }

  private getOrCreateCorbitsFacilitator(): CorbitsFacilitatorWrapper {
    if (this.primaryFacilitator?.type === 'corbits') {
      return this.primaryFacilitator as CorbitsFacilitatorWrapper;
    }

    if (this.fallbackFacilitator?.type === 'corbits') {
      return this.fallbackFacilitator as CorbitsFacilitatorWrapper;
    }

    if (!this.corbitsFacilitator) {
      this.corbitsFacilitator = new CorbitsFacilitatorWrapper(this.config);
    }

    return this.corbitsFacilitator;
  }

  private initialize() {
    const { type, enableFallback, fallbackType } = this.config;

    // Initialize primary facilitator
    if (type === 'x402labs') {
      this.primaryFacilitator = new SelfHostedFacilitator(this.config);
      if (enableFallback) {
        if (fallbackType === 'payai') {
          this.fallbackFacilitator = this.getOrCreatePayAIFacilitator();
        } else if (fallbackType === 'codenut') {
          this.fallbackFacilitator = new CodeNutFacilitatorWrapper(this.config);
        }
      }
    } else if (type === 'payai') {
      this.primaryFacilitator = this.getOrCreatePayAIFacilitator();
      if (enableFallback) {
        if (fallbackType === 'x402labs') {
          this.fallbackFacilitator = new SelfHostedFacilitator(this.config);
        } else if (fallbackType === 'codenut') {
          this.fallbackFacilitator = new CodeNutFacilitatorWrapper(this.config);
        }
      }
    } else if (type === 'codenut') {
      this.primaryFacilitator = new CodeNutFacilitatorWrapper(this.config);
      if (enableFallback) {
        if (fallbackType === 'x402labs') {
        this.fallbackFacilitator = new SelfHostedFacilitator(this.config);
        } else if (fallbackType === 'payai') {
          this.fallbackFacilitator = this.getOrCreatePayAIFacilitator();
        } else if (fallbackType === 'corbits') {
          this.fallbackFacilitator = new CorbitsFacilitatorWrapper(this.config);
        }
      }
    } else if (type === 'corbits') {
      this.primaryFacilitator = new CorbitsFacilitatorWrapper(this.config);
      if (enableFallback) {
        if (fallbackType === 'x402labs') {
          this.fallbackFacilitator = new SelfHostedFacilitator(this.config);
        } else if (fallbackType === 'payai') {
          this.fallbackFacilitator = this.getOrCreatePayAIFacilitator();
        } else if (fallbackType === 'codenut') {
          this.fallbackFacilitator = new CodeNutFacilitatorWrapper(this.config);
        }
      }
    } else if (type === 'auto') {
      // Auto: Try x402labs first, then CodeNut, then PayAI
      const x402labsFacilitator = new SelfHostedFacilitator(this.config);
      if (x402labsFacilitator.isAvailable()) {
        this.primaryFacilitator = x402labsFacilitator;
        this.fallbackFacilitator = new CodeNutFacilitatorWrapper(this.config);
      } else {
        // x402labs not available, try CodeNut with PayAI fallback
        this.primaryFacilitator = new CodeNutFacilitatorWrapper(this.config);
        this.fallbackFacilitator = new PayAIFacilitator(this.config);
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
    forceFacilitator?: 'x402labs' | 'payai' | 'codenut' | 'corbits'
  ): Promise<VerifyResult & { facilitator: string }> {
    // If client forces a specific facilitator, try to honor it
    if (forceFacilitator === 'x402labs') {
      if (this.primaryFacilitator?.type === 'x402labs' && this.primaryFacilitator.isAvailable()) {
        console.log('🎯 Using client-requested x402labs facilitator');
        const result = await this.primaryFacilitator.verifyPayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.primaryFacilitator.name };
      } else if (this.fallbackFacilitator?.type === 'x402labs' && this.fallbackFacilitator.isAvailable()) {
        console.log('🎯 Using fallback x402labs facilitator');
        const result = await this.fallbackFacilitator.verifyPayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.fallbackFacilitator.name };
      } else {
        return { 
          valid: false, 
          isValid: false,
          error: 'x402labs facilitator not available - missing SOLANA_PRIVATE_KEY',
          facilitator: 'x402labs (unavailable)' 
        };
      }
    }
    
    if (forceFacilitator === 'payai') {
      if (this.primaryFacilitator?.type === 'payai' && this.primaryFacilitator.isAvailable()) {
        console.log('🎯 Using client-requested PayAI Network facilitator');
        const result = await this.primaryFacilitator.verifyPayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.primaryFacilitator.name };
      } else if (this.fallbackFacilitator?.type === 'payai' && this.fallbackFacilitator.isAvailable()) {
        console.log('🎯 Using client-requested PayAI Network facilitator (from fallback)');
        const result = await this.fallbackFacilitator.verifyPayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.fallbackFacilitator.name };
      } else {
        console.log('🎯 Using client-requested PayAI Network facilitator (standalone)');
        const payai = this.getOrCreatePayAIFacilitator();
        if (payai) {
          const result = await payai.verifyPayment(paymentPayload, paymentRequirements);
          return { ...result, facilitator: payai.name };
        }
        return { 
          valid: false, 
          isValid: false,
          error: 'PayAI Network facilitator not available',
          facilitator: 'payai (unavailable)' 
        };
      }
    }
    
    if (forceFacilitator === 'codenut') {
      if (this.primaryFacilitator?.type === 'codenut' && this.primaryFacilitator.isAvailable()) {
        console.log('🎯 Using client-requested CodeNut facilitator');
        const result = await this.primaryFacilitator.verifyPayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.primaryFacilitator.name };
      } else if (this.fallbackFacilitator?.type === 'codenut' && this.fallbackFacilitator.isAvailable()) {
        console.log('🎯 Using client-requested CodeNut facilitator (from fallback)');
        const result = await this.fallbackFacilitator.verifyPayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.fallbackFacilitator.name };
      } else {
        return { 
          valid: false, 
          isValid: false,
          error: 'CodeNut facilitator not available',
          facilitator: 'codenut (unavailable)' 
        };
      }
    }
    
    if (forceFacilitator === 'corbits') {
      if (this.primaryFacilitator?.type === 'corbits' && this.primaryFacilitator.isAvailable()) {
        console.log('🎯 Using client-requested Corbits facilitator');
        const result = await this.primaryFacilitator.verifyPayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.primaryFacilitator.name };
      } else if (this.fallbackFacilitator?.type === 'corbits' && this.fallbackFacilitator.isAvailable()) {
        console.log('🎯 Using client-requested Corbits facilitator (from fallback)');
        const result = await this.fallbackFacilitator.verifyPayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.fallbackFacilitator.name };
      } else {
        console.log('🎯 Using client-requested Corbits facilitator (standalone)');
        const corbits = this.getOrCreateCorbitsFacilitator();
        const result = await corbits.verifyPayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: corbits.name };
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
    forceFacilitator?: 'x402labs' | 'payai' | 'codenut' | 'corbits'
  ): Promise<SettleResult & { facilitator: string }> {
    // If client forces a specific facilitator, try to honor it
    if (forceFacilitator === 'x402labs') {
      if (this.primaryFacilitator?.type === 'x402labs' && this.primaryFacilitator.isAvailable()) {
        console.log('🎯 Using client-requested x402labs facilitator');
        const result = await this.primaryFacilitator.settlePayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.primaryFacilitator.name };
      } else if (this.fallbackFacilitator?.type === 'x402labs' && this.fallbackFacilitator.isAvailable()) {
        console.log('🎯 Using fallback x402labs facilitator');
        const result = await this.fallbackFacilitator.settlePayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.fallbackFacilitator.name };
      } else {
        return { 
          settled: false,
          success: false,
          error: 'x402labs facilitator not available - missing SOLANA_PRIVATE_KEY',
          facilitator: 'x402labs (unavailable)' 
        };
      }
    }
    
    if (forceFacilitator === 'payai') {
      if (this.primaryFacilitator?.type === 'payai' && this.primaryFacilitator.isAvailable()) {
        console.log('🎯 Using client-requested PayAI Network facilitator');
        const result = await this.primaryFacilitator.settlePayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.primaryFacilitator.name };
      } else if (this.fallbackFacilitator?.type === 'payai' && this.fallbackFacilitator.isAvailable()) {
        console.log('🎯 Using client-requested PayAI Network facilitator (from fallback)');
        const result = await this.fallbackFacilitator.settlePayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.fallbackFacilitator.name };
      } else {
        console.log('🎯 Using client-requested PayAI Network facilitator (standalone)');
        const payai = this.getOrCreatePayAIFacilitator();
        if (payai) {
          const result = await payai.settlePayment(paymentPayload, paymentRequirements);
          return { ...result, facilitator: payai.name };
        }
        return { 
          settled: false,
          success: false,
          error: 'PayAI Network facilitator not available',
          facilitator: 'payai (unavailable)' 
        };
      }
    }
    
    if (forceFacilitator === 'codenut') {
      if (this.primaryFacilitator?.type === 'codenut' && this.primaryFacilitator.isAvailable()) {
        console.log('🎯 Using client-requested CodeNut facilitator');
        const result = await this.primaryFacilitator.settlePayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.primaryFacilitator.name };
      } else if (this.fallbackFacilitator?.type === 'codenut' && this.fallbackFacilitator.isAvailable()) {
        console.log('🎯 Using client-requested CodeNut facilitator (from fallback)');
        const result = await this.fallbackFacilitator.settlePayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.fallbackFacilitator.name };
      } else {
        return { 
          settled: false,
          success: false,
          error: 'CodeNut facilitator not available',
          facilitator: 'codenut (unavailable)' 
        };
      }
    }
    
    if (forceFacilitator === 'corbits') {
      if (this.primaryFacilitator?.type === 'corbits' && this.primaryFacilitator.isAvailable()) {
        console.log('🎯 Using client-requested Corbits facilitator');
        const result = await this.primaryFacilitator.settlePayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.primaryFacilitator.name };
      } else if (this.fallbackFacilitator?.type === 'corbits' && this.fallbackFacilitator.isAvailable()) {
        console.log('🎯 Using client-requested Corbits facilitator (from fallback)');
        const result = await this.fallbackFacilitator.settlePayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: this.fallbackFacilitator.name };
      } else {
        console.log('🎯 Using client-requested Corbits facilitator (standalone)');
        const corbits = this.getOrCreateCorbitsFacilitator();
        const result = await corbits.settlePayment(paymentPayload, paymentRequirements);
        return { ...result, facilitator: corbits.name };
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
        // Use Helius for facilitator operations to avoid rate limits
        rpcUrl: process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
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
    
    // CodeNut config
    codenutFacilitatorUrl: process.env.CODENUT_FACILITATOR_URL || 'https://facilitator.codenut.ai',
    codenutNetwork: (process.env.CODENUT_NETWORK as 'base' | 'solana') || 'base',
    
    // Fallback config
    enableFallback: process.env.X402_ENABLE_FALLBACK !== 'false',
    fallbackType: (process.env.X402_FALLBACK_TYPE as 'x402labs' | 'payai' | 'codenut') || 'codenut',
  };

  return new FacilitatorManager(config);
}

