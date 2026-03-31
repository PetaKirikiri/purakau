import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch() {}

  render() {
    if (this.state.error) {
      return (
        <div className="p-6 text-red-600">
          <h2>Something went wrong</h2>
          <pre className="mt-2 text-sm">{this.state.error.message}</pre>
        </div>
      )
    }
    return this.props.children
  }
}
