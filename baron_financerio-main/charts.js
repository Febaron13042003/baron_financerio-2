// ==========================================================================
// Baron Financeiro — gráficos SVG leves (sem dependências)
// ==========================================================================

const Charts = {
  palette: [
    "#356854","#0ea5e9","#f59e0b","#dc2626","#7c3aed",
    "#10b981","#f97316","#db2777","#0891b2","#84cc16",
    "#6366f1","#a16207","#14b8a6","#e11d48","#4f46e5"
  ],

  // Linha: array {label, value}
  drawLine(container, points, opts = {}) {
    container.innerHTML = "";
    if (!points.length) {
      container.innerHTML = '<div class="chart-empty">Sem dados para exibir</div>';
      return;
    }
    const w = container.clientWidth || 600;
    const h = 260;
    const pad = { t: 16, r: 16, b: 30, l: 50 };
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;

    const values = points.map(p => p.value);
    const maxV = Math.max(...values, 0);
    const minV = Math.min(...values, 0);
    const range = (maxV - minV) || 1;

    const xStep = innerW / Math.max(1, points.length - 1);
    const yFor = v => pad.t + innerH - ((v - minV) / range) * innerH;

    let path = "";
    let area = "";
    points.forEach((p, i) => {
      const x = pad.l + i * xStep;
      const y = yFor(p.value);
      path += (i === 0 ? "M" : "L") + x + "," + y + " ";
      if (i === 0) area = "M" + x + "," + yFor(0) + " L" + x + "," + y + " ";
      else area += "L" + x + "," + y + " ";
    });
    area += "L" + (pad.l + (points.length - 1) * xStep) + "," + yFor(0) + " Z";

    // gridlines Y (4 linhas)
    const gridCount = 4;
    let grid = "";
    let yLabels = "";
    for (let i = 0; i <= gridCount; i++) {
      const v = minV + (range * i) / gridCount;
      const y = yFor(v);
      grid += `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="#e5e7eb" stroke-dasharray="2,3"/>`;
      yLabels += `<text x="${pad.l - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#9ca3af">${fmtShort(v)}</text>`;
    }

    // xLabels (só alguns)
    const step = Math.max(1, Math.ceil(points.length / 8));
    let xLabels = "";
    points.forEach((p, i) => {
      if (i % step === 0 || i === points.length - 1) {
        const x = pad.l + i * xStep;
        xLabels += `<text x="${x}" y="${h - 8}" text-anchor="middle" font-size="10" fill="#6b7280">${p.label}</text>`;
      }
    });

    // dots
    let dots = "";
    points.forEach((p, i) => {
      const x = pad.l + i * xStep;
      const y = yFor(p.value);
      dots += `<circle cx="${x}" cy="${y}" r="3" fill="${opts.color || "#356854"}"><title>${p.label}: ${fmtMoney(p.value)}</title></circle>`;
    });

    const color = opts.color || "#356854";
    container.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px">
        ${grid}
        <path d="${area}" fill="${color}" fill-opacity="0.08"/>
        <path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>
        ${dots}
        ${yLabels}
        ${xLabels}
      </svg>
    `;
  },

  // Barras agrupadas (entradas vs saídas)
  drawBars(container, groups) {
    container.innerHTML = "";
    if (!groups.length) {
      container.innerHTML = '<div class="chart-empty">Sem dados para exibir</div>';
      return;
    }
    const w = container.clientWidth || 600;
    const h = 280;
    const pad = { t: 16, r: 16, b: 44, l: 50 };
    const innerW = w - pad.l - pad.r;
    const innerH = h - pad.t - pad.b;

    const maxV = Math.max(...groups.flatMap(g => [g.entrada, g.saida]), 1);
    const groupW = innerW / groups.length;
    const barW = Math.min(18, (groupW - 8) / 2);

    const gridCount = 4;
    let grid = "";
    let yLabels = "";
    for (let i = 0; i <= gridCount; i++) {
      const v = (maxV * i) / gridCount;
      const y = pad.t + innerH - (v / maxV) * innerH;
      grid += `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="#e5e7eb" stroke-dasharray="2,3"/>`;
      yLabels += `<text x="${pad.l - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="#9ca3af">${fmtShort(v)}</text>`;
    }

    let bars = "";
    let xLabels = "";
    groups.forEach((g, i) => {
      const cx = pad.l + i * groupW + groupW / 2;
      const xIn = cx - barW - 2;
      const xOut = cx + 2;

      const hIn = (g.entrada / maxV) * innerH;
      const hOut = (g.saida / maxV) * innerH;
      const yIn = pad.t + innerH - hIn;
      const yOut = pad.t + innerH - hOut;

      bars += `<rect x="${xIn}" y="${yIn}" width="${barW}" height="${hIn}" fill="#16a34a" rx="2"><title>${g.label} — Entradas: ${fmtMoney(g.entrada)}</title></rect>`;
      bars += `<rect x="${xOut}" y="${yOut}" width="${barW}" height="${hOut}" fill="#dc2626" rx="2"><title>${g.label} — Saídas: ${fmtMoney(g.saida)}</title></rect>`;

      xLabels += `<text x="${cx}" y="${h - 22}" text-anchor="middle" font-size="10" fill="#6b7280">${g.label}</text>`;
    });

    container.innerHTML = `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px">
        ${grid}
        ${bars}
        ${yLabels}
        ${xLabels}
      </svg>
      <div class="legend">
        <span><span class="legend-dot" style="background:#16a34a"></span>Entradas</span>
        <span><span class="legend-dot" style="background:#dc2626"></span>Saídas</span>
      </div>
    `;
  },

  // Donut/pizza: array {label, value}
  drawDonut(container, items) {
    container.innerHTML = "";
    const total = items.reduce((s, i) => s + i.value, 0);
    if (!total) {
      container.innerHTML = '<div class="chart-empty">Sem gastos no período</div>';
      return;
    }

    const size = 220;
    const r = 90;
    const cr = 55;
    const cx = size / 2;
    const cy = size / 2;
    let acc = 0;

    const slices = items.slice(0, 12).map((it, i) => {
      const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
      acc += it.value;
      const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
      const x1 = cx + r * Math.cos(start);
      const y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      const large = end - start > Math.PI ? 1 : 0;
      const color = Charts.palette[i % Charts.palette.length];
      const d = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
      return { d, color, item: it };
    });

    const pct = items.slice(0, 12).map((it, i) => {
      const p = ((it.value / total) * 100).toFixed(1);
      return `<div class="list-row" style="padding:4px 0;border:0;">
        <div class="list-main"><span class="legend-dot" style="background:${Charts.palette[i % Charts.palette.length]}"></span><span class="list-title">${escapeHtml(it.label)}</span></div>
        <div class="list-right"><span class="amount-neutral">${fmtMoney(it.value)}</span> <span class="muted small">(${p}%)</span></div>
      </div>`;
    }).join("");

    container.innerHTML = `
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
        <svg viewBox="0 0 ${size} ${size}" style="width:220px;height:220px;flex-shrink:0;">
          ${slices.map(s => `<path d="${s.d}" fill="${s.color}"><title>${escapeHtml(s.item.label)}: ${fmtMoney(s.item.value)}</title></path>`).join("")}
          <circle cx="${cx}" cy="${cy}" r="${cr}" fill="#fff"/>
          <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="11" fill="#6b7280">Total</text>
          <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="14" font-weight="700" fill="#1f2937">${fmtShort(total)}</text>
        </svg>
        <div style="flex:1;min-width:200px;">${pct}</div>
      </div>
    `;
  }
};

// ----- utils que charts usa -----
function fmtMoney(v) {
  const n = Number(v) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtShort(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 1000) return (n / 1000).toFixed(abs >= 10000 ? 0 : 1) + "k";
  return n.toFixed(0);
}
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
