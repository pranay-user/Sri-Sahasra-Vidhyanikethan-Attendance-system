/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { LogIn, Key, Mail, ShieldAlert, Award, CreditCard, User, GraduationCap, Scan } from 'lucide-react';
import { Employee } from '../types';
import { SEED_EMPLOYEES, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

interface LoginProps {
  onLoginSuccess: (employee: Employee) => void;
  onEnterKiosk?: () => void;
}

export default function Login({ onLoginSuccess, onEnterKiosk }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all standard credentials.');
      return;
    }

    setLoading(true);
    setError(null);

    const checkEmail = email.toLowerCase().trim();
    const colPr = 'employees';

    try {
      // Try to find the user in the live Firestore employees collection
      const q = query(
        collection(db, colPr),
        where('email', '==', checkEmail),
        limit(1)
      );
      const snap = await getDocs(q);

      let match: Employee | undefined;

      if (!snap.empty) {
        match = snap.docs[0].data() as Employee;
      } else {
        // Fallback to SEED_EMPLOYEES list in case Firestore hasn't seeded or user uses quick log
        match = SEED_EMPLOYEES.find(
          (emp) => emp.email.toLowerCase() === checkEmail
        );
      }

      if (match) {
        // Enforce custom password if configured, else fallback to standard defaults
        const expectedRolePassword = match.role.toLowerCase() + '123';
        const hasCustomPassword = !!match.password;
        
        let isCorrectPassword = false;
        if (hasCustomPassword) {
          isCorrectPassword = password === match.password;
        } else {
          isCorrectPassword = 
            password === expectedRolePassword ||
            password === 'admin123' ||
            password === 'teacher123' ||
            password === 'finance123' ||
            password === 'principal123';
        }

        if (isCorrectPassword) {
          setError(null);
          onLoginSuccess(match);
        } else {
          if (hasCustomPassword) {
            setError('Incorrect security password.');
          } else if (match.role === 'Reception') {
            setError('Incorrect security password.');
          } else {
            setError(`Incorrect security password. (Hint: use "${expectedRolePassword}" for this account)`);
          }
        }
      } else {
        setError('The email is not registered at Sri Sahasra Vidhyanikethan.');
      }
    } catch (err) {
      console.warn('Logging check fell back to static resources.', err);
      // Fallback check on static elements if Firestore is offline
      const fallbackMatch = SEED_EMPLOYEES.find(
        (emp) => emp.email.toLowerCase() === checkEmail
      );
      if (fallbackMatch) {
         const expectedRolePassword = fallbackMatch.role.toLowerCase() + '123';
         const isCorrectPassword = 
           password === fallbackMatch.password || 
           password === expectedRolePassword || 
           password === 'admin123' || 
           password === 'teacher123' ||
           password === 'finance123' ||
           password === 'principal123';
         if (isCorrectPassword) {
           setError(null);
           onLoginSuccess(fallbackMatch);
           return;
         }
      }
      setError('Connection to remote credentials server failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (role: string) => {
    let targetEmail = '';
    let targetPass = '';

    switch (role) {
      case 'Teacher':
        targetEmail = 'teacher.rajesh@srisahasra.edu';
        targetPass = 'teacher123';
        break;
      case 'Finance':
        targetEmail = 'finance@srisahasra.edu';
        targetPass = 'finance123';
        break;
      case 'Principal':
        targetEmail = 'principal@srisahasra.edu';
        targetPass = 'principal123';
        break;
      case 'Admin':
        targetEmail = 'admin@srisahasra.edu';
        targetPass = 'admin123';
        break;
    }

    setEmail(targetEmail);
    setPassword(targetPass);
    setError(null);

    const match = SEED_EMPLOYEES.find((emp) => emp.email === targetEmail);
    if (match) {
      onLoginSuccess(match);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between" id="login_container">
      {/* Decorative Top Accent Bar */}
      <div className="h-2 bg-gradient-to-r from-blue-900 via-amber-500 to-amber-600 w-full"></div>

      {/* Main Login Card Section */}
      <div className="flex-grow flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden" id="login_card">
          <div className="px-6 pt-10 pb-6 text-center bg-slate-900 text-white relative">
            <div className="absolute top-4 right-4 bg-amber-500/10 text-amber-400 px-2 py-1 text-[10px] font-mono tracking-wider uppercase rounded border border-amber-500/25">
              Secure Staff Portal
            </div>
            
            <div className="mx-auto w-16 h-16 bg-amber-500 rounded-full flex items-center justify-center shadow-lg mb-4">
              <GraduationCap className="h-9 w-9 text-slate-950 stroke-2" />
            </div>
            
            <h1 className="text-xl font-bold tracking-tight font-sans text-amber-400">
              SRI SAHASRA VIDHYANIKETHAN
            </h1>
            <p className="text-xs text-slate-300 tracking-wide mt-1">
              Management & Operations Portal
            </p>
          </div>

          <div className="p-8">
            {error && (
              <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start gap-2.5" id="login_error">
                <ShieldAlert className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5" id="login_form">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Staff Email ID
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                  <input
                    id="login_email_input"
                    type="email"
                    placeholder="employee@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Security Passkey
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                  <input
                    id="login_password_input"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent transition-all"
                    required
                  />
                </div>
              </div>

              <button
                id="login_btn"
                type="submit"
                disabled={loading}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-4 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer mt-2 disabled:opacity-50"
              >
                <LogIn className="h-4 w-4" />
                {loading ? 'Authenticating Staff...' : 'Sign In to Accounts'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Footer Branding */}
      <div className="py-6 px-4 bg-slate-100 border-t border-slate-200/50 text-center">
        <p className="text-xs text-slate-500 font-sans">
          © 2026 Sri Sahasra Vidhyanikethan. All staff data is strictly confidential and protected by security rules.
        </p>
      </div>
    </div>
  );
}
