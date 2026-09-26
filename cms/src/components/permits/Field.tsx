import { ReactNode } from 'react'

interface FieldProps {
  label: string
  error?: string
  required?: boolean
  hint?: string
  children: ReactNode
  className?: string
}

export function Field({ label, error, required, hint, children, className = '' }: FieldProps) {
  return (
    <div className={`mb-4 ${className}`}>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
        <span>⚠</span> {error}
      </p>}
    </div>
  )
}

export function TextInput({ value, onChange, placeholder, error, disabled }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  error?: string
  disabled?: boolean
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed ${
        error ? 'border-red-400 focus:ring-red-500' : 'border-gray-300'
      }`}
    />
  )
}

export function NumberInput({ value, onChange, placeholder, error, min, max, step }: {
  value: number | string
  onChange: (v: number | string) => void
  placeholder?: string
  error?: string
  min?: number
  max?: number
  step?: number
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ${
        error ? 'border-red-400 focus:ring-red-500' : 'border-gray-300'
      }`}
    />
  )
}

export function Select({ value, onChange, options, error, disabled }: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
  error?: string
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`w-full px-3 py-2.5 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed ${
        error ? 'border-red-400 focus:ring-red-500' : 'border-gray-300'
      }`}
    >
      <option value="">Select...</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export function TextArea({ value, onChange, placeholder, error, rows = 3 }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  error?: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-vertical ${
        error ? 'border-red-400 focus:ring-red-500' : 'border-gray-300'
      }`}
    />
  )
}

export function DateTimeInput({ value, onChange, error }: {
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  return (
    <input
      type="datetime-local"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ${
        error ? 'border-red-400 focus:ring-red-500' : 'border-gray-300'
      }`}
    />
  )
}

export function Checkbox({ checked, onChange, label, description }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}) {
  return (
    <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
      />
      <div>
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {description && <div className="text-xs text-gray-500">{description}</div>}
      </div>
    </label>
  )
}