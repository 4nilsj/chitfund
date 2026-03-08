// Client Side Logic for Chit Fund App

document.addEventListener('DOMContentLoaded', () => {
    setupModals();
    setupSearch();
});

function setupSearch() {
    const table = document.querySelector('.data-table');
    const searchInput = document.getElementById('table-search');
    if (searchInput && table) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(row => {
                row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
            });
        });
    }
}

function setupModals() {
    // Close buttons (.close-modal class)
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            const overlay = btn.closest('.modal-overlay');
            if (overlay) overlay.classList.add('hidden');
        });
    });

    // Close on backdrop click (modal-overlay)
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.add('hidden');
        });
    });

    // Global Esc key — close any open modal-overlay or fixed panel modal
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;

        // Try .modal-overlay first
        const openOverlay = document.querySelector('.modal-overlay:not(.hidden)');
        if (openOverlay) {
            openOverlay.classList.add('hidden');
            return;
        }

        // Also handle fixed modals that use `hidden` class directly
        const fixedModals = document.querySelectorAll('.fixed.inset-0:not(.hidden)');
        if (fixedModals.length) {
            fixedModals[fixedModals.length - 1].classList.add('hidden');
        }
    });
}

function showToast(msg, type = 'success') {
    const toast = document.createElement('div');
    const colors = {
        success: 'bg-emerald-600',
        error: 'bg-rose-600',
        info: 'bg-sky-600',
    };
    toast.className = `fixed bottom-6 right-6 z-[9999] px-5 py-3 rounded-2xl text-white text-sm font-bold shadow-xl ${colors[type] || colors.success} transition-all animate-slide-up`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
