# Getting Started with @x402-multichain/facilitator

This guide will help you set up the multichain facilitator in your project.

## Installation

```bash
npm install @x402-multichain/facilitator
```

## Basic Setup

### 1. Choose Your Strategy

You have several options:

- **Solana Only**: Only process Solana payments
- **EVM Only**: Only process EVM payments (Ethereum, Base, etc.)
- **Multichain**: Support both Solana and EVM
- **Auto with Fallback**: Automatically fallback between facilitators

### 2. Generate Wallets

#### For Solana:

```bash
# Generate a new Solana wallet
solana-keygen new --outfile facilitator-key.json

# Get the public key
solana-keygen pubkey facilitator-key.json

# Get the private key in base58 format
cat facilitator-key.json | jq -r '. | @base58'
```

#### For EVM:

```bash
# Generate with cast (foundry)
cast wallet new

# Or use any wallet tool that gives you a private key
```

### 3. Configure Environment

Create a `.env` file:

```bash
# Solana Configuration
SOLANA_PRIVATE_KEY=your_base58_private_key_here
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# EVM Configuration  
EVM_PRIVATE_KEY=0xyour_private_key_here

# Optional: Remote Facilitator Fallback
PAYAI_FACILITATOR_URL=https://facilitator.payai.network

# Server
PORT=3000
```

### 4. Initialize Facilitator

```typescript
import { MultichainFacilitatorManager } from '@x402-multichain/facilitator';
import { baseSepolia } from 'viem/chains';

const manager = new MultichainFacilitatorManager({
  strategy: 'auto', // or 'solana-only', 'evm-only', 'multichain'
  fallbackEnabled: true,
  
  // Solana config
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
  solanaNetworks: [{
    name: 'solana-mainnet',
    rpcUrl: process.env.SOLANA_RPC_URL,
    cluster: 'mainnet-beta',
  }],
  
  // EVM config
  evmPrivateKey: process.env.EVM_PRIVATE_KEY,
  evmNetworks: [baseSepolia],
  
  // Remote fallback
  remoteFacilitatorUrl: process.env.PAYAI_FACILITATOR_URL,
});
```

## Quick Examples

### Example 1: Solana Only

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

// Use it
const verified = await facilitator.verifyPayment(paymentPayload, paymentRequirements);
const settled = await facilitator.settlePayment(paymentPayload, paymentRequirements);
```

### Example 2: With Express

```typescript
import express from 'express';
import { MultichainFacilitatorManager, createExpressAdapter } from '@x402-multichain/facilitator';

const app = express();
app.use(express.json());

const manager = new MultichainFacilitatorManager({
  strategy: 'multichain',
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
  evmPrivateKey: process.env.EVM_PRIVATE_KEY,
});

// This creates GET /facilitator/supported, POST /facilitator/verify, POST /facilitator/settle
createExpressAdapter(manager, app, '/facilitator');

app.listen(3000);
```

### Example 3: With Hono

```typescript
import { Hono } from 'hono';
import { MultichainFacilitatorManager, createHonoAdapter } from '@x402-multichain/facilitator';

const app = new Hono();

const manager = new MultichainFacilitatorManager({
  strategy: 'multichain',
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY,
  evmPrivateKey: process.env.EVM_PRIVATE_KEY,
});

createHonoAdapter(manager, app, '/facilitator');

export default app;
```

## Using the Facilitator

Once your facilitator is running, it exposes three endpoints:

### GET /facilitator/supported

Returns which payment networks this facilitator supports.

**Response:**
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
      "network": "base-sepolia"
    }
  ]
}
```

### POST /facilitator/verify

Verifies a payment without settling it on-chain.

**Request:**
```json
{
  "paymentPayload": { ... },
  "paymentRequirements": {
    "network": "solana-mainnet",
    "amount": 0.001,
    "recipient": "...",
    "nonce": "..."
  }
}
```

**Response:**
```json
{
  "valid": true,
  "payer": "wallet_address"
}
```

### POST /facilitator/settle

Settles a payment on-chain.

**Request:**
```json
{
  "paymentPayload": { ... },
  "paymentRequirements": {
    "network": "solana-mainnet",
    "amount": 0.001,
    "recipient": "...",
    "nonce": "..."
  }
}
```

**Response:**
```json
{
  "success": true,
  "transaction": "tx_hash_here"
}
```

## Next Steps

- Read the [Solana Integration Guide](./solana-guide.md)
- Read the [EVM Integration Guide](./evm-guide.md)
- Read the [Multichain Setup Guide](./multichain-guide.md)
- Check out [Examples](../packages/examples/)
- Review the [API Reference](./api-reference.md)

## Troubleshooting

### "Private key required"

Make sure your environment variables are set correctly:

```bash
echo $SOLANA_PRIVATE_KEY
echo $EVM_PRIVATE_KEY
```

### "Network not supported"

Check that the network name matches exactly what your facilitator supports. Use the `/facilitator/supported` endpoint to see available networks.

### "Transaction failed"

Make sure your facilitator wallet has enough funds for gas fees:

- **Solana**: ~0.01 SOL for transaction fees
- **EVM**: Enough ETH/Base ETH for gas

## Security Notes

⚠️ **Important Security Considerations:**

1. **Hot Wallet**: The private keys are hot wallets used for facilitation
2. **Dedicated Wallet**: Use a separate wallet, not your main treasury
3. **Key Management**: Consider using KMS, HSM, or secure vault for production
4. **Monitoring**: Monitor for unusual payment patterns
5. **Rotation**: Implement key rotation policies

## Support

- [GitHub Issues](https://github.com/x402-labs/x402-multichain-facilitator/issues)
- [Documentation](../docs/)
- [Examples](../packages/examples/)

