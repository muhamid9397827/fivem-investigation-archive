(() => {
  'use strict'

  const config = window.APP_CONFIG || {}
  const style = document.createElement('style')
  style.textContent = `
    .share-panel{overflow:hidden}.share-list{display:grid;gap:10px}.share-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:16px;padding:14px 16px;border:1px solid var(--line);border-radius:13px;background:#fafbfc}.share-row-main{min-width:0}.share-row-title{display:flex;align-items:center;gap:7px;margin-bottom:5px}.share-row-main strong,.share-row-main small{display:block}.share-row-main strong{font-size:12px;color:#1d2939}.share-row-main small{font-size:9px;color:var(--muted);margin-top:3px}.share-row-meta{display:flex;align-items:flex-end;flex-direction:column;gap:5px;font-size:9px;color:#667085}.share-state{display:inline-flex;padding:4px 8px;border-radius:999px;font-size:8px;font-weight:800;border:1px solid}.share-state-active{color:#067647;background:#ecfdf3;border-color:#abefc6}.share-state-expired{color:#b54708;background:#fffaeb;border-color:#fedf89}.share-state-revoked{color:#b42318;background:#fef3f2;border-color:#fecdca}.share-lock{display:inline-flex;padding:4px 8px;border-radius:999px;font-size:8px;font-weight:800;color:#7a541f;background:#fff4d6;border:1px solid #f0d395}.share-small-button{min-height:34px;padding:7px 10px;font-size:9px}.share-empty{min-height:140px}.share-created{padding:16px;border:1px solid #abefc6;border-radius:13px;background:#ecfdf3}.share-created>strong{display:flex;align-items:center;gap:7px;color:#067647;font-size:12px}.share-created p{font-size:9px;color:#49715e;margin:5px 0 12px}.share-copy-field{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;direction:ltr}.share-copy-field input{width:100%;min-width:0;padding:11px;border:1px solid #a6cdb7;border-radius:10px;background:#fff;color:#18212f;font-size:10px}.share-warning{background:#fffaeb!important;border-color:#fedf89!important;color:#93370d!important}.share-checkbox{display:flex;align-items:center;gap:9px;padding:12px;border:1px solid var(--line);border-radius:11px;background:#fafafa;font-size:11px}.share-checkbox input{width:17px;height:17px}html[data-theme="dark"] .share-row{background:#111720;border-color:#303847}html[data-theme="dark"] .share-row-main strong{color:#f0f4f9}html[data-theme="dark"] .share-created{background:#10251d;border-color:#27684c}html[data-theme="dark"] .share-created>strong{color:#72e2ad}html[data-theme="dark"] .share-created p{color:#9cc8b3}html[data-theme="dark"] .share-copy-field input{background:#0d131c;color:#e8edf4;border-color:#35664f}html[data-theme="dark"] .share-warning{background:#2b2110!important;border-color:#6e5121!important;color:#f0c675!important}html[data-theme="dark"] .share-checkbox{background:#111720;border-color:#303847}@media(max-width:760px){.share-row{grid-template-columns:1fr}.share-row-meta{align-items:flex-start}.share-row .button{width:100%}.share-copy-field{grid-template-columns:1fr}.share-copy-field .button{width:100%}}
  `
  document.head.appendChild(style)

  const esc = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
  const formatDateTime = (value) => value ? new Intl.DateTimeFormat('ar', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : 'دون انتهاء'
  const token = () => { try { return localStorage.getItem('fivem_archive_token') || '' } catch { return '' } }
  const sharingReady = () => config.demoMode === false && Boolean(config.supabaseUrl && config.supabaseAnonKey)

  function buildShareUrl(rawToken) {
    const configured = String(config.sharePageUrl || '').trim()
    const url = configured ? new URL(configured, location.href) : new URL('./share.html', location.href.split('#')[0])
    url.searchParams.set('token', rawToken)
    return url.toString()
  }

  async function callShare(action, payload = {}) {
    const base = String(config.supabaseUrl || '').replace(/\/$/, '')
    const functionName = config.caseShareFunctionName || 'case-share'
    const accessToken = token()
    if (!base || !config.supabaseAnonKey || !accessToken) throw new Error('سجّل الدخول مجددًا ثم حاول مرة أخرى.')
    const response = await fetch(`${base}/functions/v1/${encodeURIComponent(functionName)}`, {
      method: 'POST',
      headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    const text = await response.text()
    let body = null
    try { body = text ? JSON.parse(text) : null } catch { body = { error: text } }
    if (!response.ok) throw new Error(body?.error || `فشلت عملية المشاركة (${response.status})`)
    return body
  }

  function statusOf(item) {
    if (item.revoked_at) return ['ملغى', 'revoked']
    if (item.expires_at && new Date(item.expires_at) <= new Date()) return ['منتهي', 'expired']
    if (item.max_views && item.view_count >= item.max_views) return ['اكتمل عدد المشاهدات', 'expired']
    return ['فعّال', 'active']
  }

  function rowsMarkup(shares) {
    if (!shares.length) return `<div class="empty-state share-empty">🔗<h3>لا توجد روابط مشاركة</h3><p>أنشئ رابطًا خاصًا لهذه القضية، ويمكن إلغاؤه في أي وقت.</p></div>`
    return `<div class="share-list">${shares.map((item) => {
      const [label, state] = statusOf(item)
      const views = item.max_views ? `${item.view_count} من ${item.max_views}` : `${item.view_count} مشاهدة`
      return `<article class="share-row"><div class="share-row-main"><div class="share-row-title"><span class="share-state share-state-${state}">${esc(label)}</span>${item.has_pin ? '<span class="share-lock">🔒 برمز</span>' : ''}</div><strong>رابط مشاركة خاص</strong><small>أُنشئ ${formatDateTime(item.created_at)} • ينتهي ${formatDateTime(item.expires_at)}</small></div><div class="share-row-meta"><span>👁 ${esc(views)}</span><span>${item.include_evidence ? 'يشمل المرفقات' : 'التقرير فقط'}</span></div>${!item.revoked_at && state === 'active' ? `<button class="button button-danger share-small-button" data-secure-share-revoke="${esc(item.id)}">⊘ إلغاء الرابط</button>` : ''}</article>`
    }).join('')}</div>`
  }

  function panelMarkup(shares) {
    return `<section class="content-card share-panel" id="secureSharePanel"><div class="section-heading responsive-heading"><div><span class="eyebrow">المشاركة الخارجية</span><h2>روابط الوصول إلى هذه القضية</h2><p>المتلقي يرى التقرير المحدد فقط دون قوائم الأرشيف أو الملفات الأخرى.</p></div><button class="button button-primary" id="secureShareCreate">↗ إنشاء رابط مشاركة</button></div><div id="secureShareRows">${rowsMarkup(shares)}</div></section>`
  }

  function demoPanelMarkup() {
    return `<section class="content-card share-panel" id="secureSharePanel"><div class="section-heading"><div><span class="eyebrow">المشاركة الخارجية</span><h2>رابط خاص للقضية</h2></div></div><div class="notice share-warning"><strong>يلزم ربط Supabase</strong><span>النسخة التجريبية تحفظ البيانات داخل جهازك فقط، ولذلك لا يمكن لشخص آخر فتح القضية من جهاز مختلف.</span></div></section>`
  }

  function modalMarkup() {
    return `<div class="modal-backdrop hidden" id="secureShareModal"><section class="modal-card"><div class="modal-heading"><div><span class="eyebrow">وصول خارجي محدود</span><h2>إنشاء رابط خاص للقضية</h2></div><button class="icon-button" id="secureShareClose">×</button></div><form id="secureShareForm" class="form-grid"><label class="field"><span>مدة صلاحية الرابط</span><select name="expires_in_hours"><option value="24">يوم واحد</option><option value="168" selected>7 أيام</option><option value="720">30 يومًا</option><option value="0">دون تاريخ انتهاء</option></select></label><label class="field"><span>أقصى عدد للمشاهدات</span><input type="number" name="max_views" min="1" max="10000" placeholder="اتركه فارغًا دون حد"></label><label class="field field-full"><span>رمز دخول إضافي — اختياري</span><input type="password" name="pin" minlength="4" maxlength="64" autocomplete="new-password" placeholder="أربعة أحرف أو أرقام على الأقل"></label><label class="share-checkbox field-full"><input type="checkbox" name="include_evidence" checked><span>إظهار الصور والفيديوهات والمرفقات</span></label><label class="share-checkbox field-full"><input type="checkbox" name="allow_download"><span>إظهار أزرار تنزيل المستندات</span></label><div class="notice info field-full"><strong>صفحة مستقلة</strong><span>لن يظهر للمتلقي الشريط الجانبي أو لوحة التحكم أو روابط الملفات الأخرى. عنوان الإنترنت سيبقى ظاهرًا في شريط المتصفح بطبيعة الحال.</span></div><div id="secureShareError" class="field-full"></div><div id="secureShareResult" class="field-full hidden"></div><div class="form-actions field-full"><button type="button" class="button button-secondary" id="secureShareCancel">إلغاء</button><button class="button button-primary" id="secureShareSubmit" type="submit">🔗 إنشاء الرابط</button></div></form></section></div>`
  }

  async function installForCase(caseId) {
    if (!caseId || document.getElementById('secureSharePanel')) return
    const report = document.getElementById('caseReport')
    const pageStack = report?.closest('.page-stack')
    if (!report || !pageStack) return

    if (!sharingReady()) {
      report.insertAdjacentHTML('afterend', demoPanelMarkup())
      return
    }

    let shares = []
    try { shares = (await callShare('list', { case_id: caseId })).shares || [] }
    catch (error) {
      report.insertAdjacentHTML('afterend', `<section class="content-card share-panel" id="secureSharePanel"><div class="notice danger">${esc(error.message)}</div></section>`)
      return
    }

    report.insertAdjacentHTML('afterend', panelMarkup(shares))
    pageStack.insertAdjacentHTML('beforeend', modalMarkup())

    const actionGroup = document.querySelector('.case-hero-card .action-group')
    if (actionGroup && !document.getElementById('secureShareTop')) actionGroup.insertAdjacentHTML('afterbegin', '<button class="button button-secondary" id="secureShareTop">↗ مشاركة</button>')

    const modal = document.getElementById('secureShareModal')
    const open = () => { modal.classList.remove('hidden'); document.getElementById('secureShareError').innerHTML = '' }
    const close = () => modal.classList.add('hidden')
    document.getElementById('secureShareCreate').addEventListener('click', open)
    document.getElementById('secureShareTop')?.addEventListener('click', open)
    document.getElementById('secureShareClose').addEventListener('click', close)
    document.getElementById('secureShareCancel').addEventListener('click', close)
    modal.addEventListener('click', (event) => { if (event.target === modal) close() })

    document.querySelectorAll('[data-secure-share-revoke]').forEach((button) => button.addEventListener('click', async () => {
      if (!confirm('سيُلغى الرابط فورًا ولن يستطيع أي شخص فتحه بعد ذلك. هل أنت متأكد؟')) return
      button.disabled = true
      try {
        await callShare('revoke', { share_id: button.dataset.secureShareRevoke })
        const list = (await callShare('list', { case_id: caseId })).shares || []
        document.getElementById('secureShareRows').innerHTML = rowsMarkup(list)
        scheduleInstall()
      } catch (error) { alert(error.message); button.disabled = false }
    }))

    document.getElementById('secureShareForm').addEventListener('submit', async (event) => {
      event.preventDefault()
      const form = event.currentTarget
      const data = Object.fromEntries(new FormData(form))
      const button = document.getElementById('secureShareSubmit')
      button.disabled = true
      document.getElementById('secureShareError').innerHTML = ''
      try {
        const result = await callShare('create', {
          case_id: caseId,
          expires_in_hours: Number(data.expires_in_hours || 0),
          max_views: data.max_views ? Number(data.max_views) : null,
          pin: data.pin || '',
          include_evidence: data.include_evidence === 'on',
          allow_download: data.allow_download === 'on',
        })
        const url = buildShareUrl(result.token)
        const box = document.getElementById('secureShareResult')
        box.classList.remove('hidden')
        box.innerHTML = `<div class="share-created"><strong>✓ تم إنشاء الرابط</strong><p>انسخه الآن؛ الرمز السري لن يظهر مرة أخرى بعد إغلاق النافذة.</p><div class="share-copy-field"><input id="secureShareUrl" value="${esc(url)}" readonly><button type="button" class="button button-primary" id="secureShareCopy">⧉ نسخ</button></div></div>`
        document.getElementById('secureShareCopy').addEventListener('click', async () => {
          const input = document.getElementById('secureShareUrl')
          try { await navigator.clipboard.writeText(input.value) } catch { input.select(); document.execCommand('copy') }
          document.getElementById('secureShareCopy').textContent = 'تم النسخ ✓'
        })
        button.classList.add('hidden')
        document.getElementById('secureShareCancel').textContent = 'إغلاق'
      } catch (error) { document.getElementById('secureShareError').innerHTML = `<div class="notice danger">${esc(error.message)}</div>` }
      finally { button.disabled = false }
    })
  }

  let timer = null
  function scheduleInstall() {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const match = location.hash.match(/^#\/case\/([^/?]+)/)
      if (match) installForCase(decodeURIComponent(match[1]))
    }, 80)
  }

  window.addEventListener('hashchange', scheduleInstall)
  new MutationObserver(scheduleInstall).observe(document.getElementById('app') || document.body, { childList: true, subtree: true })
  scheduleInstall()
})()
