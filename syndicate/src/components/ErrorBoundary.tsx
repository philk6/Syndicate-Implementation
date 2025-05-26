'use client';

import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen bg-[#14130F] p-6 flex items-center justify-center">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-6 max-w-md mx-4 text-center">
            <h2 className="text-white font-medium mb-4">Something went wrong</h2>
            <p className="text-gray-400 text-sm mb-4">
              The application encountered an error. This might be due to a network issue or tab switching.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-[#c8aa64] text-black px-4 py-2 rounded hover:bg-[#b8996b] transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
} 