# Danger Zone MCP

A Model Context Protocol (MCP) server that allows executing predefined commands with safety checks.

<a href="https://glama.ai/mcp/servers/@koinunopochi/danger-zone-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@koinunopochi/danger-zone-mcp/badge" alt="Danger Zone MCP server" />
</a>

## Features

- Execute safe commands from configuration
- Execute dangerous commands with native macOS confirmation dialog
- Support for pre-authorized dangerous commands (skip confirmation)
- JSONC support (JSON with comments)
- Multiple configuration file formats supported (.jsonc and .json)
- Fallback to global config in `~/.claude/` if project config not found
- TypeScript implementation
- Works with npx for easy execution

## Installation

```bash
npm install -g @koinunopochi/danger-zone-mcp
```

Or use with npx (no installation required):

```bash
npx @koinunopochi/danger-zone-mcp
```

## Configuration

Create a configuration file in your project root or home directory:

1. **Project-specific config** (highest priority):
   - `<project>/.claude/.danger-zone-exec.local.jsonc` (recommended for comments)
   - `<project>/.claude/.danger-zone-exec.local.json`

2. **Global config** (fallback):
   - `~/.claude/.danger-zone-exec.jsonc` (recommended for comments)
   - `~/.claude/.danger-zone-exec.json`

```jsonc
{
  // Safe commands that can be executed without confirmation
  "commands": [
    {
      "name": "build_project",
      "description": "Build the project",
      "command": "npm",
      "args": ["run", "build"]
    },
    {
      "name": "check_chrome_mcp",
      "description": "Check if MCP Chrome profile instances are running",
      "command": "ps aux | grep -E '(Google Chrome.*mcp-chrome-profile)' | grep -v grep | wc -l"
    }
  ],
  
  // Dangerous commands that require confirmation
  "dangerZone": [
    {
      "name": "clean_build",
      "description": "Clean all build artifacts",
      "command": "rm -rf dist"
      // Will show confirmation dialog (default behavior)
    },
    {
      "name": "kill_chrome_mcp",
      "description": "Kill all Chrome instances with MCP profile",
      "command": "pkill -f 'Google Chrome.*mcp-chrome-profile'",
      "preAuthorized": true  // Skip confirmation dialog
    }
  ]
}
```

## Usage with Claude Desktop / Claude Code

Add to your Claude configuration:

```json
{
  "mcpServers": {
    "danger-zone": {
      "command": "npx",
      "args": ["@koinunopochi/danger-zone-mcp"]
    }
  }
}
```

Note: When using Claude Code, the `cwd` is automatically set to your current project directory.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run dev
```

## Configuration Options

### Command Properties
- `name`: Tool name (used as `exec_<name>`)
- `description`: Description shown in Claude
- `command`: Shell command to execute
- `args`: Optional array of default arguments

### DangerZone Properties
- `name`: Tool name (used as `danger_<name>`)
- `description`: Description shown in Claude
- `command`: Shell command to execute
- `preAuthorized`: Skip confirmation dialog if true (optional, defaults to false)

## Safety Features

- Dangerous commands show native macOS confirmation dialog by default
- Pre-authorized commands can skip confirmation when explicitly configured
- Commands are sandboxed to configured list
- Clear separation between safe and dangerous operations