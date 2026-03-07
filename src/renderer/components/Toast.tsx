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

  useEffect(() => {
    addToastFn = (msg) => {
      const id = ++toastId
      setToasts((prev) => [...prev, { ...msg, id }])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 4000)
    }
    return () => {
      addToastFn = null
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
