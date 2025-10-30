/**
 * Swagger/OpenAPI Documentation for x402-RPC-Aggregator
 */

export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'x402-RPC-Aggregator API',
    version: '1.0.0',
    description: 'Pay-per-call RPC access for AI agents — no API keys, no subscriptions',
    contact: {
      name: 'x402-labs',
      url: 'https://github.com/x402-labs',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: 'https://x402-rpc-aggregator.up.railway.app',
      description: 'Production server',
    },
    {
      url: 'http://localhost:3000',
      description: 'Local development server',
    },
  ],
  tags: [
    {
      name: 'RPC',
      description: 'RPC call endpoints with x402 payment',
    },
    {
      name: 'Providers',
      description: 'Provider management endpoints',
    },
    {
      name: 'Health',
      description: 'Health check and status endpoints',
    },
  ],
  paths: {
    '/rpc': {
      post: {
        tags: ['RPC'],
        summary: 'Execute RPC call',
        description: 'Execute an RPC call on the specified chain. Returns 402 if payment required.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['method'],
                properties: {
                  method: {
                    type: 'string',
                    description: 'RPC method name (e.g., getSlot, getBalance, sendTransaction)',
                    example: 'getSlot',
                    enum: ['getSlot', 'getBalance', 'getBlockHeight', 'getLatestBlockhash', 'sendTransaction', 'eth_blockNumber', 'eth_getBalance'],
                  },
                  params: {
                    type: 'array',
                    description: 'RPC method parameters',
                    items: {},
                    default: [],
                  },
                  chain: {
                    type: 'string',
                    description: 'Blockchain to query',
                    enum: ['solana', 'ethereum', 'base'],
                    default: 'solana',
                  },
                  preferences: {
                    type: 'object',
                    description: 'AI agent routing preferences',
                    properties: {
                      strategy: {
                        type: 'string',
                        enum: ['lowest-cost', 'lowest-latency', 'highest-priority', 'round-robin'],
                        default: 'lowest-cost',
                      },
                      maxLatencyMs: {
                        type: 'number',
                        example: 2000,
                      },
                      maxCostPerCall: {
                        type: 'number',
                        example: 0.0002,
                      },
                      preferredProviders: {
                        type: 'array',
                        items: { type: 'string' },
                        example: ['triton-solana'],
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Successful RPC response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    jsonrpc: { type: 'string', example: '2.0' },
                    id: { type: 'number', example: 1 },
                    result: { description: 'RPC result data' },
                    x402: {
                      type: 'object',
                      properties: {
                        provider: { type: 'string', example: 'Triton One' },
                        paymentInfo: {
                          type: 'object',
                          properties: {
                            provider: { type: 'string', example: 'solana' },
                            chain: { type: 'string', example: 'solana' },
                            txHash: { type: 'string' },
                            amount: { type: 'number', example: 0.0001 },
                            explorer: { type: 'string' },
                          },
                        },
                        cost: { type: 'number', example: 0.0001 },
                        status: { type: 'string', example: 'settled' },
                      },
                    },
                  },
                },
              },
            },
          },
          '402': {
            description: 'Payment Required',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    invoice: {
                      type: 'object',
                      properties: {
                        amount: { type: 'number', example: 0.0001 },
                        to: { type: 'string', description: 'Recipient wallet address' },
                        network: { type: 'string', example: 'solana-mainnet' },
                        resource: { type: 'string', example: '/rpc' },
                        nonce: { type: 'string' },
                        description: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Bad Request',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Check service health and available providers',
        responses: {
          '200': {
            description: 'Service is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time' },
                    providers: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                    chains: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                    stats: {
                      type: 'object',
                      properties: {
                        totalProviders: { type: 'number' },
                        healthyProviders: { type: 'number' },
                        averageLatency: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/providers': {
      get: {
        tags: ['Providers'],
        summary: 'List all providers',
        description: 'Get list of all available RPC providers',
        parameters: [
          {
            name: 'chain',
            in: 'query',
            description: 'Filter by chain',
            schema: {
              type: 'string',
              enum: ['solana', 'ethereum', 'base'],
            },
          },
        ],
        responses: {
          '200': {
            description: 'List of providers',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    providers: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          chains: { type: 'array', items: { type: 'string' } },
                          costPerCall: { type: 'number' },
                          batchCost: {
                            type: 'object',
                            properties: {
                              calls: { type: 'number' },
                              price: { type: 'number' },
                            },
                          },
                          status: { type: 'string', enum: ['active', 'degraded', 'offline'] },
                          priority: { type: 'number' },
                          metadata: {
                            type: 'object',
                            properties: {
                              description: { type: 'string' },
                              supportedMethods: { type: 'array', items: { type: 'string' } },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/providers/{providerId}': {
      get: {
        tags: ['Providers'],
        summary: 'Get provider details',
        description: 'Get detailed information about a specific provider',
        parameters: [
          {
            name: 'providerId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'triton-solana',
          },
        ],
        responses: {
          '200': {
            description: 'Provider details',
          },
          '404': {
            description: 'Provider not found',
          },
        },
      },
    },
    '/rpc-methods': {
      get: {
        tags: ['RPC'],
        summary: 'List supported RPC methods',
        description: 'Get list of all supported RPC methods by chain',
        parameters: [
          {
            name: 'chain',
            in: 'query',
            required: true,
            schema: {
              type: 'string',
              enum: ['solana', 'ethereum', 'base'],
            },
          },
          {
            name: 'provider',
            in: 'query',
            description: 'Filter by specific provider',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'List of supported methods',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    chain: { type: 'string' },
                    provider: { type: 'string' },
                    methods: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      X402Payment: {
        type: 'apiKey',
        in: 'header',
        name: 'x402-payment',
        description: 'x402 payment proof (JSON payload with signed intent and transaction)',
      },
    },
  },
};

