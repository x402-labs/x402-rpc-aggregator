/**
 * Solana RPC Proxy - Secure proxy for Helius RPC
 * 
 * Keeps API keys on the server side, not exposed to browser
 */

import { Request, Response } from 'express';

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL;
const QUICKNODE_RPC_URL = process.env.QUICKNODE_SOLANA_URL;
const PUBLIC_RPC_URL = 'https://api.mainnet-beta.solana.com';

// Prioritize paid providers, fall back to public
const RPC_ENDPOINTS = [
  HELIUS_RPC_URL,
  QUICKNODE_RPC_URL,
  PUBLIC_RPC_URL
].filter(url => !!url) as string[];

/**
 * Proxy Solana RPC calls to Helius (with fallback)
 * This keeps the API key secure on the server
 */
export async function proxySolanaRPC(req: Request, res: Response) {
  try {
    const { method, params = [], id = 1 } = req.body;

    if (!method) {
      return res.status(400).json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32600,
          message: 'Method is required'
        }
      });
    }

    // Whitelist of allowed methods (security)
    const allowedMethods = [
      'getBalance',
      'getLatestBlockhash',
      'getSlot',
      'getBlockHeight',
      'getAccountInfo',
      'getTransaction',
      'getSignatureStatuses',
      'simulateTransaction',
      'sendTransaction',
      'sendRawTransaction',
      'confirmTransaction',
      'getRecentBlockhash',
      'getMinimumBalanceForRentExemption',
      'getTokenAccountsByOwner',
      'getTokenAccountBalance',  // Added for USDC balance checks
      'getProgramAccounts',
      'getConfirmedTransaction',
      'getFeeForMessage',
    ];

    if (!allowedMethods.includes(method)) {
      return res.status(403).json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not allowed: ${method}. Use /rpc for paid RPC calls.`
        }
      });
    }

    // Try endpoints in order
    let lastError: any = null;
    let successResponse = null;

    for (const rpcUrl of RPC_ENDPOINTS) {
      try {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            method,
            params,
          }),
        });

        // Check if response is successful JSON
        const contentType = response.headers.get('content-type');
        if (response.ok && contentType?.includes('application/json')) {
          successResponse = await response.json();
          // Log usage without exposing API key (mask URL)
          const providerName = rpcUrl.includes('helius') ? 'Helius' : rpcUrl.includes('quicknode') ? 'QuickNode' : 'Public';
          console.log(`📡 Solana proxy: ${method} → ${response.status} (${providerName})`);
          break; // Success!
        } else {
          const text = await response.text();
          console.warn(`⚠️ RPC failed (${rpcUrl.substring(0, 20)}...): ${response.status} - ${text.substring(0, 100)}`);
          lastError = { status: response.status, text };
        }
      } catch (err: any) {
        console.warn(`⚠️ RPC connection error (${rpcUrl.substring(0, 20)}...): ${err.message}`);
        lastError = { status: 500, text: err.message };
      }
    }

    if (successResponse) {
      return res.json(successResponse);
    }

    // If all failed
    console.error(`❌ All RPC endpoints failed for ${method}`);
    return res.status(lastError?.status || 500).json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: `Upstream RPC error: ${lastError?.text || 'Unknown error'}`
      }
    });

  } catch (error: any) {
    console.error('Solana proxy error:', error.message);
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body.id || 1,
      error: {
        code: -32603,
        message: 'Internal error'
      }
    });
  }
}

