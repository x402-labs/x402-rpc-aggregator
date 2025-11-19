/**
 * Corbits Facilitator - Integration with Corbits x402 Facilitator
 * 
 * Official Corbits facilitator service for x402 payments
 * Supports multiple chains: Solana, Base, Polygon, Ethereum, and more
 * 
 * Documentation: https://docs.corbits.dev/about-x402/facilitators
 * Networks: https://docs.corbits.dev/about-corbits/networks
 * 
 * API Endpoints:
 * - GET /supported - List supported payment kinds
 * - POST /verify - Verify payment payload
 * - POST /settle - Settle payment on-chain
 */

import axios from 'axios';

export interface CorbitsFacilitatorConfig {
  facilitatorUrl?: string;
  network?: 'solana' | 'base' | 'polygon' | 'ethereum';
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
 * Corbits Facilitator Implementation
 * 
 * Uses Corbits' hosted facilitator service for payment verification and settlement.
 * Supports multi-chain payments: Solana (USDC/SOL), Base (USDC), Polygon (USDC), and more.
 * 
 * Base URL: https://facilitator.corbits.dev
 */
export class CorbitsFacilitator {
  private baseUrl: string;
  private network: string;
  private timeout: number;
  private supportedNetworks: string[] = [];

  constructor(config: CorbitsFacilitatorConfig = {}) {
    this.baseUrl = config.facilitatorUrl || 'https://facilitator.corbits.dev';
    this.network = config.network || 'solana'; // Default to Solana
    this.timeout = config.timeout || 60000; // 60 second timeout (settlement can take longer on mainnet)
    console.log(`   Timeout: ${this.timeout}ms`);

    console.log(`✅ Corbits Facilitator initialized`);
    console.log(`   Base URL: ${this.baseUrl}`);
    console.log(`   Preferred Network: ${this.network}`);

    // Fetch supported networks on initialization
    this.fetchSupportedNetworks().catch(err => {
      console.warn(`⚠️  Failed to fetch Corbits supported networks: ${err.message}`);
    });
  }

  /**
   * Fetch supported networks from Corbits facilitator
   */
  private async fetchSupportedNetworks(): Promise<void> {
    try {
      const response = await axios.get<SupportedNetworksResponse>(
        `${this.baseUrl}/supported`,
        { timeout: 5000 }
      );

      if (response.data?.kinds) {
        this.supportedNetworks = response.data.kinds.map(k => k.network);
        console.log(`   ✅ Corbits supports networks: ${this.supportedNetworks.join(', ')}`);
      }
    } catch (error: any) {
      console.warn(`   ⚠️  Could not fetch supported networks: ${error.message}`);
      // Default to known supported networks from Corbits docs
      this.supportedNetworks = [
        'solana', 'solana-devnet', 'base', 'base-sepolia', 
        'polygon', 'polygon-amoy', 'ethereum', 'arbitrum', 
        'avalanche-fuji', 'bnb', 'sui', 'sei', 'aptos'
      ];
    }
  }

  /**
   * Check if facilitator is available
   */
  isAvailable(): boolean {
    // Corbits is a hosted service - always available
    return true;
  }

  /**
   * Get supported networks
   */
  getSupportedNetworks(): string[] {
    return this.supportedNetworks.length > 0 ? this.supportedNetworks : ['solana', 'base', 'polygon'];
  }

  /**
   * Verify payment using Corbits facilitator
   * 
   * IMPORTANT: Corbits/Faremeter architecture does NOT have a separate /verify endpoint!
   * From their routes.ts: They only have /supported, /accepts, and /settle
   * 
   * Strategy: Return optimistic validation (check basic payload structure)
   * Actual verification happens during settlement via /settle endpoint
   * 
   * @param paymentPayload - Client's signed payment proof
   * @param paymentRequirements - Server's payment requirements
   * @returns Verification result with payer info
   */
  async verifyPayment(
    paymentPayload: any,
    paymentRequirements: any
  ): Promise<VerifyResult> {
    console.log(`🔍 Corbits: Optimistic verification (Corbits uses /settle for actual verification)`);
    console.log(`   Network: ${paymentRequirements.network || this.network}`);
    console.log(`   Scheme: ${paymentRequirements.scheme || 'exact'}`);
    console.log(`   Amount: ${paymentRequirements.maxAmountRequired || paymentRequirements.amount}`);

    // Basic payload validation
    if (!paymentPayload || !paymentPayload.payload || !paymentPayload.payload.transaction) {
      console.error(`   ❌ Invalid payload structure`);
      return {
        valid: false,
        isValid: false,
        error: 'Invalid payment payload - missing transaction',
      };
    }

    if (!paymentRequirements || !paymentRequirements.payTo) {
      console.error(`   ❌ Invalid requirements`);
      return {
        valid: false,
        isValid: false,
        error: 'Invalid payment requirements - missing payTo',
      };
    }

    // Extract payer from transaction (basic check)
    try {
      const txBytes = Buffer.from(paymentPayload.payload.transaction, 'base64');
      const { VersionedTransaction, Transaction } = require('@solana/web3.js');
      
      let payerPubkey;
      try {
        const vtx = VersionedTransaction.deserialize(txBytes);
        payerPubkey = vtx.message.staticAccountKeys[0]?.toBase58();
      } catch {
        const ltx = Transaction.from(txBytes);
        payerPubkey = ltx.feePayer?.toBase58();
      }

      console.log(`   ✅ Corbits optimistic validation passed`);
      console.log(`   Extracted payer: ${payerPubkey}`);
      console.log(`   ⚠️  Final verification will happen during /settle call`);

      return {
        valid: true,
        isValid: true,
        payer: payerPubkey,
        buyerPubkey: payerPubkey,
      };
    } catch (error: any) {
      console.error(`   ❌ Could not deserialize transaction:`, error.message);
      return {
        valid: false,
        isValid: false,
        error: `Invalid transaction: ${error.message}`,
      };
    }
  }

