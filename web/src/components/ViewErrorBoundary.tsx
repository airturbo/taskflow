import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  viewName: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ViewErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(`[ViewErrorBoundary] ${this.props.viewName} crashed:`, error, errorInfo)
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null })
  }

  private handleCopyDebug = () => {
    const { error } = this.state
    if (!error) return
    const text = `${error.message}\n${error.stack ?? ''}`
    navigator.clipboard.writeText(text).catch(() => {
      // silent fallback
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="view-error-boundary-fallback">
          <h3>此视图出现问题</h3>
          <p>{this.props.viewName}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={this.handleReload}>重新加载</button>
            <button onClick={this.handleCopyDebug}>复制调试信息</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
