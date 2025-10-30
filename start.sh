#!/bin/bash

# x402-RPC-Aggregator Startup Script
# Quick start script with environment validation

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════════╗
║              x402-RPC-Aggregator v1.0.0                       ║
║  Pay-per-call RPC access for AI agents                       ║
╚═══════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Check if .env exists
if [ ! -f .env ]; then
  echo -e "${YELLOW}⚠️  No .env file found${NC}"
  echo "Creating from .env.example..."
  cp .env.example .env
  echo -e "${RED}Please edit .env with your configuration before continuing${NC}"
  exit 1
fi

# Source environment
set -a
source .env
set +a

# Validate required environment variables
echo -e "${BLUE}🔍 Validating configuration...${NC}"

ERRORS=0

if [ -z "$X402_WALLET" ] || [ "$X402_WALLET" == "your_receiving_wallet_address_here" ]; then
  echo -e "${RED}✗ X402_WALLET not configured${NC}"
  ((ERRORS++))
else
  echo -e "${GREEN}✓ X402_WALLET configured${NC}"
fi

if [ -z "$SOLANA_PRIVATE_KEY" ] || [ "$SOLANA_PRIVATE_KEY" == "your_base58_solana_private_key_here" ]; then
  echo -e "${YELLOW}⚠️  SOLANA_PRIVATE_KEY not configured (Solana payments will not work)${NC}"
else
  echo -e "${GREEN}✓ SOLANA_PRIVATE_KEY configured${NC}"
fi

if [ -z "$EVM_PRIVATE_KEY" ] || [ "$EVM_PRIVATE_KEY" == "0xyour_evm_private_key_here" ]; then
  echo -e "${YELLOW}⚠️  EVM_PRIVATE_KEY not configured (EVM payments will not work)${NC}"
else
  echo -e "${GREEN}✓ EVM_PRIVATE_KEY configured${NC}"
fi

if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}Please fix configuration errors in .env${NC}"
  exit 1
fi

# Check if built
if [ ! -d "dist" ]; then
  echo -e "${YELLOW}📦 Building project...${NC}"
  npm run build
fi

# Check if dependencies installed
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}📦 Installing dependencies...${NC}"
  npm install
  echo -e "${YELLOW}📦 Building project...${NC}"
  npm run build
fi

# Get PORT from env or default
PORT=${PORT:-3000}

# Check if port is already in use
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
  echo ""
  echo -e "${YELLOW}⚠️  Port $PORT is already in use${NC}"
  echo -e "${YELLOW}Stopping existing process...${NC}"
  lsof -ti:$PORT | xargs kill -9 2>/dev/null
  sleep 2
  echo -e "${GREEN}✓ Old process stopped${NC}"
fi

echo ""
echo -e "${GREEN}✅ Configuration valid!${NC}"
echo ""
echo -e "${BLUE}🚀 Starting server on port $PORT...${NC}"
echo ""
echo "Available endpoints:"
echo -e "  • ${GREEN}http://localhost:$PORT${NC}          - Landing page"
echo -e "  • ${GREEN}http://localhost:$PORT/health${NC}    - Health check"
echo -e "  • ${GREEN}http://localhost:$PORT/rpc${NC}       - RPC endpoint"
echo -e "  • ${GREEN}http://localhost:$PORT/providers${NC} - List providers"
echo -e "  • ${GREEN}http://localhost:$PORT/api-docs${NC}  - Swagger docs"
echo -e "  • ${GREEN}http://localhost:$PORT/demo${NC}      - Interactive demo"
echo -e "  • ${GREEN}http://localhost:$PORT/agent${NC}     - AI agent demo"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

# Start server
npm start

