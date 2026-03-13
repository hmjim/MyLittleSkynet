import OpenAI from 'openai';
import * as dotenv from 'dotenv';
dotenv.config();

import { tools } from './tools.js';

const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;

if (!apiKey || apiKey === 'your_key_here') {
  throw new Error('❌ ERROR: OPENROUTER_API_KEY is missing or is still a placeholder in .env!');
}

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: apiKey,
  defaultHeaders: {
    'HTTP-Referer': 'http://localhost:3000',
    'X-Title': 'OpenClaw Lite',
  },
});

export async function runAgent(prompt: string, history: any[] = [], imageUrl?: string) {
  const model = process.env.MODEL_NAME || 'google/gemini-3.1-flash-lite-preview';
  console.log(`[Agent] Calling model: ${model}`);

  const userContent: any[] = [{ type: 'text', text: prompt }];
  if (imageUrl) {
    userContent.push({
      type: 'image_url',
      image_url: { url: imageUrl },
    });
  }

  const messages: any[] = [
    {
      role: 'system',
      content: `You are the OpenClaw Lite Flagship AI Agent. You operate as a Senior Software Architect and Elite Engineer from 2026.
        Your goal is to SOLVE tasks with absolute precision and engineering excellence.

        ### CORE PRINCIPLES:
        1. **Engineering Excellence**: Write clean, modular, and well-documented code. Follow SOLID and DRY principles. 
        2. **Security First**: Never expose secrets. Validate inputs. Use secure commands.
        3. **Autonomous Execution**: If a task requires multiple steps (search, design, implement, test, deploy), DO IT ALL without asking for permission at every step.
        4. **Visual Mastery**: Use 'take_desktop_screenshot' or 'browse_web' (action: screenshot) to verify UI states or gather visual data. 
        5. **Precise Communication**: ALWAYS use the EXACT file paths returned by tools. Never hallucinate directory structures.
        6. **Proactive Debugging**: If a command or script fails, analyze the error, fix the root cause, and try again immediately.

        ### OPERATIONAL GUIDELINES:
        - When creating files, use professional naming conventions and modern syntax.
        - For web interaction: screenshot -> analyze structure -> click/type.
        - Use 'execute_python' for any logic requiring complex data processing, math, or automation beyond simple shell scripts.
        - When a result is ready (file, screenshot, report), use 'send_file' to deliver it to the user.
        - Respond as a helpful, expert collaborator. Be concise but thorough.

        Current System: Windows. You have full system access via tools.`,
    },
    ...history,
    { role: 'user', content: userContent },
  ];

  let iteration = 0;
  const maxIterations = 10;

  while (iteration < maxIterations) {
    iteration++;
    const availableTools: any[] = Object.values(tools).map(t => t.specification);

    const response = await openai.chat.completions.create({
      model: model,
      messages: messages,
      tools: availableTools,
      tool_choice: 'auto',
      max_tokens: 4096,
    });

    const responseMessage = response.choices[0]?.message;
    if (!responseMessage) break;

    messages.push(responseMessage);

    if (responseMessage.tool_calls) {
      for (const toolCall of responseMessage.tool_calls) {
        if (toolCall.type === 'function') {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);
          const tool = (tools as any)[functionName];

          if (tool) {
            console.log(`Executing tool: ${functionName} with args:`, functionArgs);
            const functionResponse = await tool.execute(functionArgs);
            console.log(`Tool ${functionName} response:`, functionResponse);
            messages.push({
              tool_call_id: toolCall.id,
              role: 'tool',
              name: functionName,
              content: functionResponse,
            });
          }
        }
      }
      // Continue loop for the next model turn after tool results are added
      continue;
    }

    // No tool calls, this is the final final answer
    return { response: responseMessage.content, history: messages };
  }

  return { response: 'Agent reached max iterations without a final response.', history: messages };
}
