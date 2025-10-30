# Multichain Setup Guide

This guide explains how to set up and use the multichain facilitator to support payments on both Solana and EVM chains simultaneously.

## Overview

The multichain facilitator allows you to:
- Accept payments on **Solana** (SOL, USDC)
- Accept payments on **EVM chains** (Base, Ethereum, etc.)
- **Automatic routing** based on payment network
- **Fallback support** for high availability

## Architecture

```
┌─────────────────────────────────────────┐
│  MultichainFacilitatorManager           │
│  (Unified Payment Interface)            │
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

## Setup

### 1. Install

```bash
npm install @x402-multichain/facilitator viem
```

### 2. Generate Wallets

You need wallets for both chains:

#### Solana Wallet

```bash
# Generate Solana keypair
solana-keygen new --outfile solana-facilitator.json

# Get public key
solana-keygen pubkey solana-facilitator.json

# Get private key (base58)
cat solana-facilitator.json | jq -r '. | @base58'

# Fund with SOL (for gas fees)
solana transfer <pubkey> 0.1 --url mainnet-beta
```

#### EVM Wallet

```bash
# Generate with cast (Foundry)
cast wallet new

# Or use any wallet provider
# Save the private key (0x...)

# Fund with ETH/Base ETH (for gas fees)
```

### 3. Configure Environment

```bash
# .env

# Solana Configuration
SOLANA_PRIVATE_KEY=your_base58_private_key
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# EVM Configuration
EVM_PRIVATE_KEY=0xyour_private_key

# Optional: Remote Facilitator Fallback
PAYAI_FACILITATOR_URL=https://facilitator.payai.network

# Strategy
X402_FACILITATOR_TYPE=multichain  # or 'auto' for smart fallback
```

### 4. Initialize Facilitator

```typescript
import { MultichainFacilitatorManager } from '@x402-multichain/facilitator';
import { baseSepolia, base } from 'viem/chains';

const manager = new MultichainFacilitatorManager({
  // Strategy: 'multichain', 'auto', 'solana-only', 'evm-only'
  strategy: 'multichain',
  fallbackEnabled: true,
  
  // Solana configuration
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
  solanaNetworks: [
    {
      name: 'solana-mainnet',
      rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
      cluster: 'mainnet-beta',
    },
    {
      name: 'solana-devnet',
      rpcUrl: 'https://api.devnet.solana.com',
      cluster: 'devnet',
    }
  ],
  
  // EVM configuration
  evmPrivateKey: process.env.EVM_PRIVATE_KEY as `0x${string}`,
  evmNetworks: [
    base,           // Base Mainnet
    baseSepolia,    // Base Sepolia Testnet
  ],
  
  // Remote facilitator fallback (optional)
  remoteFacilitatorUrl: process.env.PAYAI_FACILITATOR_URL,
});
```

## Usage Patterns

### Pattern 1: User Chooses Chain

Let users choose which chain to pay on:

```typescript
// User selects Solana
const solanaPayment = await manager.verifyPayment(
  solanaPayload,
  {
    network: 'solana-mainnet',
    amount: 0.001,
    recipient: recipientAddress,
    nonce: generateNonce(),
  }
);

// User selects Base
const basePayment = await manager.verifyPayment(
  basePayload,
  {
    network: 'base',
    amount: 0.001,
    recipient: recipientAddress,
    nonce: generateNonce(),
  }
);
```

### Pattern 2: Auto-Select Based on User Wallet

```typescript
function selectNetworkForWallet(walletAddress: string) {
  // Solana addresses are base58 encoded
  if (walletAddress.length >= 32 && walletAddress.length <= 44) {
    return 'solana-mainnet';
  }
  // EVM addresses start with 0x
  if (walletAddress.startsWith('0x')) {
    return 'base';
  }
  throw new Error('Unknown wallet type');
}

const network = selectNetworkForWallet(userWallet);
const payment = await manager.verifyPayment(payload, {
  network,
  amount: 0.001,
  recipient: recipientAddress,
  nonce: generateNonce(),
});
```

### Pattern 3: Price Conversion

Offer the same price in different currencies:

```typescript
const prices = {
  'solana-mainnet': { amount: 0.001, token: 'SOL' },    // ~$0.10
  'base': { amount: 0.00003, token: 'ETH' },            // ~$0.10
};

// User selects their preferred chain
const selectedNetwork = userPreference.network;
const price = prices[selectedNetwork];

await manager.settlePayment(payload, {
  network: selectedNetwork,
  amount: price.amount,
  recipient: recipientAddress,
  nonce: generateNonce(),
});
```

## Supported Networks

### Solana Networks

| Network | Name | RPC URL |
|---------|------|---------|
| Mainnet | `solana-mainnet` | `https://api.mainnet-beta.solana.com` |
| Devnet | `solana-devnet` | `https://api.devnet.solana.com` |
| Testnet | `solana-testnet` | `https://api.testnet.solana.com` |

### EVM Networks

Import from `viem/chains`:

```typescript
import { 
  base,           // Base Mainnet
  baseSepolia,    // Base Sepolia Testnet
  mainnet,        // Ethereum Mainnet
  sepolia,        // Ethereum Sepolia
  polygon,        // Polygon
  arbitrum,       // Arbitrum
  optimism,       // Optimism
} from 'viem/chains';
```

## Strategy Options

### `multichain` (Default)

Supports both Solana and EVM payments simultaneously.

