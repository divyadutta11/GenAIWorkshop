import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Native zero-dependency Excel (.xlsx & .csv) Q&A Knowledge Base + TF-IDF RAG Agent.
 * Reads and writes standard OOXML .xlsx workbooks using Node's built-in node:zlib,
 * indexes predefined Questions & Answers with TF-IDF + phrase scoring, and
 * augments AI assistant replies with grounded Excel rows + live customer telemetry.
 */

export const DEFAULT_FAQ_ROWS = [
  {
    id: 'faq_1',
    category: 'Billing & Rupees',
    question: 'How is my estimated monthly electricity bill in Rupees calculated?',
    answer: 'Your estimated monthly bill in ₹ is computed by multiplying hourly smart-meter consumption (kWh) by your active Time-of-Use (TOU) tariff rate (Off-Peak, Mid-Peak, or On-Peak), scaling to a 30-day billing cycle, and adding the plan fixed monthly charge.',
    keywords: 'bill, rupees, calculate, formula, fixed charge, monthly cost, inr',
    actionTab: 'customer-tariff',
    actionLabel: 'Open Tariff Breakdown'
  },
  {
    id: 'faq_2',
    category: 'Tariffs & TOU',
    question: 'What are the Time-of-Use peak and off-peak hours?',
    answer: 'On-Peak hours run from 4:00 PM to 9:00 PM (16:00–20:59) when grid demand and rates are highest. Mid-Peak runs 7:00 AM–4:00 PM and 9:00–10:00 PM. Off-Peak runs overnight from 10:00 PM to 7:00 AM at the lowest ₹/kWh rate.',
    keywords: 'peak, off-peak, mid-peak, hours, tou, window, timing, 4 pm, 9 pm',
    actionTab: 'overview',
    actionLabel: 'View 24h TOU Chart'
  },
  {
    id: 'faq_3',
    category: 'Tariffs & TOU',
    question: 'Which tariff plan is best for EV owners or overnight usage?',
    answer: 'The EV & Overnight Saver (TOU) plan offers the lowest overnight rate at ₹4.20/kWh (vs ₹5.50/kWh on Standard TOU and ₹7.60/kWh Flat), making it ideal if you schedule EV charging, geysers, or washing machines after 10:00 PM.',
    keywords: 'ev, electric vehicle, best plan, cheapest tariff, overnight, saver',
    actionTab: 'customer-tariff',
    actionLabel: 'Compare Tariff Plans'
  },
  {
    id: 'faq_4',
    category: 'Climate & AC',
    question: 'How can I reduce high afternoon AC electricity bills?',
    answer: 'Pre-cool your home before 4:00 PM during Mid-Peak hours and raise the AC thermostat setpoint by 2°C (from 22°C to 24°C) during the 4–9 PM peak window. Each 1°C increase saves roughly 6–8% in compressor energy.',
    keywords: 'ac, hvac, cooling, thermostat, setpoint, afternoon, summer, reduce',
    actionTab: 'simulator',
    actionLabel: 'Simulate +2°C AC Shift'
  },
  {
    id: 'faq_5',
    category: 'Baseload Efficiency',
    question: 'What is overnight baseload or vampire power and how do I lower it?',
    answer: 'Overnight baseload is continuous power drawn while everyone sleeps (refrigerators, Wi-Fi routers, set-top boxes, TVs on standby, and inverter idle draw). Using smart power strips to cut entertainment and office racks overnight typically reduces standby draw by 25–30%.',
    keywords: 'baseload, vampire, standby, night, overnight, idle, smart plug',
    actionTab: 'recommendations',
    actionLabel: 'View Baseload Actions'
  },
  {
    id: 'faq_6',
    category: 'Solar & Battery',
    question: 'How much rooftop solar and battery size should I consider?',
    answer: 'In India, 1 kW of rooftop solar generates ~125 kWh/month on average. Homes using 500–850 kWh/month typically benefit from a 3.5–5 kW rooftop solar array paired with a 5 kWh battery to shave evening 5–9 PM peak grid imports.',
    keywords: 'solar, rooftop, pv, battery, storage, net metering, payback, kw',
    actionTab: 'simulator',
    actionLabel: 'Test Solar in Simulator'
  },
  {
    id: 'faq_7',
    category: 'Customer Profile',
    question: 'Where can I view or update my customer profile and sanctioned load?',
    answer: 'Open the Customer & Tariff tab to view your Account ID, DISCOM, Smart Meter ID, Sanctioned Load (kW), and assigned tariff plan. You can edit the active profile, create new customer profiles, or switch between stored profiles in one click.',
    keywords: 'customer, profile, account, sanctioned load, meter id, discom, switch',
    actionTab: 'customer-tariff',
    actionLabel: 'Open Customer Profile'
  },
  {
    id: 'faq_8',
    category: 'Utility API & Data',
    question: 'How do I upload smart meter data or automate utility API syncing?',
    answer: 'Go to the Utility API & Data Flow tab to drag-and-drop CSV or JSON smart-meter files, or connect an automated feed (Tata Power Smart Meter Hub, BESCOM AMI, Green Button ESPI, Octopus) on a 15-minute, hourly, 6-hour, or daily cadence.',
    keywords: 'upload, csv, json, utility api, sync, pipeline, smart meter, tata power',
    actionTab: 'data-flow',
    actionLabel: 'Open Data Flow Tab'
  },
  {
    id: 'faq_9',
    category: 'Anomalies & Diagnostics',
    question: 'What does an anomaly day on the 30-day consumption chart mean?',
    answer: 'An anomaly day is flagged whenever daily kWh consumption exceeds your 30-day daily mean by more than 24%. Common causes include prolonged AC runtime on hot afternoons, unscheduled daytime EV charging, or water heater/pump faults.',
    keywords: 'anomaly, spike, high usage, alert, 24%, daily chart, why',
    actionTab: 'overview',
    actionLabel: 'Inspect 30-Day Chart'
  },
  {
    id: 'faq_10',
    category: 'Appliances',
    question: 'How much energy can BLDC fans, LEDs, and 5-star inverter appliances save?',
    answer: 'Replacing conventional 75W ceiling fans with 28W BLDC fans, switching halogen bulbs to LEDs, and enabling eco-mode on washing machines/dryers typically reduces lighting and appliance electricity consumption by 20–25%.',
    keywords: 'bldc, fan, led, appliance, 5 star, inverter, lighting, dryer',
    actionTab: 'simulator',
    actionLabel: 'Toggle Eco Mode in Simulator'
  },
  {
    id: 'faq_11',
    category: 'Billing & Subsidies',
    question: 'What is sanctioned load and why does it matter for my connection?',
    answer: 'Sanctioned load (measured in kW) is the maximum continuous power capacity approved by your DISCOM for your meter. Staying within your sanctioned load avoids excess-demand penalties and helps size rooftop solar or EV chargers safely.',
    keywords: 'sanctioned load, penalty, capacity, kw, connection, discom',
    actionTab: 'customer-tariff',
    actionLabel: 'Check Sanctioned Load'
  },
  {
    id: 'faq_12',
    category: 'Support & Feedback',
    question: 'How do I rate recommendations or submit customer feedback?',
    answer: 'You can vote Helpful / Not Helpful on any AI recommendation or assistant reply, apply recommendations directly to the Simulator, and submit a 1–5 star CSAT rating in the Impact & Feedback tab.',
    keywords: 'feedback, rating, csat, helpful, vote, review, support',
    actionTab: 'feedback',
    actionLabel: 'Open Impact & Feedback'
  }
];

