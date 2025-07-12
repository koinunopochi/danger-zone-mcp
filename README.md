# Danger Zone MCP

A Model Context Protocol (MCP) server that allows executing predefined commands with safety checks.

## Features

- Execute safe commands from configuration
- Execute dangerous commands with confirmation
- Reads configuration from `.claude/.danger-zone-exec.local.json`
- TypeScript implementation
- Works with npx for easy execution

## Installation

```bash
npm install -g @danger-zone/mcp
```

Or use with npx (no installation required):

```bash
npx @danger-zone/mcp
```

## Configuration

Create a `.claude/.danger-zone-exec.local.json` file in your project root:

```json
{
  "commands": [
    {
      "name": "build",
      "description": "Build the project",
      "command": "npm",
      "args": ["run", "build"]
    }
  ],
  "dangerZone": [
    {
      "name": "clean",
      "description": "Clean all build artifacts",
      "command": "rm -rf dist",
      "requiresConfirm": true
    }
  ]
}
```

## Usage with Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "danger-zone": {
      "command": "npx",
      "args": ["@danger-zone/mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run in development mode
npm run dev
```

## Safety Features

- Dangerous commands require explicit confirmation
- Commands are sandboxed to configured list
- Clear separation between safe and dangerous operations