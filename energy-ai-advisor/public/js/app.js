import {
  renderHourlyComparisonChart,
  renderEndUseDonut,
  renderDailyConsumptionChart,
  renderAnnualForecastChart
} from './charts.js';

const state = {
  dashboard: null,
  activeTab: 'overview',
  recFilter: 'all',
  selectedProviderId: 'tata_smartgrid',
  csatScore: 5,
  chatHistory: [],
  chatPending: false,
  editingProfile: false
};

function formatInr(value, decimals = 0) {
  const num = Number(value) || 0;
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatBoldMarkdown(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function getInitials(name) {
  return String(name || 'WW')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `panel-${tabId}`);
  });
}

function renderProfileBanner() {
  const { activeProfile, customerProfiles = [], analysis } = state.dashboard;
  if (!activeProfile) return;

  document.getElementById('banner-avatar').textContent = getInitials(activeProfile.name);
  document.getElementById('banner-name').textContent = activeProfile.name;
  document.getElementById('banner-account').textContent = activeProfile.accountNumber;
  document.getElementById('banner-tariff').textContent = analysis.summary.tariffName;
  document.getElementById('banner-meta').textContent =
    `${activeProfile.city} · ${activeProfile.discom} · Meter ${activeProfile.meterId} · ${activeProfile.sanctionedLoadKw} kW Sanctioned Load · ${activeProfile.segment}`;

  const select = document.getElementById('quick-profile-select');
  select.innerHTML = customerProfiles
    .map((p) => `<option value="${escapeHtml(p.id)}" ${p.id === activeProfile.id ? 'selected' : ''}>${escapeHtml(p.name)} (${escapeHtml(p.city)})</option>`)
    .join('');
}

function renderKpis() {
  const { analysis, simulation, feedback, datasetLabel, utility } = state.dashboard;
  const s = analysis.summary;
  const m = simulation.metrics;

  document.getElementById('dataset-badge').textContent = datasetLabel;
  document.getElementById('sync-status-text').textContent = utility.connected
    ? `${utility.cadence} Sync · ${utility.providerName.split(' ')[0]}`
    : 'Manual Dataset';

  document.getElementById('kpi-kwh').textContent = `${s.monthlyKwh} kWh`;
  document.getElementById('kpi-kwh-meta').textContent = `Peak ${s.peakKw} kW · Baseload ${s.baseloadKw} kW`;

  document.getElementById('kpi-cost').textContent = formatInr(s.monthlyCost);
  document.getElementById('kpi-cost-meta').textContent = `Scenario saves ${formatInr(m.monthlyInrSaved)}/mo (${formatInr(m.annualInrSaved)}/yr)`;

  document.getElementById('kpi-savings').textContent = `${m.monthlyKwhSaved} kWh (${m.savingsPct}%)`;
  document.getElementById('kpi-savings-meta').textContent = `${m.monthlyCarbonSavedKg} kg CO₂e/mo avoided`;

  document.getElementById('kpi-feedback').textContent = `${feedback.positiveFeedbackPct}% Positive`;
  document.getElementById('kpi-feedback-meta').textContent = `CSAT ${feedback.avgCsat}/5.0 · ${(feedback.adoptedRecommendationIds || []).length} adopted`;
}

function renderOverview() {
  const { analysis, simulation } = state.dashboard;

  renderHourlyComparisonChart(
    document.getElementById('chart-hourly'),
    simulation.simHourlyProfile,
    analysis.hourlyProfile
  );
  renderEndUseDonut(
    document.getElementById('chart-donut'),
    document.getElementById('enduse-list'),
    analysis.endUseBreakdown
  );
  renderDailyConsumptionChart(
    document.getElementById('chart-daily'),
    analysis.dailySeries,
    analysis.summary.anomalyDays
  );

  const anomCount = analysis.summary.anomalyDays.length;
  const badge = document.getElementById('anomaly-badge');
  badge.textContent = `${anomCount} anomaly day${anomCount === 1 ? '' : 's'}`;
  badge.className = `badge ${anomCount > 0 ? 'badge-warn' : 'badge-success'}`;

  const topContainer = document.getElementById('overview-top-recs');
  topContainer.innerHTML = analysis.recommendations.slice(0, 3).map((rec) => `
    <div class="mini-rec">
      <div>
        <span class="badge ${rec.priority === 'High' ? 'badge-high' : 'badge-medium'}">${rec.priority} · ${rec.confidence}% conf</span>
        <h3 style="font-size:0.9rem;margin-top:0.45rem;">${escapeHtml(rec.title)}</h3>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong class="positive">${formatInr(rec.inrSavedMonthly)}/mo</strong>
        <button class="btn btn-secondary btn-sm apply-rec-btn" data-id="${rec.id}" type="button">Simulate</button>
      </div>
    </div>
  `).join('');

  bindRecommendationActions(topContainer);
}

