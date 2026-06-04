import { BrowserInfo } from '../shared/types';

export class BrowserLauncher {
  private browsers: BrowserInfo[] = [];

  constructor() {
    this.detectBrowsers();
  }

  private detectBrowsers(): void {
    if (process.platform === 'darwin') {
      this.browsers = [
        { id: 'default', name: '系统默认浏览器' },
        { id: 'safari', name: 'Safari' },
        { id: 'google chrome', name: 'Google Chrome' },
        { id: 'firefox', name: 'Firefox' },
        { id: 'microsoft edge', name: 'Microsoft Edge' },
      ];
    } else if (process.platform === 'win32') {
      this.browsers = [
        { id: 'default', name: '系统默认浏览器' },
        { id: 'chrome', name: 'Google Chrome', path: 'chrome' },
        { id: 'firefox', name: 'Firefox', path: 'firefox' },
        { id: 'edge', name: 'Microsoft Edge', path: 'msedge' },
      ];
    } else {
      this.browsers = [
        { id: 'default', name: '系统默认浏览器' },
        { id: 'google-chrome', name: 'Google Chrome', path: 'google-chrome' },
        { id: 'firefox', name: 'Firefox', path: 'firefox' },
      ];
    }
  }

  listBrowsers(): BrowserInfo[] {
    return [...this.browsers];
  }

  getBrowser(id: string): BrowserInfo | undefined {
    return this.browsers.find((b) => b.id === id);
  }
}
