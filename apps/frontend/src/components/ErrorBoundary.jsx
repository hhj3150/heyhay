/**
 * @fileoverview 에러 바운더리 — 페이지 크래시 방지
 * 컴포넌트 에러 발생 시 전체 앱 대신 해당 영역만 에러 표시
 */
import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
          <h2 className="text-lg font-bold text-slate-800 mb-2">페이지 로드 오류</h2>
          <p className="text-sm text-slate-500 mb-4 text-center max-w-md">
            일시적 오류가 발생했습니다. 새로고침을 시도해주세요.
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600"
          >
            <RefreshCw className="w-4 h-4" /> 새로고침
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
