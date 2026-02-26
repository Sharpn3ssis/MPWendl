# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    # Badatelský dějepis

    Vite + React + TypeScript aplikace s Node/Express backendem a MySQL databází. Frontend slouží k editaci pramenů, správě videí a zadávání kvízových otázek pro studenty.

    ## OpenAI generátor otázek

    Autoři pramenů mohou v editoru kvízu použít tlačítko **„Vygenerovat návrhy (AI)”**, které zavolá backend endpoint `POST /api/sources/:id/quiz/generate`. Backend odešle zkrácený text pramene do OpenAI a vrátí několik návrhů otázek. Návrhy je možné pouze přidat nebo jimi nahradit celý kvíz – vždy se zobrazí náhled, takže nic není uloženo bez potvrzení.

    ### Konfigurace

    1. V adresáři `server/` vytvořte soubor `.env` (není verzovaný) s obsahem:

       ```ini
       OPENAI_API_KEY=sk-...
  # volitelné
  OPENAI_MODEL=gpt-5-nano
       OPENAI_ORGANIZATION=org_123
       ```

       Alternativně nastavte proměnné prostředí přímo v systému (např. v PowerShellu `setx OPENAI_API_KEY "sk-..."`).

    2. Spusťte backend z adresáře `server/` (`npm start`). Při startu se načtou proměnné z `.env` díky balíčku `dotenv`.

    3. Frontend běží na `npm run dev`. V sekci kvízu se po přihlášení zobrazí nové AI tlačítko.

    ### Bezpečnost a limity

  - Použitý model je aktuálně nastaven na `gpt-5-nano` (levnější GPT‑5 varianta). Lze změnit proměnnou `OPENAI_MODEL`.
    - Backend vždy ořezává text pramene na ~6000 znaků, aby se předešlo vysokým nákladům.
    - AI výstup prochází sanitizací (min. 2 možnosti, alespoň jedna správná, max. 6 odpovědí, max. 10 textových odpovědí).
    - Pokud není `OPENAI_API_KEY` nastavený, endpoint vrací chybu 503 a tlačítko ve frontendu zahlásí, že generátor není k dispozici.

    ## Vývoj

    - Frontend: `npm install && npm run dev`
    - Backend: `cd server && npm install && npm start`
    - Databáze: skripty `server/init.sql` a `server/users.sql`

    Zbytek konfigurace (ESLint, React compiler atd.) zůstává dle výchozího Vite šablony a lze ho rozšířit podle potřeby.
      // Enable lint rules for React DOM
