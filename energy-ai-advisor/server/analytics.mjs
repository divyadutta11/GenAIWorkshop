import { retrieveFromExcelKb } from './ragAgent.mjs';

/**
 * Analytical, forecasting, and AI advisory engine for WattWise AI.
 * Processes smart-meter interval data, detects load patterns, generates
 * personalized energy-saving recommendations, simulates usage scenarios,
 * manages customer & tariff metadata, and powers RAG-grounded assistant responses.
 */

export const CURRENCY_SYMBOL = '₹';

export const TARIFF_PLANS = {
  tou_standard: {
    id: 'tou_standard',
    name: 'Domestic Time-of-Use Standard',
    discom: 'Urban Smart Grid / DISCOM TOU',
    offPeakRate: 5.5,
    midPeakRate: 7.8,
    onPeakRate: 11.2,
    fixedMonthlyFee: 250,
    onPeakHours: [16, 17, 18, 19, 20],
    midPeakHours: [7, 8, 9, 10, 11, 12, 13, 14, 15, 21],
    bestFor: 'Urban homes with smart appliances & flexible evening schedules',
    description: 'Discounted overnight energy (10 PM–7 AM at ₹5.50/kWh) with higher 4–9 PM peak pricing (₹11.20/kWh).'
  },
  tou_ev_saver: {
    id: 'tou_ev_saver',
    name: 'EV & Overnight Saver (TOU)',
    discom: 'BESCOM / Tata Power EV Special',
    offPeakRate: 4.2,
    midPeakRate: 8.2,
    onPeakRate: 12.6,
    fixedMonthlyFee: 320,
    onPeakHours: [16, 17, 18, 19, 20],
    midPeakHours: [7, 8, 9, 10, 11, 12, 13, 14, 15, 21],
    bestFor: 'EV chargers, battery storage, and overnight load shifting',
    description: 'Deep ₹4.20/kWh overnight charging rate paired with ₹12.60/kWh peak pricing during 4–9 PM.'
  },
  flat_rate: {
    id: 'flat_rate',
    name: 'Flat Tiered Domestic',
    discom: 'Standard State Domestic Supply',
    offPeakRate: 7.6,
    midPeakRate: 7.6,
    onPeakRate: 7.6,
    fixedMonthlyFee: 200,
    onPeakHours: [],
    midPeakHours: [],
    bestFor: 'Consistent daytime/evening households without load shifting',
    description: 'Flat ₹7.60/kWh energy charge across all 24 hours with a lower ₹200/mo fixed charge.'
  }
};

export const UTILITY_PROVIDERS = [
  {
    id: 'tata_smartgrid',
    name: 'Tata Power Smart Meter Hub',
    region: 'India Metro Grid',
    protocol: 'MQTT Bridge + REST API',
    intervalGranularity: '15-min AMI Telemetry',
    avgLatencyMs: 350
  },
  {
    id: 'green_button',
    name: 'Green Button Connect (ESPI)',
    region: 'Multi-Utility Standard',
    protocol: 'OAuth 2.0 + ESPI XML/JSON',
    intervalGranularity: '15-min / 1-hr',
    avgLatencyMs: 320
  },
  {
    id: 'octopus_agile',
    name: 'Octopus Energy Smart API',
    region: 'Global Dynamic Tariff',
    protocol: 'REST + GraphQL Webhook',
    intervalGranularity: '30-min Dynamic Tariff',
    avgLatencyMs: 280
  },
  {
    id: 'pge_smartmeter',
    name: 'BESCOM / DISCOM AMI Feed',
    region: 'State Smart Grid',
    protocol: 'OAuth 2.0 + REST Polling',
    intervalGranularity: '1-hr Interval + TOU',
    avgLatencyMs: 410
  }
];

export const DEFAULT_CUSTOMER_PROFILES = [
  {
    id: 'cust_arjun',
    name: 'Arjun Mehta',
    accountNumber: 'CUST-IND-1042',
    city: 'Bengaluru',
    discom: 'BESCOM Smart Grid',
    segment: 'Residential Villa · EV Home',
    sanctionedLoadKw: 6,
    householdSize: 4,
    hasEv: true,
    hasSolar: false,
    meterId: 'SM-9482-EV',
    providerId: 'tata_smartgrid',
    tariffId: 'tou_standard',
    email: 'arjun.mehta@example.in',
    phone: '+91 98450 11240',
    seedOffset: 1,
    loadScale: 1.0,
    createdAt: '2026-10-01T09:00:00.000Z'
  },
  {
    id: 'cust_priya',
    name: 'Priya Sharma',
    accountNumber: 'CUST-IND-2089',
    city: 'Mumbai',
    discom: 'Tata Power Mumbai',
    segment: 'Smart Apartment',
    sanctionedLoadKw: 4,
    householdSize: 3,
    hasEv: false,
    hasSolar: false,
    meterId: 'SM-MUM-4410',
    providerId: 'tata_smartgrid',
    tariffId: 'flat_rate',
    email: 'priya.sharma@example.in',
    phone: '+91 98201 55390',
    seedOffset: 3,
    loadScale: 0.72,
    createdAt: '2026-10-08T11:30:00.000Z'
  },
  {
    id: 'cust_rohan',
    name: 'Rohan Kulkarni',
    accountNumber: 'CUST-IND-3115',
    city: 'Pune',
    discom: 'MSEDCL Smart AMI',
    segment: 'Solar Duplex + Home Office',
    sanctionedLoadKw: 8,
    householdSize: 5,
    hasEv: true,
    hasSolar: true,
    meterId: 'SM-PUN-7721',
    providerId: 'octopus_agile',
    tariffId: 'tou_ev_saver',
    email: 'rohan.kulkarni@example.in',
    phone: '+91 97654 88102',
    seedOffset: 5,
    loadScale: 1.18,
    createdAt: '2026-10-15T14:15:00.000Z'
  }
];

const CARBON_INTENSITY_BY_HOUR = [
  0.34, 0.33, 0.32, 0.31, 0.32, 0.35,
  0.40, 0.43, 0.41, 0.37, 0.33, 0.30,
  0.29, 0.30, 0.32, 0.36, 0.45, 0.52,
  0.54, 0.51, 0.47, 0.43, 0.39, 0.36
];

const SOLAR_PROFILE_BY_HOUR = [
  0, 0, 0, 0, 0, 0.02,
  0.08, 0.22, 0.42, 0.64, 0.82, 0.94,
  1.0, 0.96, 0.86, 0.68, 0.45, 0.22,
  0.06, 0, 0, 0, 0, 0
];

