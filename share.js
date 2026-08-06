(() => {
  'use strict'

  const config = window.APP_CONFIG || {}
  const root = document.getElementById('shareApp')
  const token = new URLSearchParams(location.search).get('token') || ''
  const labels = {
    status: { open: 'مفتوحة', review: 'قيد المراجعة', closed: 'مغلقة', archived: 'محفوظة' },
    priority: { low: 'منخفضة', medium: 'متوسطة', high: 'عالية', critical: 'حرجة' },
    evidence: { image: 'صورة', video: 'فيديو', document: 'مستند', note: 'ملاحظة' },
  }

  const esc = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
  const safeUrl = (value = '') => {
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? esc(url.toString()) : '' } catch { return '' }
  }
  const formatDate = (value) => value ? new Intl.DateTimeFormat('ar', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value)) : '—'
  const formatSize = (bytes) => !bytes ? '' : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} كيلوبايت` : `${(bytes / 1048576).toFixed(1)} ميغابايت`

  function stateCard(symbol, title, message, danger = false) {
    root.innerHTML = `<section class="state-card"><div class="state-symbol ${danger ? 'danger' : ''}">${symbol}</div><h1>${esc(title)}</h1><p>${esc(message)}</p></section>`
  }

  function renderPin(message = '') {
    root.innerHTML = `<section class="state-card"><div class="state-symbol">🔒</div><h1>تقرير محمي</h1><p>أدخل الرمز الذي أرسله لك صاحب التقرير.</p><form class="pin-form" id="pinForm"><label><span>رمز الدخول</span><input type="password" name="pin" minlength="4" required autocomplete="one-time-code" autofocus></label><div class="error-text" id="pinError">${esc(message)}</div><button class="primary-button" type="submit">فتح التقرير</button></form></section>`
    document.getElementById('pinForm').addEventListener('submit', (event) => {
      event.preventDefault()
      const button = event.currentTarget.querySelector('button')
      const pin = new FormData(event.currentTarget).get('pin') || ''
      button.disabled = true
      openReport(String(pin)).finally(() => { button.disabled = false })
    })
  }

  function section(title, value) {
    return `<section class="report-section"><h2>${esc(title)}</h2><p>${esc(value || 'لم تُسجل معلومات في هذا القسم.')}</p></section>`
  }

  function attachmentMarkup(item, allowDownload) {
    const viewUrl = safeUrl(item.view_url || '')
    const downloadUrl = safeUrl(item.download_url || '')
    let preview = `<div class="attachment-placeholder"><b>📄</b><span>${esc(labels.evidence[item.type] || 'مرفق')}</span></div>`
    if (item.type === 'image' && viewUrl) preview = `<img src="${viewUrl}" alt="${esc(item.title)}" loading="lazy">`
    if (item.type === 'video' && viewUrl) preview = `<video src="${viewUrl}" controls preload="metadata" controlsList="${allowDownload ? '' : 'nodownload'}"></video>`
    if (item.type === 'note') preview = `<div class="attachment-placeholder"><b>📝</b><span>ملاحظة مرفقة</span></div>`
    return `<article class="attachment-card"><div class="attachment-preview">${preview}</div><div class="attachment-content"><h3>${esc(item.title)}</h3><p>${esc(item.description || 'بدون شرح إضافي.')}</p><div class="attachment-meta"><span>${esc(labels.evidence[item.type] || item.type)} ${formatSize(item.file_size)}</span>${allowDownload && downloadUrl ? `<a class="download-link" href="${downloadUrl}" rel="noreferrer">تنزيل الملف ↓</a>` : ''}</div></div></article>`
  }

  function renderReport(data) {
    const caseData = data.case
    const person = data.person
    const evidence = data.evidence || []
    const allowDownload = data.permissions?.allow_download === true
    document.title = `تقرير ${caseData.case_number}`
    root.innerHTML = `<article class="shared-report"><div class="report-topline"></div><div class="report-body"><header class="report-header"><div><span class="kicker">تقرير قضية مشترك</span><h1>${esc(caseData.title)}</h1><p>${esc(caseData.case_number)}</p></div><div class="report-mark"><span>🛡️</span><strong>نسخة عرض محدودة</strong><small>FiveM Roleplay</small></div></header><section class="summary-grid"><div class="summary-item"><span>صاحب الملف</span><strong>${esc(`${person.rank} ${person.full_name}`)}</strong></div><div class="summary-item"><span>الجهة</span><strong>${esc(person.department || 'غير محددة')}</strong></div><div class="summary-item"><span>المحقق أو الجهة</span><strong>${esc(caseData.investigator)}</strong></div><div class="summary-item"><span>تاريخ الواقعة</span><strong>${formatDate(caseData.incident_date)}</strong></div><div class="summary-item"><span>حالة القضية</span><strong>${esc(labels.status[caseData.status] || caseData.status)}</strong></div><div class="summary-item"><span>الأولوية</span><strong>${esc(labels.priority[caseData.priority] || caseData.priority)}</strong></div></section>${section('ملخص الواقعة', caseData.summary)}${section('موضوع التحقيق أو الادعاءات', caseData.allegations)}${section('الإفادات وأقوال الأطراف', caseData.statements)}${section('إجراءات التحقيق', caseData.procedures)}${section('النتائج', caseData.findings)}${section('القرار أو الحكم', caseData.decision)}${section('التوصيات', caseData.recommendations)}${evidence.length ? `<section class="report-section"><div class="attachments-title"><h2>المرفقات</h2><span>${evidence.length} عنصرًا</span></div><div class="attachment-grid">${evidence.map((item) => attachmentMarkup(item, allowDownload)).join('')}</div></section>` : ''}<footer class="report-footer"><span>تاريخ فتح القضية: ${formatDate(caseData.opened_at)}</span><span>آخر تحديث: ${formatDate(caseData.updated_at)}</span></footer></div></article><p class="privacy-note"><strong>رابط وصول محدود:</strong> لا تمنح هذه الصفحة وصولًا إلى أي ملفات أو أقسام أخرى.</p>`
  }

  async function openReport(pin = '') {
    if (!token) return stateCard('⚠', 'الرابط غير مكتمل', 'لم يتم العثور على رمز المشاركة في عنوان الصفحة.', true)
    if (!config.supabaseUrl || !config.supabaseAnonKey || config.demoMode !== false) return stateCard('⚙', 'المشاركة غير مفعلة', 'لم يتم ربط نظام المشاركة بقاعدة البيانات بعد.', true)
    try {
      const functionName = config.caseShareFunctionName || 'case-share'
      const response = await fetch(`${String(config.supabaseUrl).replace(/\/$/, '')}/functions/v1/${encodeURIComponent(functionName)}`, {
        method: 'POST',
        headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open', token, pin }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        if (body.requires_pin || ['PIN_REQUIRED', 'PIN_INVALID'].includes(body.code)) return renderPin(body.code === 'PIN_INVALID' ? 'الرمز غير صحيح، حاول مرة أخرى.' : '')
        return stateCard('⛔', 'التقرير غير متاح', body.error || 'انتهت صلاحية الرابط أو تم إلغاؤه.', true)
      }
      renderReport(body.report)
    } catch {
      stateCard('⚠', 'تعذر فتح التقرير', 'تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.', true)
    }
  }

  openReport()
})()
