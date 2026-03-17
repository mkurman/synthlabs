#!/usr/bin/env bash
set -euo pipefail

# ─── Colors & Symbols ────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

CHECK="${GREEN}✔${RESET}"
CROSS="${RED}✘${RESET}"
ARROW="${CYAN}➜${RESET}"
INFO="${BLUE}ℹ${RESET}"

# ─── Config ──────────────────────────────────────────────────────────
COMPOSE_FILE="docker/docker-compose.yml"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE_PATH="${SCRIPT_DIR}/${COMPOSE_FILE}"

# ─── Helpers ─────────────────────────────────────────────────────────
print_header() {
    echo ""
    echo -e "${BOLD}${CYAN}┌─────────────────────────────────────┐${RESET}"
    echo -e "${BOLD}${CYAN}│${RESET}  ${BOLD}SynthLabs Docker Manager${RESET}           ${BOLD}${CYAN}│${RESET}"
    echo -e "${BOLD}${CYAN}└─────────────────────────────────────┘${RESET}"
    echo ""
}

info()    { echo -e " ${INFO}  ${1}"; }
success() { echo -e " ${CHECK}  ${GREEN}${1}${RESET}"; }
warn()    { echo -e " ${ARROW}  ${YELLOW}${1}${RESET}"; }
error()   { echo -e " ${CROSS}  ${RED}${1}${RESET}" >&2; }

check_compose_file() {
    if [[ ! -f "${COMPOSE_FILE_PATH}" ]]; then
        error "Compose file not found: ${COMPOSE_FILE}"
        error "Expected at: ${COMPOSE_FILE_PATH}"
        exit 1
    fi
}

check_env_file() {
    local env_path="${SCRIPT_DIR}/.env"
    if [[ ! -f "${env_path}" ]]; then
        warn "No .env file found — backend will start with defaults only"
        warn "Copy .env.example to .env and fill in your API keys"
    fi
}

docker_compose() {
    docker compose -f "${COMPOSE_FILE_PATH}" "$@"
}

# ─── Commands ────────────────────────────────────────────────────────
cmd_up() {
    check_env_file
    info "Starting all services..."
    docker_compose up -d "$@"
    echo ""
    success "All services are up!"
    echo ""
    echo -e "   ${BOLD}Frontend${RESET}    ${GREEN}http://localhost:3000${RESET}  ${DIM}(Vite dev server)${RESET}"
    echo -e "   ${BOLD}Backend${RESET}     ${GREEN}http://localhost:8900${RESET}"
    echo -e "   ${BOLD}CockroachDB${RESET} ${GREEN}http://localhost:8080${RESET}  ${DIM}(admin UI)${RESET}"
    echo ""
}

cmd_down() {
    warn "Stopping and removing containers..."
    docker_compose down "$@"
    success "Containers stopped and removed"
}

cmd_stop() {
    warn "Stopping containers..."
    docker_compose stop "$@"
    success "Containers stopped"
}

cmd_build() {
    info "Building images..."
    docker_compose build "$@"
    success "Build complete"
}

cmd_restart() {
    warn "Restarting containers..."
    docker_compose restart "$@"
    success "Containers restarted"
}

cmd_logs() {
    info "Streaming logs ${DIM}(Ctrl+C to exit)${RESET}"
    docker_compose logs -f --tail=100 "$@"
}

cmd_ps() {
    info "Container status:"
    echo ""
    docker_compose ps "$@"
}

cmd_status() {
    print_header
    echo -e " ${BOLD}Services${RESET} ${DIM}(${COMPOSE_FILE})${RESET}"
    echo -e " ${DIM}────────────────────────────────────────────${RESET}"

    local services
    services=$(docker_compose config --services 2>/dev/null)

    for service in ${services}; do
        local state port_info=""
        state=$(docker_compose ps --format '{{.State}}' "${service}" 2>/dev/null || echo "")

        # Show port mapping for running services
        if [[ "${state}" == "running" ]]; then
            port_info=$(docker_compose ps --format '{{.Ports}}' "${service}" 2>/dev/null | head -1)
            [[ -n "${port_info}" ]] && port_info=" ${DIM}${port_info}${RESET}"
            echo -e " ${CHECK}  ${BOLD}${service}${RESET}${port_info}"
        elif [[ -n "${state}" ]]; then
            echo -e " ${CROSS}  ${BOLD}${service}${RESET} ${DIM}─${RESET} ${RED}${state}${RESET}"
        else
            echo -e " ${DIM}○  ${service} ─ not created${RESET}"
        fi
    done
    echo ""
}

# ─── Usage ───────────────────────────────────────────────────────────
usage() {
    print_header
    echo -e " ${BOLD}Usage:${RESET}  ./mc.sh ${CYAN}<command>${RESET} [options]"
    echo ""
    echo -e " ${BOLD}Commands:${RESET}"
    echo -e "   ${CYAN}up${RESET}        Build, create, and start all services"
    echo -e "   ${CYAN}down${RESET}      Stop and remove containers"
    echo -e "   ${CYAN}stop${RESET}      Stop containers without removing"
    echo -e "   ${CYAN}build${RESET}     Build container images"
    echo -e "   ${CYAN}restart${RESET}   Restart containers"
    echo -e "   ${CYAN}logs${RESET}      Stream container logs (tail=100)"
    echo -e "   ${CYAN}ps${RESET}        List running containers"
    echo -e "   ${CYAN}status${RESET}    Show status of all services"
    echo ""
    echo -e " ${BOLD}Services:${RESET}"
    echo -e "   ${DIM}frontend${RESET}     Vite dev server (hot reload)  ${DIM}:3000${RESET}"
    echo -e "   ${DIM}backend${RESET}      Express API server            ${DIM}:8900${RESET}"
    echo -e "   ${DIM}cockroachdb${RESET}  Database                      ${DIM}:26257 / :8080${RESET}"
    echo ""
    echo -e " ${BOLD}Examples:${RESET}"
    echo -e "   ${DIM}./mc.sh up                   ${RESET}${DIM}# start everything${RESET}"
    echo -e "   ${DIM}./mc.sh up backend            ${RESET}${DIM}# start only the backend${RESET}"
    echo -e "   ${DIM}./mc.sh logs backend          ${RESET}${DIM}# tail backend logs${RESET}"
    echo -e "   ${DIM}./mc.sh restart frontend      ${RESET}${DIM}# restart vite dev server${RESET}"
    echo ""
}

# ─── Main ────────────────────────────────────────────────────────────
main() {
    if [[ $# -eq 0 ]]; then
        usage
        exit 0
    fi

    local command="$1"
    shift

    check_compose_file

    case "${command}" in
        up)      cmd_up "$@" ;;
        down)    cmd_down "$@" ;;
        stop)    cmd_stop "$@" ;;
        build)   cmd_build "$@" ;;
        restart) cmd_restart "$@" ;;
        logs)    cmd_logs "$@" ;;
        ps)      cmd_ps "$@" ;;
        status)  cmd_status "$@" ;;
        help|-h|--help)
            usage
            exit 0
            ;;
        *)
            error "Unknown command: ${command}"
            echo ""
            usage
            exit 1
            ;;
    esac
}

main "$@"
