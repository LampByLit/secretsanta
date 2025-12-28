import Mailjet from 'node-mailjet';

const mailjet = new Mailjet({
  apiKey: process.env.MAILJET_API_KEY || '5b0d99f321775b96f2836edbd28e9fd9',
  apiSecret: process.env.MAILJET_SECRET_KEY || 'a1b411cb0d8032437c1bf72c32badb41',
});

export async function sendAssignmentEmail(
  toEmail: string,
  santaName: string,
  santeeName: string,
  santeeAddress: string,
  santeeMessage: string,
  groupUrl: string
) {
  try {
    const result = await mailjet.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: {
            Email: process.env.MAILJET_SENDER_EMAIL || 'noreply@secretsanta.app',
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

View your group: ${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/group/${groupUrl}

Happy gifting!`,
          HTMLPart: `
            <h2>Hello ${santaName}!</h2>
            <p>Your Secret Santa assignment is:</p>
            <ul>
              <li><strong>Name:</strong> ${santeeName}</li>
              <li><strong>Address:</strong> ${santeeAddress}</li>
              <li><strong>Message:</strong> ${santeeMessage}</li>
            </ul>
            <p><a href="${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/group/${groupUrl}">View your group</a></p>
            <p>Happy gifting!</p>
          `,
        },
      ],
    });

    return result;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetToken: string,
  groupUrl: string
) {
  try {
    const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/group/${groupUrl}/reset?token=${resetToken}`;
    
    const result = await mailjet.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: {
            Email: process.env.MAILJET_SENDER_EMAIL || 'noreply@secretsanta.app',
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

