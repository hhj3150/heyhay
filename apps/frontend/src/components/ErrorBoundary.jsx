/**
 * @fileoverview 에러 바운더리 — 페이지 크래시 방지
 * 컴포넌트 에러 발생 시 전체 앱 대신 해당 영역만 에러 표시
 */
import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[HEY HAY MILK ERP] 에러 발생:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[50vh] p-6">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-500 flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">문제가 발생했습니다</h2>
            <p className="text-sm text-slate-500 mb-6">일시적인 오류입니다. 새로고침하거나 대시보드로 돌아가세요.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => window.location.reload()}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800">
                새로고침
              </button>
              <button onClick={() => { this.setState({ hasError: false }); window.location.href = '/' }}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50">
                대시보드로 이동
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
