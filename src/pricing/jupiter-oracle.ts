/**
 * CoinGecko Price Oracle
 * Fetches real-time SOL/USD price from CoinGecko Free API
 */

export interface PriceData {
  price: number;
  timestamp: Date;
  source: string;
}

export class JupiterPriceOracle {
  private cache: PriceData | null = null;
  private cacheExpiry: number = 0;
  private cacheDuration: number = 30000; // 30 seconds
  private healthy: boolean = true;

  async getSOLPrice(): Promise<PriceData> {
    // Return cached if fresh
    if (this.cache && Date.now() < this.cacheExpiry) {
      return this.cache;
    }

    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
        { 
          signal: AbortSignal.timeout(5000),
          headers: { 'Accept': 'application/json' }
        }
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      
      // CoinGecko API format: { solana: { usd: 156.35 } }
      const solPrice = data.solana?.usd;
      
      if (!solPrice || typeof solPrice !== 'number') {
        throw new Error('Invalid response from CoinGecko');
      }

      this.cache = {
        price: solPrice,
        timestamp: new Date(),
        source: 'CoinGecko',
      };
      this.cacheExpiry = Date.now() + this.cacheDuration;
      this.healthy = true;

      console.log(`✅ SOL price updated: $${this.cache.price.toFixed(2)} (CoinGecko)`);
      return this.cache;
    } catch (error: any) {
      console.error(`❌ CoinGecko oracle error:`, error.message);
      this.healthy = false;
      
      // Use stale cache if less than 5 minutes old
      if (this.cache && Date.now() < this.cacheExpiry + 300000) {
        console.warn(`⚠️  Using stale cache (${Math.floor((Date.now() - this.cache.timestamp.getTime()) / 1000)}s old)`);
        return this.cache;
      }
      
      // Emergency fallback
      console.error(`🚨 All price sources failed, using static $200`);
      return {
        price: 200,
        timestamp: new Date(),
        source: 'static-fallback',
      };
    }
  }

  getCachedPrice(): PriceData | null {
    return this.cache;
  }

  isHealthy(): boolean {
    return this.healthy && this.cache !== null && Date.now() < this.cacheExpiry + 60000;
  }
}

// Singleton instance
export const jupiterOracle = new JupiterPriceOracle();

