// Základní URL pro API volání.
// V produkci nastavte proměnnou VITE_API_URL na adresu backendu (např. https://muj-backend.onrender.com).
// Lokálně stačí nechat prázdnou – použije se http://localhost:4000.
const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:4000';

export default API_BASE;
