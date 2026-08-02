// debug.js - after load
console.log('=== DEBUG: CHECKING PROTECTION ===');

// Look for protection mechanisms
if (window.Protection) {
    console.log('Protection object found:', window.Protection);

    // Temporarily disable protection
    window.Protection.disable = function() {
        console.log('Protection disabled');
        // Here is the code to disable protection
    };

    window.Protection.disable();
}

// Or just override prompt without protection
const originalPrompt = window.prompt;
window.unprotectedPrompt = function(message, defaultValue) {
    console.log('Unprotected prompt called');
    return originalPrompt.call(window, message, defaultValue);
};

// Replace all prompt calls in the start page
setTimeout(function() {
    console.log('Replacing prompt handlers...');

    // Find all elements that may call prompt
    const inputs = document.querySelectorAll('input');
    const buttons = document.querySelectorAll('button');

    inputs.forEach(input => {
        if (input.onclick && input.onclick.toString().includes('prompt')) {
            console.log('Found input with prompt onclick:', input);
            input.onclick = null;
            input.addEventListener('click', function() {
                const url = unprotectedPrompt('Enter the site URL:', 'https://');
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
                const url = unprotectedPrompt('Enter the site URL:', 'https://');
                if (url) {
                    window.browserAPI.openSite(url);
                }
            });
        }
    });

    console.log('Prompt handlers replaced');
}, 1000);
