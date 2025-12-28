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

    // Check sender verification status
    const senderEmail = process.env.MAILJET_SENDER_EMAIL || 'santa@lampbylit.com';
    let senderVerified = false;
    let senderError = null;
    
    try {
      const senderResult = await mailjet.get('sender').request({
        Email: senderEmail,
      });
      senderVerified = true;
      console.log(`[Test Email] Sender ${senderEmail} is verified`);
    } catch (senderCheckError: any) {
      senderVerified = false;
      senderError = senderCheckError.message || 'Sender not found/verified';
      console.log(`[Test Email] Sender ${senderEmail} is NOT verified: ${senderError}`);
    }

    // Wait a moment for MailJet to process
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check message status via MailJet API
    let messageStatus = null;
    let statusError = null;
    
    try {
      const statusResult = await mailjet.get('message').request({
        ID: messageId,
      });
      
      const statusBody = statusResult.body as any;
      messageStatus = statusBody?.Data?.[0];
      console.log(`[Test Email] Message status:`, JSON.stringify(messageStatus, null, 2));
    } catch (err: any) {
      statusError = err.message || 'Failed to check message status';
      console.log(`[Test Email] Status check error:`, statusError);
    }
    
    // Determine the issue
    let diagnosis = '';
    if (!senderVerified) {
      diagnosis = `❌ SENDER EMAIL NOT VERIFIED: ${senderEmail} is not verified in MailJet. Emails will be accepted but NOT delivered. Go to https://app.mailjet.com/account/sender to verify it.`;
    } else if (messageStatus) {
      const state = messageStatus.State || messageStatus.Status;
      if (state === 'sent' || state === 'opened') {
        diagnosis = `✅ Email appears to be delivered (State: ${state}). Check spam folder or wait a few minutes.`;
      } else if (state === 'bounced' || state === 'blocked') {
        diagnosis = `❌ Email ${state}. Check MailJet dashboard for details.`;
      } else {
        diagnosis = `⚠️ Email status: ${state}. Check MailJet dashboard.`;
      }
    } else {
      diagnosis = `⚠️ Could not check message status. Check MailJet dashboard manually.`;
    }
    
    return NextResponse.json({
      success: true,
      messageId,
      senderEmail,
      senderVerified,
      senderError,
      mailjetResponse: body,
      messageStatus,
      statusError,
      dashboardUrl: `https://app.mailjet.com/statistics/message/${messageId}`,
      senderDashboardUrl: `https://app.mailjet.com/account/sender`,
      diagnosis,
    });
  } catch (error: any) {
    console.error('[Test Email] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to send test email',
      details: error,
    }, { status: 500 });
  }
}

