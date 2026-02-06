// src/constants/categories.js
/**
 * ✅ Default categories with Parent/Child (Main/Sub) hierarchy
 *
 * Notes:
 * - `parentId: ""` means "main category"
 * - Child categories use `parentId: "<mainId>"`
 * - Tombstone strategy is handled in store: delete marks isDeleted/deletedAt, but keeps the record for history.
 */
export const DEFAULT_CATEGORIES = {
  expense: [
    // ----- Food (Main) -----
    { id: "food", name: "อาหาร", icon: "🍜", color: "#FF6B6B", parentId: "" },
    { id: "breakfast", name: "อาหารเช้า", icon: "🍳", color: "#FF6B6B", parentId: "food" },
    { id: "coffee", name: "กาแฟ/ชา", icon: "☕", color: "#A78BFA", parentId: "food" },
    { id: "dining", name: "กินข้าวนอกบ้าน", icon: "🍽️", color: "#FB7185", parentId: "food" },
    { id: "snacks", name: "ขนม", icon: "🍪", color: "#F59E0B", parentId: "food" },
    { id: "drinks", name: "เครื่องดื่ม", icon: "🥤", color: "#34D399", parentId: "food" },
    { id: "groceries", name: "ของกิน/ของใช้", icon: "🛒", color: "#FF9F43", parentId: "food" },

    // ----- Transport -----
    { id: "transport", name: "เดินทาง", icon: "🚗", color: "#4ECDC4", parentId: "" },
    { id: "fuel", name: "น้ำมัน/ชาร์จรถ", icon: "⛽", color: "#48BFE3", parentId: "transport" },

    // ----- Bills -----
    { id: "bills", name: "บิล/น้ำไฟ/เน็ต", icon: "🧾", color: "#F59E0B", parentId: "" },
    { id: "phone_internet", name: "มือถือ/แพ็กเกจ", icon: "📱", color: "#6366F1", parentId: "bills" },
    { id: "subscriptions", name: "Subscription", icon: "🔁", color: "#8B5CF6", parentId: "bills" },

    // ----- Essentials / Lifestyle -----
    { id: "rent", name: "ค่าเช่า/ที่พัก", icon: "🏠", color: "#60A5FA", parentId: "" },
    { id: "shopping", name: "ช้อปปิ้ง", icon: "🛍️", color: "#FBBF24", parentId: "" },
    { id: "entertainment", name: "บันเทิง", icon: "🎬", color: "#5F27CD", parentId: "" },
    { id: "travel", name: "ท่องเที่ยว", icon: "✈️", color: "#22C55E", parentId: "" },

    // ----- Health & Care -----
    { id: "health", name: "สุขภาพ/ยา", icon: "💊", color: "#54A0FF", parentId: "" },
    { id: "fitness", name: "ฟิตเนส/กีฬา", icon: "🏋️", color: "#10B981", parentId: "" },
    { id: "beauty", name: "ความงาม/ดูแลตัวเอง", icon: "💅", color: "#F472B6", parentId: "" },

    // ----- Family / Home -----
    { id: "pets", name: "สัตว์เลี้ยง", icon: "🐶", color: "#F97316", parentId: "" },
    { id: "kids", name: "ลูก/ครอบครัว", icon: "👶", color: "#FB7185", parentId: "" },
    { id: "home", name: "ของใช้ในบ้าน", icon: "🧹", color: "#94A3B8", parentId: "" },

    // ----- Work / Tools -----
    { id: "education", name: "การเรียน/คอร์ส", icon: "📚", color: "#38BDF8", parentId: "" },
    { id: "work", name: "งาน/อุปกรณ์ทำงาน", icon: "💼", color: "#64748B", parentId: "" },

    // ----- Finance / Adjustments -----
    { id: "fees", name: "ค่าธรรมเนียม/ดอกเบี้ย", icon: "🏦", color: "#EF4444", parentId: "" },
    // ✅ Receipt adjustment: discount (stored as expense line with adjustmentEffect="subtract")
    { id: "discount", name: "ส่วนลด", icon: "🏷️", color: "#10B981", parentId: "" },
    { id: "adjust_balance", name: "ปรับยอดบัญชี", icon: "🧮", color: "#6B7280", parentId: "" },
    { id: "insurance", name: "ประกัน", icon: "🛡️", color: "#0EA5E9", parentId: "" },
    { id: "donation", name: "บริจาค", icon: "❤️", color: "#F43F5E", parentId: "" },
    { id: "gift", name: "ของขวัญ", icon: "🎁", color: "#E879F9", parentId: "" },

    // ----- Misc -----
    // ✅ Neutral category for "one receipt, many categories" parent transaction (UI-only)
    { id: "mixed", name: "หลายหมวด", icon: "🧩", color: "#A3A3A3", parentId: "" },
    { id: "other", name: "อื่นๆ", icon: "📦", color: "#C8D6E5", parentId: "" },
  ],

  income: [
    // ----- Main groups (parents) -----
    { id: "employment", name: "งานประจำ", icon: "💼", color: "#1DD1A1", parentId: "" },
    { id: "side_hustle", name: "งานเสริม/ธุรกิจ", icon: "🧑‍💻", color: "#60A5FA", parentId: "" },
    { id: "investments", name: "การลงทุน", icon: "📈", color: "#54A0FF", parentId: "" },

    // ----- Employment (children) -----
    { id: "salary", name: "เงินเดือน", icon: "💰", color: "#1DD1A1", parentId: "employment" },
    { id: "bonus", name: "โบนัส", icon: "🎁", color: "#F368E0", parentId: "employment" },

    // ----- Side / Business (children) -----
    { id: "freelance", name: "ฟรีแลนซ์", icon: "🧑‍💻", color: "#60A5FA", parentId: "side_hustle" },
    { id: "business", name: "รายได้ธุรกิจ", icon: "🏪", color: "#22C55E", parentId: "side_hustle" },

    // ----- Investments (children) -----
    { id: "investment", name: "ลงทุน", icon: "📈", color: "#54A0FF", parentId: "investments" },
    { id: "interest", name: "ดอกเบี้ย", icon: "🏦", color: "#0EA5E9", parentId: "investments" },
    { id: "dividend", name: "เงินปันผล", icon: "🪙", color: "#F59E0B", parentId: "investments" },

    // ----- Adjust / Other -----
    { id: "adjust_balance", name: "ปรับยอดบัญชี", icon: "🧮", color: "#6B7280", parentId: "" },

    { id: "other_income", name: "อื่นๆ", icon: "🧩", color: "#C8D6E5", parentId: "" },
    { id: "refund", name: "เงินคืน", icon: "↩️", color: "#FF9F43", parentId: "other_income" },
    { id: "gift_income", name: "ของขวัญ/ได้เงิน", icon: "🎉", color: "#A78BFA", parentId: "other_income" },
  ],
};
