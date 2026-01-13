/**
 * Task Classifier Service
 * Classifies queries by task type and recommends appropriate prompt sets.
 *
 * Two approaches:
 * - Heuristic: Fast, free, keyword-based pattern matching
 * - LLM: More accurate, costs tokens, uses model for classification
 */

export type TaskType =
    | 'math'
    | 'coding'
    | 'creative'
    | 'factual'
    | 'technical'
    | 'reasoning'
    | 'conversation'
    | 'medical'
    | 'unknown';

export type ClassifierMethod = 'none' | 'heuristic' | 'llm';

// Map task types to recommended prompt sets
// Users can override; these are suggestions
export const TASK_PROMPT_MAPPING: Record<TaskType, string> = {
    math: 'synth-prose',        // Step-by-step derivations benefit from sections
    coding: 'synth-prose',      // Technical, structured
    creative: 'synth-expanded', // Flowing prose for creative output
    factual: 'synth-compact',   // Dense facts, minimal fluff
    technical: 'synth-prose',   // Structured explanations
    reasoning: 'synth-prose',   // Logical sections
    conversation: 'synth-expanded', // Natural flow
    medical: 'synth-prose',     // Clinical precision with structured explanations
    unknown: 'default'          // Fall back to user's default
};

// Heuristic patterns for each task type
const TASK_PATTERNS: Record<TaskType, { keywords: string[]; patterns: RegExp[] }> = {
    math: {
        keywords: [
            'calculate', 'solve', 'equation', 'formula', 'derivative', 'integral',
            'algebra', 'geometry', 'probability', 'statistics', 'proof', 'theorem',
            'sum', 'product', 'factor', 'simplify', 'evaluate', 'graph'
        ],
        patterns: [
            /\d+\s*[\+\-\*\/\^]\s*\d+/,        // Basic arithmetic
            /\b\d+x\b|\bx\^?\d*\b/i,           // Variables
            /\b(sin|cos|tan|log|ln|sqrt)\b/i,  // Math functions
            /what is \d+/i,                     // "what is 5+5"
            /how many/i
        ]
    },
    coding: {
        keywords: [
            'code', 'function', 'class', 'variable', 'debug', 'error', 'bug',
            'implement', 'algorithm', 'api', 'database', 'sql', 'javascript',
            'python', 'typescript', 'react', 'node', 'git', 'compile', 'runtime',
            'refactor', 'optimize', 'performance', 'memory', 'async', 'promise'
        ],
        patterns: [
            /```[\s\S]*```/,                   // Code blocks
            /\b(def|function|const|let|var|class|import|export)\b/i,
            /\.(js|ts|py|java|cpp|rs|go)\b/i,  // File extensions
            /\b(npm|pip|cargo|maven)\b/i       // Package managers
        ]
    },
    creative: {
        keywords: [
            'write', 'story', 'poem', 'creative', 'imagine', 'fiction',
            'character', 'narrative', 'plot', 'describe', 'compose',
            'lyric', 'script', 'dialogue', 'metaphor', 'artistic'
        ],
        patterns: [
            /write (me )?(a |an )/i,
            /create (a |an )?story/i,
            /in the style of/i,
            /once upon a time/i
        ]
    },
    factual: {
        keywords: [
            'what is', 'who is', 'when did', 'where is', 'define', 'explain',
            'history', 'fact', 'date', 'capital', 'population', 'founder',
            'invented', 'discovered', 'born', 'died', 'located'
        ],
        patterns: [
            /^(what|who|when|where|which)\b/i,
            /\bis (the|a|an)\b.*\?$/i,
            /tell me about/i
        ]
    },
    technical: {
        keywords: [
            'how does', 'explain how', 'architecture', 'system', 'protocol',
            'mechanism', 'process', 'workflow', 'infrastructure', 'design',
            'specification', 'requirement', 'documentation', 'configure'
        ],
        patterns: [
            /how does .* work/i,
            /explain (the )?(concept|mechanism|process)/i,
            /what('s| is) the difference between/i
        ]
    },
    reasoning: {
        keywords: [
            'why', 'reason', 'because', 'therefore', 'logic', 'argument',
            'conclude', 'infer', 'deduce', 'analyze', 'compare', 'evaluate',
            'pros and cons', 'trade-off', 'implication', 'consequence'
        ],
        patterns: [
            /^why\b/i,
            /should (i|we|they)/i,
            /what would happen if/i,
            /is it (better|worse|good|bad) to/i
        ]
    },
    conversation: {
        keywords: [
            'hello', 'hi', 'hey', 'thanks', 'please', 'help me',
            'can you', 'could you', 'would you', 'chat', 'talk'
        ],
        patterns: [
            /^(hi|hello|hey)\b/i,
            /^thanks?\b/i,
            /how are you/i
        ]
    },
    medical: {
        keywords: [
            // Clinical specializations
            'cardiology', 'neurology', 'oncology', 'pediatrics', 'psychiatry',
            'dermatology', 'radiology', 'pathology', 'surgery', 'anesthesiology',
            'endocrinology', 'gastroenterology', 'nephrology', 'pulmonology',
            'rheumatology', 'immunology', 'hematology', 'ophthalmology',
            'orthopedics', 'urology', 'gynecology', 'obstetrics', 'geriatrics',
            // Medical terms
            'diagnosis', 'treatment', 'symptoms', 'prognosis', 'patient',
            'clinical', 'therapy', 'medication', 'prescription', 'dosage',
            'disease', 'disorder', 'syndrome', 'condition', 'pathology',
            'anatomy', 'physiology', 'pharmacology', 'etiology', 'epidemiology',
            // Biology
            'biology', 'cell', 'organism', 'tissue', 'organ', 'molecular',
            'metabolism', 'mitosis', 'meiosis', 'photosynthesis', 'evolution',
            'ecology', 'microbiology', 'virology', 'bacteriology', 'immunology',
            // Chemistry
            'chemistry', 'molecule', 'compound', 'reaction', 'catalyst',
            'organic', 'inorganic', 'biochemistry', 'polymer', 'enzyme',
            'protein', 'lipid', 'carbohydrate', 'nucleotide', 'amino acid',
            // Genetics
            'genetics', 'gene', 'dna', 'rna', 'chromosome', 'mutation',
            'genome', 'allele', 'hereditary', 'inheritance', 'genotype',
            'phenotype', 'crispr', 'sequencing', 'epigenetics', 'transcription',
            // Neuroscience
            'neuroscience', 'neuron', 'synapse', 'neurotransmitter', 'cortex',
            'hippocampus', 'amygdala', 'cerebellum', 'axon', 'dendrite'
        ],
        patterns: [
            /\b(diagnosis|diagnose|diagnosed)\b/i,
            /\b(symptom|symptoms)\b.*\b(of|for|include)\b/i,
            /\b(treat|treatment|treating)\b.*\b(for|of)\b/i,
            /\b(patient|patients)\b.*\b(with|has|have)\b/i,
            /\b(mg|mcg|ml|iu)\b.*\b(dose|dosage|daily|twice)\b/i,
            /\b(gene|genetic|dna|rna)\b.*\b(mutation|expression|sequence)\b/i,
            /\b(cell|cellular)\b.*\b(function|structure|division)\b/i,
            /\b(chemical|molecular)\b.*\b(reaction|structure|bond)\b/i,
            /what causes/i,
            /how to treat/i,
            /side effects of/i,
            /mechanism of action/i
        ]
    },
    unknown: {
        keywords: [],
        patterns: []
    }
};

/**
 * Heuristic-based task classification
 * Fast, no API calls, keyword-based pattern matching
 */
export function classifyTaskHeuristic(query: string): { type: TaskType; confidence: number } {
    const queryLower = query.toLowerCase();
    const scores: Record<TaskType, number> = {
        math: 0,
        coding: 0,
        creative: 0,
        factual: 0,
        technical: 0,
        reasoning: 0,
        conversation: 0,
        medical: 0,
        unknown: 0
    };

    // Score each task type
    for (const [taskType, { keywords, patterns }] of Object.entries(TASK_PATTERNS) as [TaskType, typeof TASK_PATTERNS[TaskType]][]) {
        if (taskType === 'unknown') continue;

        // Keyword matches (0.5 points each) - use word boundaries to avoid false positives
        // e.g., "sum" shouldn't match "assumption"
        for (const keyword of keywords) {
            const wordBoundaryRegex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (wordBoundaryRegex.test(queryLower)) {
                scores[taskType] += 0.5;
            }
        }

        // Pattern matches (1.0 points each)
        for (const pattern of patterns) {
            if (pattern.test(query)) {
                scores[taskType] += 1.0;
            }
        }
    }

    // Find highest scoring task
    let maxScore = 0;
    let bestType: TaskType = 'unknown';

    for (const [taskType, score] of Object.entries(scores) as [TaskType, number][]) {
        if (score > maxScore) {
            maxScore = score;
            bestType = taskType;
        }
    }

    // Calculate confidence (normalize to 0-1)
    // More than 3 points = high confidence
    const confidence = Math.min(maxScore / 3, 1);

    // If very low confidence, mark as unknown
    if (confidence < 0.2) {
        return { type: 'unknown', confidence: 0.1 };
    }

    return { type: bestType, confidence };
}

/**
 * LLM-based task classification
 * More accurate but requires API call
 */
export function getClassifierPrompt(query: string): string {
    // Escape the query to prevent prompt confusion from special characters
    const escapedQuery = query.slice(0, 500).replace(/`/g, "'").replace(/\\/g, '\\\\');

    return `Classify this query into a task type and provide your confidence level.

Categories:
- math: calculations, equations, proofs, statistics, numbers
- coding: programming, debugging, algorithms, code, software
- creative: stories, poems, creative writing, fiction, artistic
- factual: facts, definitions, dates, events, simple lookups
- technical: how systems work, explanations, mechanisms
- reasoning: why questions, analysis, comparisons, pros/cons
- conversation: greetings, thanks, small talk
- medical: clinical diagnoses, treatments, biology, chemistry, genetics, pharmacology
- unknown: unclear or ambiguous

Examples:
"What is 2+2?" → {"type":"math","confidence":0.95}
"Write a Python function" → {"type":"coding","confidence":0.9}
"Write me a poem about cats" → {"type":"creative","confidence":0.85}
"Who invented the telephone?" → {"type":"factual","confidence":0.9}
"How does TCP/IP work?" → {"type":"technical","confidence":0.85}
"Should I use React or Vue?" → {"type":"reasoning","confidence":0.8}
"Hello!" → {"type":"conversation","confidence":0.95}
"What are the symptoms of diabetes?" → {"type":"medical","confidence":0.9}
"How does CRISPR gene editing work?" → {"type":"medical","confidence":0.85}

Query:
\`\`\`
${escapedQuery}
\`\`\`

Output JSON only (no markdown):`;
}

/**
 * Result from LLM classification including confidence
 */
export interface LLMClassificationResult {
    type: TaskType;
    confidence: number;
}

/**
 * Parse LLM response to extract task type and confidence
 */
export function parseClassifierResponse(response: string): LLMClassificationResult {
    const cleaned = response.trim();

    // Try to parse as JSON first
    try {
        // Handle potential markdown code blocks - use non-greedy match for flat JSON
        const jsonMatch = cleaned.match(/\{[^{}]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const validTypes: TaskType[] = [
                'math', 'coding', 'creative', 'factual',
                'technical', 'reasoning', 'conversation', 'medical', 'unknown'
            ];
            // Type guard: ensure parsed.type is a string before calling toLowerCase()
            const typeValue = typeof parsed.type === 'string' ? parsed.type.toLowerCase() : '';
            const type = validTypes.includes(typeValue as TaskType)
                ? typeValue as TaskType
                : 'unknown';
            const confidence = typeof parsed.confidence === 'number'
                ? Math.min(1, Math.max(0, parsed.confidence))
                : 0.8; // Default confidence if not provided
            return { type, confidence };
        }
    } catch {
        // JSON parsing failed, fall back to text matching
    }

    // Fallback: look for task type keyword in response
    const lowerResponse = cleaned.toLowerCase();
    const validTypes: TaskType[] = [
        'math', 'coding', 'creative', 'factual',
        'technical', 'reasoning', 'conversation', 'medical', 'unknown'
    ];

    for (const type of validTypes) {
        if (lowerResponse.includes(type)) {
            return { type, confidence: 0.7 }; // Lower confidence for non-JSON responses
        }
    }

    return { type: 'unknown', confidence: 0.5 };
}

/**
 * Get recommended prompt set for a task type
 * @param taskType - The detected task type
 * @param fallback - Fallback prompt set if type is unknown
 * @param customMapping - Optional custom task→prompt mapping (overrides defaults)
 */
export function getRecommendedPromptSet(
    taskType: TaskType,
    fallback: string = 'default',
    customMapping?: Record<string, string>
): string {
    if (taskType === 'unknown') {
        return fallback;
    }
    // Check custom mapping first, then fall back to defaults
    if (customMapping && customMapping[taskType]) {
        return customMapping[taskType];
    }
    return TASK_PROMPT_MAPPING[taskType] || fallback;
}

/**
 * Get effective mapping (merges custom with defaults)
 */
export function getEffectiveMapping(customMapping?: Record<string, string>): Record<TaskType, string> {
    return {
        ...TASK_PROMPT_MAPPING,
        ...customMapping
    } as Record<TaskType, string>;
}

/**
 * Full classification pipeline
 */
export const TaskClassifierService = {
    // Heuristic classification (synchronous)
    classifyHeuristic: classifyTaskHeuristic,

    // Get prompt for LLM classification
    getClassifierPrompt,

    // Parse LLM response
    parseClassifierResponse,

    // Get recommended prompt set
    getRecommendedPromptSet,

    // Get effective mapping (custom + defaults)
    getEffectiveMapping,

    // Get default task-to-prompt mapping (for UI display)
    getDefaultMapping: () => ({ ...TASK_PROMPT_MAPPING }),

    // Get task-to-prompt mapping (for UI display) - deprecated, use getDefaultMapping
    getTaskPromptMapping: () => ({ ...TASK_PROMPT_MAPPING }),

    // Get all task types
    getTaskTypes: (): TaskType[] => [
        'math', 'coding', 'creative', 'factual',
        'technical', 'reasoning', 'conversation', 'medical'
    ]
};
