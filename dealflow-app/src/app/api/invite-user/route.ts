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

  const { email, role, permissions } = await req.json();
  const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

  if (!email || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const normalizedEmail = String(email).trim().toLowerCase();

  // 1️⃣ Record the invite in the server-side allowlist. The auth callback
  //    consults this table; without a row here, the user cannot register
  //    even if they craft their own ?role=... URL.
  const { error: inviteError } = await supabase
    .from('pending_invites')
    .upsert({
      email: normalizedEmail,
      role,
      permissions: Array.isArray(permissions) ? permissions : [],
    }, { onConflict: 'email' });

  if (inviteError) {
    console.error('pending_invites upsert error:', inviteError);
    return NextResponse.json({ error: 'Failed to record invite.', details: inviteError.message }, { status: 500 });
  }

  // Registration link — role/permissions are NOT included; the callback
  // reads them from the pending_invites row keyed by the user's verified
  // Google email, so URL params can't be forged to escalate privileges.
  // Declared outside the try so the catch can hand it back.
  const registrationUrl = `${SITE_URL}/login`;

  // 2️⃣ Send Custom Email via Gmail SMTP
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });

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
    // The pending_invites row above is already committed, so the invite is
    // live whether or not the notification goes out — the email only carries
    // a link to the login page. Reporting this as an outright failure made
    // admins re-send an invite that had in fact worked. Succeed, and hand
    // back the link so it can be passed on by hand.
    return NextResponse.json({
      success: true,
      emailSent: false,
      registrationUrl,
      emailError: String(err),
    });
  }

  return NextResponse.json({ success: true, emailSent: true });
}