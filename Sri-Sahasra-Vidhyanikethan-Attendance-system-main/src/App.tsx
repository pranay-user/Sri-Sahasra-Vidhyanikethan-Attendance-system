/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect } from 'react';
import { 
  GraduationCap, 
  LogOut, 
  Clock, 
  MapPin, 
  Calendar, 
  CheckCircle, 
  Shield,
  CreditCard,
  UserCheck,
  Award,
  AlertTriangle,
  Scan
} from 'lucide-react';
import Login from './components/Login';
import TeacherDashboard from './components/TeacherDashboard';
import FinanceDashboard from './components/FinanceDashboard';
import PrincipalDashboard from './components/PrincipalDashboard';
import AdminDashboard from './components/AdminDashboard';
import ReceptionKiosk from './components/ReceptionKiosk';
import { Employee, SchoolConfig, Attendance } from './types';
import { db, seedDatabaseIfEmpty, handleFirestoreError, OperationType } from './lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function App() {
  const [currentUser, setCurrentUser] = useState<Employee | null>(() => {
    try {
      const stored = localStorage.getItem('ssa_current_user');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  });
  const [schoolTimings, setSchoolTimings] = useState<SchoolConfig>({
    checkInTime: '08:30 AM',
    checkOutTime: '04:30 PM',
    graceTime: '08:45 AM'
  });
  const [timingsLoading, setTimingsLoading] = useState(true);
  const [dbSeeding, setDbSeeding] = useState(true);
  const [currentDateString, setCurrentDateString] = useState('');

  // Snychronize user profile data with Firestore on mount to ensure we load latest fields
  useEffect(() => {
    if (currentUser) {
      const syncUser = async () => {
        try {
          const docSnap = await getDoc(doc(db, 'employees', currentUser.employeeId));
          if (docSnap.exists()) {
            const updatedUser = docSnap.data() as Employee;
            setCurrentUser(updatedUser);
            localStorage.setItem('ssa_current_user', JSON.stringify(updatedUser));
          }
        } catch (e) {
          console.warn('Could not sync current user profile with Firestore', e);
        }
      };
      syncUser();
    }
  }, [currentUser?.employeeId]);

  // Daily real-time presence check-in status for currently logged-in user
  const [todayAttendance, setTodayAttendance] = useState<Attendance | null>(null);

  // Core setup and seeding on mount
  useEffect(() => {
    const initializeApp = async () => {
      // 1. Set current date string in standard YYYY-MM-DD
      const now = new Date();
      setCurrentDateString(now.toISOString().substring(0, 10));

      // 2. Clear block and seed empty Firestore instance with realistic data
      try {
        await seedDatabaseIfEmpty();
      } catch (e) {
        console.error('Failed seeding', e);
      } finally {
        setDbSeeding(false);
      }

      // 3. Retrieve official timings config
      await fetchTimingsConfig();
    };

    initializeApp();
  }, []);

  // Sync punch status whenever user or date changes
  useEffect(() => {
    if (currentUser) {
      fetchTodayAttendance();
    } else {
      setTodayAttendance(null);
    }
  }, [currentUser, currentDateString]);

  const fetchTimingsConfig = async () => {
    setTimingsLoading(true);
    const col = 'config';
    try {
      const docSnap = await getDoc(doc(db, col, 'school_timings'));
      if (docSnap.exists()) {
        setSchoolTimings(docSnap.data() as SchoolConfig);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `${col}/school_timings`);
    } finally {
      setTimingsLoading(false);
    }
  };

  const fetchTodayAttendance = async () => {
    if (!currentUser) return;
    const col = 'attendance';
    const docId = `${currentUser.employeeId}_${currentDateString}`;
    try {
      const docSnap = await getDoc(doc(db, col, docId));
      if (docSnap.exists()) {
        setTodayAttendance(docSnap.data() as Attendance);
      } else {
        setTodayAttendance(null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `${col}/${docId}`);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    try {
      localStorage.removeItem('ssa_current_user');
    } catch (e) {
      console.warn('Failed to clear session from localStorage', e);
    }
  };

  if (dbSeeding) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-6">
        <GraduationCap className="h-16 w-16 text-amber-400 animate-bounce mb-4" />
        <h2 className="text-xl font-bold font-sans tracking-wide">Sri Sahasra Vidhyanikethan</h2>
        <p className="text-slate-400 text-xs mt-2 animate-pulse">Synchronizing school operations config and history logs...</p>
      </div>
    );
  }

  if (currentUser && currentUser.role === 'Reception') {
    return <ReceptionKiosk onClose={handleLogout} />;
  }

  if (!currentUser) {
    return <Login onLoginSuccess={(employee) => {
      setCurrentUser(employee);
      try {
        localStorage.setItem('ssa_current_user', JSON.stringify(employee));
      } catch (e) {
        console.warn('Failed to save session to localStorage', e);
      }
    }} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" id="app_frame">
      
      {/* 1. Global Navigation Bar */}
      <header className="bg-slate-900 border-b border-slate-800 text-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* School Crest Logo branding */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center shadow-md">
                <GraduationCap className="h-5.5 w-5.5 text-slate-950" />
              </div>
              <div>
                <h1 className="text-sm font-black tracking-wider text-amber-400 font-sans uppercase">
                  Sri Sahasra Vidhyanikethan
                </h1>
                <p className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">
                  Staff Operations Center
                </p>
              </div>
            </div>

            {/* Quick Session Profile & Logout */}
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-slate-205 font-bold">{currentUser.name}</span>
                <span className="text-[9px] text-slate-400 font-semibold uppercase">{currentUser.role} Desk</span>
              </div>

              {/* Role Indicator Icon Badge */}
              <div className="p-2 bg-slate-850 rounded-lg text-amber-400 border border-slate-700/50">
                {currentUser.role === 'Admin' && <Shield className="h-4 w-4 text-indigo-400" />}
                {currentUser.role === 'Principal' && <Award className="h-4 w-4 text-amber-400" />}
                {currentUser.role === 'Finance' && <CreditCard className="h-4 w-4 text-violet-400" />}
                {currentUser.role === 'Teacher' && <UserCheck className="h-4 w-4 text-emerald-400" />}
              </div>

              <div className="h-6 w-[1px] bg-slate-800"></div>

              <button
                id="logout_header_btn"
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/30 rounded-lg cursor-pointer transition-all"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Sign Out</span>
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* 2. Primary Layout Workspace */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Real-time Connection Status displaying actual synchronized logs */}
        {(currentUser.role === 'Teacher' || currentUser.role === 'Finance' || currentUser.role === 'Principal') && (
          <div className="mb-8 p-4 bg-white border border-slate-100 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4" id="shift_sentinel_punch">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl shrink-0 mt-0.5">
                <CheckCircle className="h-5 w-5 stroke-2" />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-sm font-bold text-slate-900">Sri Sahasra Vidhyanikethan Terminal Logs</h4>
                <p className="text-xs text-slate-500">
                  Your daily attendance checkpoint is synced directly from the main Sri Sahasra Vidhyanikethan biometric entry app.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {todayAttendance ? (
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                      todayAttendance.status === 'Present' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                    }`}>
                      Terminal: {todayAttendance.status}
                    </span>
                    <p className="text-[10px] font-mono text-slate-400 mt-1">Check-in recorded: {todayAttendance.checkIn}</p>
                  </div>
                  {todayAttendance.checkOut && (
                    <div className="p-2.5 bg-slate-50 border border-slate-150 rounded-xl text-center font-mono text-[10px] text-slate-600">
                      <p className="font-bold text-slate-700">Out: {todayAttendance.checkOut}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-right flex flex-col items-end shrink-0">
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-slate-100 text-slate-550 border border-slate-200">
                    Awaiting Terminal Entry
                  </span>
                  <p className="text-[10px] text-slate-400 mt-1">Logs automatically update below</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dynamic Portal Mounting */}
        {currentUser.role === 'Teacher' && <TeacherDashboard employee={currentUser} />}
        {currentUser.role === 'Finance' && <FinanceDashboard employee={currentUser} />}
        {currentUser.role === 'Principal' && <PrincipalDashboard employee={currentUser} />}
        {currentUser.role === 'Admin' && <AdminDashboard employee={currentUser} onTimingsUpdated={fetchTimingsConfig} />}

      </main>

      {/* 3. Global Footer copyright */}
      <footer className="bg-slate-100 border-t border-slate-200/50 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4">
          <p>© 2026 Sri Sahasra Vidhyanikethan • Staff Management System • All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
