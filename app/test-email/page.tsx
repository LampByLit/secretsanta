'use client';

import { useState } from 'react';

export default function TestEmailPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handleTest = async () => {
    if (!email) {
      setError('Please enter an email address');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail: email }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send test email');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to send test email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">Test Email Delivery</h1>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address to Test
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="test@example.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <button
            onClick={handleTest}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send Test Email'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {result && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Test Results</h2>
            
            <div className="space-y-2 mb-4">
              <div>
                <strong>Success:</strong> {result.success ? '✅ Yes' : '❌ No'}
              </div>
              {result.messageId && (
                <div>
                  <strong>MessageID:</strong> {result.messageId}
                </div>
              )}
              {result.dashboardUrl && (
                <div>
                  <strong>Dashboard:</strong>{' '}
                  <a href={result.dashboardUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {result.dashboardUrl}
                  </a>
                </div>
              )}
              {result.note && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                  <strong>Note:</strong> {result.note}
                </div>
              )}
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer font-semibold text-gray-700">Full Response</summary>
              <pre className="mt-2 p-4 bg-gray-100 rounded overflow-auto text-xs">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </main>
  );
}

