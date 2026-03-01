// src/utils/aiInsights.js
// Local AI-like spending insights — no external API needed.
// Analyzes transaction history to generate actionable Thai-language insights.

import { toISODate } from "./format";

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonthKey(mk) {
  const [y, m] = mk.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

function satangToBaht(s) {
  return Math.round(Number(s || 0)) / 100;
}

function pctChange(prev, curr) {
  if (!prev || prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

/**
 * Generate spending insights from transaction history.
 * @param {Array} transactions
 * @param {Object} categories - { expense: [...], income: [...] }
 * @param {Object} opts - { currentMonth? }
 * @returns {Array<{ type, icon, title, body, severity }>}
 */
export function generateInsights(transactions, categories, opts = {}) {
  const txs = Array.isArray(transactions) ? transactions : [];
  if (txs.length < 3) return [];

  const now = new Date();
  const cm = opts.currentMonth || monthKey(now);
  const pm = prevMonthKey(cm);

  const catMap = new Map();
  for (const c of [...(categories?.expense || []), ...(categories?.income || [])]) {
    catMap.set(c.id, c);
  }

  // Group expenses by month → category
  const monthCatSpend = new Map(); // "YYYY-MM" → Map(catId → satang)
  const monthTotal = new Map(); // "YYYY-MM" → satang
  const monthIncome = new Map();

  for (const t of txs) {
    if (!t || t.isTransfer || t.isSplitParent) continue;
    const mk = String(t.date || "").slice(0, 7);
    if (!mk) continue;

    if (String(t.type || "").toLowerCase() === "expense") {
      const amt = Math.abs(Number(t.amount || 0));
      monthTotal.set(mk, (monthTotal.get(mk) || 0) + amt);
      if (!monthCatSpend.has(mk)) monthCatSpend.set(mk, new Map());
      const catSpend = monthCatSpend.get(mk);
      const cid = String(t.category || "other");
      catSpend.set(cid, (catSpend.get(cid) || 0) + amt);
    }

    if (String(t.type || "").toLowerCase() === "income") {
      const amt = Math.abs(Number(t.amount || 0));
      monthIncome.set(mk, (monthIncome.get(mk) || 0) + amt);
    }
  }

  const insights = [];

  // --- 1. Monthly spending trend ---
  const currTotal = monthTotal.get(cm) || 0;
  const prevTotal = monthTotal.get(pm) || 0;
  if (prevTotal > 0 && currTotal > 0) {
    const pct = pctChange(prevTotal, currTotal);
    if (pct > 15) {
      insights.push({
        type: "spending_up",
        icon: "📈",
        title: "ใช้จ่ายเพิ่มขึ้น",
        body: `เดือนนี้ใช้จ่ายเพิ่มขึ้น ${pct}% จากเดือนที่แล้ว (฿${satangToBaht(currTotal).toLocaleString()} vs ฿${satangToBaht(prevTotal).toLocaleString()})`,
        severity: pct > 30 ? "warning" : "info",
      });
    } else if (pct < -10) {
      insights.push({
        type: "spending_down",
        icon: "📉",
        title: "ใช้จ่ายลดลง!",
        body: `เดือนนี้ใช้จ่ายลดลง ${Math.abs(pct)}% จากเดือนที่แล้ว — เยี่ยมมาก!`,
        severity: "success",
      });
    }
  }

  // --- 2. Top category change ---
  const currCats = monthCatSpend.get(cm);
  const prevCats = monthCatSpend.get(pm);
  if (currCats && prevCats) {
    let maxIncrease = { catId: "", pct: 0, curr: 0, prev: 0 };
    for (const [catId, currAmt] of currCats) {
      const prevAmt = prevCats.get(catId) || 0;
      if (prevAmt < 5000) continue; // ignore tiny categories (50 baht)
      const pct = pctChange(prevAmt, currAmt);
      if (pct > maxIncrease.pct) {
        maxIncrease = { catId, pct, curr: currAmt, prev: prevAmt };
      }
    }

    if (maxIncrease.pct > 20 && maxIncrease.catId) {
      const cat = catMap.get(maxIncrease.catId);
      const name = cat?.name || maxIncrease.catId;
      const icon = cat?.icon || "🏷️";
      insights.push({
        type: "category_spike",
        icon,
        title: `${name} เพิ่มขึ้น ${maxIncrease.pct}%`,
        body: `฿${satangToBaht(maxIncrease.curr).toLocaleString()} เดือนนี้ vs ฿${satangToBaht(maxIncrease.prev).toLocaleString()} เดือนที่แล้ว`,
        severity: maxIncrease.pct > 50 ? "warning" : "info",
      });
    }
  }

  // --- 3. Savings rate ---
  const currInc = monthIncome.get(cm) || 0;
  if (currInc > 0 && currTotal > 0) {
    const savingsRate = Math.round(((currInc - currTotal) / currInc) * 100);
    if (savingsRate < 10 && savingsRate >= 0) {
      insights.push({
        type: "low_savings",
        icon: "⚠️",
        title: "อัตราเก็บออมต่ำ",
        body: `เก็บออมได้แค่ ${savingsRate}% ของรายได้เดือนนี้ — ลองลดค่าใช้จ่ายที่ไม่จำเป็น`,
        severity: "warning",
      });
    } else if (savingsRate >= 30) {
      insights.push({
        type: "good_savings",
        icon: "🎯",
        title: "เก็บออมได้ดี!",
        body: `เก็บออมได้ ${savingsRate}% ของรายได้ — ทำต่อไป!`,
        severity: "success",
      });
    }
  }

  // --- 4. Anomaly detection: unusually large transaction ---
  const recentExpenses = txs
    .filter((t) => t && !t.isTransfer && !t.isSplitParent && String(t.type || "").toLowerCase() === "expense")
    .slice(-100);

  if (recentExpenses.length > 10) {
    const amounts = recentExpenses.map((t) => Math.abs(Number(t.amount || 0)));
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const stdDev = Math.sqrt(amounts.reduce((a, b) => a + (b - avg) ** 2, 0) / amounts.length);
    const threshold = avg + 2.5 * stdDev;

    // Find recent anomalies (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = toISODate(weekAgo);

    for (const t of recentExpenses) {
      const amt = Math.abs(Number(t.amount || 0));
      if (amt > threshold && String(t.date || "") >= weekAgoStr) {
        const cat = catMap.get(t.category);
        insights.push({
          type: "anomaly",
          icon: "🔍",
          title: "รายการผิดปกติ",
          body: `฿${satangToBaht(amt).toLocaleString()} ที่ ${cat?.name || "อื่นๆ"} — สูงกว่าปกติมาก (เฉลี่ย ฿${satangToBaht(avg).toLocaleString()})`,
          severity: "warning",
        });
        break; // Only show 1 anomaly
      }
    }
  }

  // --- 5. Budget suggestion ---
  const monthKeys = Array.from(monthTotal.keys()).sort().slice(-3);
  if (monthKeys.length >= 2) {
    const avgSpend = monthKeys.reduce((s, mk) => s + (monthTotal.get(mk) || 0), 0) / monthKeys.length;
    const suggestedBudget = Math.ceil(satangToBaht(avgSpend) / 100) * 100; // round up to nearest 100
    insights.push({
      type: "budget_suggestion",
      icon: "💡",
      title: "แนะนำงบรายเดือน",
      body: `จากค่าเฉลี่ย ${monthKeys.length} เดือนล่าสุด แนะนำตั้งงบ ฿${suggestedBudget.toLocaleString()} /เดือน`,
      severity: "info",
    });
  }

  return insights.slice(0, 5); // Max 5 insights
}
