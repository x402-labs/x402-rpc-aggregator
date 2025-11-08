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
      console.log(`🔍 PayAI: Starting LOCAL verification (not using PayAI Network)`);
      console.log(`   Payment payload:`, Object.keys(paymentPayload));
      console.log(`   Requirements:`, paymentRequirements);

      // Verify signature locally using nacl instead of calling PayAI Network
      // This is because we sign a different message format than what PayAI SDK expects
      const nacl = require('tweetnacl');
      const bs58 = require('bs58');

      const { signedIntent } = paymentPayload;
      if (!signedIntent?.publicKey || !signedIntent?.signature) {
        return {
          valid: false,
          error: 'Missing signedIntent publicKey or signature'
        };
      }

      // Ensure signature is a string (might be Buffer from JSON parsing)
      if (Buffer.isBuffer(signedIntent.signature)) {
        console.log(`⚠️  Signature is Buffer, converting to base58...`);
        signedIntent.signature = bs58.encode(signedIntent.signature);
      } else if (signedIntent.signature instanceof Uint8Array) {
        console.log(`⚠️  Signature is Uint8Array, converting to base58...`);
        signedIntent.signature = bs58.encode(signedIntent.signature);
      } else if (typeof signedIntent.signature !== 'string') {
        console.log(`⚠️  Signature is ${typeof signedIntent.signature}, converting to string...`);
        signedIntent.signature = String(signedIntent.signature);
      }
      console.log(`   Signature type: ${typeof signedIntent.signature}, length: ${signedIntent.signature.length}`);

      // Step 1: Reconstruct the message that was signed
      // Client signed: {amount, to, nonce, resource}
      const intentMessage = JSON.stringify({
        amount: paymentRequirements.amount,
        to: paymentRequirements.recipient,
        nonce: paymentRequirements.nonce,
        resource: paymentRequirements.resource
      });
      
      console.log(`🔐 Verifying signature locally...`);
      console.log(`   Message that was signed:`, intentMessage);

      // Step 2: Convert to bytes for verification
      const messageBytes = new TextEncoder().encode(intentMessage);
      const signatureBytes = bs58.decode(signedIntent.signature);
      const publicKeyBytes = bs58.decode(signedIntent.publicKey);

      console.log(`   Message bytes length: ${messageBytes.length}`);
      console.log(`   Signature bytes length: ${signatureBytes.length}`);
      console.log(`   PublicKey bytes length: ${publicKeyBytes.length}`);

      // Step 3: Verify ed25519 signature
      const isValidSignature = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKeyBytes
      );

      console.log(`   Signature verification result: ${isValidSignature}`);

      if (!isValidSignature) {
        console.error(`❌ Signature verification failed!`);
        console.error(`   Expected message: ${intentMessage}`);
        console.error(`   Signature: ${signedIntent.signature.substring(0, 50)}...`);
        console.error(`   PublicKey: ${signedIntent.publicKey}`);
        return {
          valid: false,
          error: 'Invalid payment intent signature',
        };
      }

      console.log(`✅ Signature is valid!`);

      // Extract payer from payment payload
      const payer = signedIntent.publicKey;

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
      // CRITICAL: PayAI SDK expects base64-encoded payment header!
      const paymentHeaderJson = JSON.stringify({
        paymentPayload,
        paymentRequirements,
      });
      const paymentHeader = Buffer.from(paymentHeaderJson).toString('base64');

      const sdkRequirements = await this.handler.createPaymentRequirements({
        price: {
          amount: String(Math.floor(paymentRequirements.amount)), // Already in micro-USDC
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

