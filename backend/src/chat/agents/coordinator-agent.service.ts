import { Injectable, Logger } from '@nestjs/common';
import { AIService, AiMessage } from '../../ai/index.js';
import type { KnowledgeAgentResult } from './knowledge-agent.service.js';
import type { ExternalAgentResult } from './external-agent.service.js';

export interface CoordinatorAgentInput {
  question: string;
  knowledgeResults: KnowledgeAgentResult;
  externalResults: ExternalAgentResult;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  accumulatedContent?: string; // 已生成的内容，用于续上
}

/**
 * 主协调 Agent
 * 接收知识库搜索和外部搜索的结果，使用 OpenAI 生成最终答案
 */
@Injectable()
export class CoordinatorAgentService {
  private readonly logger = new Logger(CoordinatorAgentService.name);

  constructor(private readonly aiService: AIService) {}

  generateAnswer(input: CoordinatorAgentInput): AsyncIterable<string> {
    // 移除 debug 日志，减少终端输出

    const systemMessage = this.buildSystemPrompt();
    const userMessage = this.buildUserPrompt(
      input.question,
      input.knowledgeResults,
      input.externalResults,
    );

    const messages: AiMessage[] = [
      { role: 'system', content: systemMessage },
      ...this.transformHistory(input.history ?? []),
      { role: 'user', content: userMessage },
    ];

    // 如果有已生成的内容，添加续写提示
    if (input.accumulatedContent && input.accumulatedContent.length > 0) {
      messages.push({
        role: 'assistant',
        content: input.accumulatedContent,
      });
      messages.push({
        role: 'user',
        content:
          '由于网络中断，上面的回答被截断了。请继续完成回答，从刚才中断的地方继续，不要重复已写的内容。',
      });
    }

    const stream = this.aiService.streamText({
      messages,
      temperature: 0.3,
      maxToolRoundtrips: 0, // 协调 Agent 不需要工具调用
    });

    return stream;
  }

