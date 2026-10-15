/**
 * Aetherfit - Tailwind CSS Play CDN Configuration
 */

tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', '"Inter"', 'sans-serif'],
            },
            colors: {
                oled: '#000000',
                ios: {
                    card: '#1C1C1E',
                    elevated: '#2C2C2E',
                    input: '#3A3A3C',
                    label: '#8E8E93',
                    tertiary: '#48484A',
                    fitness: '#A4FF00',
                    move: '#FA114F',
                    stand: '#00F5EA',
                    orange: '#FF9F0A',
                    green: '#30D158',
                    red: '#FF453A'
                }
            }
        }
    }
};
