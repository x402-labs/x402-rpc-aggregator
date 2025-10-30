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
import { BatchPayment } from '../types';

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
        
        // Include facilitator info
        const facilitatorInfo = facilitatorManager.getInfo();
        (invoice as any).facilitator = {
          primary: facilitatorInfo.primary.name,
          type: facilitatorInfo.primary.type,
          fallback: facilitatorInfo.fallback?.name,
        };

        // Include batch option
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

