/**
 * @fileoverview AI 음성 비서 — 플로팅 채팅 위젯
 * Web Speech API (음성인식) + TTS (음성합성) + Claude Sonnet (AI 대화)
 *
 * 주요 기능:
 * - 음성인식 / 텍스트 입력 하이브리드
 * - 마크다운 스타일 메시지 렌더링 (bold, 줄바꿈, 이모지)
 * - 어시스턴트 타이핑 효과
 * - 주문 확인 카드 UI (상품 테이블 + 버튼)
 * - 카테고리별 제안 문구
 * - 반응형 모바일 전체화면
 * - 대화 초기화
 */
import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react'
import { apiPost } from '@/lib/api'
import {
  Mic, MicOff, X, Volume2, Loader2, MessageCircle,
  Search, ShoppingCart, Settings, RotateCcw, Check, XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── 카테고리별 제안 문구 ────────────────────────────────────
const SUGGESTION_GROUPS = [
  {
    label: '조회',
    icon: Search,
    items: [
      '오늘 전체 현황 요약해줘',
      '오늘 납유량은?',
      '이번달 납유대금은?',
      '구독자 몇 명이야?',
    ],
  },
  {
    label: '주문',
    icon: ShoppingCart,
    items: [
      '밀크카페 우유750 10개 주문해줘',
      '미처리 주문 있어?',
    ],
  },
  {
    label: '관리',
    icon: Settings,
    items: [
      '이번주 분만예정 개체는?',
      '재고 부족 품목 알려줘',
    ],
  },
]

// ─── 마크다운 간이 렌더러 ────────────────────────────────────
/**
 * 간단한 마크다운→JSX 변환
 * 지원: **bold**, 줄바꿈(\n), 이모지(그대로 출력)
 * @param {string} text
 * @returns {JSX.Element}
 */
function renderMarkdown(text) {
  if (!text) return null

  const lines = text.split('\n')

  return lines.map((line, lineIdx) => {
    // **bold** 처리
    const parts = line.split(/(\*\*[^*]+\*\*)/g)
    const rendered = parts.map((part, partIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={`${lineIdx}-${partIdx}`} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        )
      }
      return <span key={`${lineIdx}-${partIdx}`}>{part}</span>
    })

    return (
      <span key={lineIdx}>
        {lineIdx > 0 && <br />}
        {rendered}
      </span>
    )
  })
}

// ─── 타이핑 효과 훅 ─────────────────────────────────────────
/**
 * 어시스턴트 메시지에 글자가 하나씩 나타나는 효과
 * @param {string} fullText - 완성 텍스트
 * @param {boolean} shouldAnimate - 애니메이션 적용 여부
 * @param {number} speed - 글자당 ms (기본 18)
 * @returns {string} 현재까지 표시할 텍스트
 */
function useTypingEffect(fullText, shouldAnimate, speed = 18) {
  const [displayed, setDisplayed] = useState(shouldAnimate ? '' : fullText)
  const [isDone, setIsDone] = useState(!shouldAnimate)

  useEffect(() => {
    if (!shouldAnimate) {
      setDisplayed(fullText)
      setIsDone(true)
      return
    }

    setDisplayed('')
    setIsDone(false)
    let index = 0

    const timer = setInterval(() => {
      index += 1
      if (index >= fullText.length) {
        setDisplayed(fullText)
        setIsDone(true)
        clearInterval(timer)
      } else {
        setDisplayed(fullText.slice(0, index))
      }
    }, speed)

    return () => clearInterval(timer)
  }, [fullText, shouldAnimate, speed])

  return { displayed, isDone }
}

// ─── 메시지 버블 (메모이즈) ──────────────────────────────────
const MessageBubble = memo(function MessageBubble({ role, content, isLatestAssistant }) {
  const shouldAnimate = role === 'assistant' && isLatestAssistant
  const { displayed } = useTypingEffect(content, shouldAnimate)

  const isUser = role === 'user'

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 mr-2 mt-0.5">
          <MessageCircle className="w-3.5 h-3.5 text-white" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'bg-violet-500 text-white rounded-br-md'
            : 'bg-slate-100 text-slate-800 rounded-bl-md',
        )}
      >
        {isUser ? content : renderMarkdown(displayed)}
      </div>
    </div>
  )
})

