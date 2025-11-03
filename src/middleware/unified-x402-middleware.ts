/**
 * Unified x402 Middleware - Works with X-Labs or PayAI facilitators
 * 
 * Supports:
 * - X-Labs Solana facilitator
 * - PayAI Network facilitator
 * - Automatic fallback between them
 * - Batch payment management
 */

import { NextFunction, Request, Response } from 'express';
import { FacilitatorManager } from '../facilitator/facilitator-manager';
import { IntelligentRouter } from '../router';
import { ProviderRegistry } from '../providers/provider-registry';
import { BatchPayment, X402Response, X402Accepts, RPCProvider } from '../types';

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
            const x402Response = createX402Response(provider, chain, req.originalUrl, facilitatorManager);
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
        const x402Response = createX402Response(provider, chain, req.originalUrl, facilitatorManager);
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
        
        const verifyRes = await facilitatorManager.verifyPayment(
          payload.paymentPayload,
          {
            ...payload.paymentRequirements,
            amount: paymentAmount,
          },
          clientFacilitator // Pass client's preference
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
          {
            ...payload.paymentRequirements,
            amount: paymentAmount,
          },
          clientFacilitator // Pass client's preference
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
function createX402Response(
  provider: RPCProvider,
  chain: string,
  resource: string,
  facilitatorManager: FacilitatorManager
): X402Response {
  const facilitatorInfo = facilitatorManager.getInfo();
  
  // Determine network and asset based on chain AND facilitator type
  // Use x402scan-compliant network names (no -mainnet suffix for primary networks)
  // IMPORTANT: costPerCall is in USD, so we prefer USDC (1:1 with USD) for accurate pricing
  // But X-Labs facilitator uses SOL, so we match the facilitator's payment token
  const getChainInfo = (chain: string, facilitatorType: string) => {
    switch (chain) {
      case 'solana':
        // PayAI uses USDC (1:1 with USD - accurate pricing)
        // X-Labs uses SOL (volatile, but that's the facilitator's choice)
        const asset = facilitatorType === 'xlab' ? 'SOL' : 'USDC';
        return { network: 'solana', asset };
      case 'ethereum':
        return { network: 'ethereum', asset: 'ETH' };
      case 'base':
        return { network: 'base', asset: 'ETH' };
      default:
        return { network: chain, asset: 'USDC' };
    }
  };

  const { network, asset } = getChainInfo(chain, facilitatorInfo.primary.type || 'payai');

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
  const getAmountInBaseUnit = (usdAmount: number, asset: string): string => {
    switch (asset) {
      case 'SOL':
        // For X-Labs facilitator: Convert USD to SOL first
        // Approximate SOL price: $150-$250 (use $200 as mid-range)
        const SOL_USD_PRICE = 200; // Should ideally fetch from oracle, but $200 is reasonable
        const solAmount = usdAmount / SOL_USD_PRICE;
        // Convert SOL to lamports: 1 SOL = 1,000,000,000 lamports (1e9)
        // Example: $0.00015 USD / $200 = 0.00000075 SOL = 750 lamports
        return Math.floor(solAmount * 1e9).toString();
      case 'ETH':
        // For Ethereum: Convert USD to ETH first
        // Approximate ETH price: $2000-$4000 (use $3000 as mid-range)
        const ETH_USD_PRICE = 3000;
        const ethAmount = usdAmount / ETH_USD_PRICE;
        // Convert ETH to wei: 1 ETH = 1,000,000,000,000,000,000 wei (1e18)
        return Math.floor(ethAmount * 1e18).toString();
      case 'USDC':
        // For PayAI facilitator: USDC is 1:1 with USD - perfect for micropayments
        // costPerCall in USD = same amount in USDC
        // 1 USDC = 1,000,000 micro-USDC (1e6)
        // Example: $0.00015 USD = 0.00015 USDC = 150 micro-USDC
        return Math.floor(usdAmount * 1e6).toString();
      default:
        // Default to USDC (1e6 decimals)
        return Math.floor(usdAmount * 1e6).toString();
    }
  };

  const accepts: X402Accepts = {
    scheme: 'exact',
    network,
    maxAmountRequired: getAmountInBaseUnit(provider.costPerCall, asset),
    resource: `https://x402labs.cloud${resource}`, // Full URL required by x402scan
    description: `RPC access via ${provider.name} for ${chain}`,
    mimeType: 'application/json',
    payTo: process.env.X402_WALLET || 'WALLET_NOT_CONFIGURED',
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
      // Include batch option if available
      ...(provider.batchCost && {
        batchOption: {
          calls: provider.batchCost.calls,
          price: provider.batchCost.price,
          savings: `${(((provider.costPerCall * provider.batchCost.calls - provider.batchCost.price) / (provider.costPerCall * provider.batchCost.calls)) * 100).toFixed(1)}%`,
        },
      }),
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

