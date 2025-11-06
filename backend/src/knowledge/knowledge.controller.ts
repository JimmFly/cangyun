import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { KnowledgeService } from './knowledge.service.js';
import {
  ingestDocumentSchema,
  type IngestDocumentDto,
} from './dto/ingest-document.dto.js';

@Controller('api/v1/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get('documents')
  async listDocuments() {
    const documents = await this.knowledgeService.listDocuments();
    return { data: documents };
  }

  @Post('documents')
  @HttpCode(HttpStatus.CREATED)
  async ingestDocument(@Body() body: unknown) {
    const payload: IngestDocumentDto = ingestDocumentSchema.parse(body);

    const result = await this.knowledgeService.indexDocument({
      document: payload.document,
      chunks: payload.chunks,
      generateEmbeddings: payload.generateEmbeddings,
    });

    return {
      document: result.document,
      chunks: result.chunks,
    };
  }
}
