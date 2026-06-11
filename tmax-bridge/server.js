import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildStartCommand, buildStopCommand, TMAX_STATES } from './tmaxProtocol.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const configPath = path.join(__dirname, 'config.json')
const fallbackConfigPath = path.join(__dirname, 'config.example.json')
const config = JSON.parse(fs.readFileSync(fs.existsSync(configPath) ? configPath : fallbackConfigPath, 'utf8'))
const state = {
  connected: false,
  mockMode: config.mockMode !== false,
  lastError: '',
  rooms: Object.fromEntries(Object.keys(config.roomMap || { 1: '', 2: '', 3: '' }).map((room) => [room, {
    room: Number(room),
    name: config.roomMap[String(room)],
    status: TMAX_STATES.AVAILABLE,
    minutes: 0,
    startedAt: null,
    finishesAt: null
  }]))
}
let serialPort = null
let reconnectTimer = null

function log(message, data = null) {
  const line = `[${new Date().toISOString()}] ${message}${data ? ` ${JSON.stringify(data)}` : ''}`
  console.log(line)
  fs.appendFile(path.join(__dirname, 'glow-tmax-bridge.log'), `${line}\n`, () => {})
}

async function connectSerial() {
  if (state.mockMode) {
    state.connected = true
    log('Mock mode enabled. Serial port is not opened.', { comPort: config.comPort })
    return
  }
  try {
    const { SerialPort } = await import('serialport')
    serialPort = new SerialPort({
      path: config.comPort || 'COM5',
      baudRate: Number(config.baudRate || 9600),
      dataBits: Number(config.dataBits || 8),
      parity: config.parity || 'none',
      stopBits: Number(config.stopBits || 1),
      rtscts: Boolean(config.flowControl)
    })
    serialPort.on('open', () => { state.connected = true; state.lastError = ''; log('Serial port opened.', { comPort: config.comPort }) })
    serialPort.on('error', (error) => { state.connected = false; state.lastError = error.message; log('Serial port error.', { error: error.message }); scheduleReconnect() })
    serialPort.on('close', () => { state.connected = false; log('Serial port closed.'); scheduleReconnect() })
  } catch (error) {
    state.connected = false
    state.lastError = error.message
    log('Serial connection failed.', { error: error.message })
    scheduleReconnect()
  }
}

function scheduleReconnect() {
  if (state.mockMode || reconnectTimer) return
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connectSerial() }, 5000)
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}) } catch { resolve({}) }
    })
  })
}

function updateMockRooms() {
  const now = Date.now()
  Object.values(state.rooms).forEach((room) => {
    if (!room.finishesAt) return
    const finish = new Date(room.finishesAt).getTime()
    const start = new Date(room.startedAt).getTime()
    if (now >= finish) room.status = TMAX_STATES.FINISHED
    else if (now - start < 3 * 60 * 1000) room.status = TMAX_STATES.UNDRESS
    else room.status = TMAX_STATES.RUNNING
  })
}

async function startRoom(payload) {
  const room = Number(payload.room)
  const minutes = Number(payload.minutes)
  if (!state.rooms[String(room)]) throw new Error(`Unknown T-Max room ${room}.`)
  if (!minutes || minutes < 1 || minutes > 60) throw new Error('Minutes must be between 1 and 60.')
  if (state.mockMode) {
    const now = new Date()
    state.rooms[String(room)] = {
      ...state.rooms[String(room)],
      status: TMAX_STATES.UNDRESS,
      minutes,
      startedAt: now.toISOString(),
      finishesAt: new Date(now.getTime() + (minutes + 3) * 60000).toISOString()
    }
    log('Mock start room.', { room, minutes })
    return state.rooms[String(room)]
  }
  const command = buildStartCommand({ room, minutes })
  await new Promise((resolve, reject) => serialPort.write(command, (error) => error ? reject(error) : resolve()))
  log('Sent T-Max start command.', { room, minutes })
  return { room, status: TMAX_STATES.UNDRESS, minutes }
}

async function stopRoom(payload) {
  const room = Number(payload.room)
  if (!state.rooms[String(room)]) throw new Error(`Unknown T-Max room ${room}.`)
  if (state.mockMode) {
    state.rooms[String(room)] = { ...state.rooms[String(room)], status: TMAX_STATES.FINISHED, finishesAt: new Date().toISOString() }
    log('Mock stop room.', { room })
    return state.rooms[String(room)]
  }
  const command = buildStopCommand({ room })
  await new Promise((resolve, reject) => serialPort.write(command, (error) => error ? reject(error) : resolve()))
  log('Sent T-Max stop command.', { room })
  return { room, status: TMAX_STATES.FINISHED }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return sendJson(res, 200, {})
  try {
    updateMockRooms()
    if (req.method === 'GET' && req.url === '/api/tmax/status') {
      return sendJson(res, 200, { connected: state.connected, mockMode: state.mockMode, comPort: config.comPort, lastError: state.lastError, rooms: Object.values(state.rooms) })
    }
    if (req.method === 'POST' && req.url === '/api/tmax/start') return sendJson(res, 200, { ok: true, room: await startRoom(await readBody(req)) })
    if (req.method === 'POST' && req.url === '/api/tmax/stop') return sendJson(res, 200, { ok: true, room: await stopRoom(await readBody(req)) })
    sendJson(res, 404, { error: 'Not found' })
  } catch (error) {
    state.lastError = error.message
    log('API error.', { url: req.url, error: error.message })
    sendJson(res, 500, { ok: false, error: error.message })
  }
})

server.listen(Number(config.port || 8787), '127.0.0.1', () => {
  log('Glow T-Max Bridge listening.', { port: config.port || 8787, comPort: config.comPort, mockMode: state.mockMode })
  connectSerial()
})
