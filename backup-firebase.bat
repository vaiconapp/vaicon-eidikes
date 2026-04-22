@echo off
chcp 65001 >nul
setlocal

set BACKUP_DIR=%USERPROFILE%\Desktop\vaicon-backups
set FIREBASE_URL=https://vaicon-eidikes-default-rtdb.europe-west1.firebasedatabase.app/.json

echo ================================
echo    VAICON EIDIKES - FIREBASE BACKUP
echo ================================
echo.

if not exist "%BACKUP_DIR%" (
    echo Δημιουργία φακέλου: %BACKUP_DIR%
    mkdir "%BACKUP_DIR%"
)

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm"') do set TS=%%i
set FILENAME=eidikes-%TS%.json
set FILEPATH=%BACKUP_DIR%\%FILENAME%

echo Κατέβασμα από Firebase...
echo Αρχείο: %FILENAME%
echo Προορισμός: %BACKUP_DIR%
echo.

curl -s -f "%FIREBASE_URL%" -o "%FILEPATH%"

if %errorlevel% neq 0 (
    echo *** ΣΦΑΛΜΑ ΣΤΟ ΚΑΤΕΒΑΣΜΑ ***
    echo Έλεγξε τη σύνδεση στο internet ή το Firebase URL.
    if exist "%FILEPATH%" del "%FILEPATH%"
    cmd /k
    exit /b 1
)

for %%A in ("%FILEPATH%") do set SIZE=%%~zA

if "%SIZE%"=="0" (
    echo *** ΠΡΟΣΟΧΗ: Το αρχείο είναι άδειο ***
    del "%FILEPATH%"
    cmd /k
    exit /b 1
)

set /a SIZE_KB=%SIZE% / 1024

echo.
echo ================================
echo    BACKUP OK
echo ================================
echo Αρχείο: %FILENAME%
echo Μέγεθος: %SIZE% bytes (%SIZE_KB% KB)
echo Φάκελος: %BACKUP_DIR%
echo.
echo Άνοιγμα φακέλου...
start "" "%BACKUP_DIR%"
echo.
echo (Μπορείς να κλείσεις το παράθυρο)
timeout /t 5
