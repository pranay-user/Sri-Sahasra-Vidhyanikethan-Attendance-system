/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Clock, 
  Users, 
  Calendar, 
  CheckCircle, 
  AlertCircle, 
  DollarSign,
  Save, 
  Search,
  Filter,
  Check,
  X,
  FileText,
  TrendingUp,
  UserX,
  UserPlus,
  Edit,
  Trash2,
  Info,
  Plus,
  Camera,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import AttendanceCalendar from './AttendanceCalendar';
import { calculateMonthlyPayroll, formatINR } from '../lib/utils';

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
import { Employee, Attendance, LeaveRequest, SchoolConfig, Holiday, EnrolledFace } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  setDoc,
  getDoc,
  query,
  where,
  deleteDoc
} from 'firebase/firestore';

interface AdminProps {
  employee: Employee;
  onTimingsUpdated?: () => void;
}

export default function AdminDashboard({ employee, onTimingsUpdated }: AdminProps) {
  const [activeTab, setActiveTab] = useState<'timings' | 'attendance' | 'employees' | 'leaves' | 'payroll' | 'holidays'>('timings');

  // School Timings operational config state
  const [checkInTime, setCheckInTime] = useState('08:30 AM');
  const [checkOutTime, setCheckOutTime] = useState('04:30 PM');
  const [graceTime, setGraceTime] = useState('08:45 AM');
  const [timingsLoading, setTimingsLoading] = useState(true);
  const [timingsSaveMsg, setTimingsSaveMsg] = useState<string | null>(null);

  // General lists
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);

  const [allAttendance, setAllAttendance] = useState<Attendance[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().substring(0, 10)
  );

  const [allLeaves, setAllLeaves] = useState<LeaveRequest[]>([]);
  const [leavesLoading, setLeavesLoading] = useState(true);
  const [reviewComments, setReviewComments] = useState<{ [id: string]: string }>({});

  // Filter/Search queries
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [attendanceFilter, setAttendanceFilter] = useState<'All' | 'Present' | 'Absent' | 'Late' | 'Leave'>('All');

  // New employee state variables
  const [newEmpId, setNewEmpId] = useState('');
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpPhone, setNewEmpPhone] = useState('');
  const [newEmpDesignation, setNewEmpDesignation] = useState('');
  const [newEmpRole, setNewEmpRole] = useState<'Teacher' | 'Finance' | 'Principal' | 'Admin'>('Teacher');
  const [newEmpSalary, setNewEmpSalary] = useState<number>(40000);
  const [newEmpStatus, setNewEmpStatus] = useState<'Active' | 'Inactive'>('Active');
  const [newEmpPassword, setNewEmpPassword] = useState('');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  
  // Search and status messages for employees list
  const [empSearch, setEmpSearch] = useState('');
  const [empSuccessMsg, setEmpSuccessMsg] = useState<string | null>(null);
  const [empErrorMsg, setEmpErrorMsg] = useState<string | null>(null);
  const [empFormSubmitting, setEmpFormSubmitting] = useState(false);

  // Administrative Face Bio settings state
  const [enrolledFaces, setEnrolledFaces] = useState<Record<string, EnrolledFace>>({});
  const [enrollingEmployee, setEnrollingEmployee] = useState<Employee | null>(null);
  const [enrollPhoto, setEnrollPhoto] = useState<string | null>(null);
  const [enrollSuccessMsg, setEnrollSuccessMsg] = useState<string | null>(null);
  const [enrollErrorMsg, setEnrollErrorMsg] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  // List inline salary editor state
  const [editingSalaryId, setEditingSalaryId] = useState<string | null>(null);
  const [tempSalaryInput, setTempSalaryInput] = useState<string>('');
  const [salaryUpdating, setSalaryUpdating] = useState<boolean>(false);
  const [selectedCalendarEmployeeId, setSelectedCalendarEmployeeId] = useState<string | null>(null);
  
  // Dynamic Month/Year filters for administering Payroll Ledger tabular reports
  const [payrollYear, setPayrollYear] = useState('2026');
  const [payrollMonth, setPayrollMonth] = useState('06');

  // Holidays custom maker state
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidaysLoading, setHolidaysLoading] = useState(true);
  const [holidayDateInput, setHolidayDateInput] = useState('');
  const [holidayTitleInput, setHolidayTitleInput] = useState('');
  const [holidaySaveError, setHolidaySaveError] = useState<string | null>(null);
  const [holidaySaveSuccess, setHolidaySaveSuccess] = useState<string | null>(null);
  const [isHolidayFormSubmitting, setIsHolidayFormSubmitting] = useState(false);

  // Pre-fill default randomized ID on active tab load
  useEffect(() => {
    if (activeTab === 'employees' && !newEmpId && !editingEmployeeId) {
      resetEmployeeForm();
    }
  }, [activeTab]);

  const resetEmployeeForm = () => {
    setNewEmpId('emp_' + Math.floor(1000 + Math.random() * 9000));
    setNewEmpName('');
    setNewEmpEmail('');
    setNewEmpPhone('');
    setNewEmpDesignation('');
    setNewEmpRole('Teacher');
    setNewEmpSalary(40000);
    setNewEmpStatus('Active');
    setNewEmpPassword('');
    setEditingEmployeeId(null);
  };

  useEffect(() => {
    fetchTimings();
    fetchEmployees();
    fetchAttendance();
    fetchLeaves();
    fetchHolidays();
    fetchEnrolledFaces();
  }, [activeTab]);

  // Camera Management lifetimes for Admin
  useEffect(() => {
    if (enrollingEmployee) {
      setupCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [enrollingEmployee]);

  const setupCamera = async () => {
    setCameraError(null);
    try {
      if (stream) {
        stopCamera();
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });
      setStream(mediaStream);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(e => console.warn('Video element play interrupted safely', e));
          };
        }
      }, 100);
    } catch (err) {
      console.error('Webcam initialization failed', err);
      setCameraError('Camera access denied or device is already occupied.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      try {
        stream.getTracks().forEach((track) => track.stop());
      } catch (e) {
        console.warn('Track stop error', e);
      }
      setStream(null);
    }
  };

  const handleCaptureEnrollSnapshot = () => {
    if (!stream) {
      setEnrollErrorMsg('Camera stream not active.');
      return;
    }
    if (!enrollingEmployee) return;

    setEnrollErrorMsg(null);
    setEnrollSuccessMsg(null);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 300;
    tempCanvas.height = 300;
    const tempCtx = tempCanvas.getContext('2d');

    if (tempCtx && videoRef.current) {
      const vWidth = videoRef.current.videoWidth || 640;
      const vHeight = videoRef.current.videoHeight || 480;
      const cropSize = Math.min(vWidth, vHeight, 400);
      const startX = (vWidth - cropSize) / 2;
      const startY = (vHeight - cropSize) / 2;

      tempCtx.drawImage(
        videoRef.current,
        startX, startY, cropSize, cropSize,
        0, 0, 300, 300
      );

      const base64Data = tempCanvas.toDataURL('image/jpeg', 0.85);
      setEnrollPhoto(base64Data);
    } else {
      setEnrollErrorMsg('Unable to render frame buffers.');
    }
  };

  const handleSaveEnrollment = async () => {
    if (!enrollingEmployee || !enrollPhoto) {
      setEnrollErrorMsg('A valid profile selection and live snapshot are required.');
      return;
    }

    setEnrollErrorMsg(null);
    setEnrollSuccessMsg(null);

    const targetEmpId = enrollingEmployee.employeeId;

    try {
      const payload: EnrolledFace = {
        employeeId: targetEmpId,
        name: enrollingEmployee.name,
        photoUrl: enrollPhoto,
        enrolledAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'face_enrollments', targetEmpId), payload);
      
      setEnrolledFaces(prev => ({
        ...prev,
        [targetEmpId]: payload
      }));

      setEnrollSuccessMsg(`Face signature mapped successfully for ${enrollingEmployee.name}!`);
      
      setTimeout(() => {
        setEnrollingEmployee(null);
        setEnrollPhoto(null);
        setEnrollSuccessMsg(null);
      }, 2000);

    } catch (err) {
      console.error(err);
      setEnrollErrorMsg('Communication timeout saving bio profiles.');
    }
  };

  const handleDeleteFaceEnrollment = async (empId: string) => {
    if (!window.confirm("Are you sure you want to delete this employee's face recognition profile?")) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'face_enrollments', empId));
      setEnrolledFaces(prev => {
        const copy = { ...prev };
        delete copy[empId];
        return copy;
      });
      alert("Face recognition data deleted successfully.");
    } catch (err) {
      console.error(err);
      alert("Failed to delete face recognition data from Firestore.");
    }
  };

  const fetchEnrolledFaces = async () => {
    try {
      const snap = await getDocs(collection(db, 'face_enrollments'));
      const dict: Record<string, EnrolledFace> = {};
      snap.forEach(d => {
        dict[d.id] = d.data() as EnrolledFace;
      });
      setEnrolledFaces(dict);
    } catch (e) {
      console.warn('Could not sync enrolled faces', e);
    }
  };

  const fetchTimings = async () => {
    setTimingsLoading(true);
    const colPr = 'config';
    try {
      const docSnap = await getDoc(doc(db, colPr, 'school_timings'));
      if (docSnap.exists()) {
        const config = docSnap.data() as SchoolConfig;
        setCheckInTime(config.checkInTime);
        setCheckOutTime(config.checkOutTime);
        setGraceTime(config.graceTime);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `${colPr}/school_timings`);
    } finally {
      setTimingsLoading(false);
    }
  };

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

  const fetchAttendance = async () => {
    setAttendanceLoading(true);
    const col = 'attendance';
    try {
      const snap = await getDocs(collection(db, col));
      const list: Attendance[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Attendance);
      });
      setAllAttendance(list);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, col);
    } finally {
      setAttendanceLoading(false);
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
      list.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
      setAllLeaves(list);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, col);
    } finally {
      setLeavesLoading(false);
    }
  };

  const fetchHolidays = async () => {
    setHolidaysLoading(true);
    const colPr = 'holidays';
    try {
      const snap = await getDocs(collection(db, colPr));
      const list: Holiday[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Holiday);
      });
      list.sort((a, b) => a.date.localeCompare(b.date));
      setHolidays(list);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, colPr);
    } finally {
      setHolidaysLoading(false);
    }
  };

  const handleSaveHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    setHolidaySaveError(null);
    setHolidaySaveSuccess(null);
    if (!holidayDateInput || !holidayTitleInput.trim()) {
      setHolidaySaveError('Both holiday date and holiday label/title are required.');
      return;
    }

    setIsHolidayFormSubmitting(true);
    const colPr = 'holidays';
    try {
      const payload = {
        date: holidayDateInput,
        title: holidayTitleInput.trim()
      };
      await setDoc(doc(db, colPr, holidayDateInput), payload);
      setHolidaySaveSuccess(`Successfully added/updated holiday: "${holidayTitleInput.trim()}" on ${holidayDateInput}`);
      setHolidayDateInput('');
      setHolidayTitleInput('');
      fetchHolidays();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `${colPr}/${holidayDateInput}`);
    } finally {
      setIsHolidayFormSubmitting(false);
    }
  };

  const handleDeleteHoliday = async (holidayId: string) => {
    const colPr = 'holidays';
    try {
      await deleteDoc(doc(db, colPr, holidayId));
      fetchHolidays();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${colPr}/${holidayId}`);
    }
  };

  // Save Config Timings
  const handleSaveTimings = async (e: React.FormEvent) => {
    e.preventDefault();
    setTimingsSaveMsg(null);

    const configPayload: SchoolConfig = {
      checkInTime,
      checkOutTime,
      graceTime
    };

    const colPr = 'config';
    try {
      await setDoc(doc(db, colPr, 'school_timings'), configPayload);
      setTimingsSaveMsg('Official school operational timings saved and synchronized live.');
      
      if (onTimingsUpdated) {
        onTimingsUpdated();
      }
      
      setTimeout(() => setTimingsSaveMsg(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${colPr}/school_timings`);
    }
  };

  // Process staff leaves: Admin has absolute leaves power
  const handleReviewLeave = async (leaveId: string, status: 'Approved' | 'Rejected') => {
    const comments = reviewComments[leaveId] || `Reviewed and ${status.toLowerCase()} by Systems Administrator Swathi Reddy.`;

    const col = 'leaves';
    try {
      await updateDoc(doc(db, col, leaveId), {
        status,
        approvedBy: `${employee.name} (${employee.role})`,
        comments: comments
      });

      setReviewerCommentsCleared(leaveId);
      fetchLeaves();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `${col}/${leaveId}`);
    }
  };

  const setReviewerCommentsCleared = (leaveId: string) => {
    setReviewComments(prev => {
      const copy = { ...prev };
      delete copy[leaveId];
      return copy;
    });
  };

  // Form submit handler to create new administrative or academic staff account or edit existing
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmpSuccessMsg(null);
    setEmpErrorMsg(null);

    const finalId = newEmpId.trim();
    const finalName = newEmpName.trim();
    const finalEmail = newEmpEmail.trim().toLowerCase();
    const finalPhone = newEmpPhone.trim();
    const finalDesignation = newEmpDesignation.trim();

    if (!finalId || !finalName || !finalEmail || !finalPhone || !finalDesignation) {
      setEmpErrorMsg('Please fill in all employee account details.');
      return;
    }

    if (!finalEmail.includes('@') || !finalEmail.includes('.')) {
      setEmpErrorMsg('Please provide a valid email address.');
      return;
    }

    // Uniqueness validation checks
    if (!editingEmployeeId) {
      const targetIdConflict = employees.find(emp => emp.employeeId.toLowerCase() === finalId.toLowerCase());
      if (targetIdConflict) {
        setEmpErrorMsg(`The Employee ID '${finalId}' is already registered.`);
        return;
      }
    }

    const emailConflict = employees.find(emp => 
      emp.email.toLowerCase() === finalEmail && emp.employeeId.toLowerCase() !== (editingEmployeeId || '').toLowerCase()
    );
    if (emailConflict) {
      setEmpErrorMsg(`The email address '${finalEmail}' is already registered.`);
      return;
    }

    setEmpFormSubmitting(true);
    
    // Custom password resolving
    const existingPassword = editingEmployeeId 
      ? employees.find(emp => emp.employeeId === editingEmployeeId)?.password 
      : undefined;
    const finalPassword = newEmpPassword.trim() || existingPassword || `${newEmpRole.toLowerCase()}123`;

    const newEmpPayload: Employee = {
      employeeId: editingEmployeeId || finalId,
      name: finalName,
      email: finalEmail,
      role: newEmpRole,
      salary: Number(newEmpSalary),
      designation: finalDesignation,
      phone: finalPhone,
      status: newEmpStatus,
      password: finalPassword
    };

    const col = 'employees';
    try {
      const targetId = editingEmployeeId || finalId;
      await setDoc(doc(db, col, targetId), newEmpPayload);
      if (editingEmployeeId) {
        setEmpSuccessMsg(`Staff account for ${finalName} successfully updated! Password secured.`);
      } else {
        setEmpSuccessMsg(`Staff account for ${finalName} successfully created! Preset login password: "${finalPassword}"`);
      }
      
      // Auto-refresh checklist
      resetEmployeeForm();
      fetchEmployees();
    } catch (err) {
      setEmpErrorMsg('Failed to save staff record to database.');
      handleFirestoreError(err, OperationType.CREATE, `${col}/${editingEmployeeId || finalId}`);
    } finally {
      setEmpFormSubmitting(false);
    }
  };

  // Delete Employee record completely from Firestore database
  const handleDeleteEmployee = async (empId: string) => {
    if (!window.confirm(`Are you absolutely sure you want to delete staff member "${empId}"? This will permanently wipe their credentials and profile.`)) {
      return;
    }
    setEmpSuccessMsg(null);
    setEmpErrorMsg(null);
    const col = 'employees';
    try {
      await deleteDoc(doc(db, col, empId));
      setEmpSuccessMsg(`Staff account for ID ${empId} successfully deleted.`);
      fetchEmployees();
      if (editingEmployeeId === empId) {
        resetEmployeeForm();
      }
    } catch (err) {
      setEmpErrorMsg(`Failed to delete staff record ${empId}.`);
      handleFirestoreError(err, OperationType.DELETE, `${col}/${empId}`);
    }
  };

  // Inline handler to update salary for staff members
  const handleInlineSaveSalary = async (empId: string) => {
    const numericSalary = Number(tempSalaryInput);
    if (isNaN(numericSalary) || numericSalary <= 0) {
      setEmpErrorMsg('Please enter a valid positive salary numeric value.');
      return;
    }

    setSalaryUpdating(true);
    setEmpErrorMsg(null);
    setEmpSuccessMsg(null);
    const colPr = 'employees';
    try {
      await updateDoc(doc(db, colPr, empId), {
        salary: numericSalary
      });
      setEmpSuccessMsg(`Compensation for staff ID ${empId} successfully updated to ₹${numericSalary.toLocaleString('en-IN')}`);
      setEditingSalaryId(null);
      fetchEmployees();
    } catch (err) {
      setEmpErrorMsg('Failed to update employee salary in database.');
      handleFirestoreError(err, OperationType.UPDATE, `${colPr}/${empId}`);
    } finally {
      setSalaryUpdating(false);
    }
  };

  // Compile active day records
  // Filter attendance records to display selected date
  const filteredAttendance = allAttendance.filter((rec) => {
    const matchDate = rec.date === selectedDate;
    const matchSearch = rec.employeeName.toLowerCase().includes(attendanceSearch.toLowerCase());
    const matchFilter = attendanceFilter === 'All' || rec.status === attendanceFilter;
    return matchDate && matchSearch && matchFilter;
  });

  // Calculate stats specifically for the selected date
  const selectedDateRecords = allAttendance.filter((rec) => rec.date === selectedDate);
  const presentCount = selectedDateRecords.filter(r => r.status === 'Present').length;
  const lateCount = selectedDateRecords.filter(r => r.status === 'Late').length;
  const absentCount = selectedDateRecords.filter(r => r.status === 'Absent').length;
  const leaveCount = selectedDateRecords.filter(r => r.status === 'Leave').length;

  // Total school salaries payroll with fallback safeguard for unconfigured wages
  const totalSalariesSum = employees.reduce((acc, c) => acc + (c.salary || 0), 0);

  return (
    <div className="space-y-8" id="admin_dashboard">
      
      {/* Admin Tab Selector */}
      <div className="flex flex-wrap border-b border-slate-200 gap-6">
        <button
          id="admin_tab_timings"
          onClick={() => setActiveTab('timings')}
          className={`pb-3.5 text-sm font-semibold tracking-wide transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'timings' ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="h-4.5 w-4.5" />
          School Timings Settings
        </button>

        <button
          id="admin_tab_attendance"
          onClick={() => setActiveTab('attendance')}
          className={`pb-3.5 text-sm font-semibold tracking-wide transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'attendance' ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="h-4.5 w-4.5" />
          Attendance Ledger
        </button>

        <button
          id="admin_tab_employees"
          onClick={() => setActiveTab('employees')}
          className={`pb-3.5 text-sm font-semibold tracking-wide transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'employees' ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <UserPlus className="h-4.5 w-4.5" />
          Staff Directory & Roles
        </button>

        <button
          id="admin_tab_leaves"
          onClick={() => setActiveTab('leaves')}
          className={`pb-3.5 text-sm font-semibold tracking-wide transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'leaves' ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="h-4.5 w-4.5" />
          Leave Management Suite
        </button>

        <button
          id="admin_tab_payroll"
          onClick={() => setActiveTab('payroll')}
          className={`pb-3.5 text-sm font-semibold tracking-wide transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'payroll' ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <DollarSign className="h-4.5 w-4.5" />
          School Payroll Reports
        </button>

        <button
          id="admin_tab_holidays"
          onClick={() => setActiveTab('holidays')}
          className={`pb-3.5 text-sm font-semibold tracking-wide transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'holidays' ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Calendar className="h-4.5 w-4.5" />
          School Holiday Calendar Maker
        </button>
      </div>

      {activeTab === 'timings' && (
        <div id="timings_section" className="space-y-6 animate-fade-in">
          
          <div className="bg-slate-900 border border-slate-800 text-white p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
            <div>
              <h2 className="text-xl font-bold text-amber-500 flex items-center gap-2">
                <Shield className="h-5 w-5 text-amber-500" />
                Operations timing parameter board
              </h2>
              <p className="text-xs text-slate-400 mt-1">Configure school hour limits. Changes instantly synchronize across all dashboards.</p>
            </div>
            <div className="bg-slate-800 border-slate-700 font-mono text-[11px] p-2 rounded text-slate-350">
              Admin: <strong className="text-white">{employee.name}</strong>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 mb-5">Edit School Shift Parameters</h3>

            {timingsSaveMsg && (
              <div className="mb-6 p-4 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl text-xs flex items-center gap-2 shadow-sm">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>{timingsSaveMsg}</span>
              </div>
            )}

            {timingsLoading ? (
              <p className="text-xs text-slate-400 py-6 text-center">Reading timings config...</p>
            ) : (
              <form onSubmit={handleSaveTimings} className="space-y-5 max-w-xl" id="school_timings_form">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-650 mb-1.5">Official Check-In Time</label>
                    <input
                      id="admin_checkin_time_input"
                      type="text"
                      value={checkInTime}
                      onChange={(e) => setCheckInTime(e.target.value)}
                      className="w-full text-xs rounded-lg border border-slate-205 p-2 focus:ring-1 focus:ring-blue-900 focus:outline-none"
                      placeholder="e.g., 08:30 AM"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-650 mb-1.5">Grace Period Limit</label>
                    <input
                      id="admin_grace_time_input"
                      type="text"
                      value={graceTime}
                      onChange={(e) => setGraceTime(e.target.value)}
                      className="w-full text-xs rounded-lg border border-slate-205 p-2 focus:ring-1 focus:ring-blue-900 focus:outline-none"
                      placeholder="e.g., 08:45 AM"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-650 mb-1.5">Official Checkout Time</label>
                    <input
                      id="admin_checkout_time_input"
                      type="text"
                      value={checkOutTime}
                      onChange={(e) => setCheckOutTime(e.target.value)}
                      className="w-full text-xs rounded-lg border border-slate-205 p-2 focus:ring-1 focus:ring-blue-900 focus:outline-none"
                      placeholder="e.g., 04:30 PM"
                      required
                    />
                  </div>
                </div>

                <div className="pt-3">
                  <button
                    id="save_school_timings_btn"
                    type="submit"
                    className="bg-slate-900 hover:bg-slate-800 text-white font-medium py-2 px-5 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-all shadow"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save Timing Specifications
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {activeTab === 'attendance' && (
        <div id="attendance_section" className="space-y-6 animate-fade-in">
          
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Live Campus Attendance Ledger</h3>
                <p className="text-xs text-slate-400 mt-0.5">Explore who is present and absent. Filter logs dynamically by date or role.</p>
              </div>

              {/* Date selection bar */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600">Select Date Check:</label>
                <input
                  id="admin_date_filter_input"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-xs rounded-lg border border-slate-205 p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-900"
                />
              </div>
            </div>

            {/* Quick Metrics of the Day */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-emerald-800 uppercase tracking-wider font-semibold">Presents Today</p>
                  <p className="text-xl font-bold text-emerald-700 mt-1">{presentCount}</p>
                </div>
                <Users className="h-5 w-5 text-emerald-500 shrink-0" />
              </div>

              <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-amber-800 uppercase tracking-wider font-semibold">Late arrivals</p>
                  <p className="text-xl font-bold text-amber-700 mt-1">{lateCount}</p>
                </div>
                <Clock className="h-5 w-5 text-amber-500 shrink-0" />
              </div>

              <div className="p-4 bg-red-55/60 border border-red-100 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-red-800 uppercase tracking-wider font-semibold">Absences</p>
                  <p className="text-xl font-bold text-red-700 mt-1">{absentCount}</p>
                </div>
                <UserX className="h-5 w-5 text-red-500 shrink-0" />
              </div>

              <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-indigo-805 uppercase tracking-wider font-semibold">On Leaves</p>
                  <p className="text-xl font-bold text-indigo-700 mt-1">{leaveCount}</p>
                </div>
                <Calendar className="h-5 w-5 text-indigo-500 shrink-0" />
              </div>
            </div>

            {/* Attendance Search and Filtering list */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between mb-4">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  id="admin_attendance_search_field"
                  type="text"
                  placeholder="Search staff name..."
                  value={attendanceSearch}
                  onChange={(e) => setAttendanceSearch(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-205 pl-8 pr-3 py-2 focus:ring-1 focus:ring-blue-900 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <select
                  id="admin_attendance_filter_select"
                  value={attendanceFilter}
                  onChange={(e) => setAttendanceFilter(e.target.value as any)}
                  className="text-xs rounded-lg border border-slate-205 p-1.5 focus:outline-none w-full sm:w-36 bg-white"
                >
                  <option value="All">All statuses</option>
                  <option value="Present">Present</option>
                  <option value="Late">Late</option>
                  <option value="Absent">Absent</option>
                  <option value="Leave">On Leave</option>
                </select>
              </div>
            </div>

            {/* Attendance Table */}
            {attendanceLoading ? (
              <p className="text-white text-center py-6 text-xs text-slate-400">Loading daily ledger log...</p>
            ) : filteredAttendance.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-10 bg-slate-50 border border-dashed border-slate-150 rounded-lg">
                No matching attendance histories found for {selectedDate}.
              </p>
            ) : (
              <div className="overflow-x-auto border border-slate-100 rounded-xl" id="attendance_ledget_table">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-150 text-slate-650 uppercase tracking-wider font-semibold">
                      <th className="p-3 font-bold">Staff Name</th>
                      <th className="p-3 font-bold text-center">Status</th>
                      <th className="p-3 font-bold">Check-In stamp</th>
                      <th className="p-3 font-bold">Check-Out stamp</th>
                      <th className="p-3 font-bold">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAttendance.map((rec) => (
                      <tr key={rec.id || rec.employeeId} className="hover:bg-slate-50/50 transition-all">
                        <td className="p-3">
                          <div>
                            <p className="font-bold text-slate-800">{rec.employeeName}</p>
                            <p className="text-[10px] text-slate-400 font-mono">ID: {rec.employeeId}</p>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                            rec.status === 'Present' ? 'bg-emerald-50 text-emerald-700' :
                            rec.status === 'Late' ? 'bg-amber-50 text-amber-700' :
                            rec.status === 'Leave' ? 'bg-indigo-50 text-indigo-700' :
                            'bg-red-50 text-red-700'
                          }`}>
                            {rec.status}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-650">{rec.checkIn || '---'}</td>
                        <td className="p-3 font-mono text-slate-650">{rec.checkOut || '---'}</td>
                        <td className="p-3 text-slate-500 italic max-w-xs overflow-hidden text-ellipsis whitespace-nowrap">{rec.remarks || 'No notes'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'leaves' && (
        <div id="leaves_section" className="space-y-6 animate-fade-in">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 mb-5">Principal, Finance & Teacher Leaves Management Suite</h3>

            {leavesLoading ? (
              <p className="text-center py-6 text-xs text-slate-400">Loading leave requests...</p>
            ) : allLeaves.length === 0 ? (
              <p className="text-xs text-slate-400 p-6 text-center border-slate-100 border rounded-lg border-dashed">No leave proposals requested yet.</p>
            ) : (
              <div className="space-y-4">
                {allLeaves.map((leave) => (
                  <div key={leave.id} className="border border-slate-150 rounded-xl p-5 hover:bg-slate-50/50 transition-all text-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-slate-900 text-sm">{leave.employeeName}</h4>
                          <span className="bg-slate-150 text-slate-600 px-2 py-0.5 rounded text-[9px] font-bold font-mono tracking-wide">{leave.role}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">Applied: {leave.appliedAt}</p>
                      </div>

                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        leave.status === 'Approved' ? 'bg-emerald-50 text-emerald-800' :
                        leave.status === 'Rejected' ? 'bg-red-50 text-red-800' :
                        'bg-amber-150 text-amber-800'
                      }`}>
                        {leave.status}
                      </span>
                    </div>

                    <div className="bg-slate-50/70 p-3.5 rounded-lg border border-slate-100 space-y-1 my-3 text-slate-750">
                      <p><strong>Leave Type:</strong> {leave.leaveType}</p>
                      <p><strong>Duration Calendar:</strong> {leave.startDate} to {leave.endDate}</p>
                      <p><strong>Justification Notes:</strong> "{leave.reason}"</p>
                    </div>

                    {leave.status === 'Pending' ? (
                      <div className="space-y-3 pt-2.5 border-t border-slate-100">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Remarks or Review Comment</label>
                          <input
                            id={`admin_leave_remarks_${leave.id}`}
                            type="text"
                            placeholder="Approval remarks..."
                            value={reviewComments[leave.id || ''] || ''}
                            onChange={(e) => setReviewComments({
                              ...reviewComments,
                              [leave.id || '']: e.target.value
                            })}
                            className="w-full border text-xs border-slate-205 rounded-lg p-2 focus:ring-1 focus:ring-blue-900 focus:outline-none"
                          />
                        </div>

                        <div className="flex justify-end gap-2 text-xs font-semibold">
                          <button
                            id={`admin_reject_leave_${leave.id}`}
                            onClick={() => handleReviewLeave(leave.id || '', 'Rejected')}
                            className="px-3 py-1.5 border border-red-200 hover:border-red-500 hover:bg-red-55 text-red-700 cursor-pointer transition-all rounded-lg"
                          >
                            Reject
                          </button>
                          <button
                            id={`admin_approve_leave_${leave.id}`}
                            onClick={() => handleReviewLeave(leave.id || '', 'Approved')}
                            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white cursor-pointer transition-all rounded-lg flex items-center gap-1"
                          >
                            <Check className="h-3.5 w-3.5 text-emerald-400 stroke-[3]" />
                            Approve
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2.5 p-2 bg-slate-50 border border-slate-100 rounded-lg text-slate-500 font-mono text-[10px]">
                        Reviewer: <strong className="text-slate-700">{leave.approvedBy || 'Administration'}</strong> • Comments: <strong className="text-slate-700 italic">"{leave.comments}"</strong>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'employees' && (
        <div id="employees_section" className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* List Employees Panel */}
            <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Sri Sahasra Vidhyanikethan Staff Roster</h3>
                    <p className="text-xs text-slate-400">View and manage registered employee credentials and contact directories.</p>
                  </div>
                  <div className="text-right text-xs bg-slate-50 border border-slate-150 px-2.5 py-1 rounded-lg shrink-0 text-slate-600 font-semibold font-mono">
                    Total: {employees.length}
                  </div>
                </div>

                {/* Pending Compensation Warning Alert Banner */}
                {(() => {
                  const unconfigured = employees.filter(emp => !emp.salary || emp.salary <= 0);
                  if (unconfigured.length === 0) return null;
                  return (
                    <div className="mb-4 p-3.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl text-xs flex items-start gap-2.5 shadow-sm animate-pulse">
                      <AlertCircle className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Pending Compensation Settings</p>
                        <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                          Detected <strong>{unconfigured.length} synchronized staff account(s)</strong> without assigned salary parameters. Please specify compensation package details below.
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Filter / Search input */}
                <div className="relative mb-5 max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    id="admin_employee_list_search_input"
                    type="text"
                    placeholder="Search staff by name, email, role..."
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-205 pl-8 pr-3 py-2 focus:ring-1 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                {/* Employees Cards list */}
                {employeesLoading ? (
                  <p className="text-center py-10 text-xs text-slate-400">Synchronizing employee directory...</p>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {(() => {
                      const lowerQuery = empSearch.toLowerCase();
                      const filtered = employees.filter(emp => 
                        emp.name.toLowerCase().includes(lowerQuery) ||
                        emp.email.toLowerCase().includes(lowerQuery) ||
                        emp.phone.toLowerCase().includes(lowerQuery) ||
                        emp.designation.toLowerCase().includes(lowerQuery) ||
                        emp.role.toLowerCase().includes(lowerQuery) ||
                        emp.employeeId.toLowerCase().includes(lowerQuery)
                      );

                      if (filtered.length === 0) {
                        return (
                          <div className="text-center py-12 px-4 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                            <p className="text-xs text-slate-400">No staff members found matching criteria.</p>
                          </div>
                        );
                      }

                      return filtered.map(emp => (
                        <div 
                          key={emp.employeeId} 
                          id={`emp_card_${emp.employeeId}`}
                          className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl hover:border-slate-300 transition-all text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-slate-900 text-sm">{emp.name}</h4>
                              <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${
                                emp.role === 'Admin' ? 'bg-indigo-50 text-indigo-700' :
                                emp.role === 'Principal' ? 'bg-amber-50 text-amber-700' :
                                emp.role === 'Finance' ? 'bg-violet-50 text-violet-700' :
                                'bg-emerald-50 text-emerald-700'
                              }`}>
                                {emp.role}
                              </span>
                            </div>
                            <p className="text-slate-600"><strong className="text-slate-700">Designation:</strong> {emp.designation}</p>
                            <p className="text-slate-400 font-mono text-[10px]">Email: {emp.email} • ID: {emp.employeeId}</p>
                            <p className="text-slate-400 font-mono text-[10px]">Phone: {emp.phone}</p>
                            
                            <div className="flex items-center gap-2 pt-1.5 flex-wrap">
                              <button
                                onClick={() => {
                                  setEditingEmployeeId(emp.employeeId);
                                  setNewEmpId(emp.employeeId);
                                  setNewEmpName(emp.name);
                                  setNewEmpEmail(emp.email);
                                  setNewEmpPhone(emp.phone);
                                  setNewEmpDesignation(emp.designation);
                                  setNewEmpRole(emp.role);
                                  setNewEmpSalary(emp.salary || 0);
                                  setNewEmpStatus(emp.status);
                                  setNewEmpPassword(emp.password || '');
                                  window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to form area
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded font-semibold text-[10px] cursor-pointer transition-all select-none"
                              >
                                <Edit className="h-3 w-3" /> Edit Profile
                              </button>
                              <button
                                onClick={() => setSelectedCalendarEmployeeId(emp.employeeId)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-55 hover:bg-indigo-100 text-indigo-850 border border-indigo-200 rounded font-semibold text-[10px] cursor-pointer transition-all select-none"
                              >
                                <Calendar className="h-3.5 w-3.5" /> View Calendar & Units
                              </button>
                              <button
                                onClick={() => handleDeleteEmployee(emp.employeeId)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-55/65 hover:bg-red-50 text-red-700 border border-red-200 rounded font-semibold text-[10px] cursor-pointer transition-all select-none"
                              >
                                <Trash2 className="h-3 w-3" /> Delete
                              </button>
                            </div>

                            <div className="flex items-center gap-2 pt-2.5 pb-0.5 border-t border-slate-100 mt-2.5 flex-wrap">
                              <span className="text-[9px] font-mono text-slate-400 font-bold uppercase tracking-wider mr-1">Face Recognition:</span>
                              {enrolledFaces[emp.employeeId] ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="h-6 w-6 rounded-full border border-emerald-400 overflow-hidden shrink-0">
                                    <img src={enrolledFaces[emp.employeeId].photoUrl} alt="face bio" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  </div>
                                  <span className="inline-flex items-center gap-0.5 text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono leading-none">
                                    <ShieldCheck className="h-3 w-3" /> REGISTERED
                                  </span>
                                  <button
                                    onClick={() => { setEnrollingEmployee(emp); setEnrollPhoto(enrolledFaces[emp.employeeId].photoUrl); }}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded font-semibold text-[9px] cursor-pointer transition-all select-none font-mono leading-none"
                                  >
                                    <RefreshCw className="h-2.5 w-2.5" /> Re-entry Face
                                  </button>
                                  <button
                                    onClick={() => handleDeleteFaceEnrollment(emp.employeeId)}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded font-semibold text-[9px] cursor-pointer transition-all select-none font-mono leading-none"
                                  >
                                    Clear Bio
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setEnrollingEmployee(emp); setEnrollPhoto(null); }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded font-bold text-[9px] cursor-pointer transition-all select-none font-mono leading-none"
                                >
                                  <Camera className="h-3 w-3" /> Register Face Bio
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="text-right space-y-1.5 shrink-0 flex flex-col items-end">
                            {editingSalaryId === emp.employeeId ? (
                              <div className="flex flex-col items-end gap-1.5 bg-white border border-slate-200 p-2 rounded-lg shadow-sm">
                                <div className="flex items-center gap-1">
                                  <span className="text-slate-400 font-semibold text-[10px]">₹</span>
                                  <input
                                    id={`emp_salary_inline_input_${emp.employeeId}`}
                                    type="number"
                                    value={tempSalaryInput}
                                    onChange={(e) => setTempSalaryInput(e.target.value)}
                                    placeholder="Enter Salary"
                                    className="w-20 p-1 border border-slate-300 rounded font-mono text-[11px] text-right focus:outline-none focus:ring-1 focus:ring-blue-900"
                                    autoFocus
                                  />
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    id={`emp_salary_inline_cancel_${emp.employeeId}`}
                                    onClick={() => setEditingSalaryId(null)}
                                    className="px-1.5 py-0.5 border border-slate-200 text-slate-500 rounded text-[9px] hover:bg-slate-50 cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    id={`emp_salary_inline_save_${emp.employeeId}`}
                                    disabled={salaryUpdating}
                                    onClick={() => handleInlineSaveSalary(emp.employeeId)}
                                    className="px-1.5 py-0.5 bg-blue-950 text-white rounded text-[9px] hover:bg-blue-900 cursor-pointer font-bold disabled:opacity-50"
                                  >
                                    {salaryUpdating ? '...' : 'Save'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1 text-right">
                                {(!emp.salary || emp.salary <= 0) ? (
                                  <div className="space-y-0.5">
                                    <span className="inline-block px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded text-[9px] font-bold uppercase tracking-wider animate-pulse leading-none">
                                      ⚠️ No Salary Set
                                    </span>
                                    <button
                                      id={`set_salary_btn_${emp.employeeId}`}
                                      onClick={() => {
                                        setEditingSalaryId(emp.employeeId);
                                        setTempSalaryInput('');
                                      }}
                                      className="text-blue-900 font-bold hover:underline select-none text-[10px] block cursor-pointer text-right w-full"
                                    >
                                      Set Salary
                                    </button>
                                  </div>
                                ) : (
                                  <div className="space-y-0.5">
                                    <p className="font-bold text-slate-800 font-mono text-xs">₹{emp.salary.toLocaleString('en-IN')}</p>
                                    <button
                                      id={`edit_salary_btn_${emp.employeeId}`}
                                      onClick={() => {
                                        setEditingSalaryId(emp.employeeId);
                                        setTempSalaryInput(String(emp.salary));
                                      }}
                                      className="text-slate-450 hover:text-blue-900 select-none text-[9px] block cursor-pointer transition-all text-right w-full"
                                    >
                                      Edit Salary
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                            <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold ${
                              emp.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                            }`}>
                              {emp.status}
                            </span>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* Create/Edit Account Form Panel */}
            <div className="lg:col-span-5 bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-blue-900" />
                {editingEmployeeId ? 'Edit Staff Member Profile' : 'Register New Staff Member'}
              </h3>
              <p className="text-xs text-slate-400 mb-5 border-b border-dashed border-slate-100 pb-4">
                {editingEmployeeId 
                  ? `Modify credentials, salary details, and custom password lock parameters for ID: ${editingEmployeeId}`
                  : `Setup new academic or support credentials. Created accounts can login using default credentials matching their privilege role.`
                }
              </p>

              {empSuccessMsg && (
                <div id="emp_success_banner" className="mb-5 p-4 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl text-xs flex items-start gap-2.5 shadow-sm animate-fade-in">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Database Node Synchronized!</p>
                    <p className="mt-1 font-mono text-[11px] text-emerald-750">{empSuccessMsg}</p>
                  </div>
                </div>
              )}

              {empErrorMsg && (
                <div id="emp_error_banner" className="mb-5 p-3.5 bg-red-50 text-red-800 border border-red-100 rounded-xl text-xs flex items-center gap-2 leading-relaxed animate-fade-in">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  <span>{empErrorMsg}</span>
                </div>
              )}

              <form onSubmit={handleCreateEmployee} className="space-y-4" id="create_employee_form">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Employee Account ID *</label>
                  <input
                    id="new_employee_id"
                    type="text"
                    value={newEmpId}
                    onChange={(e) => setNewEmpId(e.target.value)}
                    placeholder="e.g. emp_rajesh"
                    className="w-full text-xs rounded-lg border border-slate-200 p-2 font-mono focus:ring-1 focus:ring-blue-900 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                    required
                    disabled={!!editingEmployeeId}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Full Name *</label>
                    <input
                      id="new_employee_name"
                      type="text"
                      value={newEmpName}
                      onChange={(e) => setNewEmpName(e.target.value)}
                      placeholder="e.g. Swathi Reddy"
                      className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:ring-1 focus:ring-blue-900 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Staff Email *</label>
                    <input
                      id="new_employee_email"
                      type="email"
                      value={newEmpEmail}
                      onChange={(e) => setNewEmpEmail(e.target.value)}
                      placeholder="employee@email.com"
                      className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:ring-1 focus:ring-blue-900 focus:outline-none font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Contact Phone *</label>
                    <input
                      id="new_employee_phone"
                      type="tel"
                      value={newEmpPhone}
                      onChange={(e) => setNewEmpPhone(e.target.value)}
                      placeholder="e.g., 9848012345"
                      maxLength={15}
                      className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:ring-1 focus:ring-blue-900 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Designation *</label>
                    <input
                      id="new_employee_designation"
                      type="text"
                      value={newEmpDesignation}
                      onChange={(e) => setNewEmpDesignation(e.target.value)}
                      placeholder="e.g. Physics Lecturer"
                      className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:ring-1 focus:ring-blue-900 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Privilege Role *</label>
                    <select
                      id="new_employee_role"
                      value={newEmpRole}
                      onChange={(e) => setNewEmpRole(e.target.value as any)}
                      className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:ring-1 focus:ring-blue-900 focus:outline-none bg-white font-semibold"
                      required
                    >
                      <option value="Teacher">Teacher</option>
                      <option value="Finance">Finance</option>
                      <option value="Principal">Principal</option>
                      <option value="Admin">Administrator</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Monthly Salary (INR) *</label>
                    <input
                      id="new_employee_salary"
                      type="number"
                      value={newEmpSalary}
                      onChange={(e) => setNewEmpSalary(Number(e.target.value))}
                      placeholder="e.g. 45000"
                      className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:ring-1 focus:ring-blue-900 focus:outline-none"
                      min={0}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Operational Status *</label>
                    <select
                      id="new_employee_status"
                      value={newEmpStatus}
                      onChange={(e) => setNewEmpStatus(e.target.value as any)}
                      className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:ring-1 focus:ring-blue-900 focus:outline-none bg-white font-semibold"
                      required
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Custom Password</label>
                    <input
                      id="new_employee_password"
                      type="text"
                      value={newEmpPassword}
                      onChange={(e) => setNewEmpPassword(e.target.value)}
                      placeholder={editingEmployeeId ? "Keep current password" : "Optional login pass"}
                      className="w-full text-xs rounded-lg border border-slate-200 p-2 focus:ring-1 focus:ring-blue-900 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="pt-3 flex gap-2">
                  <button
                    id="reset_employee_form_btn"
                    type="button"
                    onClick={resetEmployeeForm}
                    className="flex-1 border border-slate-200 hover:border-slate-350 select-none text-slate-600 py-2 rounded-xl text-xs font-semibold cursor-pointer text-center"
                  >
                    {editingEmployeeId ? 'Cancel Edit' : 'Reset Form'}
                  </button>
                  <button
                    id="save_employee_btn"
                    type="submit"
                    disabled={empFormSubmitting}
                    className={`flex-1 ${editingEmployeeId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-900 hover:bg-slate-800'} text-white font-semibold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow disabled:opacity-50`}
                  >
                    {empFormSubmitting ? 'Saving...' : (editingEmployeeId ? 'Update Profile' : 'Save Employee account')}
                  </button>
                </div>
              </form>
            </div>

          </div>
        </div>
      )}

      {activeTab === 'payroll' && (() => {
        const targetMonthStr = `${payrollYear}-${payrollMonth}`;
        const payrollReportList = employees.map((emp) => 
          calculateMonthlyPayroll(emp, allAttendance, targetMonthStr, holidays)
        );
        const totalCalculatedPayrollSum = payrollReportList.reduce((acc, p) => acc + p.calculatedSalary, 0);

        return (
          <div id="payroll_section" className="space-y-6 animate-fade-in">
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 border-b border-dashed border-slate-100 pb-5">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Comprehensive Payroll & Dynamic Units Ledger</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    View work units earned and dynamic hours-worked prorated salary calculations for Sri Sahasra teachers.
                  </p>
                </div>

                {/* Period selector inside Payroll tab */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Period:</span>
                  <select
                    value={payrollMonth}
                    onChange={(e) => setPayrollMonth(e.target.value)}
                    className="text-xs font-bold rounded-xl border border-slate-200 p-2 bg-slate-50 text-slate-700 cursor-pointer focus:outline-none"
                  >
                    {MONTHS.map((m) => (
                      <option key={m.val} value={m.val}>{m.name}</option>
                    ))}
                  </select>

                  <select
                    value={payrollYear}
                    onChange={(e) => setPayrollYear(e.target.value)}
                    className="text-xs font-bold rounded-xl border border-slate-200 p-2 bg-slate-50 text-slate-700 cursor-pointer focus:outline-none animate-none"
                  >
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                    <option value="2027">2027</option>
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-right">
                    <span className="text-[9px] text-slate-450 uppercase tracking-widest font-black block leading-none font-mono mb-1">Base Wages</span>
                    <p className="text-sm font-bold font-mono text-slate-600">₹{totalSalariesSum.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-right">
                    <span className="text-[9px] text-emerald-800 uppercase tracking-widest font-black block leading-none font-mono mb-1">Real worked payroll</span>
                    <p className="text-lg font-black font-mono text-emerald-700">₹{totalCalculatedPayrollSum.toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </div>

              {/* Attendance and payroll analytics notice card */}
              <div className="p-3 bg-blue-50 text-blue-900 rounded-2xl flex items-start gap-2.5 text-xs mb-6 border border-blue-100/50">
                <Info className="h-4.5 w-4.5 text-blue-800 shrink-0 mt-0.5" />
                <div className="leading-normal">
                  <p className="font-bold">Sri Sahasra Proration Engine Guidelines</p>
                  <p className="text-blue-700 text-[11px] mt-0.5">
                    Expected daily shift is <strong>8:45 AM - 4:30 PM</strong> (7.75 hrs). late grievance is permitted until <strong>8:55 AM</strong> check-in context without units dock. 1 units = full day shift. Monthly proration is calculated against a standard monthly billing divisor of <strong>22 working days</strong>. Teachers have exactly <strong>1 free leave</strong> benefit month-wise; additional unexcused or approved leaves calculate to 0 units.
                  </p>
                </div>
              </div>

              {employeesLoading ? (
                <p className="text-center py-6 text-xs text-slate-400">Loading payroll ledger...</p>
              ) : (
                <div className="overflow-x-auto border border-slate-100 rounded-xl" id="admin_payroll_table">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-150 text-slate-650 uppercase tracking-wider font-semibold">
                        <th className="p-3 font-bold">Staff Member</th>
                        <th className="p-3 font-bold">Base Monthly Wages</th>
                        <th className="p-3 font-bold">Earned Units (Month)</th>
                        <th className="p-3 font-bold">Leaves Status</th>
                        <th className="p-3 font-bold text-right">Prorated Worked Salary</th>
                        <th className="p-3 font-bold text-center">Calendar inspect</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payrollReportList.map((p) => {
                        const emp = employees.find((e) => e.employeeId === p.employeeId);
                        if (!emp) return null;
                        return (
                          <tr key={p.employeeId} className="hover:bg-slate-55 transition-all">
                            <td className="p-3">
                              <p className="font-semibold text-slate-800 text-sm">{p.employeeName}</p>
                              <p className="text-[10px] text-slate-400 font-mono">ID: {p.employeeId} • {emp.designation}</p>
                            </td>
                            <td className="p-3 text-slate-600 font-mono font-medium">₹{p.baseSalary.toLocaleString('en-IN')}</td>
                            <td className="p-3 font-semibold text-slate-700">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px] font-bold">
                                  {p.totalUnits} U
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium">/ 22</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[11px] text-slate-700 font-medium font-mono">
                                  {p.leavesCount} Taken
                                </span>
                                {p.freeLeaveBenefitApplied && (
                                  <span className="text-[9px] text-violet-700 bg-violet-100 border border-violet-150 px-1 py-0.2 rounded font-bold uppercase tracking-wider self-start">
                                    1 Free Benefit Used
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-right font-mono font-black text-emerald-700 text-sm">
                              ₹{p.calculatedSalary.toLocaleString('en-IN')}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => setSelectedCalendarEmployeeId(p.employeeId)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-805 border border-indigo-150 rounded-lg font-bold text-[10px] cursor-pointer transition-all shrink-0"
                              >
                                <Calendar className="h-3 w-3" /> Inspect Calendar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {activeTab === 'holidays' && (
        <div id="holidays_section" className="space-y-6 animate-fade-in">
          {/* Header Dashboard Banner */}
          <div className="bg-slate-900 border border-slate-800 text-white p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md">
            <div>
              <h2 className="text-xl font-bold text-amber-500 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-amber-500" />
                School Holidays Manager & Calendar Maker
              </h2>
              <p className="text-xs text-slate-400 mt-1">Declare global school holidays. Declared holidays are automatically calculated as paid and credited with 1.0 unit across staff profiles.</p>
            </div>
            <div className="bg-slate-800 border-slate-705 font-mono text-[11px] p-2 rounded text-slate-350">
              Admin Role: <strong className="text-white">{employee.name}</strong>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Create / Edit Form */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm h-fit space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
                <Plus className="h-4 w-4 text-blue-900 animate-none" />
                Add New School Holiday
              </h3>

              {holidaySaveError && (
                <div className="p-3 bg-red-50 text-red-800 border border-red-100 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  <span>{holidaySaveError}</span>
                </div>
              )}

              {holidaySaveSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl text-xs flex items-center gap-2 transition-all">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>{holidaySaveSuccess}</span>
                </div>
              )}

              <form onSubmit={handleSaveHoliday} className="space-y-4" id="holiday_maker_form">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Holiday Date</label>
                  <input
                    id="holiday_date_input"
                    type="date"
                    value={holidayDateInput}
                    onChange={(e) => setHolidayDateInput(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-205 p-2 focus:ring-1 focus:ring-blue-900 focus:outline-none focus:border-blue-900 font-mono bg-white"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">Date in YYYY-MM-DD format (Saturdays can be declared too)</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Holiday Label / Title</label>
                  <input
                    id="holiday_title_input"
                    type="text"
                    value={holidayTitleInput}
                    onChange={(e) => setHolidayTitleInput(e.target.value)}
                    placeholder="e.g., Gandhi Jayanti, Diwali Festival"
                    className="w-full text-xs rounded-lg border border-slate-205 p-2 focus:ring-1 focus:ring-blue-900 focus:outline-none"
                    required
                  />
                </div>

                <div className="pt-2">
                  <button
                    id="save_holiday_btn"
                    type="submit"
                    disabled={isHolidayFormSubmitting}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {isHolidayFormSubmitting ? 'Registering Holiday...' : 'Save & Publish Holiday'}
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Active Holidays List */}
            <div className="lg:col-span-2 bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-emerald-500" />
                  Currently Configured School Holidays ({holidays.length})
                </h3>
              </div>

              {holidaysLoading ? (
                <p className="text-center py-6 text-xs text-slate-400">Loading registered school holidays...</p>
              ) : holidays.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl bg-slate-55/30">
                  <Calendar className="h-8 w-8 text-slate-350 mx-auto mb-2 animate-none" />
                  <p className="text-xs font-semibold text-slate-600">No school holidays declared yet</p>
                  <p className="text-[10px] text-slate-400 mt-1">Use the builder form on the left to add upcoming holidays.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-1">
                  {holidays.map((hol) => (
                    <div 
                      key={hol.id || hol.date} 
                      className="p-4 bg-amber-50/40 border border-amber-100 rounded-2xl flex items-start justify-between gap-3 shadow-xs hover:border-amber-200 transition-all"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-850 bg-amber-100 px-2 py-0.5 rounded font-mono">
                          {hol.date}
                        </span>
                        <h4 className="text-xs font-bold text-amber-950 truncate">{hol.title}</h4>
                        <div className="text-[10px] text-slate-400 font-medium">
                          Units Weight: <strong className="text-emerald-700 font-semibold font-mono">+1.0 Paid Unit</strong>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteHoliday(hol.id || hol.date)}
                        className="p-1 px-1.5 text-rose-600 hover:text-rose-850 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-lg cursor-pointer transition-all self-start"
                        title="Remove Holiday"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Visual Overlay Modal: Selected Staff Attendance Calendar & Payroll Breakdown */}
      {selectedCalendarEmployeeId && (() => {
        const selectedEmp = employees.find(emp => emp.employeeId === selectedCalendarEmployeeId);
        const selectedEmpAttendance = allAttendance.filter(rec => rec.employeeId === selectedCalendarEmployeeId);
        
        if (!selectedEmp) return null;
        
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in" id="admin_calendar_modal">
            <div className="bg-white rounded-3xl max-w-4xl w-full border border-slate-100 shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden">
              
              {/* Modal close latch button */}
              <button
                onClick={() => setSelectedCalendarEmployeeId(null)}
                className="absolute top-5 right-5 p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-800 rounded-full cursor-pointer z-20 transition-all"
                title="Dismiss Roster View"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="p-6 overflow-y-auto w-full space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#0c1122] text-white p-5 rounded-2xl border border-slate-800">
                  <div>
                    <h3 className="text-lg font-black text-white">{selectedEmp.name}</h3>
                    <p className="text-xs text-slate-400 font-medium">Designation: {selectedEmp.designation} • ID: {selectedEmp.employeeId}</p>
                  </div>
                  <span className="bg-blue-500/10 text-blue-400 text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 border border-blue-500/20 font-mono rounded-full self-start sm:self-center">
                    Authorized Profile Node
                  </span>
                </div>
                
                <AttendanceCalendar 
                  employee={selectedEmp} 
                  attendanceRecords={selectedEmpAttendance} 
                  isAdminView={true}
                />
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setSelectedCalendarEmployeeId(null)}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-850 text-white font-bold rounded-xl text-xs uppercase cursor-pointer select-none"
                >
                  Close Profile Overview
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* ----------------- FACE ENROLLMENT SCAN MODAL SCREEN (ADMIN) ----------------- */}
      {enrollingEmployee && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4 animate-fade-in select-none">
          <div className="bg-white border border-slate-200/90 rounded-3xl p-6 max-w-3xl w-full text-slate-800 shadow-2xl relative grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
            
            <button
              onClick={() => setEnrollingEmployee(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 text-slate-400 hover:text-slate-850 hover:bg-slate-200 cursor-pointer border border-slate-200 transition-colors"
              title="Close modal"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            {/* Step left panel summary details */}
            <div className="md:col-span-5 flex flex-col justify-between pt-2">
              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="px-2 py-0.5 bg-blue-50 text-[#1b5dfc] border border-blue-100 rounded text-[9px] font-mono leading-none tracking-widest uppercase font-black inline-block">
                    BIOMETRICS CAPTURE
                  </span>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Enroll Face Recognition
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
                    Align the staff member's face on the active webcam capture window to map their neural geometry values.
                  </p>
                </div>

                {/* Selected user badge profiles summary */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-mono text-[9px] font-bold uppercase tracking-wide">Selected Target staff</span>
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">{enrollingEmployee.name}</h4>
                    <p className="text-[10px] text-slate-650 font-mono mt-0.5">
                      Bio ID: {enrollingEmployee.employeeId} • {enrollingEmployee.designation}
                    </p>
                    <p className="text-[9px] text-slate-500 font-mono">
                      Department: {enrollingEmployee.role}
                    </p>
                  </div>
                </div>

                {/* Strict Quality Parameter Indicators */}
                <div className="space-y-1 p-3 bg-red-50/50 rounded-2xl border border-red-105 text-[10.5px]">
                  <p className="font-bold text-red-800 flex items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-600"></span>
                    Strict Quality Control Standards:
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5 text-slate-600 text-[10px]">
                    <li>Full clear face illumination</li>
                    <li>Sufficient room ambient contrast</li>
                    <li>Head directly centered to target circles</li>
                  </ul>
                </div>
              </div>

              {/* Step registration validation indicator */}
              <div className="pt-4 mt-auto">
                {enrollPhoto ? (
                  <button
                    onClick={handleSaveEnrollment}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-mono font-black tracking-widest cursor-pointer select-none transition-colors border border-emerald-500/10 shadow flex items-center justify-center gap-1.5"
                  >
                    <Check className="h-4.5 w-4.5" />
                    REGISTER BIOMETRICS
                  </button>
                ) : (
                  <div className="text-[10.5px] p-3 rounded-xl bg-slate-50 text-slate-500 text-center font-mono leading-normal border border-slate-200">
                    Capture a shutter frame (Step 2) to lock in facial values.
                  </div>
                )}
              </div>
            </div>

            {/* Webcam scanning snapshot center (Right panel) */}
            <div className="md:col-span-7 flex flex-col gap-4">
              <label className="block text-[9px] font-black tracking-wider text-slate-500 font-mono uppercase">
                WEB CAMERA FEEDS CAPTURES
              </label>

              {/* View photo crop boxes */}
              <div className="relative aspect-square w-full max-w-[280px] mx-auto bg-slate-900 rounded-2xl border border-slate-200 overflow-hidden flex items-center justify-center">
                
                {enrollPhoto ? (
                  <div className="w-full h-full relative group">
                    <img src={enrollPhoto} alt="crop" className="w-full h-full object-cover animate-fade-in" referrerPolicy="no-referrer" />
                    <button
                      onClick={() => setEnrollPhoto(null)}
                      className="absolute top-2.5 right-2.5 p-1 bg-slate-950/80 text-white hover:text-slate-200 rounded-full cursor-pointer transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div className="absolute inset-x-0 bottom-0 py-2 bg-slate-950/90 text-center font-mono text-[9px] text-emerald-400 border-t border-slate-800">
                      HIGH CONFIDENCE TEMPLATE LOCKED
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full absolute inset-0 bg-slate-950">
                    
                    {stream && (
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover opacity-95"
                      />
                    )}

                    {/* Circular target outlines overlay */}
                    <div className="absolute inset-5 border border-dashed border-slate-650 rounded-full flex items-center justify-center pointer-events-none">
                      <div className="w-32 h-32 border border-dashed border-slate-500 rounded-full"></div>
                    </div>

                    {/* Action Shutter Camera Button Overlay */}
                    <div className="absolute inset-x-0 bottom-4 flex justify-center z-10">
                      <button
                        onClick={handleCaptureEnrollSnapshot}
                        disabled={!stream}
                        className="p-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-full cursor-pointer border border-blue-500 shadow-lg"
                      >
                        <Camera className="h-5.5 w-5.5" />
                      </button>
                    </div>

                  </div>
                )}

              </div>

              {/* Feedbacks Alerts templates */}
              {enrollSuccessMsg && (
                <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-150 font-mono text-[10px] leading-relaxed">
                  {enrollSuccessMsg}
                </div>
              )}

              {enrollErrorMsg && (
                <div className="p-3 bg-red-50 text-red-800 rounded-xl border border-red-150 font-mono text-[10px] leading-relaxed">
                  {enrollErrorMsg}
                </div>
              )}

              {cameraError && (
                <div className="p-3 bg-amber-50 text-amber-800 rounded-xl border border-amber-150 font-mono text-[10px] leading-relaxed">
                  {cameraError}
                </div>
              )}

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
