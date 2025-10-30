/**
 * Provider Registry - Manages RPC providers with health checks and dynamic updates
 */

import { RPCProvider, ProviderHealth } from '../types';

export class ProviderRegistry {
  private providers: Map<string, RPCProvider> = new Map();
  private healthStatus: Map<string, ProviderHealth> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(initialProviders: RPCProvider[] = []) {
    initialProviders.forEach(provider => this.addProvider(provider));
  }

  /**
   * Add a new provider to the registry
   */
  addProvider(provider: RPCProvider): void {
    if (!provider.id) {
      throw new Error('Provider must have an id');
    }

    this.providers.set(provider.id, {
      ...provider,
      status: provider.status || 'active',
      priority: provider.priority || 50,
      lastHealthCheck: new Date(),
    });

    this.healthStatus.set(provider.id, {
      providerId: provider.id,
      status: 'healthy',
      latency: 0,
      lastCheck: new Date(),
      consecutiveFailures: 0,
    });

    console.log(`✅ Provider registered: ${provider.name} (${provider.id})`);
  }

  /**
   * Remove a provider from the registry
   */
  removeProvider(providerId: string): boolean {
    const removed = this.providers.delete(providerId);
    this.healthStatus.delete(providerId);
    return removed;
  }

  /**
   * Get a provider by ID
   */
  getProvider(providerId: string): RPCProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get all providers for a specific chain
   */
  getProvidersByChain(chain: string): RPCProvider[] {
    return Array.from(this.providers.values())
      .filter(p => p.chains.includes(chain));
  }

  /**
   * Get all healthy providers for a chain
   */
  getHealthyProviders(chain: string): RPCProvider[] {
    return this.getProvidersByChain(chain)
      .filter(p => {
        const health = this.healthStatus.get(p.id);
        return health && health.status === 'healthy' && p.status === 'active';
      });
  }

  /**
   * Get all providers
   */
  getAllProviders(): RPCProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Update provider status
   */
  updateProviderStatus(providerId: string, status: 'active' | 'degraded' | 'offline'): void {
    const provider = this.providers.get(providerId);
    if (provider) {
      provider.status = status;
      this.providers.set(providerId, provider);
    }
  }

  /**
   * Record a health check result
   */
  recordHealthCheck(providerId: string, latency: number, success: boolean): void {
    const health = this.healthStatus.get(providerId);
    const provider = this.providers.get(providerId);

    if (!health || !provider) return;

    if (success) {
      health.latency = latency;
      health.consecutiveFailures = 0;
      health.status = latency > (provider.maxLatencyMs || 5000) ? 'degraded' : 'healthy';
      provider.averageLatency = provider.averageLatency 
        ? (provider.averageLatency * 0.8 + latency * 0.2) 
        : latency;
    } else {
      health.consecutiveFailures++;
      if (health.consecutiveFailures >= 3) {
        health.status = 'offline';
        provider.status = 'offline';
      } else if (health.consecutiveFailures >= 1) {
        health.status = 'degraded';
        provider.status = 'degraded';
      }
    }

    health.lastCheck = new Date();
    provider.lastHealthCheck = new Date();

    this.healthStatus.set(providerId, health);
    this.providers.set(providerId, provider);
  }

  /**
   * Perform health check on a provider
   */
  async checkProviderHealth(provider: RPCProvider): Promise<void> {
    // Skip health check if provider has no URL or is already marked offline
    if (!provider.url || provider.url === '' || provider.status === 'offline') {
      this.updateProviderStatus(provider.id, 'offline');
      const health = this.healthStatus.get(provider.id);
      if (health) {
        health.status = 'offline';
        health.consecutiveFailures = 999; // Mark as intentionally offline
        this.healthStatus.set(provider.id, health);
      }
      return;
    }

    const startTime = Date.now();
    
    try {
      const healthUrl = provider.healthCheckUrl || provider.url;
      
      // Simple getSlot call for Solana, eth_blockNumber for EVM
      const testMethod = provider.chains.includes('solana') ? 'getSlot' : 'eth_blockNumber';
      
      const response = await fetch(healthUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: testMethod,
          params: [],
        }),
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      const latency = Date.now() - startTime;
      const success = response.ok;

      this.recordHealthCheck(provider.id, latency, success);

      if (!success) {
        console.warn(`⚠️  Health check failed for ${provider.name}: ${response.status} (configure API key in .env)`);
      }
    } catch (error: any) {
      const latency = Date.now() - startTime;
      this.recordHealthCheck(provider.id, latency, false);
      console.error(`❌ Health check error for ${provider.name}:`, error.message);
    }
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks(intervalMs: number = 30000): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      console.log('🏥 Running health checks...');
      const providers = this.getAllProviders();
      
      await Promise.all(
        providers.map(provider => this.checkProviderHealth(provider))
      );

      const healthy = Array.from(this.healthStatus.values())
        .filter(h => h.status === 'healthy').length;
      
      console.log(`✅ Health checks complete: ${healthy}/${providers.length} healthy`);
    }, intervalMs);

    // Run initial health check
    this.getAllProviders().forEach(p => this.checkProviderHealth(p));
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Get health status for a provider
   */
  getHealthStatus(providerId: string): ProviderHealth | undefined {
    return this.healthStatus.get(providerId);
  }

  /**
   * Get statistics about the registry
   */
  getStats() {
    const providers = this.getAllProviders();
    const healthStatuses = Array.from(this.healthStatus.values());

    return {
      totalProviders: providers.length,
      activeProviders: providers.filter(p => p.status === 'active').length,
      healthyProviders: healthStatuses.filter(h => h.status === 'healthy').length,
      degradedProviders: healthStatuses.filter(h => h.status === 'degraded').length,
      offlineProviders: healthStatuses.filter(h => h.status === 'offline').length,
      supportedChains: [...new Set(providers.flatMap(p => p.chains))],
      averageLatency: healthStatuses.reduce((sum, h) => sum + h.latency, 0) / healthStatuses.length || 0,
    };
  }
}

