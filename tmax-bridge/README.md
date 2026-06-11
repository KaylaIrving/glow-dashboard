# Glow T-Max Bridge

Local Windows service foundation for controlling a T-Max Manager G2 from the salon PC.

Default API:
- `POST /api/tmax/start` with `{ "room": 1, "minutes": 12 }`
- `POST /api/tmax/stop` with `{ "room": 1 }`
- `GET /api/tmax/status`

Default hardware settings:
- COM5
- 9600 baud
- 8 data bits
- no parity
- 1 stop bit
- no flow control

Important:
- The bridge starts in `mockMode: true` so Glow can test dashboard integration without taking over Salon Tracker yet.
- Before live use, confirm the exact T-Max Manager G2 serial command format on the salon PC. The adapter seam is isolated in `tmaxProtocol.js`.

Setup:
1. Copy `config.example.json` to `config.json`.
2. Keep `mockMode: true` for dashboard testing.
3. Run `npm install` inside `tmax-bridge`.
4. Run `npm start`.
5. Browse to `http://127.0.0.1:8787/api/tmax/status`.

Windows service install can be done later with NSSM or Windows Service Wrapper once live protocol is verified.
