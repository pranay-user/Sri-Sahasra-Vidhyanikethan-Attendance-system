/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  DollarSign, 
  TrendingUp, 
  Calculator, 
  User, 
  ChevronRight, 
  Edit3, 
  Save, 
  UserCheck,
  Check,
  Calendar,
  Send,
  Clock,
  HelpCircle,
  FileText,
  MessageSquare,
  ShieldAlert
} from 'lucide-react';
import { Employee, Attendance, LeaveRequest, SupportQuery } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  query, 
  where,
  setDoc,
  orderBy
} from 'firebase/firestore';

interface FinanceProps {
  employee: Employee;
}

export default function FinanceDashboard({ employee }: FinanceProps) {
  const [activeTab, setActiveTab] = useState<'payroll' | 'personal'>('payroll');
  
  // All employees details for payroll report
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  
  // Editing state for salary selection
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [tempSalary, setTempSalary] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // --- Personal section states (exactly matching employee requirements) ---
  const [personalAttendance, setPersonalAttendance] = useState<Attendance[]>([]);
  const [personalAttendanceLoading, setPersonalAttendanceLoading] = useState(true);
  
  const [personalLeaves, setPersonalLeaves] = useState<LeaveRequest[]>([]);
  const [personalLeavesLoading, setPersonalLeavesLoading] = useState(true);
  
  const [personalQueries, setPersonalQueries] = useState<SupportQuery[]>([]);
  const [personalQueriesLoading, setPersonalQueriesLoading] = useState(true);

  // Apply leave form states
  const [leaveType, setLeaveType] = useState<'Sick Leave' | 'Casual Leave' | 'Maternity Leave' | 'Earned Leave'>('Sick Leave');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [leaveMsg, setLeaveMsg] = useState<string | null>(null);

  // Raise query form states
  const [querySubject, setQuerySubject] = useState('');
  const [queryDesc, setQueryDesc] = useState('');
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryMsg, setQueryMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchEmployees();
    if (activeTab === 'personal') {
      fetchPersonalAttendance();
      fetchPersonalLeaves();
      fetchPersonalQueries();
    }
  }, [activeTab]);

  const fetchEmployees = async () => {
    setEmployeesLoading(true);
    const col = 'employees';
    try {
      const snap = await getDocs(collection(db, col));
      const list: Employee[] = [];
      snap.forEach((d) => {
        list.push({ ...d.data() } as Employee);
      });
      setEmployees(list);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, col);
    } finally {
      setEmployeesLoading(false);
    }
  };

  const handleEditSalary = (emp: Employee) => {
    setEditingEmpId(emp.employeeId);
    setTempSalary(String(emp.salary || 0));
  };

  const handleSaveSalary = async (employeeId: string) => {
    const numericSalary = Number(tempSalary);
    if (isNaN(numericSalary) || numericSalary <= 0) {
      alert('Please input a valid positive salary amount.');
      return;
    }

    const col = 'employees';
    try {
      // Update Firestore
      await updateDoc(doc(db, col, employeeId), {
        salary: numericSalary
      });

      // Update local states
      setEmployees(prev => prev.map(emp => emp.employeeId === employeeId ? { ...emp, salary: numericSalary } : emp));
      setEditingEmpId(null);
      setSaveStatus('Salary updated successfully!');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${col}/${employeeId}`);
    }
  };

  // --- Fetch Personal Staff Operations ---
  const fetchPersonalAttendance = async () => {
    setPersonalAttendanceLoading(true);
    const col = 'attendance';
    try {
      const q = query(collection(db, col), where('employeeId', '==', employee.employeeId));
      const snap = await getDocs(q);
      const list: Attendance[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Attendance);
      });
      list.sort((a, b) => b.date.localeCompare(a.date));
      setPersonalAttendance(list);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, col);
    } finally {
      setPersonalAttendanceLoading(false);
    }
  };

  const fetchPersonalLeaves = async () => {
    setPersonalLeavesLoading(true);
    const col = 'leaves';
    try {
      const q = query(collection(db, col), where('employeeId', '==', employee.employeeId));
      const snap = await getDocs(q);
      const list: LeaveRequest[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as LeaveRequest);
      });
      list.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
      setPersonalLeaves(list);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, col);
    } finally {
      setPersonalLeavesLoading(false);
    }
  };

  const fetchPersonalQueries = async () => {
    setPersonalQueriesLoading(true);
    const col = 'queries';
    try {
      const q = query(collection(db, col), where('employeeId', '==', employee.employeeId));
      const snap = await getDocs(q);
      const list: SupportQuery[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as SupportQuery);
      });
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setPersonalQueries(list);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, col);
    } finally {
      setPersonalQueriesLoading(false);
    }
  };

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeaveError(null);
    setLeaveMsg(null);

    if (!startDate || !endDate || !leaveReason) {
      setLeaveError('Please input all duration fields.');
      return;
    }

    const payload: LeaveRequest = {
      employeeId: employee.employeeId,
      employeeName: employee.name,
      role: employee.role,
      startDate,
      endDate,
      leaveType,
      reason: leaveReason,
      status: 'Pending',
      appliedAt: new Date().toISOString().substring(0, 10) + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const col = 'leaves';
    try {
      const customId = `leave_${employee.employeeId}_${Date.now()}`;
      await setDoc(doc(db, col, customId), payload);
      setLeaveMsg('Leave application proposed successfully.');
      setStartDate('');
      setEndDate('');
      setLeaveReason('');
      fetchPersonalLeaves();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, col);
    }
  };

  const handleRaiseQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    setQueryError(null);
    setQueryMsg(null);

    if (!querySubject || !queryDesc) {
      setQueryError('Please write standard subject and message body.');
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

    const col = 'queries';
    try {
      const customId = `query_${employee.employeeId}_${Date.now()}`;
      await setDoc(doc(db, col, customId), payload);
      setQueryMsg('Support inquiry raised successfully.');
      setQuerySubject('');
      setQueryDesc('');
      fetchPersonalQueries();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, col);
    }
  };

  // Calculations for payroll
  const activeStaff = employees.filter(emp => emp.status === 'Active');
  const payrollTotal = activeStaff.reduce((accum, curr) => accum + (curr.salary || 0), 0);
  const reserveNeeded = payrollTotal; // Total amount needed to be credited

  return (
    <div className="space-y-8" id="finance_dashboard">
      
      {/* Tab Selector Links */}
      <div className="flex border-b border-slate-205 gap-6">
        <button
          id="finance_tab_payouts"
          onClick={() => setActiveTab('payroll')}
          className={`pb-3.5 text-sm font-semibold tracking-wide transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
            activeTab === 'payroll' 
              ? 'border-blue-900 text-blue-900' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CreditCard className="h-4 w-4" />
          Payroll & Salaries
        </button>
        <button
          id="finance_tab_desk"
          onClick={() => setActiveTab('personal')}
          className={`pb-3.5 text-sm font-semibold tracking-wide transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
            activeTab === 'personal' 
              ? 'border-blue-900 text-blue-900' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <User className="h-4 w-4" />
          Personal Staff Desk
        </button>
      </div>

      {activeTab === 'payroll' ? (
        <div className="space-y-8 animate-fade-in" id="payroll_management_section">
          
          {/* Finance Header Banner */}
          <div className="bg-slate-900 border border-slate-800 text-white p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white mb-1">
                Finance Desk
              </h2>
              <p className="text-slate-400 text-sm">
                Signed in as <strong className="text-slate-300">{employee.name}</strong> • Account Comptroller • Sri Sahasra Vidhyanikethan
              </p>
            </div>
            
            <div className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-xl border border-slate-700 font-mono text-xs">
              <span className="text-red-400 font-bold">● ONLINE</span>
              <span className="text-slate-400">|</span>
              <span className="text-red-400 font-bold">SECURITY PROTOCOL LAYER</span>
            </div>
          </div>

          {/* Secure Restricted Access Box */}
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-12 text-center flex flex-col items-center justify-center space-y-4">
            <div className="h-16 w-16 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 mb-2">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-850">Confidential Financial Directory</h3>
            <p className="text-xs text-slate-500 max-w-md leading-relaxed mx-auto">
              Under Sri Sahasra institutional privacy guidelines, active payroll statistics, monthly budget credits, and direct salary modifications can only be viewed and entered using the main **Admin** credentials.
            </p>
            <div className="text-[10px] bg-slate-100 border border-slate-200 text-slate-500 rounded px-2.5 py-1 font-mono uppercase">
              Role: Comptroller (Restricted)
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in" id="personal_comptroller_desk">
          {/* Left Desk Forms (7 cols) */}
          <div className="lg:col-span-7 space-y-8">
            
            {/* Apply Leave */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-5">
                <Calendar className="h-5 w-5 text-blue-900" />
                <h3 className="text-sm font-bold text-slate-900">Propose Personal Leave</h3>
              </div>
              
              {leaveError && <div className="mb-4 p-2 bg-red-50 border border-red-100 text-red-700 text-xs rounded">{leaveError}</div>}
              {leaveMsg && <div className="mb-4 p-2 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded">{leaveMsg}</div>}

              <form onSubmit={handleApplyLeave} className="space-y-4" id="personal_leave_form">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-1">Leave Type</label>
                    <select
                      id="finance_leave_type"
                      value={leaveType}
                      onChange={(e) => setLeaveType(e.target.value as any)}
                      className="w-full text-xs rounded-lg border border-slate-200 p-2 text-slate-700 bg-white"
                    >
                      <option value="Sick Leave">Sick Leave</option>
                      <option value="Casual Leave">Casual Leave</option>
                      <option value="Earned Leave">Earned Leave</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-1">From</label>
                    <input
                      id="finance_leave_start"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full text-xs rounded-lg border border-slate-200 p-1.5"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-1">To</label>
                    <input
                      id="finance_leave_end"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full text-xs rounded-lg border border-slate-200 p-1.5"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1">Brief Justification</label>
                  <textarea
                    id="finance_leave_reason"
                    rows={2}
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 p-2"
                    placeholder="Provide details..."
                    required
                  ></textarea>
                </div>
                <button
                  id="finance_submit_leave"
                  type="submit"
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs py-2 px-4 rounded-xl cursor-pointer"
                >
                  Submit Form
                </button>
              </form>
            </div>

            {/* Raise query */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-5">
                <HelpCircle className="h-5 w-5 text-blue-900" />
                <h3 className="text-sm font-bold text-slate-900">Inquire and Raise Support Items</h3>
              </div>
              
              {queryError && <div className="mb-4 p-2 bg-red-50 border border-red-100 text-red-700 text-xs rounded">{queryError}</div>}
              {queryMsg && <div className="mb-4 p-2 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded">{queryMsg}</div>}

              <form onSubmit={handleRaiseQuery} className="space-y-4" id="personal_query_form">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1">Heading</label>
                  <input
                    id="finance_query_subject"
                    type="text"
                    value={querySubject}
                    onChange={(e) => setQuerySubject(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 p-2"
                    placeholder="Enter subject..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1">Inquiry Body</label>
                  <textarea
                    id="finance_query_desc"
                    rows={2}
                    value={queryDesc}
                    className="w-full text-xs rounded-lg border border-slate-200 p-2"
                    onChange={(e) => setQueryDesc(e.target.value)}
                    placeholder="Enter details..."
                    required
                  ></textarea>
                </div>
                <button
                  id="finance_submit_query"
                  type="submit"
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs py-2 px-4 rounded-xl cursor-pointer"
                >
                  Raise Ticket
                </button>
              </form>
            </div>

            {/* Leave tracks table */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <FileText className="h-4.5 w-4.5 text-blue-900" />
                Leave Applications Status Tracker
              </h3>
              {personalLeavesLoading ? (
                <div className="text-center py-4 text-xs text-slate-400">Loading leave statistics...</div>
              ) : personalLeaves.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">No leaves logged.</div>
              ) : (
                <div className="space-y-3">
                  {personalLeaves.map((l) => (
                    <div key={l.id || l.appliedAt} className="p-3 border border-slate-100 rounded-xl bg-slate-50 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">{l.leaveType}</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                          l.status === 'Approved' ? 'bg-emerald-50 text-emerald-800' :
                          l.status === 'Rejected' ? 'bg-red-50 text-red-800' : 'bg-amber-100 text-amber-800'
                        }`}>{l.status}</span>
                      </div>
                      <p className="text-slate-500 mt-1">Duration: {l.startDate} to {l.endDate}</p>
                      <p className="text-slate-600 mt-1">Reason: "{l.reason}"</p>
                      {l.status !== 'Pending' && <p className="text-[10px] text-slate-500 bg-white p-1 rounded border border-slate-100 mt-1 italic">Answer: "{l.comments}" (Reviewed by {l.approvedBy})</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Right Desk Views (5 cols) */}
          <div className="lg:col-span-12 xl:col-span-5 space-y-8">
            
            {/* Private Attendance logs */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-900" />
                Your Private Attendance logs
              </h3>
              {personalAttendanceLoading ? (
                <div className="text-center py-8 text-xs text-slate-400">Fetching attendance logs...</div>
              ) : personalAttendance.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">No attendance records logged yet.</div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {personalAttendance.map((rec) => (
                    <div key={rec.id || rec.date} className="pb-2 border-b border-slate-100 last:border-b-0 last:pb-0 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-slate-800 font-mono">{rec.date}</p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                          {rec.checkIn && <span>In: {rec.checkIn}</span>}
                          {rec.checkOut && <span>• Out: {rec.checkOut}</span>}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase font-mono ${
                        rec.status === 'Present' ? 'bg-emerald-50 text-emerald-600' :
                        rec.status === 'Late' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-500'
                      }`}>{rec.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Private queries tracking */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-blue-900" />
                Private Raised Tickets
              </h3>
              {personalQueriesLoading ? (
                <div className="text-center py-4 text-xs text-slate-400">Loading support history...</div>
              ) : personalQueries.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">No inquiries proposed.</div>
              ) : (
                <div className="space-y-3">
                  {personalQueries.map((q) => (
                    <div key={q.id || q.createdAt} className="p-3 border border-slate-100 rounded-xl bg-slate-50 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-slate-800">{q.subject}</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                          q.status === 'Resolved' ? 'bg-emerald-55 text-emerald-700' : 'bg-amber-100 text-amber-800'
                        }`}>{q.status}</span>
                      </div>
                      <p className="text-slate-600 mt-1">"{q.description}"</p>
                      {q.status === 'Resolved' && (
                        <div className="mt-2 text-[10px] border border-slate-100 p-1.5 bg-white rounded italic">
                          <span>Response: "{q.response}" - ({q.resolvedBy})</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
