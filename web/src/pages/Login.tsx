import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { login } = useAuth();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await login(u, p);
    } catch (e2: any) {
      // Bedakan "server menolak" dari "server tidak terjangkau". Sebelumnya
      // keduanya sama-sama jadi "Login gagal", sehingga masalah CORS terbaca
      // sebagai password salah — pemilik sempat membuang waktu mengecek
      // kredensial yang sebenarnya benar.
      if (e2.response) {
        setErr(e2.response.data?.error || `Ditolak server (HTTP ${e2.response.status})`);
      } else {
        setErr(
          'Tidak bisa menghubungi server. Ini BUKAN soal username/password — ' +
            'periksa koneksi atau setelan proxy dev.',
        );
      }
    }
  };

  return (
    <form onSubmit={submit} style={{ padding: 24, maxWidth: 320, fontFamily: 'system-ui' }}>
      <h1>Habil Beta V2</h1>
      <input value={u} onChange={(e) => setU(e.target.value)} placeholder="Username" />
      <input value={p} onChange={(e) => setP(e.target.value)} type="password" placeholder="Password" />
      <button type="submit">Masuk</button>
      {err && <p role="alert" style={{ color: 'crimson' }}>{err}</p>}
    </form>
  );
}
