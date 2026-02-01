import { useCallback } from 'react';

import * as GeminiService from '../services/geminiService';
import { CATEGORIES } from '../types';

interface UseTopicGeneratorOptions {
    topicCategory: string;
    setGeminiTopic: (topic: string) => void;
    setIsGeneratingTopic: (value: boolean) => void;
    setError: (error: string | null) => void;
}

export function useTopicGenerator({
    topicCategory,
    setGeminiTopic,
    setIsGeneratingTopic,
    setError
}: UseTopicGeneratorOptions) {
    const generateRandomTopic = useCallback(async () => {
        setIsGeneratingTopic(true);
        try {
            const cat = topicCategory === 'Random (Any)'
                ? CATEGORIES[Math.floor(Math.random() * (CATEGORIES.length - 1)) + 1]
                : topicCategory;
            const topic = await GeminiService.generateGeminiTopic(cat);
            setGeminiTopic(topic);
        } catch {
            setError('Topic generation failed.');
        } finally {
            setIsGeneratingTopic(false);
        }
    }, [setError, setGeminiTopic, setIsGeneratingTopic, topicCategory]);

    return { generateRandomTopic };
}

export default useTopicGenerator;
