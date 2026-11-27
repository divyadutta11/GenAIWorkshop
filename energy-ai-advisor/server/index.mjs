import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TARIFF_PLANS,
  UTILITY_PROVIDERS,
  DEFAULT_CUSTOMER_PROFILES,
  generateDefaultIntervals,
  parseConsumptionUpload,
  analyzeConsumption,
  simulateScenario,
  generateAdvisorReply
} from './analytics.mjs';
import {
  loadOrSeedExcelKnowledgeBase,
  saveExcelKnowledgeBase,
  parseFaqUpload,
  buildFaqXlsxBuffer
} from './ragAgent.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const PORT = Number(process.env.PORT) || 3456;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.csv': 'text/csv; charset=utf-8'
};

function buildProfileIntervals(profile) {
  return generateDefaultIntervals(30, profile.seedOffset ?? 1, {
    loadScale: Number(profile.loadScale) || 1.0,
    hasEv: Boolean(profile.hasEv),
    hasSolar: Boolean(profile.hasSolar)
  });
}

function createInitialState() {
  const customerProfiles = DEFAULT_CUSTOMER_PROFILES.map((p) => ({ ...p }));
  const activeProfile = customerProfiles[0];
  const intervalsByProfile = {};
  for (const profile of customerProfiles) {
    intervalsByProfile[profile.id] = buildProfileIntervals(profile);
  }
  const intervals = intervalsByProfile[activeProfile.id];
  const provider = UTILITY_PROVIDERS.find((p) => p.id === activeProfile.providerId) || UTILITY_PROVIDERS[0];

  return {
    activeProfileId: activeProfile.id,
    customerProfiles,
    intervalsByProfile,
    datasetLabel: `${activeProfile.name} (${activeProfile.city}) · Meter ${activeProfile.meterId}`,
    tariffId: activeProfile.tariffId || 'tou_standard',
    intervals,
    utility: {
      connected: true,
      providerId: provider.id,
      providerName: provider.name,
      meterId: activeProfile.meterId,
      cadence: '15m',
      autoSyncEnabled: true,
      lastSyncAt: new Date().toISOString(),
      syncCount: 4,
      pipelineStages: [
        { step: 'Utility API Pull', status: 'healthy', detail: `${provider.protocol} active` },
        { step: 'Interval Normalization', status: 'healthy', detail: `${intervals.length} hourly intervals aligned` },
        { step: 'Tariff & Carbon Enrichment', status: 'healthy', detail: 'INR TOU & grid intensity joined' },
        { step: 'AI Advisory Refresh', status: 'healthy', detail: 'Recommendations & RAG index updated' }
      ],
      logs: [
        {
          id: 'log_init_1',
          timestamp: new Date(Date.now() - 900000).toISOString(),
          provider: provider.name,
          recordsIngested: 24,
          status: 'success',
          message: 'Automated 15m pipeline completed · 0 gaps'
        },
        {
          id: 'log_init_2',
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          provider: provider.name,
          recordsIngested: 24,
          status: 'success',
          message: 'Tariff rates (₹/kWh) & CO2e factors updated'
        }
      ]
    },
    simulatorControls: {
      thermostatShiftC: 1.5,
      offPeakShiftPct: 40,
      baseloadReductionPct: 20,
      ledApplianceUpgrade: true,
      solarKw: 0,
      batteryKwh: 0,
      tariffPlan: activeProfile.tariffId || 'tou_standard'
    },
    feedback: {
      recommendationVotes: {
        rec_peak_shift: 'helpful',
        rec_hvac_setpoint: 'helpful'
      },
      chatVotes: { helpful: 3, notHelpful: 0 },
      ratings: [
        { score: 5, comment: 'Clear breakdown of my 4-9 PM EV charging spike.', createdAt: new Date(Date.now() - 86400000).toISOString() },
        { score: 5, comment: 'Simulator made the TOU plan switch an easy decision.', createdAt: new Date(Date.now() - 43200000).toISOString() }
      ],
      adoptedRecommendationIds: ['rec_peak_shift']
    }
  };
}

