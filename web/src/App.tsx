import { AuthProvider, useAuth } from './lib/auth';
import Login from './pages/Login';

function Shell() {
  const { user, logout } = useAuth();
  if (!user) return <Login />;
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <p>Masuk sebagai {user.username} ({user.role}) <button onClick={logout}>Keluar</button></p>
      <p>Halaman Inventory menyusul di Task 8.</p>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
