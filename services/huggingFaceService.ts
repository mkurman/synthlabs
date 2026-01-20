
import { HuggingFaceConfig } from "../types";
import { createRepo, uploadFile } from "@huggingface/hub";
import { logger } from '../utils/logger';

const MAX_BATCH_SIZE = 100;
const MAX_CONCURRENT_FETCHES = 3;

export const searchDatasets = async (query: string): Promise<string[]> => {
    if (!query || query.length < 2) return [];
    try {
        const res = await fetch(`https://huggingface.co/api/datasets?search=${encodeURIComponent(query)}&limit=5&sort=downloads&direction=-1`);
        if (!res.ok) return [];
        const data = await res.json();
        return data.map((d: any) => d.id);
    } catch (e) {
        console.error("HF Search Error", e);
        return [];
    }
};

export const getDatasetStructure = async (dataset: string): Promise<{ configs: string[], splits: Record<string, string[]> }> => {
    try {
        const res = await fetch(`https://datasets-server.huggingface.co/splits?dataset=${dataset}`);
        if (!res.ok) return { configs: [], splits: {} };
        const data = await res.json();

        const configMap: Record<string, string[]> = {};
        if (data.splits) {
            data.splits.forEach((item: any) => {
                if (!configMap[item.config]) configMap[item.config] = [];
                configMap[item.config].push(item.split);
            });
        }
        return {
            configs: Object.keys(configMap),
            splits: configMap
        };
    } catch (e) {
        console.error("HF Structure failed", e);
        return { configs: [], splits: {} };
    }
};

export interface DatasetInfo {
    totalRows: number;
    features: string[];
}

export const getDatasetInfo = async (
    dataset: string,
    config: string,
    split: string
): Promise<DatasetInfo> => {
    try {
        const url = `https://datasets-server.huggingface.co/info?dataset=${dataset}&config=${config}`;
        const res = await fetch(url);
        if (!res.ok) return { totalRows: 0, features: [] };
        const data = await res.json();

        const splitInfo = data.dataset_info?.splits?.[split];
        const features = Object.keys(data.dataset_info?.features || {});

        return {
            totalRows: splitInfo?.num_examples || 0,
            features
        };
    } catch (e) {
        console.error("HF Info failed", e);
        return { totalRows: 0, features: [] };
    }
};

export const fetchHuggingFaceRows = async (
    hfConfig: HuggingFaceConfig,
    offset: number,
    length: number
): Promise<any[]> => {
    const batchConfigs = [];
    let currentOffset = offset;
    let remaining = length;

    while (remaining > 0) {
        const batchSize = Math.min(remaining, MAX_BATCH_SIZE);
        batchConfigs.push({ offset: currentOffset, length: batchSize });
        currentOffset += batchSize;
        remaining -= batchSize;
    }

    const results: any[][] = new Array(batchConfigs.length);
    const executing: Promise<void>[] = [];

    for (let i = 0; i < batchConfigs.length; i++) {
        const config = batchConfigs[i];
        const fetchOp = fetchSingleBatch(hfConfig, config.offset, config.length)
            .then(rows => { results[i] = rows; });

        const wrapper = fetchOp.then(() => {
            const index = executing.indexOf(wrapper);
            if (index > -1) executing.splice(index, 1);
        });

        executing.push(wrapper);
        if (executing.length >= MAX_CONCURRENT_FETCHES) await Promise.race(executing);
    }
    await Promise.all(executing);
    return results.flat();
};

const fetchSingleBatch = async (
    hfConfig: HuggingFaceConfig,
    offset: number,
    length: number
): Promise<any[]> => {
    try {
        const url = `https://datasets-server.huggingface.co/rows?dataset=${hfConfig.dataset}&config=${hfConfig.config}&split=${hfConfig.split}&offset=${offset}&length=${length}`;
        const response = await fetch(url);
        if (!response.ok) {
            let errorMsg = response.statusText;
            try {
                const errData = await response.json();
                if (errData.error) errorMsg = errData.error;
            } catch (e) { }
            throw new Error(`HF API Error ${response.status}: ${errorMsg}`);
        }
        const data = await response.json();
        if (!data.rows) return [];
        return data.rows.map((r: any) => r.row);
    } catch (err: any) {
        throw err;
    }
};

// --- Hyparquet Writer Helpers ---

/**
 * Convert row-oriented data to column-oriented format for hyparquet-writer
 */
