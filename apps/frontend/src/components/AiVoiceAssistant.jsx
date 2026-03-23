/**
 * @fileoverview 음성 AI 비서 — 플로팅 버튼
 * Web Speech API (음성인식) + TTS (음성합성) + Claude Sonnet (AI 대화)
 * "오늘 납유량은?" → 마이크 → 텍스트 → API → Claude → TTS → 음성 답변
 */
import { useState, useRef, useEffect } from 'react'
import { apiPost } from '@/lib/api'
import { Mic, MicOff, X, Volume2, Loader2, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const SUGGESTIONS = [
  '오늘 전체 현황 요약해줘',
  '오늘 납유량은?',
  '미처리 주문 있어?',
  '밀크카페 우유750 10개 주문해줘',
  '이번달 납유대금은?',
  '구독자 몇 명이야?',
]

export default function AiVoiceAssistant() {
  const [isOpen, setIsOpen] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [messages, setMessages] = useState([])
  const [pendingOrder, setPendingOrder] = useState(null) // 주문 대기 데이터
  const recognitionRef = useRef(null)
  const messagesEndRef = useRef(null)

  // 브라우저 음성인식 지원 확인
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const hasSpeech = !!SpeechRecognition
  const hasTTS = 'speechSynthesis' in window

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // 음성인식 시작
  const startListening = () => {
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

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.onerror = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
    setTranscript('')
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  // AI에 질문
  const sendMessage = async (text) => {
    if (!text.trim()) return
    setTranscript('')

    // "주문해", "확인", "넣어" → 대기 중인 주문 실행
    const confirmWords = ['주문해', '확인', '넣어', '등록해', '네', '응']
    if (pendingOrder && confirmWords.some((w) => text.includes(w))) {
      const newMessages = [...messages, { role: 'user', content: text }]
      setMessages(newMessages)
      setIsLoading(true)

      try {
        const res = await apiPost('/dashboard/ai-chat', { confirm_order: pendingOrder })
        if (res.success) {
          const answer = res.data.answer
          setMessages([...newMessages, { role: 'assistant', content: answer }])
          if (hasTTS) speak(answer)
        }
      } catch {
        setMessages([...newMessages, { role: 'assistant', content: '주문 처리 중 오류가 발생했습니다.' }])
      }

      setPendingOrder(null)
      setIsLoading(false)
      return
    }

    // "취소" → 주문 취소
    if (pendingOrder && (text.includes('취소') || text.includes('아니'))) {
      const newMessages = [...messages, { role: 'user', content: text }]
      setMessages([...newMessages, { role: 'assistant', content: '주문을 취소했습니다.' }])
      setPendingOrder(null)
      if (hasTTS) speak('주문을 취소했습니다.')
      return
    }

    const newMessages = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setIsLoading(true)

    try {
      const res = await apiPost('/dashboard/ai-chat', { message: text })

      if (res.success) {
        const answer = res.data.answer

        // 주문 데이터가 있으면 대기 상태로
        if (res.data.order_data) {
          setPendingOrder(res.data.order_data)
          setMessages([...newMessages, { role: 'assistant', content: answer + '\n\n"주문해" 또는 "취소"라고 말씀해주세요.' }])
        } else {
          setMessages([...newMessages, { role: 'assistant', content: answer }])
        }

        if (hasTTS) speak(answer)
      } else {
        setMessages([...newMessages, { role: 'assistant', content: '죄송합니다, 응답을 생성할 수 없습니다.' }])
      }
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: '서버 연결에 실패했습니다.' }])
    }

    setIsLoading(false)
  }

  // TTS 음성 출력
  const speak = (text) => {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ko-KR'
    utterance.rate = 1.1
    utterance.pitch = 1.0

    // 한국어 음성 선택
    const voices = window.speechSynthesis.getVoices()
    const koreanVoice = voices.find((v) => v.lang.startsWith('ko'))
    if (koreanVoice) utterance.voice = koreanVoice

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)

    window.speechSynthesis.speak(utterance)
  }

  const stopSpeaking = () => {
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center group"
      >
        <Mic className="w-6 h-6 group-hover:scale-110 transition-transform" />
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[360px] max-h-[520px] bg-white rounded-2xl shadow-2xl border flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-violet-500 to-indigo-600 text-white p-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5" />
          <div>
            <p className="font-bold text-sm">AI 비서</p>
            <p className="text-[10px] text-white/70">음성으로 물어보세요</p>
          </div>
        </div>
        <button onClick={() => { setIsOpen(false); stopSpeaking() }}
          className="p-1 hover:bg-white/20 rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
        {messages.length === 0 && (
          <div className="text-center py-4">
            <Mic className="w-10 h-10 text-slate-200 mx-auto mb-2" />
            <p className="text-xs text-slate-400">마이크 버튼을 누르고 말씀하세요</p>
            <div className="mt-3 space-y-1">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => sendMessage(s)}
                  className="block w-full text-left text-[11px] text-violet-500 hover:bg-violet-50 px-3 py-1.5 rounded-lg transition-colors">
                  "{s}"
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] px-3 py-2 rounded-2xl text-sm',
              msg.role === 'user'
                ? 'bg-violet-500 text-white rounded-br-md'
                : 'bg-slate-100 text-slate-800 rounded-bl-md')}>
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 px-4 py-2 rounded-2xl rounded-bl-md flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
              <span className="text-xs text-slate-500">생각 중...</span>
            </div>
          </div>
        )}

        {transcript && (
          <div className="flex justify-end">
            <div className="bg-violet-100 text-violet-600 px-3 py-2 rounded-2xl text-sm italic">
              {transcript}...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 하단: 마이크 + 입력 */}
      <div className="border-t p-3 shrink-0">
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
                  : 'bg-violet-100 text-violet-600 hover:bg-violet-200',
              )}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          )}

          {/* 텍스트 입력 */}
          <form className="flex-1 flex gap-1" onSubmit={(e) => {
            e.preventDefault()
            const input = e.target.elements.chatInput
            if (input.value.trim()) { sendMessage(input.value.trim()); input.value = '' }
          }}>
            <input name="chatInput" placeholder="질문 입력 또는 마이크 누르기"
              className="flex-1 h-10 px-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            <button type="submit" className="h-10 px-3 bg-violet-500 text-white rounded-xl text-sm hover:bg-violet-600">
              전송
            </button>
          </form>

          {/* TTS 정지 */}
          {isSpeaking && (
            <button onClick={stopSpeaking}
              className="w-10 h-10 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center animate-pulse shrink-0">
              <Volume2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {isListening && (
          <p className="text-[10px] text-red-500 text-center mt-1 animate-pulse">
            듣고 있습니다... 버튼에서 손을 떼면 전송됩니다
          </p>
        )}
      </div>
    </div>
  )
}
