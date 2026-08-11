#!/usr/bin/env bash
#
# QuantSift macOS universal build assistant
#
# Builds a universal (Universal Binary) macOS package that runs on both
# Intel (x86_64) and Apple Silicon (arm64) Macs.
#
# Usage:
#   ./build-macos.sh            # full build (tests + type-check + package)
#   ./build-macos.sh --skip-check   # skip the Rust target / tool check
#   ./build-macos.sh --help     # show this help
#
# Requirements:
#   - macOS with Xcode Command Line Tools installed
#   - Node.js 20+ and pnpm 9+
#   - Rust toolchain (via rustup)
#
# Notes:
#   - The script installs the x86_64-apple-darwin and aarch64-apple-darwin
#     Rust targets via rustup if they are missing. Both are required to build
#     a universal binary.
#   - Building the universal package may take a long time on first run because
#     both target architectures are compiled and then merged with `lipo`.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIVERSAL_TARGET="universal-apple-darwin"
RUST_TARGETS=("x86_64-apple-darwin" "aarch64-apple-darwin")
BUNDLE_DIR="src-tauri/target/universal-apple-darwin/release/bundle"

# Locations where rustup/cargo and pnpm may be installed without being on PATH
# (e.g. a non-login shell, or tools installed into the user home directory).
CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
RUSTUP_HOME="${RUSTUP_HOME:-$HOME/.rustup}"
LOCAL_BIN="$HOME/.local/bin"
HOMEBREW_BIN="/opt/homebrew/bin"
USR_LOCAL_BIN="/usr/local/bin"
export PATH="$CARGO_HOME/bin:$LOCAL_BIN:$HOMEBREW_BIN:$USR_LOCAL_BIN:$PATH"

SKIP_CHECK=0

for arg in "$@"; do
  case "$arg" in
    --skip-check)
      SKIP_CHECK=1
      ;;
    --help|-h)
      awk '/^# QuantSift macOS/{p=1} /^#   - Building the universal/{print; exit} p{print}' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Run '$0 --help' for usage." >&2
      exit 1
      ;;
  esac
done

section() {
  echo ""
  echo "== $1 =="
}

die() {
  echo ""
  echo "Build stopped: $1" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

report_missing() {
  local tool="$1"
  local hint="$2"
  echo "  - $tool 未找到。$hint"
}

# --- Preflight checks -------------------------------------------------------

if [[ "$(uname -s)" != "Darwin" ]]; then
  die "This script must be run on macOS."
fi

section "Preflight checks"
echo "  HOME:      $HOME"
echo "  cargo dir: $CARGO_HOME/bin"
echo "  Searching: $CARGO_HOME/bin, $HOMEBREW_BIN, $USR_LOCAL_BIN"

MISSING=0

if ! command_exists cargo; then
  MISSING=1
  report_missing "cargo" "请安装 Rust：运行 'curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh'，然后关闭并重开终端，或重新运行本脚本。"
fi

if ! command_exists rustup; then
  MISSING=1
  report_missing "rustup" "请安装 rustup：运行 'curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh'。"
fi

if ! command_exists lipo; then
  MISSING=1
  report_missing "lipo" "请安装 Xcode Command Line Tools：运行 'xcode-select --install'。"
fi

if ! command_exists pnpm; then
  MISSING=1
  report_missing "pnpm" "请安装：'npm install -g pnpm@9'，或先启用 corepack：'corepack enable'。"
fi

if [[ "$MISSING" -eq 1 ]]; then
  echo ""
  echo "以上工具缺失，请先完成安装后重新运行本脚本。"
  die "Preflight checks failed."
fi

if [[ "$SKIP_CHECK" -eq 0 ]]; then
  section "Install Rust targets for universal build"

  for target in "${RUST_TARGETS[@]}"; do
    if rustup target list --installed | grep -q "$target"; then
      echo "Target $target already installed."
    else
      echo "Installing Rust target: $target"
      rustup target add "$target"
    fi
  done
fi

cd "$PROJECT_ROOT"

section "Install dependencies"
pnpm install --frozen-lockfile

section "Run tests"
pnpm test

section "Type-check frontend"
pnpm lint

section "Build universal macOS application"
pnpm tauri build --target "$UNIVERSAL_TARGET"

BUNDLE_DIR_FULL="$PROJECT_ROOT/$BUNDLE_DIR"

if [[ ! -d "$BUNDLE_DIR_FULL" ]]; then
  die "The build completed, but no macOS package was found under $BUNDLE_DIR_FULL."
fi

section "Build complete"
find "$BUNDLE_DIR_FULL" -type f \( -name "*.dmg" -o -name "*.tar.gz" \) -print | sort
find "$BUNDLE_DIR_FULL" -type d -name "*.app" -print | sort

echo ""
echo "Packages are located at:"
echo "  $BUNDLE_DIR_FULL"
echo ""
echo "To verify the binary is a universal build, locate the app under the"
echo "bundle directory and run (adjust the path to your .app bundle):"
echo "  lipo -archs <path-to>/QuantSift.app/Contents/MacOS/QuantSift"
