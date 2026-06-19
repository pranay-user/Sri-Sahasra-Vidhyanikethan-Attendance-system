/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Award, 
  Users, 
  Calendar, 
  FileText, 
  Check, 
  X, 
  DollarSign, 
  UserCheck, 
  Clock, 
  MessageSquare,
  HelpCircle,
  TrendingUp,
  CreditCard,
  Send
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
  setDoc
} from 'firebase/firestore';

interface PrincipalProps {
  employee: Employee;
}

export default function PrincipalDashboard({ employee }: PrincipalProps) {
  const [activeTab, setActiveTab] = useState<'leaves' | 'employees' | 'queries' | 'personal'>('leaves');
  
  // States representing database tables
  const [staffList, setStaffList] = useState<Employee[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);

  const [allLeaves, setAllLeaves] = useState<LeaveRequest[]>([]);
  const [leavesLoading, setLeavesLoading] = useState(true);
  const [reviewerComments, setReviewerComments] = useState<{ [leaveId: string]: string }>({});

  const [allQueries, setAllQueries] = useState<SupportQuery[]>([]);
  const [queriesLoading, setQueriesLoading] = useState(true);
  const [responseTexts, setResponseTexts] = useState<{ [queryId: string]: string }>({});

  // Personal portal state details (like any standard staff member)
  const [personalAttendance, setPersonalAttendance] = useState<Attendance[]>([]);
  const [personalAttendanceLoading, setPersonalAttendanceLoading] = useState(true);
  const [persLeaves, setPersLeaves] = useState<LeaveRequest[]>([]);
  const [persLeavesLoading, setPersLeavesLoading] = useState(true);
  
  // Personal inputs
  const [persLeaveType, setPersLeaveType] = useState<'Sick Leave' | 'Casual Leave' | 'Maternity Leave' | 'Earned Leave'>('Sick Leave');
  const [persStart, setPersStart] = useState('');
  const [persEnd, setPersEnd] = useState('');
  const [persReason, setPersReason] = useState('');
  const [persMsg, setPersMsg] = useState<string | null>(null);

  // Load database entities
  useEffect(() => {
    fetchStaff();
    fetchLeaves();
    fetchQueries();
    if (activeTab === 'personal') {
      fetchPersonalAttendance();
      fetchPersLeaves();
    }
  }, [activeTab]);

  const fetchStaff = async () => {
    setStaffLoading(true);
    const col = 'employees';
    try {
      const snap = await getDocs(collection(db, col));
      const list: Employee[] = [];
      snap.forEach((d) => {
        list.push({ ...d.data() } as Employee);
      });
      setStaffList(list);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, col);
    } finally {
      setStaffLoading(false);
    }
  };

  const fetchLeaves = async () => {
    setLeavesLoading(true);
    const col = 'leaves';
    try {
      const snap = await getDocs(collection(db, col));
      const list: LeaveRequest[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as LeaveRequest);
      });
      // Sort: Pending applications first
      list.sort((a, b) => {
        if (a.status === 'Pending' && b.status !== 'Pending') return -1;
        if (a.status !== 'Pending' && b.status === 'Pending') return 1;
        return b.appliedAt.localeCompare(a.appliedAt);
      });
      setAllLeaves(list);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, col);
    } finally {
      setLeavesLoading(false);
    }
  };

  const fetchQueries = async () => {
    setQueriesLoading(true);
    const col = 'queries';
    try {
      const snap = await getDocs(collection(db, col));
      const list: SupportQuery[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as SupportQuery);
      });
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setAllQueries(list);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, col);
    } finally {
      setQueriesLoading(false);
    }
  };

  // --- Supervisor Deciding Leave Applications ---
  const handleReviewLeave = async (leaveId: string, status: 'Approved' | 'Rejected') => {
    const comment = reviewerComments[leaveId] || `Processed and ${status.toLowerCase()} by Principal M. V. Prasad.`;
    
    const col = 'leaves';
    try {
      await updateDoc(doc(db, col, leaveId), {
        status,
        approvedBy: `${employee.name} (${employee.role})`,
        comments: comment
      });

      // Clear layout input
      setReviewerComments(prev => {
        const copy = { ...prev };
        delete copy[leaveId];
        return copy;
      });

      // Reload list
      fetchLeaves();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${col}/${leaveId}`);
    }
  };

  // --- Supervisor Answering Support Tickets ---
  const handleResolveQuery = async (queryId: string) => {
    const text = responseTexts[queryId];
    if (!text) {
      alert('Please enter resolution text before submitting.');
      return;
    }

    const col = 'queries';
    try {
      await updateDoc(doc(db, col, queryId), {
        status: 'Resolved',
        resolvedAt: new Date().toISOString().substring(0, 10),
        resolvedBy: `${employee.name} (${employee.role})`,
        response: text
      });

      setResponseTexts(prev => {
        const copy = { ...prev };
        delete copy[queryId];
        return copy;
      });

      fetchQueries();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${col}/${queryId}`);
    }
  };

  // --- Personal Portal functions ---
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

  const fetchPersLeaves = async () => {
    setPersLeavesLoading(true);
    const col = 'leaves';
    try {
      const q = query(collection(db, col), where('employeeId', '==', employee.employeeId));
      const snap = await getDocs(q);
      const list: LeaveRequest[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as LeaveRequest);
      });
      setPersLeaves(list);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, col);
    } finally {
      setPersLeavesLoading(false);
    }
  };

  const handleApplyPersonalLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!persStart || !persEnd || !persReason) return;

    const payload: LeaveRequest = {
      employeeId: employee.employeeId,
      employeeName: employee.name,
      role: employee.role,
      startDate: persStart,
      endDate: persEnd,
      leaveType: persLeaveType,
      reason: persReason,
      status: 'Pending',
      appliedAt: new Date().toISOString().substring(0, 10) + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const col = 'leaves';
    try {
      const customId = `leave_${employee.employeeId}_${Date.now()}`;
      await setDoc(doc(db, col, customId), payload);
      setPersMsg('Sent your personal leave application to System Admins.');
      setPersStart('');
      setPersEnd('');
      setPersReason('');
      fetchPersLeaves();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, col);
    }
  };

  // Math variables
  const pendingLeaves = allLeaves.filter(l => l.status === 'Pending');
  const openQueries = allQueries.filter(q => q.status === 'Open');
  const salaries = staffList.map(e => e.salary || 0);
  const totalSchoolSalaries = staffList.reduce((acc, c) => acc + (c.salary || 0), 0);

  return (
    <div className="space-y-8" id="principal_dashboard">
      
      {/* Principal Navigation Links */}
      <div className="flex flex-wrap border-b border-slate-200 gap-6">
        <button
          id="principal_tab_leaves"
          onClick={() => setActiveTab('leaves')}
          className={`pb-3.5 text-sm font-semibold tracking-wide transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
            activeTab === 'leaves' 
              ? 'border-blue-900 text-blue-900' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="h-4.5 w-4.5" />
          Leave Approvals
          {pendingLeaves.length > 0 && (
            <span className="bg-red-500 text-white font-mono text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">
              {pendingLeaves.length}
            </span>
          )}
        </button>

        <button
          id="principal_tab_staff"
          onClick={() => setActiveTab('employees')}
          className={`pb-3.5 text-sm font-semibold tracking-wide transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
            activeTab === 'employees' 
              ? 'border-blue-900 text-blue-900' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="h-4.5 w-4.5" />
          Staff Oversight
        </button>

        <button
          id="principal_tab_queries"
          onClick={() => setActiveTab('queries')}
          className={`pb-3.5 text-sm font-semibold tracking-wide transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
            activeTab === 'queries' 
              ? 'border-blue-900 text-blue-900' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MessageSquare className="h-4.5 w-4.5" />
          Academic Queries
          {openQueries.length > 0 && (
            <span className="bg-indigo-600 text-white font-mono text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">
              {openQueries.length}
            </span>
          )}
        </button>

        <button
          id="principal_tab_personal"
          onClick={() => setActiveTab('personal')}
          className={`pb-3.5 text-sm font-semibold tracking-wide transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
            activeTab === 'personal' 
              ? 'border-blue-900 text-blue-900' 
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Award className="h-4.5 w-4.5" />
          Personal Portal
        </button>
      </div>

      {/* Main Container Panels */}
      {activeTab === 'leaves' && (
        <div id="leaves_panel" className="space-y-6 animate-fade-in">
          
          {/* principal header block */}
          <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-amber-400">Principal's Leave Decision Center</h2>
              <p className="text-xs text-slate-400 mt-1">Review operational, classroom teacher, and finance staff leave applications.</p>
            </div>
            <div className="bg-slate-800 border border-slate-700 font-mono text-[11px] select-none p-2.5 rounded-lg text-slate-300">
              Principal: <strong className="text-white">Dr. M. V. Prasad</strong>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 mb-5">Outstanding Staff Leave Applications</h3>

            {leavesLoading ? (
              <div className="text-center py-10 text-xs text-slate-400">Loading leave roster...</div>
            ) : allLeaves.length === 0 ? (
              <p className="text-xs py-8 text-center text-slate-400 bg-slate-50 border-slate-100 rounded-xl border border-dashed">No leave proposals found in system databases.</p>
            ) : (
              <div className="space-y-4">
                {allLeaves.map((leave) => {
                  // Skip their own leaves so they do not review themselves
                  if (leave.employeeId === employee.employeeId) return null;

                  return (
                    <div key={leave.id} className="border border-slate-150 rounded-xl p-5 hover:bg-slate-50/50 transition-all text-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-900 text-sm">{leave.employeeName}</h4>
                            <span className="bg-slate-100 text-slate-650 px-2 py-0.5 rounded text-[10px] font-medium">{leave.role}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono mt-0.5">Applied: {leave.appliedAt}</p>
                        </div>

                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                          leave.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' :
                          leave.status === 'Rejected' ? 'bg-red-50 text-red-700' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {leave.status}
                        </span>
                      </div>

                      <div className="bg-slate-50/60 p-3.5 rounded-lg border border-slate-100 space-y-1 mt-2.5">
                        <p><strong className="text-slate-700 font-semibold">Leave Type:</strong> {leave.leaveType}</p>
                        <p><strong className="text-slate-700 font-semibold">Proximity Dates:</strong> {leave.startDate} to {leave.endDate}</p>
                        <p><strong className="text-slate-700 font-semibold">Brief Justification:</strong> "{leave.reason}"</p>
                      </div>

                      {leave.status === 'Pending' ? (
                        <div className="mt-4 space-y-3 pt-3 border-t border-slate-100">
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Add Decision Comments / Remarks</label>
                            <input
                              id={`leave_feedback_${leave.id}`}
                              type="text"
                              placeholder="Approved. Please make sure class arrangements are covered..."
                              value={reviewerComments[leave.id || ''] || ''}
                              onChange={(e) => setReviewerComments({
                                ...reviewerComments,
                                [leave.id || '']: e.target.value
                              })}
                              className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-blue-900 focus:outline-none focus:border-transparent"
                            />
                          </div>

                          <div className="flex items-center justify-end gap-2.5">
                            <button
                              id={`reject_leave_${leave.id}`}
                              onClick={() => handleReviewLeave(leave.id || '', 'Rejected')}
                              className="px-3.5 py-1.5 border border-red-200 hover:border-red-500 hover:bg-red-50 text-red-700 rounded-lg font-medium transition-all inline-flex items-center gap-1.5 cursor-pointer text-xs"
                            >
                              <X className="h-3.5 w-3.5" />
                              Reject
                            </button>
                            <button
                              id={`approve_leave_${leave.id}`}
                              onClick={() => handleReviewLeave(leave.id || '', 'Approved')}
                              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium transition-all inline-flex items-center gap-1.5 cursor-pointer text-xs"
                            >
                              <Check className="h-3.5 w-3.5 text-emerald-400 stroke-[3]" />
                              Approve Leave
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 text-[11px] text-slate-400 font-mono flex items-center justify-between">
                          <span>Processed by: <strong className="text-slate-600">{leave.approvedBy || 'Administration'}</strong></span>
                          <span>Remarks: <strong className="text-slate-600 italic">"{leave.comments}"</strong></span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'employees' && (
        <div id="employees_panel" className="space-y-6 animate-fade-in">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Sri Sahasra Vidhyanikethan Staff Directory</h3>
                <p className="text-xs text-slate-500 mt-1">Full demographics and administrative oversight.</p>
              </div>
            </div>

            {staffLoading ? (
              <div className="text-center py-10 text-xs text-slate-400">Loading employee sheets...</div>
            ) : (
              <div className="overflow-x-auto border border-slate-100 rounded-xl" id="staff_table_container">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-650 uppercase tracking-wider font-semibold">
                      <th className="p-4 font-bold">Staff Member</th>
                      <th className="p-4 font-bold">Designation</th>
                      <th className="p-4 font-bold">Role</th>
                      <th className="p-4 font-bold">Phone contact</th>
                      <th className="p-4 font-bold text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {staffList.map((st) => (
                      <tr key={st.employeeId} className="hover:bg-slate-50/50 transition-all">
                        <td className="p-4">
                          <div>
                            <p className="font-bold text-slate-800">{st.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{st.email}</p>
                          </div>
                        </td>
                        <td className="p-4 text-slate-500 font-medium">{st.designation}</td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-slate-100 border border-slate-200 text-slate-650">
                            {st.role}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-slate-600">{st.phone}</td>
                        <td className="p-4 text-center">
                          <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded-full border border-emerald-100">
                            {st.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'queries' && (
        <div id="queries_panel" className="space-y-6 animate-fade-in">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 mb-4">Staff Support Queries Board</h3>

            {queriesLoading ? (
              <div className="text-center py-10 text-xs text-slate-400">Loading active inquiries...</div>
            ) : allQueries.length === 0 ? (
              <p className="text-xs text-slate-400 bg-slate-50 p-6 text-center border rounded-xl">No raised queries found.</p>
            ) : (
              <div className="space-y-4">
                {allQueries.map((q) => (
                  <div key={q.id} className="border border-slate-150 rounded-xl p-4 text-xs hover:bg-slate-50/20 transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">{q.subject}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-mono">Raised by: {q.employeeName} ({q.createdAt})</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                        q.status === 'Resolved' ? 'bg-emerald-50 text-emerald-750' : 'bg-amber-100 text-amber-700'
                      }`}>{q.status}</span>
                    </div>

                    <p className="text-slate-600 mt-2.5 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">"{q.description}"</p>

                    {q.status === 'Open' ? (
                      <div className="mt-4 pt-3 border-t border-slate-100 shrink-0 flex flex-col gap-2">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Add Solution / Reply</label>
                        <div className="flex gap-2">
                          <input
                            id={`query_answer_field_${q.id}`}
                            value={responseTexts[q.id || ''] || ''}
                            onChange={(e) => setResponseTexts({
                              ...responseTexts,
                              [q.id || '']: e.target.value
                            })}
                            className="bg-white border border-slate-205 py-1.5 px-3 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-900 text-xs flex-grow"
                            placeholder="Type resolution reply..."
                          />
                          <button
                            id={`submit_query_ans_${q.id}`}
                            onClick={() => handleResolveQuery(q.id || '')}
                            className="bg-slate-900 hover:bg-slate-800 text-white rounded-lg px-4 text-xs font-semibold select-none flex items-center justify-center cursor-pointer font-mono"
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 p-2.5 bg-slate-50 border border-slate-150 rounded-lg text-xs">
                        <span className="text-[9px] text-slate-400 font-mono uppercase tracking-wider block font-semibold">Solution Response</span>
                        <p className="text-slate-700 italic mt-0.5">"{q.response}"</p>
                        <p className="text-[9px] text-slate-400 text-right font-mono mt-1">Answered by: {q.resolvedBy} on {q.resolvedAt}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'personal' && (
        <div id="personal_panel" className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in">
          
          {/* Apply leave personally (7 cols) */}
          <div className="lg:col-span-7 space-y-8">
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-950" />
                Submit Personal Leave Application
              </h3>

              {persMsg && <div className="mb-4 p-2 bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded">{persMsg}</div>}
              
              <form onSubmit={handleApplyPersonalLeave} className="space-y-4" id="pers_leave_form">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider">Leave Type</label>
                    <select
                      id="principal_leave_type_input"
                      value={persLeaveType}
                      onChange={(e) => setPersLeaveType(e.target.value as any)}
                      className="w-full text-xs rounded-lg border border-slate-200 p-2 text-slate-700 bg-white"
                    >
                      <option value="Sick Leave">Sick Leave</option>
                      <option value="Casual Leave">Casual Leave</option>
                      <option value="Earned Leave">Earned Leave</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider">From</label>
                    <input
                      id="principal_leave_start_input"
                      type="date"
                      value={persStart}
                      onChange={(e) => setPersStart(e.target.value)}
                      className="w-full text-xs rounded-lg border border-slate-200 p-1.5"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider">To</label>
                    <input
                      id="principal_leave_end_input"
                      type="date"
                      value={persEnd}
                      onChange={(e) => setPersEnd(e.target.value)}
                      className="w-full text-xs rounded-lg border border-slate-200 p-1.5"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold mb-1 uppercase tracking-wider">Reason</label>
                  <textarea
                    id="principal_leave_reason_input"
                    rows={2}
                    value={persReason}
                    onChange={(e) => setPersReason(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 p-2"
                    placeholder="Provide details..."
                    required
                  ></textarea>
                </div>

                <button
                  id="submit_pers_leave_btn"
                  type="submit"
                  className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs py-2 px-4 cursor-pointer"
                >
                  Propose Form
                </button>
              </form>
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <FileText className="h-4.5 w-4.5 text-blue-900" />
                Personal Leave Logs
              </h3>

              {persLeavesLoading ? (
                <div className="text-center py-4 text-xs text-slate-400">Loading logs...</div>
              ) : persLeaves.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">None logged.</div>
              ) : (
                <div className="space-y-3">
                  {persLeaves.map((l) => (
                    <div key={l.id || l.appliedAt} className="p-3 border border-slate-100 rounded-xl bg-slate-50 text-xs text-slate-700">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">{l.leaveType}</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                          l.status === 'Approved' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>{l.status}</span>
                      </div>
                      <p className="mt-1 font-mono text-[11px]">Duration: {l.startDate} to {l.endDate}</p>
                      <p className="mt-1 leading-relaxed">Reason: "{l.reason}"</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Personal attendance history (5 cols) */}
          <div className="lg:col-span-5 space-y-8">
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Clock className="h-4.5 w-4.5 text-blue-900" />
                Personal Attendance history
              </h3>

              {personalAttendanceLoading ? (
                <div className="text-center py-4 text-xs text-slate-400">Retrieving checkins...</div>
              ) : personalAttendance.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400 font-mono">No Check-in logged.</div>
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
                        rec.status === 'Present' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-200 text-amber-800'
                      }`}>{rec.status}</span>
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
