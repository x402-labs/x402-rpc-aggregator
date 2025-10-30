/**
 * Hono Example - Using @x402-multichain/facilitator with Hono
 */

import { Hono } from 'hono';
import { MultichainFacilitatorManager, createHonoAdapter } from '@x402-multichain/facilitator';
import { baseSepolia } from 'viem/chains';

const app = new Hono();

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
createHonoAdapter(facilitatorManager, app, '/facilitator');

// Health check
app.get('/health', (c) => {
  const info = facilitatorManager.getInfo();
  return c.json({
    status: 'ok',
    facilitator: info,
  });
});

// Example protected route
app.get('/api/protected', (c) => {
  return c.json({
    message: 'This is a protected route',
    tip: 'Add x402 payment middleware to protect this route',
  });
});

// Start server
const PORT = process.env.PORT || 3000;

console.log(`✅ Hono server running on http://localhost:${PORT}`);
console.log(`📡 Facilitator endpoints:`);
console.log(`   GET  http://localhost:${PORT}/facilitator/supported`);
console.log(`   POST http://localhost:${PORT}/facilitator/verify`);
console.log(`   POST http://localhost:${PORT}/facilitator/settle`);
console.log(`🏥 Health check: http://localhost:${PORT}/health`);

export default {
  port: PORT,
  fetch: app.fetch,
};

