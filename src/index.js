import dgram from 'node:dgram';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
    parseFrame,
    parseTagLocationPacket,
    parseMonitorDataPacket,
    parseBulkBuffer
} from './parser.js';

// Resolve project root for dotenv
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// Config
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 5000);
const OUTPUT_MODE = process.env.OUTPUT_MODE || 'pretty'; // 'pretty' | 'ndjson' | 'raw'

// Optional: load streaming configs for monitors/tags if present
function loadJSONIfExists(relPath) {
    const full = path.resolve(__dirname, '..', relPath);
    if (fs.existsSync(full)) {
        try {
            const text = fs.readFileSync(full, 'utf8');
            return JSON.parse(text);
        } catch (e) {
            log(`Failed to parse ${relPath}: ${e.message}`);
        }
    }
    return null;
}

const monitorsConfig = loadJSONIfExists('config/monitors.json');
const tagsConfig = loadJSONIfExists('config/tags.json');
if (monitorsConfig) {
    log(`Loaded monitors config: ${Array.isArray(monitorsConfig) ? monitorsConfig.length : 0} field descriptors`);
}
if (tagsConfig) {
    log(`Loaded tags config: ${Array.isArray(tagsConfig) ? tagsConfig.length : 0} field descriptors`);
}

let udp;

function log(msg, ...args) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] ${msg}`, ...args);
}

function output(data) {
    switch (OUTPUT_MODE) {
        case 'ndjson':
            process.stdout.write(JSON.stringify(data) + '\n');
            break;
        case 'raw':
            // Write raw buffers to a file for later analysis
            const dumpPath = path.resolve(__dirname, '..', 'data-dump.bin');
            fs.appendFileSync(dumpPath, data);
            break;
        case 'pretty':
        default:
            console.dir(data, { depth: null, colors: true });
            break;
    }
}

// Auto-detect message type and route to appropriate parser
function autoDetectAndParse(buffer) {
    if (buffer.length === 0) {
        return { error: 'Empty buffer' };
    }

    const firstByte = buffer[0];

    // Single tag location packet (Packet ID = 1, length = 10)
    if (firstByte === 1 && buffer.length === 10) {
        return { mode: 'single', ...parseTagLocationPacket(buffer) };
    }

    // Single monitor data packet (Packet ID = 3, length = 13)
    if (firstByte === 3 && buffer.length === 13) {
        return { mode: 'single', ...parseMonitorDataPacket(buffer) };
    }

    // Bulk mode: header is at least 13 bytes and first byte is cycle counter (typically not 1 or 3)
    // Check if we have at least header length and it looks like bulk mode
    if (buffer.length >= 13 && firstByte !== 1 && firstByte !== 3) {
        try {
            return parseBulkBuffer(buffer, true); // Enable checksum verification
        } catch (err) {
            // If bulk parsing fails, fall back to generic frame parser
            log(`Bulk parse failed: ${err.message}`);
            return parseFrame(buffer);
        }
    }

    // Fallback to generic frame parser for unknown formats
    return parseFrame(buffer);
}

// Create UDP server to listen for incoming CenTrak data
udp = dgram.createSocket('udp4');

udp.on('listening', () => {
    const addr = udp.address();
    log(`Listening (UDP) on ${addr.address}:${addr.port}`);
    log(`Output mode: ${OUTPUT_MODE}`);
});

udp.on('message', (msg, rinfo) => {
    try {
        // Auto-detect message type based on first byte and length
        const parsed = autoDetectAndParse(msg);
        // Attach sender info for context
        parsed._from = `${rinfo.address}:${rinfo.port}`;
        output(parsed);
    } catch (err) {
        log('Parse error:', err.message);
        if (OUTPUT_MODE !== 'raw') {
            const dumpPath = path.resolve(__dirname, '..', 'parse-errors.bin');
            fs.appendFileSync(dumpPath, msg);
        }
    }
});

udp.on('error', (err) => {
    log(`UDP server error: ${err.message}`);
    udp.close();
    process.exit(1);
});

udp.bind(PORT, HOST);

// Graceful shutdown
process.on('SIGINT', () => {
    log('Shutting down...');
    try {
        udp.close(() => {
            log('UDP server closed');
            process.exit(0);
        });
    } catch {
        process.exit(0);
    }
});
