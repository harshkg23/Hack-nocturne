#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SentinelQA Canary Deploy Script for Minikube
# Usage: ./scripts/canary-deploy.sh [action] [options]
#
# Actions:
#   start     - Build images, deploy canary pods to minikube
#   promote   - Promote canary to stable (scale canary, scale down old stable)
#   rollback  - Rollback canary, restore stable
#   status    - Show current canary state
#   teardown  - Remove all SentinelQA resources from minikube
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

NAMESPACE="sentinelqa"
APP_NAME="sentinelqa-app"
STABLE_DEPLOY="${APP_NAME}-stable"
CANARY_DEPLOY="${APP_NAME}-canary"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()   { echo -e "${CYAN}[SentinelQA]${NC} $1"; }
ok()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[⚠]${NC} $1"; }
err()   { echo -e "${RED}[✗]${NC} $1"; }

# ─── Ensure minikube is running ──────────────────────────────────────────────

check_minikube() {
  if ! command -v minikube &> /dev/null; then
    err "minikube not found. Install: https://minikube.sigs.k8s.io/"
    exit 1
  fi

  if ! minikube status &> /dev/null; then
    warn "minikube not running. Starting..."
    minikube start --driver=docker --memory=4096 --cpus=2
    ok "minikube started"
  fi

  # Use minikube's Docker daemon for image builds
  eval $(minikube docker-env)
  ok "Using minikube Docker daemon"
}

# ─── Build Docker images inside minikube ─────────────────────────────────────

build_images() {
  log "Building Docker images..."

  # Build Next.js app
  docker build -t "${APP_NAME}:canary" -f "${ROOT_DIR}/Dockerfile" "$ROOT_DIR"
  docker tag "${APP_NAME}:canary" "${APP_NAME}:latest"
  ok "Built ${APP_NAME}:canary and tagged as :latest for stable pods"

  # Build AI engine image (skip if not needed for this deploy)
  docker build -t "sentinelqa-ai-engine:latest" \
    -f- "$ROOT_DIR/ai-engine" <<'EOF'
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "server.py"]
EOF
  ok "Built sentinelqa-ai-engine:latest"
}

# ─── Apply K8s base resources ────────────────────────────────────────────────

apply_base() {
  log "Applying base Kubernetes resources..."

  kubectl apply -f "${ROOT_DIR}/k8s/namespace.yaml"
  kubectl apply -f "${ROOT_DIR}/k8s/secrets.yaml"
  kubectl apply -f "${ROOT_DIR}/k8s/services.yaml"
  kubectl apply -f "${ROOT_DIR}/k8s/deployments/sentinelqa-app.yaml"
  kubectl apply -f "${ROOT_DIR}/k8s/deployments/prometheus.yaml"
  kubectl apply -f "${ROOT_DIR}/k8s/deployments/grafana.yaml"

  ok "Base resources applied"
}

# ─── Actions ─────────────────────────────────────────────────────────────────

action_start() {
  local skip_tests="${1:-false}"

  check_minikube
  build_images
  apply_base

  log "Starting canary deployment..."

  # Scale canary to 1 replica
  kubectl scale deployment "$CANARY_DEPLOY" --replicas=1 -n "$NAMESPACE"
  ok "Canary pod scaling up"

  # Wait for canary to be ready
  log "Waiting for canary pod to be ready..."
  kubectl rollout status deployment "$CANARY_DEPLOY" -n "$NAMESPACE" --timeout=120s
  ok "Canary pod is ready"

  # Show traffic split
  local stable_replicas
  stable_replicas=$(kubectl get deployment "$STABLE_DEPLOY" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}')
  local canary_replicas
  canary_replicas=$(kubectl get deployment "$CANARY_DEPLOY" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}')
  local total=$((stable_replicas + canary_replicas))
  local canary_pct=$((canary_replicas * 100 / total))

  log "Traffic split: ${GREEN}stable=${stable_replicas}${NC} | ${YELLOW}canary=${canary_replicas}${NC} (~${canary_pct}% canary)"

  if [[ "$skip_tests" == "true" ]]; then
    warn "SentinelQA tests bypassed — proceeding without validation"
  else
    log "SentinelQA tests running in parallel (non-blocking)..."
    log "Monitor at: http://$(minikube ip):30000/deployment"
  fi

  echo ""
  log "Canary is live! Next steps:"
  echo "  → Monitor:  ./scripts/canary-deploy.sh status"
  echo "  → Promote:  ./scripts/canary-deploy.sh promote"
  echo "  → Rollback: ./scripts/canary-deploy.sh rollback"
  echo ""
  log "Grafana:    http://$(minikube ip):30020"
  log "Prometheus: http://$(minikube ip):30090"
  log "App:        http://$(minikube ip):30000"
}