function normalizeLoadedState(state) {
  let changed = false;
  if (!Array.isArray(state.customerProfiles) || state.customerProfiles.length === 0) {
    state.customerProfiles = DEFAULT_CUSTOMER_PROFILES.map((p) => ({ ...p }));
    changed = true;
  }
  if (!state.activeProfileId || !state.customerProfiles.some((p) => p.id === state.activeProfileId)) {
    state.activeProfileId = state.customerProfiles[0].id;
    changed = true;
  }
  if (!state.intervalsByProfile || typeof state.intervalsByProfile !== 'object') {
    state.intervalsByProfile = {};
    for (const profile of state.customerProfiles) {
      state.intervalsByProfile[profile.id] = profile.id === state.activeProfileId && Array.isArray(state.intervals) && state.intervals.length
        ? state.intervals
        : buildProfileIntervals(profile);
    }
    changed = true;
  }
  const activeProfile = getActiveProfile(state);
  if (!state.intervals || !state.intervals.length) {
    state.intervals = state.intervalsByProfile[activeProfile.id] || buildProfileIntervals(activeProfile);
    changed = true;
  }
  if (!TARIFF_PLANS[state.tariffId]) {
    state.tariffId = activeProfile.tariffId || 'tou_standard';
    changed = true;
  }
  if (!state.simulatorControls) {
    state.simulatorControls = {
      thermostatShiftC: 1.5,
      offPeakShiftPct: 40,
      baseloadReductionPct: 20,
      ledApplianceUpgrade: true,
      solarKw: 0,
      batteryKwh: 0,
      tariffPlan: state.tariffId
    };
    changed = true;
  }
  if (changed) saveState(state);
  return state;
}

function getActiveProfile(state = appState) {
  return state.customerProfiles.find((p) => p.id === state.activeProfileId) || state.customerProfiles[0];
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      return normalizeLoadedState(JSON.parse(raw));
    }
  } catch {
    // Re-seed if corrupted
  }
  const initial = createInitialState();
  saveState(initial);
  return initial;
}

function saveState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

let appState = loadState();
let ragKb = loadOrSeedExcelKnowledgeBase(DATA_DIR);

function activateProfile(profileId) {
  const profile = appState.customerProfiles.find((p) => p.id === profileId);
  if (!profile) {
    throw new Error('Customer profile not found.');
  }
  appState.activeProfileId = profile.id;
  if (!appState.intervalsByProfile[profile.id]?.length) {
    appState.intervalsByProfile[profile.id] = buildProfileIntervals(profile);
  }
  appState.intervals = appState.intervalsByProfile[profile.id];
  appState.tariffId = TARIFF_PLANS[profile.tariffId] ? profile.tariffId : 'tou_standard';
  appState.simulatorControls.tariffPlan = appState.tariffId;
  appState.datasetLabel = `${profile.name} (${profile.city}) · Meter ${profile.meterId}`;

  const provider = UTILITY_PROVIDERS.find((p) => p.id === profile.providerId) || UTILITY_PROVIDERS[0];
  appState.utility = {
    ...appState.utility,
    connected: true,
    providerId: provider.id,
    providerName: provider.name,
    meterId: profile.meterId,
    lastSyncAt: new Date().toISOString()
  };
  saveState(appState);
  return profile;
}

function sanitizeProfileForClient(profile) {
  if (!profile) return null;
  const { phone: _hiddenPhone, ...publicFields } = profile;
  return publicFields;
}

