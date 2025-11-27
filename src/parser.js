// CenTrak buffer parser harness (stateless)
// This refactors parsing into pure helpers and descriptor-driven pipelines.
// Once the exact protocol doc is provided, plug in field descriptors accordingly.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * parseFrame
 * Input: Buffer containing one or more frame(s) from CenTrak Core Server.
 * Output: A JS object representing decoded fields, or metadata with raw hex.
 */
export function parseFrame(buffer) {
    const hex = buffer.toString('hex');
    return {
        length: buffer.length,
        hex,
        preview: buffer.subarray(0, Math.min(16, buffer.length)).toString('hex'),
        fields: {},
    };
}

// ---------------------- Helpers ----------------------
function rssiToDbm(byteVal) {
    // Input: 0-255 integer
    return (byteVal >= 128) ? (byteVal - 256) / 2.0 - 78 : byteVal / 2.0 - 78;
}

function flipHexPairs(hex) {
    // Swap byte order in a 2-byte hex string: "A1B2" -> "B2A1"
    if (hex.length !== 4) return hex;
    return hex.slice(2, 4) + hex.slice(0, 2);
}

function uint32LEFromSlice(slice) {
    // Safe read of 4 bytes LE from a slice; if smaller, pad on the right
    if (slice.length >= 4) return slice.readUInt32LE();
    const padded = Buffer.concat([slice, Buffer.alloc(4 - slice.length)]);
    return padded.readUInt32LE();
}

function cleanAscii(buf, maxLen) {
    const s = buf.toString('utf8', 0, maxLen ?? buf.length);
    return s.replace(/[^\x20-\x7E]+/g, '').trim();
}

function unixToDate(seconds) {
    return new Date(seconds * 1000);
}

// ---------------- Descriptor runner -----------------
// Each descriptor: { name, bytes, start, parse: (slice, ctx) => value }
export function runDescriptors(buffer, descriptors) {
    const ctx = {};
    for (const d of descriptors) {
        const start = d.start ?? 0;
        const end = start + d.bytes;
        const slice = buffer.subarray(start, end);
        try {
            const val = d.parse ? d.parse(slice, ctx) : slice;
            ctx[d.name] = val;
        } catch (e) {
            ctx[d.name] = { error: e.message, hex: slice.toString('hex') };
        }
    }
    return ctx;
}

// --------------- Sample descriptors ----------------
// These are derived from your example.js default streaming parsing.
// They are intentionally minimal and stateless; extend as needed.

export const tagDefaultDescriptors = [
    {
        name: 'PaddingByte', bytes: 1, start: 0,
        parse: (s) => s,
    },
    {
        name: 'defaultStreamingFields', bytes: 9, start: 1,
        parse: (s) => {
            const out = {};
            // Tag ID from first 4 bytes with bit manipulation
            const tagRFID = s.subarray(0, 4).readUInt32LE();
            const tagId = (tagRFID << 1) >>> 9;
            out.tagId = tagId;

            const rssiByte = s.subarray(4, 5)[0];
            out.rssi = rssiToDbm(rssiByte);

            // Monitor ID from next 3 bytes plus pad
            const monU32 = uint32LEFromSlice(Buffer.concat([s.subarray(5, 8), Buffer.from([0x01])]))
                ^ (1 << 23) ^ (1 << 22);
            out.monitorId = monU32;

            out.command = s.subarray(8, 9).toString('hex');

            // Buttons/motion/retry/LBI from byte at index 9 relative to full frame.
            // In the original code, buttons came from msg.slice(9,10) which is outside this 9-byte window.
            // We'll leave button decoding to a separate descriptor below to avoid misalignment.
            return out;
        },
    },
    {
        name: 'ButtonsMotionRetryLBI', bytes: 1, start: 10,
        parse: (s) => {
            const bits = parseInt(s.toString('hex'), 16).toString(2).padStart(8, '0');
            const out = {
                button1: parseInt(bits[3]),
                button2: parseInt(bits[2]),
                button3: parseInt(bits[1]),
                button4: parseInt(bits[0]),
                inMotion: parseInt(bits[4]),
                lbi: parseInt(bits[7]),
            };
            const retryBits = bits[5] + bits[6];
            out.retry = retryBits === '01' ? 1 : retryBits === '10' ? 2 : retryBits === '11' ? 3 : 0;
            return out;
        },
    },
];

