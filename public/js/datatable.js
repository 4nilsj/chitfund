class ChitFundTable {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.tableWrapper = this.container.querySelector('.table-wrapper');
        this.searchInput = this.container.querySelector('input[type="search"]');
        this.paginationContainer = this.container.querySelector('.pagination-container');

        this.currentUrl = new URL(window.location.href);
        this.isLoading = false;

        this.init();
    }

    init() {
        this.attachEventListeners();

        // Handle browser back/forward buttons
        window.addEventListener('popstate', () => {
            this.currentUrl = new URL(window.location.href);
            this.fetchData(this.currentUrl.toString(), false);
        });
    }

    attachEventListeners() {
        // Search Input (Debounced)
        if (this.searchInput) {
            let timeout = null;
            this.searchInput.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.currentUrl.searchParams.set('search', e.target.value);
                    this.currentUrl.searchParams.set('page', '1'); // Reset to page 1 on search
                    this.fetchData(this.currentUrl.toString());
                }, 400); // 400ms debounce
            });
        }

        // Event delegation for table headers (Sorting)
        if (this.tableWrapper) {
            this.tableWrapper.addEventListener('click', (e) => {
                const th = e.target.closest('th[data-sortable="true"]');
                if (!th) return;

                const column = th.dataset.column;
                let currentDir = th.dataset.sortDir || '';

                // Toggle direction
                let newDir = 'desc';
                if (currentDir === 'desc') newDir = 'asc';
                else if (currentDir === 'asc') newDir = 'desc';

                this.currentUrl.searchParams.set('sortBy', column);
                this.currentUrl.searchParams.set('sortDir', newDir);
                // Keep current page when sorting

                this.fetchData(this.currentUrl.toString());
            });

            // Event delegation for pagination links inside the table wrapper (if moved inside partial)
            this.tableWrapper.addEventListener('click', (e) => {
                const pagelink = e.target.closest('a[href*="?page="]');
                if (pagelink) {
                    // Don't intercept if it has pointer-events-none (disabled)
                    if (pagelink.classList.contains('pointer-events-none')) return;
                    e.preventDefault();
                    this.fetchData(pagelink.href);
                }
            });
        }

        // Event delegation for separate pagination container
        if (this.paginationContainer) {
            this.paginationContainer.addEventListener('click', (e) => {
                const pagelink = e.target.closest('a[href*="?page="]');
                if (pagelink) {
                    if (pagelink.classList.contains('pointer-events-none')) return;
                    e.preventDefault();
                    this.fetchData(pagelink.href);
                }
            });
        }
    }

    async fetchData(urlStr, pushState = true) {
        if (this.isLoading) return;
        this.isLoading = true;

        if (this.tableWrapper) {
            this.tableWrapper.style.opacity = '0.5';
            this.tableWrapper.style.pointerEvents = 'none';
        }

        try {
            const response = await fetch(urlStr, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            if (!response.ok) throw new Error('Network response was not ok');

            const html = await response.text();

            if (pushState && urlStr !== window.location.href) {
                window.history.pushState({ path: urlStr }, '', urlStr);
                this.currentUrl = new URL(urlStr);
            }

            // The server should return the HTML structure for the inner table and pagination
            // Let's assume the partial returns everything inside `.table-wrapper` or we replace `.table-wrapper` entirely
            if (this.tableWrapper) {
                this.tableWrapper.innerHTML = html;
            }

        } catch (error) {
            console.error('Error fetching table data:', error);
            // Optionally show a toast error here
        } finally {
            this.isLoading = false;
            if (this.tableWrapper) {
                this.tableWrapper.style.opacity = '1';
                this.tableWrapper.style.pointerEvents = 'auto';
            }
        }
    }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ChitFundTable('data-table-container');
});