function renderCustomerAndTariff() {
  const { activeProfile, customerProfiles = [], tariffPlans = [], analysis } = state.dashboard;
  if (!activeProfile) return;

  const activeTariff = tariffPlans.find((t) => t.id === analysis.summary.tariffId) || tariffPlans[0];

  // Active Customer Details
  document.getElementById('active-profile-details').innerHTML = `
    <div class="profile-kv"><span>Customer Name</span><strong>${escapeHtml(activeProfile.name)}</strong></div>
    <div class="profile-kv"><span>Account ID</span><strong>${escapeHtml(activeProfile.accountNumber)}</strong></div>
    <div class="profile-kv"><span>City &amp; DISCOM</span><strong>${escapeHtml(activeProfile.city)} · ${escapeHtml(activeProfile.discom)}</strong></div>
    <div class="profile-kv"><span>Customer Segment</span><strong>${escapeHtml(activeProfile.segment)}</strong></div>
    <div class="profile-kv"><span>Smart Meter ID</span><strong>${escapeHtml(activeProfile.meterId)}</strong></div>
    <div class="profile-kv"><span>Sanctioned Load</span><strong>${activeProfile.sanctionedLoadKw} kW · ${activeProfile.householdSize || 3} Occupants</strong></div>
    <div class="profile-kv"><span>Clean Tech Flags</span><strong>${activeProfile.hasEv ? 'EV Charger' : 'No EV'} · ${activeProfile.hasSolar ? 'Rooftop Solar' : 'Grid Only'}</strong></div>
    <div class="profile-kv"><span>Email</span><strong>${escapeHtml(activeProfile.email || 'Not provided')}</strong></div>
  `;

  // Populate edit form inputs
  document.getElementById('edit-prof-name').value = activeProfile.name || '';
  document.getElementById('edit-prof-account').value = activeProfile.accountNumber || '';
  document.getElementById('edit-prof-city').value = activeProfile.city || '';
  document.getElementById('edit-prof-discom').value = activeProfile.discom || '';
  document.getElementById('edit-prof-segment').value = activeProfile.segment || '';
  document.getElementById('edit-prof-meter').value = activeProfile.meterId || '';
  document.getElementById('edit-prof-load').value = activeProfile.sanctionedLoadKw || 5;
  document.getElementById('edit-prof-household').value = activeProfile.householdSize || 3;
  document.getElementById('edit-prof-email').value = activeProfile.email || '';
  document.getElementById('edit-prof-ev').checked = Boolean(activeProfile.hasEv);
  document.getElementById('edit-prof-solar').checked = Boolean(activeProfile.hasSolar);
  document.getElementById('edit-profile-form').hidden = !state.editingProfile;

  // Populate create-profile tariff dropdown
  const newTariffSelect = document.getElementById('new-prof-tariff');
  if (newTariffSelect.options.length !== tariffPlans.length) {
    newTariffSelect.innerHTML = tariffPlans
      .map((t) => `<option value="${t.id}">${escapeHtml(t.name)} (${formatInr(t.offPeakRate, 2)}–${formatInr(t.onPeakRate, 2)}/kWh)</option>`)
      .join('');
  }

  // Stored Customer Profiles Directory
  document.getElementById('profiles-count-badge').textContent = `${customerProfiles.length} stored profile${customerProfiles.length === 1 ? '' : 's'}`;
  document.getElementById('profiles-directory').innerHTML = customerProfiles.map((p) => {
    const isActive = p.id === activeProfile.id;
    const plan = tariffPlans.find((t) => t.id === p.tariffId);
    return `
      <div class="profile-dir-card ${isActive ? 'active' : ''}">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;margin-bottom:0.35rem;">
            <strong>${escapeHtml(p.name)}</strong>
            ${isActive ? '<span class="badge badge-success">Active</span>' : `<span class="badge badge-medium">${escapeHtml(p.city)}</span>`}
          </div>
          <div class="hint">${escapeHtml(p.accountNumber)} · Meter ${escapeHtml(p.meterId)}</div>
          <div class="hint" style="margin-top:0.25rem;">${escapeHtml(p.segment)} · ${p.sanctionedLoadKw} kW</div>
          <div class="hint" style="margin-top:0.15rem;">Tariff: ${escapeHtml(plan?.name || p.tariffId)}</div>
        </div>
        <button class="btn ${isActive ? 'btn-ghost' : 'btn-primary'} btn-sm select-profile-btn" data-profile-id="${escapeHtml(p.id)}" type="button" ${isActive ? 'disabled' : ''}>
          ${isActive ? 'Currently Loaded' : 'Load Profile'}
        </button>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.select-profile-btn').forEach((btn) => {
    btn.addEventListener('click', () => selectCustomerProfile(btn.dataset.profileId));
  });

  // Tariff Information Dashboard
  const tou = analysis.summary.touBreakdown;
  document.getElementById('active-tariff-badge').textContent = `${activeTariff?.name || 'TOU'} · Est. ${formatInr(analysis.summary.monthlyCost)}/mo`;
  document.getElementById('tariff-tou-breakdown').innerHTML = `
    <div class="score-tile">
      <div class="kpi-label">Off-Peak (10 PM–7 AM)</div>
      <div class="kpi-value positive">${formatInr(tou.offPeakCost)}</div>
      <div class="hint">${tou.offPeakKwh} kWh @ ${formatInr(activeTariff?.offPeakRate || 5.5, 2)}/kWh</div>
    </div>
    <div class="score-tile">
      <div class="kpi-label">Mid-Peak (Daytime)</div>
      <div class="kpi-value">${formatInr(tou.midPeakCost)}</div>
      <div class="hint">${tou.midPeakKwh} kWh @ ${formatInr(activeTariff?.midPeakRate || 7.8, 2)}/kWh</div>
    </div>
    <div class="score-tile">
      <div class="kpi-label">On-Peak (4–9 PM)</div>
      <div class="kpi-value" style="color:var(--warn);">${formatInr(tou.onPeakCost)}</div>
      <div class="hint">${tou.onPeakKwh} kWh @ ${formatInr(activeTariff?.onPeakRate || 11.2, 2)}/kWh</div>
    </div>
    <div class="score-tile">
      <div class="kpi-label">Fixed + Total Bill</div>
      <div class="kpi-value accent">${formatInr(analysis.summary.monthlyCost)}</div>
      <div class="hint">Includes ${formatInr(tou.fixedMonthlyFee)}/mo fixed charge</div>
    </div>
  `;

  const comparison = analysis.tariffComparison || tariffPlans;
  const minBill = Math.min(...comparison.map((c) => c.estimatedMonthlyBill || Infinity));
  document.getElementById('tariff-plans-grid').innerHTML = comparison.map((plan) => {
    const isCurrent = plan.id === analysis.summary.tariffId;
    const isCheapest = plan.estimatedMonthlyBill === minBill;
    return `
      <div class="tariff-plan-card ${isCurrent ? 'active' : ''}">
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.35rem;">
            <strong>${escapeHtml(plan.name)}</strong>
            ${isCurrent ? '<span class="badge badge-success">Active Plan</span>' : (isCheapest ? '<span class="badge badge-high">Lowest Cost</span>' : '')}
          </div>
          <p class="hint" style="margin-bottom:0.55rem;">${escapeHtml(plan.description || '')}</p>
          <div class="tariff-rate-list">
            <div class="tariff-rate-row"><span>Off-Peak Rate</span><strong>${formatInr(plan.offPeakRate, 2)}/kWh</strong></div>
            <div class="tariff-rate-row"><span>Mid-Peak Rate</span><strong>${formatInr(plan.midPeakRate, 2)}/kWh</strong></div>
            <div class="tariff-rate-row"><span>On-Peak Rate</span><strong>${formatInr(plan.onPeakRate, 2)}/kWh</strong></div>
            <div class="tariff-rate-row"><span>Fixed Monthly Fee</span><strong>${formatInr(plan.fixedMonthlyFee)}/mo</strong></div>
            <div class="tariff-rate-row" style="margin-top:0.25rem;color:var(--text);"><span>Est. Bill on Your Load</span><strong>${formatInr(plan.estimatedMonthlyBill)}/mo</strong></div>
          </div>
        </div>
        <button class="btn ${isCurrent ? 'btn-ghost' : 'btn-primary'} btn-sm select-tariff-btn" data-tariff-id="${escapeHtml(plan.id)}" type="button" ${isCurrent ? 'disabled' : ''}>
          ${isCurrent ? 'Selected' : 'Switch to This Plan'}
        </button>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.select-tariff-btn').forEach((btn) => {
    btn.addEventListener('click', () => selectTariffPlan(btn.dataset.tariffId));
  });
}

