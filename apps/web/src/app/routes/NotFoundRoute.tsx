import { Link } from 'react-router';
import { Button } from '../../components/ui/button';

export function NotFoundRoute() {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-6 text-center">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          404
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">页面未找到</h1>
        <p className="text-sm text-muted-foreground">
          抱歉，您访问的页面不存在。请返回首页继续体验我们的 AI 控制台。
        </p>
      </div>
      <Button asChild>
        <Link to="/">返回首页</Link>
      </Button>
    </section>
  );
}
