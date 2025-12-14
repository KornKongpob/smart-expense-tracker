export default function PhoneShell({ children }) {
  return (
    <div className="min-h-dvh bg-gray-100">
      <div className="mx-auto max-w-[430px] min-h-dvh bg-gray-100 border-x border-gray-200 shadow-2xl relative overflow-hidden">
        {children}
      </div>
    </div>
  )
}
