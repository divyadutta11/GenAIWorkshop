import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CUSTOMER_PROFILES,
  generateDefaultIntervals,
  parseConsumptionUpload,
  analyzeConsumption,
  simulateScenario,
  generateAdvisorReply
} from '../server/analytics.mjs';
import {
  DEFAULT_FAQ_ROWS,
  buildFaqXlsxBuffer,
  parseXlsxBuffer,
  normalizeFaqRows,
  parseFaqUpload,
  retrieveFromExcelKb
} from '../server/ragAgent.mjs';

test('analyzes default 30-day telemetry in INR and generates personalized recommendations', () => {
  const intervals = generateDefaultIntervals(30, 1);
  assert.equal(intervals.length, 720);

  const analysis = analyzeConsumption(intervals, 'tou_standard');
  assert.equal(analysis.summary.currency, 'INR');
  assert.equal(analysis.summary.currencySymbol, '₹');
  assert.ok(analysis.summary.monthlyKwh > 0);
  assert.ok(analysis.summary.monthlyCost > 0);
  assert.equal(analysis.hourlyProfile.length, 24);
  assert.ok(analysis.endUseBreakdown.length >= 5);
  assert.ok(analysis.tariffComparison.length >= 3);
  assert.ok(analysis.recommendations.length >= 4);
  assert.ok(analysis.recommendations[0].inrSavedMonthly > 0);
});

test('parses CSV upload and recomputes analytics', () => {
  const csv = [
    'timestamp,kwh,temp_c',
    '2026-11-01T02:00:00Z,0.45,19',
    '2026-11-01T17:00:00Z,3.10,27',
    '2026-11-01T18:00:00Z,3.50,26'
  ].join('\n');

  const parsed = parseConsumptionUpload('meter.csv', csv);
  assert.equal(parsed.length, 3);
  const analysis = analyzeConsumption(parsed, 'tou_standard');
  assert.equal(analysis.summary.intervalCount, 3);
});

test('simulates usage changes and forecasts 12-month INR savings', () => {
  const intervals = generateDefaultIntervals(30, 1);
  const analysis = analyzeConsumption(intervals, 'tou_standard');
  const sim = simulateScenario(analysis, {
    thermostatShiftC: 2,
    offPeakShiftPct: 60,
    baseloadReductionPct: 30,
    ledApplianceUpgrade: true,
    solarKw: 4,
    batteryKwh: 5,
    tariffPlan: 'tou_ev_saver'
  });

  assert.ok(sim.metrics.monthlyKwhSaved > 0);
  assert.ok(sim.metrics.monthlyInrSaved > 0);
  assert.ok(sim.metrics.annualInrSaved > 0);
  assert.equal(sim.annualForecast.length, 12);
  assert.ok(sim.annualForecast[0].baselineInr > 0);
  assert.equal(sim.simHourlyProfile.length, 24);
});

test('generates interactive RAG-grounded chat reply with profile & INR context', async () => {
  const activeProfile = DEFAULT_CUSTOMER_PROFILES[0];
  const intervals = generateDefaultIntervals(30, 1);
  const analysis = analyzeConsumption(intervals, 'tou_standard');
  const simulation = simulateScenario(analysis, { thermostatShiftC: 1.5, offPeakShiftPct: 40 });
  const res = await generateAdvisorReply({
    message: 'Show my customer profile and peak bill in rupees',
    analysis,
    simulation,
    utilityState: { connected: true, providerName: 'Tata Power Smart Meter Hub', cadence: '15m', syncCount: 4 },
    activeProfile
  });

  assert.equal(res.engine, 'wattwise-rag');
  assert.match(res.reply, /₹/);
  assert.match(res.reply, /Arjun Mehta/);
  assert.ok(Array.isArray(res.sources) && res.sources.length > 0);
  assert.ok(Array.isArray(res.actions) && res.actions.length > 0);
  assert.ok(Array.isArray(res.followUps) && res.followUps.length > 0);
});

test('builds & parses real .xlsx workbook and retrieves answers via Excel RAG agent', async () => {
  const customRows = [
    ...DEFAULT_FAQ_ROWS,
    {
      id: 'faq_custom_subsidy',
      category: 'Subsidies',
      question: 'What is the PM Surya Ghar rooftop solar subsidy amount?',
      answer: 'Under PM Surya Ghar Muft Bijli Yojana, residential customers receive up to ₹78,000 subsidy for 3 kW+ rooftop solar installations.',
      keywords: 'pm surya ghar, subsidy, 78000, rooftop solar, rebate'
    }
  ];

  const xlsxBuf = buildFaqXlsxBuffer(customRows);
  const table = parseXlsxBuffer(xlsxBuf);
  const normalized = normalizeFaqRows(table, 'custom_test.xlsx');
  assert.equal(normalized.length, customRows.length);

  const matches = retrieveFromExcelKb('How much is the PM Surya Ghar solar subsidy?', normalized, 2);
  assert.ok(matches.length >= 1);
  assert.match(matches[0].answer, /78,000/);

  const csvUpload = parseFaqUpload({
    filename: 'faq.csv',
    contentText: 'Category,Question,Answer\nSupport,What is net metering credit?,Unused solar exports are credited in kWh against future monthly bills.'
  });
  assert.equal(csvUpload.length, 1);
  assert.match(csvUpload[0].answer, /kWh/);

  const intervals = generateDefaultIntervals(30, 1);
  const analysis = analyzeConsumption(intervals, 'tou_standard');
  const simulation = simulateScenario(analysis, { thermostatShiftC: 1.5 });
  const reply = await generateAdvisorReply({
    message: 'Tell me about PM Surya Ghar subsidy',
    analysis,
    simulation,
    utilityState: { connected: true, providerName: 'Tata Power', cadence: '15m', syncCount: 1 },
    activeProfile: DEFAULT_CUSTOMER_PROFILES[0],
    faqRows: normalized
  });

  assert.equal(reply.engine, 'wattwise-rag-excel');
  assert.match(reply.reply, /78,000/);
  assert.ok(reply.ragMatches.length >= 1);
});