// ─── 주문 확인 카드 ─────────────────────────────────────────
const OrderConfirmCard = memo(function OrderConfirmCard({ order, onConfirm, onCancel }) {
  if (!order) return null

  const items = order.items || [order]
  const totalAmount = items.reduce((sum, item) => {
    const price = item.unit_price ?? item.unitPrice ?? 0
    const qty = item.quantity ?? 0
    return sum + price * qty
  }, 0)

  return (
    <div className="mx-2 my-2 border border-violet-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* 카드 헤더 */}
      <div className="bg-violet-50 px-4 py-2.5 border-b border-violet-100 flex items-center gap-2">
        <ShoppingCart className="w-4 h-4 text-violet-600" />
        <span className="text-sm font-semibold text-violet-700">주문 확인</span>
      </div>

      {/* 상품 테이블 */}
      <div className="px-4 py-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 border-b">
              <th className="text-left pb-2 font-medium">상품명</th>
              <th className="text-right pb-2 font-medium">수량</th>
              <th className="text-right pb-2 font-medium">단가</th>
              <th className="text-right pb-2 font-medium">소계</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const price = item.unit_price ?? item.unitPrice ?? 0
              const qty = item.quantity ?? 0
              return (
                <tr key={idx} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 text-slate-700 font-medium">
                    {item.product_name ?? item.productName ?? item.name ?? '상품'}
                  </td>
                  <td className="py-2 text-right text-slate-600">{qty}</td>
                  <td className="py-2 text-right text-slate-600">
                    {price.toLocaleString()}원
                  </td>
                  <td className="py-2 text-right text-slate-800 font-semibold">
                    {(price * qty).toLocaleString()}원
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* 합계 */}
        <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100">
          <span className="text-xs text-slate-500">합계</span>
          <span className="text-base font-bold text-violet-700">
            {totalAmount.toLocaleString()}원
          </span>
        </div>
      </div>

      {/* 확인/취소 버튼 */}
      <div className="px-4 pb-3 flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 h-10 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 active:scale-[0.97] transition-all flex items-center justify-center gap-1.5"
        >
          <XCircle className="w-4 h-4" />
          취소
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 h-10 rounded-lg bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 active:scale-[0.97] transition-all flex items-center justify-center gap-1.5 shadow-sm"
        >
          <Check className="w-4 h-4" />
          주문하기
        </button>
      </div>
    </div>
  )
})

