const BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000'
  : window.location.origin;

const API = `${BASE_URL}/rpc`;
const SOLANA_RPC_PROXY = `${BASE_URL}/solana-rpc`;

console.log('Using API:', API);
console.log('Using Solana RPC Proxy:', SOLANA_RPC_PROXY);

let wallet = null;
let currentInvoice = null;
let sampleTxBase58 = null;
const chainSelect = document.getElementById('chain');
const methodSelect = document.getElementById('method');
const facilitatorSelect = document.getElementById('facilitator');
const facilitatorHelp = document.getElementById('facilitator-help');
const paramsInputElement = document.getElementById('params');
const walletInfo = document.getElementById('wallet');
const statusPanel = document.getElementById('status');

const CHAIN_METHODS = {
  solana: [
    { value: 'getSlot', label: 'getSlot (Solana) - no params needed' },
    { value: 'getBalance', label: 'getBalance (Solana) - needs address' },
    { value: 'getAccountInfo', label: 'getAccountInfo (Solana) - get account data' },
    { value: 'getTransaction', label: 'getTransaction (Solana) - get tx by signature' },
    { value: 'getTokenAccountsByOwner', label: 'getTokenAccountsByOwner (Solana) - SPL tokens' },
    { value: 'getSignaturesForAddress', label: 'getSignaturesForAddress (Solana) - tx history' },
    { value: 'sendTransaction', label: 'sendTransaction (Solana) - broadcast tx' },
  ],
  base: [
    { value: 'eth_blockNumber', label: 'eth_blockNumber (Base) - no params needed' },
  ],
};

const METHOD_PLACEHOLDERS = {
  getSlot: 'No params needed - leave empty',
  getBalance: 'Paste a Solana address (e.g., EPjFWdd5AufqSSqeM2...)',
  getAccountInfo: 'Paste a Solana address to inspect',
  getTransaction: 'Paste a transaction signature (base58)',
  getTokenAccountsByOwner: '["<wallet-address>", {"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"}]',
  getSignaturesForAddress: 'Paste a wallet address for tx history',
  sendTransaction: 'Click "Build Sample Transaction" first, or paste base58 tx',
  eth_blockNumber: 'No params needed - leave empty',
};

const FACILITATORS_BY_CHAIN = {
  solana: ['codenut', 'corbits', 'payai', 'x402labs'],
  base: ['codenut', 'corbits'],
};

const FACILITATOR_NOTES = {
  solana: 'Use SOL with x402labs or USDC via CodeNut / Corbits / PayAI on Solana.',
  base: 'Base payments settle via CodeNut or Corbits (USDC) and prompt an EVM wallet such as MetaMask.',
};

walletInfo.innerHTML = `<span class="text-xs text-gray-400">Connect Phantom to explore Solana payments. No Phantom? Install it or switch the network selector to Base to try the CodeNut + MetaMask flow.</span>`;
statusPanel.innerHTML = `<div class="bg-gray-700 rounded-lg p-3 text-xs text-gray-500">Ready when you are. Select a network and method, then hit "Call RPC" to fetch data. You will get a 402 challenge before the payment step.</div>`;

function renderMethods(chain) {
  const options = CHAIN_METHODS[chain] || [];
  methodSelect.innerHTML = '';
  options.forEach(opt => {
    const optionEl = document.createElement('option');
    optionEl.value = opt.value;
    optionEl.textContent = opt.label;
    methodSelect.appendChild(optionEl);
  });
  methodSelect.dispatchEvent(new Event('change'));
}

function updateFacilitatorOptions(chain) {
  const allowed = new Set(FACILITATORS_BY_CHAIN[chain] || []);
  Array.from(facilitatorSelect.options).forEach(option => {
    const isAllowed = allowed.has(option.value);
    option.disabled = !isAllowed;
    option.hidden = !isAllowed;
  });
  if (facilitatorSelect.options[facilitatorSelect.selectedIndex]?.disabled ||
      facilitatorSelect.options[facilitatorSelect.selectedIndex]?.hidden) {
    const firstAllowed = Array.from(facilitatorSelect.options).find(opt => !opt.disabled && !opt.hidden);
    if (firstAllowed) {
      facilitatorSelect.value = firstAllowed.value;
    }
  }
  facilitatorHelp.textContent = FACILITATOR_NOTES[chain] || 'Select a facilitator compatible with this network.';
}

function updateParamsPlaceholder() {
  const method = methodSelect.value;
  paramsInputElement.placeholder = METHOD_PLACEHOLDERS[method] || 'Enter params as JSON array';
}

function attachPanelControls(id) {
  const copyBtn = document.querySelector(`[data-copy="${id}"]`);
  const toggleBtn = document.querySelector(`[data-toggle="${id}"]`);
  const pane = document.getElementById(id);
  if (copyBtn && pane) {
    const original = copyBtn.textContent;
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pane.textContent || '');
        copyBtn.classList.add('is-active');
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.classList.remove('is-active');
          copyBtn.textContent = original;
        }, 1200);
      } catch (err) {
        console.error('Clipboard copy failed', err);
      }
    });
  }
  if (toggleBtn && pane) {
    toggleBtn.addEventListener('click', () => {
      const expanded = pane.classList.toggle('expanded');
      toggleBtn.textContent = expanded ? 'Collapse' : 'Expand';
      toggleBtn.classList.toggle('is-active', expanded);
    });
  }
}

['request', 'response'].forEach(attachPanelControls);
renderMethods(chainSelect.value);
updateFacilitatorOptions(chainSelect.value);
updateParamsPlaceholder();

chainSelect.addEventListener('change', () => {
  currentInvoice = null;
  renderMethods(chainSelect.value);
  updateFacilitatorOptions(chainSelect.value);
  updateParamsPlaceholder();
  paramsInputElement.value = '';
  statusPanel.innerHTML = `<div class="bg-gray-700 rounded-lg p-3 text-xs text-gray-500">Network switched to ${chainSelect.value.toUpperCase()}. Pick a method, facilitator, then call RPC.</div>`;
});

