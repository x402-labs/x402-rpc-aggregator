/**
 * PayAI SDK Facilitator - Using official x402-solana package
 * 
 * Integrates with PayAI Network using their official SDK
 * Reference: https://github.com/PayAINetwork/x402-solana
 */

// Import from server subpath (CommonJS export)
const x402Solana = require('x402-solana/server');
const X402PaymentHandler = x402Solana.X402PaymentHandler;

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
 * PayAI Facilitator using official x402-solana SDK
 */
export class PayAISdkFacilitator {
  private handler: any; // X402PaymentHandler instance
  private network: 'solana' | 'solana-devnet';
  private treasuryAddress: string;

  constructor(config: PayAISdkFacilitatorConfig) {
    this.network = config.network;
    this.treasuryAddress = config.treasuryAddress;

    // Initialize X402PaymentHandler from official SDK
    this.handler = new X402PaymentHandler({
      network: config.network,
      treasuryAddress: config.treasuryAddress,
      facilitatorUrl: config.facilitatorUrl || 'https://facilitator.payai.network',
      rpcUrl: config.rpcUrl,
      defaultToken: config.defaultToken, // USDC mint
    });

    console.log(`✅ PayAI SDK Facilitator initialized`);
    console.log(`   Network: ${config.network}`);
    console.log(`   Treasury: ${config.treasuryAddress}`);
    console.log(`   Facilitator: ${config.facilitatorUrl || 'https://facilitator.payai.network'}`);
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
          const tx = Transaction.from(txBytes);
          payerPublicKey = tx.feePayer?.toBase58();
          console.log(`   Extracted payer from transaction: ${payerPublicKey}`);
        }
      } catch (err: any) {
        console.warn(`   Could not extract payer from transaction:`, err.message);
      }

      // CRITICAL: Normalize requirements for PayAI facilitator
      const sdkRequirements: any = {
        scheme: paymentRequirements.scheme,
        network: paymentRequirements.network || this.network,
        payTo: paymentRequirements.payTo || this.treasuryAddress,
        resource: paymentRequirements.resource || '',
        description: paymentRequirements.description || 'Payment via x402',
        mimeType: paymentRequirements.mimeType || 'application/json',
        maxTimeoutSeconds: paymentRequirements.maxTimeoutSeconds || 300,
        extra: paymentRequirements.extra || {},
        // CRITICAL: Normalize asset to OBJECT (facilitator expects { address: string })
        asset: {
          address: typeof paymentRequirements.asset === 'object' 
            ? paymentRequirements.asset.address 
            : paymentRequirements.asset || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
        },
      };

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

      console.log(`🌐 Calling PayAI x402-solana SDK verifyPayment()...`);
      console.log(`   SDK: x402-solana (https://github.com/PayAINetwork/x402-solana)`);
      
      // Per https://github.com/PayAINetwork/x402-solana#server
      // verifyPayment(header: string, requirements: PaymentRequirements)
      const paymentHeaderJson = JSON.stringify(paymentPayload);
      const paymentHeader = Buffer.from(paymentHeaderJson).toString('base64');
      
      console.log(`   Payment Header (base64, first 100 chars):`, paymentHeader.substring(0, 100) + '...');
      console.log(`   SDK Requirements:`, JSON.stringify(sdkRequirements, null, 2).substring(0, 400));
      
      // Use PayAI x402-solana SDK's verifyPayment method
      // The SDK internally calls https://facilitator.payai.network/verify
      console.log(`📤 Calling this.handler.verifyPayment()...`);
      console.log(`   Handler type:`, typeof this.handler);
      console.log(`   Handler.verifyPayment type:`, typeof this.handler.verifyPayment);
      
      let result;
      try {
        result = await this.handler.verifyPayment(paymentHeader, sdkRequirements);
        console.log(`   PayAI SDK result type:`, typeof result);
        console.log(`   PayAI SDK result:`, JSON.stringify(result, null, 2));
      } catch (sdkError: any) {
        console.error(`   ❌ SDK verifyPayment threw error:`, sdkError);
        console.error(`   Error message:`, sdkError.message);
        console.error(`   Error stack:`, sdkError.stack);
        return {
          valid: false,
          error: `SDK error: ${sdkError.message}`,
        };
      }

      if (!result || !result.isValid) {
        console.error(`❌ PayAI Network rejected verification`);
        console.error(`   Result:`, result);
        console.error(`   Invalid reason:`, result?.invalidReason);
        console.error(`   Treasury we sent:`, this.treasuryAddress);
        console.error(`   PaymentPayload keys:`, Object.keys(paymentPayload));
        
        return {
          valid: false,
          error: result?.invalidReason || 'Payment verification failed via PayAI Network',
        };
      }

      console.log(`✅ PayAI Network verification successful!`);

      return {
        valid: true,
        buyerPubkey: payerPublicKey || 'unknown',
        payer: payerPublicKey || 'unknown',
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

      // CRITICAL: Use same normalization as verify
      const sdkRequirements: any = {
        scheme: paymentRequirements.scheme,
        network: paymentRequirements.network || this.network,
        payTo: paymentRequirements.payTo || this.treasuryAddress,
        resource: paymentRequirements.resource || '',
        description: paymentRequirements.description || 'Payment via x402',
        mimeType: paymentRequirements.mimeType || 'application/json',
        maxTimeoutSeconds: paymentRequirements.maxTimeoutSeconds || 300,
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

      // CRITICAL: PayAI SDK expects base64-encoded payment header string (same as verify)
      const paymentHeaderJson = JSON.stringify(paymentPayload);
      const paymentHeader = Buffer.from(paymentHeaderJson).toString('base64');

      console.log(`🌐 Calling PayAI SDK settlePayment method...`);
      console.log(`   Payment Header (base64):`, paymentHeader.substring(0, 100) + '...');
      console.log(`   SDK Requirements:`, JSON.stringify(sdkRequirements, null, 2).substring(0, 400));

      // Use PayAI SDK's settlePayment method
      const result = await this.handler.settlePayment(paymentHeader, sdkRequirements);

      console.log(`   PayAI Network settlement result:`, result);

      // PayAI SDK returns SettleResponse: { success, transaction, errorReason }
      if (result && result.success && result.transaction) {
        console.log(`✅ Payment settled by PayAI Network: ${result.transaction}`);
        return {
          settled: true,
          txHash: result.transaction,
          transaction: result.transaction,
        };
      }

      return {
        settled: false,
        error: result?.errorReason || 'Settlement failed via PayAI Network',
      };
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
}