const KNOWLEDGE_BASE = [
  {
    id: 'kb_tou_windows',
    title: 'Time-of-Use (TOU) Tariff Windows',
    tags: ['tariff', 'tou', 'peak', 'off-peak', 'rate', 'slab', 'cost', 'rupee', 'bill', 'plan'],
    content: 'TOU plans split 24 hours into Off-Peak (10 PM–7 AM), Mid-Peak (7 AM–4 PM & 9–10 PM), and On-Peak (4 PM–9 PM). Shifting flexible appliances like EV chargers, geysers, washing machines, and dishwashers out of 4–9 PM cuts energy charges significantly without reducing total kWh.'
  },
  {
    id: 'kb_hvac_cooling',
    title: 'AC & Climate Optimization Guide',
    tags: ['ac', 'hvac', 'cooling', 'thermostat', 'temperature', 'afternoon', 'summer', 'bill'],
    content: 'Air conditioning typically accounts for 30–45% of Indian urban residential electricity bills. Raising the setpoint from 22°C to 24–25°C (a 2°C shift) reduces compressor energy draw by 12–18%, and pre-cooling before 4 PM avoids expensive peak-hour tariff multipliers.'
  },
  {
    id: 'kb_baseload',
    title: 'Overnight Baseload & Standby Draw',
    tags: ['baseload', 'standby', 'night', 'overnight', 'vampire', 'fridge', 'router', 'idle'],
    content: 'Continuous baseload includes refrigerators, Wi-Fi routers, set-top boxes, inverter standby losses, and chargers. Smart power strips and scheduled smart plugs on entertainment and home-office racks typically cut 20–35% of overnight vampire load.'
  },
  {
    id: 'kb_ev_charging',
    title: 'EV Home Charging & Saver Tariff',
    tags: ['ev', 'car', 'vehicle', 'charging', 'charger', 'overnight', 'saver'],
    content: 'A typical home EV charger adds 3–7 kW of evening demand if plugged in right after work (6–8 PM). Scheduling charging after 11 PM on the EV & Overnight Saver plan (₹4.20/kWh vs ₹12.60/kWh peak) cuts EV charging costs by up to 66%.'
  },
  {
    id: 'kb_solar_battery',
    title: 'Rooftop Solar PV & Home Battery Sizing',
    tags: ['solar', 'pv', 'rooftop', 'battery', 'storage', 'net', 'metering', 'payback', 'export'],
    content: 'A 1 kW rooftop solar system in India generates ~120–130 kWh/month on average. Pairing 3.5–5 kW solar with a 5 kWh battery shaves evening peak imports between 5–9 PM and typically achieves a 4–6 year payback under net-metering.'
  },
  {
    id: 'kb_utility_pipeline',
    title: 'Smart Meter API & Automated Data Flow',
    tags: ['api', 'utility', 'sync', 'pipeline', 'meter', 'upload', 'csv', 'json', 'data'],
    content: 'WattWise AI ingests 15-min or hourly smart-meter telemetry via CSV/JSON upload or automated Utility API feeds (Tata Power Smart Meter Hub, BESCOM AMI, Green Button ESPI, Octopus Energy), normalizes timestamps, enriches TOU & carbon factors, and refreshes recommendations.'
  }
];

/**
 * Deterministically generate realistic hourly smart-meter intervals tailored to profile options.
 */
export function generateDefaultIntervals(days = 30, seedOffset = 0, options = {}) {
  const { loadScale = 1.0, hasEv = true, hasSolar = false } = options;
  const intervals = [];
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const start = new Date(now.getTime() - days * 24 * 3600 * 1000);

  for (let d = 0; d < days; d++) {
    const dayDate = new Date(start.getTime() + d * 24 * 3600 * 1000);
    const dayOfWeek = dayDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const weatherWave = Math.sin((d + seedOffset) * 0.45) * 0.22 + 0.15;

    for (let h = 0; h < 24; h++) {
      const ts = new Date(dayDate.getTime() + h * 3600 * 1000);
      const jitter = Math.sin((d * 24 + h + seedOffset) * 1.73) * 0.08;

      const baseload = (0.42 + Math.max(0, jitter * 0.25)) * loadScale;
      const morning = h >= 6 && h <= 9
        ? (isWeekend ? 0.55 : 0.78) * Math.exp(-Math.pow(h - 7.5, 2) / 2.2) * loadScale
        : 0;
      const afternoonHvac = (h >= 13 && h <= 20
        ? (0.92 + weatherWave) * Math.exp(-Math.pow(h - 17, 2) / 8.5)
        : (h >= 10 && h < 13 ? 0.28 + weatherWave * 0.4 : 0.12)) * loadScale;
      const eveningPeak = h >= 18 && h <= 22
        ? 0.85 * Math.exp(-Math.pow(h - 19.5, 2) / 3.2) * loadScale
        : 0;
      const evCharge = hasEv && !isWeekend && (h === 18 || h === 19) && (d % 2 === 0) ? 1.65 : 0;
      const weekendLaundry = isWeekend && (h === 11 || h === 12) ? 0.72 * loadScale : 0;
      const daytimeSolarCredit = hasSolar ? 1.15 * SOLAR_PROFILE_BY_HOUR[h] : 0;

      const rawTotal = baseload + morning + afternoonHvac + eveningPeak + evCharge + weekendLaundry + jitter - daytimeSolarCredit;
      const totalKwh = Math.max(0.18, Number(rawTotal.toFixed(3)));
      const tempC = Number((25 + 6 * Math.sin(((h - 9) / 24) * Math.PI * 2) + weatherWave * 4).toFixed(1));

      intervals.push({
        timestamp: ts.toISOString(),
        kwh: totalKwh,
        tempC,
        source: 'smart_meter'
      });
    }
  }
  return intervals;
}

/**
 * Parse uploaded CSV or JSON text into normalized interval records.
 */
export function parseConsumptionUpload(filename, content) {
  const trimmed = (content || '').trim();
  if (!trimmed) {
    throw new Error('Uploaded file is empty.');
  }

  const lowerName = (filename || '').toLowerCase();
  if (lowerName.endsWith('.json') || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    const rows = Array.isArray(parsed) ? parsed : (parsed.intervals || parsed.data || parsed.readings || []);
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('JSON must contain an array of readings with timestamp and kwh fields.');
    }
    const normalized = rows.map((row, idx) => normalizeRow(row, idx)).filter(Boolean);
    if (normalized.length === 0) {
      throw new Error('No valid consumption records found in JSON.');
    }
    return normalized;
  }

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV must include a header row and at least one data row.');
  }
  const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const headers = lines[0].split(delimiter).map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map((c) => c.trim().replace(/['"]/g, ''));
    if (cols.length < 2) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx];
    });
    const rec = normalizeRow(obj, i - 1);
    if (rec) records.push(rec);
  }

  if (records.length === 0) {
    throw new Error('Could not parse valid rows. Expected columns like timestamp/date and kwh/usage.');
  }
  return records;
}

function normalizeRow(row, index) {
  const keys = Object.keys(row);
  const findVal = (candidates) => {
    for (const c of candidates) {
      const match = keys.find((k) => k === c || k.includes(c));
      if (match !== undefined && row[match] !== undefined && row[match] !== '') {
        return row[match];
      }
    }
    return undefined;
  };

  const rawKwh = findVal(['kwh', 'usage', 'consumption', 'energy', 'value', 'load']);
  const kwh = Number.parseFloat(rawKwh);
  if (!Number.isFinite(kwh) || kwh < 0) return null;

  const rawTs = findVal(['timestamp', 'datetime', 'date', 'time', 'period', 'start']);
  let dateObj = rawTs ? new Date(rawTs) : new Date(Date.now() - (720 - index) * 3600 * 1000);
  if (Number.isNaN(dateObj.getTime())) {
    dateObj = new Date(Date.now() - (720 - index) * 3600 * 1000);
  }

  const rawTemp = findVal(['temp', 'temperature']);
  const tempC = Number.isFinite(Number.parseFloat(rawTemp)) ? Number.parseFloat(rawTemp) : 26.0;

  return {
    timestamp: dateObj.toISOString(),
    kwh: Number(kwh.toFixed(3)),
    tempC,
    source: 'uploaded_file'
  };
}

