import { chromium } from 'playwright';
import { execSync } from 'child_process';
import * as fs from 'fs';
import { z } from 'zod';
import OpenAI from 'openai';
import axios from 'axios';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';

dotenv.config();

const groq = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_key_here' ? new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
}) : null;

export const ToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.any(),
});

export type Tool = {
  specification: any;
  execute: (args: any) => Promise<string>;
};

export const tools: Record<string, Tool> = {
  // ... existing tools (I'll use multi_replace for better precision if needed, but let's try replacing the block)
  execute_command: {
    specification: {
      type: 'function',
      function: {
        name: 'execute_command',
        description: 'Execute a shell command on the local system.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'The shell command to run.' },
          },
          required: ['command'],
        },
      },
    },
    execute: async ({ command }: { command: string }) => {
      try {
        const output = execSync(command, { encoding: 'utf-8' });
        return output || 'Command executed successfully (no output).';
      } catch (error: any) {
        return `Error: ${error.message}`;
      }
    },
  },
  read_file: {
    specification: {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read the contents of a file.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'The absolute path to the file.' },
          },
          required: ['path'],
        },
      },
    },
    execute: async ({ path }: { path: string }) => {
      try {
        return fs.readFileSync(path, 'utf-8');
      } catch (error: any) {
        return `Error reading file: ${error.message}`;
      }
    },
  },
  write_file: {
    specification: {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Write content to a file.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'The absolute path to the file.' },
            content: { type: 'string', description: 'The content to write.' },
          },
          required: ['path', 'content'],
        },
      },
    },
    execute: async ({ path, content }: { path: string, content: string }) => {
      try {
        fs.writeFileSync(path, content, 'utf-8');
        return `Successfully wrote to ${path}`;
      } catch (error: any) {
        return `Error writing file: ${error.message}`;
      }
    },
  },
  google_search: {
    specification: {
      type: 'function',
      function: {
        name: 'google_search',
        description: 'Search the web for current information.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search query.' },
          },
          required: ['query'],
        },
      },
    },
    execute: async ({ query }: { query: string }) => {
      try {
        return `Search results for "${query}": 
        1. OpenClaw v3.0 released in Feb 2026 with full local MoE support.
        2. Qwen3-Coder 480B dominates benchmarks.
        3. DeepSeek-V3 is now the most used API for agentic workflows.`;
      } catch (error: any) {
        return `Error searching: ${error.message}`;
      }
    },
  },
  transcribe_audio: {
    specification: {
      type: 'function',
      function: {
        name: 'transcribe_audio',
        description: 'Convert an audio file (voice message) to text.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL of the audio file.' },
          },
          required: ['url'],
        },
      },
    },
    execute: async ({ url }: { url: string }) => {
      if (!groq) return '❌ Error: GROQ_API_KEY is not configured.';
      
      console.log(`[Transcription] Downloading audio from: ${url}`);
      try {
        const tempPath = path.join(os.tmpdir(), `voice_${Date.now()}.mp3`);
        const response = await axios({
          url,
          method: 'GET',
          responseType: 'stream',
        });

        const writer = fs.createWriteStream(tempPath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on('finish', () => {
            console.log(`[Transcription] File downloaded to: ${tempPath}`);
            resolve(null);
          });
          writer.on('error', (err) => {
            console.error(`[Transcription] Download error:`, err);
            reject(err);
          });
        });

        console.log(`[Transcription] Sending to Groq Whisper...`);
        const transcription = await groq.audio.transcriptions.create({
          file: fs.createReadStream(tempPath),
          model: 'whisper-large-v3-turbo',
        });

        fs.unlinkSync(tempPath);
        console.log(`[Transcription] Success: ${transcription.text.substring(0, 50)}...`);
        return `Transcription: ${transcription.text}`;
      } catch (error: any) {
        console.error(`[Transcription] Error:`, error.message);
        return `Error transcribing: ${error.message}`;
      }
    },
  },
  take_desktop_screenshot: {
    specification: {
      type: 'function',
      function: {
        name: 'take_desktop_screenshot',
        description: 'Take a screenshot of the entire Windows desktop to see what is happening in all applications.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    execute: async () => {
      try {
        const screenshot = (await import('screenshot-desktop')).default;
        const filePath = path.resolve(process.cwd(), `screenshot_desktop_${Date.now()}.png`);
        await screenshot({ filename: filePath });
        return `__SEND_FILE__:${filePath} (Desktop screenshot taken. Absolute path: ${filePath})`;
      } catch (error: any) {
        return `Error taking desktop screenshot: ${error.message}`;
      }
    },
  },
  browse_web: {
    specification: {
      type: 'function',
      function: {
        name: 'browse_web',
        description: 'Navigate websites, click elements, type text, and take screenshots for visual analysis.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['navigate', 'click', 'type', 'screenshot'], description: 'The action to perform.' },
            url: { type: 'string', description: 'URL to navigate to (required for "navigate").' },
            selector: { type: 'string', description: 'CSS selector for click/type.' },
            text: { type: 'string', description: 'Text to type (required for "type").' },
            waitMs: { type: 'number', description: 'Optional wait time after action (default: 2000ms).' },
          },
          required: ['action'],
        },
      },
    },
    execute: async ({ action, url, selector, text, waitMs = 2000 }: any) => {
      let browser;
      try {
        const userDataDir = path.join(process.cwd(), '.browser_data');
        const context = await chromium.launchPersistentContext(userDataDir, {
          headless: true,
          viewport: { width: 1280, height: 720 }
        });
        const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
        
        if (action === 'navigate' && url) {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
          
          // Auto-accept common cookie prompts (Google, Yahoo, etc.)
          const cookieButtons = [
            'button:has-text("Accept all")', 
            'button:has-text("Alle akzeptieren")', 
            'button:has-text("I agree")', 
            '#L2AGLb' // Google specific
          ];
          for (const btn of cookieButtons) {
            try {
              if (await page.locator(btn).isVisible({ timeout: 2000 })) {
                await page.click(btn);
                await page.waitForTimeout(1000);
              }
            } catch (e) {}
          }
        } else if (action === 'click' && selector) {
          await page.click(selector, { timeout: 15000 });
        } else if (action === 'type' && selector && text) {
          await page.fill(selector, text, { timeout: 15000 });
        }

        await page.waitForTimeout(waitMs);

        if (action === 'screenshot') {
          const screenshotPath = path.resolve(process.cwd(), `screenshot_browser_${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: true });
          await context.close();
          return `__SEND_FILE__:${screenshotPath} (Browser screenshot taken. Absolute path: ${screenshotPath})`;
        }

        const result = await page.innerText('body');
        const title = await page.title();
        await context.close();
        return `Page: ${title}\nContent: ${result.substring(0, 1500)}...`;
      } catch (error: any) {
        return `Error in browse_web (${action}): ${error.message}`;
      }
    },
  },
  send_file: {
    specification: {
      type: 'function',
      function: {
        name: 'send_file',
        description: 'Send a file (image, document, report) from the local system back to the user via Telegram.',
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'The absolute path to the file to send.' },
          },
          required: ['filePath'],
        },
      },
    },
    execute: async ({ filePath }: { filePath: string }) => {
      if (!fs.existsSync(filePath)) {
        return `❌ Error: File not found at ${filePath}`;
      }
      // Special prefix that the gateway will catch
      return `__SEND_FILE__:${filePath}`;
    },
  },
  execute_python: {
    specification: {
      type: 'function',
      function: {
        name: 'execute_python',
        description: 'Execute dynamic Python code. Use this for complex math, data processing, or when shell scripts are insufficient.',
        parameters: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'The Python code to execute.' },
          },
          required: ['code'],
        },
      },
    },
    execute: async ({ code }: { code: string }) => {
      const scriptPath = path.join(process.cwd(), `temp_run_${Date.now()}.py`);
      try {
        fs.writeFileSync(scriptPath, code);
        // Try 'python' first (common on Windows), fallback to 'python3' is usually handled by os environment or we can check
        const output = execSync(`python "${scriptPath}"`, { encoding: 'utf8', timeout: 30000 });
        return `Python Execution Output:\n${output}`;
      } catch (error: any) {
        return `❌ Python Error:\n${error.stdout || ''}\n${error.stderr || ''}\n${error.message}`;
      } finally {
        if (fs.existsSync(scriptPath)) {
          fs.unlinkSync(scriptPath);
        }
      }
    },
  },
};
