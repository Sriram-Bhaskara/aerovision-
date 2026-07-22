// =====================================================
// CompareContext — store up to 3 flights for side-by-side comparison
// Persisted to localStorage so selections survive navigation
// =====================================================
import { createContext, useContext, useState, useCallback } from 'react';
import toast from 'react-hot-toast';

const CompareContext = createContext(null);
const LS_KEY = 'aerovision_compare';

function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function save(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

export function CompareProvider({ children }) {
  const [compareList, setCompareList] = useState(load);

  const addToCompare = useCallback((flight) => {
    setCompareList(prev => {
      if (prev.find(f => f.flight_iata === flight.flight_iata)) {
        toast('Already in comparison', { icon: 'ℹ️' });
        return prev;
      }
      if (prev.length >= 3) {
        toast('Max 3 flights. Remove one first.', { icon: '⚠️' });
        return prev;
      }
      const next = [...prev, flight];
      save(next);
      toast.success(`${flight.flight_iata} added to compare`);
      return next;
    });
  }, []);

  const removeFromCompare = useCallback((flightIata) => {
    setCompareList(prev => {
      const next = prev.filter(f => f.flight_iata !== flightIata);
      save(next);
      return next;
    });
  }, []);

  const clearCompare = useCallback(() => {
    setCompareList([]);
    localStorage.removeItem(LS_KEY);
  }, []);

  const isInCompare = useCallback((flightIata) => {
    return compareList.some(f => f.flight_iata === flightIata);
  }, [compareList]);

  return (
    <CompareContext.Provider value={{ compareList, addToCompare, removeFromCompare, clearCompare, isInCompare }}>
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error('useCompare must be inside CompareProvider');
  return ctx;
}
