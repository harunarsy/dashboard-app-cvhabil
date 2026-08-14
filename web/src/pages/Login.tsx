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
      setErr(e2.response?.data?.error || 'Login gagal');
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
