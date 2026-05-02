'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { authAPI } from '@/lib/api';
import { clearUserToken, getUserToken } from '@/lib/auth-storage';
import { calculatePIT, INS_CAP, INS_RATE, SELF_DEDUCT, DEP_DEDUCT } from '@/lib/legal-math';

export function useLanding() {
  const router = useRouter();
  
  // --- Auth State ---
  const [user, setUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState('login');

  // --- Search & Content State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState(false);
  const [activeCat, setActiveCat] = useState('all');
  const [searchIn, setSearchIn] = useState('all'); // all, title, number
  const [exactMatch, setExactMatch] = useState(false);

  // --- PIT Calculator State ---
  const [calcOpen, setCalcOpen] = useState(false);
  const [inputMode, setInputMode] = useState('month');
  const [gross, setGross] = useState('');
  const [deps, setDeps] = useState('0');
  const [insurance, setInsurance] = useState('');
  const [otherDeduct, setOtherDeduct] = useState('0');
  const [calcResult, setCalcResult] = useState(null);

  // --- UI State ---
  const [settingsOpen, setSettingsOpen] = useState(false);

  const syncUser = useCallback(async () => {
    const token = getUserToken();
    if (!token) { setUser(null); setUserLoading(false); return; }
    try {
      const data = await authAPI.getMe();
      setUser(data);
    } catch {
      clearUserToken();
      setUser(null);
    } finally {
      setUserLoading(false);
    }
  }, []);

  useEffect(() => { syncUser(); }, [syncUser]);

  const handleLogout = async () => {
    await authAPI.logout().catch(() => {});
    clearUserToken();
    setUser(null);
    setSettingsOpen(false);
    router.replace('/');
  };

  const openAuth = (tab) => {
    setAuthTab(tab);
    setAuthOpen(true);
  };

  const closeAuth = () => setAuthOpen(false);

  const handleSend = () => {
    if (!user) { openAuth('login'); return; }
    router.push('/dashboard');
  };

  const doCalculate = () => {
    const g = parseFloat(gross) || 0;
    const d = parseInt(deps) || 0;
    const insRaw = parseFloat(insurance);
    const oth = parseFloat(otherDeduct) || 0;
    const gm = inputMode === 'year' ? g / 12 : g;
    const ins = isNaN(insRaw) ? Math.min(gm, INS_CAP) * INS_RATE : (inputMode === 'year' ? insRaw / 12 : insRaw);
    const om = inputMode === 'year' ? oth / 12 : oth;
    
    if (gm <= 0) return;
    
    const depD = d * DEP_DEDUCT;
    const taxable = Math.max(0, gm - SELF_DEDUCT - depD - ins - om);
    const { total: taxMonth, brackets } = calculatePIT(taxable);
    const effectiveRate = taxable > 0 ? (taxMonth / taxable * 100) : 0;
    
    setCalcResult({
      taxMonth, netMonth: gm - ins - taxMonth, taxYear: taxMonth * 12,
      selfDeduct: SELF_DEDUCT, depD, ins, oth: om, taxable, brackets,
      gross: gm, effectiveRate
    });
  };

  return {
    user, userLoading, authOpen, closeAuth, authTab, setAuthTab,
    openAuth,
    searchQuery, setSearchQuery, searchDropdownOpen, setSearchDropdownOpen,
    searchSuggestions, setSearchSuggestions, activeCat, setActiveCat,
    searchIn, setSearchIn, exactMatch, setExactMatch,
    calcOpen, setCalcOpen, inputMode, setInputMode, gross, setGross,
    deps, setDeps, insurance, setInsurance, otherDeduct, setOtherDeduct,
    calcResult, setCalcResult, doCalculate, handleLogout, handleSend,
    settingsOpen, setSettingsOpen
  };
}
