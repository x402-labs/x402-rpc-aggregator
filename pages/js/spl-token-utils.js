// Manual implementation of SPL Token functions we need
window.splToken = {
  TOKEN_PROGRAM_ID: new window.solanaWeb3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  ASSOCIATED_TOKEN_PROGRAM_ID: new window.solanaWeb3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
  SYSTEM_PROGRAM_ID: new window.solanaWeb3.PublicKey('11111111111111111111111111111111'),
  SYSVAR_RENT_PUBKEY: new window.solanaWeb3.PublicKey('SysvarRent111111111111111111111111111111111'),
  COMPUTE_BUDGET_PROGRAM_ID: new window.solanaWeb3.PublicKey('ComputeBudget111111111111111111111111111111'),
  
  // Find associated token address for an SPL token
  async getAssociatedTokenAddress(mint, owner) {
    const [address] = await window.solanaWeb3.PublicKey.findProgramAddress(
      [
        owner.toBuffer(),
        this.TOKEN_PROGRAM_ID.toBuffer(),
        mint.toBuffer(),
      ],
      this.ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    return address;
  },
  
  // Create associated token account instruction
  createAssociatedTokenAccountInstruction(payer, associatedToken, owner, mint) {
    const keys = [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: this.SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: this.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: this.SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];
    
    return new window.solanaWeb3.TransactionInstruction({
      keys,
      programId: this.ASSOCIATED_TOKEN_PROGRAM_ID,
      data: new Uint8Array([0]), // CreateATA discriminator
    });
  },
  
  // Create SPL token transfer instruction
  createTransferInstruction(source, destination, owner, amount) {
    const keys = [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ];
    
    // SPL Token Transfer instruction data
    // Instruction discriminator: 3 (Transfer)
    // Amount: u64 (8 bytes, little-endian)
    const dataLayout = new Uint8Array(9);
    dataLayout[0] = 3; // Transfer instruction
    
    // Write amount as little-endian u64
    const amountBigInt = BigInt(amount);
    for (let i = 0; i < 8; i++) {
      dataLayout[1 + i] = Number((amountBigInt >> BigInt(8 * i)) & BigInt(0xff));
    }
    
    return new window.solanaWeb3.TransactionInstruction({
      keys,
      programId: this.TOKEN_PROGRAM_ID,
      data: dataLayout,
    });
  },
  
  // Create SPL token TransferChecked instruction (required by PayAI)
  createTransferCheckedInstruction(source, mint, destination, owner, amount, decimals) {
    const keys = [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ];
    
    // SPL Token TransferChecked instruction data
    // Instruction discriminator: 12 (TransferChecked)
    // Amount: u64, Decimals: u8
    const dataLayout = new Uint8Array(10);
    dataLayout[0] = 12; // TransferChecked instruction
    
    // Write amount as little-endian u64
    const amountBigInt = BigInt(amount);
    for (let i = 0; i < 8; i++) {
      dataLayout[1 + i] = Number((amountBigInt >> BigInt(8 * i)) & BigInt(0xff));
    }
    
    // Write decimals as u8
    dataLayout[9] = decimals;
    
    return new window.solanaWeb3.TransactionInstruction({
      keys,
      programId: this.TOKEN_PROGRAM_ID,
      data: dataLayout,
    });
  },
  
  // ComputeBudget: Set compute unit limit
  createComputeUnitLimitInstruction(units) {
    const dataLayout = new Uint8Array(9);
    dataLayout[0] = 2; // SetComputeUnitLimit discriminator
    
    // Write units as little-endian u32
    for (let i = 0; i < 4; i++) {
      dataLayout[1 + i] = (units >> (8 * i)) & 0xff;
    }
    
    return new window.solanaWeb3.TransactionInstruction({
      keys: [],
      programId: this.COMPUTE_BUDGET_PROGRAM_ID,
      data: dataLayout,
    });
  },
  
  // ComputeBudget: Set compute unit price
  createComputeUnitPriceInstruction(microLamports) {
    const dataLayout = new Uint8Array(9);
    dataLayout[0] = 3; // SetComputeUnitPrice discriminator
    
    // Write microLamports as little-endian u64
    const microLamportsBigInt = BigInt(microLamports);
    for (let i = 0; i < 8; i++) {
      dataLayout[1 + i] = Number((microLamportsBigInt >> BigInt(8 * i)) & BigInt(0xff));
    }
    
    return new window.solanaWeb3.TransactionInstruction({
      keys: [],
      programId: this.COMPUTE_BUDGET_PROGRAM_ID,
      data: dataLayout,
    });
  }
};

console.log('✅ SPL Token functions loaded (manual implementation)');
