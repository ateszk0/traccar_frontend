import { api } from '../api/traccar.js';

export function initLogin(onSuccess) {
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorText = document.getElementById('login-error');
    const togglePasswordBtn = document.getElementById('toggle-password');
    const toggleIcon = togglePasswordBtn.querySelector('i');
    
    // Toggle password visibility
    togglePasswordBtn.addEventListener('click', () => {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleIcon.setAttribute('data-lucide', 'eye-off');
        } else {
            passwordInput.type = 'password';
            toggleIcon.setAttribute('data-lucide', 'eye');
        }
        lucide.createIcons();
    });

    // Basic sanitization
    function sanitize(input) {
        const div = document.createElement('div');
        div.textContent = input;
        return div.innerHTML;
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        let email = emailInput.value.trim();
        let password = passwordInput.value;
        const btn = loginForm.querySelector('button');
        
        // Strict client-side validation
        if (email.length < 3 || password.length < 4) {
            errorText.classList.remove('hidden');
            errorText.textContent = 'Érvénytelen beviteli adatok.';
            return;
        }

        // Sanitize to prevent basic XSS if stored/rendered
        email = sanitize(email);
        
        try {
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Bejelentkezés...';
            lucide.createIcons();
            errorText.classList.add('hidden');
            
            const user = await api.login(email, password);
            if (user) {
                onSuccess(user);
            }
        } catch (error) {
            errorText.classList.remove('hidden');
            errorText.textContent = 'Helytelen email vagy jelszó.';
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Bejelentkezés';
        }
    });
}
