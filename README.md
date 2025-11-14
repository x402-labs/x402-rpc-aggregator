# x402-RPC-Aggregator

**Pay-per-call RPC access for AI agents — no API keys, no subscriptions.**

A RPC aggregator that intelligently routes blockchain RPC calls across multiple providers with built-in x402 micropayment support for Solana, Ethereum, and Base chains.

## 🌟 Features

| Feature | Status | Description |
|---------|--------|-------------|
| **Multi-provider routing** | ✅ Done | Triton, Helius, QuickNode, Alchemy, Infura |
| **x402 micropayments** | ✅ Done | USDC/SOL on Solana, Base, Polygon (multi-chain) |
| **x402scan compliant** | ✅ Done | Compatible with [x402scan.com](https://www.x402scan.com/resources/register) |
| **Four facilitators** | ✅ Done | Corbits (multi-chain) OR CodeNut (USDC) OR x402labs (SOL) OR PayAI (USDC) |
| **Intelligent routing** | ✅ Done | Cost, latency, priority, round-robin strategies |
| **AI agent compatible** | ✅ Done | No login, autonomous payments |
| **Batch payments** | ✅ Done | $0.08-0.15 for 1K calls (volume discounts) |
| **Health monitoring** | ✅ Done | Auto fallback to healthy providers |
| **Swagger docs** | ✅ Done | Interactive API documentation |
| **SVM & EVM support** | ✅ Done | Solana + Ethereum/Base |
| **Auto fallback** | ✅ Done | Automatic failover between facilitators |

## Architecture

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

## Quick Start

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


# Server
PORT=3000
```

**Facilitator Options**:
- **`corbits`**: Use [Corbits](https://corbits.dev) facilitator (USDC on Solana/Base/Polygon, multi-chain, ~100ms settlement) ⭐ **New!**
- **`codenut`**: Use [CodeNut Pay](https://codenut.ai/x402) facilitator (USDC on Solana/Base, zero-config, fast settlement)
- **`payai`**: Use [PayAI Network](https://payai.network) facilitator (USDC, zero network fees, <1s settlement)
- **`x402labs`**: Use x402labs self-hosted facilitator (SOL, full control)
- **`auto`**: Try x402labs first, then Corbits, then CodeNut (recommended for production)



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
  "x402Version": 1,
  "accepts": [
    {
      "scheme": "exact",
      "network": "solana",
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "maxAmountRequired": "150",
      "payTo": "wallet_address",
      "resource": "https://x402labs.cloud/rpc",
      "description": "RPC access via Helius for solana",
      "mimeType": "application/json",
      "extra": {
        "provider": "Helius",
        "providerId": "helius-solana",
        "nonce": "1762898224761-0.11427330977237005",
        "facilitator": {
          "primary": "x402labs",
          "type": "x402labs",
          "fallback": "CodeNut Pay"
        },
        "feePayer": "HsozMJWWHNADoZRmhDGKzua6XW6NNfNDdQ4CkE9i5wHt",
        "batchOption": {
          "calls": 1000,
          "price": 0.12,
          "savings": "20.0%"
        }
      }
    }
  ]
}
```

**Retry with Payment:**

```bash
POST /rpc
Content-Type: application/json
x402-payment: {"paymentPayload": {...}, "paymentRequirements": {...}}  # stringified JSON

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
  "result": 379462958,
  "x402": {
    "provider": "Helius",
    "paymentInfo": {
      "provider": "solana",
      "chain": "solana",
      "txHash": "5CTE4kkD7Zrs+TM9qDbl5cnLn4vV1RmH2XzSd1R9p9tyK5Smj56d52KnGwCD4zQ3CVQKtF1U7zNWLuabPyCuRzh",
      "amount": 0.00015,
      "explorer": "https://orb.helius.dev/tx/5CTE4kkD7ZrsTM9qDb...uRzh",
      "payer": "AyfXgR95iMn9CuxJReJqCHGCM2R6xFgE79NMA7WR75k",
      "timestamp": "2025-10-28T19:12:40.582Z"
    },
    "cost": 0.00015,
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
      "costPerCall": 0.00015,
      "batchCost": { "calls": 1000, "price": 0.12 },
      "status": "active",
      "priority": 90,
      "averageLatency": 241,
      "metadata": {
        "supportedMethods": ["getSlot", "getBalance", "..."]
      }
    }
  ],
  "total": 1
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
      "providerId": "helius-solana",
      "providerName": "Helius",
      "calls": 1000,
      "price": 0.12,
      "pricePerCall": 0.00012,
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

#### 5. Facilitator Status

```bash
GET /facilitator
```

```json
{
  "primary": {
    "name": "x402labs",
    "type": "x402labs",
    "available": true
  },
  "fallback": {
    "name": "CodeNut Pay",
    "type": "codenut",
    "available": true
  },
  "configuration": {
    "type": "auto",
    "fallbackEnabled": true
  },
  "recommendation": "Using primary facilitator: x402labs"
}
```

#### 6. Pricing Oracle

```bash
GET /pricing/sol-usd
```

```json
{
  "current": {
    "price": 156.38,
    "source": "Jupiter",
    "timestamp": "2025-11-11T19:05:28.439Z"
  },
  "cached": {
    "price": 156.12,
    "age": "42s"
  },
  "health": { "healthy": true },
  "providerCosts": [
    {
      "provider": "Helius",
      "usdCost": 0.00015,
      "lamports": 890880,
      "sol": "0.000890880"
    }
  ]
}
```

#### 7. RPC Methods

```bash
GET /rpc-methods?chain=solana
```

```json
{
  "chain": "solana",
  "provider": "Helius",
  "methods": [
    "getSlot",
    "getBalance",
    "getLatestBlockhash",
    "getAccountInfo"
  ],
  "documentation": "https://docs.solana.com/api"
}
```

#### 8. Solana RPC Proxy (Server-to-Server)

```bash
POST /solana-rpc
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getLatestBlockhash",
  "params": [{"commitment": "confirmed"}]
}
```

```json
{
  "jsonrpc": "2.0",
  "result": {
    "context": { "slot": 379462953 },
    "value": {
      "blockhash": "5xUgf...R9zA",
      "lastValidBlockHeight": 310551215
    }
  },
  "id": 1
}
```

##  AI Agent Integration

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

## Payment Flows

### Single Payment

1. Agent calls `/rpc` without payment
2. Receives 402 challenge (`x402Version` + `accepts[]`)
3. Builds facilitator-specific payment payload (SOL transfer or USDC partial transaction)
4. Retries with `x402-payment` header
5. Facilitator verifies & settles
6. RPC call executes

### Batch Payment

1. Agent requests batch: `{"batchPurchase": true}`
2. Pays for 1K calls upfront (quoted in the 402 response)
3. Receives `batchId`
4. Uses `x402-batch: {"batchId": "..."}` for next 1K calls
5. No per-call payment needed until batch depleted

### x402 Payment Header Reference

`x402-payment` is always a JSON string with `{ "paymentPayload": {...}, "paymentRequirements": {...} }`.

#### x402labs (SOL self-hosted)

```json
{
  "paymentPayload": {
    "facilitator": "x402labs",
    "signedIntent": {
      "publicKey": "AyfXgR95iMn9CuxJReJqCHGCM2R6xFgE79NMA7WR75k",
      "signature": "3j5Y...9fzr"
    },
    "txBase64": "5oE7...xJvS",
    "network": "solana-mainnet"
  },
  "paymentRequirements": {
    "amount": 890880,
    "recipient": "wallet_address",
    "nonce": "1762898224761-0.11427330977237005",
    "resource": "https://x402labs.cloud/rpc"
  }
}
```

- Encode the signed transaction bytes with base58 (legacy field name).
- Ensure lamports ≥ 890,880 (rent-exempt minimum).

#### CodeNut Pay (USDC on Solana)

```json
{
  "paymentPayload": {
    "x402Version": 1,
    "scheme": "exact",
    "network": "solana",
    "facilitator": "codenut",
    "payload": {
      "transaction": "AgAAAAACAAACr8..."  // base64, requireAllSignatures=false
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "solana",
    "maxAmountRequired": "150",
    "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "payTo": "wallet_address",
    "resource": "https://x402labs.cloud/rpc",
    "description": "x402 RPC payment",
    "extra": {
      "feePayer": "HsozMJWWHNADoZRmhDGKzua6XW6NNfNDdQ4CkE9i5wHt",
      "nonce": "1762898224761-0.11427330977237005"
    }
  }
}
```

- Instruction order: `ComputeBudget.limit(40000)` → `ComputeBudget.price(1)` → `TransferChecked`.
- Serialize with `requireAllSignatures=false`; facilitator adds the fee-payer signature.

#### PayAI Network (USDC on Solana)

```json
{
  "paymentPayload": {
    "x402Version": 1,
    "scheme": "exact",
    "network": "solana",
    "facilitator": "payai",
    "payload": {
      "transaction": "AgAAAAABAAABo0..."  // base64, fee payer = PayAI treasury
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "solana",
    "maxAmountRequired": "150",
    "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "payTo": "wallet_address",
    "resource": "https://x402labs.cloud/rpc",
    "description": "x402 RPC payment",
    "extra": {
      "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4"
    }
  }
}
```

- Build transactions with PayAI's `x402-solana` SDK (v0.1.4).
- Instruction order: `ComputeBudget.limit(40000)` → `ComputeBudget.price(1)` → `TransferChecked` (no inline ATA creation).
- Serialize with `requireAllSignatures=false`; PayAI completes signatures and broadcasts.

#### Corbits (USDC on Solana/Base/Polygon)

```json
{
  "paymentPayload": {
    "x402Version": 1,
    "scheme": "exact",
    "network": "solana",
    "facilitator": "corbits",
    "payload": {
      "transaction": "AgAAAAABAAABo0..."  // base64, fee payer = Corbits facilitator
    }
  },
  "paymentRequirements": {
    "scheme": "exact",
    "network": "solana",
    "maxAmountRequired": "890880",
    "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "payTo": "wallet_address",
    "resource": "https://x402labs.cloud/rpc",
    "description": "RPC access",
    "mimeType": "application/json",
    "maxTimeoutSeconds": 60,
    "extra": {
      "feePayer": "AepWpq3GQwL8CeKMtZyKtKPa7W91Coygh3ropAJapVdU"
    }
  }
}
```

- Multi-chain support: Solana, Base, Polygon, and 15+ more chains
- Instruction order: `ComputeBudget.limit(50000)` → `ComputeBudget.price(1)` → `TransferChecked`
- Fee payer: Corbits facilitator wallet (from `/supported` endpoint)
- Serialize with `requireAllSignatures=false`; Corbits adds facilitator signature
- Settlement: Combined verify+settle via `/settle` endpoint (~100ms on Solana)
- Note: Corbits recommends NOT using `/verify` endpoint - use `/settle` directly

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

## Supported RPC Methods

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

# Response: 402 with x402Version + accepts[]

# 2. (In production, pay via wallet)

# 3. Retry with payment proof
curl -X POST https://x402labs.cloud/rpc \
  -H "Content-Type: application/json" \
  -H "x402-payment: {\"paymentPayload\":..., \"paymentRequirements\":...}" \
  -d '{"method":"getSlot","chain":"solana"}'

# Response: 200 with result + x402 receipt (provider, tx hash, amount)
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
│   ├── pricing/                 # Dynamic SOL/USD pricing oracle
│   ├── providers/
│   │   ├── provider-registry.ts # Provider management + health
│   ├── providers.ts             # Provider configs (Triton, etc.)
│   ├── router.ts                # Intelligent routing logic
│   ├── facilitator/
│   │   ├── facilitator-manager.ts   # Orchestrates facilitator selection
│   │   ├── corbits-facilitator.ts   # Corbits multi-chain verify/settle
│   │   ├── codenut-facilitator.ts   # CodeNut verify/settle client
│   │   ├── payai-sdk-facilitator.ts # PayAI SDK integration
│   │   └── solana-facilitator.ts    # Self-hosted SOL settlement
│   ├── middleware/
│   │   └── unified-x402-middleware.ts  # Unified x402 handler
│   ├── routes/
│   │   └── solana-proxy.ts            # Server-to-server Solana RPC proxy
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

## Roadmap

- [x] Multi-chain facilitator support (Corbits - Solana/Base/Polygon)
- [ ] Redis/PostgreSQL for batch payment persistence
- [ ] WebSocket support for real-time data
- [ ] More EVM chains: Arbitrum, Avalanche via Corbits
- [ ] Advanced analytics dashboard
- [ ] Provider performance metrics API
- [ ] Anchor program for trustless Solana settlements
- [ ] CLI tool for developers
- [ ] Faremeter SDK integration for automatic payment handling

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
- **Corbits**: https://corbits.dev (Multi-chain facilitator)
- **CodeNut Pay**: https://codenut.ai/x402
- **PayAI Network**: https://payai.network
- **Triton.one**: https://triton.one
- **x402 Protocol**: https://github.com/x402-protocol
- **Support**: GitHub Issues

---

Built with ❤️ for autonomous AI agents and the decentralized web.
