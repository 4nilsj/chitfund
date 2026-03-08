/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: ["./views/**/*.ejs"],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: '#6366f1', // Indigo 500
                    dark: '#4f46e5',    // Indigo 600
                    light: '#818cf8',   // Indigo 400
                },
                secondary: '#64748b', // Slate 500
                accent: '#10b981',    // Emerald 500
                danger: '#ef4444',    // Red 500
                warning: '#f59e0b',   // Amber 500
                success: '#10b981',   // Emerald 500
                background: '#f8fafc', // Slate 50
                surface: '#ffffff',
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
