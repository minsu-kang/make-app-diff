import React, { useEffect, useState } from 'react'

export interface ToastMessage {
  id: number
  text: string
  type: 'error' | 'success' | 'info'
}

let toastId = 0
let addToastFn: ((msg: Omit<ToastMessage, 'id'>) => void) | null = null

export function showToast(text: string, type: ToastMessage['type'] = 'error') {
  addToastFn?.({ text, type })
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const timersRef = React.useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const timers = timersRef.current
    addToastFn = (msg) => {
      const id = ++toastId
      setToasts((prev) => [...prev, { ...msg, id }])
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
        timers.delete(id)
      }, 4000)
      timers.set(id, timer)
    }
    return () => {
      addToastFn = null
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <span className="toast-text">{toast.text}</span>
          <button className="toast-close" onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}>
            &times;
          </button>
        </div>
      ))}
    </div>
  )
}
