// src/components/OnboardingScreen.jsx
// Welcome screen shown to first-time users (no transactions yet).
// 3 steps: Welcome → Set monthly budget → Start recording.

import { useState } from "react";
import { Sparkles, Wallet, Target, ChevronRight, Check } from "lucide-react";
import { parseMoneyToSatang, sanitizeMoneyInput } from "../utils/money";

const STEPS = [
  {
    icon: <Sparkles size={40} className="text-indigo-600" />,
    title: "ยินดีต้อนรับ!",
    subtitle: "Smart Expense Tracker",
    description: "แอปจดบันทึกรายรับ-รายจ่ายอัจฉริยะ สแกนใบเสร็จ ตั้งงบ และวิเคราะห์การใช้จ่ายของคุณ",
  },
  {
    icon: <Wallet size={40} className="text-emerald-600" />,
    title: "บัญชีเริ่มต้น",
    subtitle: "เงินสด",
    description: "ระบบสร้างบัญชี \"เงินสด\" ให้แล้ว คุณสามารถเพิ่มบัญชีธนาคาร หรือบัตรเครดิตได้ภายหลังที่หน้า \"บัญชี\"",
  },
  {
    icon: <Target size={40} className="text-amber-600" />,
    title: "ตั้งงบรายเดือน",
    subtitle: "ไม่บังคับ — ข้ามได้",
    description: "กำหนดงบรายเดือนเพื่อช่วยให้คุณเห็นภาพรวมการใช้จ่าย",
    hasBudgetInput: true,
  },
];

function StepDots({ current, total }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={[
            "h-2 rounded-full transition-all duration-300",
            i === current ? "w-8 bg-indigo-600" : "w-2 bg-gray-900/15",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

export default function OnboardingScreen({ onComplete }) {
  const [step, setStep] = useState(0);
  const [budgetInput, setBudgetInput] = useState("");

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      const budgetSatang = parseMoneyToSatang(budgetInput);
      onComplete({ monthlyBudget: budgetSatang > 0 ? budgetSatang : 0 });
    } else {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  };

  const handleSkip = () => {
    onComplete({ monthlyBudget: 0 });
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 py-12">
      {/* Card */}
      <div className="w-full max-w-sm ui-card-strong p-8 text-center animate-fade-in-up">
        {/* Icon */}
        <div className="w-20 h-20 rounded-3xl bg-white/60 border border-white/30 shadow-lg mx-auto flex items-center justify-center mb-6">
          {current.icon}
        </div>

        {/* Title */}
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
          {current.title}
        </h1>
        <div className="mt-1 text-sm font-bold text-gray-700/70">
          {current.subtitle}
        </div>

        {/* Description */}
        <p className="mt-4 text-sm text-gray-800/75 font-semibold leading-relaxed">
          {current.description}
        </p>

        {/* Budget input (step 3 only) */}
        {current.hasBudgetInput && (
          <div className="mt-6">
            <label className="ui-label text-left block mb-2">งบรายเดือน (บาท)</label>
            <input
              type="text"
              inputMode="decimal"
              className="ui-input text-center text-lg font-semibold"
              placeholder="เช่น 15000"
              value={budgetInput}
              onChange={(e) => setBudgetInput(sanitizeMoneyInput(e.target.value))}
            />
            <div className="mt-2 text-xs text-gray-600/70 font-bold">
              ข้ามได้ — ตั้งทีหลังที่หน้า Budgets
            </div>
          </div>
        )}

        {/* Dots */}
        <StepDots current={step} total={STEPS.length} />

        {/* Actions */}
        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleNext}
            className="ui-btn ui-btn-primary w-full text-base"
          >
            {isLast ? (
              <>
                <Check size={18} /> เริ่มใช้งาน
              </>
            ) : (
              <>
                ต่อไป <ChevronRight size={18} />
              </>
            )}
          </button>

          {step > 0 && (
            <button
              type="button"
              onClick={handleSkip}
              className="ui-btn ui-btn-secondary w-full text-sm"
            >
              ข้ามทั้งหมด
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
