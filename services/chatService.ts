import { ExternalProvider, ApiType, ProviderType } from '../types';
import type { ChatMessage, ChatUsageSummary } from '../types';
import * as GeminiService from './geminiService';
import { SettingsService } from './settingsService';
import { ToolExecutor } from './toolService';
import { ChatRole } from '../interfaces/enums';

export type { ChatMessage, ChatUsageSummary };

export interface ToolCall {
    id: string;
    name: string;
    args: any;
}

export class ChatService {
    private toolExecutor: ToolExecutor;
    private history: ChatMessage[] = [];
    private readonly maxHistory = 200;

    constructor(toolExecutor: ToolExecutor) {
        this.toolExecutor = toolExecutor;
    }

    public getHistory(): ChatMessage[] {
        return this.history;
    }

    public clearHistory() {
        this.history = [];
    }

    private pushMessage(message: ChatMessage) {
        this.history.push(message);
        if (this.history.length > this.maxHistory) {
            this.history.splice(0, this.history.length - this.maxHistory);
        }
    }

    public addUserMessage(content: string) {
        this.pushMessage({ role: ChatRole.User, content });
    }

    public addToolResult(toolCallId: string, result: string) {
        this.pushMessage({
            role: ChatRole.Tool,
            toolCallId: toolCallId,
            content: result
        });
    }

    public buildSystemPrompt(): string {
        let prompt = `You are a helpful assistant integrated into a Data Verification Tool.
You have access to the current dataset being viewed by the user.
You can inspect items, update them, and assist the user in data cleaning and verification tasks.
Use \`<think>\` tags for your internal reasoning before answering.
`;

        // If tools are supported natively, we don't need the XML prompt.
        // However, for models that don't support tools natively (e.g. some OSS models), we might still want it.
        // For now, we assume if we are passing 'tools' to the API, we don't need this block.
        // But since this method returns just the system prompt string, and we decide elsewhere whether to pass 'tools',
        // we should separate "system prompt with manual tools" from "system prompt for native tools".

        // We'll trust the caller: if 'includeTools' is true, it means we WANT tools.
        // But if we are using NATIVE tools, we should pass false to this method or handle it differently.
        // Let's change the semantics: if includeTools is true, we ONLY add the *descriptions* if strictly needed OR
        // we rely on the provider to inject tool schemas.

        // Actually, let's keep it simple: We will NOT include XML definitions here if we are going to use native usage.
        // We'll handle that conditional in streamResponse.

        // For backwards compatibility or Gemini (which might use XML if we didn't refactor it yet):
        // We probably shouldn't break Gemini. But we are focusing on ExternalApi.

        return prompt;
    }

    public buildManualToolPrompt(): string {
        const definitions = this.toolExecutor.getToolDefinitions();
        return `
You are provided with a set of tools to interact with the data. 
To call a tool, you must use the following XML format with a JSON object inside:

<tool_call>
{
    "name": "tool_name",
    "arguments": {
        "arg1": "value"
    }
}
</tool_call>

IMPORTANT: 
1. The content inside <tool_call> MUST be valid JSON.
2. Do NOT use XML tags like <name> or <arguments> inside the <tool_call> block.
3. Strict JSON syntax only.

Available Tools:
${JSON.stringify(definitions, null, 2)}
`;
    }

    /**
     * Parses a chunk of text for <think>, <tool_call>, etc.
     * This is a simple stateful parser that could be improved.
     */
    public static parseResponse(text: string): {
        thinking: string | null,
        content: string,
        toolCalls: ToolCall[]
    } {
        let thinking = null;
        let content = text;
        const toolCalls: ToolCall[] = [];

        // Extract Thinking
        const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkMatch) {
            thinking = thinkMatch[1].trim();
            content = content.replace(thinkMatch[0], '').trim();
        } else {
            // Handle open thinking tag (streaming mid-stream)
            // This is tricky for a static parser on the full accumulated text.
            // For now, we'll assume the simple case or full completion.
            // If we really want "live" thinking extraction, we'd need to assume <think> starts it.
            const startThink = text.indexOf('<think>');
            if (startThink !== -1 && !text.includes('</think>')) {
                thinking = text.substring(startThink + 7); // everything after <think>
                content = text.substring(0, startThink); // hide thinking from content
            }
        }

        // Extract Tool Calls
        // Regex to find multiple tool calls
        const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
        let match;
        while ((match = toolCallRegex.exec(content)) !== null) {
            try {
                const jsonStr = match[1].trim();
                const json = JSON.parse(jsonStr);

                // Use a simple hash of the content to generate a semi-stable ID 
                // We need it to be stable for the React keys and linking.
                let hash = 0;
                for (let i = 0; i < jsonStr.length; i++) {
                    const char = jsonStr.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash | 0; // Convert to 32bit integer
                }
                const stableId = json.id || `tool-call-${Math.abs(hash)}`;

                toolCalls.push({
                    id: stableId,
                    name: json.name,
                    args: json.arguments || json.args
                });
            } catch (e: any) {
                console.error("Failed to parse tool call JSON", e);
                // Return a special error tool call so the system can feedback to the model
                // Use a stable ID based on raw content
                let hash = 0;
                for (let i = 0; i < match[1].length; i++) {
                    const char = match[1].charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash | 0;
                }
                const stableId = `tool-error-${Math.abs(hash)}`;

                toolCalls.push({
                    id: stableId,
                    name: 'invalid_tool_call',
                    args: {
                        raw: match[1].trim(),
                        error: e.message || 'Unknown JSON error'
                    }
                });
            }
        }

