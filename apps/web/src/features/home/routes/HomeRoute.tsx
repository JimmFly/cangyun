import { ArrowRight, MessageSquare, Sparkles } from 'lucide-react';
import { Button } from '@cangyun-ai/ui/components/ui/button';
import { Link } from 'react-router';

export function HomeRoute() {
  return (
    <section className="flex min-h-[calc(100vh-60px)] w-full flex-col items-center justify-center px-6 py-20">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-12 text-center">
        {/* Hero Section */}
        <div className="flex flex-col items-center gap-8">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-sm">
            <Sparkles className="h-3 w-3 text-white/60" />
            <p className="text-xs font-medium uppercase tracking-wider text-white/60">
              AI-Powered Tactical Console
            </p>
          </div>

          <h1 className="text-balance text-6xl font-semibold leading-[1.1] tracking-tight text-white md:text-7xl lg:text-8xl">
            苍云分山劲
            <br />
            <span className="bg-gradient-to-r from-white via-neutral-200 to-white bg-clip-text text-transparent">
              多模态战术台
            </span>
          </h1>

          <p className="max-w-2xl text-balance text-lg leading-relaxed text-neutral-400 md:text-xl">
            基于 AI 的知识检索、图像识别与视频分析，
            <br className="hidden md:block" />
            为分山劲玩家提供智能化的战斗洞察与优化建议
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-4">
            <Button
              asChild
              size="lg"
              className="group h-12 rounded-full bg-white px-8 text-base font-medium text-black transition-all hover:scale-105 hover:bg-neutral-100 active:scale-95"
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
        <div className="mt-16 grid w-full gap-6 text-left md:grid-cols-3">
          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/10">
            <div className="absolute inset-0 bg-gradient-to-br from-white/0 via-white/0 to-white/5 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative">
              <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
                  Phase 1
                </span>
              </div>
              <h3 className="mb-3 text-xl font-semibold text-white">
                文字 RAG MVP
              </h3>
              <p className="leading-relaxed text-neutral-400">
                知识入库、检索排序与流式回答已经上线，提供引用可追溯的分山劲问答体验。
              </p>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/10">
            <div className="absolute inset-0 bg-gradient-to-br from-white/0 via-white/0 to-white/5 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative">
              <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
                  Phase 2
                </span>
              </div>
              <h3 className="mb-3 text-xl font-semibold text-white">
                图像识别与循环统计
              </h3>
              <p className="leading-relaxed text-neutral-400">
                集成
                OCR、技能模板与循环评分，解析战斗截图并给出可执行的优化建议。
              </p>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/10">
            <div className="absolute inset-0 bg-gradient-to-br from-white/0 via-white/0 to-white/5 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative">
              <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
                  Phase 3
                </span>
              </div>
              <h3 className="mb-3 text-xl font-semibold text-white">
                视频分析与报告
              </h3>
              <p className="leading-relaxed text-neutral-400">
                打造异步任务流，对战斗录像进行时间轴比对、关键事件标注与报告导出。
              </p>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-neutral-500">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            文字问答
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            循环识别
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
            战斗报告
          </span>
        </div>
      </div>
    </section>
  );
}
