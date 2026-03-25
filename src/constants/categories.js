// src/constants/categories.js
/**
 * ✅ Default categories with Parent/Child (Main/Sub) hierarchy
 *
 * Notes:
 * - `parentId: ""` means "main category"
 * - Child categories use `parentId: "<mainId>"`
 * - Tombstone strategy is handled in store: delete marks isDeleted/deletedAt, but keeps the record for history.
 *
 * Design goal:
 * - Provide a broad, App Store–grade set of categories that fits most personal finance use cases.
 * - Keep IDs stable and predictable (used by scan / migration / history).
 */
export const DEFAULT_CATEGORIES = {
  expense: [
    // =====================================================================
    // EXPENSE (รายจ่าย)
    // =====================================================================

    // ----- Food & Drink -----
    { id: "food", name: "อาหาร & เครื่องดื่ม", icon: "🍜", color: "#FF6B6B", parentId: "" },
    { id: "breakfast", name: "อาหารเช้า", icon: "🍳", color: "#FF6B6B", parentId: "food" },
    { id: "lunch", name: "อาหารกลางวัน", icon: "🍱", color: "#FF6B6B", parentId: "food" },
    { id: "dinner", name: "อาหารเย็น", icon: "🍛", color: "#FF6B6B", parentId: "food" },
    { id: "dining", name: "กินข้าวนอกบ้าน", icon: "🍽️", color: "#FB7185", parentId: "food" },
    { id: "street_food", name: "สตรีทฟู้ด", icon: "🌮", color: "#FF9F43", parentId: "food" },
    { id: "delivery", name: "เดลิเวอรี", icon: "🛵", color: "#4ECDC4", parentId: "food" },
    { id: "fast_food", name: "ฟาสต์ฟู้ด", icon: "🍔", color: "#F59E0B", parentId: "food" },
    { id: "coffee", name: "กาแฟ/ชา", icon: "☕", color: "#A78BFA", parentId: "food" },
    { id: "milk_tea", name: "ชานม/ชาไข่มุก", icon: "🧋", color: "#C084FC", parentId: "food" },
    { id: "drinks", name: "เครื่องดื่ม", icon: "🥤", color: "#34D399", parentId: "food" },
    { id: "snacks", name: "ขนม/ของทานเล่น", icon: "🍪", color: "#F59E0B", parentId: "food" },
    { id: "dessert", name: "ของหวาน", icon: "🍰", color: "#F368E0", parentId: "food" },
    { id: "bakery", name: "เบเกอรี", icon: "🍞", color: "#FFE66D", parentId: "food" },
    { id: "alcohol", name: "แอลกอฮอล์", icon: "🍺", color: "#485460", parentId: "food" },
    { id: "groceries", name: "ของกิน/ของใช้ (ซูเปอร์)", icon: "🛒", color: "#FF9F43", parentId: "food" },
    { id: "meal_prep", name: "วัตถุดิบทำอาหาร", icon: "🥬", color: "#22C55E", parentId: "food" },
    { id: "supplements", name: "วิตามิน/อาหารเสริม", icon: "💊", color: "#38BDF8", parentId: "food" },

    // ----- Transport -----
    { id: "transport", name: "เดินทาง", icon: "🚗", color: "#4ECDC4", parentId: "" },
    { id: "fuel", name: "น้ำมัน/ชาร์จรถ", icon: "⛽", color: "#48BFE3", parentId: "transport" },
    { id: "public_transit", name: "รถไฟฟ้า/รถเมล์/รถไฟ", icon: "🚇", color: "#54A0FF", parentId: "transport" },
    { id: "taxi", name: "แท็กซี่", icon: "🚕", color: "#FFE66D", parentId: "transport" },
    { id: "ride_hailing", name: "เรียกรถ (Grab/Bolt)", icon: "📍", color: "#1DD1A1", parentId: "transport" },
    { id: "parking", name: "ที่จอดรถ", icon: "🅿️", color: "#C8D6E5", parentId: "transport" },
    { id: "tolls", name: "ทางด่วน/ค่าผ่านทาง", icon: "🛣️", color: "#6366F1", parentId: "transport" },
    { id: "vehicle_service", name: "ซ่อมบำรุงรถ", icon: "🧰", color: "#94A3B8", parentId: "transport" },
    { id: "vehicle_wash", name: "ล้างรถ", icon: "🧽", color: "#0EA5E9", parentId: "transport" },
    { id: "ev_charge", name: "ค่าชาร์จรถ EV", icon: "🔋", color: "#10B981", parentId: "transport" },
    { id: "car_rental", name: "เช่ารถ/รถแทน", icon: "🚘", color: "#60A5FA", parentId: "transport" },

    // ----- Housing / Home -----
    { id: "housing", name: "ที่อยู่อาศัย", icon: "🏠", color: "#60A5FA", parentId: "" },
    { id: "rent", name: "ค่าเช่า/ที่พัก", icon: "🏠", color: "#60A5FA", parentId: "housing" },
    { id: "mortgage", name: "ผ่อนบ้าน/สินเชื่อบ้าน", icon: "🏡", color: "#54A0FF", parentId: "housing" },
    { id: "condo_fee", name: "ค่าส่วนกลาง/นิติ", icon: "🏢", color: "#94A3B8", parentId: "housing" },
    { id: "home", name: "ของใช้ในบ้าน", icon: "🧹", color: "#94A3B8", parentId: "housing" },
    { id: "furniture", name: "เฟอร์นิเจอร์", icon: "🛋️", color: "#C8D6E5", parentId: "housing" },
    { id: "appliances", name: "เครื่องใช้ไฟฟ้า", icon: "🔌", color: "#6366F1", parentId: "housing" },
    { id: "home_repair", name: "ซ่อมบ้าน/ช่าง", icon: "🔧", color: "#485460", parentId: "housing" },
    { id: "cleaning", name: "ทำความสะอาด/แม่บ้าน", icon: "🧼", color: "#0EA5E9", parentId: "housing" },
    { id: "laundry", name: "ซักรีด", icon: "🧺", color: "#A78BFA", parentId: "housing" },

    // ----- Bills / Utilities -----
    { id: "bills", name: "บิล/ค่าสาธารณูปโภค", icon: "🧾", color: "#F59E0B", parentId: "" },
    { id: "electricity", name: "ค่าไฟ", icon: "💡", color: "#FFE66D", parentId: "bills" },
    { id: "water", name: "ค่าน้ำ", icon: "💧", color: "#54A0FF", parentId: "bills" },
    { id: "gas", name: "ค่าแก๊ส", icon: "🔥", color: "#F97316", parentId: "bills" },
    { id: "internet_home", name: "อินเทอร์เน็ตบ้าน", icon: "🌐", color: "#0EA5E9", parentId: "bills" },
    { id: "phone_internet", name: "มือถือ/แพ็กเกจ", icon: "📱", color: "#6366F1", parentId: "bills" },
    { id: "cable_tv", name: "ทีวี/เคเบิล", icon: "📺", color: "#485460", parentId: "bills" },
    { id: "subscriptions", name: "สมาชิก/Subscription", icon: "🔁", color: "#8B5CF6", parentId: "bills" },
    { id: "cloud_storage", name: "คลาวด์/พื้นที่เก็บข้อมูล", icon: "☁️", color: "#38BDF8", parentId: "bills" },
    { id: "software_subscription", name: "ค่าซอฟต์แวร์รายเดือน", icon: "💻", color: "#6366F1", parentId: "bills" },

    // ----- Shopping -----
    { id: "shopping", name: "ช้อปปิ้ง", icon: "🛍️", color: "#FBBF24", parentId: "" },
    { id: "clothing", name: "เสื้อผ้า", icon: "👕", color: "#FF6B6B", parentId: "shopping" },
    { id: "shoes", name: "รองเท้า", icon: "👟", color: "#4ECDC4", parentId: "shopping" },
    { id: "accessories", name: "เครื่องประดับ/นาฬิกา", icon: "⌚", color: "#A78BFA", parentId: "shopping" },
    { id: "electronics", name: "อิเล็กทรอนิกส์", icon: "💻", color: "#6366F1", parentId: "shopping" },
    { id: "online_shopping", name: "ซื้อออนไลน์", icon: "📦", color: "#0EA5E9", parentId: "shopping" },
    { id: "household_goods", name: "ของใช้จิปาถะ", icon: "🧴", color: "#C8D6E5", parentId: "shopping" },
    { id: "gadgets", name: "แก็ดเจ็ต/อุปกรณ์เสริม", icon: "🎧", color: "#818CF8", parentId: "shopping" },
    { id: "home_decor", name: "ของตกแต่งบ้าน", icon: "🪴", color: "#22C55E", parentId: "shopping" },

    // ----- Personal Care -----
    { id: "personal_care", name: "ดูแลตัวเอง", icon: "💆", color: "#F368E0", parentId: "" },
    { id: "beauty", name: "ความงาม/สกินแคร์", icon: "💅", color: "#F472B6", parentId: "personal_care" },
    { id: "hair", name: "ทำผม/ตัดผม", icon: "💇", color: "#A78BFA", parentId: "personal_care" },
    { id: "spa", name: "สปา/นวด", icon: "🧖", color: "#0EA5E9", parentId: "personal_care" },
    { id: "personal_items", name: "ของใช้ส่วนตัว", icon: "🧴", color: "#C8D6E5", parentId: "personal_care" },
    { id: "cosmetics", name: "เครื่องสำอาง", icon: "💄", color: "#FB7185", parentId: "personal_care" },
    { id: "barber", name: "ร้านตัดผม/บาร์เบอร์", icon: "💈", color: "#64748B", parentId: "personal_care" },

    // ----- Health & Fitness -----
    { id: "health", name: "สุขภาพ", icon: "💊", color: "#54A0FF", parentId: "" },
    { id: "pharmacy", name: "ยา/ร้านขายยา", icon: "💊", color: "#54A0FF", parentId: "health" },
    { id: "doctor", name: "พบแพทย์/คลินิก", icon: "🩺", color: "#0EA5E9", parentId: "health" },
    { id: "dental", name: "ทันตกรรม", icon: "🦷", color: "#4ECDC4", parentId: "health" },
    { id: "vision", name: "สายตา/แว่น", icon: "👓", color: "#6366F1", parentId: "health" },
    { id: "checkup", name: "ตรวจสุขภาพ", icon: "🧪", color: "#1DD1A1", parentId: "health" },
    { id: "mental_health", name: "สุขภาพจิต/นักจิตวิทยา", icon: "🧠", color: "#A78BFA", parentId: "health" },
    { id: "medical_devices", name: "อุปกรณ์ทางการแพทย์", icon: "🩺", color: "#38BDF8", parentId: "health" },

    { id: "fitness", name: "ออกกำลังกาย", icon: "🏋️", color: "#10B981", parentId: "" },
    { id: "gym", name: "ยิม/ฟิตเนส", icon: "🏋️", color: "#10B981", parentId: "fitness" },
    { id: "sports", name: "กีฬา/กิจกรรม", icon: "🏃", color: "#4ECDC4", parentId: "fitness" },
    { id: "fitness_class", name: "คลาส/เทรนเนอร์", icon: "🧘", color: "#A78BFA", parentId: "fitness" },
    { id: "sports_gear", name: "อุปกรณ์กีฬา", icon: "🎽", color: "#FF9F43", parentId: "fitness" },

    // ----- Entertainment -----
    { id: "entertainment", name: "บันเทิง", icon: "🎬", color: "#5F27CD", parentId: "" },
    { id: "movies", name: "หนัง/โรงภาพยนตร์", icon: "🎬", color: "#5F27CD", parentId: "entertainment" },
    { id: "music", name: "เพลง/สตรีมมิง", icon: "🎵", color: "#6366F1", parentId: "entertainment" },
    { id: "games", name: "เกม", icon: "🎮", color: "#F368E0", parentId: "entertainment" },
    { id: "events", name: "คอนเสิร์ต/อีเวนต์", icon: "🎟️", color: "#FF6B6B", parentId: "entertainment" },
    { id: "books", name: "หนังสือ/งานอดิเรก", icon: "📚", color: "#0EA5E9", parentId: "entertainment" },

    // ----- Education -----
    { id: "education", name: "การศึกษา", icon: "🎓", color: "#38BDF8", parentId: "" },
    { id: "tuition", name: "ค่าเรียน/ค่าเทอม", icon: "🎓", color: "#38BDF8", parentId: "education" },
    { id: "courses", name: "คอร์ส/อบรม", icon: "🧑‍🏫", color: "#0EA5E9", parentId: "education" },
    { id: "study_materials", name: "หนังสือ/อุปกรณ์เรียน", icon: "📚", color: "#6366F1", parentId: "education" },
    { id: "exam_fees", name: "ค่าสอบ/ใบรับรอง", icon: "🪪", color: "#485460", parentId: "education" },
    { id: "language_course", name: "คอร์สภาษา", icon: "🗣️", color: "#22C55E", parentId: "education" },
    { id: "school_activity", name: "กิจกรรมโรงเรียน", icon: "🏫", color: "#60A5FA", parentId: "education" },

    // ----- Travel -----
    { id: "travel", name: "ท่องเที่ยว", icon: "✈️", color: "#22C55E", parentId: "" },
    { id: "flights", name: "ตั๋วเครื่องบิน", icon: "✈️", color: "#22C55E", parentId: "travel" },
    { id: "accommodation", name: "ที่พัก", icon: "🏨", color: "#60A5FA", parentId: "travel" },
    { id: "travel_transport", name: "เดินทางระหว่างทริป", icon: "🚌", color: "#4ECDC4", parentId: "travel" },
    { id: "tours", name: "ทัวร์/กิจกรรม", icon: "🗺️", color: "#F59E0B", parentId: "travel" },
    { id: "visa", name: "วีซ่า/เอกสาร", icon: "🛂", color: "#485460", parentId: "travel" },
    { id: "souvenirs", name: "ของฝาก", icon: "🎁", color: "#A78BFA", parentId: "travel" },
    { id: "travel_sim", name: "SIM/Data ทริป", icon: "📶", color: "#38BDF8", parentId: "travel" },
    { id: "airport_transfer", name: "รถรับ-ส่งสนามบิน", icon: "🚐", color: "#0EA5E9", parentId: "travel" },

    // ----- Family & Pets -----
    { id: "family", name: "ครอบครัว", icon: "👨‍👩‍👧‍👦", color: "#FB7185", parentId: "" },
    { id: "kids", name: "ลูก/เด็ก", icon: "👶", color: "#FB7185", parentId: "family" },
    { id: "childcare", name: "ดูแลเด็ก/พี่เลี้ยง", icon: "🧸", color: "#FFE66D", parentId: "family" },
    { id: "parents_support", name: "ดูแลพ่อแม่/ผู้ใหญ่", icon: "👵", color: "#C8D6E5", parentId: "family" },
    { id: "eldercare", name: "ค่าดูแลผู้สูงอายุ", icon: "🧓", color: "#94A3B8", parentId: "family" },
    { id: "pets", name: "สัตว์เลี้ยง", icon: "🐶", color: "#F97316", parentId: "family" },
    { id: "pet_food", name: "อาหารสัตว์", icon: "🦴", color: "#FF9F43", parentId: "family" },
    { id: "pet_vet", name: "สัตวแพทย์", icon: "🏥", color: "#0EA5E9", parentId: "family" },
    { id: "pet_grooming", name: "อาบน้ำ/ตัดขน", icon: "🛁", color: "#A78BFA", parentId: "family" },

    // ----- Gifts / Social -----
    { id: "gift", name: "ของขวัญ/สังคม", icon: "🎁", color: "#E879F9", parentId: "" },
    { id: "celebrations", name: "งานเลี้ยง/สังสรรค์", icon: "🎉", color: "#FF6B6B", parentId: "gift" },
    { id: "dating", name: "เดต/ความสัมพันธ์", icon: "💐", color: "#F43F5E", parentId: "gift" },

    // ----- Work / Business -----
    { id: "work", name: "งาน/ธุรกิจ", icon: "💼", color: "#64748B", parentId: "" },
    { id: "office_supplies", name: "อุปกรณ์สำนักงาน", icon: "🗂️", color: "#94A3B8", parentId: "work" },
    { id: "software", name: "ซอฟต์แวร์/เครื่องมือ", icon: "🧩", color: "#6366F1", parentId: "work" },
    { id: "business_meals", name: "เลี้ยงรับรอง/พบลูกค้า", icon: "🥂", color: "#F59E0B", parentId: "work" },
    { id: "shipping", name: "ขนส่ง/พัสดุ", icon: "🚚", color: "#4ECDC4", parentId: "work" },
    { id: "marketing", name: "การตลาด/โฆษณา", icon: "📣", color: "#F368E0", parentId: "work" },
    { id: "coworking", name: "Coworking/ค่าใช้พื้นที่ทำงาน", icon: "🪑", color: "#94A3B8", parentId: "work" },
    { id: "domain_hosting", name: "Domain/Hosting", icon: "🌐", color: "#0EA5E9", parentId: "work" },
    { id: "professional_fees", name: "ค่าจ้างวิชาชีพ", icon: "🧾", color: "#64748B", parentId: "work" },

    // ----- Finance / Fees -----
    { id: "fees", name: "ค่าธรรมเนียม/ดอกเบี้ย", icon: "🏦", color: "#EF4444", parentId: "" },
    { id: "bank_fee", name: "ค่าธรรมเนียมธนาคาร", icon: "🏦", color: "#EF4444", parentId: "fees" },
    { id: "card_fee", name: "ค่าธรรมเนียมบัตร", icon: "💳", color: "#6366F1", parentId: "fees" },
    { id: "interest", name: "ดอกเบี้ย", icon: "📉", color: "#EF4444", parentId: "fees" },
    { id: "forex_fee", name: "ค่าธรรมเนียมแลกเงิน", icon: "💱", color: "#485460", parentId: "fees" },
    { id: "atm_fee", name: "ค่าธรรมเนียม ATM", icon: "🏧", color: "#EF4444", parentId: "fees" },
    { id: "platform_fee", name: "ค่าธรรมเนียมแพลตฟอร์ม", icon: "🧮", color: "#6366F1", parentId: "fees" },
    { id: "service_charge", name: "Service charge", icon: "🧾", color: "#F59E0B", parentId: "fees" },

    // ----- Debt / Installments -----
    { id: "debt", name: "หนี้/ผ่อนชำระ", icon: "🧾", color: "#485460", parentId: "" },
    { id: "loan_payment", name: "ชำระสินเชื่อ", icon: "🧾", color: "#485460", parentId: "debt" },
    { id: "credit_card_payment", name: "ชำระบัตรเครดิต", icon: "💳", color: "#6366F1", parentId: "debt" },
    { id: "installment", name: "ผ่อนสินค้า/งวด", icon: "📆", color: "#A78BFA", parentId: "debt" },

    // ----- Insurance -----
    { id: "insurance", name: "ประกัน", icon: "🛡️", color: "#0EA5E9", parentId: "" },
    { id: "car_insurance", name: "ประกันรถ", icon: "🚗", color: "#4ECDC4", parentId: "insurance" },
    { id: "health_insurance", name: "ประกันสุขภาพ", icon: "❤️", color: "#F43F5E", parentId: "insurance" },
    { id: "life_insurance", name: "ประกันชีวิต", icon: "🛡️", color: "#0EA5E9", parentId: "insurance" },
    { id: "travel_insurance", name: "ประกันเดินทาง", icon: "✈️", color: "#22C55E", parentId: "insurance" },
    { id: "device_insurance", name: "ประกันอุปกรณ์", icon: "📱", color: "#0EA5E9", parentId: "insurance" },
    { id: "property_insurance", name: "ประกันทรัพย์สิน", icon: "🏠", color: "#60A5FA", parentId: "insurance" },

    // ----- Taxes / Fines -----
    { id: "taxes", name: "ภาษี/ค่าปรับ", icon: "🧾", color: "#FF6B6B", parentId: "" },
    { id: "income_tax", name: "ภาษีเงินได้", icon: "🧾", color: "#FF6B6B", parentId: "taxes" },
    { id: "vehicle_tax", name: "ภาษีรถ", icon: "🚗", color: "#4ECDC4", parentId: "taxes" },
    { id: "fines", name: "ค่าปรับ/ใบสั่ง", icon: "🚨", color: "#EF4444", parentId: "taxes" },
    { id: "late_fee", name: "ค่าปรับล่าช้า", icon: "⏱️", color: "#F59E0B", parentId: "taxes" },
    { id: "property_tax", name: "ภาษีที่ดิน/อาคาร", icon: "🏘️", color: "#60A5FA", parentId: "taxes" },
    { id: "customs_duty", name: "ภาษีศุลกากร", icon: "📮", color: "#F97316", parentId: "taxes" },

    // ----- Giving -----
    { id: "donation", name: "บริจาค", icon: "❤️", color: "#F43F5E", parentId: "" },
    { id: "charity", name: "มูลนิธิ/การกุศล", icon: "🤝", color: "#F43F5E", parentId: "donation" },
    { id: "temple", name: "ทำบุญ/วัด", icon: "🛕", color: "#FFE66D", parentId: "donation" },

    // ----- Adjustments / System-like -----
    // ✅ Receipt adjustment: discount (stored as expense line with adjustmentEffect="subtract")
    { id: "discount", name: "ส่วนลด", icon: "🏷️", color: "#10B981", parentId: "" },
    { id: "adjust_balance", name: "ปรับยอดบัญชี", icon: "🧮", color: "#6B7280", parentId: "" },

    // ----- Misc -----
    // ✅ Neutral category for "one receipt, many categories" parent transaction (UI-only)
    { id: "mixed", name: "หลายหมวด", icon: "🧩", color: "#A3A3A3", parentId: "" },
    { id: "other", name: "อื่นๆ", icon: "📦", color: "#C8D6E5", parentId: "" },
  ],

  income: [
    // =====================================================================
    // INCOME (รายรับ)
    // =====================================================================

    // ----- Main groups (parents) -----
    { id: "employment", name: "งานประจำ", icon: "💼", color: "#1DD1A1", parentId: "" },
    { id: "side_hustle", name: "งานเสริม/ธุรกิจ", icon: "🧑‍💻", color: "#60A5FA", parentId: "" },
    { id: "investments", name: "การลงทุน", icon: "📈", color: "#54A0FF", parentId: "" },
    { id: "rental", name: "ค่าเช่า/ให้เช่า", icon: "🏠", color: "#60A5FA", parentId: "" },
    { id: "reimbursements", name: "เบิก/ชดเชย", icon: "🧾", color: "#FF9F43", parentId: "" },
    { id: "other_income", name: "อื่นๆ", icon: "🧩", color: "#C8D6E5", parentId: "" },

    // ----- Employment (children) -----
    { id: "salary", name: "เงินเดือน", icon: "💰", color: "#1DD1A1", parentId: "employment" },
    { id: "bonus", name: "โบนัส", icon: "🎁", color: "#F368E0", parentId: "employment" },
    { id: "overtime", name: "โอที", icon: "⏱️", color: "#FFE66D", parentId: "employment" },
    { id: "commission", name: "คอมมิชชั่น", icon: "🏷️", color: "#10b981", parentId: "employment" },
    { id: "allowance", name: "เบี้ยเลี้ยง/สวัสดิการ", icon: "🎫", color: "#0ea5e9", parentId: "employment" },
    { id: "salary_advance", name: "เงินล่วงหน้า", icon: "🏦", color: "#22C55E", parentId: "employment" },
    { id: "travel_allowance", name: "เบี้ยเดินทาง", icon: "✈️", color: "#38BDF8", parentId: "employment" },

    // ----- Side / Business (children) -----
    { id: "freelance", name: "ฟรีแลนซ์", icon: "🧑‍💻", color: "#60A5FA", parentId: "side_hustle" },
    { id: "business", name: "รายได้ธุรกิจ", icon: "🏪", color: "#22C55E", parentId: "side_hustle" },
    { id: "online_sales", name: "ขายของออนไลน์", icon: "📦", color: "#0EA5E9", parentId: "side_hustle" },
    { id: "service_income", name: "ค่าบริการ", icon: "🧾", color: "#FF9F43", parentId: "side_hustle" },
    { id: "tips", name: "ทิป", icon: "🙏", color: "#C8D6E5", parentId: "side_hustle" },
    { id: "affiliate_income", name: "ค่าคอม Affiliate", icon: "🔗", color: "#A78BFA", parentId: "side_hustle" },
    { id: "content_creator", name: "รายได้ครีเอเตอร์", icon: "🎥", color: "#F43F5E", parentId: "side_hustle" },

    // ----- Investments (children) -----
    { id: "investment", name: "กำไร/ขายลงทุน", icon: "📈", color: "#54A0FF", parentId: "investments" },
    { id: "interest", name: "ดอกเบี้ย", icon: "🏦", color: "#0EA5E9", parentId: "investments" },
    { id: "dividend", name: "เงินปันผล", icon: "🪙", color: "#F59E0B", parentId: "investments" },
    { id: "crypto", name: "คริปโต", icon: "₿", color: "#F59E0B", parentId: "investments" },
    { id: "capital_gain", name: "กำไรจากขายทรัพย์", icon: "📈", color: "#22C55E", parentId: "investments" },
    { id: "staking", name: "Staking/ผลตอบแทนคริปโต", icon: "🪙", color: "#F59E0B", parentId: "investments" },

    // ----- Rental (children) -----
    { id: "rent_income", name: "ค่าเช่าบ้าน/ห้อง", icon: "🏠", color: "#60A5FA", parentId: "rental" },
    { id: "parking_rent", name: "ค่าเช่าที่จอดรถ", icon: "🅿️", color: "#C8D6E5", parentId: "rental" },
    { id: "short_stay", name: "ปล่อยเช่ารายวัน", icon: "🏨", color: "#22C55E", parentId: "rental" },

    // ----- Reimbursements (children) -----
    { id: "reimbursement", name: "เบิกค่าใช้จ่าย", icon: "🧾", color: "#FF9F43", parentId: "reimbursements" },
    { id: "insurance_claim", name: "เคลมประกัน", icon: "🛡️", color: "#0EA5E9", parentId: "reimbursements" },
    { id: "tax_refund_income", name: "คืนภาษี", icon: "💸", color: "#22C55E", parentId: "reimbursements" },
    { id: "chargeback", name: "Chargeback/โดนคืนยอด", icon: "↩️", color: "#60A5FA", parentId: "reimbursements" },

    // ----- Adjust / Other -----
    { id: "adjust_balance", name: "ปรับยอดบัญชี", icon: "🧮", color: "#6B7280", parentId: "" },
    { id: "refund", name: "เงินคืน", icon: "↩️", color: "#FF9F43", parentId: "other_income" },
    { id: "cashback", name: "เงินคืน/แคชแบ็ก", icon: "💸", color: "#10b981", parentId: "other_income" },
    { id: "gift_income", name: "ของขวัญ/ได้เงิน", icon: "🎉", color: "#A78BFA", parentId: "other_income" },
    { id: "prize", name: "รางวัล/ลอตเตอรี่", icon: "🎟️", color: "#FFE66D", parentId: "other_income" },
    { id: "family_support", name: "เงินช่วยเหลือจากครอบครัว", icon: "👨‍👩‍👧‍👦", color: "#FB7185", parentId: "other_income" },
    { id: "grant_income", name: "ทุน/เงินสนับสนุน", icon: "🎓", color: "#38BDF8", parentId: "other_income" },
  ],
};
