/**
 * Enhanced x402 Middleware
 * 
 * Supports both Solana (SVM) and EVM chains (Base, Ethereum)
 * Integrates with x402-sovereign for payment verification and settlement
 */

import { NextFunction, Request, Response } from 'express';
import { SolanaFacilitator } from '../facilitator/solana-facilitator';
import { IntelligentRouter } from '../router';
import { ProviderRegistry } from '../providers/provider-registry';
import { BatchPayment } from '../types';

// Import EVM Facilitator from x402-sovereign submodule
// Note: This will be available after building the submodule
let EVMFacilitator: any;
try {
  const x402Sovereign = require('../../x402-sovereign/packages/core/dist/index');
  EVMFacilitator = x402Sovereign.Facilitator;
} catch (err) {
  console.warn('⚠️  x402-sovereign not built yet. EVM payments will not work.');
}

export interface X402Request extends Request {
  x402?: {
    valid: boolean;
    txHash?: string;
    chain: string;
    paymentProvider: 'solana' | 'evm';
    payer?: string;
    batchId?: string;
  };
}

// Batch payment storage (in production, use Redis or database)
const batchPayments = new Map<string, BatchPayment>();

/**
 * Initialize facilitators for different chains
 */
export function initializeFacilitators() {
  const facilitators: {
    solana?: SolanaFacilitator;
    evm?: any;
  } = {};

  // Initialize Solana Facilitator
  if (process.env.SOLANA_PRIVATE_KEY) {
    try {
      facilitators.solana = new SolanaFacilitator({
        solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
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
        minConfirmations: 1,
      });
      console.log('✅ Solana Facilitator initialized');
    } catch (err: any) {
      console.error('❌ Failed to initialize Solana Facilitator:', err.message);
    }
  }

  // Initialize EVM Facilitator (Base, Ethereum)
  if (EVMFacilitator && process.env.EVM_PRIVATE_KEY) {
    try {
      // Import viem chains
      const { base, baseSepolia, mainnet, sepolia } = require('viem/chains');
      
      facilitators.evm = new EVMFacilitator({
        evmPrivateKey: process.env.EVM_PRIVATE_KEY,
        networks: [base, baseSepolia, mainnet, sepolia],
        minConfirmations: 1,
      });
      console.log('✅ EVM Facilitator initialized');
    } catch (err: any) {
      console.error('❌ Failed to initialize EVM Facilitator:', err.message);
    }
  }

  return facilitators;
}

const facilitators = initializeFacilitators();

/**
 * Enhanced x402 Middleware with batch payment support
 */
export function createX402Middleware(
  providerRegistry: ProviderRegistry,
  router: IntelligentRouter
) {
  return async function x402Middleware(
    req: X402Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { chain = 'solana', preferences } = req.body;
      const paymentHeader = req.headers['x402-payment'] as string | undefined;
      const batchHeader = req.headers['x402-batch'] as string | undefined;

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
              paymentProvider: chain === 'solana' ? 'solana' : 'evm',
              batchId: batch.batchId,
            };

            console.log(`🎫 Batch payment used: ${batch.callsRemaining}/${batch.totalCalls} remaining`);
            return next();
          } else {
            return res.status(402).json({
              error: 'Batch expired or depleted',
              invoice: createInvoice(provider, chain, req.originalUrl),
            });
          }
        } catch (err: any) {
          console.error('Batch payment error:', err);
        }
      }

      // === 402 CHALLENGE ===
      if (!paymentHeader) {
        const invoice = createInvoice(provider, chain, req.originalUrl);
        
        // Include batch pricing if available
        if (provider.batchCost) {
          (invoice as any).batchOption = {
            calls: provider.batchCost.calls,
            price: provider.batchCost.price,
            savings: `${(((provider.costPerCall * provider.batchCost.calls - provider.batchCost.price) / (provider.costPerCall * provider.batchCost.calls)) * 100).toFixed(1)}%`,
          };
        }

        return res.status(402).json({ invoice });
      }

      // === PAYMENT VERIFICATION & SETTLEMENT ===
      try {
        const payload = JSON.parse(paymentHeader);
        const isSolana = chain === 'solana';
        const facilitator = isSolana ? facilitators.solana : facilitators.evm;

        if (!facilitator) {
          return res.status(500).json({
            error: 'Payment facilitator not configured',
            details: `${isSolana ? 'Solana' : 'EVM'} facilitator not available`,
          });
        }

        // Check if this is a batch payment purchase
        const isBatchPurchase = payload.batchPurchase && provider.batchCost;

        if (isBatchPurchase) {
          // Verify batch payment
          const verifyRes = await facilitator.verifyPayment(
            payload.paymentPayload,
            {
              ...payload.paymentRequirements,
              amount: provider.batchCost!.price,
            }
          );

          if (!verifyRes.valid && !verifyRes.isValid) {
            return res.status(402).json({
              error: 'Batch payment verification failed',
              details: verifyRes.error,
            });
          }

          // Settle batch payment
          const settleRes = await facilitator.settlePayment(
            payload.paymentPayload,
            {
              ...payload.paymentRequirements,
              amount: provider.batchCost!.price,
            }
          );

          if (!settleRes.settled && !settleRes.success) {
            return res.status(402).json({
              error: 'Batch payment settlement failed',
              details: settleRes.error || settleRes.errorReason,
            });
          }

          // Create batch
          const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const batch: BatchPayment = {
            callsRemaining: provider.batchCost!.calls,
            totalCalls: provider.batchCost!.calls,
            amountPaid: provider.batchCost!.price,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            batchId,
          };
          batchPayments.set(batchId, batch);

          console.log(`✅ Batch payment created: ${batchId}`);

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
          });
        }

        // Regular single payment
        const verifyRes = await facilitator.verifyPayment(
          payload.paymentPayload,
          payload.paymentRequirements
        );

        if (!verifyRes.valid && !verifyRes.isValid) {
          return res.status(402).json({
            error: 'Payment verification failed',
            details: verifyRes.error,
          });
        }

        const settleRes = await facilitator.settlePayment(
          payload.paymentPayload,
          payload.paymentRequirements
        );

        if (!settleRes.settled && !settleRes.success) {
          return res.status(402).json({
            error: 'Payment settlement failed',
            details: settleRes.error || settleRes.errorReason,
          });
        }

        // Attach payment info to request
        req.x402 = {
          valid: true,
          txHash: settleRes.txHash || settleRes.transaction,
          chain,
          paymentProvider: isSolana ? 'solana' : 'evm',
          payer: verifyRes.buyerPubkey || verifyRes.payer,
        };

        console.log(`✅ Payment settled: ${req.x402.txHash}`);
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
 * Create payment invoice
 */
function createInvoice(provider: any, chain: string, resource: string) {
  return {
    amount: provider.costPerCall,
    to: process.env.X402_WALLET || 'WALLET_NOT_CONFIGURED',
    network: chain === 'solana' ? 'solana-mainnet' : `${chain}-mainnet`,
    resource,
    nonce: `${Date.now()}-${Math.random()}`,
    description: `RPC access via ${provider.name}`,
    provider: provider.name,
    providerId: provider.id,
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

