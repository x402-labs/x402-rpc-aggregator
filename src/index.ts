/**
 * x402-RPC-Aggregator
 * 
 * Multi-provider RPC aggregator with intelligent routing and x402 micropayments
 * Supports Solana, Ethereum, and Base chains
 */

// Load environment variables from .env file
import { readFileSync } from 'fs';
import { join } from 'path';
try {
  const envPath = join(__dirname, '../.env');
  const envFile = readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length) {
        const value = valueParts.join('=').trim();
        process.env[key.trim()] = value;
      }
    }
  });
  console.log('✅ Environment variables loaded from .env');
} catch (err) {
  console.warn('⚠️  No .env file found, using system environment variables');
}

import express, { Request, Response } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { ProviderRegistry } from './providers/provider-registry';
import { IntelligentRouter } from './router';
import { PROVIDERS } from './providers';
import { swaggerDocument } from './swagger';
import { RPCRequest, RPCResponse, AgentPreferences } from './types';
import { createFacilitatorManager } from './facilitator/facilitator-manager';
import { createUnifiedX402Middleware } from './middleware/unified-x402-middleware';
import { proxySolanaRPC } from './routes/solana-proxy';
import path from 'path';

// Initialize Express app
const app = express();

// CORS configuration - allow frontend domains
app.use(cors({
  origin: [
    'https://x402labs.cloud',
    'https://www.x402labs.cloud',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x402-payment', 'x402-batch'],
}));

app.use(express.json());

// Serve static assets (logo, favicon, etc.)
app.use('/assets', express.static(path.join(__dirname, '../assets')));
app.use(express.static('pages'));

// Initialize Provider Registry and Router
const providerRegistry = new ProviderRegistry(PROVIDERS);
const router = new IntelligentRouter(providerRegistry);

// Initialize Facilitator Manager (Self-Hosted or PayAI)
const facilitatorManager = createFacilitatorManager();

// Create unified x402 middleware
const x402Middleware = createUnifiedX402Middleware(facilitatorManager, providerRegistry, router);

// Start health checks
providerRegistry.startHealthChecks(60000); // Every 60 seconds

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              x402-RPC-Aggregator v1.0.0                       ║
║  Pay-per-call RPC access for AI agents                       ║
╚═══════════════════════════════════════════════════════════════╝
`);

// ========================================
// SWAGGER DOCUMENTATION
// ========================================
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ========================================
// HEALTH CHECK ENDPOINT
// ========================================
app.get('/health', (req: Request, res: Response) => {
  const stats = router.getStats();
  const facilitatorInfo = facilitatorManager.getInfo();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    chains: stats.supportedChains,
    facilitator: {
      primary: facilitatorInfo.primary,
      fallback: facilitatorInfo.fallback,
    },
    stats: {
      totalProviders: stats.totalProviders,
      activeProviders: stats.activeProviders,
      healthyProviders: stats.healthyProviders,
      degradedProviders: stats.degradedProviders,
      offlineProviders: stats.offlineProviders,
      averageLatency: Math.round(stats.averageLatency),
    },
  });
});

// ========================================
// FACILITATOR STATUS ENDPOINT
// ========================================
app.get('/facilitator', (req: Request, res: Response) => {
  const info = facilitatorManager.getInfo();
  
  res.json({
    primary: info.primary,
    fallback: info.fallback,
    configuration: {
      type: process.env.X402_FACILITATOR_TYPE || 'auto',
      fallbackEnabled: process.env.X402_ENABLE_FALLBACK !== 'false',
    },
    recommendation: !info.primary.available && info.fallback?.available
      ? `Primary facilitator not available. Using fallback: ${info.fallback.name}`
      : info.primary.available
      ? `Using primary facilitator: ${info.primary.name}`
      : 'No facilitators available - payments will fail',
  });
});

// ========================================
// SOLANA RPC PROXY (Secure - API Key on Server)
// ========================================
app.options('/solana-rpc', (req, res) => {
  res.status(200).end();
});
app.post('/solana-rpc', proxySolanaRPC);

// ========================================
// PROVIDERS MANAGEMENT
// ========================================

// List all providers
app.get('/providers', (req: Request, res: Response) => {
  const chain = req.query.chain as string | undefined;
  
  const providers = chain
    ? providerRegistry.getProvidersByChain(chain)
    : providerRegistry.getAllProviders();

  res.json({
    providers: providers.map(p => ({
      id: p.id,
      name: p.name,
      chains: p.chains,
      costPerCall: p.costPerCall,
      batchCost: p.batchCost,
      status: p.status,
      priority: p.priority,
      averageLatency: p.averageLatency,
      metadata: p.metadata,
    })),
    total: providers.length,
  });
});

// Get specific provider details
app.get('/providers/:providerId', (req: Request, res: Response) => {
  const provider = providerRegistry.getProvider(req.params.providerId);
  
  if (!provider) {
    return res.status(404).json({ error: 'Provider not found' });
  }

  const health = providerRegistry.getHealthStatus(provider.id);

  res.json({
    ...provider,
    health,
  });
});

// ========================================
// RPC METHODS LISTING
// ========================================
app.get('/rpc-methods', (req: Request, res: Response) => {
  const chain = req.query.chain as string;
  const providerId = req.query.provider as string | undefined;

  if (!chain) {
    return res.status(400).json({ error: 'chain query parameter is required' });
  }

  const providers = providerId
    ? [providerRegistry.getProvider(providerId)]
    : providerRegistry.getProvidersByChain(chain);

  const provider = providers[0];
  if (!provider) {
    return res.status(404).json({ error: 'No providers found' });
  }

  res.json({
    chain,
    provider: provider.name,
    methods: provider.metadata?.supportedMethods || ['All standard RPC methods supported'],
    documentation: `See https://docs.solana.com/api for full method documentation`,
  });
});

