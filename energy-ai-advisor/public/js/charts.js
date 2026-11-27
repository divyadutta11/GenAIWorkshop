/**
 * Interactive SVG visualization components for WattWise AI.
 * Zero external charting library dependencies; responsive viewBox scaling with hover tooltips in INR (₹).
 */

const END_USE_COLORS = {
  hvac: '#38bdf8',
  ev: '#a78bfa',
  baseload: '#f59e0b',
  water: '#fb7185',
  appliances: '#10b981'
};

function formatInr(value, decimals = 0) {
  const num = Number(value) || 0;
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;
}

function attachTooltip(container) {
  let tip = container.querySelector('.chart-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tooltip';
    tip.hidden = true;
    container.appendChild(tip);
  }
  return tip;
}

/**
 * Render 24-hour load profile comparing baseline vs simulated curve with TOU peak zone.
 */
export function renderHourlyComparisonChart(container, simHourlyProfile, hourlyRates) {
  if (!container || !simHourlyProfile?.length) return;
  const W = 640;
  const H = 225;
  const pad = { top: 18, right: 16, bottom: 28, left: 40 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const maxVal = Math.max(
    1.2,
    ...simHourlyProfile.map((d) => Math.max(d.baselineKwh, d.simulatedKwh))
  ) * 1.15;

  const xFor = (i) => pad.left + (i / 23) * plotW;
  const yFor = (v) => pad.top + plotH - (v / maxVal) * plotH;

  const basePath = simHourlyProfile
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(d.baselineKwh).toFixed(1)}`)
    .join(' ');
  const simPath = simHourlyProfile
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(d.simulatedKwh).toFixed(1)}`)
    .join(' ');
  const simArea = `${simPath} L ${xFor(23).toFixed(1)} ${(pad.top + plotH).toFixed(1)} L ${xFor(0).toFixed(1)} ${(pad.top + plotH).toFixed(1)} Z`;

  const peakStartX = xFor(16);
  const peakEndX = xFor(20);

  const yTicks = [0, maxVal * 0.5, maxVal].map((v) => ({
    val: v.toFixed(1),
    y: yFor(v)
  }));

  const xLabels = [0, 4, 8, 12, 16, 20, 23];

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="225" role="img" aria-label="24 hour load comparison chart">
      <defs>
        <linearGradient id="simFillGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.34" />
          <stop offset="100%" stop-color="#10b981" stop-opacity="0.02" />
        </linearGradient>
      </defs>

      <!-- On-Peak 4-9 PM Zone -->
      <rect x="${peakStartX.toFixed(1)}" y="${pad.top}" width="${(peakEndX - peakStartX).toFixed(1)}" height="${plotH}" fill="rgba(245,158,11,0.12)" />
      <text x="${((peakStartX + peakEndX) / 2).toFixed(1)}" y="${pad.top + 12}" text-anchor="middle" fill="#fbbf24" font-size="10" font-weight="600">On-Peak</text>

      <!-- Grid lines -->
      ${yTicks.map((t) => `
        <line x1="${pad.left}" y1="${t.y.toFixed(1)}" x2="${W - pad.right}" y2="${t.y.toFixed(1)}" stroke="#253346" stroke-dasharray="3 3" />
        <text x="${pad.left - 6}" y="${(t.y + 4).toFixed(1)}" text-anchor="end" fill="#93a4b8" font-size="10">${t.val}</text>
      `).join('')}

      <!-- X Labels -->
      ${xLabels.map((h) => `
        <text x="${xFor(h).toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="#93a4b8" font-size="10">${String(h).padStart(2, '0')}h</text>
      `).join('')}

      <path d="${simArea}" fill="url(#simFillGrad)" />
      <path d="${basePath}" fill="none" stroke="#38bdf8" stroke-width="2.4" stroke-dasharray="5 4" />
      <path d="${simPath}" fill="none" stroke="#10b981" stroke-width="2.8" />

      <!-- Interactive hit targets -->
      ${simHourlyProfile.map((d, i) => `
        <circle class="hover-pt" data-idx="${i}" cx="${xFor(i).toFixed(1)}" cy="${yFor(d.simulatedKwh).toFixed(1)}" r="10" fill="transparent" style="cursor:pointer" />
      `).join('')}
    </svg>
  `;

  const tip = attachTooltip(container);
  container.querySelectorAll('.hover-pt').forEach((pt) => {
    pt.addEventListener('mouseenter', (e) => {
      const idx = Number(pt.dataset.idx);
      const d = simHourlyProfile[idx];
      const rateInfo = hourlyRates?.[idx];
      tip.innerHTML = `<strong>${d.label}</strong> · Base: ${d.baselineKwh} kWh<br/>Sim: ${d.simulatedKwh} kWh ${rateInfo ? `(${formatInr(rateInfo.rate, 2)}/kWh)` : ''}`;
      tip.hidden = false;
      const rect = container.getBoundingClientRect();
      tip.style.left = `${Math.min(rect.width - 175, Math.max(8, e.clientX - rect.left + 10))}px`;
      tip.style.top = `${Math.max(8, e.clientY - rect.top - 42)}px`;
    });
    pt.addEventListener('mouseleave', () => {
      tip.hidden = true;
    });
  });
}

/**
 * Render End-Use Disaggregation SVG Donut + List.
 */
export function renderEndUseDonut(donutContainer, listContainer, breakdown) {
  if (!donutContainer || !listContainer || !breakdown?.length) return;
  const size = 152;
  const cx = size / 2;
  const cy = size / 2;
  const r = 52;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  const segments = breakdown.map((item) => {
    const dash = (item.pct / 100) * circ;
    const color = END_USE_COLORS[item.id] || '#64748b';
    const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="18" stroke-dasharray="${dash.toFixed(2)} ${(circ - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})" />`;
    offset += dash;
    return seg;
  });

  const totalKwh = Math.round(breakdown.reduce((s, b) => s + b.monthlyKwh, 0));

  donutContainer.innerHTML = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="End use breakdown donut chart">
      ${segments.join('')}
      <text x="${cx}" y="${cy - 3}" text-anchor="middle" fill="#eaf1f8" font-size="16" font-weight="750">${totalKwh}</text>
      <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="#93a4b8" font-size="10">kWh / mo</text>
    </svg>
  `;

  listContainer.innerHTML = breakdown.map((item) => {
    const color = END_USE_COLORS[item.id] || '#64748b';
    return `
      <div class="enduse-row">
        <div class="enduse-head">
          <span>${item.name}</span>
          <strong>${item.pct}% · ${item.monthlyKwh} kWh</strong>
        </div>
        <div class="enduse-bar-bg">
          <div class="enduse-bar-fill" style="width:${item.pct}%;background:${color};"></div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Render 30-day daily consumption bars with anomaly highlights.
 */