export const monitorDefaultDescriptors = [
    {
        name: 'PaddingByte', bytes: 1, start: 0,
        parse: (s) => s,
    },
    {
        name: 'defaultStreamingFields', bytes: 12, start: 1,
        parse: (s) => {
            const out = {};
            const monU32 = uint32LEFromSlice(Buffer.concat([s.subarray(1, 4), Buffer.from([0x01])]))
                ^ (1 << 23) ^ (1 << 22);
            out.monitorId = monU32;

            const rssiByte = s.subarray(5, 6)[0];
            out.rssi = rssiToDbm(rssiByte);

            const statusByte = s.subarray(6, 7);
            const bits = parseInt(statusByte.toString('hex'), 16).toString(2).padStart(8, '0');
            out.button1 = parseInt(bits[0]);
            out.button2 = parseInt(bits[1]);
            out.button3 = parseInt(bits[2]);
            out.button4 = parseInt(bits[3]);
            out.inMotion = parseInt(bits[4]);
            out.lbi = parseInt(bits[0]);
            out.triggerStatus = parseInt(bits[1]);
            const retryBits = bits[2] + bits[3];
            out.retry = retryBits === '01' ? 1 : retryBits === '10' ? 2 : retryBits === '11' ? 3 : 0;

            out.starMac = s.subarray(7, 13).toString('hex');
            return out;
        },
    },
];

// --------------- Public entry points ---------------
export function parseTagFrame(buffer) {
    return runDescriptors(buffer, tagDefaultDescriptors);
}

export function parseMonitorFrame(buffer) {
    return runDescriptors(buffer, monitorDefaultDescriptors);
}

// ---------------- Bulk mode header -----------------
// Header bytes layout (total 13 bytes):
// [0] Cycle Counter (1 byte)
// [1-6] Star MAC Id (6 bytes, left-to-right hex pairs)
// [7-8] Data Length (2 bytes, stored little-endian like 0x2211)
// [9-10] Data Checksum (2 bytes, little-endian)
// [11-12] Header Checksum (2 bytes, little-endian)

export function parseBulkHeader(buffer) {
    if (buffer.length < 13) {
        throw new Error(`Bulk header too short: ${buffer.length}`);
    }
    const cycleCounter = buffer[0];
    const starMacBytes = buffer.subarray(1, 7);
    const starMac = starMacBytes.toString('hex').match(/.{1,2}/g)?.join(':') ?? '';
    const dataLength = buffer.readUInt16LE(7); // Byte[7-8]
    const dataChecksumLE = buffer.readUInt16LE(9); // Byte[9-10]
    const headerChecksumLE = buffer.readUInt16LE(11); // Byte[11-12]

    return {
        cycleCounter,
        starMac,
        dataLength,
        dataChecksum: dataChecksumLE,
        headerChecksum: headerChecksumLE,
        headerHex: buffer.subarray(0, 13).toString('hex'),
    };
}

// Given a UDP payload that carries only the header or only the data (per spec),
// callers should assemble as needed. This helper assumes a single buffer containing
// header+data for convenience when available.
export function parseBulkPacket(buffer, recordLength, descriptors, verifyChecksums = false) {
    // Extract header
    const header = parseBulkHeader(buffer);
    const payload = buffer.subarray(13, 13 + header.dataLength);
    if (payload.length !== header.dataLength) {
        throw new Error(`Payload length mismatch: got ${payload.length}, header says ${header.dataLength}`);
    }

    // Optional checksum verification (placeholders; implement when checksum rules are provided)
    if (verifyChecksums) {
        // TODO: verify data checksum over payload and header checksum over first 13 bytes
        // using the algorithm from API section 1.4.
    }

    if (!recordLength || recordLength <= 0) {
        throw new Error('recordLength must be provided and > 0 for bulk parsing');
    }

    const records = [];
    const count = Math.floor(payload.length / recordLength);
    for (let i = 0; i < count; i++) {
        const start = i * recordLength;
        const slice = payload.subarray(start, start + recordLength);
        const parsed = runDescriptors(slice, descriptors);
        records.push(parsed);
    }

    return { mode: 'bulk', header, count, records };
}