action_promote() {
  log "Promoting canary to stable..."

  # Evaluate minikube docker-env to ensure we talk to minikube's docker daemon
  eval $(minikube docker-env)

  # Tag the canary image as the new stable
  docker tag "${APP_NAME}:canary" "${APP_NAME}:latest"
  ok "Canary image tagged as stable"

  # Update stable deployment to use the new image
  kubectl set image deployment/"$STABLE_DEPLOY" \
    sentinelqa-app="${APP_NAME}:latest" -n "$NAMESPACE"
  ok "Stable deployment updated"

  # Wait for the rollout
  kubectl rollout status deployment "$STABLE_DEPLOY" -n "$NAMESPACE" --timeout=120s

  # Scale canary back to 0
  kubectl scale deployment "$CANARY_DEPLOY" --replicas=0 -n "$NAMESPACE"
  ok "Canary scaled to 0"

  ok "🎉 Canary promoted successfully — 100% traffic on new version"
}

action_rollback() {
  warn "Rolling back canary deployment..."

  # Scale canary to 0
  kubectl scale deployment "$CANARY_DEPLOY" --replicas=0 -n "$NAMESPACE"
  ok "Canary scaled to 0"

  # Rollback stable if it was changed
  kubectl rollout undo deployment "$STABLE_DEPLOY" -n "$NAMESPACE" 2>/dev/null || true
  kubectl rollout status deployment "$STABLE_DEPLOY" -n "$NAMESPACE" --timeout=60s

  ok "Rollback complete — all traffic on previous stable version"
}

action_status() {
  echo ""
  log "═══════════════════════════════════════════════════════"
  log "  SentinelQA Canary Deployment Status"
  log "═══════════════════════════════════════════════════════"
  echo ""

  # Deployment status
  log "Deployments:"
  kubectl get deployments -n "$NAMESPACE" -o wide 2>/dev/null || warn "No deployments found"
  echo ""

  # Pod status
  log "Pods:"
  kubectl get pods -n "$NAMESPACE" -o wide 2>/dev/null || warn "No pods found"
  echo ""

  # Services
  log "Services:"
  kubectl get services -n "$NAMESPACE" -o wide 2>/dev/null || warn "No services found"
  echo ""

  # Traffic split
  local stable_replicas canary_replicas
  stable_replicas=$(kubectl get deployment "$STABLE_DEPLOY" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")
  canary_replicas=$(kubectl get deployment "$CANARY_DEPLOY" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")

  if [[ "$((stable_replicas + canary_replicas))" -gt 0 ]]; then
    local total=$((stable_replicas + canary_replicas))
    local canary_pct=$((canary_replicas * 100 / total))
    log "Traffic: stable=${stable_replicas} ($(( 100 - canary_pct ))%) | canary=${canary_replicas} (${canary_pct}%)"
  fi

  echo ""
  if command -v minikube &> /dev/null && minikube status &> /dev/null; then
    log "Dashboard: http://$(minikube ip):30000/deployment"
    log "Grafana:   http://$(minikube ip):30020"
    log "Prometheus: http://$(minikube ip):30090"
  fi
}

action_teardown() {
  warn "Tearing down all SentinelQA resources..."
  kubectl delete namespace "$NAMESPACE" --ignore-not-found
  ok "Namespace '$NAMESPACE' deleted"
}

# ─── Main ────────────────────────────────────────────────────────────────────

ACTION="${1:-status}"

case "$ACTION" in
  start)
    action_start "${2:-false}"
    ;;
  promote)
    action_promote
    ;;
  rollback)
    action_rollback
    ;;
  status)
    action_status
    ;;
  teardown)
    action_teardown
    ;;
  *)
    echo "Usage: $0 {start|promote|rollback|status|teardown}"
    echo ""
    echo "Actions:"
    echo "  start [--skip-tests]  - Deploy canary to minikube"
    echo "  promote               - Promote canary to 100% stable"
    echo "  rollback              - Revert to previous stable version"
    echo "  status                - Show current deployment state"
    echo "  teardown              - Remove all SentinelQA resources"
    exit 1
    ;;
esac
