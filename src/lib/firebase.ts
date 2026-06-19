/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDocs, 
  setDoc,
  getDocFromServer,
  query,
  where,
  limit
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Employee, Attendance, LeaveRequest, SupportQuery, SchoolConfig } from '../types';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

/**
 * Handle Firestore errors according to specifications.
 */
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: 'anonymous_or_custom_auth_user',
      email: 'user@srisahasra.edu'
    },
    operationType,
    path
  };
  console.error('Firestore Error Details: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Validate connection to Firestore.
 */
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'config', 'school_timings'));
    console.log('Firebase connection healthy.');
  } catch (error) {
    console.warn('Firebase config test ran. Might be first run, which is fine.', error);
  }
}

// Predefined demo credentials for school staff
export const SEED_EMPLOYEES: Employee[] = [
  {
    employeeId: 'emp_reception',
    name: 'Reception Desk',
    email: 'reception@srisahasra.edu',
    role: 'Reception',
    salary: 32000,
    designation: 'Receptionist & Kiosk Operator',
    phone: '9848098765',
    status: 'Active'
  },
  {
    employeeId: 'emp_admin',
    name: 'Swathi Reddy',
    email: 'admin@srisahasra.edu',
    role: 'Admin',
    salary: 68000,
    designation: 'Systems Administrator',
    phone: '9848012345',
    status: 'Active'
  },
  {
    employeeId: 'emp_prasad',
    name: 'Dr. M. V. Prasad',
    email: 'principal@srisahasra.edu',
    role: 'Principal',
    salary: 95000,
    designation: 'School Principal',
    phone: '9848054321',
    status: 'Active'
  },
  {
    employeeId: 'emp_lakshmi',
    name: 'G. Lakshmi',
    email: 'finance@srisahasra.edu',
    role: 'Finance',
    salary: 58000,
    designation: 'Finance & Accounts Officer',
    phone: '9848024680',
    status: 'Active'
  },
  {
    employeeId: 'emp_rajesh',
    name: 'Rajesh Kumar',
    email: 'teacher.rajesh@srisahasra.edu',
    role: 'Teacher',
    salary: 45000,
    designation: 'Senior Mathematics Teacher',
    phone: '9440123456',
    status: 'Active'
  },
  {
    employeeId: 'emp_anjali',
    name: 'Anjali Sharma',
    email: 'teacher.anjali@srisahasra.edu',
    role: 'Teacher',
    salary: 43000,
    designation: 'Science Teacher',
    phone: '9440654321',
    status: 'Active'
  },
  {
    employeeId: 'emp_srinivas',
    name: 'K. Srinivas Rao',
    email: 'teacher.srinivas@srisahasra.edu',
    role: 'Teacher',
    salary: 41000,
    designation: 'Social Studies Teacher',
    phone: '9123456780',
    status: 'Active'
  }
];

export const SEED_LEAVES: LeaveRequest[] = [
  {
    employeeId: 'emp_rajesh',
    employeeName: 'Rajesh Kumar',
    role: 'Teacher',
    startDate: '2026-06-10',
    endDate: '2026-06-11',
    leaveType: 'Casual Leave',
    reason: 'Personal work in native town.',
    status: 'Pending',
    appliedAt: '2026-06-03 10:20 AM'
  },
  {
    employeeId: 'emp_anjali',
    employeeName: 'Anjali Sharma',
    role: 'Teacher',
    startDate: '2026-05-15',
    endDate: '2026-05-18',
    leaveType: 'Sick Leave',
    reason: 'Severe high viral fever and advised throat rest.',
    status: 'Approved',
    appliedAt: '2026-05-14 08:30 AM',
    approvedBy: 'Dr. M. V. Prasad (Principal)',
    comments: 'Approved. Health is first priority. Take rest.'
  },
  {
    employeeId: 'emp_lakshmi',
    employeeName: 'G. Lakshmi',
    role: 'Finance',
    startDate: '2026-06-22',
    endDate: '2026-06-23',
    leaveType: 'Earned Leave',
    reason: 'Family wedding attendance.',
    status: 'Pending',
    appliedAt: '2026-06-02 04:45 PM'
  }
];

