/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'Teacher' | 'Finance' | 'Principal' | 'Admin' | 'Reception';

export interface Employee {
  employeeId: string;
  name: string;
  email: string;
  role: UserRole;
  salary: number;
  designation: string;
  phone: string;
  status: 'Active' | 'Inactive';
  password?: string;
}

export interface Attendance {
  id?: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  status: 'Present' | 'Absent' | 'Late' | 'Leave';
  checkIn?: string;
  checkOut?: string;
  remarks?: string;
}

export interface LeaveRequest {
  id?: string;
  employeeId: string;
  employeeName: string;
  role: string;
  startDate: string;
  endDate: string;
  leaveType: 'Sick Leave' | 'Casual Leave' | 'Maternity Leave' | 'Earned Leave';
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  appliedAt: string;
  approvedBy?: string;
  comments?: string;
}

export interface SupportQuery {
  id?: string;
  employeeId: string;
  employeeName: string;
  subject: string;
  description: string;
  status: 'Open' | 'Resolved';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  response?: string;
}

export interface SchoolConfig {
  checkInTime: string; // e.g. "08:30 AM"
  checkOutTime: string; // e.g. "16:30"
  graceTime: string; // e.g. "08:45 AM"
}

export interface Holiday {
  id?: string;
  date: string; // YYYY-MM-DD
  title: string;
}

export interface EnrolledFace {
  employeeId: string;
  name: string;
  photoUrl: string;
  enrolledAt: string;
}

