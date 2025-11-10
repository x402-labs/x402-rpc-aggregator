#!/usr/bin/env node
/**
 * Utility to derive public key from private key
 * Usage: node scripts/derive-wallet.js <base58-private-key>
 */

const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const fs = require('fs');
const path = require('path');

// Read private key from .env or args
let privateKey = process.argv[2];

if (!privateKey) {
  // Try to read from .env
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/SOLANA_PRIVATE_KEY=([^\s]+)/);
    if (match) {
      privateKey = match[1];
    }
  }
}

if (!privateKey || privateKey === 'your_base58_solana_private_key_here') {
  console.error('❌ Error: SOLANA_PRIVATE_KEY not found');
  console.log('\nUsage:');
  console.log('  node scripts/derive-wallet.js <base58-private-key>');
  console.log('  OR set SOLANA_PRIVATE_KEY in .env');
  process.exit(1);
}

try {
  // Derive public key from private key
  const secretKey = bs58.decode(privateKey);
  const keypair = Keypair.fromSecretKey(secretKey);
  const publicKey = keypair.publicKey.toBase58();

  console.log('\n✅ Wallet Derived Successfully!');
  console.log('═'.repeat(60));
  console.log(`Public Key:  ${publicKey}`);
  console.log('═'.repeat(60));
  console.log('\nAdd this to your .env file:');
  console.log(`X402_WALLET=${publicKey}`);
  console.log('');

  // Optionally update .env file
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Check if X402_WALLET already exists
    if (envContent.includes('X402_WALLET=')) {
      envContent = envContent.replace(
        /X402_WALLET=.*/,
        `X402_WALLET=${publicKey}`
      );
      console.log('✅ Updated X402_WALLET in .env');
    } else {
      envContent += `\nX402_WALLET=${publicKey}\n`;
      console.log('✅ Added X402_WALLET to .env');
    }
    
    fs.writeFileSync(envPath, envContent);
  }

} catch (err) {
  console.error('❌ Error deriving wallet:', err.message);
  console.log('\nMake sure your private key is valid base58-encoded Solana private key');
  process.exit(1);
}

