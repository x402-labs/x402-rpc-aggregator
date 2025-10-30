#!/bin/bash

# x402-RPC-Aggregator Stop Script

PORT=${PORT:-3000}

echo "🛑 Stopping x402-RPC-Aggregator..."

if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
  echo "   Found process on port $PORT"
  lsof -ti:$PORT | xargs kill -9 2>/dev/null
  sleep 1
  echo "✅ Server stopped"
else
  echo "ℹ️  No server running on port $PORT"
fi

