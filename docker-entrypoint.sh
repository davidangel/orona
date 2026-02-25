#!/bin/sh

# Generate config.json from environment variables if not mounted
if [ ! -f /app/config.json ]; then
  echo "Generating config.json from environment..."
  cat > /app/config.json << EOF
{
  "general": {
    "base": "${BASE_URL:-http://localhost:8124}",
    "maxgames": ${MAXGAMES:-5}
  },
  "web": {
    "port": ${PORT:-8124},
    "log": true
  }
}
EOF
fi

# Create default maps directory if it doesn't exist (for when volume isn't mounted)
if [ ! -d /app/maps ] || [ -z "$(ls -A /app/maps 2>/dev/null)" ]; then
  echo "Warning: /app/maps is empty or not mounted. Using container default maps."
fi

exec node ./bin/bolo-server config.json
