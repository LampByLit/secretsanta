import { NextRequest, NextResponse } from 'next/server';
import { sendAssignmentEmail } from '@/lib/email/mailjet';
import Mailjet from 'node-mailjet';

const mailjet = new Mailjet({
  apiKey: process.env.MAILJET_API_KEY || '5b0d99f321775b96f2836edbd28e9fd9',
  apiSecret: process.env.MAILJET_SECRET_KEY || 'a1b411cb0d8032437c1bf72c32badb41',
});

export async function POST(request: NextRequest) {
  try {
    const { toEmail } = await request.json();
    
    if (!toEmail) {
      return NextResponse.json(
        { error: 'toEmail required' },
        { status: 400 }
      );
    }

    console.log(`[Test Email] Sending test email to ${toEmail}...`);
    
    // Send test email
    const result = await sendAssignmentEmail(
      toEmail,
      'Test Santa',
      'Test Recipient',
      '123 Test Street, Test City, TS 12345',
      'This is a test message from Secret Santa!',
      'test-group-123'
    );

    const body = result.body as any;
    const messageId = body?.Messages?.[0]?.To?.[0]?.MessageID;
    
    if (!messageId) {
      return NextResponse.json({
        success: false,
        error: 'No MessageID returned from MailJet',
        response: body,
      });
    }

    // Wait a moment for MailJet to process
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check message status via MailJet API
    try {
      const statusResult = await mailjet.get('message').request({
        ID: messageId,
      });
      
      const statusBody = statusResult.body as any;
      const messageStatus = statusBody?.Data?.[0];
      
      return NextResponse.json({
        success: true,
        messageId,
        mailjetResponse: body,
        deliveryStatus: messageStatus || 'Status check failed',
        dashboardUrl: `https://app.mailjet.com/statistics/message/${messageId}`,
        note: 'Check the deliveryStatus field above. If Status is "sent" but email not received, sender email likely not verified.',
      });
    } catch (statusError: any) {
      // Status check might fail, but email was sent
      return NextResponse.json({
        success: true,
        messageId,
        mailjetResponse: body,
        statusCheckError: statusError.message,
        dashboardUrl: `https://app.mailjet.com/statistics/message/${messageId}`,
        note: 'Email sent. Check dashboard URL above for delivery status.',
      });
    }
  } catch (error: any) {
    console.error('[Test Email] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to send test email',
      details: error,
    }, { status: 500 });
  }
}

