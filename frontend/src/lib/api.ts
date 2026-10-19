declare global {
  interface Window {
    csrf_token?: string
  }
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const API = "towel_portal.api.portal."
const LOGIN_URL = "/login?redirect-to=/portal"

const strip = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()

function serverMessage(body: any, fallback: string): string {
  try {
    if (body?._server_messages) {
      const msgs = JSON.parse(body._server_messages).map((m: string) => JSON.parse(m).message)
      if (msgs.length) return strip(msgs.join(" · "))
    }
  } catch {
    /* fall through */
  }
  if (body?.exception) {
    // "frappe.exceptions.ValidationError: message"
    const text = String(body.exception).split(":").slice(1).join(":").trim()
    if (text) return strip(text)
  }
  return fallback
}

let csrfPromise: Promise<string> | null = null
async function csrfToken(): Promise<string> {
  const t = window.csrf_token
  if (t && !t.includes("{{")) return t
  // Dev server: the page isn't rendered by Frappe, so ask for the token
  csrfPromise ??= fetch(`/api/method/${API}get_csrf_token`, { credentials: "same-origin" })
    .then((r) => r.json())
    .then((b) => (window.csrf_token = b.message))
    .catch(() => "")
  return csrfPromise
}

type MessageSink = (raw: string) => void
let messageSink: MessageSink | null = null
/** Registers where `_server_messages` (server-side msgprint on successful calls) are shown. */
export function onServerMessages(sink: MessageSink) {
  messageSink = sink
}

/** Call any whitelisted Frappe method (full dotted path, or a portal API name). */
export async function call<T = any>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  return (await callRaw(method, args)).message as T
}

/** Like `call` but returns the whole response body (`message`, `docs`, ...). */
export async function callRaw(method: string, args: Record<string, unknown> = {}): Promise<{ message?: any; docs?: any[]; [k: string]: any }> {
  const path = method.includes(".") ? method : API + method
  const res = await fetch(`/api/method/${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-Frappe-CSRF-Token": await csrfToken() },
    body: JSON.stringify(args),
  })
  const body = await res.json().catch(() => ({}))
  if (res.status === 401 || (res.status === 403 && !body?._server_messages && !body?.exception)) {
    window.location.href = LOGIN_URL
    throw new ApiError("Session expired", res.status)
  }
  if (!res.ok) throw new ApiError(serverMessage(body, res.statusText || "Request failed"), res.status)
  if (body._server_messages && messageSink) messageSink(body._server_messages)
  return body
}