export function getRateForHour(hour, tariffId = 'tou_standard') {
  const plan = TARIFF_PLANS[tariffId] || TARIFF_PLANS.tou_standard;
  if (plan.onPeakHours.includes(hour)) return { rate: plan.onPeakRate, period: 'onPeak' };
  if (plan.midPeakHours.includes(hour)) return { rate: plan.midPeakRate, period: 'midPeak' };
  return { rate: plan.offPeakRate, period: 'offPeak' };
}

export function formatInr(value, decimals = 0) {
  const num = Number(value) || 0;
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;
}

/**
 * Estimate monthly bill across every tariff plan for tariff comparison dashboards.
 */
export function compareTariffPlans(hourlyProfile) {
  return Object.values(TARIFF_PLANS).map((plan) => {
    let dailyCost = 0;
    for (const h of hourlyProfile) {
      const rate = plan.onPeakHours.includes(h.hour)
        ? plan.onPeakRate
        : plan.midPeakHours.includes(h.hour)
          ? plan.midPeakRate
          : plan.offPeakRate;
      dailyCost += h.avgKwh * rate;
    }
    const estimatedMonthlyBill = Math.round(dailyCost * 30 + plan.fixedMonthlyFee);
    return {
      ...plan,
      estimatedMonthlyBill
    };
  });
}

/**
 * Compute full consumption analytics, patterns, disaggregation, and AI recommendations (in INR ₹).
 */
export function analyzeConsumption(intervals, tariffId = 'tou_standard') {
  const plan = TARIFF_PLANS[tariffId] || TARIFF_PLANS.tou_standard;
  const sorted = [...intervals].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const hourlySums = new Array(24).fill(0);
  const hourlyCounts = new Array(24).fill(0);
  const dailyMap = new Map();
  const touTotals = { offPeak: 0, midPeak: 0, onPeak: 0 };
  const touCosts = { offPeak: 0, midPeak: 0, onPeak: 0 };

  let totalKwh = 0;
  let totalVariableCost = 0;
  let totalCarbonKg = 0;
  let peakKw = 0;
  let peakTimestamp = sorted[0]?.timestamp || null;
  let weekdaySum = 0;
  let weekdayCount = 0;
  let weekendSum = 0;
  let weekendCount = 0;

  for (const item of sorted) {
    const dt = new Date(item.timestamp);
    const hour = dt.getHours();
    const dayKey = item.timestamp.slice(0, 10);
    const dayOfWeek = dt.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const kwh = item.kwh;
    const { rate, period } = getRateForHour(hour, tariffId);
    const cost = kwh * rate;
    const carbon = kwh * CARBON_INTENSITY_BY_HOUR[hour];

    totalKwh += kwh;
    totalVariableCost += cost;
    totalCarbonKg += carbon;

    touTotals[period] += kwh;
    touCosts[period] += cost;

    hourlySums[hour] += kwh;
    hourlyCounts[hour] += 1;

    if (kwh > peakKw) {
      peakKw = kwh;
      peakTimestamp = item.timestamp;
    }

    if (isWeekend) {
      weekendSum += kwh;
      weekendCount += 1;
    } else {
      weekdaySum += kwh;
      weekdayCount += 1;
    }

    if (!dailyMap.has(dayKey)) {
      dailyMap.set(dayKey, { date: dayKey, kwh: 0, cost: 0, carbonKg: 0, peakKw: 0, count: 0 });
    }
    const dEntry = dailyMap.get(dayKey);
    dEntry.kwh += kwh;
    dEntry.cost += cost;
    dEntry.carbonKg += carbon;
    dEntry.peakKw = Math.max(dEntry.peakKw, kwh);
    dEntry.count += 1;
  }

  const hourlyProfile = hourlySums.map((sum, hour) => {
    const avgKwh = hourlyCounts[hour] ? sum / hourlyCounts[hour] : 0;
    const { rate, period } = getRateForHour(hour, tariffId);
    return {
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      avgKwh: Number(avgKwh.toFixed(3)),
      rate,
      period
    };
  });

  const sortedHourlyAvgs = [...hourlyProfile].map((h) => h.avgKwh).sort((a, b) => a - b);
  const baseloadKw = sortedHourlyAvgs.length
    ? Number(((sortedHourlyAvgs[0] + (sortedHourlyAvgs[1] ?? sortedHourlyAvgs[0])) / 2).toFixed(3))
    : 0.4;

  const dailySeries = Array.from(dailyMap.values()).map((d) => ({
    date: d.date,
    kwh: Number(d.kwh.toFixed(2)),
    cost: Number(d.cost.toFixed(2)),
    carbonKg: Number(d.carbonKg.toFixed(2)),
    peakKw: Number(d.peakKw.toFixed(2))
  }));

  const meanDailyKwh = dailySeries.length ? totalKwh / dailySeries.length : 0;
  const anomalyDays = dailySeries
    .filter((d) => d.kwh > meanDailyKwh * 1.24)
    .map((d) => ({
      date: d.date,
      kwh: d.kwh,
      pctAboveMean: Math.round(((d.kwh - meanDailyKwh) / Math.max(0.01, meanDailyKwh)) * 100)
    }));

  const numDays = Math.max(1, dailySeries.length);
  const scaleToMonth = 30 / numDays;
  const monthlyKwh = Number((totalKwh * scaleToMonth).toFixed(1));
  const monthlyCost = Number((totalVariableCost * scaleToMonth + plan.fixedMonthlyFee).toFixed(0));
  const monthlyCarbonKg = Number((totalCarbonKg * scaleToMonth).toFixed(1));

  // Disaggregate end-uses from load curve shape
  const baseloadShare = Math.min(0.38, (baseloadKw * 24 * numDays) / Math.max(1, totalKwh));
  const eveningPeakRatio = (hourlyProfile.slice(17, 22).reduce((s, h) => s + h.avgKwh, 0) / 5) /
    Math.max(0.1, hourlyProfile.reduce((s, h) => s + h.avgKwh, 0) / 24);
  const afternoonRatio = (hourlyProfile.slice(13, 18).reduce((s, h) => s + h.avgKwh, 0) / 5) /
    Math.max(0.1, hourlyProfile.reduce((s, h) => s + h.avgKwh, 0) / 24);

  const rawEndUses = [
    { id: 'hvac', name: 'HVAC & Air Conditioning', pct: Math.min(44, Math.max(24, Math.round(28 * afternoonRatio))) },
    { id: 'ev', name: 'EV & High-Draw Loads', pct: Math.min(26, Math.max(8, Math.round(12 * eveningPeakRatio))) },
    { id: 'baseload', name: 'Always-On & Standby', pct: Math.round(baseloadShare * 100) },
    { id: 'water', name: 'Water Heating (Geyser)', pct: 15 },
    { id: 'appliances', name: 'Lighting & Appliances', pct: 0 }
  ];
  const assignedPct = rawEndUses.slice(0, 4).reduce((s, u) => s + u.pct, 0);
  rawEndUses[4].pct = Math.max(8, 100 - assignedPct);
  const pctSum = rawEndUses.reduce((s, u) => s + u.pct, 0);
  const endUseBreakdown = rawEndUses.map((u) => {
    const normalizedPct = Math.round((u.pct / pctSum) * 100);
    return {
      ...u,
      pct: normalizedPct,
      monthlyKwh: Number(((monthlyKwh * normalizedPct) / 100).toFixed(1))
    };
  });

  const avgHourlyKw = totalKwh / Math.max(1, sorted.length);
  const peakToAvgRatio = Number((peakKw / Math.max(0.05, avgHourlyKw)).toFixed(2));
  const onPeakPct = Math.round((touTotals.onPeak / Math.max(0.1, totalKwh)) * 100);

  const summary = {
    currency: 'INR',
    currencySymbol: CURRENCY_SYMBOL,
    intervalCount: sorted.length,
    daysCovered: numDays,
    monthlyKwh,
    monthlyCost,
    monthlyCarbonKg,
    avgDailyKwh: Number(meanDailyKwh.toFixed(2)),
    peakKw: Number(peakKw.toFixed(2)),
    peakTimestamp,
    baseloadKw,
    peakToAvgRatio,
    onPeakPct,
    weekdayAvgKw: weekdayCount ? Number((weekdaySum / weekdayCount).toFixed(2)) : 0,
    weekendAvgKw: weekendCount ? Number((weekendSum / weekendCount).toFixed(2)) : 0,
    tariffId: plan.id,
    tariffName: plan.name,
    touBreakdown: {
      offPeakKwh: Number((touTotals.offPeak * scaleToMonth).toFixed(1)),
      midPeakKwh: Number((touTotals.midPeak * scaleToMonth).toFixed(1)),
      onPeakKwh: Number((touTotals.onPeak * scaleToMonth).toFixed(1)),
      offPeakCost: Number((touCosts.offPeak * scaleToMonth).toFixed(0)),
      midPeakCost: Number((touCosts.midPeak * scaleToMonth).toFixed(0)),
      onPeakCost: Number((touCosts.onPeak * scaleToMonth).toFixed(0)),
      fixedMonthlyFee: plan.fixedMonthlyFee
    },
    anomalyDays
  };

  const tariffComparison = compareTariffPlans(hourlyProfile);
  const recommendations = generateRecommendations(summary, endUseBreakdown, hourlyProfile, plan);

  return {
    summary,
    hourlyProfile,
    dailySeries,
    endUseBreakdown,
    tariffComparison,
    recommendations
  };
}

