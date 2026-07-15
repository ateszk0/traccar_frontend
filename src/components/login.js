import { api } from '../api/traccar.js';

export function initLogin(onSuccess) {
    const loginForm = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorText = document.getElementById('login-error');
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = emailInput.value;
        const password = passwordInput.value;
        const btn = loginForm.querySelector('button');
        
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