methodSelect.addEventListener('change', (e) => {
  const buildBtn = document.getElementById('buildTx');
  const method = e.target.value;
  
  if (method === 'sendTransaction') {
    buildBtn.style.display = 'block';
    buildBtn.innerHTML = '📦 Build Sample Transaction';
    buildBtn.classList.remove('bg-green-600');
    if (!buildBtn.classList.contains('bg-blue-600')) {
      buildBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
    }
    paramsInputElement.placeholder = METHOD_PLACEHOLDERS[method];
  } else {
    buildBtn.style.display = 'none';
  }
  updateParamsPlaceholder();
});

document.getElementById('connect').onclick = async () => {
  // If wallet is already connected, disconnect
  if (wallet) {
    try {
      await window.solana.disconnect();
      wallet = null;
      walletInfo.innerHTML = `<span class="text-xs text-gray-400">Disconnected. Connect Phantom to explore Solana payments.</span>`;
      document.getElementById('connect').textContent = 'Connect Phantom Wallet to try demo';
      document.getElementById('connect').classList.remove('bg-red-600', 'hover:bg-red-700');
      document.getElementById('connect').classList.add('bg-purple-600', 'hover:bg-purple-700');
      
      // Reset selections if auto-selected
      if (chainSelect.value === 'solana') {
        facilitatorSelect.value = 'x402labs'; // Default back to x402labs
      }
      updateFacilitatorOptions(chainSelect.value);
      console.log('✅ Wallet disconnected');
      return;
    } catch (err) {
      console.error('Disconnect failed:', err);
    }
  }

  if (!window.solana?.isPhantom) {
    walletInfo.innerHTML = `
      <div class="bg-gray-700 rounded-lg p-3 text-sm">
        <p class="text-red-500 font-semibold mb-2">Phantom wallet not detected.</p>
        <p class="text-gray-500 mb-3">Install the <a href="https://phantom.app/" class="underline text-blue-500" target="_blank" rel="noopener noreferrer">Phantom browser extension</a> to try Solana flows. You can also switch the network selector to <strong>Base</strong> and continue with CodeNut + MetaMask.</p>
        <button id="phantomDismiss" class="panel-button">Dismiss</button>
      </div>
    `;
    const dismissBtn = document.getElementById('phantomDismiss');
    if (dismissBtn) {
      dismissBtn.onclick = () => {
        walletInfo.innerHTML = `<span class="text-xs text-gray-400">You can continue without Phantom. For SOL payments install Phantom; for Base select CodeNut and approve the MetaMask prompt when paying.</span>`;
      };
    }
    return;
  }
  
  try {
    await window.solana.connect();
    wallet = window.solana;
    
    // Update button to Disconnect state
    const connectBtn = document.getElementById('connect');
    connectBtn.textContent = 'Disconnect Wallet';
    connectBtn.classList.remove('bg-purple-600', 'hover:bg-purple-700');
    connectBtn.classList.add('bg-red-600', 'hover:bg-red-700');
    
    const balanceCheck = await checkBalance(wallet);
    
    walletInfo.innerHTML = `
      <span class="text-green-400">✅ Connected</span><br>
      <span class="text-xs">${wallet.publicKey.toBase58().slice(0,8)}...</span><br>
      <span class="text-sm ${balanceCheck.solSufficient ? 'text-green-400' : 'text-orange-400'}">SOL: ${balanceCheck.solCurrent}</span><br>
      <span class="text-sm ${balanceCheck.usdcSufficient ? 'text-green-400' : 'text-orange-400'}">USDC: ${balanceCheck.usdcCurrent}</span>
      ${!balanceCheck.solSufficient ? '<br><span class="text-orange-400 text-xs">⚠️ Low SOL (for x402labs)</span>' : ''}
      ${!balanceCheck.usdcSufficient ? '<br><span class="text-orange-400 text-xs">⚠️ Low USDC (for PayAI)</span>' : ''}
    `;
    
    if (chainSelect.value === 'solana') {
    if (balanceCheck.solSufficient && !balanceCheck.usdcSufficient) {
      facilitatorSelect.value = 'x402labs';
      console.log('💡 Auto-selected x402labs (you have SOL but no USDC)');
    } else if (balanceCheck.usdcSufficient && !balanceCheck.solSufficient) {
        // Prefer Corbits for USDC (multi-chain support)
        facilitatorSelect.value = 'corbits';
        console.log('💡 Auto-selected Corbits (you have USDC but no SOL)');
    }
    }
    updateFacilitatorOptions(chainSelect.value);
  } catch (err) {
    walletInfo.innerHTML = `<span class="text-red-400">❌ ${err.message}</span>`;
  }
};

// Build sample transaction for sendTransaction
document.getElementById('buildTx').onclick = async () => {
  if (!wallet) return alert('Connect wallet first');
  
  try {
    document.getElementById('buildTx').innerHTML = '⏳ Building...';
    
    const { Transaction, SystemProgram, PublicKey } = window.solanaWeb3;
    
    // Get recent blockhash
    const blockhashRes = await fetch(SOLANA_RPC_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        jsonrpc: '2.0',
        id: 1,
        method: 'getLatestBlockhash',
        params: [{ commitment: 'finalized' }]
      })
    });
    const blockhashData = await blockhashRes.json();
    const blockhash = blockhashData.result.value.blockhash;
    
    // Build a memo transaction (safe, cheap, demonstrative)
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    
    // Add memo instruction
    const memoText = `x402 Demo - ${new Date().toISOString()}`;
    const memoData = new TextEncoder().encode(memoText);
    const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
    
    const { TransactionInstruction } = window.solanaWeb3;
    tx.add(new TransactionInstruction({
      keys: [{ pubkey: wallet.publicKey, isSigner: true, isWritable: false }],
      programId: MEMO_PROGRAM_ID,
      data: memoData
    }));
    
    // Sign transaction
    const signed = await wallet.signTransaction(tx);
    const serialized = signed.serialize();
    sampleTxBase58 = bs58.encode(serialized);
    
    // Auto-fill params field
    document.getElementById('params').value = sampleTxBase58;
    document.getElementById('buildTx').innerHTML = '✅ Transaction Built!';
    document.getElementById('buildTx').classList.remove('bg-blue-600', 'hover:bg-blue-700');
    document.getElementById('buildTx').classList.add('bg-green-600');
    
    console.log('✅ Built sample transaction:', sampleTxBase58.substring(0, 20) + '...');
  } catch (err) {
    console.error('❌ Build failed:', err);
    document.getElementById('buildTx').innerHTML = '❌ Build Failed - Retry';
    document.getElementById('buildTx').classList.remove('bg-blue-600');
    document.getElementById('buildTx').classList.add('bg-red-600');
  }
};