// --------------- Tag location packet (API 2.2) ---------------
// Fixed 10-byte structure for Packet Identifier=1
// Byte[0]: Packet Identifier (1 = Tag location)
// Byte[1-3]: Tag Id (stored as 0x332211)
// Byte[4]: Raw RSSI
// Byte[5-7]: Monitor Id (stored as 0x332211)
// Byte[8]: Command/Data (AAAA BBBB)
// Byte[9]: Status bits ABCD EFFG (buttons, motion, retry, reserved)

export function parseTagLocationPacket(buffer) {
    if (buffer.length < 10) {
        throw new Error(`Tag location packet too short: ${buffer.length}`);
    }
    const packetId = buffer[0];
    if (packetId !== 1) {
        throw new Error(`Unexpected Packet Identifier: ${packetId}`);
    }

    // Tag ID (3 bytes little-endian like 0x332211). Read into u32 LE with pad
    const tagId = uint32LEFromSlice(Buffer.concat([buffer.subarray(1, 4), Buffer.from([0x00])]));

    // Raw RSSI
    const rawRssi = buffer[4];
    const rssi = rssiToDbm(rawRssi);

    // Monitor ID (3 bytes LE like 0x332211), pad and normalize
    const monitorRaw = uint32LEFromSlice(Buffer.concat([buffer.subarray(5, 8), Buffer.from([0x00])]));
    // Per your earlier logic, indicate monitor ID adjustment: toggle bits 23 and 22
    const monitorId = monitorRaw ^ (1 << 23) ^ (1 << 22);

    // Command/Data split (AAAA BBBB)
    const cmdByteHex = buffer.subarray(8, 9).toString('hex');
    const cmdBits = parseInt(cmdByteHex, 16).toString(2).padStart(8, '0');
    const command = parseInt(cmdBits.slice(0, 4), 2);
    const commandData = parseInt(cmdBits.slice(4, 8), 2);

    // Status: ABCD EFFG
    const statusHex = buffer.subarray(9, 10).toString('hex');
    const statusBits = parseInt(statusHex, 16).toString(2).padStart(8, '0');
    const buttons = {
        button4: parseInt(statusBits[0]),
        button3: parseInt(statusBits[1]),
        button2: parseInt(statusBits[2]),
        button1: parseInt(statusBits[3]),
    };
    const inMotion = parseInt(statusBits[4]);
    const retryBits = statusBits[5] + statusBits[6];
    const retry = retryBits === '01' ? 1 : retryBits === '10' ? 2 : retryBits === '11' ? 3 : 0;
    const reserved = parseInt(statusBits[7]);

    return {
        packetId,
        tagId,
        rssi,
        rawRssi,
        monitorId,
        command,
        commandData,
        buttons,
        inMotion,
        retry,
        reserved,
    };
}

// --------------- Monitor data packet (API 2.3) ---------------
// Fixed 13-byte structure for Packet Identifier=3
// Byte[0]: Packet Identifier (3 = Monitor data)
// Byte[1-3]: Monitor Id (stored as 0x332211)
// Byte[4]: Command/Data (AAAA BBBB)
// Byte[5]: Raw RSSI
// Byte[6]: Status bits ABCC DDDD (reserved, trigger, retry[2], dataIndex[4])
// Byte[7-12]: Star MAC Id (6 bytes, left-to-right hex pairs)

