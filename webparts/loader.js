(() => {
  'use strict'

  const app = document.getElementById('app')
  let failed = false

  function showFailure(error) {
    if (failed) return
    failed = true
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error || 'خطأ غير معروف')
    console.error('Archive startup failed:', error)
    if (!app) return
    app.innerHTML = `
      <main style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#f3f5f8;color:#172033;font-family:Tahoma,Arial,sans-serif;direction:rtl">
        <section style="width:min(720px,100%);background:#fff;border:1px solid #d9dee8;border-radius:18px;padding:26px;box-shadow:0 18px 45px rgba(15,23,42,.10)">
          <div style="font-size:34px;margin-bottom:10px">⚠️</div>
          <h1 style="font-size:22px;margin:0 0 10px">تعذر تشغيل النظام</h1>
          <p style="line-height:1.9;color:#596579;margin:0 0 14px">تم تحميل الموقع، لكن حدث خطأ أثناء تشغيل التطبيق. انسخ النص التالي وأرسله للمطور:</p>
          <pre style="white-space:pre-wrap;word-break:break-word;background:#111827;color:#f9fafb;padding:15px;border-radius:12px;direction:ltr;text-align:left;font-size:12px;line-height:1.7">${message.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]))}</pre>
          <button onclick="location.reload()" style="margin-top:16px;border:0;border-radius:10px;background:#b9812d;color:#fff;padding:11px 18px;font-weight:700;cursor:pointer">إعادة المحاولة</button>
        </section>
      </main>`
  }

  window.addEventListener('error', (event) => showFailure(event.error || event.message))
  window.addEventListener('unhandledrejection', (event) => showFailure(event.reason))

  try {
    const styleParts = window.__STYLE_SOURCE_PARTS || []
    const appParts = window.__APP_SOURCE_PARTS || []

    if (styleParts.length !== 3) throw new Error(`لم تُحمّل جميع ملفات التصميم (${styleParts.length}/3)`)
    if (appParts.length !== 6) throw new Error(`لم تُحمّل جميع ملفات التطبيق (${appParts.length}/6)`)

    const style = document.createElement('style')
    style.textContent = styleParts.join('')
    document.head.appendChild(style)

    const source = appParts.join('')
    if (source.length < 20000) throw new Error('ملف التطبيق المجمّع ناقص')

    const start = new Function(`${source}\n//# sourceURL=fivem-archive-app.js`)
    start()
  } catch (error) {
    showFailure(error)
  }
})()
