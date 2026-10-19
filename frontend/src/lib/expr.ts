import type { Row } from "./types"

type Ctx = { doc: Row; parent?: Row; roles: string[] }

const cache = new Map<string, Function>()

/**
 * Evaluates Frappe's `depends_on`-style expressions: either `eval:<js>` or a bare fieldname.
 * Anything that can't be evaluated returns `fallback`, so a field is never lost to a bad expression.
 */
export function evalExpr(expr: string | null | undefined, ctx: Ctx, fallback: boolean): boolean {
  if (!expr) return fallback
  if (!expr.startsWith("eval:")) return Boolean(ctx.doc[expr])
  try {
    const src = expr.slice(5)
    let fn = cache.get(src)
    if (!fn) {
      fn = new Function("doc", "parent", "frappe", `return (${src})`)
      cache.set(src, fn)
    }
    const frappe = { user: { has_role: (r: string) => ctx.roles.includes(r) }, boot: {} }
    return Boolean(fn(ctx.doc, ctx.parent ?? ctx.doc, frappe))
  } catch {
    return fallback
  }
}
