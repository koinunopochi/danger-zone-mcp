#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

// 設定ファイルのスキーマ定義
const ConfigSchema = z.object({
  commands: z.array(z.object({
    name: z.string(),
    description: z.string(),
    command: z.string(),
    args: z.array(z.string()).optional(),
    confirm: z.boolean().optional(),
  })).optional(),
  dangerZone: z.array(z.object({
    name: z.string(),
    description: z.string(),
    command: z.string(),
    requiresConfirm: z.boolean().default(true),
  })).optional(),
});

type Config = z.infer<typeof ConfigSchema>;

class DangerZoneMcpServer {
  private server: Server;
  private config: Config | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'danger-zone-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private async loadConfig(): Promise<void> {
    try {
      // プロセスの実行ディレクトリから設定ファイルを探す
      const cwd = process.cwd();
      const configPath = path.join(cwd, '.claude', '.danger-zone-exec.local.json');
      
      const configData = await fs.readFile(configPath, 'utf-8');
      const rawConfig = JSON.parse(configData);
      this.config = ConfigSchema.parse(rawConfig);
      
      console.error(`Loaded config from: ${configPath}`);
    } catch (error) {
      console.error('Failed to load config:', error);
      this.config = { commands: [], dangerZone: [] };
    }
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      await this.loadConfig();
      
      const tools = [];
      
      // 通常のコマンド
      if (this.config?.commands) {
        for (const cmd of this.config.commands) {
          tools.push({
            name: `exec_${cmd.name}`,
            description: cmd.description,
            inputSchema: {
              type: 'object',
              properties: {
                args: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Additional arguments to pass to the command',
                },
              },
            },
          });
        }
      }
      
      // Danger Zoneコマンド
      if (this.config?.dangerZone) {
        for (const cmd of this.config.dangerZone) {
          tools.push({
            name: `danger_${cmd.name}`,
            description: `[DANGER ZONE] ${cmd.description}`,
            inputSchema: {
              type: 'object',
              properties: {
                confirm: {
                  type: 'boolean',
                  description: 'Must be true to execute this dangerous command',
                },
              },
              required: cmd.requiresConfirm ? ['confirm'] : [],
            },
          });
        }
      }
      
      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      await this.loadConfig();
      
      // 通常のコマンド実行
      if (name.startsWith('exec_')) {
        const cmdName = name.replace('exec_', '');
        const cmd = this.config?.commands?.find(c => c.name === cmdName);
        
        if (!cmd) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Command ${cmdName} not found`
          );
        }
        
        try {
          const cmdArgs = (args?.args as string[]) || [];
          const fullCommand = [cmd.command, ...(cmd.args || []), ...cmdArgs].join(' ');
          
          const { stdout, stderr } = await execAsync(fullCommand, {
            cwd: process.cwd(),
          });
          
          return {
            content: [
              {
                type: 'text',
                text: stdout || stderr || 'Command executed successfully',
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: 'text',
                text: `Error executing command: ${error.message}`,
              },
            ],
          };
        }
      }
      
      // Danger Zoneコマンド実行
      if (name.startsWith('danger_')) {
        const cmdName = name.replace('danger_', '');
        const cmd = this.config?.dangerZone?.find(c => c.name === cmdName);
        
        if (!cmd) {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Danger command ${cmdName} not found`
          );
        }
        
        if (cmd.requiresConfirm && args?.confirm !== true) {
          return {
            content: [
              {
                type: 'text',
                text: 'This is a dangerous command. Please confirm by setting confirm: true',
              },
            ],
          };
        }
        
        try {
          const { stdout, stderr } = await execAsync(cmd.command, {
            cwd: process.cwd(),
          });
          
          return {
            content: [
              {
                type: 'text',
                text: stdout || stderr || 'Danger command executed successfully',
              },
            ],
          };
        } catch (error: any) {
          return {
            content: [
              {
                type: 'text',
                text: `Error executing danger command: ${error.message}`,
              },
            ],
          };
        }
      }
      
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      );
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Danger Zone MCP server running');
  }
}

const server = new DangerZoneMcpServer();
server.run().catch(console.error);