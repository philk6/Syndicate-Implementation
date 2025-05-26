export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-[#14130F] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-[#bfbfbf] mb-4">Unauthorized</h1>
        <p className="text-gray-400 mb-6">You don&apos;t have permission to access this page.</p>
        <a 
          href="/dashboard" 
          className="bg-[#c8aa64] hover:bg-[#9d864e] text-[#242424] px-4 py-2 rounded"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
} 