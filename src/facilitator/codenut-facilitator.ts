/**
 * CodeNut Facilitator - Integration with CodeNut Pay
 * 
 * Official CodeNut facilitator service for x402 payments
 * Supports both Solana and Base chains
 * 
 * Documentation: https://docs.codenut.ai/guides/x402-facilitator
 * API Endpoints:
 * - GET /supported - List supported payment kinds
 * - POST /verify - Verify payment payload
 * - POST /settle - Settle payment on-chain
 */

import axios from 'axios';

export interface CodeNutFacilitatorConfig {
  facilitatorUrl?: string;
  network?: 'base' | 'solana';
  timeout?: number;
}

export interface VerifyResult {
  valid: boolean;
  isValid?: boolean;
  buyerPubkey?: string;
  payer?: string;
  error?: string;
}

export interface SettleResult {
  settled: boolean;
  success?: boolean;
  txHash?: string;
  transaction?: string;
  error?: string;
  errorReason?: string;
}

export interface SupportedNetworksResponse {
  kinds: Array<{
    x402Version: number;
    scheme: string;
    network: string;
  }>;
}

/**
 * CodeNut Facilitator Implementation
 * 
 * Uses CodeNut's hosted facilitator service for payment verification and settlement.
 * Supports both Solana (USDC) and Base (ETH/USDC) networks.
 */
export class CodeNutFacilitator {
  private baseUrl: string;
  private network: 'base' | 'solana';
  private timeout: number;
  private supportedNetworks: string[] = [];

  constructor(config: CodeNutFacilitatorConfig = {}) {
    this.baseUrl = config.facilitatorUrl || 'https://facilitator.codenut.ai';
    this.network = config.network || 'base'; // Default to Base
    this.timeout = config.timeout || 20000; // default to 20 second timeout (settlement can take longer)

    console.log(`✅ CodeNut Facilitator initialized`);
    console.log(`   Base URL: ${this.baseUrl}`);
    console.log(`   Preferred Network: ${this.network}`);

    // Fetch supported networks on initialization
    this.fetchSupportedNetworks().catch(err => {
      console.warn(`⚠️  Failed to fetch CodeNut supported networks: ${err.message}`);
    });
  }

  /**
   * Fetch supported networks from CodeNut facilitator
   */
  private async fetchSupportedNetworks(): Promise<void> {
    try {
      const response = await axios.get<SupportedNetworksResponse>(
        `${this.baseUrl}/supported`,
        { timeout: 5000 }
      );

      if (response.data?.kinds) {
        this.supportedNetworks = response.data.kinds.map(k => k.network);
        console.log(`   ✅ CodeNut supports networks: ${this.supportedNetworks.join(', ')}`);
      }
    } catch (error: any) {
      console.warn(`   ⚠️  Could not fetch supported networks: ${error.message}`);
      // Default to common networks
      this.supportedNetworks = ['base', 'solana'];
    }
  }

  /**
   * Check if facilitator is available
   */
  isAvailable(): boolean {
    // CodeNut is a hosted service - always available
    return true;
  }

  /**
   * Get supported networks
   */
  getSupportedNetworks(): string[] {
    return this.supportedNetworks.length > 0 ? this.supportedNetworks : ['base', 'solana'];
  }