// Add facilitator change listener to warn about balance
facilitatorSelect.addEventListener('change', async (e) => {
  if (!wallet) return;
  const facilitator = e.target.value;
  const chain = chainSelect.value;
  if (chain !== 'solana') return;
  
  const balanceCheck = await checkBalance(wallet);
  
  if ((facilitator === 'payai' || facilitator === 'codenut' || facilitator === 'corbits') && !balanceCheck.usdcSufficient) {
    const facName = facilitator === 'codenut' ? 'CodeNut' : facilitator === 'corbits' ? 'Corbits' : 'PayAI';
    alert(`⚠️ Warning: You selected ${facName} (USDC) but have insufficient USDC.\n\nRecommendation: Use x402labs (SOL) instead or acquire USDC before proceeding.`);
  } else if (facilitator === 'x402labs' && !balanceCheck.solSufficient) {
    alert('⚠️ Warning: You selected x402labs (SOL) but have insufficient SOL.\n\nRecommendation: Use CodeNut or PayAI (USDC) instead if you have USDC.');
  }
});

document.getElementById('call').onclick = async () => {
  const method = methodSelect.value;
  const paramsInput = paramsInputElement.value.trim();
  const chain = chainSelect.value;
  const facilitator = facilitatorSelect.value;

  if (!wallet && chain === 'solana') {
    alert('Tip: connect Phantom before paying so you can sign the transaction. You can still preview the invoice without a wallet.');
  }
  
  // Smart params parsing: handle JSON array, raw string, or empty
  let params = [];
  if (paramsInput) {
    try {
      params = JSON.parse(paramsInput); // Try parsing as JSON first
      console.log('✅ Parsed params as JSON:', params);
    } catch (e) {
      console.log('✅ Auto-wrapped address in array:', [paramsInput]);
      params = [paramsInput];
    }
  } else {
    console.log('✅ No params (empty array)');
  }

  const req = { method, params, chain, facilitator };
  document.getElementById('request').textContent = JSON.stringify(req, null, 2);
  statusPanel.innerHTML = `<p class="text-yellow-400">⏳ Sending...</p>`;

  try {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  if (res.status === 402) {
    const x402Response = await res.json();
    
    if (!x402Response.accepts || x402Response.accepts.length === 0) {
      throw new Error('Invalid x402 response: no payment options');
    }
    
    const paymentDetails = x402Response.accepts[0];
    currentInvoice = paymentDetails; // Store for payNow()
    
    const baseAmount = parseFloat(paymentDetails.maxAmountRequired);
    const asset = paymentDetails.asset;
    let displayAmount = '';
    let usdValue = '';
    
    if (asset === 'USDC') {
      const usdc = baseAmount / 1e6;
      displayAmount = `${usdc.toFixed(6)} USDC`;
      usdValue = `≈ $${usdc.toFixed(6)} USD`;
    } else if (asset === 'SOL') {
      const sol = baseAmount / 1e9;
        const usd = sol * 200;
      displayAmount = `${sol.toFixed(9)} SOL`;
      usdValue = `≈ $${usd.toFixed(6)} USD`;
    } else if (asset === 'ETH') {
      const eth = baseAmount / 1e18;
        const usd = eth * 3000;
      displayAmount = `${eth.toFixed(12)} ETH`;
      usdValue = `≈ $${usd.toFixed(6)} USD`;
    }
    
    document.getElementById('response').textContent = JSON.stringify(x402Response, null, 2);
      statusPanel.innerHTML = `
      <div class="bg-orange-900 bg-opacity-30 border border-orange-500 rounded-lg p-4">
        <p class="text-orange-300 font-semibold mb-2">💳 Payment Required</p>
        <p class="text-orange-200 text-sm mb-2">Amount: <strong>${displayAmount}</strong></p>
        <p class="text-orange-200 text-xs mb-1">${usdValue}</p>
        <p class="text-orange-200 text-sm mb-2">Provider: ${paymentDetails.extra?.provider || 'Best Available'}</p>
          <p class="text-orange-200 text-xs mb-3">Payment: ${
            facilitator === 'x402labs' ? 'SOL (x402labs)' : 
            facilitator === 'codenut' ? 'USDC (CodeNut)' : 
            facilitator === 'corbits' ? 'USDC (Corbits)' : 
            'USDC (PayAI Network)'
          }</p>
        <button onclick="payNow()" class="mt-3 w-full px-4 py-2 bg-white text-purple-900 font-bold rounded-lg hover:bg-purple-100">
            💰 Pay Now
        </button>
      </div>
    `;
  } else {
      const data = await res.json();
      document.getElementById('response').textContent = JSON.stringify(data, null, 2);
      if (data.x402) {
        statusPanel.innerHTML = `
          <div class="bg-green-900 bg-opacity-30 border border-green-500 rounded-lg p-4">
            <p class="text-green-300 font-semibold">✅ Paid!</p>
            <p class="text-green-200 text-sm">Tx: <a href="${data.x402.paymentInfo.explorer}" target="_blank" class="underline">${data.x402.paymentInfo.txHash.slice(0,8)}...</a></p>
          </div>
        `;
      } else {
        statusPanel.innerHTML = `<p class="text-green-400">✅ Response received.</p>`;
      }
    }
  } catch (err) {
    statusPanel.innerHTML = `<p class="text-red-400">❌ ${err.message}</p>`;
  }
};

