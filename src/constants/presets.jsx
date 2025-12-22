// src/constants/presets.jsx
import React from "react";
import {
  DollarSign,
  Home,
  CreditCard,
  Wallet,
  Smartphone,
  TrendingUp,
  Briefcase,
  Star,
  Lock,

  // ✅ added (more beautiful / more variety)
  Banknote,
  Landmark,
  Building2,
  Coins,
  PiggyBank,
  Receipt,
  Gift,
  CircleDollarSign,
  SmartphoneNfc,
  ShieldCheck,
  BadgeDollarSign,
  HandCoins,
  Vault,
  Bitcoin,
  ChartCandlestick,
  LineChart,
  Globe,
  Car,
  Plane,
  HeartPulse,
  Store,
  ShoppingBag,
  GraduationCap,
  Hotel,
  Fuel,
} from "lucide-react";

/**
 * Optional custom icon (kept)
 * - ใช้ SVG เองได้ในกรณีอยากได้ style เฉพาะ
 */
export function PiggyBankIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.size || 24}
      height={props.size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2.5V5z" />
      <path d="M2 9v1c0 1.1.9 2 2 2h1" />
      <path d="M16 11h.01" />
    </svg>
  );
}

/**
 * ✅ ACCOUNT_ICONS
 * - ใช้สำหรับทำ UI เลือกไอคอนบัญชี (grid selector)
 * - แต่ยังคงรูปแบบเดิม: { id, icon: <JSX/>, name }
 */
export const ACCOUNT_ICONS = [
  // --- Core money / cash ---
  { id: "cash", icon: <Banknote size={20} />, name: "เงินสด" },
  { id: "wallet", icon: <Wallet size={20} />, name: "กระเป๋า" },
  { id: "coins", icon: <Coins size={20} />, name: "เหรียญ/เงินทอน" },
  { id: "income", icon: <DollarSign size={20} />, name: "รายรับ" },
  { id: "cashbox", icon: <Vault size={20} />, name: "เงินเก็บ/กล่องเงิน" },

  // --- Bank / savings ---
  { id: "bank", icon: <Landmark size={20} />, name: "ธนาคาร" },
  { id: "homebank", icon: <Home size={20} />, name: "บัญชีหลัก" },
  { id: "savings", icon: <PiggyBank size={20} />, name: "เงินออม" },
  { id: "piggy_custom", icon: <PiggyBankIcon size={20} />, name: "กระปุกออมสิน" },

  // --- Cards ---
  { id: "card", icon: <CreditCard size={20} />, name: "บัตรเครดิต" },
  { id: "card_lock", icon: <Lock size={20} />, name: "บัตร/บัญชีปลอดภัย" },
  { id: "limit", icon: <BadgeDollarSign size={20} />, name: "วงเงิน/Limit" },

  // --- Digital / e-wallet ---
  { id: "digital", icon: <Smartphone size={20} />, name: "E-Wallet" },
  { id: "nfc", icon: <SmartphoneNfc size={20} />, name: "แตะจ่าย (NFC)" },
  { id: "online", icon: <Globe size={20} />, name: "บัญชีออนไลน์" },

  // --- Investment ---
  { id: "invest", icon: <TrendingUp size={20} />, name: "พอร์ตลงทุน" },
  { id: "stock", icon: <LineChart size={20} />, name: "หุ้น/กองทุน" },
  { id: "candles", icon: <ChartCandlestick size={20} />, name: "เทรด/กราฟ" },

  // --- Crypto ---
  { id: "btc", icon: <Bitcoin size={20} />, name: "คริปโต" },
  { id: "crypto_safe", icon: <ShieldCheck size={20} />, name: "คริปโต (ปลอดภัย)" },

  // --- Business / work ---
  { id: "business", icon: <Briefcase size={20} />, name: "ธุรกิจ" },
  { id: "company", icon: <Building2 size={20} />, name: "บริษัท" },
  { id: "store", icon: <Store size={20} />, name: "ร้านค้า" },

  // --- Payments / receipts ---
  { id: "bill", icon: <Receipt size={20} />, name: "บิล/ใบเสร็จ" },
  { id: "gift", icon: <Gift size={20} />, name: "ของขวัญ/โบนัส" },
  { id: "transfer", icon: <CircleDollarSign size={20} />, name: "โอนเงิน" },
  { id: "handcoins", icon: <HandCoins size={20} />, name: "จ่าย/รับเงิน" },

  // --- Lifestyle (sometimes users want these as account buckets) ---
  { id: "shopping", icon: <ShoppingBag size={20} />, name: "ช้อปปิ้ง" },
  { id: "travel_car", icon: <Car size={20} />, name: "เดินทาง (รถ)" },
  { id: "travel_plane", icon: <Plane size={20} />, name: "เดินทาง (บิน)" },
  { id: "fuel", icon: <Fuel size={20} />, name: "ค่าน้ำมัน" },
  { id: "hotel", icon: <Hotel size={20} />, name: "ที่พัก" },
  { id: "study", icon: <GraduationCap size={20} />, name: "การศึกษา" },
  { id: "health", icon: <HeartPulse size={20} />, name: "สุขภาพ" },

  // --- Classic presets kept from old list (compat) ---
  { id: "gold", icon: <Star size={20} />, name: "ทองคำ" },
];

