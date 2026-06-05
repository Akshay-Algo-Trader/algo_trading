import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'

// ─── Modal ───────────────────────────────────────────────────────────────────
export function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  const widths = {
    sm:  'max-w-sm',
    md:  'max-w-md',
    lg:  'max-w-lg',
    xl:  'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
    '6xl': 'max-w-6xl',
    full: 'max-w-[95vw]',
  }
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100"
          leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
              leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className={`w-full ${widths[size]} bg-white rounded-lg shadow-xl p-6`}>
                <div className="flex items-center justify-between mb-5">
                  <Dialog.Title className="text-base font-semibold text-gray-900">{title}</Dialog.Title>
                  <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                {children}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}

// ─── Badge ───────────────────────────────────────────────────────────────────
export function Badge({ children, variant = 'gray' }) {
  const v = {
    green:  'bg-green-100 text-green-700',
    red:    'bg-red-100 text-red-700',
    blue:   'bg-blue-100 text-blue-700',
    orange: 'bg-orange-100 text-orange-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    gray:   'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${v[variant] ?? v.gray}`}>
      {children}
    </span>
  )
}

// ─── Table wrapper ────────────────────────────────────────────────────────────
export function Table({ headers, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  )
}

// ─── Skeleton rows ────────────────────────────────────────────────────────────
const WIDTHS = ['72%', '55%', '80%', '48%', '65%', '70%', '60%', '75%']
export function SkeletonTable({ rows = 5, cols = 5 }) {
  return Array.from({ length: rows }).map((_, r) => (
    <tr key={r}>
      {Array.from({ length: cols }).map((_, c) => (
        <td key={c} className="px-4 py-3">
          <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: WIDTHS[(r + c) % WIDTHS.length] }} />
        </td>
      ))}
    </tr>
  ))
}

// ─── Empty / Error rows ───────────────────────────────────────────────────────
export function EmptyRow({ message = 'No records found', cols = 8 }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-16 text-center">
        <svg className="mx-auto w-10 h-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 17v-2m3 2v-4m3 4v-6M3 7l3-3 3 3M3 7v10a1 1 0 001 1h16a1 1 0 001-1V7M3 7h18" />
        </svg>
        <p className="text-sm text-gray-400">{message}</p>
      </td>
    </tr>
  )
}

export function ErrorRow({ message, onRetry, cols = 8 }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-12 text-center">
        <p className="text-sm text-red-500 mb-2">{message}</p>
        {onRetry && (
          <button onClick={onRetry} className="text-sm text-[#eb5202] hover:underline font-medium">
            Try again
          </button>
        )}
      </td>
    </tr>
  )
}

// ─── Form helpers ─────────────────────────────────────────────────────────────
export function FormField({ label, children, hint }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

export function Input(props) {
  return (
    <input
      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#eb5202] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
      {...props}
    />
  )
}

export function Select({ children, ...props }) {
  return (
    <select
      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#eb5202] focus:border-transparent bg-white"
      {...props}
    >
      {children}
    </select>
  )
}

// ─── Buttons ──────────────────────────────────────────────────────────────────
export function Btn({ children, variant = 'primary', size = 'md', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center font-medium rounded transition-colors disabled:opacity-50'
  const sizes = { sm: 'text-xs px-3 py-1.5', md: 'text-sm px-4 py-2' }
  const variants = {
    primary:  'bg-[#eb5202] hover:bg-[#cc4a00] text-white',
    secondary:'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50',
    danger:   'bg-red-600 hover:bg-red-700 text-white',
    ghost:    'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
  }
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  )
}

// ─── Misc helpers ─────────────────────────────────────────────────────────────
export function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

export function fmtCurrency(n) {
  if (n === null || n === undefined) return '—'
  return `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function PageHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      {action}
    </div>
  )
}

export function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}>
      {children}
    </div>
  )
}