```typescript
{
  strategy: 'multichain',
  solanaPrivateKey: '...',
  evmPrivateKey: '...',
}
```

### `auto` (Recommended for Production)

Intelligently selects the best facilitator and provides fallback.

```typescript
{
  strategy: 'auto',
  fallbackEnabled: true,
  solanaPrivateKey: '...',
  evmPrivateKey: '...',
  remoteFacilitatorUrl: 'https://facilitator.payai.network',
}
```

### `solana-only`

Only process Solana payments.

```typescript
{
  strategy: 'solana-only',
  solanaPrivateKey: '...',
}
```

### `evm-only`

Only process EVM payments.

```typescript
{
  strategy: 'evm-only',
  evmPrivateKey: '...',
  evmNetworks: [base, baseSepolia],
}
```

## Fallback Configuration

Enable fallback for high availability:

```typescript
const manager = new MultichainFacilitatorManager({
  strategy: 'auto',
  fallbackEnabled: true,
  
  // Primary: Self-hosted facilitators
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
  evmPrivateKey: process.env.EVM_PRIVATE_KEY,
  
  // Fallback: Remote facilitator (PayAI)
  remoteFacilitatorUrl: 'https://facilitator.payai.network',
});
```

**Fallback Flow:**

```
Payment Request
    ↓
Try Self-Hosted Solana/EVM Facilitator
    ↓ (if fails)
Try Remote Facilitator (PayAI)
    ↓
Success or Error
```

## Integration with Express

```typescript
import express from 'express';
import { MultichainFacilitatorManager, createExpressAdapter } from '@x402-multichain/facilitator';
import { base, baseSepolia } from 'viem/chains';

const app = express();
app.use(express.json());

const manager = new MultichainFacilitatorManager({
  strategy: 'multichain',
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
  evmPrivateKey: process.env.EVM_PRIVATE_KEY,
  solanaNetworks: [/* ... */],
  evmNetworks: [base, baseSepolia],
});

// Mount endpoints
createExpressAdapter(manager, app, '/facilitator');

// GET  /facilitator/supported  - Lists supported networks
// POST /facilitator/verify     - Verifies payment
// POST /facilitator/settle     - Settles payment on-chain

app.listen(3000);
```

## Monitoring

### Check Supported Networks

```bash
curl http://localhost:3000/facilitator/supported
```

Response:
```json
{
  "kinds": [
    {
      "x402Version": 1,
      "scheme": "exact",
      "network": "solana-mainnet"
    },
    {
      "x402Version": 1,
      "scheme": "exact",
      "network": "base"
    }
  ]
}
```

### Check Facilitator Health

```typescript
const info = manager.getInfo();
console.log('Primary:', info.primary);
console.log('Fallback:', info.fallback);
```

## Security Best Practices

### 1. Wallet Security

- ✅ Use dedicated wallets for facilitation
- ✅ Don't use your main treasury wallet
- ✅ Keep minimum necessary balance
- ✅ Consider hardware security modules (HSM) for production

### 2. Key Management

```typescript
// ❌ Bad: Hardcoded keys
const manager = new MultichainFacilitatorManager({
  solanaPrivateKey: 'abc123...',  // Don't do this!
});

// ✅ Good: Environment variables
const manager = new MultichainFacilitatorManager({
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
  evmPrivateKey: process.env.EVM_PRIVATE_KEY,
});

// ✅ Better: Use KMS/Vault
import { getSecretFromVault } from './vault';
const manager = new MultichainFacilitatorManager({
  solanaPrivateKey: await getSecretFromVault('solana-key'),
  evmPrivateKey: await getSecretFromVault('evm-key'),
});
```

### 3. Monitoring

Monitor for:
- Unusual payment volumes
- Failed verifications
- Settlement failures
- Gas fee spikes

### 4. Rate Limiting

Implement rate limiting on facilitator endpoints:

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/facilitator', limiter);
createExpressAdapter(manager, app, '/facilitator');
```

## Cost Analysis

### Gas Fees Comparison

| Chain | Avg Gas Fee | Settlement Time |
|-------|-------------|-----------------|
| Solana | ~$0.00001 | 1-2 seconds |
| Base | ~$0.001 | 2-5 seconds |
| Ethereum | ~$1-5 | 12-20 seconds |

### Recommendations

- **High Volume, Low Value**: Use Solana (lowest fees)
- **EVM Ecosystem**: Use Base (lower than Ethereum)
- **Both**: Let users choose (multichain strategy)

## Troubleshooting

### "Network not supported"

Check your configuration:
```typescript
// Ensure network names match exactly
manager.verifyPayment(payload, {
  network: 'solana-mainnet', // Must match config
});
```

### "Insufficient funds for gas"

Fund your facilitator wallets:

```bash
# Solana
solana transfer <facilitator-pubkey> 0.1

# Base (using cast)
cast send <facilitator-address> --value 0.01ether --private-key $EVM_PRIVATE_KEY
```

### "Private key invalid"

Ensure correct format:
- **Solana**: Base58-encoded private key
- **EVM**: Hex string starting with `0x`

## Next Steps

- Review [Solana Guide](./solana-guide.md) for Solana-specific details
- Review [EVM Guide](./evm-guide.md) for EVM-specific details
- Check out [Examples](../packages/examples/)
- Read [API Reference](./api-reference.md)

## Support

- [GitHub Issues](https://github.com/x402-labs/x402-multichain-facilitator/issues)
- [Documentation](.)

