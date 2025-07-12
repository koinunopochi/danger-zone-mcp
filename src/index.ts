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
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as readline from 'readline';
import { parse as parseJSONC } from 'jsonc-parser';

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
    preAuthorized: z.boolean().optional().default(false),
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
    const localConfigFileNames = [
      '.danger-zone-exec.local.jsonc',
      '.danger-zone-exec.local.json'
    ];
    
    const globalConfigFileNames = [
      '.danger-zone-exec.jsonc',
      '.danger-zone-exec.json'
    ];
    
    try {
      // まずプロセスの実行ディレクトリから設定ファイルを探す
      const cwd = process.cwd();
      
      for (const fileName of localConfigFileNames) {
        const localConfigPath = path.join(cwd, '.claude', fileName);
        try {
          const configData = await fs.readFile(localConfigPath, 'utf-8');
          const rawConfig = parseJSONC(configData);
          this.config = ConfigSchema.parse(rawConfig);
          console.error(`Loaded config from: ${localConfigPath}`);
          return;
        } catch (localError) {
          // このファイルが見つからない場合は次を試す
        }
      }
      
      // ローカル設定が見つからない場合、ホームディレクトリを確認
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      
      for (const fileName of globalConfigFileNames) {
        const globalConfigPath = path.join(homeDir, '.claude', fileName);
        try {
          const configData = await fs.readFile(globalConfigPath, 'utf-8');
          const rawConfig = parseJSONC(configData);
          this.config = ConfigSchema.parse(rawConfig);
          console.error(`Loaded config from: ${globalConfigPath}`);
          return;
        } catch (globalError) {
          // このファイルが見つからない場合は次を試す
        }
      }
      
      console.error('No config found in project or home directory');
    } catch (error) {
      console.error('Failed to load config:', error);
    }
    
    this.config = { commands: [], dangerZone: [] };
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      await this.loadConfig();
      
      const tools = [];
      
      // 通常のコマンド
      if (this.config?.commands) {
        for (const cmd of this.config.commands) {
          tools.push({
            name: cmd.name,
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
            name: cmd.name,
            description: `[DANGER ZONE] ${cmd.description}`,
            inputSchema: {
              type: 'object',
              properties: {
                confirm: {
                  type: 'boolean',
                  description: 'Must be true to execute this dangerous command',
                },
              },
              required: ['confirm'],
            },
          });
        }
      }
      
      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      await this.loadConfig();
      
      // 通常のコマンドを探す
      const cmd = this.config?.commands?.find(c => c.name === name);
      if (cmd) {
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
      
      // Danger Zoneコマンドを探す
      const dangerCmd = this.config?.dangerZone?.find(c => c.name === name);
      if (dangerCmd) {
        if (!dangerCmd.preAuthorized) {
          // 事前許可がない場合のみ、インタラクティブな確認プロンプトを表示
          const confirmed = await this.promptConfirmation(dangerCmd);
          
          if (!confirmed) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Command execution cancelled by user',
                },
              ],
            };
          }
        }
        
        try {
          const { stdout, stderr } = await execAsync(dangerCmd.command, {
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

  private async promptConfirmation(cmd: any): Promise<boolean> {
    return new Promise((resolve) => {
      // AppleScriptを使用してmacOSのダイアログを表示
      const script = `
        display dialog "⚠️ DANGER ZONE ⚠️\\n\\nYou are about to execute:\\n${cmd.command}\\n\\n${cmd.description}\\n\\nAre you sure you want to continue?" ¬
          buttons {"Cancel", "Execute"} ¬
          default button "Cancel" ¬
          cancel button "Cancel" ¬
          with icon caution ¬
          with title "Danger Zone Confirmation"
      `;
      
      const osascript = spawn('osascript', ['-e', script]);
      
      osascript.on('close', (code) => {
        // code 0 = Execute was clicked
        // code 1 = Cancel was clicked or dialog was closed
        resolve(code === 0);
      });
      
      osascript.on('error', (err) => {
        console.error('Failed to show confirmation dialog:', err);
        resolve(false);
      });
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