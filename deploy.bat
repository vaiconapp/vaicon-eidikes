@echo off
cd /d C:\Users\xxxyy\Desktop\vaicon-eidikes
set EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyB04iN9S_MfYMsx3V3Jn1j2rOyz5ySf-sQ
echo ================================
echo    VAICON EIDIKES DEPLOY
echo ================================
echo.
echo [1/2] Building...
call npx expo export --platform web
if %errorlevel% neq 0 (
    echo *** ΣΦΑΛΜΑ ΣΤΟ BUILD ***
    cmd /k
    exit /b
)
echo.
echo [2/2] Deploying to Netlify...
call netlify deploy --dir=dist --prod
if %errorlevel% neq 0 (
    echo *** ΣΦΑΛΜΑ ΣΤΟ DEPLOY ***
    cmd /k
    exit /b
)
echo.
echo ================================
echo    Ανεβηκε στο vaicon-eidikes.netlify.app
echo ================================
cmd /k