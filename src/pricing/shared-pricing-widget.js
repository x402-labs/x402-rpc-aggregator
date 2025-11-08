/**
 * Shared Pricing Widget - Client-side component for all pages
 * 
 * Usage:
 * 1. Include this script in any HTML page
 * 2. Add a container: <div id="sol-price-widget"></div>
 * 3. Widget auto-updates every 30 seconds
 */

(function() {
  'use strict';

  // Configuration
  const PRICING_ENDPOINT = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/pricing/sol-usd'
    : window.location.origin + '/pricing/sol-usd';
  
  const UPDATE_INTERVAL = 30000; // 30 seconds

  /**
   * Fetch current pricing data
   */
  async function fetchPricing() {
    try {
      const response = await fetch(PRICING_ENDPOINT);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch pricing:', error);
      return null;
    }
  }

  /**
   * Update all pricing elements on the page
   */
  function updatePricingElements(pricingData) {
    if (!pricingData) return;

    const { current, providerCosts } = pricingData;
    const solPrice = current.price;

    // Update SOL price displays
    document.querySelectorAll('[data-sol-price]').forEach(el => {
      el.textContent = `$${solPrice.toFixed(2)}`;
    });

    // Update provider-specific pricing
    providerCosts.forEach(provider => {
      // Update lamport amounts
      document.querySelectorAll(`[data-provider-lamports="${provider.provider}"]`).forEach(el => {
        el.textContent = provider.lamports.toLocaleString();
      });

      // Update SOL amounts
      document.querySelectorAll(`[data-provider-sol="${provider.provider}"]`).forEach(el => {
        el.textContent = provider.sol;
      });

      // Update USD amounts
      document.querySelectorAll(`[data-provider-usd="${provider.provider}"]`).forEach(el => {
        el.textContent = `$${provider.usdCost.toFixed(6)}`;
      });
    });

    // Update timestamp
    const updateTime = new Date(current.timestamp);
    document.querySelectorAll('[data-price-updated]').forEach(el => {
      el.textContent = updateTime.toLocaleTimeString();
    });

    // Update source
    document.querySelectorAll('[data-price-source]').forEach(el => {
      el.textContent = current.source;
    });

    console.log(`✅ Pricing updated: SOL=$${solPrice.toFixed(2)} from ${current.source}`);
  }

  /**
   * Initialize pricing updates
   */
  async function initializePricing() {
    console.log('🔄 Initializing real-time pricing...');
    
    // Initial fetch
    const data = await fetchPricing();
    if (data) {
      updatePricingElements(data);
    }

    // Update every 30 seconds
    setInterval(async () => {
      const data = await fetchPricing();
      if (data) {
        updatePricingElements(data);
      }
    }, UPDATE_INTERVAL);
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePricing);
  } else {
    initializePricing();
  }

  // Expose globally for manual updates
  window.X402Pricing = {
    update: async () => {
      const data = await fetchPricing();
      if (data) updatePricingElements(data);
      return data;
    },
    getEndpoint: () => PRICING_ENDPOINT,
  };

  console.log('✅ X402 Pricing Widget loaded');
})();