// ========================================
// MAIN RPC ENDPOINT (WITH UNIFIED x402 MIDDLEWARE)
// ========================================
app.post('/rpc', x402Middleware, async (req: any, res: Response) => {
  try {
    const { method, params = [], chain = 'solana', preferences }: RPCRequest = req.body;

    if (!method) {
      return res.status(400).json({ error: 'method is required' });
    }

    // Select provider based on chain and preferences
    let provider;
    try {
      const selection = router.selectProviderWithFallback(chain, preferences);
      provider = selection.provider;
      
      console.log(`📡 Routing ${method} on ${chain} → ${provider.name}`);
      console.log(`   Fallbacks: ${selection.fallbacks.map(f => f.name).join(', ')}`);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }

    // === FORWARD RPC CALL ===
    try {
      const rpcResponse = await fetch(provider.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params,
        }),
      });

      const rpcData = await rpcResponse.json();

      // Build x402-compliant response
      const response: RPCResponse = {
        jsonrpc: '2.0',
        id: 1,
        result: rpcData.result,
        error: rpcData.error,
        x402: {
          provider: provider.name,
          paymentInfo: {
            provider: chain === 'solana' ? 'solana' : 'evm',
            chain,
            txHash: req.x402?.txHash || '',
            amount: provider.costPerCall,
            payer: req.x402?.payer || '',
            timestamp: new Date().toISOString(),
            explorer: req.x402?.txHash 
              ? (chain === 'solana'
                ? `https://orb.helius.dev/tx/${req.x402.txHash}`
                : `https://basescan.org/tx/${req.x402.txHash}`)
              : '',
          },
          cost: provider.costPerCall,
          status: 'settled',
        },
      };

      res.json(response);
    } catch (err: any) {
      console.error(`❌ RPC call failed:`, err.message);
      
      // Try fallback provider if available
      const selection = router.selectProviderWithFallback(chain, preferences);
      if (selection.fallbacks.length > 0) {
        console.log(`🔄 Trying fallback provider: ${selection.fallbacks[0].name}`);
        try {
          const fallbackResponse = await fetch(selection.fallbacks[0].url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method,
              params,
            }),
          });

          const fallbackData = await fallbackResponse.json();
          return res.json({
            jsonrpc: '2.0',
            id: 1,
            result: fallbackData.result,
            error: fallbackData.error,
            x402: {
              provider: selection.fallbacks[0].name,
              paymentInfo: {
                provider: chain === 'solana' ? 'solana' : 'evm',
                chain,
                txHash: req.x402?.txHash || '',
                amount: provider.costPerCall,
                payer: req.x402?.payer || '',
                timestamp: new Date().toISOString(),
                explorer: '',
              },
              cost: provider.costPerCall,
              status: 'settled',
              note: 'Fallback provider used',
            },
          });
        } catch (fallbackErr: any) {
          console.error(`❌ Fallback also failed:`, fallbackErr.message);
        }
      }
      
      res.status(500).json({
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32603,
          message: `RPC call failed: ${err.message}`,
        },
      });
    }
  } catch (err: any) {
    console.error(`❌ Unexpected error:`, err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// ========================================
// BATCH PRICING ENDPOINT
// ========================================
app.get('/batch-pricing', (req: Request, res: Response) => {
  const chain = req.query.chain as string;
  
  if (!chain) {
    return res.status(400).json({ error: 'chain query parameter is required' });
  }

  const providers = providerRegistry.getProvidersByChain(chain);
  const batchOptions = providers
    .filter(p => p.batchCost)
    .map(p => ({
      providerId: p.id,
      providerName: p.name,
      calls: p.batchCost!.calls,
      price: p.batchCost!.price,
      pricePerCall: p.batchCost!.price / p.batchCost!.calls,
      savings: ((p.costPerCall - (p.batchCost!.price / p.batchCost!.calls)) / p.costPerCall * 100).toFixed(1) + '%',
    }));

  res.json({
    chain,
    batchOptions,
    note: 'Batch payments allow you to pre-pay for multiple RPC calls at a discount',
  });
});

// ========================================
// STATIC PAGES
// ========================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../pages/index.html'));
});

