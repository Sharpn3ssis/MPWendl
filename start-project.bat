@echo off
echo Spouštím projekt Badatelský dějepis...

echo 1. Spouštím XAMPP...
start "" "C:\xampp\xampp-control.exe"
echo Počkej prosím 10 sekund na nastartování MySQL...
timeout /t 10 /nobreak

echo 2. Vytvářím databázi...
"C:\xampp\mysql\bin\mysql.exe" -u root < "c:/CPR3/MPBadatelskyDejepis/MPWendl/server/init.sql"

echo 3. Spouštím backend server...
cd c:/CPR3/MPBadatelskyDejepis/MPWendl/server
start cmd /k "node index.js"

echo 4. Spouštím frontend...
cd ../
start cmd /k "npm run dev"

echo Hotovo! 
echo Frontend běží na: http://localhost:5173
echo Backend běží na: http://localhost:4000
echo.
echo Pro přihlášení použij:
echo Email: admin@test.cz
echo Heslo: admin123
pause