/**
 * Generate personalized, quantitative AI recommendations in INR (₹).
 */
function generateRecommendations(summary, endUseBreakdown, hourlyProfile, plan) {
  const hvacUse = endUseBreakdown.find((e) => e.id === 'hvac')?.monthlyKwh || summary.monthlyKwh * 0.3;
  const evUse = endUseBreakdown.find((e) => e.id === 'ev')?.monthlyKwh || summary.monthlyKwh * 0.14;
  const baseloadMonthly = summary.baseloadKw * 24 * 30;
  const avgRate = (plan.offPeakRate + plan.midPeakRate + plan.onPeakRate) / 3;
  const recs = [];

  // 1. Peak-hour TOU shifting
  if (summary.onPeakPct >= 20 || summary.peakToAvgRatio >= 2.2) {
    const shiftableKwh = Number((summary.touBreakdown.onPeakKwh * 0.45).toFixed(1));
    const rateSpread = Math.max(2.5, plan.onPeakRate - plan.offPeakRate);
    const monthlySavingsInr = Math.round(shiftableKwh * rateSpread);
    recs.push({
      id: 'rec_peak_shift',
      title: 'Shift EV Charging & Heavy Loads to Off-Peak (10 PM – 7 AM)',
      category: 'Tariff Optimization',
      priority: 'High',
      confidence: 95,
      effort: 'Low · Automated Schedule',
      kwhSavedMonthly: Number((shiftableKwh * 0.12).toFixed(1)),
      inrSavedMonthly: monthlySavingsInr,
      carbonSavedKg: Number((shiftableKwh * 0.14).toFixed(1)),
      insight: `${summary.onPeakPct}% of your consumption (${summary.touBreakdown.onPeakKwh} kWh/mo) occurs during expensive 4–9 PM peak hours (peak demand ${summary.peakKw} kW).`,
      simPatch: { offPeakShiftPct: 65, tariffPlan: 'tou_ev_saver' }
    });
  }

  // 2. HVAC Pre-cooling & Setpoint Optimization
  const afternoonAvg = hourlyProfile.slice(14, 19).reduce((s, h) => s + h.avgKwh, 0) / 5;
  if (afternoonAvg > 0.7 || hvacUse > 140) {
    const savedKwh = Number((hvacUse * 0.16).toFixed(1));
    const savedInr = Math.round(savedKwh * Math.max(avgRate, plan.midPeakRate));
    recs.push({
      id: 'rec_hvac_setpoint',
      title: 'Pre-Cool Home Before 4 PM & Raise AC Setpoint by 2°C',
      category: 'Climate & HVAC',
      priority: 'High',
      confidence: 92,
      effort: 'Low · Smart Thermostat',
      kwhSavedMonthly: savedKwh,
      inrSavedMonthly: savedInr,
      carbonSavedKg: Number((savedKwh * 0.44).toFixed(1)),
      insight: `Afternoon climate load averages ${afternoonAvg.toFixed(2)} kW and drives ~${Math.round(hvacUse)} kWh/mo. A 2°C setback during peak windows trims compressor runtime by ~16%.`,
      simPatch: { thermostatShiftC: 2 }
    });
  }

  // 3. Standby / Always-On Baseload Elimination
  if (summary.baseloadKw >= 0.30) {
    const cutKwh = Number((baseloadMonthly * 0.28).toFixed(1));
    const cutInr = Math.round(cutKwh * plan.offPeakRate);
    recs.push({
      id: 'rec_baseload_vampire',
      title: 'Trim Overnight Standby ("Vampire") Load with Smart Power Strips',
      category: 'Baseload Efficiency',
      priority: summary.baseloadKw > 0.48 ? 'High' : 'Medium',
      confidence: 89,
      effort: 'Low · Smart Plugs',
      kwhSavedMonthly: cutKwh,
      inrSavedMonthly: cutInr,
      carbonSavedKg: Number((cutKwh * 0.34).toFixed(1)),
      insight: `Your continuous overnight baseload sits at ${summary.baseloadKw} kW (${Math.round(baseloadMonthly)} kWh/mo). Scheduling entertainment, routers, and secondary chargers cuts ~28% of idle draw.`,
      simPatch: { baseloadReductionPct: 30 }
    });
  }

  // 4. Lighting & High-Efficiency Appliance Retrofit
  const appKwh = endUseBreakdown.find((e) => e.id === 'appliances')?.monthlyKwh || 90;
  const appSavedKwh = Number((appKwh * 0.24).toFixed(1));
  recs.push({
    id: 'rec_led_appliances',
    title: 'Upgrade to BLDC Fans, LEDs & 5-Star Inverter Appliances',
    category: 'Appliance Efficiency',
    priority: 'Medium',
    confidence: 86,
    effort: 'Medium · One-Time Swap',
    kwhSavedMonthly: appSavedKwh,
    inrSavedMonthly: Math.round(appSavedKwh * avgRate),
    carbonSavedKg: Number((appSavedKwh * 0.38).toFixed(1)),
    insight: `Lighting and plug-in appliances consume ~${Math.round(appKwh)} kWh/mo. Switching to LEDs, BLDC fans, and eco-cycle washing cuts ~24% of this category.`,
    simPatch: { ledApplianceUpgrade: true }
  });

  // 5. Solar + Battery Peak Shaving
  const solarSizeKw = summary.monthlyKwh > 750 ? 5 : 3.5;
  const solarMonthlyGen = Number((solarSizeKw * 125).toFixed(1));
  const solarMonthlySavings = Math.round(solarMonthlyGen * avgRate);
  recs.push({
    id: 'rec_solar_storage',
    title: `Add ${solarSizeKw} kW Rooftop Solar + 5 kWh Peak-Shaving Battery`,
    category: 'Clean Generation',
    priority: summary.monthlyKwh > 650 ? 'High' : 'Medium',
    confidence: 91,
    effort: 'Strategic · 4–6 yr Payback',
    kwhSavedMonthly: solarMonthlyGen,
    inrSavedMonthly: solarMonthlySavings,
    carbonSavedKg: Number((solarMonthlyGen * 0.42).toFixed(1)),
    insight: `Based on your daytime load and ${summary.onPeakPct}% evening peak exposure, a ${solarSizeKw} kW PV + 5 kWh battery offsets ~${Math.min(88, Math.round((solarMonthlyGen / Math.max(1, summary.monthlyKwh)) * 100))}% of grid imports.`,
    simPatch: { solarKw: solarSizeKw, batteryKwh: 5 }
  });

  if (evUse > 80 && !recs.find((r) => r.id === 'rec_peak_shift')) {
    const evSavedKwh = Number((evUse * 0.08).toFixed(1));
    recs.push({
      id: 'rec_ev_smart',
      title: 'Enable Scheduled Smart EV Charging',
      category: 'Mobility',
      priority: 'Medium',
      confidence: 88,
      effort: 'Low · App Automation',
      kwhSavedMonthly: evSavedKwh,
      inrSavedMonthly: Math.round(evSavedKwh * plan.onPeakRate),
      carbonSavedKg: Number((evUse * 0.12).toFixed(1)),
      insight: `High-draw evening loads account for ~${Math.round(evUse)} kWh/mo.`,
      simPatch: { offPeakShiftPct: 50 }
    });
  }

  return recs;
}