async function selectCustomerProfile(profileId) {
  state.dashboard = await api('/api/profiles/select', {
    method: 'POST',
    body: JSON.stringify({ profileId })
  });
  state.selectedProviderId = state.dashboard.utility.providerId;
  state.editingProfile = false;
  state.chatHistory = [];
  renderAll();
}

async function selectTariffPlan(tariffId) {
  state.dashboard = await api('/api/tariff/select', {
    method: 'POST',
    body: JSON.stringify({ tariffId })
  });
  renderAll();
}

function renderRecommendations() {
  const { analysis, feedback } = state.dashboard;
  const list = document.getElementById('recommendations-list');
  const votes = feedback.recommendationVotes || {};
  const adopted = new Set(feedback.adoptedRecommendationIds || []);

  const filtered = analysis.recommendations.filter((r) => {
    if (state.recFilter === 'all') return true;
    return r.priority === state.recFilter || r.category === state.recFilter;
  });

  list.innerHTML = filtered.map((rec) => {
    const vote = votes[rec.id];
    const isAdopted = adopted.has(rec.id);
    return `
      <article class="rec-card">
        <div class="rec-body">
          <div class="rec-meta-row">
            <span class="badge ${rec.priority === 'High' ? 'badge-high' : 'badge-medium'}">${rec.priority} Priority</span>
            <span class="badge badge-success">${rec.category}</span>
            <span class="hint">${rec.confidence}% AI Confidence · ${rec.effort}</span>
            ${isAdopted ? '<span class="badge badge-success">Applied</span>' : ''}
          </div>
          <h3 class="rec-title">${escapeHtml(rec.title)}</h3>
          <p class="rec-insight">${escapeHtml(rec.insight)}</p>
        </div>
        <div class="rec-impact-col">
          <div class="rec-savings-box">
            <div class="rec-savings-usd">-${formatInr(rec.inrSavedMonthly)}/mo</div>
            <div class="hint">${rec.kwhSavedMonthly} kWh · ${rec.carbonSavedKg} kg CO₂e</div>
          </div>
          <div class="rec-actions">
            <button class="btn btn-primary btn-sm apply-rec-btn" data-id="${rec.id}" type="button">Apply to Simulator</button>
            <button class="vote-btn ${vote === 'helpful' ? 'voted-up' : ''}" data-rec-vote="helpful" data-id="${rec.id}" type="button">👍 Helpful</button>
            <button class="vote-btn ${vote === 'not_helpful' ? 'voted-down' : ''}" data-rec-vote="not_helpful" data-id="${rec.id}" type="button">👎</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  bindRecommendationActions(list);
}

function bindRecommendationActions(root) {
  root.querySelectorAll('.apply-rec-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const rec = state.dashboard.analysis.recommendations.find((r) => r.id === btn.dataset.id);
      if (!rec) return;
      const merged = { ...state.dashboard.simulation.controls, ...rec.simPatch };
      await runSimulation(merged);
      await api('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({ type: 'recommendation', id: rec.id, vote: 'helpful', adopted: true })
      });
      await refreshDashboard();
      switchTab('simulator');
    });
  });

  root.querySelectorAll('[data-rec-vote]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.dashboard = await api('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          type: 'recommendation',
          id: btn.dataset.id,
          vote: btn.dataset.recVote
        })
      });
      renderAll();
    });
  });
}

function syncSimulatorInputsFromState() {
  const { tariffPlans, simulation } = state.dashboard;
  const c = simulation.controls;

  const tariffSelect = document.getElementById('sim-tariff');
  tariffSelect.innerHTML = tariffPlans
    .map((p) => `<option value="${p.id}" ${p.id === c.tariffPlan ? 'selected' : ''}>${p.name} (${formatInr(p.offPeakRate, 2)}/${formatInr(p.onPeakRate, 2)})</option>`)
    .join('');

  document.getElementById('sim-thermostat').value = c.thermostatShiftC;
  document.getElementById('val-thermostat').textContent = `+${c.thermostatShiftC} °C`;

  document.getElementById('sim-offpeak').value = c.offPeakShiftPct;
  document.getElementById('val-offpeak').textContent = `${c.offPeakShiftPct}%`;

  document.getElementById('sim-baseload').value = c.baseloadReductionPct;
  document.getElementById('val-baseload').textContent = `${c.baseloadReductionPct}%`;

  document.getElementById('sim-led').checked = Boolean(c.ledApplianceUpgrade);

  document.getElementById('sim-solar').value = c.solarKw;
  document.getElementById('val-solar').textContent = `${c.solarKw} kW`;

  document.getElementById('sim-battery').value = c.batteryKwh;
  document.getElementById('val-battery').textContent = `${c.batteryKwh} kWh`;
}

function renderSimulator() {
  syncSimulatorInputsFromState();
  const { analysis, simulation } = state.dashboard;
  const m = simulation.metrics;

  document.getElementById('sim-annual-inr').textContent = `${formatInr(m.annualInrSaved)}/yr`;
  document.getElementById('sim-monthly-inr').textContent = `${formatInr(m.monthlyInrSaved)}/mo saved (${formatInr(m.simulatedMonthlyCost)} est. bill)`;

  document.getElementById('sim-annual-kwh').textContent = `${m.annualKwhSaved} kWh`;
  document.getElementById('sim-pct-saved').textContent = `${m.savingsPct}% lower consumption`;

  document.getElementById('sim-peak-cut').textContent = `-${m.peakReductionKw} kW`;
  document.getElementById('sim-carbon-cut').textContent = `${m.monthlyCarbonSavedKg} kg CO₂e/mo avoided`;

  renderAnnualForecastChart(document.getElementById('chart-forecast'), simulation.annualForecast);
  renderHourlyComparisonChart(
    document.getElementById('chart-sim-hourly'),
    simulation.simHourlyProfile,
    analysis.hourlyProfile
  );
}

let simTimer = null;
function scheduleSimulationFromInputs() {
  const controls = {
    tariffPlan: document.getElementById('sim-tariff').value,
    thermostatShiftC: Number(document.getElementById('sim-thermostat').value),
    offPeakShiftPct: Number(document.getElementById('sim-offpeak').value),
    baseloadReductionPct: Number(document.getElementById('sim-baseload').value),
    ledApplianceUpgrade: document.getElementById('sim-led').checked,
    solarKw: Number(document.getElementById('sim-solar').value),
    batteryKwh: Number(document.getElementById('sim-battery').value)
  };

  document.getElementById('val-thermostat').textContent = `+${controls.thermostatShiftC} °C`;
  document.getElementById('val-offpeak').textContent = `${controls.offPeakShiftPct}%`;
  document.getElementById('val-baseload').textContent = `${controls.baseloadReductionPct}%`;
  document.getElementById('val-solar').textContent = `${controls.solarKw} kW`;
  document.getElementById('val-battery').textContent = `${controls.batteryKwh} kWh`;

  clearTimeout(simTimer);
  simTimer = setTimeout(() => runSimulation(controls), 120);
}

async function runSimulation(controls) {
  const result = await api('/api/simulate', {
    method: 'POST',
    body: JSON.stringify(controls)
  });
  state.dashboard.analysis = result.analysis;
  state.dashboard.simulation = result.simulation;
  renderProfileBanner();
  renderKpis();
  renderOverview();
  renderCustomerAndTariff();
  renderSimulator();
}

function renderDataFlow() {
  const { utilityProviders, utility } = state.dashboard;
  if (!state.selectedProviderId) state.selectedProviderId = utility.providerId;

  const list = document.getElementById('utility-providers-list');
  list.innerHTML = utilityProviders.map((p) => `
    <button type="button" class="utility-card ${state.selectedProviderId === p.id ? 'selected' : ''}" data-provider="${p.id}">
      <strong>${escapeHtml(p.name)}</strong>
      <span>${escapeHtml(p.protocol)} · ${escapeHtml(p.intervalGranularity)}</span>
    </button>
  `).join('');

  list.querySelectorAll('.utility-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedProviderId = btn.dataset.provider;
      renderDataFlow();
    });
  });

  document.getElementById('meter-id-input').value = utility.meterId || 'SM-9482-EV';
  document.getElementById('sync-cadence-select').value = utility.cadence || '15m';
  document.getElementById('auto-sync-checkbox').checked = Boolean(utility.autoSyncEnabled);

  document.getElementById('pipeline-stages').innerHTML = (utility.pipelineStages || []).map((st, idx) => `
    <div class="pipeline-step">
      <strong>${idx + 1}. ${escapeHtml(st.step)}</strong>
      <span>${escapeHtml(st.detail)}</span>
    </div>
  `).join('');

  document.getElementById('pipeline-logs-body').innerHTML = (utility.logs || []).map((log) => `
    <tr>
      <td>${new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
      <td>${escapeHtml(log.provider)}</td>
      <td>${log.recordsIngested}</td>
      <td><span class="badge badge-success">${escapeHtml(log.status)}</span></td>
      <td>${escapeHtml(log.message)}</td>
    </tr>
  `).join('');
}

function renderFeedbackTab() {
  const { simulation, feedback } = state.dashboard;
  const m = simulation.metrics;

  document.getElementById('scorecard-grid').innerHTML = `
    <div class="score-tile">
      <div class="kpi-label">Annualized Energy Saved</div>
      <div class="kpi-value accent">${m.annualKwhSaved} kWh</div>
      <div class="hint">${m.savingsPct}% reduction · ${formatInr(m.annualInrSaved)}/yr</div>
    </div>
    <div class="score-tile">
      <div class="kpi-label">Positive Feedback Rate</div>
      <div class="kpi-value">${feedback.positiveFeedbackPct}%</div>
      <div class="hint">${feedback.totalVotes} recommendation &amp; chat votes</div>
    </div>
    <div class="score-tile">
      <div class="kpi-label">Customer Satisfaction</div>
      <div class="kpi-value">${feedback.avgCsat} / 5.0 ★</div>
      <div class="hint">${(feedback.ratings || []).length} customer reviews</div>
    </div>
    <div class="score-tile">
      <div class="kpi-label">Adopted AI Actions</div>
      <div class="kpi-value">${(feedback.adoptedRecommendationIds || []).length}</div>
      <div class="hint">Applied directly into scenarios</div>
    </div>
  `;

  document.getElementById('feedback-feed').innerHTML = (feedback.ratings || []).map((r) => `
    <div class="feedback-item">
      <div>
        <strong>${'★'.repeat(r.score)}${'☆'.repeat(5 - r.score)}</strong>
        <p class="rec-insight" style="margin-top:0.2rem;">${escapeHtml(r.comment || 'Positive rating submitted')}</p>
      </div>
      <span class="hint">${new Date(r.createdAt).toLocaleDateString()}</span>
    </div>
  `).join('');
}

function renderRagKbTab() {
  const kb = state.dashboard.ragKb || { filename: 'energy_rag_faq.xlsx', count: 0, rows: [] };
  document.getElementById('rag-kb-count-badge').textContent = `${kb.count} Q&A rows · ${kb.filename}`;
  const btn = document.getElementById('btn-open-rag-kb');
  if (btn) btn.textContent = `Excel KB (${kb.count})`;

  const tbody = document.getElementById('rag-kb-table-body');
  tbody.innerHTML = (kb.rows || []).map((row) => `
    <tr>
      <td>#${row.rowNumber || '—'}</td>
      <td><span class="badge badge-medium">${escapeHtml(row.category)}</span></td>
      <td><strong>${escapeHtml(row.question)}</strong></td>
      <td class="hint" style="color:var(--text-muted);max-width:380px;">${escapeHtml(row.answer)}</td>
      <td style="white-space:nowrap;">
        <button class="btn btn-secondary btn-sm ask-rag-row-btn" data-question="${escapeHtml(row.question)}" type="button">Ask RAG</button>
        <button class="btn btn-ghost btn-sm delete-rag-row-btn" data-id="${escapeHtml(row.id)}" type="button">Delete</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.ask-rag-row-btn').forEach((b) => {
    b.addEventListener('click', () => {
      document.getElementById('chat-drawer')?.classList.add('open');
      sendChatMessage(b.dataset.question);
    });
  });

  tbody.querySelectorAll('.delete-rag-row-btn').forEach((b) => {
    b.addEventListener('click', async () => {
      try {
        state.dashboard = await api('/api/rag/kb/delete', {
          method: 'POST',
          body: JSON.stringify({ id: b.dataset.id })
        });
        renderAll();
      } catch (err) {
        const status = document.getElementById('rag-upload-status');
        status.textContent = err.message;
        status.className = 'status-banner error';
        status.hidden = false;
      }
    });
  });
}

async function handleChatAction(action) {
  if (!action) return;
  if (action.type === 'switchTab' && action.tab) {
    switchTab(action.tab);
    return;
  }
  if (action.type === 'applySimPatch' && action.simPatch) {
    const merged = { ...state.dashboard.simulation.controls, ...action.simPatch };
    await runSimulation(merged);
    switchTab('simulator');
    return;
  }
  if (action.type === 'selectTariff' && action.tariffId) {
    await selectTariffPlan(action.tariffId);
    switchTab('customer-tariff');
    return;
  }
  if (action.type === 'syncUtility') {
    state.dashboard = await api('/api/utilities/sync', { method: 'POST', body: JSON.stringify({}) });
    renderAll();
    switchTab('data-flow');
    return;
  }
  if (action.type === 'ask' && action.prompt) {
    sendChatMessage(action.prompt);
  }
}

function renderChat() {
  const box = document.getElementById('chat-messages');
  if (state.chatHistory.length === 0 && state.dashboard) {
    const s = state.dashboard.analysis.summary;
    const prof = state.dashboard.activeProfile;
    state.chatHistory.push({
      role: 'assistant',
      text: `Hi **${prof?.name || 'there'}**! I'm connected to your **${s.daysCovered}-day** smart meter (**${prof?.meterId || 'SM'}**, **${s.monthlyKwh} kWh/mo**, **${formatInr(s.monthlyCost)}/mo** on **${s.tariffName}**).\n\nAsk me anything about your bill in ₹, tariff options, customer profile, or energy simulations!`,
      sources: [
        prof ? `Customer: ${prof.accountNumber}` : 'Customer Profile',
        `Tariff: ${s.tariffName}`,
        'Live Telemetry'
      ],
      actions: [
        { label: 'View Customer & Tariffs', type: 'switchTab', tab: 'customer-tariff' },
        { label: 'Open Scenario Simulator', type: 'switchTab', tab: 'simulator' }
      ],
      followUps: [
        'Which tariff plan is cheapest for me?',
        'How can I cut my 4–9 PM peak bill?'
      ]
    });
  }

  box.innerHTML = state.chatHistory.map((m, idx) => `
    <div class="msg ${m.role}">
      <div>${formatBoldMarkdown(m.text)}</div>
      ${m.role === 'assistant' && m.ragMatches?.length ? `
        <div class="rag-match-box">
          <span class="rag-match-label">Excel RAG Match</span>
          ${m.ragMatches.slice(0, 2).map((rm) => `<div class="rag-match-row">Row #${rm.rowNumber} · ${escapeHtml(rm.category)} (${rm.confidence}% match)</div>`).join('')}
        </div>
      ` : ''}
      ${m.role === 'assistant' && m.sources?.length ? `
        <div class="chat-sources">
          ${m.sources.map((src) => `<span class="source-tag">${escapeHtml(src)}</span>`).join('')}
        </div>
      ` : ''}
      ${m.role === 'assistant' && m.actions?.length ? `
        <div class="chat-actions">
          ${m.actions.map((act, aIdx) => `<button class="chat-action-btn" data-msg-idx="${idx}" data-act-idx="${aIdx}" type="button">${escapeHtml(act.label)}</button>`).join('')}
        </div>
      ` : ''}
      ${m.role === 'assistant' && m.followUps?.length && idx === state.chatHistory.length - 1 ? `
        <div class="chat-followups">
          ${m.followUps.map((q) => `<button class="followup-chip" data-followup="${escapeHtml(q)}" type="button">${escapeHtml(q)}</button>`).join('')}
        </div>
      ` : ''}
      ${m.role === 'assistant' && idx > 0 ? `
        <div class="msg-feedback">
          <span>Helpful?</span>
          <button class="vote-btn ${m.vote === 'helpful' ? 'voted-up' : ''}" data-chat-idx="${idx}" data-vote="helpful" type="button">👍</button>
          <button class="vote-btn ${m.vote === 'not_helpful' ? 'voted-down' : ''}" data-chat-idx="${idx}" data-vote="not_helpful" type="button">👎</button>
        </div>
      ` : ''}
    </div>
  `).join('') + (state.chatPending ? `<div class="msg assistant"><em>Retrieving profile, tariff &amp; telemetry context…</em></div>` : '');

  box.querySelectorAll('.chat-action-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const msg = state.chatHistory[Number(btn.dataset.msgIdx)];
      const action = msg?.actions?.[Number(btn.dataset.actIdx)];
      handleChatAction(action);
    });
  });

  box.querySelectorAll('.followup-chip').forEach((btn) => {
    btn.addEventListener('click', () => sendChatMessage(btn.dataset.followup));
  });

  box.querySelectorAll('[data-chat-idx]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.chatIdx);
      const vote = btn.dataset.vote;
      state.chatHistory[idx].vote = vote;
      renderChat();
      state.dashboard = await api('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({ type: 'chat', vote })
      });
      renderKpis();
      renderFeedbackTab();
    });
  });

  box.scrollTop = box.scrollHeight;
}

