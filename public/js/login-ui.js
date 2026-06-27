// Login page UI interactions (externalized from inline <script> for CSP readiness).
// Behavior is identical to the prior inline block; loaded at end of <body> so DOM elements exist.

// Modal toggle interactions
const showBtn = document.getElementById('showLoginModalBtn');
const closeBtn = document.getElementById('closeLoginModalBtn');
const modal = document.getElementById('loginModal');
const modalContainer = modal.querySelector('div');

function openModal() {
    modal.classList.remove('hidden');
    // Force reflow
    modal.offsetHeight;
    modal.classList.add('opacity-100');
    modalContainer.classList.remove('scale-95');
    modalContainer.classList.add('scale-100');
    document.getElementById('username').focus();
}

function closeModal() {
    modal.classList.remove('opacity-100');
    modalContainer.classList.remove('scale-100');
    modalContainer.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

showBtn.addEventListener('click', openModal);
closeBtn.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
});

// Also trigger modal from any call-to-action button
document.querySelectorAll('.trigger-login-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
    });
});

// Simple scroll reveal interaction
document.addEventListener('DOMContentLoaded', () => {
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('opacity-100', 'translate-y-0');
                entry.target.classList.remove('opacity-0', 'translate-y-10');
            }
        });
    }, observerOptions);

    document.querySelectorAll('section > div').forEach(el => {
        el.classList.add('transition-all', 'duration-700', 'opacity-0', 'translate-y-10');
        observer.observe(el);
    });
});