export function parseMonitorDataPacket(buffer) {
    if (buffer.length < 13) {
        throw new Error(`Monitor data packet too short: ${buffer.length}`);
    }
    const packetId = buffer[0];
    if (packetId !== 3) {
        throw new Error(`Unexpected Packet Identifier (monitor): ${packetId}`);
    }

    // Monitor ID (3 bytes LE like 0x332211); pad to 4 for LE read
    const monitorRaw = uint32LEFromSlice(Buffer.concat([buffer.subarray(1, 4), Buffer.from([0x00])]));
    // Normalize similar to prior logic: toggle bits 23 and 22
    const monitorId = monitorRaw ^ (1 << 23) ^ (1 << 22);

    // Command/Data split (AAAA BBBB)
    const cmdByteHex = buffer.subarray(4, 5).toString('hex');
    const cmdBits = parseInt(cmdByteHex, 16).toString(2).padStart(8, '0');
    const command = parseInt(cmdBits.slice(0, 4), 2);
    const commandData = parseInt(cmdBits.slice(4, 8), 2);

    // RSSI
    const rawRssi = buffer[5];
    const rssi = rssiToDbm(rawRssi);

    // Status ABCC DDDD
    const statusHex = buffer.subarray(6, 7).toString('hex');
    const bits = parseInt(statusHex, 16).toString(2).padStart(8, '0');
    const reserved = parseInt(bits[0]);
    const triggerStatus = parseInt(bits[1]);
    const retryBits = bits[2] + bits[3];
    const retry = retryBits === '01' ? 1 : retryBits === '10' ? 2 : retryBits === '11' ? 3 : 0;
    const dataIndex = parseInt(bits.slice(4, 8), 2); // 0-15

    // Star MAC Id (6 bytes)
    const starMacBytes = buffer.subarray(7, 13);
    const starMac = starMacBytes.toString('hex').match(/.{1,2}/g)?.join(':') ?? '';

    return {
        packetId,
        monitorId,
        command,
        commandData,
        rssi,
        rawRssi,
        reserved,
        triggerStatus,
        retry,
        dataIndex,
        starMac,
    };
}

// --------------- Bulk payload router ---------------
// Parse a mixed payload of tag (10b) and monitor (13b) packets based on Packet Identifier.
export function parseBulkDataPayload(payloadBuffer) {
    const records = [];
    let idx = 0;
    while (idx < payloadBuffer.length) {
        const remaining = payloadBuffer.length - idx;
        if (remaining <= 0) break;
        const pid = payloadBuffer[idx];
        if (pid === 1) {
            if (remaining < 10) {
                // Not enough bytes for a tag packet; stop to avoid partial parse
                break;
            }
            const slice = payloadBuffer.subarray(idx, idx + 10);
            const parsed = parseTagLocationPacket(slice);
            records.push({ type: 'tag', ...parsed });
            idx += 10;
        } else if (pid === 3) {
            if (remaining < 13) {
                break;
            }
            const slice = payloadBuffer.subarray(idx, idx + 13);
            const parsed = parseMonitorDataPacket(slice);
            records.push({ type: 'monitor', ...parsed });
            idx += 13;
        } else {
            // Unknown packet identifier; attempt to skip 1 byte to resync and avoid infinite loop
            records.push({ type: 'unknown', packetId: pid, offset: idx });
            idx += 1;
        }
    }
    return { count: records.length, records };
}

// Convenience: parse a buffer containing header+payload in one go
export function parseBulkBuffer(buffer, verifyChecksums = false) {
    const header = parseBulkHeader(buffer);
    const payload = buffer.subarray(13, 13 + header.dataLength);
    const { count, records } = parseBulkDataPayload(payload);

    let checksum = undefined;
    if (verifyChecksums) {
        // Header checksum: sum of first 11 bytes (exclude last 2 bytes at [11-12])
        const hdrSum = checksumSum(buffer.subarray(0, 11));
        const hdrValid = (hdrSum & 0xffff) === header.headerChecksum;
        // Data checksum: sum of payload bytes
        const dataSum = checksumSum(payload);
        const dataValid = (dataSum & 0xffff) === header.dataChecksum;
        checksum = {
            headerCalc: hdrSum & 0xffff,
            headerExpected: header.headerChecksum,
            headerValid: hdrValid,
            dataCalc: dataSum & 0xffff,
            dataExpected: header.dataChecksum,
            dataValid: dataValid,
        };
    }
    return { mode: 'bulk', header, count, records, checksum };
}

