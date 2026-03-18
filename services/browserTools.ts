/**
 * Browser-use tools for the AI assistant.
 * Allows the agent to interact with the SynthLabs UI directly via DOM APIs.
 * These tools run in the browser context alongside the React app.
 */

import type { ToolDefinition } from './toolService';

// ─── Helpers ────────────────────────────────────────────────────

/** Find an element by various strategies: text content, aria-label, selector, placeholder */
function findElement(query: string): HTMLElement | null {
    // 1. Try CSS selector directly
    try {
        const el = document.querySelector<HTMLElement>(query);
        if (el) return el;
    } catch {
        // Not a valid selector, continue
    }

    // 2. Try aria-label
    const byAria = document.querySelector<HTMLElement>(`[aria-label="${query}"]`);
    if (byAria) return byAria;

    // 3. Try title attribute
    const byTitle = document.querySelector<HTMLElement>(`[title="${query}"]`);
    if (byTitle) return byTitle;

    // 4. Try placeholder
    const byPlaceholder = document.querySelector<HTMLElement>(`[placeholder="${query}"]`);
    if (byPlaceholder) return byPlaceholder;

    // 5. Try button/link text content (case-insensitive partial match)
    const lowerQuery = query.toLowerCase();
    const clickables = document.querySelectorAll<HTMLElement>('button, a, [role="button"], [role="tab"], label');
    for (const el of clickables) {
        const text = el.textContent?.trim().toLowerCase() || '';
        if (text === lowerQuery || text.includes(lowerQuery)) {
            return el;
        }
    }

    // 6. Try any visible element with matching text
    const allElements = document.querySelectorAll<HTMLElement>('*');
    for (const el of allElements) {
        if (el.children.length === 0 && el.textContent?.trim().toLowerCase().includes(lowerQuery)) {
            return el;
        }
    }

    return null;
}

/** Get a readable summary of the current UI state */
function getUISnapshot(): string {
    const parts: string[] = [];

    // Active app view
    const activeNavButton = document.querySelector<HTMLElement>('[class*="bg-slate-100"]');
    parts.push(`## Current View: ${activeNavButton?.textContent?.trim() || 'Unknown'}`);

    // Active tab within the view
    const activeTabs = document.querySelectorAll<HTMLElement>('[role="tab"][aria-selected="true"], button[class*="border-b-2"]');
    if (activeTabs.length > 0) {
        parts.push(`Active Tab: ${Array.from(activeTabs).map(t => t.textContent?.trim()).join(', ')}`);
    }

    // Visible panels
    const panels = document.querySelectorAll<HTMLElement>('[class*="rounded-xl"]');
    const visiblePanels: string[] = [];
    panels.forEach(p => {
        const heading = p.querySelector('h2, h3, h4');
        if (heading?.textContent?.trim() && p.offsetParent !== null) {
            visiblePanels.push(heading.textContent.trim());
        }
    });
    if (visiblePanels.length > 0) {
        parts.push(`Visible Panels: ${visiblePanels.join(', ')}`);
    }

    // Form inputs with values
    const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input:not([type="hidden"]):not([type="file"]), textarea, select'
    );
    const formFields: string[] = [];
    inputs.forEach(input => {
        if (input.offsetParent === null) return; // Hidden
        const label = input.closest('div, label')?.querySelector('label')?.textContent?.trim()
            || (input as HTMLInputElement).placeholder || input.name || input.id || '';
        if (!label) return;
        const value = input.type === 'checkbox'
            ? (input as HTMLInputElement).checked ? 'checked' : 'unchecked'
            : input.value || '(empty)';
        formFields.push(`  - ${label}: ${value.substring(0, 100)}`);
    });
    if (formFields.length > 0) {
        parts.push(`\n## Visible Form Fields:\n${formFields.join('\n')}`);
    }

    // Buttons
    const buttons = document.querySelectorAll<HTMLButtonElement>('button');
    const visibleButtons: string[] = [];
    buttons.forEach(btn => {
        if (btn.offsetParent === null) return;
        const text = btn.textContent?.trim();
        if (text && text.length > 1 && text.length < 50) {
            const disabled = btn.disabled ? ' [disabled]' : '';
            visibleButtons.push(`${text}${disabled}`);
        }
    });
    if (visibleButtons.length > 0) {
        const unique = [...new Set(visibleButtons)];
        parts.push(`\n## Visible Buttons:\n${unique.map(b => `  - ${b}`).join('\n')}`);
    }

    // Data indicators (counts, badges)
    const badges = document.querySelectorAll<HTMLElement>('[class*="badge"], [class*="rounded-full"], [class*="font-mono"]');
    const indicators: string[] = [];
    badges.forEach(badge => {
        if (badge.offsetParent === null) return;
        const text = badge.textContent?.trim();
        if (text && text.length < 30 && /\d/.test(text)) {
            indicators.push(text);
        }
    });
    if (indicators.length > 0) {
        const unique = [...new Set(indicators)].slice(0, 15);
        parts.push(`\n## Data Indicators:\n${unique.map(i => `  - ${i}`).join('\n')}`);
    }

    // Toasts / notifications
    const toasts = document.querySelectorAll<HTMLElement>('[class*="toast"], [role="alert"]');
    toasts.forEach(toast => {
        const text = toast.textContent?.trim();
        if (text) parts.push(`\n## Notification: ${text}`);
    });

    return parts.join('\n');
}

