import { PermitType } from '../../types'
import { format } from 'date-fns'

interface TypeDataCardProps {
  type: PermitType
  typeData: Record<string, any>
}

export function TypeDataCard({ type, typeData }: TypeDataCardProps) {
  if (!typeData || Object.keys(typeData).length === 0) {
    return <div className="text-xs text-gray-500 italic">No type-specific data provided.</div>
  }

  const renderField = (label: string, value: any, unit: string = '') => {
    if (value === undefined || value === null || value === '') return null
    let displayVal = value
    if (typeof value === 'boolean') {
      displayVal = value ? 'YES (Verified)' : 'NO'
    } else if (label.toLowerCase().includes('time') && typeof value === 'string') {
      try {
        displayVal = format(new Date(value), 'MMM d, yyyy HH:mm')
      } catch {
        displayVal = value
      }
    }

    return (
      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
        <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</dt>
        <dd className="mt-1 text-sm font-semibold text-gray-900 flex items-baseline gap-1">
          <span>{String(displayVal)}</span>
          {unit && <span className="text-xs font-normal text-gray-500">{unit}</span>}
        </dd>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {type === 'HOT_WORK' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {renderField('Work Type', typeData.workType || typeData.hotWorkType)}
          {renderField('Fire Watch Name', typeData.fireWatchName)}
          {renderField('Extinguisher Type', typeData.extinguisherType)}
          {renderField('Combustibles Cleared Radius', typeData.combustiblesClearedRadiusM, 'm')}
          {renderField('LEL %', typeData.lelPercent, '%')}
          {renderField('O2 %', typeData.o2Percent, '%')}
          {renderField('Gas Test Time', typeData.gasTestTime)}
        </div>
      )}

      {type === 'CONFINED_SPACE' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {renderField('Space ID', typeData.spaceId)}
          {renderField('Entry Point', typeData.entryPoint)}
          {renderField('O2 %', typeData.o2Percent, '%')}
          {renderField('LEL %', typeData.lelPercent, '%')}
          {renderField('H2S ppm', typeData.h2sPpm, 'ppm')}
          {renderField('CO ppm', typeData.coPpm, 'ppm')}
          {renderField('Gas Test Time', typeData.gasTestTime)}
          {renderField('Standby Attendant', typeData.standbyAttendantName)}
          {renderField('Ventilation Method', typeData.ventilationMethod)}
          {renderField('Rescue Plan', typeData.rescuePlan)}
          {renderField('Entry/Exit Log', typeData.entryExitLog)}
        </div>
      )}

      {type === 'WORKING_AT_HEIGHT' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {renderField('Height', typeData.heightM, 'm')}
          {renderField('Access Method', typeData.accessMethod)}
          {renderField('Fall Arrest Equipment', typeData.fallArrestEquipment)}
          {renderField('Anchor Point Checked', typeData.anchorPointChecked)}
          {renderField('Barricading Below', typeData.barricadingBelow)}
        </div>
      )}

      {type === 'ELECTRICAL_LOTO' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {renderField('Equipment Tag', typeData.equipmentTag)}
          {renderField('Voltage', typeData.voltageV, 'V')}
          {renderField('Isolation Points', typeData.isolationPoints)}
          {renderField('Lock Numbers', typeData.lockNumbers)}
          {renderField('Tag Numbers', typeData.tagNumbers)}
          {renderField('Earthing Applied', typeData.earthing)}
          {renderField('Tested Dead By', typeData.testedDeadBy)}
        </div>
      )}

      {/* Fallback for additional dynamic fields */}
      <div className="pt-2 border-t border-gray-100 flex flex-wrap gap-2">
        {Object.entries(typeData).map(([key, val]) => {
          const knownKeys = [
            'workType', 'hotWorkType', 'fireWatchName', 'extinguisherType', 'combustiblesClearedRadiusM', 'lelPercent', 'o2Percent', 'gasTestTime',
            'spaceId', 'entryPoint', 'h2sPpm', 'coPpm', 'standbyAttendantName', 'rescuePlan', 'ventilationMethod', 'entryExitLog',
            'heightM', 'accessMethod', 'fallArrestEquipment', 'anchorPointChecked', 'barricadingBelow',
            'equipmentTag', 'voltageV', 'isolationPoints', 'lockNumbers', 'tagNumbers', 'earthing', 'testedDeadBy'
          ]
          if (knownKeys.includes(key)) return null
          return (
            <span key={key} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
              <strong className="capitalize">{key.replace(/([A-Z])/g, ' $1')}:</strong> {String(val)}
            </span>
          )
        })}
      </div>
    </div>
  )
}
