@echo off
REM Nama Medical - Database Backup Script
REM Usage: backup.bat [optional: output_folder]

setlocal
set PGUSER=postgres
set PGHOST=localhost
set PGDATABASE=nama_medical_web

set BACKUP_DIR=%~1
if "%BACKUP_DIR%"=="" set BACKUP_DIR=%~dp0backups

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

set TIMESTAMP=%date:~-4,4%%date:~-7,2%%date:~-10,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set BACKUP_FILE=%BACKUP_DIR%\nama_backup_%TIMESTAMP%.sql

echo ========================================
echo   Nama Medical - Database Backup
echo ========================================
echo.
echo Database: %PGDATABASE%
echo Output:   %BACKUP_FILE%
echo.

pg_dump -U %PGUSER% -h %PGHOST% %PGDATABASE% > "%BACKUP_FILE%"

if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Backup created successfully!
    echo File: %BACKUP_FILE%
    for %%A in ("%BACKUP_FILE%") do echo Size: %%~zA bytes
) else (
    echo [ERROR] Backup failed! Make sure PostgreSQL is running and pg_dump is in PATH.
)

echo.
pause