async function sendChatMessage(text) {
  const trimmed = text.trim();
  if (!trimmed || state.chatPending) return;
  state.chatHistory.push({ role: 'user', text: trimmed });
  state.chatPending = true;
  renderChat();

  const geminiApiKey = localStorage.getItem('wattwise_gemini_key') || '';
  try {
    const res = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: trimmed, geminiApiKey })
    });
    document.getElementById('chat-engine-label').textContent =
      res.engine === 'gemini-rag-excel'
        ? 'Gemini + Excel RAG + Live Telemetry'
        : res.engine === 'wattwise-rag-excel'
          ? 'Excel RAG Agent + Live Telemetry'
          : 'WattWise Interactive RAG (Live Telemetry)';
    state.chatHistory.push({
      role: 'assistant',
      text: res.reply,
      ragMatches: res.ragMatches || [],
      sources: res.sources || [],
      actions: res.actions || [],
      followUps: res.followUps || []
    });
  } catch (err) {
    state.chatHistory.push({ role: 'assistant', text: `Could not reach advisor: ${err.message}` });
  } finally {
    state.chatPending = false;
  }
  renderChat();
}

function renderAll() {
  renderProfileBanner();
  renderKpis();
  renderOverview();
  renderCustomerAndTariff();
  renderRecommendations();
  renderSimulator();
  renderDataFlow();
  renderRagKbTab();
  renderFeedbackTab();
  renderChat();
}

