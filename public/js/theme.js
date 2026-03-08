(function () {
    function getStoredTheme() {
        return localStorage.getItem('theme');
    }

    function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        // Dispatch custom event for charts or other dynamic components
        window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme } }));
    }

    // Initialize Theme
    const storedTheme = getStoredTheme();
    if (storedTheme) {
        applyTheme(storedTheme);
    } else {
        applyTheme(getSystemTheme());
    }

    // Expose toggler window
    window.toggleTheme = function () {
        const currentTheme = document.documentElement.className.includes('dark') ? 'dark' : 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
        updateToggleUI(newTheme);
    };

    function updateToggleUI(theme) {
        const toggleIcon = document.getElementById('theme-toggle-icon');
        const toggleText = document.getElementById('theme-toggle-text');

        if (toggleIcon) {
            if (theme === 'dark') {
                toggleIcon.className = 'fas fa-sun text-yellow-400';
            } else {
                toggleIcon.className = 'fas fa-moon text-slate-500';
            }
        }

        if (toggleText) {
            toggleText.innerText = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
        }
    }

    // Listen to OS changes if no preference is explicitly stored
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (!localStorage.getItem('theme')) {
            applyTheme(e.matches ? 'dark' : 'light');
            updateToggleUI(e.matches ? 'dark' : 'light');
        }
    });

    // Handle UI updates after DOM is fully loaded
    document.addEventListener('DOMContentLoaded', () => {
        const currentTheme = document.documentElement.className.includes('dark') ? 'dark' : 'light';
        updateToggleUI(currentTheme);
    });
})();
