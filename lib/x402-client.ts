import bs58 from 'bs58';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction } from '@solana/spl-token';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // Solana USDC

export interface X402AgentConfig {
  baseUrl?: string;
}

export class X402Agent {
  private baseUrl: string;
  private connection: Connection;

  constructor(config: X402AgentConfig = {}) {
    this.baseUrl = config.baseUrl || 'https://x402labs.cloud';
    
    // Use backend's Helius RPC proxy for transactions
    // Backend handles the Helius API key and routing
    this.connection = new Connection(this.baseUrl + '/solana-rpc', {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    });
    
    console.log(`✅ X402Agent initialized - using backend's Helius RPC`);
  }

  async callRPC(method: string, params: any[] = [], chain = 'solana') {
    const res = await fetch(`${this.baseUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, params, chain }),
    });

    if (res.status === 402) {
      // x402scan-compliant response format
      const x402Response = await res.json();
      
      // Extract payment details from accepts array
      if (!x402Response.accepts || x402Response.accepts.length === 0) {
        throw new Error('Invalid x402 response: no payment options available');
      }
      
      const paymentDetails = x402Response.accepts[0];
      const payment = await this.payInvoice(paymentDetails);
      
      const retry = await fetch(`${this.baseUrl}/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x402-payment': JSON.stringify(payment),
        },
        body: JSON.stringify({ method, params, chain }),
      });
      return retry.json();
    }

    return res.json();
  }

  private async payInvoice(paymentDetails: any): Promise<any> {
    const wallet = (window as any).solana;
    if (!wallet?.isPhantom && !wallet?.isSolflare) {
      throw new Error('Phantom or Solflare wallet not detected');
    }

    // Extract facilitator info from extra metadata
    const facilitator = paymentDetails.extra?.facilitator?.primary || '';
    const network = paymentDetails.network || 'solana';

    console.log(`💳 Processing payment for ${facilitator || 'x402labs'} on ${network}`);

    if (facilitator?.includes('payai')) {
      // === PAYAI NETWORK (BASE) ===
      const { signMessage } = (window as any).ethereum;
      if (!signMessage) throw new Error('MetaMask not available for PayAI');

      const message = new TextEncoder().encode(JSON.stringify(paymentDetails));
      const signature = await signMessage(message);
      return {
        paymentPayload: { signedIntent: { signature: bs58.encode(signature) } },
        paymentRequirements: { 
          amount: parseFloat(paymentDetails.maxAmountRequired), 
          recipient: paymentDetails.payTo 
        },
      };
    }

    if (facilitator?.includes('codenut') || facilitator?.includes('CodeNut')) {
      // === CODENUT FACILITATOR ===
      console.log(`🥜 Using CodeNut facilitator for ${network}`);
      
      if (network === 'base') {
        // Base/EVM payment via CodeNut
        const { ethereum } = window as any;
        if (!ethereum) throw new Error('MetaMask or EVM wallet not detected for CodeNut Base payments');

        const nonce = paymentDetails.extra?.nonce || `${Date.now()}-${Math.random()}`;
        const intentMsg = new TextEncoder().encode(
          JSON.stringify({
            amount: paymentDetails.maxAmountRequired,
            to: paymentDetails.payTo,
            nonce,
            resource: paymentDetails.resource,
            network: 'base',
          })
        );

        // Request signature from EVM wallet
        const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
        const account = accounts[0];
        
        const signature = await ethereum.request({
          method: 'personal_sign',
          params: [Buffer.from(intentMsg).toString('hex'), account],
        });

        return {
          paymentPayload: {
            signedIntent: {
              publicKey: account,
              signature,
            },
            network: 'base',
            facilitator: 'codenut',
          },
          paymentRequirements: {
            scheme: 'exact',
            network: 'base',
            maxAmountRequired: paymentDetails.maxAmountRequired,
            asset: paymentDetails.asset || 'USDC',
            payTo: paymentDetails.payTo,
            resource: paymentDetails.resource || '',
            description: 'x402 RPC payment via CodeNut',
            extra: { nonce },
          },
        };
      } else {
        // Solana payment via CodeNut (USDC)
        if (!wallet.isConnected) await wallet.connect();

        const payer = wallet.publicKey;
        const recipient = new PublicKey(paymentDetails.payTo);
        const amountBaseUnits = parseInt(paymentDetails.maxAmountRequired, 10); // micro-USDC

        console.log(`💰 Preparing USDC payment: ${amountBaseUnits} micro-USDC to ${paymentDetails.payTo}`);

        // Build USDC transfer
        const usdcMint = new PublicKey(USDC_MINT);
        const sourceATA = await getAssociatedTokenAddress(usdcMint, payer);
        const destATA = await getAssociatedTokenAddress(usdcMint, recipient);

        const tx = new Transaction().add(
          createTransferInstruction(sourceATA, destATA, payer, amountBaseUnits)
        );

        // Get fresh blockhash
        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
        tx.feePayer = payer;

        // Sign transaction
        const signedTx = await wallet.signTransaction(tx);
        const serializedTx = signedTx.serialize();
        const txBase64 = bs58.encode(serializedTx);

        // Sign intent message
        const nonce = paymentDetails.extra?.nonce || `${Date.now()}-${Math.random()}`;
        const intentMsg = new TextEncoder().encode(
          JSON.stringify({
            amount: parseFloat(paymentDetails.maxAmountRequired),
            to: paymentDetails.payTo,
            nonce,
            resource: paymentDetails.resource,
          })
        );
        const intentSig = await wallet.signMessage(intentMsg);

        console.log(`✅ CodeNut Solana payment prepared`);

        return {
          paymentPayload: {
            signedIntent: {
              publicKey: payer.toBase58(),
              signature: bs58.encode(intentSig),
            },
            txBase64,
            network: 'solana-mainnet',
            facilitator: 'codenut',
          },
          paymentRequirements: {
            scheme: 'exact',
            network: 'solana',
            maxAmountRequired: String(amountBaseUnits),
            asset: { address: USDC_MINT },
            payTo: paymentDetails.payTo,
            resource: paymentDetails.resource || '',
            description: 'x402 RPC payment via CodeNut',
            extra: { nonce },
          },
        };
      }
    }

    // === SOLANA PAYMENT (SELF-HOSTED x402labs) ===
    if (!wallet.isConnected) await wallet.connect();

    const payer = wallet.publicKey;
    const recipient = new PublicKey(paymentDetails.payTo);
    const amount = Math.floor(parseFloat(paymentDetails.maxAmountRequired) * 1_000_000); // USDC has 6 decimals

    console.log(`💰 Preparing USDC payment: ${paymentDetails.maxAmountRequired} USDC to ${paymentDetails.payTo}`);

    // Build USDC transfer
    const sourceATA = await getAssociatedTokenAddress(new PublicKey(USDC_MINT), payer);
    const destATA = await getAssociatedTokenAddress(new PublicKey(USDC_MINT), recipient);

    const tx = new Transaction().add(
      createTransferInstruction(sourceATA, destATA, payer, amount)
    );

    // Get fresh blockhash via backend's Helius RPC
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = payer;

    // Sign transaction with wallet
    const signedTx = await wallet.signTransaction(tx);
    const serializedTx = signedTx.serialize();
    const txBase64 = bs58.encode(serializedTx);

    console.log(`✅ Transaction signed and serialized`);
    console.log(`📦 Transaction size: ${serializedTx.length} bytes`);

    // Sign intent message
    const nonce = paymentDetails.extra?.nonce || `${Date.now()}-${Math.random()}`;
    const intentMsg = new TextEncoder().encode(
      JSON.stringify({
        amount: parseFloat(paymentDetails.maxAmountRequired),
        to: paymentDetails.payTo,
        nonce,
        resource: paymentDetails.resource,
      })
    );
    const intentSig = await wallet.signMessage(intentMsg);
    const signedIntent = {
      publicKey: payer.toBase58(),
      signature: bs58.encode(intentSig),
    };

    console.log(`✅ Payment intent signed`);
    console.log(`📤 Sending signed transaction to backend for settlement...`);

    // Return signed transaction for backend to settle
    return {
      paymentPayload: {
        signedIntent,
        txBase64,  // Backend will broadcast this
        network: paymentDetails.network,
      },
      paymentRequirements: {
        amount: parseFloat(paymentDetails.maxAmountRequired),
        recipient: paymentDetails.payTo,
      },
    };
  }
}