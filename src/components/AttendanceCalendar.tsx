import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Info, ChevronLeft, ChevronRight, Calculator, Gift, Sparkles } from 'lucide-react';
import { Employee, Attendance, Holiday } from '../types';
import { calculateMonthlyPayroll, formatINR } from '../lib/utils';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

interface AttendanceCalendarProps {
  employee: Employee;
  attendanceRecords: Attendance[];
  isAdminView?: boolean;
}

const MONTHS = [
  { name: 'January', val: '01' },
  { name: 'February', val: '02' },
  { name: 'March', val: '03' },
  { name: 'April', val: '04' },
  { name: 'May', val: '05' },
  { name: 'June', val: '06' },
  { name: 'July', val: '07' },
  { name: 'August', val: '08' },
  { name: 'September', val: '09' },
  { name: 'October', val: '10' },
  { name: 'November', val: '11' },
  { name: 'December', val: '12' }
];

export default function AttendanceCalendar({ employee, attendanceRecords, isAdminView = false }: AttendanceCalendarProps) {
  // Current time is June 2026
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedMonth, setSelectedMonth] = useState('06'); // June default
  const [activeDateRef, setActiveDateRef] = useState<string | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  // Fetch school holidays in real-time
  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        const snap = await getDocs(collection(db, 'holidays'));
        const list: Holiday[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as Holiday);
        });
        setHolidays(list);
      } catch (err) {
        console.error('Failed to load holidays in AttendanceCalendar:', err);
      }
    };
    fetchHolidays();
  }, []);

  const monthStr = `${selectedYear}-${selectedMonth}`;
  const payroll = calculateMonthlyPayroll(employee, attendanceRecords, monthStr, holidays);

  // Generate calendar days
  const yearNum = parseInt(selectedYear, 10);
  const monthNum = parseInt(selectedMonth, 10) - 1; // 0-indexed for Date
  
  const firstDayIndex = new Date(yearNum, monthNum, 1).getDay(); // weekday index of 1st day (0 = Sun, etc.)
  const totalDaysInMonth = new Date(yearNum, monthNum + 1, 0).getDate(); // days in month

  const daysGrid: ({ dateStr: string; dayNum: number; isWeekend: boolean } | null)[] = [];
  
  // Padding cells before the 1st day
  for (let i = 0; i < firstDayIndex; i++) {
    daysGrid.push(null);
  }

  // Populate actual days
  for (let d = 1; d <= totalDaysInMonth; d++) {
    const dayStr = d < 10 ? `0${d}` : `${d}`;
    const dateStr = `${selectedYear}-${selectedMonth}-${dayStr}`;
    const dayOfWeek = new Date(yearNum, monthNum, d).getDay();
    const isWeekend = dayOfWeek === 0; // Saturdays are not weekend holidays
    daysGrid.push({
      dateStr,
      dayNum: d,
      isWeekend
    });
  }

  // Handle month shifting
  const prevMonth = () => {
    let currentM = parseInt(selectedMonth, 10);
    let currentY = parseInt(selectedYear, 10);
    currentM--;
    if (currentM < 1) {
      currentM = 12;
      currentY--;
    }
    setSelectedMonth(currentM < 10 ? `0${currentM}` : `${currentM}`);
    setSelectedYear(currentY.toString());
    setActiveDateRef(null);
  };

  const nextMonth = () => {
    let currentM = parseInt(selectedMonth, 10);
    let currentY = parseInt(selectedYear, 10);
    currentM++;
    if (currentM > 12) {
      currentM = 1;
      currentY++;
    }
    setSelectedMonth(currentM < 10 ? `0${currentM}` : `${currentM}`);
    setSelectedYear(currentY.toString());
    setActiveDateRef(null);
  };

  const activeDayStats = activeDateRef ? payroll.breakdown[activeDateRef] : null;

  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-5 md:p-6 shadow-sm space-y-6" id={`calendar_card_${employee.employeeId}`}>
      
      {/* 1. Header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-dashed border-slate-100 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-900 border border-blue-100 rounded-2xl">
            <CalendarIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-1.5">
              <span>Attendance Calendar & Profile Units</span>
            </h3>
            <p className="text-xs text-slate-400 font-medium">Month-wise unit tracking and real worked hours payroll</p>
          </div>
        </div>

        {/* Navigation dials */}
        <div className="flex items-center gap-2">
          <button 
            type="button"
            onClick={prevMonth}
            className="p-1.5 text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          
          <select
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              setActiveDateRef(null);
            }}
            className="text-xs rounded-xl border border-slate-200 p-2 bg-white font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-900 cursor-pointer"
          >
            {MONTHS.map((m) => (
              <option key={m.val} value={m.val}>{m.name}</option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(e.target.value);
              setActiveDateRef(null);
            }}
            className="text-xs rounded-xl border border-slate-200 p-2 bg-white font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-900 cursor-pointer animate-none"
          >
            <option value="2025">2025</option>
            <option value="2026">2026</option>
            <option value="2027">2027</option>
          </select>

          <button 
            type="button"
            onClick={nextMonth}
            className="p-1.5 text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 2. Monthly dynamic units billing banner card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 rounded-2xl p-4 border border-slate-100">
        
        {/* Metric A: Accumulated Units */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono flex items-center gap-1">
            <Calculator className="h-3 w-3 text-indigo-500" />
            <span>Monthly Earned Units</span>
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{payroll.totalUnits} Units</span>
            <span className="text-[10px] text-slate-400 font-medium font-mono">(expected: 22)</span>
          </div>
          <div className="w-full bg-slate-200 h-1 rounded-full overflow-hidden">
            <div 
              className="bg-[#1b5dfc] h-full rounded-full" 
              style={{ width: `${Math.min(100, (payroll.totalUnits / 22) * 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Metric B: Prorated Gross Salary */}
        {isAdminView && (
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-500" />
              <span>Calculated Salary</span>
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-[#15c570]">{formatINR(payroll.calculatedSalary)}</span>
              <span className="text-[10px] text-slate-400 font-mono line-through">({formatINR(payroll.baseSalary)})</span>
            </div>
            <p className="text-[9px] text-indigo-900 font-semibold leading-none">
              Worked {payroll.totalUnits} hours factor from base salary
            </p>
          </div>
        )}

        {/* Metric C: Leaves ledger benefit (Only 1 free leave) */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono flex items-center gap-1">
            <Gift className="h-3 w-3 text-violet-500" />
            <span>Leave Benefit quota</span>
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-slate-800">
              {payroll.leavesCount === 0 ? '0 Leaves Taken' : `${payroll.leavesCount} Leaves Taken`}
            </span>
            <span className="text-[9px] bg-violet-100 text-violet-800 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
              {payroll.freeLeaveBenefitApplied ? '1 Free Applied' : 'No Leaves'}
            </span>
          </div>
          <p className="text-[9px] text-slate-400 leading-normal">
            Only 1 free leave permitted monthly. Additional leaves count as 0 units in salary.
          </p>
        </div>

      </div>

      {/* 3. The Calendar Grid */}
      <div className="space-y-3">
        <div className="grid grid-cols-7 gap-1 md:gap-2 text-center">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <span key={d} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono py-1">
              {d}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5" id={`calendar_grid_${employee.employeeId}`}>
          {daysGrid.map((cell, idx) => {
            if (!cell) {
              return (
                <div 
                  key={`empty-${idx}`} 
                  className="aspect-square bg-slate-50/20 border border-transparent rounded-xl"
                />
              );
            }

            const { dateStr, dayNum, isWeekend } = cell;
            const log = payroll.breakdown[dateStr];
            
            let bgClass = 'bg-white border-slate-100 text-slate-700 hover:border-slate-300';
            let badgeColor = 'bg-slate-100 text-slate-400';
            let statusText = 'No record';
            let unitText = '';

            if (log) {
              if (log.type === 'Present') {
                bgClass = 'bg-emerald-50/75 border-emerald-200 text-emerald-900 font-semibold hover:bg-emerald-100/80';
                badgeColor = 'bg-emerald-100 text-emerald-800';
                statusText = 'Present';
                unitText = `${log.units} U`;
              } else if (log.type === 'Late') {
                bgClass = 'bg-amber-50/70 border-amber-200 text-amber-900 font-semibold hover:bg-amber-100/80';
                badgeColor = 'bg-amber-100 text-amber-800';
                statusText = 'Late';
                unitText = `${log.units} U`;
              } else if (log.type === 'Leave') {
                bgClass = 'bg-violet-50 border-violet-200 text-violet-900 font-semibold hover:bg-violet-100';
                badgeColor = 'bg-violet-100 text-violet-800';
                statusText = 'Leave Day';
                unitText = log.units === 1.0 ? 'FREE (1U)' : '0 U';
              } else if (log.type === 'Absent') {
                bgClass = 'bg-red-50 border-red-200 text-red-900 font-semibold hover:bg-red-100';
                badgeColor = 'bg-red-100 text-red-800';
                statusText = 'Absent';
                unitText = '0 U';
              } else if (log.type === 'Holiday') {
                bgClass = 'bg-[#fffbeb] border-amber-300 text-amber-900 font-bold hover:bg-amber-100';
                badgeColor = 'bg-amber-100 text-amber-850';
                statusText = `Holiday: ${log.label || 'School Holiday'}`;
                unitText = 'HOLIDAY';
              } else if (log.type === 'Weekend') {
                bgClass = 'bg-slate-50 border-slate-100 text-slate-400 font-medium cursor-default hover:bg-slate-50';
                statusText = 'Weekend Sunday';
                unitText = '';
              } else {
                // No record
                const todayStr = new Date().toISOString().substring(0, 10);
                if (dateStr < todayStr) {
                  bgClass = 'bg-red-50/35 border-red-150 text-slate-400';
                  statusText = 'No entry';
                  unitText = '0 U';
                }
              }
            }

            const isActive = activeDateRef === dateStr;

            return (
              <button
                type="button"
                onClick={() => {
                  if (log && log.type !== 'Weekend') {
                    setActiveDateRef(isActive ? null : dateStr);
                  }
                }}
                disabled={log?.type === 'Weekend'}
                key={dateStr}
                className={`aspect-square md:aspect-[6/5] p-1 border rounded-xl flex flex-col justify-between transition-all select-none text-left cursor-pointer ${bgClass} ${
                  isActive ? 'ring-2 ring-indigo-500 scale-[1.03] border-indigo-500 z-10 shadow-md' : ''
                } ${log?.type === 'Weekend' ? 'cursor-not-allowed opacity-60' : ''}`}
                title={`${dateStr}: ${statusText}`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] md:text-xs font-bold leading-none font-mono">
                    {dayNum}
                  </span>
                  {statusText !== 'No record' && statusText !== 'Weekend Sunday' && statusText !== 'No entry' && (
                    <span className="h-1.5 w-1.5 rounded-full bg-current shrink-0 hidden sm:block" />
                  )}
                </div>

                {unitText && (
                  <span className="text-[8px] md:text-[9px] font-black font-mono tracking-tighter block truncate leading-none text-right w-full text-slate-500">
                    {unitText}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Active Day Details Panel */}
      <div className="bg-slate-55 border border-slate-100 rounded-2xl p-4 text-xs">
        {activeDayStats ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <span className="font-bold font-mono text-slate-700">{activeDateRef}</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                activeDayStats.type === 'Present' ? 'bg-emerald-100 text-emerald-800' :
                activeDayStats.type === 'Late' ? 'bg-amber-100 text-amber-800' :
                activeDayStats.type === 'Leave' ? 'bg-violet-100 text-violet-800' :
                activeDayStats.type === 'Holiday' ? 'bg-amber-100 text-amber-950 font-bold' :
                'bg-red-100 text-red-800'
              }`}>
                {activeDayStats.type}
              </span>
            </div>
            
            {activeDayStats.type === 'Holiday' ? (
              <div className="space-y-1.5 text-[11px] text-slate-600">
                <p>Holiday Event: <strong className="text-amber-800 text-xs font-bold font-sans">{activeDayStats.label || 'School Holiday'}</strong></p>
                <p>Earned Shift Units value: <strong className="font-mono text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded font-black">1.0 Unit (100% credited)</strong></p>
                <p className="text-[10px] text-slate-400 italic">This is an officially declared general school holiday, which is fully compensated. Teachers are credited with a fully paid unit of shift credit without required clock logs.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  <p>Check-In: <strong className="font-mono text-slate-800">{activeDayStats.checkIn || '--:--'}</strong></p>
                  <p>Check-Out: <strong className="font-mono text-slate-800">{activeDayStats.checkOut || '--:--'}</strong></p>
                  <p className="col-span-2">Earned Shift Units value: <strong className="font-mono text-[#1b5dfc] bg-blue-50 px-1 py-0.5 rounded font-black">{activeDayStats.units} Units</strong></p>
                </div>
                
                <p className="text-[10px] text-slate-450 italic pt-1 leading-relaxed border-t border-slate-100">
                  * Shift criteria: 08:45 AM - 04:30 PM (expected 7.75 hrs). late grievance is permitted until 08:55 AM without unit docking. Otherwise units are prorated.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-2.5 text-slate-500 leading-relaxed text-[11px]">
            <Info className="h-4.5 w-4.5 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-700">Detailed biometric day logs analyzer</p>
              <p className="text-slate-400">Click any highlighted date above to drill down into raw clock-in/out timestamps, precise calculated work hours, and daily payroll-units multiplier values.</p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