function rowsToColumns(data: any[]): { name: string; data: any[]; type: string }[] {
    if (!data || data.length === 0) return [];

    // Collect all unique keys
    const keys = new Set<string>();
    data.forEach(d => Object.keys(d).forEach(k => keys.add(k)));

    // Build column data
    const columns: { name: string; data: any[]; type: 'STRING' | 'BOOLEAN' | 'INT32' | 'DOUBLE' }[] = [];

    keys.forEach(key => {
        // Extract column values
        const values = data.map(row => {
            const val = row[key];
            if (val === null || val === undefined) return null;
            // Stringify objects/arrays for storage as strings
            if (typeof val === 'object') return JSON.stringify(val);
            return val;
        });

        // Infer type from first non-null value
        let type = 'STRING';
        for (const val of values) {
            if (val !== null) {
                if (typeof val === 'boolean') {
                    type = 'BOOLEAN';
                } else if (typeof val === 'number') {
                    type = Number.isInteger(val) ? 'INT32' : 'DOUBLE';
                }
                break;
            }
        }

        columns.push({
            name: key,
            data: values,
            type: type as 'STRING' | 'BOOLEAN' | 'INT32' | 'DOUBLE'
        });
    });

    return columns;
}

/**
 * Generates Parquet bytes using hyparquet-writer (pure JS).
 */
export const generateParquetBuffer = async (data: any[]): Promise<Uint8Array> => {
    // Dynamic import to get parquetWriteBuffer - it returns ArrayBuffer directly
    const { parquetWriteBuffer } = await import('hyparquet-writer');

    try {
        logger.log(`Generating Parquet from ${data.length} rows...`);
        if (!data || data.length === 0) throw new Error("No data to convert");

        // Convert row data to column format
        const columnData = rowsToColumns(data);

        // Write to buffer - cast to any to avoid TypeScript issues with library types
        const buffer = parquetWriteBuffer({
            columnData: columnData as any,
            // Use UNCOMPRESSED for maximum browser compatibility
            codec: 'UNCOMPRESSED'
        });

        return new Uint8Array(buffer);
    } catch (e: any) {
        console.error("Parquet Generation Error:", e);
        throw new Error("Failed during Parquet conversion: " + e.message);
    }
};

/**
 * Pushes data to Hugging Face Hub using the @huggingface/hub library.
 */
export const uploadToHuggingFace = async (
    token: string,
    repoId: string,
    data: any[],
    filename: string = 'data.jsonl',
    privateRepo: boolean = true,
    format: 'jsonl' | 'parquet' = 'jsonl'
): Promise<string> => {

    if (!data || data.length === 0) {
        throw new Error("No data to upload.");
    }

    const credentials = { accessToken: token };
    const repo = { type: "dataset" as const, name: repoId };

    // 1. Create Repo (Idempotent-ish)
    try {
        logger.log(`Creating repo ${repoId} if needed...`);
        await createRepo({
            repo,
            credentials,
            private: privateRepo
        });
    } catch (e: any) {
        // 409 Conflict means repo exists, which is fine
        if (!e.message?.includes("409") && !e.message?.includes("exists")) {
            logger.warn("Repo creation warning:", e);
        }
    }

    // 2. Prepare Data Content
    let blob: Blob;
    let finalFilename = filename;

    logger.log(`Preparing content in format: ${format}`);

    if (format === 'parquet') {
        try {
            const parquetBytes = await generateParquetBuffer(data);
            blob = new Blob([parquetBytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
            if (!finalFilename.endsWith('.parquet')) finalFilename = finalFilename.replace(/\.jsonl$/, '') + '.parquet';
        } catch (e: any) {
            throw new Error("Parquet conversion failed: " + e.message);
        }
    } else {
        // JSONL
        const jsonlData = data.map(item => JSON.stringify(item)).join('\n');
        blob = new Blob([jsonlData], { type: 'application/json' });
    }

    // 3. Upload File
    logger.log(`Uploading ${finalFilename} to ${repoId}...`);

    await uploadFile({
        repo,
        credentials,
        file: {
            path: finalFilename,
            content: blob
        },
        // Use commitTitle to avoid @huggingface/hub validation error on commitMessage
        commitTitle: `Upload ${finalFilename} via SynthLabs (${format})`
    });

    return `https://huggingface.co/datasets/${repoId}`;
};
