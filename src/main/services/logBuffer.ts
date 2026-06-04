const MAX_LOG_LINES = 1000;

export class LogBuffer {
  private buffer: string[] = [];

  append(line: string): void {
    this.buffer.push(line);
    if (this.buffer.length > MAX_LOG_LINES) {
      this.buffer = this.buffer.slice(-MAX_LOG_LINES);
    }
  }

  appendLines(lines: string[]): void {
    for (const line of lines) {
      this.append(line);
    }
  }

  getAll(): string[] {
    return [...this.buffer];
  }

  getTail(lines: number = 100): string[] {
    return this.buffer.slice(-lines);
  }

  clear(): void {
    this.buffer = [];
  }

  size(): number {
    return this.buffer.length;
  }
}
