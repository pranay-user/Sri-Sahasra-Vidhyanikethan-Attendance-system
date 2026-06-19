/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Send, 
  Clock, 
  Plus, 
  User, 
  CheckCircle2, 
  AlertCircle, 
  MessageSquare,
  HelpCircle,
  FileText,
  BadgeAlert,
  Lock
} from 'lucide-react';
import { employeeIdToName } from '../lib/utils'; // wait, let's write utils first or keep things here
import AttendanceCalendar from './AttendanceCalendar';
import { Employee, Attendance, LeaveRequest, SupportQuery } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  doc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';

interface TeacherProps {
  employee: Employee;
}

export default function TeacherDashboard({ employee }: TeacherProps) {
  // Attendance state
  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);

  // Leave states
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [leavesLoading, setLeavesLoading] = useState(true);
  const [leaveType, setLeaveType] = useState<'Sick Leave' | 'Casual Leave' | 'Maternity Leave' | 'Earned Leave'>('Sick Leave');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [leaveStatusMsg, setLeaveStatusMsg] = useState<string | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  // Queries states
  const [queriesList, setQueriesList] = useState<SupportQuery[]>([]);
  const [queriesLoading, setQueriesLoading] = useState(true);
  const [querySubject, setQuerySubject] = useState('');
  const [queryDesc, setQueryDesc] = useState('');
  const [queryStatusMsg, setQueryStatusMsg] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  // Settings / Account Security Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [passLoading, setPassLoading] = useState(false);

  // Pull employee-specific logs on component mount
  useEffect(() => {
    fetchAttendance();
    fetchLeaves();
    fetchQueries();
  }, [employee.employeeId]);

  const fetchAttendance = async () => {
    setAttendanceLoading(true);
    const collectionName = 'attendance';
    try {
      const q = query(
        collection(db, collectionName),
        where('employeeId', '==', employee.employeeId)
      );
      const snap = await getDocs(q);
      const records: Attendance[] = [];
      snap.forEach((docSnap) => {
        records.push({ id: docSnap.id, ...docSnap.data() } as Attendance);
      });
      // Sort local records by date descending
      records.sort((a, b) => b.date.localeCompare(a.date));
      setAttendanceRecords(records);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, collectionName);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const fetchLeaves = async () => {
    setLeavesLoading(true);
    const collectionName = 'leaves';
    try {
      const q = query(
        collection(db, collectionName),
        where('employeeId', '==', employee.employeeId)
      );
      const snap = await getDocs(q);
      const records: LeaveRequest[] = [];
      snap.forEach((docSnap) => {
        records.push({ id: docSnap.id, ...docSnap.data() } as LeaveRequest);
      });
      // Sort by status pending first, then by appliedAt descending
      records.sort((a, b) => {
        if (a.status === 'Pending' && b.status !== 'Pending') return -1;
        if (a.status !== 'Pending' && b.status === 'Pending') return 1;
        return b.appliedAt.localeCompare(a.appliedAt);
      });
      setLeaves(records);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, collectionName);
    } finally {
      setLeavesLoading(false);
    }
  };

  const fetchQueries = async () => {
    setQueriesLoading(true);
    const collectionName = 'queries';
    try {
      const q = query(
        collection(db, collectionName),
        where('employeeId', '==', employee.employeeId)
      );
      const snap = await getDocs(q);
      const records: SupportQuery[] = [];
      snap.forEach((docSnap) => {
        records.push({ id: docSnap.id, ...docSnap.data() } as SupportQuery);
      });
      records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setQueriesList(records);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, collectionName);
    } finally {
      setQueriesLoading(false);
    }
  };

  // Submit new leave request
  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeaveError(null);
    setLeaveStatusMsg(null);

    if (!startDate || !endDate || !reason) {
      setLeaveError('Please fill out all leave application fields.');
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      setLeaveError('Start date cannot be after end date.');
      return;
    }

    const payload: LeaveRequest = {
      employeeId: employee.employeeId,
      employeeName: employee.name,
      role: employee.role,
      startDate,
      endDate,
      leaveType,
      reason,
      status: 'Pending',
      appliedAt: new Date().toISOString().substring(0, 10) + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const path = 'leaves';
    try {
      // Auto-generate safe custom ID based on timestamp
      const customId = `leave_${employee.employeeId}_${Date.now()}`;
      await setDoc(doc(db, path, customId), payload);
      
      setLeaveStatusMsg('Leave applied successfully! Sent to Principal & Admins.');
      setStartDate('');
      setEndDate('');
      setReason('');
      fetchLeaves();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  // Submit support ticket
  const handleRaiseQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    setQueryError(null);
    setQueryStatusMsg(null);

    if (!querySubject || !queryDesc) {
      setQueryError('Please provide both subject and descriptive notes.');
      return;
    }

    const payload: SupportQuery = {
      employeeId: employee.employeeId,
      employeeName: employee.name,
      subject: querySubject,
      description: queryDesc,
      status: 'Open',
      createdAt: new Date().toISOString().substring(0, 10) + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const path = 'queries';
    try {
      const customId = `query_${employee.employeeId}_${Date.now()}`;
      await setDoc(doc(db, path, customId), payload);

      setQueryStatusMsg('Your query has been raised successfully as open ticket.');
      setQuerySubject('');
      setQueryDesc('');
      fetchQueries();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  // Update password in Firestore
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(null);

    if (!newPassword) {
      setPassError('Password field cannot be empty.');
      return;
    }

    if (newPassword.length < 4) {
      setPassError('Password must be at least 4 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPassError('Passwords do not match.');
      return;
    }

    setPassLoading(true);
    const path = 'employees';
    try {
      await setDoc(doc(db, path, employee.employeeId), {
        password: newPassword
      }, { merge: true });

      setPassSuccess('Successfully updated login password! Use this password for future logins.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    } finally {
      setPassLoading(false);
    }
  };

  // Math helpers
  const totalDaysRecord = attendanceRecords.length;
  const presentDays = attendanceRecords.filter(r => r.status === 'Present').length;
  const lateDays = attendanceRecords.filter(r => r.status === 'Late').length;
  const absentDays = attendanceRecords.filter(r => r.status === 'Absent').length;
  const onLeaveDays = attendanceRecords.filter(r => r.status === 'Leave').length;
  
  const presentRate = totalDaysRecord > 0 
    ? Math.round(((presentDays + lateDays) / totalDaysRecord) * 100) 
    : 100;

  return (
    <div className="space-y-8" id="teacher_dashboard">
      {/* 1. Header Banner */}
      <div className="bg-slate-900 border border-slate-800 text-white p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-white mb-1">
              Welcome back, {employee.name}
            </h2>
            <span className="bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-0.5 border border-emerald-500/20 font-mono font-medium rounded-full">
              ● Active
            </span>
          </div>
          <p className="text-slate-400 text-sm">
            {employee.designation} • Core Academic Staff • Sri Sahasra Vidhyanikethan
          </p>
        </div>
        <div className="flex items-center gap-3 bg-slate-800/80 p-3 rounded-xl border border-slate-700/50">
          <Clock className="h-5 w-5 text-amber-400 shrink-0" />
          <div className="font-mono text-right">
            <p className="text-[10px] text-slate-400 tracking-wider font-semibold uppercase">Daily Shift</p>
            <p className="text-sm font-semibold text-white">08:30 AM - 04:30 PM</p>
          </div>
        </div>
      </div>

      {/* 2. Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="stats_panel">
        <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm hover:shadow transition-all">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Attendance Rate</p>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="text-3xl font-bold text-slate-900">{presentRate}%</p>
            <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">
              Goal &gt;= 90%
            </span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
            <div 
              className={`h-full rounded-full ${presentRate >= 90 ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${presentRate}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm hover:shadow transition-all">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Present/Late Days</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{presentDays + lateDays} <span className="text-xs text-slate-400 font-normal">out of {totalDaysRecord} days</span></p>
          <p className="text-xs text-slate-500 mt-2.5 font-mono">
            {presentDays} OnTime • {lateDays} Late arrivals
          </p>
        </div>

        <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm hover:shadow transition-all">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Approved Leave Days</p>
          <p className="text-3xl font-bold text-emerald-600 mt-2">{onLeaveDays} <span className="text-xs text-slate-400 font-normal">days logged</span></p>
          <p className="text-xs text-slate-500 mt-2.5 font-mono">
            {leaves.filter(l => l.status === 'Approved').length} formal leave applications approved
          </p>
        </div>

        <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm hover:shadow transition-all">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Absences</p>
          <p className="text-3xl font-bold text-red-600 mt-2">{absentDays} <span className="text-xs text-slate-400 font-normal">unexcused</span></p>
          <p className="text-xs text-slate-500 mt-2.5 font-mono">
            Unplanned days absent without active leave forms
          </p>
        </div>
      </div>

      {/* Dynamic Month-Wise Attendance Calendar & Payroll Units Track */}
      <AttendanceCalendar employee={employee} attendanceRecords={attendanceRecords} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Apply Leave & Raise Query (7 cols) */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* Action A: Apply Leave Form */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Calendar className="h-5 w-5 text-blue-900" />
              <h3 className="text-lg font-bold text-slate-900">Apply for Leave</h3>
            </div>

            {leaveError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-100 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <span>{leaveError}</span>
              </div>
            )}

            {leaveStatusMsg && (
              <div className="mb-4 p-3 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>{leaveStatusMsg}</span>
              </div>
            )}

            <form onSubmit={handleApplyLeave} className="space-y-4" id="leave_form">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Leave Category</label>
                  <select
                    id="leave_type_select"
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value as any)}
                    className="w-full text-xs rounded-xl border border-slate-200 p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-900"
                  >
                    <option value="Sick Leave">Sick Leave</option>
                    <option value="Casual Leave">Casual Leave</option>
                    <option value="Maternity Leave">Maternity Leave</option>
                    <option value="Earned Leave">Earned Leave</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">From Date</label>
                  <input
                    id="leave_start_input"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-200 p-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">To Date</label>
                  <input
                    id="leave_end_input"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-200 p-2 focus:outline-none focus:ring-2 focus:ring-blue-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Statement or Reason</label>
                <textarea
                  id="leave_reason_input"
                  rows={3}
                  placeholder="State the absolute reason here..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-900"
                  required
                ></textarea>
              </div>

              <button
                id="submit_leave_btn"
                type="submit"
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium py-2.5 px-5 rounded-xl cursor-pointer transition-all flex items-center gap-2 ml-auto shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Submit Application
              </button>
            </form>
          </div>

          {/* Action B: Raise Query Ticket */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <HelpCircle className="h-5 w-5 text-blue-900" />
              <h3 className="text-lg font-bold text-slate-900">Raise operational queries</h3>
            </div>

            {queryError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-100 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <span>{queryError}</span>
              </div>
            )}

            {queryStatusMsg && (
              <div className="mb-4 p-3 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>{queryStatusMsg}</span>
              </div>
            )}

            <form onSubmit={handleRaiseQuery} className="space-y-4" id="query_form">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Subject Subject</label>
                <input
                  id="query_subject_input"
                  type="text"
                  placeholder="E.g., Classroom electrical issue, desk repair request..."
                  value={querySubject}
                  onChange={(e) => setQuerySubject(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Detailed Description</label>
                <textarea
                  id="query_desc_input"
                  rows={3}
                  placeholder="Describe your subject/query thoroughly..."
                  value={queryDesc}
                  onChange={(e) => setQueryDesc(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-900"
                  required
                ></textarea>
              </div>

              <button
                id="submit_query_btn"
                type="submit"
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium py-2.5 px-5 rounded-xl cursor-pointer transition-all flex items-center gap-2 ml-auto shadow-sm"
              >
                <Send className="h-3.5 w-3.5" />
                Send Ticket
              </button>
            </form>
          </div>

          {/* Table: Leave Application History Logs */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-900" />
                <h3 className="text-base font-bold text-slate-900">Your Leave Logs</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Count: {leaves.length}</span>
            </div>

            {leavesLoading ? (
              <div className="text-center py-6 text-xs text-slate-400">Loading leave requests...</div>
            ) : leaves.length === 0 ? (
              <div className="text-center py-6 text-xs bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-400">
                No leave applications requested yet.
              </div>
            ) : (
              <div className="space-y-3.5 max-h-96 overflow-y-auto pr-1">
                {leaves.map((leave) => (
                  <div key={leave.id || leave.startDate} className="p-4 border border-slate-100 rounded-xl bg-slate-55 hover:bg-slate-50/50 transition-all text-xs">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{leave.leaveType}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({leave.startDate} to {leave.endDate})</span>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                        leave.status === 'Approved' ? 'bg-emerald-55 text-emerald-700 border border-emerald-200/50' : 
                        leave.status === 'Rejected' ? 'bg-red-50 text-red-700 border border-red-200/50' : 
                        'bg-amber-50 text-amber-700 border border-amber-200/50'
                      }`}>
                        {leave.status}
                      </span>
                    </div>
                    <p className="text-slate-600 mb-1 leading-relaxed"><strong className="text-slate-700 font-medium">Reason:</strong> {leave.reason}</p>
                    
                    {leave.status !== 'Pending' && (
                      <div className="mt-3 p-2 bg-slate-100 rounded-lg text-[11px] border border-slate-150">
                        <p className="text-slate-500 font-mono text-[9px]">Reviewed by: <strong className="text-slate-600">{leave.approvedBy || 'Administration'}</strong></p>
                        {leave.comments && <p className="text-slate-700 italic mt-0.5">"{leave.comments}"</p>}
                      </div>
                    )}
                    <p className="text-[9px] text-slate-400 text-right mt-1 font-mono">Applied: {leave.appliedAt}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Attendance lists & Support Tickets answers (5 cols) */}
        <div className="lg:col-span-12 xl:col-span-5 space-y-8">
          
          {/* Section: Your Attendance History Logs */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-900" />
                <h3 className="text-base font-bold text-slate-900">Your Attendance History</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Records: {attendanceRecords.length}</span>
            </div>

            {attendanceLoading ? (
              <div className="text-center py-8 text-xs text-slate-400">Retrieving attendance archives...</div>
            ) : attendanceRecords.length === 0 ? (
              <div className="text-center py-8 text-xs bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-400">
                No attendance histories found.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {attendanceRecords.map((rec) => (
                  <div key={rec.id || rec.date} className="pb-2 border-b border-slate-100 last:border-b-0 last:pb-0 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-800 font-mono">{rec.date}</p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        {rec.checkIn && <span>In: <strong className="font-mono">{rec.checkIn}</strong></span>}
                        {rec.checkOut && <span>• Out: <strong className="font-mono">{rec.checkOut}</strong></span>}
                      </div>
                      {rec.remarks && <p className="text-[10px] text-slate-400 italic mt-0.5">"{rec.remarks}"</p>}
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                      rec.status === 'Present' ? 'bg-emerald-50 text-emerald-600' :
                      rec.status === 'Late' ? 'bg-amber-50 text-amber-600' :
                      rec.status === 'Leave' ? 'bg-indigo-50 text-indigo-500' :
                      'bg-red-50 text-red-650'
                    }`}>
                      {rec.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Support Queries status update track */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-blue-900" />
                <h3 className="text-base font-bold text-slate-900">Your Support Tickets</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Total: {queriesList.length}</span>
            </div>

            {queriesLoading ? (
              <div className="text-center py-6 text-xs text-slate-400">Loading raised queries...</div>
            ) : queriesList.length === 0 ? (
              <div className="text-center py-8 text-xs bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-400">
                You haven't raised any queries yet.
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                {queriesList.map((ticket) => (
                  <div key={ticket.id || ticket.createdAt} className="p-4 rounded-xl border border-slate-150 bg-slate-50 text-xs">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h4 className="font-bold text-slate-800 leading-tight">{ticket.subject}</h4>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        ticket.status === 'Resolved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/50' :
                        'bg-amber-50 text-amber-700 border border-amber-200/50'
                      }`}>
                        {ticket.status}
                      </span>
                    </div>
                    <p className="text-slate-600 mb-2 leading-relaxed">{ticket.description}</p>
                    
                    {ticket.status === 'Resolved' && (
                      <div className="mt-3 p-2.5 bg-white border border-slate-100 rounded-lg">
                        <p className="text-[9px] text-slate-400 font-mono uppercase tracking-wider font-semibold">Reply Solution</p>
                        <p className="text-slate-700 font-medium italic mt-0.5">"{ticket.response}"</p>
                        {ticket.resolvedBy && <p className="text-[9px] text-slate-400 text-right mt-1.5 font-mono">Resolved by: {ticket.resolvedBy}</p>}
                      </div>
                    )}
                    <p className="text-[9px] text-slate-400 text-right font-mono mt-1">Raised: {ticket.createdAt}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Account Security (Change Password) */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="h-5 w-5 text-blue-900" />
              <h3 className="text-base font-bold text-slate-900 font-sans">Change Account Password</h3>
            </div>

            {passError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-100 rounded-xl text-xs flex items-center gap-2 animate-fade-in">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <span>{passError}</span>
              </div>
            )}

            {passSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl text-xs flex items-center gap-2 animate-fade-in">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>{passSuccess}</span>
              </div>
            )}

            <form onSubmit={handleUpdatePassword} className="space-y-4" id="teacher_password_form">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 font-mono">
                  New Secret Password
                </label>
                <input
                  id="teacher_new_password"
                  type="password"
                  placeholder="At least 4 characters long"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-900 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 font-mono">
                  Confirm New Password
                </label>
                <input
                  id="teacher_confirm_password"
                  type="password"
                  placeholder="Retype password perfectly"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-900 font-mono"
                  required
                />
              </div>

              <button
                id="teacher_update_password_btn"
                type="submit"
                disabled={passLoading}
                className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-xs font-semibold py-2.5 px-4 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-2 shadow-sm font-sans"
              >
                {passLoading ? 'Updating credentials...' : 'Update Password'}
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}
