import Mailjet from 'node-mailjet';

const mailjet = new Mailjet({
  apiKey: process.env.MAILJET_API_KEY || '5b0d99f321775b96f2836edbd28e9fd9',
  apiSecret: process.env.MAILJET_SECRET_KEY || 'a1b411cb0d8032437c1bf72c32badb41',
});

// Check sender email verification status (call this once to debug)
export async function checkSenderStatus() {
  try {
    const senderEmail = process.env.MAILJET_SENDER_EMAIL || 'santa@lampbylit.com';
    console.log(`[MailJet] Checking sender status for: ${senderEmail}`);
    
    // Try to get sender info - this will fail if not verified
    const result = await mailjet.get('sender').request({
      Email: senderEmail,
    });
    
    console.log(`[MailJet] Sender status:`, JSON.stringify(result.body, null, 2));
    return result.body;
  } catch (error: any) {
    console.error(`[MailJet] Sender check failed (likely not verified):`, error.message || error);
    if (error.response) {
      console.error(`[MailJet] Error response:`, JSON.stringify(error.response.body, null, 2));
    }
    return null;
  }
}

export async function sendAssignmentEmail(
  toEmail: string,
  santaName: string,
  santeeName: string,
  santeeAddress: string,
  santeeMessage: string,
  groupUrl: string
) {
  try {
    console.log(`[MailJet] Sending assignment email to ${toEmail}...`);
    console.log(`[MailJet] Sender: ${process.env.MAILJET_SENDER_EMAIL || 'santa@lampbylit.com'}`);
    console.log(`[MailJet] Group URL: ${groupUrl}`);
    
    const result = await mailjet.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: {
            Email: process.env.MAILJET_SENDER_EMAIL || 'santa@lampbylit.com',
            Name: 'Secret Santa',
          },
          To: [
            {
              Email: toEmail,
              Name: santaName,
            },
          ],
          Subject: 'Your Secret Santa Assignment',
          TextPart: `Hello ${santaName}!

Your Secret Santa assignment is:

Name: ${santeeName}
Address: ${santeeAddress}
Message: ${santeeMessage}

View your group: https://secretestsanta.up.railway.app/group/${groupUrl}`,
          HTMLPart: `
            <h2>Hello ${santaName}!</h2>
            <p>Your Secret Santa assignment is:</p>
            <ul>
              <li><strong>Name:</strong> ${santeeName}</li>
              <li><strong>Address:</strong> ${santeeAddress}</li>
              <li><strong>Message:</strong> ${santeeMessage}</li>
            </ul>
            <p><a href="https://secretestsanta.up.railway.app/group/${groupUrl}">View your group</a></p>
          `,
        },
      ],
    });

    console.log(`[MailJet] Email sent successfully. Response:`, JSON.stringify(result.body, null, 2));
    
    // Extract MessageID for tracking
    const messageId = result.body?.Messages?.[0]?.To?.[0]?.MessageID;
    const messageUUID = result.body?.Messages?.[0]?.To?.[0]?.MessageUUID;
    
    if (messageId) {
      console.log(`[MailJet] MessageID: ${messageId}, UUID: ${messageUUID}`);
      console.log(`[MailJet] Check delivery status at: https://app.mailjet.com/statistics/message/${messageId}`);
    }
    
    // Note: MailJet "success" means the email was accepted, not necessarily delivered
    // Common issues:
    // 1. Sender email not verified in MailJet (Account Settings → Sender & Domains)
    // 2. MailJet sandbox mode (free tier) - check account status
    // 3. SPF/DKIM not configured for domain
    
    return result;
  } catch (error: any) {
    console.error(`[MailJet] Error sending email to ${toEmail}:`, error.message || error);
    console.error(`[MailJet] Error details:`, error);
    if (error.response) {
      console.error(`[MailJet] Error response:`, JSON.stringify(error.response.body, null, 2));
    }
    throw error;
  }
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetToken: string,
  groupUrl: string
) {
  try {
    const resetUrl = `https://secretestsanta.up.railway.app/group/${groupUrl}/reset?token=${resetToken}`;
    
    const result = await mailjet.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: {
            Email: process.env.MAILJET_SENDER_EMAIL || 'santa@lampbylit.com',
            Name: 'Secret Santa',
          },
          To: [
            {
              Email: toEmail,
            },
          ],
          Subject: 'Reset Your Secret Santa Password',
          TextPart: `You requested to reset your password.

Click this link to reset your password: ${resetUrl}

This link will expire in 1 hour.

If you didn't request this, please ignore this email.`,
          HTMLPart: `
            <p>You requested to reset your password.</p>
            <p><a href="${resetUrl}">Click here to reset your password</a></p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
          `,
        },
      ],
    });

    return result;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
}

