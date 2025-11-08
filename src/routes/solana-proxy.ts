/**
 * Solana RPC Proxy - Secure proxy for Helius RPC
 * 
 * Keeps API keys on the server side, not exposed to browser
 */

import { Request, Response } from 'express';

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

/**
 * Proxy Solana RPC calls to Helius
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

    // Forward request to Helius
    const heliusResponse = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      }),
    });

    const data = await heliusResponse.json();
    
    // Log usage without exposing API key
    console.log(`📡 Solana proxy: ${method} → ${heliusResponse.status}`);

    res.json(data);
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