  /**
   * Verify payment using CodeNut facilitator
   * 
   * Sends payment payload to CodeNut's /verify endpoint for validation.
   * CodeNut will:
   * - Verify signature authenticity
   * - Check payment amount matches requirements
   * - Validate nonce hasn't been used before
   * - Ensure payment hasn't expired
   * 
   * @param paymentPayload - Client's signed payment proof
   * @param paymentRequirements - Server's payment requirements
   * @returns Verification result with payer info
   */
  async verifyPayment(
    paymentPayload: any,
    paymentRequirements: any
  ): Promise<VerifyResult> {
    try {
      console.log(`🔍 CodeNut: Starting payment verification`);
      console.log(`   Network: ${paymentRequirements.network || this.network}`);
      console.log(`   Scheme: ${paymentRequirements.scheme || 'exact'}`);
      console.log(`   Amount: ${paymentRequirements.maxAmountRequired || paymentRequirements.amount}`);

      // Normalize payment requirements for CodeNut API
      const normalizedRequirements = this.normalizePaymentRequirements(paymentRequirements);

      // DETAILED LOGGING: Show exactly what we're sending
      console.log(`📤 CodeNut /verify request:`);
      console.log(`   URL: ${this.baseUrl}/verify`);
      console.log(`   PaymentPayload:`, JSON.stringify(paymentPayload, null, 2).substring(0, 500));
      console.log(`   PaymentRequirements:`, JSON.stringify(normalizedRequirements, null, 2).substring(0, 500));

      // Call CodeNut /verify endpoint - send direct JSON
      const response = await axios.post(
        `${this.baseUrl}/verify`,
        {
          paymentPayload,
          paymentRequirements: normalizedRequirements,
        },
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      console.log(`   📥 CodeNut verify response:`, {
        isValid: response.data.isValid,
        payer: response.data.payer,
        status: response.status,
      });

      // CodeNut returns { isValid, payer, invalidReason? }
      if (!response.data.isValid) {
        console.error(`   ❌ CodeNut rejected verification: ${response.data.invalidReason}`);
        return {
          valid: false,
          isValid: false,
          error: response.data.invalidReason || 'Payment verification failed',
        };
      }

      console.log(`   ✅ CodeNut verified payment from: ${response.data.payer}`);

      return {
        valid: true,
        isValid: true,
        payer: response.data.payer,
        buyerPubkey: response.data.payer,
      };
    } catch (error: any) {
      console.error(`❌ CodeNut verification error:`, error.message);
      
      // Handle specific error cases
      if (error.response) {
        console.error(`   Response status: ${error.response.status}`);
        console.error(`   Response headers:`, error.response.headers);
        console.error(`   Response data type:`, typeof error.response.data);
        console.error(`   Response data (first 200 chars):`, 
          typeof error.response.data === 'string' 
            ? error.response.data.substring(0, 200) 
            : JSON.stringify(error.response.data).substring(0, 200)
        );
        
        const errorMsg = error.response.data?.message || error.response.data?.invalidReason || error.message;
        return {
          valid: false,
          isValid: false,
          error: `CodeNut API error (${error.response.status}): ${errorMsg}`,
        };
      }

      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return {
          valid: false,
          isValid: false,
          error: 'CodeNut facilitator timeout - please try again',
        };
      }

      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        console.error(`   ⚠️  CodeNut facilitator unreachable at ${this.baseUrl}`);
        return {
          valid: false,
          isValid: false,
          error: 'CodeNut facilitator service unreachable - check configuration',
        };
      }

      return {
        valid: false,
        isValid: false,
        error: `CodeNut verification failed: ${error.message}`,
      };
    }
  }

  /**
   * Settle payment using CodeNut facilitator
   * 
   * Sends payment to CodeNut's /settle endpoint for on-chain execution.
   * CodeNut will:
   * - Verify payment again (idempotency check)
   * - Submit transaction to blockchain
   * - Wait for confirmation
   * - Return transaction hash
   * 
   * @param paymentPayload - Client's signed payment proof
   * @param paymentRequirements - Server's payment requirements
   * @returns Settlement result with transaction hash
   */
  async settlePayment(
    paymentPayload: any,
    paymentRequirements: any
  ): Promise<SettleResult> {
    try {
      console.log(`💰 CodeNut: Starting payment settlement`);

      // Normalize payment requirements
      const normalizedRequirements = this.normalizePaymentRequirements(paymentRequirements);

      // Call CodeNut /settle endpoint - send direct JSON
      const response = await axios.post(
        `${this.baseUrl}/settle`,
        {
          paymentPayload,
          paymentRequirements: normalizedRequirements,
        },
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      console.log(`   📥 CodeNut settle response:`, {
        success: response.data.success,
        transaction: response.data.transaction,
        status: response.status,
      });

      // CodeNut returns { success, transaction, errorReason? }
      if (!response.data.success) {
        console.error(`   ❌ CodeNut settlement failed: ${response.data.errorReason}`);
        return {
          settled: false,
          success: false,
          error: response.data.errorReason || 'Payment settlement failed',
          errorReason: response.data.errorReason,
        };
      }

      console.log(`   ✅ CodeNut settled payment: ${response.data.transaction}`);

      return {
        settled: true,
        success: true,
        txHash: response.data.transaction,
        transaction: response.data.transaction,
      };
    } catch (error: any) {
      console.error(`❌ CodeNut settlement error:`, error.message);

      // Handle specific error cases
      if (error.response) {
        const errorMsg = error.response.data?.errorReason || error.response.data?.message || error.message;
        console.error(`   Response error: ${errorMsg}`);
        return {
          settled: false,
          success: false,
          error: errorMsg,
          errorReason: error.response.data?.errorReason,
        };
      }

      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return {
          settled: false,
          success: false,
          error: 'CodeNut facilitator timeout - transaction may still be processing',
        };
      }

      return {
        settled: false,
        success: false,
        error: `CodeNut settlement failed: ${error.message}`,
      };
    }
  }

  /**
   * Normalize payment requirements for CodeNut API
   * 
   * CodeNut expects minimal fields - only send what's necessary
   */
  private normalizePaymentRequirements(requirements: any): any {
    // Start with minimal required fields only
    const normalized: any = {
      scheme: requirements.scheme || 'exact',
      network: requirements.network || this.network,
      payTo: requirements.payTo || requirements.recipient,
    };

    // Handle amount field (support both maxAmountRequired and amount)
    if ('maxAmountRequired' in requirements) {
      normalized.maxAmountRequired = String(requirements.maxAmountRequired);
    } else if ('amount' in requirements) {
      normalized.maxAmountRequired = String(requirements.amount);
    }

    // Handle asset field - CodeNut might expect just the address string
    if (requirements.asset) {
      if (typeof requirements.asset === 'object' && requirements.asset.address) {
        normalized.asset = requirements.asset.address; // Send as string, not object
      } else if (typeof requirements.asset === 'string') {
        normalized.asset = requirements.asset;
      }
    }

    // Required metadata fields for CodeNut schema compliance
    if (requirements.resource) {
      normalized.resource = requirements.resource;
    } else {
      normalized.resource = 'https://x402labs.cloud/rpc';
    }

    if (requirements.description) {
      normalized.description = requirements.description;
    } else {
      normalized.description = 'RPC access';
    }

    if (requirements.mimeType) {
      normalized.mimeType = requirements.mimeType;
    } else {
      normalized.mimeType = 'application/json';
    }

    if (requirements.maxTimeoutSeconds !== undefined) {
      normalized.maxTimeoutSeconds = Number(requirements.maxTimeoutSeconds);
    } else {
      normalized.maxTimeoutSeconds = 60;
    }

    if (requirements.extra) {
      normalized.extra = requirements.extra;
    } else {
      normalized.extra = {};
    }

    console.log(`   Normalized requirements:`, JSON.stringify(normalized, null, 2));

    return normalized;
  }

  /**
   * Get facilitator base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Get preferred network
   */
  getNetwork(): string {
    return this.network;
  }
}

