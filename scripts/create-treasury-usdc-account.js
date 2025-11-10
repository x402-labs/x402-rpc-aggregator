#!/usr/bin/env node
/**
 * Create Treasury USDC Account
 * 
 * PayAI Network requires the merchant's USDC ATA to exist before accepting payments.
 * This script creates the USDC associated token account for your treasury wallet.
 */

const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } = require('@solana/spl-token');
const bs58 = require('bs58');
const fs = require('fs');
const path = require('path');

// USDC mainnet mint
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

async function main() {
  // Load environment
  const envPath = path.join(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found');
    process.exit(1);
  }

  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length) {
        process.env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });

  const privateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ SOLANA_PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  const heliusUrl = process.env.HELIUS_RPC_URL;
  if (!heliusUrl) {
    console.error('❌ HELIUS_RPC_URL not set in .env');
    console.error('   We need a reliable RPC to create the account');
    process.exit(1);
  }

  console.log('\n🏦 Creating Treasury USDC Account for PayAI Network');
  console.log('═'.repeat(60));

  // Derive keypair
  const secretKey = bs58.decode(privateKey);
  const keypair = Keypair.fromSecretKey(secretKey);
  const treasuryPubkey = keypair.publicKey;

  console.log(`Treasury Wallet: ${treasuryPubkey.toBase58()}`);

  // Connect to Solana
  const connection = new Connection(heliusUrl, 'confirmed');

  // Get treasury's USDC ATA address
  const ata = await getAssociatedTokenAddress(
    USDC_MINT,
    treasuryPubkey
  );

  console.log(`USDC ATA Address: ${ata.toBase58()}`);
  console.log('');

  // Check if ATA already exists
  const accountInfo = await connection.getAccountInfo(ata);
  if (accountInfo) {
    console.log('✅ Treasury USDC account already exists!');
    console.log(`   Balance: ${accountInfo.lamports} lamports`);
    console.log('');
    console.log('ℹ️  No action needed - ready for PayAI Network payments');
    return;
  }

  console.log('⚠️  Treasury USDC account does not exist yet');
  console.log('   Creating it now...');
  console.log('');

  // Create the ATA
  const createIx = createAssociatedTokenAccountInstruction(
    treasuryPubkey,  // payer (treasury pays for itself)
    ata,             // associated token account
    treasuryPubkey,  // owner (treasury)
    USDC_MINT        // mint
  );

  const tx = new Transaction().add(createIx);
  tx.feePayer = treasuryPubkey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  // Sign and send
  tx.sign(keypair);
  
  console.log('📤 Broadcasting transaction...');
  const signature = await connection.sendRawTransaction(tx.serialize());
  console.log(`   Signature: ${signature}`);
  
  console.log('⏳ Waiting for confirmation...');
  await connection.confirmTransaction(signature, 'confirmed');
  
  console.log('');
  console.log('✅ Treasury USDC account created successfully!');
  console.log('═'.repeat(60));
  console.log(`ATA Address: ${ata.toBase58()}`);
  console.log(`Transaction: https://solscan.io/tx/${signature}`);
  console.log('');
  console.log('🎉 Your server is now ready to accept PayAI Network payments!');
  console.log('');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});

