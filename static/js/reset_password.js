const newPasswordInput = document.getElementById('new_password');
const confirmPasswordInput = document.getElementById('confirm_password');
const submitBtn = document.getElementById('submitBtn');
const passwordMatchMessage = document.getElementById('password-match-message');
const reqLength = document.getElementById('req-length');

// Toggle password visibility
const toggleButtons = document.querySelectorAll('.toggle-password');
toggleButtons.forEach(button => {
    button.addEventListener('click', function() {
        const targetId = this.getAttribute('data-target');
        const targetInput = document.getElementById(targetId);
        const icon = this.querySelector('i');

        if (targetInput) {
            const type = targetInput.getAttribute('type') === 'password' ? 'text' : 'password';
            targetInput.setAttribute('type', type);

            if (type === 'text') {
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
                this.setAttribute('aria-label', 'Ocultar contraseña');
            } else {
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
                this.setAttribute('aria-label', 'Mostrar contraseña');
            }
        }
    });
});

// Validate password strength
function validatePasswordStrength(password) {
    const isLengthValid = password.length >= 8;
    
    if (isLengthValid) {
        reqLength.classList.add('valid');
    } else {
        reqLength.classList.remove('valid');
    }

    return isLengthValid;
}

// Check if passwords match
function checkPasswordsMatch() {
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (confirmPassword.length === 0) {
        passwordMatchMessage.textContent = '';
        passwordMatchMessage.className = '';
        return false;
    }

    if (newPassword === confirmPassword) {
        passwordMatchMessage.textContent = '✓ Las contraseñas coinciden';
        passwordMatchMessage.className = 'match';
        return true;
    } else {
        passwordMatchMessage.textContent = '✗ Las contraseñas no coinciden';
        passwordMatchMessage.className = 'no-match';
        return false;
    }
}

// Enable/disable submit button
function updateSubmitButton() {
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    
    const isStrengthValid = validatePasswordStrength(newPassword);
    const doPasswordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

    if (isStrengthValid && doPasswordsMatch) {
        submitBtn.disabled = false;
    } else {
        submitBtn.disabled = true;
    }
}

// Event listeners
newPasswordInput.addEventListener('input', function() {
    validatePasswordStrength(this.value);
    checkPasswordsMatch();
    updateSubmitButton();
});

confirmPasswordInput.addEventListener('input', function() {
    checkPasswordsMatch();
    updateSubmitButton();
});

// Form validation before submit
const resetForm = document.getElementById('resetForm');
resetForm.addEventListener('submit', function(e) {
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (newPassword.length < 8) {
        e.preventDefault();
        alert('La contraseña debe tener al menos 8 caracteres');
        return false;
    }

    if (newPassword !== confirmPassword) {
        e.preventDefault();
        alert('Las contraseñas no coinciden');
        return false;
    }
});

// Initialize button state
updateSubmitButton();
