export default function TabButton({ active, onClick, icon, title, desc }) {
  return (
    <button
      onClick={onClick}
      className={`
        flex flex-col items-center sm:items-start p-3 rounded-xl border transition-all duration-200 text-center sm:text-left h-full
        ${active
          ? "bg-white border-orange-500 ring-1 ring-orange-500 shadow-md transform -translate-y-0.5"
          : "bg-white border-slate-200 hover:border-orange-300 hover:bg-orange-50 text-slate-500"
        }
      `}
    >
      <div className={`mb-1.5 ${active ? "text-orange-600" : "text-slate-400"}`}>
        {icon}
      </div>
      <span className={`font-bold text-xs sm:text-sm block w-full ${active ? "text-slate-900" : "text-slate-600"}`}>
        {title}
      </span>
      <span className="text-[10px] hidden sm:block mt-0.5 opacity-80">{desc}</span>
    </button>
  );
}
