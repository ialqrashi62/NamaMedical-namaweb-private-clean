@echo off
chcp 65001 >nul 2>&1
title jumanaMedical ERP - Auto Setup
color 0A

echo.
echo  ╔════════════════════════════════════════════════════╗
echo  ║      jumanaMedical ERP - Automatic Setup           ║
echo  ║      جمانا الطبي - التثبيت التلقائي                ║
echo  ╚════════════════════════════════════════════════════╝
echo.

:: Step 1: Check Node.js
echo [1/5] Checking Node.js...
node -v >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  ❌ Node.js not found! Please install from https://nodejs.org
    echo  ❌ لم يتم العثور على Node.js! حمله من https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do echo  ✅ Node.js %%i found

:: Step 2: Check PostgreSQL
echo.
echo [2/5] Checking PostgreSQL...
pg_isready >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  ⚠️  PostgreSQL may not be running. Attempting to start...
    net start postgresql-x64-17 >nul 2>&1
    net start postgresql-x64-16 >nul 2>&1
    net start postgresql >nul 2>&1
    timeout /t 3 >nul
    pg_isready >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo  ❌ PostgreSQL is not installed or not running!
        echo  ❌ Please install PostgreSQL from https://www.postgresql.org/download/
        echo  ❌ Or start the PostgreSQL service manually.
        pause
        exit /b 1
    )
)
echo  ✅ PostgreSQL is running

:: Step 3: Create .env if not exists
echo.
echo [3/5] Setting up environment...
if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo  ✅ Created .env from .env.example
    echo  ⚠️  Edit .env if your PostgreSQL password is different from 'postgres'
) else (
    echo  ✅ .env already exists
)

:: Step 4: Create database if not exists
echo.
echo [4/5] Creating database...
for /f "tokens=*" %%i in ('node -e "require('dotenv').config();console.log(process.env.DB_PASSWORD||'postgres')" 2^>nul') do set DB_PASS=%%i
set PGPASSWORD=%DB_PASS%

psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'nama_medical_web'" 2>nul | findstr "1" >nul
if %ERRORLEVEL% NEQ 0 (
    psql -U postgres -c "CREATE DATABASE nama_medical_web" >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo  ✅ Database 'nama_medical_web' created
    ) else (
        echo  ⚠️  Could not create database automatically.
        echo     Please create it manually: CREATE DATABASE nama_medical_web;
    )
) else (
    echo  ✅ Database 'nama_medical_web' already exists
)

:: Step 5: Install npm packages
echo.
echo [5/5] Installing packages...
if not exist "node_modules" (
    call npm install --production
    echo  ✅ Packages installed
) else (
    echo  ✅ Packages already installed
)

:: Seed data (services, drugs)
echo.
echo [BONUS] Seeding initial data...
node seed_services_pg.js >nul 2>&1
node seed_data_pg.js >nul 2>&1
echo  ✅ Initial data seeded

:: Done!
echo.
echo  ╔════════════════════════════════════════════════════╗
echo  ║  ✅ Setup Complete! - التثبيت اكتمل!             ║
echo  ╠════════════════════════════════════════════════════╣
echo  ║                                                    ║
echo  ║  To start the server:                              ║
echo  ║  node server.js                                    ║
echo  ║                                                    ║
echo  ║  Or double-click: start.bat                        ║
echo  ║                                                    ║
echo  ║  Then open: http://localhost:3000                   ║
echo  ║                                                    ║
echo  ║  Default login: admin / admin                      ║
echo  ║                                                    ║
echo  ╚════════════════════════════════════════════════════╝
echo.
pause
