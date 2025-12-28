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
            
            <div className="space-y-3 mb-4">
              <div>
                <strong>Success:</strong> {result.success ? '✅ Yes' : '❌ No'}
              </div>
              
              {result.diagnosis && (
                <div className={`p-4 rounded-lg ${
                  result.diagnosis.includes('❌') ? 'bg-red-50 border border-red-200 text-red-800' :
                  result.diagnosis.includes('✅') ? 'bg-green-50 border border-green-200 text-green-800' :
                  'bg-yellow-50 border border-yellow-200 text-yellow-800'
                }`}>
                  <strong>Diagnosis:</strong> {result.diagnosis}
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <strong>Sender Email:</strong> {result.senderEmail || 'N/A'}
                </div>
                <div>
                  <strong>Sender Verified:</strong> {result.senderVerified ? '✅ Yes' : '❌ No'}
                </div>
              </div>
              
              {result.senderError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm">
                  <strong>Sender Error:</strong> {result.senderError}
                </div>
              )}
              
              {result.messageId && (
                <div>
                  <strong>MessageID:</strong> {result.messageId}
                </div>
              )}
              
              {result.messageStatus && (
                <div className="p-3 bg-gray-100 rounded">
                  <strong>Message Status:</strong>
                  <pre className="mt-2 text-xs overflow-auto">
                    {JSON.stringify(result.messageStatus, null, 2)}
                  </pre>
                </div>
              )}
              
              <div className="flex gap-4">
                {result.dashboardUrl && (
                  <a href={result.dashboardUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    View Message in MailJet →
                  </a>
                )}
                {result.senderDashboardUrl && !result.senderVerified && (
                  <a href={result.senderDashboardUrl} target="_blank" rel="noopener noreferrer" className="text-red-600 hover:underline font-bold">
                    ⚠️ Verify Sender Email →
                  </a>
                )}
              </div>
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

