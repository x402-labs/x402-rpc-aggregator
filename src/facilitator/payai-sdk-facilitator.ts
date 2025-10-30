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
      console.log(`🔍 PayAI SDK: Starting verification`);
      console.log(`   Payment payload:`, Object.keys(paymentPayload));
      console.log(`   Requirements:`, paymentRequirements);

      // Convert our payment payload to x402-solana format
      // The SDK expects the payment header as a string
      const paymentHeader = JSON.stringify({
        paymentPayload,
        paymentRequirements,
      });

      // Mock headers object for SDK
      const mockHeaders = {
        'x-payment': paymentHeader,
      };

      // Create payment requirements in SDK format
      const sdkRequirements = await this.handler.createPaymentRequirements({
        price: {
          amount: String(Math.floor(paymentRequirements.amount * 1e6)), // Convert to micro-USDC
          asset: {
            address: paymentPayload.tokenMint || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mainnet
          },
        },
        network: this.network,
        config: {
          description: paymentRequirements.resource || 'RPC Access',
          resource: paymentRequirements.resource || '/rpc',
        },
      });

      // Verify payment using SDK
      const isValid = await this.handler.verifyPayment(paymentHeader, sdkRequirements);

      console.log(`   Verification result: ${isValid}`);

      if (!isValid) {
        return {
          valid: false,
          error: 'Payment verification failed via PayAI SDK',
        };
      }

      // Extract payer from payment payload
      const payer = paymentPayload.signedIntent?.publicKey || paymentPayload.payer;

      return {
        valid: true,
        buyerPubkey: payer,
        payer,
      };
    } catch (error: any) {
      console.error('❌ PayAI SDK verification error:', error.message);
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
      console.log(`💰 PayAI SDK: Starting settlement`);

      // First verify
      const verifyResult = await this.verifyPayment(paymentPayload, paymentRequirements);
      if (!verifyResult.valid) {
        return {
          settled: false,
          error: verifyResult.error || 'Payment verification failed',
        };
      }

      // Convert to SDK format
      const paymentHeader = JSON.stringify({
        paymentPayload,
        paymentRequirements,
      });

      const sdkRequirements = await this.handler.createPaymentRequirements({
        price: {
          amount: String(Math.floor(paymentRequirements.amount * 1e6)),
          asset: {
            address: paymentPayload.tokenMint || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          },
        },
        network: this.network,
        config: {
          description: paymentRequirements.resource || 'RPC Access',
          resource: paymentRequirements.resource || '/rpc',
        },
      });

      // Settle payment using SDK
      const result = await this.handler.settlePayment(paymentHeader, sdkRequirements);

      console.log(`   Settlement result:`, result);

      // The SDK returns a transaction signature on success
      if (result && typeof result === 'object' && 'transaction' in result) {
        return {
          settled: true,
          txHash: result.transaction,
          transaction: result.transaction,
        };
      }

      // If result is just true/false
      if (result === true) {
        return {
          settled: true,
          txHash: 'settled', // SDK may not return signature in all cases
        };
      }

      return {
        settled: false,
        error: 'Settlement failed',
      };
    } catch (error: any) {
      console.error('❌ PayAI SDK settlement error:', error.message);
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

