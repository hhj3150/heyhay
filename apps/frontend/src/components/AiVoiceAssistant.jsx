/**
 * @fileoverview AI 음성 비서 — 플로팅 채팅 위젯
 * Web Speech API (음성인식) + TTS (음성합성) + Claude Sonnet (AI 대화)
 *
 * 주요 기능:
 * - 음성인식 / 텍스트 입력 하이브리드
 * - 마크다운 스타일 메시지 렌더링 (bold, 줄바꿈, 이모지)
 * - 어시스턴트 타이핑 효과
 * - 주문 확인 카드 UI (상품 테이블 + 버튼)
 * - 착유량 입력 액션 (복명복창 → 확인 → POST)
 * - 페이지 네비게이션 액션 (AI 응답 → 자동 이동)
 * - 페이지 컨텍스트 인식 제안 문구
 * - 반응형 모바일 전체화면
 * - 대화 초기화
 */
import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { apiPost } from '@/lib/api'
import {
  Mic, MicOff, X, Volume2, Loader2, MessageCircle,
  RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { DEFAULT_SUGGESTION_GROUPS, getContextChips } from './ai-assistant/constants'
import { OrderConfirmCard, MilkInputCard } from './ai-assistant/ActionCards'

// ─── ReactMarkdown 커스텀 컴포넌트 ───────────────────────────
const markdownComponents = {
  h2: ({ children }) => <p className="font-bold text-sm mt-2 mb-1">{children}</p>,
  h3: ({ children }) => <p className="font-semibold text-xs mt-1.5 mb-0.5">{children}</p>,
  p: ({ children }) => <p className="text-sm mb-1">{children}</p>,
  li: ({ children }) => <li className="text-sm ml-4 list-disc">{children}</li>,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  table: ({ children }) => <table className="text-xs w-full border-collapse my-1">{children}</table>,
  th: ({ children }) => <th className="border-b border-slate-200 px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-slate-100 px-2 py-1">{children}</td>,
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
        {isUser ? content : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {displayed}
          </ReactMarkdown>
        )}
      </div>
    </div>
  )
})

