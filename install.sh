#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${WORK_NEXT_CONFIG_DIR:-$HOME/.config/work-next}"
SKILLS_DIR="$HOME/.claude/skills"
BIN_DIR="$HOME/.local/bin"

require_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "error: node not found on PATH" >&2
    exit 1
  fi
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$major" -lt 20 ]; then
    echo "error: node >= 20 required (found v$(node -v))" >&2
    exit 1
  fi
}

build() {
  cd "$REPO_ROOT"
  npm install
  npm run build
}

seed_config() {
  mkdir -p "$CONFIG_DIR"
  if [ ! -f "$CONFIG_DIR/subagents.json" ]; then
    cp "$REPO_ROOT/skill/defaults/subagents.json" "$CONFIG_DIR/subagents.json"
    echo "seeded $CONFIG_DIR/subagents.json"
  else
    echo "preserved existing $CONFIG_DIR/subagents.json"
  fi
  if [ ! -f "$CONFIG_DIR/weights.json" ]; then
    cp "$REPO_ROOT/skill/defaults/weights.json" "$CONFIG_DIR/weights.json"
    echo "seeded $CONFIG_DIR/weights.json"
  else
    echo "preserved existing $CONFIG_DIR/weights.json"
  fi
}

link_skill() {
  mkdir -p "$SKILLS_DIR"
  local target="$SKILLS_DIR/work-next"
  if [ -L "$target" ]; then
    rm "$target"
  elif [ -e "$target" ]; then
    echo "error: $target exists and is not a symlink; refusing to overwrite" >&2
    exit 1
  fi
  ln -s "$REPO_ROOT/skill" "$target"
  echo "linked $target -> $REPO_ROOT/skill"
}

link_cli() {
  mkdir -p "$BIN_DIR"
  local target="$BIN_DIR/work-next"
  if [ -L "$target" ] || [ -e "$target" ]; then
    rm "$target"
  fi
  ln -s "$REPO_ROOT/dist/cli.js" "$target"
  echo "linked $target -> $REPO_ROOT/dist/cli.js"
}

summary() {
  cat <<EOF

work-next installed.

  Skill:        $SKILLS_DIR/work-next  -> $REPO_ROOT/skill
  CLI binary:   $BIN_DIR/work-next     -> $REPO_ROOT/dist/cli.js
  Config dir:   $CONFIG_DIR

Make sure $BIN_DIR is on your PATH.

Try it:
  work-next config validate
  work-next                       # invokes claude or codex
  /work-next                      # inside a Claude Code session

EOF
}

require_node
build
seed_config
link_skill
link_cli
summary
