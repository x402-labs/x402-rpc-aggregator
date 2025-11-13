/**
 * PayAI SDK Facilitator - Using official x402-solana FacilitatorClient
 * 
 * Integrates with PayAI Network using their official SDK
 * Reference: https://github.com/PayAINetwork/x402-solana
 */

// Import FacilitatorClient from server subpath (CommonJS export)
const { FacilitatorClient } = require('x402-solana/server');

export interface PayAISdkFacilitatorConfig {
  network: 'solana' | 'solana-devnet';
  treasuryAddress: string;
  facilitatorUrl?: string;
  rpcUrl?: string;
  defaultToken?: string;
}

export interface VerifyResult {
  valid: boolean;
  buyerPubkey?: string;
  payer?: string;
  error?: string;
}

export interface SettleResult {
  settled: boolean;
  txHash?: string;
  transaction?: string;
  error?: string;
}

/**
 * PayAI Facilitator using official x402-solana FacilitatorClient
 */
export class PayAISdkFacilitator {
  private handler: any; // FacilitatorClient instance
  private network: 'solana' | 'solana-devnet';
  private treasuryAddress: string;
  private facilitatorUrl: string;

  constructor(config: PayAISdkFacilitatorConfig) {
    this.network = config.network;
    this.treasuryAddress = config.treasuryAddress;
    this.facilitatorUrl = config.facilitatorUrl || 'https://facilitator.payai.network';

    // Initialize FacilitatorClient from official SDK
    // FacilitatorClient is the official way to call PayAI's facilitator service
    this.handler = new FacilitatorClient(this.facilitatorUrl);

    console.log(`✅ PayAI SDK Facilitator initialized`);
    console.log(`   Network: ${config.network}`);
    console.log(`   Treasury: ${config.treasuryAddress}`);
    console.log(`   Facilitator URL: ${this.facilitatorUrl}`);
  }

