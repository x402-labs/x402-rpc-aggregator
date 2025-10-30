# @x402-multichain/facilitator

> Self-hosted multichain payment facilitator for x402 protocol

Support **Solana** and **EVM** payments in your API with a single, unified interface.

[![npm version](https://img.shields.io/npm/v/@x402-multichain/facilitator.svg)](https://www.npmjs.com/package/@x402-multichain/facilitator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🌟 Features

- ✅ **Multichain**: Solana, Ethereum, Base, and all EVM chains
- ✅ **Self-Hosted**: Full control, no third-party dependencies
- ✅ **Auto-Fallback**: Seamless failover between facilitators
- ✅ **Framework-Agnostic**: Works with Express, Hono, Fastify, and more
- ✅ **Type-Safe**: Full TypeScript support
- ✅ **Production-Ready**: Battle-tested in real applications
- ✅ **Unified API**: Same interface for all chains

## 📦 Installation

```bash
npm install @x402-multichain/facilitator
```

## 🚀 Quick Start

### Solana Only

```typescript
import { SolanaFacilitator } from '@x402-multichain/facilitator/solana';

const facilitator = new SolanaFacilitator({
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY!,
  networks: [{
    name: 'solana-mainnet',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    cluster: 'mainnet-beta'
  }]
});

// Verify payment
const verifyResult = await facilitator.verifyPayment(paymentPayload, paymentRequirements);

// Settle payment
const settleResult = await facilitator.settlePayment(paymentPayload, paymentRequirements);
```

### EVM Only

```typescript
import { EVMFacilitator } from '@x402-multichain/facilitator/evm';
import { baseSepolia } from 'viem/chains';

const facilitator = new EVMFacilitator({
  evmPrivateKey: process.env.EVM_PRIVATE_KEY!,
  networks: [baseSepolia]
});

// Same API as Solana!
await facilitator.verifyPayment(paymentPayload, paymentRequirements);
await facilitator.settlePayment(paymentPayload, paymentRequirements);
```

### Multichain with Auto-Fallback

```typescript
import { MultichainFacilitatorManager } from '@x402-multichain/facilitator';
import { baseSepolia } from 'viem/chains';

const manager = new MultichainFacilitatorManager({
  strategy: 'auto',
  fallbackEnabled: true,
  
  // Solana config
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
  solanaNetworks: [{ 
    name: 'solana-mainnet', 
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    cluster: 'mainnet-beta'
  }],
  
  // EVM config
  evmPrivateKey: process.env.EVM_PRIVATE_KEY,
  evmNetworks: [baseSepolia],
  
  // Remote fallback (optional)
  remoteFacilitatorUrl: 'https://facilitator.payai.network'
});

// Works with any chain automatically!
await manager.verifyPayment(paymentPayload, {
  network: 'solana-mainnet',
  amount: 0.001,
  ...
});

await manager.verifyPayment(paymentPayload, {
  network: 'base-sepolia',
  amount: 0.01,
  ...
});
```

## 🎯 Framework Integration

### Express

```typescript
import express from 'express';
import { MultichainFacilitatorManager } from '@x402-multichain/facilitator';
import { createExpressAdapter } from '@x402-multichain/facilitator/adapters/express';

const app = express();
app.use(express.json());

const manager = new MultichainFacilitatorManager({
  strategy: 'multichain',
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
  evmPrivateKey: process.env.EVM_PRIVATE_KEY,
});

// Mount facilitator endpoints: GET /facilitator/supported, POST /facilitator/verify, POST /facilitator/settle
createExpressAdapter(manager, app, '/facilitator');

app.listen(3000);
```

### Hono

```typescript
import { Hono } from 'hono';
import { MultichainFacilitatorManager } from '@x402-multichain/facilitator';
import { createHonoAdapter } from '@x402-multichain/facilitator/adapters/hono';

const app = new Hono();

const manager = new MultichainFacilitatorManager({
  strategy: 'multichain',
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
  evmPrivateKey: process.env.EVM_PRIVATE_KEY,
});

createHonoAdapter(manager, app, '/facilitator');

export default app;
```

## 📖 Documentation

- [Getting Started Guide](./docs/getting-started.md)
- [Solana Integration](./docs/solana-guide.md)
- [EVM Integration](./docs/evm-guide.md)
- [Multichain Setup](./docs/multichain-guide.md)
- [API Reference](./docs/api-reference.md)

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│  MultichainFacilitatorManager           │
│  (Unified Interface)                    │
└────────────┬────────────────────────────┘
             │
   ┌─────────┴─────────┐
   │                   │
   ▼                   ▼
┌──────────┐      ┌──────────┐
│ Solana   │      │   EVM    │
│Facilitator│      │Facilitator│
└──────────┘      └──────────┘
   │                   │
   ▼                   ▼
┌──────────┐      ┌──────────┐
│ Solana   │      │ Base/ETH │
│Blockchain│      │Blockchain│
└──────────┘      └──────────┘
```

## 💡 Use Cases

### AI Trading Bot
```typescript
// High-frequency RPC calls with pay-per-use
const manager = new MultichainFacilitatorManager({
  strategy: 'solana-only', // Fast, low-cost
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY
});
```

### Multi-Chain DApp
```typescript
// Support payments on any chain
const manager = new MultichainFacilitatorManager({
  strategy: 'multichain',
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
  evmPrivateKey: process.env.EVM_PRIVATE_KEY
});
```

### Enterprise API
```typescript
// Production-ready with fallback
const manager = new MultichainFacilitatorManager({
  strategy: 'auto',
  fallbackEnabled: true,
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
  evmPrivateKey: process.env.EVM_PRIVATE_KEY,
  remoteFacilitatorUrl: 'https://facilitator.payai.network'
});
```

## 🔐 Security

- **Hot Wallet**: The private keys are hot wallets. Use secure key management (KMS, HSM).
- **Dedicated Wallet**: Use a separate wallet for facilitation, not your main treasury.
- **Monitoring**: Monitor for unusual payment patterns.
- **Rotation**: Implement key rotation policies.

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🙏 Credits

Built on top of:
- [x402 Protocol](https://github.com/x402-protocol/x402)
- [@solana/web3.js](https://github.com/solana-labs/solana-web3.js)
- [viem](https://github.com/wagmi-dev/viem)

## 📞 Support

- [GitHub Issues](https://github.com/x402-labs/x402-multichain-facilitator/issues)
- [Documentation](./docs)
- [Examples](./packages/examples)

---

**Made with ❤️ by the x402 community**

