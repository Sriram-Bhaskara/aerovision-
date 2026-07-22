export default function Loader() {
  return (
    <div className="fixed inset-0 bg-[#080c14] flex flex-col items-center justify-center z-[999]">
      <div className="font-display text-3xl font-extrabold tracking-tight mb-8">
        Aero<span className="text-[#3b9eff]">Vision</span>
      </div>
      <div className="w-48 h-0.5 bg-[#1a2540] rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-[#3b9eff] to-purple-500 rounded-full animate-[load_1.5s_ease_forwards]" />
      </div>
      <div className="font-mono text-xs text-[#4a5a7a] mt-4 tracking-wider">
        INITIALIZING FLIGHT INTELLIGENCE...
      </div>
      <style>{`@keyframes load { from { width: 0%; } to { width: 100%; } }`}</style>
    </div>
  );
}