// ─── 제안 문구 패널 (페이지 컨텍스트 인식) ──────────────────
const SuggestionsPanel = memo(function SuggestionsPanel({ onSelect, contextChips }) {
  return (
    <div className="text-center py-4 px-2">
      <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
        <Mic className="w-7 h-7 text-violet-400" />
      </div>
      <p className="text-xs text-slate-400 mb-4">
        마이크 버튼을 누르고 말씀하거나, 아래 질문을 선택하세요
      </p>

      {/* 페이지 컨텍스트 빠른 질문 칩 (가로 스크롤 + 터치 피드백) */}
      {contextChips.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 text-left px-2">
            이 페이지에서 자주 쓰는 질문
          </p>
          <div className="flex gap-2 overflow-x-auto pb-2 px-1 scrollbar-hide snap-x snap-mandatory">
            {contextChips.map((chip) => (
              <button
                key={chip}
                onClick={() => onSelect(chip)}
                className="flex-shrink-0 snap-start text-[11px] text-violet-600 bg-violet-50 hover:bg-violet-100 active:bg-violet-200 active:scale-[0.97] px-3 py-2 rounded-full transition-all whitespace-nowrap border border-violet-100"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 text-left">
        {DEFAULT_SUGGESTION_GROUPS.map((group) => {
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
  const navigate = useNavigate()
  const location = useLocation()

  const [isOpen, setIsOpen] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [messages, setMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem('ai_chat_messages')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [pendingOrder, setPendingOrder] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const [latestAssistantIdx, setLatestAssistantIdx] = useState(-1)

  const recognitionRef = useRef(null)
  const messagesEndRef = useRef(null)

  // 페이지 컨텍스트별 빠른 질문 칩
  const contextChips = useMemo(
    () => getContextChips(location.pathname),
    [location.pathname]
  )

  // 브라우저 음성 지원 확인
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const hasSpeech = !!SpeechRecognition
  const hasTTS = 'speechSynthesis' in window

  // 외부 이벤트로 AI 비서 열기 (모바일 하단 탭 등)
  useEffect(() => {
    const handleOpenEvent = () => setIsOpen(true)
    window.addEventListener('open-ai-assistant', handleOpenEvent)
    return () => window.removeEventListener('open-ai-assistant', handleOpenEvent)
  }, [])

  // 자동 스크롤
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, pendingOrder, pendingAction])

  // sessionStorage에 대화 저장 (최대 20개)
  useEffect(() => {
    try {
      const toSave = messages.slice(-20)
      sessionStorage.setItem('ai_chat_messages', JSON.stringify(toSave))
    } catch { /* sessionStorage 접근 실패 무시 */ }
  }, [messages])

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

  // ── AI 응답의 액션 처리 ──
  const handleActionFromResponse = useCallback((action) => {
    if (!action || !action.type) return false

    if (action.type === 'NAVIGATE') {
      // 네비게이션: 1초 후 자동 이동 (메시지 확인 시간 확보)
      setTimeout(() => {
        navigate(action.path)
        setIsOpen(false)
      }, 1000)
      return true
    }

    if (action.type === 'MILK_INPUT') {
      // 착유량 입력: pendingAction에 저장 → 확인 카드 표시
      setPendingAction({ type: 'MILK_INPUT', data: action.data })
      return true
    }

    return false
  }, [navigate])

  // ── 착유량 입력 확인/취소 ──
  const handleConfirmMilkInput = useCallback(async () => {
    if (!pendingAction || pendingAction.type !== 'MILK_INPUT') return

    const milkData = pendingAction.data
    const newMessages = [...messages, { role: 'user', content: '착유량 입력 확인합니다' }]
    setMessages(newMessages)
    setIsLoading(true)

    try {
      const payload = {
        total_l: milkData.total_l,
        dairy_assoc_l: milkData.dairy_assoc_l ?? 0,
        d2o_l: milkData.d2o_l ?? 0,
      }
      const res = await apiPost('/farm/milking/daily-total', payload)
      if (res.success) {
        const answer = `착유량 ${milkData.total_l}L 입력 완료했습니다.`
        const updatedMessages = [...newMessages, { role: 'assistant', content: answer }]
        setMessages(updatedMessages)
        setLatestAssistantIdx(updatedMessages.length - 1)
        speak(answer)
      } else {
        const errMsg = res.error?.message || '착유량 입력 중 오류가 발생했습니다.'
        const updatedMessages = [...newMessages, { role: 'assistant', content: errMsg }]
        setMessages(updatedMessages)
        setLatestAssistantIdx(updatedMessages.length - 1)
      }
    } catch {
      const updatedMessages = [...newMessages, { role: 'assistant', content: '착유량 입력 중 오류가 발생했습니다.' }]
      setMessages(updatedMessages)
      setLatestAssistantIdx(updatedMessages.length - 1)
    }

    setPendingAction(null)
    setIsLoading(false)
  }, [pendingAction, messages, speak])

  const handleCancelMilkInput = useCallback(() => {
    const cancelled = '착유량 입력을 취소했습니다.'
    const updatedMessages = [...messages, { role: 'assistant', content: cancelled }]
    setMessages(updatedMessages)
    setLatestAssistantIdx(updatedMessages.length - 1)
    setPendingAction(null)
    speak(cancelled)
  }, [messages, speak])

  // ── 주문 확인/취소 (버튼) ──
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

    // 착유량 입력 대기 중 음성 확인
    const confirmWords = ['확인', '넣어', '입력해', '네', '응']
    if (pendingAction && pendingAction.type === 'MILK_INPUT' && confirmWords.some((w) => text.includes(w))) {
      handleConfirmMilkInput()
      return
    }

    // 착유량 입력 대기 중 취소
    if (pendingAction && (text.includes('취소') || text.includes('아니'))) {
      handleCancelMilkInput()
      return
    }

    // 주문 대기 중 음성 확인
    const orderConfirmWords = ['주문해', '확인', '넣어', '등록해', '네', '응']
    if (pendingOrder && orderConfirmWords.some((w) => text.includes(w))) {
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

        // 액션 처리 (네비게이션, 착유량 입력)
        if (res.data.action) {
          handleActionFromResponse(res.data.action)
        }

        if (res.data.order_data) {
          setPendingOrder(res.data.order_data)
        }

        const updatedMessages = [...newMessages, { role: 'assistant', content: answer }]
        setMessages(updatedMessages)
        setLatestAssistantIdx(updatedMessages.length - 1)
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
  }, [messages, pendingOrder, pendingAction, speak, handleActionFromResponse, handleConfirmMilkInput, handleCancelMilkInput])

  // ── 대화 초기화 ──
  const resetConversation = useCallback(() => {
    setMessages([])
    setPendingOrder(null)
    setPendingAction(null)
    setTranscript('')
    setLatestAssistantIdx(-1)
    sessionStorage.removeItem('ai_chat_messages')
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
        // 모바일: 전체 화면 (safe-area 대응)
        'inset-0',
        // 데스크탑: 우측 하단 카드
        'sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[400px] sm:max-h-[600px] sm:rounded-2xl sm:shadow-2xl sm:border',
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* ── 헤더 ── */}
      <div
        className="bg-gradient-to-r from-violet-500 to-indigo-600 text-white px-4 py-3 flex items-center justify-between shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
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
            aria-label="AI 비서 닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── 메시지 영역 ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {/* 제안 문구 (빈 상태) */}
        {messages.length === 0 && (
          <SuggestionsPanel onSelect={sendMessage} contextChips={contextChips} />
        )}

        {/* 대화 시작 후 페이지 컨텍스트 칩 (가로 스크롤) */}
        {messages.length > 0 && contextChips.length > 0 && !isLoading && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory">
            {contextChips.map((chip) => (
              <button
                key={chip}
                onClick={() => sendMessage(chip)}
                className="flex-shrink-0 snap-start text-[10px] text-violet-500 bg-violet-50 hover:bg-violet-100 active:bg-violet-200 active:scale-[0.97] px-2.5 py-1.5 rounded-full transition-all whitespace-nowrap border border-violet-100"
              >
                {chip}
              </button>
            ))}
          </div>
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

        {/* 착유량 입력 확인 카드 */}
        {pendingAction && pendingAction.type === 'MILK_INPUT' && !isLoading && (
          <MilkInputCard
            data={pendingAction.data}
            onConfirm={handleConfirmMilkInput}
            onCancel={handleCancelMilkInput}
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

      {/* ── 하단: 입력 영역 (키보드 대응) ── */}
      <div className="border-t bg-white p-3 shrink-0">
        <div className="flex items-center gap-2">
          {/* 음성 입력 버튼 — 모바일에서 더 크게 (w-14 h-14) */}
          {hasSpeech && (
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              className={cn(
                'w-14 h-14 rounded-full flex items-center justify-center transition-all shrink-0',
                isListening
                  ? 'bg-red-500 text-white shadow-lg shadow-red-200 scale-110'
                  : 'bg-violet-100 text-violet-600 hover:bg-violet-200 active:scale-95',
              )}
              aria-label="음성으로 질문하기"
            >
              {isListening
                ? <MicOff className="w-6 h-6 animate-pulse" />
                : <Mic className="w-6 h-6" />
              }
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
          <p className="text-[10px] text-red-500 text-center mt-1.5 animate-pulse font-medium">
            듣고 있습니다... 버튼에서 손을 떼면 전송됩니다
          </p>
        )}
      </div>
    </div>
  )
}