/** Keywords in button/element text that indicate a destructive or risky action */
const RISKY_ACTION_KEYWORDS = [
    'delete', 'remove', 'destroy', 'drop', 'clear all', 'reset',
    'purge', 'erase', 'wipe', 'discard', 'revoke'
];

function isRiskyClick(el: HTMLElement): boolean {
    const text = (el.textContent?.trim() || '').toLowerCase();
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    const title = (el.getAttribute('title') || '').toLowerCase();
    const combined = `${text} ${ariaLabel} ${title}`;
    return RISKY_ACTION_KEYWORDS.some(kw => combined.includes(kw));
}

/** Find a clickable element matching text within a specific panel/scope */
function findClickableInScope(text: string, scope?: string): HTMLElement | null {
    const container = scope ? findElement(scope) || document : document;
    const lowerText = text.toLowerCase();

    const candidates = container.querySelectorAll<HTMLElement>(
        'button, a, [role="button"], [role="tab"], input[type="checkbox"], label, [onclick]'
    );
    for (const el of candidates) {
        if (el.offsetParent === null) continue;
        const elText = el.textContent?.trim().toLowerCase() || '';
        const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
        const title = el.getAttribute('title')?.toLowerCase() || '';
        if (elText === lowerText || elText.includes(lowerText) || ariaLabel.includes(lowerText) || title.includes(lowerText)) {
            return el;
        }
    }
    return null;
}

// ─── Tool Definitions ───────────────────────────────────────────

export interface BrowserToolDef {
    definition: ToolDefinition;
    execute: (args: any) => Promise<any>;
}

