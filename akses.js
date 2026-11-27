/* Bukti kepemilikan pesanan website: kode dari server (disimpan di perangkat ini),
   atau email / nomor WhatsApp yang dipakai saat memesan. */
window.PdAkses = (() => {
  const KUNCI = 'pd_akses';
  const baca = () => { try { return JSON.parse(localStorage.getItem(KUNCI)) || {}; } catch { return {}; } };

  function simpan(id, kode) {
    if (!id || !kode) return;
    const semua = baca();
    delete semua[id];
    semua[id] = kode;
    Object.keys(semua).slice(0, -20).forEach(lama => delete semua[lama]);
    try { localStorage.setItem(KUNCI, JSON.stringify(semua)); } catch {}
  }

  function kepala(id, kontak) {
    const kode = baca()[id];
    try {
      // Pesanan yang dibuat sebelum ada kode: pakai nomor dari checkout di perangkat ini.
      if (!kontak && !kode && localStorage.getItem('pd_last_order') === id) kontak = localStorage.getItem('pd_customer_wa') || '';
    } catch {}
    const header = {};
    if (kode) header['X-Order-Code'] = kode;
    if (kontak) header['X-Order-Contact'] = encodeURIComponent(kontak);
    return header;
  }

  async function ambil(url, id, { kontak, ...opsi } = {}) {
    const r = await fetch(url, { ...opsi, headers: kepala(id, kontak) });
    const d = await r.json();
    simpan(id, d.access_code);
    return d;
  }

  const GAYA = `
    .akses-form{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:20px;margin:0 0 14px;text-align:left;color:#334155;font-size:13px;line-height:1.6}
    .akses-form p{margin:0}
    .akses-form .akses-judul{font-size:15px;font-weight:700;color:#1B3A6B;margin-bottom:4px}
    .akses-form label{display:block;font-weight:700;margin:12px 0 4px}
    .akses-form input{width:100%;box-sizing:border-box;min-height:44px;padding:10px 14px;border:1.5px solid #64748B;border-radius:10px;font:inherit;font-size:16px;color:#1E293B;background:#fff}
    .akses-form .akses-galat{color:#B91C1C;margin-top:6px}
    .akses-form .akses-galat:empty{display:none}
    .akses-form button{width:100%;min-height:44px;margin-top:12px;border:0;border-radius:10px;background:#B45309;color:#fff;font:inherit;font-weight:700;cursor:pointer}
    .akses-form button:disabled{opacity:.7;cursor:wait}
    .akses-form input:focus-visible,.akses-form button:focus-visible{outline:3px solid #1B3A6B;outline-offset:2px}
    .akses-form.gelap input:focus-visible,.akses-form.gelap button:focus-visible{outline-color:#F5A040}
    .akses-form.gelap{background:transparent;border-color:rgba(255,255,255,.3);color:#fff;margin:0}
    .akses-form.gelap .akses-judul{color:#fff}
    .akses-form.gelap .akses-galat{color:#FECACA}
    .akses-form.gelap button{background:#fff;color:#1B3A6B}`;

  function buat(tag, teks, kelas) {
    const el = document.createElement(tag);
    if (teks) el.textContent = teks;
    if (kelas) el.className = kelas;
    return el;
  }

  // galat berisi pesan setelah percobaan gagal; nilai diisi ulang supaya mudah diperbaiki.
  function formulir(wadah, { kirim, galat = '', nilai = '', gelap = false }) {
    if (!document.getElementById('aksesGaya')) {
      const style = buat('style', GAYA);
      style.id = 'aksesGaya';
      document.head.append(style);
    }
    const form = buat('form', '', 'akses-form' + (gelap ? ' gelap' : ''));
    form.noValidate = true;
    const label = buat('label', 'Email atau nomor WhatsApp pemesan');
    const input = buat('input');
    Object.assign(input, { id: 'aksesKontak', type: 'text', autocomplete: 'email', maxLength: 100, required: true, value: nilai });
    label.htmlFor = input.id;
    const pesan = buat('p', galat, 'akses-galat');
    pesan.id = 'aksesGalat';
    pesan.setAttribute('role', 'alert');
    input.setAttribute('aria-describedby', pesan.id);
    if (galat) input.setAttribute('aria-invalid', 'true');
    const tombol = buat('button', 'Tampilkan Pesanan');
    tombol.type = 'submit';
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const isi = input.value.trim();
      if (!isi) {
        pesan.textContent = 'Isi email atau nomor WhatsApp terlebih dahulu.';
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      tombol.disabled = true;
      tombol.textContent = 'Memeriksa...';
      try { await kirim(isi); }
      catch { pesan.textContent = 'Gagal terhubung ke server. Coba lagi.'; }
      finally { tombol.disabled = false; tombol.textContent = 'Tampilkan Pesanan'; }
    });
    form.append(buat('p', 'Verifikasi pesanan', 'akses-judul'),
      buat('p', 'Demi keamanan, masukkan email atau nomor WhatsApp yang dipakai saat memesan.'), label, input, pesan, tombol);
    wadah.replaceChildren(form);
    if (galat) input.focus();
  }

  return { simpan, kepala, ambil, formulir };
})();
