import { TerminalInfo } from '../shared/types';

export class TerminalLauncher {
  private terminals: TerminalInfo[] = [];

  constructor() {
    this.detectTerminals();
  }

  private detectTerminals(): void {
    if (process.platform === 'darwin') {
      this.terminals = [
        { id: 'terminal', name: 'Terminal', command: `osascript -e 'tell app "Terminal" to do script "$CMD"'` },
        { id: 'iterm', name: 'iTerm', command: `osascript -e 'tell app "iTerm" to tell current window to create tab with default profile command "$CMD"'` },
      ];
    } else if (process.platform === 'win32') {
      this.terminals = [
        { id: 'cmd', name: '命令提示符', command: `start cmd /k "$CMD"` },
        { id: 'powershell', name: 'PowerShell', command: `start powershell -NoExit -Command "$CMD"` },
      ];
    } else {
      this.terminals = [
        { id: 'gnome-terminal', name: 'GNOME Terminal', command: `gnome-terminal -- bash -c "$CMD; exec bash"` },
        { id: 'xterm', name: 'xterm', command: `xterm -hold -e "$CMD"` },
      ];
    }
  }

  listTerminals(): TerminalInfo[] {
    return [...this.terminals];
  }

  getTerminal(id: string): TerminalInfo | undefined {
    return this.terminals.find((t) => t.id === id);
  }
}
