import { useMemo } from 'react';
import { SynthLogItem } from '../types';
import { Clock, Zap, FileText, Activity, BarChart3, PieChart } from 'lucide-react';

interface AnalyticsDashboardProps {
  logs: SynthLogItem[];
}

interface DashboardStats {
  totalRequests: number;
  avgLatency: number;
  avgTps: number;
  avgTokens: number;
  providerCounts: Record<string, number>;
  latencyBuckets: number[];
}

export default function AnalyticsDashboard({ logs }: AnalyticsDashboardProps) {
  const stats = useMemo<DashboardStats | null>(() => {
    if (logs.length === 0) return null;

    // 1. Calculate Total Requests (counting sub-requests for Deep Mode)
    let totalRequests = 0;
    logs.forEach(log => {
      if (log.deepTrace && Object.keys(log.deepTrace).length > 0) {
        // In Deep Mode, each phase in the trace counts as a request
        totalRequests += Object.keys(log.deepTrace).length;
      } else {
        // Regular mode is 1 request per log item
        totalRequests += 1;
      }
    });

    const totalDuration = logs.reduce((acc, log) => acc + (log.duration || 0), 0);
    const totalTokens = logs.reduce((acc, log) => acc + (log.tokenCount || 0), 0);
    
    // TPS Calculation (Total Tokens / Total Duration in Seconds)
    // Avoid division by zero
    const avgTps = totalDuration > 0 ? (totalTokens / (totalDuration / 1000)) : 0;
    
    const avgLatency = logs.length > 0 ? totalDuration / logs.length : 0;
    const avgTokens = logs.length > 0 ? totalTokens / logs.length : 0;

    // Distrubution by Provider
    const providerCounts: Record<string, number> = {};
    logs.forEach(l => {
        const p = l.modelUsed || 'Unknown';
        providerCounts[p] = (providerCounts[p] || 0) + 1;
    });

    // Latency Distribution (Buckets)
    const latencyBuckets = [0, 0, 0, 0, 0]; // <1s, 1-3s, 3-5s, 5-10s, >10s
    logs.forEach(l => {
        const s = (Number(l.duration) || 0) / 1000;
        if (s < 1) latencyBuckets[0]++;
        else if (s < 3) latencyBuckets[1]++;
        else if (s < 5) latencyBuckets[2]++;
        else if (s < 10) latencyBuckets[3]++;
        else latencyBuckets[4]++;
    });

    return {
        totalRequests,
        avgLatency,
        avgTps,
        avgTokens,
        providerCounts,
        latencyBuckets
    };
  }, [logs]);

  if (!stats) {
      return (
          <div className="h-96 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/30">
              <BarChart3 className="w-12 h-12 mb-4 opacity-50" />
              <p>No data available for analytics yet.</p>
              <p className="text-xs">Start generation to see metrics.</p>
          </div>
      );
  }

  // Simple Max value for charts scaling
  const maxBucket = Math.max(...stats.latencyBuckets);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <div className="flex items-center gap-2 text-slate-500 mb-2">
                    <Activity className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold uppercase">Throughput</span>
                </div>
                <div className="text-2xl font-mono font-bold text-white">
                    {stats.avgTps.toFixed(1)} <span className="text-sm text-slate-600 font-sans">tok/s</span>
                </div>
            </div>
            
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <div className="flex items-center gap-2 text-slate-500 mb-2">
                    <Clock className="w-4 h-4 text-pink-400" />
                    <span className="text-xs font-bold uppercase">Avg Latency</span>
                </div>
                <div className="text-2xl font-mono font-bold text-white">
                    {(stats.avgLatency / 1000).toFixed(2)} <span className="text-sm text-slate-600 font-sans">s</span>
                </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <div className="flex items-center gap-2 text-slate-500 mb-2">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold uppercase">Avg Tokens</span>
                </div>
                <div className="text-2xl font-mono font-bold text-white">
                    {Math.round(stats.avgTokens)} <span className="text-sm text-slate-600 font-sans">/gen</span>
                </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <div className="flex items-center gap-2 text-slate-500 mb-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold uppercase">Total API Req</span>
                </div>
                <div className="text-2xl font-mono font-bold text-white">
                    {stats.totalRequests}
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Latency Distribution Chart */}
            <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-xl flex flex-col h-80">
                <h3 className="text-sm font-bold text-slate-400 uppercase mb-6 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" /> Latency Distribution
                </h3>
                {/* 
                   Fix: Removed 'items-end' from parent container and used 'h-full flex-col justify-end' on children.
                   This ensures the % height of the bar is calculated relative to the available vertical space correctly.
                */}
                <div className="flex justify-between gap-2 flex-1 items-end">
                    {['<1s', '1-3s', '3-5s', '5-10s', '>10s'].map((label, i) => {
                        const count = stats.latencyBuckets[i];
                        const height = maxBucket > 0 ? (count / maxBucket) * 100 : 0;
                        return (
                            <div key={label} className="flex-1 flex flex-col justify-end items-center group h-full">
                                <div className="w-full bg-slate-800 rounded-t relative hover:bg-slate-700 transition-colors flex items-end justify-center" style={{ height: `${height}%`, minHeight: count > 0 ? '4px' : '0' }}>
                                    <span className="absolute -top-6 text-xs font-mono text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                        {count}
                                    </span>
                                </div>
                                <span className="text-[10px] text-slate-500 mt-2 font-mono h-4">{label}</span>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Provider Breakdown */}
            <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-xl h-80 overflow-y-auto">
                <h3 className="text-sm font-bold text-slate-400 uppercase mb-4 flex items-center gap-2">
                    <PieChart className="w-4 h-4" /> Model Distribution
                </h3>
                <div className="space-y-3">
                    {(Object.entries(stats.providerCounts) as [string, number][]).sort((a,b) => b[1] - a[1]).map(([model, count]) => (
                        <div key={model} className="group">
                            <div className="flex justify-between text-xs mb-1">
                                <span className="text-slate-300 font-medium">{model}</span>
                                <span className="text-slate-500 font-mono">{count} ({Math.round(count / logs.length * 100)}%)</span>
                            </div>
                            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-indigo-500 group-hover:bg-indigo-400 transition-all" 
                                    style={{ width: `${(count / logs.length) * 100}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
  );
}
