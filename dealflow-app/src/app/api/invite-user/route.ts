import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase env vars not set' }, { status: 500 });
  }

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return NextResponse.json({ error: 'Gmail env vars not set' }, { status: 500 });
  }

  const { email, role } = await req.json();
  const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

  if (!email || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1️⃣ (Removed Supabase Invite to avoid rate limit)

  // 2️⃣ No profile upsert here. Profile will be created after user signs up.

  // 3️⃣ Send Custom Email via Gmail SMTP
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });

    // Registration link (actual domain and path)
    const registrationUrl = `${SITE_URL}/login?email=${encodeURIComponent(email)}&role=${encodeURIComponent(role)}`;

    await transporter.sendMail({
      from: `"VC-SAAS" <${GMAIL_USER}>`,
      to: email,
      subject: 'You are invited to join VC-SAAS',
      text: `Hi,\n\nYou have been invited to join VC-SAAS as a ${role}.\n\nTo get started, click the link below to register your account:\n${registrationUrl}\n\nThanks!`,
      html: `
        <p>Hi,</p>
        <p>You have been invited to join <b>VC-SAAS</b> as a <b>${role}</b>.</p>
        <p><a href="${registrationUrl}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none;display:inline-block;font-weight:bold;">Accept Invite & Register</a></p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p><a href="${registrationUrl}">${registrationUrl}</a></p>
        <p>Thanks!</p>
      `,
    });
  } catch (err) {
    console.error('Gmail SMTP error:', err);
    return NextResponse.json(
      { error: 'Failed to send invite email.', details: String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}