  /**
   * Verify payment using PayAI SDK
   * 
   * The SDK handles:
   * - Extracting payment header
   * - Verifying with facilitator service
   * - Validating payment requirements
   */
  async verifyPayment(
    paymentPayload: any,
    paymentRequirements: any
  ): Promise<VerifyResult> {
    try {
      console.log(`🔍 PayAI Network: Starting verification via facilitator service`);
      console.log(`   Payment payload:`, Object.keys(paymentPayload));
      console.log(`   Requirements:`, paymentRequirements);

      // Use PayAI Network facilitator service for verification
      const bs58 = require('bs58');
      const { Transaction } = require('@solana/web3.js');
      
      // Extract transaction to get payer info

      let payerPublicKey;
      try {
        if (paymentPayload.payload?.transaction) {
          const txBytes = Buffer.from(paymentPayload.payload.transaction, 'base64');
          
          // Try VersionedTransaction first (v0), then fall back to legacy Transaction
          let payerKey: any = null;
          try {
            const { VersionedTransaction } = require('@solana/web3.js');
            const versionedTx = VersionedTransaction.deserialize(txBytes);
            // For VersionedTransaction, payer is the first static account
            payerKey = versionedTx.message.staticAccountKeys[0];
          } catch (versionedErr) {
            // Fall back to legacy Transaction
            try {
              const tx = Transaction.from(txBytes);
              payerKey = tx.feePayer;
            } catch (legacyErr) {
              console.warn(`   Could not deserialize as VersionedTransaction or legacy Transaction`);
            }
          }
          
          if (payerKey) {
            payerPublicKey = payerKey.toBase58();
            console.log(`   Extracted payer from transaction: ${payerPublicKey}`);
          }
        }
      } catch (err: any) {
        console.warn(`   Could not extract payer from transaction:`, err.message);
      }

      // CRITICAL: Normalize requirements for PayAI facilitator
      // Only include fields that PayAI SDK expects, avoid custom fields
      const sdkRequirements: any = {
        scheme: paymentRequirements.scheme,
        network: paymentRequirements.network || this.network,
        payTo: paymentRequirements.payTo || this.treasuryAddress,
        resource: paymentRequirements.resource || '',
        description: paymentRequirements.description || 'Payment via x402',
        extra: paymentRequirements.extra || {},
        // CRITICAL: Normalize asset to OBJECT (facilitator expects { address: string })
          asset: {
          address: typeof paymentRequirements.asset === 'object' 
            ? paymentRequirements.asset.address 
            : paymentRequirements.asset || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
        },
      };
      
      // NOTE: Do NOT add mimeType or maxTimeoutSeconds - these aren't part of ExactSvmPayloadSchema
      // Only include fields that are actually used by the facilitator

      // CRITICAL: Handle amount field based on scheme and what client sent
      if ('maxAmountRequired' in paymentRequirements) {
        sdkRequirements.maxAmountRequired = String(paymentRequirements.maxAmountRequired);
      } else if ('amount' in paymentRequirements) {
        // Alias 'amount' to 'maxAmountRequired' for compatibility
        sdkRequirements.maxAmountRequired = String(paymentRequirements.amount);
      } else {
        console.error(`   Missing maxAmountRequired or amount in requirements:`, paymentRequirements);
        return {
          valid: false,
          error: 'Missing maxAmountRequired or amount in payment requirements',
        };
      }
      
      // Add outputSchema if present
      if (paymentRequirements.outputSchema) {
        sdkRequirements.outputSchema = paymentRequirements.outputSchema;
      }

      console.log(`🌐 Calling PayAI FacilitatorClient.verifyPayment()...`);
      console.log(`   SDK: x402-solana FacilitatorClient (https://github.com/PayAINetwork/x402-solana)`);
      
      // CRITICAL: FacilitatorClient.verifyPayment() expects:
      // - paymentHeader: BASE64-ENCODED STRING of the x402 payment payload
      // - requirements: PaymentRequirements object
      // 
      // The FacilitatorClient will internally:
      // 1. Base64-decode the header to get the x402 payload object
      // 2. Construct the request as { paymentPayload, paymentRequirements }
      // 3. Send to https://facilitator.payai.network/verify
      
      // Create the x402 payment payload (full envelope)
      const x402Payload = {
        x402Version: paymentPayload.x402Version || 1,
        scheme: paymentPayload.scheme,
        network: paymentPayload.network,
        payload: paymentPayload.payload  // Contains the transaction
      };

      // JSON stringify and BASE64 encode (FacilitatorClient expects this format)
      const paymentHeaderJson = JSON.stringify(x402Payload);
      const paymentHeaderBase64 = Buffer.from(paymentHeaderJson).toString('base64');
      
      console.log(`   X402 Payload keys:`, Object.keys(x402Payload).join(', '));
      console.log(`   Payment header (base64): ${paymentHeaderBase64.substring(0, 80)}...`);
      console.log(`   SDK Requirements:`, JSON.stringify(sdkRequirements, null, 2).substring(0, 400));
      
      // Use PayAI FacilitatorClient's verifyPayment method
      // Pass the BASE64-encoded header string
      console.log(`📤 Calling this.handler.verifyPayment()...`);
      console.log(`   Handler type:`, typeof this.handler);
      console.log(`   Handler.verifyPayment type:`, typeof this.handler.verifyPayment);
      console.log(`   Arguments: (base64PaymentHeader: string, sdkRequirements: object)`);
      
      const result = await this.handler.verifyPayment(paymentHeaderBase64, sdkRequirements);
      console.log(`   PayAI SDK result type:`, typeof result);
      console.log(`   PayAI SDK raw result:`, JSON.stringify(result, null, 2));

      // Some versions wrap the facilitator response under a `data` field
      const normalized = result?.data ? result.data : result;
      console.log(`   PayAI SDK normalized result:`, JSON.stringify(normalized, null, 2));

      if (!normalized) {
        console.error(`❌ PayAI Network returned empty result`);
        return {
          valid: false,
          error: 'PayAI facilitator returned empty response',
        };
      }

      if (!normalized.isValid) {
        console.error(`❌ PayAI Network rejected verification`);
        console.error(`   Result:`, normalized);
        console.error(`   Invalid reason:`, normalized?.invalidReason);
        console.error(`   Treasury we sent:`, this.treasuryAddress);
        console.error(`   PaymentPayload keys:`, Object.keys(paymentPayload));
        
        // Attempt HTTP fallback before failing hard
        const fallbackResult = await this.verifyViaHttp(paymentPayload, paymentRequirements);
        return fallbackResult;
      }

      console.log(`✅ PayAI Network verification successful!`);

      return {
        valid: true,
        buyerPubkey: normalized?.payer || payerPublicKey || 'unknown',
        payer: normalized?.payer || payerPublicKey || 'unknown',
      };
    } catch (error: any) {
      console.error('❌ PayAI Network verification error:', error.message);
      return {
        valid: false,
        error: error.message || 'Unknown verification error',
      };
    }
  }

