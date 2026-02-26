import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './LoginForm.css';
import API_BASE from '../utils/apiBase';

interface LoginFormProps {
  onLogin: (token: string) => void;
}

export const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      console.log('Odesílám požadavek na:', `${API_BASE}/api/login`);
      const response = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      console.log('Odpověď serveru:', response.status);
      const data = await response.json();
      console.log('Data:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Chyba při přihlášení');
      }

      if (data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('role', data.user.role);
        // uložíme také id uživatele pro kontrolu vlastnictví pramenů
        if (data.user.id) localStorage.setItem('userId', String(data.user.id));
        localStorage.setItem('username', data.user.username);
        onLogin(data.token);
        navigate('/dashboard');
      } else {
        throw new Error('Server nevrátil přístupový token');
      }
    } catch (err) {
      console.error('Chyba při přihlášení:', err);
      setError(err instanceof Error ? err.message : 'Chyba při přihlášení');
    }
  };

  return (
    <div className="login-container">
      <form onSubmit={handleSubmit} className="login-form">
        <h2>Přihlášení</h2>
        {error && <div className="error-message">{error}</div>}
        <div className="form-group">
          <label htmlFor="email">Email:</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Heslo:</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit">Přihlásit se</button>
        <p className="register-link">
          Nemáte účet? <a onClick={() => navigate('/register')}>Registrujte se</a>
        </p>
      </form>
    </div>
  );
};