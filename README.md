# x402-RPC-Aggregator

**Pay-per-call RPC access for AI agents — no API keys, no subscriptions.**

A production-ready RPC aggregator that intelligently routes blockchain RPC calls across multiple providers with built-in x402 micropayment support for Solana, Ethereum, and Base chains.

## 🌟 Features

| Feature | Status | Description |
|---------|--------|-------------|
| **Multi-provider routing** | ✅ Done | Triton, Helius, QuickNode, Alchemy, Infura |
| **x402 micropayments** | ✅ Done | USDC on Solana & Base (official PayAI SDK) |
| **Dual facilitators** | ✅ Done | X-Labs OR PayAI Network (choose freely) |
| **Intelligent routing** | ✅ Done | Cost, latency, priority, round-robin strategies |
| **AI agent compatible** | ✅ Done | No login, autonomous payments |
| **Batch payments** | ✅ Done | $0.08-0.15 for 1K calls (volume discounts) |
| **Health monitoring** | ✅ Done | Auto fallback to healthy providers |
| **Swagger docs** | ✅ Done | Interactive API documentation |
| **SVM & EVM support** | ✅ Done | Solana + Ethereum/Base |
| **Auto fallback** | ✅ Done | Automatic failover between facilitators |

## 🏗️ Architecture

```
[AI Agent / dApp]
       ↓ POST /rpc
[x402-RPC-Aggregator] → 402 Payment Required
       ↓ (user pays via Phantom / MetaMask)
[x402 Facilitator (Solana/EVM)] → verify + settle
       ↓
[Best RPC Provider] → Triton, Helius, QuickNode, etc.
       ↓
[Returns data + Receipt + On-chain Proof]
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Solana wallet (for Solana RPC payments)
- EVM wallet (for Ethereum/Base payments)
- USDC tokens for payments

### Installation

```bash
# Clone repository
git clone --recurse-submodules https://github.com/your-org/x402-rpc-aggregator
cd x402-rpc-aggregator

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your private keys and wallet addresses
```

### Environment Variables

```bash
# Facilitator Configuration (Choose One)
X402_FACILITATOR_TYPE=auto  # Options: payai | xlab | auto (recommended)
X402_WALLET=your_receiving_wallet_address

# For X-Labs or Auto mode
SOLANA_PRIVATE_KEY=your_base58_solana_private_key
EVM_PRIVATE_KEY=0xyour_evm_private_key

# For PayAI or Auto mode (default URL provided)
PAYAI_FACILITATOR_URL=https://facilitator.payai.network

# Fallback Options
X402_ENABLE_FALLBACK=true
X402_FALLBACK_TYPE=payai

# RPC Provider URLs (optional - defaults to public endpoints)
TRITON_RPC_URL=https://your-triton-url
HELIUS_RPC_URL=https://your-helius-url
QUICKNODE_SOLANA_URL=https://your-quicknode-solana-url

# Server
PORT=3000
```

**Facilitator Options**:
- **`payai`**: Use [PayAI Network](https://payai.network) facilitator (zero fees, <1s settlement)
- **`xlab`**: Use X-Labs solana network facilitator (full control)
- **`auto`**: Try X-Labs first, fallback to PayAI (recommended for production)

See [FACILITATOR_GUIDE.md](./FACILITATOR_GUIDE.md) for detailed comparison.

### Build & Run

```bash
# Build TypeScript
npm run build

# Start server
npm start

# Or for development with hot reload
npm run dev
```

Server will start on `http://localhost:3000`

## 📖 API Documentation

### Interactive Docs

Visit `http://localhost:3000/api-docs` for Swagger UI documentation.

### Core Endpoints

#### 1. RPC Call

```bash
POST /rpc
Content-Type: application/json

{
  "method": "getSlot",
  "params": [],
  "chain": "solana",
  "preferences": {
    "strategy": "lowest-cost",
    "maxLatencyMs": 2000
  }
}
```

**Response (402 Payment Required):**

```json
{
  "invoice": {
    "amount": 0.0001,
    "to": "FacilitatorWalletAddress",
    "network": "solana-mainnet",
    "resource": "/rpc",
    "nonce": "1234567890-abc",
    "provider": "Triton One",
    "batchOption": {
      "calls": 1000,
      "price": 0.08,
      "savings": "20%"
    }
  }
}
```

**Retry with Payment:**

```bash
POST /rpc
Content-Type: application/json
x402-payment: {"paymentPayload": {...}, "paymentRequirements": {...}}

{
  "method": "getSlot",
  "params": []
}
```

**Response (200 Success):**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": 12345678,
  "x402": {
    "provider": "Triton One",
    "paymentInfo": {
      "provider": "solana",
      "chain": "solana",
      "txHash": "5x...",
      "amount": 0.0001,
      "explorer": "https://solscan.io/tx/5x..."
    },
    "cost": 0.0001,
    "status": "settled"
  }
}
```

#### 2. List Providers

```bash
GET /providers?chain=solana
```

```json
{
  "providers": [
    {
      "id": "triton-solana",
      "name": "Triton One",
      "chains": ["solana"],
      "costPerCall": 0.0001,
      "batchCost": {
        "calls": 1000,
        "price": 0.08
      },
      "status": "active",
      "priority": 100,
      "averageLatency": 245
    }
  ]
}
```

#### 3. Batch Pricing

```bash
GET /batch-pricing?chain=solana
```

```json
{
  "chain": "solana",
  "batchOptions": [
    {
      "providerId": "triton-solana",
      "providerName": "Triton One",
      "calls": 1000,
      "price": 0.08,
      "pricePerCall": 0.00008,
      "savings": "20.0%"
    }
  ]
}
```

#### 4. Health Check

```bash
GET /health
```

```json
{
  "status": "ok",
  "timestamp": "2025-10-27T12:00:00.000Z",
  "chains": ["solana", "ethereum", "base"],
  "stats": {
    "totalProviders": 8,
    "healthyProviders": 7,
    "averageLatency": 312
  }
}
```

## 🤖 AI Agent Integration

### JavaScript/TypeScript

```typescript
import { X402Agent } from './lib/x402-client';

