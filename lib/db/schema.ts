export interface Group {
  id: string;
  name: string;
  creator_email: string;
  creator_password_hash: string;
  unique_url: string;
  status: 'pending' | 'cycle_initiated' | 'messages_ready' | 'complete';
  created_at: number;
  updated_at: number;
}

export interface Member {
  id: string;
  group_id: string;
  name: string; // NOT encrypted - needs to be visible in group
  email: string; // AES encrypted (client-side with password)
  email_hash: string; // SHA-256 hash of email for lookups
  password_hash: string;
  message: string; // AES encrypted (client-side with password)
  address: string; // AES encrypted (client-side with password)
  public_key: string; // ElGamal public key (bigint as string)
  private_key_encrypted: string; // AES encrypted private key
  excluded: boolean;
  joined_at: number;
  password_reset_token: string | null;
  password_reset_expires: number | null;
}

export interface Assignment {
  id: string;
  group_id: string;
  santa_id: string;
  santee_id: string;
  revealed: boolean;
  created_at: number;
  decrypted_at: number | null;
}

export interface EncryptedMessage {
  id: string;
  group_id: string;
  sender_id: string;
  santa_id: string;
  c1: string;
  c2: string;
  created_at: number;
}

export interface ShipmentConfirmation {
  id: string;
  group_id: string;
  member_id: string;
  confirmed_at: number;
}