async function refreshDashboard() {
  state.dashboard = await api('/api/dashboard');
  state.selectedProviderId = state.dashboard.utility.providerId;
  renderAll();
}

async function handleFileUpload(file) {
  const banner = document.getElementById('upload-status');
  try {
    const content = await file.text();
    state.dashboard = await api('/api/upload', {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, content })
    });
    banner.textContent = `Uploaded "${file.name}" (${state.dashboard.analysis.summary.intervalCount} intervals). AI insights refreshed.`;
    banner.className = 'status-banner';
    banner.hidden = false;
    renderAll();
  } catch (err) {
    banner.textContent = err.message;
    banner.className = 'status-banner error';
    banner.hidden = false;
  }
}

async function handleRagFileUpload(file) {
  const banner = document.getElementById('rag-upload-status');
  try {
    const isXlsx = file.name.toLowerCase().endsWith('.xlsx');
    let payload;
    if (isXlsx) {
      const buf = await file.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      payload = { filename: file.name, contentBase64: btoa(binary) };
    } else {
      payload = { filename: file.name, contentText: await file.text() };
    }
    state.dashboard = await api('/api/rag/kb/upload', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    banner.textContent = `Indexed ${state.dashboard.ragKb.count} Q&A rows from "${file.name}". RAG Agent updated!`;
    banner.className = 'status-banner';
    banner.hidden = false;
    renderAll();
  } catch (err) {
    banner.textContent = err.message;
    banner.className = 'status-banner error';
    banner.hidden = false;
  }
}

function wireEvents() {
  document.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.getElementById('btn-goto-recs').addEventListener('click', () => switchTab('recommendations'));
  document.getElementById('btn-open-profile-tab').addEventListener('click', () => switchTab('customer-tariff'));
  document.getElementById('btn-open-rag-kb').addEventListener('click', () => switchTab('rag-kb'));

  // Excel RAG KB upload & manual Q&A addition
  const ragDrop = document.getElementById('rag-dropzone');
  const ragInput = document.getElementById('rag-file-input');
  ragDrop.addEventListener('click', () => ragInput.click());
  ragDrop.addEventListener('dragover', (e) => {
    e.preventDefault();
    ragDrop.classList.add('dragover');
  });
  ragDrop.addEventListener('dragleave', () => ragDrop.classList.remove('dragover'));
  ragDrop.addEventListener('drop', (e) => {
    e.preventDefault();
    ragDrop.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleRagFileUpload(e.dataTransfer.files[0]);
  });
  ragInput.addEventListener('change', () => {
    if (ragInput.files[0]) handleRagFileUpload(ragInput.files[0]);
  });

  document.getElementById('rag-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = document.getElementById('rag-add-status');
    try {
      state.dashboard = await api('/api/rag/kb/add', {
        method: 'POST',
        body: JSON.stringify({
          category: document.getElementById('rag-new-category').value.trim(),
          keywords: document.getElementById('rag-new-keywords').value.trim(),
          question: document.getElementById('rag-new-question').value.trim(),
          answer: document.getElementById('rag-new-answer').value.trim()
        })
      });
      document.getElementById('rag-new-question').value = '';
      document.getElementById('rag-new-answer').value = '';
      document.getElementById('rag-new-keywords').value = '';
      status.textContent = 'Added to Excel KB!';
      renderAll();
    } catch (err) {
      status.textContent = err.message;
    }
  });

  document.getElementById('quick-profile-select').addEventListener('change', (e) => {
    selectCustomerProfile(e.target.value);
  });

  // Edit active profile
  document.getElementById('btn-toggle-edit-profile').addEventListener('click', () => {
    state.editingProfile = !state.editingProfile;
    renderCustomerAndTariff();
  });
  document.getElementById('btn-cancel-edit-profile').addEventListener('click', () => {
    state.editingProfile = false;
    renderCustomerAndTariff();
  });
  document.getElementById('edit-profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const active = state.dashboard.activeProfile;
    state.dashboard = await api('/api/profiles/update', {
      method: 'POST',
      body: JSON.stringify({
        id: active.id,
        name: document.getElementById('edit-prof-name').value.trim(),
        accountNumber: document.getElementById('edit-prof-account').value.trim(),
        city: document.getElementById('edit-prof-city').value.trim(),
        discom: document.getElementById('edit-prof-discom').value.trim(),
        segment: document.getElementById('edit-prof-segment').value.trim(),
        meterId: document.getElementById('edit-prof-meter').value.trim(),
        sanctionedLoadKw: Number(document.getElementById('edit-prof-load').value),
        householdSize: Number(document.getElementById('edit-prof-household').value),
        email: document.getElementById('edit-prof-email').value.trim(),
        hasEv: document.getElementById('edit-prof-ev').checked,
        hasSolar: document.getElementById('edit-prof-solar').checked
      })
    });
    state.editingProfile = false;
    renderAll();
  });

  // Create new customer profile
  document.getElementById('create-profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const banner = document.getElementById('profile-create-status');
    try {
      state.dashboard = await api('/api/profiles', {
        method: 'POST',
        body: JSON.stringify({
          name: document.getElementById('new-prof-name').value.trim(),
          city: document.getElementById('new-prof-city').value.trim(),
          discom: document.getElementById('new-prof-discom').value.trim(),
          segment: document.getElementById('new-prof-segment').value,
          sanctionedLoadKw: Number(document.getElementById('new-prof-load').value),
          tariffId: document.getElementById('new-prof-tariff').value,
          meterId: document.getElementById('new-prof-meter').value.trim(),
          email: document.getElementById('new-prof-email').value.trim(),
          hasEv: document.getElementById('new-prof-ev').checked,
          hasSolar: document.getElementById('new-prof-solar').checked,
          activate: true
        })
      });
      document.getElementById('create-profile-form').reset();
      banner.textContent = `Customer profile "${state.dashboard.activeProfile.name}" saved & loaded!`;
      banner.className = 'status-banner';
      banner.hidden = false;
      state.chatHistory = [];
      renderAll();
    } catch (err) {
      banner.textContent = err.message;
      banner.className = 'status-banner error';
      banner.hidden = false;
    }
  });

  // Recommendation filters
  document.querySelectorAll('#rec-filters .pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      state.recFilter = pill.dataset.filter;
      document.querySelectorAll('#rec-filters .pill').forEach((p) => p.classList.toggle('active', p === pill));
      renderRecommendations();
    });
  });

  // Simulator controls & presets
  ['sim-tariff', 'sim-thermostat', 'sim-offpeak', 'sim-baseload', 'sim-led', 'sim-solar', 'sim-battery'].forEach((id) => {
    document.getElementById(id).addEventListener('input', scheduleSimulationFromInputs);
  });

  document.getElementById('btn-sim-reset').addEventListener('click', () => {
    runSimulation({
      thermostatShiftC: 0,
      offPeakShiftPct: 0,
      baseloadReductionPct: 0,
      ledApplianceUpgrade: false,
      solarKw: 0,
      batteryKwh: 0,
      tariffPlan: 'tou_standard'
    });
  });

  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const presets = {
        habits: { thermostatShiftC: 2, offPeakShiftPct: 35, baseloadReductionPct: 30, ledApplianceUpgrade: true, solarKw: 0, batteryKwh: 0, tariffPlan: 'tou_standard' },
        ev_tou: { thermostatShiftC: 1.5, offPeakShiftPct: 80, baseloadReductionPct: 25, ledApplianceUpgrade: true, solarKw: 0, batteryKwh: 0, tariffPlan: 'tou_ev_saver' },
        solar: { thermostatShiftC: 1.5, offPeakShiftPct: 50, baseloadReductionPct: 25, ledApplianceUpgrade: true, solarKw: 5, batteryKwh: 5, tariffPlan: 'tou_standard' }
      };
      runSimulation(presets[btn.dataset.preset]);
    });
  });

  // File upload dropzone
  const dropzone = document.getElementById('upload-dropzone');
  const fileInput = document.getElementById('file-input');
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFileUpload(fileInput.files[0]);
  });

  // Utility API connect & sync
  document.getElementById('btn-connect-utility').addEventListener('click', async () => {
    state.dashboard = await api('/api/utilities/connect', {
      method: 'POST',
      body: JSON.stringify({
        providerId: state.selectedProviderId,
        meterId: document.getElementById('meter-id-input').value.trim() || 'SM-9482-EV',
        cadence: document.getElementById('sync-cadence-select').value,
        autoSyncEnabled: document.getElementById('auto-sync-checkbox').checked
      })
    });
    renderAll();
  });

  const triggerSync = async () => {
    state.dashboard = await api('/api/utilities/sync', {
      method: 'POST',
      body: JSON.stringify({
        cadence: document.getElementById('sync-cadence-select').value,
        autoSyncEnabled: document.getElementById('auto-sync-checkbox').checked
      })
    });
    renderAll();
  };
  document.getElementById('btn-sync-now').addEventListener('click', triggerSync);
  document.getElementById('btn-trigger-pipeline').addEventListener('click', triggerSync);

  // CSAT star rating & feedback form
  document.querySelectorAll('.star-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.csatScore = Number(btn.dataset.score);
      document.querySelectorAll('.star-btn').forEach((b) => {
        b.classList.toggle('active', Number(b.dataset.score) <= state.csatScore);
      });
    });
  });

  document.getElementById('csat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const comment = document.getElementById('csat-comment').value.trim();
    state.dashboard = await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({ type: 'rating', score: state.csatScore, comment })
    });
    document.getElementById('csat-comment').value = '';
    document.getElementById('csat-status').textContent = 'Thank you! Feedback recorded.';
    renderAll();
  });

  // Chat controls & mobile drawer
  document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const val = input.value;
    input.value = '';
    sendChatMessage(val);
  });

  document.querySelectorAll('#chat-chips .chip').forEach((chip) => {
    chip.addEventListener('click', () => sendChatMessage(chip.dataset.q));
  });

  document.getElementById('btn-clear-chat').addEventListener('click', () => {
    state.chatHistory = [];
    renderChat();
  });

  const drawer = document.getElementById('chat-drawer');
  document.getElementById('btn-toggle-chat').addEventListener('click', () => drawer.classList.toggle('open'));
  document.getElementById('btn-close-chat').addEventListener('click', () => drawer.classList.remove('open'));

  // Optional Gemini API key modal
  const modal = document.getElementById('settings-modal');
  document.getElementById('btn-open-settings').addEventListener('click', () => {
    document.getElementById('gemini-key-input').value = localStorage.getItem('wattwise_gemini_key') || '';
    modal.hidden = false;
  });
  document.getElementById('btn-close-modal').addEventListener('click', () => { modal.hidden = true; });
  document.getElementById('btn-save-key').addEventListener('click', () => {
    localStorage.setItem('wattwise_gemini_key', document.getElementById('gemini-key-input').value.trim());
    modal.hidden = true;
  });
  document.getElementById('btn-clear-key').addEventListener('click', () => {
    localStorage.removeItem('wattwise_gemini_key');
    document.getElementById('gemini-key-input').value = '';
    modal.hidden = true;
  });
}

wireEvents();
refreshDashboard();
