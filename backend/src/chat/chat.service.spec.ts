import type { ChatAgentStatus } from '@cangyun-ai/types';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';

import { CoordinatorAgentService } from './agents/coordinator-agent.service.js';
import type { ExternalAgentResult } from './agents/external-agent.service.js';
import { ExternalAgentService } from './agents/external-agent.service.js';
import type { KnowledgeAgentResult } from './agents/knowledge-agent.service.js';
import { KnowledgeAgentService } from './agents/knowledge-agent.service.js';
import { ChatStreamError } from './chat.errors.js';
import { ChatService } from './chat.service.js';
import type { ChatRequestDto } from './dto/chat-request.dto.js';

type KnowledgeAgentSearchFn = KnowledgeAgentService['search'];
type ExternalAgentSearchFn = ExternalAgentService['search'];
type CoordinatorAgentGenerateAnswerFn =
  CoordinatorAgentService['generateAnswer'];

describe('ChatService', () => {
  let service: ChatService;
  let knowledgeAgent: {
    search: jest.MockedFunction<KnowledgeAgentSearchFn>;
  };
  let externalAgent: {
    search: jest.MockedFunction<ExternalAgentSearchFn>;
  };
  let coordinatorAgent: {
    generateAnswer: jest.MockedFunction<CoordinatorAgentGenerateAnswerFn>;
  };

  beforeEach(async () => {
    const knowledgeAgentMock = {
      search: jest.fn<KnowledgeAgentSearchFn>(),
    };

    const externalAgentMock = {
      search: jest.fn<ExternalAgentSearchFn>(),
    };

    const coordinatorAgentMock = {
      generateAnswer: jest.fn<CoordinatorAgentGenerateAnswerFn>(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: KnowledgeAgentService,
          useValue: knowledgeAgentMock,
        },
        {
          provide: ExternalAgentService,
          useValue: externalAgentMock,
        },
        {
          provide: CoordinatorAgentService,
          useValue: coordinatorAgentMock,
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    knowledgeAgent = module.get(KnowledgeAgentService);
    externalAgent = module.get(ExternalAgentService);
    coordinatorAgent = module.get(CoordinatorAgentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createChatStream', () => {
    const mockRequest: ChatRequestDto = {
      question: 'What is Cangyun?',
      topK: 6,
    };

    it('should call both knowledge and external agents in parallel', async () => {
      const knowledgeResult: KnowledgeAgentResult = {
        agent: 'knowledge',
        success: true,
        results: [
          {
            chunk: {
              id: 'chunk-1',
              documentId: 'doc-1',
              content: 'Test content',
              order: 0,
              metadata: {},
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            score: 0.95,
            document: {
              id: 'doc-1',
              externalId: 'ext-1',
              title: 'Test Doc',
              sourceUrl: 'https://example.com',
              metadata: {},
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        ],
      };

      const externalResult: ExternalAgentResult = {
        agent: 'external',
        success: true,
        results: [
          {
            title: 'External Result',
            url: 'https://external.com',
            snippet: 'External content',
          },
        ],
      };

      knowledgeAgent.search.mockResolvedValue(knowledgeResult);
      externalAgent.search.mockResolvedValue(externalResult);

      const mockStream = (async function* () {
        await Promise.resolve();
        yield 'Test';
        yield ' response';
      })();

      coordinatorAgent.generateAnswer.mockReturnValue(mockStream);

      const result = await service.createChatStream(mockRequest);

      expect(knowledgeAgent.search).toHaveBeenCalledTimes(1);
      expect(externalAgent.search).toHaveBeenCalledTimes(1);
      expect(result.sources).toHaveLength(2);
      expect(result.sources[0].sourceType).toBe('knowledge');
      expect(result.sources[1].sourceType).toBe('external');
    });

    it('should emit status events during processing', async () => {
      const knowledgeResult: KnowledgeAgentResult = {
        agent: 'knowledge',
        success: true,
        results: [],
      };
      const externalResult: ExternalAgentResult = {
        agent: 'external',
        success: true,
        results: [],
      };

      knowledgeAgent.search.mockResolvedValue(knowledgeResult);
      externalAgent.search.mockResolvedValue(externalResult);

      const mockStream = (async function* () {
        await Promise.resolve();
        yield 'response';
      })();

      coordinatorAgent.generateAnswer.mockReturnValue(mockStream);

      const statusEvents: ChatAgentStatus[] = [];
      const onStatus = (status: ChatAgentStatus) => {
        statusEvents.push(status);
      };

      const result = await service.createChatStream(mockRequest, onStatus);

      // Consume the stream to trigger generating status
      for await (const delta of result.stream) {
        void delta;
      }

      expect(statusEvents.length).toBeGreaterThan(0);
      expect(statusEvents.some((s) => s.step === 'searching')).toBe(true);
      expect(statusEvents.some((s) => s.step === 'generating')).toBe(true);
    });

    it('should handle knowledge agent failure gracefully', async () => {
      const knowledgeResult: KnowledgeAgentResult = {
        agent: 'knowledge',
        success: false,
        results: [],
      };
      const externalResult: ExternalAgentResult = {
        agent: 'external',
        success: true,
        results: [
          {
            title: 'External Result',
            url: 'https://external.com',
            snippet: 'External content',
          },
        ],
      };

      knowledgeAgent.search.mockResolvedValue(knowledgeResult);
      externalAgent.search.mockResolvedValue(externalResult);

      const mockStream = (async function* () {
        await Promise.resolve();
        yield 'response';
      })();

      coordinatorAgent.generateAnswer.mockReturnValue(mockStream);

      const result = await service.createChatStream(mockRequest);

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].sourceType).toBe('external');
    });

    it('should handle external agent failure gracefully', async () => {
      const knowledgeResult: KnowledgeAgentResult = {
        agent: 'knowledge',
        success: true,
        results: [
          {
            chunk: {
              id: 'chunk-1',
              documentId: 'doc-1',
              content: 'Test content',
              order: 0,
              metadata: {},
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            score: 0.95,
            document: {
              id: 'doc-1',
              externalId: 'ext-1',
              title: 'Test Doc',
              sourceUrl: 'https://example.com',
              metadata: {},
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        ],
      };
      const externalResult: ExternalAgentResult = {
        agent: 'external',
        success: false,
        results: [],
      };

      knowledgeAgent.search.mockResolvedValue(knowledgeResult);
      externalAgent.search.mockResolvedValue(externalResult);

      const mockStream = (async function* () {
        await Promise.resolve();
        yield 'response';
      })();

      coordinatorAgent.generateAnswer.mockReturnValue(mockStream);

      const result = await service.createChatStream(mockRequest);

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].sourceType).toBe('knowledge');
    });

    it('should handle both agents failing', async () => {
      const knowledgeResult: KnowledgeAgentResult = {
        agent: 'knowledge',
        success: false,
        results: [],
      };
      const externalResult: ExternalAgentResult = {
        agent: 'external',
        success: false,
        results: [],
      };

      knowledgeAgent.search.mockResolvedValue(knowledgeResult);
      externalAgent.search.mockResolvedValue(externalResult);

      const mockStream = (async function* () {
        await Promise.resolve();
        yield 'response';
      })();

      coordinatorAgent.generateAnswer.mockReturnValue(mockStream);

      const result = await service.createChatStream(mockRequest);

      expect(result.sources).toHaveLength(0);
    });

    it('should stream response deltas correctly', async () => {
      const knowledgeResult: KnowledgeAgentResult = {
        agent: 'knowledge',
        success: true,
        results: [],
      };
      const externalResult: ExternalAgentResult = {
        agent: 'external',
        success: true,
        results: [],
      };

      knowledgeAgent.search.mockResolvedValue(knowledgeResult);
      externalAgent.search.mockResolvedValue(externalResult);

      const mockStream = (async function* () {
        await Promise.resolve();
        yield 'Hello';
        yield ' ';
        yield 'World';
      })();

      coordinatorAgent.generateAnswer.mockReturnValue(mockStream);

      const result = await service.createChatStream(mockRequest);

      const deltas: string[] = [];
      for await (const delta of result.stream) {
        deltas.push(delta);
      }

      expect(deltas).toEqual(['Hello', ' ', 'World']);
    });

    it('should resume stream on network error', async () => {
      const knowledgeResult: KnowledgeAgentResult = {
        agent: 'knowledge',
        success: true,
        results: [],
      };
      const externalResult: ExternalAgentResult = {
        agent: 'external',
        success: true,
        results: [],
      };

      knowledgeAgent.search.mockResolvedValue(knowledgeResult);
      externalAgent.search.mockResolvedValue(externalResult);

      let callCount = 0;

      // First call: stream that fails with network error
      const failingStream = (async function* () {
        await Promise.resolve();
        yield 'Part 1';
        throw new Error('fetch failed');
      })();

      // Second call: resumed stream
      const resumedStream = (async function* () {
        await Promise.resolve();
        yield ' Part 2';
      })();

      coordinatorAgent.generateAnswer.mockImplementation(
        (): AsyncIterable<string> => {
          callCount++;
          return callCount === 1 ? failingStream : resumedStream;
        },
      );

      const result = await service.createChatStream(mockRequest);

      const deltas: string[] = [];
      for await (const delta of result.stream) {
        deltas.push(delta);
      }

      expect(coordinatorAgent.generateAnswer).toHaveBeenCalledTimes(2);
      expect(deltas).toEqual(['Part 1', ' Part 2']);
    });

    it('should throw error after max retries exceeded', async () => {
      const knowledgeResult: KnowledgeAgentResult = {
        agent: 'knowledge',
        success: true,
        results: [],
      };
      const externalResult: ExternalAgentResult = {
        agent: 'external',
        success: true,
        results: [],
      };

      knowledgeAgent.search.mockResolvedValue(knowledgeResult);
      externalAgent.search.mockResolvedValue(externalResult);

      // Create streams that always fail
      const failingStream = async function* (): AsyncGenerator<string> {
        await Promise.resolve();
        yield 'Part';
        throw new Error('fetch failed');
      };

      coordinatorAgent.generateAnswer.mockImplementation(
        (): AsyncIterable<string> => failingStream(),
      );

      const result = await service.createChatStream(mockRequest);

      const consumeStream = async () => {
        const deltas: string[] = [];
        for await (const delta of result.stream) {
          deltas.push(delta);
        }
        return deltas;
      };

      await expect(consumeStream()).rejects.toThrow(ChatStreamError);
      expect(coordinatorAgent.generateAnswer).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should throw error immediately on non-network errors', async () => {
      const knowledgeResult: KnowledgeAgentResult = {
        agent: 'knowledge',
        success: true,
        results: [],
      };
      const externalResult: ExternalAgentResult = {
        agent: 'external',
        success: true,
        results: [],
      };

      knowledgeAgent.search.mockResolvedValue(knowledgeResult);
      externalAgent.search.mockResolvedValue(externalResult);

      const failingStream = (async function* () {
        await Promise.resolve();
        yield 'Part';
        throw new Error('Internal server error');
      })();

      coordinatorAgent.generateAnswer.mockReturnValue(failingStream);

      const result = await service.createChatStream(mockRequest);

      const consumeStream = async () => {
        const deltas: string[] = [];
        for await (const delta of result.stream) {
          deltas.push(delta);
        }
        return deltas;
      };

      await expect(consumeStream()).rejects.toThrow();
      expect(coordinatorAgent.generateAnswer).toHaveBeenCalledTimes(1); // no retries
    });

    it('should pass history to coordinator agent', async () => {
      const requestWithHistory: ChatRequestDto = {
        question: 'Follow-up question',
        topK: 6,
        history: [
          { role: 'user', content: 'Initial question' },
          { role: 'assistant', content: 'Initial answer' },
        ],
      };

      const knowledgeResult: KnowledgeAgentResult = {
        agent: 'knowledge',
        success: true,
        results: [],
      };
      const externalResult: ExternalAgentResult = {
        agent: 'external',
        success: true,
        results: [],
      };

      knowledgeAgent.search.mockResolvedValue(knowledgeResult);
      externalAgent.search.mockResolvedValue(externalResult);

      const mockStream = (async function* () {
        await Promise.resolve();
        yield 'response';
      })();

      coordinatorAgent.generateAnswer.mockReturnValue(mockStream);

      const result = await service.createChatStream(requestWithHistory);

      // Consume the stream to trigger generateAnswer call
      for await (const delta of result.stream) {
        void delta;
      }

      expect(coordinatorAgent.generateAnswer).toHaveBeenCalledWith(
        expect.objectContaining({
          history: requestWithHistory.history,
        }),
      );
    });

    it('should deduplicate sources by URL', async () => {
      const knowledgeResult: KnowledgeAgentResult = {
        agent: 'knowledge',
        success: true,
        results: [],
      };
      const externalResult: ExternalAgentResult = {
        agent: 'external',
        success: true,
        results: [
          {
            title: 'Result 1',
            url: 'https://example.com',
            snippet: 'Content 1',
          },
          {
            title: 'Result 2',
            url: 'https://example.com', // duplicate URL
            snippet: 'Content 2',
          },
        ],
      };

      knowledgeAgent.search.mockResolvedValue(knowledgeResult);
      externalAgent.search.mockResolvedValue(externalResult);

      const mockStream = (async function* () {
        await Promise.resolve();
        yield 'response';
      })();

      coordinatorAgent.generateAnswer.mockReturnValue(mockStream);

      const result = await service.createChatStream(mockRequest);

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].url).toBe('https://example.com');
    });
  });
});
