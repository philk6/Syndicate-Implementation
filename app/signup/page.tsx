'use client';

import { Amplify } from 'aws-amplify';
import { signUp } from 'aws-amplify/auth';
import { useState } from 'react';
import awsconfig from '../../amplify_outputs.json';

Amplify.configure(awsconfig);

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const valid = true; // Mock until Day 4
      if (!valid) throw new Error('Invalid invite code');

      const result = await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            given_name: firstName,
            family_name: lastName,
            'custom:role': 'User',
            'custom:company_id': '1',
          },
        },
      });
      console.log('Signup successful:', result);
      alert('Check your email for verification.');
    } catch (error) {
      console.error('Signup error:', error);
      alert('Signup failed: ' + (error as Error).message);
    }
  };

  return (
    <form onSubmit={handleSignup} className="p-4 max-w-md mx-auto">
      <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First Name" className="border p-2 mb-2 w-full" />
      <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last Name" className="border p-2 mb-2 w-full" />
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="border p-2 mb-2 w-full" />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="border p-2 mb-2 w-full" />
      <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="Invite Code" className="border p-2 mb-2 w-full" />
      <button type="submit" className="bg-blue-500 text-white p-2 w-full">Sign Up</button>
    </form>
  );
}