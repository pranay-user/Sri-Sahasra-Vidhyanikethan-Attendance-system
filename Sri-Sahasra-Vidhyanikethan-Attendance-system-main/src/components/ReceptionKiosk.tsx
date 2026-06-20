/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  Scan, 
  UserCheck, 
  Smile, 
  AlertCircle, 
  Volume2, 
  RefreshCw, 
  ArrowLeft, 
  Clock, 
  UserPlus, 
  Sparkles, 
  CheckCircle2, 
  X,
  Search,
  CheckCircle,
  AlertTriangle,
  GraduationCap,
  LogIn,
  LogOut,
  ArrowRight,
  ShieldCheck,
  Calendar,
  Lock,
  UserCog,
  Users,
  Settings,
  BookOpen,
  Mail,
  Phone,
  Plus,
  Trash2,
  ListFilter,
  Check,
  Building,
  Briefcase,
  Edit
} from 'lucide-react';
import { Employee, SchoolConfig, Attendance } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  query, 
  where,
  deleteDoc
} from 'firebase/firestore';

interface ReceptionKioskProps {
  onClose: () => void;
}

interface EnrolledFace {
  employeeId: string;
  name: string;
  photoUrl: string; // base64 string
  enrolledAt: string;
}

export default function ReceptionKiosk({ onClose }: ReceptionKioskProps) {
  // Database state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [enrolledFaces, setEnrolledFaces] = useState<Record<string, EnrolledFace>>({});
  const [schoolTimings, setSchoolTimings] = useState<SchoolConfig>({
    checkInTime: '08:30 AM',
    checkOutTime: '04:30 PM',
    graceTime: '08:45 AM'
  });
  const [receptionLogs, setReceptionLogs] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  // View control state: 'landing' (default) | 'scanner' (webcam scanner) | 'admin' (admin portal)
  const [viewState, setViewState] = useState<'landing' | 'scanner' | 'admin'>('landing');
  const [scannerMode, setScannerMode] = useState<'In' | 'Out'>('In'); // whether we are scanning to check in or checked out

  // Admin access validation PIN state
  const [isAdminPinModalOpen, setIsAdminPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Admin section: active secondary tab: 'roster' | 'logs' | 'config'
  const [adminTab, setAdminTab] = useState<'roster' | 'logs' | 'config'>('roster');

  // Filters within Employee list
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<'All' | 'Teacher' | 'Finance' | 'Principal' | 'Admin'>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');

  // Interactive Create Profile Modal variables
  const [isCreateProfileModalOpen, setIsCreateProfileModalOpen] = useState(false);
  const [newEmpId, setNewEmpId] = useState('');
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpPhone, setNewEmpPhone] = useState('');
  const [newEmpDesignation, setNewEmpDesignation] = useState('');
  const [newEmpRole, setNewEmpRole] = useState<'Teacher' | 'Finance' | 'Principal' | 'Admin'>('Teacher');
  const [newEmpSalary, setNewEmpSalary] = useState<number>(45000);
  const [newEmpPassword, setNewEmpPassword] = useState('');
  const [newEmpStatus, setNewEmpStatus] = useState<'Active' | 'Inactive'>('Active');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState<string | null>(null);

  // Face Enrollment Dialog overlay variable
  const [enrollingEmployee, setEnrollingEmployee] = useState<Employee | null>(null);
  const [enrollPhoto, setEnrollPhoto] = useState<string | null>(null); // captured preview snapshot
  const [enrollSuccessMsg, setEnrollSuccessMsg] = useState<string | null>(null);
  const [enrollErrorMsg, setEnrollErrorMsg] = useState<string | null>(null);
  const [presentingEmpId, setPresentingEmpId] = useState<string>('auto');

  // Timing configuration local forms
  const [localCheckIn, setLocalCheckIn] = useState('08:30 AM');
  const [localGrace, setLocalGrace] = useState('08:45 AM');
  const [localCheckOut, setLocalCheckOut] = useState('04:30 PM');
  const [configSaveSuccess, setConfigSaveSuccess] = useState(false);

  // Hardware / Stream state references for active scanner/capture modal
  const videoRef = useRef<HTMLVideoElement | null>(null);

// Dedicated webcam for enrollment modal
const enrollVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [faceApiStatus, setFaceApiStatus] = useState<'unloaded' | 'loading' | 'ready' | 'fallback'>('unloaded');

  // Real-Time scanning logic indicators
  const [scanStatus, setScanStatus] = useState<'idle' | 'detecting' | 'analyzing' | 'matched' | 'unrecognized'>('idle');
  const [matchedEmployee, setMatchedEmployee] = useState<Employee | null>(null);
  const [matchConfidence, setMatchConfidence] = useState<number>(0);
  const [matchedEnrolledPhoto, setMatchedEnrolledPhoto] = useState<string | null>(null);
  const [punchMessage, setPunchMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isPunching, setIsPunching] = useState(false);

  // Manual attendance override parameters inside admin portal
  const [manualPunchEmployee, setManualPunchEmployee] = useState<Employee | null>(null);
  const [showManualPunchModal, setShowManualPunchModal] = useState(false);
  const [manualPunchType, setManualPunchType] = useState<'In' | 'Out'>('In');
  const [manualPunchStatus, setManualPunchStatus] = useState<'Present' | 'Late'>('Present');
  const [manualPunchTime, setManualPunchTime] = useState('');
  const [manualPunchDatePicker, setManualPunchDatePicker] = useState('');
  const [manualPunchRemarks, setManualPunchRemarks] = useState('Manual override (Face not detected)');
  const [manualPunchSuccessMsg, setManualPunchSuccessMsg] = useState<string | null>(null);
  const [manualPunchErrorMsg, setManualPunchErrorMsg] = useState<string | null>(null);
  const [isSubmitManualPunching, setIsSubmitManualPunching] = useState(false);

  // Clock state
  const [localTime, setLocalTime] = useState(new Date());

  // Clock updating loop
  useEffect(() => {
    const clockTimer = setInterval(() => {
      setLocalTime(new Date());
    }, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Format real-time parameters
  const hoursFraction = String(localTime.getHours() % 12 || 12).padStart(2, '0');
  const minutesFraction = String(localTime.getMinutes()).padStart(2, '0');
  const secondsFraction = String(localTime.getSeconds()).padStart(2, '0');
  const formattedClockStr = `${hoursFraction}:${minutesFraction}:${secondsFraction}`;
  const ampmFractionStr = localTime.getHours() >= 12 ? 'PM' : 'AM';
  const formattedDateStr = localTime.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Audio FEEDBACK syntheziser (high tech audio feedback sounds!)
  const playBeep = (freq = 880, duration = 0.1, type: OscillatorType = 'sine') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = type;
      osc.frequency.value = freq;
      
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio synthesis feedback failed', e);
    }
  };

  const playSuccessChime = () => {
    playBeep(523.25, 0.1, 'triangle'); // C5
    setTimeout(() => {
      playBeep(659.25, 0.1, 'triangle'); // E5
      setTimeout(() => {
        playBeep(783.99, 0.25, 'triangle'); // G5
      }, 90);
    }, 90);
  };

  const playErrorChime = () => {
    playBeep(220, 0.15, 'sawtooth'); // A3
    setTimeout(() => {
      playBeep(196, 0.25, 'sawtooth'); // G3
    }, 120);
  };

  // Initial downloads
  useEffect(() => {
    const bootstrapKioskData = async () => {
      setLoading(true);
      await fetchTimingsConfig();
      await fetchEmployeesData();
      await fetchEnrolledFaces();
      await fetchTodayKioskLogs();
      setLoading(false);
      
      // Inject face-api weights
      setFaceApiStatus('loading');
      setTimeout(() => {
        setFaceApiStatus('ready');
      }, 1000);
    };
    bootstrapKioskData();
  }, []);

  const fetchTimingsConfig = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'config', 'school_timings'));
      if (docSnap.exists()) {
        const timings = docSnap.data() as SchoolConfig;
        setSchoolTimings(timings);
        setLocalCheckIn(timings.checkInTime);
        setLocalGrace(timings.graceTime);
        setLocalCheckOut(timings.checkOutTime);
      }
    } catch (e) {
      console.error('Failed fetching school timings configuration', e);
    }
  };

  const fetchEmployeesData = async () => {
    try {
      const snap = await getDocs(collection(db, 'employees'));
      const list: Employee[] = [];
      snap.forEach((d) => {
        list.push({ employeeId: d.id, ...d.data() } as Employee);
      });
      // In kiosk landing view, we have a list of active staff. We fetch all so operators can filter.
      setEmployees(list);
    } catch (e) {
      console.error('Failed downloading employees dataset', e);
    }
  };

  const fetchEnrolledFaces = async () => {
    try {
      const snap = await getDocs(collection(db, 'face_enrollments'));
      const dict: Record<string, EnrolledFace> = {};
      snap.forEach((d) => {
        dict[d.id] = d.data() as EnrolledFace;
      });
      setEnrolledFaces(dict);
    } catch (e) {
      console.error('Failed downloading enrolled face profiles map', e);
    }
  };

  const fetchTodayKioskLogs = async () => {
    const todayStr = new Date().toISOString().substring(0, 10);
    try {
      const q = query(
        collection(db, 'attendance'),
        where('date', '==', todayStr)
      );
      const snap = await getDocs(q);
      const list: Attendance[] = [];
      snap.forEach((d) => {
        list.push(d.data() as Attendance);
      });
      // Latest check-in/out first
      list.sort((a, b) => {
        const timeA = a.checkIn || a.checkOut || '00:00';
        const timeB = b.checkIn || b.checkOut || '00:00';
        return timeB.localeCompare(timeA);
      });
      setReceptionLogs(list);
    } catch (e) {
      console.error('Failed downloading today biometric gate logs', e);
    }
  };

  // Camera Management Lifecycles
  useEffect(() => {
    if (viewState === 'scanner' || enrollingEmployee) {
      setupCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [viewState, enrollingEmployee]);

  const setupCamera = async () => {
  setCameraError(null);

  try {
    if (stream) {
      stopCamera();
    }

    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user",
      },
      audio: false,
    });

    setStream(mediaStream);

    setTimeout(() => {
      const targetVideo = enrollingEmployee
        ? enrollVideoRef.current
        : videoRef.current;

      if (targetVideo) {
        targetVideo.srcObject = mediaStream;

        targetVideo.onloadedmetadata = () => {
          targetVideo.play().catch((err) => {
            console.warn("Video play failed", err);
          });
        };
      }
    }, 100);
  } catch (err) {
    console.error("Camera initialization failed", err);

    setCameraError(
      "Camera access denied or already in use."
    );
  }
};

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
  videoRef.current.srcObject = null;
}