  /**
   * Settle payment using PayAI SDK
   * 
   * The SDK handles:
   * - Settling with facilitator service
   * - Broadcasting transaction
   * - Returning transaction signature
   */
  async settlePayment(
    paymentPayload: any,
    paymentRequirements: any
  ): Promise<SettleResult> {
    try {
      console.log(`💰 PayAI Network: Starting settlement via facilitator service`);

      // First verify
      const verifyResult = await this.verifyPayment(paymentPayload, paymentRequirements);
      if (!verifyResult.valid) {
        return {
          settled: false,
          error: verifyResult.error || 'Payment verification failed',
        };
      }

      // CRITICAL: Use same normalization as verify (no mimeType or maxTimeoutSeconds)
      const sdkRequirements: any = {
        scheme: paymentRequirements.scheme,
        network: paymentRequirements.network || this.network,
        payTo: paymentRequirements.payTo || this.treasuryAddress,
        resource: paymentRequirements.resource || '',
        description: paymentRequirements.description || 'Payment via x402',
        extra: paymentRequirements.extra || {},
        // Normalize asset to OBJECT
          asset: {
          address: typeof paymentRequirements.asset === 'object' 
            ? paymentRequirements.asset.address 
            : paymentRequirements.asset || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
          },
      };

      // Handle amount field
      if ('maxAmountRequired' in paymentRequirements) {
        sdkRequirements.maxAmountRequired = String(paymentRequirements.maxAmountRequired);
      } else if ('amount' in paymentRequirements) {
        sdkRequirements.maxAmountRequired = String(paymentRequirements.amount);
      }
      
      if (paymentRequirements.outputSchema) {
        sdkRequirements.outputSchema = paymentRequirements.outputSchema;
      }

      // CRITICAL: Create the x402 payment payload (full envelope) - same as verify
      // Must be BASE64-encoded string for FacilitatorClient
      const x402Payload = {
        x402Version: paymentPayload.x402Version || 1,
        scheme: paymentPayload.scheme,
        network: paymentPayload.network,
        payload: paymentPayload.payload  // Contains the transaction
      };

      // JSON stringify and BASE64 encode (FacilitatorClient expects this format)
      const paymentHeaderJson = JSON.stringify(x402Payload);
      const paymentHeaderBase64 = Buffer.from(paymentHeaderJson).toString('base64');

      console.log(`🌐 Calling PayAI FacilitatorClient.settlePayment method...`);
      console.log(`   Passing base64-encoded payment header string`);
      console.log(`   SDK Requirements:`, JSON.stringify(sdkRequirements, null, 2).substring(0, 400));

      // Use PayAI FacilitatorClient's settlePayment method
      // Pass the BASE64-encoded header string
      const sdkResult = await this.handler.settlePayment(paymentHeaderBase64, sdkRequirements);

      console.log(`   PayAI Network raw settlement result:`, sdkResult);

      const normalized = sdkResult?.data ? sdkResult.data : sdkResult;
      console.log(`   PayAI Network normalized settlement result:`, normalized);

      // PayAI SDK returns SettleResponse: { success, transaction, errorReason }
      if (normalized && normalized.success && normalized.transaction) {
        console.log(`✅ Payment settled by PayAI Network: ${normalized.transaction}`);
        return {
          settled: true,
          txHash: normalized.transaction,
          transaction: normalized.transaction,
        };
      }

      // HTTP fallback
      const fallbackResult = await this.settleViaHttp(paymentPayload, paymentRequirements);
      if (fallbackResult.settled) {
        return fallbackResult;
      }

      return fallbackResult;
    } catch (error: any) {
      console.error('❌ PayAI Network settlement error:', error.message);
      return {
        settled: false,
        error: error.message || 'Unknown settlement error',
      };
    }
  }

  /**
   * Get treasury address
   */
  getTreasuryAddress(): string {
    return this.treasuryAddress;
  }

  /**
   * Get network
   */
  getNetwork(): string {
    return this.network;
  }

  private async verifyViaHttp(paymentPayload: any, paymentRequirements: any): Promise<VerifyResult> {
    try {
      const axios = require('axios');
      
      // Build the exact request for detailed logging
      const requestBody = { paymentPayload, paymentRequirements };
      
      console.log(`   📡 HTTP Verify Request to: ${this.facilitatorUrl}/verify`);
      console.log(`   Request body keys: ${Object.keys(requestBody).join(', ')}`);
      console.log(`   Payload keys: ${Object.keys(requestBody.paymentPayload || {}).join(', ')}`);
      console.log(`   Requirements keys: ${Object.keys(requestBody.paymentRequirements || {}).join(', ')}`);
      
      const response = await axios.post(
        `${this.facilitatorUrl}/verify`,
        requestBody,
        { timeout: 5000 }
      );

      return {
        valid: response.data.isValid,
        buyerPubkey: response.data.payer,
        payer: response.data.payer,
        error: response.data.isValid ? undefined : response.data.invalidReason || response.data.message,
      };
    } catch (err: any) {
      console.error('   ❌ HTTP verify fallback failed:', err.message);
      if (err.response?.status) {
        console.error(`   HTTP Status: ${err.response.status}`);
        console.error(`   Response: ${JSON.stringify(err.response.data)}`);
      }
      return {
        valid: false,
        error: err.response?.data?.invalidReason || err.response?.data?.message || err.message,
      };
    }
  }

  private async settleViaHttp(paymentPayload: any, paymentRequirements: any): Promise<SettleResult> {
    try {
      const axios = require('axios');
      const response = await axios.post(
        `${this.facilitatorUrl}/settle`,
        { paymentPayload, paymentRequirements },
        { timeout: 10000 }
      );

      if (response.data?.success) {
        return {
          settled: true,
          txHash: response.data.transaction,
          transaction: response.data.transaction,
        };
      }

      return {
        settled: false,
        error: response.data?.errorReason || response.data?.message || 'Settlement failed via PayAI Network',
      };
    } catch (err: any) {
      console.error('   ❌ HTTP settle fallback failed:', err.message);
      return {
        settled: false,
        error: err.response?.data?.errorReason || err.response?.data?.message || err.message,
      };
    }
  }
}

