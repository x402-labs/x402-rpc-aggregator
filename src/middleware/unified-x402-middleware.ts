/**
 * Unified x402 Middleware - Works with x402labs or PayAI facilitators
 * 
 * Supports:
 * - x402labs Solana facilitator
 * - PayAI Network facilitator
 * - Automatic fallback between them
 * - Batch payment management
 */

import { NextFunction, Request, Response } from 'express';
import { FacilitatorManager } from '../facilitator/facilitator-manager';
import { IntelligentRouter } from '../router';
import { ProviderRegistry } from '../providers/provider-registry';
import { BatchPayment, X402Response, X402Accepts, RPCProvider } from '../types';
import { jupiterOracle } from '../pricing/jupiter-oracle';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';

export interface X402Request extends Request {
  x402?: {
    valid: boolean;
    txHash?: string;
    chain: string;
    facilitator: string;
    payer?: string;
    batchId?: string;
  };
}

// Batch payment storage (in production, use Redis or database)
const batchPayments = new Map<string, BatchPayment>();

// Solana connection for token account queries (lazy initialization)
let solanaConnection: Connection | null = null;

function getSolanaConnection(): Connection {
  if (!solanaConnection) {
    solanaConnection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
  }
  return solanaConnection;
}

/**
 * Detect off-curve address and find token account
 * Returns token account address if found, undefined otherwise
 */
async function findTokenAccountForOffCurveAddress(
  address: string,
  mint: PublicKey,
  connection: Connection
): Promise<string | undefined> {
  try {
    const ownerPubkey = new PublicKey(address);
    
    // Try to derive ATA - if it throws TokenOwnerOffCurveError, address is off-curve
    try {
      await getAssociatedTokenAddress(mint, ownerPubkey);
      // If successful, address is on-curve - no token account needed
      return undefined;
    } catch (error: any) {
      // Check if it's an off-curve error
      if (error?.name === 'TokenOwnerOffCurveError' || 
          error?.message?.includes('off-curve') ||
          error?.message?.includes('TokenOwnerOffCurve')) {
        // Address is off-curve - find existing token account
        console.log(`   🔍 Address ${address.substring(0, 8)}... is off-curve, searching for token account...`);
        
        try {
          // Use Connection RPC method to get token accounts
          const tokenAccounts = await connection.getTokenAccountsByOwner(
            ownerPubkey,
            {
              mint: mint
            }
          );
          
          if (tokenAccounts.value.length > 0) {
            const tokenAccount = tokenAccounts.value[0].pubkey.toBase58();
            console.log(`   ✅ Found token account: ${tokenAccount}`);
            return tokenAccount;
          } else {
            console.log(`   ⚠️  No token account found for off-curve address`);
            return undefined;
          }
        } catch (queryError: any) {
          console.warn(`   ⚠️  Error querying token accounts: ${queryError.message}`);
          return undefined;
        }
      }
      // Other errors - re-throw
      throw error;
    }
  } catch (error: any) {
    console.warn(`   ⚠️  Error checking address ${address}: ${error.message}`);
    return undefined;
  }
}

/**
 * Enrich payment details with token accounts for off-curve addresses
 */
