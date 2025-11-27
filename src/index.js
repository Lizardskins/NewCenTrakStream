import dgram from 'node:dgram';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {
    parseFrame,
    parseTagLocationPacket,
    parseMonitorDataPacket,
    parseBulkBuffer,
    parseBulkBufferMulti,
    parseTagStreamingPacket,
    expectedTagStreamingLength,
    parseMonitorStreamingPacket,
    expectedMonitorStreamingLength
} from './parser.js';
import { parseHeaderAndRoute, parseBulkHeader, computeHeaderChecksumVariants, parseBulkHeaderUserStyle } from './parser.js';

// Resolve project root for dotenv
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// Config
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 7165);
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

    // Ignore standalone headers here; they are handled by the header/payload router
    if (buffer.length === 16) {
        return { mode: 'header', info: 'Standalone header received' };
    }

    // Single tag location packet (Packet ID = 1, length = 10)
    if (firstByte === 1 && buffer.length === 10) {
        return { mode: 'single', ...parseTagLocationPacket(buffer) };
    }

    // Single monitor data packet (Packet ID = 3, length = 13)
    if (firstByte === 3 && buffer.length === 13) {
        return { mode: 'single', ...parseMonitorDataPacket(buffer) };
    }

    // Bulk mode: header is 13 bytes. Try parsing if buffer is long enough and header's length matches.
    if (buffer.length >= 16) {
        try {
            const headerDataLength = buffer.readUInt16LE(7);
            const totalExpected = 16 + headerDataLength;
            if (buffer.length >= totalExpected) {
                // If buffer contains multiple bulk frames back-to-back, parse them all
                const multi = parseBulkBufferMulti(buffer, true);
                if (multi.frames && multi.frames.length > 1) {
                    return multi;
                }
                // Else parse single bulk
                return parseBulkBuffer(buffer, true);
            }
        } catch (e) {
            // ignore and fall through to generic parser
        }
    }

    // Tag streaming (fixed selection) detection by expected length
    try {
        const len = expectedTagStreamingLength();
        if (buffer.length === len) {
            return parseTagStreamingPacket(buffer);
        }
        // Fallback: many deployments send 115-byte tag streams; if mismatch, still try
        if (buffer.length === 115) {
            try {
                return parseTagStreamingPacket(buffer);
            } catch (e) {
                // Last resort: run default tag descriptors over the frame
                const fields = parseFrame(buffer);
                fields.warning = `Tag streaming parse failed (expected ${len}, got ${buffer.length}): ${e.message}`;
                return fields;
            }
        }
    } catch { }

    // Monitor streaming detection by expected length (~91 bytes)
    try {
        const mlen = expectedMonitorStreamingLength();
        if (buffer.length === mlen) {
            return parseMonitorStreamingPacket(buffer);
        }
        // Fallback: if length is 91, attempt monitor streaming even if computed differs
        if (buffer.length === 91) {
            try {
                return parseMonitorStreamingPacket(buffer);
            } catch (e) {
                const fields = parseFrame(buffer);
                fields.warning = `Monitor streaming parse failed (expected ${mlen}, got ${buffer.length}): ${e.message}`;
                return fields;
            }
        }
    } catch { }

    // Fallback to generic frame parser for unknown formats
    return parseFrame(buffer);
}

// Create UDP server to listen for incoming CenTrak data
udp = dgram.createSocket('udp4');// Bind to port only; OS will listen on all interfaces by default (0.0.0.0)
udp.bind(PORT);

udp.on('listening', () => {
    const addr = udp.address();
    log(`Listening (UDP) on ${addr.address}:${addr.port}`);
    log(`Output mode: ${OUTPUT_MODE}`);
    // Report expected streaming lengths to verify descriptor selections
    try {
        const tlen = expectedTagStreamingLength?.();
        if (typeof tlen === 'number') {
            log(`Expected tag streaming length: ${tlen} bytes`);
        }
    } catch { }
    try {
        const mlen = expectedMonitorStreamingLength?.();
        if (typeof mlen === 'number') {
            log(`Expected monitor streaming length: ${mlen} bytes`);
        }
    } catch { }
});

udp.on('message', (msg, rinfo) => {
    // Basic receive log to help diagnose input issues
    log(`Received ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`);
    try {
        // Route header+payload pairs: first a 16-byte header, then a payload buffer.
        const key = `${rinfo.address}:${rinfo.port}`;
        if (!udp._pending) udp._pending = new Map();
        const pending = udp._pending.get(key);

        if (msg.length === 16) {
            // Store header and expected payload length using parseBulkHeader
            const header = parseBulkHeader(msg);
            // Support multiple concurrent header/payload pairs per sender (queue)
            const queue = udp._pending.get(key) || [];
            // Heuristic: prefer alt header dataLengthLE if it matches observed small payloads
            const altHdrForQueue = parseBulkHeaderUserStyle(msg);
            const expectedLen = (altHdrForQueue?.dataLengthLE && altHdrForQueue.dataLengthLE > 0 && altHdrForQueue.dataLengthLE < 65536) ? altHdrForQueue.dataLengthLE : header.dataLength;
            queue.push({ header, headerBuf: msg, expected: expectedLen, chunks: [], received: 0 });
            udp._pending.set(key, queue);
            const hdrChecks = computeHeaderChecksumVariants(msg);
            const altHdr = parseBulkHeaderUserStyle(msg);
            const parsed = { mode: 'header', header, altHeader: altHdr, checksum: hdrChecks, _from: key, _hex: msg.toString('hex') };
            output(parsed);
            return;
        }

        if (pending) {
            // There may be multiple pending headers; append this payload chunk to the oldest that still needs bytes
            const queue = udp._pending.get(key) || [];
            if (queue.length > 0) {
                const current = queue[0];
                current.chunks.push(msg);
                current.received += msg.length;
                if (current.received >= current.expected) {
                    const payload = Buffer.concat(current.chunks).subarray(0, current.expected);
                    const combined = Buffer.concat([current.headerBuf, payload]);
                    const routed = parseHeaderAndRoute(combined, true);
                    routed._from = key;
                    routed._hex = payload.toString('hex');
                    output(routed);
                    // Remove the consumed header from the queue
                    queue.shift();
                }
                // Update or clear queue
                if (queue.length > 0) {
                    udp._pending.set(key, queue);
                } else {
                    udp._pending.delete(key);
                }
                return;
            }
        }

        // If no pending header, fall back to auto-detect on standalone buffers
        const parsed = autoDetectAndParse(msg);
        parsed._from = key;
        parsed._hex = msg.toString('hex');
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