async function checkBalance(wallet) {
  try {
    // Import PublicKey from solanaWeb3
    const { PublicKey } = window.solanaWeb3;
    
    // Existing SOL balance
    const solRes = await fetch(SOLANA_RPC_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'getBalance', params: [wallet.publicKey.toBase58()] })
    });
    const solData = await solRes.json();
    const solBalance = solData.result?.value || 0;
    const solBalanceSOL = solBalance / 1e9;
    const minSOL = 0.001;

    // USDC balance check (for PayAI)
    // Note: PayAI Network facilitator handles USDC transfers on backend
    // Frontend just shows balance for user information
    console.log('💰 Checking USDC balance (PayAI Network)');
    
    const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    
    // Use getTokenAccountsByOwner to find all USDC accounts
    // This is more reliable than calculating ATA manually
    const usdcAccountsRes = await fetch(SOLANA_RPC_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          wallet.publicKey.toBase58(),
          { mint: USDC_MINT },
          { encoding: 'jsonParsed' }
        ]
      })
    });
    
    const usdcAccountsData = await usdcAccountsRes.json();
    let usdcBalance = 0;
    
    if (usdcAccountsData.result?.value && usdcAccountsData.result.value.length > 0) {
      // Found USDC account(s) - sum up balances
      usdcBalance = usdcAccountsData.result.value.reduce((total, account) => {
        const tokenAmount = account.account.data.parsed.info.tokenAmount.uiAmount;
        return total + (tokenAmount || 0);
      }, 0);
      console.log(`✅ Found ${usdcAccountsData.result.value.length} USDC account(s), total: ${usdcBalance} USDC`);
    } else {
      console.warn('⚠️ No USDC accounts found for this wallet');
    }
    
    const minUSDC = 0.001; // Minimum USDC for payments (reduced from 0.02)

    return {
      solSufficient: solBalanceSOL >= minSOL,
      usdcSufficient: usdcBalance >= minUSDC,
      solCurrent: `${solBalanceSOL.toFixed(4)} SOL`,
      usdcCurrent: `${usdcBalance.toFixed(2)} USDC`
    };
  } catch (err) {
    console.error('Balance check failed:', err);
    return { solSufficient: true, usdcSufficient: true, solCurrent: 'Unknown', usdcCurrent: 'Unknown' };
  }
}

async function payNow() {
  if (!currentInvoice) return;
  const chain = chainSelect.value;
  if (!wallet && chain === 'solana') {
    alert('Connect your wallet before attempting to pay.');
    return;
  }

  try {
    statusPanel.innerHTML = `<p class="text-yellow-400">⏳ Processing payment...</p>`;
    
    const method = methodSelect.value;
    const paramsInput = paramsInputElement.value.trim();
    
    let params = [];
    if (paramsInput) {
      try {
        params = JSON.parse(paramsInput);
      } catch (e) {
        params = [paramsInput];
      }
    }
    
    const facilitator = facilitatorSelect.value;
    const req = { method, params, chain, facilitator };

    const payment = await buildPayment(currentInvoice, chain);
    
    const retry = await fetch(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x402-payment': JSON.stringify(payment),
      },
      body: JSON.stringify(req),
    });

    const data = await retry.json();
    
    if (data.x402) {
      const txHash = data.x402.paymentInfo.txHash;
      const explorerUrl = data.x402.paymentInfo.explorer;
      
      statusPanel.innerHTML = `
        <div class="bg-green-900 bg-opacity-30 border border-green-500 rounded-lg p-4">
          <p class="text-green-300 font-semibold mb-3"> Payment Successful!</p>
          <div class="space-y-2">
            <div>
              <p class="text-green-200 text-xs mb-1">Transaction Hash:</p>
              <p class="text-green-100 font-mono text-xs break-all bg-green-950 bg-opacity-50 p-2 rounded">${txHash}</p>
            </div>
            <a href="${explorerUrl}" target="_blank" class="inline-block mt-2 px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded">
              View on Helius Explorer →
            </a>
          </div>
        </div>
      `;
      
      const rpcResult = { ...data };
      delete rpcResult.x402;
      
      if (rpcResult.error) {
        document.getElementById('response').innerHTML = `
          <div class="text-orange-300 mb-2"> Payment succeeded, but RPC call failed:</div>
          <pre class="text-orange-200 text-xs">${JSON.stringify(rpcResult, null, 2)}</pre>
        `;
      } else {
        if (method === 'sendTransaction' && rpcResult.result) {
          document.getElementById('response').innerHTML = `
            <div class="text-blue-300 mb-2"> Transaction Broadcast Successful!</div>
            <div class="bg-gray-900 p-3 rounded mb-2">
              <p class="text-xs text-gray-400 mb-1">Transaction Signature:</p>
              <p class="text-green-400 font-mono text-xs break-all">${rpcResult.result}</p>
            </div>
            <a href="https://orb.helius.dev/tx/${rpcResult.result}" target="_blank" class="inline-block px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded">
              View on Helius Explorer →
            </a>
            <pre class="text-gray-400 text-xs mt-3">${JSON.stringify(rpcResult, null, 2)}</pre>
          `;
        } else {
          document.getElementById('response').textContent = JSON.stringify(rpcResult, null, 2);
        }
      }
    } else if (data.error) {
      statusPanel.innerHTML = `
        <div class="bg-red-900 bg-opacity-30 border border-red-500 rounded-lg p-4">
          <p class="text-red-300 font-semibold mb-2">Payment Failed</p>
          <p class="text-red-200 text-xs mb-1">${data.error}</p>
          ${data.facilitator ? `<p class="text-red-200 text-xs">Facilitator: ${data.facilitator}</p>` : ''}
        </div>
      `;
      document.getElementById('response').textContent = JSON.stringify(data, null, 2);
  } else {
      statusPanel.innerHTML = `<p class="text-green-300">✅ Payment processed.</p>`;
    document.getElementById('response').textContent = JSON.stringify(data, null, 2);
    }
  } catch (err) {
    console.error('Payment failed:', err);
    statusPanel.innerHTML = `
      <div class="bg-red-900 bg-opacity-30 border border-red-500 rounded-lg p-4">
        <p class="text-red-300 font-semibold"> Payment Failed</p>
        <p class="text-red-200 text-sm">${err.message}</p>
      </div>
    `;
  }
}

