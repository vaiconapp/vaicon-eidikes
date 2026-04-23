@echo off
cd /d C:\Users\xxxyy\Desktop\vaicon-eidikes
echo Ανέβασμα στο GitHub...
call node scripts\bump-version.js
if %errorlevel% neq 0 (
    echo *** ΣΦΑΛΜΑ ΣΤΟ BUMP VERSION ***
    cmd /k
    exit /b
)
git add .
git commit -m "backup"
git push
echo.
echo Ανέβηκε στο GitHub!
cmd /k
