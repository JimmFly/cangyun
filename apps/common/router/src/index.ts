import type { AnalyticsEvent } from '@cangyun-ai/types'
import { createStaticHook } from '@cangyun-ai/hooks'
import {
  createAnalyticsClient,
  type AnalyticsClient,
  type AnalyticsTransport
} from '@cangyun-ai/analytics'

export interface RouteDefinition {
  id: string
  path: string
  requiresAuth?: boolean
}

export interface RouteGuardContext {
  route: RouteDefinition
  analytics: AnalyticsClient
}

export const useActiveRoute = createStaticHook<RouteDefinition | null>(null)

export const createRouteGuard = (transport: AnalyticsTransport) => {
  const analytics = createAnalyticsClient(transport)

  return async (route: RouteDefinition): Promise<boolean> => {
    const event: AnalyticsEvent = {
      name: 'route:view',
      payload: { id: route.id, path: route.path }
    }
    await analytics.track(event)
    return route.requiresAuth ? false : true
  }
}
