const mockChatModel = jest.fn((modelId: string) => ({
  modelId,
  provider: 'mock-anthropic',
}));

const mockCreateAnthropic = jest.fn((_config?: any) => ({
  chatModel: mockChatModel,
  languageModel: mockChatModel,
}));

module.exports = {
  createAnthropic: mockCreateAnthropic,
  __mockChatModel: mockChatModel,
  __mockCreateAnthropic: mockCreateAnthropic,
};
