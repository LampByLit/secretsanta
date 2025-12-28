# Secret Santa

Automated Secret Santa using Tom7's cryptographic method. Fully automated web application that handles the entire Secret Santa process without requiring participants to manually handle cryptographic material.

## Features

- **Fully Automated**: All cryptographic operations happen server-side
- **Multiple Groups**: Support for multiple independent Secret Santa groups
- **Per-Group Authentication**: Each group has its own login system
- **Secure**: Uses ElGamal public key cryptography with 1024-bit keys
- **Email Notifications**: Sends assignment emails via MailJet
- **Shipment Tracking**: Track when gifts are shipped

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: SQLite (stored in `/data` directory)
- **Email**: MailJet
- **Cryptography**: ElGamal (custom implementation)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables (create `.env.local`):
```
MAILJET_API_KEY=your_api_key
MAILJET_SECRET_KEY=your_secret_key
NEXT_PUBLIC_BASE_URL=http://localhost:3000
DB_PATH=./data/secretsanta.db
```

3. Run development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
npm start
```

## Deployment

Deploy to Railway with:
- Mount volume at `/data` for database persistence
- Set environment variables for MailJet API keys
- Set `NEXT_PUBLIC_BASE_URL` to your production URL

## Important Notes

- **ElGamal Prime**: The current implementation uses a placeholder prime. Replace with the actual 1024-bit Sophie Germain prime from Tom7's specification.
- **Password Reset**: After password reset, users may need to re-join the group if private keys were encrypted with the old password.
- **Minimum Members**: Groups require at least 4 members to initiate the cycle.

## License

MIT