export const SEED_QUERIES: SupportQuery[] = [
  {
    employeeId: 'emp_rajesh',
    employeeName: 'Rajesh Kumar',
    subject: 'Classroom Smart-Board Issue',
    description: 'The smart-board in Class XI-A Section is experiencing periodic visual screen flickering during morning lecture hours.',
    status: 'Open',
    createdAt: '2026-06-03 09:15 AM'
  },
  {
    employeeId: 'emp_anjali',
    employeeName: 'Anjali Sharma',
    subject: 'Lab Chemicals Supply Refresh',
    description: 'Requesting restocking of basic science lab reagents (HCl, NaOH) as the high school final semester practicals start next fortnight.',
    status: 'Resolved',
    createdAt: '2026-05-28 11:00 AM',
    resolvedAt: '2026-05-30 03:20 PM',
    resolvedBy: 'Swathi Reddy (Admin)',
    response: 'Supplies ordered and stocked in lab storage room cupboard B.'
  }
];

export const SEED_CONFIG: SchoolConfig = {
  checkInTime: '08:30 AM',
  checkOutTime: '04:30 PM',
  graceTime: '08:45 AM'
};

/**
 * Intelligent seeding function.
 * Check of database has existing items. If empty, sync definitions and seed 14 days of realistic attendance history.
 */
export async function seedDatabaseIfEmpty() {
  const employeesColPath = 'employees';
  try {
    const employeeSnap = await getDocs(query(collection(db, employeesColPath), limit(1)));
    if (employeeSnap.empty) {
      console.log('Database empty! Starting seed operation for Sri Sahasra Vidhyanikethan...');
      
      // 1. Seed Config
      await setDoc(doc(db, 'config', 'school_timings'), SEED_CONFIG);
      
      // 2. Seed Employees
      for (const emp of SEED_EMPLOYEES) {
        await setDoc(doc(db, 'employees', emp.employeeId), emp);
      }

      // 3. Seed Leaves
      let leaveIdx = 1;
      for (const leave of SEED_LEAVES) {
        await setDoc(doc(db, 'leaves', `leave_00${leaveIdx++}`), leave);
      }

      // 4. Seed Queries
      let queryIdx = 1;
      for (const q of SEED_QUERIES) {
        await setDoc(doc(db, 'queries', `query_00${queryIdx++}`), q);
      }

      // 5. Seed Attendance histories for the last 15 days
      // Let's create actual calendars days
      const days = [
        '2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22',
        '2026-05-25', '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29',
        '2026-06-01', '2026-06-02', '2026-06-03'
      ];

      for (const day of days) {
        for (const emp of SEED_EMPLOYEES) {
          // Skip checkins for admins or principals if we want, but letting everyone check in is gorgeous.
          // Provide various statuses
          let status: 'Present' | 'Absent' | 'Late' | 'Leave' = 'Present';
          let checkIn = '08:23 AM';
          let checkOut = '04:35 PM';
          const rand = Math.random();

          if (rand < 0.05) {
            status = 'Absent';
            checkIn = '';
            checkOut = '';
          } else if (rand < 0.15) {
            status = 'Late';
            checkIn = '08:52 AM';
          } else if (rand < 0.18) {
            status = 'Leave';
            checkIn = '';
            checkOut = '';
          }

          const record: Attendance = {
            employeeId: emp.employeeId,
            employeeName: emp.name,
            date: day,
            status,
            checkIn: checkIn || undefined,
            checkOut: checkOut || undefined,
            remarks: status === 'Late' ? 'Heavy traffic near crossroads' : status === 'Leave' ? 'Approved Casual Leave' : ''
          };

          const docId = `${emp.employeeId}_${day}`;
          await setDoc(doc(db, 'attendance', docId), record);
        }
      }
      
      console.log('Seeding finished successfully.');
    }
  } catch (error) {
    console.error('Failed to seed database, checking error', error);
  }
}

testConnection();
