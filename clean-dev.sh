#!/bin/bash

# Stop any running Next.js processes
echo "Stopping any running Next.js processes..."
pgrep -f "node.*next" | xargs kill -9 2>/dev/null || true

# Remove build artifacts
echo "Cleaning build artifacts..."
rm -rf .next

# Clear file watching cache 
echo "Clearing file watching cache..."
if [ -d "node_modules/.cache" ]; then
  rm -rf node_modules/.cache
fi

# On macOS, reset the file watching settings
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "Resetting macOS file watching limits..."
  sudo sysctl -w kern.maxfiles=10485760 kern.maxfilesperproc=1048576 || echo "Failed to reset file watching limits (requires sudo)"
fi 

# Start Next.js in development mode
echo "Starting Next.js in development mode..."
npm run dev 