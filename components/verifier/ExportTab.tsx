import {
    CheckCircle2, Database, Server, RefreshCcw, FileJson, Upload, ArrowRight, FileType
} from 'lucide-react';

interface ExportTabProps {
    exportColumns: Record<string, boolean>;
    setExportColumns: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    handleDbSave: () => void;
    handleJsonExport: () => void;
    handleHfPush: () => void;
    isUploading: boolean;
    hfRepo: string;
    setHfRepo: (value: string) => void;
    hfToken: string;
    setHfToken: (value: string) => void;
    hfFormat: 'jsonl' | 'parquet';
    setHfFormat: (value: 'jsonl' | 'parquet') => void;
}

export default function ExportTab({
    exportColumns,
    setExportColumns,
    handleDbSave,
    handleJsonExport,
    handleHfPush,
    isUploading,
    hfRepo,
    setHfRepo,
    hfToken,
    setHfToken,
    hfFormat,
    setHfFormat
}: ExportTabProps) {
    return (
        <div className="flex-1 flex flex-col gap-8 animate-in fade-in max-w-4xl mx-auto w-full">
            <div className="bg-slate-950 p-6 rounded-xl border border-slate-800">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-400" /> 1. Select Columns
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.keys(exportColumns).map(col => (
                        <label key={col} className="flex items-center gap-2 cursor-pointer group">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${exportColumns[col] ? 'bg-teal-600 border-teal-600' : 'bg-slate-900 border-slate-700 group-hover:border-slate-500'}`}>
                                {exportColumns[col] && <ArrowRight className="w-3 h-3 text-white" />}
                            </div>
                            <input
                                type="checkbox"
                                checked={exportColumns[col]}
                                onChange={e => setExportColumns(prev => ({ ...prev, [col]: e.target.checked }))}
                                className="hidden"
                            />
                            <span className="text-xs text-slate-300 font-mono">{col}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Local/DB Actions */}
                <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 flex flex-col justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                            <Database className="w-4 h-4 text-pink-400" /> 2. Save / Download
                        </h3>
                        <p className="text-xs text-slate-500 mb-6">
                            Save the curated dataset to the 'synth_final' collection or download as JSON.
                        </p>
                    </div>
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={handleDbSave}
                            disabled={isUploading}
                            className="bg-pink-600/10 hover:bg-pink-600/20 border border-pink-600/20 text-pink-400 py-2.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-2"
                        >
                            {isUploading ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                            Save to 'synth_verified'
                        </button>
                        <button
                            onClick={handleJsonExport}
                            className="bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-2"
                        >
                            <FileJson className="w-3.5 h-3.5" />
                            Download JSON
                        </button>
                    </div>
                </div>

                {/* HF Actions */}
                <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 flex flex-col justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                            <Server className="w-4 h-4 text-amber-400" /> 3. Push to HuggingFace
                        </h3>
                        <div className="space-y-3 mt-4">
                            <input
                                type="text"
                                value={hfRepo}
                                onChange={e => setHfRepo(e.target.value)}
                                placeholder="Repo ID (e.g. user/my-dataset)"
                                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-amber-500 outline-none"
                            />
                            <input
                                type="password"
                                value={hfToken}
                                onChange={e => setHfToken(e.target.value)}
                                placeholder="HF Token (Write Access)"
                                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-amber-500 outline-none"
                            />

                            <div className="pt-2">
                                <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Format</label>
                                <div className="flex bg-slate-900 border border-slate-700 rounded overflow-hidden">
                                    <button
                                        onClick={() => setHfFormat('jsonl')}
                                        className={`flex-1 py-1.5 text-[10px] font-bold ${hfFormat === 'jsonl' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
                                    >
                                        JSONL
                                    </button>
                                    <div className="w-px bg-slate-700"></div>
                                    <button
                                        onClick={() => setHfFormat('parquet')}
                                        className={`flex-1 py-1.5 text-[10px] font-bold flex items-center justify-center gap-1 ${hfFormat === 'parquet' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
                                    >
                                        <FileType className="w-3 h-3" /> Parquet
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={handleHfPush}
                        disabled={isUploading}
                        className="mt-4 bg-amber-600/10 hover:bg-amber-600/20 border border-amber-600/20 text-amber-400 py-2.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-2"
                    >
                        {isUploading ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        Push to Hub
                    </button>
                </div>
            </div>
        </div>
    );
}