export function getBrowserTools(): BrowserToolDef[] {
    return [
        // ─── Snapshot ─────────────────────────────────────────
        {
            definition: {
                name: 'ui_snapshot',
                description: 'Read the current UI state. Returns visible panels, tabs, buttons, form fields, and data indicators. Use this to understand what the user is seeing before taking action.',
                parameters: {
                    type: 'object',
                    properties: {
                        selector: {
                            type: 'string',
                            description: 'Optional CSS selector to scope the snapshot to a specific area of the page'
                        }
                    }
                }
            },
            execute: async ({ selector }: { selector?: string }) => {
                if (selector) {
                    const el = document.querySelector<HTMLElement>(selector);
                    if (!el) return { error: `Element not found: ${selector}` };
                    return {
                        html: el.innerHTML.substring(0, 2000),
                        text: el.textContent?.trim().substring(0, 2000),
                        tag: el.tagName,
                        classes: el.className.substring(0, 200)
                    };
                }
                return { snapshot: getUISnapshot() };
            }
        },

        // ─── Click ────────────────────────────────────────────
        {
            definition: {
                name: 'ui_click',
                description: 'Click a button or interactive element on the page. Find elements by their visible text, aria-label, title, or CSS selector. Use ui_snapshot first to identify available buttons. Destructive actions (delete, remove, reset, etc.) require passing confirm: true — the tool will refuse without it so you can ask the user first.',
                parameters: {
                    type: 'object',
                    properties: {
                        target: {
                            type: 'string',
                            description: 'Button text, aria-label, title, or CSS selector of the element to click'
                        },
                        scope: {
                            type: 'string',
                            description: 'Optional: limit search to elements inside this container (text or selector)'
                        },
                        confirm: {
                            type: 'boolean',
                            description: 'Must be true to proceed with destructive actions (delete, remove, reset, etc.). Ask the user before setting this.'
                        }
                    },
                    required: ['target']
                }
            },
            execute: async ({ target, scope, confirm }: { target: string; scope?: string; confirm?: boolean }) => {
                const el = scope ? findClickableInScope(target, scope) : findElement(target);
                if (!el) {
                    return { error: `Element not found: "${target}"`, suggestion: 'Use ui_snapshot to see available elements' };
                }

                // Guard: block destructive clicks unless explicitly confirmed
                if (isRiskyClick(el) && !confirm) {
                    return {
                        blocked: true,
                        reason: 'destructive_action',
                        element_text: el.textContent?.trim().substring(0, 100),
                        instruction: 'This looks like a destructive action. Ask the user for confirmation, then retry with confirm: true.'
                    };
                }

                el.click();
                // Brief delay for React to process
                await new Promise(r => setTimeout(r, 150));
                return {
                    clicked: true,
                    element: el.tagName,
                    text: el.textContent?.trim().substring(0, 100)
                };
            }
        },

        // ─── Type ─────────────────────────────────────────────
        {
            definition: {
                name: 'ui_type',
                description: 'Type text into an input field, textarea, or editable element. The field is identified by its label, placeholder, selector, or nearby text. Clears existing value first by default.',
                parameters: {
                    type: 'object',
                    properties: {
                        target: {
                            type: 'string',
                            description: 'Label, placeholder text, or CSS selector of the input field'
                        },
                        text: {
                            type: 'string',
                            description: 'Text to type into the field'
                        },
                        append: {
                            type: 'boolean',
                            description: 'If true, append to existing value instead of replacing. Default: false'
                        }
                    },
                    required: ['target', 'text']
                }
            },
            execute: async ({ target, text, append }: { target: string; text: string; append?: boolean }) => {
                const rawEl = findElement(target);
                if (!rawEl) {
                    return { error: `Input not found: "${target}"` };
                }
                if (!(rawEl instanceof HTMLInputElement || rawEl instanceof HTMLTextAreaElement)) {
                    return { error: `Element is not an input: ${rawEl.tagName}` };
                }
                const el = rawEl;

                // Use React's native setter to trigger controlled component updates
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value'
                )?.set || Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype, 'value'
                )?.set;

                const newValue = append ? el.value + text : text;
                nativeInputValueSetter?.call(el, newValue);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));

                return { typed: true, value: newValue.substring(0, 200) };
            }
        },

        // ─── Navigate ─────────────────────────────────────────
        {
            definition: {
                name: 'ui_navigate',
                description: 'Navigate to a specific app view or tab. Views: "Creator", "Verifier". Tabs within Verifier: "Import", "Review", "Export". Can also navigate to settings panels.',
                parameters: {
                    type: 'object',
                    properties: {
                        view: {
                            type: 'string',
                            description: 'Target view or tab name (e.g., "Creator", "Verifier", "Import", "Review", "Export", "Settings")'
                        }
                    },
                    required: ['view']
                }
            },
            execute: async ({ view }: { view: string }) => {
                const lower = view.toLowerCase();

                // App-level views
                if (['creator', 'verifier'].includes(lower)) {
                    const btn = findClickableInScope(view);
                    if (btn) {
                        btn.click();
                        await new Promise(r => setTimeout(r, 200));
                        return { navigated: true, view };
                    }
                }

                // Verifier tabs
                if (['import', 'review', 'export'].includes(lower)) {
                    const tabs = document.querySelectorAll<HTMLElement>('button');
                    for (const tab of tabs) {
                        const text = tab.textContent?.trim().toLowerCase() || '';
                        if (text === lower || text.startsWith(lower)) {
                            tab.click();
                            await new Promise(r => setTimeout(r, 200));
                            return { navigated: true, tab: view };
                        }
                    }
                }

                // Settings panel
                if (lower === 'settings') {
                    const settingsBtn = document.querySelector<HTMLElement>('[title*="Settings"], [aria-label*="Settings"]')
                        || findElement('Settings');
                    if (settingsBtn) {
                        settingsBtn.click();
                        await new Promise(r => setTimeout(r, 200));
                        return { navigated: true, view: 'Settings' };
                    }
                }

                // Generic fallback
                const el = findElement(view);
                if (el) {
                    el.click();
                    await new Promise(r => setTimeout(r, 200));
                    return { navigated: true, target: view };
                }

                return { error: `Navigation target not found: "${view}"` };
            }
        },

        // ─── Read Element ─────────────────────────────────────
        {
            definition: {
                name: 'ui_read',
                description: 'Read the text content, value, or attributes of a specific UI element. Useful for checking values of inputs, reading labels, or getting the state of a specific part of the UI.',
                parameters: {
                    type: 'object',
                    properties: {
                        target: {
                            type: 'string',
                            description: 'Text, label, or CSS selector of the element to read'
                        },
                        attribute: {
                            type: 'string',
                            description: 'Optional: specific attribute to read (e.g., "value", "checked", "disabled", "class")'
                        }
                    },
                    required: ['target']
                }
            },
            execute: async ({ target, attribute }: { target: string; attribute?: string }) => {
                const el = findElement(target);
                if (!el) {
                    return { error: `Element not found: "${target}"` };
                }

                const result: Record<string, any> = {
                    tag: el.tagName.toLowerCase(),
                    text: el.textContent?.trim().substring(0, 500),
                    visible: el.offsetParent !== null
                };

                if (attribute) {
                    result.attribute = el.getAttribute(attribute);
                }

                // Auto-read common properties
                if ('value' in el) result.value = (el as HTMLInputElement).value;
                if ('checked' in el) result.checked = (el as HTMLInputElement).checked;
                if (el.hasAttribute('disabled')) result.disabled = true;
                if (el.hasAttribute('aria-selected')) result.selected = el.getAttribute('aria-selected') === 'true';

                return result;
            }
        },

        // ─── Wait ─────────────────────────────────────────────
        {
            definition: {
                name: 'ui_wait',
                description: 'Wait for a condition: text to appear, element to be visible, or a fixed delay. Useful after clicking buttons that trigger async operations.',
                parameters: {
                    type: 'object',
                    properties: {
                        text: {
                            type: 'string',
                            description: 'Wait until this text appears on the page'
                        },
                        selector: {
                            type: 'string',
                            description: 'Wait until this CSS selector matches a visible element'
                        },
                        delay: {
                            type: 'number',
                            description: 'Fixed wait time in milliseconds (max 10000)'
                        },
                        timeout: {
                            type: 'number',
                            description: 'Maximum time to wait in milliseconds (default: 5000)'
                        }
                    }
                }
            },
            execute: async ({ text, selector, delay, timeout = 5000 }: {
                text?: string; selector?: string; delay?: number; timeout?: number
            }) => {
                const maxWait = Math.min(timeout, 10000);

                if (delay) {
                    await new Promise(r => setTimeout(r, Math.min(delay, 10000)));
                    return { waited: true, ms: delay };
                }

                const start = Date.now();
                while (Date.now() - start < maxWait) {
                    if (text) {
                        if (document.body.textContent?.includes(text)) {
                            return { found: true, text, elapsed: Date.now() - start };
                        }
                    }
                    if (selector) {
                        const el = document.querySelector<HTMLElement>(selector);
                        if (el && el.offsetParent !== null) {
                            return { found: true, selector, elapsed: Date.now() - start };
                        }
                    }
                    await new Promise(r => setTimeout(r, 200));
                }

                return { found: false, timedOut: true, elapsed: Date.now() - start };
            }
        },

        // ─── List Elements ────────────────────────────────────
        {
            definition: {
                name: 'ui_list',
                description: 'List all interactive elements (buttons, inputs, links, tabs) currently visible on the page. Useful for discovering what actions are available.',
                parameters: {
                    type: 'object',
                    properties: {
                        type: {
                            type: 'string',
                            enum: ['buttons', 'inputs', 'links', 'tabs', 'all'],
                            description: 'Type of elements to list. Default: "all"'
                        },
                        scope: {
                            type: 'string',
                            description: 'Optional CSS selector to scope the search'
                        }
                    }
                }
            },
            execute: async ({ type = 'all', scope }: { type?: string; scope?: string }) => {
                const container = scope ? (document.querySelector<HTMLElement>(scope) || document) : document;
                const result: Record<string, any[]> = {};

                const isVisible = (el: HTMLElement) => el.offsetParent !== null;

                if (type === 'buttons' || type === 'all') {
                    const buttons: any[] = [];
                    container.querySelectorAll<HTMLButtonElement>('button').forEach(btn => {
                        if (!isVisible(btn)) return;
                        const text = btn.textContent?.trim();
                        if (text && text.length > 0 && text.length < 60) {
                            buttons.push({
                                text,
                                disabled: btn.disabled,
                                title: btn.title || undefined,
                            });
                        }
                    });
                    result.buttons = [...new Map(buttons.map(b => [b.text, b])).values()]; // dedup
                }

                if (type === 'inputs' || type === 'all') {
                    const inputs: any[] = [];
                    container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
                        'input:not([type="hidden"]):not([type="file"]), textarea, select'
                    ).forEach(input => {
                        if (!isVisible(input as HTMLElement)) return;
                        const label = input.closest('div')?.querySelector('label')?.textContent?.trim()
                            || input.placeholder || input.name || '';
                        inputs.push({
                            label: label.substring(0, 60),
                            type: input.type || input.tagName.toLowerCase(),
                            value: input.value?.substring(0, 100) || '',
                            ...(input.type === 'checkbox' ? { checked: (input as HTMLInputElement).checked } : {}),
                        });
                    });
                    result.inputs = inputs;
                }

                if (type === 'links' || type === 'all') {
                    const links: any[] = [];
                    container.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(a => {
                        if (!isVisible(a)) return;
                        links.push({
                            text: a.textContent?.trim().substring(0, 60),
                            href: a.href,
                        });
                    });
                    result.links = links;
                }

                if (type === 'tabs' || type === 'all') {
                    const tabs: any[] = [];
                    container.querySelectorAll<HTMLElement>('[role="tab"], button[class*="tab"]').forEach(tab => {
                        if (!isVisible(tab)) return;
                        tabs.push({
                            text: tab.textContent?.trim(),
                            selected: tab.getAttribute('aria-selected') === 'true'
                                || tab.className.includes('border-b-2'),
                        });
                    });
                    result.tabs = tabs;
                }

                return result;
            }
        },

        // ─── Select (Dropdown) ───────────────────────────────
        {
            definition: {
                name: 'ui_select',
                description: 'Change the value of a <select> dropdown. Identify the dropdown by its label, nearby text, or CSS selector, then specify the value or visible text of the option to select.',
                parameters: {
                    type: 'object',
                    properties: {
                        target: {
                            type: 'string',
                            description: 'Label, nearby text, or CSS selector of the <select> element'
                        },
                        value: {
                            type: 'string',
                            description: 'The option value or visible text to select'
                        }
                    },
                    required: ['target', 'value']
                }
            },
            execute: async ({ target, value }: { target: string; value: string }) => {
                const rawEl = findElement(target);
                if (!rawEl) {
                    return { error: `Element not found: "${target}"` };
                }

                // Walk up to the closest <select> if we landed on a label or wrapper
                const selectEl = rawEl.tagName === 'SELECT'
                    ? rawEl as HTMLSelectElement
                    : rawEl.querySelector<HTMLSelectElement>('select')
                      || rawEl.closest<HTMLSelectElement>('select');

                if (!selectEl) {
                    return { error: `No <select> found near "${target}"` };
                }

                // Try matching by option value first, then by text content
                const lowerValue = value.toLowerCase();
                let matchedValue: string | null = null;
                for (const opt of Array.from(selectEl.options)) {
                    if (opt.value === value || opt.textContent?.trim().toLowerCase() === lowerValue) {
                        matchedValue = opt.value;
                        break;
                    }
                }

                if (matchedValue === null) {
                    const available = Array.from(selectEl.options).map(o => o.textContent?.trim()).filter(Boolean);
                    return { error: `Option "${value}" not found`, available };
                }

                // Use React's native setter to trigger controlled component updates
                const nativeSelectSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLSelectElement.prototype, 'value'
                )?.set;
                nativeSelectSetter?.call(selectEl, matchedValue);
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                await new Promise(r => setTimeout(r, 150));
                return { selected: true, value: selectEl.value };
            }
        },
    ];
}
