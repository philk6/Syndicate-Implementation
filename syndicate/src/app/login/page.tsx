'use client';

import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [message, setMessage] = useState('');
  const { login } = useAuth();

  const handleLogin = async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      setMessage(error?.message || 'Invalid email or password');
      return;
    }

    login(data.session.access_token); // Use context login
    setMessage('Login successful! Redirecting...');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#080808] p-4">
      <img src="/syndicate_logo.jpeg" alt="Logo" className="w-32 h-auto mb-4" />
      <h1 className="text-2xl font-bold text-[#bfbfbf] text-center mb-6">Sign in to your account</h1>
      <div className="card">
        <div className="">
          <h3 className="input-label">Email</h3>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input mb-4"
          />
          <h3 className="input-label">Password</h3>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input mb-6"
          />
          <div className="flex justify-between items-center text-sm text-[#bfbfbf] mb-6">
            <label className="flex items-center">
            <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="mr-2 h-4 w-4 text-[#c8aa64] bg-gray-700 border-gray-600 rounded focus:ring-[#c8aa64]"
              />
              <span>Remember Me</span>
            </label>
            <p>
              <a href="/signup" className="text-[#c8aa64] hover:text-[#c7b17f] font-bold">
                Forgot Password?
              </a>
            </p>
          </div>
          <button
            onClick={handleLogin}
            className="button"
          >
            Login
          </button>
          <p className="text-center text-sm text-[#bfbfbf]">
            Don't have an account?{' '}
            <a href="/signup" className="text-[#c8aa64] hover:text-[#d3bb82] underline">
              Sign Up
            </a>
          </p>
          {message && (
            <p
              className={`text-center text-sm ${
                message.includes('successful') ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}