function buildDashboardPayload() {
  const activeProfile = getActiveProfile(appState);
  const analysis = analyzeConsumption(appState.intervals, appState.tariffId);
  const simulation = simulateScenario(analysis, appState.simulatorControls);

  const votes = Object.values(appState.feedback.recommendationVotes || {});
  const helpfulRecs = votes.filter((v) => v === 'helpful').length;
  const totalRecVotes = votes.length;
  const chatHelpful = appState.feedback.chatVotes?.helpful || 0;
  const chatTotal = chatHelpful + (appState.feedback.chatVotes?.notHelpful || 0);
  const combinedPos = helpfulRecs + chatHelpful;
  const combinedTotal = totalRecVotes + chatTotal;
  const positiveFeedbackPct = combinedTotal > 0 ? Math.round((combinedPos / combinedTotal) * 100) : 100;

  const ratings = appState.feedback.ratings || [];
  const avgCsat = ratings.length
    ? Number((ratings.reduce((s, r) => s + r.score, 0) / ratings.length).toFixed(1))
    : 5.0;

  return {
    datasetLabel: appState.datasetLabel,
    activeProfileId: activeProfile.id,
    activeProfile: sanitizeProfileForClient(activeProfile),
    customerProfiles: appState.customerProfiles.map(sanitizeProfileForClient),
    tariffPlans: Object.values(TARIFF_PLANS),
    utilityProviders: UTILITY_PROVIDERS,
    utility: appState.utility,
    analysis,
    simulation,
    ragKb: {
      filename: ragKb.filename,
      count: ragKb.rows.length,
      rows: ragKb.rows
    },
    feedback: {
      ...appState.feedback,
      positiveFeedbackPct,
      totalVotes: combinedTotal,
      avgCsat
    }
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 5 * 1024 * 1024) {
        reject(new Error('Payload exceeds 5 MB limit'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function serveStaticFile(res, reqPath) {
  const safePath = reqPath === '/' ? '/index.html' : reqPath.split('?')[0];
  const fullPath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

function buildSampleCsv() {
  const intervals = generateDefaultIntervals(14, 4);
  const header = 'timestamp,kwh,temp_c,source';
  const rows = intervals.map((i) => `${i.timestamp},${i.kwh},${i.tempC},smart_meter_export`);
  return [header, ...rows].join('\n');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true, service: 'wattwise-ai-advisor', currency: 'INR', timestamp: new Date().toISOString() });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/dashboard') {
      sendJson(res, 200, buildDashboardPayload());
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/profiles') {
      sendJson(res, 200, {
        activeProfileId: appState.activeProfileId,
        activeProfile: sanitizeProfileForClient(getActiveProfile(appState)),
        profiles: appState.customerProfiles.map(sanitizeProfileForClient)
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/profiles') {
      const body = await readJsonBody(req);
      const name = String(body.name || '').trim();
      if (!name) {
        sendJson(res, 400, { error: 'Customer name is required.' });
        return;
      }
      const sanctionedLoadKw = Math.max(1, Math.min(50, Number(body.sanctionedLoadKw) || 5));
      const newProfile = {
        id: `cust_${Date.now()}`,
        name,
        accountNumber: String(body.accountNumber || `CUST-IND-${Math.floor(4000 + Math.random() * 5000)}`).trim(),
        city: String(body.city || 'New Delhi').trim(),
        discom: String(body.discom || 'BSES / Urban DISCOM').trim(),
        segment: String(body.segment || 'Residential Home').trim(),
        sanctionedLoadKw,
        householdSize: Math.max(1, Math.min(20, Number(body.householdSize) || 3)),
        hasEv: Boolean(body.hasEv),
        hasSolar: Boolean(body.hasSolar),
        meterId: String(body.meterId || `SM-${Math.floor(1000 + Math.random() * 8999)}`).trim(),
        providerId: UTILITY_PROVIDERS.some((p) => p.id === body.providerId) ? body.providerId : UTILITY_PROVIDERS[0].id,
        tariffId: TARIFF_PLANS[body.tariffId] ? body.tariffId : 'tou_standard',
        email: String(body.email || '').trim(),
        phone: String(body.phone || '').trim(),
        seedOffset: (appState.customerProfiles.length % 11) + 2,
        loadScale: Number(Math.max(0.55, Math.min(2.2, sanctionedLoadKw / 5.5)).toFixed(2)),
        createdAt: new Date().toISOString()
      };

      appState.customerProfiles.push(newProfile);
      appState.intervalsByProfile[newProfile.id] = buildProfileIntervals(newProfile);

      if (body.activate !== false) {
        activateProfile(newProfile.id);
      } else {
        saveState(appState);
      }
      sendJson(res, 200, buildDashboardPayload());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/profiles/select') {
      const body = await readJsonBody(req);
      activateProfile(body.profileId);
      sendJson(res, 200, buildDashboardPayload());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/profiles/update') {
      const body = await readJsonBody(req);
      const targetId = body.id || appState.activeProfileId;
      const idx = appState.customerProfiles.findIndex((p) => p.id === targetId);
      if (idx === -1) {
        sendJson(res, 404, { error: 'Customer profile not found.' });
        return;
      }
      const prev = appState.customerProfiles[idx];
      const updated = {
        ...prev,
        name: body.name !== undefined ? String(body.name).trim() || prev.name : prev.name,
        accountNumber: body.accountNumber !== undefined ? String(body.accountNumber).trim() || prev.accountNumber : prev.accountNumber,
        city: body.city !== undefined ? String(body.city).trim() || prev.city : prev.city,
        discom: body.discom !== undefined ? String(body.discom).trim() || prev.discom : prev.discom,
        segment: body.segment !== undefined ? String(body.segment).trim() || prev.segment : prev.segment,
        sanctionedLoadKw: body.sanctionedLoadKw !== undefined ? Math.max(1, Number(body.sanctionedLoadKw) || prev.sanctionedLoadKw) : prev.sanctionedLoadKw,
        householdSize: body.householdSize !== undefined ? Math.max(1, Number(body.householdSize) || prev.householdSize) : prev.householdSize,
        hasEv: body.hasEv !== undefined ? Boolean(body.hasEv) : prev.hasEv,
        hasSolar: body.hasSolar !== undefined ? Boolean(body.hasSolar) : prev.hasSolar,
        meterId: body.meterId !== undefined ? String(body.meterId).trim() || prev.meterId : prev.meterId,
        providerId: body.providerId && UTILITY_PROVIDERS.some((p) => p.id === body.providerId) ? body.providerId : prev.providerId,
        tariffId: body.tariffId && TARIFF_PLANS[body.tariffId] ? body.tariffId : prev.tariffId,
        email: body.email !== undefined ? String(body.email).trim() : prev.email,
        phone: body.phone !== undefined ? String(body.phone).trim() : prev.phone,
        updatedAt: new Date().toISOString()
      };
      appState.customerProfiles[idx] = updated;
      if (updated.id === appState.activeProfileId) {
        activateProfile(updated.id);
      } else {
        saveState(appState);
      }
      sendJson(res, 200, buildDashboardPayload());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/tariff/select') {
      const body = await readJsonBody(req);
      if (!TARIFF_PLANS[body.tariffId]) {
        sendJson(res, 400, { error: 'Unknown tariff plan.' });
        return;
      }
      const active = getActiveProfile(appState);
      active.tariffId = body.tariffId;
      appState.tariffId = body.tariffId;
      appState.simulatorControls.tariffPlan = body.tariffId;
      saveState(appState);
      sendJson(res, 200, buildDashboardPayload());
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/sample-csv') {
      const csv = buildSampleCsv();
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="smart-meter-sample-14d.csv"'
      });
      res.end(csv);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/upload') {
      const body = await readJsonBody(req);
      const parsed = parseConsumptionUpload(body.filename || 'upload.csv', body.content || '');
      const active = getActiveProfile(appState);
      appState.intervals = parsed;
      appState.intervalsByProfile[active.id] = parsed;
      appState.datasetLabel = `${active.name} · Uploaded: ${body.filename || 'custom-data.csv'} (${parsed.length} intervals)`;
      appState.utility.logs.unshift({
        id: `log_${Date.now()}`,
        timestamp: new Date().toISOString(),
        provider: 'Manual File Upload',
        recordsIngested: parsed.length,
        status: 'success',
        message: `Parsed ${body.filename || 'dataset'} for ${active.name} & refreshed AI recommendations`
      });
      appState.utility.logs = appState.utility.logs.slice(0, 10);
      saveState(appState);
      sendJson(res, 200, buildDashboardPayload());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/utilities/connect') {
      const body = await readJsonBody(req);
      const active = getActiveProfile(appState);
      const provider = UTILITY_PROVIDERS.find((p) => p.id === body.providerId) || UTILITY_PROVIDERS[0];
      const seed = UTILITY_PROVIDERS.findIndex((p) => p.id === provider.id) + (active.seedOffset || 2);
      const freshIntervals = generateDefaultIntervals(30, seed, {
        loadScale: active.loadScale || 1.0,
        hasEv: active.hasEv,
        hasSolar: active.hasSolar
      });

      const meterId = body.meterId || active.meterId || 'SM-9482-EV';
      active.providerId = provider.id;
      active.meterId = meterId;

      appState.intervals = freshIntervals;
      appState.intervalsByProfile[active.id] = freshIntervals;
      appState.datasetLabel = `${active.name} · ${provider.name} · Meter ${meterId}`;
      appState.utility = {
        ...appState.utility,
        connected: true,
        providerId: provider.id,
        providerName: provider.name,
        meterId,
        cadence: body.cadence || '15m',
        autoSyncEnabled: body.autoSyncEnabled !== false,
        lastSyncAt: new Date().toISOString(),
        syncCount: (appState.utility.syncCount || 0) + 1,
        pipelineStages: [
          { step: 'Utility API Pull', status: 'healthy', detail: `${provider.protocol} connected` },
          { step: 'Interval Normalization', status: 'healthy', detail: `${freshIntervals.length} intervals aligned` },
          { step: 'Tariff & Carbon Enrichment', status: 'healthy', detail: `${provider.intervalGranularity} mapped (₹)` },
          { step: 'AI Advisory Refresh', status: 'healthy', detail: 'Recommendations & RAG baseline updated' }
        ],
        logs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString(),
            provider: provider.name,
            recordsIngested: freshIntervals.length,
            status: 'success',
            message: `Connected & synced ${active.name} via ${provider.protocol} (${body.cadence || '15m'} cadence)`
          },
          ...(appState.utility.logs || [])
        ].slice(0, 10)
      };
      saveState(appState);
      sendJson(res, 200, buildDashboardPayload());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/utilities/sync') {
      const body = await readJsonBody(req);
      const active = getActiveProfile(appState);
      if (body.cadence) appState.utility.cadence = body.cadence;
      if (typeof body.autoSyncEnabled === 'boolean') appState.utility.autoSyncEnabled = body.autoSyncEnabled;

      const bump = (appState.utility.syncCount || 1) + 1;
      const freshIntervals = generateDefaultIntervals(30, (bump % 7) + (active.seedOffset || 0), {
        loadScale: active.loadScale || 1.0,
        hasEv: active.hasEv,
        hasSolar: active.hasSolar
      });
      appState.intervals = freshIntervals;
      appState.intervalsByProfile[active.id] = freshIntervals;
      appState.utility.lastSyncAt = new Date().toISOString();
      appState.utility.syncCount = bump;
      appState.utility.logs = [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString(),
          provider: appState.utility.providerName,
          recordsIngested: 24,
          status: 'success',
          message: `Automated flow synced latest 24h AMI intervals for ${active.name} (${appState.utility.cadence})`
        },
        ...(appState.utility.logs || [])
      ].slice(0, 10);
      saveState(appState);
      sendJson(res, 200, buildDashboardPayload());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/simulate') {
      const body = await readJsonBody(req);
      appState.simulatorControls = {
        ...appState.simulatorControls,
        ...body
      };
      if (body.tariffPlan && TARIFF_PLANS[body.tariffPlan]) {
        appState.tariffId = body.tariffPlan;
        const active = getActiveProfile(appState);
        active.tariffId = body.tariffPlan;
      }
      saveState(appState);
      const analysis = analyzeConsumption(appState.intervals, appState.tariffId);
      const simulation = simulateScenario(analysis, appState.simulatorControls);
      sendJson(res, 200, { analysis, simulation });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/rag/kb') {
      sendJson(res, 200, {
        filename: ragKb.filename,
        count: ragKb.rows.length,
        rows: ragKb.rows
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/rag/kb/download') {
      const xlsxBuf = buildFaqXlsxBuffer(ragKb.rows);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${ragKb.filename}"`
      });
      res.end(xlsxBuf);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/rag/kb/upload') {
      const body = await readJsonBody(req);
      const parsedRows = parseFaqUpload({
        filename: body.filename || 'faq_upload.xlsx',
        contentBase64: body.contentBase64,
        contentText: body.contentText
      });
      ragKb = saveExcelKnowledgeBase(DATA_DIR, parsedRows, 'energy_rag_faq.xlsx');
      sendJson(res, 200, buildDashboardPayload());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/rag/kb/add') {
      const body = await readJsonBody(req);
      const question = String(body.question || '').trim();
      const answer = String(body.answer || '').trim();
      if (!question || !answer) {
        sendJson(res, 400, { error: 'Both Question and Answer are required.' });
        return;
      }
      const nextRows = [
        ...ragKb.rows,
        {
          id: `faq_${Date.now()}`,
          category: String(body.category || 'Custom FAQ').trim(),
          question,
          answer,
          keywords: String(body.keywords || '').trim(),
          actionTab: String(body.actionTab || '').trim(),
          actionLabel: String(body.actionLabel || '').trim()
        }
      ];
      ragKb = saveExcelKnowledgeBase(DATA_DIR, nextRows, 'energy_rag_faq.xlsx');
      sendJson(res, 200, buildDashboardPayload());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/rag/kb/delete') {
      const body = await readJsonBody(req);
      if (ragKb.rows.length <= 1) {
        sendJson(res, 400, { error: 'Knowledge base must retain at least one Q&A entry.' });
        return;
      }
      const filtered = ragKb.rows.filter((r) => r.id !== body.id);
      ragKb = saveExcelKnowledgeBase(DATA_DIR, filtered, 'energy_rag_faq.xlsx');
      sendJson(res, 200, buildDashboardPayload());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const body = await readJsonBody(req);
      const message = String(body.message || '').trim();
      if (!message) {
        sendJson(res, 400, { error: 'Message is required.' });
        return;
      }
      const activeProfile = getActiveProfile(appState);
      const analysis = analyzeConsumption(appState.intervals, appState.tariffId);
      const simulation = simulateScenario(analysis, appState.simulatorControls);
      const result = await generateAdvisorReply({
        message,
        analysis,
        simulation,
        utilityState: appState.utility,
        activeProfile,
        faqRows: ragKb.rows,
        apiKey: body.geminiApiKey
      });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/feedback') {
      const body = await readJsonBody(req);
      if (body.type === 'recommendation' && body.id) {
        appState.feedback.recommendationVotes[body.id] = body.vote;
        if (body.adopted === true && !appState.feedback.adoptedRecommendationIds.includes(body.id)) {
          appState.feedback.adoptedRecommendationIds.push(body.id);
        }
      } else if (body.type === 'chat') {
        if (body.vote === 'helpful') appState.feedback.chatVotes.helpful += 1;
        if (body.vote === 'not_helpful') appState.feedback.chatVotes.notHelpful += 1;
      } else if (body.type === 'rating' && Number.isFinite(Number(body.score))) {
        appState.feedback.ratings.unshift({
          score: Math.min(5, Math.max(1, Number(body.score))),
          comment: String(body.comment || '').slice(0, 280),
          createdAt: new Date().toISOString()
        });
        appState.feedback.ratings = appState.feedback.ratings.slice(0, 20);
      }
      saveState(appState);
      sendJson(res, 200, buildDashboardPayload());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/reset') {
      appState = createInitialState();
      saveState(appState);
      sendJson(res, 200, buildDashboardPayload());
      return;
    }

    if (req.method === 'GET') {
      serveStaticFile(res, url.pathname);
      return;
    }

    sendJson(res, 404, { error: 'Route not found' });
  } catch (err) {
    sendJson(res, 400, { error: err.message || 'Request failed' });
  }
});

server.listen(PORT, () => {
  console.log(`WattWise AI Energy Advisor running at http://localhost:${PORT}`);
});
