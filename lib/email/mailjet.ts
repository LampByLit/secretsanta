import Mailjet from 'node-mailjet';
import { sanitizeEmailText, sanitizeEmailAddress } from '@/lib/utils/sanitize';
// Environment validation happens automatically via import in db/client.ts
import '@/lib/utils/env';

const mailjet = new Mailjet({
  apiKey: process.env.MAILJET_API_KEY!,
  apiSecret: process.env.MAILJET_SECRET_KEY!,
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
    // Sanitize all user-provided content
    const sanitizedToEmail = sanitizeEmailAddress(toEmail);
    const sanitizedSantaName = sanitizeEmailText(santaName);
    const sanitizedSanteeName = sanitizeEmailText(santeeName);
    const sanitizedSanteeAddress = sanitizeEmailText(santeeAddress);
    const sanitizedSanteeMessage = sanitizeEmailText(santeeMessage);
    const sanitizedGroupUrl = sanitizeEmailText(groupUrl);
    
    // Ensure we use the correct Railway URL (not lampbylit.com)
    const envBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    const baseUrl = (envBaseUrl && !envBaseUrl.includes('lampbylit.com')) 
      ? envBaseUrl 
      : 'https://secretestsanta.up.railway.app';
    const groupLink = `${baseUrl}/group/${sanitizedGroupUrl}`;
    
    const result = await mailjet.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: {
            Email: process.env.MAILJET_SENDER_EMAIL!,
            Name: 'Secret Santa',
          },
          To: [
            {
              Email: sanitizedToEmail,
              Name: sanitizedSantaName,
            },
          ],
          Subject: 'Your Secret Santa Assignment',
          TextPart: `Hello ${sanitizedSantaName}!

Your Secret Santa assignment is:

Name: ${sanitizedSanteeName}
Address: ${sanitizedSanteeAddress}
Message: ${sanitizedSanteeMessage}

View your group: ${groupLink}`,
          HTMLPart: `
            <h2>Hello ${sanitizedSantaName}!</h2>
            <p>Your Secret Santa assignment is:</p>
            <ul>
              <li><strong>Name:</strong> ${sanitizedSanteeName}</li>
              <li><strong>Address:</strong> ${sanitizedSanteeAddress}</li>
              <li><strong>Message:</strong> ${sanitizedSanteeMessage}</li>
            </ul>
            <p><a href="${groupLink}">View your group</a></p>
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
    // Sanitize user-provided content
    const sanitizedToEmail = sanitizeEmailAddress(toEmail);
    const sanitizedGroupUrl = sanitizeEmailText(groupUrl);
    
    // Ensure we use the correct Railway URL (not lampbylit.com)
    const envBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    const baseUrl = (envBaseUrl && !envBaseUrl.includes('lampbylit.com')) 
      ? envBaseUrl 
      : 'https://secretestsanta.up.railway.app';
    const resetUrl = `${baseUrl}/group/${sanitizedGroupUrl}/reset?token=${resetToken}`;
    
    const result = await mailjet.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: {
            Email: process.env.MAILJET_SENDER_EMAIL!,
            Name: 'Secret Santa',
          },
          To: [
            {
              Email: sanitizedToEmail,
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

export async function sendGroupClosedEmail(
  toEmail: string,
  memberName: string,
  groupUrl: string
) {
  try {
    // Sanitize user-provided content
    const sanitizedToEmail = sanitizeEmailAddress(toEmail);
    const sanitizedMemberName = sanitizeEmailText(memberName);
    const sanitizedGroupUrl = sanitizeEmailText(groupUrl);
    
    // Ensure we use the correct Railway URL (not lampbylit.com)
    const envBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    const baseUrl = (envBaseUrl && !envBaseUrl.includes('lampbylit.com')) 
      ? envBaseUrl 
      : 'https://secretestsanta.up.railway.app';
    const groupLink = `${baseUrl}/group/${sanitizedGroupUrl}`;
    
    const result = await mailjet.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: {
            Email: process.env.MAILJET_SENDER_EMAIL!,
            Name: 'Secret Santa',
          },
          To: [
            {
              Email: sanitizedToEmail,
              Name: sanitizedMemberName,
            },
          ],
          Subject: 'Secret Santa Group Closed - Action Required',
          TextPart: `Hello ${sanitizedMemberName}!

The Secret Santa group has been closed and is ready for the secure cycle initiation.

In order to allow the creator of the group to initialize the secure Secret Santa cycle, you are required to log back on at least once more to make the algorithm ready.

Please visit: ${groupLink}

Thank you!`,
          HTMLPart: `
            <h2>Hello ${sanitizedMemberName}!</h2>
            <p>The Secret Santa group has been closed and is ready for the secure cycle initiation.</p>
            <p>In order to allow the creator of the group to initialize the secure Secret Santa cycle, you are required to log back on at least once more to make the algorithm ready.</p>
            <p><a href="${groupLink}">Visit your group</a></p>
            <p>Thank you!</p>
          `,
        },
      ],
    });

    return result;
  } catch (error) {
    console.error('Error sending group closed email:', error);
    throw error;
  }
}