/**
 * Simulate interactive usage changes and generate 12-month & 24-hour impact forecasts in INR (₹).
 */
export function simulateScenario(analysis, controls = {}) {
  const {
    thermostatShiftC = 0,
    offPeakShiftPct = 0,
    baseloadReductionPct = 0,
    ledApplianceUpgrade = false,
    solarKw = 0,
    batteryKwh = 0,
    tariffPlan = analysis.summary.tariffId || 'tou_standard'
  } = controls;

  const plan = TARIFF_PLANS[tariffPlan] || TARIFF_PLANS.tou_standard;
  const baseProfile = analysis.hourlyProfile;

  const onPeakPool = baseProfile
    .filter((h) => h.hour >= 16 && h.hour <= 20)
    .reduce((sum, h) => sum + Math.max(0, h.avgKwh - analysis.summary.baseloadKw * 0.8), 0);
  const shiftedDailyKwh = onPeakPool * (offPeakShiftPct / 100);

  let simDailyKwh = 0;
  let simDailyCost = 0;
  let simDailyCarbon = 0;
  let simPeakKw = 0;

  let solarSurplusDaily = 0;
  const rawSimHours = baseProfile.map((h) => {
    const hvacWeight = h.hour >= 10 && h.hour <= 21 ? 0.55 : 0.2;
    let demand = h.avgKwh * (1 - Math.min(0.32, thermostatShiftC * 0.075 * hvacWeight));

    const basePart = Math.min(demand, analysis.summary.baseloadKw);
    demand -= basePart * (baseloadReductionPct / 100);

    if (ledApplianceUpgrade && h.hour >= 6 && h.hour <= 23) {
      demand *= 0.91;
    }

    if (h.hour >= 16 && h.hour <= 20 && onPeakPool > 0) {
      const share = Math.max(0, h.avgKwh - analysis.summary.baseloadKw * 0.8) / onPeakPool;
      demand = Math.max(0.18, demand - shiftedDailyKwh * share);
    } else if (h.hour >= 0 && h.hour <= 5) {
      demand += shiftedDailyKwh / 6;
    }

    const solarGen = solarKw * 0.72 * SOLAR_PROFILE_BY_HOUR[h.hour];
    const netAfterSolar = demand - solarGen;
    if (netAfterSolar < 0) {
      solarSurplusDaily += Math.abs(netAfterSolar);
    }

    return {
      hour: h.hour,
      label: h.label,
      baselineKwh: h.avgKwh,
      demandBeforeBattery: Math.max(0, netAfterSolar)
    };
  });

  const usableBatteryDaily = Math.min(batteryKwh * 0.85, Math.max(solarSurplusDaily, batteryKwh * 0.7));
  const simHourlyProfile = rawSimHours.map((item) => {
    let netKwh = item.demandBeforeBattery;
    if (batteryKwh > 0 && item.hour >= 17 && item.hour <= 21) {
      const discharge = Math.min(netKwh, usableBatteryDaily / 5);
      netKwh = Math.max(0, netKwh - Math.max(0, discharge));
    } else if (batteryKwh > 0 && solarSurplusDaily < batteryKwh * 0.6 && item.hour >= 1 && item.hour <= 4) {
      netKwh += (batteryKwh * 0.5) / 4;
    }

    const { rate } = getRateForHour(item.hour, tariffPlan);
    simDailyKwh += netKwh;
    simDailyCost += netKwh * rate;
    simDailyCarbon += netKwh * CARBON_INTENSITY_BY_HOUR[item.hour];
    simPeakKw = Math.max(simPeakKw, netKwh);

    return {
      hour: item.hour,
      label: item.label,
      baselineKwh: Number(item.baselineKwh.toFixed(3)),
      simulatedKwh: Number(netKwh.toFixed(3))
    };
  });

  const simMonthlyKwh = Number((simDailyKwh * 30).toFixed(1));
  const simMonthlyCost = Math.round(simDailyCost * 30 + plan.fixedMonthlyFee);
  const simMonthlyCarbonKg = Number((simDailyCarbon * 30).toFixed(1));

  const baseMonthlyKwh = analysis.summary.monthlyKwh;
  const baseMonthlyCost = analysis.summary.monthlyCost;
  const baseMonthlyCarbonKg = analysis.summary.monthlyCarbonKg;

  const monthlyKwhSaved = Number(Math.max(0, baseMonthlyKwh - simMonthlyKwh).toFixed(1));
  const monthlyInrSaved = Math.round(Math.max(0, baseMonthlyCost - simMonthlyCost));
  const monthlyCarbonSavedKg = Number(Math.max(0, baseMonthlyCarbonKg - simMonthlyCarbonKg).toFixed(1));
  const savingsPct = baseMonthlyKwh > 0 ? Math.round((monthlyKwhSaved / baseMonthlyKwh) * 100) : 0;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentMonth = new Date().getMonth();
  const seasonalMultipliers = [1.02, 0.98, 1.04, 1.16, 1.24, 1.22, 1.10, 1.05, 1.02, 0.96, 0.92, 0.95];

  let cumulativeSavingsInr = 0;
  const annualForecast = Array.from({ length: 12 }, (_, i) => {
    const mIdx = (currentMonth + i) % 12;
    const factor = seasonalMultipliers[mIdx];
    const baselineKwh = Math.round(baseMonthlyKwh * factor);
    const simulatedKwh = Math.round(simMonthlyKwh * factor);
    const baselineInr = Math.round(baseMonthlyCost * factor);
    const simulatedInr = Math.round(simMonthlyCost * factor);
    cumulativeSavingsInr += Math.max(0, baselineInr - simulatedInr);
    return {
      month: monthNames[mIdx],
      baselineKwh,
      simulatedKwh,
      baselineInr,
      simulatedInr,
      cumulativeSavingsInr
    };
  });

  return {
    controls: {
      thermostatShiftC,
      offPeakShiftPct,
      baseloadReductionPct,
      ledApplianceUpgrade,
      solarKw,
      batteryKwh,
      tariffPlan,
      tariffName: plan.name
    },
    metrics: {
      baselineMonthlyKwh: baseMonthlyKwh,
      simulatedMonthlyKwh: simMonthlyKwh,
      monthlyKwhSaved,
      savingsPct,
      baselineMonthlyCost: baseMonthlyCost,
      simulatedMonthlyCost: simMonthlyCost,
      monthlyInrSaved,
      annualInrSaved: Math.round(monthlyInrSaved * 12),
      annualKwhSaved: Math.round(monthlyKwhSaved * 12),
      monthlyCarbonSavedKg,
      simulatedPeakKw: Number(simPeakKw.toFixed(2)),
      peakReductionKw: Number(Math.max(0, analysis.summary.peakKw - simPeakKw).toFixed(2))
    },
    simHourlyProfile,
    annualForecast
  };
}

