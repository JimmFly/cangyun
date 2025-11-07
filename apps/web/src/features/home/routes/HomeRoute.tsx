import {
  ArrowRight,
  MessageSquare,
  Sparkles,
  Database,
  Search,
  Brain,
  Zap,
} from 'lucide-react';
import { Button } from '@cangyun-ai/ui/components/ui/button';
import { Link } from 'react-router';

export function HomeRoute() {
  return (
    <section className="flex min-h-[calc(100vh-60px)] w-full flex-col items-center justify-center px-6 py-16 md:py-24">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-16 text-center">
        {/* Hero Section */}
        <div className="flex flex-col items-center gap-8">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            <p className="text-xs font-medium uppercase tracking-wider text-white/70">
              AI 驱动的苍云分山劲循环助手
            </p>
          </div>

          <h1 className="text-balance text-5xl font-bold leading-[1.1] tracking-tight text-white md:text-6xl lg:text-7xl">
            苍云分山劲
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-500 bg-clip-text text-transparent">
              循环助手
            </span>
          </h1>

          <p className="max-w-2xl text-balance text-base leading-relaxed text-neutral-300 md:text-lg">
            基于 AI 多 Agent 协作的知识检索与问答系统
            <br className="hidden md:block" />
            结合知识库和实时搜索，为分山劲玩家提供专业的技能循环、装备搭配和手法优化建议
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-4">
            <Button
              asChild
              size="lg"
              className="group h-12 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 px-8 text-base font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:scale-105 hover:shadow-xl hover:shadow-blue-500/30 active:scale-95"
            >
              <Link to="/chat" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 transition-transform group-hover:scale-110" />
                开始对话
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              asChild
              className="group h-12 rounded-full border-white/20 bg-white/5 px-8 text-base font-medium text-white backdrop-blur-sm transition-all hover:border-white/30 hover:bg-white/10 active:scale-95"
            >
              <a
                href="https://github.com/jimmfly/cangyun/blob/main/docs/development-plan.md"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2"
              >
                查看路线图
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid w-full gap-6 text-left md:grid-cols-3">
          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-8 backdrop-blur-sm transition-all hover:border-blue-500/30 hover:bg-gradient-to-br hover:from-blue-500/10 hover:to-white/5">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 via-blue-500/0 to-blue-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-blue-500/20 p-2">
                  <Database className="h-5 w-5 text-blue-400" />
                </div>
                <div className="inline-flex items-center gap-2 rounded-lg bg-green-500/20 px-3 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-green-400">
                    已上线
                  </span>
                </div>
              </div>
              <h3 className="mb-3 text-xl font-semibold text-white">
                知识库检索
              </h3>
              <p className="leading-relaxed text-neutral-300">
                基于 OpenAI
                向量搜索的知识库，涵盖山海源流赛季攻略、技能循环、装备搭配等专业内容，提供可追溯的引用来源。
              </p>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-8 backdrop-blur-sm transition-all hover:border-cyan-500/30 hover:bg-gradient-to-br hover:from-cyan-500/10 hover:to-white/5">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/0 via-cyan-500/0 to-cyan-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-cyan-500/20 p-2">
                  <Search className="h-5 w-5 text-cyan-400" />
                </div>
                <div className="inline-flex items-center gap-2 rounded-lg bg-green-500/20 px-3 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-green-400">
                    已上线
                  </span>
                </div>
              </div>
              <h3 className="mb-3 text-xl font-semibold text-white">
                实时网络搜索
              </h3>
              <p className="leading-relaxed text-neutral-300">
                集成 Perplexity
                联网搜索，实时获取最新攻略站内容，结合知识库提供更全面、更及时的回答。
              </p>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-8 backdrop-blur-sm transition-all hover:border-purple-500/30 hover:bg-gradient-to-br hover:from-purple-500/10 hover:to-white/5">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 via-purple-500/0 to-purple-500/5 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative">
              <div className="mb-4 flex items-center gap-3">
                <div className="rounded-lg bg-purple-500/20 p-2">
                  <Brain className="h-5 w-5 text-purple-400" />
                </div>
                <div className="inline-flex items-center gap-2 rounded-lg bg-blue-500/20 px-3 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                    开发中
                  </span>
                </div>
              </div>
              <h3 className="mb-3 text-xl font-semibold text-white">
                多 Agent 协作
              </h3>
              <p className="leading-relaxed text-neutral-300">
                知识库 Agent、外部搜索 Agent 和协调 Agent
                并行工作，智能整合多源信息，提供更准确、更全面的回答。
              </p>
            </div>
          </div>
        </div>

        {/* Key Features */}
        <div className="mt-8 grid w-full gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className="rounded-lg bg-blue-500/20 p-2">
              <Zap className="h-4 w-4 text-blue-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">实时流式回答</p>
              <p className="text-xs text-neutral-400">SSE 流式输出</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className="rounded-lg bg-green-500/20 p-2">
              <MessageSquare className="h-4 w-4 text-green-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">智能对话</p>
              <p className="text-xs text-neutral-400">上下文理解</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className="rounded-lg bg-purple-500/20 p-2">
              <Database className="h-4 w-4 text-purple-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">引用追溯</p>
              <p className="text-xs text-neutral-400">来源可查</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className="rounded-lg bg-cyan-500/20 p-2">
              <Brain className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">Agent 状态</p>
              <p className="text-xs text-neutral-400">工作流程可视化</p>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-neutral-400">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            <span className="text-neutral-300">知识库检索</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            <span className="text-neutral-300">实时网络搜索</span>
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            <span className="text-neutral-300">多 Agent 协作</span>
          </span>
        </div>
      </div>
    </section>
  );
}
