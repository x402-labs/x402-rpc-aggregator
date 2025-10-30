import bs58 from 'bs58';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction } from '@solana/spl-token';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // Solana USDC

export class X402Agent {
  private baseUrl: string;
  private connection: Connection;

  constructor(baseUrl = 'https://x402-rpc-aggregator.up.railway.app') {
    this.baseUrl = baseUrl;
    this.connection = new Connection('https://api.mainnet-beta.solana.com');
  }

  async callRPC(method: string, params: any[] = [], chain = 'solana') {
    const res = await fetch(`${this.baseUrl}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, params, chain }),
    });

    if (res.status === 402) {
      const { invoice } = await res.json();
      const payment = await this.payInvoice(invoice);
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

  private async payInvoice(invoice: any): Promise<any> {
    const wallet = (window as any).solana;
    if (!wallet?.isPhantom && !wallet?.isSolflare) {
      throw new Error('Phantom or Solflare wallet not detected');
    }

    if (invoice.facilitator?.includes('payai')) {
      // === PAYAI NETWORK (BASE) ===
      const { signMessage } = (window as any).ethereum;
      if (!signMessage) throw new Error('MetaMask not available for PayAI');

      const message = new TextEncoder().encode(JSON.stringify(invoice));
      const signature = await signMessage(message);
      return {
        paymentPayload: { signedIntent: { signature: bs58.encode(signature) } },
        paymentRequirements: { amount: invoice.amount, recipient: invoice.to },
      };
    }

    // === SOLANA PAYMENT (SELF-HOSTED) ===
    if (!wallet.isConnected) await wallet.connect();

    const payer = wallet.publicKey;
    const recipient = new PublicKey(invoice.to);
    const amount = Math.floor(invoice.amount * 1_000_000); // USDC has 6 decimals

    // Build USDC transfer
    const sourceATA = await getAssociatedTokenAddress(new PublicKey(USDC_MINT), payer);
    const destATA = await getAssociatedTokenAddress(new PublicKey(USDC_MINT), recipient);

    const tx = new Transaction().add(
      createTransferInstruction(sourceATA, destATA, payer, amount)
    );

    const { blockhash } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = payer;

    const signedTx = await wallet.signTransaction(tx);
    const serializedTx = signedTx.serialize();
    const txBase64 = bs58.encode(serializedTx);

    // Sign intent message
    const intentMsg = new TextEncoder().encode(
      JSON.stringify({
        amount: invoice.amount,
        to: invoice.to,
        nonce: invoice.nonce,
        resource: invoice.resource,
      })
    );
    const intentSig = await wallet.signMessage(intentMsg);
    const signedIntent = {
      publicKey: payer.toBase58(),
      signature: bs58.encode(intentSig),
    };

    return {
      paymentPayload: {
        signedIntent,
        txBase64,
        network: 'solana-mainnet',
      },
      paymentRequirements: {
        amount: invoice.amount,
        recipient: invoice.to,
      },
    };
  }
}