/**
 * ✅ ACCOUNT_COLORS
 * - สีสำหรับบัญชี (ใช้ใน ColorDots)
 * - เพิ่มให้ครบโทน: สด/พาสเทล/เข้ม เพื่อแยกบัญชีได้ชัด
 */
export const ACCOUNT_COLORS = [
  "#1DD1A1",
  "#54A0FF",
  "#FF6B6B",
  "#FF9F43",
  "#5F27CD",
  "#485460",
  "#00d2d3",
  "#2e86de",
  "#ee5253",
  "#feca57",
  "#341f97",
  "#222f3e",
  // extra tones
  "#10b981",
  "#6366f1",
  "#f43f5e",
  "#0ea5e9",
  "#a855f7",
  "#f97316",
];

/**
 * ✅ PRESET_COLORS
 * - ใช้ร่วมกับหมวดหมู่/ธีมต่างๆ
 */
export const PRESET_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#FFE66D",
  "#FF9F43",
  "#54A0FF",
  "#5F27CD",
  "#C8D6E5",
  "#1DD1A1",
  "#F368E0",
  "#485460",
  // extra
  "#10b981",
  "#6366f1",
  "#f43f5e",
  "#0ea5e9",
  "#a855f7",
  "#f97316",
];

/**
 * ✅ EMOJI_PRESETS (expanded)
 * - ใช้เป็นชุด emoji ที่เลือกได้เร็ว (หมวด/บัญชี)
 * - เพิ่ม emoji ให้สวยและครอบคลุมขึ้น
 */
export const EMOJI_PRESETS = [
  // food & drink
  "🍜","🍛","🍱","🍔","🍕","🌮","🍣","🍞","🥩","🍗","🍟","🥗","🍦","🍰","☕","🧋","🥤",
  // transport
  "🚗","🚕","🚌","🚇","🚂","🏍️","🚲","✈️","⛽","🛣️","🛞",
  // shopping & lifestyle
  "🛍️","🧾","📦","🎁","👗","👕","👟","⌚","💄","🧴",
  // home & bills
  "🏠","💡","💧","🌐","📞","🧰","🔧","🧹","🛏️","🪴",
  // health
  "💊","🏥","🦷","👓","🩺","❤️","🧠","🧘","🏋️",
  // entertainment
  "🎬","🎵","🎮","📚","🏖️","🎟️","🎧",
  // work & study
  "🎓","✏️","💼","📅","📝","🏢",
  // family & pets
  "👶","🐶","🐱","🐰",
  // money
  "💰","💸","💳","🏦","📈","🪙","🔒","🔑",
  // extras
  "🎉","💐","💌","⭐","🌟",
];
