import { ArrowRight } from 'lucide-react';
import { Button } from '@cangyun-ai/ui/components/ui/button';

export function HomeRoute() {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-8 text-center">
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
          欢迎来到
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Cangyun AI 控制台
        </h1>
        <p className="text-base text-muted-foreground sm:text-lg">
          我们采用 React Router v7 Declarative
          Mode，以最简洁的方式启动路由系统。
          后续可在此基础上扩展聊天、仪表盘及更多业务模块。
        </p>
      </div>
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button asChild className="gap-2">
          <a
            href="https://reactrouter.com/start/declarative"
            target="_blank"
            rel="noreferrer"
          >
            Declarative Mode 指南
            <ArrowRight className="h-4 w-4" />
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a
            href="https://github.com/remix-run/react-router"
            target="_blank"
            rel="noreferrer"
          >
            查看仓库
          </a>
        </Button>
      </div>
    </section>
  );
}
