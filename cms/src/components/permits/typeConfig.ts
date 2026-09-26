export type PermitTypeKey = 'HOT_WORK' | 'CONFINED_SPACE' | 'WORKING_AT_HEIGHT' | 'ELECTRICAL_LOTO'

export interface TypeSpecificConfig {
  fields: Array<{
    id: string
    label: string
    type: 'text' | 'number' | 'select' | 'textarea' | 'checkbox' | 'datetime'
    required?: boolean
    options?: Array<{ value: string; label: string }>
    hint?: string
  }>
}

export const TYPE_CONFIG: Record<PermitTypeKey, TypeSpecificConfig> = {
  HOT_WORK: {
    fields: [
      { id: 'workType', label: 'Work Type', type: 'select', required: true, options: [
        { value: 'WELDING', label: 'Welding' },
        { value: 'GRINDING', label: 'Grinding' },
        { value: 'CUTTING', label: 'Cutting' },
        { value: 'SOLDERING', label: 'Soldering' },
      ]},
      { id: 'fireWatchName', label: 'Fire Watch Name', type: 'text', required: true },
      { id: 'extinguisherType', label: 'Fire Extinguisher Type', type: 'select', required: true, options: [
        { value: 'CO2_9KG', label: 'CO2 9kg' },
        { value: 'DRY_CHEMICAL_5KG', label: 'Dry Chemical 5kg' },
        { value: 'FOAM_10L', label: 'Foam 10L' },
      ]},
      { id: 'combustiblesClearedRadiusM', label: 'Combustibles Cleared Radius (m)', type: 'number', required: true },
      { id: 'lelPercent', label: 'LEL %', type: 'number', required: true, hint: 'Lower Explosive Limit percentage' },
      { id: 'o2Percent', label: 'O2 %', type: 'number', required: true, hint: 'Oxygen percentage in atmosphere' },
      { id: 'gasTestTime', label: 'Gas Test Time', type: 'datetime', required: true },
    ]
  },
  CONFINED_SPACE: {
    fields: [
      { id: 'spaceId', label: 'Space ID', type: 'text', required: true },
      { id: 'entryPoint', label: 'Entry Point', type: 'text', required: true },
      { id: 'o2Percent', label: 'O2 %', type: 'number', required: true },
      { id: 'lelPercent', label: 'LEL %', type: 'number', required: true },
      { id: 'h2sPpm', label: 'H2S ppm', type: 'number', required: true },
      { id: 'coPpm', label: 'CO ppm', type: 'number', required: true },
      { id: 'gasTestTime', label: 'Gas Test Time', type: 'datetime', required: true },
      { id: 'standbyAttendantName', label: 'Standby Attendant', type: 'text', required: true },
      { id: 'rescuePlan', label: 'Rescue Plan', type: 'textarea', required: true, hint: 'Describe rescue equipment and procedure' },
      { id: 'ventilationMethod', label: 'Ventilation Method', type: 'select', required: true, options: [
        { value: 'FORCED_AIR_BLOWER', label: 'Forced Air Blower' },
        { value: 'NATURAL', label: 'Natural Ventilation' },
        { value: 'EXTRACTOR', label: 'Extractor Fan' },
      ]},
      { id: 'entryExitLog', label: 'Entry / Exit Log', type: 'textarea', hint: 'Record entry and exit times of all personnel' },
    ]
  },
  WORKING_AT_HEIGHT: {
    fields: [
      { id: 'heightM', label: 'Height (m)', type: 'number', required: true, hint: 'Working height above ground or floor' },
      { id: 'accessMethod', label: 'Access Method', type: 'select', required: true, options: [
        { value: 'LADDER', label: 'Ladder' },
        { value: 'SCAFFOLD', label: 'Scaffold' },
        { value: 'CRANE_BASKET', label: 'Crane Basket' },
        { value: 'BOOM_LIFT', label: 'Boom Lift' },
      ]},
      { id: 'fallArrestEquipment', label: 'Fall Arrest Equipment', type: 'textarea', required: true, hint: 'Harness, lanyard, shock absorber details' },
      { id: 'anchorPointChecked', label: 'Anchor Point Checked', type: 'checkbox', required: true, hint: 'Confirm anchor integrity test passed' },
      { id: 'barricadingBelow', label: 'Barricading Below', type: 'textarea', hint: 'Describe barricade zone and warning signs' },
    ]
  },
  ELECTRICAL_LOTO: {
    fields: [
      { id: 'equipmentTag', label: 'Equipment Tag', type: 'text', required: true },
      { id: 'voltageV', label: 'Voltage (V)', type: 'number', required: true },
      { id: 'isolationPoints', label: 'Isolation Points', type: 'textarea', required: true, hint: 'List all isolation points / disconnects' },
      { id: 'lockNumbers', label: 'Lock Numbers', type: 'textarea', required: true },
      { id: 'tagNumbers', label: 'Tag Numbers', type: 'textarea', required: true },
      { id: 'earthing', label: 'Earthing Applied', type: 'checkbox', required: true, hint: 'Confirm earth connection verified' },
      { id: 'testedDeadBy', label: 'Tested Dead By', type: 'text', required: true, hint: 'Name of qualified person performing dead test' },
    ]
  },
}