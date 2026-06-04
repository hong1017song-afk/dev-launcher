import { DiagnoseResult } from '../shared/types';

export function createRepairPlan(diagnoseResult: DiagnoseResult): DiagnoseResult {
  const filteredActions = diagnoseResult.repairActions.filter((a) => {
    if (a.risk === 'high') return false;
    if (a.type === 'run-command') {
      const cmd = a.command || '';
      const dangerous = [
        'rm -rf',
        'git reset --hard',
        'DROP',
        'DELETE FROM',
        'truncate',
        ':(){ :|:& };:',
        'mkfs.',
        'dd if=',
      ];
      return !dangerous.some((d) => cmd.toLowerCase().includes(d.toLowerCase()));
    }
    return true;
  });

  return {
    ...diagnoseResult,
    repairActions: filteredActions,
  };
}
