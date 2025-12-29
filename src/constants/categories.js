// src/constants/categories.js
/**
 * ✅ ปรับชุดหมวดหมู่เริ่มต้น (DEFAULT_CATEGORIES)
 * เป้าหมาย:
 * 1) เพิ่มจำนวนหมวดหมู่ให้ครอบคลุมการใช้งานจริงมากขึ้น (ตาม requirement)
 * 2) ใช้ Emoji ที่ “ดูสวย + อ่านง่าย” บนมือถือ
 * 3) สีสื่อความหมาย/แยกกลุ่มชัด และยังคงเป็นธีมที่เข้ากับ glassmorphism
 *
 * หมายเหตุ:
 * - id ต้อง unique และควรเป็น slug แบบคงที่ เพราะถูกใช้อ้างอิงใน transactions
 * - ถ้ามีรายการเก่าที่อ้าง id เดิม เช่น "food" "transport" ฯลฯ จะยังทำงานได้เหมือนเดิม
 */
export const DEFAULT_CATEGORIES = {
  expense: [
    // Essentials
    { id: "food", name: "อาหาร", icon: "🍜", color: "#FF6B6B" },
    { id: "groceries", name: "ของกิน/ของใช้", icon: "🛒", color: "#FF9F43" },
    { id: "transport", name: "เดินทาง", icon: "🚗", color: "#4ECDC4" },
    { id: "fuel", name: "น้ำมัน/ชาร์จรถ", icon: "⛽", color: "#48BFE3" },
    { id: "bills", name: "บิล/น้ำไฟ/เน็ต", icon: "🧾", color: "#F59E0B" },
    { id: "rent", name: "ค่าเช่า/ที่พัก", icon: "🏠", color: "#60A5FA" },

    // Lifestyle
    { id: "shopping", name: "ช้อปปิ้ง", icon: "🛍️", color: "#FBBF24" },
    { id: "coffee", name: "กาแฟ/ชา", icon: "☕", color: "#A78BFA" },
    { id: "dining", name: "กินข้าวนอกบ้าน", icon: "🍽️", color: "#FB7185" },
    { id: "entertainment", name: "บันเทิง", icon: "🎬", color: "#5F27CD" },
    { id: "travel", name: "ท่องเที่ยว", icon: "✈️", color: "#22C55E" },

    // Health & Care
    { id: "health", name: "สุขภาพ/ยา", icon: "💊", color: "#54A0FF" },
    { id: "fitness", name: "ฟิตเนส/กีฬา", icon: "🏋️", color: "#10B981" },
    { id: "beauty", name: "ความงาม/ดูแลตัวเอง", icon: "💅", color: "#F472B6" },

    // Family / Home
    { id: "pets", name: "สัตว์เลี้ยง", icon: "🐶", color: "#F97316" },
    { id: "kids", name: "ลูก/ครอบครัว", icon: "👶", color: "#FB7185" },
    { id: "home", name: "ของใช้ในบ้าน", icon: "🧹", color: "#94A3B8" },

    // Work / Tools
    { id: "education", name: "การเรียน/คอร์ส", icon: "📚", color: "#38BDF8" },
    { id: "work", name: "งาน/อุปกรณ์ทำงาน", icon: "💼", color: "#64748B" },
    { id: "phone_internet", name: "มือถือ/แพ็กเกจ", icon: "📱", color: "#6366F1" },
    { id: "subscriptions", name: "Subscription", icon: "🔁", color: "#8B5CF6" },

    // Finance
    { id: "fees", name: "ค่าธรรมเนียม/ดอกเบี้ย", icon: "🏦", color: "#EF4444" },
    { id: "adjust_balance", name: "ปรับยอดบัญชี", icon: "🧮", color: "#6B7280" },
    { id: "insurance", name: "ประกัน", icon: "🛡️", color: "#0EA5E9" },
    { id: "donation", name: "บริจาค", icon: "❤️", color: "#F43F5E" },
    { id: "gift", name: "ของขวัญ", icon: "🎁", color: "#E879F9" },

    // Misc
    { id: "other", name: "อื่นๆ", icon: "📦", color: "#C8D6E5" },
  ],

  income: [
    // Main
    { id: "salary", name: "เงินเดือน", icon: "💰", color: "#1DD1A1" },
    { id: "bonus", name: "โบนัส", icon: "🎁", color: "#F368E0" },

    // Side/Business
    { id: "freelance", name: "ฟรีแลนซ์", icon: "🧑‍💻", color: "#60A5FA" },
    { id: "business", name: "รายได้ธุรกิจ", icon: "🏪", color: "#22C55E" },

    // Investments
    { id: "investment", name: "ลงทุน", icon: "📈", color: "#54A0FF" },
    { id: "interest", name: "ดอกเบี้ย", icon: "🏦", color: "#0EA5E9" },
    { id: "adjust_balance", name: "ปรับยอดบัญชี", icon: "🧮", color: "#6B7280" },
    { id: "dividend", name: "เงินปันผล", icon: "🪙", color: "#F59E0B" },

    // Other
    { id: "refund", name: "เงินคืน", icon: "↩️", color: "#FF9F43" },
    { id: "gift_income", name: "ของขวัญ/ได้เงิน", icon: "🎉", color: "#A78BFA" },
    { id: "other_income", name: "อื่นๆ", icon: "🧩", color: "#C8D6E5" },
  ],
};