// ---------------- Checksum (API 1.4) ----------------
// Sum all bytes modulo 0xFFFF
export function checksumSum(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
        sum += buf[i];
    }
    return sum & 0xffff;
}

// ============================================================================
// Dynamic Descriptor Builder with Parse Functions
// ============================================================================

// Helper for non-whitespace regex matching
const nonWhiteSpace = /(\S+)/;

/**
 * Tag Parse Functions by Index
 * Maps field index to its parse function
 */
const tagParseFunctions = {
    0: (msg) => msg, // PaddingByte

    1: (msg) => { // defaultStreamingFields
        let dsf = {};
        let tag_RFID = msg.slice(0, 9).readUInt32LE();
        let sliced = tag_RFID << 1;
        let tag = sliced >>> 9;
        dsf.tagId = tag;

        let rssi = msg.slice(4, 5).toString('hex');
        rssi = parseInt(rssi, 16);
        if (rssi >= 128) {
            rssi = (rssi - 256) / 2.0 - 78;
        } else {
            rssi = rssi / 2.0 - 78;
        }
        dsf.rssi = rssi;

        let buf = msg.slice(5, 8);
        let buf2 = Buffer.from([0x01]);
        let mont = Buffer.concat([buf, buf2]);
        let monitor = mont.readUInt32LE();
        if (monitor === 0) {
            dsf.monitorId = monitor;
        } else {
            monitor ^= (1 << 23);
            monitor ^= (1 << 22);
            dsf.monitorId = monitor;
        }
        dsf.command = msg.slice(8, 9).toString('hex');

        let buttons = msg.slice(9, 10).toString('hex');
        buttons = parseInt(buttons, 16).toString(2).padStart(8, '0');
        dsf.button1 = parseInt(buttons[3]);
        dsf.button2 = parseInt(buttons[2]);
        dsf.button3 = parseInt(buttons[1]);
        dsf.button4 = parseInt(buttons[0]);
        dsf.inMotion = parseInt(buttons[4]);
        switch (buttons[5] + buttons[6]) {
            case "01": dsf.retry = 1; break;
            case "10": dsf.retry = 2; break;
            case "11": dsf.retry = 3; break;
            default: break;
        }
        dsf.lbi = parseInt(buttons[7]);
        return dsf;
    },

    2: (msg) => msg, // TagRFID
    3: (msg) => msg.toString('hex'), // Command

    4: (msg) => { // RSSI
        let rssi = msg.toString('hex');
        rssi = parseInt(rssi, 16);
        if (rssi >= 128) {
            rssi = (rssi - 256) / 2.0 - 78;
        } else {
            rssi = rssi / 2.0 - 78;
        }
        return rssi;
    },

    5: (msg) => msg, // LBI-Retry-Motion Flag-Keys
    6: (msg) => msg, // Alive-Index
    7: (msg) => msg, // MonitorRFId

    8: (msg) => { // IRID
        let irid = msg.toString('hex');
        irid = irid[2] + irid[3] + irid[0] + irid[1];
        irid = parseInt(irid, 16);
        return irid;
    },

    9: (msg) => { // Type-DIMIR
        msg = msg.toString('hex');
        let binary = parseInt(msg, 16).toString(2).padStart(8, '0');
        const part2 = binary.slice(4, 7);
        return parseInt(part2, 2);
    },

    10: (msg) => { // TemperatureProbe1
        let tempHex1 = msg.toString('hex');
        tempHex1 = tempHex1[2] + tempHex1[3] + tempHex1[0] + tempHex1[1];
        let tempInt = parseInt(tempHex1, 16);
        let temp1 = tempInt / 100;

        if (temp1 > 100) {
            let negTemp = msg.toString('hex');
            negTemp = negTemp[2] + negTemp[3] + negTemp[0] + negTemp[1];
            let binary = parseInt(negTemp, 16).toString(2).padStart(16, '0');
            let goodBinary = "";
            for (let i = 0; i < binary.length; i++) {
                goodBinary += binary[i] === "0" ? "1" : "0";
            }
            temp1 = parseInt(goodBinary, 2) / -100;
        }
        return temp1;
    },

    11: (msg) => { // StrongestStarID
        let star = msg.toString('hex');
        star = star[2] + star[3] + star[0] + star[1];
        return parseInt(star, 16);
    },

    12: (msg) => msg, // Version
    13: (msg) => msg, // Reserved

    14: (msg) => { // AssociatedStarID
        let star = msg.toString('hex');
        star = star[2] + star[3] + star[0] + star[1];
        return parseInt(star, 16);
    },

    15: (msg) => { // ReceivedStarID
        let star3 = msg.toString('hex');
        star3 = star3[2] + star3[3] + star3[0] + star3[1];
        return parseInt(star3, 16);
    },

    16: (msg) => { // Time
        let time = msg.toString('hex');
        time = time[6] + time[7] + time[4] + time[5] + time[2] + time[3] + time[0] + time[1];
        time = parseInt(time, 16);
        return unixToDate(time);
    },

    17: (msg) => msg, // FloorID
    18: (msg) => msg.readFloatLE(), // X
    19: (msg) => msg.readFloatLE(), // Y
    20: (msg) => msg.readFloatLE(), // Z
    25: (msg) => msg, // VendorId
    26: (msg) => msg, // MacId
    27: (msg) => msg, // ObjectId
    28: (msg) => msg, // ConfidenceFactor
    30: (msg) => msg, // ControllerIP
    32: (msg) => msg, // ChangedOn
    38: (msg) => msg, // Latitude
    39: (msg) => msg, // Longitude
    41: (msg) => msg, // Module Version

    44: (msg) => { // HumidityPercent
        let humidity = msg.toString('hex');
        let hHex = humidity[2] + humidity[3] + humidity[0] + humidity[1];
        let hInt = parseInt(hHex, 16);
        return hInt / 100;
    },

    45: (msg) => { // OfflineTempTimeStamp
        let offlineData = {};
        let offlineTime = msg.toString('hex');
        offlineData.raw = msg;

        if (offlineTime != '00000000') {
            offlineTime = offlineTime[6] + offlineTime[7] + offlineTime[4] + offlineTime[5] +
                offlineTime[2] + offlineTime[3] + offlineTime[0] + offlineTime[1];
            offlineTime = parseInt(offlineTime, 16);
            offlineTime = unixToDate(offlineTime);
            offlineData.offlineTime = offlineTime;
            offlineData.offlineFlag = true;
            offlineData.reportTime = offlineTime;
        } else {
            offlineData.offlineFlag = false;
        }
        return offlineData;
    },

    46: (msg) => { // LBIDiff
        let lbiDObj = {};
        let hex = msg.toString('hex');
        let dec = parseInt(hex, 16);
        lbiDObj.dec = dec;
        if (dec > 0) {
            dec = parseFloat(dec / 4096 * 3.6);
        }
        lbiDObj.hex = hex;
        lbiDObj.int = parseInt(hex);
        return lbiDObj;
    },

    47: (msg) => msg, // CampusName

    48: (msg) => { // BuildingName
        let building = msg.toString('utf8', 0, 30);
        building = building.replace(/\s/g, '');
        let match = nonWhiteSpace.exec(building);
        if (building && match && match[1]) {
            building = match[1];
        } else {
            building = "";
        }
        return building;
    },

    49: (msg) => { // FloorName
        let floor = msg.toString('utf8');
        let match = nonWhiteSpace.exec(floor);
        if (floor && match && match[1]) {
            floor = match[1];
        } else {
            floor = "";
        }
        return floor;
    },

    50: (msg) => msg, // Profile
    58: (msg) => msg, // OperatingMode
    52: (msg) => msg, // ZoneID
    53: (msg) => msg, // MeasurementRate

    54: (msg) => { // TemperatureProbe2
        let tempHex1 = msg.toString('hex');
        if (tempHex1 === '3075') {
            return 0;
        }
        tempHex1 = tempHex1[2] + tempHex1[3] + tempHex1[0] + tempHex1[1];
        let tempInt = parseInt(tempHex1, 16);
        let temp1 = tempInt / 100;

        if (temp1 > 100) {
            let negTemp = msg.toString('hex');
            negTemp = negTemp[2] + negTemp[3] + negTemp[0] + negTemp[1];
            let binary = parseInt(negTemp, 16).toString(2).padStart(16, '0');
            let goodBinary = "";
            for (let i = 0; i < binary.length; i++) {
                goodBinary += binary[i] === "0" ? "1" : "0";
            }
            temp1 = parseInt(goodBinary, 2) / -100;
        }
        return temp1;
    },

    55: (msg) => parseInt(msg.toString('hex')), // Probe1TempStatus
    56: (msg) => parseInt(msg.toString('hex')), // Probe2TempStatus
    59: (msg) => msg, // DoorAjarStatus

    60: (msg) => { // LBIValue
        let lbiHex = msg.toString('hex');
        lbiHex = lbiHex[2] + lbiHex[3] + lbiHex[0] + lbiHex[1];
        return parseInt(lbiHex, 16);
    },

    61: (msg) => msg, // Res
    62: (msg) => msg, // Res
    63: (msg) => parseInt(msg.toString('hex')), // EnableHumidity
    64: (msg) => parseInt(msg.toString('hex')), // LocationType
    80: (msg) => parseInt(msg.toString('hex')), // IsEMTag
    81: (msg) => msg, // DoorAjarStatus2
    82: (msg) => msg, // EMTagProbe1Profile
    83: (msg) => msg, // EMTagProbe2Profile
    84: (msg) => msg, // Probe1 Pressure
    85: (msg) => msg, // Probe2 Pressure
    86: (msg) => msg, // Probe1CO2
    87: (msg) => msg, // Probe2CO2
    97: (msg) => parseInt(msg.toString('hex')), // iSEMWiFidisplayTag
};