async function enrichWithTokenAccounts(
  payTo: string,
  asset: string,
  chain: string,
  payerAddress?: string
): Promise<Record<string, any>> {
  const extra: Record<string, any> = {};
  
  // Only for Solana USDC payments
  if (chain !== 'solana' || (asset !== 'USDC' && asset !== 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')) {
    return extra;
  }
  
  const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  const connection = getSolanaConnection();
  
  // Check payTo (recipient) address
  console.log(`🔍 Checking payTo address for token account: ${payTo.substring(0, 8)}...`);
  
  // First check if address is on-curve
  let isPayToOnCurve = true;
  try {
    await getAssociatedTokenAddress(USDC_MINT, new PublicKey(payTo));
  } catch (error: any) {
    if (error?.name === 'TokenOwnerOffCurveError' || 
        error?.message?.includes('off-curve') ||
        error?.message?.includes('TokenOwnerOffCurve')) {
      isPayToOnCurve = false;
    }
  }
  
  if (isPayToOnCurve) {
    // On-curve: derive ATA address (even if it doesn't exist on-chain yet)
    // The SDK can use this address and create it if needed
    try {
      const ataAddress = await getAssociatedTokenAddress(USDC_MINT, new PublicKey(payTo));
      extra.recipientTokenAccount = ataAddress.toBase58();
      console.log(`   ✅ PayTo is on-curve, using ATA: ${ataAddress.toBase58()}`);
    } catch (error: any) {
      console.warn(`   ⚠️  Could not derive ATA for payTo: ${error.message}`);
    }
  } else {
    // Off-curve: find existing token account
    const recipientTokenAccount = await findTokenAccountForOffCurveAddress(
      payTo,
      USDC_MINT,
      connection
    );
    if (recipientTokenAccount) {
      extra.recipientTokenAccount = recipientTokenAccount;
      console.log(`   ✅ Added recipientTokenAccount to 402 response`);
    } else {
      console.warn(`   ⚠️  PayTo is off-curve but no token account found - payment may fail`);
    }
  }
  
  // Check payer address (if provided in request)
  if (payerAddress) {
    console.log(`🔍 Checking payer address for token account: ${payerAddress.substring(0, 8)}...`);
    
    // First check if address is on-curve
    let isPayerOnCurve = true;
    try {
      await getAssociatedTokenAddress(USDC_MINT, new PublicKey(payerAddress));
    } catch (error: any) {
      if (error?.name === 'TokenOwnerOffCurveError' || 
          error?.message?.includes('off-curve') ||
          error?.message?.includes('TokenOwnerOffCurve')) {
        isPayerOnCurve = false;
      }
    }
    
    if (isPayerOnCurve) {
      // On-curve: derive ATA address (even if it doesn't exist on-chain yet)
      try {
        const ataAddress = await getAssociatedTokenAddress(USDC_MINT, new PublicKey(payerAddress));
        extra.payerTokenAccount = ataAddress.toBase58();
        console.log(`   ✅ Payer is on-curve, using ATA: ${ataAddress.toBase58()}`);
      } catch (error: any) {
        console.warn(`   ⚠️  Could not derive ATA for payer: ${error.message}`);
      }
    } else {
      // Off-curve: find existing token account
      const payerTokenAccount = await findTokenAccountForOffCurveAddress(
        payerAddress,
        USDC_MINT,
        connection
      );
      if (payerTokenAccount) {
        extra.payerTokenAccount = payerTokenAccount;
        console.log(`   ✅ Added payerTokenAccount to 402 response`);
      } else {
        console.warn(`   ⚠️  Payer is off-curve but no token account found - payment may fail`);
      }
    }
  }
  
  return extra;
}

/**
 * Create unified x402 middleware
 */
export function createUnifiedX402Middleware(
  facilitatorManager: FacilitatorManager,
  providerRegistry: ProviderRegistry,
  router: IntelligentRouter
) {
  return async function unifiedX402Middleware(
    req: X402Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { chain = 'solana', preferences, facilitator: clientFacilitator } = req.body;
      const paymentHeader = req.headers['x402-payment'] as string | undefined;
      const batchHeader = req.headers['x402-batch'] as string | undefined;
      
      // Log client's facilitator preference
      if (clientFacilitator) {
        console.log(`📌 Client requested facilitator: ${clientFacilitator}`);
      }

      // Select provider
      let provider;
      try {
        const selection = router.selectProviderWithFallback(chain, preferences);
        provider = selection.provider;
      } catch (err: any) {
        return res.status(400).json({ error: err.message });
      }

      // Check for batch payment
      if (batchHeader) {
        try {
          const batchData = JSON.parse(batchHeader);
          const batch = batchPayments.get(batchData.batchId);

          if (batch && batch.callsRemaining > 0 && new Date() < batch.expiresAt) {
            // Deduct from batch
            batch.callsRemaining--;
            batchPayments.set(batchData.batchId, batch);

            req.x402 = {
              valid: true,
              chain,
              facilitator: 'batch',
              batchId: batch.batchId,
            };

            console.log(`🎫 Batch payment: ${batch.callsRemaining}/${batch.totalCalls} remaining`);
            return next();
          } else {
            const x402Response = await createX402Response(provider, chain, req.originalUrl, facilitatorManager, clientFacilitator, req);
            return res.status(402).json({
              ...x402Response,
              error: 'Batch expired or depleted',
            });
          }
        } catch (err: any) {
          console.error('Batch payment error:', err);
        }
      }

      // === 402 CHALLENGE ===
      if (!paymentHeader) {
        const x402Response = await createX402Response(provider, chain, req.originalUrl, facilitatorManager, clientFacilitator, req);
        return res.status(402).json(x402Response);
      }

      // === PAYMENT VERIFICATION & SETTLEMENT ===
      try {
        const payload = JSON.parse(paymentHeader);
        const isBatchPurchase = payload.batchPurchase && provider.batchCost;

        // Determine payment amount
        const paymentAmount = isBatchPurchase ? provider.batchCost!.price : provider.costPerCall;

        // Verify payment with facilitator manager (auto fallback)
        // Honor client's facilitator choice if provided
        console.log(`🔍 Starting payment verification...`);
        console.log(`   Payment payload keys:`, Object.keys(payload.paymentPayload || {}));
        console.log(`   Payment requirements:`, payload.paymentRequirements);
        console.log(`   Expected cost (USD):`, paymentAmount);
        
        // IMPORTANT: Use client's payment requirements for signature verification
        // The signature was created with the client's amount value, so we must verify with it
        console.log(`🔍 Payment payload structure:`, {
          hasSignedIntent: !!payload.paymentPayload?.signedIntent,
          signedIntentKeys: payload.paymentPayload?.signedIntent ? Object.keys(payload.paymentPayload.signedIntent) : [],
          signatureType: typeof payload.paymentPayload?.signedIntent?.signature,
          signatureLength: payload.paymentPayload?.signedIntent?.signature?.length,
          signaturePreview: typeof payload.paymentPayload?.signedIntent?.signature === 'string' 
            ? payload.paymentPayload.signedIntent.signature.substring(0, 20) + '...'
            : 'NOT A STRING!',
          publicKeyType: typeof payload.paymentPayload?.signedIntent?.publicKey,
          hasTxBase64: !!payload.paymentPayload?.txBase64,
          facilitator: payload.paymentPayload?.facilitator || clientFacilitator,
        });
        
        const verifyRes = await facilitatorManager.verifyPayment(
          payload.paymentPayload,
          payload.paymentRequirements,  // Use client's values (what they signed)
          clientFacilitator
        );

        console.log(`🔍 Verification result:`, { valid: verifyRes.valid || verifyRes.isValid, error: verifyRes.error });

        if (!verifyRes.valid && !verifyRes.isValid) {
          console.error(`❌ Verification failed:`, verifyRes.error);
          return res.status(402).json({
            error: 'Payment verification failed',
            details: verifyRes.error,
            facilitator: verifyRes.facilitator,
          });
        }

        console.log(`✅ Payment verified by ${verifyRes.facilitator}`);

        // Settle payment with facilitator manager (auto fallback)
        // Honor client's facilitator choice if provided
        console.log(`💰 Starting payment settlement...`);
        const settleRes = await facilitatorManager.settlePayment(
          payload.paymentPayload,
          payload.paymentRequirements,  // Use client's values
          clientFacilitator
        );

        console.log(`💰 Settlement result:`, { settled: settleRes.settled || settleRes.success, error: settleRes.error });

        if (!settleRes.settled && !settleRes.success) {
          console.error(`❌ Settlement failed:`, settleRes.error || settleRes.errorReason);
          return res.status(402).json({
            error: 'Payment settlement failed',
            details: settleRes.error || settleRes.errorReason,
            facilitator: settleRes.facilitator,
          });
        }

        console.log(`✅ Payment settled by ${settleRes.facilitator}: ${settleRes.txHash || settleRes.transaction}`);

        // Handle batch purchase
        if (isBatchPurchase) {
          const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const batch: BatchPayment = {
            callsRemaining: provider.batchCost!.calls,
            totalCalls: provider.batchCost!.calls,
            amountPaid: provider.batchCost!.price,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            batchId,
          };
          batchPayments.set(batchId, batch);

          return res.json({
            success: true,
            message: 'Batch payment purchased successfully',
            batch: {
              batchId,
              calls: batch.totalCalls,
              expiresAt: batch.expiresAt,
              usageInstructions: 'Include x402-batch header with batchId in future requests',
            },
            txHash: settleRes.txHash || settleRes.transaction,
            facilitator: settleRes.facilitator,
          });
        }

        // Attach payment info to request
        req.x402 = {
          valid: true,
          txHash: settleRes.txHash || settleRes.transaction,
          chain,
          facilitator: settleRes.facilitator,
          payer: verifyRes.buyerPubkey || verifyRes.payer,
        };

        next();
      } catch (err: any) {
        console.error('❌ Payment processing error:', err);
        return res.status(402).json({
          error: 'Payment processing failed',
          details: err.message,
        });
      }
    } catch (err: any) {
      console.error('❌ Middleware error:', err);
      return res.status(500).json({
        error: 'Internal server error',
        details: err.message,
      });
    }
  };
}

