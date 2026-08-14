import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './lib/auth';
import Login from './pages/Login';
import Inventory from './pages/Inventory';

const qc = new QueryClient();

function Shell() {
  const { user, logout } = useAuth();
  if (!user) return <Login />;
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <p>Masuk sebagai {user.username} ({user.role}) <button onClick={logout}>Keluar</button></p>
      <Inventory />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </QueryClientProvider>
  );
}