  private buildSystemPrompt(): string {
    const now = new Date();
    return [
      '你是《剑网三》苍云分山劲 PVE 助手，需提供专业、准确、可执行的建议。',
      '你是一个协调 Agent，负责整合知识库搜索和外部搜索的结果，生成最终答案。',
      '回答应优先依据提供的资料。如果提供了相关资料，即使内容不完整，也要基于已有资料给出回答，并说明这是基于现有资料的回答。',
      '只有在完全没有相关资料时，才说明"暂无相关资料"。',
      '若资料与用户问题部分相关但不完全匹配，需要基于现有资料回答，并指出可能存在的差异或局限性。',
      '重要：如果检索到了相关资料（即使只有部分相关），必须基于这些资料给出回答，不要因为资料不完整就拒绝回答。只有在完全没有检索到任何相关资料时，才说明资料不足。',
      '剑网三一个等级有四个赛季，每个赛季有不同的故事背景、剧情、玩法、装备、技能等。',
      '剑网三有两个客户端，一个是旗舰端一个是无界端',
      '无界端是剑网三的移动客户端，旗舰端是剑网三的桌面客户端,两个客户端的技能和心法是不同的，需要使用不同的客户端查看。你只需要回答旗舰端的内容。',
      '对于技能和心法，有时候有后缀·悟，这个后缀是指无界端的技能和心法，需要使用无界端查看。关于无界的技能和心法你不需要回答，只需要回答旗舰端的技能和心法。',
      `当前时间：${now.toISOString()}`,
      '当前等级：130级',
      '当前赛季：为130级第三赛季，即为山海源流赛季。第一赛季叫丝路风语，第二赛季叫太极秘录，第三赛季叫山海源流。',
      '引用和搜索时都要优先"山海源流"赛季的苍云（分山劲）攻略或苍云（分山劲）技改。如果检索结果中包含多个赛季的文档，必须优先使用山海源流赛季的文档。',
      '特别重要：当回答关于奇穴的问题时，必须优先引用知识库中的"山海源流-苍云技改.md"文件（完整文件名："山海源流"资料片武学调整-苍云）。该文件是山海源流赛季所有奇穴效果的官方权威来源，包含了分山劲和铁骨衣的完整奇穴调整说明。',
      '关键规则：只要用户问题中提到了任何奇穴名称、奇穴效果、奇穴选择、奇穴搭配等相关内容，必须优先使用"山海源流-苍云技改.md"文件中的描述。即使检索结果中有其他文档提到了奇穴，也必须以该文件为准，因为这是最新的官方技改文档。',
      '如果检索到了"山海源流-苍云技改.md"文件，必须严格按照该文件中的奇穴描述来回答，不要使用其他文档中的旧版本奇穴描述。',
      '对于副本相关的问题，优先搜索和引用"会战弓月城"、"普通弓月城"、"英雄弓月城"、"pt弓月城"、"yx弓月城"相关的文档。',
      '对于苍云职业，它有两个心法，一个叫分山劲一个叫铁骨衣，分山劲是输出心法，铁骨衣是防御心法。',
      '对于苍云职业的基础理解、机制知识（如怒气、技能调息时间、公共调息时间等），优先引用数据库中的"苍云进阶机制（2025）"文档，该文档详细说明了玩剑网三和苍云职业分山劲心法的通用知识。',
      '对于技能和奇穴的基础效果，可以参考"太极秘录｜分山劲白皮书"文档。虽然它不是最新赛季的文档，但它讲了很多技能和奇穴的基础知识。需要注意的是，有一些内容已经在山海源流的最新技改中失效或者更改了，回答时需要结合山海源流赛季的最新信息进行说明。',
      '重要：关于山海源流赛季的最新奇穴描述，必须参照知识库中的"山海源流-苍云技改.md"文件（完整文件名："山海源流"资料片武学调整-苍云）。该文件包含了所有奇穴的最新效果描述，包括分山劲和铁骨衣的所有奇穴调整。回答奇穴相关问题时，必须优先使用该文件中的描述，这是最权威和最新的奇穴信息来源。',
      '奇穴回答规则：1) 如果问题涉及任何奇穴，必须优先查找并引用"山海源流-苍云技改.md"文件；2) 该文件中的奇穴描述是唯一正确的版本；3) 不要使用其他文档中的奇穴描述，即使它们看起来相关；4) 如果检索到了该文件，必须基于该文件回答，不得使用其他来源。',
      '奇穴选择规则：每一层奇穴中有多个奇穴选项，玩家只能从每一层中选择一个奇穴。混池（混选奇穴）中，玩家可以选择3个奇穴。',
      '当前版本（山海源流赛季）的常用奇穴选择1-10层分别是：第一层-绝返，第二层-业火麟光，第三层-援戈，第四层-刀煞，第五层-惊涌，第六层-嗜血，第七层-阵云结晦，第八层-麾远，第九层-血誓，第十层-锋鸣。',
      '以下是苍云分山劲心法主要技能的必点秘籍效果：',
      '- 斩刀：5%伤害，4%伤害，3%伤害，4%会心。',
      '- 绝刀：5%伤害，4%伤害，4%会心，减15怒消耗。',
      '- 盾压：5%伤害，4%伤害，4%会心，3%会心。',
      '- 盾飞：5%伤害，4%伤害，5秒持续，5秒持续。',
      '- 血怒：回5怒，1秒持续，1秒持续，1秒持续。',
      '特别注意：橙武（cw）会在上述盾飞秘籍的基础上，对其效果进行额外修改。',
      '技能循环缩写说明：击=盾击，斩=斩刀，绝=绝刀，猛=盾猛，压=盾压，怒=血怒，业=业火麟光，云=阵云结晦第一段，月=阵云结晦第二段（月照连营），雁=阵云结晦第三段（雁门招递）。',
      '紫色武器的5分钟技能循环示例：击业 - 怒斩绝绝斩 - 击击 - 绝绝云 击击 - 斩怒绝绝 击击击击 - 月斩绝绝 击猛击击击 - 斩怒绝绝 击击击 - 雁云斩绝绝 击猛击击击 - 斩绝绝 击击击业 - 怒月雁斩绝绝斩 - 击击 - 绝绝 击猛击 - 斩怒绝绝 击击击击 - 云斩绝绝 击猛击击击 - 斩怒绝绝 击击击 - 月雁斩绝绝 击猛击击击 - 斩绝绝 击击击业 - 怒云月斩绝绝斩 - 击击 - 绝绝 击猛击 - 斩怒绝绝 击击击击 - 雁斩绝绝 击猛击击击 - 斩怒绝绝 击击 - 云月雁斩绝绝 击猛击击击 - 斩绝绝 击击击击业 - 怒云斩绝绝斩 - 击击 - 绝绝 击猛击 - 斩怒绝绝 击击击 - 月雁斩绝绝 击猛击击击 - 斩怒绝绝 击击击 - 云月斩绝绝 击猛击击击 - 斩绝绝 击击击业 - 怒雁斩绝绝斩 - 击击 - 绝绝 击击击击 - 斩怒绝绝 击击 - 云月雁斩绝绝 击猛击击击 - 斩绝绝。',
      '主动招式都是可以使用的技能，被动招式基本都是修饰技能的奇穴，可能有例外。',
      '当前赛季体验服的技改时间是：2025-9-16 10:00:00，正式服的技改时间是：2025-10-28 10:00:00。',
      '这个 [x][x] 的意思是可以选择技能填充。',
      '一般的填充技能是盾猛，盾压，阵云结晦，这三个技能都是可以回复15怒气，其中阵云结晦是伤害最高的技能。',
      '阵云结晦的技能描述是：对目标造成伤害，并回复15怒气。它有两重充能，每重充能可以释放三次，三段伤害递增。每段都可以回复15怒气。',
      '注意，援戈是一个修饰盾击技能的奇穴。而不是技能。记得检查援戈这个奇穴效果。',
      '注意，血影是援戈奇穴带来的效果，具体可以检查援戈这个奇穴的描述。',
      '术语说明：cw=橙武（橙色品质武器）。',
      '重要变化：cw（橙武）从被动触发改成了主动使用。',
      '重要：你需要同时使用知识库搜索和外部搜索的结果来回答问题。',
      '回答结构要求：',
      '1. 首先基于知识库中的资料给出主要答案（如果知识库有相关材料）',
      '2. 如果外部搜索有结果，需要补充外部搜索的信息',
      '3. 如果外部搜索返回了错误信息，不要认为没有资料，必须使用知识库中的资料回答问题，并在回答中说明外部搜索暂时不可用',
      '4. 在回答中明确标注信息来源，例如："根据知识库中的资料..." 或 "根据外部搜索的最新信息..."',
      '5. 如果知识库和外部搜索都有相关信息，需要综合两者给出完整答案',
      '6. 如果只有知识库有资料，必须使用知识库的资料回答',
      '7. 如果只有外部搜索有资料，使用外部搜索的资料回答',
      '输出请使用简洁的中文，先给结论再给步骤或原因，并以 [标题](URL) 形式列出 2-5 条引用；若资料不足，请明确说明。',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildUserPrompt(
    question: string,
    knowledgeResults: KnowledgeAgentResult,
    externalResults: ExternalAgentResult,
  ): string {
    // 构建知识库上下文
    // 如果涉及奇穴问题，优先排序"山海源流-苍云技改.md"文件
    const isQixueQuestion = question.toLowerCase().includes('奇穴');
    const sortedResults =
      knowledgeResults.success && knowledgeResults.results.length > 0
        ? [...knowledgeResults.results].sort((a, b) => {
            const aTitle = a.document.title.toLowerCase();
            const bTitle = b.document.title.toLowerCase();

            if (isQixueQuestion) {
              // 如果问题涉及奇穴，优先显示"山海源流"相关文档
              const aIsShanhai =
                aTitle.includes('山海源流') ||
                aTitle.includes('苍云技改') ||
                aTitle.includes('资料片武学调整');
              const bIsShanhai =
                bTitle.includes('山海源流') ||
                bTitle.includes('苍云技改') ||
                bTitle.includes('资料片武学调整');
              if (aIsShanhai && !bIsShanhai) return -1;
              if (!aIsShanhai && bIsShanhai) return 1;
            }
            return 0;
          })
        : [];

    const knowledgeContext =
      sortedResults.length > 0
        ? sortedResults
            .map(
              (hit, index) =>
                `【知识库资料 ${index + 1}】${hit.document.title}\n${hit.chunk.content}`,
            )
            .join('\n\n')
        : '';

    // 构建外部搜索上下文
    const externalContext =
      externalResults.success && externalResults.results.length > 0
        ? externalResults.results
            .map(
              (result, index) =>
                `【外部搜索结果 ${index + 1}】${result.title}\n链接：${result.url}${result.snippet ? `\n摘要：${result.snippet}` : ''}`,
            )
            .join('\n\n')
        : '';

    const knowledgeStatus = knowledgeResults.success
      ? `知识库检索成功，命中 ${knowledgeResults.results.length} 条。`
      : `知识库检索失败：${knowledgeResults.error ?? '未知原因'}`;

    const externalStatusParts: string[] = [];
    if (externalResults.success) {
      externalStatusParts.push(
        externalResults.results.length > 0
          ? `外部搜索成功，命中 ${externalResults.results.length} 条。`
          : '外部搜索成功，但没有找到相关内容。',
      );
      if (externalResults.note) {
        externalStatusParts.push(`备注：${externalResults.note}`);
      }
    } else {
      externalStatusParts.push(
        `外部搜索失败：${externalResults.error ?? '未知原因'}`,
      );
      if (externalResults.note) {
        externalStatusParts.push(`备注：${externalResults.note}`);
      }
    }

    const sections = [
      `用户问题：${question}`,
      ['=== 检索状态 ===', knowledgeStatus, externalStatusParts.join(' ') || '']
        .filter((segment) => segment.trim().length > 0)
        .join('\n'),
      knowledgeContext || externalContext
        ? [
            knowledgeContext
              ? [
                  '=== 知识库搜索结果（来自 OpenAI 向量搜索）===',
                  knowledgeContext,
                ]
              : [],
            externalContext
              ? [
                  '=== 外部搜索结果（来自 Perplexity 联网搜索）===',
                  externalContext,
                  externalResults.note ? `\n注意：${externalResults.note}` : '',
                ]
              : [],
            '=== 重要提示 ===',
            '请必须基于以上搜索结果回答用户问题。即使资料不完整，也要尽可能基于现有资料提供有用的信息。',
            '特别提醒：',
            '1. 如果知识库有资料，必须首先基于知识库的资料给出答案',
            '2. 如果外部搜索有结果，需要综合知识库和外部搜索的信息给出完整答案',
            '3. 在回答中明确区分信息来源，例如："根据知识库中的资料..." 或 "根据外部搜索的最新信息..."',
            '4. 如果外部搜索失败或没有结果，必须使用知识库中的参考资料来回答问题',
            '5. 如果问题涉及奇穴，必须优先使用"山海源流-苍云技改.md"文件（完整文件名："山海源流"资料片武学调整-苍云）中的描述，这是唯一正确的奇穴信息来源',
            '6. 如果检索结果中包含"山海源流-苍云技改.md"文件，必须严格按照该文件中的奇穴描述来回答，不得使用其他文档中的旧版本奇穴描述',
          ]
            .flat()
            .filter(Boolean)
            .join('\n')
        : '当前知识库和外部搜索都没有检索到相关资料。请综合自身知识谨慎回答或提示资料缺失。',
    ].filter(Boolean);

    return sections.join('\n\n');
  }

  private transformHistory(
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): AiMessage[] {
    return history
      .filter((message) => message.content.trim().length > 0)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));
  }
}