  /**
   * Settle payment using Corbits facilitator
   * 
   * Corbits/Faremeter uses /settle for BOTH verification and settlement (one-step process).
   * From routes.ts: /settle expects { paymentHeader, paymentRequirements }
   * where paymentHeader is base64-encoded JSON of the payment payload.
   * 
   * Settlement times vary by network:
   * - Solana: ~100ms
   * - Base: ~2s
   * - Polygon: ~5s
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
      console.log(`💰 Corbits: Starting payment settlement (verify + settle combined)`);
      console.log(`   Network: ${paymentRequirements.network || this.network}`);

      // Normalize payment requirements
      const normalizedRequirements = this.normalizePaymentRequirements(paymentRequirements);

      // CRITICAL: Corbits expects paymentHeader (base64-encoded JSON), not paymentPayload
      // From routes.ts and exact/client.ts
      const paymentHeaderJson = JSON.stringify(paymentPayload);
      const paymentHeader = Buffer.from(paymentHeaderJson).toString('base64');

      console.log(`📤 Corbits /settle request:`);
      console.log(`   URL: ${this.baseUrl}/settle`);
      console.log(`   Payment header (base64): ${paymentHeader.substring(0, 80)}...`);
      console.log(`   Requirements:`, JSON.stringify(normalizedRequirements, null, 2).substring(0, 300));

      // Call Corbits /settle endpoint with correct format
      // From routes.ts: expects { x402Version, paymentHeader: string, paymentRequirements: object }
      const response = await axios.post(
        `${this.baseUrl}/settle`,
        {
          x402Version: paymentPayload.x402Version || 1,  // REQUIRED at root level
          paymentHeader: paymentHeader,  // base64-encoded
          paymentRequirements: normalizedRequirements,
        },
        {
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      console.log(`   📥 Corbits settle response:`, {
        success: response.data.success,
        txHash: response.data.txHash,
        status: response.status,
      });

      // Corbits returns { success, txHash, networkId, error? }
      if (!response.data.success) {
        console.error(`   ❌ Corbits settlement failed: ${response.data.error}`);
        return {
          settled: false,
          success: false,
          error: response.data.error || 'Payment settlement failed',
          errorReason: response.data.error,
        };
      }

      console.log(`   ✅ Corbits settled payment: ${response.data.txHash}`);

      return {
        settled: true,
        success: true,
        txHash: response.data.txHash,
        transaction: response.data.txHash,
      };
    } catch (error: any) {
      console.error(`❌ Corbits settlement error:`, error.message);

      // Handle specific error cases
      if (error.response) {
        const errorMsg = error.response.data?.error || error.response.data?.message || error.message;
        console.error(`   Response status: ${error.response.status}`);
        console.error(`   Response error: ${errorMsg}`);
        console.error(`   Response data:`, error.response.data);
        return {
          settled: false,
          success: false,
          error: errorMsg,
          errorReason: error.response.data?.error,
        };
      }

      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return {
          settled: false,
          success: false,
          error: 'Corbits facilitator timeout - transaction may still be processing',
        };
      }

      return {
        settled: false,
        success: false,
        error: `Corbits settlement failed: ${error.message}`,
      };
    }
  }

  /**
   * Normalize payment requirements for Corbits API
   * 
   * Corbits has strict validation and requires these fields:
   * - maxTimeoutSeconds (number)
   * - mimeType (string)
   * - x402Version (number) - sent at root level
   */
  private normalizePaymentRequirements(requirements: any): any {
    // Start with required fields
    const normalized: any = {
      scheme: requirements.scheme || 'exact',
      network: requirements.network || this.network,
      payTo: requirements.payTo || requirements.recipient,
      // REQUIRED by Corbits validation
      mimeType: requirements.mimeType || 'application/json',
      maxTimeoutSeconds: requirements.maxTimeoutSeconds !== undefined 
        ? Number(requirements.maxTimeoutSeconds) 
        : 60,
    };

    // Handle amount field (support both maxAmountRequired and amount)
    if ('maxAmountRequired' in requirements) {
      normalized.maxAmountRequired = String(requirements.maxAmountRequired);
    } else if ('amount' in requirements) {
      normalized.maxAmountRequired = String(requirements.amount);
    }

    // Handle asset field - Corbits expects string format
    if (requirements.asset) {
      if (typeof requirements.asset === 'object' && requirements.asset.address) {
        normalized.asset = requirements.asset.address; // Send as string
      } else if (typeof requirements.asset === 'string') {
        normalized.asset = requirements.asset;
      }
    }

    // Optional metadata fields
    if (requirements.resource) {
      normalized.resource = requirements.resource;
    }

    if (requirements.description) {
      normalized.description = requirements.description;
    }

    // IMPORTANT: For 'exact' scheme, feePayer should be the USER's wallet
    // From verify.ts: Corbits validates tx.feePayer === extra.feePayer
    // Client sends user's wallet as feePayer (since they sign the transaction)
    if (requirements.extra) {
      normalized.extra = requirements.extra;
    } else {
      normalized.extra = {};
    }
    
    // NOTE: Do NOT override feePayer if client already set it
    // The client sets feePayer to their own wallet for 'exact' scheme

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

