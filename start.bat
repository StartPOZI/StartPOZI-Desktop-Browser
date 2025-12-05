@echo off
echo Запуск ZhukBrowser...
echo.

:: Проверяем, установлен ли Electron
where electron >nul 2>nul
if errorlevel 1 (
    echo Electron не установлен. Устанавливаем...
    npm install -g electron
)

:: Запускаем приложение
electron .
pause