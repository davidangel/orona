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

exec node ./bin/bolo-server config.json
