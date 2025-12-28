import { NextRequest, NextResponse } from 'next/server';
import { checkSenderStatus } from '@/lib/email/mailjet';

export async function GET(request: NextRequest) {
  try {
    const senderStatus = await checkSenderStatus();
    
    return NextResponse.json({
      success: true,
      senderStatus,
      message: senderStatus 
        ? 'Sender email is verified in MailJet'
        : 'Sender email is NOT verified - emails will be accepted but not delivered',
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to check sender status',
    }, { status: 500 });
  }
}

