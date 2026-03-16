import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

function parseJwt(token: string): Record<string, unknown> | null {
    try {
        const payload = token.split('.')[1];
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    } catch {
        return null;
    }
}

export async function POST(request: NextRequest) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const jwt = parseJwt(authHeader.slice(7));
    const userId = jwt?.sub as string | undefined;
    if (!userId) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    }

    const body = await request.json();
    const {
        gmailMessageId, gmailThreadId, senderName, senderEmail,
        subject, receivedAt, hasAttachments, attachmentNames,
        hasPitchDeck, relevanceLabel, derivedCompanyName,
        // AI-extracted fields
        extracted,
    } = body;

    if (!senderEmail || !subject) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    try {
        const db = createServiceClient(supabaseUrl, serviceRoleKey);

        // Get first pipeline stage
        const { data: stages } = await db
            .from('pipeline_stages')
            .select('id')
            .eq('organization_id', ORGANIZATION_ID)
            .order('order', { ascending: true })
            .limit(1);

        const firstStageId = stages?.[0]?.id;
        if (!firstStageId) {
            return NextResponse.json({ error: 'No pipeline stages configured' }, { status: 400 });
        }

        // Check if company with this founder email already exists
        const { data: existingCompany } = await db
            .from('companies')
            .select('id, company_name')
            .eq('organization_id', ORGANIZATION_ID)
            .eq('founder_email', senderEmail)
            .limit(1);

        if (existingCompany && existingCompany.length > 0) {
            return NextResponse.json({
                error: `Company already exists for ${senderEmail}: ${existingCompany[0].company_name}`,
                existingCompanyId: existingCompany[0].id,
            }, { status: 409 });
        }

        // Check dedup
        if (gmailMessageId) {
            const { data: existingEmail } = await db
                .from('ingested_emails')
                .select('id')
                .eq('organization_id', ORGANIZATION_ID)
                .eq('gmail_message_id', gmailMessageId)
                .limit(1);

            if (existingEmail && existingEmail.length > 0) {
                return NextResponse.json({ error: 'Email already processed' }, { status: 409 });
            }
        }

        // Use AI-extracted data if available, with sensible fallbacks
        const ai = extracted || {};
        const companyName = ai.companyName || derivedCompanyName || subject.replace(/^(re|fwd|fw):\s*/gi, '').trim() || 'Unknown';
        const founderName = ai.founderName || senderName || senderEmail.split('@')[0];
        const companyRound = ai.companyRound || 'Seed';
        const priorityLevel = ai.priorityLevel || 'Medium';
        const dealSourceType = ai.dealSourceType || 'Founder Network';
        const shareType = ai.shareType || 'Primary';
        const totalFundRaise = typeof ai.totalFundRaise === 'number' ? ai.totalFundRaise : null;
        const valuation = typeof ai.valuation === 'number' ? ai.valuation : null;
        const subIndustry = ai.subIndustry || '';

        const customTags = ['email-ingested', 'email-workspace'];
        if (hasPitchDeck) customTags.push('has-pitch-deck');

        // Try to match industry by name
        let industryId = '';
        if (ai.industry) {
            const { data: matchedIndustry } = await db
                .from('industries')
                .select('id')
                .eq('organization_id', ORGANIZATION_ID)
                .ilike('name', ai.industry)
                .limit(1);
            if (matchedIndustry && matchedIndustry.length > 0) {
                industryId = matchedIndustry[0].id;
            }
        }

        // Build company insert
        const companyInsert: Record<string, unknown> = {
            organization_id: ORGANIZATION_ID,
            company_name: companyName,
            founder_name: founderName,
            founder_email: senderEmail,
            pipeline_stage_id: firstStageId,
            priority_level: priorityLevel,
            company_round: companyRound,
            deal_source_type: dealSourceType,
            share_type: shareType,
            needs_review: true,
            ingestion_source: 'email-workspace',
            custom_tags: customTags,
            sub_industry: subIndustry,
        };

        if (totalFundRaise !== null) companyInsert.total_fund_raise = totalFundRaise;
        if (valuation !== null) companyInsert.valuation = valuation;
        if (industryId) companyInsert.industry_id = industryId;
        if (ai.summary) companyInsert.quick_summary = ai.summary;

        const { data: newCompany, error: companyError } = await db
            .from('companies')
            .insert(companyInsert)
            .select()
            .single();

        if (companyError) {
            return NextResponse.json({ error: companyError.message }, { status: 500 });
        }

        // Record in ingested_emails
        if (gmailMessageId) {
            await db.from('ingested_emails').insert({
                organization_id: ORGANIZATION_ID,
                gmail_message_id: gmailMessageId,
                gmail_thread_id: gmailThreadId || null,
                sender_name: founderName,
                sender_email: senderEmail,
                subject,
                received_at: receivedAt || null,
                has_attachments: hasAttachments || false,
                attachment_names: attachmentNames || [],
                company_id: newCompany.id,
                status: 'processed',
                relevance_label: relevanceLabel || null,
            });
        }

        // Activity log
        await db.from('activity_logs').insert({
            company_id: newCompany.id,
            user_id: userId,
            action: 'created',
            details: `Manually sent to Kanban from Email Workspace: "${subject}" from ${senderEmail}. AI-extracted: ${ai.summary || 'N/A'}`,
        });

        // Notify other users
        const { data: profiles } = await db
            .from('profiles')
            .select('id')
            .eq('organization_id', ORGANIZATION_ID)
            .neq('id', userId);

        if (profiles && profiles.length > 0) {
            const notifs = profiles.map((p: { id: string }) => ({
                user_id: p.id,
                type: 'new_company',
                title: 'Email Workspace',
                message: `${companyName} added from email (needs review)${ai.companyRound ? ' — ' + ai.companyRound : ''}`,
                company_id: newCompany.id,
            }));
            await db.from('notifications').insert(notifs);
        }

        return NextResponse.json({
            success: true,
            company: { id: newCompany.id, companyName },
        });
    } catch (error: unknown) {
        console.error('[gmail/send-to-kanban] error:', error);
        return NextResponse.json({ error: (error as Error).message || 'Failed to create company' }, { status: 500 });
    }
}
