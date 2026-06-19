/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SEED_EMPLOYEES } from './firebase';
import { Attendance, Employee } from '../types';

/**
 * Resolves an employeeId string into their official printable name.
 */
export function employeeIdToName(id: string): string {
  const match = SEED_EMPLOYEES.find(e => e.employeeId === id);
  return match ? match.name : id;
}

/**
 * Formats currency values nicely in standard INR structure.
 */
export function formatINR(val: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(val);
}

/**
 * Parses time strings safely (e.g. "08:45 AM", "16:30", "4:30 PM", "8:45 AM") into minutes from midnight.
 */
export function timeStringToMinutes(timeStr: string): number | null {
  if (!timeStr) return null;
  const clean = timeStr.trim().toUpperCase();
  
  // 12-hour AM/PM format
  const match12 = clean.match(/^(\d+):(\d+)\s*(AM|PM)$/);
  if (match12) {
    let hr = parseInt(match12[1], 10);
    const min = parseInt(match12[2], 10);
    const ampm = match12[3];
    if (ampm === 'PM' && hr < 12) hr += 12;
    if (ampm === 'AM' && hr === 12) hr = 0;
    return hr * 60 + min;
  }
  
  // 24-hour style "hh:mm"
  const match24 = clean.match(/^(\d+):(\d+)$/);
  if (match24) {
    const hr = parseInt(match24[1], 10);
    const min = parseInt(match24[2], 10);
    return hr * 60 + min;
  }
  
  return null;
}

/**
 * Calculates attendance units for a teacher for a given day.
 * - Shift: 08:45 (525 min) to 16:30 (990 min).
 * - Grievance grace period allowed till 08:55 (535 min).
 * - If they are present from 8:45 (with grievance grace till 8:55 AM) to 16:30, they get 1.0 unit.
 * - Otherwise, calculate proportional units based on hours present within the shift window [525, 990] (Total: 465 minutes / 7.75 hours).
 */
export function calculateAttendanceUnits(checkInStr?: string, checkOutStr?: string): number {
  if (!checkInStr || !checkOutStr) return 0;
  
  const checkInMin = timeStringToMinutes(checkInStr);
  const checkOutMin = timeStringToMinutes(checkOutStr);
  if (checkInMin === null || checkOutMin === null) return 0;
  if (checkOutMin <= checkInMin) return 0;

  const expectedStart = 525; // 8:45 AM
  const expectedEnd = 990;   // 4:30 PM
  const graceLimit = 535;    // 8:55 AM

  // If check-in is within grievance grace period (<= 8:55 AM) and checkout is at or after expected shift end (>= 4:30 PM)
  if (checkInMin <= graceLimit && checkOutMin >= expectedEnd) {
    return 1.0;
  }

  // Calculate actual hours present within the shift timings
  const actualStart = Math.max(checkInMin, expectedStart);
  const actualEnd = Math.min(checkOutMin, expectedEnd);
  
  if (actualEnd <= actualStart) return 0;
  
  const minutesPresent = actualEnd - actualStart;
  const ratio = minutesPresent / 465; // standard duration is 465 minutes (7.75 hours)
  
  return Math.min(1.0, Math.max(0, parseFloat(ratio.toFixed(3))));
}

/**
 * Aggregates attendance records and calculates cumulative units, free leave benefits,
 * and prorated salaries month-by-month, incorporating administrative custom holidays.
 * - Proration: Calculated based on standard 22 working days in a month.
 * - Saturday: Saturdays are standard school working days. Only Sundays are weekends.
 * - Holidays: Configured holidays are paid and award 1.0 units automatically if there is no conflicting absence.
 * - "only 1 free leave": First approved leave in a month counts as 1.0 units, subsequent ones earn 0 units.
 */
export function calculateMonthlyPayroll(
  employee: Employee,
  records: Attendance[],
  monthStr: string, // "YYYY-MM"
  holidays: { date: string; title: string }[] = []
) {
  // Filter for this employee's records in the specified YYYY-MM month
  const employeeRecords = records.filter(
    (rec) => rec.employeeId === employee.employeeId && rec.date.startsWith(monthStr)
  );

  const recordsMap = new Map<string, Attendance>();
  employeeRecords.forEach(r => recordsMap.set(r.date, r));

  const holidaysMap = new Map<string, string>();
  holidays.forEach(h => holidaysMap.set(h.date, h.title));

  let totalUnits = 0;
  let leavesCount = 0;
  const breakdown: { [date: string]: { type: string; checkIn?: string; checkOut?: string; units: number; label?: string } } = {};

  const [yearStr, monthNumStr] = monthStr.split('-');
  const yearNum = parseInt(yearStr, 10);
  const monthNum = parseInt(monthNumStr, 10) - 1; // 0-indexed

  const totalDaysInMonth = new Date(yearNum, monthNum + 1, 0).getDate();

  // Sort chrono to award the first leave as the "free leave"
  const leaveRecords = employeeRecords
    .filter(r => r.status === 'Leave')
    .sort((a, b) => a.date.localeCompare(b.date));

  const freeLeaveDate = leaveRecords.length > 0 ? leaveRecords[0].date : null;

  for (let d = 1; d <= totalDaysInMonth; d++) {
    const dayStr = d < 10 ? `0${d}` : `${d}`;
    const dateStr = `${monthStr}-${dayStr}`;
    const dayOfWeek = new Date(yearNum, monthNum, d).getDay();
    const isSunday = dayOfWeek === 0;

    const rec = recordsMap.get(dateStr);
    const holidayTitle = holidaysMap.get(dateStr);

    let dayUnits = 0;
    let statusType = 'No record';
    let checkIn: string | undefined;
    let checkOut: string | undefined;
    let holidayLabel: string | undefined;

    if (rec) {
      checkIn = rec.checkIn;
      checkOut = rec.checkOut;
      statusType = rec.status;
      if (rec.status === 'Present' || rec.status === 'Late') {
        dayUnits = calculateAttendanceUnits(rec.checkIn, rec.checkOut);
      } else if (rec.status === 'Leave') {
        leavesCount++;
        if (dateStr === freeLeaveDate) {
          dayUnits = 1.0; // The 1st approved leave is free (100% units credited!)
        } else {
          dayUnits = 0.0;
        }
      } else {
        dayUnits = 0.0;
      }
    } else if (holidayTitle) {
      statusType = 'Holiday';
      dayUnits = 1.0; // Paid Holidays count as 1.0 units
      holidayLabel = holidayTitle;
    } else if (isSunday) {
      statusType = 'Weekend';
      dayUnits = 0.0;
    } else {
      statusType = 'No record';
      dayUnits = 0.0;
    }

    totalUnits += dayUnits;
    
    // Always include in breakdown for calendar purposes
    breakdown[dateStr] = {
      type: statusType,
      checkIn,
      checkOut,
      units: Number(dayUnits.toFixed(3)),
      label: holidayLabel
    };
  }

  // Prorated Salary = (Monthly Base Wage / 22 Working Days) * Total units worked
  const billingWorkingDays = 22;
  const calculatedSalary = (employee.salary / billingWorkingDays) * totalUnits;

  return {
    employeeId: employee.employeeId,
    employeeName: employee.name,
    baseSalary: employee.salary,
    totalUnits: Number(totalUnits.toFixed(3)),
    leavesCount,
    freeLeaveBenefitApplied: leavesCount >= 1,
    calculatedSalary: Math.round(calculatedSalary),
    breakdown,
  };
}
