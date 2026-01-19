
import { extractJsonFields } from './utils/jsonFieldExtractor.ts';

const testCases = [
    // Basic case
    `{"response": "Simple query"}`,
    // Markdown wrapped
    `\`\`\`json
{
    "response": "Markdown query"
}
\`\`\``,
    // Markdown with trailing text
    `\`\`\`json
{
    "response": "Markdown with trailing"
}
\`\`\`
Some trailing text`,
    // Markdown with leading text
    `Here is the json:
\`\`\`json
{
    "response": "Markdown with leading"
}
\`\`\``,
    // Alternative keys
    `{"answer": "Answer key"}`,
    `{"text": "Text key"}`,
    // Incomplete/Streaming
    `\`\`\`json
{
    "response": "Streamin`,
    // Extra whitespace cases
    `{
    "response"
    :
    "Whitespace query"
}`,
    // Qwen style from screenshot (simulated)
    `{"response": "### 1. Symptom Mapping to Nerve Functions\\n- **Hyperacusis** -> stapedius muscle"}`,
    // Whitespace inside key
    `{" response ": "Whitespace inside key"}`,
];

console.log("Running extraction tests...");

testCases.forEach((input, idx) => {
    console.log(`\n--- Test Case ${idx + 1} ---`);
    console.log(`Input length: ${input.length}`);
    console.log(`Input snippet: ${input.replace(/\n/g, '\\n').substring(0, 50)}...`);

    try {
        const result = extractJsonFields(input);
        console.log("Result:", JSON.stringify(result, null, 2));

        if (result.answer) {
            console.log("✅ Extracted: " + result.answer);
        } else {
            console.log("❌ Failed to extract");
        }
    } catch (e) {
        console.error("Error:", e);
    }
});