const agent = new X402Agent('https://x402labs.cloud/');

// Agent will automatically handle 402 challenges and payments
const result = await agent.callRPC('getSlot', [], 'solana');
console.log('Current slot:', result.result);
```

### Python (Concept)

```python
from x402 import Agent

agent = Agent('https://x402labs.cloud/')
result = agent.call_rpc('getSlot', [], chain='solana')
print(f"Current slot: {result['result']}")
```

## 💰 Payment Flows

### Single Payment

1. Agent calls `/rpc` without payment
2. Receives 402 + invoice
3. Creates signed USDC transfer + intent
4. Retries with `x402-payment` header
5. Facilitator verifies & settles
6. RPC call executes

### Batch Payment

1. Agent requests batch: `{"batchPurchase": true}`
2. Pays for 1K calls upfront ($0.08)
3. Receives `batchId`
4. Uses `x402-batch: {"batchId": "..."}` for next 1K calls
5. No per-call payment needed until batch depleted

## 🔧 Configuration

### Routing Strategies

- **lowest-cost**: Select cheapest provider (default)
- **lowest-latency**: Select fastest provider
- **highest-priority**: Use premium providers
- **round-robin**: Distribute load evenly

### Agent Preferences Example

```json
{
  "method": "getBalance",
  "params": ["SomeAddress"],
  "chain": "solana",
  "preferences": {
    "strategy": "lowest-latency",
    "maxLatencyMs": 1500,
    "maxCostPerCall": 0.0002,
    "preferredProviders": ["triton-solana", "helius-solana"]
  }
}
```

## 📊 Supported RPC Methods

### Solana (Triton.one Focus)

<details>
<summary>View all 50+ methods</summary>

- `getAccountInfo`, `getBalance`, `getBlock`, `getBlockHeight`
- `getBlockProduction`, `getBlockCommitment`, `getBlocks`
- `getEpochInfo`, `getLatestBlockhash`, `getSlot`, `getTransaction`
- `getTokenAccountBalance`, `getTokenAccountsByOwner`
- `sendTransaction`, `simulateTransaction`
- ... and 40+ more (see `/rpc-methods?chain=solana`)

</details>

### Ethereum / Base

- `eth_blockNumber`, `eth_getBalance`, `eth_getBlockByNumber`
- `eth_call`, `eth_estimateGas`, `eth_sendRawTransaction`
- `eth_getTransactionReceipt`, `eth_getLogs`
- ... all standard JSON-RPC methods

## 🧪 Testing

### Manual Test (cURL)

```bash
# 1. Get invoice
curl -X POST https://x402labs.cloud/rpc \
  -H "Content-Type: application/json" \
  -d '{"method":"getSlot","chain":"solana"}'

# Response: 402 with invoice

# 2. (In production, pay via wallet)

# 3. Retry with payment proof
curl -X POST https://x402labs.cloud/rpc \
  -H "Content-Type: application/json" \
  -H "x402-payment: {\"paymentPayload\":..., \"paymentRequirements\":...}" \
  -d '{"method":"getSlot","chain":"solana"}'

# Response: 200 with result + receipt
```

### Browser Demo

1. Visit `http://localhost:3000/demo`
2. Connect Phantom wallet
3. Make RPC calls and see payments in action

### AI Agent Demo

1. Visit `http://localhost:3000/agent`
2. Watch autonomous agent make 10 RPC calls
3. See automatic payment handling

## 🏗️ Project Structure

```
x402-rpc-aggregator/
├── src/
│   ├── index.ts                 # Main server
│   ├── types/                   # TypeScript definitions
│   ├── providers/
│   │   ├── provider-registry.ts # Provider management + health
│   ├── providers.ts             # Provider configs (Triton, etc.)
│   ├── router.ts                # Intelligent routing logic
│   ├── facilitator/
│   │   └── solana-facilitator.ts # Solana x402 implementation
│   ├── middleware/
│   │   └── enhanced-x402-middleware.ts # Payment middleware
│   └── swagger.ts               # API documentation
├── x402-sovereign/              # Git submodule (EVM support)
├── lib/
│   └── x402-client.ts           # Browser client library
├── pages/
│   ├── index.html               # Landing page
│   ├── demo.html                # Interactive demo
│   └── agent.html               # AI agent demo
└── package.json
```

## 🛣️ Roadmap

- [ ] Redis/PostgreSQL for batch payment persistence
- [ ] WebSocket support for real-time data
- [ ] More chains: Polygon, Avalanche, Arbitrum
- [ ] Advanced analytics dashboard
- [ ] Provider performance metrics API
- [ ] Anchor program for trustless Solana settlements
- [ ] CLI tool for developers

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create feature branch
3. Add tests if applicable
4. Submit pull request

## 📄 License

MIT © x402-labs

## 🔗 Links

- **Live Demo**: https://x402labs.cloud/
- **Triton.one**: https://triton.one
- **x402 Protocol**: https://github.com/x402-protocol
- **Support**: GitHub Issues

---

Built with ❤️ for autonomous AI agents and the decentralized web.
