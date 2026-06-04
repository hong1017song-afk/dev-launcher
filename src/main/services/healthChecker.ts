import http from 'http';

export class HealthChecker {
  async check(url: string, timeoutMs: number = 5000): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(url, { timeout: timeoutMs }, (res) => {
        const isOk = res.statusCode !== undefined && res.statusCode < 500;
        res.resume();
        resolve(isOk);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  async waitForHealthy(url: string, maxRetries: number = 30, intervalMs: number = 1000): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      const healthy = await this.check(url);
      if (healthy) return true;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
  }
}
