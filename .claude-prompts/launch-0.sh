#!/bin/bash
cd "/Users/ace/hogansmith"
exec claude --dangerously-skip-permissions "$(cat '/Users/ace/hogansmith/.claude-prompts/pane-0.md')"
