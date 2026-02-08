import { Cpu, Beaker, ShieldCheck, Laptop, Cloud, Download, Settings } from 'lucide-react';
import { AppView, Environment } from '../../interfaces/enums';

interface AppNavbarProps {
  appView: AppView;
  environment: Environment;
  totalLogCount: number;
  onViewChange: (view: AppView) => void;
  onEnvironmentChange: (env: Environment) => void;
  onExport: () => void;
  onSettingsOpen: () => void;
}

export default function AppNavbar({
  appView,
  environment,
  totalLogCount,
  onViewChange,
  onEnvironmentChange,
  onExport,
  onSettingsOpen
}: AppNavbarProps) {
  return (
    <header
      className={`sticky top-0 z-20 backdrop-blur border-b transition-colors duration-300 ${environment === Environment.Production
          ? 'bg-slate-950/80 border-slate-800/70'
          : 'bg-slate-950/80 border-slate-800/70'
        }`}
    >
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(79,70,229,0.4)] ${'bg-sky-600'
                }`}
            >
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div onClick={() => window.location.href = '/'} className="cursor-pointer">
              <h1 className="font-bold text-lg text-white tracking-tight">
                SYNTH<span className="text-slate-400 font-light">LABS</span>
              </h1>
            </div>
          </div>

          {/* Main View Switcher */}
          <div className="hidden md:flex bg-slate-950/70 p-1 rounded-lg border border-slate-800/70">
            <button
              onClick={() => onViewChange(AppView.Creator)}
              className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${appView === AppView.Creator
                  ? 'bg-slate-100 text-slate-900 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900/60'
                }`}
            >
              <Beaker className="w-3.5 h-3.5" /> Creator
            </button>
            <button
              onClick={() => onViewChange(AppView.Verifier)}
              className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${appView === AppView.Verifier
                  ? 'bg-slate-100 text-slate-900 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900/60'
                }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Verifier
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Environment Toggle */}
          <div className="bg-slate-950/70 rounded-full p-1 border border-slate-800/70 flex items-center relative">
            <button
              onClick={() => onEnvironmentChange(Environment.Development)}
              className={`relative z-10 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all ${environment === Environment.Development
                  ? 'bg-slate-100 text-slate-900 shadow-sm'
                  : 'text-slate-400 hover:text-white'
                }`}
            >
              <Laptop className="w-3 h-3" /> Dev
            </button>
            <button
              onClick={() => onEnvironmentChange(Environment.Production)}
              className={`relative z-10 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all ${environment === Environment.Production
                  ? 'bg-slate-100 text-slate-900 shadow-sm'
                  : 'text-slate-400 hover:text-white'
                }`}
            >
              <Cloud className="w-3 h-3" /> Prod
            </button>
          </div>

          {/* Export Button (Creator Mode Only) */}
          {appView === AppView.Creator && (
            <>
              <div className="hidden sm:flex flex-col items-end text-xs">
                <span className="text-slate-300">Generated Items</span>
                <span className="font-mono text-sky-400 font-bold text-lg leading-none">{totalLogCount}</span>
              </div>
              <button
                onClick={onExport}
                disabled={totalLogCount === 0}
                className="bg-slate-900/60 hover:bg-slate-800/70 border border-slate-800/70 text-slate-100 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Download className="w-4 h-4" /> Export
              </button>
            </>
          )}

          {/* Settings Button */}
          <button
            onClick={onSettingsOpen}
            className="bg-slate-900/60 hover:bg-slate-800/70 border border-slate-800/70 text-slate-300 hover:text-white p-2 rounded-lg transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
