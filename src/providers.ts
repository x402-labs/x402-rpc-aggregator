/**
 * RPC Provider Configurations
 * 
 * This file defines the available RPC providers for the x402-RPC-Aggregator.
 * Providers can be added or removed dynamically through the API.
 */

import { RPCProvider } from './types';

export const PROVIDERS: RPCProvider[] = [
  // === SOLANA PROVIDERS (Primary Focus: Helius) ===
  {
    id: 'triton-solana',
    name: 'Triton One',
    url: process.env.TRITON_RPC_URL || '',
    chains: ['solana'],
    costPerCall: 0.0001,
    batchCost: {
      calls: 1000,
      price: 0.08, // $0.08 for 1K calls (20% discount)
    },
    priority: 70, // Lower priority - offline without API key
    status: process.env.TRITON_RPC_URL && process.env.TRITON_RPC_URL !== 'https://api.mainnet.solana.com' ? 'active' : 'offline',
    maxLatencyMs: 2000,
    rateLimit: {
      requestsPerSecond: 100,
      requestsPerMinute: 5000,
    },
    metadata: {
      description: 'High-performance Solana RPC with global coverage',
      websiteUrl: 'https://triton.one',
      supportedMethods: [
        'getAccountInfo',
        'getBalance',
        'getBlock',
        'getBlockHeight',
        'getBlockProduction',
        'getBlockCommitment',
        'getBlocks',
        'getBlocksWithLimit',
        'getBlockTime',
        'getClusterNodes',
        'getEpochInfo',
        'getEpochSchedule',
        'getFeeForMessage',
        'getFirstAvailableBlock',
        'getGenesisHash',
        'getHealth',
        'getHighestSnapshotSlot',
        'getIdentity',
        'getInflationGovernor',
        'getInflationRate',
        'getInflationReward',
        'getLargestAccounts',
        'getLatestBlockhash',
        'getLeaderSchedule',
        'getMaxRetransmitSlot',
        'getMaxShredInsertSlot',
        'getMinimumBalanceForRentExemption',
        'getMultipleAccounts',
        'getProgramAccounts',
        'getRecentPerformanceSamples',
        'getRecentPrioritizationFees',
        'getSignatureStatuses',
        'getSignaturesForAddress',
        'getSlot',
        'getSlotLeader',
        'getSlotLeaders',
        'getStakeActivation',
        'getStakeMinimumDelegation',
        'getSupply',
        'getTokenAccountBalance',
        'getTokenAccountsByDelegate',
        'getTokenAccountsByOwner',
        'getTokenLargestAccounts',
        'getTokenSupply',
        'getTransaction',
        'getTransactionCount',
        'getVersion',
        'getVoteAccounts',
        'isBlockhashValid',
        'minimumLedgerSlot',
        'requestAirdrop',
        'sendTransaction',
        'simulateTransaction',
      ],
    },
  },
  {
    id: 'helius-solana',
    name: 'Helius',
    url: process.env.HELIUS_RPC_URL || '',
    chains: ['solana'],
    costPerCall: 0.00015,
    batchCost: {
      calls: 1000,
      price: 0.12,
    },
    priority: 100, // HIGHEST PRIORITY - Dedicated Helius endpoint
    maxLatencyMs: 2500,
    status: process.env.HELIUS_RPC_URL ? 'active' : 'offline',
    metadata: {
      description: 'Enhanced Solana RPC with webhooks and DAS API - DEDICATED ENDPOINT',
      websiteUrl: 'https://helius.dev',
    },
  },
  {
    id: 'quicknode-solana',
    name: 'QuickNode Solana',
    url: process.env.QUICKNODE_SOLANA_URL || '',
    chains: ['solana'],
    costPerCall: 0.0002,
    priority: 60,
    maxLatencyMs: 3000,
    status: process.env.QUICKNODE_SOLANA_URL && process.env.QUICKNODE_SOLANA_URL !== 'https://api.mainnet-beta.solana.com' ? 'active' : 'offline',
    metadata: {
      description: 'Multi-chain RPC infrastructure (requires API key)',
      websiteUrl: 'https://quicknode.com',
    },
  },

  // === ETHEREUM/EVM PROVIDERS ===
  {
    id: 'quicknode-eth',
    name: 'QuickNode Ethereum',
    url: process.env.QUICKNODE_ETH_URL || '',
    chains: ['ethereum'],
    costPerCall: 0.0002,
    batchCost: {
      calls: 1000,
      price: 0.15,
    },
    priority: 75,
    maxLatencyMs: 3000,
    status: process.env.QUICKNODE_ETH_URL ? 'active' : 'offline',
    metadata: {
      description: 'Multi-chain RPC (requires API key)',
      websiteUrl: 'https://quicknode.com',
    },
  },
  {
    id: 'alchemy-eth',
    name: 'Alchemy Ethereum',
    url: process.env.ALCHEMY_ETH_URL || '',
    chains: ['ethereum'],
    costPerCall: 0.0003,
    priority: 70,
    status: process.env.ALCHEMY_ETH_URL ? 'active' : 'offline',
    metadata: {
      description: 'Ethereum RPC with enhanced APIs (requires API key)',
      websiteUrl: 'https://alchemy.com',
    },
  },
  {
    id: 'infura-eth',
    name: 'Infura Ethereum',
    url: process.env.INFURA_ETH_URL || '',
    chains: ['ethereum'],
    costPerCall: 0.00025,
    priority: 65,
    status: process.env.INFURA_ETH_URL ? 'active' : 'offline',
    metadata: {
      description: 'Ethereum RPC infrastructure (requires API key)',
      websiteUrl: 'https://infura.io',
    },
  },

  // === BASE (L2) PROVIDERS ===
  {
    id: 'quicknode-base',
    name: 'QuickNode Base',
    url: process.env.QUICKNODE_BASE_URL || '',
    chains: ['base'],
    costPerCall: 0.0001,
    batchCost: {
      calls: 1000,
      price: 0.08,
    },
    priority: 80,
    maxLatencyMs: 2000,
    status: process.env.QUICKNODE_BASE_URL ? 'active' : 'offline',
    metadata: {
      description: 'Base L2 RPC (requires API key)',
      websiteUrl: 'https://quicknode.com',
    },
  },
  {
    id: 'alchemy-base',
    name: 'Alchemy Base',
    url: process.env.ALCHEMY_BASE_URL || '',
    chains: ['base'],
    costPerCall: 0.00015,
    priority: 75,
    status: process.env.ALCHEMY_BASE_URL ? 'active' : 'offline',
    metadata: {
      description: 'Base L2 RPC with enhanced APIs (requires API key)',
      websiteUrl: 'https://alchemy.com',
    },
  },
];