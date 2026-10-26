import { Component, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

/** A crash in one form shows its message here instead of blanking the whole portal. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("[portal] render error", error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <p className="font-medium">Something went wrong on this page</p>
        <p className="mt-1 break-words rounded-md bg-muted px-3 py-2 text-left font-mono text-xs text-muted-foreground">{error.message}</p>
        <Button variant="outline" className="mt-4" onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    )
  }
}
