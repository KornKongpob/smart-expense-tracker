import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CreditCard,
  PiggyBank,
  PlusCircle,
  Target,
  Trash2,
  Wallet,
} from "lucide-react";

import AccountSheetPicker from "../AccountSheetPicker.jsx";
import { useExpenseNavigation } from "../navigation.js";
import { useExpenseApp } from "../AppProvider.jsx";
import { EmptyPanel, MetricCard, ScreenShell, Sheet, StatusPill } from "../ui.jsx";
import {
  DEBT_STRATEGY_OPTIONS,
  INCOME_MODE_OPTIONS,
  LOOKBACK_OPTIONS,
  SAVINGS_MODE_OPTIONS,
} from "../budgetPlanningState.js";
import { getGoalProgressPercent, getGoalRemainingSatang, getNextDebtDueDateISO } from "../plannerState.js";
import { formatCurrency, formatDateLong } from "../../../utils/format.js";
import { parseMoneyToSatang } from "../../../utils/money.js";

const GOAL_STATUS_OPTIONS = [
  { id: "active", label: "กำลังติดตาม" },
  { id: "paused", label: "พักไว้" },
  { id: "completed", label: "สำเร็จแล้ว" },
];

const DEBT_STATUS_OPTIONS = [
  { id: "active", label: "กำลังจ่าย" },
  { id: "paused", label: "พักไว้" },
  { id: "paid_off", label: "ปิดหนี้แล้ว" },
];

const BUDGET_FILTER_OPTIONS = [
  { id: "attention", label: "ควรดูต่อ" },
  { id: "active", label: "มีการใช้งาน" },
  { id: "all", label: "ทั้งหมด" },
];

function toMoneyInput(satang, allowEmpty = true) {
  const amount = Number(satang || 0) / 100;
  if (!Number.isFinite(amount)) return allowEmpty ? "" : "0.00";
  if (!amount && allowEmpty) return "";
  return amount.toFixed(2);
}

function toPercentInput(bps) {
  const amount = Number(bps || 0) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function parsePercentToBps(value) {
  const number = Number(String(value || "").replace(/,/g, "").trim());
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(10000, Math.round(number * 100)));
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatPlannerMonthLabel(monthKey) {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return String(monthKey || "").trim();
  const year = Number(match[1]);
  const monthIndex = Math.max(0, Math.min(11, Number(match[2]) - 1));
  return new Intl.DateTimeFormat("th-TH", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthIndex, 1));
}

function createPlanningDraft(config = null) {
  return {
    incomeMode: config?.incomeMode || "rolling_average",
    fixedIncome: toMoneyInput(config?.fixedIncomeSatang),
    incomeLookbackMonths: String(config?.incomeLookbackMonths || 3),
    savingsMode: config?.savingsMode || "amount",
    savingsAmount: toMoneyInput(config?.savingsAmountSatang),
    savingsPercent: toPercentInput(config?.savingsPercentBps),
    debtStrategyMode: config?.debtStrategyMode || "paydown",
  };
}

function createGoalDraft(goal = null) {
  return {
    id: goal?.id || null,
    name: goal?.name || "",
    targetAmount: toMoneyInput(goal?.target_amount_satang, false),
    currentAmount: toMoneyInput(goal?.current_amount_satang),
    monthlyContribution: toMoneyInput(goal?.monthly_contribution_satang),
    targetDate: goal?.target_date || "",
    linkedAccountId: goal?.linked_account_id ? String(goal.linked_account_id) : "",
    status: goal?.status || "active",
  };
}

function createDebtDraft(plan = null) {
  return {
    id: plan?.id || null,
    accountId: plan?.account_id ? String(plan.account_id) : "",
    currentBalance: toMoneyInput(plan?.current_balance_satang, false),
    minimumPayment: toMoneyInput(plan?.minimum_payment_satang),
    targetPayment: toMoneyInput(plan?.target_payment_satang, false),
    aprPercent: toPercentInput(plan?.apr_bps),
    dueDay: plan?.due_day ? String(plan.due_day) : "",
    payoffTargetDate: plan?.payoff_target_date || "",
    status: plan?.status || "active",
    note: plan?.note || "",
  };
}

function getGoalStatusLabel(status) {
  return GOAL_STATUS_OPTIONS.find((option) => option.id === status)?.label || "กำลังติดตาม";
}

function getDebtStatusLabel(status) {
  return DEBT_STATUS_OPTIONS.find((option) => option.id === status)?.label || "กำลังจ่าย";
}

function getDebtStrategyLabel(mode) {
  return mode === "survival" ? "ประคองกระแสเงินสด" : "เน้นปิดหนี้";
}

function getIncomeModeLabel(mode) {
  return mode === "fixed" ? "รายได้คงที่" : "ค่าเฉลี่ยย้อนหลัง";
}

function getSavingsModeLabel(mode) {
  return mode === "percent" ? "เปอร์เซ็นต์" : "จำนวนเงิน";
}

function getDecisionStatusLabel(status) {
  if (status === "accepted") return "รับแล้ว";
  if (status === "dismissed") return "คงของเดิม";
  return "รอตัดสินใจ";
}

function getDecisionStatusTone(status) {
  if (status === "accepted") return "success";
  if (status === "dismissed") return "default";
  return "warning";
}

function formatDeltaCurrency(deltaSatang) {
  const amount = Math.abs(Number(deltaSatang || 0));
  if (!amount) return "0.00";
  return `${Number(deltaSatang || 0) > 0 ? "+" : "-"}${formatCurrency(amount)}`;
}

function getScenarioIntentCopy(scenarioId, debtStrategyMode) {
  if (scenarioId === "tight") {
    return "ลดงบหมวดยืดหยุ่นลงเพื่อรักษารายจ่ายจำเป็นและเคลียร์ shortfall เร็วขึ้น";
  }
  if (scenarioId === "comfort") {
    return debtStrategyMode === "paydown"
      ? "เปิดพื้นที่ใช้จ่ายได้สบายขึ้นโดยยังเหลือเงินสำหรับโปะหนี้เพิ่ม"
      : "เปิดพื้นที่ใช้จ่ายได้สบายขึ้นและยังมี buffer หลังกันค่าใช้จ่ายหลัก";
  }
  return "ทางเลือกสมดุลระหว่างงบรายวัน ความเสี่ยง และพื้นที่ท้ายเดือน";
}

