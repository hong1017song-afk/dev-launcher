import { execFileSync } from 'child_process';

let cachedLoginEnv: Record<string, string> | undefined;

const fallbackPath = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
].join(':');

export function buildShellEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const loginEnv = getLoginShellEnv();
  const pathValue = [
    overrides.PATH,
    loginEnv.PATH,
    process.env.PATH,
    fallbackPath,
  ].filter(Boolean).join(':');

  return {
    ...process.env,
    ...loginEnv,
    ...overrides,
    PATH: pathValue,
  };
}

function getLoginShellEnv(): Record<string, string> {
  if (cachedLoginEnv) return cachedLoginEnv;

  cachedLoginEnv = {};

  if (process.platform === 'win32') {
    return cachedLoginEnv;
  }

  const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');

  try {
    const output = execFileSync(shell, ['-lc', 'env -0'], {
      encoding: 'utf8',
      timeout: 3000,
      env: process.env,
    });

    for (const entry of output.split('\0')) {
      if (!entry) continue;
      const index = entry.indexOf('=');
      if (index <= 0) continue;
      cachedLoginEnv[entry.slice(0, index)] = entry.slice(index + 1);
    }
  } catch {
    // Keep the fallback PATH when shell startup files cannot be loaded.
  }

  return cachedLoginEnv;
}
