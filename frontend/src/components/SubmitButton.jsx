import { Loader2, Send } from "lucide-react";

export default function SubmitButton({ loading, disabled, text = "Analisar" }) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      className={`
        flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wide transition-all
        ${disabled
          ? "bg-slate-100 text-slate-400 cursor-not-allowed"
          : "bg-orange-600 hover:bg-orange-700 text-white shadow-md hover:shadow-lg active:scale-95"
        }
      `}
    >
      {loading ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          Processando...
        </>
      ) : (
        <>
          <Send size={14} />
          {text}
        </>
      )}
    </button>
  );
}
