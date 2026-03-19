#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/gateway-mode.sh <mode>

Modes:
  remote  Enable Tailscale remote access (loopback + tailscale serve + gateway restart)
  home    Disable Tailscale networking and switch gateway to LAN bind (gateway restart)
  tailscale-on  Enable/start Tailscale networking
  tailscale-off Disable/stop Tailscale networking
  status  Show current gateway + tailscale mode

Examples:
  scripts/gateway-mode.sh remote
  scripts/gateway-mode.sh home
  scripts/gateway-mode.sh tailscale-on
  scripts/gateway-mode.sh tailscale-off
  scripts/gateway-mode.sh status
EOF
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf 'ERROR: required command not found: %s\n' "$cmd" >&2
    exit 1
  fi
}

restart_gateway() {
  printf '==> Restarting OpenClaw gateway\n'
  openclaw gateway restart
}

ensure_tailscale_up() {
  if tailscale status >/dev/null 2>&1; then
    return 0
  fi
  printf '==> Tailscale is down; bringing it up\n'
  tailscale up
}

print_status() {
  local bind_mode
  bind_mode="$(openclaw config get gateway.bind 2>/dev/null || echo "unknown")"

  printf 'Gateway bind: %s\n' "$bind_mode"
  printf '\nOpenClaw gateway status:\n'
  openclaw gateway status || true

  if command -v tailscale >/dev/null 2>&1; then
    printf '\nTailscale serve status:\n'
    tailscale serve status || true
  fi
}

mode="${1:-}"
if [[ -z "$mode" ]]; then
  usage
  exit 1
fi

case "$mode" in
  remote)
    require_cmd openclaw
    require_cmd tailscale

    printf '==> Configuring remote mode (loopback + tailscale serve)\n'
    ensure_tailscale_up
    openclaw config set gateway.bind loopback
    openclaw config set gateway.tailscale.mode serve
    openclaw config set gateway.auth.allowTailscale true

    # HTTPS on 443, proxying to local gateway (current CLI syntax).
    tailscale serve --bg http://127.0.0.1:18789

    restart_gateway

    # Best-effort URL hint.
    dns_name="$(tailscale status --json 2>/dev/null | sed -n 's/.*"DNSName":"\([^"]*\)".*/\1/p' | head -n1 | sed 's/\.$//')"
    if [[ -n "${dns_name:-}" ]]; then
      printf '\nRemote URL: https://%s\n' "$dns_name"
    fi
    print_status
    ;;

  home)
    require_cmd openclaw
    require_cmd tailscale

    printf '==> Configuring home mode (disable tailscale + LAN bind)\n'
    tailscale serve reset || true
    tailscale funnel reset || true
    tailscale down || true
    openclaw config set gateway.tailscale.mode off
    openclaw config set gateway.bind lan

    restart_gateway
    print_status
    ;;

  tailscale-on)
    require_cmd tailscale
    printf '==> Enabling Tailscale\n'
    tailscale up
    tailscale status || true
    ;;

  tailscale-off)
    require_cmd tailscale
    printf '==> Disabling Tailscale\n'
    tailscale down
    tailscale status || true
    ;;

  status)
    require_cmd openclaw
    print_status
    ;;

  *)
    usage
    exit 1
    ;;
esac
