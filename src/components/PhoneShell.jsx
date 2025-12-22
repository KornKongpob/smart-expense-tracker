// src/components/PhoneShell.jsx
export default function PhoneShell({ children }) {
  return (
    /**
     * ✅ Glassmorphism Phone Shell
     * - ใช้พื้นหลังเดียวกับธีม (ดู index.css) ไม่ทับด้วย bg-gray-100
     * - ทำ “กรอบเครื่อง” แบบกระจกใส + ขอบ + เงานุ่ม
     * - ใส่ padding ด้านล่างเผื่อ Navbar/FAB (กัน content ถูกบัง)
     * - ใช้ safe area สำหรับ iPhone
     */
    <div className="min-h-dvh">
      {/* Outer container (center) */}
      <div className="mx-auto max-w-[520px] min-h-dvh px-0 sm:px-3">
        {/* Device frame */}
        <div
          className="
            relative min-h-dvh overflow-hidden
            rounded-none sm:rounded-[34px]
            border border-white/25
            bg-white/10
            backdrop-blur-2xl
            shadow-[0_18px_60px_-28px_rgba(0,0,0,0.55)]
          "
        >
          {/* subtle inner highlight */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/18 via-white/6 to-white/10" />

          {/* Content */}
          <div className="relative min-h-dvh pb-28 pb-safe">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