app.get('/demo', (req, res) => {
  res.sendFile(path.join(__dirname, '../pages/demo.html'));
});

app.get('/agent', (req, res) => {
  res.sendFile(path.join(__dirname, '../pages/agent.html'));
});

app.get('/api-reference', (req, res) => {
  res.sendFile(path.join(__dirname, '../pages/api-reference.html'));
});

app.get('/providers-ui', (req, res) => {
  res.sendFile(path.join(__dirname, '../pages/providers.html'));
});

app.get('/facilitator-ui', (req, res) => {
  res.sendFile(path.join(__dirname, '../pages/facilitator.html'));
});

// SEO: Robots.txt
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /
Sitemap: ${req.protocol}://${req.get('host')}/sitemap.xml`);
});

// SEO: Sitemap
app.get('/sitemap.xml', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.type('application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/api-docs</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/api-reference</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${baseUrl}/demo</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/agent</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/providers</loc>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>
</urlset>`);
});

// ========================================
// START SERVER
// ========================================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📊 API Documentation: http://localhost:${PORT}/api-docs`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
  console.log(`🔌 RPC Endpoint: http://localhost:${PORT}/rpc`);
  console.log(`📋 Providers: http://localhost:${PORT}/providers`);
  console.log(``);
  
  const stats = router.getStats();
  console.log(`Provider Status:`);
  console.log(`  • Active: ${stats.activeProviders}/${stats.totalProviders}`);
  console.log(`  • Chains: ${stats.supportedChains.join(', ')}`);
  
  // Show which providers need API keys
  const offlineProviders = providerRegistry.getAllProviders()
    .filter(p => p.status === 'offline' && p.url === '');
  
  if (offlineProviders.length > 0) {
    console.log(``);
    console.log(`ℹ️  Offline providers (need API keys in .env):`);
    offlineProviders.forEach(p => {
      const envVar = p.id.toUpperCase().replace(/-/g, '_') + '_URL';
      console.log(`  • ${p.name}: Set ${envVar}`);
    });
  }
  
  console.log(``);
  console.log(`💡 Tip: Add API keys to .env to enable more providers`);
  console.log(``);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  providerRegistry.stopHealthChecks();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export { app, providerRegistry, router };