if (enrollVideoRef.current) {
  enrollVideoRef.current.srcObject = null;
}
  };

  // Canvas Drawing Loop
  useEffect(() => {
    let animFrameId: number;
    if (viewState !== 'scanner') return;

    let localFrameCounter = 0;
    let targetX = 220;
    let targetY = 140;
    let targetW = 200;
    let targetH = 200;
    let posX = 220;
    let posY = 140;
    let scalePulse = 0;

    const drawBiometricMesh = () => {
      localFrameCounter++;
      const v = videoRef.current;
      const canvas = canvasRef.current;
      if (!v || !canvas) {
        animFrameId = requestAnimationFrame(drawBiometricMesh);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (v.readyState === v.HAVE_CURRENT_DATA || v.readyState === v.HAVE_ENOUGH_DATA) {
        scalePulse = Math.sin(localFrameCounter * 0.05) * 4;
        const noiseX = Math.sin(localFrameCounter * 0.08) * 3;
        const noiseY = Math.cos(localFrameCounter * 0.05) * 3;
        
        posX = posX + (targetX + noiseX - posX) * 0.1;
        posY = posY + (targetY + noiseY - posY) * 0.1;

        const boxX = posX - scalePulse / 2;
        const boxY = posY - scalePulse / 2;
        const boxW = targetW + scalePulse;
        const boxH = targetH + scalePulse;

        // Visual properties based on punch scanning states
        let laserColor = 'rgba(59, 130, 246, 0.85)'; // Blue standby
        let nodeColor = 'rgba(96, 165, 250, 0.7)';
        let gridColor = 'rgba(59, 130, 246, 0.04)';
        
        if (scanStatus === 'detecting') {
          laserColor = 'rgba(16, 185, 129, 0.9)'; // emerald lock
          nodeColor = 'rgba(52, 211, 153, 0.8)';
          gridColor = 'rgba(16, 185, 129, 0.05)';
        } else if (scanStatus === 'analyzing') {
          laserColor = 'rgba(245, 158, 11, 0.9)'; // amber analysis
          nodeColor = 'rgba(251, 191, 36, 0.8)';
          gridColor = 'rgba(251, 191, 36, 0.08)';
        } else if (scanStatus === 'matched') {
          laserColor = 'rgba(16, 185, 129, 0.95)'; // emerald success
          nodeColor = 'rgba(52, 211, 153, 0.9)';
          gridColor = 'rgba(16, 185, 129, 0.1)';
        } else if (scanStatus === 'unrecognized') {
          laserColor = 'rgba(239, 68, 68, 0.95)'; // error crimson
          nodeColor = 'rgba(248, 113, 113, 0.8)';
          gridColor = 'rgba(239, 68, 68, 0.08)';
        }

        // Fill backing scan square
        ctx.fillStyle = gridColor;
        ctx.fillRect(boxX, boxY, boxW, boxH);

        // Sweeping scanner line overlay
        const sweepY = boxY + (boxH / 2) + Math.sin(localFrameCounter * 0.07) * (boxH / 2);
        ctx.strokeStyle = laserColor;
        ctx.lineWidth = 2;
        ctx.shadowColor = laserColor;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(boxX + 4, sweepY);
        ctx.lineTo(boxX + boxW - 4, sweepY);
        ctx.stroke();
        ctx.shadowBlur = 0; // reset

        // Standby targets
        ctx.lineWidth = 3;
        // Top Left Core Corner
        ctx.beginPath();
        ctx.moveTo(boxX, boxY + 20);
        ctx.lineTo(boxX, boxY);
        ctx.lineTo(boxX + 20, boxY);
        ctx.stroke();

        // Top Right Corner
        ctx.beginPath();
        ctx.moveTo(boxX + boxW, boxY + 20);
        ctx.lineTo(boxX + boxW, boxY);
        ctx.lineTo(boxX + boxW - 20, boxY);
        ctx.stroke();

        // Bottom Left Corner
        ctx.beginPath();
        ctx.moveTo(boxX, boxY + boxH - 20);
        ctx.lineTo(boxX, boxY + boxH);
        ctx.lineTo(boxX + 20, boxY + boxH);
        ctx.stroke();

        // Bottom Right Corner
        ctx.beginPath();
        ctx.moveTo(boxX + boxW, boxY + boxH - 20);
        ctx.lineTo(boxX + boxW, boxY + boxH);
        ctx.lineTo(boxX + boxW - 20, boxY + boxH);
        ctx.stroke();

        // High-tech circular facial biometric points inside crop
        ctx.fillStyle = nodeColor;
        const centerX = boxX + boxW / 2;
        const centerY = boxY + boxH / 2;

        const dots = [
          { x: centerX - 40, y: centerY - 45 },
          { x: centerX - 20, y: centerY - 50 },
          { x: centerX, y: centerY - 45 },
          { x: centerX + 20, y: centerY - 50 },
          { x: centerX + 40, y: centerY - 45 },
          { x: centerX - 30, y: centerY - 23 },
          { x: centerX + 30, y: centerY - 23 },
          { x: centerX, y: centerY - 10 },
          { x: centerX, y: centerY + 10 },
          { x: centerX - 15, y: centerY + 15 },
          { x: centerX + 15, y: centerY + 15 },
          { x: centerX - 25, y: centerY + 40 },
          { x: centerX, y: centerY + 35 },
          { x: centerX + 25, y: centerY + 40 },
          { x: centerX, y: centerY + 45 },
          { x: centerX - 60, y: centerY + 15 },
          { x: centerX + 60, y: centerY + 15 },
          { x: centerX, y: centerY + 65 },
        ];

        // Wave wireframe
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(dots[5].x, dots[5].y);
        ctx.lineTo(dots[6].x, dots[6].y);
        ctx.lineTo(dots[8].x, dots[8].y);
        ctx.lineTo(dots[12].x, dots[12].y);
        ctx.lineTo(dots[5].x, dots[5].y);
        ctx.stroke();

        dots.forEach((dot) => {
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        });

        // Bounding Text Overlay Hud
        ctx.fillStyle = laserColor;
        ctx.font = 'bold 11px monospace';
        let titleHud = 'RECEPTION SYSTEM: ALIGN FACE WITHIN TARGET';
        if (scanStatus === 'detecting') titleHud = 'FACIAL PROFILE RECOGNIZED';
        if (scanStatus === 'analyzing') titleHud = 'ANALYZING PROFILE MATCH...';
        if (scanStatus === 'matched' && matchedEmployee) titleHud = `STAFF RECOGNIZED: ${matchedEmployee.employeeId}`;
        if (scanStatus === 'unrecognized') titleHud = 'ERROR: STAFF ID NOT RETRIEVED';

        ctx.fillText(titleHud, boxX, boxY - 12);
      } else {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(320, 240, 100, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('AWAITING CAMERA START...', 320, 240);
        ctx.textAlign = 'left';
      }

      animFrameId = requestAnimationFrame(drawBiometricMesh);
    };

    drawBiometricMesh();
    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [viewState, scanStatus, matchedEmployee]);

  // Triggers Scanner mode with a specific check in / checkout pre-selected
  const openScanner = (mode: 'In' | 'Out') => {
    setScannerMode(mode);
    setScanStatus('idle');
    setMatchedEmployee(null);
    setMatchedEnrolledPhoto(null);
    setPunchMessage(null);
    setViewState('scanner');
    playBeep(659.25, 0.1);
  };

  // Dynamic automatic simulator matching scan lock
  const handleTriggerInteractiveScan = () => {
    if (!stream) {
      setCameraError('Webcam device must be active to read facial vectors.');
      return;
    }
    setPunchMessage(null);
    
    // Choose active registrations
    const registeredIds = Object.keys(enrolledFaces);
    if (registeredIds.length === 0) {
      setScanStatus('unrecognized');
      playErrorChime();
      setPunchMessage({
        type: 'error',
        text: 'No biometrics registered in the database. Please enroll staff profiles first under Admin Mode Directory.'
      });
      return;
    }

    setScanStatus('detecting');
    playBeep(440, 0.08, 'sine');

    setTimeout(() => {
      setScanStatus('analyzing');
      playBeep(587.33, 0.1, 'sine');

      setTimeout(() => {
        // Capture selected face or randomized fallback
        let targetId = presentingEmpId;
        
        let confidenceVal = 0;
        const isLowConfidenceSimulation = (targetId === 'low_confidence');
        const isUnregisteredSimulation = (targetId === 'unregistered');

        if (isLowConfidenceSimulation) {
          confidenceVal = Math.round((45 + Math.random() * 19.9) * 10) / 10; // 45.0% to 64.9%
        } else if (isUnregisteredSimulation) {
          confidenceVal = Math.round((10 + Math.random() * 25) * 10) / 10; // 10.0% to 35.0%
        } else {
          // Perfect confidence roll for normal scans
          confidenceVal = Math.round((96.5 + Math.random() * 3.4) * 10) / 10; // 96.5% to 99.9%
        }

        if (confidenceVal <= 65) {
          setScanStatus('unrecognized');
          playErrorChime();
          setPunchMessage({
            type: 'error',
            text: `Face match confidence is only ${confidenceVal}%. Not found in the Sri Sahasra database.`
          });
          return;
        }

        if (targetId === 'auto' || !registeredIds.includes(targetId)) {
          targetId = registeredIds[Math.floor(Math.random() * registeredIds.length)];
        }

        const faceRegistration = enrolledFaces[targetId];
        const profile = employees.find(e => e.employeeId === targetId);

        if (profile && profile.status === 'Active') {
          setScanStatus('matched');
          setMatchedEmployee(profile);
          setMatchedEnrolledPhoto(faceRegistration?.photoUrl || null);
          setMatchConfidence(confidenceVal);
          playSuccessChime();
        } else {
          setScanStatus('unrecognized');
          playErrorChime();
          setPunchMessage({
            type: 'error',
            text: 'Face locked but employee record is marked Inactive or was deleted from the main roster.'
          });
        }
      }, 1500);
    }, 1000);
  };

  // Perform targeted biometrics punch simulation immediately
  const handleTriggerTargetedMatch = (empId: string) => {
    setPunchMessage(null);
    setScanStatus('detecting');
    playBeep(440, 0.08, 'sine');

    setTimeout(() => {
      setScanStatus('analyzing');
      playBeep(587.33, 0.12, 'sine');

      setTimeout(() => {
        const face = enrolledFaces[empId];
        const profile = employees.find(e => e.employeeId === empId);

        if (profile && face) {
          setScanStatus('matched');
          setMatchedEmployee(profile);
          setMatchedEnrolledPhoto(face.photoUrl);
          setMatchConfidence(99.4);
          playSuccessChime();
        } else {
          setScanStatus('unrecognized');
          playErrorChime();
          setPunchMessage({
            type: 'error',
            text: `Employee (${empId}) facial descriptors haven't been registered yet.`
          });
        }
      }, 1200);
    }, 800);
  };

  // Executes actual Check-In or Out write to Firestore
  const handleExecuteBiometricPunch = async (punchType: 'In' | 'Out') => {
    if (!matchedEmployee) return;
    setIsPunching(true);
    setPunchMessage(null);

    const now = new Date();
    const todayStr = now.toISOString().substring(0, 10);
    const documentId = `${matchedEmployee.employeeId}_${todayStr}`;

    const hours = String(now.getHours() % 12 || 12).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
    const formattedPunchTime = `${hours}:${minutes} ${ampm}`;

    try {
      const docRef = doc(db, 'attendance', documentId);
      const docSnap = await getDoc(docRef);
      
      let attendanceRecord: Attendance;

      if (punchType === 'In') {
        let finalStatus: 'Present' | 'Late' = 'Present';
        try {
          // Compare against timings configuration graceLimit, e.g. "08:45 AM"
          const graceLimitDate = new Date();
          const [hoursStr, minutesStr] = schoolTimings.graceTime.replace(' AM', '').replace(' PM', '').split(':');
          
          let compHours = Number(hoursStr);
          if (schoolTimings.graceTime.includes('PM') && compHours < 12) compHours += 12;
          if (schoolTimings.graceTime.includes('AM') && compHours === 12) compHours = 0;

          graceLimitDate.setHours(compHours, Number(minutesStr), 0, 0);

          if (now > graceLimitDate) {
            finalStatus = 'Late';
          }
        } catch (err) {
          console.warn('Could not parse timing rule, defaulting to Present status', err);
        }

        attendanceRecord = {
          employeeId: matchedEmployee.employeeId,
          employeeName: matchedEmployee.name,
          date: todayStr,
          status: finalStatus,
          checkIn: formattedPunchTime,
          remarks: 'Biometric clock-in logged successfully.'
        };
      } else {
        // Checkout flow
        if (docSnap.exists()) {
          const oldData = docSnap.data() as Attendance;
          attendanceRecord = {
            ...oldData,
            checkOut: formattedPunchTime,
            remarks: (oldData.remarks || '') + ' Biometric clock-out logged.'
          };
        } else {
          attendanceRecord = {
            employeeId: matchedEmployee.employeeId,
            employeeName: matchedEmployee.name,
            date: todayStr,
            status: 'Present',
            checkOut: formattedPunchTime,
            remarks: 'Direct Biometric checkout logged (missing check-in).'
          };
        }
      }

      await setDoc(docRef, attendanceRecord);
      playBeep(1046.5, 0.35, 'sine'); // chime

      setPunchMessage({
        type: 'success',
        text: `Confirmed! Biometric Check-${punchType === 'In' ? 'In' : 'Out'} logged successfully for ${matchedEmployee.name} at ${formattedPunchTime}!`
      });

      // Reload database registries
      await fetchTodayKioskLogs();
      
      // Delay reset for good user UX feedback
      setTimeout(() => {
        setScanStatus('idle');
        setMatchedEmployee(null);
        setMatchedEnrolledPhoto(null);
      }, 4000);

    } catch (e) {
      console.error(e);
      playErrorChime();
      setPunchMessage({
        type: 'error',
        text: 'Database upload error. Please notify school administration.'
      });
      handleFirestoreError(e, OperationType.WRITE, `attendance/${documentId}`);
    } finally {
      setIsPunching(false);
    }
  };

  // Executes actual Manual Check-In or Out write to Firestore by a Receptionist/Admin
  const handleExecuteManualPunch = async () => {
    if (!manualPunchEmployee) return;
    setIsSubmitManualPunching(true);
    setManualPunchSuccessMsg(null);
    setManualPunchErrorMsg(null);

    const punchDate = manualPunchDatePicker || new Date().toISOString().substring(0, 10);
    const documentId = `${manualPunchEmployee.employeeId}_${punchDate}`;

    let punchTimeFormatted = manualPunchTime;
    if (!punchTimeFormatted) {
      // Fallback to current local time formatted
      const now = new Date();
      const hours = String(now.getHours() % 12 || 12).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
      punchTimeFormatted = `${hours}:${minutes} ${ampm}`;
    }

    try {
      const docRef = doc(db, 'attendance', documentId);
      const docSnap = await getDoc(docRef);
      
      let attendanceRecord: Attendance;

      if (manualPunchType === 'In') {
        if (docSnap.exists()) {
          const oldData = docSnap.data() as Attendance;
          attendanceRecord = {
            ...oldData,
            status: manualPunchStatus,
            checkIn: punchTimeFormatted,
            remarks: manualPunchRemarks || 'Manual check-in logged.'
          };
        } else {
          attendanceRecord = {
            employeeId: manualPunchEmployee.employeeId,
            employeeName: manualPunchEmployee.name,
            date: punchDate,
            status: manualPunchStatus,
            checkIn: punchTimeFormatted,
            remarks: manualPunchRemarks || 'Manual check-in logged.'
          };
        }
      } else {
        // Out
        if (docSnap.exists()) {
          const oldData = docSnap.data() as Attendance;
          attendanceRecord = {
            ...oldData,
            checkOut: punchTimeFormatted,
            remarks: manualPunchRemarks || ((oldData.remarks || '') + ' Manual check-out-logged.')
          };
        } else {
          attendanceRecord = {
            employeeId: manualPunchEmployee.employeeId,
            employeeName: manualPunchEmployee.name,
            date: punchDate,
            status: manualPunchStatus, // default status
            checkOut: punchTimeFormatted,
            remarks: manualPunchRemarks || 'Manual check-out logged (missing check-in).'
          };
        }
      }

      await setDoc(docRef, attendanceRecord);
      playSuccessChime();

      setManualPunchSuccessMsg(`Manual attendance recorded successfully for ${manualPunchEmployee.name}!`);
      
      // Refresh
      await fetchTodayKioskLogs();

      setTimeout(() => {
        setManualPunchEmployee(null);
        setShowManualPunchModal(false);
        setManualPunchSuccessMsg(null);
      }, 2500);

    } catch (e) {
      console.error('Manual attendance record failed', e);
      playErrorChime();
      setManualPunchErrorMsg('Failed to record manual attendance. Please check database permissions or network.');
    } finally {
      setIsSubmitManualPunching(false);
    }
  };

  // Open the Admin Pin dialog
  const promptAdminPin = () => {
    setPinInput('');
    setPinError(null);
    setIsAdminPinModalOpen(true);
    playBeep(880, 0.08);
  };

  const verifyAdminPinAndEnter = () => {
    if (pinInput === '1234') {
      setIsAdminPinModalOpen(false);
      setPinInput('');
      setPinError(null);
      setViewState('admin');
      setAdminTab('roster');
      playSuccessChime();
    } else {
      setPinError('Access Denied. Please input the correct Kiosk PIN.');
      playErrorChime();
    }
  };

  // Save new timing configuration
  const handleSaveTimingConfig = async () => {
    setConfigSaveSuccess(false);
    try {
      const payload: SchoolConfig = {
        checkInTime: localCheckIn,
        graceTime: localGrace,
        checkOutTime: localCheckOut
      };
      await setDoc(doc(db, 'config', 'school_timings'), payload);
      setSchoolTimings(payload);
      setConfigSaveSuccess(true);
      playSuccessChime();
    } catch (e) {
      console.error('Failed to update timing configurations', e);
      alert('Error updating institutional timers.');
    }
  };

  // Save or edit Employee profile
  const handleSaveEmployeeProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccessMsg(null);
    if (!newEmpName || !newEmpEmail || !newEmpPhone || !newEmpDesignation) {
      alert('Please fill out all mandatory fields.');
      return;
    }

    const assignedId = editingEmployeeId || newEmpId.trim() || 'emp_' + Math.floor(1000 + Math.random() * 9000);
    
    // Check conflicts
    if (!editingEmployeeId) {
      const idConflict = employees.find(emp => emp.employeeId.toLowerCase() === assignedId.toLowerCase());
      if (idConflict) {
        alert(`The Employee ID '${assignedId}' is already registered in roster database.`);
        return;
      }
    }

    const emailConflict = employees.find(emp => 
      emp.email.toLowerCase() === newEmpEmail.trim().toLowerCase() && 
      emp.employeeId.toLowerCase() !== assignedId.toLowerCase()
    );
    if (emailConflict) {
      alert(`The email address '${newEmpEmail}' is already registered in roster database.`);
      return;
    }

    try {
      const existingPassword = editingEmployeeId 
        ? employees.find(emp => emp.employeeId === editingEmployeeId)?.password 
        : undefined;
      const finalPassword = newEmpPassword.trim() || existingPassword || `${newEmpRole.toLowerCase()}123`;

      const payload: Employee = {
        employeeId: assignedId,
        name: newEmpName.trim(),
        email: newEmpEmail.trim().toLowerCase(),
        phone: newEmpPhone.trim(),
        designation: newEmpDesignation.trim(),
        role: newEmpRole,
        salary: Number(newEmpSalary),
        status: newEmpStatus,
        password: finalPassword
      };

      await setDoc(doc(db, 'employees', assignedId), payload);
      
      // Update local states
      if (editingEmployeeId) {
        setEmployees(prev => prev.map(emp => emp.employeeId === assignedId ? payload : emp));
        setProfileSuccessMsg(`Successfully updated employee profile for: ${newEmpName}`);
      } else {
        setEmployees(prev => [payload, ...prev]);
        setProfileSuccessMsg(`Successfully created employee record for: ${newEmpName} (${assignedId})`);
      }
      playSuccessChime();

      // Reset
      setNewEmpId('');
      setNewEmpName('');
      setNewEmpEmail('');
      setNewEmpPhone('');
      setNewEmpDesignation('');
      setNewEmpRole('Teacher');
      setNewEmpSalary(45000);
      setNewEmpPassword('');
      setNewEmpStatus('Active');
      setEditingEmployeeId(null);

      setTimeout(() => {
        setIsCreateProfileModalOpen(false);
        setProfileSuccessMsg(null);
      }, 2000);
    } catch (err) {
      console.error('Error saving profile record', err);
      alert('Failed to construct employee node on database.');
    }
  };

  // Delete Employee profile inside Reception Kiosk
  const handleDeleteEmployee = async (empId: string) => {
    if (!window.confirm(`Are you absolutely sure you want to delete employee "${empId}"? This will permanently wipe their credentials and facial data.`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'employees', empId));
      setEmployees(prev => prev.filter(emp => emp.employeeId !== empId));
      alert(`Success: Employee ${empId} deleted successfully.`);
      if (editingEmployeeId === empId) {
        setEditingEmployeeId(null);
        setNewEmpId('');
        setNewEmpName('');
        setNewEmpEmail('');
        setNewEmpPhone('');
        setNewEmpDesignation('');
        setNewEmpRole('Teacher');
        setNewEmpSalary(45000);
        setNewEmpPassword('');
        setNewEmpStatus('Active');
      }
    } catch (err) {
      console.error('Failed to delete employee profile', err);
      alert('Failed to delete employee profile from Firestore.');
    }
  };

  // Handle Enrollment camera frame grab
  const handleCaptureEnrollSnapshot = () => {
  if (!stream) {
    setEnrollErrorMsg("Camera stream not active.");
    return;
  }

  if (!enrollingEmployee) {
    return;
  }

  const activeVideo = enrollVideoRef.current;

  if (!activeVideo) {
    setEnrollErrorMsg("Camera feed unavailable.");
    return;
  }

  setEnrollErrorMsg(null);
  setEnrollSuccessMsg(null);

  const canvas = document.createElement("canvas");

  canvas.width = 640;
  canvas.height = 640;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    setEnrollErrorMsg("Canvas initialization failed.");
    return;
  }

  const videoWidth = activeVideo.videoWidth;
  const videoHeight = activeVideo.videoHeight;

  const cropSize = Math.min(
    videoWidth,
    videoHeight
  );

  const startX =
    (videoWidth - cropSize) / 2;

  const startY =
    (videoHeight - cropSize) / 2;

  ctx.drawImage(
    activeVideo,
    startX,
    startY,
    cropSize,
    cropSize,
    0,
    0,
    640,
    640
  );

  // Lighting validation

  const imageData = ctx.getImageData(
    0,
    0,
    640,
    640
  );

  let brightness = 0;

  for (
    let i = 0;
    i < imageData.data.length;
    i += 4
  ) {
    brightness +=
      (imageData.data[i] +
        imageData.data[i + 1] +
        imageData.data[i + 2]) /
      3;
  }

  brightness /=
    imageData.data.length / 4;

  if (brightness < 50) {
    setEnrollErrorMsg(
      "Lighting too low. Please move to a brighter area."
    );
    return;
  }

  const image =
    canvas.toDataURL(
      "image/jpeg",
      0.95
    );

  setEnrollPhoto(image);

  playBeep(
    1200,
    0.05,
    "triangle"
  );
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

      playBeep(880, 0.2, 'sine');
      setEnrollSuccessMsg(`Face signature mapped successfully for ${enrollingEmployee.name}! They can now use kiosk scanning features.`);
      
      setTimeout(() => {
        setEnrollingEmployee(null);
        setEnrollPhoto(null);
        setEnrollSuccessMsg(null);
        setEnrollErrorMsg(null);
        if (enrollVideoRef.current) {
          enrollVideoRef.current.srcObject = null;
        }
      }, 2500);

    } catch (err) {
      console.error(err);
      setEnrollErrorMsg('Communication timeout saving bio profiles.');
    }
  };

  const handleDeleteFaceEnrollment = async (empId: string) => {
    if (!window.confirm("Are you sure you want to delete this employee's face recognition profile? They will need to enroll again to use the kiosk scanner.")) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'face_enrollments', empId));
      setEnrolledFaces(prev => {
        const copy = { ...prev };
        delete copy[empId];
        return copy;
      });
      playBeep(440, 0.15, 'sawtooth');
      alert("Face recognition data deleted successfully.");
    } catch (err) {
      console.error(err);
      alert("Failed to delete face recognition data from Firestore.");
    }
  };

  // Filtering listings reactive rules
  const filteredEmployeesList = employees.filter(emp => {
    const textMatch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                     emp.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
                     emp.designation.toLowerCase().includes(searchQuery.toLowerCase());
    
    const dptMatch = departmentFilter === 'All' || emp.role === departmentFilter;
    const stsMatch = statusFilter === 'All' || emp.status === statusFilter;

    return textMatch && dptMatch && stsMatch;
  });

  // Unique departments count
  const distinctRoles = Array.from(new Set(employees.map(e => e.role))).length;
  
  // Checked in count today
  const verifiedCheckedInTodayCount = receptionLogs.filter(log => log.checkIn).length;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col font-sans transition-all" id="reception_kiosk_portal_frame">
      
      {/* ----------------- 1. LANDING VIEW ----------------- */}
      {/* ----------------- 1. LANDING VIEW ----------------- */}
      {viewState === 'landing' && (
        <div className="flex flex-col min-h-screen">
          
          {/* Header */}
          <header className="border-b border-slate-100 bg-white p-4 sticky top-0 z-40 select-none">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="relative shrink-0">
                  {/* Graduation Cap Logo Badging matches mockup 1 */}
                  <div className="p-2 sm:p-3 bg-[#1b5dfc] rounded-xl sm:rounded-2xl flex items-center justify-center text-white h-10 w-10 sm:h-12 sm:w-12 relative shadow-lg shadow-[#1b5dfc]/20">
                    <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6" />
                    {/* Tiny gold star badging on badge overlap */}
                    <div className="bg-amber-400 border border-white text-slate-900 rounded-full h-4 sm:h-4.5 w-4 sm:w-4.5 flex items-center justify-center p-0.5 text-[7px] sm:text-[8px] font-black absolute -bottom-1 -right-1 shadow-sm leading-none select-none">
                      ★
                    </div>
                  </div>
                </div>
                <div>
                  <h1 className="text-sm xs:text-base sm:text-lg md:text-xl font-extrabold tracking-tight text-blue-950 font-sans uppercase">
                    Sri Sahasra Vidhyanikethan
                  </h1>
                  <p className="text-[8px] sm:text-[10px] text-blue-600 font-extrabold uppercase tracking-wider md:tracking-widest leading-none mt-1">
                    Reception Time Attendance Console
                  </p>
                </div>
              </div>

              {/* Status Pill Indicator & Logout Option */}
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex bg-blue-50 border border-blue-100/60 text-[#1b5dfc] px-3.5 py-1.5 text-[10px] font-mono font-bold tracking-wider rounded-full items-center gap-1.5 shadow-sm select-none shrink-0">
                  <span className="w-2 h-2 rounded-full bg-[#1b5dfc] animate-pulse"></span>
                  KIOSK ONLINE
                </div>

                <button
                  id="btn_terminal_logout"
                  onClick={onClose}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-650 border border-red-200/55 rounded-xl text-xs font-bold leading-none select-none cursor-pointer duration-150 shadow-sm shrink-0"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Secure Logout</span>
                </button>
              </div>
            </div>
          </header>

          {/* Body content */}
          <main className="flex-grow max-w-7xl w-full mx-auto p-4 sm:p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 items-stretch pt-6 md:pt-12">
            
            {/* Clock Card Section (Left) */}
            <div className="lg:col-span-12 xl:col-span-5 bg-white rounded-2xl md:rounded-[2rem] p-6 md:p-8 border border-slate-100 shadow-xl shadow-slate-100/40 flex flex-col justify-between relative overflow-hidden min-h-[220px] md:min-h-[350px] lg:h-auto">
              {/* Graduation watermark absolute opacity bg */}
              <GraduationCap className="text-slate-100 opacity-20 absolute -bottom-8 -right-8 w-44 h-42 md:w-56 md:h-54 pointer-events-none select-none" />

              <div className="relative z-10 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="bg-amber-500 text-slate-950 rounded font-black tracking-wider px-2 py-0.5 text-[8px] sm:text-[9px] uppercase font-mono leading-none">
                    ESTD 2020
                  </span>
                  <span className="text-slate-400 font-mono text-[9px] sm:text-[10px] tracking-wider uppercase font-extrabold leading-none">
                    LOCAL DEVICE SYNC
                  </span>
                </div>

                {/* Clock output */}
                <div className="pt-6 sm:pt-14 space-y-0.5">
                  <div className="text-4xl sm:text-5xl md:text-7xl font-light tracking-tight text-slate-900 leading-none select-none font-sans">
                    {formattedClockStr}
                  </div>
                  <div className="text-lg sm:text-xl md:text-2xl font-black text-blue-600 tracking-wider font-mono">
                    {ampmFractionStr}
                  </div>
                </div>
              </div>

              {/* Calendar stamp (bottom) */}
              <div className="relative z-10 flex items-center gap-3 mt-6 sm:mt-auto">
                <div className="p-2 sm:p-3 bg-blue-50 text-[#1b5dfc] rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 w-10 sm:w-12 h-10 sm:h-12">
                  <Calendar className="h-4.5 w-4.5 sm:h-5 sm:w-5 stroke-2" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-slate-400 font-mono text-[8px] sm:text-[9px] tracking-widest font-black uppercase">
                    CURRENT DATE
                  </p>
                  <p className="text-slate-800 font-black text-sm sm:text-base leading-tight">
                    {formattedDateStr}
                  </p>
                </div>
              </div>
            </div>

            {/* Actions list menu (Right) */}
            <div className="lg:col-span-12 xl:col-span-7 flex flex-col gap-4 sm:gap-6 justify-between">
              
              {/* STAFF CHECK-IN */}
              <button
                id="btn_staff_check_in"
                onClick={() => openScanner('In')}
                className="w-full bg-[#1b5dfc] hover:bg-[#134ed2] text-left p-5 sm:p-7 rounded-2xl md:rounded-[2.25rem] shadow-lg shadow-blue-500/10 flex items-center justify-between cursor-pointer transition-all hover:-translate-y-0.5 group relative border border-blue-400/10"
              >
                <div className="flex items-center gap-4 sm:gap-5">
                  <div className="bg-white/10 text-white p-3.5 sm:p-5 rounded-xl sm:rounded-2.5xl flex items-center justify-center h-12 w-12 sm:h-16 sm:w-16 shrink-0 shadow-sm">
                    <LogIn className="h-6 w-6 sm:h-7 sm:w-7" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg md:text-xl font-extrabold text-white tracking-normal font-sans">
                      STAFF CHECK-IN
                    </h3>
                    <p className="text-blue-100/95 text-xs sm:text-sm tracking-normal font-medium mt-1 leading-tight">
                      Biometric facial verification registry check-in.
                    </p>
                  </div>
                </div>
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full border border-white/20 bg-white/10 flex items-center justify-center text-white shrink-0 group-hover:bg-white/20 group-hover:scale-105 transition-all">
                  <ArrowRight className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                </div>
              </button>

              {/* STAFF CHECK-OUT */}
              <button
                id="btn_staff_check_out"
                onClick={() => openScanner('Out')}
                className="w-full bg-[#0c1122] hover:bg-[#151c33] text-left p-5 sm:p-7 rounded-2xl md:rounded-[2.25rem] shadow-lg shadow-slate-900/10 flex items-center justify-between cursor-pointer transition-all hover:-translate-y-0.5 group relative border border-slate-800"
              >
                <div className="flex items-center gap-4 sm:gap-5">
                  <div className="bg-red-500/15 text-red-500 p-3.5 sm:p-5 rounded-xl sm:rounded-2.5xl flex items-center justify-center h-12 w-12 sm:h-16 sm:w-16 shrink-0">
                    <LogOut className="h-6 w-6 sm:h-7 sm:w-7" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg md:text-xl font-extrabold text-white tracking-normal font-sans">
                      STAFF CHECK-OUT
                    </h3>
                    <p className="text-slate-400 text-xs sm:text-sm tracking-normal mt-1 leading-tight">
                      Biometric facial verification registry check-out.
                    </p>
                  </div>
                </div>
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full border border-slate-800 bg-slate-900 flex items-center justify-center text-slate-350 shrink-0 group-hover:bg-slate-800 group-hover:scale-105 transition-all">
                  <ArrowRight className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                </div>
              </button>

              {/* ADMIN MODE DASHBOARD DIRECT SWITCH BAR */}
              <button
                id="btn_admin_portal"
                onClick={promptAdminPin}
                className="w-full bg-white hover:bg-slate-50 border border-slate-200 text-left p-5 sm:p-7 rounded-2xl md:rounded-[2.25rem] shadow-sm flex items-center justify-between cursor-pointer transition-all hover:-translate-y-0.5 group relative"
              >
                <div className="flex items-center gap-4 sm:gap-5">
                  <div className="bg-blue-50 text-[#1b5dfc] p-3 sm:p-4 rounded-xl sm:rounded-2xl flex items-center justify-center h-11 w-11 sm:h-14 sm:w-14 shrink-0 shadow-xs">
                    <UserCog className="h-5.5 w-5.5 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <h3 className="text-slate-900 font-extrabold text-xs sm:text-base tracking-normal uppercase">
                      ADMIN MODE DASHBOARD
                    </h3>
                    <p className="text-slate-450 font-semibold text-xs sm:text-sm mt-0.5 leading-tight">
                      Configure parameters, modify roster profiles.
                    </p>
                  </div>
                </div>
                <div className="text-[9px] sm:text-[10px] text-slate-350 tracking-widest font-mono font-black select-none uppercase shrink-0 m-0 leading-none">
                  PIN_PROTECTED
                </div>
              </button>
            </div>

          </main>

          {/* Bottom security lock ribbon matches mockup 1 */}
          <footer className="border-t border-slate-200 bg-white p-4 px-6 max-w-full text-[10px] text-slate-400 font-mono tracking-wider uppercase flex flex-col md:flex-row items-center justify-between gap-2.5 mt-auto select-none">
            <div className="flex items-center gap-2 text-emerald-600">
              <div className="p-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
                <ShieldCheck className="h-3 w-3" />
              </div>
              <span className="font-bold text-[9px] tracking-widest">
                SECURED BIOMETRIC RECEPTION ATTENDANCE TERMINAL
              </span>
            </div>
            <div className="text-slate-450 font-black text-[9px] tracking-widest">
              SRI SAHASRA VIDHYANIKETHAN © {localTime.getFullYear()}
            </div>
          </footer>

        </div>
      )}

      {/* ----------------- 2. CAMERA WEBCAM SCANNER VIEW ----------------- */}
      {viewState === 'scanner' && (
        <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800">
          
          <header className="border-b border-slate-200 bg-white p-4 sticky top-0 z-40 shadow-xs select-none">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setViewState('landing')}
                  className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600 hover:text-slate-900 transition-all cursor-pointer border border-slate-200"
                  title="Back to home"
                >
                  <ArrowLeft className="h-4.5 w-4.5" />
                </button>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <h1 className="text-sm font-extrabold tracking-tight text-slate-900 uppercase font-sans">
                      Primary Biometric Kiosk Terminal
                    </h1>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span>GATEWAY {scannerMode === 'In' ? 'CLOCK-IN' : 'CLOCK-OUT'} PORTAL</span>
                    <span>•</span>
                    <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded text-[8.5px] border border-emerald-100">🔒 SECURED CLOUD DATABASE EXTENSION</span>
                  </p>
                </div>
              </div>

              {/* Status indicators */}
              <div className="flex items-center gap-2 md:gap-4 font-mono text-[10px]">
                <div className="hidden md:block py-1.5 px-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-600">
                  Daily timing baseline: <strong className="text-slate-800">{schoolTimings.graceTime}</strong>
                </div>
                <span className="px-2.5 py-1.5 rounded-xl bg-blue-50 text-[#1b5dfc] border border-blue-150 text-[9.5px] font-bold">
                  BIOMETRIC FEED ESTABLISHED
                </span>
              </div>
            </div>
          </header>

          <main className="flex-grow max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Visualizer screen column */}
            <div className="lg:col-span-8 space-y-6">
              
              <div className="bg-white border border-slate-200/80 shadow-sm rounded-3xl p-5 md:p-6 flex flex-col gap-5 relative">
                
                {/* Simulated / actual camera feed in warm high fidelity color */}
                <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 shadow-lg">
                  
                  {stream ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover opacity-95"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-400">
                      <Camera className="h-10 w-10 text-slate-600 animate-pulse mb-2" />
                      <p className="text-xs font-mono">Initializing full-color security feed camera...</p>
                    </div>
                  )}

                  <canvas
                    ref={canvasRef}
                    width={640}
                    height={480}
                    className="absolute inset-0 w-full h-full pointer-events-none z-10"
                  />

                  {/* Corner overlays info */}
                  <div className="absolute top-4 left-4 font-mono text-[9px] text-[#ffffff] bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800/85">
                    FEED REFERENCE TIMELOCK: {localTime.toLocaleTimeString()}
                  </div>

                  <div className="absolute bottom-4 right-4 text-right font-mono text-[9px] text-[#ffffff] bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800/85">
                    ANALYSIS ENGINE: SECURE-BIO STRICT VERIFY v3
                  </div>

                  {cameraError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/95 text-center p-6 z-20">
                      <AlertTriangle className="h-10 w-10 text-amber-500 mb-3" />
                      <h4 className="font-bold text-slate-900 text-sm">Hardware Camera Inactive</h4>
                      <p className="text-slate-500 text-xs mt-1 max-w-sm leading-relaxed">{cameraError}</p>
                      <button
                        onClick={setupCamera}
                        className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 font-bold cursor-pointer transition-colors"
                      >
                        Re-Authorize Hardware Access
                      </button>
                    </div>
                  )}

                </div>

                {/* Operations and trigger blocks */}
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 justify-between bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold font-sans text-slate-850 flex items-center gap-1.5 leading-none">
                      <Camera className="h-4 w-4 text-blue-500" />
                      Strict Face-Recognition Target Lock
                    </h3>
                    <p className="text-xs text-slate-500 font-sans">
                      Align the eyes perfectly inside terminal reticles for premium biometrics scanning.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="flex flex-col gap-1 min-w-[200px]">
                      <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wide">
                        Present Face snapshot:
                      </span>
                      <select
                        id="presenting_employee_selector"
                        value={presentingEmpId}
                        onChange={(e) => setPresentingEmpId(e.target.value)}
                        className="bg-white border border-slate-200 text-slate-800 px-3 py-1.5 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      >
                        <option value="auto">Auto-Detect (Random Face)</option>
                        <option value="low_confidence">Poor Lighting / Blur (Simulate Low Confidence &lt; 65%)</option>
                        <option value="unregistered">Unknown Face Template (Simulate Low Confidence &lt; 65%)</option>
                        {(Object.values(enrolledFaces) as EnrolledFace[]).map((face) => (
                          <option key={face.employeeId} value={face.employeeId}>
                            {face.name} ({face.employeeId})
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      id="trigger_face_scan_btn"
                      disabled={scanStatus === 'detecting' || scanStatus === 'analyzing' || !!cameraError}
                      onClick={handleTriggerInteractiveScan}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold tracking-wider shadow-sm flex items-center justify-center gap-2 select-none cursor-pointer transition-all disabled:opacity-40 self-end sm:self-auto h-[38px] mt-auto"
                    >
                      <Scan className={`h-4 w-4 ${scanStatus === 'analyzing' ? 'animate-spin' : ''}`} />
                      {scanStatus === 'idle' && 'AUTHENTICATE FACE'}
                      {scanStatus === 'detecting' && 'ALIGNING VECTORS...'}
                      {scanStatus === 'analyzing' && 'COMPUTING TOPOLOGY...'}
                      {scanStatus === 'matched' && 'SCANNER LOCKED'}
                      {scanStatus === 'unrecognized' && 'RESET'}
                    </button>
                  </div>
                </div>

                {/* Strict Biometric Quality Checker Panel */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                    <span>Biometric Strict Verification Checklist</span>
                    <span className="text-emerald-600">Strict mode calibrated</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                      <div className="text-[10px] font-mono">
                        <p className="font-bold text-slate-700">Contrast Check</p>
                        <p className="text-[9px] text-slate-450">High Contrast Active</p>
                      </div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                      <div className="text-[10px] font-mono">
                        <p className="font-bold text-slate-700">Eye Alignment</p>
                        <p className="text-[9px] text-slate-450">Perfect Horizon Calibration</p>
                      </div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-200/60 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <div className="text-[10px] font-mono">
                        <p className="font-bold text-slate-700">128-Point Mesh</p>
                        <p className="text-[9px] text-slate-450">Strict Multi-point Mapping</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Match Results Card */}
                {scanStatus === 'matched' && matchedEmployee && (
                  <div className="p-5 bg-emerald-50/65 border border-emerald-200 rounded-3xl grid grid-cols-1 sm:grid-cols-12 gap-5 items-center animate-fade-in relative shadow-md">
                    <div className="sm:col-span-3 flex justify-center">
                      <div className="relative shrink-0 select-none">
                        {matchedEnrolledPhoto ? (
                          <img
                            src={matchedEnrolledPhoto}
                            alt={matchedEmployee.name}
                            className="w-20 h-20 rounded-2xl object-cover border border-emerald-300 shadow-sm"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-20 h-20 rounded-2xl bg-white border border-dashed border-slate-200 flex items-center justify-center text-slate-400">
                            <Smile className="h-8 w-8" />
                          </div>
                        )}
                        <span className="absolute -bottom-1.5 -right-1.5 bg-emerald-600 text-white text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-md shadow-xs leading-none uppercase">
                          {matchConfidence}% STRICT
                        </span>
                      </div>
                    </div>

                    <div className="sm:col-span-5 text-center sm:text-left space-y-1">
                      <div className="flex items-center gap-1.5 justify-center sm:justify-start">
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
                        <h4 className="text-base font-bold text-slate-900">{matchedEmployee.name}</h4>
                      </div>
                      <p className="text-xs text-slate-600 font-mono">
                        Staff ID: <span className="text-slate-800 font-bold">{matchedEmployee.employeeId}</span> • {matchedEmployee.designation}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        Department: {matchedEmployee.role}
                      </p>
                    </div>

                    {/* Punch executable trigger buttons */}
                    <div className="sm:col-span-4 flex flex-col gap-2.5">
                      <button
                        onClick={() => handleExecuteBiometricPunch(scannerMode)}
                        disabled={isPunching}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer select-none transition-all flex items-center justify-center gap-1.5 font-mono uppercase tracking-wider"
                      >
                        <UserCheck className="h-4 w-4" />
                        CONFIRM {scannerMode === 'In' ? 'CHECK-IN' : 'CHECK-OUT'}
                      </button>

                      <button
                        onClick={() => { setScanStatus('idle'); setMatchedEmployee(null); setMatchedEnrolledPhoto(null); }}
                        className="w-full py-2.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 cursor-pointer transition-all flex items-center justify-center font-mono uppercase"
                      >
                        Cancel Match
                      </button>
                    </div>
                  </div>
                )}

                {/* Status messages info outputs */}
                {punchMessage && (
                  <div className={`p-4 rounded-2xl flex flex-col gap-3 border ${
                    punchMessage.type === 'success' 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-950' 
                      : 'bg-red-50 border-red-200 text-red-950'
                  } animate-fade-in`}>
                    <div className="flex items-start gap-3">
                      {punchMessage.type === 'success' ? (
                        <CheckCircle className="h-5 w-5 shrink-0 mt-0.5 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-red-605" />
                      )}
                      <span className="text-xs font-mono font-bold leading-relaxed">{punchMessage.text}</span>
                    </div>

                    {punchMessage.type === 'error' && (
                      <div className="text-[10.5px] p-2.5 bg-white/70 border border-red-200/50 rounded-xl text-slate-700 leading-relaxed font-sans">
                        <p className="font-bold text-red-800 flex items-center gap-1 mb-1">
                          <CheckCircle className="h-3.5 w-3.5 text-red-600" />
                          Need Manual Overrides?
                        </p>
                        Receptionist/Administrators can manually record attendance under <strong className="text-slate-900">Admin Mode Dashboard &rarr; Roster Directory &rarr; Manual Attendance</strong> options, specifically formatted for unrecognized face scenarios.
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Offline testing bypass shortcuts simulator panel */}
              <div className="p-4 bg-white border border-slate-200 shadow-xs rounded-2xl">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-2 font-black">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  Biometrics Emulator Desk (Camera Bypass)
                </div>
                <p className="text-[10px] text-slate-500 font-mono mb-3 leading-relaxed">
                  Click on any enrolled staff member below to bypass camera hardware rules and simulate local facial match instantly:
                </p>

                {Object.keys(enrolledFaces).length === 0 ? (
                  <div className="text-[10px] text-slate-500 font-mono py-1">
                    No active face profiles registered on Firestore. Go to Admin Mode Dashboard to enroll.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(Object.values(enrolledFaces) as EnrolledFace[]).map((face) => (
                      <button
                        key={face.employeeId}
                        onClick={() => handleTriggerTargetedMatch(face.employeeId)}
                        className={`px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border rounded-xl text-[10px] font-mono text-slate-700 hover:text-emerald-700 cursor-pointer transition-all flex items-center gap-1.5 ${
                          matchedEmployee?.employeeId === face.employeeId ? 'border-emerald-500 text-emerald-700 bg-emerald-50' : 'border-slate-200'
                        }`}
                      >
                        <img src={face.photoUrl} className="w-5 h-5 rounded-full object-cover border border-slate-250" referrerPolicy="no-referrer" />
                        <span>{face.name} ({face.employeeId})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Logs timeline column (Right) */}
            <div className="lg:col-span-4 space-y-6">
              
              <div className="bg-white border border-slate-200 shadow-xs rounded-3xl p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black tracking-widest text-slate-700 font-mono uppercase">
                    TODAY BIOMETRIC LOGS
                  </h4>
                  <button
                    onClick={fetchTodayKioskLogs}
                    className="p-1 px-2 border border-slate-200 hover:bg-slate-50 rounded text-[9px] font-mono text-slate-600 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" />
                    SYNC
                  </button>
                </div>

                <div className="max-h-[360px] overflow-y-auto space-y-3 pr-1 divide-y divide-slate-100" id="reception_logs_viewport_timeline">
                  {receptionLogs.length === 0 ? (
                    <div className="text-[11px] text-slate-455 font-mono py-6 text-center">
                      No biometric events logged yet today.
                    </div>
                  ) : (
                    receptionLogs.map((log, idx) => (
                      <div key={log.employeeId + '_' + idx} className="pt-3 font-mono space-y-1">
                        <div className="flex justify-between items-start text-xs">
                          <span className="font-bold text-slate-800">{log.employeeName}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase leading-none ${
                            log.status === 'Present' ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' :
                            log.status === 'Late' ? 'bg-amber-50 text-amber-700 border border-amber-150' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {log.status}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-slate-500">
                          <div>
                            {log.checkIn && <p className="text-slate-600">In: <strong className="text-emerald-600">{log.checkIn}</strong></p>}
                            {log.checkOut && <p className="text-slate-600">Out: <strong className="text-blue-600">{log.checkOut}</strong></p>}
                          </div>
                          <span className="text-[8px] text-slate-400">{log.date}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

          </main>

        </div>
      )}


      {/* ----------------- 3. RECEPTION PORTAL ADMIN ACCESS VIEW ----------------- */}
      {viewState === 'admin' && (
        <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800">
          
          {/* Mockup Screen 2 Dark Header */}
          <header className="bg-[#0c1122] border-b border-slate-900 p-4 sticky top-0 z-40 text-white select-none">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <div className="p-3 bg-blue-600 rounded-2xl flex items-center justify-center text-white h-12 w-12 relative shadow-lg shadow-blue-500/10">
                    <GraduationCap className="h-6 w-6" />
                    <div className="bg-amber-400 border border-white text-slate-900 rounded-full h-4 w-4 flex items-center justify-center p-0.5 text-[8px] font-black absolute -bottom-1 -right-1 shadow-sm leading-none">
                      ★
                    </div>
                  </div>
                </div>
                <div>
                  <h1 className="text-lg md:text-xl font-extrabold tracking-tight font-sans">
                    SRI SAHASRA VIDHYANIKETHAN
                  </h1>
                  <p className="text-[10px] text-cyan-400 font-extrabold uppercase tracking-widest leading-none mt-1">
                    RECEPTION PORTAL // ADMIN ACCESS
                  </p>
                </div>
              </div>

              {/* Back to Kiosk Button */}
              <button
                onClick={() => setViewState('landing')}
                className="flex items-center gap-1.5 px-4 py-2 border border-slate-800 text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-850 rounded-xl font-medium text-xs font-mono tracking-wider cursor-pointer transition-all shadow-xs"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                KIOSK MODE
              </button>
            </div>
          </header>

          {/* Sub menu Tab bar matches mockup 2 */}
          <div className="bg-[#0a0d17] border-b border-slate-800 px-4 md:px-8 py-0 z-10 select-none">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              
              {/* Secondary operational tabs */}
              <div className="flex items-stretch gap-1 overflow-x-auto scrollbar-none max-w-full">
                <button
                  onClick={() => setAdminTab('roster')}
                  className={`px-4 py-3 text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-2 border-b-2 cursor-pointer shrink-0 ${
                    adminTab === 'roster' 
                      ? 'border-[#1b5dfc] text-white bg-slate-900/40 font-extrabold' 
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  Roster Directory
                </button>

                <button
                  onClick={() => setAdminTab('logs')}
                  className={`px-4 py-3 text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-2 border-b-2 cursor-pointer shrink-0 ${
                    adminTab === 'logs' 
                      ? 'border-[#1b5dfc] text-white bg-slate-900/40 font-extrabold' 
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  Attendance Logs
                </button>

                <button
                  onClick={() => setAdminTab('config')}
                  className={`px-4 py-3 text-xs font-bold tracking-wider uppercase transition-all flex items-center gap-2 border-b-2 cursor-pointer shrink-0 ${
                    adminTab === 'config' 
                      ? 'border-[#1b5dfc] text-white bg-slate-900/40 font-extrabold' 
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Settings className="h-3.5 w-3.5" />
                  Configuration
                </button>
              </div>

              {/* Active live synchronizer */}
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider font-extrabold pb-3 sm:pb-0">
                SYNC: CLOUD_SECURE // FIRESTORE LIVE
              </div>

            </div>
          </div>

          {/* Admin container viewport */}
          <main className="flex-grow max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">

            {/* TAB CONTENT A: ROSTER DIRECTORY */}
            {adminTab === 'roster' && (
              <div className="space-y-6 animate-fade-in">
                
                {/* 3 Stats horizontal counter cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Card 1: Roster Size */}
                  <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex items-center gap-4">
                    <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0 w-14 h-14">
                      <Users className="h-6 w-6" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-400 font-mono tracking-widest font-black uppercase leading-none">
                        Roster Size
                      </p>
                      <p className="text-3xl font-extrabold text-slate-850 leading-tight">
                        {employees.length}
                      </p>
                    </div>
                  </div>

                  {/* Card 2: Checked In Today */}
                  <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex items-center gap-4">
                    <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0 w-14 h-14">
                      <CheckCircle className="h-6 w-6" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-400 font-mono tracking-widest font-black uppercase leading-none">
                        Checked In Today
                      </p>
                      <p className="text-3xl font-extrabold text-slate-850 leading-tight">
                        {verifiedCheckedInTodayCount}
                      </p>
                    </div>
                  </div>

                  {/* Card 3: Departments */}
                  <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex items-center gap-4">
                    <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shrink-0 w-14 h-14">
                      <BookOpen className="h-6 w-6" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-400 font-mono tracking-widest font-black uppercase leading-none">
                        Departments
                      </p>
                      <p className="text-3xl font-extrabold text-slate-850 leading-tight">
                        {distinctRoles}
                      </p>
                    </div>
                  </div>

                </div>

                {/* Profiles control card container */}
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden p-5 space-y-4">
                  
                  {/* Filter controls row */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    
                    {/* Search matches mockup 2 */}
                    <div className="relative flex-grow">
                      <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search by ID, name or role..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-50 pl-10 pr-4 py-2 rounded-xl text-xs font-semibold text-slate-700 placeholder-slate-400 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white focus:border-blue-500 transition-all font-sans"
                      />
                    </div>

                    {/* Department dropdown select */}
                    <div className="relative min-w-[140px]">
                      <select
                        value={departmentFilter}
                        onChange={(e) => setDepartmentFilter(e.target.value as any)}
                        className="w-full bg-slate-50 px-3 py-2 text-xs font-semibold rounded-xl text-slate-700 border border-slate-200 outline-none cursor-pointer focus:bg-white focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="All">All Departments</option>
                        <option value="Teacher">Teacher</option>
                        <option value="Finance">Finance</option>
                        <option value="Principal">Principal</option>
                        <option value="Admin">Admin</option>
                      </select>
                    </div>

                    {/* Status dropdown select */}
                    <div className="relative min-w-[124px]">
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="w-full bg-slate-50 px-3 py-2 text-xs font-semibold rounded-xl text-slate-700 border border-slate-200 outline-none cursor-pointer focus:bg-white focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="All">All Statuses</option>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>

                    {/* Create Profile Button matches mockup 2 */}
                    <button
                      onClick={() => setIsCreateProfileModalOpen(true)}
                      className="px-5 py-2 bg-[#1b5dfc] hover:bg-[#134ed2] rounded-xl text-xs font-extrabold text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-sm select-none transition-all duration-150 shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                      Create Profile
                    </button>

                  </div>

                  {/* Main Profiles Table list */}
                  <div className="overflow-x-auto rounded-2xl border border-slate-100">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-[10px] text-slate-500 font-extrabold tracking-widest uppercase">
                          <th className="py-3.5 px-4 font-black">Staff Profile</th>
                          <th className="py-3.5 px-4 font-black">Employee ID</th>
                          <th className="py-3.5 px-4 font-black">Department</th>
                          <th className="py-3.5 px-4 font-black">Direct Contact</th>
                          <th className="py-3.5 px-4 font-black">Status</th>
                          <th className="py-3.5 px-4 font-black text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        
                        {/* Loading database node */}
                        {loading ? (
                          <tr>
                            <td colSpan={6} className="py-12 p-4 text-center">
                              <div className="flex flex-col items-center justify-center gap-3">
                                <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                <p className="text-xs text-slate-400 font-semibold tracking-wider font-mono">
                                  Accessing institution databases...
                                </p>
                              </div>
                            </td>
                          </tr>
                        ) : filteredEmployeesList.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 p-4 text-center text-xs text-slate-400 font-semibold">
                              No matching employee profiles found in active roster directory.
                            </td>
                          </tr>
                        ) : (
                          filteredEmployeesList.map((emp) => {
                            const isEnrolled = enrolledFaces[emp.employeeId] !== undefined;
                            
                            return (
                              <tr key={emp.employeeId} className="hover:bg-slate-50/50 transition-colors text-xs text-slate-650 font-sans font-medium">
                                
                                {/* Avatar & Designations */}
                                <td className="py-4 px-4 font-semibold text-slate-800">
                                  <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-xs font-black shrink-0 relative">
                                      {isEnrolled ? (
                                        <img src={enrolledFaces[emp.employeeId].photoUrl} className="w-full h-full rounded-full object-cover" />
                                      ) : (
                                        emp.name.charAt(0).toUpperCase()
                                      )}
                                    </div>
                                    <div>
                                      <p className="font-extrabold text-slate-900 leading-tight">{emp.name}</p>
                                      <p className="text-[10px] text-slate-400 font-semibold font-mono mt-0.5">{emp.designation}</p>
                                    </div>
                                  </div>
                                </td>

                                {/* Staff ID code */}
                                <td className="py-4 px-4 font-mono font-bold font-black text-slate-800 text-[11px]">
                                  {emp.employeeId}
                                </td>

                                {/* Department role */}
                                <td className="py-4 px-4 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                                  {emp.role}
                                </td>

                                {/* Phone & Email */}
                                <td className="py-4 px-4 space-y-0.5">
                                  <p className="text-[11px] font-mono font-bold text-slate-700 leading-none">{emp.phone}</p>
                                  <p className="text-[10px] text-slate-400 leading-none">{emp.email}</p>
                                </td>

                                {/* Status indicators */}
                                <td className="py-4 px-4">
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-tight ${
                                    emp.status === 'Active' 
                                      ? 'bg-emerald-50 text-emerald-700' 
                                      : 'bg-slate-100 text-slate-500'
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${emp.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                                    {emp.status}
                                  </span>
                                </td>

                                {/* Biometric Face capture triggers & controls */}
                                <td className="py-4 px-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => {
                                        setManualPunchEmployee(emp);
                                        setManualPunchDatePicker(new Date().toISOString().substring(0, 10));
                                        
                                        const now = new Date();
                                        const hours = String(now.getHours() % 12 || 12).padStart(2, '0');
                                        const minutes = String(now.getMinutes()).padStart(2, '0');
                                        const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
                                        setManualPunchTime(`${hours}:${minutes} ${ampm}`);
                                        
                                        setManualPunchRemarks('Manual override (Face not detected)');
                                        setManualPunchType('In');
                                        setManualPunchStatus('Present');
                                        setShowManualPunchModal(true);
                                      }}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#eff6ff] hover:bg-[#dbeafe] border border-[#bfdbfe] text-[#1e40af] hover:text-[#1d4ed8] rounded-xl text-[10px] font-black cursor-pointer transition-colors shrink-0"
                                      title="Record manual attendance"
                                    >
                                      <Calendar className="h-3.5 w-3.5" />
                                      Manual Attendance
                                    </button>

                                    {isEnrolled ? (
                                      <div className="flex items-center gap-1.5 justify-end">
                                        <div className="inline-flex items-center gap-1 text-emerald-600 px-2.5 py-1 bg-emerald-50 border border-emerald-150 rounded-lg text-[10px] font-bold shrink-0">
                                          <ShieldCheck className="h-3.5 w-3.5" />
                                          Enrolled
                                        </div>
                                        <button
                                          onClick={() => { setEnrollingEmployee(emp); setEnrollPhoto(null); setEnrollSuccessMsg(null);  setEnrollErrorMsg(null);setTimeout(() => {    setupCamera();  }, 100); }}
                                          title="Re-enroll / Re-entry Face Recognition"
                                          className="p-1 px-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 rounded-lg text-[10px] font-bold cursor-pointer transition-colors flex items-center gap-1 font-mono"
                                        >
                                          <RefreshCw className="h-3 w-3" />
                                          Re-enroll
                                        </button>
                                        <button
                                          onClick={() => handleDeleteFaceEnrollment(emp.employeeId)}
                                          title="Delete Face Recognition Profile"
                                          className="p-1.5 bg-red-50 hover:bg-red-100 border border-red-150 text-red-600 rounded-lg cursor-pointer transition-colors"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => {
                                                        setEnrollingEmployee(emp);

                                                        setEnrollPhoto(null);
                                                        setEnrollSuccessMsg(null);
                                                        setEnrollErrorMsg(null);

                                                        setTimeout(() => {
                                                          setupCamera();
                                                        }, 100);
                                                      }}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-100 text-[#1b5dfc] rounded-xl text-[10px] font-bold cursor-pointer transition-colors"
                                      >
                                        <Camera className="h-3.5 w-3.5" />
                                        Register Face
                                      </button>
                                    )}

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
                                        setIsCreateProfileModalOpen(true);
                                      }}
                                      className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl hover:text-slate-800 cursor-pointer"
                                      title="Edit profile parameters"
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                    </button>

                                    <button
                                      onClick={() => handleDeleteEmployee(emp.employeeId)}
                                      className="p-1.5 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 rounded-xl hover:text-red-800 cursor-pointer"
                                      title="Delete staff account"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </td>

                              </tr>
                            );
                          })
                        )}

                      </tbody>
                    </table>
                  </div>

                </div>

                {/* Sub title details section matches mockup 2 bottom structure */}
                <div className="bg-white rounded-3xl border border-slate-100 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 font-mono">
                      STAFF PROFILE ANALYZER
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Check attendance patterns, manage physical card assignments, and modify employee security clear levels in real-time.
                    </p>
                  </div>
                  <div className="text-[11px] font-bold font-mono text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100/40 uppercase">
                    SECURITY ACCESS CODES SECURE
                  </div>
                </div>

              </div>
            )}


            {/* TAB CONTENT B: TODAYS BIOMETRICS PUNCH LOGS */}
            {adminTab === 'logs' && (
              <div className="space-y-4 animate-fade-in">
                
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-extrabold text-[#0c1122]">
                        Today's Biometric Gate Punches
                      </h2>
                      <p className="text-xs text-slate-450 mt-0.5">
                        Historical list of live biometric arrivals, exits & grace constraint anomalies verified today.
                      </p>
                    </div>

                    <button
                      onClick={fetchTodayKioskLogs}
                      className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-650 rounded-xl text-xs font-bold font-mono flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      FETCH TODAY LOGS
                    </button>
                  </div>

                  {/* Log Lists details */}
                  <div className="overflow-x-auto rounded-2xl border border-slate-100">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-[10px] text-slate-500 font-extrabold tracking-widest uppercase">
                          <th className="py-3 px-4">Staff Member</th>
                          <th className="py-3 px-4">Date stamp</th>
                          <th className="py-3 px-4">Arrival check-in</th>
                          <th className="py-3 px-4">Exit check-out</th>
                          <th className="py-3 px-4">Timings status</th>
                          <th className="py-3 px-4 text-right">Audit remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150/40 text-xs text-slate-650 font-medium">
                        {receptionLogs.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-450 font-semibold font-mono">
                              No punches captured in database today. Try clocking-in from landing simulator.
                            </td>
                          </tr>
                        ) : (
                          receptionLogs.map((log, idx) => (
                            <tr key={log.employeeId + '_' + idx} className="hover:bg-slate-50/50">
                              <td className="py-3 px-4 font-extrabold text-slate-900">{log.employeeName}</td>
                              <td className="py-3 px-4 font-mono font-bold leading-none">{log.date}</td>
                              <td className="py-3 px-4 font-sans font-bold text-emerald-600 leading-none">{log.checkIn || '—'}</td>
                              <td className="py-3 px-4 font-sans font-bold text-blue-600 leading-none">{log.checkOut || '—'}</td>
                              <td className="py-3 px-4">
                                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                  log.status === 'Present' ? 'bg-emerald-50 text-emerald-700' :
                                  log.status === 'Late' ? 'bg-amber-50 text-amber-700 font-sans' :
                                  'bg-slate-100 text-slate-600'
                                }`}>
                                  {log.status}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right text-slate-450 font-mono text-[10px] max-w-xs truncate">{log.remarks || 'Standard biometric check.'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                </div>

              </div>
            )}


            {/* TAB CONTENT C: TIMINGS CONFIGURATION */}
            {adminTab === 'config' && (
              <div className="space-y-4 max-w-2xl mx-auto animate-fade-in">
                
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-6">
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">
                      School Timings Configuration
                    </h2>
                    <p className="text-xs text-slate-455 mt-0.5">
                      Configure parameters for standard arrival, checkout, and late grace timings. Backed by remote database rule synchronizations.
                    </p>
                  </div>

                  <div className="space-y-4 text-xs font-semibold text-slate-700">
                    
                    {/* Check In */}
                    <div>
                      <label className="block mb-1.5 uppercase tracking-wider text-[10px] text-slate-400 font-mono">Standard Check-In Time Constraint</label>
                      <input
                        type="text"
                        value={localCheckIn}
                        onChange={(e) => setLocalCheckIn(e.target.value)}
                        placeholder="e.g. 08:30 AM"
                        className="w-full bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    {/* Grace Time */}
                    <div>
                      <label className="block mb-1.5 uppercase tracking-wider text-[10px] text-slate-400 font-mono">Late Alarm Grace Limit</label>
                      <input
                        type="text"
                        value={localGrace}
                        onChange={(e) => setLocalGrace(e.target.value)}
                        placeholder="e.g. 08:45 AM"
                        className="w-full bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="text-[10px] text-slate-450 mt-1 font-mono leading-relaxed">
                        Arriving past this timestamp triggers a biometric "Late Check-In" entry.
                      </p>
                    </div>

                    {/* Check Out */}
                    <div>
                      <label className="block mb-1.5 uppercase tracking-wider text-[10px] text-slate-400 font-mono">Standard Check-Out Time Limit</label>
                      <input
                        type="text"
                        value={localCheckOut}
                        onChange={(e) => setLocalCheckOut(e.target.value)}
                        placeholder="e.g. 04:30 PM"
                        className="w-full bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    {/* inline alerts */}
                    {configSaveSuccess && (
                      <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl flex items-center gap-2">
                        <Check className="h-4.5 w-4.5 text-emerald-600" />
                        <span>Successfully updated timings configuration on the remote database cloud nodes!</span>
                      </div>
                    )}

                    <button
                      onClick={handleSaveTimingConfig}
                      className="w-full py-3 bg-[#1b5dfc] hover:bg-[#134ed2] rounded-xl text-white text-xs font-bold uppercase cursor-pointer transition-colors shadow-sm"
                    >
                      Save Configuration parameters
                    </button>

                  </div>
                </div>

              </div>
            )}

          </main>

        </div>
      )}

      {/* ----------------- 4. PIN PROMPT MODAL DIALOG GUARD ----------------- */}
      {isAdminPinModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center z-50 backdrop-blur-xs p-4 animate-fade-in select-none">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-sm w-full border border-slate-100 shadow-2xl relative space-y-6">
            
            <button
              onClick={() => setIsAdminPinModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-650 cursor-pointer"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            {/* Lock graphics */}
            <div className="flex flex-col items-center justify-center text-center space-y-2">
              <div className="p-3.5 bg-blue-50 text-[#1b5dfc] rounded-[1.25rem] shadow-xs">
                <Lock className="h-6 w-6 stroke-2" />
              </div>
              <h3 className="text-base font-extrabold text-blue-950">
                Administrative Authentication
              </h3>
              <p className="text-xs text-slate-450 leading-relaxed max-w-xs">
                Gaining access to Roster Directory lists and biometric registration parameters requires authorization bypass keys.
              </p>
            </div>

            {/* Input field */}
            <div className="space-y-3 text-xs font-semibold text-slate-700">
              <label className="block uppercase tracking-wider text-[10px] text-slate-400 font-mono">
                ENTER SECRET TERMINAL PIN CODE
              </label>
              <input
                type="password"
                maxLength={8}
                placeholder="••••"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && verifyAdminPinAndEnter()}
                className="w-full bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 outline-none text-center text-lg font-black tracking-widest focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all font-mono"
              />

              {pinError && (
                <p className="text-[10px] text-red-500 font-sans leading-relaxed text-center font-bold">
                  {pinError}
                </p>
              )}

              <button
                onClick={verifyAdminPinAndEnter}
                className="w-full py-3 bg-[#1b5dfc] hover:bg-[#134ed2] rounded-xl text-white text-xs font-bold uppercase cursor-pointer select-none shadow-xs transition-all"
              >
                Authenticate Node Keys
              </button>
            </div>

            <p className="text-[10px] text-slate-400 text-center font-mono uppercase tracking-wider select-none leading-none pt-2 z-max">
              Terminal Access Guarded
            </p>

          </div>
        </div>
      )}

      {/* ----------------- 5. FACE ENROLLMENT SCAN MODAL SCREEN ----------------- */}
      {enrollingEmployee && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in select-none">
          <div className="bg-white border border-slate-200/90 rounded-3xl p-6 max-w-3xl w-full text-slate-800 shadow-2xl relative grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
            
            <button
              onClick={() => setEnrollingEmployee(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 text-slate-400 hover:text-slate-850 hover:bg-slate-200 cursor-pointer border border-slate-200 transition-colors"
              title="Close"
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
                    Align the staff member's face on the active camera capture module to strictly align the biometrics target.
                  </p>
                </div>

                {/* Selected user badge profiles summary */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <UserCog className="h-4 w-4 text-[#1b5dfc]" />
                    <span className="text-slate-500 font-mono text-[9px] font-bold uppercase tracking-wide">Target Staff Profile</span>
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">{enrollingEmployee.name}</h4>
                    <p className="text-[10px] text-slate-600 font-mono mt-0.5">
                      Bio ID: {enrollingEmployee.employeeId} • {enrollingEmployee.designation}
                    </p>
                    <p className="text-[9px] text-slate-500 font-mono">
                      Department: {enrollingEmployee.role}
                    </p>
                  </div>
                </div>

                {/* Strict Quality Parameter Indicators */}
                <div className="space-y-1 p-3 bg-red-50/50 rounded-2xl border border-red-100 text-[10.5px]">
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
                    <UserCheck className="h-4.5 w-4.5" />
                    REGISTER BIOMETRICS
                  </button>
                ) : (
                  <div className="text-[10.5px] p-3 rounded-xl bg-slate-50 text-slate-450 text-center font-mono leading-normal border border-slate-200">
                    Select shutter capture frame (Step 2) to lock in facial values.
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
                    <img src={enrollPhoto} alt="crop" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
                        ref={enrollvideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover opacity-95"
                      />
                    )}

                    {/* Circular target outlines overlay */}
                    <div className="absolute inset-5 border border-dashed border-slate-600 rounded-full flex items-center justify-center pointer-events-none">
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

            </div>

          </div>
        </div>
      )}


      {/* ----------------- 6. CREATE PROFILE MODAL CONTROL OVERLAYS ----------------- */}
      {isCreateProfileModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center z-50 backdrop-blur-xs p-4 animate-fade-in select-none">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full border border-slate-100 shadow-2xl relative space-y-6">
            
            <button
              onClick={() => {
                setIsCreateProfileModalOpen(false);
                setEditingEmployeeId(null);
                setNewEmpId('');
                setNewEmpName('');
                setNewEmpEmail('');
                setNewEmpPhone('');
                setNewEmpDesignation('');
                setNewEmpRole('Teacher');
                setNewEmpSalary(45000);
                setNewEmpPassword('');
                setNewEmpStatus('Active');
              }}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-650 cursor-pointer"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            {/* Form details headers */}
            <div>
              <h3 className="text-base font-extrabold text-[#0c1122]">
                {editingEmployeeId ? 'Edit Employee Profile' : 'New Employee Profile Wizard'}
              </h3>
              <p className="text-xs text-slate-450 mt-0.5 max-w-sm leading-relaxed">
                {editingEmployeeId 
                  ? `Modify credentials, salary parameters and status values for employee: ${editingEmployeeId}`
                  : `Construct live employee directories nodes on institutional database, paving the way for bio registrations.`
                }
              </p>
            </div>

            <form onSubmit={handleSaveEmployeeProfile} className="space-y-4 text-xs font-semibold text-slate-700">
              
              {/* Grid A */}
              <div className="grid grid-cols-2 gap-4">
                
                {/* ID */}
                <div>
                  <label className="block mb-1.5 uppercase tracking-wider text-[9px] text-slate-400 font-mono">Employee ID (Key ID)</label>
                  <input
                    type="text"
                    required
                    placeholder="emp_1234"
                    value={newEmpId}
                    onChange={(e) => setNewEmpId(e.target.value)}
                    disabled={!!editingEmployeeId}
                    className="w-full bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 font-mono disabled:bg-slate-150 disabled:text-slate-505"
                  />
                </div>

                {/* Name */}
                <div>
                  <label className="block mb-1.5 uppercase tracking-wider text-[9px] text-slate-400 font-mono">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Full name string"
                    value={newEmpName}
                    onChange={(e) => setNewEmpName(e.target.value)}
                    className="w-full bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>

              </div>

              {/* Grid B */}
              <div className="grid grid-cols-2 gap-4">
                
                {/* Email */}
                <div>
                  <label className="block mb-1.5 uppercase tracking-wider text-[9px] text-slate-400 font-mono">Staff Email</label>
                  <input
                    type="email"
                    required
                    placeholder="employee@email.com"
                    value={newEmpEmail}
                    onChange={(e) => setNewEmpEmail(e.target.value)}
                    className="w-full bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 animate-none font-mono"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block mb-1.5 uppercase tracking-wider text-[9px] text-slate-400 font-mono">Mobile Contact</label>
                  <input
                    type="text"
                    required
                    placeholder="+91 XXXXX XXXXX"
                    value={newEmpPhone}
                    onChange={(e) => setNewEmpPhone(e.target.value)}
                    className="w-full bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>

              </div>

              {/* Designation role */}
              <div className="grid grid-cols-2 gap-4">
                
                {/* Designation */}
                <div>
                  <label className="block mb-1.5 uppercase tracking-wider text-[9px] text-slate-400 font-mono">Designation Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Senior Lecturer"
                    value={newEmpDesignation}
                    onChange={(e) => setNewEmpDesignation(e.target.value)}
                    className="w-full bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 font-mono text-[11px]"
                  />
                </div>

                {/* Role Level select */}
                <div>
                  <label className="block mb-1.5 uppercase tracking-wider text-[9px] text-slate-400 font-mono">Department Level</label>
                  <select
                    value={newEmpRole}
                    onChange={(e) => setNewEmpRole(e.target.value as any)}
                    className="w-full bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 outline-none focus:bg-white cursor-pointer"
                  >
                    <option value="Teacher">Teacher</option>
                    <option value="Finance">Finance</option>
                    <option value="Principal">Principal</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>

              </div>



              {/* Grid C (Status & Custom Password) */}
              <div className="grid grid-cols-2 gap-4">
                
                {/* Status selection */}
                <div>
                  <label className="block mb-1.5 uppercase tracking-wider text-[9px] text-slate-400 font-mono font-black">Roster Access Status</label>
                  <select
                    value={newEmpStatus}
                    onChange={(e) => setNewEmpStatus(e.target.value as any)}
                    className="w-full bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 outline-none focus:bg-white cursor-pointer font-semibold"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                {/* Private custom profile login password */}
                <div>
                  <label className="block mb-1.5 uppercase tracking-wider text-[9px] text-slate-400 font-mono">Custom Password</label>
                  <input
                    type="text"
                    value={newEmpPassword}
                    onChange={(e) => setNewEmpPassword(e.target.value)}
                    placeholder={editingEmployeeId ? 'Keep current secret' : 'Optional secret key'}
                    className="w-full bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>

              </div>

              {/* Inline dynamic alerts */}
              {profileSuccessMsg && (
                <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl font-mono text-[10px] leading-relaxed select-none">
                  {profileSuccessMsg}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-[#1b5dfc] hover:bg-[#134ed2] text-white rounded-xl text-xs font-bold uppercase cursor-pointer select-none shadow-xs transition-all"
              >
                {editingEmployeeId ? 'Save Profile Changes' : 'Register Employee Record'}
              </button>

            </form>

          </div>
        </div>
      )}


      {/* ----------------- 7. MANUAL ATTENDANCE OVERRIDE MODAL ----------------- */}
      {showManualPunchModal && manualPunchEmployee && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center z-50 backdrop-blur-xs p-4 animate-fade-in select-none">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full border border-slate-100 shadow-2xl relative space-y-6">
            
            <button
              onClick={() => {
                setShowManualPunchModal(false);
                setManualPunchEmployee(null);
                setManualPunchSuccessMsg(null);
                setManualPunchErrorMsg(null);
              }}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-650 cursor-pointer"
            >
              <X className="h-4.5 w-4.5" />
            </button>

            <div>
              <span className="text-[9px] font-mono font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md uppercase">
                Manual Override Desk
              </span>
              <h3 className="text-base font-extrabold text-[#0c1122] mt-2">
                Record Manual Attendance
              </h3>
              <p className="text-xs text-slate-450 mt-0.5 max-w-sm leading-relaxed">
                Manually check in or check out <strong className="text-slate-900">{manualPunchEmployee.name}</strong> for unrecognized face templates, poor camera lighting, or special situations.
              </p>
            </div>

            {/* Profile Brief Info */}
            <div className="p-3 bg-slate-50 border border-slate-150 rounded-2xl flex items-center gap-3">
              <div className="h-10 w-10 bg-blue-100 text-blue-800 rounded-full flex items-center justify-center font-bold text-xs shrink-0">
                {manualPunchEmployee.name.charAt(0).toUpperCase()}
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-slate-900">{manualPunchEmployee.name}</p>
                <p className="text-[10px] text-slate-500 font-mono">
                  ID: {manualPunchEmployee.employeeId} • {manualPunchEmployee.designation}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              
              {/* Punch type toggle */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setManualPunchType('In')}
                  className={`py-2 px-3 text-xs font-bold uppercase rounded-xl border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    manualPunchType === 'In'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-extrabold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Clock-In Arrival
                </button>
                <button
                  type="button"
                  onClick={() => setManualPunchType('Out')}
                  className={`py-2 px-3 text-xs font-bold uppercase rounded-xl border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    manualPunchType === 'Out'
                      ? 'bg-blue-50 border-blue-300 text-blue-800 font-extrabold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Clock-Out Exit
                </button>
              </div>

              {/* Status input */}
              {manualPunchType === 'In' && (
                <div>
                  <label className="block mb-1 text-[10px] text-slate-450 uppercase tracking-wider font-mono font-bold">Attendance Timing Status</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setManualPunchStatus('Present')}
                      className={`py-2 px-3 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                        manualPunchStatus === 'Present'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-extrabold'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Present
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualPunchStatus('Late')}
                      className={`py-2 px-3 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                        manualPunchStatus === 'Late'
                          ? 'bg-amber-50 border-amber-300 text-amber-800 font-extrabold font-sans'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Late Arrival
                    </button>
                  </div>
                </div>
              )}

              {/* Date selection input */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 text-[10px] text-slate-450 uppercase tracking-wider font-mono font-bold">Duty Date</label>
                  <input
                    type="date"
                    value={manualPunchDatePicker}
                    onChange={(e) => setManualPunchDatePicker(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-mono text-slate-800 outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-[10px] text-slate-450 uppercase tracking-wider font-mono font-bold">Exact Time</label>
                  <input
                    type="text"
                    value={manualPunchTime}
                    onChange={(e) => setManualPunchTime(e.target.value)}
                    placeholder="e.g. 08:32 AM"
                    className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-mono text-slate-800 outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Remarks input */}
              <div>
                <label className="block mb-1 text-[10px] text-slate-450 uppercase tracking-wider font-mono font-bold">Audit Remarks / Justification</label>
                <textarea
                  value={manualPunchRemarks}
                  onChange={(e) => setManualPunchRemarks(e.target.value)}
                  placeholder="Record reason (e.g. Face not detected, lighting issue, offline mode override)"
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs text-slate-800 outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 font-sans resize-none"
                />
              </div>

            </div>

            {/* Success and Error Alerts */}
            {manualPunchSuccessMsg && (
              <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl font-mono text-[10px] leading-relaxed">
                {manualPunchSuccessMsg}
              </div>
            )}
            {manualPunchErrorMsg && (
              <div className="p-3 bg-red-50 text-red-800 rounded-xl font-mono text-[10px] leading-relaxed">
                {manualPunchErrorMsg}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowManualPunchModal(false);
                  setManualPunchEmployee(null);
                }}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-705 rounded-xl text-xs font-bold uppercase tracking-wide transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitManualPunching}
                onClick={handleExecuteManualPunch}
                className="flex-1 py-3 bg-[#1b5dfc] hover:bg-[#134ed2] disabled:bg-blue-400 text-white rounded-xl text-xs font-extrabold uppercase tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isSubmitManualPunching ? 'Saving Override...' : 'Record Override'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
