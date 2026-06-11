export const TMAX_STATES = {
  AVAILABLE: 'Available',
  UNDRESS: 'Undress Delay',
  RUNNING: 'Running',
  FINISHED: 'Finished',
  ERROR: 'Error'
}

// T-Max Manager G2 live command bytes must be verified on the salon PC before mockMode is disabled.
// Salon Tracker already controls this hardware, so this bridge keeps the live protocol isolated here.
export function buildStartCommand({ room, minutes }) {
  throw new Error(`Live T-Max start command is not configured yet for room ${room}, ${minutes} minutes.`)
}

export function buildStopCommand({ room }) {
  throw new Error(`Live T-Max stop command is not configured yet for room ${room}.`)
}

export function parseStatusResponse() {
  return null
}
