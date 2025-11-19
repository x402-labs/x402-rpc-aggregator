// PayAI SDK is integrated on the backend - no SPL Token library needed on frontend!
// The backend handles all PayAI payment processing via the official x402-solana SDK

console.log('✅ PayAI option enabled (backend SDK integration)');
console.log('   PayAI Treasury: 26AvBMEXaJAfA2R7wtQiPNYeWUd8QSi6rvy5i5W78vNR');
console.log('   Facilitator URL: https://facilitator.payai.network');

// Enable PayAI option immediately - backend handles everything
document.addEventListener('DOMContentLoaded', () => {
  const payaiOption = document.querySelector('#facilitator option[value="payai"]');
  if (payaiOption) {
    payaiOption.disabled = false;
    payaiOption.text = 'PayAI Network (USDC on Solana)';
    console.log('✅ PayAI Network option ready');
  }
});
