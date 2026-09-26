import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAuthStore } from '../store'
import { api } from '../api'
import { Field, TextInput, NumberInput, Select, TextArea, DateTimeInput, Checkbox } from '../components/permits/Field'
import { TYPE_CONFIG, PermitTypeKey } from '../components/permits/typeConfig'
import { ChevronLeft, ChevronRight, Check, AlertCircle, FileText, Shield, Clock, User } from 'lucide-react'

const STEPS = [
  { id: 1, label: 'Permit Type' },
  { id: 2, label: 'Common Information' },
  { id: 3, label: 'Type-Specific Details' },
  { id: 4, label: 'Hazards & Precautions' },
  { id: 5, label: 'Approvers' },
]

const HAZARD_OPTIONS = [
  { id: 'SPARKS_HOT_METAL', label: 'Sparks / Hot Metal' },
  { id: 'FLAMMABLE_VAPOR', label: 'Flammable Vapor' },
  { id: 'OXYGEN_DEFICIENCY', label: 'Oxygen Deficiency' },
  { id: 'TOXIC_GAS_H2S', label: 'Toxic Gas (H2S)' },
  { id: 'RESTRICTED_ENTRY', label: 'Restricted Entry' },
  { id: 'FALL_FROM_HEIGHT', label: 'Fall from Height' },
  { id: 'ELECTRICAL_SHOCK', label: 'Electrical Shock' },
  { id: 'ARC_FLASH', label: 'Arc Flash' },
  { id: 'PRESSURE_RELEASE', label: 'Pressure Release' },
  { id: 'NOISE', label: 'Noise' },
]

const PPE_OPTIONS = [
  { id: 'SAFETY_GLASSES', label: 'Safety Glasses' },
  { id: 'FIRE_SUIT', label: 'Fire Suit' },
  { id: 'WELDING_SHIELD', label: 'Welding Shield' },
  { id: 'SAFETY_SHOES', label: 'Safety Shoes' },
  { id: 'FULL_BODY_HARNESS', label: 'Full Body Harness' },
  { id: 'SCBA_BREATHING_APPARATUS', label: 'SCBA / Breathing Apparatus' },
  { id: 'HARD_HAT', label: 'Hard Hat' },
  { id: 'INSULATED_GLOVES', label: 'Insulated Gloves' },
  { id: 'EAR_PLUGS', label: 'Ear Plugs' },
  { id: 'FACE_SHIELD', label: 'Face Shield' },
]

interface FormData {
  type: PermitTypeKey | ''
  contractorTeam: string
  workDescription: string
  plantId: string
  areaId: string
  equipmentId: string
  plannedStart: string
  plannedEnd: string
  hazards: string[]
  ppe: string[]
  precautions: Array<{ label: string; checked: boolean }>
  typeData: Record<string, string | number | boolean>
}

const emptyForm: FormData = {
  type: '',
  contractorTeam: '',
  workDescription: '',
  plantId: '',
  areaId: '',
  equipmentId: '',
  plannedStart: '',
  plannedEnd: '',
  hazards: [],
  ppe: [],
  precautions: [],
  typeData: {},
}

