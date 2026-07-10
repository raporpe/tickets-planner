#!/bin/bash
# Setup script for ticket-manager
# Adds the 'ticket' command alias to your shell

TICKET_MANAGER_DIR="$(cd "$(dirname "$0")" && pwd)"

# Detect shell config file
if [[ "$SHELL" == *"zsh"* ]]; then
    SHELL_RC="$HOME/.zshrc"
elif [[ "$SHELL" == *"bash"* ]]; then
    if [[ -f "$HOME/.bash_profile" ]]; then
        SHELL_RC="$HOME/.bash_profile"
    else
        SHELL_RC="$HOME/.bashrc"
    fi
else
    SHELL_RC="$HOME/.profile"
fi

FUNC_DEF="opencode() { cd \"$TICKET_MANAGER_DIR\" && copilot --model claude-opus-4.5 --allow-all-tools -i \"Read instructions.md\"; }"

# Check if function already exists
if grep -q "opencode()" "$SHELL_RC" 2>/dev/null; then
    echo "⚠️  'opencode' function already exists in $SHELL_RC"
    echo "   Remove it manually if you want to update it, then re-run this script."
    exit 1
fi

# Add function
echo "" >> "$SHELL_RC"
echo "# Ticket Manager - Azure DevOps CLI helper" >> "$SHELL_RC"
echo "$FUNC_DEF" >> "$SHELL_RC"

echo "✅ Added 'opencode' function to $SHELL_RC"
echo ""
echo "Run this to start using it now:"
echo "   source $SHELL_RC"
echo ""
echo "Then just type 'opencode' from anywhere to launch."