/**
 * Retrieve relevant context chunks across Customer Profile, Tariff Schedule, Live Telemetry, and Energy KB.
 */
function retrieveGroundedContext({ message, activeProfile, analysis, simulation, utilityState }) {
  const tokens = message
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const scoredKb = KNOWLEDGE_BASE.map((doc) => {
    let score = 0;
    for (const t of tokens) {
      if (doc.tags.some((tag) => tag.includes(t) || t.includes(tag))) score += 3;
      if (doc.content.toLowerCase().includes(t)) score += 1;
    }
    return { ...doc, score };
  })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  const sources = [];
  if (activeProfile) sources.push(`Customer Profile (${activeProfile.accountNumber})`);
  sources.push(`Tariff: ${analysis.summary.tariffName}`);
  sources.push('Live Smart-Meter Telemetry');
  if (scoredKb.length) {
    sources.push(...scoredKb.map((k) => k.title));
  }
  if (utilityState?.connected) {
    sources.push(`Utility Feed: ${utilityState.providerName}`);
  }

  return { scoredKb, sources };
}

/**
 * Generate interactive, RAG-grounded AI assistant response in INR (₹) with clickable actions & follow-ups.
 */
export async function generateAdvisorReply({
  message,
  analysis,
  simulation,
  utilityState,
  activeProfile,
  faqRows = [],
  apiKey
}) {
  const { summary, endUseBreakdown, recommendations, tariffComparison } = analysis;
  const simM = simulation.metrics;
  const plan = TARIFF_PLANS[summary.tariffId] || TARIFF_PLANS.tou_standard;
  const { scoredKb, sources } = retrieveGroundedContext({
    message,
    activeProfile,
    analysis,
    simulation,
    utilityState
  });
  const excelMatches = retrieveFromExcelKb(message, faqRows, 3);
  const ragSources = [
    ...excelMatches.map((m) => `Excel Row #${m.rowNumber} · ${m.category} (${m.confidence}%)`),
    ...sources
  ];

  const cheapestPlan = [...(tariffComparison || [])].sort((a, b) => a.estimatedMonthlyBill - b.estimatedMonthlyBill)[0];
  const customerIntro = activeProfile
    ? `${activeProfile.name} (${activeProfile.accountNumber}, ${activeProfile.city}, ${activeProfile.sanctionedLoadKw} kW sanctioned load, Meter ${activeProfile.meterId})`
    : 'Active Customer';

  const systemContext = [
    `You are WattWise AI, an interactive Indian residential & commercial energy efficiency advisor. Always quote currency in Indian Rupees (₹).`,
    `Active Customer Profile: ${customerIntro}`,
    `Live Consumption Data (${summary.daysCovered} days, ${summary.intervalCount} intervals):`,
    `- Monthly usage: ${summary.monthlyKwh} kWh (${formatInr(summary.monthlyCost)}/mo on ${summary.tariffName})`,
    `- Tariff Rates: Off-Peak ${formatInr(plan.offPeakRate, 2)}/kWh, Mid-Peak ${formatInr(plan.midPeakRate, 2)}/kWh, On-Peak ${formatInr(plan.onPeakRate, 2)}/kWh, Fixed ${formatInr(plan.fixedMonthlyFee)}/mo`,
    `- Carbon footprint: ${summary.monthlyCarbonKg} kg CO2e/mo`,
    `- Peak demand: ${summary.peakKw} kW (${summary.peakToAvgRatio}x avg), Overnight baseload: ${summary.baseloadKw} kW`,
    `- On-Peak (4-9 PM) share: ${summary.onPeakPct}% (${summary.touBreakdown.onPeakKwh} kWh, ${formatInr(summary.touBreakdown.onPeakCost)}/mo)`,
    `- End-use breakdown: ${endUseBreakdown.map((e) => `${e.name} ${e.pct}% (${e.monthlyKwh} kWh)`).join(', ')}`,
    `- Active Simulator Scenario: saves ${simM.monthlyKwhSaved} kWh/mo (${simM.savingsPct}%), ${formatInr(simM.monthlyInrSaved)}/mo (${formatInr(simM.annualInrSaved)}/yr), ${simM.monthlyCarbonSavedKg} kg CO2/mo.`,
    `- Top Recommendations: ${recommendations.slice(0, 3).map((r) => `${r.title} (-${formatInr(r.inrSavedMonthly)}/mo)`).join('; ')}.`,
    excelMatches.length
      ? `- Retrieved Excel Q&A Knowledge Base Matches:\n${excelMatches.map((m) => `  * [Row #${m.rowNumber} · ${m.category} · ${m.confidence}% match] Q: ${m.question} | A: ${m.answer}`).join('\n')}`
      : '',
    scoredKb.length ? `- Retrieved Energy Knowledge:\n${scoredKb.map((k) => `  * ${k.title}: ${k.content}`).join('\n')}` : '',
    `Prioritize accurate facts from the Retrieved Excel Q&A Knowledge Base combined with the customer's live telemetry in INR (₹).`
  ].filter(Boolean).join('\n');

  const q = message.toLowerCase();
  const topRec = recommendations[0];
  const hvac = endUseBreakdown.find((e) => e.id === 'hvac');
  const baseload = endUseBreakdown.find((e) => e.id === 'baseload');

  const excelFollowUps = excelMatches
    .slice(1)
    .map((m) => m.question)
    .concat((faqRows || []).filter((r) => !excelMatches.some((m) => m.id === r.id)).slice(0, 2).map((r) => r.question))
    .slice(0, 3);

  const defaultFollowUps = excelFollowUps.length
    ? excelFollowUps
    : [
        'Which tariff plan is cheapest for me?',
        'How can I cut my 4–9 PM peak bill?',
        'Show my customer profile & meter details'
      ];

  const ragMatchesPayload = excelMatches.map((m) => ({
    rowNumber: m.rowNumber,
    category: m.category,
    question: m.question,
    answer: m.answer,
    confidence: m.confidence,
    sourceFile: m.sourceFile
  }));

  const keyToUse = apiKey || process.env.GEMINI_API_KEY;
  if (keyToUse) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(keyToUse)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemContext }] },
            contents: [{ role: 'user', parts: [{ text: message }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 450 }
          })
        }
      );
      if (resp.ok) {
        const json = await resp.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return {
            reply: text,
            engine: 'gemini-rag-excel',
            sources: ragSources,
            ragMatches: ragMatchesPayload,
            actions: [
              { label: 'Open Scenario Simulator', type: 'switchTab', tab: 'simulator' },
              { label: 'View Customer & Tariffs', type: 'switchTab', tab: 'customer-tariff' }
            ],
            followUps: defaultFollowUps
          };
        }
      }
    } catch {
      // Fall back cleanly to built-in Excel RAG agent
    }
  }

  const topExcel = excelMatches[0];
  const excelBanner = topExcel
    ? `**Excel RAG Match (${topExcel.category} · Row #${topExcel.rowNumber}, ${topExcel.confidence}% match):**\n${topExcel.answer}`
    : '';

  const excelAction = topExcel?.actionTab
    ? [{ label: topExcel.actionLabel || 'Open Related View', type: 'switchTab', tab: topExcel.actionTab }]
    : [];

  // Interactive RAG-grounded analytical responses combining Excel Q&A + live customer telemetry
  if (q.includes('profile') || q.includes('customer') || q.includes('account') || q.includes('who am i') || q.includes('meter')) {
    const p = activeProfile;
    const liveProfile = p
      ? `**Live Profile — ${p.name}**\n• Account ID: **${p.accountNumber}** · City: **${p.city}** (${p.discom})\n• Segment: **${p.segment}** · Sanctioned Load: **${p.sanctionedLoadKw} kW**\n• Smart Meter: **${p.meterId}** · Tariff: **${summary.tariffName}**\n• Monthly Estimate: **${formatInr(summary.monthlyCost)}/mo** (${summary.monthlyKwh} kWh)`
      : `Current meter **${utilityState?.meterId || 'SM-9482-EV'}** is averaging **${summary.monthlyKwh} kWh/mo** (**${formatInr(summary.monthlyCost)}/mo**).`;
    return {
      engine: topExcel ? 'wattwise-rag-excel' : 'wattwise-rag',
      reply: excelBanner ? `${liveProfile}\n\n${excelBanner}` : liveProfile,
      sources: ragSources,
      ragMatches: ragMatchesPayload,
      actions: [
        { label: 'Open Customer & Tariff Tab', type: 'switchTab', tab: 'customer-tariff' },
        { label: 'Compare Tariff Plans', type: 'ask', prompt: 'Which tariff plan is cheapest for me?' }
      ],
      followUps: defaultFollowUps
    };
  }

  if (q.includes('tariff') || q.includes('plan') || q.includes('rate') || q.includes('slab') || q.includes('cheap') || q.includes('switch')) {
    const compLines = (tariffComparison || [])
      .map((t) => `• **${t.name}**: **${formatInr(t.estimatedMonthlyBill)}/mo** (Off-Peak ${formatInr(t.offPeakRate, 2)} · Peak ${formatInr(t.onPeakRate, 2)}/kWh)`)
      .join('\n');
    const diff = Math.max(0, summary.monthlyCost - (cheapestPlan?.estimatedMonthlyBill || summary.monthlyCost));
    const actions = [
      { label: 'Open Tariff Dashboard', type: 'switchTab', tab: 'customer-tariff' }
    ];
    if (cheapestPlan && cheapestPlan.id !== summary.tariffId) {
      actions.unshift({
        label: `Switch to ${cheapestPlan.name}`,
        type: 'selectTariff',
        tariffId: cheapestPlan.id
      });
    }
    const core = `You are currently on **${summary.tariffName}** (est. **${formatInr(summary.monthlyCost)}/mo**, incl. **${formatInr(plan.fixedMonthlyFee)}** fixed charge).\n\n**Plan Comparison on Your Load:**\n${compLines}\n\n${diff > 0 ? `Switching to **${cheapestPlan.name}** saves ~**${formatInr(diff)}/mo** immediately.` : `You are already on the lowest-cost plan for your current curve.`}`;
    return {
      engine: topExcel ? 'wattwise-rag-excel' : 'wattwise-rag',
      reply: excelBanner ? `${excelBanner}\n\n${core}` : core,
      sources: ragSources,
      ragMatches: ragMatchesPayload,
      actions,
      followUps: defaultFollowUps
    };
  }

  // If the query has a strong match in the Excel Q&A sheet (including custom user-uploaded Excel Q&As!), prioritize it directly
  if (topExcel && topExcel.confidence >= 42) {
    const liveContextLine = `\n\n**Your Live Context (${activeProfile?.name || 'Active Meter'}):** **${summary.monthlyKwh} kWh/mo** · **${formatInr(summary.monthlyCost)}/mo** on **${summary.tariffName}** (Peak **${summary.peakKw} kW**, Baseload **${summary.baseloadKw} kW**).`;
    return {
      engine: 'wattwise-rag-excel',
      reply: `${excelBanner}${liveContextLine}`,
      sources: ragSources,
      ragMatches: ragMatchesPayload,
      actions: [
        ...excelAction,
        { label: 'Open Scenario Simulator', type: 'switchTab', tab: 'simulator' }
      ],
      followUps: defaultFollowUps
    };
  }

  if (q.includes('peak') || q.includes('bill') || q.includes('cost') || q.includes('expensive') || q.includes('rupee') || q.includes('reduce')) {
    const actions = [];
    if (topRec?.simPatch) {
      actions.push({ label: `Apply "${topRec.title.slice(0, 28)}…"`, type: 'applySimPatch', simPatch: topRec.simPatch });
    }
    actions.push({ label: 'Open Tariff Breakdown', type: 'switchTab', tab: 'customer-tariff' });
    const core = `Your estimated monthly bill is **${formatInr(summary.monthlyCost)}/mo** for **${summary.monthlyKwh} kWh** (${summary.tariffName}).\n\n• **4–9 PM On-Peak**: **${summary.onPeakPct}%** of usage (${summary.touBreakdown.onPeakKwh} kWh) costing **${formatInr(summary.touBreakdown.onPeakCost)}/mo** at **${formatInr(plan.onPeakRate, 2)}/kWh**\n• **Peak Demand**: **${summary.peakKw} kW** (${summary.peakToAvgRatio}x avg)\n\n**Top AI Action:** ${topRec ? `${topRec.title} — projected to save **${formatInr(topRec.inrSavedMonthly)}/mo** (${topRec.kwhSavedMonthly} kWh).` : 'Shift heavy loads past 10 PM.'}`;
    return {
      engine: topExcel ? 'wattwise-rag-excel' : 'wattwise-rag',
      reply: excelBanner ? `${excelBanner}\n\n${core}` : core,
      sources: ragSources,
      ragMatches: ragMatchesPayload,
      actions,
      followUps: defaultFollowUps
    };
  }

  if (q.includes('baseload') || q.includes('standby') || q.includes('night') || q.includes('vampire')) {
    const savedKwh = Math.round(summary.baseloadKw * 720 * 0.3);
    const savedInr = Math.round(savedKwh * plan.offPeakRate);
    return {
      engine: topExcel ? 'wattwise-rag-excel' : 'wattwise-rag',
      reply: `Your overnight baseload holds steady at **${summary.baseloadKw} kW**, representing **${baseload?.pct ?? 20}%** of total usage (~${Math.round(summary.baseloadKw * 720)} kWh/mo).\n\nCutting standby draw by **30%** with smart plugs trims roughly **${savedKwh} kWh/mo** (~**${formatInr(savedInr)}/mo**) with zero comfort loss.${excelBanner ? `\n\n${excelBanner}` : ''}`,
      sources: ragSources,
      ragMatches: ragMatchesPayload,
      actions: [
        { label: 'Simulate 30% Baseload Cut', type: 'applySimPatch', simPatch: { baseloadReductionPct: 30 } },
        { label: 'View All Recommendations', type: 'switchTab', tab: 'recommendations' }
      ],
      followUps: defaultFollowUps
    };
  }

  if (q.includes('simulat') || q.includes('forecast') || q.includes('scenario') || q.includes('solar') || q.includes('ev') || q.includes('battery')) {
    return {
      engine: topExcel ? 'wattwise-rag-excel' : 'wattwise-rag',
      reply: `Under your active simulator scenario (**${simulation.controls.tariffName}**), you cut **${simM.monthlyKwhSaved} kWh/mo (${simM.savingsPct}%)**, saving **${formatInr(simM.monthlyInrSaved)}/mo** (**${formatInr(simM.annualInrSaved)}/yr**) and avoiding **${simM.monthlyCarbonSavedKg} kg CO₂e/mo**.\n\nPeak demand drops by **${simM.peakReductionKw} kW** (down to **${simM.simulatedPeakKw} kW**).${excelBanner ? `\n\n${excelBanner}` : ''}`,
      sources: ragSources,
      ragMatches: ragMatchesPayload,
      actions: [
        { label: 'Try 5 kW Solar + Battery Preset', type: 'applySimPatch', simPatch: { solarKw: 5, batteryKwh: 5, offPeakShiftPct: 50 } },
        { label: 'Open Scenario Simulator', type: 'switchTab', tab: 'simulator' }
      ],
      followUps: defaultFollowUps
    };
  }

  if (q.includes('api') || q.includes('utility') || q.includes('sync') || q.includes('connect') || q.includes('upload') || q.includes('pipeline')) {
    const connText = utilityState.connected
      ? `Connected to **${utilityState.providerName}** (Meter **${utilityState.meterId}**) with automated syncing every **${utilityState.cadence}** (${utilityState.syncCount} syncs completed).`
      : `Viewing local/sample smart-meter telemetry.`;
    return {
      engine: topExcel ? 'wattwise-rag-excel' : 'wattwise-rag',
      reply: `${connText}\n\nEvery pipeline run ingests intervals, normalizes timestamps, enriches TOU rupee tariffs & carbon factors, and refreshes AI recommendations.${excelBanner ? `\n\n${excelBanner}` : ''}`,
      sources: ragSources,
      ragMatches: ragMatchesPayload,
      actions: [
        { label: 'Run Pipeline Sync Now', type: 'syncUtility' },
        { label: 'Open Utility API & Data Flow', type: 'switchTab', tab: 'data-flow' }
      ],
      followUps: defaultFollowUps
    };
  }

  if (q.includes('anomal') || q.includes('spike') || q.includes('why') || q.includes('ac') || q.includes('hvac')) {
    const anomText = summary.anomalyDays.length
      ? `Detected **${summary.anomalyDays.length} high-usage day(s)**: ${summary.anomalyDays.slice(0, 3).map((d) => `${d.date} (${d.kwh} kWh, +${d.pctAboveMean}%)`).join(', ')}.`
      : `No severe daily anomalies were detected above +24% of your **${summary.avgDailyKwh} kWh/day** average.`;
    return {
      engine: topExcel ? 'wattwise-rag-excel' : 'wattwise-rag',
      reply: `${anomText}\n\nYour largest end-use is **${hvac?.name || 'HVAC'}** at **${hvac?.pct || 32}%** (${hvac?.monthlyKwh || 200} kWh/mo), with peak demand reaching **${summary.peakKw} kW**.${excelBanner ? `\n\n${excelBanner}` : ''}`,
      sources: ragSources,
      ragMatches: ragMatchesPayload,
      actions: [
        { label: 'Simulate +2°C AC Pre-Cooling', type: 'applySimPatch', simPatch: { thermostatShiftC: 2 } },
        { label: 'Inspect 30-Day Chart', type: 'switchTab', tab: 'overview' }
      ],
      followUps: defaultFollowUps
    };
  }

  const kbSnippet = excelBanner || (scoredKb.length ? `**Knowledge Insight (${scoredKb[0].title}):** ${scoredKb[0].content}` : '');
  return {
    engine: topExcel ? 'wattwise-rag-excel' : 'wattwise-rag',
    reply: `${kbSnippet ? `${kbSnippet}\n\n` : ''}For **${activeProfile?.name || 'your account'}** (**${summary.monthlyKwh} kWh/mo**, **${formatInr(summary.monthlyCost)}/mo** on **${summary.tariffName}**), your top opportunities are:\n\n1. **${recommendations[0]?.title || 'Shift peak loads'}** — saves **${formatInr(recommendations[0]?.inrSavedMonthly || 650)}/mo**\n2. **${recommendations[1]?.title || 'Optimize AC'}** — saves **${formatInr(recommendations[1]?.inrSavedMonthly || 480)}/mo**\n3. **Active Simulator Scenario** — projects **${formatInr(simM.annualInrSaved)}/yr** savings (${simM.savingsPct}% kWh cut).`,
    sources: ragSources,
    ragMatches: ragMatchesPayload,
    actions: [
      ...excelAction,
      { label: 'Open Customer & Tariffs', type: 'switchTab', tab: 'customer-tariff' },
      { label: 'Open Scenario Simulator', type: 'switchTab', tab: 'simulator' }
    ],
    followUps: defaultFollowUps
  };
}
