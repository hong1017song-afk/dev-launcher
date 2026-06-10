import { DiagnoseResult } from '../shared/types';

const DANGEROUS_PATTERNS = [
  'rm -rf',
  'rm -r',
  'git reset --hard',
  'git push --force',
  'DROP ',
  'DELETE FROM',
  'truncate',
  ':(){ :|:& };:',
  'mkfs.',
  'dd if=',
  '> /dev/',
  'chmod 777',
  'sudo ',
  'shutdown',
  'reboot',
  'format ',
  'fdisk',
  'wget ',
  'curl.*|.*sh',
];

const SAFE_PKG_COMMANDS = [
  'npm install',
  'npm i ',
  'pnpm install',
  'pnpm add',
  'yarn install',
  'yarn add',
  'pip install',
  'pip3 install',
  'brew install',
  'cargo install',
  'cargo build',
  'go install',
  'go build',
  'npm run ',
  'pnpm run ',
  'yarn run ',
  'npm test',
  'pnpm test',
  'npx ',
  'pnpm dlx',
];

function isDangerous(command: string): boolean {
  const lower = command.toLowerCase();
  return DANGEROUS_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

function isSafeOrPkgCommand(command: string): boolean {
  const lower = command.toLowerCase().trim();
  return SAFE_PKG_COMMANDS.some((p) => lower.startsWith(p.toLowerCase()));
}

function validateCwd(cwd: string | undefined, serviceCwd: string): boolean {
  if (!cwd) return false;
  const resolved = cwd.replace(/\/$/, '');
  const serviceResolved = serviceCwd.replace(/\/$/, '');
  return resolved === serviceResolved || resolved.startsWith(serviceResolved + '/');
}

export function createRepairPlan(diagnoseResult: DiagnoseResult): DiagnoseResult {
  const filteredActions = diagnoseResult.repairActions.filter((a) => {
    if (a.risk === 'high') return false;

    if (a.type === 'run-command') {
      const cmd = a.command || '';
      if (!cmd.trim()) return false;
      if (isDangerous(cmd)) return false;
      if (!isSafeOrPkgCommand(cmd)) return false;
    }

    if (a.type === 'edit-file') {
      return false;
    }

    return true;
  });

  return { ...diagnoseResult, repairActions: filteredActions };
}