/**
 * Create x402scan-compliant payment response
 * Based on: https://www.x402scan.com/resources/register
 */
async function createX402Response(
  provider: RPCProvider,
  chain: string,
  resource: string,
  facilitatorManager: FacilitatorManager,
  clientFacilitator?: string,
  req?: Request
): Promise<X402Response> {
  const facilitatorInfo = facilitatorManager.getInfo();
  
  // Determine which facilitator will be used (client preference or default)
  let effectiveFacilitator: string = facilitatorInfo.primary.type || 'codenut';
  
  // If client specifies a facilitator preference, use that for asset selection
  if (clientFacilitator) {
    effectiveFacilitator = clientFacilitator;
    console.log(`📌 Client specified facilitator: ${clientFacilitator}, using for asset selection`);
  }
  
  // Determine network and asset based on chain AND facilitator type
  // Use x402scan-compliant network names (no -mainnet suffix for primary networks)
  // IMPORTANT: costPerCall is in USD, so we prefer USDC (1:1 with USD) for accurate pricing
  // But x402labs facilitator uses SOL, so we match the facilitator's payment token
  const getChainInfo = (chain: string, facilitatorType: string) => {
    switch (chain) {
      case 'solana':
        // Only x402labs uses SOL - all others (PayAI, CodeNut, Corbits) use USDC
        const asset = (facilitatorType === 'x402labs' || facilitatorType === 'xlab') ? 'SOL' : 'USDC';
        console.log(`💰 Facilitator ${facilitatorType} will use ${asset} for Solana payments`);
        return { network: 'solana', asset };
      case 'ethereum':
        return { network: 'ethereum', asset: 'ETH' };
      case 'base':
        // CodeNut, Corbits, and others typically use USDC on Base
        return { network: 'base', asset: 'USDC' };
      case 'polygon':
        // Corbits supports USDC on Polygon
        return { network: 'polygon', asset: 'USDC' };
      default:
        return { network: chain, asset: 'USDC' };
    }
  };

  const { network, asset } = getChainInfo(chain, effectiveFacilitator);

  // Get supported RPC methods based on chain
  const getSupportedMethods = (chain: string): string[] => {
    if (chain === 'solana') {
      return [
        'getSlot',
        'getBalance',
        'getBlockHeight',
        'getLatestBlockhash',
        'sendTransaction',
        'getTransaction',
        'getAccountInfo',
        'getBlock',
        'getBlockTime',
        'getProgramAccounts',
      ];
    } else {
      return [
        'eth_blockNumber',
        'eth_getBalance',
        'eth_sendTransaction',
        'eth_getTransactionByHash',
        'eth_getBlockByNumber',
        'eth_call',
      ];
    }
  };

  // Convert USD amount to base unit (micro-USDC, lamports for SOL, wei for ETH, etc.)
  // costPerCall is always in USD - need to convert based on asset type
  const getAmountInBaseUnit = async (usdAmount: number, asset: string): Promise<string> => {
    switch (asset) {
      case 'SOL': {
        // For x402labs facilitator: Convert USD to SOL using REAL-TIME price from Jupiter
        const priceData = await jupiterOracle.getSOLPrice();
        const SOL_USD_PRICE = priceData.price;
        const solAmount = usdAmount / SOL_USD_PRICE;
        const lamports = Math.floor(solAmount * 1e9);
        
        // CRITICAL: Ensure payment covers rent-exemption minimum (890,880 lamports)
        // If the calculated amount is too low, use rent-exempt minimum
        const RENT_EXEMPT_MINIMUM = 890880; // Solana rent-exempt minimum for empty account
        const finalLamports = Math.max(lamports, RENT_EXEMPT_MINIMUM);
        
        if (finalLamports > lamports) {
          console.log(`💰 x402labs pricing: $${usdAmount} USD → ${lamports} lamports (too low for rent)`);
          console.log(`   ⬆️  Adjusted to rent-exempt minimum: ${finalLamports} lamports (SOL @ $${SOL_USD_PRICE.toFixed(2)} from ${priceData.source})`);
        } else {
          console.log(`💰 x402labs pricing: $${usdAmount} USD → ${finalLamports} lamports (SOL @ $${SOL_USD_PRICE.toFixed(2)} from ${priceData.source})`);
        }
        
        return finalLamports.toString();
      }
      case 'ETH': {
        // For Ethereum: Convert USD to ETH first
        // TODO: Add ETH price oracle (use static for now)
        const ETH_USD_PRICE = 3000;
        const ethAmount = usdAmount / ETH_USD_PRICE;
        return Math.floor(ethAmount * 1e18).toString();
      }
      case 'USDC': {
        // For PayAI facilitator: USDC is 1:1 with USD - perfect for micropayments
        // costPerCall in USD = same amount in USDC
        // 1 USDC = 1,000,000 micro-USDC (1e6)
        // Example: $0.00015 USD = 0.00015 USDC = 150 micro-USDC
        return Math.floor(usdAmount * 1e6).toString();
      }
      default: {
        // Default to USDC (1e6 decimals)
        return Math.floor(usdAmount * 1e6).toString();
      }
    }
  };

  // Get payTo address
  const payToAddress = process.env.X402_WALLET || 'WALLET_NOT_CONFIGURED';
  
  // Extract payer address from request (if available)
  // Could be from x-payer-address header, payment payload, or request body
  let payerAddress: string | undefined = undefined;
  
  if (req) {
    // Try header first
    payerAddress = req.headers['x-payer-address'] as string | undefined;
    if (payerAddress) {
      console.log(`📥 Extracted payer address from x-payer-address header: ${payerAddress.substring(0, 8)}...`);
    }
    
    // Try request body
    if (!payerAddress && req.body) {
      payerAddress = req.body.payerAddress || req.body.payer;
      if (payerAddress) {
        console.log(`📥 Extracted payer address from request body: ${payerAddress.substring(0, 8)}...`);
      }
    }
    
    // Try to extract from payment payload if present (for retry scenarios)
    if (!payerAddress && req.headers['x402-payment']) {
      try {
        const paymentHeader = req.headers['x402-payment'] as string;
        const paymentData = JSON.parse(Buffer.from(paymentHeader, 'base64').toString());
        if (paymentData.paymentPayload?.signedIntent?.publicKey) {
          payerAddress = paymentData.paymentPayload.signedIntent.publicKey;
          if (payerAddress) {
            console.log(`📥 Extracted payer address from payment header: ${payerAddress.substring(0, 8)}...`);
          }
        } else if (paymentData.paymentPayload?.payload?.transaction) {
          // Try to extract from transaction (would need deserialization)
          // Skip for now - too complex and may not be available
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    
    if (!payerAddress) {
      console.log(`⚠️  No payer address found in request headers or body`);
    }
  }
  
  // Enrich with token accounts for off-curve addresses (async)
  console.log(`🔍 Enriching 402 response with token accounts for off-curve addresses...`);
  console.log(`   PayTo: ${payToAddress.substring(0, 8)}...`);
  console.log(`   Payer: ${payerAddress ? payerAddress.substring(0, 8) + '...' : 'NOT PROVIDED'}`);
  console.log(`   Asset: ${asset}, Chain: ${chain}`);
  let tokenAccountExtra: Record<string, any> = {};
  try {
    tokenAccountExtra = await enrichWithTokenAccounts(
      payToAddress,
      asset,
      chain,
      payerAddress
    );
    if (Object.keys(tokenAccountExtra).length > 0) {
      console.log(`   ✅ Token account enrichment complete:`, Object.keys(tokenAccountExtra));
      console.log(`   📋 Token accounts added:`, tokenAccountExtra);
    } else {
      console.log(`   ℹ️  No token accounts to add (addresses are on-curve or not USDC)`);
    }
  } catch (error: any) {
    console.error(`   ❌ Error enriching token accounts: ${error.message}`);
    console.error(`   ⚠️  Continuing without token accounts - payment may fail for off-curve addresses`);
    console.error(`   Stack:`, error.stack?.split('\n').slice(0, 3).join('\n'));
    // Continue with empty tokenAccountExtra
  }

  const accepts: X402Accepts = {
    scheme: 'exact',
    network,
    maxAmountRequired: await getAmountInBaseUnit(provider.costPerCall, asset),
    resource: `https://x402labs.cloud${resource}`, // Full URL required by x402scan
    description: `RPC access via ${provider.name} for ${chain}`,
    mimeType: 'application/json',
    payTo: payToAddress,
    maxTimeoutSeconds: 30,
    asset,
    
    // Optional: Output schema for better x402scan integration
    outputSchema: {
      input: {
        type: 'http',
        method: 'POST',
        bodyType: 'json',
        bodyFields: {
          method: {
            type: 'string',
            required: true,
            description: 'RPC method name',
            enum: getSupportedMethods(chain),
          },
          params: {
            type: 'array',
            required: false,
            description: 'RPC method parameters',
          },
          chain: {
            type: 'string',
            required: false,
            description: 'Blockchain to query (solana, ethereum, base)',
            enum: ['solana', 'ethereum', 'base'],
          },
          preferences: {
            type: 'object',
            required: false,
            description: 'AI agent routing preferences',
            properties: {
              strategy: {
                type: 'string',
                enum: ['lowest-cost', 'lowest-latency', 'highest-priority', 'round-robin'],
              },
              maxLatencyMs: { type: 'number' },
              maxCostPerCall: { type: 'number' },
              preferredProviders: { type: 'array' },
            },
          },
        },
      },
      output: {
        jsonrpc: '2.0',
        id: 1,
        result: 'RPC result data (varies by method)',
        x402: {
          provider: 'Provider name',
          cost: 'Cost in tokens',
          status: 'settled',
        },
      },
    },

    // Custom metadata
    extra: {
      provider: provider.name,
      providerId: provider.id,
      nonce: `${Date.now()}-${Math.random()}`,
      facilitator: {
        primary: facilitatorInfo.primary.name,
        type: facilitatorInfo.primary.type,
        fallback: facilitatorInfo.fallback?.name,
      },
       // Include facilitator feePayer address (required for transaction building)
       // Per PayAI transaction builder: https://github.com/PayAINetwork/x402-solana/blob/main/src/client/transaction-builder.ts
       // The transaction must have facilitator as feePayer before user signs
       ...(effectiveFacilitator === 'payai' && {
         feePayer: await facilitatorManager.getPayAIFeePayer(),
       }),
       // CodeNut facilitator feePayer (from /supported endpoint)
       ...(effectiveFacilitator === 'codenut' && chain === 'solana' && {
         feePayer: 'HsozMJWWHNADoZRmhDGKzua6XW6NNfNDdQ4CkE9i5wHt',
       }),
       // Corbits facilitator feePayer (from client transaction logs)
       ...(effectiveFacilitator === 'corbits' && chain === 'solana' && {
         feePayer: 'AepWpq3GQwL8CeKMtZyKtKPa7W91Coygh3ropAJapVdU',
       }),
      // Include batch option if available
      ...(provider.batchCost && {
        batchOption: {
          calls: provider.batchCost.calls,
          price: provider.batchCost.price,
          savings: `${(((provider.costPerCall * provider.batchCost.calls - provider.batchCost.price) / (provider.costPerCall * provider.batchCost.calls)) * 100).toFixed(1)}%`,
        },
      }),
      // ⭐ Token accounts for off-curve addresses (if detected)
      ...tokenAccountExtra,
    },
  };

  return {
    x402Version: 1,
    accepts: [accepts],
  };
}

/**
 * Get batch payment status
 */
export function getBatchStatus(batchId: string): BatchPayment | undefined {
  return batchPayments.get(batchId);
}

/**
 * Clean up expired batches
 */
export function cleanupExpiredBatches() {
  const now = new Date();
  for (const [batchId, batch] of batchPayments.entries()) {
    if (now > batch.expiresAt) {
      batchPayments.delete(batchId);
      console.log(`🗑️  Expired batch cleaned up: ${batchId}`);
    }
  }
}

// Run cleanup every hour
setInterval(cleanupExpiredBatches, 60 * 60 * 1000);