export default function CreatePermitPage() {
  const { user } = useAuthStore((state) => ({ user: state.user }))
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const { data: plants } = useQuery({
    queryKey: ['plants'],
    queryFn: async () => {
      const res = await api.get('/master-data/plants')
      return res.data
    }
  })

  const { data: areas } = useQuery({
    queryKey: ['areas', form.plantId],
    queryFn: async () => {
      const params = form.plantId ? { plantId: form.plantId } : {}
      const res = await api.get('/master-data/areas', { params })
      return res.data
    }
  })

  const { data: equipment } = useQuery({
    queryKey: ['equipment', form.areaId],
    queryFn: async () => {
      const params = form.areaId ? { areaId: form.areaId } : {}
      const res = await api.get('/master-data/equipment', { params })
      return res.data
    }
  })

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/permits', payload)
      return res.data
    },
    onSuccess: (permit) => {
      navigate(`/permits/${permit.id}`)
    }
  })

  const submitMutation = useMutation({
    mutationFn: async (permitId: string) => {
      const res = await api.post(`/permits/${permitId}/action`, { action: 'SUBMIT' })
      return res.data
    }
  })

  const typeConfig = form.type ? TYPE_CONFIG[form.type] : null
  const requiredTypeFields = typeConfig?.fields.filter(f => f.required) || []

  const validateStep = (s: number): Record<string, string> => {
    const e: Record<string, string> = {}
    if (s === 1) {
      if (!form.type) e.type = 'Select a permit type'
    }
    if (s === 2) {
      if (!form.workDescription || form.workDescription.length < 5) e.workDescription = 'Work description must be at least 5 characters'
      if (!form.plantId) e.plantId = 'Plant is required'
      if (!form.areaId) e.areaId = 'Area is required'
      if (!form.plannedStart) e.plannedStart = 'Planned start is required'
      if (!form.plannedEnd) e.plannedEnd = 'Planned end is required'
      if (form.plannedStart && form.plannedEnd && new Date(form.plannedEnd) <= new Date(form.plannedStart)) {
        e.plannedEnd = 'End time must be after start time'
      }
    }
    if (s === 3 && typeConfig) {
      requiredTypeFields.forEach(f => {
        const val = form.typeData[f.id]
        if (val === undefined || val === '' || val === false) {
          e[`typeData.${f.id}`] = `${f.label} is required`
        }
      })
    }
    if (s === 4) {
      if (form.hazards.length === 0) e.hazards = 'Select at least one hazard'
      if (form.ppe.length === 0) e.ppe = 'Select at least one PPE item'
    }
    return e
  }

  const canProceed = (s: number) => Object.keys(validateStep(s)).length === 0

  const next = () => {
    const e = validateStep(step)
    setErrors(e)
    if (Object.keys(e).length === 0) setStep(s => Math.min(5, s + 1))
  }

  const prev = () => setStep(s => Math.max(1, s - 1))

  const handleSaveDraft = async () => {
    const payload = {
      type: form.type,
      contractorTeam: form.contractorTeam || null,
      workDescription: form.workDescription || 'Draft permit',
      plantId: form.plantId,
      areaId: form.areaId,
      equipmentId: form.equipmentId || null,
      plannedStart: form.plannedStart ? new Date(form.plannedStart).toISOString() : new Date().toISOString(),
      plannedEnd: form.plannedEnd ? new Date(form.plannedEnd).toISOString() : new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
      hazards: form.hazards,
      ppe: form.ppe,
      precautions: form.precautions,
      typeData: form.typeData,
    }
    await createMutation.mutateAsync(payload)
  }

  const handleSubmit = async () => {
    setSubmitAttempted(true)
    const allErrors: Record<string, string> = {}
    for (let i = 1; i <= 5; i++) {
      Object.assign(allErrors, validateStep(i))
    }
    setErrors(allErrors)
    if (Object.keys(allErrors).length > 0) {
      // Jump to first invalid step
      for (let i = 1; i <= 5; i++) {
        if (Object.keys(validateStep(i)).length > 0) {
          setStep(i)
          break
        }
      }
      return
    }
    const payload = {
      type: form.type,
      contractorTeam: form.contractorTeam || null,
      workDescription: form.workDescription,
      plantId: form.plantId,
      areaId: form.areaId,
      equipmentId: form.equipmentId || null,
      plannedStart: new Date(form.plannedStart).toISOString(),
      plannedEnd: new Date(form.plannedEnd).toISOString(),
      hazards: form.hazards,
      ppe: form.ppe,
      precautions: form.precautions,
      typeData: form.typeData,
    }
    const permit = await createMutation.mutateAsync(payload)
    await submitMutation.mutateAsync(permit.id)
    navigate(`/permits/${permit.id}`)
  }

  const plantOptions = (plants || []).map((p: any) => ({ value: p.id, label: `${p.name} (${p.code})` }))
  const areaOptions = (areas || []).map((a: any) => ({ value: a.id, label: a.name }))
  const equipmentOptions = (equipment || []).map((e: any) => ({ value: e.id, label: `${e.tag} — ${e.name}` }))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Create Permit</h1>
            <p className="text-sm text-gray-500">Industrial work authorization — Step {step} of 5</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveDraft}
              disabled={createMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Save Draft
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-6 py-3">
          <div className="flex items-center">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    step > s.id ? 'bg-green-500 text-white' : step === s.id ? 'bg-brand-600 text-white' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {step > s.id ? <Check className="w-4 h-4" /> : s.id}
                  </div>
                  <span className={`text-sm hidden sm:block ${step === s.id ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-3 ${step > s.id ? 'bg-green-400' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Step 1: Permit Type */}
        {step === 1 && (
          <div>
            <h2 className="text-lg font-bold mb-2">Select Permit Type</h2>
            <p className="text-sm text-gray-500 mb-6">Choose the type of work being performed. This determines the required safety checks.</p>
            {errors.type && <p className="text-sm text-red-500 mb-4 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {errors.type}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([
                { key: 'HOT_WORK' as PermitTypeKey, icon: '🔥', title: 'Hot Work', desc: 'Welding, grinding, cutting, soldering' },
                { key: 'CONFINED_SPACE' as PermitTypeKey, icon: '🕳️', title: 'Confined Space', desc: 'Tank, vessel, pit, or enclosed space entry' },
                { key: 'WORKING_AT_HEIGHT' as PermitTypeKey, icon: '🪜', title: 'Working at Height', desc: 'Work above 2m requiring fall protection' },
                { key: 'ELECTRICAL_LOTO' as PermitTypeKey, icon: '⚡', title: 'Electrical LOTO', desc: 'Lockout/tagout of electrical equipment' },
              ]).map((t) => (
                <button
                  key={t.key}
                  onClick={() => { setForm(f => ({ ...f, type: t.key })); setErrors({}) }}
                  className={`text-left p-5 rounded-xl border-2 transition-all ${
                    form.type === t.key
                      ? 'border-brand-600 bg-brand-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="text-2xl mb-2">{t.icon}</div>
                  <div className="font-semibold text-gray-900">{t.title}</div>
                  <div className="text-sm text-gray-500 mt-1">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Common Information */}
        {step === 2 && (
          <div>
            <h2 className="text-lg font-bold mb-2">Common Permit Information</h2>
            <p className="text-sm text-gray-500 mb-6">Requester, location, schedule, and work details.</p>
            <div className="bg-white rounded-xl border p-6">
              <Field label="Requester" hint="Automatically set from your account">
                <TextInput value={user?.name || ''} onChange={() => {}} disabled />
              </Field>
              <Field label="Contractor / Team" hint="Leave blank if in-house">
                <TextInput
                  value={form.contractorTeam}
                  onChange={(v) => setForm(f => ({ ...f, contractorTeam: v }))}
                  placeholder="e.g. Apex Welding Corp"
                />
              </Field>
              <Field label="Work Description" required error={errors.workDescription}>
                <TextArea
                  value={form.workDescription}
                  onChange={(v) => setForm(f => ({ ...f, workDescription: v }))}
                  placeholder="Describe the work to be performed..."
                  error={errors.workDescription}
                  rows={3}
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Plant" required error={errors.plantId}>
                  <Select
                    value={form.plantId}
                    onChange={(v) => setForm(f => ({ ...f, plantId: v, areaId: '', equipmentId: '' }))}
                    options={plantOptions}
                    error={errors.plantId}
                  />
                </Field>
                <Field label="Area" required error={errors.areaId}>
                  <Select
                    value={form.areaId}
                    onChange={(v) => setForm(f => ({ ...f, areaId: v, equipmentId: '' }))}
                    options={areaOptions}
                    error={errors.areaId}
                    disabled={!form.plantId}
                  />
                </Field>
              </div>
              <Field label="Equipment" hint="Optional — leave blank for area-wide work">
                <Select
                  value={form.equipmentId}
                  onChange={(v) => setForm(f => ({ ...f, equipmentId: v }))}
                  options={equipmentOptions}
                  disabled={!form.areaId}
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Planned Start" required error={errors.plannedStart}>
                  <DateTimeInput
                    value={form.plannedStart}
                    onChange={(v) => setForm(f => ({ ...f, plannedStart: v }))}
                    error={errors.plannedStart}
                  />
                </Field>
                <Field label="Planned End" required error={errors.plannedEnd}>
                  <DateTimeInput
                    value={form.plannedEnd}
                    onChange={(v) => setForm(f => ({ ...f, plannedEnd: v }))}
                    error={errors.plannedEnd}
                  />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Type-Specific */}
        {step === 3 && typeConfig && (
          <div>
            <h2 className="text-lg font-bold mb-2">Type-Specific Details</h2>
            <p className="text-sm text-gray-500 mb-6">Required safety information for {form.type.replace(/_/g, ' ')}.</p>
            <div className="bg-white rounded-xl border p-6">
              {typeConfig.fields.map((f) => {
                const val = form.typeData[f.id]
                const err = errors[`typeData.${f.id}`]
                return (
                  <Field key={f.id} label={f.label} required={f.required} error={err} hint={f.hint}>
                    {f.type === 'text' && (
                      <TextInput
                        value={String(val ?? '')}
                        onChange={(v) => setForm(prev => ({ ...prev, typeData: { ...prev.typeData, [f.id]: v } }))}
                        error={err}
                      />
                    )}
                    {f.type === 'number' && (
                      <NumberInput
                        value={typeof val === 'number' || typeof val === 'string' ? val : ''}
                        onChange={(v) => setForm(prev => ({ ...prev, typeData: { ...prev.typeData, [f.id]: v } }))}
                        error={err}
                      />
                    )}
                    {f.type === 'select' && (
                      <Select
                        value={String(val ?? '')}
                        onChange={(v) => setForm(prev => ({ ...prev, typeData: { ...prev.typeData, [f.id]: v } }))}
                        options={f.options || []}
                        error={err}
                      />
                    )}
                    {f.type === 'textarea' && (
                      <TextArea
                        value={String(val ?? '')}
                        onChange={(v) => setForm(prev => ({ ...prev, typeData: { ...prev.typeData, [f.id]: v } }))}
                        error={err}
                      />
                    )}
                    {f.type === 'datetime' && (
                      <DateTimeInput
                        value={String(val ?? '')}
                        onChange={(v) => setForm(prev => ({ ...prev, typeData: { ...prev.typeData, [f.id]: v } }))}
                        error={err}
                      />
                    )}
                    {f.type === 'checkbox' && (
                      <Checkbox
                        checked={Boolean(val)}
                        onChange={(v) => setForm(prev => ({ ...prev, typeData: { ...prev.typeData, [f.id]: v } }))}
                        label={f.label}
                        description={f.hint}
                      />
                    )}
                  </Field>
                )
              })}
            </div>
          </div>
        )}

        {/* Step 4: Hazards & Precautions */}
        {step === 4 && (
          <div>
            <h2 className="text-lg font-bold mb-2">Hazards & Precautions</h2>
            <p className="text-sm text-gray-500 mb-6">Identify hazards and required PPE. Add any additional precautions.</p>
            <div className="bg-white rounded-xl border p-6 mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">Hazards <span className="text-red-500">*</span></h3>
              {errors.hazards && <p className="text-xs text-red-500 mb-2">{errors.hazards}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {HAZARD_OPTIONS.map((h) => (
                  <Checkbox
                    key={h.id}
                    checked={form.hazards.includes(h.id)}
                    onChange={(checked) => setForm(f => ({
                      ...f,
                      hazards: checked ? [...f.hazards, h.id] : f.hazards.filter(x => x !== h.id)
                    }))}
                    label={h.label}
                  />
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border p-6 mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">PPE Required <span className="text-red-500">*</span></h3>
              {errors.ppe && <p className="text-xs text-red-500 mb-2">{errors.ppe}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PPE_OPTIONS.map((p) => (
                  <Checkbox
                    key={p.id}
                    checked={form.ppe.includes(p.id)}
                    onChange={(checked) => setForm(f => ({
                      ...f,
                      ppe: checked ? [...f.ppe, p.id] : f.ppe.filter(x => x !== p.id)
                    }))}
                    label={p.label}
                  />
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-gray-900 mb-3">Additional Precautions</h3>
              <p className="text-xs text-gray-500 mb-3">Add any extra control measures. Check each item as you confirm it.</p>
              {form.precautions.map((p, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={p.checked}
                    onChange={(e) => {
                      const next = [...form.precautions]
                      next[i] = { ...next[i], checked: e.target.checked }
                      setForm(f => ({ ...f, precautions: next }))
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-brand-600"
                  />
                  <input
                    type="text"
                    value={p.label}
                    onChange={(e) => {
                      const next = [...form.precautions]
                      next[i] = { ...next[i], label: e.target.value }
                      setForm(f => ({ ...f, precautions: next }))
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="e.g. Fire extinguisher staged at work site"
                  />
                  <button
                    onClick={() => setForm(f => ({ ...f, precautions: f.precautions.filter((_, idx) => idx !== i) }))}
                    className="text-red-500 hover:text-red-700 text-sm px-2"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                onClick={() => setForm(f => ({ ...f, precautions: [...f.precautions, { label: '', checked: false }] }))}
                className="mt-2 text-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                + Add precaution
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Approvers */}
        {step === 5 && (
          <div>
            <h2 className="text-lg font-bold mb-2">Approvers</h2>
            <p className="text-sm text-gray-500 mb-6">This permit requires dual approval before work can begin.</p>
            <div className="bg-white rounded-xl border p-6 mb-6">
              <div className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg border border-blue-100 mb-4">
                <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900">Dual Approval Required</p>
                  <p className="text-sm text-blue-700 mt-1">
                    Both an Area Owner and a Safety Officer must approve this permit. You cannot approve your own permit.
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg">
                  <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center">
                    <User className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">Area Owner</p>
                    <p className="text-sm text-gray-500">Responsible for the work area. Confirms isolation, access, and local conditions.</p>
                  </div>
                  <span className="text-xs font-medium text-yellow-700 bg-yellow-50 px-2 py-1 rounded">Pending</span>
                </div>
                <div className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg">
                  <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center">
                    <Shield className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">Safety Officer</p>
                    <p className="text-sm text-gray-500">Reviews hazards, PPE, gas tests, and rescue arrangements.</p>
                  </div>
                  <span className="text-xs font-medium text-yellow-700 bg-yellow-50 px-2 py-1 rounded">Pending</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold text-gray-900 mb-3">Summary</h3>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <dt className="text-gray-500">Type</dt>
                <dd className="font-medium">{form.type.replace(/_/g, ' ')}</dd>
                <dt className="text-gray-500">Requester</dt>
                <dd className="font-medium">{user?.name}</dd>
                <dt className="text-gray-500">Work</dt>
                <dd className="font-medium">{form.workDescription || '—'}</dd>
                <dt className="text-gray-500">Hazards</dt>
                <dd className="font-medium">{form.hazards.length} selected</dd>
                <dt className="text-gray-500">PPE</dt>
                <dd className="font-medium">{form.ppe.length} items</dd>
              </dl>
            </div>
            {createMutation.isError && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5" />
                {(createMutation.error as Error).message}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t">
          <button
            onClick={prev}
            disabled={step === 1}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          {step < 5 ? (
            <button
              onClick={next}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending || submitMutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {createMutation.isPending || submitMutation.isPending ? 'Submitting...' : 'Submit for Approval'}
            </button>
          )}
        </div>
      </main>
    </div>
  )
}