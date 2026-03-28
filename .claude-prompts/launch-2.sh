#!/bin/bash
cd "/Users/ace/hogansmith"
exec claude --dangerously-skip-permissions "$(cat '/Users/ace/hogansmith/.claude-prompts/pane-2.md')"
