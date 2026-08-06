import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

const encoder = new TextEncoder()
const allowedStaffRoles = new Set(['admin', 'investigator', 'leader'])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function derivePinHash(pin: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 150_000, hash: 'SHA-256' },
    key,
    256,
  )
  return bytesToBase64(new Uint8Array(bits))
}

function constantTimeEqual(a: string, b: string) {
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  let mismatch = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index++) mismatch |= (left[index] || 0) ^ (right[index] || 0)
  return mismatch === 0
}

function bearerToken(req: Request) {
  const header = req.headers.get('Authorization') || ''
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'إعدادات الخادم غير مكتملة.' }, 500)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let payload: Record<string, unknown>
  try { payload = await req.json() } catch { return json({ error: 'بيانات الطلب غير صالحة.' }, 400) }
  const action = String(payload.action || '')

  async function requireStaff() {
    const jwt = bearerToken(req)
    if (!jwt) throw new Response(JSON.stringify({ error: 'يجب تسجيل الدخول.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const { data: userData, error: userError } = await admin.auth.getUser(jwt)
    if (userError || !userData.user) throw new Response(JSON.stringify({ error: 'جلسة الدخول غير صالحة.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const { data: profile, error: profileError } = await admin.from('profiles').select('id,role').eq('id', userData.user.id).single()
    if (profileError || !profile || !allowedStaffRoles.has(profile.role)) throw new Response(JSON.stringify({ error: 'ليس لديك صلاحية إدارة روابط المشاركة.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    return { user: userData.user, profile }
  }

  try {
    if (action === 'create') {
      const { user } = await requireStaff()
      const caseId = String(payload.case_id || '')
      if (!caseId) return json({ error: 'معرّف القضية مطلوب.' }, 400)

      const { data: caseRow, error: caseError } = await admin.from('cases').select('id').eq('id', caseId).single()
      if (caseError || !caseRow) return json({ error: 'القضية غير موجودة.' }, 404)

      const expiresInHours = Math.max(0, Math.min(Number(payload.expires_in_hours || 0), 24 * 365))
      const maxViewsRaw = payload.max_views == null || payload.max_views === '' ? null : Number(payload.max_views)
      const maxViews = maxViewsRaw == null ? null : Math.max(1, Math.min(Math.trunc(maxViewsRaw), 10_000))
      const pin = String(payload.pin || '')
      if (pin && pin.length < 4) return json({ error: 'رمز الدخول يجب ألا يقل عن أربعة أحرف أو أرقام.' }, 400)

      const tokenBytes = crypto.getRandomValues(new Uint8Array(32))
      const token = bytesToBase64Url(tokenBytes)
      const tokenHash = await sha256Hex(token)
      let pinHash: string | null = null
      let pinSalt: string | null = null
      if (pin) {
        const salt = crypto.getRandomValues(new Uint8Array(16))
        pinSalt = bytesToBase64(salt)
        pinHash = await derivePinHash(pin, salt)
      }

      const expiresAt = expiresInHours > 0
        ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
        : null

      const { data: share, error } = await admin.from('case_shares').insert({
        case_id: caseId,
        token_hash: tokenHash,
        pin_hash: pinHash,
        pin_salt: pinSalt,
        expires_at: expiresAt,
        max_views: maxViews,
        include_evidence: payload.include_evidence !== false,
        allow_download: payload.allow_download === true,
        created_by: user.id,
      }).select('id,case_id,expires_at,max_views,view_count,include_evidence,allow_download,created_at').single()
      if (error) throw error
      return json({ token, share })
    }

    if (action === 'list') {
      await requireStaff()
      const caseId = String(payload.case_id || '')
      if (!caseId) return json({ error: 'معرّف القضية مطلوب.' }, 400)
      const { data, error } = await admin.from('case_shares')
        .select('id,case_id,expires_at,max_views,view_count,include_evidence,allow_download,created_at,last_viewed_at,revoked_at,pin_hash')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return json({ shares: (data || []).map(({ pin_hash, ...row }) => ({ ...row, has_pin: Boolean(pin_hash) })) })
    }

    if (action === 'revoke') {
      await requireStaff()
      const shareId = String(payload.share_id || '')
      if (!shareId) return json({ error: 'معرّف رابط المشاركة مطلوب.' }, 400)
      const { error } = await admin.from('case_shares').update({ revoked_at: new Date().toISOString() }).eq('id', shareId)
      if (error) throw error
      return json({ success: true })
    }

    if (action === 'open') {
      const token = String(payload.token || '')
      if (token.length < 20) return json({ error: 'رابط المشاركة غير صالح.', code: 'INVALID_TOKEN' }, 404)
      const tokenHash = await sha256Hex(token)
      const { data: share, error: shareError } = await admin.from('case_shares').select('*').eq('token_hash', tokenHash).maybeSingle()
      if (shareError) throw shareError
      if (!share) return json({ error: 'رابط المشاركة غير صالح أو لم يعد موجودًا.', code: 'INVALID_TOKEN' }, 404)
      if (share.revoked_at) return json({ error: 'تم إلغاء رابط المشاركة.', code: 'REVOKED' }, 410)
      if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) return json({ error: 'انتهت صلاحية رابط المشاركة.', code: 'EXPIRED' }, 410)
      if (share.max_views && share.view_count >= share.max_views) return json({ error: 'اكتمل العدد المسموح به للمشاهدات.', code: 'VIEW_LIMIT' }, 410)

      if (share.pin_hash) {
        const pin = String(payload.pin || '')
        if (!pin) return json({ error: 'هذا التقرير محمي برمز.', code: 'PIN_REQUIRED', requires_pin: true }, 401)
        const candidate = await derivePinHash(pin, base64ToBytes(share.pin_salt))
        if (!constantTimeEqual(candidate, share.pin_hash)) return json({ error: 'رمز الدخول غير صحيح.', code: 'PIN_INVALID', requires_pin: true }, 401)
      }

      const { data: consumed, error: consumeError } = await admin.rpc('consume_case_share', { p_share_id: share.id })
      if (consumeError) throw consumeError
      if (!consumed) return json({ error: 'انتهت صلاحية رابط المشاركة.', code: 'NO_LONGER_AVAILABLE' }, 410)

      const { data: caseRow, error: caseError } = await admin.from('cases').select('case_number,title,summary,allegations,statements,procedures,findings,decision,recommendations,status,priority,investigator,incident_date,opened_at,updated_at,person_id').eq('id', share.case_id).single()
      if (caseError || !caseRow) return json({ error: 'القضية لم تعد موجودة.', code: 'CASE_NOT_FOUND' }, 404)
      const { data: person, error: personError } = await admin.from('people').select('full_name,rank,military_number,department').eq('id', caseRow.person_id).single()
      if (personError || !person) return json({ error: 'ملف صاحب القضية لم يعد موجودًا.', code: 'PERSON_NOT_FOUND' }, 404)

      let evidence: Record<string, unknown>[] = []
      if (share.include_evidence) {
        const { data: evidenceRows, error: evidenceError } = await admin.from('evidence').select('type,title,description,file_path,mime_type,file_size,created_at').eq('case_id', share.case_id).order('created_at', { ascending: true })
        if (evidenceError) throw evidenceError
        evidence = await Promise.all((evidenceRows || []).map(async (item) => {
          let view_url: string | null = null
          let download_url: string | null = null
          if (item.file_path) {
            const { data: viewData } = await admin.storage.from('case-evidence').createSignedUrl(item.file_path, 15 * 60)
            view_url = viewData?.signedUrl || null
            if (share.allow_download) {
              const { data: downloadData } = await admin.storage.from('case-evidence').createSignedUrl(item.file_path, 15 * 60, { download: true })
              download_url = downloadData?.signedUrl || null
            }
          }
          const { file_path: _filePath, ...safeItem } = item
          return { ...safeItem, view_url, download_url }
        }))
      }

      return json({
        report: {
          case: caseRow,
          person,
          evidence,
          permissions: { include_evidence: share.include_evidence, allow_download: share.allow_download },
          share: { expires_at: share.expires_at, max_views: share.max_views, view_count: share.view_count + 1 },
        },
      })
    }

    return json({ error: 'العملية المطلوبة غير معروفة.' }, 400)
  } catch (error) {
    if (error instanceof Response) return error
    console.error(error)
    return json({ error: 'تعذر إكمال العملية على الخادم.' }, 500)
  }
})
