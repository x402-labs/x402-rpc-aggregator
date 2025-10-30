/**
 * Express Example - Using @x402-multichain/facilitator with Express.js
 */

import express from 'express';
import { MultichainFacilitatorManager, createExpressAdapter } from '@x402-multichain/facilitator';
import { baseSepolia } from 'viem/chains';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Initialize multichain facilitator
const facilitatorManager = new MultichainFacilitatorManager({
  strategy: 'auto',
  fallbackEnabled: true,
  
  // Solana configuration
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
  solanaNetworks: [{
    name: 'solana-mainnet',
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    cluster: 'mainnet-beta',
  }],
  
  // EVM configuration
  evmPrivateKey: process.env.EVM_PRIVATE_KEY,
  evmNetworks: [baseSepolia],
  
  // Remote facilitator fallback
  remoteFacilitatorUrl: process.env.PAYAI_FACILITATOR_URL || 'https://facilitator.payai.network',
});

// Mount facilitator endpoints
// This creates: GET /facilitator/supported, POST /facilitator/verify, POST /facilitator/settle
createExpressAdapter(facilitatorManager, app, '/facilitator');

// Health check
app.get('/health', (req, res) => {
  const info = facilitatorManager.getInfo();
  res.json({
    status: 'ok',
    facilitator: info,
  });
});

// Example protected route (you would add x402 middleware here)
app.get('/api/protected', (req, res) => {
  res.json({
    message: 'This is a protected route',
    tip: 'Add x402 payment middleware to protect this route',
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Express server running on http://localhost:${PORT}`);
  console.log(`📡 Facilitator endpoints:`);
  console.log(`   GET  http://localhost:${PORT}/facilitator/supported`);
  console.log(`   POST http://localhost:${PORT}/facilitator/verify`);
  console.log(`   POST http://localhost:${PORT}/facilitator/settle`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