export default function PlannerScreen() {
  const { navigateToView } = useExpenseNavigation();
  const {
    accounts,
    categories,
    financialGoals,
    debtPlans,
    planningConfig,
    budgetPlanSnapshot,
    plannerMonthlyPlan,
    plannerActiveScenarioKey,
    plannerDecisionSummary,
    savePlanningConfig,
    saveCategoryBudgetBehavior,
    saveBudgetRow,
    deleteBudgetRow,
    applyPlannerPlan,
    acceptPlannerRecommendation,
    dismissPlannerRecommendation,
    lockPlannerRecommendation,
    saveFinancialGoal,
    deleteFinancialGoal,
    saveDebtPlan,
    deleteDebtPlan,
    saving,
  } = useExpenseApp();

  const debtAccounts = accounts.filter((account) => account.type === "credit" || account.type === "loan");
  const accountNameMap = new Map(accounts.map((account) => [Number(account.id), account.name]));
  const childCategoriesByRoot = useMemo(() => {
    const map = new Map();
    for (const category of Array.isArray(categories?.expense) ? categories.expense : []) {
      if (!category?.parentId || category?.isHidden === true) continue;
      const current = map.get(category.parentId) || [];
      current.push(category);
      map.set(category.parentId, current);
    }
    for (const children of map.values()) {
      children.sort((left, right) => String(left?.name || "").localeCompare(String(right?.name || ""), "th"));
    }
    return map;
  }, [categories]);

  const [planningDraft, setPlanningDraft] = useState(createPlanningDraft(planningConfig));
  const [rootBudgetInputs, setRootBudgetInputs] = useState({});
  const [childBudgetInputs, setChildBudgetInputs] = useState({});
  const [scenarioKey, setScenarioKey] = useState(plannerActiveScenarioKey || "baseline");
  const [budgetFilter, setBudgetFilter] = useState("active");
  const [goalEditorOpen, setGoalEditorOpen] = useState(false);
  const [goalDeleteConfirmOpen, setGoalDeleteConfirmOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState(createGoalDraft());
  const [debtEditorOpen, setDebtEditorOpen] = useState(false);
  const [debtDeleteConfirmOpen, setDebtDeleteConfirmOpen] = useState(false);
  const [debtDraft, setDebtDraft] = useState(createDebtDraft());
  const scenarioSelectionRef = useRef(false);

  useEffect(() => {
    setPlanningDraft(createPlanningDraft(planningConfig));
  }, [planningConfig]);

  const plannerScenarios = useMemo(
    () => (Array.isArray(plannerMonthlyPlan?.scenarios) ? plannerMonthlyPlan.scenarios : []),
    [plannerMonthlyPlan],
  );
  const baselineScenario = plannerScenarios.find((scenario) => scenario.id === "baseline") || plannerScenarios[0] || null;
  const activeScenario = plannerScenarios.find((scenario) => scenario.id === scenarioKey) || plannerScenarios[0] || null;
  const activeScenarioItems = useMemo(
    () => (Array.isArray(activeScenario?.items) ? activeScenario.items : []),
    [activeScenario],
  );
  const activeScenarioLabel = activeScenario?.label || "Baseline";
  const activeRecommendationMap = useMemo(
    () => new Map(activeScenarioItems.map((item) => [item.categoryId, item])),
    [activeScenarioItems],
  );
  const activeRecommendationQueue = useMemo(
    () =>
      activeScenarioItems
        .filter((item) => item.needsAttention || item.lockedByUser || item.decisionStatus !== "dismissed")
        .sort((left, right) => {
          const attentionDelta = Number(right.needsAttention === true) - Number(left.needsAttention === true);
          if (attentionDelta !== 0) return attentionDelta;
          const lockDelta = Number(right.lockedByUser === true) - Number(left.lockedByUser === true);
          if (lockDelta !== 0) return lockDelta;
          return Math.abs(Number(right.deltaSatang || 0)) - Math.abs(Number(left.deltaSatang || 0));
        }),
    [activeScenarioItems],
  );

  useEffect(() => {
    if (!plannerScenarios.length) return;
    const hasSelectedScenario = plannerScenarios.some((scenario) => scenario.id === scenarioKey);
    if (!hasSelectedScenario) {
      setScenarioKey(plannerActiveScenarioKey || plannerScenarios[0]?.id || "baseline");
      return;
    }
    if (!scenarioSelectionRef.current && plannerActiveScenarioKey && scenarioKey !== plannerActiveScenarioKey) {
      setScenarioKey(plannerActiveScenarioKey);
    }
  }, [plannerActiveScenarioKey, plannerScenarios, scenarioKey]);

  useEffect(() => {
    const nextRootInputs = {};
    const nextChildInputs = {};

    for (const plan of Array.isArray(budgetPlanSnapshot?.categoryPlans) ? budgetPlanSnapshot.categoryPlans : []) {
      const rootValue = Number(plan?.appliedLimitSatang || 0) > 0
        ? plan.appliedLimitSatang
        : Number(plan?.suggestedLimitSatang || 0);
      nextRootInputs[plan.categoryId] = toMoneyInput(rootValue, false);

      const childCategories = childCategoriesByRoot.get(plan.categoryId) || [];
      const childPlanMap = new Map((Array.isArray(plan.childPlans) ? plan.childPlans : []).map((child) => [child.categoryId, child]));
      for (const childCategory of childCategories) {
        const childPlan = childPlanMap.get(childCategory.id) || null;
        const childValue = Number(childPlan?.appliedLimitSatang || 0) > 0
          ? childPlan.appliedLimitSatang
          : Number(childPlan?.averageSpendSatang || 0);
        nextChildInputs[childCategory.id] = childValue > 0 ? toMoneyInput(childValue, false) : "";
      }
    }

    setRootBudgetInputs(nextRootInputs);
    setChildBudgetInputs(nextChildInputs);
  }, [budgetPlanSnapshot, childCategoriesByRoot]);

  const goalName = String(goalDraft.name || "").trim();
  const goalTargetAmountSatang = parseMoneyToSatang(goalDraft.targetAmount || "0");
  const canSubmitGoal = Boolean(goalName) && goalTargetAmountSatang > 0 && !saving;
  const debtAccountId = String(debtDraft.accountId || "").trim();
  const debtTargetPaymentSatang = parseMoneyToSatang(debtDraft.targetPayment || "0");
  const canSubmitDebtPlan = Boolean(debtAccountId) && debtTargetPaymentSatang > 0 && !saving;

  const budgetMonthKey = budgetPlanSnapshot?.monthKey || "";
  useEffect(() => {
    scenarioSelectionRef.current = false;
  }, [budgetMonthKey]);
  const usingSuggestedPlan = !budgetPlanSnapshot?.hasAppliedBudget && !budgetPlanSnapshot?.usesLegacyMonthlyTarget;
  const displayExpenseBudgetSatang = usingSuggestedPlan
    ? Number(budgetPlanSnapshot?.suggestedExpenseBudgetSatang || 0)
    : Number(budgetPlanSnapshot?.activeExpenseBudgetSatang || 0);
  const displayDailyBudgetSatang = usingSuggestedPlan
    ? Number(budgetPlanSnapshot?.suggestedDailyBudgetSatang || 0)
    : Number(budgetPlanSnapshot?.dailyBudgetSatang || 0);
  const displayShortfallSatang = usingSuggestedPlan
    ? Number(budgetPlanSnapshot?.suggestedShortfallSatang || 0)
    : Number(budgetPlanSnapshot?.shortfallSatang || 0);
  const displaySurplusSatang = budgetPlanSnapshot?.debtStrategyMode === "paydown"
    ? usingSuggestedPlan
      ? Number(budgetPlanSnapshot?.suggestedDebtExtraSatang || 0)
      : Number(budgetPlanSnapshot?.debtExtraSatang || 0)
    : usingSuggestedPlan
      ? Number(budgetPlanSnapshot?.suggestedBufferSatang || 0)
      : Number(budgetPlanSnapshot?.bufferSatang || 0);
  const debtTargetHint = budgetPlanSnapshot?.debtTarget
    ? `${accountNameMap.get(Number(budgetPlanSnapshot.debtTarget.accountId)) || "บัญชีหนี้"} · APR ${(Number(budgetPlanSnapshot.debtTarget.aprBps || 0) / 100).toFixed(2)}%`
    : "";
  const planningMonthLabel = formatPlannerMonthLabel(budgetMonthKey);
  const incomeReady = Number(budgetPlanSnapshot?.selectedIncomeSatang || 0) > 0;
  const debtPlanReady = debtAccounts.length === 0 || debtPlans.length > 0;
  const budgetsApplied = !usingSuggestedPlan;
  const reserveLabel = planningConfig?.debtStrategyMode === "paydown" ? "โปะหนี้เพิ่ม" : "Buffer";
  const hasDebtAccountsWithoutPlan = debtAccounts.length > 0 && debtPlans.length === 0;
  const totalDebtBalanceSatang = debtPlans.reduce(
    (sum, plan) => sum + Number(plan?.current_balance_satang || 0),
    0,
  );
  const activeScenarioShortfallSatang = Number(
    activeScenario?.shortfallSatang ?? plannerDecisionSummary?.shortfallSatang ?? 0,
  );
  const activeScenarioExpenseSatang = Number(
    activeScenario?.recommendedExpenseSatang ?? plannerDecisionSummary?.recommendedExpenseSatang ?? displayExpenseBudgetSatang,
  );
  const activeScenarioDailyBudgetSatang = Number(
    activeScenario?.dailyBudgetSatang ?? plannerDecisionSummary?.dailyBudgetSatang ?? displayDailyBudgetSatang,
  );
  const activeScenarioSurplusSatang = planningConfig?.debtStrategyMode === "paydown"
    ? Number(activeScenario?.debtExtraSatang ?? plannerDecisionSummary?.debtExtraSatang ?? 0)
    : Number(activeScenario?.bufferSatang ?? plannerDecisionSummary?.bufferSatang ?? 0);
  const activeScenarioConfidencePct = clampPercent(
    Number(activeScenario?.confidenceScore ?? plannerDecisionSummary?.confidenceScore ?? 0) * 100,
  );
  const compareBaseExpenseSatang = Number(
    budgetPlanSnapshot?.activeExpenseBudgetSatang ||
      baselineScenario?.recommendedExpenseSatang ||
      budgetPlanSnapshot?.suggestedExpenseBudgetSatang ||
      0,
  );
  const activeScenarioAttentionCount = Number(activeScenario?.attentionCount ?? activeRecommendationQueue.length);
  const activeScenarioChangedCount = Number(
    activeScenario?.changedCategoryCount ??
      activeScenarioItems.filter((item) => Math.abs(Number(item.deltaSatang || 0)) > 0).length,
  );
  const activeScenarioAcceptedCount = activeScenarioItems.filter((item) => item.decisionStatus === "accepted").length;
  const activeScenarioDismissedCount = activeScenarioItems.filter((item) => item.decisionStatus === "dismissed").length;
  const activeScenarioLockedCount = activeScenarioItems.filter((item) => item.lockedByUser === true).length;
  const decisionTone = activeScenarioShortfallSatang > 0 ? "danger" : activeScenarioAttentionCount > 0 ? "warning" : "success";
  const decisionTitle = activeScenarioShortfallSatang > 0
    ? `แผน ${activeScenarioLabel} ยังเกินกรอบ`
    : activeScenarioAttentionCount > 0
      ? `แผน ${activeScenarioLabel} ยังมีหมวดที่ต้องยืนยัน`
      : `แผน ${activeScenarioLabel} พร้อมใช้งาน`;
  const decisionCopy = activeScenarioShortfallSatang > 0
    ? `ยังต้องลดงบอีก ${formatCurrency(activeScenarioShortfallSatang)} หรือเปลี่ยน inputs เพื่อให้แผนสมดุล`
    : activeScenarioAttentionCount > 0
      ? `มี ${activeScenarioAttentionCount} หมวดที่ควรตัดสินใจต่อ พร้อมงบเฉลี่ย ${formatCurrency(activeScenarioDailyBudgetSatang)} ต่อวัน`
      : `ตอนนี้เหลือ ${formatCurrency(activeScenarioSurplusSatang)} สำหรับ ${planningConfig?.debtStrategyMode === "paydown" ? "โปะหนี้เพิ่ม" : "buffer"} และ confidence ${activeScenarioConfidencePct}%`;
  const hasRecommendationQueue = activeRecommendationQueue.length > 0;

  const budgetPlanRows = useMemo(() => {
    const plans = Array.isArray(budgetPlanSnapshot?.categoryPlans) ? budgetPlanSnapshot.categoryPlans : [];
    return plans
      .map((plan) => {
        const recommendation = activeRecommendationMap.get(plan.categoryId) || null;
        const draftInput = String(rootBudgetInputs[plan.categoryId] || "").trim();
        const draftLimitSatang = draftInput ? parseMoneyToSatang(draftInput) : 0;
        const appliedLimitSatang = Number(plan?.appliedLimitSatang || 0);
        const suggestedLimitSatang = Number(
          (recommendation?.recommendedLimitSatang ?? plan?.recommendedLimitSatang ?? plan?.suggestedLimitSatang) || 0,
        );
        const displayedLimitSatang = draftInput
          ? draftLimitSatang
          : appliedLimitSatang > 0
            ? appliedLimitSatang
            : suggestedLimitSatang;
        const spentMonthSatang = Number(plan?.spentMonthSatang || 0);
        const projectedMonthEndSatang = Number(
          recommendation?.projectedMonthEndSatang ?? plan?.projectedMonthEndSatang ?? spentMonthSatang,
        );
        const childPlans = Array.isArray(plan.childPlans) ? plan.childPlans : [];
        const hasChildrenActivity = childPlans.some(
          (child) =>
            Number(child?.averageSpendSatang || 0) > 0 ||
            Number(child?.appliedLimitSatang || 0) > 0 ||
            Number(child?.spentMonthSatang || 0) > 0,
        );
        const isActive =
          displayedLimitSatang > 0 ||
          spentMonthSatang > 0 ||
          Number(plan?.averageSpendSatang || 0) > 0 ||
          plan?.manualOverride === true ||
          hasChildrenActivity;
        const needsAttention =
          recommendation?.needsAttention === true ||
          displayedLimitSatang <= 0 ||
          spentMonthSatang > displayedLimitSatang ||
          (displayedLimitSatang > 0 && spentMonthSatang >= Math.round(displayedLimitSatang * 0.85));

        return {
          ...plan,
          recommendation,
          displayedLimitSatang,
          remainingSatang: Math.max(0, displayedLimitSatang - spentMonthSatang),
          overSatang: Math.max(0, spentMonthSatang - displayedLimitSatang),
          projectedMonthEndSatang,
          utilizationPct: clampPercent(
            displayedLimitSatang > 0 ? (spentMonthSatang / displayedLimitSatang) * 100 : 0,
          ),
          isActive,
          needsAttention,
          hasChildrenActivity,
        };
      })
      .filter((plan) => {
        if (budgetFilter === "all") return true;
        if (budgetFilter === "active") return plan.isActive;
        return plan.needsAttention || plan.manualOverride === true;
      })
      .sort((left, right) => {
        const attentionScore =
          (right.needsAttention ? 1 : 0) - (left.needsAttention ? 1 : 0) ||
          Number((right.recommendation?.lockedByUser || right.lockedByUser) === true) -
            Number((left.recommendation?.lockedByUser || left.lockedByUser) === true) ||
          (right.manualOverride ? 1 : 0) - (left.manualOverride ? 1 : 0);
        if (attentionScore !== 0) return attentionScore;

        const spendDelta =
          Number(right.spentMonthSatang || 0) - Number(left.spentMonthSatang || 0) ||
          Number(right.averageSpendSatang || 0) - Number(left.averageSpendSatang || 0);
        if (spendDelta !== 0) return spendDelta;
        return String(left.name || "").localeCompare(String(right.name || ""), "th");
      });
  }, [activeRecommendationMap, budgetFilter, budgetPlanSnapshot, rootBudgetInputs]);

  const budgetFilterCounts = useMemo(() => {
    const plans = Array.isArray(budgetPlanSnapshot?.categoryPlans) ? budgetPlanSnapshot.categoryPlans : [];
    const counts = { all: plans.length, active: 0, attention: 0 };

    for (const plan of plans) {
      const recommendation = activeRecommendationMap.get(plan.categoryId) || null;
      const displayedLimitSatang =
        Number(plan?.appliedLimitSatang || 0) > 0
          ? Number(plan.appliedLimitSatang || 0)
          : Number(plan?.suggestedLimitSatang || 0);
      const spentMonthSatang = Number(plan?.spentMonthSatang || 0);
      const childPlans = Array.isArray(plan.childPlans) ? plan.childPlans : [];
      const isActive =
        displayedLimitSatang > 0 ||
        spentMonthSatang > 0 ||
        Number(plan?.averageSpendSatang || 0) > 0 ||
        plan?.manualOverride === true ||
        childPlans.some(
          (child) =>
            Number(child?.averageSpendSatang || 0) > 0 ||
            Number(child?.appliedLimitSatang || 0) > 0 ||
            Number(child?.spentMonthSatang || 0) > 0,
        );
      const needsAttention =
        recommendation?.needsAttention === true ||
        displayedLimitSatang <= 0 ||
        spentMonthSatang > displayedLimitSatang ||
        (displayedLimitSatang > 0 && spentMonthSatang >= Math.round(displayedLimitSatang * 0.85));

      if (isActive) counts.active += 1;
      if (needsAttention || plan?.manualOverride === true) counts.attention += 1;
    }

    return counts;
  }, [activeRecommendationMap, budgetPlanSnapshot]);

  const allocationRows = useMemo(() => {
    const selectedIncomeSatang = Number(budgetPlanSnapshot?.selectedIncomeSatang || 0);
    const denominator = Math.max(selectedIncomeSatang, 1);
    return [
      {
        id: "income",
        label: "รายได้ที่ใช้คำนวณ",
        amountSatang: selectedIncomeSatang,
        tone: "default",
      },
      {
        id: "savings",
        label: "กันเงินออม",
        amountSatang: Number(budgetPlanSnapshot?.savingsReserveSatang || 0),
        tone: "success",
      },
      {
        id: "debt-minimum",
        label: "หนี้ขั้นต่ำ",
        amountSatang: Number(budgetPlanSnapshot?.debtMinimumSatang || 0),
        tone: "warning",
      },
      {
        id: "expense",
        label: usingSuggestedPlan ? "งบรายจ่ายแนะนำ" : "งบรายจ่ายที่ใช้อยู่",
        amountSatang: displayExpenseBudgetSatang,
        tone: "default",
      },
      {
        id: "leftover",
        label: displayShortfallSatang > 0 ? "ยอดที่ยังขาด" : planningConfig?.debtStrategyMode === "paydown" ? "เงินโปะหนี้เพิ่ม" : "Buffer",
        amountSatang: displayShortfallSatang > 0 ? displayShortfallSatang : displaySurplusSatang,
        tone: displayShortfallSatang > 0 ? "danger" : "success",
      },
    ].map((row) => ({
      ...row,
      percent: clampPercent((Number(row.amountSatang || 0) / denominator) * 100),
    }));
  }, [budgetPlanSnapshot, displayExpenseBudgetSatang, displayShortfallSatang, displaySurplusSatang, planningConfig?.debtStrategyMode, usingSuggestedPlan]);

  const plannerSteps = [
    {
      id: "income",
      title: "ล็อกกรอบรายได้",
      detail: incomeReady
        ? `${getIncomeModeLabel(planningConfig?.incomeMode)} · ${formatCurrency(budgetPlanSnapshot?.selectedIncomeSatang || 0)}`
        : "ยังไม่มีรายได้พอสำหรับคำนวณแผน",
      done: incomeReady,
    },
    {
      id: "debt",
      title: "เช็กแผนหนี้",
      detail: hasDebtAccountsWithoutPlan
        ? "มีบัญชีหนี้ แต่ยังไม่ได้ตั้งขั้นต่ำ/เป้าจ่าย"
        : debtPlans.length
          ? `${debtPlans.length} แผน · ยอดคงเหลือ ${formatCurrency(totalDebtBalanceSatang)}`
          : "ไม่มีบัญชีหนี้ที่ต้องวางแผนเพิ่ม",
      done: debtPlanReady,
    },
    {
      id: "budget",
      title: "ยืนยันงบรายหมวด",
      detail: budgetsApplied
        ? `ใช้งบ ${formatCurrency(displayExpenseBudgetSatang)} แล้ว`
        : `ยังใช้ชุดงบแนะนำ ${formatCurrency(displayExpenseBudgetSatang)}`,
      done: budgetsApplied,
    },
  ];

  const openGoalEditor = (goal = null) => {
    setGoalDraft(createGoalDraft(goal));
    setGoalDeleteConfirmOpen(false);
    setGoalEditorOpen(true);
  };

  const closeGoalEditor = () => {
    setGoalDraft(createGoalDraft());
    setGoalDeleteConfirmOpen(false);
    setGoalEditorOpen(false);
  };

  const openDebtEditor = (plan = null) => {
    setDebtDraft(createDebtDraft(plan));
    setDebtDeleteConfirmOpen(false);
    setDebtEditorOpen(true);
  };

  const closeDebtEditor = () => {
    setDebtDraft(createDebtDraft());
    setDebtDeleteConfirmOpen(false);
    setDebtEditorOpen(false);
  };

  const submitPlanningConfig = async () => {
    await savePlanningConfig({
      incomeMode: planningDraft.incomeMode,
      fixedIncomeSatang: parseMoneyToSatang(planningDraft.fixedIncome || "0"),
      incomeLookbackMonths: Number(planningDraft.incomeLookbackMonths || 3),
      savingsMode: planningDraft.savingsMode,
      savingsAmountSatang: parseMoneyToSatang(planningDraft.savingsAmount || "0"),
      savingsPercentBps: parsePercentToBps(planningDraft.savingsPercent || "0"),
      debtStrategyMode: planningDraft.debtStrategyMode,
    });
  };

  const submitGoal = async () => {
    if (!canSubmitGoal) return;

    const saved = await saveFinancialGoal({
      id: goalDraft.id,
      name: goalName,
      targetAmountSatang: goalTargetAmountSatang,
      currentAmountSatang: parseMoneyToSatang(goalDraft.currentAmount || "0"),
      monthlyContributionSatang: parseMoneyToSatang(goalDraft.monthlyContribution || "0"),
      targetDate: goalDraft.targetDate,
      linkedAccountId: goalDraft.linkedAccountId || null,
      status: goalDraft.status,
    });

    if (saved !== false) closeGoalEditor();
  };

  const submitDebtPlan = async () => {
    if (!canSubmitDebtPlan) return;

    const saved = await saveDebtPlan({
      id: debtDraft.id,
      accountId: debtAccountId,
      currentBalanceSatang: parseMoneyToSatang(debtDraft.currentBalance),
      minimumPaymentSatang: parseMoneyToSatang(debtDraft.minimumPayment || "0"),
      targetPaymentSatang: debtTargetPaymentSatang,
      aprBps: parsePercentToBps(debtDraft.aprPercent || "0"),
      dueDay: debtDraft.dueDay,
      payoffTargetDate: debtDraft.payoffTargetDate,
      status: debtDraft.status,
      note: debtDraft.note,
    });

    if (saved !== false) closeDebtEditor();
  };

  const handleDeleteGoal = async () => {
    if (!goalDraft.id) return;
    await deleteFinancialGoal(goalDraft.id);
    closeGoalEditor();
  };

  const handleDeleteDebtPlan = async () => {
    if (!debtDraft.id) return;
    await deleteDebtPlan(debtDraft.id);
    closeDebtEditor();
  };

  const handleSaveRootBudget = async (plan) => {
    await saveBudgetRow({
      monthKey: budgetMonthKey,
      categoryId: plan.categoryId,
      limit: parseMoneyToSatang(rootBudgetInputs[plan.categoryId] || "0"),
      alertPct: plan.alertPct || 90,
      source: "manual",
      manualOverride: true,
    });
  };

  const handleSaveChildBudget = async (plan, childCategoryId) => {
    await saveBudgetRow({
      monthKey: budgetMonthKey,
      categoryId: childCategoryId,
      limit: parseMoneyToSatang(childBudgetInputs[childCategoryId] || "0"),
      alertPct: plan.alertPct || 90,
      source: "manual",
      manualOverride: true,
    });
  };

  const handleAcceptRecommendation = async (categoryId) => {
    await acceptPlannerRecommendation({ scenarioKey, categoryId });
  };

  const handleDismissRecommendation = async (categoryId) => {
    await dismissPlannerRecommendation({ scenarioKey, categoryId });
  };

  const handleLockRecommendation = async (categoryId) => {
    const inputValue = String(rootBudgetInputs[categoryId] || "").trim();
    const limitSatang = inputValue ? parseMoneyToSatang(inputValue) : null;
    await lockPlannerRecommendation({ scenarioKey, categoryId, limitSatang });
  };

  const handlePrimaryPlannerAction = async () => {
    if (!incomeReady) {
      await submitPlanningConfig();
      return;
    }
    if (hasDebtAccountsWithoutPlan) {
      openDebtEditor();
      return;
    }
    if (activeScenarioShortfallSatang > 0) {
      setBudgetFilter("attention");
      return;
    }
    await applyPlannerPlan({ scenarioKey });
  };

  return (
    <ScreenShell title="วางแผนการเงิน" subtitle="ติดตามเป้าหมายและแผนชำระในที่เดียว">
      <article className="ui-card finance-panel finance-planner-decision">
        <div className="finance-panel-head">
          <div>
            <div className="finance-panel-title">Monthly Decision Center</div>
            <div className="finance-panel-copy">{decisionCopy}</div>
          </div>
          <div className="finance-chip-grid">
            <StatusPill tone={decisionTone}>{decisionTitle}</StatusPill>
            <StatusPill tone="default">{planningMonthLabel || budgetMonthKey}</StatusPill>
            <StatusPill tone="default">confidence {activeScenarioConfidencePct}%</StatusPill>
          </div>
        </div>

        <div className="finance-section-label">Scenario Compare</div>
        <div className="finance-planner-scenario-tabs">
          {plannerScenarios.map((scenario) => {
            const isActive = scenario.id === activeScenario?.id;
            const scenarioTone = Number(scenario.shortfallSatang || 0) > 0
              ? "danger"
              : Number(scenario.attentionCount || 0) > 0
                ? "warning"
                : "success";
            const scenarioReserveSatang = planningConfig?.debtStrategyMode === "paydown"
              ? Number(scenario.debtExtraSatang || 0)
              : Number(scenario.bufferSatang || 0);
            const scenarioVsCurrentSatang = Number(scenario.recommendedExpenseSatang || 0) - compareBaseExpenseSatang;

            return (
              <button
                key={scenario.id}
                type="button"
                className={`finance-planner-scenario-tab ${isActive ? "is-active" : ""}`}
                onClick={() => {
                  scenarioSelectionRef.current = true;
                  setScenarioKey(scenario.id);
                }}
              >
                <div className="finance-row-title">{scenario.label}</div>
                <div className="finance-row-meta">
                  งบ {formatCurrency(scenario.recommendedExpenseSatang)} · ต่อวัน {formatCurrency(scenario.dailyBudgetSatang)}
                </div>
                <div className="finance-row-meta">
                  {getScenarioIntentCopy(scenario.id, planningConfig?.debtStrategyMode)} · เทียบงบที่ใช้อยู่ {formatDeltaCurrency(scenarioVsCurrentSatang)}
                </div>
                <div className="finance-planner-scenario-stats">
                  <div className="finance-planner-scenario-stat">
                    <span>งบรายเดือน</span>
                    <strong>{formatCurrency(scenario.recommendedExpenseSatang)}</strong>
                  </div>
                  <div className="finance-planner-scenario-stat">
                    <span>งบต่อวัน</span>
                    <strong>{formatCurrency(scenario.dailyBudgetSatang)}</strong>
                  </div>
                  <div className="finance-planner-scenario-stat">
                    <span>{reserveLabel}</span>
                    <strong>{formatCurrency(scenarioReserveSatang)}</strong>
                  </div>
                  <div className="finance-planner-scenario-stat">
                    <span>หมวดที่เปลี่ยน</span>
                    <strong>{scenario.changedCategoryCount || 0} หมวด</strong>
                  </div>
                </div>
                <div className="finance-chip-grid">
                  <StatusPill tone="default">confidence {clampPercent(Number(scenario.confidenceScore || 0) * 100)}%</StatusPill>
                  {isActive ? <StatusPill tone="success">กำลังดู</StatusPill> : null}
                </div>
                <div className="finance-chip-grid">
                  <StatusPill tone={scenarioTone}>
                    {Number(scenario.shortfallSatang || 0) > 0 ? `ขาด ${formatCurrency(scenario.shortfallSatang)}` : `${scenario.attentionCount || 0} หมวด`}
                  </StatusPill>
                </div>
              </button>
            );
          })}
        </div>

        <div className="finance-planner-summary-grid">
          <MetricCard
            label="งบรายเดือน"
            value={formatCurrency(activeScenarioExpenseSatang)}
            hint={`${activeScenarioChangedCount} หมวดเปลี่ยนจากงบปัจจุบัน`}
          />
          <MetricCard
            label="งบต่อวัน"
            value={formatCurrency(activeScenarioDailyBudgetSatang)}
            hint={`${activeScenarioAttentionCount} หมวดควรตัดสินใจต่อ`}
            tone={activeScenarioAttentionCount > 0 ? "warning" : "default"}
          />
          <MetricCard
            label={planningConfig?.debtStrategyMode === "paydown" ? "โปะหนี้เพิ่ม" : "Buffer"}
            value={formatCurrency(activeScenarioSurplusSatang)}
            hint={activeScenarioShortfallSatang > 0 ? "ยังไม่มี buffer เหลือ" : "หลังกันรายจ่ายและรายการจำเป็นแล้ว"}
            tone={activeScenarioShortfallSatang > 0 ? "danger" : "success"}
          />
        </div>

        <div className="finance-inline-actions">
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            disabled={saving || !activeScenario}
            onClick={handlePrimaryPlannerAction}
          >
            <PiggyBank size={16} />
            {!incomeReady
              ? "บันทึกกรอบคำนวณ"
              : hasDebtAccountsWithoutPlan
                ? "ตั้งแผนหนี้ก่อน"
                : activeScenarioShortfallSatang > 0
                  ? "ดูหมวดที่ควรปรับ"
                  : `ใช้แผน ${activeScenarioLabel}`}
          </button>
          <button type="button" className="ui-btn ui-btn-secondary" onClick={() => setBudgetFilter("attention")}>
            <AlertTriangle size={16} />
            ดู recommendation
          </button>
          <div className="finance-chip-grid">
            {activeScenarioAcceptedCount ? <StatusPill tone="success">รับแล้ว {activeScenarioAcceptedCount}</StatusPill> : null}
            {activeScenarioDismissedCount ? <StatusPill tone="default">คงเดิม {activeScenarioDismissedCount}</StatusPill> : null}
            {activeScenarioLockedCount ? <StatusPill tone="warning">manual lock {activeScenarioLockedCount}</StatusPill> : null}
          </div>
        </div>
      </article>

      <article className="ui-card finance-panel finance-planner-hero">
        <div className="finance-planner-hero-grid">
          <section className="finance-planner-hero-copy">
            <div className="finance-chip-grid">
              <StatusPill tone={displayShortfallSatang > 0 ? "danger" : budgetsApplied ? "success" : "warning"}>
                {displayShortfallSatang > 0 ? "แผนยังไม่สมดุล" : budgetsApplied ? "แผนพร้อมใช้งาน" : "รอ Apply ชุดงบ"}
              </StatusPill>
              <StatusPill tone="default">{planningMonthLabel || budgetMonthKey}</StatusPill>
            </div>

            <div>
              <div className="finance-planner-hero-title">
                {displayShortfallSatang > 0
                  ? `แผนเดือนนี้ยังขาด ${formatCurrency(displayShortfallSatang)}`
                  : budgetsApplied
                    ? `งบเดือนนี้ล็อกไว้ที่ ${formatCurrency(displayExpenseBudgetSatang)}`
                    : `มีชุดงบแนะนำ ${formatCurrency(displayExpenseBudgetSatang)} รอใช้งาน`}
              </div>
              <div className="finance-panel-copy finance-planner-hero-text">
                {displayShortfallSatang > 0
                  ? "เริ่มจากลดเงินออม เปลี่ยนกลยุทธ์หนี้ หรือปรับงบหมวดที่ยืดหยุ่นได้ก่อน เพื่อให้แผนอยู่ในกรอบ"
                  : budgetsApplied
                    ? `วันนี้เหลืองบเฉลี่ย ${formatCurrency(displayDailyBudgetSatang)} ต่อวัน และ${planningConfig?.debtStrategyMode === "paydown" ? "มีเงินสำหรับโปะหนี้เพิ่ม" : "ยังมี buffer เหลือ"} ${formatCurrency(displaySurplusSatang)}`
                    : "ระบบคำนวณจากรายได้ เงินออม และหนี้ขั้นต่ำให้แล้ว คุณสามารถ Apply งบทั้งชุด หรือปรับเฉพาะหมวดที่อยากคุมเพิ่มได้"}
              </div>
            </div>

            <div className="finance-inline-actions">
              {!incomeReady ? (
                <button type="button" className="ui-btn ui-btn-primary" disabled={saving} onClick={submitPlanningConfig}>
                  <Wallet size={16} />
                  บันทึกกรอบคำนวณ
                </button>
              ) : null}
              {hasDebtAccountsWithoutPlan ? (
                <button type="button" className="ui-btn ui-btn-primary" disabled={saving} onClick={() => openDebtEditor()}>
                  <CreditCard size={16} />
                  เพิ่มแผนหนี้
                </button>
              ) : null}
              {incomeReady && debtPlanReady && activeScenario && activeScenarioShortfallSatang <= 0 ? (
                <button type="button" className="ui-btn ui-btn-primary" disabled={saving} onClick={() => applyPlannerPlan({ scenarioKey })}>
                  <PiggyBank size={16} />
                  ใช้ชุดงบแนะนำ
                </button>
              ) : null}
            </div>

            <div className="finance-planner-step-list">
              {plannerSteps.map((step, index) => (
                <div key={step.id} className={`finance-planner-step ${step.done ? "is-done" : "is-pending"}`}>
                  <div className="finance-planner-step-badge">{step.done ? "✓" : String(index + 1)}</div>
                  <div className="finance-planner-step-copy">
                    <div className="finance-row-title">{step.title}</div>
                    <div className="finance-row-meta">{step.detail}</div>
                  </div>
                  <StatusPill tone={step.done ? "success" : "warning"}>{step.done ? "พร้อม" : "รอตั้งค่า"}</StatusPill>
                </div>
              ))}
            </div>
          </section>

          <section className="finance-planner-breakdown">
            <div className="finance-panel-head">
              <div>
                <div className="finance-panel-title">Money Flow</div>
                <div className="finance-panel-copy">อ่านจากบนลงล่างเพื่อดูว่าเงินถูกแบ่งไปตรงไหนก่อนบ้าง</div>
              </div>
            </div>

            <div className="finance-planner-breakdown-list">
              {allocationRows.map((row) => (
                <div key={row.id} className={`finance-planner-breakdown-row tone-${row.tone}`}>
                  <div className="finance-planner-breakdown-top">
                    <span>{row.label}</span>
                    <strong>{formatCurrency(row.amountSatang)}</strong>
                  </div>
                  <div className="finance-progress-bar">
                    <span style={{ width: `${row.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="finance-chip-grid">
              <StatusPill tone="default">ใช้ไปแล้ว {formatCurrency(budgetPlanSnapshot?.spentMonthSatang || 0)}</StatusPill>
              <StatusPill tone="default">เหลือเฉลี่ย {formatCurrency(displayDailyBudgetSatang)} / วัน</StatusPill>
              {debtTargetHint ? <StatusPill tone="default">{debtTargetHint}</StatusPill> : null}
            </div>
          </section>
        </div>
      </article>

      <article className="ui-card finance-panel">
        <div className="finance-panel-head">
          <div>
            <div className="finance-panel-title">Recommendation Queue</div>
            <div className="finance-panel-copy">
              ตัดสินใจทีละหมวดแล้ว Planner จะเก็บสถานะให้ว่าอะไรรับแล้ว อะไรคงของเดิม และอะไรล็อกเอง
            </div>
          </div>
          <div className="finance-chip-grid">
            <StatusPill tone={hasRecommendationQueue ? "warning" : "success"}>
              {hasRecommendationQueue ? `${activeRecommendationQueue.length} หมวดรอตัดสินใจ` : "คิวว่างแล้ว"}
            </StatusPill>
            <StatusPill tone="default">{activeScenarioLabel}</StatusPill>
          </div>
        </div>

        {hasRecommendationQueue ? (
          <div className="finance-planner-list">
            {activeRecommendationQueue.map((item) => (
              <div key={`${activeScenario?.id || "baseline"}:${item.categoryId}`} className="ui-card finance-panel">
                <div className="finance-planner-item finance-planner-item-queue">
                  <div className="finance-planner-item-top">
                    <div className="finance-planner-item-copy">
                      <div className="finance-row-title">{item.name}</div>
                      <div className="finance-row-meta">
                        applied {formatCurrency(item.currentLimitSatang)} · recommended {formatCurrency(item.recommendedLimitSatang)} · delta {formatDeltaCurrency(item.deltaSatang)}
                      </div>
                    </div>
                    <div className="finance-chip-grid">
                      <StatusPill tone={getDecisionStatusTone(item.decisionStatus)}>
                        {getDecisionStatusLabel(item.decisionStatus)}
                      </StatusPill>
                      <StatusPill tone="default">confidence {clampPercent(Number(item.confidenceScore || 0) * 100)}%</StatusPill>
                      {item.lockedByUser ? <StatusPill tone="warning">manual lock</StatusPill> : null}
                    </div>
                  </div>

                  <div className="finance-planner-mini-stats">
                    <div className="finance-planner-mini-stat">
                      <span>ใช้ไปแล้ว</span>
                      <strong>{formatCurrency(item.currentSpentSatang)}</strong>
                    </div>
                    <div className="finance-planner-mini-stat">
                      <span>คาดสิ้นเดือน</span>
                      <strong>{formatCurrency(item.projectedMonthEndSatang)}</strong>
                    </div>
                    <div className="finance-planner-mini-stat">
                      <span>baseline</span>
                      <strong>{formatCurrency(item.baselineSpendSatang)}</strong>
                    </div>
                    <div className="finance-planner-mini-stat">
                      <span>behavior</span>
                      <strong>{item.behavior}</strong>
                    </div>
                  </div>

                  {Array.isArray(item.reasonLabels) && item.reasonLabels.length ? (
                    <div className="finance-chip-grid">
                      {item.reasonLabels.map((label) => (
                        <StatusPill key={`${item.categoryId}:${label}`} tone="default">
                          {label}
                        </StatusPill>
                      ))}
                    </div>
                  ) : null}

                  <div className="finance-inline-actions">
                    <button
                      type="button"
                      className="ui-btn ui-btn-primary"
                      disabled={saving}
                      onClick={() => handleAcceptRecommendation(item.categoryId)}
                    >
                      รับคำแนะนำ
                    </button>
                    <button
                      type="button"
                      className="ui-btn ui-btn-secondary"
                      disabled={saving}
                      onClick={() => handleDismissRecommendation(item.categoryId)}
                    >
                      คงของเดิม
                    </button>
                    <button
                      type="button"
                      className="ui-btn ui-btn-secondary"
                      disabled={saving}
                      onClick={() => handleLockRecommendation(item.categoryId)}
                    >
                      ล็อกงบนี้
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyPanel
            title="ไม่มีหมวดที่ต้องยืนยันเพิ่ม"
            copy="ตอนนี้ทุก recommendation ในแผนนี้ถูกตัดสินใจแล้ว หรือยังไม่พบหมวดที่ต้องคุมเป็นพิเศษ"
          />
        )}
      </article>

      <article className="ui-card finance-panel">
        <div className="finance-panel-head">
          <div>
            <div className="finance-panel-title">Inputs & Strategy</div>
            <div className="finance-panel-copy">
              เลือกว่าจะใช้รายได้คงที่หรือค่าเฉลี่ยย้อนหลัง แล้วกันเงินออมกับหนี้ก่อนจัดสรรงบรายหมวด
            </div>
          </div>
          <div className="finance-chip-grid">
            {usingSuggestedPlan ? <StatusPill tone="warning">ยังไม่ได้ Apply</StatusPill> : <StatusPill tone="success">ใช้งานอยู่</StatusPill>}
            {displayShortfallSatang > 0 ? <StatusPill tone="danger">ขาด {formatCurrency(displayShortfallSatang)}</StatusPill> : null}
            {displayShortfallSatang <= 0 && displaySurplusSatang > 0 ? (
              <StatusPill tone="default">
                {planningConfig?.debtStrategyMode === "paydown" ? "โปะหนี้เพิ่ม" : "กันเป็น buffer"} {formatCurrency(displaySurplusSatang)}
              </StatusPill>
            ) : null}
          </div>
        </div>

        {displayShortfallSatang > 0 ? (
          <div className="ui-toast ui-toast--error finance-inline-note">
            <AlertTriangle size={16} />
            <div className="finance-toast-copy">
              แผนปัจจุบันยังตึงเกินไป ควรลดเงินออม เพิ่มรายรับ หรือเปลี่ยนกลยุทธ์หนี้
            </div>
          </div>
        ) : null}

        <div className="finance-grid finance-grid-main">
          <section className="ui-card finance-panel">
            <div className="finance-panel-head">
              <div className="finance-panel-title">Income Setup</div>
            </div>

            <div className="finance-form">
              <label className="finance-field">
                <span className="ui-label">แหล่งรายได้</span>
                <select
                  className="ui-select"
                  value={planningDraft.incomeMode}
                  onChange={(event) =>
                    setPlanningDraft((current) => ({ ...current, incomeMode: event.target.value }))
                  }
                >
                  {INCOME_MODE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === "fixed" ? "รายได้คงที่รายเดือน" : "เฉลี่ยรายรับย้อนหลัง"}
                    </option>
                  ))}
                </select>
              </label>

              <div className="finance-grid finance-grid-2">
                <label className="finance-field">
                  <span className="ui-label">รายได้คงที่</span>
                  <input
                    className="ui-input"
                    inputMode="decimal"
                    value={planningDraft.fixedIncome}
                    onChange={(event) =>
                      setPlanningDraft((current) => ({ ...current, fixedIncome: event.target.value }))
                    }
                    placeholder="0.00"
                    disabled={planningDraft.incomeMode !== "fixed"}
                  />
                </label>

                <label className="finance-field">
                  <span className="ui-label">ใช้ข้อมูลย้อนหลัง</span>
                  <select
                    className="ui-select"
                    value={planningDraft.incomeLookbackMonths}
                    onChange={(event) =>
                      setPlanningDraft((current) => ({ ...current, incomeLookbackMonths: event.target.value }))
                    }
                  >
                    {LOOKBACK_OPTIONS.map((value) => (
                      <option key={value} value={String(value)}>
                        {value} เดือน
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </section>

          <section className="ui-card finance-panel">
            <div className="finance-panel-head">
              <div className="finance-panel-title">Saving + Debt Strategy</div>
            </div>

            <div className="finance-form">
              <label className="finance-field">
                <span className="ui-label">กันเงินออมแบบ</span>
                <select
                  className="ui-select"
                  value={planningDraft.savingsMode}
                  onChange={(event) =>
                    setPlanningDraft((current) => ({ ...current, savingsMode: event.target.value }))
                  }
                >
                  {SAVINGS_MODE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === "percent" ? "เปอร์เซ็นต์ของรายรับ" : "จำนวนเงินคงที่"}
                    </option>
                  ))}
                </select>
              </label>

              <div className="finance-grid finance-grid-2">
                <label className="finance-field">
                  <span className="ui-label">จำนวนเงินออม</span>
                  <input
                    className="ui-input"
                    inputMode="decimal"
                    value={planningDraft.savingsAmount}
                    onChange={(event) =>
                      setPlanningDraft((current) => ({ ...current, savingsAmount: event.target.value }))
                    }
                    placeholder="0.00"
                    disabled={planningDraft.savingsMode !== "amount"}
                  />
                </label>

                <label className="finance-field">
                  <span className="ui-label">เปอร์เซ็นต์ออม</span>
                  <input
                    className="ui-input"
                    inputMode="decimal"
                    value={planningDraft.savingsPercent}
                    onChange={(event) =>
                      setPlanningDraft((current) => ({ ...current, savingsPercent: event.target.value }))
                    }
                    placeholder="0"
                    disabled={planningDraft.savingsMode !== "percent"}
                  />
                </label>
              </div>

              <label className="finance-field">
                <span className="ui-label">กลยุทธ์หนี้</span>
                <select
                  className="ui-select"
                  value={planningDraft.debtStrategyMode}
                  onChange={(event) =>
                    setPlanningDraft((current) => ({ ...current, debtStrategyMode: event.target.value }))
                  }
                >
                  {DEBT_STRATEGY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === "survival" ? "ประคับประคองรายเดือน" : "จ่ายขั้นต่ำแล้วโปะหนี้เป้าหมาย"}
                    </option>
                  ))}
                </select>
              </label>

              <div className="finance-inline-actions">
                <button type="button" className="ui-btn ui-btn-primary" disabled={saving} onClick={submitPlanningConfig}>
                  <Wallet size={16} />
                  บันทึกกรอบคำนวณ
                </button>
              </div>

              <div className="finance-chip-grid">
                <StatusPill tone="default">{getIncomeModeLabel(planningConfig?.incomeMode)}</StatusPill>
                <StatusPill tone="default">{getSavingsModeLabel(planningConfig?.savingsMode)}</StatusPill>
                <StatusPill tone="default">{getDebtStrategyLabel(planningConfig?.debtStrategyMode)}</StatusPill>
              </div>
            </div>
          </section>
        </div>
      </article>

      <article className="ui-card finance-panel">
        <div className="finance-panel-head">
          <div>
            <div className="finance-panel-title">Category Budget Editor</div>
            <div className="finance-panel-copy">
              โฟกัสหมวดที่ควรดูต่อก่อน แล้วค่อยลงรายละเอียดหมวดย่อยเมื่อจำเป็น โดย child รวมกันต้องไม่เกิน parent
            </div>
          </div>
          <div className="finance-inline-actions">
            <button type="button" className="ui-btn ui-btn-primary" disabled={saving || !activeScenario} onClick={() => applyPlannerPlan({ scenarioKey })}>
              <PiggyBank size={16} />
              ใช้ชุดงบแนะนำ
            </button>
          </div>
        </div>

        <div className="finance-planner-toolbar">
          <div className="finance-chip-grid">
            {BUDGET_FILTER_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`finance-filter-chip ${budgetFilter === option.id ? "is-active" : ""}`}
                onClick={() => setBudgetFilter(option.id)}
              >
                {option.label}
                <span>{budgetFilterCounts[option.id] || 0}</span>
              </button>
            ))}
          </div>
          <div className="finance-chip-grid">
            <StatusPill tone="default">แสดง {budgetPlanRows.length} จาก {budgetFilterCounts.all || 0} หมวด</StatusPill>
            <StatusPill tone="default">ใช้อยู่ {formatCurrency(displayExpenseBudgetSatang)}</StatusPill>
          </div>
        </div>

        <div className="finance-planner-list">
          {budgetPlanRows.length ? budgetPlanRows.map((plan) => {
            const childCategories = childCategoriesByRoot.get(plan.categoryId) || [];
            const childPlanMap = new Map((Array.isArray(plan.childPlans) ? plan.childPlans : []).map((child) => [child.categoryId, child]));
            const hasChildOverrides = childCategories.some((child) => (childPlanMap.get(child.id)?.appliedLimitSatang || 0) > 0);
            const childDraftTotalSatang = childCategories.reduce((sum, child) => {
              const value = String(childBudgetInputs[child.id] || "").trim();
              if (value) return sum + parseMoneyToSatang(value);
              return sum + Number(childPlanMap.get(child.id)?.appliedLimitSatang || 0);
            }, 0);

            return (
              <div key={plan.categoryId} className="ui-card finance-panel">
                <div className="finance-planner-item">
                  <div className="finance-planner-item-top">
                    <div className="finance-planner-item-copy">
                      <div className="finance-row-title">{plan.name}</div>
                      <div className="finance-row-meta">
                        เฉลี่ยย้อนหลัง {formatCurrency(plan.averageSpendSatang)} · ใช้ไปแล้ว {formatCurrency(plan.spentMonthSatang)}
                      </div>
                    </div>
                    <div className="finance-chip-grid">
                      <StatusPill tone="default">{plan.behavior}</StatusPill>
                      {plan.manualOverride ? <StatusPill tone="warning">manual</StatusPill> : null}
                      {plan.recommendation?.lockedByUser ? <StatusPill tone="warning">locked</StatusPill> : null}
                      {plan.recommendation ? (
                        <StatusPill tone={getDecisionStatusTone(plan.recommendation.decisionStatus)}>
                          {getDecisionStatusLabel(plan.recommendation.decisionStatus)}
                        </StatusPill>
                      ) : null}
                      {plan.needsAttention ? <StatusPill tone="danger">ควรดูต่อ</StatusPill> : null}
                    </div>
                  </div>

                  <div className="finance-planner-item-progress">
                    <div className="finance-progress-bar">
                      <span style={{ width: `${plan.utilizationPct}%` }} />
                    </div>
                    <div className="finance-planner-progress-meta">
                      <span>กรอบที่กำลังแก้ {formatCurrency(plan.displayedLimitSatang)}</span>
                      <span>
                        {plan.overSatang > 0 ? `เกิน ${formatCurrency(plan.overSatang)}` : `เหลือ ${formatCurrency(plan.remainingSatang)}`}
                      </span>
                    </div>
                  </div>

                  <div className="finance-planner-mini-stats">
                    <div className="finance-planner-mini-stat">
                      <span>ใช้ไปแล้ว</span>
                      <strong>{formatCurrency(plan.spentMonthSatang)}</strong>
                    </div>
                    <div className="finance-planner-mini-stat">
                      <span>คาดสิ้นเดือน</span>
                      <strong>{formatCurrency(plan.projectedMonthEndSatang)}</strong>
                    </div>
                    <div className="finance-planner-mini-stat">
                      <span>recommended</span>
                      <strong>{formatCurrency(plan.recommendation?.recommendedLimitSatang || plan.suggestedLimitSatang)}</strong>
                    </div>
                    <div className="finance-planner-mini-stat">
                      <span>applied</span>
                      <strong>{formatCurrency(plan.appliedLimitSatang || 0)}</strong>
                    </div>
                  </div>

                  <div className="finance-grid finance-grid-3">
                    <label className="finance-field">
                      <span className="ui-label">Budget behavior</span>
                      <select
                        className="ui-select"
                        value={plan.behavior}
                        onChange={(event) => saveCategoryBudgetBehavior(plan.categoryId, event.target.value)}
                        disabled={saving}
                      >
                        <option value="fixed">fixed</option>
                        <option value="essential">essential</option>
                        <option value="flexible">flexible</option>
                      </select>
                    </label>

                    <label className="finance-field">
                      <span className="ui-label">งบหมวดหลัก</span>
                      <input
                        className="ui-input"
                        inputMode="decimal"
                        value={rootBudgetInputs[plan.categoryId] || ""}
                        onChange={(event) =>
                          setRootBudgetInputs((current) => ({ ...current, [plan.categoryId]: event.target.value }))
                        }
                        placeholder="0.00"
                      />
                    </label>

                    <div className="finance-inline-actions">
                      <button
                        type="button"
                        className="ui-btn ui-btn-secondary"
                        disabled={saving}
                        onClick={() =>
                          setRootBudgetInputs((current) => ({
                            ...current,
                            [plan.categoryId]: toMoneyInput(
                              plan.recommendation?.recommendedLimitSatang || plan.suggestedLimitSatang,
                              false,
                            ),
                          }))
                        }
                      >
                        ใช้แนะนำ
                      </button>
                      <button type="button" className="ui-btn ui-btn-primary" disabled={saving} onClick={() => handleSaveRootBudget(plan)}>
                        บันทึกหมวดหลัก
                      </button>
                      {(plan.appliedLimitSatang > 0 || childCategories.some((child) => (childPlanMap.get(child.id)?.appliedLimitSatang || 0) > 0)) ? (
                        <button
                          type="button"
                          className="ui-btn ui-btn-secondary"
                          disabled={saving}
                          onClick={() => deleteBudgetRow({ categoryId: plan.categoryId, monthKey: budgetMonthKey })}
                        >
                          ลบทั้งหมวด
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {childCategories.length ? (
                    <details className="finance-planner-child-details" open={hasChildOverrides}>
                      <summary>
                        หมวดย่อย {childCategories.length} รายการ · override รวม {formatCurrency(childDraftTotalSatang)}
                      </summary>
                      <div className="finance-list">
                        {childCategories.map((childCategory) => {
                          const childPlan = childPlanMap.get(childCategory.id) || null;
                          const childAverageSatang = Number(childPlan?.averageSpendSatang || 0);
                          const childAppliedSatang = Number(childPlan?.appliedLimitSatang || 0);
                          const shouldShow = childAverageSatang > 0 || childAppliedSatang > 0 || String(childBudgetInputs[childCategory.id] || "").trim();
                          if (!shouldShow) return null;

                          return (
                            <div key={childCategory.id} className="finance-row">
                              <div className="finance-row-main">
                                <div>
                                  <div className="finance-row-title">{childCategory.name}</div>
                                  <div className="finance-row-meta">
                                    เฉลี่ย {formatCurrency(childAverageSatang)} · ใช้ไปแล้ว {formatCurrency(childPlan?.spentMonthSatang || 0)}
                                  </div>
                                </div>
                              </div>

                              <div className="finance-inline-actions">
                                <button
                                  type="button"
                                  className="ui-btn ui-btn-secondary"
                                  disabled={saving || !(childAverageSatang > 0)}
                                  onClick={() =>
                                    setChildBudgetInputs((current) => ({
                                      ...current,
                                      [childCategory.id]: toMoneyInput(childAverageSatang, false),
                                    }))
                                  }
                                >
                                  ใช้เฉลี่ย
                                </button>
                                <input
                                  className="ui-input"
                                  inputMode="decimal"
                                  value={childBudgetInputs[childCategory.id] || ""}
                                  onChange={(event) =>
                                    setChildBudgetInputs((current) => ({ ...current, [childCategory.id]: event.target.value }))
                                  }
                                  placeholder="override"
                                />
                                <button
                                  type="button"
                                  className="ui-btn ui-btn-secondary"
                                  disabled={saving || !String(childBudgetInputs[childCategory.id] || "").trim()}
                                  onClick={() => handleSaveChildBudget(plan, childCategory.id)}
                                >
                                  บันทึก
                                </button>
                                {childAppliedSatang > 0 ? (
                                  <button
                                    type="button"
                                    className="ui-btn ui-btn-secondary"
                                    disabled={saving}
                                    onClick={() => deleteBudgetRow({ categoryId: childCategory.id, monthKey: budgetMonthKey })}
                                  >
                                    ลบ
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  ) : null}
                </div>
              </div>
            );
          }) : (
            <EmptyPanel
              title="ไม่มีหมวดที่ตรงกับตัวกรองนี้"
              copy="ลองสลับไปดูหมวดที่มีการใช้งาน หรือดูทั้งหมดเพื่อปรับงบเพิ่ม"
            />
          )}
        </div>
      </article>

      <section className="finance-grid finance-planner-columns">
        <article className="ui-card finance-panel">
          <div className="finance-planner-section-head">
            <div className="finance-planner-section-copy">
              <div className="finance-panel-title">Goals</div>
              <div className="finance-panel-copy">ตั้งเป้าออมเงินและดูว่าต้องเติมอีกเท่าไร</div>
            </div>
            <button type="button" className="ui-btn ui-btn-secondary" onClick={() => openGoalEditor()}>
              <PlusCircle size={16} />
              เพิ่มเป้าหมาย
            </button>
          </div>

          {financialGoals.length ? (
            <div className="finance-planner-list">
              {financialGoals.map((goal) => {
                const progress = getGoalProgressPercent(goal);
                const linkedAccountName = goal.linked_account_id
                  ? accountNameMap.get(Number(goal.linked_account_id))
                  : "";

                return (
                  <button
                    key={goal.id}
                    type="button"
                    className="finance-list-button finance-planner-button"
                    onClick={() => openGoalEditor(goal)}
                  >
                    <div className="finance-planner-item">
                      <div className="finance-planner-item-top">
                        <div className="finance-planner-item-copy">
                          <div className="finance-row-title">{goal.name}</div>
                          <div className="finance-row-meta">
                            {goal.target_date ? `ถึงกำหนด ${formatDateLong(goal.target_date)}` : "ยังไม่กำหนดวัน"}
                            {linkedAccountName ? ` · เก็บใน ${linkedAccountName}` : ""}
                          </div>
                        </div>
                        <div className="finance-row-side">
                          <div className="finance-row-amount">{progress}%</div>
                          <div className="finance-row-meta">{formatCurrency(goal.target_amount_satang)}</div>
                        </div>
                      </div>

                      <div className="finance-planner-item-progress">
                        <div className="finance-progress-bar">
                          <span style={{ width: `${progress}%` }} />
                        </div>
                        <div className="finance-planner-progress-meta">
                          <span>{formatCurrency(goal.current_amount_satang)} / {formatCurrency(goal.target_amount_satang)}</span>
                          <span>เหลือ {formatCurrency(getGoalRemainingSatang(goal))}</span>
                        </div>
                      </div>

                      <div className="finance-chip-grid">
                        {goal.monthly_contribution_satang > 0 ? (
                          <StatusPill tone="default">
                            เติมเดือนละ {formatCurrency(goal.monthly_contribution_satang)}
                          </StatusPill>
                        ) : null}
                        {goal.status !== "active" ? (
                          <StatusPill tone={goal.status === "completed" ? "success" : "warning"}>
                            {getGoalStatusLabel(goal.status)}
                          </StatusPill>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyPanel
              title="ยังไม่มีเป้าหมาย"
              copy="เริ่มจากเป้าหมายก้อนเล็ก เช่น เงินฉุกเฉิน ค่าเดินทาง หรือกองทุนทริปถัดไป"
              action={
                <button type="button" className="ui-btn ui-btn-primary" onClick={() => openGoalEditor()}>
                  <Target size={16} />
                  สร้างเป้าหมายแรก
                </button>
              }
            />
          )}
        </article>

        <article className="ui-card finance-panel">
          <div className="finance-planner-section-head">
            <div className="finance-planner-section-copy">
              <div className="finance-panel-title">Debt</div>
              <div className="finance-panel-copy">วางแผนยอดคงเหลือ ยอดที่ต้องจ่าย และวันครบกำหนด</div>
            </div>
            <button
              type="button"
              className="ui-btn ui-btn-secondary"
              onClick={() => openDebtEditor()}
              disabled={!debtAccounts.length}
            >
              <PlusCircle size={16} />
              เพิ่มแผนหนี้
            </button>
          </div>

          {debtPlans.length ? (
            <div className="finance-planner-list">
              {debtPlans.map((plan) => {
                const nextDueDate = getNextDebtDueDateISO(plan);
                const accountName = accountNameMap.get(Number(plan.account_id)) || "บัญชีที่เชื่อมไว้";

                return (
                  <button
                    key={plan.id}
                    type="button"
                    className="finance-list-button finance-planner-button"
                    onClick={() => openDebtEditor(plan)}
                  >
                    <div className="finance-planner-item">
                      <div className="finance-planner-item-top">
                        <div className="finance-planner-item-copy">
                          <div className="finance-row-title">{accountName}</div>
                          <div className="finance-row-meta">
                            {nextDueDate ? `ครบกำหนด ${formatDateLong(nextDueDate)}` : "ยังไม่กำหนดวันชำระ"}
                            {plan.payoff_target_date ? ` · เป้าปิด ${formatDateLong(plan.payoff_target_date)}` : ""}
                          </div>
                        </div>
                        <div className="finance-row-side">
                          <div className="finance-row-amount">{formatCurrency(plan.current_balance_satang)}</div>
                          <div className="finance-row-meta">คงเหลือ</div>
                        </div>
                      </div>

                      <div className="finance-planner-progress-meta finance-planner-progress-meta-wide">
                        <span>
                          ขั้นต่ำ {formatCurrency(plan.minimum_payment_satang || 0)} · ตั้งใจจ่าย {formatCurrency(plan.target_payment_satang)}
                        </span>
                        <span>{plan.due_day ? `ทุกวันที่ ${plan.due_day}` : "ไม่ระบุวันครบกำหนด"}</span>
                      </div>

                      <div className="finance-chip-grid">
                        {Number(plan.apr_bps || 0) > 0 ? (
                          <StatusPill tone="default">APR {(Number(plan.apr_bps || 0) / 100).toFixed(2)}%</StatusPill>
                        ) : null}
                        {plan.status !== "active" ? (
                          <StatusPill tone={plan.status === "paid_off" ? "success" : "warning"}>
                            {getDebtStatusLabel(plan.status)}
                          </StatusPill>
                        ) : null}
                        {plan.note ? <StatusPill tone="default">{plan.note}</StatusPill> : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : debtAccounts.length ? (
            <EmptyPanel
              title="ยังไม่มีแผนหนี้"
              copy="เลือกบัญชีบัตรเครดิตหรือสินเชื่อ แล้วกำหนดยอดที่อยากจ่ายในแต่ละงวด"
              action={
                <button type="button" className="ui-btn ui-btn-primary" onClick={() => openDebtEditor()}>
                  <CreditCard size={16} />
                  สร้างแผนชำระ
                </button>
              }
            />
          ) : (
            <EmptyPanel
              title="ยังไม่มีบัญชีหนี้"
              copy="เพิ่มบัญชีประเภทบัตรเครดิตหรือสินเชื่อก่อน แล้วค่อยสร้างแผนชำระ"
              action={
                <button type="button" className="ui-btn ui-btn-primary" onClick={() => navigateToView("accounts")}>
                  <CreditCard size={16} />
                  ไปที่บัญชี
                </button>
              }
            />
          )}
        </article>
      </section>

      <Sheet
        open={goalEditorOpen}
        onClose={closeGoalEditor}
        title={goalDraft.id ? "แก้ไขเป้าหมาย" : "เป้าหมายใหม่"}
        footer={
          <div className="finance-sheet-actions finance-sheet-actions-sticky">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={closeGoalEditor}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-primary"
              disabled={!canSubmitGoal}
              onClick={submitGoal}
            >
              {goalDraft.id ? "บันทึก" : "สร้างเป้าหมาย"}
            </button>
          </div>
        }
      >
        <div className="finance-form">
          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">ชื่อเป้าหมาย</span>
              <input
                className="ui-input"
                value={goalDraft.name}
                onChange={(event) => setGoalDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="เช่น เงินฉุกเฉิน"
              />
            </label>

            <label className="finance-field">
              <span className="ui-label">ยอดเป้าหมาย</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={goalDraft.targetAmount}
                onChange={(event) => setGoalDraft((current) => ({ ...current, targetAmount: event.target.value }))}
                placeholder="0.00"
              />
              {goalDraft.targetAmount && goalTargetAmountSatang <= 0 ? (
                <span className="finance-field-helper">กรอกยอดเป้าหมายมากกว่า 0 ก่อนบันทึก</span>
              ) : null}
            </label>
          </div>

          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">เก็บแล้ว</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={goalDraft.currentAmount}
                onChange={(event) => setGoalDraft((current) => ({ ...current, currentAmount: event.target.value }))}
                placeholder="0.00"
              />
            </label>

            <label className="finance-field">
              <span className="ui-label">อยากเติมต่อเดือน</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={goalDraft.monthlyContribution}
                onChange={(event) =>
                  setGoalDraft((current) => ({ ...current, monthlyContribution: event.target.value }))
                }
                placeholder="0.00"
              />
            </label>
          </div>

          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">วันที่ตั้งเป้าไว้</span>
              <input
                className="ui-input"
                type="date"
                value={goalDraft.targetDate}
                onChange={(event) => setGoalDraft((current) => ({ ...current, targetDate: event.target.value }))}
              />
            </label>

            <div className="finance-field">
              <span className="ui-label">บัญชีที่เชื่อม</span>
              <AccountSheetPicker
                accounts={accounts}
                value={goalDraft.linkedAccountId}
                onChange={(linkedAccountId) => setGoalDraft((current) => ({ ...current, linkedAccountId }))}
                title="เลือกบัญชีที่เชื่อม"
                placeholder="เลือกบัญชีที่เชื่อม"
                allowEmpty
                emptyLabel="ไม่ผูกบัญชี"
                emptyDescription="เก็บเป้าหมายนี้แบบไม่ผูกกับบัญชีใดไว้ก่อนได้"
                testId="planner-goal-linked-account"
                emptyTestId="planner-goal-linked-account-empty"
                optionTestIdPrefix="planner-goal-linked-account-option"
              />
            </div>
          </div>

          <label className="finance-field">
            <span className="ui-label">สถานะ</span>
            <select
              className="ui-select"
              value={goalDraft.status}
              onChange={(event) => setGoalDraft((current) => ({ ...current, status: event.target.value }))}
            >
              {GOAL_STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {goalDraft.id ? (
            <section className="finance-danger-zone">
              <div className="finance-section-label">โซนอันตราย</div>
              <div className="ui-card finance-danger-card">
                <div className="finance-danger-copy">
                  <div className="finance-panel-title">ลบเป้าหมายนี้ออกจาก Planner</div>
                  <div className="finance-panel-copy">
                    ความคืบหน้าและยอดติดตามของเป้าหมายนี้จะถูกลบออกจากรายการเป้าหมาย
                  </div>
                </div>
                <button
                  type="button"
                  className="ui-btn ui-btn-danger"
                  disabled={saving}
                  onClick={() => setGoalDeleteConfirmOpen(true)}
                  data-testid="planner-goal-delete-trigger"
                >
                  <Trash2 size={16} />
                  ลบเป้าหมาย
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </Sheet>

      <Sheet
        open={debtEditorOpen}
        onClose={closeDebtEditor}
        title={debtDraft.id ? "แก้ไขแผนชำระ" : "แผนชำระใหม่"}
        footer={
          <div className="finance-sheet-actions finance-sheet-actions-sticky">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={closeDebtEditor}>
              ยกเลิก
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-primary"
              disabled={!canSubmitDebtPlan}
              onClick={submitDebtPlan}
            >
              {debtDraft.id ? "บันทึก" : "สร้างแผนชำระ"}
            </button>
          </div>
        }
      >
        <div className="finance-form">
          <div className="finance-field">
            <span className="ui-label">บัญชีหนี้</span>
            <AccountSheetPicker
              accounts={debtAccounts}
              value={debtDraft.accountId}
              onChange={(accountId) => setDebtDraft((current) => ({ ...current, accountId }))}
              title="เลือกบัญชีหนี้"
              placeholder="เลือกบัญชีหนี้"
              testId="planner-debt-account"
              optionTestIdPrefix="planner-debt-account-option"
            />
          </div>

          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">ยอดคงเหลือ</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={debtDraft.currentBalance}
                onChange={(event) => setDebtDraft((current) => ({ ...current, currentBalance: event.target.value }))}
                placeholder="0.00"
              />
            </label>

            <label className="finance-field">
              <span className="ui-label">ยอดที่อยากจ่าย</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={debtDraft.targetPayment}
                onChange={(event) => setDebtDraft((current) => ({ ...current, targetPayment: event.target.value }))}
                placeholder="0.00"
              />
              {debtDraft.targetPayment && debtTargetPaymentSatang <= 0 ? (
                <span className="finance-field-helper">กรอกยอดที่อยากจ่ายมากกว่า 0 ก่อนบันทึก</span>
              ) : null}
            </label>
          </div>

          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">ยอดขั้นต่ำ</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={debtDraft.minimumPayment}
                onChange={(event) => setDebtDraft((current) => ({ ...current, minimumPayment: event.target.value }))}
                placeholder="0.00"
              />
            </label>

            <label className="finance-field">
              <span className="ui-label">APR (%)</span>
              <input
                className="ui-input"
                inputMode="decimal"
                value={debtDraft.aprPercent}
                onChange={(event) => setDebtDraft((current) => ({ ...current, aprPercent: event.target.value }))}
                placeholder="0"
              />
            </label>
          </div>

          <div className="finance-grid finance-grid-2">
            <label className="finance-field">
              <span className="ui-label">วันครบกำหนด</span>
              <input
                className="ui-input"
                type="number"
                min="1"
                max="31"
                value={debtDraft.dueDay}
                onChange={(event) => setDebtDraft((current) => ({ ...current, dueDay: event.target.value }))}
                placeholder="เช่น 5"
              />
            </label>

            <label className="finance-field">
              <span className="ui-label">เป้าปิดหนี้</span>
              <input
                className="ui-input"
                type="date"
                value={debtDraft.payoffTargetDate}
                onChange={(event) =>
                  setDebtDraft((current) => ({ ...current, payoffTargetDate: event.target.value }))
                }
              />
            </label>
          </div>

          <label className="finance-field">
            <span className="ui-label">สถานะ</span>
            <select
              className="ui-select"
              value={debtDraft.status}
              onChange={(event) => setDebtDraft((current) => ({ ...current, status: event.target.value }))}
            >
              {DEBT_STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="finance-field">
            <span className="ui-label">บันทึกเพิ่มเติม</span>
            <textarea
              className="ui-input finance-textarea"
              value={debtDraft.note}
              onChange={(event) => setDebtDraft((current) => ({ ...current, note: event.target.value }))}
            />
          </label>

          {debtDraft.id ? (
            <section className="finance-danger-zone">
              <div className="finance-section-label">โซนอันตราย</div>
              <div className="ui-card finance-danger-card">
                <div className="finance-danger-copy">
                  <div className="finance-panel-title">ลบแผนชำระนี้ออกจาก Planner</div>
                  <div className="finance-panel-copy">
                    ระบบจะลบแผนติดตามงวดนี้ออก แต่บัญชีหนี้และรายการที่เคยบันทึกไว้จะยังอยู่
                  </div>
                </div>
                <button
                  type="button"
                  className="ui-btn ui-btn-danger"
                  disabled={saving}
                  onClick={() => setDebtDeleteConfirmOpen(true)}
                  data-testid="planner-debt-delete-trigger"
                >
                  <Trash2 size={16} />
                  ลบแผนชำระ
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </Sheet>

      <Sheet
        open={goalEditorOpen && goalDeleteConfirmOpen}
        onClose={() => setGoalDeleteConfirmOpen(false)}
        title="ยืนยันการลบเป้าหมาย"
        subtitle={goalDraft.name ? `เป้าหมาย ${goalDraft.name}` : "เป้าหมายนี้จะถูกลบออกจาก Planner"}
        footer={
          <div className="finance-sheet-actions">
            <button
              type="button"
              className="ui-btn ui-btn-secondary"
              onClick={() => setGoalDeleteConfirmOpen(false)}
            >
              กลับไปแก้ไข
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-danger"
              disabled={saving}
              onClick={handleDeleteGoal}
              data-testid="planner-goal-delete-confirm"
            >
              <Trash2 size={16} />
              ยืนยันการลบ
            </button>
          </div>
        }
      >
        <div className="finance-form">
          <section className="finance-danger-sheet">
            <div className="finance-danger-sheet-copy">
              <div className="finance-panel-title">สิ่งที่จะเกิดขึ้นหลังลบ</div>
              <div className="finance-panel-copy">
                เป้าหมายนี้จะหายจากหน้า Planner และจะไม่ถูกนับรวมใน progress summary อีกต่อไป
              </div>
            </div>
            <div className="finance-danger-checklist">
              <div className="finance-danger-check">ยอดสะสมของเป้าหมายนี้จะไม่ถูกนับรวมในความคืบหน้าแล้ว</div>
              <div className="finance-danger-check">บัญชีที่เชื่อมไว้จะไม่ถูกลบตามไปด้วย</div>
              <div className="finance-danger-check">หากยังไม่แน่ใจ แนะนำให้เปลี่ยนสถานะเป็นพักไว้แทน</div>
            </div>
          </section>
        </div>
      </Sheet>

      <Sheet
        open={debtEditorOpen && debtDeleteConfirmOpen}
        onClose={() => setDebtDeleteConfirmOpen(false)}
        title="ยืนยันการลบแผนชำระ"
        subtitle="แผนนี้จะถูกลบออกจากรายการติดตามหนี้"
        footer={
          <div className="finance-sheet-actions">
            <button
              type="button"
              className="ui-btn ui-btn-secondary"
              onClick={() => setDebtDeleteConfirmOpen(false)}
            >
              กลับไปแก้ไข
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-danger"
              disabled={saving}
              onClick={handleDeleteDebtPlan}
              data-testid="planner-debt-delete-confirm"
            >
              <Trash2 size={16} />
              ยืนยันการลบ
            </button>
          </div>
        }
      >
        <div className="finance-form">
          <section className="finance-danger-sheet">
            <div className="finance-danger-sheet-copy">
              <div className="finance-panel-title">สิ่งที่จะเกิดขึ้นหลังลบ</div>
              <div className="finance-panel-copy">
                แผนชำระนี้จะหายจากหน้า Planner แต่บัญชีหนี้จริงและรายการธุรกรรมเดิมยังอยู่เหมือนเดิม
              </div>
            </div>
            <div className="finance-danger-checklist">
              <div className="finance-danger-check">บัญชีบัตรเครดิตหรือสินเชื่อจะไม่ถูกลบ</div>
              <div className="finance-danger-check">รายการธุรกรรมเดิมจะยังอยู่ในระบบ</div>
              <div className="finance-danger-check">หากยังอยากเก็บไว้ แนะนำให้เปลี่ยนสถานะเป็นพักไว้แทน</div>
            </div>
          </section>
        </div>
      </Sheet>
    </ScreenShell>
  );
}
