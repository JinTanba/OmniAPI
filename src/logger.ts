// API Usage Logger
export interface APILog {
  timestamp: string;
  method: string;
  path: string;
  rapidapiHost: string;
  rapidapiPath: string;
  price: string;
  status: number;
  durationMs: number;
  userAgent?: string;
}

class UsageLogger {
  private logs: APILog[] = [];
  private maxLogs = 1000;

  log(entry: Omit<APILog, 'timestamp'>) {
    const log: APILog = {
      ...entry,
      timestamp: new Date().toISOString(),
    };
    this.logs.unshift(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
  }

  getLogs(limit = 100): APILog[] {
    return this.logs.slice(0, limit);
  }

  getStats() {
    const byEndpoint: Record<string, { count: number; totalCost: number }> = {};
    const byHost: Record<string, { count: number; totalCost: number }> = {};
    
    let totalRequests = this.logs.length;
    let totalCost = 0;

    for (const log of this.logs) {
      const cost = parseFloat(log.price.replace('$', '')) || 0;
      totalCost += cost;

      // By endpoint
      const key = `${log.method} ${log.path}`;
      if (!byEndpoint[key]) {
        byEndpoint[key] = { count: 0, totalCost: 0 };
      }
      byEndpoint[key].count++;
      byEndpoint[key].totalCost += cost;

      // By host
      if (!byHost[log.rapidapiHost]) {
        byHost[log.rapidapiHost] = { count: 0, totalCost: 0 };
      }
      byHost[log.rapidapiHost].count++;
      byHost[log.rapidapiHost].totalCost += cost;
    }

    return {
      totalRequests,
      totalCost: totalCost.toFixed(4),
      byEndpoint: Object.entries(byEndpoint)
        .map(([key, val]) => ({ endpoint: key, ...val }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      byHost: Object.entries(byHost)
        .map(([key, val]) => ({ host: key, ...val }))
        .sort((a, b) => b.count - a.count),
    };
  }

  clear() {
    this.logs = [];
  }
}

export const usageLogger = new UsageLogger();
