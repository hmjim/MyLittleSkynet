import { Telegraf } from 'telegraf';
import { runAgent } from './agent.js';
import * as dotenv from 'dotenv';
import { initDb, saveHistory, getHistory, clearHistory } from './database.js';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token || token === 'your_token_here') {
  console.error('❌ ERROR: TELEGRAM_BOT_TOKEN is missing or is still a placeholder in .env!');
  console.error('Please get a token from @BotFather and update your .env file.');
  process.exit(1);
}

const bot = new Telegraf(token);

// Helper to split long messages and handle file uploads
async function sendLongMessage(ctx: any, text: string) {
  if (!text) return;

  // Check for the special file signal
  if (text.includes('__SEND_FILE__:')) {
    const parts = text.split('__SEND_FILE__:', 2);
    // Send the text part if any
    if (parts.length > 0 && parts[0].trim()) {
      await ctx.reply(parts[0].trim());
    }
    // Send the file
    if (parts.length > 1) {
      const filePath = parts[1].trim();
      try {
        await ctx.replyWithDocument({ source: filePath });
      } catch (err: any) {
        await ctx.reply(`Failed to send file: ${err.message}`);
      }
    }
    return;
  }

  const MAX_LENGTH = 4000;
  if (text.length <= MAX_LENGTH) {
    return ctx.reply(text);
  }

  const chunks = text.match(new RegExp(`.{1,${MAX_LENGTH}}`, 'gs')) || [];
  for (const chunk of chunks) {
    await ctx.reply(chunk);
  }
}

bot.start((ctx) => ctx.reply('Welcome! I am your OpenClaw Lite multi-modal agent (Vision + Voice). How can I help you today? \n\nCommands: \n/clear - Reset conversation history'));

bot.command('clear', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  await clearHistory(userId);
  await ctx.reply('🧼 History cleared!');
});

// Handle photos
bot.on('photo', async (ctx) => {
  await ctx.sendChatAction('typing');
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    const photos = ctx.message?.photo;
    if (!photos || photos.length === 0) return;
    
    const photo = photos[photos.length - 1];
    const link = await ctx.telegram.getFileLink(photo.file_id);
    const caption = (ctx.message && 'caption' in ctx.message ? ctx.message.caption : '') || 'Analyze this image.';
    
    const history = await getHistory(userId);
    const { response, history: newHistory } = await runAgent(caption, history, link.href) as { response: string, history: any[] };
    
    // Save last user message and agent's final response
    await saveHistory(userId, 'user', [{ type: 'text', text: caption }, { type: 'image_url', image_url: { url: link.href } }]);
    await saveHistory(userId, 'assistant', response);
    
    await sendLongMessage(ctx, response || 'I see the image but have no comments.');
  } catch (error: any) {
    console.error('Error handling photo:', error);
    await ctx.reply(`Error: ${error.message}`);
  }
});

// Handle voice messages
bot.on('voice', async (ctx) => {
  await ctx.sendChatAction('typing');
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    const voice = (ctx.message as any).voice;
    const fileId = voice.file_id;
    const link = await ctx.telegram.getFileLink(fileId);
    
    const history = await getHistory(userId);
    const prompt = `[Voice Message Received]
The user sent a voice message. Link: ${link.href}
1. Use the 'transcribe_audio' tool with this link.
2. Based on the transcription, fulfill the user's request.`;

    const { response } = await runAgent(prompt, history) as { response: string };
    
    await saveHistory(userId, 'user', prompt);
    await saveHistory(userId, 'assistant', response);
    
    await sendLongMessage(ctx, response || 'No response.');
  } catch (error: any) {
    console.error('Error handling voice:', error);
    await ctx.reply(`Error: ${error.message}`);
  }
});

bot.on('text', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  
  const text = (ctx.message as any).text;
  const history = await getHistory(userId);

  await ctx.sendChatAction('typing');

  try {
    // Wrap agent call in a timeout-aware pattern if possible, 
    // but the main issue is the process dying. 
    // We add a global uncaught exception handler below too.
    const { response } = await runAgent(text, history) as { response: string };
    
    await saveHistory(userId, 'user', text);
    await saveHistory(userId, 'assistant', response);
    
    await sendLongMessage(ctx, response || 'I processed your request but have no response.');
  } catch (error: any) {
    console.error('❌ Error running agent:', error);
    if (error.name === 'TimeoutError') {
      await ctx.reply('⚠️ Задача заняла слишком много времени (таймаут 90с). Пожалуйста, попробуйте упростить запрос или разбить его на части.');
    } else {
      await ctx.reply(`❌ Произошла ошибка при выполнении: ${error.message}`);
    }
  }
});

// CRITICAL: Prevent process crash on unhandled rejections (like Playwright timeouts)
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

initDb().then(() => {
  bot.launch().then(() => {
    console.log('Bot is running with persistent SQLite memory...');
  });
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
