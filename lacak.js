/* ════════════════════════════════════════════════════════════════════
   PELACAKAN PENGUNJUNG TOKO — dipakai bersama oleh halaman toko
   (index, produk, cart, checkout). Hasilnya tampil di insight.html.

   Yang dikirim: id acak buatan browser + jenis kejadian. TIDAK ada nama,
   email, alamat IP, atau apa pun yang bisa mengenali orangnya.

   Cara pakai — cukup satu baris di halaman, SEBELUM </body>:
       <script src="lacak.js" data-jenis="kunjungan"></script>
       <script src="lacak.js" data-jenis="klik_produk" data-produk-id="7"></script>

   Semua kegagalan ditelan diam-diam: statistik tidak boleh sampai
   mengganggu pembeli yang sedang berbelanja.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  var API = 'https://pena-digital-backend.vercel.app/api/public';
  var KUNCI = 'pd_visitor_id';
  var DETAK_MENIT = 1;   // kirim detak tiap 1 menit selama tab dibuka

  /* Id acak per browser. Dipakai hanya untuk membedakan satu pengunjung
     dari yang lain — tidak terhubung ke identitas apa pun. */
  function idPengunjung() {
    try {
      var id = localStorage.getItem(KUNCI);
      if (!id) {
        id = (crypto && crypto.randomUUID)
          ? crypto.randomUUID().replace(/-/g, '')
          : String(Date.now()) + Math.random().toString(36).slice(2, 12);
        id = id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
        localStorage.setItem(KUNCI, id);
      }
      return id;
    } catch (e) {
      return null;   // localStorage diblokir (mode privat) -> tidak melacak
    }
  }

  var visitorId = idPengunjung();
  if (!visitorId) return;

  function kirim(jenis, produkId) {
    var body = JSON.stringify({
      jenis: jenis,
      visitor_id: visitorId,
      produk_id: (typeof produkId === 'number' && !isNaN(produkId)) ? produkId : undefined
    });
    try {
      /* sendBeacon bertahan walau halaman langsung ditutup; fetch jadi cadangan. */
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API + '/lacak', new Blob([body], { type: 'application/json' }));
      } else {
        fetch(API + '/lacak', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: body, keepalive: true
        }).catch(function () {});
      }
    } catch (e) { /* diabaikan */ }
  }

  /* Baca pengaturan dari tag <script> yang memuat berkas ini. */
  var tag = document.currentScript;
  var jenis = tag ? tag.getAttribute('data-jenis') : null;
  var pid = tag ? parseInt(tag.getAttribute('data-produk-id'), 10) : NaN;

  if (jenis) kirim(jenis, pid);

  /* Detak kehadiran — hanya saat tab benar-benar terlihat, supaya tab yang
     ditinggal di latar belakang tidak ikut terhitung sebagai "aktif". */
  setInterval(function () {
    if (document.visibilityState === 'visible') kirim('ping');
  }, DETAK_MENIT * 60 * 1000);

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') kirim('ping');
  });
})();
