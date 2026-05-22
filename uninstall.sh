#!/usr/bin/env bash
set -euo pipefail

SKILLS_DIR="$HOME/.claude/skills"
BIN_DIR="$HOME/.local/bin"

remove_symlink() {
  local target="$1"
  if [ -L "$target" ]; then
    rm "$target"
    echo "removed $target"
  elif [ -e "$target" ]; then
    echo "warning: $target exists but is not a symlink — leaving in place" >&2
  fi
}

remove_symlink "$SKILLS_DIR/work-next"
remove_symlink "$BIN_DIR/work-next"

cat <<EOF

work-next uninstalled.

Your config and history at ${WORK_NEXT_CONFIG_DIR:-$HOME/.config/work-next} are preserved.
Remove them manually if you want a clean slate.

EOF
