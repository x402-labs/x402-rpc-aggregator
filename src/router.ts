/**
 * Intelligent Router - Selects the best RPC provider based on various criteria
 * 
 * Supports multiple routing strategies:
 * - lowest-cost: Select provider with lowest cost per call
 * - lowest-latency: Select provider with best latency
 * - highest-priority: Select highest priority provider
 * - round-robin: Distribute load evenly
 * 
 * Features:
 * - Health-based filtering
 * - Automatic fallback
 * - AI agent preferences
 */

import { RPCProvider, RoutingPreferences, AgentPreferences } from './types';
import { ProviderRegistry } from './providers/provider-registry';

export class IntelligentRouter {
  private registry: ProviderRegistry;
  private roundRobinCounters: Map<string, number> = new Map();

  constructor(registry: ProviderRegistry) {
    this.registry = registry;
  }

  /**
   * Select the best provider based on chain and preferences
   */
  selectProvider(
    chain: string,
    preferences?: RoutingPreferences
  ): RPCProvider {
    const prefs = {
      strategy: preferences?.strategy || 'highest-priority', // Use highest-priority by default to respect provider priorities
      requireHealthy: preferences?.requireHealthy !== false,
      ...preferences,
    };

    // Get candidate providers
    let candidates = prefs.requireHealthy
      ? this.registry.getHealthyProviders(chain)
      : this.registry.getProvidersByChain(chain);

    if (candidates.length === 0) {
      throw new Error(`No ${prefs.requireHealthy ? 'healthy ' : ''}providers available for chain: ${chain}`);
    }

    // Apply filters
    candidates = this.applyFilters(candidates, prefs);

    if (candidates.length === 0) {
      throw new Error(`No providers match the specified preferences for chain: ${chain}`);
    }

    // Apply routing strategy
    return this.applyStrategy(candidates, prefs.strategy!, chain);
  }

  /**
   * Select provider with fallback
   * Tries primary selection, then falls back to alternatives
   */
  selectProviderWithFallback(
    chain: string,
    preferences?: RoutingPreferences
  ): { provider: RPCProvider; fallbacks: RPCProvider[] } {
    const primary = this.selectProvider(chain, preferences);
    
    // Get fallback providers (different from primary)
    const allProviders = this.registry.getHealthyProviders(chain);
    const fallbacks = allProviders
      .filter(p => p.id !== primary.id)
      .sort((a, b) => (b.priority || 50) - (a.priority || 50))
      .slice(0, 2); // Top 2 fallbacks

    return { provider: primary, fallbacks };
  }

  /**
   * Apply preference filters to candidates
   */
  private applyFilters(
    candidates: RPCProvider[],
    prefs: RoutingPreferences
  ): RPCProvider[] {
    let filtered = candidates;

    // Filter by max cost
    if (prefs.maxCostPerCall !== undefined) {
      filtered = filtered.filter(p => p.costPerCall <= prefs.maxCostPerCall!);
    }

    // Filter by max latency
    if (prefs.maxLatencyMs !== undefined) {
      filtered = filtered.filter(p => 
        !p.averageLatency || p.averageLatency <= prefs.maxLatencyMs!
      );
    }

    // Filter by preferred providers
    if (prefs.preferredProviders && prefs.preferredProviders.length > 0) {
      const preferred = filtered.filter(p => 
        prefs.preferredProviders!.includes(p.id)
      );
      if (preferred.length > 0) {
        filtered = preferred;
      }
    }

    // Exclude providers
    if (prefs.excludeProviders && prefs.excludeProviders.length > 0) {
      filtered = filtered.filter(p => 
        !prefs.excludeProviders!.includes(p.id)
      );
    }

    return filtered;
  }

  /**
   * Apply routing strategy to select final provider
   */
  private applyStrategy(
    candidates: RPCProvider[],
    strategy: string,
    chain: string
  ): RPCProvider {
    switch (strategy) {
      case 'lowest-cost':
        return candidates.reduce((best, curr) =>
          curr.costPerCall < best.costPerCall ? curr : best
        );

      case 'lowest-latency':
        return candidates
          .filter(p => p.averageLatency !== undefined)
          .sort((a, b) => (a.averageLatency || Infinity) - (b.averageLatency || Infinity))[0]
          || candidates[0];

      case 'highest-priority':
        return candidates.reduce((best, curr) =>
          (curr.priority || 0) > (best.priority || 0) ? curr : best
        );

      case 'round-robin':
        const key = `rr-${chain}`;
        const counter = this.roundRobinCounters.get(key) || 0;
        const selected = candidates[counter % candidates.length];
        this.roundRobinCounters.set(key, counter + 1);
        return selected;

      default:
        return candidates[0];
    }
  }

  /**
   * Get routing statistics
   */
  getStats() {
    return this.registry.getStats();
  }

  /**
   * Check if batch pricing is available for a provider
   */
  getBatchPricing(providerId: string): { available: boolean; calls?: number; price?: number } {
    const provider = this.registry.getProvider(providerId);
    if (!provider || !provider.batchCost) {
      return { available: false };
    }

    return {
      available: true,
      calls: provider.batchCost.calls,
      price: provider.batchCost.price,
    };
  }
}

// Legacy compatibility function
export function selectBestProvider(
  chain: string,
  registry?: ProviderRegistry
): RPCProvider {
  if (!registry) {
    throw new Error('Provider registry required');
  }
  const router = new IntelligentRouter(registry);
  return router.selectProvider(chain, { strategy: 'lowest-cost' });
}