function decodeXmlEntities(str) {
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colRefToIndex(colRef) {
  let idx = 0;
  for (let i = 0; i < colRef.length; i++) {
    idx = idx * 26 + (colRef.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function indexToColRef(idx) {
  let n = idx + 1;
  let ref = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    ref = String.fromCharCode(65 + rem) + ref;
    n = Math.floor((n - 1) / 26);
  }
  return ref;
}

/**
 * Minimal CRC32 implementation for writing valid ZIP/.xlsx archives.
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Extract ZIP entries from an .xlsx Buffer using Central Directory headers.
 */
function unzipEntries(buffer) {
  // Find End of Central Directory (0x06054b50)
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65558); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Invalid XLSX/ZIP file: EOCD signature not found.');
  }

  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();

  let ptr = cdOffset;
  const cdEnd = cdOffset + cdSize;
  while (ptr < cdEnd) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(ptr + 10);
    const compSize = buffer.readUInt32LE(ptr + 20);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localOffset = buffer.readUInt32LE(ptr + 42);
    const fileName = buffer.toString('utf8', ptr + 46, ptr + 46 + nameLen);

    // Read local header to locate exact payload start
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = buffer.subarray(dataStart, dataStart + compSize);

    let data;
    if (method === 0) {
      data = compressed;
    } else if (method === 8) {
      data = zlib.inflateRawSync(compressed);
    } else {
      throw new Error(`Unsupported ZIP compression method ${method} in ${fileName}`);
    }
    entries.set(fileName, data);
    ptr += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

/**
 * Create a valid ZIP Buffer from [{ name, data }] using DEFLATE compression.
 */
function createZipBuffer(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const rawBuf = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
    const compBuf = zlib.deflateRawSync(rawBuf);
    const crc = crc32(rawBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8); // DEFLATE
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compBuf.length, 18);
    localHeader.writeUInt32LE(rawBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compBuf.length, 20);
    centralHeader.writeUInt32LE(rawBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compBuf.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

/**
 * Parse an .xlsx binary Buffer into a 2D array of strings.
 */
export function parseXlsxBuffer(buffer) {
  const entries = unzipEntries(buffer);

  // Parse shared strings if present
  const sharedStrings = [];
  const ssXml = entries.get('xl/sharedStrings.xml')?.toString('utf8');
  if (ssXml) {
    const siMatches = ssXml.match(/<si\b[^>]*>[\s\S]*?<\/si>/g) || [];
    for (const si of siMatches) {
      const tMatches = si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || [];
      const combined = tMatches
        .map((t) => decodeXmlEntities(t.replace(/<t\b[^>]*>/, '').replace(/<\/t>$/, '')))
        .join('');
      sharedStrings.push(combined);
    }
  }

  // Locate first worksheet (sheet1.xml or any xl/worksheets/sheet*.xml)
  const sheetName = Array.from(entries.keys())
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
    .sort()[0];
  if (!sheetName) {
    throw new Error('No worksheet XML found inside XLSX file.');
  }

  const sheetXml = entries.get(sheetName).toString('utf8');
  const rows = [];
  const rowMatches = sheetXml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) || [];

  for (const rowXml of rowMatches) {
    const rowArr = [];
    const cellMatches = rowXml.match(/<c\b[^>]*>[\s\S]*?<\/c>|<c\b[^>]*\/>/g) || [];
    for (const cellXml of cellMatches) {
      const refMatch = cellXml.match(/\br="([A-Z]+)\d+"/i);
      const colIdx = refMatch ? colRefToIndex(refMatch[1].toUpperCase()) : rowArr.length;
      const typeMatch = cellXml.match(/\bt="([^"]+)"/);
      const cellType = typeMatch ? typeMatch[1] : '';

      let value = '';
      if (cellType === 'inlineStr') {
        const tMatches = cellXml.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || [];
        value = tMatches
          .map((t) => decodeXmlEntities(t.replace(/<t\b[^>]*>/, '').replace(/<\/t>$/, '')))
          .join('');
      } else {
        const vMatch = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        if (vMatch) {
          const rawVal = decodeXmlEntities(vMatch[1]);
          if (cellType === 's') {
            value = sharedStrings[Number(rawVal)] ?? '';
          } else {
            value = rawVal;
          }
        }
      }
      rowArr[colIdx] = value;
    }
    if (rowArr.some((cell) => String(cell || '').trim() !== '')) {
      rows.push(rowArr.map((c) => (c === undefined ? '' : String(c))));
    }
  }
  return rows;
}

/**
 * Parse RFC-4180 CSV text into a 2D array of strings.
 */
export function parseCsvTable(csvText) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const text = String(csvText || '').replace(/^\uFEFF/, '');

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

/**
 * Convert a 2D table of strings into normalized FAQ rows for the RAG agent.
 */
export function normalizeFaqRows(tableRows, sourceName = 'energy_rag_faq.xlsx') {
  if (!Array.isArray(tableRows) || tableRows.length < 2) {
    throw new Error('Excel sheet must contain a header row and at least one Q&A row.');
  }

  const headers = tableRows[0].map((h) => String(h || '').trim().toLowerCase());
  const findIdx = (candidates) =>
    headers.findIndex((h) => candidates.some((c) => h === c || h.includes(c)));

  const qIdx = findIdx(['question', 'query', 'prompt', 'faq', 'q']);
  const aIdx = findIdx(['answer', 'response', 'reply', 'detail', 'solution', 'a']);
  const cIdx = findIdx(['category', 'topic', 'section', 'group']);
  const kIdx = findIdx(['keyword', 'tag', 'intent']);
  const tabIdx = findIdx(['actiontab', 'action_tab', 'tab']);
  const lblIdx = findIdx(['actionlabel', 'action_label', 'button']);

  const resolvedQ = qIdx !== -1 ? qIdx : 0;
  const resolvedA = aIdx !== -1 ? aIdx : 1;

  const faqs = [];
  for (let r = 1; r < tableRows.length; r++) {
    const row = tableRows[r];
    const question = String(row[resolvedQ] || '').trim();
    const answer = String(row[resolvedA] || '').trim();
    if (!question || !answer) continue;

    faqs.push({
      id: `excel_row_${r + 1}`,
      rowNumber: r + 1,
      category: cIdx !== -1 && row[cIdx] ? String(row[cIdx]).trim() : 'General Energy FAQ',
      question,
      answer,
      keywords: kIdx !== -1 && row[kIdx] ? String(row[kIdx]).trim() : '',
      actionTab: tabIdx !== -1 && row[tabIdx] ? String(row[tabIdx]).trim() : '',
      actionLabel: lblIdx !== -1 && row[lblIdx] ? String(row[lblIdx]).trim() : '',
      sourceFile: sourceName
    });
  }

  if (faqs.length === 0) {
    throw new Error('No valid Question & Answer rows found. Expected columns like Question and Answer.');
  }
  return faqs;
}

/**
 * Parse an uploaded .xlsx (base64 or Buffer) or .csv file into FAQ rows.
 */
export function parseFaqUpload({ filename = 'faq.xlsx', contentBase64, contentText }) {
  const lower = filename.toLowerCase();
  let table;
  if (lower.endsWith('.xlsx') || contentBase64) {
    const buf = Buffer.isBuffer(contentBase64)
      ? contentBase64
      : Buffer.from(String(contentBase64 || '').replace(/^data:[^;]+;base64,/, ''), 'base64');
    table = parseXlsxBuffer(buf);
  } else {
    table = parseCsvTable(contentText || '');
  }
  return normalizeFaqRows(table, filename);
}

/**
 * Build a valid OOXML .xlsx Buffer from FAQ rows so users can download and edit in Excel.
 */
export function buildFaqXlsxBuffer(faqRows) {
  const headers = ['Category', 'Question', 'Answer', 'Keywords', 'ActionTab', 'ActionLabel'];
  const allRows = [
    headers,
    ...faqRows.map((r) => [
      r.category || 'General',
      r.question || '',
      r.answer || '',
      r.keywords || '',
      r.actionTab || '',
      r.actionLabel || ''
    ])
  ];

  const sharedStrings = [];
  const ssIndex = new Map();
  const internString = (val) => {
    const s = String(val ?? '');
    if (ssIndex.has(s)) return ssIndex.get(s);
    const id = sharedStrings.length;
    sharedStrings.push(s);
    ssIndex.set(s, id);
    return id;
  };

  const sheetRowsXml = allRows.map((row, rIdx) => {
    const rowNum = rIdx + 1;
    const cellsXml = row.map((val, cIdx) => {
      const ref = `${indexToColRef(cIdx)}${rowNum}`;
      const sid = internString(val);
      return `<c r="${ref}" t="s"><v>${sid}</v></c>`;
    }).join('');
    return `<row r="${rowNum}">${cellsXml}</row>`;
  }).join('');

  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">` +
    sharedStrings.map((s) => `<si><t xml:space="preserve">${escapeXml(s)}</t></si>`).join('') +
    `</sst>`;

  const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${sheetRowsXml}</sheetData>` +
    `</worksheet>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
    `</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Energy_FAQ_KB" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
    `</Relationships>`;

  return createZipBuffer([
    { name: '[Content_Types].xml', data: contentTypesXml },
    { name: '_rels/.rels', data: rootRelsXml },
    { name: 'xl/workbook.xml', data: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml },
    { name: 'xl/worksheets/sheet1.xml', data: worksheetXml },
    { name: 'xl/sharedStrings.xml', data: sharedStringsXml }
  ]);
}

/**
 * Ensure default Excel Q&A workbook exists on disk and return parsed FAQ rows.
 */
export function loadOrSeedExcelKnowledgeBase(dataDir, filename = 'energy_rag_faq.xlsx') {
  fs.mkdirSync(dataDir, { recursive: true });
  const filePath = path.join(dataDir, filename);
  if (!fs.existsSync(filePath)) {
    const seeded = DEFAULT_FAQ_ROWS.map((r, i) => ({ ...r, rowNumber: i + 2, sourceFile: filename }));
    fs.writeFileSync(filePath, buildFaqXlsxBuffer(seeded));
    return { filename, filePath, rows: seeded };
  }
  const buf = fs.readFileSync(filePath);
  const table = parseXlsxBuffer(buf);
  const rows = normalizeFaqRows(table, filename);
  return { filename, filePath, rows };
}

export function saveExcelKnowledgeBase(dataDir, faqRows, filename = 'energy_rag_faq.xlsx') {
  fs.mkdirSync(dataDir, { recursive: true });
  const filePath = path.join(dataDir, filename);
  const normalized = faqRows.map((r, i) => ({
    ...r,
    id: r.id || `excel_row_${i + 2}`,
    rowNumber: i + 2,
    sourceFile: filename
  }));
  fs.writeFileSync(filePath, buildFaqXlsxBuffer(normalized));
  return { filename, filePath, rows: normalized };
}

const STOP_WORDS = new Set([
  'the', 'is', 'are', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'and', 'or',
  'my', 'me', 'i', 'can', 'how', 'what', 'which', 'why', 'where', 'when', 'do', 'does', 'it', 'with', 'your'
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9₹\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Retrieve top-K matching Q&A rows from the Excel Knowledge Base using TF-IDF + keyword/phrase scoring.
 */
export function retrieveFromExcelKb(query, faqRows, topK = 3) {
  if (!Array.isArray(faqRows) || faqRows.length === 0) return [];
  const qLower = String(query || '').toLowerCase().trim();
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];

  // Build IDF across FAQ corpus
  const docTokensList = faqRows.map((row) => ({
    row,
    qTokens: tokenize(row.question),
    kTokens: tokenize(row.keywords),
    aTokens: tokenize(row.answer),
    cTokens: tokenize(row.category)
  }));

  const df = new Map();
  for (const doc of docTokensList) {
    const unique = new Set([...doc.qTokens, ...doc.kTokens, ...doc.aTokens, ...doc.cTokens]);
    for (const t of unique) {
      df.set(t, (df.get(t) || 0) + 1);
    }
  }
  const N = docTokensList.length;

  const scored = docTokensList.map((doc) => {
    let score = 0;
    const maxPossible = qTokens.reduce((acc, qt) => acc + (Math.log((N + 1) / ((df.get(qt) || 0) + 1)) + 1) * 3.0, 0) || 1;

    for (const qt of qTokens) {
      const idf = Math.log((N + 1) / ((df.get(qt) || 0) + 1)) + 1;
      const inQ = doc.qTokens.some((t) => t === qt || t.includes(qt) || qt.includes(t));
      const inK = doc.kTokens.some((t) => t === qt || t.includes(qt) || qt.includes(t));
      const inA = doc.aTokens.some((t) => t === qt || t.includes(qt) || qt.includes(t));
      const inC = doc.cTokens.some((t) => t === qt || t.includes(qt) || qt.includes(t));

      if (inQ) score += 2.6 * idf;
      if (inK) score += 2.2 * idf;
      if (inC) score += 1.4 * idf;
      if (inA) score += 0.9 * idf;
    }

    // Bonus for exact substring / multi-word phrase overlap
    const docQ = doc.row.question.toLowerCase();
    if (docQ === qLower) score += maxPossible * 0.8;
    else if (qLower.length >= 6 && (docQ.includes(qLower) || qLower.includes(docQ))) score += maxPossible * 0.4;

    const confidence = Math.min(99, Math.round((score / maxPossible) * 100));
    return {
      ...doc.row,
      score: Number(score.toFixed(2)),
      confidence
    };
  });

  return scored
    .filter((item) => item.score > 0.8 && item.confidence >= 18)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