/**
 * Monitor Parse Functions by Index
 */
const monitorParseFunctions = {
    0: (msg) => msg, // PaddingByte

    1: (msg) => { // defaultStreamingFields
        let monObj = {};
        let buf = msg.slice(1, 4);
        let buf2 = Buffer.from([0x01]);
        let mont = Buffer.concat([buf, buf2]);
        let monitor = mont.readUInt32LE();
        monitor ^= (1 << 23);
        monitor ^= (1 << 22);
        monObj.monitorId = monitor;

        let rssi = msg.slice(5, 6).toString('hex');
        rssi = parseInt(rssi, 16);
        if (rssi >= 128) {
            rssi = (rssi - 256) / 2.0 - 78;
        } else {
            rssi = rssi / 2.0 - 78;
        }
        monObj.rssi = rssi;

        let buttons = msg.slice(6, 7).toString('hex');
        buttons = parseInt(buttons, 16).toString(2).padStart(8, '0');
        monObj.button1 = parseInt(buttons[0]);
        monObj.button2 = parseInt(buttons[1]);
        monObj.button3 = parseInt(buttons[2]);
        monObj.button4 = parseInt(buttons[3]);
        monObj.inMotion = parseInt(buttons[4]);
        monObj.lbi = parseInt(buttons[0]);
        monObj.triggerStatus = parseInt(buttons[1]);

        switch (buttons[2] + buttons[3]) {
            case "01": monObj.retry = 1; break;
            case "10": monObj.retry = 2; break;
            case "11": monObj.retry = 3; break;
            default: break;
        }

        monObj.starMac = msg.slice(7, 13).toString('hex');
        return monObj;
    },

    2: (msg) => msg, // Monitor RFID
    3: (msg) => msg, // Command

    4: (msg) => { // Rssi
        let rssi = msg.toString('hex');
        rssi = parseInt(rssi, 16);
        if (rssi >= 128) {
            rssi = (rssi - 256) / 2.0 - 78;
        } else {
            rssi = rssi / 2.0 - 78;
        }
        return rssi;
    },

    5: (msg) => msg, // Status
    6: (msg) => msg, // associatedStarMacId

    7: (msg) => { // IRID
        let irid = msg.toString('hex');
        irid = irid[2] + irid[3] + irid[0] + irid[1];
        return parseInt(irid, 16);
    },

    8: (msg) => msg, // powerLevelType

    9: (msg) => { // strongestStarId
        let star = msg.toString('hex');
        star = star[2] + star[3] + star[0] + star[1];
        return parseInt(star, 16);
    },

    10: (msg) => msg, // version

    11: (msg) => { // associatedStarId
        let star = msg.toString('hex');
        star = star[2] + star[3] + star[0] + star[1];
        return parseInt(star, 16);
    },

    12: (msg) => { // receivedStarId
        let star = msg.toString('hex');
        star = star[2] + star[3] + star[0] + star[1];
        return parseInt(star, 16);
    },

    13: (msg) => { // time
        let time = msg.toString('hex');
        time = time[6] + time[7] + time[4] + time[5] + time[2] + time[3] + time[0] + time[1];
        time = parseInt(time, 16);
        return unixToDate(time);
    },

    14: (msg) => msg, // floorId
    15: (msg) => msg, // x
    16: (msg) => msg, // y
    17: (msg) => msg, // z
    22: (msg) => msg, // vendorId
    23: (msg) => msg, // macId
    24: (msg) => msg, // objectId
    25: (msg) => msg, // confidenceFactor
    27: (msg) => msg, // controllerIP
    29: (msg) => msg, // changedOn
    34: (msg) => msg, // moduleVersion
    37: (msg) => msg, // campusName

    38: (msg) => { // buildingName
        let building = msg.toString('utf8', 0, 30);
        building = building.replace(/\s/g, '');
        let match = nonWhiteSpace.exec(building);
        if (building && match && match[1]) {
            building = match[1];
        } else {
            building = "";
        }
        return building;
    },

    39: (msg) => { // floorName
        let floor = msg.toString('utf8');
        let match = nonWhiteSpace.exec(floor);
        if (floor && match && match[1]) {
            floor = match[1];
        } else {
            floor = "";
        }
        return floor;
    },

    40: (msg) => msg, // profile

    41: (msg) => { // name
        let monitorName = msg.toString('utf8');
        let match = nonWhiteSpace.exec(monitorName);
        if (monitorName && match && match[1]) {
            monitorName = match[1];
        } else {
            monitorName = "";
        }
        return monitorName;
    },

    42: (msg) => { // LBIValue
        let lbiHex = msg.toString('hex');
        lbiHex = lbiHex[2] + lbiHex[3] + lbiHex[0] + lbiHex[1];
        return parseInt(lbiHex, 16);
    },

    43: (msg) => msg, // keys
};

/**
 * Load JSON config and build complete descriptors with parse functions
 */
export function buildTagDescriptors() {
    const configPath = path.resolve(__dirname, '..', 'config', 'tags.json');
    if (!fs.existsSync(configPath)) {
        console.warn('tags.json not found, using defaults');
        return tagDefaultDescriptors;
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.map(field => ({
        name: field.Name,
        bytes: field.bytes,
        index: field.index,
        sNo: field.sNo,
        parse: tagParseFunctions[field.index] || ((msg) => msg)
    }));
}

export function buildMonitorDescriptors() {
    const configPath = path.resolve(__dirname, '..', 'config', 'monitors.json');
    if (!fs.existsSync(configPath)) {
        console.warn('monitors.json not found, using defaults');
        return monitorDefaultDescriptors;
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.map(field => ({
        name: field.Name,
        bytes: field.bytes,
        index: field.index,
        sNo: field.sNo,
        parse: monitorParseFunctions[field.index] || ((msg) => msg)
    }));
}
