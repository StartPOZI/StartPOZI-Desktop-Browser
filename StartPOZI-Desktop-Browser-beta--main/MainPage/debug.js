// debug.js - после загрузки
console.log('=== DEBUG: CHECKING PROTECTION ===');

// Ищем защитные механизмы
if (window.Protection) {
    console.log('Protection object found:', window.Protection);

    // Отключаем защиту временно
    window.Protection.disable = function() {
        console.log('Protection disabled');
        // Здесь код для отключения защиты
    };

    window.Protection.disable();
}

// Или просто переопределяем prompt без защиты
const originalPrompt = window.prompt;
window.unprotectedPrompt = function(message, defaultValue) {
    console.log('Unprotected prompt called');
    return originalPrompt.call(window, message, defaultValue);
};

// Заменяем все вызовы prompt в start page
setTimeout(function() {
    console.log('Replacing prompt handlers...');

    // Находим все элементы, которые могут вызывать prompt
    const inputs = document.querySelectorAll('input');
    const buttons = document.querySelectorAll('button');

    inputs.forEach(input => {
        if (input.onclick && input.onclick.toString().includes('prompt')) {
            console.log('Found input with prompt onclick:', input);
            input.onclick = null;
            input.addEventListener('click', function() {
                const url = unprotectedPrompt('Введите URL сайта:', 'https://');
                if (url) {
                    window.browserAPI.openSite(url);
                }
            });
        }
    });

    buttons.forEach(button => {
        if (button.onclick && button.onclick.toString().includes('prompt')) {
            console.log('Found button with prompt onclick:', button);
            button.onclick = null;
            button.addEventListener('click', function() {
                const url = unprotectedPrompt('Введите URL сайта:', 'https://');
                if (url) {
                    window.browserAPI.openSite(url);
                }
            });
        }
    });

    console.log('Prompt handlers replaced');
}, 1000);