// ─── 제안 문구 패널 ─────────────────────────────────────────
const SuggestionsPanel = memo(function SuggestionsPanel({ onSelect }) {
  return (
    <div className="text-center py-4 px-2">
      <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
        <Mic className="w-7 h-7 text-violet-400" />
      </div>
      <p className="text-xs text-slate-400 mb-4">
        마이크 버튼을 누르고 말씀하거나, 아래 질문을 선택하세요
      </p>

      <div className="space-y-3 text-left">
        {SUGGESTION_GROUPS.map((group) => {
          const IconComp = group.icon
          return (
            <div key={group.label}>
              <div className="flex items-center gap-1.5 mb-1 px-2">
                <IconComp className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {group.label}
                </span>
              </div>
              <div className="space-y-0.5">
                {group.items.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSelect(s)}
                    className="block w-full text-left text-[11px] text-violet-600 hover:bg-violet-50 active:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    &ldquo;{s}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

// ─── 메인 컴포넌트 ───────────────────────────────────────────
export default function AiVoiceAssistant() {
  const [isOpen, setIsOpen] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [messages, setMessages] = useState([])
  const [pendingOrder, setPendingOrder] = useState(null)
  const [latestAssistantIdx, setLatestAssistantIdx] = useState(-1)

  const recognitionRef = useRef(null)
  const messagesEndRef = useRef(null)

  // 브라우저 음성 지원 확인
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const hasSpeech = !!SpeechRecognition
  const hasTTS = 'speechSynthesis' in window

  // 자동 스크롤
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, pendingOrder])

  // ── TTS ──
  const speak = useCallback((text) => {
    if (!hasTTS) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ko-KR'
    utterance.rate = 1.1
    utterance.pitch = 1.0

    const voices = window.speechSynthesis.getVoices()
    const koreanVoice = voices.find((v) => v.lang.startsWith('ko'))
    if (koreanVoice) utterance.voice = koreanVoice

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)

    window.speechSynthesis.speak(utterance)
  }, [hasTTS])

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }, [])

  // ── 음성인식 ──
  const startListening = useCallback(() => {
    if (!hasSpeech) return

    const recognition = new SpeechRecognition()
    recognition.lang = 'ko-KR'
    recognition.continuous = false
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript
        } else {
          interimTranscript += event.results[i][0].transcript
        }
      }

      setTranscript(finalTranscript || interimTranscript)

      if (finalTranscript) {
        sendMessage(finalTranscript)
      }
    }

    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
    setTranscript('')
  }, [hasSpeech, SpeechRecognition]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  // ── 주문 확인 (버튼) ──
  const handleConfirmOrder = useCallback(async () => {
    if (!pendingOrder) return

    const newMessages = [...messages, { role: 'user', content: '주문 확인합니다' }]
    setMessages(newMessages)
    setIsLoading(true)

    try {
      const res = await apiPost('/dashboard/ai-chat', { confirm_order: pendingOrder })
      if (res.success) {
        const answer = res.data.answer
        const updatedMessages = [...newMessages, { role: 'assistant', content: answer }]
        setMessages(updatedMessages)
        setLatestAssistantIdx(updatedMessages.length - 1)
        speak(answer)
      }
    } catch {
      const updatedMessages = [...newMessages, { role: 'assistant', content: '주문 처리 중 오류가 발생했습니다.' }]
      setMessages(updatedMessages)
      setLatestAssistantIdx(updatedMessages.length - 1)
    }

    setPendingOrder(null)
    setIsLoading(false)
  }, [pendingOrder, messages, speak])

  const handleCancelOrder = useCallback(() => {
    const cancelled = '주문을 취소했습니다.'
    const updatedMessages = [...messages, { role: 'assistant', content: cancelled }]
    setMessages(updatedMessages)
    setLatestAssistantIdx(updatedMessages.length - 1)
    setPendingOrder(null)
    speak(cancelled)
  }, [messages, speak])

  // ── AI 메시지 전송 ──
  const sendMessage = useCallback(async (text) => {
    if (!text.trim()) return
    setTranscript('')

    // 주문 대기 중 음성 확인
    const confirmWords = ['주문해', '확인', '넣어', '등록해', '네', '응']
    if (pendingOrder && confirmWords.some((w) => text.includes(w))) {
      const newMessages = [...messages, { role: 'user', content: text }]
      setMessages(newMessages)
      setIsLoading(true)

      try {
        const res = await apiPost('/dashboard/ai-chat', { confirm_order: pendingOrder })
        if (res.success) {
          const answer = res.data.answer
          const updatedMessages = [...newMessages, { role: 'assistant', content: answer }]
          setMessages(updatedMessages)
          setLatestAssistantIdx(updatedMessages.length - 1)
          speak(answer)
        }
      } catch {
        const updatedMessages = [...newMessages, { role: 'assistant', content: '주문 처리 중 오류가 발생했습니다.' }]
        setMessages(updatedMessages)
        setLatestAssistantIdx(updatedMessages.length - 1)
      }

      setPendingOrder(null)
      setIsLoading(false)
      return
    }

    // 주문 대기 중 취소
    if (pendingOrder && (text.includes('취소') || text.includes('아니'))) {
      const newMessages = [...messages, { role: 'user', content: text }]
      const updatedMessages = [...newMessages, { role: 'assistant', content: '주문을 취소했습니다.' }]
      setMessages(updatedMessages)
      setLatestAssistantIdx(updatedMessages.length - 1)
      setPendingOrder(null)
      speak('주문을 취소했습니다.')
      return
    }

    // 일반 질문
    const newMessages = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setIsLoading(true)

    try {
      const res = await apiPost('/dashboard/ai-chat', { message: text })

      if (res.success) {
        const answer = res.data.answer

        if (res.data.order_data) {
          setPendingOrder(res.data.order_data)
          const updatedMessages = [
            ...newMessages,
            { role: 'assistant', content: answer },
          ]
          setMessages(updatedMessages)
          setLatestAssistantIdx(updatedMessages.length - 1)
        } else {
          const updatedMessages = [...newMessages, { role: 'assistant', content: answer }]
          setMessages(updatedMessages)
          setLatestAssistantIdx(updatedMessages.length - 1)
        }

        speak(answer)
      } else {
        const updatedMessages = [...newMessages, { role: 'assistant', content: '죄송합니다, 응답을 생성할 수 없습니다.' }]
        setMessages(updatedMessages)
        setLatestAssistantIdx(updatedMessages.length - 1)
      }
    } catch {
      const updatedMessages = [...newMessages, { role: 'assistant', content: '서버 연결에 실패했습니다.' }]
      setMessages(updatedMessages)
      setLatestAssistantIdx(updatedMessages.length - 1)
    }

    setIsLoading(false)
  }, [messages, pendingOrder, speak])

  // ── 대화 초기화 ──
  const resetConversation = useCallback(() => {
    setMessages([])
    setPendingOrder(null)
    setTranscript('')
    setLatestAssistantIdx(-1)
    stopSpeaking()
  }, [stopSpeaking])

  // ── 닫기 ──
  const handleClose = useCallback(() => {
    setIsOpen(false)
    stopSpeaking()
  }, [stopSpeaking])

  // ── 폼 제출 ──
  const handleFormSubmit = useCallback((e) => {
    e.preventDefault()
    const input = e.target.elements.chatInput
    if (input.value.trim()) {
      sendMessage(input.value.trim())
      input.value = ''
    }
  }, [sendMessage])

  // ── 플로팅 버튼 (닫힌 상태) ──
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center group"
        aria-label="AI 비서 열기"
      >
        <Mic className="w-6 h-6 group-hover:scale-110 transition-transform" />
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse" />
      </button>
    )
  }

  // ── 열린 상태 (채팅 패널) ──
  return (
    <div
      className={cn(
        'fixed z-50 bg-white flex flex-col overflow-hidden transition-all',
        // 모바일: 전체 화면
        'inset-0',
        // 데스크탑: 우측 하단 카드
        'sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[400px] sm:max-h-[600px] sm:rounded-2xl sm:shadow-2xl sm:border',
      )}
    >
      {/* ── 헤더 ── */}
      <div className="bg-gradient-to-r from-violet-500 to-indigo-600 text-white px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <MessageCircle className="w-4 h-4" />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight">AI 비서</p>
            <p className="text-[10px] text-white/70">
              {isListening ? '듣고 있습니다...' : isSpeaking ? '말하는 중...' : '음성으로 물어보세요'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* 대화 초기화 */}
          {messages.length > 0 && (
            <button
              onClick={resetConversation}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="대화 초기화"
              title="대화 초기화"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── 메시지 영역 ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {/* 제안 문구 (빈 상태) */}
        {messages.length === 0 && (
          <SuggestionsPanel onSelect={sendMessage} />
        )}

        {/* 메시지 목록 */}
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            role={msg.role}
            content={msg.content}
            isLatestAssistant={i === latestAssistantIdx}
          />
        ))}

        {/* 주문 확인 카드 */}
        {pendingOrder && !isLoading && (
          <OrderConfirmCard
            order={pendingOrder}
            onConfirm={handleConfirmOrder}
            onCancel={handleCancelOrder}
          />
        )}

        {/* 로딩 표시 */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 ml-9">
              <div className="bg-slate-100 px-4 py-2.5 rounded-2xl rounded-bl-md flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                <span className="text-xs text-slate-500">생각 중...</span>
              </div>
            </div>
          </div>
        )}

        {/* 음성 인식 중간 결과 */}
        {transcript && (
          <div className="flex justify-end">
            <div className="bg-violet-100 text-violet-600 px-3.5 py-2.5 rounded-2xl text-sm italic">
              {transcript}...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── 하단: 입력 영역 ── */}
      <div className="border-t bg-white p-3 shrink-0">
        <div className="flex items-center gap-2">
          {/* 음성 입력 버튼 */}
          {hasSpeech && (
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center transition-all shrink-0',
                isListening
                  ? 'bg-red-500 text-white shadow-lg scale-110 animate-pulse'
                  : 'bg-violet-100 text-violet-600 hover:bg-violet-200 active:scale-95',
              )}
              aria-label={isListening ? '듣는 중' : '음성 입력'}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          )}

          {/* 텍스트 입력 */}
          <form className="flex-1 flex gap-1.5" onSubmit={handleFormSubmit}>
            <input
              name="chatInput"
              placeholder="질문 입력 또는 마이크 누르기"
              className="flex-1 h-11 px-3.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 transition-shadow"
              autoComplete="off"
            />
            <button
              type="submit"
              className="h-11 px-4 bg-violet-500 text-white rounded-xl text-sm font-medium hover:bg-violet-600 active:scale-95 transition-all"
            >
              전송
            </button>
          </form>

          {/* TTS 정지 */}
          {isSpeaking && (
            <button
              onClick={stopSpeaking}
              className="w-11 h-11 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center animate-pulse shrink-0"
              aria-label="음성 정지"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {isListening && (
          <p className="text-[10px] text-red-500 text-center mt-1.5 animate-pulse">
            듣고 있습니다... 버튼에서 손을 떼면 전송됩니다
          </p>
        )}
      </div>
    </div>
  )
}
