import type { Instrumentation } from "next"
import { reportError } from "@/lib/monitoring"

/**
 * Server-side observability hooks. Next calls `onRequestError` for uncaught
 * errors in Server Components, Route Handlers, Server Actions and the proxy.
 *
 * Sentry: after installing @sentry/nextjs, add a `register()` export that
 * initialises it (guarded by NEXT_PUBLIC_SENTRY_DSN) and passes Sentry to
 * setErrorReporter().
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  reportError(error, {
    // Drop the query string: it can carry auth codes and tokens.
    path: request.path.split("?")[0],
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  })
}
