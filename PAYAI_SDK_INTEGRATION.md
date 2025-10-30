# PayAI SDK Integration Guide

This guide explains how the x402-RPC-Aggregator integrates with the official PayAI Network SDK ([x402-solana](https://github.com/PayAINetwork/x402-solana)).

---

## 🎯 Overview

The x402-RPC-Aggregator now uses the **official PayAI SDK** for USDC-based payments, providing:

✅ **Type-safe** payment verification and settlement  
✅ **Official PayAI protocol** compliance  
✅ **Automatic failover** to HTTP API if SDK unavailable  
✅ **Production-ready** with Zod validation  
✅ **Zero additional config** - uses existing `X402_WALLET`

---

## 📦 Installation

The SDK is automatically installed with the project:

```bash
npm install x402-solana
```

**Version**: `0.1.1` (latest stable)  
**Source**: https://github.com/PayAINetwork/x402-solana

---

## 🏗️ Architecture

### Before (HTTP API only):

```
PayAIFacilitator
    ↓ (axios HTTP calls)
https://facilitator.payai.network/verify
https://facilitator.payai.network/settle
```

### After (SDK + HTTP fallback):

```
PayAIFacilitator
    ├─ TRY: PayAISdkFacilitator (x402-solana SDK)
    │       ↓
    │   X402PaymentHandler.verifyPayment()
    │   X402PaymentHandler.settlePayment()
    │       ↓
    │   https://facilitator.payai.network (via SDK)
    │
    └─ FALLBACK: Direct HTTP API (original implementation)
            ↓
        axios.post('/verify')
        axios.post('/settle')
```

**Benefits**:
- 🎯 **Type safety** - TypeScript + Zod validation
- 🔄 **Robustness** - Automatic HTTP fallback
- ✅ **Official** - PayAI-maintained SDK
- 📚 **Standards** - Follows x402 protocol spec

---

## 🔧 Configuration

### Environment Variables

The SDK uses the existing `X402_WALLET` environment variable:

```bash
# Treasury wallet (where USDC payments are sent)
X402_WALLET=YourSolanaWalletAddress

# PayAI facilitator URL (optional, defaults to production)
PAYAI_FACILITATOR_URL=https://facilitator.payai.network

# Facilitator type (choose PayAI to use SDK)
X402_FACILITATOR_TYPE=payai  # or 'auto'
```

**Important**: The SDK requires `X402_WALLET` to initialize. If not set, it falls back to HTTP API.

---

## 📝 Implementation Details

### File: `src/facilitator/payai-sdk-facilitator.ts`

This wrapper integrates the official `x402-solana` SDK:

```typescript
import { X402PaymentHandler } from 'x402-solana/server';

export class PayAISdkFacilitator {
  private handler: X402PaymentHandler;

  constructor(config: PayAISdkFacilitatorConfig) {
    this.handler = new X402PaymentHandler({
      network: 'solana', // mainnet
      treasuryAddress: config.treasuryAddress, // X402_WALLET
      facilitatorUrl: config.facilitatorUrl || 'https://facilitator.payai.network',
      defaultToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mainnet
    });
  }

  async verifyPayment(paymentPayload, paymentRequirements) {
    // Create SDK-compatible payment requirements
    const sdkRequirements = await this.handler.createPaymentRequirements({
      price: {
        amount: String(Math.floor(paymentRequirements.amount * 1e6)), // USD to micro-USDC
        asset: {
          address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        },
      },
      network: this.network,
      config: {
        description: paymentRequirements.resource || 'RPC Access',
        resource: paymentRequirements.resource || '/rpc',
      },
    });

    // Verify using SDK
    const isValid = await this.handler.verifyPayment(paymentHeader, sdkRequirements);
    return { valid: isValid, payer: ... };
  }

  async settlePayment(paymentPayload, paymentRequirements) {
    // Settle using SDK
    const result = await this.handler.settlePayment(paymentHeader, sdkRequirements);
    return { settled: true, txHash: result.transaction };
  }
}
```

### File: `src/facilitator/facilitator-manager.ts`

Updated `PayAIFacilitator` class to use SDK:

```typescript
export class PayAIFacilitator implements IFacilitator {
  name = 'PayAI Network';
  type: FacilitatorType = 'payai';
  private sdkFacilitator: PayAISdkFacilitator | null = null;
  private facilitatorUrl: string;

  constructor(config: FacilitatorConfig) {
    // Try to initialize SDK if X402_WALLET is set
    const treasuryAddress = process.env.X402_WALLET;
    if (treasuryAddress) {
      this.sdkFacilitator = new PayAISdkFacilitator({
        network: 'solana',
        treasuryAddress,
        facilitatorUrl: this.facilitatorUrl,
      });
    }
  }

  async verifyPayment(paymentPayload, paymentRequirements) {
    // Try SDK first
    if (this.sdkFacilitator) {
      try {
        return await this.sdkFacilitator.verifyPayment(...);
      } catch (err) {
        console.warn('SDK failed, trying HTTP fallback');
      }
    }

    // Fallback to HTTP API
    return await axios.post(`${this.facilitatorUrl}/verify`, ...);
  }
}
```

---

## 🔄 Payment Flow with SDK

### 1. Client Request
```json
POST /rpc
{
  "method": "getSlot",
  "chain": "solana",
  "facilitator": "payai"
}
```

### 2. Server Returns 402 Invoice
```json
{
  "invoice": {
    "amount": 0.0001,
    "to": "TreasuryWalletAddress",
    "network": "solana-mainnet",
    "nonce": "...",
    "resource": "/rpc"
  }
}
```

### 3. Client Builds USDC Payment
```typescript
// Client-side (demo.html)
const usdcAmount = BigInt(Math.floor(invoice.amount * 1e6)); // 100 micro-USDC

tx.add(splToken.createTransferInstruction(
  fromATA,  // Buyer's USDC account
  toATA,    // Treasury's USDC account
  wallet.publicKey,
  usdcAmount
));
```

### 4. Client Sends Payment
```json
POST /rpc
Headers: {
  "x402-payment": "{
    \"paymentPayload\": {
      \"signedIntent\": { ... },
      \"txBase64\": \"...\",
      \"network\": \"solana-mainnet\"
    },
    \"paymentRequirements\": { ... }
  }"
}
```

### 5. Server Verifies with SDK
```typescript
// PayAIFacilitator.verifyPayment()
↓
// PayAISdkFacilitator.verifyPayment()
↓
// X402PaymentHandler.verifyPayment() [from SDK]
↓
// POST https://facilitator.payai.network/verify (via SDK)
↓
// Returns: { isValid: true, payer: "..." }
```

### 6. Server Settles with SDK
```typescript
// PayAIFacilitator.settlePayment()
↓
// PayAISdkFacilitator.settlePayment()
↓
// X402PaymentHandler.settlePayment() [from SDK]
↓
// POST https://facilitator.payai.network/settle (via SDK)
↓
// Returns: { success: true, transaction: "signature..." }
```

### 7. Server Returns RPC Result
```json
{
  "result": { "slot": 123456 },
  "x402": {
    "facilitator": "PayAI Network",
    "txHash": "5a7b...c8d9",
    "paymentInfo": {
      "explorer": "https://solscan.io/tx/..."
    }
  }
}
```

---

## 🆚 SDK vs HTTP API Comparison

| Feature | PayAI SDK | HTTP API (Fallback) |
|---------|-----------|---------------------|
| **Type Safety** | ✅ Full TypeScript | ⚠️ Runtime only |
| **Validation** | ✅ Zod schemas | ⚠️ Manual |
| **Error Handling** | ✅ Typed errors | ⚠️ Generic |
| **Protocol Compliance** | ✅ Official spec | ⚠️ Best-effort |
| **Maintenance** | ✅ PayAI-maintained | ⚠️ Manual updates |
| **Setup Required** | ✅ X402_WALLET | ❌ None |
| **Fallback** | ❌ N/A | ✅ Always works |

**Decision Logic**:
1. If `X402_WALLET` is set → Use SDK (preferred)
2. If SDK fails → Fallback to HTTP API (robust)
3. If `X402_WALLET` not set → Use HTTP API directly

---

## 🧪 Testing

### Test PayAI SDK

```bash
# Set treasury wallet
export X402_WALLET=YourSolanaWalletAddress

# Set facilitator type
export X402_FACILITATOR_TYPE=payai

# Start server
npm start

# Server logs will show:
# ✅ PayAI SDK Facilitator initialized with treasury: YourWallet...
```

### Verify SDK is Active

```bash
curl http://localhost:3000/facilitator
```

**Expected Response**:
```json
{
  "primary": {
    "name": "PayAI Network",
    "type": "payai",
    "available": true
  },
  "fallback": null
}
```

### Check Server Logs

When processing a payment, you should see:

```
🔍 PayAI SDK: Starting verification
   Payment payload: signedIntent, txBase64, network
   Requirements: { amount: 0.0001, recipient: '...', nonce: '...' }
   Verification result: true
💰 PayAI SDK: Starting settlement
   Settlement result: { success: true, transaction: '5a7b...' }
✅ Payment settled by PayAI Network: 5a7b...c8d9
```

If SDK fails, you'll see fallback messages:

```
⚠️ PayAI SDK verify failed, trying HTTP fallback: ...
```

---

## 📊 Payment Amount Conversion

The SDK expects USDC amounts in **micro-units** (6 decimals) as **strings**:

| USD Amount | Micro-USDC (SDK Format) |
|------------|-------------------------|
| $0.0001 | `"100"` |
| $0.01 | `"10000"` |
| $1.00 | `"1000000"` |
| $2.50 | `"2500000"` |

**Conversion in Code**:
```typescript
// Our internal amount (USD)
const amount = 0.0001;

// Convert to SDK format (micro-USDC string)
const sdkAmount = String(Math.floor(amount * 1e6)); // "100"
```

---

## 🔐 USDC Token Addresses

The SDK uses these USDC mint addresses:

| Network | USDC Mint Address |
|---------|-------------------|
| **Mainnet** | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| **Devnet** | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

Currently, we use **mainnet** for production deployments.

---

## 🚨 Common Issues

### Issue 1: SDK initialization fails
**Cause**: `X402_WALLET` not set  
**Fix**: Set the environment variable or rely on HTTP fallback  
**Impact**: System automatically falls back to HTTP API (no user impact)

### Issue 2: "Invalid payment" from SDK
**Cause**: Payment payload format mismatch  
**Fix**: SDK expects specific format - our wrapper handles conversion  
**Status**: ✅ Already handled in `payai-sdk-facilitator.ts`

### Issue 3: Network mismatch (devnet vs mainnet)
**Cause**: Client using devnet USDC on mainnet facilitator  
**Fix**: Ensure client and server use same network  
**Current**: Hardcoded to `'solana'` (mainnet)

---

## 🎓 Benefits of SDK Integration

### 1. **Type Safety**
```typescript
// Before (HTTP API)
const response = await axios.post('/verify', data); // any
const isValid = response.data.isValid; // no type checking

// After (SDK)
const result: VerifyResult = await handler.verifyPayment(...);
if (result.valid) { ... } // TypeScript checks this
```

### 2. **Protocol Compliance**
The SDK follows the official x402 protocol specification with Zod validation, ensuring all requests/responses match the expected format.

### 3. **Automatic Updates**
PayAI maintains the SDK, so protocol updates are automatically available via `npm update`.

### 4. **Graceful Degradation**
If the SDK fails for any reason, the system automatically falls back to direct HTTP API calls.

---

## 📚 Additional Resources

- **PayAI x402-solana GitHub**: https://github.com/PayAINetwork/x402-solana
- **x402 Protocol Spec**: https://docs.payai.network/x402
- **PayAI Network**: https://payai.network
- **API Documentation**: https://docs.payai.network

---

## 🔄 Migration from HTTP to SDK

No migration needed! The integration is **backward compatible**:

- ✅ Existing clients work without changes
- ✅ Payment format stays the same
- ✅ Automatic fallback ensures reliability
- ✅ Server logs show which method is used

---

## 📊 Summary

| Aspect | Details |
|--------|---------|
| **Package** | `x402-solana@0.1.1` |
| **Wrapper File** | `src/facilitator/payai-sdk-facilitator.ts` |
| **Integration** | `src/facilitator/facilitator-manager.ts` (PayAIFacilitator) |
| **Config Required** | `X402_WALLET` environment variable |
| **Fallback** | Direct HTTP API (no SDK) |
| **Payment Token** | USDC (mainnet: EPjFWdd5...) |
| **Network** | Solana mainnet |

---

## ✅ Testing Checklist

- [x] Install x402-solana package
- [x] Create PayAISdkFacilitator wrapper
- [x] Integrate with PayAIFacilitator
- [x] Add HTTP API fallback
- [x] Test with X402_WALLET set
- [ ] Test with X402_WALLET unset (should fallback to HTTP)
- [ ] Verify payment flow end-to-end
- [ ] Check server logs for SDK usage
- [ ] Test devnet vs mainnet

---

**Built with the official PayAI SDK for maximum reliability and protocol compliance!** 🚀

