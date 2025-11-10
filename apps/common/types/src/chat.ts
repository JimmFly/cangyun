import { z } from 'zod';

export const chatMessageRoleSchema = z.enum(['user', 'assistant']);

export type ChatMessageRole = z.infer<typeof chatMessageRoleSchema>;

export const chatHistoryMessageSchema = z.object({
  role: chatMessageRoleSchema,
  content: z.string().trim().min(1, 'message content is required'),
});

export type ChatHistoryMessage = z.infer<typeof chatHistoryMessageSchema>;

export const chatAttachmentSchema = z.object({
  id: z.string().trim().min(1, 'attachment id is required'),
  name: z.string().trim().min(1, 'attachment name is required'),
  mimeType: z.string().trim().min(1, 'attachment mimeType is required'),
  size: z
    .number()
    .int()
    .nonnegative()
    .max(20 * 1024 * 1024, 'attachment exceeds 20MB limit')
    .optional(),
  /**
   * Data URL (e.g. `data:image/png;base64,...`) generated on the client.
   */
  dataUrl: z
    .string()
    .trim()
    .min(1, 'attachment payload is required')
    .refine(
      value => value.startsWith('data:'),
      'attachment payload must be a data URL'
    ),
});

export type ChatAttachmentPayload = z.infer<typeof chatAttachmentSchema>;

export const chatRequestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, 'question is required')
    .max(2000, 'question is too long'),
  topK: z.number().int().positive().max(20).optional(),
  history: z
    .array(chatHistoryMessageSchema)
    .max(50, 'history is too long')
    .optional(),
  attachments: z
    .array(chatAttachmentSchema)
    .max(4, 'attachments limit exceeded')
    .optional(),
});

export type ChatRequestPayload = z.infer<typeof chatRequestSchema>;

export const chatSourceSchema = z.object({
  id: z.string().trim().min(1),
  chunkId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  url: z.string().url().optional(),
  order: z.number().int().nonnegative(),
  sourceType: z.enum(['knowledge', 'external']).optional(),
});

export type ChatSource = z.infer<typeof chatSourceSchema>;

export const chatAgentStatusSchema = z.object({
  step: z.string().trim().min(1),
  label: z.string().trim().min(1),
  tool: z.string().trim().min(1).optional(),
  agent: z.string().trim().min(1).optional(),
});

export type ChatAgentStatus = z.infer<typeof chatAgentStatusSchema>;

const statusEventSchema = z.object({
  type: z.literal('status'),
  data: chatAgentStatusSchema,
});

const sourcesEventSchema = z.object({
  type: z.literal('sources'),
  data: z.array(chatSourceSchema),
});

const deltaEventSchema = z.object({
  type: z.literal('delta'),
  data: z.string(),
});

const doneEventSchema = z.object({
  type: z.literal('done'),
});

const errorEventSchema = z.object({
  type: z.literal('error'),
  data: z.object({
    code: z.string().trim().min(1),
    message: z.string().trim().min(1),
    requestId: z.string().uuid(),
  }),
});

export const chatSseEventSchema = z.discriminatedUnion('type', [
  statusEventSchema,
  sourcesEventSchema,
  deltaEventSchema,
  doneEventSchema,
  errorEventSchema,
]);

export type ChatSseEvent = z.infer<typeof chatSseEventSchema>;
export type ChatSseStatusEvent = z.infer<typeof statusEventSchema>;
export type ChatSseSourcesEvent = z.infer<typeof sourcesEventSchema>;
export type ChatSseDeltaEvent = z.infer<typeof deltaEventSchema>;
export type ChatSseDoneEvent = z.infer<typeof doneEventSchema>;
export type ChatSseErrorEvent = z.infer<typeof errorEventSchema>;
