import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
  Send,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import {
  ASSISTANT_SUGGESTED_PROMPTS,
  LOCAL_ASSISTANT_PRIVACY_NOTE,
  answerLocalAssistantQuestion,
} from "../features/assistant/localAssistant.js";
import { EmptyPanel, ScreenShell, StatusPill } from "../features/app/ui.jsx";

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function severityMeta(severity) {
  const key = String(severity || "info").toLowerCase();
  if (key === "critical") {
    return {
      icon: <ShieldAlert size={17} />,
      tone: "danger",
      label: "เร่งด่วน",
    };
  }
  if (key === "warning") {
    return {
      icon: <AlertTriangle size={17} />,
      tone: "warning",
      label: "ควรดู",
    };
  }
  if (key === "success") {
    return {
      icon: <CheckCircle2 size={17} />,
      tone: "success",
      label: "ดีอยู่",
    };
  }
  return {
    icon: <Info size={17} />,
    tone: "default",
    label: "ข้อมูล",
  };
}

function AnswerCard({ item, onNavigate }) {
  const meta = severityMeta(item?.severity);
  const canNavigate = item?.actionView && typeof onNavigate === "function";

  return (
    <div className="finance-row">
      <div className="finance-row-main">
        <span className="finance-category-icon finance-account-icon">{meta.icon}</span>
        <div className="finance-account-copy">
          <div className="finance-row-title">{item?.title || "คำแนะนำ"}</div>
          {item?.body ? <div className="finance-row-meta finance-row-meta-wrap">{item.body}</div> : null}
          <div className="finance-chip-grid">
            <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
            {item?.meta?.domain ? <StatusPill tone="default">{item.meta.domain}</StatusPill> : null}
          </div>
        </div>
      </div>

      {canNavigate ? (
        <div className="finance-row-side">
          <button
            type="button"
            className="ui-btn ui-btn-secondary"
            onClick={() => onNavigate(item.actionView, item.actionPayload)}
          >
            {item.actionLabel || "เปิดดู"}
            <ChevronRight size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AssistantAnswer({ answer, onNavigate }) {
  const cards = listOf(answer?.cards);

  return (
    <article className="ui-card finance-panel" data-testid="assistant-answer">
      <div className="finance-panel-head">
        <div>
          <div className="finance-panel-title">{answer?.title || "ผู้ช่วยการเงิน"}</div>
          {answer?.summary ? <div className="finance-panel-copy">{answer.summary}</div> : null}
        </div>
        <Sparkles size={18} className="text-slate-500" />
      </div>

      {cards.length ? (
        <div className="finance-list">
          {cards.map((item, index) => (
            <AnswerCard key={item?.id || `${answer?.intent || "answer"}-${index}`} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      ) : (
        <EmptyPanel
          title="ยังไม่มีคำตอบที่ชัดเจน"
          copy="เพิ่มรายการ/ตั้งงบ/ตั้ง recurring เพื่อให้ผู้ช่วยแนะนำได้แม่นขึ้น"
        />
      )}
    </article>
  );
}

function PromptChips({ prompts, onAsk }) {
  return (
    <div className="finance-chip-grid" data-testid="assistant-prompt-chips">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          className="ui-btn ui-btn-secondary"
          onClick={() => onAsk(prompt)}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

export default function AssistantView({ state = {}, today = null, onNavigate }) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const prompts = useMemo(() => [...ASSISTANT_SUGGESTED_PROMPTS], []);
  const starterAnswer = useMemo(
    () => answerLocalAssistantQuestion(state, "ช่วยแนะนำ action ต่อไป", { today }),
    [state, today],
  );

  const ask = (question) => {
    const text = String(question || "").trim();
    if (!text) return;

    const answer = answerLocalAssistantQuestion(state, text, { today });
    setMessages((current) => [
      ...current,
      { id: `q-${Date.now()}-${current.length}`, role: "user", text },
      { id: `a-${Date.now()}-${current.length}`, role: "assistant", answer },
    ].slice(-10));
    setDraft("");
  };

  const submit = (event) => {
    event.preventDefault();
    ask(draft);
  };

  return (
    <ScreenShell
      title="ผู้ช่วยการเงิน"
      subtitle="ถามคำถามสั้น ๆ จากข้อมูลในเครื่อง"
      headerMode="visible"
    >
      <article className="ui-card finance-panel">
        <div className="finance-panel-head">
          <div>
            <div className="finance-panel-title">ถามผู้ช่วย</div>
            <div className="finance-panel-copy">เลือก prompt หรือพิมพ์คำถามสั้น ๆ</div>
          </div>
          <Sparkles size={18} className="text-slate-500" />
        </div>

        <form className="finance-form" onSubmit={submit}>
          <label className="finance-field">
            <span className="ui-label">คำถาม</span>
            <input
              className="ui-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="เช่น เดือนนี้เหลือใช้เท่าไร"
              autoComplete="off"
              data-testid="assistant-input"
            />
          </label>
          <button type="submit" className="ui-btn ui-btn-primary" data-testid="assistant-submit">
            <Send size={16} />
            ถาม
          </button>
        </form>

        <PromptChips prompts={prompts} onAsk={ask} />

        <div className="finance-inline-note" data-testid="assistant-privacy-note">
          <Info size={16} />
          <div>{LOCAL_ASSISTANT_PRIVACY_NOTE}</div>
        </div>
      </article>

      {messages.length ? (
        <div className="view-flow">
          {messages.map((message) =>
            message.role === "user" ? (
              <div key={message.id} className="finance-inline-note">
                <strong>คุณถาม:</strong>
                <span>{message.text}</span>
              </div>
            ) : (
              <AssistantAnswer key={message.id} answer={message.answer} onNavigate={onNavigate} />
            ),
          )}
        </div>
      ) : (
        <AssistantAnswer answer={starterAnswer} onNavigate={onNavigate} />
      )}
    </ScreenShell>
  );
}