        // Remove tool calls from display content
        content = content.replace(toolCallRegex, '').trim();

        return { thinking, content, toolCalls };
    }

    // Call the AI model (using GeminiService as the backend for now, flexible to others)
    public async streamResponse(
        modelConfig: { provider: ExternalProvider | ProviderType.Gemini, model: string, apiKey?: string, customBaseUrl?: string, apiType?: ApiType },
        includeTools: boolean,
        onChunk: (chunk: string, accumulated: string, usage?: any) => void,
        abortSignal?: AbortSignal
    ): Promise<string> {
        const systemPrompt = this.buildSystemPrompt();

        // Flatten history into the "User Prompt" for now
        let conversationText = "";
        this.history.forEach(msg => {
            if (msg.role === ChatRole.Tool) {
                conversationText += `<tool_response>\n${msg.content}\n</tool_response>\n`;
            } else if (msg.role === ChatRole.Model) {
                if (msg.reasoning) conversationText += `<think>${msg.reasoning}</think>\n`;
                if (msg.toolCalls && msg.toolCalls.length > 0) {
                    msg.toolCalls.forEach(tc => {
                        conversationText += `<tool_call>{"name": "${tc.name}", "arguments": ${JSON.stringify(tc.args)}}</tool_call>\n`;
                    });
                }
                conversationText += `${msg.content}\n`;
            } else {
                conversationText += `User: ${msg.content}\n`;
            }
        });

        // The last message should be from User if we are triggering generation? 
        // Actually, the user just added a message, so it's in history.
        // We warn the model to be the assistant.
        conversationText += `\nAssistant:`;

        const config = {
            provider: modelConfig.provider || ExternalProvider.OpenRouter,
            model: modelConfig.model,
            apiKey: modelConfig.apiKey || SettingsService.getApiKey(modelConfig.provider),
            apiType: modelConfig.apiType || ApiType.Chat // Pass API type (defaults to 'chat')
        };

        if (config.provider === ProviderType.Gemini) {
            // Legacy/Gemini path: use manual XML tools for now (or refactor GeminiService later)
            // If includeTools is true, we need to append the manual prompt
            const manualTools = includeTools ? this.buildManualToolPrompt() : '';
            const content = `${systemPrompt}${manualTools}\n\n${conversationText}\nAssistant:`; // Use flattened conversationText
            return GeminiService.generateContentStream(content, config.model, onChunk, abortSignal);
        } else {
            // External (OpenRouter etc) - NATIVE TOOL CALLING
            // Map history to OpenAI message format
            const messages = [
                { role: 'system', content: systemPrompt },
                ...this.history.map(msg => {
                    // Map internal roles to OpenAI roles and fields
                    if (msg.role === ChatRole.User) return { role: 'user', content: msg.content };
                    if (msg.role === ChatRole.Tool) return { role: 'tool', tool_call_id: msg.toolCallId || 'unknown', content: msg.content };
                    if (msg.role === ChatRole.Model) {
                        return {
                            role: 'assistant',
                            content: msg.content || null,
                            tool_calls: msg.toolCalls ? msg.toolCalls.map(tc => ({
                                id: tc.id,
                                type: 'function',
                                function: {
                                    name: tc.name,
                                    arguments: JSON.stringify(tc.args)
                                }
                            })) : undefined
                        };
                    }
                    return { role: 'user', content: String(msg.content) };
                })
            ];

            const tools = includeTools ? this.toolExecutor.getOpenAIToolDefinitions() : undefined;

            const settings = SettingsService.getSettings();
            const customEndpoint = modelConfig.customBaseUrl || settings.customEndpointUrl;
            const defaultGenerationParams = settings.defaultGenerationParams;
            const generationParams = defaultGenerationParams;

            await import('./externalApiService').then(m => m.callExternalApi({
                provider: config.provider as ExternalProvider,
                model: config.model,
                apiKey: config.apiKey,
                apiType: config.apiType, // Pass API type
                customBaseUrl: customEndpoint,
                systemPrompt: systemPrompt,
                userPrompt: '', // We pass full messages array now
                messages: messages,
                tools: tools,
                stream: true,
                onStreamChunk: (chunk: string, accumulated: string, _phase?: any, usage?: any) => {
                    console.log('chatService onStreamChunk - usage:', usage);
                    onChunk(chunk, accumulated, usage);
                },
                structuredOutput: false,
                signal: abortSignal,
                generationParams: generationParams
            }));
            return '';
        }
    }
}