async function buildPayment(paymentDetails, chain) {
  try {
    console.log('💰 Building payment for chain:', chain);
    console.log('   Facilitator:', facilitatorSelect.value);
    console.log('   Payment details:', {
      maxAmountRequired: paymentDetails.maxAmountRequired,
      asset: paymentDetails.asset,
      network: paymentDetails.network,
      payTo: paymentDetails.payTo?.substring(0, 20) + '...'
    });
    
  if (chain === 'base') {
      const sig = await window.ethereum.request({
        method: 'personal_sign',
        params: [wallet.publicKey.toBase58(), JSON.stringify(paymentDetails)]
      });
    return {
        paymentPayload: { signedIntent: { signature: sig } },
      paymentRequirements: { 
        amount: parseFloat(paymentDetails.maxAmountRequired), 
        recipient: paymentDetails.payTo 
      },
    };
  }

    const facilitator = facilitatorSelect.value;
    const { Transaction, PublicKey, SystemProgram } = window.solanaWeb3;

    // === CORBITS (USDC on Solana/Base/Polygon) ===
    // Corbits 'exact' scheme requires ComputeBudget + TransferChecked instructions
    // Reference: https://github.com/faremeter/faremeter/blob/main/packages/payment-solana/src/exact/verify.ts
    if (facilitator === 'corbits') {
      console.log('⚡ Using Corbits facilitator (USDC - multi-chain)');
      console.log('   Building USDC transfer transaction with ComputeBudget...');
      
      const recipient = new PublicKey(paymentDetails.payTo);
      const amountBaseUnits = parseInt(paymentDetails.maxAmountRequired, 10);
      
      console.log('   Amount (micro-USDC):', amountBaseUnits);
      console.log('   Recipient:', recipient.toBase58());
      
      const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      const sourceATA = await window.splToken.getAssociatedTokenAddress(usdcMint, wallet.publicKey);
      
      // Check if user's USDC account exists
      const accountInfo = await fetch(SOLANA_RPC_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAccountInfo',
          params: [sourceATA.toBase58(), { encoding: 'base64' }]
        })
      }).then(r => r.json());
      
      if (!accountInfo.result?.value) {
        throw new Error('No USDC account found. Please create a USDC account first or acquire some USDC.');
      }
      
      const destinationAccount = await window.splToken.getAssociatedTokenAddress(usdcMint, recipient);
      
      // CRITICAL: Corbits requires ComputeBudget instructions
      // From verify.ts: expects 3 or 4 instructions with ComputeBudget at positions 0 and 1
      const tx = new Transaction();
      
      // Instruction 0: ComputeBudgetProgram.setComputeUnitLimit
      tx.add(window.splToken.createComputeUnitLimitInstruction(50000));
      
      // Instruction 1: ComputeBudgetProgram.setComputeUnitPrice
      tx.add(window.splToken.createComputeUnitPriceInstruction(1));
      
      // Instruction 2: TransferChecked
      tx.add(
        window.splToken.createTransferCheckedInstruction(
          sourceATA,
          usdcMint,
          destinationAccount,
          wallet.publicKey,
          amountBaseUnits,
          6  // USDC decimals
        )
      );
      
      console.log('   ✅ Added ComputeBudget instructions (required by Corbits)');
      console.log('   Instructions count:', 3);
      
      // Get blockhash
      const response = await fetch(SOLANA_RPC_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getLatestBlockhash',
          params: []
        })
      });
      const { result } = await response.json();
      tx.recentBlockhash = result.value.blockhash;
      
      // CRITICAL: For Corbits, feePayer must be THEIR facilitator wallet
      // From /supported: "feePayer": "AepWpq3GQwL8CeKMtZyKtKPa7W91Coygh3ropAJapVdU"
      // User signs as transfer authority, Corbits adds fee payer signature
      const corbitsFeePayer = paymentDetails.extra?.feePayer || 'AepWpq3GQwL8CeKMtZyKtKPa7W91Coygh3ropAJapVdU';
      tx.feePayer = new PublicKey(corbitsFeePayer);
      
      console.log('   Fee payer (Corbits):', corbitsFeePayer);
      console.log('   User wallet:', wallet.publicKey.toBase58());
      
      // Sign with user wallet (partial signature - user is not fee payer)
      const signed = await wallet.signTransaction(tx);
      
      // Serialize as partial signature (not all signatures present)
      let serialized;
      try {
        serialized = signed.serialize({ requireAllSignatures: false });
      } catch (err) {
        // Fallback for older @solana/web3.js versions
        serialized = signed.serialize();
      }
      const txBase64 = btoa(String.fromCharCode.apply(null, serialized));
      
      console.log('   Transaction built:', {
        instructions: signed.instructions.length,
        feePayer: signed.feePayer.toBase58(),
        size: serialized.length
      });
      
      return {
        paymentPayload: {
          x402Version: 1,
          scheme: 'exact',
          network: 'solana',
          payload: {
            transaction: txBase64
          }
        },
        paymentRequirements: {
          scheme: 'exact',
          network: 'solana',
          maxAmountRequired: String(amountBaseUnits),
          asset: usdcMint.toBase58(),  // Send as string (not object)
          payTo: recipient.toBase58(),
          resource: paymentDetails.resource || 'https://x402labs.cloud/rpc',
          description: paymentDetails.description || 'x402 RPC payment',
          extra: {
            // CRITICAL: From verify.ts, Corbits validates tx.feePayer === extra.feePayer
            // We set tx.feePayer = Corbits facilitator, so send Corbits feePayer here
            feePayer: corbitsFeePayer
          }
        },
        facilitator: 'corbits'
      };
    }
    
    // === CODENUT PAY (USDC on Solana/Base) ===
    // Use same simple pattern as x402labs but with USDC instead of SOL
    if (facilitator === 'codenut') {
      console.log('🥜 Using CodeNut facilitator (USDC)');
      console.log('   Building USDC transfer transaction...');
      
      const recipient = new PublicKey(paymentDetails.payTo);
      const amountBaseUnits = parseInt(paymentDetails.maxAmountRequired, 10);
      
      console.log('   Amount (micro-USDC):', amountBaseUnits);
      console.log('   Recipient:', recipient.toBase58());
      
      const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      const sourceATA = await window.splToken.getAssociatedTokenAddress(usdcMint, wallet.publicKey);
      
      console.log('   Source ATA:', sourceATA.toBase58());
      
      const feePayerStr = paymentDetails.extra?.feePayer || 'HsozMJWWHNADoZRmhDGKzua6XW6NNfNDdQ4CkE9i5wHt';
      const feePayer = new PublicKey(feePayerStr);
      console.log('   Facilitator fee payer:', feePayer.toBase58());
      
      const transactionPayer = wallet.publicKey;
      
      let destinationAccount = recipient;
      let requiresATAInit = false;
      let destinationDescription = 'direct account';
      
      try {
        const payToInfoRes = await fetch(SOLANA_RPC_PROXY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAccountInfo',
            params: [recipient.toBase58(), { encoding: 'jsonParsed' }]
          })
        });
        const payToInfo = await payToInfoRes.json();
        const accountOwner = payToInfo.result?.value?.owner;
        const isTokenAccount = accountOwner === window.splToken.TOKEN_PROGRAM_ID.toBase58();
        
        if (isTokenAccount) {
          destinationAccount = recipient;
          destinationDescription = 'merchant USDC token account (provided in invoice)';
          console.log('   payTo is already a USDC token account – no ATA derivation needed');
        } else {
          destinationAccount = await window.splToken.getAssociatedTokenAddress(usdcMint, recipient);
          destinationDescription = 'derived merchant USDC ATA';
          console.log('   Derived merchant ATA from wallet address');
          
          try {
            const ataCheckRes = await fetch(SOLANA_RPC_PROXY, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getAccountInfo',
                params: [destinationAccount.toBase58(), { encoding: 'base64' }]
              })
            });
            const ataCheckData = await ataCheckRes.json();
            requiresATAInit = !ataCheckData.result?.value;
          } catch (err) {
            console.warn('   ⚠️  Unable to confirm facilitator ATA existence, will attempt to create lazily', err);
            requiresATAInit = true;
          }
        }
      } catch (err) {
        console.warn('   ⚠️  Could not inspect payTo account – defaulting to derived ATA path', err);
        destinationAccount = await window.splToken.getAssociatedTokenAddress(usdcMint, recipient);
        destinationDescription = 'derived merchant USDC ATA (fallback)';
        requiresATAInit = true;
      }
      
      console.log('   Destination:', destinationAccount.toBase58());
      console.log('   Destination description:', destinationDescription);
      console.log('   Will create ATA:', requiresATAInit);
      
      const tx = new Transaction();
      
      // CodeNut requires compute budget instructions first
      tx.add(window.splToken.createComputeUnitLimitInstruction(200000));
      tx.add(window.splToken.createComputeUnitPriceInstruction(1));
      
      if (requiresATAInit) {
        console.log('   Creating facilitator USDC ATA inline...');
        tx.add(
          window.splToken.createAssociatedTokenAccountInstruction(
            feePayer,
            destinationAccount,
            recipient,
            usdcMint
          )
        );
      }
      
      tx.add(
        window.splToken.createTransferCheckedInstruction(
          sourceATA,
          usdcMint,
          destinationAccount,
          wallet.publicKey,
          amountBaseUnits,
          6
        )
      );
      
      const blockhashRes = await fetch(SOLANA_RPC_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getLatestBlockhash',
          params: [{ commitment: 'finalized' }]
        })
      });
      const blockhashData = await blockhashRes.json();
      tx.recentBlockhash = blockhashData.result.value.blockhash;
      tx.feePayer = feePayer;
      
      console.log('   Transaction ready, requesting signature...');
      
      let signed;
      try {
        signed = await wallet.signTransaction(tx);
      } catch (err) {
        console.error('   ❌ Phantom failed to sign transaction', err);
        throw err;
      }
      const serialized = signed.serialize({ requireAllSignatures: false });
      
      const binaryChunks = [];
      const chunkSize = 8192;
      for (let i = 0; i < serialized.length; i += chunkSize) {
        const chunk = Array.from(serialized.slice(i, i + chunkSize));
        binaryChunks.push(String.fromCharCode.apply(null, chunk));
      }
      const txBase64 = btoa(binaryChunks.join(''));
      console.log('✅ Transaction signed and encoded (base64), size:', txBase64.length);
      
      const codeNutAsset = paymentDetails.asset && paymentDetails.asset !== 'USDC'
        ? paymentDetails.asset
        : usdcMint.toBase58();
      
      return {
        paymentPayload: {
          x402Version: 1,
          scheme: 'exact',
          network: 'solana',
          payload: {
            transaction: txBase64,
          },
        },
        paymentRequirements: {
          scheme: 'exact',
          network: 'solana',
          maxAmountRequired: String(amountBaseUnits),
          asset: codeNutAsset,
          payTo: paymentDetails.payTo,
          extra: {
            ...paymentDetails.extra,
            feePayer: feePayerStr,
          },
        },
      };
    }

    // === PayAI NETWORK (USDC on Solana) ===
    // PayAI x402-solana SDK requires client to build USDC transfer transaction
    if (facilitator === 'payai') {
      console.log('💳 Using PayAI Network facilitator (USDC)');
      console.log('   Building USDC transfer transaction...');
      
      // Import PublicKey from solanaWeb3 FIRST
      const { Transaction, PublicKey } = window.solanaWeb3;
      
      const microUSDC = Math.floor(parseFloat(paymentDetails.maxAmountRequired));
      console.log(`   Amount: ${microUSDC} micro-USDC (${microUSDC / 1e6} USDC)`);
      console.log('   To:', paymentDetails.payTo);
      
      // USDC mainnet mint
      const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      
      // Get associated token accounts (using window.splToken global)
      const fromATA = await window.splToken.getAssociatedTokenAddress(
        USDC_MINT,
        wallet.publicKey
      );
      
      const toATA = await window.splToken.getAssociatedTokenAddress(
        USDC_MINT,
        new PublicKey(paymentDetails.payTo)
      );
      
      console.log('   From USDC Account:', fromATA.toBase58());
      console.log('   To USDC Account:', toATA.toBase58());
      
      // Check if recipient's USDC account exists using our backend proxy
      console.log('   Checking if treasury USDC account exists...');
      let needsAccountCreation = false;
      
      try {
        const checkResponse = await fetch(SOLANA_RPC_PROXY, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAccountInfo',
            params: [
              toATA.toBase58(),
              { encoding: 'base64' }
            ]
          })
        });
        const { result } = await checkResponse.json();
        
        if (!result || !result.value) {
          console.log('   ⚠️  Treasury USDC account does not exist - will create it');
          needsAccountCreation = true;
        } else {
          console.log('   ✅ Treasury USDC account exists');
        }
      } catch (err) {
        console.log('   ⚠️  Could not check account, will attempt to create');
        needsAccountCreation = true;
      }
      
      // Build USDC transfer transaction using VersionedTransaction (v0)
      // Reference: https://github.com/PayAINetwork/x402-solana/blob/main/src/client/transaction-builder.ts
      const { VersionedTransaction, TransactionMessage } = window.solanaWeb3;
      
      // Build instructions array
      const instructions = [];
      
      // Instruction 0: Set compute unit limit (PayAI STRICT requirement: <= 7000)
      instructions.push(
        window.splToken.createComputeUnitLimitInstruction(7000)
      );
      
      // Instruction 1: Set compute unit price (< 5 lamports as per PayAI spec)
      instructions.push(
        window.splToken.createComputeUnitPriceInstruction(1000000)
      );
      
      console.log('   ✅ Added ComputeBudget instructions (required by PayAI)');
      
      // CRITICAL: PayAI requires merchant's ATA to EXIST BEFORE payment
      // We CANNOT include CreateATA in the transaction
      // Check and throw if it doesn't exist
      if (needsAccountCreation) {
        throw new Error(
          'Treasury USDC account does not exist yet!\\n\\n' +
          'PayAI Network requires the merchant ATA to exist before payment.\\n' +
          'Please contact the merchant to set up their USDC account first.\\n\\n' +
          'Treasury: ' + paymentDetails.payTo + '\\n' +
          'ATA needed: ' + toATA.toBase58()
        );
      }
      
      // Instruction 2: USDC TransferChecked
      instructions.push(
        window.splToken.createTransferCheckedInstruction(
          fromATA,           // source
          USDC_MINT,         // mint
          toATA,             // destination  
          wallet.publicKey,  // owner (user signs this)
          microUSDC,         // amount in micro-USDC
          6                  // USDC decimals
        )
      );
      
      console.log('   ✅ Added TransferChecked instruction');
      
      // Get fresh blockhash
      const response = await fetch(SOLANA_RPC_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getLatestBlockhash',
          params: []
        })
      });
      const { result } = await response.json();
      
      // Extract facilitator feePayer
      const facilitatorFeePayer = paymentDetails.extra?.feePayer;
      if (!facilitatorFeePayer) {
        throw new Error(
          'Missing feePayer in paymentDetails.extra. ' +
          'PayAI Network requires facilitator feePayer address to be provided in the 402 invoice.'
        );
      }
      
      // Create v0 message with VersionedTransaction
      const message = new TransactionMessage({
        payerKey: new PublicKey(facilitatorFeePayer),
        recentBlockhash: result.value.blockhash,
        instructions: instructions
      }).compileToV0Message();
      
      // Create VersionedTransaction
      const tx = new VersionedTransaction(message);
      
      console.log('   Fee payer (PayAI facilitator):', facilitatorFeePayer);
      console.log('   User wallet:', wallet.publicKey.toBase58());
      console.log('   Transaction info before signing:');
      console.log('     - Instructions:', tx.message.compiledInstructions.length);
      console.log('     - Fee payer:', tx.message.staticAccountKeys[0].toBase58());
      console.log('     - Blockhash:', tx.message.recentBlockhash.substring(0, 8) + '...');
      console.log('   Requesting signature from Phantom...');
        
      // Sign with user's wallet (partial signature)
      const signed = await wallet.signTransaction(tx);
      console.log('✅ Transaction signed by user');
      
      // Verify signature was actually added
      if (!signed.signatures || signed.signatures.length === 0) {
        throw new Error('Transaction signing failed: no signatures in transaction');
      }
      
      // Serialize VersionedTransaction
      let serialized;
      try {
        serialized = Buffer.from(signed.serialize());
        console.log('✅ VersionedTransaction serialized successfully, size:', serialized.length, 'bytes');
      } catch (serErr) {
        console.error('❌ Serialization error:', serErr);
        throw new Error('Failed to serialize transaction: ' + serErr.message);
      }
      
      // CRITICAL: Encode as BASE64 (not base58!) per PayAI reference
      // Reference: https://github.com/optimisticoracle/optimistic-oracle
      const txBase64 = btoa(String.fromCharCode.apply(null, serialized));
      console.log('✅ Transaction encoded to base64, length:', txBase64.length);
      
      const nonce = paymentDetails.extra?.nonce || `${Date.now()}-${Math.random()}`;
      
      // Return in PayAI format (matches reference implementation exactly)
      // Reference: https://github.com/optimisticoracle/optimistic-oracle
      return {
        paymentPayload: {
          x402Version: 1,
          scheme: 'exact',
          network: 'solana',
          payload: {
            transaction: txBase64  // base64 encoded
          }
        },
        paymentRequirements: {
          scheme: 'exact',
          network: 'solana',
          maxAmountRequired: String(microUSDC),
          asset: {
            address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
          },
          payTo: paymentDetails.payTo,
          resource: paymentDetails.resource || '',
          description: 'x402 RPC payment',
          extra: {
            feePayer: facilitatorFeePayer
          }
        }
      };
    }
    
    // === x402labs (SOL) ===
    if (facilitator === 'x402labs') {
      console.log('🏗️ Building SOL transfer transaction for x402labs...');
      
      // Get latest blockhash with retry for Triton
      const isTriton = paymentDetails.extra?.provider?.toLowerCase().includes('triton');
      const getLatestBlockhashWithRetry = async () => {
        for (let attempt = 1; attempt <= (isTriton ? 3 : 1); attempt++) {
          try {
            const blockhashRes = await fetch(SOLANA_RPC_PROXY, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ method: 'getLatestBlockhash', params: [] })
            });
            const blockhashData = await blockhashRes.json();
            if (blockhashData.result?.value?.blockhash) return blockhashData.result.value.blockhash;
          } catch (e) {
            if (attempt === (isTriton ? 3 : 1)) throw new Error('Failed to get blockhash');
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      };

      // Get blockhash via proxy (CORS-enabled)
      console.log('📡 Getting recent blockhash via proxy...');
      const blockhashRes = await fetch(SOLANA_RPC_PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          jsonrpc: '2.0',
          id: 1,
          method: 'getLatestBlockhash',
          params: [{ commitment: 'finalized' }]  // Use finalized for maximum compatibility
        })
      });
      const blockhashData = await blockhashRes.json();
      const blockhash = blockhashData.result.value.blockhash;
      console.log(' Got blockhash:', blockhash.substring(0, 8) + '...');
      
      // Use the EXACT payment amount from invoice (more accurate, less suspicious to Phantom)
      // Ensure lamports is a proper integer number (not string) for newer @solana/web3.js versions
      const lamportsRaw = paymentDetails.maxAmountRequired;
      const lamports = Math.floor(Number(lamportsRaw));
      if (isNaN(lamports) || lamports < 0 || !Number.isInteger(lamports)) {
        throw new Error(`Invalid lamports amount: ${lamportsRaw} (must be a positive integer)`);
      }
      console.log('💰 Transfer amount:', lamports, `lamports (${(lamports / 1e9).toFixed(9)} SOL)`);
      
      // Create legacy transaction (most compatible with all Phantom versions)
      const { Transaction: LegacyTransaction } = window.solanaWeb3;
      const tx = new LegacyTransaction();
  tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      
      // Manual SystemProgram.transfer instruction (avoids Blob.encode issues in newer web3.js)
      console.log(' Creating manual SystemProgram.transfer instruction');
      
      // Encode lamports as little-endian 64-bit unsigned integer (8 bytes)
      const lamportsBuffer = new Uint8Array(12); // 4 bytes for instruction type + 8 bytes for lamports
      lamportsBuffer[0] = 2; // Transfer instruction discriminator
      lamportsBuffer[1] = 0;
      lamportsBuffer[2] = 0;
      lamportsBuffer[3] = 0;
      
      // Write lamports as little-endian 64-bit unsigned integer
      const lamportsBigInt = BigInt(lamports);
      for (let i = 0; i < 8; i++) {
        lamportsBuffer[4 + i] = Number((lamportsBigInt >> BigInt(8 * i)) & BigInt(0xff));
      }
      
      const { TransactionInstruction } = window.solanaWeb3;
      const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
      
      tx.add(new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: new PublicKey(paymentDetails.payTo), isSigner: false, isWritable: true }
        ],
        programId: SYSTEM_PROGRAM_ID,
        data: lamportsBuffer
      }));
      console.log(' Added transfer instruction');
      console.log(' Transaction ready:', { 
        feePayer: tx.feePayer.toBase58().substring(0, 8) + '...',
        blockhash: tx.recentBlockhash.substring(0, 8) + '...',
        instructions: tx.instructions.length 
      });

      // Try to get Phantom's approval with detailed logging
      console.log(' Requesting signature from Phantom...');
      console.log(' Transaction details for Phantom:');
      console.log('   - From:', wallet.publicKey.toBase58());
      console.log('   - To:', paymentDetails.payTo);
      console.log('   - Amount:', lamports, 'lamports (0.01 SOL)');
      console.log('   - Recent blockhash:', tx.recentBlockhash);
      
      let signed;
      try {
        // Request signature from Phantom
        // Important: User must APPROVE in Phantom popup!
        signed = await wallet.signTransaction(tx);
        console.log('✅ Transaction signed successfully!');
      } catch (signError) {
        console.error('❌ Phantom signing failed:', signError);
        console.error('   Error code:', signError.code);
        console.error('   Error message:', signError.message);
        
        // Check if user simply cancelled
        if (signError.code === 4001 || signError.message?.includes('User rejected')) {
          document.getElementById('status').innerHTML = `
            <div class="bg-yellow-900 bg-opacity-30 border border-yellow-500 rounded-lg p-4">
              <p class="text-yellow-300 font-semibold mb-2">⚠️ Transaction Cancelled</p>
              <p class="text-yellow-200 text-sm">You rejected the transaction in Phantom.</p>
              <p class="text-yellow-200 text-sm mt-2">Click "Pay with Phantom" again to retry.</p>
            </div>
          `;
          throw new Error('User cancelled transaction');
        }
        
        // Other errors (unexpected)
        document.getElementById('status').innerHTML = `
          <div class="bg-red-900 bg-opacity-30 border border-red-500 rounded-lg p-4">
            <p class="text-red-300 font-semibold mb-2">❌ Phantom Error</p>
            <p class="text-red-200 text-sm mb-2">${signError.message || 'Unexpected error'}</p>
            <div class="mt-3 text-orange-200 text-xs">
              <p class="font-semibold mb-1">💡 Quick Fixes:</p>
              <ol class="list-decimal ml-4 space-y-1">
                <li><strong>Unlock Phantom</strong> if it's locked</li>
                <li><strong>Approve the transaction</strong> in Phantom popup (check for notification)</li>
                <li><strong>Refresh page</strong> and reconnect wallet</li>
                <li><strong>Check Phantom version</strong> - update if outdated</li>
              </ol>
              <p class="mt-2 font-semibold">🔍 Error Code: ${signError.code || 'None'}</p>
            </div>
          </div>
        `;
        
        throw new Error(`Phantom signing failed: ${signError.message || 'Unexpected error'}`);
      }
      
      const serialized = signed.serialize();
      const txBase64 = bs58.encode(serialized);
      console.log('✅ Transaction serialized, size:', serialized.length, 'bytes');

      // Extract transaction signature (first signature in the transaction)
      // This proves the wallet signed the transaction
      const txSignature = bs58.encode(signed.signatures[0].signature);
      console.log('✅ Transaction signature:', txSignature.substring(0, 20) + '...');
      
      // Use transaction signature as payment intent proof
      // This is simpler and more reliable than asking Phantom to sign another message
      const nonce = paymentDetails.extra?.nonce || `${Date.now()}-${Math.random()}`;

      return {
        paymentPayload: {
          signedIntent: { 
            publicKey: wallet.publicKey.toBase58(), 
            signature: txSignature  // Use transaction signature as proof
          },
          txBase64,
          network: paymentDetails.network,
          paymentType: 'SOL'
        },
        paymentRequirements: { 
          amount: parseFloat(paymentDetails.maxAmountRequired), 
          recipient: paymentDetails.payTo, 
          nonce,
          resource: paymentDetails.resource || '/rpc'
        },
      };
    }
  } catch (error) {
    console.error('❌ Build payment failed:', error);
    console.error('   Error name:', error.name);
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack?.split('\n').slice(0, 3).join('\n'));
    
    // Re-throw with more context
    throw new Error(`Payment build failed: ${error.message || error}`);
  }
}