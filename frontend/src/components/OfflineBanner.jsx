// OfflineBanner — shown at top of page when device loses internet
import { AnimatePresence, motion } from 'framer-motion';
import { useOffline } from '../hooks/useOffline';

export default function OfflineBanner() {
  const isOffline = useOffline();

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          key="offline-banner"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden"
        >
          <div className="flex items-center justify-center gap-2.5 px-4 py-2 bg-[rgba(245,158,11,0.12)] border-b border-[rgba(245,158,11,0.25)] text-[#f59e0b] text-[12px] font-medium">
            <span className="text-base">📡</span>
            <span>
              You&apos;re offline — showing last cached flight & weather data.
              Live updates are paused.
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
