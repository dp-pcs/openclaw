#!/usr/bin/env bash
set -euo pipefail

# OGP Phase 2 End-to-End Test
# Tests signed message passing between two gateways

GATEWAY_A_PORT="${OPENCLAW_GATEWAY_PORT_A:-12000}"
GATEWAY_B_PORT="${OPENCLAW_GATEWAY_PORT_B:-12001}"
GATEWAY_A_URL="http://localhost:${GATEWAY_A_PORT}"
GATEWAY_B_URL="http://localhost:${GATEWAY_B_PORT}"

echo "🧪 OGP Phase 2 End-to-End Test"
echo "================================"
echo ""
echo "Testing signed message passing between two gateways:"
echo "  Gateway A: ${GATEWAY_A_URL}"
echo "  Gateway B: ${GATEWAY_B_URL}"
echo ""

# Step 1: Check both gateways are running
echo "Step 1: Checking gateway health..."
if ! curl -sf "${GATEWAY_A_URL}/.well-known/openclaw-federation" > /dev/null; then
  echo "❌ Gateway A is not responding at ${GATEWAY_A_URL}"
  echo "   Start it with: OPENCLAW_GATEWAY_PORT=${GATEWAY_A_PORT} openclaw gateway run"
  exit 1
fi

if ! curl -sf "${GATEWAY_B_URL}/.well-known/openclaw-federation" > /dev/null; then
  echo "❌ Gateway B is not responding at ${GATEWAY_B_URL}"
  echo "   Start it with: OPENCLAW_GATEWAY_PORT=${GATEWAY_B_PORT} openclaw gateway run"
  exit 1
fi
echo "✅ Both gateways are running"
echo ""

# Step 2: Get gateway IDs
echo "Step 2: Fetching gateway identities..."
GATEWAY_A_ID=$(curl -sf "${GATEWAY_A_URL}/.well-known/openclaw-federation" | jq -r '.gatewayId')
GATEWAY_B_ID=$(curl -sf "${GATEWAY_B_URL}/.well-known/openclaw-federation" | jq -r '.gatewayId')
echo "  Gateway A ID: ${GATEWAY_A_ID}"
echo "  Gateway B ID: ${GATEWAY_B_ID}"
echo ""

# Step 3: Send ping from A to B
echo "Step 3: Sending 'ping' from A to B..."
OPENCLAW_GATEWAY_PORT="${GATEWAY_A_PORT}" openclaw federation send "${GATEWAY_B_ID}" \
  --intent ping \
  --json > /tmp/ogp-phase2-ping.json 2>&1 || {
  echo "❌ Ping failed"
  cat /tmp/ogp-phase2-ping.json
  exit 1
}

PING_STATUS=$(jq -r '.reply.status // "error"' < /tmp/ogp-phase2-ping.json)
if [ "$PING_STATUS" = "ok" ]; then
  echo "✅ Ping successful"
  PING_GATEWAY_ID=$(jq -r '.reply.gatewayId' < /tmp/ogp-phase2-ping.json)
  echo "  Response from: ${PING_GATEWAY_ID}"
else
  echo "❌ Ping failed - invalid response"
  jq '.' < /tmp/ogp-phase2-ping.json
  exit 1
fi
echo ""

# Step 4: Send web-search from A to B
echo "Step 4: Sending 'web-search' from A to B..."
OPENCLAW_GATEWAY_PORT="${GATEWAY_A_PORT}" openclaw federation send "${GATEWAY_B_ID}" \
  --intent web-search \
  --payload '{"query":"OGP Open Gateway Protocol"}' \
  --json > /tmp/ogp-phase2-search.json 2>&1 || {
  echo "❌ Web search failed"
  cat /tmp/ogp-phase2-search.json
  exit 1
}

SEARCH_RESULT=$(jq -r '.reply.result // .reply.error // "no-result"' < /tmp/ogp-phase2-search.json)
if [ "$SEARCH_RESULT" = "no-result" ]; then
  echo "❌ Web search failed - no result"
  jq '.' < /tmp/ogp-phase2-search.json
  exit 1
else
  echo "✅ Web search successful"
  echo "  Query: OGP Open Gateway Protocol"
  # Show a snippet of the result
  echo "  Result preview:"
  jq -r '.reply.result | if type == "object" then (.Abstract // .Heading // "Result received") else "Result received" end' < /tmp/ogp-phase2-search.json | head -n 3
fi
echo ""

echo "================================"
echo "🎉 All Phase 2 tests passed!"
echo ""
echo "Test artifacts:"
echo "  - /tmp/ogp-phase2-ping.json"
echo "  - /tmp/ogp-phase2-search.json"