export function renderDailyConsumptionChart(container, dailySeries, anomalyDays) {
  if (!container || !dailySeries?.length) return;
  const W = 900;
  const H = 205;
  const pad = { top: 16, right: 16, bottom: 26, left: 42 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const anomalySet = new Set((anomalyDays || []).map((a) => a.date));
  const maxKwh = Math.max(10, ...dailySeries.map((d) => d.kwh)) * 1.15;
  const barSlot = plotW / dailySeries.length;
  const barW = Math.max(4, barSlot * 0.68);

  const meanKwh = dailySeries.reduce((s, d) => s + d.kwh, 0) / dailySeries.length;
  const meanY = pad.top + plotH - (meanKwh / maxKwh) * plotH;

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="205" role="img" aria-label="Daily consumption bar chart">
      <line x1="${pad.left}" y1="${meanY.toFixed(1)}" x2="${W - pad.right}" y2="${meanY.toFixed(1)}" stroke="#93a4b8" stroke-dasharray="4 4" stroke-opacity="0.55" />
      <text x="${W - pad.right}" y="${(meanY - 5).toFixed(1)}" text-anchor="end" fill="#93a4b8" font-size="10">Mean ${meanKwh.toFixed(1)} kWh/d</text>

      ${dailySeries.map((d, i) => {
        const h = (d.kwh / maxKwh) * plotH;
        const x = pad.left + i * barSlot + (barSlot - barW) / 2;
        const y = pad.top + plotH - h;
        const isAnom = anomalySet.has(d.date);
        const fill = isAnom ? '#f59e0b' : '#38bdf8';
        const showLabel = i === 0 || i === dailySeries.length - 1 || i % Math.max(1, Math.floor(dailySeries.length / 6)) === 0;
        return `
          <rect class="day-bar" data-idx="${i}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${fill}" fill-opacity="0.88" style="cursor:pointer" />
          ${showLabel ? `<text x="${(x + barW / 2).toFixed(1)}" y="${H - 7}" text-anchor="middle" fill="#93a4b8" font-size="10">${d.date.slice(5)}</text>` : ''}
        `;
      }).join('')}
    </svg>
  `;

  const tip = attachTooltip(container);
  container.querySelectorAll('.day-bar').forEach((bar) => {
    bar.addEventListener('mouseenter', (e) => {
      const d = dailySeries[Number(bar.dataset.idx)];
      const tag = anomalySet.has(d.date) ? ' · High Anomaly' : '';
      tip.innerHTML = `<strong>${d.date}${tag}</strong><br/>${d.kwh} kWh · ${formatInr(d.cost, 0)} · Peak ${d.peakKw} kW`;
      tip.hidden = false;
      const rect = container.getBoundingClientRect();
      tip.style.left = `${Math.min(rect.width - 190, Math.max(8, e.clientX - rect.left + 10))}px`;
      tip.style.top = `${Math.max(8, e.clientY - rect.top - 42)}px`;
    });
    bar.addEventListener('mouseleave', () => {
      tip.hidden = true;
    });
  });
}

/**
 * Render 12-Month Scenario Impact Forecast comparing Baseline vs Simulated Cost (₹).
 */
export function renderAnnualForecastChart(container, annualForecast) {
  if (!container || !annualForecast?.length) return;
  const W = 680;
  const H = 225;
  const pad = { top: 16, right: 16, bottom: 28, left: 56 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const maxInr = Math.max(500, ...annualForecast.map((m) => Math.max(m.baselineInr, m.simulatedInr))) * 1.15;
  const groupW = plotW / annualForecast.length;
  const barW = Math.max(6, groupW * 0.34);

  const yTicks = [0, maxInr * 0.5, maxInr];

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="225" role="img" aria-label="12 month scenario impact forecast">
      ${yTicks.map((val) => {
        const y = pad.top + plotH - (val / maxInr) * plotH;
        return `
          <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${W - pad.right}" y2="${y.toFixed(1)}" stroke="#253346" stroke-dasharray="3 3" />
          <text x="${pad.left - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#93a4b8" font-size="10">${formatInr(Math.round(val))}</text>
        `;
      }).join('')}

      ${annualForecast.map((m, i) => {
        const baseH = (m.baselineInr / maxInr) * plotH;
        const simH = (m.simulatedInr / maxInr) * plotH;
        const gx = pad.left + i * groupW + (groupW - barW * 2 - 3) / 2;
        return `
          <rect class="fc-bar" data-idx="${i}" x="${gx.toFixed(1)}" y="${(pad.top + plotH - baseH).toFixed(1)}" width="${barW.toFixed(1)}" height="${baseH.toFixed(1)}" rx="3" fill="#38bdf8" fill-opacity="0.78" style="cursor:pointer" />
          <rect class="fc-bar" data-idx="${i}" x="${(gx + barW + 3).toFixed(1)}" y="${(pad.top + plotH - simH).toFixed(1)}" width="${barW.toFixed(1)}" height="${simH.toFixed(1)}" rx="3" fill="#10b981" style="cursor:pointer" />
          <text x="${(gx + barW + 1.5).toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="#93a4b8" font-size="10">${m.month}</text>
        `;
      }).join('')}
    </svg>
  `;

  const tip = attachTooltip(container);
  container.querySelectorAll('.fc-bar').forEach((bar) => {
    bar.addEventListener('mouseenter', (e) => {
      const m = annualForecast[Number(bar.dataset.idx)];
      const diff = Math.max(0, m.baselineInr - m.simulatedInr);
      tip.innerHTML = `<strong>${m.month}</strong> · Base ${formatInr(m.baselineInr)} → Sim ${formatInr(m.simulatedInr)}<br/>Saves ${formatInr(diff)}/mo (Cumul: ${formatInr(m.cumulativeSavingsInr)})`;
      tip.hidden = false;
      const rect = container.getBoundingClientRect();
      tip.style.left = `${Math.min(rect.width - 210, Math.max(8, e.clientX - rect.left + 10))}px`;
      tip.style.top = `${Math.max(8, e.clientY - rect.top - 42)}px`;
    });
    bar.addEventListener('mouseleave', () => {
      tip.hidden = true;
    });
  });
}
