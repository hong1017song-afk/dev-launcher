import OpenAI from 'openai';
import { AiSettings } from '../shared/types';

let openai: OpenAI | null = null;
let currentSettings: AiSettings | null = null;

export function initAI(settings: AiSettings): void {
  currentSettings = settings;

  const apiKey = settings.apiKey
    || (settings.provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.DEEPSEEK_API_KEY)
    || '';

  if (!apiKey) {
    throw new Error(`${settings.provider === 'openai' ? 'OPENAI_API_KEY' : 'DEEPSEEK_API_KEY'} 未配置。请在 AI 设置中填写或设置环境变量。`);
  }

  const baseURL = settings.provider === 'deepseek'
    ? 'https://api.deepseek.com'
    : undefined;

  openai = new OpenAI({ apiKey, baseURL });
}

export function getOpenAI(): OpenAI {
  if (!openai) {
    throw new Error('AI 客户端未初始化');
  }
  return openai;
}

export function getModel(): string {
  return currentSettings?.model || 'deepseek-chat';
}

export function isInitialized(): boolean {
  return openai !== null;
}
