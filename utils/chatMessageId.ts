let messageCounter = 0;

export const createChatMessageId = (): string => {
    messageCounter += 1;
    return `${Date.now()}-${messageCounter}`;
};
