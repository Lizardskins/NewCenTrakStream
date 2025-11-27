# NewCenTrakStream

This project consumes a TCP buffer data feed from a CenTrak Core Server and provides a simple Node.js client to connect, read, and inspect messages.

## Setup

1. Ensure you have Node.js 18+ installed.
2. Copy the environment example and edit values:

	```zsh
	cp .env.example .env
	# Edit HOST and PORT to point to your CenTrak Core Server
	```

3. Install dependencies:

	```zsh
	npm install
	```

## Run

Start the consumer:

```zsh
npm run start
```

Environment variables:

- `HOST` Server host (default `127.0.0.1`)
- `PORT` Server port (default `5000`)
- `RECONNECT_MS` Auto-reconnect delay in ms (default `3000`)
- `OUTPUT_MODE` `pretty` | `ndjson` | `raw`
  - `pretty`: human-readable object
  - `ndjson`: newline-delimited JSON to stdout
  - `raw`: append raw buffers to `data-dump.bin`

## Files

- `src/index.js` TCP client that connects to the Core Server and handles incoming Buffer data, with auto-reconnect.
- `src/parser.js` Parser stub that converts a Buffer into a useful preview and a placeholder object. Update this once protocol details are provided.
- `.env.example` Example environment configuration.
- `config/monitors.json` Streaming options and monitor list (optional; loaded if present).
- `config/tags.json` Streaming options and tag list (optional; loaded if present).

## Next steps

Please share the CenTrak Core Server feed specifics (frame delimiters, headers, field offsets/lengths, endianness, checksum) from your API document. With that, we will:

- Implement frame boundary detection (e.g., start-of-frame markers, length field).
- Decode message types and payload fields into structured JSON.
- Validate checksums/CRC where applicable.
- Add small tests to verify parsing logic against sample frames.
# NewCenTrakStream