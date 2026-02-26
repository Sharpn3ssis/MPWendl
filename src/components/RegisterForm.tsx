import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './LoginForm.css';
import API_BASE from '../utils/apiBase';

export const RegisterForm = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    try {
      const response = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, role }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Chyba při registraci');
      setSuccess(true);
      setTimeout(() => navigate('/'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chyba při registraci');
    }
  };

  return (
    <div className="login-container">
      <form onSubmit={handleSubmit} className="login-form">
        <h2>Registrace</h2>
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">Účet byl vytvořen! Přesměrování...</div>}
        <div className="form-group">
          <label htmlFor="username">Uživatelské jméno:</label>
          <input type="text" id="username" value={username} onChange={e => setUsername(e.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor="email">Email:</label>
          <input type="email" id="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor="password">Heslo:</label>
          <input type="password" id="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor="role">Role:</label>
          <select id="role" value={role} onChange={e => setRole(e.target.value)}>
            <option value="student">Student</option>
            <option value="teacher">Učitel</option>
          </select>
        </div>
        <button type="submit">Registrovat</button>
        <p className="register-link">
          Máte účet? <a onClick={() => navigate('/')}>Přihlaste se</a>
        </p>
      </form>
    </div>
  );
};
