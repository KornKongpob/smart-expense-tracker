import { useState } from "react";
import { Check, ChevronRight, Sparkles, Target, Wallet } from "lucide-react";
import { parseMoneyToSatang, sanitizeMoneyInput } from "../utils/money";

const STEPS = [
  {
    icon: <Sparkles size={38} className="text-[color:var(--accent-ink)]" />,
    subtitle: "Smart Expense Tracker",
    title: "เริ่มบันทึกรายจ่ายให้เห็นภาพตั้งแต่วันแรก",
    description: "สแกนใบเสร็จ กรอกเอง หรือเปิด Inbox เพื่อตรวจรายการที่ต้องยืนยันจากหน้าเดียวกัน",
    points: [
      "สแกนใบเสร็จแล้วแยกรายการได้เร็วขึ้น",
      "ดูยอดวันนี้และยอดเดือนโดยไม่ต้องสลับหลายหน้า",
      "เริ่มใช้งานได้ทันทีแม้มีแค่บัญชีเงินสด",
    ],
  },
  {
    icon: <Wallet size={38} className="text-emerald-600" />,
    subtitle: "บัญชีเริ่มต้น",
    title: "ระบบเตรียมบัญชีเงินสดไว้ให้แล้ว",
    description: "เพิ่มบัญชีธนาคารหรือบัตรเครดิตทีหลังได้จากหน้า บัญชี โดยไม่ต้องตั้งค่าทุกอย่างก่อนเริ่ม",
    points: [
      "ใช้บันทึกรายการพื้นฐานได้ทันที",
      "ค่อยเพิ่มบัญชีจริงเมื่อพร้อม",
      "ช่วยให้เริ่มเก็บข้อมูลได้เร็วขึ้น",
    ],
  },
  {
    icon: <Target size={38} className="text-amber-600" />,
    subtitle: "ตัวช่วยเพิ่มเติม",
    title: "ตั้งงบรายเดือนเพื่อดูว่าใช้เกินเมื่อไร",
    description: "ไม่บังคับ คุณข้ามขั้นตอนนี้ได้ แล้วกลับมาตั้งงบภายหลังในหน้า Budgets",
    points: [
      "ช่วยเทียบยอดใช้จริงกับงบรวมของเดือน",
      "เหมาะกับการเช็กแนวโน้มก่อนยอดปลายเดือนพุ่ง",
      "แก้ไขหรือตั้งเพิ่มทีหลังได้เสมอ",
    ],
    hasBudgetInput: true,
  },
];

function StepDots({ current, total }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={[
            "h-2 rounded-full transition-all duration-300",
            index === current ? "w-8 bg-[color:var(--accent)]" : "w-2 bg-slate-900/12",
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
      return;
    }

    setStep((value) => Math.min(value + 1, STEPS.length - 1));
  };

  const handleSkip = () => {
    onComplete({ monthlyBudget: 0 });
  };

  return (
    <div className="app-onboarding">
      <div className="app-onboarding-panel">
        <div className="app-onboarding-brand">
          <Sparkles size={14} />
          Smart Expense Tracker
        </div>

        <div className="app-onboarding-surface animate-fade-in-up">
          <div className="app-onboarding-meta">
            <div className="app-onboarding-step">Step {step + 1} / {STEPS.length}</div>
            <StepDots current={step} total={STEPS.length} />
          </div>

          <div className="app-onboarding-icon">{current.icon}</div>

          <div className="app-onboarding-copy">
            <div className="app-onboarding-subtitle">{current.subtitle}</div>
            <h1 className="app-onboarding-title">{current.title}</h1>
            <p className="app-onboarding-description">{current.description}</p>
          </div>

          <div className="app-onboarding-points">
            {current.points.map((point) => (
              <div key={point} className="app-onboarding-point">
                <span className="app-onboarding-point-dot" aria-hidden="true" />
                <div className="text-sm font-semibold leading-6 text-[color:var(--text)]">{point}</div>
              </div>
            ))}
          </div>

          {current.hasBudgetInput ? (
            <div className="mt-5">
              <label className="ui-label mb-2 block">งบรายเดือน (บาท)</label>
              <input
                type="text"
                inputMode="decimal"
                className="ui-input text-center text-lg font-semibold"
                placeholder="เช่น 15000"
                value={budgetInput}
                onChange={(event) => setBudgetInput(sanitizeMoneyInput(event.target.value))}
              />
              <div className="mt-2 text-xs font-semibold text-[color:var(--muted)]">
                ข้ามได้ แล้วกลับมาตั้งงบเพิ่มเติมภายหลังในหน้า Budgets
              </div>
            </div>
          ) : null}

          <div className="app-onboarding-actions">
            <button type="button" onClick={handleNext} className="ui-btn ui-btn-primary w-full text-base">
              {isLast ? (
                <>
                  <Check size={18} />
                  เริ่มใช้งาน
                </>
              ) : (
                <>
                  ถัดไป
                  <ChevronRight size={18} />
                </>
              )}
            </button>

            {step > 0 ? (
              <button type="button" onClick={handleSkip} className="ui-btn ui-btn-secondary w-full text-sm">
                ข้ามทั้งหมด
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
